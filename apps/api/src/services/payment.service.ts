import type { PrismaClient } from '@prisma/client';
import type { PaymentOrder } from '@zproo/types';
import type { Logger } from 'pino';
import { OPEN_HOLD_STATUSES } from '@zproo/utils';
import type { BusProvider } from '../providers/bus';
import type { FlightProvider } from '../providers/flight';
import { MockPaymentProvider, type PaymentProvider } from '../providers/payment';
import { BookingRepository } from '../repositories/booking.repository';
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
    this.now = deps.now ?? (() => new Date());
  }

  get providerName(): string {
    return this.deps.provider.name;
  }

  /**
   * Idempotent: an open payment for the booking is returned rather than a second order created.
   * The amount always comes from the stored booking. The first order moves HELD → PAYMENT_PENDING.
   */
  async createOrder(userId: string, reference: string, ctx: RequestContext): Promise<PaymentOrder> {
    const booking = await this.deps.bookings.get(reference, { userId, canReadAny: false });
    if (booking.status === 'EXPIRED') throw new HoldExpiredError();
    if (!OPEN_HOLD_STATUSES.includes(booking.status) || booking.paymentStatus === 'CAPTURED')
      throw new InvalidStateError('This booking is not awaiting payment');
    if (booking.holdExpiresAt && booking.holdExpiresAt <= this.now()) throw new HoldExpiredError();

    const payments = new PaymentRepository(this.deps.prisma);
    const payment =
      (await payments.findOpenForBooking(booking.id)) ??
      (await payments.create({
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
      }));
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
      after: { reference, amountPaise: payment.amountPaise, provider: payment.provider },
      context: ctx,
    });
    return {
      paymentId: payment.id,
      provider: payment.provider,
      providerOrderId: payment.providerOrderId,
      amountPaise: payment.amountPaise,
      currency: 'INR',
      publicKey: this.deps.provider.publicKey,
      bookingReference: booking.reference,
      holdExpiresAt: booking.holdExpiresAt?.toISOString() ?? null,
      serverNow: this.now().toISOString(),
    };
  }

  /** Called with the gateway's result from the browser; trusted only if the signature verifies. */
  async verify(
    userId: string,
    input: {
      paymentId: string;
      providerPaymentId: string;
      signature: string;
      method?: string | undefined;
    },
    ctx: RequestContext,
  ): Promise<{ reference: string }> {
    const payment = await new PaymentRepository(this.deps.prisma).findById(input.paymentId);
    if (!payment) throw new NotFoundError('Payment not found');
    if (payment.userId !== userId)
      throw new AuthorizationError("You don't have access to this payment");
    if (payment.status === 'CAPTURED') return { reference: payment.booking.reference }; // retry of a completed call

    const valid = this.deps.provider.verifyPayment({
      orderId: payment.providerOrderId,
      paymentId: input.providerPaymentId,
      signature: input.signature,
    });
    if (!valid) {
      await this.deps.audit.record({
        action: 'PAYMENT_SIGNATURE_INVALID',
        actorId: userId,
        entityType: 'Payment',
        entityId: payment.id,
        context: ctx,
      });
      throw new PaymentError(
        'We could not verify this payment. You have not been charged for a booking.',
      );
    }
    await this.confirm(payment.id, input.providerPaymentId, input.method, userId, ctx);
    return { reference: payment.booking.reference };
  }

  /** Records a failed attempt; the booking stays payable until its hold expires. */
  async markFailed(
    userId: string,
    paymentId: string,
    reason: string,
    ctx: RequestContext,
  ): Promise<void> {
    const payment = await new PaymentRepository(this.deps.prisma).findById(paymentId);
    if (!payment) throw new NotFoundError('Payment not found');
    if (payment.userId !== userId)
      throw new AuthorizationError("You don't have access to this payment");
    await new PaymentRepository(this.deps.prisma).transition(payment.id, ['CREATED', 'PENDING'], {
      status: 'FAILED',
      failureReason: reason.slice(0, 200),
    });
    await this.deps.audit.record({
      action: 'PAYMENT_FAILED',
      actorId: userId,
      entityType: 'Payment',
      entityId: payment.id,
      after: { reason },
      context: ctx,
    });
  }

  /** Development only: behaves like the gateway returning from checkout. */
  async simulateMockPayment(
    userId: string,
    paymentId: string,
    outcome: 'success' | 'failure',
    ctx: RequestContext,
  ) {
    if (!(this.deps.provider instanceof MockPaymentProvider)) throw new NotFoundError();
    const payment = await new PaymentRepository(this.deps.prisma).findById(paymentId);
    if (!payment) throw new NotFoundError('Payment not found');
    if (payment.userId !== userId)
      throw new AuthorizationError("You don't have access to this payment");
    if (outcome === 'failure') {
      await this.markFailed(userId, paymentId, 'Declined by bank (simulated)', ctx);
      return { reference: payment.booking.reference, status: 'FAILED' as const };
    }
    const result = this.deps.provider.simulateSuccess(payment.providerOrderId);
    await this.verify(
      userId,
      {
        paymentId,
        providerPaymentId: result.paymentId,
        signature: result.signature,
        method: 'mock',
      },
      ctx,
    );
    return { reference: payment.booking.reference, status: 'CAPTURED' as const };
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

  // ───────── internals ─────────

  private async confirm(
    paymentId: string,
    providerPaymentId: string,
    method: string | undefined,
    userId: string,
    ctx: RequestContext,
  ) {
    let bookingId: string;
    try {
      bookingId = await this.capture(paymentId, providerPaymentId, method);
    } catch (err) {
      if (!(err instanceof HoldExpiredError)) throw err;
      const current = await new PaymentRepository(this.deps.prisma).findById(paymentId);
      // A concurrent verify of the same payment captured it first.
      if (current?.status === 'CAPTURED') return;
      await this.recordLateCapture(paymentId, providerPaymentId, method, userId, ctx);
      throw err;
    }
    await this.deps.audit.record({
      action: 'PAYMENT_CAPTURED',
      actorId: userId,
      entityType: 'Payment',
      entityId: paymentId,
      context: ctx,
    });
    await this.issueTickets(bookingId);
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
      // A booking still HELD (paid without an order step, e.g. via webhook) catches up first.
      await new BookingRepository(tx).move(payment.bookingId, ['HELD'], 'PAYMENT_PENDING', {
        actor: 'system',
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
    userId: string,
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
        actor: 'system',
        reason: 'Payment arrived after the hold expired',
      });
      if (expiredNow && record) await this.deps.bookings.releaseInventory(record, tx);
      await tx.booking.update({
        where: { id: payment.bookingId },
        data: { paymentStatus: 'REFUND_DUE' },
      });
    });
    await this.deps.audit.record({
      action: 'PAYMENT_REFUND_DUE',
      actorId: userId,
      entityType: 'Payment',
      entityId: paymentId,
      context: ctx,
    });
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
    if (booking?.status !== 'PAYMENT_PENDING') return false;
    const repo = new BookingRepository(this.deps.prisma);
    let lastError: unknown;
    for (let attempt = 1; attempt <= ISSUE_ATTEMPTS; attempt++) {
      try {
        if (booking.bus && !booking.bus.pnr) {
          const issued = await this.deps.buses.issue(booking.bus.offerId, booking.bus.seatNumbers);
          await repo.setBusPnr(booking.id, issued.pnr);
        }
        for (const leg of booking.flights) {
          if (leg.pnr) continue;
          const issued = await this.deps.flights.issue(leg.offerId, booking.passengers);
          await repo.setFlightTickets(
            leg.id,
            issued.pnr,
            booking.passengers.map((p, i) => ({
              passengerId: p.id,
              ticketNumber: issued.ticketNumbers[i] ?? '',
            })),
          );
          leg.pnr = issued.pnr;
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
