import type {
  BookingDetails,
  BusSeat,
  BusSeatMap,
  BusSearchResponse,
  BusTripDetails,
  BusTripSummary,
} from '@zproo/types';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  createTestContext,
  grantRole,
  prisma,
  refreshCookie,
  resetUsers,
  signUp,
  withCsrf,
} from './helpers';
import { payWithMock } from './payments';

beforeEach(resetUsers);

type Ctx = ReturnType<typeof createTestContext>;

/** An IST calendar date `days` from now. */
function daysAhead(days: number): string {
  return new Date(Date.now() + 330 * 60_000 + days * 86_400_000).toISOString().slice(0, 10);
}

function search(ctx: Ctx, query: Record<string, string> = {}, headers: Record<string, string> = {}) {
  return request(ctx.app)
    .get('/api/buses/search')
    .set(headers)
    .query({ from: 'PNQ', to: 'BOM', date: daysAhead(10), ...query });
}

async function trips(ctx: Ctx, query: Record<string, string> = {}): Promise<BusTripSummary[]> {
  return ((await search(ctx, query).expect(200)).body.data as BusSearchResponse).trips;
}

async function tripDetails(ctx: Ctx, tripId: string): Promise<BusTripDetails> {
  return (await request(ctx.app).get(`/api/buses/${tripId}`).expect(200)).body
    .data as BusTripDetails;
}

async function seatMap(ctx: Ctx, tripId: string): Promise<BusSeatMap> {
  return (await request(ctx.app).get(`/api/buses/${tripId}/seats`).expect(200)).body
    .data as BusSeatMap;
}

const allSeats = (map: BusSeatMap) => map.decks.flatMap((d) => d.seats);
const openSeats = (map: BusSeatMap, ladies = false) =>
  allSeats(map).filter((s) => s.status === 'AVAILABLE' && s.ladiesOnly === ladies);
const totalOf = (seats: BusSeat[]) => seats.reduce((sum, s) => sum + s.price, 0);

/** A trip with at least `n` open general seats (Pune → Mumbai unless told otherwise). */
async function pickTrip(ctx: Ctx, n = 2, query: Record<string, string> = {}) {
  for (const summary of await trips(ctx, query)) {
    const map = await seatMap(ctx, summary.tripId);
    const seats = openSeats(map);
    if (seats.length >= n) {
      return { trip: await tripDetails(ctx, summary.tripId), map, seats: seats.slice(0, n) };
    }
  }
  throw new Error('No trip with enough seats');
}

const NAMES = ['Amit Sharma', 'Priya Sharma', 'Kabir Sharma', 'Neha Patil', 'Rohan Patil'];
const traveller = (seatNo: string, i = 0, gender: 'MALE' | 'FEMALE' = 'MALE') => ({
  seatNo,
  name: NAMES[i % NAMES.length] as string,
  age: 30 + i,
  gender,
});

interface BookOptions {
  key?: string;
  seats?: string[];
  travellers?: object[];
  expectedTotal?: number;
  boardingPointId?: string;
  droppingPointId?: string;
  headers?: Record<string, string>;
}

function book(ctx: Ctx, token: string, trip: BusTripDetails, seats: BusSeat[], o: BookOptions = {}) {
  const seatNos = o.seats ?? seats.map((s) => s.seatNo);
  return request(ctx.app)
    .post('/api/buses/book')
    .set('Authorization', `Bearer ${token}`)
    .set('Idempotency-Key', o.key ?? crypto.randomUUID())
    .set(o.headers ?? {})
    .send({
      tripId: trip.tripId,
      seats: seatNos,
      boardingPointId: o.boardingPointId ?? trip.boardingPoints[0]?.id,
      droppingPointId: o.droppingPointId ?? trip.droppingPoints.at(-1)?.id,
      travellers: o.travellers ?? seatNos.map((n, i) => traveller(n, i)),
      contact: { email: 'amit@example.com', mobile: '9876543210' },
      expectedTotal: o.expectedTotal ?? totalOf(seats),
    });
}

/** A fresh access token minted at `now` (the API clock moves with X-Test-Now in tests). */
async function tokenAt(ctx: Ctx, cookie: string, now: Date) {
  const res = await request(ctx.app)
    .post('/api/auth/refresh')
    .set(withCsrf(cookie))
    .set('X-Test-Now', now.toISOString())
    .expect(200);
  return { token: res.body.data.accessToken as string, cookie: refreshCookie(res) as string };
}

describe('GET /api/buses/cities', () => {
  it('suggests bus cities by name or code', async () => {
    const ctx = createTestContext();
    const res = await request(ctx.app).get('/api/buses/cities').query({ q: 'pun' }).expect(200);
    expect(res.body.data[0]).toEqual({ code: 'PNQ', name: 'Pune', state: 'Maharashtra', popular: true });
    const byCode = await request(ctx.app).get('/api/buses/cities').query({ q: 'bom' }).expect(200);
    expect(byCode.body.data.map((c: { code: string }) => c.code)).toContain('BOM');
  });

  it('rejects an empty or non-letter query', async () => {
    const ctx = createTestContext();
    await request(ctx.app).get('/api/buses/cities').query({ q: '' }).expect(400);
    await request(ctx.app).get('/api/buses/cities').query({ q: '<script>' }).expect(400);
  });
});

describe('GET /api/buses/search', () => {
  it('returns the search contract: trips in time order, filters and the server clock', async () => {
    const ctx = createTestContext();
    const res = await search(ctx).expect(200);
    expect(res.headers['cache-control']).toBe('private, max-age=60');
    const body = res.body.data as BusSearchResponse;
    expect(body).toMatchObject({ from: 'PNQ', to: 'BOM', date: daysAhead(10), demo: true });
    expect(body.searchId).toMatch(/^srch_[a-f0-9]{16,}$/);
    expect(Date.parse(body.serverNow)).not.toBeNaN();
    expect(body.trips.length).toBeGreaterThanOrEqual(10);
    const times = body.trips.map((t) => Date.parse(t.departure));
    expect(times).toEqual([...times].sort((a, b) => a - b));
    for (const t of body.trips) {
      expect(t.tripId).toMatch(/^trp_PNQ_BOM_\d{8}_\d{2}$/);
      expect(t).toMatchObject({
        from: { code: 'PNQ', name: 'Pune' },
        to: { code: 'BOM', name: 'Mumbai' },
        date: daysAhead(10),
      });
      expect(t.departure).toMatch(/\+05:30$/);
      expect(t.seatsLeft).toBeGreaterThan(0);
      expect(t.fromPrice).toBeGreaterThanOrEqual(59_900);
      expect(t.fromPrice).toBeLessThanOrEqual(289_900);
      expect(t.fromPrice % 100).toBe(0);
      expect(t.durationMin).toBe((Date.parse(t.arrival) - Date.parse(t.departure)) / 60_000);
    }
    const prices = body.trips.map((t) => t.fromPrice);
    expect(body.filters.priceMin).toBe(Math.min(...prices));
    expect(body.filters.priceMax).toBe(Math.max(...prices));
    expect(body.filters.operators.reduce((n, o) => n + o.count, 0)).toBe(body.trips.length);
  });

  it('is deterministic and accepts codes or slugs in any case', async () => {
    const ctx = createTestContext();
    const a = await trips(ctx);
    const b = await trips(ctx, { from: 'pune', to: 'Mumbai' });
    expect(b.map((t) => [t.tripId, t.fromPrice])).toEqual(a.map((t) => [t.tripId, t.fromPrice]));
  });

  it('covers routes across Maharashtra and beyond', async () => {
    const ctx = createTestContext();
    for (const [from, to] of [
      ['NAG', 'AMR'],
      ['KLH', 'GOI'],
      ['IXU', 'PNQ'],
      ['SAG', 'ISK'],
      ['BOM', 'BLR'],
    ] as const) {
      expect((await trips(ctx, { from, to })).length).toBeGreaterThan(0);
    }
  });

  it('returns an empty list for a route nobody runs', async () => {
    const ctx = createTestContext();
    expect(await trips(ctx, { from: 'AMR', to: 'GOI' })).toEqual([]);
  });

  it.each([
    [{ from: 'PNQ', to: 'PNQ' }, 'query.to', 'Choose different cities for From and To'],
    [{ from: 'XYZ' }, 'query.from', 'Choose a city'],
    [{ to: '' }, 'query.to', 'Choose a city'],
    [{ date: daysAhead(-1) }, 'query.date', 'Choose a date within the next 120 days'],
    [{ date: daysAhead(121) }, 'query.date', 'Choose a date within the next 120 days'],
    [{ date: '2026-02-30' }, 'query.date', undefined],
  ])('rejects %j', async (query, path, message) => {
    const ctx = createTestContext();
    const res = await search(ctx, query).expect(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining(message ? { path, message } : { path }),
      ]),
    );
  });

  it('rejects unknown query parameters', async () => {
    await search(createTestContext(), { sort: 'price' }).expect(400);
  });

  it('honours the no_results and provider_down scenarios', async () => {
    const ctx = createTestContext();
    const empty = await search(ctx, {}, { 'X-Mock-Scenario': 'no_results' }).expect(200);
    expect(empty.body.data.trips).toEqual([]);
    const down = await search(ctx, {}, { 'X-Mock-Scenario': 'provider_down' }).expect(502);
    expect(down.body.error.code).toBe('PROVIDER_ERROR');
  });
});

describe('trip details and seat map', () => {
  it('returns trip details and a seat map that agrees with the search', async () => {
    const ctx = createTestContext();
    const [summary] = await trips(ctx);
    if (!summary) throw new Error('no trips');
    const trip = await tripDetails(ctx, summary.tripId);
    expect(trip).toMatchObject({
      tripId: summary.tripId,
      serviceNumber: summary.serviceNumber,
      bookable: true,
      policies: { idProof: expect.any(String) },
    });
    expect(trip.boardingPoints[0]?.name).toBe('Swargate');
    expect(trip.boardingPoints).toHaveLength(summary.boardingCount);
    expect(trip.droppingPoints.at(-1)?.time).toBe(trip.arrival);
    expect(trip.photos.length).toBeGreaterThan(0);
    expect(trip.cancellationPolicy[0]).toEqual({ hoursBefore: 24, refundPercent: 90 });

    const res = await request(ctx.app).get(`/api/buses/${summary.tripId}/seats`).expect(200);
    expect(res.headers['cache-control']).toBe('no-store');
    const map = res.body.data as BusSeatMap;
    expect(map).toMatchObject({ tripId: summary.tripId, maxSelectable: 6, bookable: true });
    const open = allSeats(map).filter((s) => s.status === 'AVAILABLE');
    expect(open).toHaveLength(summary.seatsLeft);
    expect(Math.min(...open.map((s) => s.price))).toBe(summary.fromPrice);
    expect(allSeats(map).filter((s) => s.ladiesOnly && s.status === 'AVAILABLE').length).toBeLessThanOrEqual(
      allSeats(map).length,
    );
  });

  it('returns 404 for a well-formed but unknown trip and 400 for a malformed id', async () => {
    const ctx = createTestContext();
    const missing = await request(ctx.app).get('/api/buses/trp_PNQ_BOM_20300101_99/seats').expect(404);
    expect(missing.body.error.message).toBe('This bus is no longer available. Please search again.');
    await request(ctx.app).get('/api/buses/bs_nope/seats').expect(400);
  });
});

describe('POST /api/buses/book', () => {
  it('requires sign-in and an Idempotency-Key', async () => {
    const ctx = createTestContext();
    await request(ctx.app).post('/api/buses/book').send({}).expect(401);
    const { accessToken } = await signUp(ctx);
    const res = await request(ctx.app)
      .post('/api/buses/book')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({})
      .expect(400);
    expect(res.body.error.details.issues).toEqual([
      expect.objectContaining({ path: 'headers.idempotency-key' }),
    ]);
  });

  it('holds the seats and returns the server-side bill', async () => {
    const ctx = createTestContext();
    const { accessToken } = await signUp(ctx);
    const { trip, seats } = await pickTrip(ctx, 2);
    const res = await book(ctx, accessToken, trip, seats).expect(201);
    expect(res.body.data).toMatchObject({
      bookingRef: expect.stringMatching(/^ZB[0-9A-HJKMNP-TV-Z]{10}$/),
      status: 'HELD',
      priceBreakdown: { totalPaise: totalOf(seats), currency: 'INR' },
    });
    const holdMs = Date.parse(res.body.data.holdExpiresAt) - Date.parse(res.body.data.serverNow);
    expect(Math.round(holdMs / 60_000)).toBe(15);

    const details = await request(ctx.app)
      .get(`/api/bookings/${res.body.data.bookingRef}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(details.body.data as BookingDetails).toMatchObject({
      serviceType: 'BUS',
      status: 'HELD',
      contact: { email: 'amit@example.com', phone: '+919876543210' },
      bus: {
        seats: seats.map((s) => s.seatNo),
        boardingPoint: { name: 'Swargate' },
        trip: { tripId: trip.tripId },
        pnr: null,
      },
      passengers: [
        { firstName: 'Amit', lastName: 'Sharma', seatNumber: seats[0]?.seatNo, age: 30 },
        { firstName: 'Priya', seatNumber: seats[1]?.seatNo, age: 31 },
      ],
    });

    // The seats are gone for everyone else.
    const after = await seatMap(ctx, trip.tripId);
    for (const s of seats)
      expect(allSeats(after).find((x) => x.seatNo === s.seatNo)?.status).toBe('HELD');
    expect(await prisma.busSeatHold.count({ where: { active: true } })).toBe(2);
  });

  it('replays the same booking for a retried key and refuses the key with another body', async () => {
    const ctx = createTestContext();
    const { accessToken } = await signUp(ctx);
    const { trip, seats } = await pickTrip(ctx, 2);
    const key = crypto.randomUUID();
    const first = await book(ctx, accessToken, trip, seats.slice(0, 1), { key }).expect(201);
    const again = await book(ctx, accessToken, trip, seats.slice(0, 1), { key }).expect(201);
    expect(again.headers['idempotent-replayed']).toBe('true');
    expect(again.body.data.bookingRef).toBe(first.body.data.bookingRef);
    const other = await book(ctx, accessToken, trip, seats.slice(1), { key }).expect(409);
    expect(other.body.error.code).toBe('IDEMPOTENCY_CONFLICT');
    expect(await prisma.booking.count()).toBe(1);
  });

  it('never sells the same seat twice', async () => {
    const ctx = createTestContext();
    const { trip, seats } = await pickTrip(ctx, 1);
    const users = await Promise.all([signUp(ctx), signUp(ctx), signUp(ctx)]);
    const results = await Promise.all(users.map((u) => book(ctx, u.accessToken, trip, seats)));
    expect(results.map((r) => r.status).sort()).toEqual([201, 409, 409]);
    const loser = results.find((r) => r.status === 409);
    expect(loser?.body.error).toMatchObject({
      code: 'SEAT_UNAVAILABLE',
      details: { seats: [seats[0]?.seatNo] },
    });
    expect(await prisma.busSeatHold.count({ where: { active: true } })).toBe(1);
  });

  it('refuses a seat someone already holds', async () => {
    const ctx = createTestContext();
    const { trip, seats } = await pickTrip(ctx, 1);
    const a = await signUp(ctx);
    const b = await signUp(ctx);
    await book(ctx, a.accessToken, trip, seats).expect(201);
    const res = await book(ctx, b.accessToken, trip, seats).expect(409);
    expect(res.body.error.message).toBe(
      `Seat ${seats[0]?.seatNo} was just booked by someone else. Please choose another seat.`,
    );
  });

  it('refuses a price the server does not agree with, holding nothing', async () => {
    const ctx = createTestContext();
    const { accessToken } = await signUp(ctx);
    const { trip, seats } = await pickTrip(ctx, 1);
    const res = await book(ctx, accessToken, trip, seats, {
      expectedTotal: totalOf(seats) - 100,
    }).expect(409);
    expect(res.body.error).toMatchObject({
      code: 'PRICE_CHANGED',
      details: { oldTotal: totalOf(seats) - 100, newTotal: totalOf(seats) },
    });
    expect(await prisma.booking.count()).toBe(0);
  });

  it('honours the price_changed and seat_taken scenarios', async () => {
    const ctx = createTestContext();
    const { accessToken } = await signUp(ctx);
    const { trip, seats } = await pickTrip(ctx, 2);
    const changed = await book(ctx, accessToken, trip, seats.slice(0, 1), {
      headers: { 'X-Mock-Scenario': 'price_changed' },
    }).expect(409);
    expect(changed.body.error.details.newTotal).toBe(totalOf(seats.slice(0, 1)) + 15_000);

    const taken = await book(ctx, accessToken, trip, seats.slice(1), {
      headers: { 'X-Mock-Scenario': 'seat_taken' },
    }).expect(409);
    expect(taken.body.error.code).toBe('SEAT_UNAVAILABLE');
    expect(await prisma.booking.count()).toBe(0);
  });

  it('keeps ladies-only seats for women', async () => {
    const ctx = createTestContext();
    const { accessToken } = await signUp(ctx);
    for (const summary of await trips(ctx)) {
      const [seat] = openSeats(await seatMap(ctx, summary.tripId), true);
      if (!seat) continue;
      const trip = await tripDetails(ctx, summary.tripId);
      const male = await book(ctx, accessToken, trip, [seat]).expect(400);
      expect(male.body.error.details.issues).toEqual([
        { path: 'body.travellers.0.gender', message: 'This seat is reserved for women' },
      ]);
      await book(ctx, accessToken, trip, [seat], {
        travellers: [traveller(seat.seatNo, 1, 'FEMALE')],
      }).expect(201);
      return;
    }
    throw new Error('No open ladies-only seat found');
  });

  it('reserves the seat beside a woman for women', async () => {
    const ctx = createTestContext();
    const { accessToken } = await signUp(ctx);
    for (const summary of await trips(ctx)) {
      const map = await seatMap(ctx, summary.tripId);
      const seats = allSeats(map);
      const pair = openSeats(map).find((s) =>
        seats.some(
          (n) =>
            n.status === 'AVAILABLE' &&
            !n.ladiesOnly &&
            n.row === s.row &&
            Math.abs(n.col - s.col) === 1 &&
            map.decks.find((d) => d.seats.includes(n))?.seats.includes(s),
        ),
      );
      if (!pair) continue;
      const deck = map.decks.find((d) => d.seats.includes(pair)) as BusSeatMap['decks'][number];
      const neighbour = deck.seats.find(
        (n) => n.status === 'AVAILABLE' && n.row === pair.row && Math.abs(n.col - pair.col) === 1,
      ) as BusSeat;
      const trip = await tripDetails(ctx, summary.tripId);
      await book(ctx, accessToken, trip, [pair], {
        travellers: [traveller(pair.seatNo, 1, 'FEMALE')],
      }).expect(201);
      const after = allSeats(await seatMap(ctx, summary.tripId));
      expect(after.find((s) => s.seatNo === pair.seatNo)?.bookedByFemale).toBe(true);
      expect(after.find((s) => s.seatNo === neighbour.seatNo)?.ladiesOnly).toBe(true);
      const other = await signUp(ctx);
      await book(ctx, other.accessToken, trip, [neighbour]).expect(400);
      return;
    }
    throw new Error('No adjacent open pair found');
  });

  it('refuses tampered requests: 7 seats, unknown seats, points and duplicate seats', async () => {
    const ctx = createTestContext();
    const { accessToken } = await signUp(ctx);
    const { trip, seats } = await pickTrip(ctx, 7);

    const seven = await book(ctx, accessToken, trip, seats).expect(400);
    expect(seven.body.error.details.issues).toEqual(
      expect.arrayContaining([{ path: 'body.seats', message: 'You can select up to 6 seats' }]),
    );

    const one = seats.slice(0, 1);
    const ghost = await book(ctx, accessToken, trip, one, { seats: ['L99'] }).expect(400);
    expect(ghost.body.error.details.issues).toEqual(
      expect.arrayContaining([{ path: 'body.seats.0', message: "Seat L99 isn't on this bus" }]),
    );

    const point = await book(ctx, accessToken, trip, one, { boardingPointId: 'bp_99' }).expect(
      400,
    );
    expect(point.body.error.details.issues).toEqual([
      { path: 'body.boardingPointId', message: 'Choose a boarding point' },
    ]);

    const seatNo = one[0]?.seatNo as string;
    await book(ctx, accessToken, trip, one, {
      seats: [seatNo, seatNo],
      travellers: [traveller(seatNo, 0), traveller(seatNo, 1)],
    }).expect(400);

    const extra = await request(ctx.app)
      .post('/api/buses/book')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Idempotency-Key', crypto.randomUUID())
      .send({ tripId: trip.tripId, price: 1 })
      .expect(400);
    expect(extra.body.error.code).toBe('VALIDATION_ERROR');
    expect(await prisma.booking.count()).toBe(0);
  });

  it('closes sales 30 minutes before departure', async () => {
    const ctx = createTestContext();
    const user = await signUp(ctx);
    const { trip, seats } = await pickTrip(ctx, 1, { date: daysAhead(1) });
    const at = new Date(Date.parse(trip.departure) - 20 * 60_000);
    const { token } = await tokenAt(ctx, user.cookie, at);
    const res = await book(ctx, token, trip, seats, {
      headers: { 'X-Test-Now': at.toISOString() },
    }).expect(409);
    expect(res.body.error).toMatchObject({
      code: 'BOOKING_CLOSED',
      message: 'Booking for this bus has closed',
    });
    const map = await request(ctx.app)
      .get(`/api/buses/${trip.tripId}/seats`)
      .set('X-Test-Now', at.toISOString())
      .expect(200);
    expect(map.body.data.bookable).toBe(false);
  });
});

describe('bus payment, ticket, cancellation and expiry', () => {
  async function confirmedBooking(ctx: Ctx, n = 1) {
    const user = await signUp(ctx);
    const { trip, seats } = await pickTrip(ctx, n);
    const bookingRef = (await book(ctx, user.accessToken, trip, seats).expect(201)).body.data
      .bookingRef as string;
    await payWithMock(ctx, user.accessToken, bookingRef);
    return { user, trip, seats, bookingRef };
  }

  it('confirms on payment, issues a PNR and serves the e-ticket', async () => {
    const ctx = createTestContext();
    const { user, trip, seats, bookingRef } = await confirmedBooking(ctx);
    const auth = { Authorization: `Bearer ${user.accessToken}` };

    const details = await request(ctx.app).get(`/api/bookings/${bookingRef}`).set(auth).expect(200);
    expect(details.body.data).toMatchObject({ status: 'CONFIRMED', paymentStatus: 'CAPTURED' });
    expect(details.body.data.bus.pnr).toMatch(new RegExp(`^${trip.operator.code}\\d{7}$`));
    expect(await prisma.busSeatHold.findFirst()).toMatchObject({ active: true, expiresAt: null });

    const pdf = await request(ctx.app)
      .get(`/api/bookings/${bookingRef}/ticket.pdf`)
      .set(auth)
      .buffer(true)
      .parse((res, done) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => done(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect(pdf.headers['content-type']).toBe('application/pdf');
    expect((pdf.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');

    const list = await request(ctx.app).get('/api/bookings').set(auth).expect(200);
    expect(list.body.data).toEqual([
      expect.objectContaining({
        reference: bookingRef,
        serviceType: 'BUS',
        title: 'Pune → Mumbai',
        status: 'CONFIRMED',
        totalPaise: totalOf(seats),
      }),
    ]);
  });

  it('quotes the refund by tier and cancels with a 90% refund well before departure', async () => {
    const ctx = createTestContext();
    const { user, trip, seats, bookingRef } = await confirmedBooking(ctx, 2);
    const total = totalOf(seats);
    const departure = Date.parse(trip.departure);
    let cookie = user.cookie;
    const quoteAt = async (hoursBefore: number) => {
      const at = new Date(departure - hoursBefore * 3_600_000);
      const next = await tokenAt(ctx, cookie, at);
      cookie = next.cookie;
      return (
        await request(ctx.app)
          .get(`/api/bookings/${bookingRef}/cancellation`)
          .set('Authorization', `Bearer ${next.token}`)
          .set('X-Test-Now', at.toISOString())
          .expect(200)
      ).body.data;
    };
    expect(await quoteAt(13)).toMatchObject({ cancellable: true, refundPercent: 75 });
    expect(await quoteAt(6)).toMatchObject({
      refundPercent: 50,
      refundAmount: Math.floor(total / 2),
    });
    expect(await quoteAt(2)).toMatchObject({ cancellable: true, refundPercent: 0, refundAmount: 0 });
    expect(await quoteAt(-1)).toMatchObject({
      cancellable: false,
      reason: 'This bus has already departed.',
    });

    const auth = { Authorization: `Bearer ${user.accessToken}` };
    const res = await request(ctx.app).post(`/api/buses/${bookingRef}/cancel`).set(auth).expect(200);
    expect(res.body.data).toEqual({
      bookingRef,
      status: 'REFUND_PENDING',
      refundAmount: Math.floor((total * 90) / 100),
    });
    const payment = await prisma.payment.findFirstOrThrow();
    expect(payment.status).toBe('PARTIALLY_REFUNDED');
    // The seats are back on sale.
    const after = await seatMap(ctx, trip.tripId);
    for (const s of seats)
      expect(allSeats(after).find((x) => x.seatNo === s.seatNo)?.status).toBe('AVAILABLE');
    // A second cancel is refused.
    await request(ctx.app).post(`/api/buses/${bookingRef}/cancel`).set(auth).expect(409);
  });

  it('releases the seats when the hold expires', async () => {
    const ctx = createTestContext();
    const { accessToken } = await signUp(ctx);
    const { trip, seats } = await pickTrip(ctx, 2);
    await book(ctx, accessToken, trip, seats).expect(201);
    await prisma.booking.updateMany({ data: { holdExpiresAt: new Date(Date.now() - 1000) } });
    expect(await ctx.services.bookings.expireHolds()).toBe(1);
    expect(await prisma.busSeatHold.count({ where: { active: true } })).toBe(0);
    expect((await prisma.booking.findFirstOrThrow()).status).toBe('EXPIRED');
    const after = await seatMap(ctx, trip.tripId);
    for (const s of seats)
      expect(allSeats(after).find((x) => x.seatNo === s.seatNo)?.status).toBe('AVAILABLE');
    // The same seats can be booked again.
    await book(ctx, accessToken, trip, seats).expect(201);
  });

  it("hides other users' bus bookings (403), but not from support", async () => {
    const ctx = createTestContext();
    const owner = await signUp(ctx);
    const { trip, seats } = await pickTrip(ctx, 1);
    const bookingRef = (await book(ctx, owner.accessToken, trip, seats).expect(201)).body.data
      .bookingRef as string;
    const stranger = await signUp(ctx);
    const bearer = { Authorization: `Bearer ${stranger.accessToken}` };
    await request(ctx.app).get(`/api/bookings/${bookingRef}`).set(bearer).expect(403);
    await request(ctx.app).get(`/api/bookings/${bookingRef}/ticket.pdf`).set(bearer).expect(403);
    await request(ctx.app).post(`/api/buses/${bookingRef}/cancel`).set(bearer).expect(403);
    const agent = await signUp(ctx);
    await grantRole(agent.body.data.user.id, 'SUPPORT');
    const refreshed = await request(ctx.app)
      .post('/api/auth/refresh')
      .set(withCsrf(agent.cookie))
      .expect(200);
    await request(ctx.app)
      .get(`/api/bookings/${bookingRef}`)
      .set('Authorization', `Bearer ${refreshed.body.data.accessToken}`)
      .expect(200);
  });
});
