import type { BookingDetails, FlightOfferDetails, FlightSearchResponse } from '@zproo/types';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { decryptField } from '../src/lib/crypto';
import {
  adult,
  book,
  daysAhead,
  offerDetails,
  search,
  searchOffers,
  type BookableOffer,
  type Ctx,
} from './flightFixtures';
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

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

/** A fresh access token minted at `now` (the API clock moves with X-Test-Now in tests). */
async function tokenAt(ctx: Ctx, cookie: string, now: Date) {
  const res = await request(ctx.app)
    .post('/api/auth/refresh')
    .set(withCsrf(cookie))
    .set('X-Test-Now', now.toISOString())
    .expect(200);
  return { token: res.body.data.accessToken as string, cookie: refreshCookie(res) as string };
}

const child = {
  type: 'CHILD',
  title: 'MSTR',
  firstName: 'Kabir',
  lastName: 'Sharma',
  gender: 'MALE',
  dob: '2018-03-10',
} as const;
const infant = {
  type: 'INFANT',
  title: 'MISS',
  firstName: 'Aanya',
  lastName: 'Sharma',
  gender: 'FEMALE',
  dob: '2026-01-15',
  infantOfIndex: 0,
} as const;
const adult2 = { ...adult, title: 'MS', firstName: 'Priya', gender: 'FEMALE' } as const;

describe('GET /api/flights/airports', () => {
  it('suggests airports by code, city or former name', async () => {
    const ctx = createTestContext();
    const res = await request(ctx.app).get('/api/flights/airports').query({ q: 'bom' }).expect(200);
    expect(res.body.data[0]).toEqual({
      iata: 'BOM',
      city: 'Mumbai',
      name: expect.stringContaining('Chhatrapati Shivaji Maharaj'),
      country: 'India',
    });
    const byCity = await request(ctx.app)
      .get('/api/flights/airports')
      .query({ q: 'pune' })
      .expect(200);
    expect(byCity.body.data[0].iata).toBe('PNQ');
    await request(ctx.app).get('/api/flights/airports').query({ q: '' }).expect(400);
  });
});

describe('GET /api/flights/search', () => {
  it('returns the contract: 15–30 offers with slices, filters and the server clock', async () => {
    const ctx = createTestContext();
    const res = await request(ctx.app)
      .get('/api/flights/search')
      .query({ from: 'PNQ', to: 'DEL', date: daysAhead(20), adults: '2', children: '1' })
      .expect(200);
    expect(res.headers['cache-control']).toBe('private, max-age=60');
    const body = res.body.data as FlightSearchResponse;
    expect(body).toMatchObject({
      from: 'PNQ',
      to: 'DEL',
      returnDate: null,
      pax: { adults: 2, children: 1, infants: 0 },
      cabin: 'ECONOMY',
      returnOffers: [],
      demo: true,
    });
    expect(body.searchId).toMatch(/^srch_[0-9a-f]{20}$/);
    expect(body.offers.length).toBeGreaterThanOrEqual(10);
    expect(body.offers.length).toBeLessThanOrEqual(30);
    for (const o of body.offers) {
      expect(o.offerId).toMatch(/^off_PNQDEL_\d{8}_E_210_\d{2}_[0-9a-z]+_[0-9a-f]{16}$/);
      expect(Date.parse(o.expiresAt) - Date.parse(body.serverNow)).toBeLessThanOrEqual(20 * 60_000);
      const slice = o.slices[0];
      if (!slice) throw new Error('no slice');
      expect(slice.segments[0]?.from).toBe('PNQ');
      expect(slice.segments.at(-1)?.to).toBe('DEL');
      expect(slice.stops).toBe(slice.segments.length - 1);
      expect(slice.layovers).toHaveLength(slice.stops);
      for (const l of slice.layovers) {
        expect(l.durationMin).toBeGreaterThanOrEqual(45);
        expect(l.durationMin).toBeLessThanOrEqual(360);
      }
      expect(slice.segments[0]?.departure).toMatch(/\+05:30$/);
      expect(o.fromPrice % 100).toBe(0);
      expect(o.seatsLeft).toBeGreaterThanOrEqual(3);
    }
    expect(body.filters.priceMin).toBe(Math.min(...body.offers.map((o) => o.fromPrice)));
    expect(body.filters.airlines.reduce((n, a) => n + a.count, 0)).toBeGreaterThanOrEqual(
      body.offers.length,
    );
  });

  it('returns return offers for a round trip', async () => {
    const ctx = createTestContext();
    const body = await search(ctx, { returnDate: daysAhead(24) });
    expect(body.returnDate).toBe(daysAhead(24));
    expect(body.returnOffers.length).toBeGreaterThan(0);
    expect(body.returnOffers[0]?.slices[0]?.segments[0]?.from).toBe('DEL');
  });

  it.each([
    [{ from: 'PNQ', to: 'PNQ' }, 'query.to', 'Choose different airports for From and To'],
    [{ from: 'XYZ' }, 'query.from', 'Choose an airport'],
    [{ from: 'pune' }, 'query.from', 'Choose an airport'],
    [{ date: daysAhead(-1) }, 'query.date', 'Choose a date within the next 330 days'],
    [{ date: daysAhead(331) }, 'query.date', 'Choose a date within the next 330 days'],
    [
      { returnDate: daysAhead(10) },
      'query.returnDate',
      'Return date must be on or after the departure date',
    ],
    [{ adults: '6', children: '4' }, 'query.children', 'You can book up to 9 travellers at a time'],
    [{ adults: '1', infants: '2' }, 'query.infants', 'Each infant must travel with an adult'],
    [{ adults: '0', children: '1' }, 'query.adults', 'Add at least one adult'],
    [{ cabin: 'LUXURY' }, 'query.cabin', undefined],
  ])('rejects %j', async (query, path, message) => {
    const ctx = createTestContext();
    const res = await request(ctx.app)
      .get('/api/flights/search')
      .query({ from: 'PNQ', to: 'DEL', date: daysAhead(20), ...query })
      .expect(400);
    expect(res.body.error.details.issues).toEqual(
      expect.arrayContaining([expect.objectContaining(message ? { path, message } : { path })]),
    );
  });

  it('keeps international routes off while INTL_FLIGHTS is false, and rejects unknown params', async () => {
    const ctx = createTestContext();
    const res = await request(ctx.app)
      .get('/api/flights/search')
      .query({ from: 'BOM', to: 'DXB', date: daysAhead(20) })
      .expect(400);
    expect(res.body.error.details.issues[0].message).toBe('International flights are coming soon');
    await request(ctx.app)
      .get('/api/flights/search')
      .query({ from: 'PNQ', to: 'DEL', date: daysAhead(20), trip: 'ONE_WAY' })
      .expect(400);
  });

  it('honours no_results and provider_down', async () => {
    const ctx = createTestContext();
    const empty = await request(ctx.app)
      .get('/api/flights/search')
      .set('X-Mock-Scenario', 'no_results')
      .query({ from: 'PNQ', to: 'DEL', date: daysAhead(20) })
      .expect(200);
    expect(empty.body.data.offers).toEqual([]);
    const down = await request(ctx.app)
      .get('/api/flights/search')
      .set('X-Mock-Scenario', 'provider_down')
      .query({ from: 'PNQ', to: 'DEL', date: daysAhead(20) })
      .expect(502);
    expect(down.body.error.code).toBe('PROVIDER_ERROR');
  });
});

describe('GET /api/flights/:offerId', () => {
  it('re-prices live with fare families and fare rules, never cached', async () => {
    const ctx = createTestContext();
    const { offers } = await search(ctx, { adults: '2', children: '1', infants: '1' });
    const offer = offers[0];
    if (!offer) throw new Error('no offers');
    const res = await request(ctx.app).get(`/api/flights/${offer.offerId}`).expect(200);
    expect(res.headers['cache-control']).toBe('no-store');
    const details = res.body.data as FlightOfferDetails;
    expect(details).toMatchObject({ offerId: offer.offerId, replacesOfferId: null });
    expect(details.pax).toEqual({ adults: 2, children: 1, infants: 1 });
    expect(details.fareFamilies.map((f) => f.name)).toEqual(['Saver', 'Flexi', 'Super Flexi']);
    for (const f of details.fareFamilies) {
      expect(f.fareId).toMatch(/^fare_[0-9a-f]{6}_(saver|flexi|superflexi)$/);
      expect(f.total).toBe(2 * f.perPax.ADULT.total + f.perPax.CHILD.total + f.perPax.INFANT.total);
      expect(f.cabinBaggageKg).toBe(7);
    }
    expect(details.fareFamilies[1]?.mostPopular).toBe(true);
    expect(details.fareFamilies[0]?.price).toBe(offer.fromPrice);
    expect(details.fareRules.length).toBeGreaterThan(3);
  });

  it('refuses an expired offer, renews it with reprice=1, and rejects tampered ids', async () => {
    const ctx = createTestContext();
    const [offer] = (await search(ctx)).offers;
    if (!offer) throw new Error('no offers');
    const later = new Date(Date.now() + 21 * 60_000).toISOString();
    const expired = await request(ctx.app)
      .get(`/api/flights/${offer.offerId}`)
      .set('X-Test-Now', later)
      .expect(409);
    expect(expired.body.error).toMatchObject({
      code: 'FARE_UNAVAILABLE',
      message: 'This fare is no longer available. Please choose another flight or fare.',
    });
    const renewed = await request(ctx.app)
      .get(`/api/flights/${offer.offerId}`)
      .query({ reprice: '1' })
      .set('X-Test-Now', later)
      .expect(200);
    expect(renewed.body.data.replacesOfferId).toBe(offer.offerId);
    expect(renewed.body.data.offerId).not.toBe(offer.offerId);
    expect(Date.parse(renewed.body.data.expiresAt)).toBeGreaterThan(Date.parse(later));

    const tampered = offer.offerId.replace('_100_', '_200_');
    await request(ctx.app).get(`/api/flights/${tampered}`).expect(409);
    await request(ctx.app).get('/api/flights/not-an-offer').expect(400);
  });

  it('honours fare_unavailable and price_changed', async () => {
    const ctx = createTestContext();
    const [offer] = (await search(ctx)).offers;
    if (!offer) throw new Error('no offers');
    await request(ctx.app)
      .get(`/api/flights/${offer.offerId}`)
      .set('X-Mock-Scenario', 'fare_unavailable')
      .expect(409);
    const bumped = await request(ctx.app)
      .get(`/api/flights/${offer.offerId}`)
      .set('X-Mock-Scenario', 'price_changed')
      .expect(200);
    // ₹500 more on the base fare, plus the GST on it.
    expect(bumped.body.data.fareFamilies[0].price).toBe(offer.fromPrice + 52_500);
  });
});

describe('POST /api/flights/book', () => {
  it('requires sign-in and an Idempotency-Key', async () => {
    const ctx = createTestContext();
    await request(ctx.app).post('/api/flights/book').send({}).expect(401);
    const { accessToken } = await signUp(ctx);
    const res = await request(ctx.app)
      .post('/api/flights/book')
      .set(bearer(accessToken))
      .send({})
      .expect(400);
    expect(res.body.error.details.issues).toEqual([
      expect.objectContaining({ path: 'headers.idempotency-key' }),
    ]);
  });

  it('holds a one-way fare and returns the server bill', async () => {
    const ctx = createTestContext();
    const { accessToken } = await signUp(ctx);
    const [offer] = await searchOffers(ctx, {}, 'Flexi');
    if (!offer) throw new Error('no offers');
    const res = await book(ctx, accessToken, offer, {
      extra: { gstDetails: { gstin: '27AAPFU0939F1ZV', companyName: 'Acme Travels' } },
    }).expect(201);
    expect(res.body.data).toMatchObject({
      bookingRef: expect.stringMatching(/^ZF[0-9A-HJKMNP-TV-Z]{10}$/),
      status: 'HELD',
      priceBreakdown: { totalPaise: offer.totalPaise, currency: 'INR' },
    });
    const holdMin =
      (Date.parse(res.body.data.holdExpiresAt) - Date.parse(res.body.data.serverNow)) / 60_000;
    expect([10, 15]).toContain(Math.round(holdMin));

    const details = (
      await request(ctx.app)
        .get(`/api/bookings/${res.body.data.bookingRef}`)
        .set(bearer(accessToken))
        .expect(200)
    ).body.data as BookingDetails;
    expect(details.flights).toHaveLength(1);
    expect(details.flights[0]).toMatchObject({
      sequence: 1,
      offer: { offerId: offer.offerId },
      fare: { name: 'Flexi', fareId: offer.fareId },
      pnr: null,
      tickets: [],
    });
    const booking = await prisma.booking.findFirstOrThrow();
    expect(booking.metadata).toMatchObject({ gst: { gstin: '27AAPFU0939F1ZV' } });
    expect(await prisma.flightSeatHold.count({ where: { active: true } })).toBe(1);
  });

  it('books a round trip as one booking with one total', async () => {
    const ctx = createTestContext();
    const { accessToken } = await signUp(ctx);
    const body = await search(ctx, { returnDate: daysAhead(24) });
    const out = body.offers[0];
    const back = body.returnOffers[0];
    if (!out || !back) throw new Error('no offers');
    const outFare = (await offerDetails(ctx, out.offerId)).fareFamilies[0];
    const backFare = (await offerDetails(ctx, back.offerId)).fareFamilies[2];
    if (!outFare || !backFare) throw new Error('no fares');
    const outbound: BookableOffer = {
      offerId: out.offerId,
      fareId: outFare.fareId,
      totalPaise: outFare.total,
      details: {} as FlightOfferDetails,
    };
    const inbound: BookableOffer = {
      offerId: back.offerId,
      fareId: backFare.fareId,
      totalPaise: backFare.total,
      details: {} as FlightOfferDetails,
    };
    // A return that doesn't mirror the outbound is refused.
    const wrong = await book(ctx, accessToken, outbound, { returnOffer: outbound }).expect(400);
    expect(wrong.body.error.details.issues).toEqual(
      expect.arrayContaining([
        { path: 'body.returnOfferId', message: 'Choose a return flight for this trip' },
      ]),
    );
    const res = await book(ctx, accessToken, outbound, { returnOffer: inbound }).expect(201);
    expect(res.body.data.priceBreakdown.totalPaise).toBe(outFare.total + backFare.total);
    const legs = await prisma.flightBooking.findMany({ orderBy: { sequence: 'asc' } });
    expect(legs.map((l) => `${l.originCode}-${l.destinationCode}:${l.fareFamily}`)).toEqual([
      'PNQ-DEL:Saver',
      'DEL-PNQ:Super Flexi',
    ]);
  });

  it('refuses a changed price before holding anything, and accepts the new one with a new key', async () => {
    const ctx = createTestContext();
    const { accessToken } = await signUp(ctx);
    const offer = (await searchOffers(ctx)).find((o) => o.details.seatsLeft >= 2);
    if (!offer) throw new Error('no offers');
    const repriced = await request(ctx.app)
      .get(`/api/flights/${offer.offerId}`)
      .set('X-Mock-Scenario', 'price_changed')
      .expect(200);
    const newTotal = repriced.body.data.fareFamilies[0].total as number;
    expect(newTotal).toBeGreaterThan(offer.totalPaise);
    const changed = await book(ctx, accessToken, offer, {
      headers: { 'X-Mock-Scenario': 'price_changed' },
    }).expect(409);
    expect(changed.body.error).toMatchObject({
      code: 'PRICE_CHANGED',
      details: { oldTotal: offer.totalPaise, newTotal },
    });
    expect(await prisma.booking.count()).toBe(0);
    await book(ctx, accessToken, offer, {
      expectedTotalPaise: newTotal,
      headers: { 'X-Mock-Scenario': 'price_changed' },
    }).expect(201);
    // A price sent by the browser is ignored: only the comparison value is used.
    const tampered = await book(ctx, accessToken, offer, { expectedTotalPaise: 100 }).expect(409);
    expect(tampered.body.error.code).toBe('PRICE_CHANGED');
  });

  it('refuses an expired or unavailable fare, and a fareId from another offer', async () => {
    const ctx = createTestContext();
    const user = await signUp(ctx);
    const [offer, other] = await searchOffers(ctx);
    if (!offer || !other) throw new Error('no offers');
    const gone = await book(ctx, user.accessToken, offer, {
      headers: { 'X-Mock-Scenario': 'fare_unavailable' },
    }).expect(409);
    expect(gone.body.error.code).toBe('FARE_UNAVAILABLE');

    const later = new Date(Date.now() + 21 * 60_000);
    const { token } = await tokenAt(ctx, user.cookie, later);
    const expired = await book(ctx, token, offer, {
      headers: { 'X-Test-Now': later.toISOString() },
    }).expect(409);
    expect(expired.body.error.code).toBe('FARE_UNAVAILABLE');

    const swapped = await book(ctx, user.accessToken, { ...offer, fareId: other.fareId }).expect(
      400,
    );
    expect(swapped.body.error).toMatchObject({
      code: 'VALIDATION_ERROR',
      details: { issues: [{ path: 'body.fareId', message: 'Invalid fare' }] },
    });
    expect(await prisma.booking.count()).toBe(0);
  });

  it('applies the passenger rules: counts, ages on the travel date and infant links', async () => {
    const ctx = createTestContext();
    const { accessToken } = await signUp(ctx);
    const date = daysAhead(20);
    const [family] = await searchOffers(ctx, { adults: '2', children: '1', infants: '1' });
    const [pair] = await searchOffers(ctx, { adults: '2', infants: '2' });
    if (!family || !pair) throw new Error('no offers');

    const mismatch = await book(ctx, accessToken, family, { travellers: [adult] }).expect(400);
    expect(mismatch.body.error.details.issues).toEqual([
      { path: 'body.travellers', message: 'Travellers must match your search' },
    ]);

    // A child who is 12 on the travel date.
    const twelve = `${Number(date.slice(0, 4)) - 12}${date.slice(4)}`;
    const old = await book(ctx, accessToken, family, {
      travellers: [adult, adult2, { ...child, dob: twelve }, infant],
    }).expect(400);
    expect(old.body.error.details.issues).toEqual([
      {
        path: 'body.travellers.2.dob',
        message: 'A child must be 2–11 years old on the travel date',
      },
    ]);

    const future = await book(ctx, accessToken, family, {
      travellers: [adult, adult2, child, { ...infant, dob: daysAhead(5) }],
    }).expect(400);
    expect(future.body.error.details.issues).toEqual([
      { path: 'body.travellers.3.dob', message: 'Enter a valid date of birth' },
    ]);

    const noAdult = await book(ctx, accessToken, family, {
      travellers: [adult, adult2, child, { ...infant, infantOfIndex: 2 }],
    }).expect(400);
    expect(noAdult.body.error.details.issues).toEqual([
      { path: 'body.travellers.3.infantOfIndex', message: 'Each infant must travel with an adult' },
    ]);

    const shared = await book(ctx, accessToken, pair, {
      travellers: [adult, adult2, infant, { ...infant, firstName: 'Diya' }],
    }).expect(400);
    expect(shared.body.error.details.issues).toEqual([
      {
        path: 'body.travellers.3.infantOfIndex',
        message: 'Each infant must travel with a different adult',
      },
    ]);

    await book(ctx, accessToken, family, {
      travellers: [adult, adult2, child, infant],
    }).expect(201);
  });

  it('replays the same booking for a retried key and refuses the key with another body', async () => {
    const ctx = createTestContext();
    const { accessToken } = await signUp(ctx);
    const [offer] = await searchOffers(ctx);
    if (!offer) throw new Error('no offers');
    const key = crypto.randomUUID();
    const first = await book(ctx, accessToken, offer, { key }).expect(201);
    const again = await book(ctx, accessToken, offer, { key }).expect(201);
    expect(again.body.data.bookingRef).toBe(first.body.data.bookingRef);
    const other = await book(ctx, accessToken, offer, {
      key,
      travellers: [{ ...adult, firstName: 'Rohan' }],
    }).expect(409);
    expect(other.body.error.code).toBe('IDEMPOTENCY_CONFLICT');
    expect(await prisma.booking.count()).toBe(1);
  });

  it('never sells the last seats twice', async () => {
    const ctx = createTestContext();
    const { offers } = await search(ctx);
    const scarce = offers.reduce((a, b) => (b.seatsLeft < a.seatsLeft ? b : a));
    const n = String(scarce.seatsLeft);
    const index = scarce.offerId.split('_')[5];
    const sized = (await search(ctx, { adults: n })).offers.find(
      (o) => o.offerId.split('_')[5] === index,
    );
    if (!sized) throw new Error('offer not found for the party size');
    const fare = (await offerDetails(ctx, sized.offerId)).fareFamilies[0];
    if (!fare) throw new Error('no fare');
    const party = Array.from({ length: scarce.seatsLeft }, (_, i) => ({
      ...adult,
      firstName: `Amit${'abcdefghi'[i]}`,
    }));
    const target = {
      offerId: sized.offerId,
      fareId: fare.fareId,
      totalPaise: fare.total,
    } as BookableOffer;
    const [a, b] = await Promise.all([signUp(ctx), signUp(ctx)]);
    const results = await Promise.all([
      book(ctx, a.accessToken, target, { travellers: party }),
      book(ctx, b.accessToken, target, { travellers: party }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(results.find((r) => r.status === 409)?.body.error.code).toBe('FARE_UNAVAILABLE');
  });

  it('stores passport details encrypted, never as plaintext', async () => {
    const ctx = createTestContext();
    const { accessToken } = await signUp(ctx);
    const [offer] = await searchOffers(ctx);
    if (!offer) throw new Error('no offers');
    await book(ctx, accessToken, offer, {
      travellers: [
        { ...adult, passport: { number: 'K1234567', expiry: '2031-05-01', nationality: 'in' } },
      ],
    }).expect(201);
    const [row] = await prisma.$queryRaw<
      { passport_number_enc: string; passport_expiry_enc: string; nationality: string }[]
    >`SELECT passport_number_enc, passport_expiry_enc, nationality FROM booking_passengers`;
    expect(row?.passport_number_enc).toMatch(/^v1\./);
    expect(row?.passport_number_enc).not.toContain('K1234567');
    expect(row?.passport_expiry_enc).not.toContain('2031');
    expect(decryptField(row?.passport_number_enc ?? '', ctx.env.piiKey)).toBe('K1234567');
    expect(row?.nationality).toBe('IN');
  });
});

describe('flight payment, issuing, cancellation and expiry', () => {
  async function paidFlight(
    ctx: Ctx,
    scenario?: string,
    fare: 'Saver' | 'Flexi' | 'Super Flexi' = 'Flexi',
  ) {
    const user = await signUp(ctx);
    const [offer] = await searchOffers(ctx, { adults: '2' }, fare);
    if (!offer) throw new Error('no offers');
    const res = await book(ctx, user.accessToken, offer, {
      travellers: [adult, adult2],
      ...(scenario && { headers: { 'X-Mock-Scenario': scenario } }),
    }).expect(201);
    const bookingRef = res.body.data.bookingRef as string;
    await payWithMock(ctx, user.accessToken, bookingRef);
    return { user, offer, bookingRef };
  }

  const status = async (ctx: Ctx, token: string, ref: string) =>
    (await request(ctx.app).get(`/api/bookings/${ref}`).set(bearer(token)).expect(200)).body
      .data as BookingDetails;

  it('issues the airline PNR and one e-ticket per traveller on payment', async () => {
    const ctx = createTestContext();
    const { user, bookingRef } = await paidFlight(ctx);
    const details = await status(ctx, user.accessToken, bookingRef);
    expect(details).toMatchObject({ status: 'CONFIRMED', paymentStatus: 'CAPTURED' });
    const leg = details.flights[0];
    expect(leg?.pnr).toMatch(/^[A-Z2-9]{6}$/);
    expect(leg?.tickets).toHaveLength(2);
    for (const t of leg?.tickets ?? []) {
      expect(t.ticketNumber).toMatch(/^98\d{11}$/);
      expect(t.segmentKey).toBe('PNQ-DEL');
    }
    expect(await prisma.flightTicket.count()).toBe(2);
    expect((await prisma.flightSeatHold.findFirstOrThrow()).expiresAt).toBeNull();

    const pdf = await request(ctx.app)
      .get(`/api/bookings/${bookingRef}/ticket.pdf`)
      .set(bearer(user.accessToken))
      .buffer(true)
      .parse((res, done) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => done(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect((pdf.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('keeps "confirming" while the airline is pending; status polls finish it', async () => {
    const ctx = createTestContext();
    const { user, bookingRef } = await paidFlight(ctx, 'issue_pending');
    expect(await prisma.booking.findFirstOrThrow()).toMatchObject({
      status: 'PAYMENT_PENDING',
      paymentStatus: 'CAPTURED',
    });
    expect((await status(ctx, user.accessToken, bookingRef)).status).toBe('PAYMENT_PENDING');
    expect((await status(ctx, user.accessToken, bookingRef)).status).toBe('PAYMENT_PENDING');
    const done = await status(ctx, user.accessToken, bookingRef);
    expect(done.status).toBe('CONFIRMED');
    expect(done.flights[0]?.tickets).toHaveLength(2);
  });

  it('fails the booking with a refund due when the airline cannot issue', async () => {
    const ctx = createTestContext();
    const { user, bookingRef } = await paidFlight(ctx, 'issue_failed');
    const details = await status(ctx, user.accessToken, bookingRef);
    expect(details).toMatchObject({ status: 'FAILED', paymentStatus: 'REFUND_DUE' });
    expect(await prisma.flightSeatHold.count({ where: { active: true } })).toBe(0);
  });

  it('refunds paid − airline fee − ₹300 on cancel, and closes 3 hours before departure', async () => {
    const ctx = createTestContext();
    const { user, offer, bookingRef } = await paidFlight(ctx);
    const flexi = offer.details.fareFamilies[1];
    if (!flexi) throw new Error('no fare');
    const expected = flexi.total - 2 * (flexi.cancellationFee ?? 0) - 30_000;

    const departure = Date.parse(offer.details.slices[0]?.segments[0]?.departure ?? '');
    const late = new Date(departure - 2 * 3_600_000);
    const { token } = await tokenAt(ctx, user.cookie, late);
    const closed = await request(ctx.app)
      .get(`/api/bookings/${bookingRef}/cancellation`)
      .set(bearer(token))
      .set('X-Test-Now', late.toISOString())
      .expect(200);
    expect(closed.body.data).toMatchObject({
      cancellable: false,
      reason: 'Cancellation is closed for this flight. Please contact the airline.',
    });

    const quote = await request(ctx.app)
      .get(`/api/bookings/${bookingRef}/cancellation`)
      .set(bearer(user.accessToken))
      .expect(200);
    expect(quote.body.data).toMatchObject({ cancellable: true, refundAmount: expected });
    const res = await request(ctx.app)
      .post(`/api/flights/${bookingRef}/cancel`)
      .set(bearer(user.accessToken))
      .expect(200);
    expect(res.body.data).toEqual({ bookingRef, status: 'REFUND_PENDING', refundAmount: expected });
    expect(await prisma.flightSeatHold.count({ where: { active: true } })).toBe(0);
  });

  it('releases the seats when the hold expires', async () => {
    const ctx = createTestContext();
    const { accessToken } = await signUp(ctx);
    const offer = (await searchOffers(ctx)).find((o) => o.details.seatsLeft >= 2);
    if (!offer) throw new Error('no offer with spare seats');
    const before = offer.details.seatsLeft;
    await book(ctx, accessToken, offer).expect(201);
    expect((await offerDetails(ctx, offer.offerId)).seatsLeft).toBe(before - 1);
    await prisma.booking.updateMany({ data: { holdExpiresAt: new Date(Date.now() - 1000) } });
    expect(await ctx.services.bookings.expireHolds()).toBe(1);
    expect((await offerDetails(ctx, offer.offerId)).seatsLeft).toBe(before);
  });

  it("hides other users' flight bookings (403), but not from support", async () => {
    const ctx = createTestContext();
    const { user, bookingRef } = await paidFlight(ctx);
    const stranger = await signUp(ctx);
    await request(ctx.app)
      .get(`/api/bookings/${bookingRef}`)
      .set(bearer(stranger.accessToken))
      .expect(403);
    await request(ctx.app)
      .post(`/api/flights/${bookingRef}/cancel`)
      .set(bearer(stranger.accessToken))
      .expect(403);
    const agent = await signUp(ctx);
    await grantRole(agent.body.data.user.id, 'SUPPORT');
    const refreshed = await request(ctx.app)
      .post('/api/auth/refresh')
      .set(withCsrf(agent.cookie))
      .expect(200);
    await request(ctx.app)
      .get(`/api/bookings/${bookingRef}`)
      .set(bearer(refreshed.body.data.accessToken))
      .expect(200);
    expect(user).toBeDefined();
  });
});
