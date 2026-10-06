import type { PrismaClient } from '@prisma/client';
import type { CancellationQuote, ServiceType } from '@zproo/types';
import type { Logger } from 'pino';
import { clock } from '../lib/testContext';
import type { BusProvider } from '../providers/bus';
import type { FlightProvider } from '../providers/flight';
import type { HotelProvider } from '../providers/hotel';
import type { PaymentProvider } from '../providers/payment';
import { BookingRepository, type BookingRecord } from '../repositories/booking.repository';
import { InvalidStateError, NotFoundError } from '../utils/errors';
import type { AuditService, RequestContext } from './audit.service';
import type { BookingService } from './booking.service';
import { busRefund } from './busPricing';
import { FLIGHT_CANCEL_CUTOFF_HOURS, flightRefund, hotelRefund } from '@zproo/catalog';
import type { BusCancellationRule, FareFamily } from '@zproo/types';

interface CancellationDeps {
  prisma: PrismaClient;
  bookings: BookingService;
  buses: BusProvider;
  flights: FlightProvider;
  hotels: HotelProvider;
  payments: PaymentProvider;
  audit: AuditService;
  logger: Logger;
  now?: () => Date;
}

/**
 * Customer cancellations. The refund always comes from the supplier's policy, computed here (the
 * browser only shows what this returns). CONFIRMED → CANCELLED, then → REFUND_PENDING when money is
 * owed back; the refund is sent to the gateway after the cancellation commits.
 */
export class CancellationService {
  private readonly now: () => Date;

  constructor(private readonly deps: CancellationDeps) {
    this.now = deps.now ?? clock.now;
  }

  /** What cancelling now would refund (shown before the customer confirms). */
  async quote(userId: string, reference: string): Promise<CancellationQuote> {
    const booking = await this.deps.bookings.get(reference, { userId, canReadAny: false });
    return this.quoteFor(booking);
  }

  async cancel(
    userId: string,
    reference: string,
    service: ServiceType,
    ctx: RequestContext,
  ): Promise<{ bookingRef: string; status: string; refundAmount: number }> {
    const booking = await this.deps.bookings.get(reference, { userId, canReadAny: false });
    if (booking.serviceType !== service) throw new NotFoundError('Booking not found');
    const quote = this.quoteFor(booking);
    if (!quote.cancellable)
      throw new InvalidStateError(quote.reason ?? 'This booking can’t be cancelled');

    const status = await this.deps.prisma.$transaction(async (tx) => {
      const repo = new BookingRepository(tx);
      const cancelled = await repo.move(booking.id, ['CONFIRMED'], 'CANCELLED', {
        actor: `user:${userId}`,
        reason: 'Cancelled by customer',
        data: {
          cancelledAt: this.now(),
          cancellationReason: 'Cancelled by customer',
          refundAmountPaise: quote.refundAmount,
        },
      });
      if (!cancelled)
        throw new InvalidStateError('This booking was already changed. Please refresh.');
      if (booking.bus) await this.deps.buses.cancel(booking.id, booking.bus.pnr, tx);
      if (booking.flights.length > 0) await this.deps.flights.cancel(booking.id, tx);
      if (booking.hotel)
        await this.deps.hotels.cancel(booking.id, booking.hotel.confirmationNo, tx);
      if (quote.refundAmount <= 0) return 'CANCELLED' as const;
      await repo.move(booking.id, ['CANCELLED'], 'REFUND_PENDING', {
        actor: 'system',
        reason: 'Refund started',
      });
      return 'REFUND_PENDING' as const;
    });

    if (quote.refundAmount > 0) await this.refund(booking, quote.refundAmount);
    await this.deps.audit.record({
      action: 'BOOKING_CANCELLED',
      actorId: userId,
      entityType: 'Booking',
      entityId: booking.id,
      after: { reference, refundPaise: quote.refundAmount },
      context: ctx,
    });
    return { bookingRef: reference, status, refundAmount: quote.refundAmount };
  }

  /** Sends the refund to the gateway; failures are logged for finance, not shown as errors. */
  private async refund(booking: BookingRecord, amountPaise: number): Promise<void> {
    const payment = await this.deps.prisma.payment.findFirst({
      where: { bookingId: booking.id, status: 'CAPTURED' },
    });
    if (!payment?.providerPaymentId) {
      this.deps.logger.error(
        { bookingId: booking.id, alert: 'REFUND_WITHOUT_PAYMENT' },
        'Refund owed but no captured payment found',
      );
      return;
    }
    try {
      await this.deps.payments.refund(payment.providerPaymentId, amountPaise);
      await this.deps.prisma.payment.update({
        where: { id: payment.id },
        data: { status: amountPaise >= payment.amountPaise ? 'REFUNDED' : 'PARTIALLY_REFUNDED' },
      });
    } catch (err) {
      this.deps.logger.error(
        { err, bookingId: booking.id, alert: 'REFUND_FAILED' },
        'Gateway refund failed — retry from the admin panel',
      );
    }
  }

  private quoteFor(booking: BookingRecord): CancellationQuote {
    const base = { bookingRef: booking.reference, refundAmount: 0, refundPercent: 0 };
    if (booking.status !== 'CONFIRMED')
      return { ...base, cancellable: false, reason: 'Only confirmed bookings can be cancelled.' };
    if (booking.bus) {
      const minutes = (booking.bus.departureAt.getTime() - this.now().getTime()) / 60_000;
      if (minutes <= 0)
        return { ...base, cancellable: false, reason: 'This bus has already departed.' };
      const policy =
        (booking.bus.offer as { cancellationPolicy?: BusCancellationRule[] }).cancellationPolicy ??
        [];
      const { refundPaise, refundPercent } = busRefund(
        booking.totalAmountPaise,
        booking.feeAmountPaise,
        minutes,
        policy,
      );
      return { ...base, cancellable: true, refundAmount: refundPaise, refundPercent };
    }
    if (booking.hotel) {
      const result = hotelRefund({
        rooms: booking.hotelRooms.map((r) => ({
          refundable: r.refundable,
          freeCancellationUntil: r.freeCancellationUntil?.toISOString() ?? null,
          price: r.price,
          nightlyBreakdown: r.nightly as unknown as { date: string; price: number }[],
        })),
        checkIn: booking.hotel.checkIn.toISOString().slice(0, 10),
        paidPaise: booking.totalAmountPaise,
        feesPaise: booking.feeAmountPaise,
        now: this.now(),
      });
      if (!result.cancellable) return { ...base, cancellable: false, reason: result.reason };
      return {
        ...base,
        cancellable: true,
        refundAmount: result.refundPaise,
        refundPercent:
          booking.totalAmountPaise > 0
            ? Math.floor((result.refundPaise * 100) / booking.totalAmountPaise)
            : 0,
      };
    }
    const first = booking.flights[0];
    if (first) {
      const hours = (first.departureAt.getTime() - this.now().getTime()) / 3_600_000;
      if (hours < FLIGHT_CANCEL_CUTOFF_HOURS)
        return {
          ...base,
          cancellable: false,
          reason: 'Cancellation is closed for this flight. Please contact the airline.',
        };
      const refund = flightRefund(
        booking.flights.map((f) => ({ fare: f.fare as unknown as FareFamily })),
        {
          adults: booking.passengers.filter((p) => p.type === 'ADULT').length,
          children: booking.passengers.filter((p) => p.type === 'CHILD').length,
          infants: booking.passengers.filter((p) => p.type === 'INFANT').length,
        },
        booking.totalAmountPaise,
      );
      return {
        ...base,
        cancellable: true,
        refundAmount: refund,
        refundPercent:
          booking.totalAmountPaise > 0 ? Math.floor((refund * 100) / booking.totalAmountPaise) : 0,
      };
    }
    return {
      ...base,
      cancellable: false,
      reason: 'Please contact support to cancel this booking.',
    };
  }
}
