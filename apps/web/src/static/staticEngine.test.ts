import type {
  AuthSession,
  BookingDetails,
  BookingListItem,
  BusBookResponse,
  BusSearchResponse,
  BusSeat,
  BusSeatMap,
  BusTripDetails,
  CancellationQuote,
  FlightSearchResult,
  OtpSent,
  PaymentOrder,
  VerifyOtpResult,
} from '@zproo/types';
import axios, { AxiosError } from 'axios';
import { beforeEach, describe, expect, it } from 'vitest';
import { resetStaticDb } from './core';
import { staticAdapter } from './server';

const api = axios.create({ baseURL: '/api', adapter: staticAdapter });
const data = async <T>(p: Promise<{ data: { data: T } }>) => (await p).data.data;
const fail = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (err) {
    if (err instanceof AxiosError)
      return { status: err.response?.status, body: err.response?.data };
  }
  throw new Error('expected the request to fail');
};

const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

async function signUp(phone = '9876543210') {
  const otp = await data<OtpSent>(api.post('/auth/send-otp', { phone }));
  const verified = await data<VerifyOtpResult>(
    api.post('/auth/verify-otp', { phone, otp: otp.devCode }),
  );
  if (verified.status !== 'SIGNUP_REQUIRED') throw new Error('expected signup');
  return data<AuthSession>(
    api.post('/auth/register', {
      signupToken: verified.signupToken,
      fullName: 'Amit Sharma',
      password: 'secret123',
    }),
  );
}

/** Order → demo gateway → server verification, as the payment page does. */
async function pay(bookingRef: string) {
  const order = await data<PaymentOrder>(api.post('/payments/create', { bookingRef }));
  const gateway = await data<{ orderId: string; paymentId: string; signature: string }>(
    api.post('/payments/mock/complete', { orderId: order.orderId, outcome: 'success' }),
  );
  const { outcome: _ignored, ...result } = gateway as typeof gateway & { outcome?: string };
  return data<{ status: string }>(api.post('/payments/verify', { bookingRef, ...result }));
}

const book = (url: string, body: unknown, key = crypto.randomUUID()) =>
  api.post(url, body, { headers: { 'Idempotency-Key': key } });

beforeEach(() => resetStaticDb());

describe('static engine: accounts', () => {
  it('signs up with OTP, restores the session, and signs in with a password', async () => {
    const session = await signUp();
    expect(session.user).toMatchObject({
      fullName: 'Amit Sharma',
      phone: '+919876543210',
      roles: ['USER'],
    });
    expect((await data<AuthSession>(api.post('/auth/refresh'))).user.id).toBe(session.user.id);

    await api.post('/auth/logout');
    expect((await fail(api.post('/auth/refresh'))).status).toBe(401);
    expect(
      (await fail(api.post('/auth/login', { identifier: '9876543210', password: 'nope' }))).status,
    ).toBe(401);
    const again = await data<AuthSession>(
      api.post('/auth/login', { identifier: '9876543210', password: 'secret123' }),
    );
    expect(again.user.id).toBe(session.user.id);
  });

  it('rejects a wrong code and validates input like the API', async () => {
    await api.post('/auth/send-otp', { phone: '9876543210' });
    const wrong = await fail(api.post('/auth/verify-otp', { phone: '9876543210', otp: '000000' }));
    expect(wrong.body.error).toMatchObject({ code: 'INVALID_OTP' });
    const bad = await fail(api.post('/auth/send-otp', { phone: '123' }));
    expect(bad.body.error).toMatchObject({
      code: 'VALIDATION_ERROR',
      details: { fields: { phone: expect.any(String) }, issues: [{ path: 'body.phone' }] },
    });
  });
});

describe('static engine: flights', () => {
  it('searches, books, pays and issues tickets', async () => {
    const search = await data<FlightSearchResult>(
      api.get('/flights/search', { params: { from: 'PNQ', to: 'DEL', date: day(20), adults: 1 } }),
    );
    expect(search.demo).toBe(true);
    const [offer] = search.legs[0]?.offers ?? [];
    if (!offer) throw new Error('no offers');
    expect(offer).toMatchObject({ from: { code: 'PNQ' }, to: { code: 'DEL' } });

    expect((await fail(book('/flights/book', {}))).status).toBe(401);
    await signUp();
    const passengers = [
      { type: 'ADULT', title: 'MR', firstName: 'Amit', lastName: 'Sharma', gender: 'MALE' },
    ];
    const contact = { email: 'amit@example.com', phone: '9876543210' };
    const changed = await fail(
      book('/flights/book', { offerIds: [offer.id], passengers, contact, expectedTotalPaise: 100 }),
    );
    expect(changed.body.error).toMatchObject({
      code: 'PRICE_CHANGED',
      details: { oldTotal: 100, newTotal: offer.totalPaise },
    });

    const key = crypto.randomUUID();
    const booking = await data<BookingDetails>(
      book(
        '/flights/book',
        { offerIds: [offer.id], passengers, contact, expectedTotalPaise: offer.totalPaise },
        key,
      ),
    );
    expect(booking).toMatchObject({ status: 'HELD', serviceType: 'FLIGHT' });
    const retry = await data<BookingDetails>(
      book(
        '/flights/book',
        { offerIds: [offer.id], passengers, contact, expectedTotalPaise: offer.totalPaise },
        key,
      ),
    );
    expect(retry.reference).toBe(booking.reference);

    const order = await data<PaymentOrder>(
      api.post('/payments/create', { bookingRef: booking.reference }),
    );
    expect(order.amount).toBe(offer.totalPaise);
    await api.post('/payments/mock/complete', { orderId: order.orderId, outcome: 'failure' });
    await pay(booking.reference);

    const confirmed = await data<BookingDetails>(api.get(`/bookings/${booking.reference}`));
    expect(confirmed.status).toBe('CONFIRMED');
    expect(confirmed.flights[0]?.pnr).toMatch(/^[A-Z0-9]{6}$/);
    const list = await data<BookingListItem[]>(api.get('/bookings'));
    expect(list).toEqual([
      expect.objectContaining({ reference: booking.reference, title: 'PNQ → DEL' }),
    ]);
  });

  it('returns both legs for a round trip', async () => {
    const search = await data<FlightSearchResult>(
      api.get('/flights/search', {
        params: { trip: 'ROUND_TRIP', from: 'BOM', to: 'GOI', date: day(20), return: day(24) },
      }),
    );
    expect(search.legs.map((l) => `${l.from}-${l.to}`)).toEqual(['BOM-GOI', 'GOI-BOM']);
  });
});

const PUNE_MUMBAI = { from: 'PNQ', to: 'BOM', date: day(10) };

/** A trip's details plus an open seat matching `pick`, on the first trip that has one. */
async function findSeat(pick: (s: BusSeat) => boolean) {
  const search = await data<BusSearchResponse>(api.get('/buses/search', { params: PUNE_MUMBAI }));
  for (const summary of search.trips) {
    const map = await data<BusSeatMap>(api.get(`/buses/${summary.tripId}/seats`));
    const seat = map.decks.flatMap((d) => d.seats).find((s) => s.status === 'AVAILABLE' && pick(s));
    if (!seat) continue;
    return { trip: await data<BusTripDetails>(api.get(`/buses/${summary.tripId}`)), seat };
  }
  throw new Error('no matching seat');
}

const busBody = (trip: BusTripDetails, seat: BusSeat, gender: 'MALE' | 'FEMALE' = 'MALE') => ({
  tripId: trip.tripId,
  seats: [seat.seatNo],
  boardingPointId: trip.boardingPoints[0]?.id,
  droppingPointId: trip.droppingPoints.at(-1)?.id,
  travellers: [{ seatNo: seat.seatNo, name: 'Rohan Patil', age: 30, gender }],
  contact: { email: 'rohan@example.com', mobile: '9876543210' },
  expectedTotal: seat.price,
});

const statusOf = (map: BusSeatMap, seatNo: string) =>
  map.decks.flatMap((d) => d.seats).find((s) => s.seatNo === seatNo)?.status;

describe('static engine: buses', () => {
  it('returns the same trips as the API generator', async () => {
    const search = await data<BusSearchResponse>(
      api.get('/buses/search', { params: { from: 'pune', to: 'mumbai', date: day(10) } }),
    );
    expect(search).toMatchObject({ from: 'PNQ', to: 'BOM', demo: true });
    expect(search.trips.length).toBeGreaterThanOrEqual(10);
    expect(search.trips[0]?.tripId).toMatch(/^trp_PNQ_BOM_\d{8}_\d{2}$/);
    expect(search.filters.priceMin).toBe(Math.min(...search.trips.map((t) => t.fromPrice)));
    const cities = await data<{ code: string }[]>(
      api.get('/buses/cities', { params: { q: 'nag' } }),
    );
    expect(cities[0]?.code).toBe('NAG');
  });

  it('holds seats, confirms on payment and cancels with a tiered refund', async () => {
    await signUp();
    const { trip, seat } = await findSeat((s) => !s.ladiesOnly);
    expect(trip.boardingPoints[0]?.name).toBe('Swargate');
    const held = await data<BusBookResponse>(book('/buses/book', busBody(trip, seat)));
    expect(held).toMatchObject({ status: 'HELD', priceBreakdown: { totalPaise: seat.price } });

    const map = await data<BusSeatMap>(api.get(`/buses/${trip.tripId}/seats`));
    expect(statusOf(map, seat.seatNo)).toBe('HELD');
    expect((await fail(book('/buses/book', busBody(trip, seat)))).body.error).toMatchObject({
      code: 'SEAT_UNAVAILABLE',
      details: { seats: [seat.seatNo] },
    });

    await pay(held.bookingRef);
    const confirmed = await data<BookingDetails>(api.get(`/bookings/${held.bookingRef}`));
    expect(confirmed.bus?.pnr).toMatch(new RegExp(`^${trip.operator.code}\\d{7}$`));

    const quote = await data<CancellationQuote>(
      api.get(`/bookings/${held.bookingRef}/cancellation`),
    );
    expect(quote).toMatchObject({ cancellable: true, refundPercent: 90 });
    const cancelled = await data<{ status: string; refundAmount: number }>(
      api.post(`/buses/${held.bookingRef}/cancel`),
    );
    expect(cancelled).toEqual({
      bookingRef: held.bookingRef,
      status: 'REFUND_PENDING',
      refundAmount: quote.refundAmount,
    });
    const freed = await data<BusSeatMap>(api.get(`/buses/${trip.tripId}/seats`));
    expect(statusOf(freed, seat.seatNo)).toBe('AVAILABLE');
  });

  it('keeps ladies-only seats for women', async () => {
    await signUp();
    const { trip, seat } = await findSeat((s) => s.ladiesOnly);
    const res = await fail(book('/buses/book', busBody(trip, seat)));
    expect(res.body.error.details.issues).toEqual([
      { path: 'body.travellers.0.gender', message: 'This seat is reserved for women' },
    ]);
    await data(book('/buses/book', busBody(trip, seat, 'FEMALE')));
  });

  it('refuses a stale price', async () => {
    await signUp();
    const { trip, seat } = await findSeat((s) => !s.ladiesOnly);
    const res = await fail(book('/buses/book', { ...busBody(trip, seat), expectedTotal: 100 }));
    expect(res.body.error).toMatchObject({
      code: 'PRICE_CHANGED',
      details: { oldTotal: 100, newTotal: seat.price },
    });
  });
});

describe('static engine: payments and coupons', () => {
  /** A held bus seat above BUS10's minimum. */
  async function heldBus() {
    await signUp();
    const { trip, seat } = await findSeat((s) => !s.ladiesOnly && s.price > 40_000);
    const held = await data<BusBookResponse>(book('/buses/book', busBody(trip, seat)));
    return data<BookingDetails>(api.get(`/bookings/${held.bookingRef}`));
  }

  it('returns copies, never the stored records', async () => {
    const booking = await heldBus();
    const total = booking.price.totalPaise;
    booking.price.totalPaise = 1;
    const again = await data<BookingDetails>(api.get(`/bookings/${booking.reference}`));
    expect(again.price.totalPaise).toBe(total);
  });

  it('rejects a payment the gateway did not sign', async () => {
    const booking = await heldBus();
    const order = await data<PaymentOrder>(
      api.post('/payments/create', { bookingRef: booking.reference }),
    );
    const res = await fail(
      api.post('/payments/verify', {
        bookingRef: booking.reference,
        orderId: order.orderId,
        paymentId: 'pay_forged',
        signature: 'f'.repeat(64),
      }),
    );
    expect(res).toMatchObject({ status: 400, body: { error: { code: 'PAYMENT_ERROR' } } });
  });

  it('applies and removes coupons with the same rules as the API', async () => {
    const booking = await heldBus();
    const applied = await data<BookingDetails>(
      api.post('/coupons/apply', { bookingRef: booking.reference, code: 'bus10' }),
    );
    expect(applied.coupon?.code).toBe('BUS10');
    expect(applied.price.totalPaise).toBe(booking.price.totalPaise - applied.price.discountPaise);
    const wrong = await fail(
      api.post('/coupons/apply', { bookingRef: booking.reference, code: 'FLY500' }),
    );
    expect(wrong.body.error).toMatchObject({
      code: 'COUPON_INVALID',
      details: { reason: 'not_applicable' },
    });
    const expired = await fail(
      api.post('/coupons/apply', { bookingRef: booking.reference, code: 'MONSOON20' }),
    );
    expect(expired.body.error.details).toEqual({ reason: 'expired' });
    const removed = await data<BookingDetails>(
      api.post('/coupons/remove', { bookingRef: booking.reference }),
    );
    expect(removed.price.totalPaise).toBe(booking.price.totalPaise);
    expect(removed.coupon).toBeNull();
  });
});
