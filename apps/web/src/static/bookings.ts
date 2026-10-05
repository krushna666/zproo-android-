import {
  busRefund,
  FLIGHT_CANCEL_CUTOFF_HOURS,
  findMockAirline,
  flightRefund,
} from '@zproo/catalog';
import { DEMO_COUPONS, findCity, type DemoCoupon } from '@zproo/config';
import type {
  BookingDetails,
  BookingListItem,
  BookingStatus,
  CancellationQuote,
  CouponRejection,
  PaymentOrder,
} from '@zproo/types';
import { OPEN_HOLD_STATUSES, couponDiscount, subtotalOf, totalOf, transition } from '@zproo/utils';
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
  type StoredPayment,
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
  | 'coupon'
  | 'demo'
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

export function newBooking(input: NewBooking, minutes: number = holdMinutes): BookingDetails {
  const now = Date.now();
  return {
    ...input,
    status: 'HELD',
    paymentStatus: 'CREATED',
    createdAt: new Date(now).toISOString(),
    holdExpiresAt: new Date(now + minutes * 60_000).toISOString(),
    serverNow: new Date(now).toISOString(),
    coupon: null,
    demo: true,
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

function ownPayment(orderId: string | undefined): StoredPayment {
  const user = currentUser();
  const payment = db().payments.find((p) => p.orderId === orderId);
  if (!payment) throw notFound('Payment not found');
  if (payment.userId !== user.id)
    throw new StaticError(403, 'FORBIDDEN', "You don't have access to this payment");
  return payment;
}

const couponInvalid = (reason: CouponRejection) =>
  new StaticError(422, 'COUPON_INVALID', "This coupon can't be used for this booking.", {
    reason,
  });

/** Same rules as the API: dates, service, minimum amount and per-customer use. */
function checkCoupon(coupon: DemoCoupon | undefined, booking: StoredBooking): number {
  const d = booking.details;
  if (!coupon) throw couponInvalid('not_applicable');
  const now = Date.now();
  if (now < Date.parse(coupon.startsAt) || now >= Date.parse(coupon.endsAt))
    throw couponInvalid('expired');
  if (coupon.serviceType && coupon.serviceType !== d.serviceType)
    throw couponInvalid('not_applicable');
  const amounts = {
    basePaise: d.price.basePaise,
    taxPaise: d.price.taxesPaise,
    feePaise: d.price.feesPaise,
  };
  if (subtotalOf(amounts) < coupon.minAmountPaise) throw couponInvalid('min_amount');
  const used = db().bookings.filter(
    (b) =>
      b !== booking &&
      b.userId === booking.userId &&
      b.details.coupon?.code === coupon.code &&
      (OPEN_HOLD_STATUSES.includes(b.details.status) || b.details.status === 'CONFIRMED'),
  ).length;
  if (used >= coupon.perUserLimit) throw couponInvalid('usage_limit');
  const discount = couponDiscount(coupon, d.price.basePaise);
  if (discount <= 0) throw couponInvalid('not_applicable');
  return discount;
}

/** Stores a coupon discount on the booking and keeps its price lines and total in step. */
function setDiscount(d: BookingDetails, code: string | null, discountPaise: number): void {
  const lines = d.price.lines.filter((l) => l.amountPaise >= 0);
  d.price = {
    ...d.price,
    lines: code ? [...lines, { label: `Coupon ${code}`, amountPaise: -discountPaise }] : lines,
    discountPaise,
    totalPaise: totalOf({
      basePaise: d.price.basePaise,
      taxPaise: d.price.taxesPaise,
      feePaise: d.price.feesPaise,
      discountPaise,
    }),
  };
  d.coupon = code ? { code, discountPaise } : null;
}

function ownBooking(reference: string): StoredBooking {
  expireHolds();
  const user = currentUser();
  const booking = db().bookings.find((b) => b.details.reference === reference.toUpperCase());
  if (!booking) throw notFound('Booking not found');
  if (booking.userId !== user.id)
    throw new StaticError(403, 'FORBIDDEN', "You don't have access to this booking");
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
      title: `${cityName(d.bus.trip.from.code)} → ${cityName(d.bus.trip.to.code)}`,
      subtitle: `${d.bus.trip.operator.name} · Seat${d.bus.seats.length === 1 ? '' : 's'} ${d.bus.seats.join(', ')}`,
      travelDate: d.travelDate,
      totalPaise: d.price.totalPaise,
      createdAt: d.createdAt,
    };
  }
  const first = d.flights[0]?.offer.slices[0];
  const origin = first?.segments[0]?.from;
  const destination = first?.segments.at(-1)?.to;
  const roundTrip = d.flights.length === 2;
  return {
    reference: d.reference,
    serviceType: 'FLIGHT',
    status: d.status,
    paymentStatus: d.paymentStatus,
    title: origin && destination ? `${origin} ${roundTrip ? '⇄' : '→'} ${destination}` : 'Booking',
    subtitle: `${n} traveller${n === 1 ? '' : 's'} · ${d.flights.length} flight${d.flights.length === 1 ? '' : 's'}`,
    travelDate: d.travelDate,
    totalPaise: d.price.totalPaise,
    createdAt: d.createdAt,
  };
}

/** Airline-style PNR and ticket numbers, or an operator PNR for buses. */
function issueTickets(d: BookingDetails): void {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  d.flights = d.flights.map((leg) => {
    const slice = leg.offer.slices[0];
    const segmentKey = `${slice?.segments[0]?.from ?? ''}-${slice?.segments.at(-1)?.to ?? ''}`;
    const prefix = findMockAirline(leg.offer.carrier.code)?.ticketPrefix ?? '980';
    return {
      ...leg,
      pnr: Array.from({ length: 6 }, () => alphabet[randomInt(alphabet.length)]).join(''),
      tickets: d.passengers.map((p) => ({
        passengerId: p.id,
        ticketNumber: `${prefix}${randomDigits(10)}`,
        segmentKey,
      })),
    };
  });
  if (d.bus) d.bus = { ...d.bus, pnr: `${d.bus.trip.operator.code}${randomDigits(7)}` };
}

/** Same rules as the API's CancellationService: confirmed bus bookings, refund by policy tier. */
function cancellationQuote(d: BookingDetails): CancellationQuote {
  const base = { bookingRef: d.reference, refundAmount: 0, refundPercent: 0 };
  if (d.status !== 'CONFIRMED')
    return { ...base, cancellable: false, reason: 'Only confirmed bookings can be cancelled.' };
  const firstLeg = d.flights[0];
  if (firstLeg) {
    const departure = firstLeg.offer.slices[0]?.segments[0]?.departure ?? '';
    if ((Date.parse(departure) - Date.now()) / 3_600_000 < FLIGHT_CANCEL_CUTOFF_HOURS)
      return {
        ...base,
        cancellable: false,
        reason: 'Cancellation is closed for this flight. Please contact the airline.',
      };
    const count = (t: string) => d.passengers.filter((p) => p.type === t).length;
    const refund = flightRefund(
      d.flights,
      { adults: count('ADULT'), children: count('CHILD'), infants: count('INFANT') },
      d.price.totalPaise,
    );
    return {
      ...base,
      cancellable: true,
      refundAmount: refund,
      refundPercent: d.price.totalPaise > 0 ? Math.floor((refund * 100) / d.price.totalPaise) : 0,
    };
  }
  if (!d.bus)
    return {
      ...base,
      cancellable: false,
      reason: 'Please contact support to cancel this booking.',
    };
  const minutes = (Date.parse(d.bus.trip.departure) - Date.now()) / 60_000;
  if (minutes <= 0)
    return { ...base, cancellable: false, reason: 'This bus has already departed.' };
  const { refundPaise, refundPercent } = busRefund(
    d.price.totalPaise,
    d.price.feesPaise,
    minutes,
    d.bus.trip.cancellationPolicy,
  );
  return { ...base, cancellable: true, refundAmount: refundPaise, refundPercent };
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

  const quote = /^\/bookings\/([^/]+)\/cancellation$/.exec(path);
  if (method === 'GET' && quote)
    return { data: cancellationQuote(ownBooking(quote[1] as string).details) };

  const release = /^\/bookings\/([^/]+)\/release$/.exec(path);
  if (method === 'POST' && release) {
    const booking = ownBooking(release[1] as string);
    const d = booking.details;
    if (d.paymentStatus === 'CAPTURED' || !OPEN_HOLD_STATUSES.includes(d.status))
      throw new StaticError(409, 'INVALID_STATE', 'This booking is not on hold');
    move(d, 'EXPIRED');
    d.paymentStatus = 'CANCELLED';
    booking.holds = [];
    for (const p of db().payments) {
      if (p.reference === d.reference && p.status === 'CREATED') p.status = 'CANCELLED';
    }
    save();
    return { data: { bookingRef: d.reference, status: 'EXPIRED' }, message: 'Hold released' };
  }

  const cancel = /^\/(buses|flights)\/([^/]+)\/cancel$/.exec(path);
  if (method === 'POST' && cancel) {
    const booking = ownBooking(cancel[2] as string);
    const d = booking.details;
    if (d.serviceType !== (cancel[1] === 'buses' ? 'BUS' : 'FLIGHT'))
      throw notFound('Booking not found');
    const q = cancellationQuote(d);
    if (!q.cancellable)
      throw new StaticError(409, 'INVALID_STATE', q.reason ?? 'This booking can’t be cancelled');
    move(d, 'CANCELLED');
    d.cancelledAt = new Date().toISOString();
    booking.holds = [];
    if (q.refundAmount > 0) {
      move(d, 'REFUND_PENDING');
      const paid = db().payments.find(
        (p) => p.reference === d.reference && p.status === 'CAPTURED',
      );
      if (paid)
        paid.status = q.refundAmount >= paid.amountPaise ? 'REFUNDED' : 'PARTIALLY_REFUNDED';
    }
    save();
    return {
      data: { bookingRef: d.reference, status: d.status, refundAmount: q.refundAmount },
      message: 'Booking cancelled',
    };
  }

  const details = /^\/bookings\/([^/]+)$/.exec(path);
  if (method === 'GET' && details)
    return { data: withClock(ownBooking(details[1] as string).details) };

  if (method === 'POST' && path === '/payments/create') {
    const { bookingRef } = (body ?? {}) as { bookingRef?: string };
    const booking = ownBooking(bookingRef ?? '');
    const d = booking.details;
    if (d.status === 'EXPIRED') throw holdExpired();
    if (!OPEN_HOLD_STATUSES.includes(d.status) || d.paymentStatus === 'CAPTURED')
      throw new StaticError(409, 'INVALID_STATE', 'This booking is not awaiting payment');
    if (d.status === 'HELD') move(d, 'PAYMENT_PENDING');
    let open = db().payments.find((p) => p.reference === d.reference && p.status === 'CREATED');
    // A coupon applied or removed since the order was made changes the amount: start a new order.
    if (open && open.amountPaise !== d.price.totalPaise) {
      open.status = 'CANCELLED';
      open = undefined;
    }
    if (!open) {
      open = {
        id: randomId(),
        reference: d.reference,
        userId: booking.userId,
        orderId: `order_demo${randomId().slice(0, 14)}`,
        amountPaise: d.price.totalPaise,
        status: 'CREATED',
      };
      db().payments.push(open);
    }
    save();
    const order: PaymentOrder = {
      orderId: open.orderId,
      amount: open.amountPaise,
      currency: 'INR',
      keyId: null,
      provider: 'mock',
      bookingRef: d.reference,
      holdExpiresAt: d.holdExpiresAt,
      serverNow: new Date().toISOString(),
    };
    return { status: 201, data: order, message: 'Payment order created' };
  }

  if (method === 'POST' && path === '/payments/mock/complete') {
    const { orderId, outcome } = (body ?? {}) as {
      orderId?: string;
      outcome?: 'success' | 'failure';
    };
    const payment = ownPayment(orderId);
    if (outcome !== 'success') {
      if (payment.status === 'CREATED') payment.status = 'FAILED';
      save();
      return { data: { outcome: 'failure' }, message: 'Payment failed' };
    }
    payment.gatewayPaymentId ??= `pay_demo${randomId().slice(0, 14)}`;
    payment.signature ??= randomId() + randomId();
    save();
    return {
      data: {
        outcome: 'success',
        orderId: payment.orderId,
        paymentId: payment.gatewayPaymentId,
        signature: payment.signature,
      },
      message: 'Payment authorised',
    };
  }

  if (method === 'POST' && path === '/payments/verify') {
    const input = (body ?? {}) as {
      bookingRef?: string;
      orderId?: string;
      paymentId?: string;
      signature?: string;
    };
    const payment = ownPayment(input.orderId);
    const booking = ownBooking(payment.reference);
    const d = booking.details;
    const result = () => ({
      data: { bookingRef: d.reference, status: d.status, paymentStatus: d.paymentStatus },
    });
    if (
      input.bookingRef !== d.reference ||
      !payment.signature ||
      input.paymentId !== payment.gatewayPaymentId ||
      input.signature !== payment.signature
    ) {
      throw new StaticError(
        400,
        'PAYMENT_ERROR',
        'We could not verify this payment. You have not been charged for a booking.',
      );
    }
    if (payment.status === 'CAPTURED') return result();
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
    return { ...result(), message: 'Payment successful. Your booking is confirmed.' };
  }

  if (method === 'POST' && path === '/payments/fail') {
    const { orderId } = (body ?? {}) as { orderId?: string };
    const payment = ownPayment(orderId);
    if (payment.status === 'CREATED') payment.status = 'FAILED';
    save();
    return { data: null, message: 'Payment marked as failed. You can try again.' };
  }

  if (method === 'GET' && path === '/coupons') {
    const service = (req.params.service ?? null) as DemoCoupon['serviceType'];
    const now = Date.now();
    return {
      data: DEMO_COUPONS.filter(
        (c) =>
          Date.parse(c.startsAt) <= now &&
          Date.parse(c.endsAt) > now &&
          (!service || c.serviceType === null || c.serviceType === service),
      ).map((c) => ({
        code: c.code,
        description: c.description,
        serviceType: c.serviceType,
        minAmountPaise: c.minAmountPaise,
        endsAt: new Date(c.endsAt).toISOString(),
      })),
    };
  }

  if (method === 'POST' && (path === '/coupons/apply' || path === '/coupons/remove')) {
    const input = (body ?? {}) as { bookingRef?: string; code?: string };
    const booking = ownBooking(input.bookingRef ?? '');
    const d = booking.details;
    if (d.status === 'EXPIRED') throw holdExpired();
    if (!OPEN_HOLD_STATUSES.includes(d.status) || d.paymentStatus === 'CAPTURED')
      throw new StaticError(409, 'INVALID_STATE', 'Coupons can only be changed before payment');
    if (path === '/coupons/remove') {
      setDiscount(d, null, 0);
    } else {
      const code = (input.code ?? '').trim().toUpperCase();
      const coupon = DEMO_COUPONS.find((c) => c.code === code);
      setDiscount(d, code, checkCoupon(coupon, booking));
    }
    save();
    return {
      data: withClock(d),
      message: path === '/coupons/apply' ? 'Coupon applied' : 'Coupon removed',
    };
  }
  return null;
}
