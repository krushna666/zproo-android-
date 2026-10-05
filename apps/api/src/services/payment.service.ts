import { Prisma, type PrismaClient } from '@prisma/client';
import type { BookingStatus, PaymentOrder, PaymentStatus } from '@zproo/types';
import type { Logger } from 'pino';
import { OPEN_HOLD_STATUSES } from '@zproo/utils';
import type { BusProvider } from '../providers/bus';
import type { FlightProvider } from '../providers/flight';
import { MockPaymentProvider, type PaymentProvider } from '../providers/payment';
import { BookingRepository } from '../repositories/booking.repository';
import { BusRepository } from '../repositories/bus.repository';
import { PaymentRepository } from '../repositories/payment.repository';
import {
  AuthorizationError,
  HoldExpiredError,
  InvalidStateError,
  NotFoundError,
  PaymentError,
} from '../utils/errors';
import type { AuditService, RequestContext } from './audit.service';
import type { BookingService } from './booking.service';
import { clock } from '../lib/testContext';

export interface PaymentResult {
  bookingRef: string;
  status: BookingStatus;
  paymentStatus: PaymentStatus;
}

interface PaymentServiceDeps {
  prisma: PrismaClient;
  provider: PaymentProvider;
  flights: FlightProvider;
  buses: BusProvider;
  bookings: BookingService;
  audit: AuditService;
  logger: Logger;
  now?: () => Date;
}

/**
 * Payments follow the gateway pattern: create an order for the booking's amount (computed here,
 * never taken from the browser), let the customer pay with the gateway, then verify the gateway's
 * signature on the server before confirming the booking.
 */
export class PaymentService {
  private readonly now: () => Date;

  constructor(private readonly deps: PaymentServiceDeps) {
    this.now = deps.now ?? clock.now;
  }

  get providerName(): string {
    return this.deps.provider.name;
  }

  /**
   * Idempotent: an open payment for the booking is returned rather than a second order created.
   * The amount always comes from the stored booking. The first order moves HELD → PAYMENT_PENDING.
   */
  async createOrder(
    userId: string,
    bookingRef: string,
    ctx: RequestContext,
  ): Promise<PaymentOrder> {
    const booking = await this.deps.bookings.get(bookingRef, { userId, canReadAny: false });
    if (booking.status === 'EXPIRED') throw new HoldExpiredError();
    if (!OPEN_HOLD_STATUSES.includes(booking.status) || booking.paymentStatus === 'CAPTURED')
      throw new InvalidStateError('This booking is not awaiting payment');
    if (booking.holdExpiresAt && booking.holdExpiresAt <= this.now()) throw new HoldExpiredError();

    const payments = new PaymentRepository(this.deps.prisma);
    const open = await payments.findOpenForBooking(booking.id);
    // A coupon applied or removed since the order was made changes the amount: start a new order.
    if (open && open.amountPaise !== booking.totalAmountPaise)
      await payments.transition(open.id, ['CREATED', 'PENDING'], { status: 'CANCELLED' });
    const payment =
      open && open.amountPaise === booking.totalAmountPaise
        ? open
        : await payments.create({
            bookingId: booking.id,
            userId,
            provider: this.deps.provider.name,
            providerOrderId: (
              await this.deps.provider.createOrder({
                amountPaise: booking.totalAmountPaise,
                currency: 'INR',
                receipt: booking.reference,
              })
            ).orderId,
            amountPaise: booking.totalAmountPaise,
          });
    if (booking.status === 'HELD') {
      await this.deps.prisma.$transaction((tx) =>
        new BookingRepository(tx).move(booking.id, ['HELD'], 'PAYMENT_PENDING', {
          actor: `user:${userId}`,
          reason: 'Payment order created',
        }),
      );
    }
    await this.deps.audit.record({
      action: 'PAYMENT_ORDER_CREATED',
      actorId: userId,
      entityType: 'Payment',
      entityId: payment.id,
      after: { bookingRef, amountPaise: payment.amountPaise, provider: payment.provider },
      context: ctx,
    });
    return {
      orderId: payment.providerOrderId,
      amount: payment.amountPaise,
      currency: 'INR',
      keyId: this.deps.provider.publicKey,
      provider: payment.provider,
      bookingRef: booking.reference,
      holdExpiresAt: booking.holdExpiresAt?.toISOString() ?? null,
      serverNow: this.now().toISOString(),
    };
  }

  /**
   * The browser reports the gateway's result. Trusted only if (1) the signature over
   * `orderId|paymentId` verifies, and (2) the gateway's own record of that payment matches this
   * order, its amount and currency. Retries of a completed verification return the same result.
   */
  async verify(
    userId: string,
    input: { bookingRef: string; orderId: string; paymentId: string; signature: string },
    ctx: RequestContext,
  ): Promise<PaymentResult> {
    const payment = await this.ownPayment(userId, input.orderId);
    if (payment.booking.reference !== input.bookingRef)
      throw new PaymentError('This payment does not belong to this booking.');
    if (payment.status === 'CAPTURED' && payment.providerPaymentId === input.paymentId)
      return this.result(payment.bookingId);

    if (!this.deps.provider.verifySignature(input)) {
      await this.audit('PAYMENT_SIGNATURE_INVALID', userId, payment.id, ctx);
      throw new PaymentError(
        'We could not verify this payment. You have not been charged for a booking.',
      );
    }
    await this.checkGatewayPayment(input.paymentId, payment, userId, ctx);
    await this.confirm(payment.id, input.paymentId, undefined, `user:${userId}`, userId, ctx);
    return this.result(payment.bookingId);
  }

  /**
   * Gateway webhook (raw body, signed with the webhook secret). Each event ID is processed once.
   * `payment.captured` / `order.paid` confirm the booking exactly like `verify`; whichever
   * arrives first wins and the other is a no-op. Returns what happened, for logging.
   */
  async handleWebhook(
    rawBody: Buffer,
    signature: string,
    eventIdHeader: string | undefined,
    ctx: RequestContext,
  ): Promise<'processed' | 'duplicate' | 'ignored'> {
    if (!this.deps.provider.verifyWebhook(rawBody, signature)) {
      await this.audit('PAYMENT_WEBHOOK_SIGNATURE_INVALID', null, null, ctx);
      throw new PaymentError('Invalid webhook signature');
    }
    const event = this.deps.provider.parseWebhook(rawBody, eventIdHeader);
    if (!event) throw new PaymentError('Unrecognised webhook payload');

    const gatewayPayment = event.payment;
    const payment = gatewayPayment
      ? await new PaymentRepository(this.deps.prisma).findByOrderId(gatewayPayment.orderId)
      : null;
    try {
      await this.deps.prisma.webhookEvent.create({
        data: {
          provider: this.deps.provider.name,
          eventId: event.eventId,
          type: event.type,
          paymentId: payment?.id ?? null,
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')
        return 'duplicate';
      throw err;
    }
    if (!payment || !gatewayPayment) return 'ignored';

    const actor = `webhook:${this.deps.provider.name}`;
    if (
      (event.type === 'payment.captured' || event.type === 'order.paid') &&
      gatewayPayment.status === 'captured'
    ) {
      if (payment.status === 'CAPTURED') return 'processed'; // verify got there first
      if (
        gatewayPayment.amountPaise !== payment.amountPaise ||
        gatewayPayment.currency !== payment.currency
      ) {
        await this.audit('PAYMENT_AMOUNT_MISMATCH', null, payment.id, ctx);
        return 'ignored';
      }
      try {
        await this.confirm(payment.id, gatewayPayment.paymentId, undefined, actor, null, ctx);
      } catch (err) {
        // A late capture is recorded as refund-due inside confirm(); nothing else to do here.
        if (!(err instanceof HoldExpiredError)) throw err;
      }
      return 'processed';
    }
    if (event.type === 'payment.failed') {
      await new PaymentRepository(this.deps.prisma).transition(payment.id, ['CREATED', 'PENDING'], {
        status: 'FAILED',
        failureReason: 'Declined by the gateway',
      });
      return 'processed';
    }
    return 'ignored';
  }

  /** The customer closed checkout or the bank declined; the booking stays payable until its hold ends. */
  async markFailed(
    userId: string,
    orderId: string,
    reason: string,
    ctx: RequestContext,
  ): Promise<void> {
    const payment = await this.ownPayment(userId, orderId);
    await new PaymentRepository(this.deps.prisma).transition(payment.id, ['CREATED', 'PENDING'], {
      status: 'FAILED',
      failureReason: reason.slice(0, 200),
    });
    await this.audit('PAYMENT_FAILED', userId, payment.id, ctx, { reason });
  }

  /**
   * Development checkout: returns what the gateway's checkout hands the browser after a
   * successful payment (the browser then calls /payments/verify), or records a decline.
   */
  async simulateMockPayment(
    userId: string,
    orderId: string,
    outcome: 'success' | 'failure',
    ctx: RequestContext,
  ): Promise<
    | { outcome: 'success'; orderId: string; paymentId: string; signature: string }
    | { outcome: 'failure' }
  > {
    if (!(this.deps.provider instanceof MockPaymentProvider)) throw new NotFoundError();
    await this.ownPayment(userId, orderId);
    if (outcome === 'failure') {
      await this.markFailed(userId, orderId, 'Declined by bank (simulated)', ctx);
      return { outcome: 'failure' };
    }
    return { outcome: 'success', ...this.deps.provider.simulateSuccess(orderId) };
  }

  /**
   * Re-tries issuing for paid bookings that are not confirmed yet (the process stopped between
   * capture and issue, or the supplier reported issuing as pending). Run by the jobs runner.
   */
  async issuePending(): Promise<number> {
    const waiting = await new BookingRepository(this.deps.prisma).findAwaitingIssue();
    let confirmed = 0;
    for (const booking of waiting) if (await this.issueTickets(booking.id)) confirmed += 1;
    return confirmed;
  }

  /**
   * A customer's status poll on a paid booking that is still being ticketed: ask the supplier
   * again. Returns true when it is confirmed now.
   */
  retryIssue(bookingId: string): Promise<boolean> {
    return this.issueTickets(bookingId);
  }

  // ───────── internals ─────────

  private async confirm(
    paymentId: string,
    providerPaymentId: string,
    method: string | undefined,
    actor: string,
    userId: string | null,
    ctx: RequestContext,
  ) {
    let bookingId: string;
    try {
      bookingId = await this.capture(paymentId, providerPaymentId, method, actor);
    } catch (err) {
      if (!(err instanceof HoldExpiredError)) throw err;
      const current = await new PaymentRepository(this.deps.prisma).findById(paymentId);
      // A concurrent verify or webhook captured this payment first.
      if (current?.status === 'CAPTURED') return;
      await this.recordLateCapture(paymentId, providerPaymentId, method, actor, userId, ctx);
      throw err;
    }
    await this.audit('PAYMENT_CAPTURED', userId, paymentId, ctx);
    await this.issueTickets(bookingId);
  }

  /** The caller's payment for a gateway order (403 for someone else's). */
  private async ownPayment(userId: string, orderId: string) {
    const payment = await new PaymentRepository(this.deps.prisma).findByOrderId(orderId);
    if (!payment) throw new NotFoundError('Payment not found');
    if (payment.userId !== userId)
      throw new AuthorizationError("You don't have access to this payment");
    return payment;
  }

  /** The gateway's own record must match this order's amount and currency (never the browser's). */
  private async checkGatewayPayment(
    paymentId: string,
    payment: {
      id: string;
      providerOrderId: string;
      amountPaise: number;
      currency: string;
      booking: { totalAmountPaise: number };
    },
    userId: string,
    ctx: RequestContext,
  ) {
    const gateway = await this.deps.provider.fetchPayment(paymentId);
    const matches =
      gateway !== null &&
      gateway.orderId === payment.providerOrderId &&
      gateway.amountPaise === payment.amountPaise &&
      gateway.amountPaise === payment.booking.totalAmountPaise &&
      gateway.currency === payment.currency &&
      (gateway.status === 'captured' || gateway.status === 'authorized');
    if (!matches) {
      await this.audit('PAYMENT_AMOUNT_MISMATCH', userId, payment.id, ctx);
      throw new PaymentError('This payment does not match the booking amount.');
    }
  }

  private async result(bookingId: string): Promise<PaymentResult> {
    const booking = await this.deps.prisma.booking.findUniqueOrThrow({
      where: { id: bookingId },
      select: { reference: true, status: true, paymentStatus: true },
    });
    return {
      bookingRef: booking.reference,
      status: booking.status,
      paymentStatus: booking.paymentStatus,
    };
  }

  private audit(
    action: string,
    actorId: string | null,
    entityId: string | null,
    ctx: RequestContext,
    after?: Prisma.InputJsonObject,
  ) {
    return this.deps.audit.record({
      action,
      actorId,
      entityType: 'Payment',
      entityId,
      ...(after && { after }),
      context: ctx,
    });
  }

  /**
   * Records the capture atomically while the hold is still valid: the payment becomes CAPTURED and
   * the booking's hold is cleared (so the expiry job can no longer release it). The booking stays
   * PAYMENT_PENDING until the supplier issues.
   */
  private async capture(
    paymentId: string,
    providerPaymentId: string,
    method: string | undefined,
    actor: string,
  ): Promise<string> {
    const now = this.now();
    return this.deps.prisma.$transaction(async (tx) => {
      const payment = await new PaymentRepository(tx).findById(paymentId);
      if (!payment) throw new NotFoundError('Payment not found');
      const { count } = await tx.booking.updateMany({
        where: {
          id: payment.bookingId,
          status: { in: [...OPEN_HOLD_STATUSES] },
          holdExpiresAt: { gt: now },
        },
        data: { paymentStatus: 'CAPTURED', holdExpiresAt: null },
      });
      if (count !== 1)
        throw new HoldExpiredError(
          'Your hold expired before payment completed. Any amount debited will be refunded.',
        );
      // Paid seats no longer lapse with the hold.
      await new BusRepository(tx).markPaid(payment.bookingId);
      await this.deps.flights.markPaid(payment.bookingId, tx);
      // A booking still HELD (paid without an order step, e.g. via webhook) catches up first.
      await new BookingRepository(tx).move(payment.bookingId, ['HELD'], 'PAYMENT_PENDING', {
        actor,
        reason: 'Payment captured',
      });
      const captured = await new PaymentRepository(tx).transition(
        payment.id,
        ['CREATED', 'PENDING', 'FAILED'],
        {
          status: 'CAPTURED',
          providerPaymentId,
          method: method ?? null,
          capturedAt: now,
          failureReason: null,
        },
      );
      if (!captured) throw new InvalidStateError('This payment was already processed');
      return payment.bookingId;
    });
  }

  /**
   * The gateway took the money but the hold had expired, so the inventory may already be resold.
   * The booking ends EXPIRED (never re-opened, never ticketed) and the payment is REFUND_DUE.
   */
  private async recordLateCapture(
    paymentId: string,
    providerPaymentId: string,
    method: string | undefined,
    actor: string,
    userId: string | null,
    ctx: RequestContext,
  ) {
    await this.deps.prisma.$transaction(async (tx) => {
      const payment = await new PaymentRepository(tx).findById(paymentId);
      if (!payment) return;
      await new PaymentRepository(tx).transition(
        paymentId,
        ['CREATED', 'PENDING', 'FAILED', 'CANCELLED'],
        {
          status: 'REFUND_DUE',
          providerPaymentId,
          method: method ?? null,
          failureReason: 'Captured after the hold expired; refund due',
        },
      );
      const bookings = new BookingRepository(tx);
      const record = await bookings.findByReference(payment.booking.reference);
      const expiredNow = await bookings.move(payment.bookingId, OPEN_HOLD_STATUSES, 'EXPIRED', {
        actor,
        reason: 'Payment arrived after the hold expired',
      });
      if (expiredNow && record) await this.deps.bookings.releaseInventory(record, tx);
      await tx.booking.update({
        where: { id: payment.bookingId },
        data: { paymentStatus: 'REFUND_DUE' },
      });
    });
    await this.audit('PAYMENT_REFUND_DUE', userId, paymentId, ctx);
    this.deps.logger.warn({ paymentId }, 'Payment captured after hold expiry — refund required');
  }

  /**
   * Issues tickets with the supplier after the capture commits, then confirms the booking. A
   * failed call is retried (suppliers' issue is idempotent per booking); if it still fails the
   * booking becomes FAILED, its inventory is released and the payment is REFUND_DUE (alert log).
   * Returns true when the booking ended CONFIRMED.
   */
  private async issueTickets(bookingId: string): Promise<boolean> {
    const booking = await this.deps.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        passengers: { orderBy: { sequence: 'asc' } },
        flights: { orderBy: { sequence: 'asc' } },
        bus: true,
      },
    });
    if (booking?.status !== 'PAYMENT_PENDING' || booking.paymentStatus !== 'CAPTURED') return false;
    const repo = new BookingRepository(this.deps.prisma);
    const scenario = (booking.metadata as { issueScenario?: string } | null)?.issueScenario;
    let lastError: unknown;
    for (let attempt = 1; attempt <= ISSUE_ATTEMPTS; attempt++) {
      try {
        if (booking.bus && !booking.bus.pnr) {
          const issued = await this.deps.buses.issue(
            booking.bus.tripId,
            booking.bus.seats,
            booking.reference,
          );
          await repo.setBusPnr(booking.id, issued.pnr);
        }
        const pendingLegs = booking.flights.filter((leg) => !leg.pnr);
        if (pendingLegs.length > 0) {
          const airlineAttempt = await repo.countIssueAttempt(booking.id);
          for (const leg of pendingLegs) {
            const offer = leg.offer as { carrier?: { code?: string } };
            const issued = await this.deps.flights.issue({
              offerId: leg.offerId,
              carrierCode: offer.carrier?.code ?? '',
              bookingRef: booking.reference,
              passengers: booking.passengers,
              attempt: airlineAttempt,
              scenario,
            });
            // The airline is still working on it: stay "Confirming with the airline..."; the
            // next status poll (or the jobs runner) asks again.
            if (issued.status === 'PENDING') return false;
            await repo.setFlightTickets(
              leg.id,
              issued.pnr,
              booking.passengers.map((p, i) => ({
                passengerId: p.id,
                ticketNumber: issued.ticketNumbers[i] ?? '',
                segmentKey: `${leg.originCode}-${leg.destinationCode}`,
              })),
            );
            leg.pnr = issued.pnr;
          }
        }
        return await this.deps.prisma.$transaction((tx) =>
          new BookingRepository(tx).move(booking.id, ['PAYMENT_PENDING'], 'CONFIRMED', {
            actor: 'system',
            reason: 'Tickets issued',
            data: { confirmedAt: this.now() },
          }),
        );
      } catch (err) {
        lastError = err;
        this.deps.logger.warn({ err, bookingId, attempt }, 'Ticket issue attempt failed');
      }
    }
    await this.deps.prisma.$transaction(async (tx) => {
      const record = await new BookingRepository(tx).findByReference(booking.reference);
      const failed = await new BookingRepository(tx).move(
        booking.id,
        ['PAYMENT_PENDING'],
        'FAILED',
        {
          actor: 'system',
          reason: 'Supplier could not issue the ticket',
          data: { paymentStatus: 'REFUND_DUE' },
        },
      );
      if (!failed) return;
      if (record) await this.deps.bookings.releaseInventory(record, tx);
      await tx.payment.updateMany({
        where: { bookingId: booking.id, status: 'CAPTURED' },
        data: { status: 'REFUND_DUE', failureReason: 'Supplier could not issue; refund due' },
      });
    });
    this.deps.logger.error(
      { err: lastError, bookingId, alert: 'ISSUE_FAILED_REFUND_DUE' },
      'Ticket issue failed after retries — booking FAILED, refund due',
    );
    return false;
  }
}

/** Issue attempts before a paid booking is failed and refunded. */
const ISSUE_ATTEMPTS = 3;
