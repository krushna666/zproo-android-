import { freeCancellationDeadline, hotelPlansInCity, hotelPriceBreakdown } from '@zproo/catalog';
import type {
  BookingDetails,
  HotelDetails,
  HotelRate,
  HotelRoomType,
  HotelRoomsResponse,
  HotelSearchResponse,
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
const addDays = (iso: string, n: number) =>
  new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

const CHECK_IN = daysAhead(20);
const CHECK_OUT = addDays(CHECK_IN, 3);
const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

function search(
  ctx: Ctx,
  query: Record<string, string> = {},
  headers: Record<string, string> = {},
) {
  return request(ctx.app)
    .get('/api/hotels/search')
    .set(headers)
    .query({
      destinationId: 'city_GOI',
      checkIn: CHECK_IN,
      checkOut: CHECK_OUT,
      rooms: '2-0',
      ...query,
    });
}

async function rooms(
  ctx: Ctx,
  hotelId: string,
  stay: { checkIn: string; checkOut: string } = { checkIn: CHECK_IN, checkOut: CHECK_OUT },
): Promise<HotelRoomsResponse> {
  return (
    await request(ctx.app)
      .get(`/api/hotels/${hotelId}/rooms`)
      .query({ ...stay, rooms: '2-0' })
      .expect(200)
  ).body.data as HotelRoomsResponse;
}

interface Pick {
  hotelId: string;
  roomType: HotelRoomType;
  rate: HotelRate;
}

/** A Goa hotel with a room type that has `n` free rooms and a rate matching `rate`. */
async function pickRoom(
  ctx: Ctx,
  options: {
    n?: number;
    refundable?: boolean;
    hotelId?: string;
    stay?: { checkIn: string; checkOut: string };
  } = {},
): Promise<Pick> {
  const n = options.n ?? 1;
  const candidates = options.hotelId
    ? [options.hotelId]
    : (
        (await search(ctx, { sort: 'popularity', pageSize: '30' }).expect(200)).body
          .data as HotelSearchResponse
      ).hotels.map((h) => h.hotelId);
  for (const hotelId of candidates) {
    const list = await rooms(ctx, hotelId, options.stay);
    for (const roomType of list.roomTypes) {
      const rate = roomType.rates.find(
        (r) =>
          r.roomsLeft >= n &&
          (options.refundable === undefined || r.refundable === options.refundable),
      );
      if (rate && roomType.maxAdults >= 2) return { hotelId, roomType, rate };
    }
  }
  throw new Error('No room found');
}

const guest = (firstName = 'Amit') => ({ title: 'MR', firstName, lastName: 'Sharma' });

function bookBody(
  pick: Pick,
  options: {
    count?: number;
    adults?: number;
    childAges?: number[];
    expectedTotal?: number;
    stay?: { checkIn: string; checkOut: string };
    extra?: Record<string, unknown>;
  } = {},
) {
  const count = options.count ?? 1;
  const nights = pick.rate.nightlyBreakdown.length;
  return {
    hotelId: pick.hotelId,
    checkIn: options.stay?.checkIn ?? CHECK_IN,
    checkOut: options.stay?.checkOut ?? CHECK_OUT,
    rooms: Array.from({ length: count }, (_, i) => ({
      roomTypeId: pick.roomType.roomTypeId,
      rateId: pick.rate.rateId,
      adults: options.adults ?? 2,
      childAges: options.childAges ?? [],
      leadGuest: guest(['Amit', 'Priya', 'Kabir'][i] ?? 'Amit'),
    })),
    contact: { email: 'amit@example.com', mobile: '9876543210' },
    expectedTotal:
      options.expectedTotal ??
      hotelPriceBreakdown(
        Array.from({ length: count }, () => ({
          price: pick.rate.totalPrice,
          taxes: pick.rate.taxes,
        })),
        nights,
      ).totalPaise,
    ...options.extra,
  };
}

function book(ctx: Ctx, token: string, body: object, headers: Record<string, string> = {}) {
  return request(ctx.app)
    .post('/api/hotels/book')
    .set(bearer(token))
    .set('Idempotency-Key', headers['Idempotency-Key'] ?? crypto.randomUUID())
    .set(headers)
    .send(body);
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

describe('GET /api/hotels/destinations', () => {
  it('suggests cities, areas and hotels', async () => {
    const ctx = createTestContext();
    const res = await request(ctx.app).get('/api/hotels/destinations?q=goa').expect(200);
    expect(res.body.data[0]).toEqual({
      id: 'city_GOI',
      type: 'CITY',
      name: 'Goa',
      city: 'Goa',
      state: 'Goa',
    });
    const areas = await request(ctx.app).get('/api/hotels/destinations?q=calan').expect(200);
    expect(areas.body.data[0]).toMatchObject({ id: 'area_GOI_calangute', type: 'AREA' });
  });

  it('rejects markup in the query', async () => {
    const ctx = createTestContext();
    await request(ctx.app).get('/api/hotels/destinations').query({ q: '<script>' }).expect(400);
  });
});

describe('GET /api/hotels/search', () => {
  it('returns the search contract with nights, totals, pages and facets', async () => {
    const ctx = createTestContext();
    const res = await search(ctx).expect(200);
    expect(res.headers['cache-control']).toBe('private, max-age=60');
    const data = res.body.data as HotelSearchResponse;
    expect(data).toMatchObject({
      searchId: expect.stringMatching(/^hsrch_[0-9a-f]{20}$/),
      destination: { id: 'city_GOI', name: 'Goa' },
      checkIn: CHECK_IN,
      checkOut: CHECK_OUT,
      nights: 3,
      rooms: [{ adults: 2, childAges: [] }],
      page: 1,
      pageSize: 20,
      demo: true,
    });
    expect(data.total).toBeGreaterThanOrEqual(40);
    expect(data.hotels).toHaveLength(20);
    const hotel = data.hotels[0];
    expect(hotel).toMatchObject({
      hotelId: expect.stringMatching(/^htl_GOI\d{3}$/),
      city: 'Goa',
      taxesIncluded: false,
      thumbnail: { url: expect.stringMatching(/^\/assets\/hotels\//), alt: expect.any(String) },
    });
    expect(hotel?.totalPrice).toBeGreaterThan(hotel?.pricePerNight ?? 0);
    expect(data.filters.priceMin).toBeLessThanOrEqual(data.filters.priceMax);
    expect(data.filters.areas.length).toBeGreaterThan(3);

    const page2 = (await search(ctx, { page: '2' }).expect(200)).body.data as HotelSearchResponse;
    expect(page2.hotels[0]?.hotelId).not.toBe(hotel?.hotelId);
  });

  it('filters and sorts on the server', async () => {
    const ctx = createTestContext();
    const filtered = (
      await search(ctx, { stars: '4', freeCancellation: '1', amenities: 'pool' }).expect(200)
    ).body.data as HotelSearchResponse;
    expect(filtered.total).toBeGreaterThan(0);
    for (const h of filtered.hotels) {
      expect(h.stars).toBe(4);
      expect(h.freeCancellation).toBe(true);
      expect(h.amenities).toContain('pool');
    }
    const cheap = (await search(ctx, { sort: 'price_asc' }).expect(200)).body
      .data as HotelSearchResponse;
    const prices = cheap.hotels.map((h) => h.pricePerNight);
    expect(prices).toEqual([...prices].sort((a, b) => a - b));
  });

  it.each([
    [{ checkOut: CHECK_IN }, 'Check-out must be after check-in'],
    [{ checkOut: addDays(CHECK_IN, 31) }, 'You can book up to 30 nights at a time'],
    [{ checkIn: daysAhead(-1), checkOut: daysAhead(1) }, "Check-in can't be in the past"],
    [{ rooms: '2-1' }, 'Add the age of each child'],
    [{ rooms: Array(9).fill('1-0').join('|') }, 'You can book up to 8 rooms at a time'],
    [{ rooms: '5-0' }, 'A room can have up to 4 adults'],
    [{ destinationId: 'city_ZZZ' }, 'Choose a destination'],
  ])('validates %o', async (query, message) => {
    const ctx = createTestContext();
    const res = await search(ctx, query).expect(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details.issues.map((i: { message: string }) => i.message)).toContain(
      message,
    );
  });

  it('allows 30 nights and counts nights across the year end', async () => {
    const ctx = createTestContext();
    await search(ctx, { checkOut: addDays(CHECK_IN, 30) }).expect(200);
    const today = daysAhead(0);
    let year = Number(today.slice(0, 4));
    if (`${year}-12-30` <= today) year += 1;
    const res = await search(ctx, { checkIn: `${year}-12-30`, checkOut: `${year + 1}-01-02` });
    expect(res.status).toBe(200);
    expect(res.body.data.nights).toBe(3);
  });

  it('honours the no_results and provider_down scenarios', async () => {
    const ctx = createTestContext();
    const empty = await search(ctx, {}, { 'X-Mock-Scenario': 'no_results' }).expect(200);
    expect(empty.body.data.hotels).toEqual([]);
    const down = await search(
      ctx,
      { checkIn: daysAhead(21) },
      { 'X-Mock-Scenario': 'provider_down' },
    );
    expect(down.status).toBe(502);
    expect(down.body.error.code).toBe('PROVIDER_ERROR');
  });
});

describe('hotel details and rooms', () => {
  it('returns details with a gallery, and live rooms that are never cached', async () => {
    const ctx = createTestContext();
    const details = (await request(ctx.app).get('/api/hotels/htl_GOI007').expect(200)).body
      .data as HotelDetails;
    expect(details.images.length).toBeGreaterThanOrEqual(5);
    expect(details.amenityGroups.map((g) => g.group)).toEqual(
      expect.arrayContaining(['General', 'Room', 'Accessibility']),
    );
    expect(details.houseRules.join(' ')).toContain('photo ID');

    const res = await request(ctx.app)
      .get('/api/hotels/htl_GOI007/rooms')
      .query({ checkIn: CHECK_IN, checkOut: CHECK_OUT, rooms: '2-0' })
      .expect(200);
    expect(res.headers['cache-control']).toBe('no-store');
    const data = res.body.data as HotelRoomsResponse;
    expect(data.nights).toBe(3);
    const rate = data.roomTypes[0]?.rates[0];
    expect(rate?.nightlyBreakdown).toHaveLength(3);
    expect(rate?.totalPrice).toBe(rate?.nightlyBreakdown.reduce((s, n) => s + n.price, 0));
    if (rate?.refundable)
      expect(rate.freeCancellationUntil).toBe(freeCancellationDeadline(CHECK_IN));
  });

  it('returns 404 for an unknown hotel and 400 for a malformed id', async () => {
    const ctx = createTestContext();
    await request(ctx.app).get('/api/hotels/htl_GOI999').expect(404);
    await request(ctx.app).get('/api/hotels/hotel-1').expect(400);
    await request(ctx.app)
      .get('/api/hotels/htl_GOI007/rooms')
      .query({ checkIn: CHECK_IN, checkOut: CHECK_IN, rooms: '2-0' })
      .expect(400);
  });
});

describe('POST /api/hotels/book', () => {
  it('requires sign-in and an Idempotency-Key', async () => {
    const ctx = createTestContext();
    await request(ctx.app).post('/api/hotels/book').send({}).expect(401);
    const { accessToken } = await signUp(ctx);
    const res = await request(ctx.app)
      .post('/api/hotels/book')
      .set(bearer(accessToken))
      .send({})
      .expect(400);
    expect(res.body.error.details.issues).toEqual([
      expect.objectContaining({ path: 'headers.idempotency-key' }),
    ]);
  });

  it('holds one room for 15 minutes and returns the server-side bill', async () => {
    const ctx = createTestContext();
    const { accessToken } = await signUp(ctx);
    const pick = await pickRoom(ctx);
    const body = bookBody(pick, {
      extra: {
        specialRequests: 'Late check-in <script>alert(1)</script>"><img src=x onerror=alert(1)>',
      },
    });
    const res = await book(ctx, accessToken, body).expect(201);
    expect(res.body.data).toMatchObject({
      bookingRef: expect.stringMatching(/^ZH[0-9A-HJKMNP-TV-Z]{10}$/),
      status: 'HELD',
      priceBreakdown: {
        totalPaise: body.expectedTotal,
        basePaise: pick.rate.totalPrice,
        taxesPaise: pick.rate.taxes,
      },
    });
    expect(res.body.data.priceBreakdown.lines[0]).toEqual({
      label: 'Room charges — 1 room × 3 nights',
      amountPaise: pick.rate.totalPrice,
    });
    const holdMs = Date.parse(res.body.data.holdExpiresAt) - Date.parse(res.body.data.serverNow);
    expect(Math.round(holdMs / 60_000)).toBe(15);

    const details = (
      await request(ctx.app)
        .get(`/api/bookings/${res.body.data.bookingRef}`)
        .set(bearer(accessToken))
        .expect(200)
    ).body.data as BookingDetails;
    expect(details).toMatchObject({
      serviceType: 'HOTEL',
      status: 'HELD',
      travelDate: CHECK_IN,
      hotel: {
        hotel: { hotelId: pick.hotelId },
        checkIn: CHECK_IN,
        checkOut: CHECK_OUT,
        nights: 3,
        confirmationNo: null,
        specialRequests: 'Late check-in ">',
        rooms: [
          {
            roomTypeId: pick.roomType.roomTypeId,
            rateId: pick.rate.rateId,
            boardBasis: pick.rate.boardBasis,
            refundable: pick.rate.refundable,
            freeCancellationUntil: pick.rate.freeCancellationUntil,
            leadGuest: guest(),
            price: pick.rate.totalPrice,
          },
        ],
      },
      passengers: [{ title: 'MR', firstName: 'Amit', lastName: 'Sharma' }],
    });
    // The room is gone for everyone else.
    const after = await rooms(ctx, pick.hotelId);
    const same = after.roomTypes.find((t) => t.roomTypeId === pick.roomType.roomTypeId);
    expect(same?.rates[0]?.roomsLeft).toBe(pick.rate.roomsLeft - 1);
  });

  it('books several rooms with children and bills them all', async () => {
    const ctx = createTestContext();
    const { accessToken } = await signUp(ctx);
    const pick = await pickRoom(ctx, { n: 2 });
    const childAges = pick.roomType.maxChildren > 0 ? [7] : [];
    const body = bookBody(pick, { count: 2, childAges });
    const res = await book(ctx, accessToken, body).expect(201);
    expect(res.body.data.priceBreakdown.totalPaise).toBe(body.expectedTotal);
    const detail = await prisma.hotelBookingRoom.findMany({ orderBy: { sequence: 'asc' } });
    expect(detail.map((r) => [r.adults, r.childAges])).toEqual([
      [2, childAges],
      [2, childAges],
    ]);
    expect(await prisma.hotelRoomHold.findFirst()).toMatchObject({ rooms: 2, active: true });
  });

  it('replays a retried key and refuses the key with another body', async () => {
    const ctx = createTestContext();
    const { accessToken } = await signUp(ctx);
    const pick = await pickRoom(ctx, { n: 2 });
    const key = crypto.randomUUID();
    const first = await book(ctx, accessToken, bookBody(pick), { 'Idempotency-Key': key }).expect(
      201,
    );
    const again = await book(ctx, accessToken, bookBody(pick), { 'Idempotency-Key': key }).expect(
      201,
    );
    expect(again.headers['idempotent-replayed']).toBe('true');
    expect(again.body.data.bookingRef).toBe(first.body.data.bookingRef);
    const other = await book(ctx, accessToken, bookBody(pick, { count: 2 }), {
      'Idempotency-Key': key,
    }).expect(409);
    expect(other.body.error.code).toBe('IDEMPOTENCY_CONFLICT');
    expect(await prisma.booking.count()).toBe(1);
  });

  it('gives the last room to exactly one of two customers', async () => {
    const ctx = createTestContext();
    const scarce = hotelPlansInCity('GOI').find((p) => p.scarce);
    if (!scarce) throw new Error('No single-room hotel');
    const pick = await pickRoom(ctx, { hotelId: scarce.hotelId });
    expect(pick.rate.roomsLeft).toBe(1);
    const users = await Promise.all([signUp(ctx), signUp(ctx), signUp(ctx)]);
    const results = await Promise.all(users.map((u) => book(ctx, u.accessToken, bookBody(pick))));
    expect(results.map((r) => r.status).sort()).toEqual([201, 409, 409]);
    expect(results.find((r) => r.status === 409)?.body.error).toMatchObject({
      code: 'ROOM_UNAVAILABLE',
      message: 'This room just sold out. Please choose another room.',
      details: { roomTypeId: pick.roomType.roomTypeId },
    });
    expect(await prisma.hotelRoomHold.count({ where: { active: true } })).toBe(1);
  });

  it('refuses a price the server does not agree with, and the price_changed scenario', async () => {
    const ctx = createTestContext();
    const { accessToken } = await signUp(ctx);
    const pick = await pickRoom(ctx);
    const body = bookBody(pick);
    const wrong = await book(ctx, accessToken, {
      ...body,
      expectedTotal: body.expectedTotal - 100,
    }).expect(409);
    expect(wrong.body.error).toMatchObject({
      code: 'PRICE_CHANGED',
      details: { oldTotal: body.expectedTotal - 100, newTotal: body.expectedTotal },
    });
    const changed = await book(ctx, accessToken, body, {
      'X-Mock-Scenario': 'price_changed',
    }).expect(409);
    expect(changed.body.error.details.newTotal).toBeGreaterThan(body.expectedTotal);
    expect(await prisma.booking.count()).toBe(0);
  });

  it('honours room_sold_out with the room type in the error', async () => {
    const ctx = createTestContext();
    const { accessToken } = await signUp(ctx);
    const pick = await pickRoom(ctx);
    const res = await book(ctx, accessToken, bookBody(pick), {
      'X-Mock-Scenario': 'room_sold_out',
    }).expect(409);
    expect(res.body.error).toMatchObject({
      code: 'ROOM_UNAVAILABLE',
      details: { roomTypeId: pick.roomType.roomTypeId },
    });
    expect(await prisma.booking.count()).toBe(0);
  });

  it('checks occupancy against the room type, rates and names', async () => {
    const ctx = createTestContext();
    const { accessToken } = await signUp(ctx);
    const pick = await pickRoom(ctx);
    const max = pick.roomType.maxAdults;
    if (max < 4) {
      const over = await book(ctx, accessToken, bookBody(pick, { adults: max + 1 })).expect(400);
      expect(over.body.error.details.fields['rooms.0.adults']).toBe(
        `This room fits up to ${max} adults`,
      );
    }
    const badRate = bookBody(pick);
    badRate.rooms[0] = {
      ...(badRate.rooms[0] as (typeof badRate.rooms)[number]),
      rateId: 'rate_GOI999_1_ro',
    };
    await book(ctx, accessToken, badRate).expect(400);
    const xss = bookBody(pick);
    xss.rooms[0] = {
      ...(xss.rooms[0] as (typeof xss.rooms)[number]),
      leadGuest: { title: 'MR', firstName: '<img src=x onerror=alert(1)>', lastName: 'Sharma' },
    };
    const res = await book(ctx, accessToken, xss).expect(400);
    expect(res.body.error.details.fields['rooms.0.leadGuest.firstName']).toBe(
      'Enter the name as on your government ID',
    );
    await book(
      ctx,
      accessToken,
      bookBody(pick, { stay: { checkIn: CHECK_IN, checkOut: addDays(CHECK_IN, 31) } }),
    ).expect(400);
    expect(await prisma.booking.count()).toBe(0);
  });
});

describe('hotel payment, voucher, cancellation and expiry', () => {
  async function confirmed(ctx: Ctx, options: { refundable?: boolean } = {}) {
    const user = await signUp(ctx);
    const pick = await pickRoom(ctx, options);
    const body = bookBody(pick);
    const bookingRef = (await book(ctx, user.accessToken, body).expect(201)).body.data
      .bookingRef as string;
    await payWithMock(ctx, user.accessToken, bookingRef);
    return { user, pick, body, bookingRef };
  }

  it('confirms with the hotel, serves the voucher and lists the stay', async () => {
    const ctx = createTestContext();
    const { user, pick, body, bookingRef } = await confirmed(ctx);
    const auth = bearer(user.accessToken);
    const details = (
      await request(ctx.app).get(`/api/bookings/${bookingRef}`).set(auth).expect(200)
    ).body.data as BookingDetails;
    expect(details).toMatchObject({ status: 'CONFIRMED', paymentStatus: 'CAPTURED' });
    expect(details.hotel?.confirmationNo).toMatch(/^GOI\d{7}$/);
    expect(details.hotel?.supplierRef).toMatch(/^MB-[A-Z2-9]{8}$/);
    expect(await prisma.hotelRoomHold.findFirst()).toMatchObject({ active: true, expiresAt: null });

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
    expect((pdf.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');

    const list = await request(ctx.app).get('/api/bookings').set(auth).expect(200);
    expect(list.body.data).toEqual([
      expect.objectContaining({
        reference: bookingRef,
        serviceType: 'HOTEL',
        subtitle: '1 room · 3 nights',
        travelDate: CHECK_IN,
        totalPaise: body.expectedTotal,
      }),
    ]);
    expect(list.body.data[0].title).toBe(details.hotel?.hotel.name);
    expect(pick.hotelId).toBe(details.hotel?.hotel.hotelId);
  });

  it('refunds a refundable rate in full before the deadline, less the first night after it', async () => {
    const ctx = createTestContext();
    const { user, pick, body, bookingRef } = await confirmed(ctx, { refundable: true });
    const deadline = Date.parse(pick.rate.freeCancellationUntil ?? '');
    let cookie = user.cookie;
    const quoteAt = async (at: Date) => {
      const next = await tokenAt(ctx, cookie, at);
      cookie = next.cookie;
      return (
        await request(ctx.app)
          .get(`/api/bookings/${bookingRef}/cancellation`)
          .set(bearer(next.token))
          .set('X-Test-Now', at.toISOString())
          .expect(200)
      ).body.data;
    };
    expect(await quoteAt(new Date(deadline - 60_000))).toMatchObject({
      cancellable: true,
      refundAmount: body.expectedTotal,
    });
    const first = pick.rate.nightlyBreakdown[0]?.price ?? 0;
    // GST is charged in whole rupees per room-night.
    const firstNight = first + Math.round((first * (first <= 750_000 ? 5 : 18)) / 10_000) * 100;
    expect(await quoteAt(new Date(deadline + 60_000))).toMatchObject({
      cancellable: true,
      refundAmount: body.expectedTotal - firstNight,
    });
    const checkInDay = new Date(`${CHECK_IN}T00:30:00+05:30`);
    expect(await quoteAt(checkInDay)).toMatchObject({
      cancellable: false,
      reason: 'Cancellation is closed from the check-in date. Please contact the hotel.',
    });

    const res = await request(ctx.app)
      .post(`/api/hotels/${bookingRef}/cancel`)
      .set(bearer(user.accessToken))
      .expect(200);
    expect(res.body.data).toEqual({
      bookingRef,
      status: 'REFUND_PENDING',
      refundAmount: body.expectedTotal,
    });
    expect((await prisma.payment.findFirstOrThrow()).status).toBe('REFUNDED');
    expect(await prisma.hotelRoomHold.count({ where: { active: true } })).toBe(0);
  });

  it('shows and pays a ₹0 refund for a non-refundable rate', async () => {
    const ctx = createTestContext();
    const { user, bookingRef } = await confirmed(ctx, { refundable: false });
    const auth = bearer(user.accessToken);
    const quote = await request(ctx.app)
      .get(`/api/bookings/${bookingRef}/cancellation`)
      .set(auth)
      .expect(200);
    expect(quote.body.data).toMatchObject({ cancellable: true, refundAmount: 0 });
    const res = await request(ctx.app)
      .post(`/api/hotels/${bookingRef}/cancel`)
      .set(auth)
      .expect(200);
    expect(res.body.data).toEqual({ bookingRef, status: 'CANCELLED', refundAmount: 0 });
    // A hotel booking can't be cancelled through the bus endpoint.
    await request(ctx.app).post(`/api/buses/${bookingRef}/cancel`).set(auth).expect(404);
  });

  it('applies a hotel coupon to the stay', async () => {
    const ctx = createTestContext();
    const { accessToken } = await signUp(ctx);
    const pick = await pickRoom(ctx);
    const body = bookBody(pick);
    const bookingRef = (await book(ctx, accessToken, body).expect(201)).body.data
      .bookingRef as string;
    const res = await request(ctx.app)
      .post('/api/coupons/apply')
      .set(bearer(accessToken))
      .send({ bookingRef, code: 'STAY15' })
      .expect(200);
    const discount = Math.min(150_000, Math.floor((body.expectedTotal * 15) / 100));
    expect(res.body.data.coupon).toEqual({ code: 'STAY15', discountPaise: discount });
    expect(res.body.data.price.totalPaise).toBe(body.expectedTotal - discount);
    expect(res.body.data.price.lines.at(-1)).toEqual({
      label: 'Coupon STAY15',
      amountPaise: -discount,
    });
  });

  it('releases the rooms when the hold expires', async () => {
    const ctx = createTestContext();
    const { accessToken } = await signUp(ctx);
    const pick = await pickRoom(ctx);
    await book(ctx, accessToken, bookBody(pick)).expect(201);
    await prisma.booking.updateMany({ data: { holdExpiresAt: new Date(Date.now() - 1000) } });
    expect(await ctx.services.bookings.expireHolds()).toBe(1);
    expect(await prisma.hotelRoomHold.count({ where: { active: true } })).toBe(0);
    const after = await rooms(ctx, pick.hotelId);
    expect(
      after.roomTypes.find((t) => t.roomTypeId === pick.roomType.roomTypeId)?.rates[0]?.roomsLeft,
    ).toBe(pick.rate.roomsLeft);
  });

  it("hides other users' hotel bookings (403), but not from support", async () => {
    const ctx = createTestContext();
    const owner = await signUp(ctx);
    const pick = await pickRoom(ctx);
    const bookingRef = (await book(ctx, owner.accessToken, bookBody(pick)).expect(201)).body.data
      .bookingRef as string;
    const stranger = await signUp(ctx);
    const auth = bearer(stranger.accessToken);
    await request(ctx.app).get(`/api/bookings/${bookingRef}`).set(auth).expect(403);
    await request(ctx.app).post(`/api/hotels/${bookingRef}/cancel`).set(auth).expect(403);
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
  });
});
