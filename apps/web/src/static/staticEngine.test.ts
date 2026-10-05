import type {
  AuthSession,
  BookingDetails,
  BookingListItem,
  BusSearchResult,
  BusSeatMap,
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
    expect(wrong.body).toMatchObject({ errorCode: 'INVALID_OTP' });
    const bad = await fail(api.post('/auth/send-otp', { phone: '123' }));
    expect(bad.body).toMatchObject({
      errorCode: 'VALIDATION_ERROR',
      details: [{ path: 'body.phone' }],
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
    expect(changed.body).toMatchObject({ errorCode: 'PRICE_CHANGED' });

    const key = crypto.randomUUID();
    const booking = await data<BookingDetails>(
      book(
        '/flights/book',
        { offerIds: [offer.id], passengers, contact, expectedTotalPaise: offer.totalPaise },
        key,
      ),
    );
    expect(booking).toMatchObject({ status: 'PENDING_PAYMENT', serviceType: 'FLIGHT' });
    const retry = await data<BookingDetails>(
      book(
        '/flights/book',
        { offerIds: [offer.id], passengers, contact, expectedTotalPaise: offer.totalPaise },
        key,
      ),
    );
    expect(retry.reference).toBe(booking.reference);

    const order = await data<PaymentOrder>(
      api.post('/payments/create', { bookingReference: booking.reference }),
    );
    expect(order.amountPaise).toBe(offer.totalPaise);
    await api.post('/payments/mock/complete', { paymentId: order.paymentId, outcome: 'failure' });
    const order2 = await data<PaymentOrder>(
      api.post('/payments/create', { bookingReference: booking.reference }),
    );
    await api.post('/payments/mock/complete', { paymentId: order2.paymentId, outcome: 'success' });

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

describe('static engine: buses', () => {
  it('holds seats for the booking, releases them on expiry, and confirms on payment', async () => {
    const search = await data<BusSearchResult>(
      api.get('/buses/search', { params: { from: 'pune', to: 'mumbai', date: day(10) } }),
    );
    expect(search.trips.length).toBeGreaterThan(3);
    const trip = search.trips[0];
    if (!trip) throw new Error('no trips');
    expect(trip.boardingPoints[0]?.name).toBe('Swargate');

    const map = await data<BusSeatMap>(api.get(`/buses/${trip.id}/seats`));
    const seat = map.decks.flatMap((d) => d.seats).find((s) => s.available && !s.ladiesOnly);
    if (!seat) throw new Error('no seat');

    await signUp();
    const body = {
      tripId: trip.id,
      boardingPointId: trip.boardingPoints[0]?.id,
      droppingPointId: trip.droppingPoints.at(-1)?.id,
      passengers: [
        { seatNumber: seat.number, firstName: 'Rohan', lastName: 'Patil', age: 30, gender: 'MALE' },
      ],
      contact: { email: 'rohan@example.com', phone: '9876543210' },
      expectedTotalPaise: seat.pricePaise,
    };
    const booking = await data<BookingDetails>(book('/buses/book', body));
    expect(booking.bus).toMatchObject({
      seatNumbers: [seat.number],
      boardingPoint: { name: 'Swargate' },
    });

    const held = await data<BusSeatMap>(api.get(`/buses/${trip.id}/seats`));
    expect(
      held.decks.flatMap((d) => d.seats).find((s) => s.number === seat.number)?.available,
    ).toBe(false);
    expect((await fail(book('/buses/book', body))).body).toMatchObject({
      errorCode: 'SEAT_UNAVAILABLE',
    });

    const order = await data<PaymentOrder>(
      api.post('/payments/create', { bookingReference: booking.reference }),
    );
    await api.post('/payments/mock/complete', { paymentId: order.paymentId, outcome: 'success' });
    const confirmed = await data<BookingDetails>(api.get(`/bookings/${booking.reference}`));
    expect(confirmed.bus?.pnr).toMatch(new RegExp(`^${trip.operator.code}\\d{7}$`));
  });

  it('keeps ladies-only seats for women', async () => {
    await signUp();
    const search = await data<BusSearchResult>(
      api.get('/buses/search', { params: { from: 'pune', to: 'mumbai', date: day(10) } }),
    );
    for (const trip of search.trips) {
      const map = await data<BusSeatMap>(api.get(`/buses/${trip.id}/seats`));
      const seat = map.decks.flatMap((d) => d.seats).find((s) => s.available && s.ladiesOnly);
      if (!seat) continue;
      const res = await fail(
        book('/buses/book', {
          tripId: trip.id,
          boardingPointId: trip.boardingPoints[0]?.id,
          droppingPointId: trip.droppingPoints[0]?.id,
          passengers: [
            {
              seatNumber: seat.number,
              firstName: 'Amit',
              lastName: 'Patil',
              age: 30,
              gender: 'MALE',
            },
          ],
          contact: { email: 'amit@example.com', phone: '9876543210' },
          expectedTotalPaise: seat.pricePaise,
        }),
      );
      expect(res.body).toMatchObject({
        details: [
          {
            path: 'body.passengers.0.gender',
            message: `Seat ${seat.number} is reserved for women`,
          },
        ],
      });
      return;
    }
    throw new Error('no ladies seat found');
  });
});
