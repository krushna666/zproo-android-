import { findCity } from '@zproo/config';
import type { BookingDetails, BookingListItem, BookingStatus, PaymentOrder } from '@zproo/types';
import { OPEN_HOLD_STATUSES, transition } from '@zproo/utils';
import { randomInt } from './random';
import {
  currentUser,
  db,
  holdExpired,
  notFound,
  randomDigits,
  randomId,
  save,
  StaticError,
  type StaticRequest,
  type StaticResult,
  type StoredBooking,
} from './core';

/** Minutes seats stay held for an unpaid booking. */
export const holdMinutes = 15;

type NewBooking = Omit<
  BookingDetails,
  | 'status'
  | 'paymentStatus'
  | 'createdAt'
  | 'holdExpiresAt'
  | 'serverNow'
  | 'confirmedAt'
  | 'cancelledAt'
>;

/** Applies a status change through the shared state machine (throws on an illegal move). */
function move(d: BookingDetails, to: BookingStatus): void {
  d.status = transition(d.status, to);
}

/** What the API returns: the booking plus the server clock. */
const withClock = (d: BookingDetails): BookingDetails => ({
  ...d,
  serverNow: new Date().toISOString(),
});

export function newBooking(input: NewBooking): BookingDetails {
  const now = Date.now();
  return {
    ...input,
    status: 'HELD',
    paymentStatus: 'CREATED',
    createdAt: new Date(now).toISOString(),
    holdExpiresAt: new Date(now + holdMinutes * 60_000).toISOString(),
    serverNow: new Date(now).toISOString(),
    confirmedAt: null,
    cancelledAt: null,
  };
}

/** Expires unpaid bookings whose hold ran out (their seats are then free again). */
function expireHolds(): void {
  let changed = false;
  for (const b of db().bookings) {
    const d = b.details;
    if (
      OPEN_HOLD_STATUSES.includes(d.status) &&
      d.holdExpiresAt &&
      Date.parse(d.holdExpiresAt) < Date.now()
    ) {
      move(d, 'EXPIRED');
      d.paymentStatus = 'CANCELLED';
      for (const p of db().payments) {
        if (p.reference === d.reference && p.status === 'CREATED') p.status = 'CANCELLED';
      }
      changed = true;
    }
  }
  if (changed) save();
}

/** Inventory held by active (unpaid-in-hold or confirmed) bookings in this browser. */
export function activeHolds(): StoredBooking['holds'][number][] {
  expireHolds();
  return db()
    .bookings.filter(
      (b) => OPEN_HOLD_STATUSES.includes(b.details.status) || b.details.status === 'CONFIRMED',
    )
    .flatMap((b) => b.holds as StoredBooking['holds'][number][]);
}

function ownBooking(reference: string): StoredBooking {
  expireHolds();
  const user = currentUser();
  const booking = db().bookings.find((b) => b.details.reference === reference.toUpperCase());
  if (!booking || booking.userId !== user.id) throw notFound('Booking not found');
  return booking;
}

const cityName = (code: string) => findCity(code)?.name ?? code;

function listItem(b: StoredBooking): BookingListItem {
  const d = b.details;
  const n = d.passengers.length;
  if (d.bus) {
    return {
      reference: d.reference,
      serviceType: 'BUS',
      status: d.status,
      paymentStatus: d.paymentStatus,
      title: `${cityName(d.bus.offer.from.code)} → ${cityName(d.bus.offer.to.code)}`,
      subtitle: `${d.bus.offer.operator.name} · Seat${d.bus.seatNumbers.length === 1 ? '' : 's'} ${d.bus.seatNumbers.join(', ')}`,
      travelDate: d.travelDate,
      totalPaise: d.price.totalPaise,
      createdAt: d.createdAt,
    };
  }
  const first = d.flights[0]?.offer;
  const last = d.flights.at(-1)?.offer;
  const roundTrip = d.flights.length === 2 && first?.from.code === last?.to.code;
  return {
    reference: d.reference,
    serviceType: 'FLIGHT',
    status: d.status,
    paymentStatus: d.paymentStatus,
    title:
      first && last
        ? `${first.from.code} ${roundTrip ? '⇄' : '→'} ${roundTrip ? first.to.code : last.to.code}`
        : 'Booking',
    subtitle: `${n} traveller${n === 1 ? '' : 's'} · ${d.flights.length} flight${d.flights.length === 1 ? '' : 's'}`,
    travelDate: d.travelDate,
    totalPaise: d.price.totalPaise,
    createdAt: d.createdAt,
  };
}

/** Airline-style PNR and ticket numbers, or an operator PNR for buses. */
function issueTickets(d: BookingDetails): void {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  d.flights = d.flights.map((leg) => ({
    ...leg,
    pnr: Array.from({ length: 6 }, () => alphabet[randomInt(alphabet.length)]).join(''),
    tickets: d.passengers.map((p) => ({
      passengerId: p.id,
      ticketNumber: `999${randomDigits(10)}`,
    })),
  }));
  if (d.bus) d.bus = { ...d.bus, pnr: `${d.bus.offer.operator.code}${randomDigits(7)}` };
}

export function bookingRoutes(req: StaticRequest): StaticResult | null {
  const { method, path, body } = req;

  if (method === 'GET' && path === '/bookings') {
    const user = currentUser();
    expireHolds();
    const items = db()
      .bookings.filter((b) => b.userId === user.id)
      .sort((a, b) => b.details.createdAt.localeCompare(a.details.createdAt))
      .map(listItem);
    return { data: items };
  }

  const details = /^\/bookings\/([^/]+)$/.exec(path);
  if (method === 'GET' && details)
    return { data: withClock(ownBooking(details[1] as string).details) };

  if (method === 'POST' && path === '/payments/create') {
    const { bookingReference } = (body ?? {}) as { bookingReference?: string };
    const booking = ownBooking(bookingReference ?? '');
    const d = booking.details;
    if (d.status === 'EXPIRED') throw holdExpired();
    if (!OPEN_HOLD_STATUSES.includes(d.status))
      throw new StaticError(409, 'INVALID_STATE', 'This booking is not awaiting payment');
    if (d.status === 'HELD') {
      move(d, 'PAYMENT_PENDING');
      save();
    }
    const open =
      db().payments.find((p) => p.reference === d.reference && p.status === 'CREATED') ??
      (() => {
        const p = {
          id: randomId(),
          reference: d.reference,
          userId: booking.userId,
          orderId: `mockorder_${randomId().slice(0, 14)}`,
          amountPaise: d.price.totalPaise,
          status: 'CREATED' as const,
        };
        db().payments.push(p);
        save();
        return p;
      })();
    const order: PaymentOrder = {
      paymentId: open.id,
      provider: 'mock',
      providerOrderId: open.orderId,
      amountPaise: open.amountPaise,
      currency: 'INR',
      publicKey: null,
      bookingReference: d.reference,
      holdExpiresAt: d.holdExpiresAt,
      serverNow: new Date().toISOString(),
    };
    return { status: 201, data: order, message: 'Payment order created' };
  }

  if (method === 'POST' && path === '/payments/mock/complete') {
    const { paymentId, outcome } = (body ?? {}) as {
      paymentId?: string;
      outcome?: 'success' | 'failure';
    };
    const user = currentUser();
    const payment = db().payments.find((p) => p.id === paymentId && p.userId === user.id);
    if (!payment) throw notFound('Payment not found');
    const booking = ownBooking(payment.reference);
    const d = booking.details;
    if (outcome !== 'success') {
      payment.status = 'FAILED';
      save();
      return { data: { reference: d.reference, status: 'FAILED' }, message: 'Payment failed' };
    }
    if (payment.status === 'CAPTURED')
      return { data: { reference: d.reference, status: 'CAPTURED' } };
    if (d.status !== 'PAYMENT_PENDING') {
      // Paid after the hold ran out: never confirmed, the money is owed back.
      payment.status = 'REFUND_DUE';
      d.paymentStatus = 'REFUND_DUE';
      save();
      throw holdExpired(
        'Your hold expired before payment completed. Any amount debited will be refunded.',
      );
    }
    payment.status = 'CAPTURED';
    d.paymentStatus = 'CAPTURED';
    d.holdExpiresAt = null;
    issueTickets(d);
    move(d, 'CONFIRMED');
    d.confirmedAt = new Date().toISOString();
    save();
    return {
      data: { reference: d.reference, status: 'CAPTURED' },
      message: 'Payment successful. Your booking is confirmed.',
    };
  }

  const fail = /^\/payments\/([^/]+)\/fail$/.exec(path);
  if (method === 'POST' && fail) {
    const payment = db().payments.find((p) => p.id === fail[1] && p.userId === currentUser().id);
    if (!payment) throw notFound('Payment not found');
    if (payment.status === 'CREATED') payment.status = 'FAILED';
    save();
    return { data: null, message: 'Payment marked as failed. You can try again.' };
  }
  return null;
}
