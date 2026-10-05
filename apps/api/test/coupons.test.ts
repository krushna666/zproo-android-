import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { bookedFlight } from './flightFixtures';
import { createTestContext, prisma, resetUsers, signUp } from './helpers';
import { createOrder, payWithMock } from './payments';

beforeEach(async () => {
  await resetUsers();
  await prisma.coupon.deleteMany({ where: { code: { startsWith: 'TEST' } } });
});

type Ctx = ReturnType<typeof createTestContext>;
const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

const apply = (ctx: Ctx, token: string, bookingRef: string, code: string) =>
  request(ctx.app).post('/api/coupons/apply').set(bearer(token)).send({ bookingRef, code });

async function coupon(data: Partial<Parameters<typeof prisma.coupon.create>[0]['data']> = {}) {
  return prisma.coupon.create({
    data: {
      code: `TEST${Math.floor(Math.random() * 1e6)}`,
      description: 'Test coupon',
      discountType: 'FLAT',
      value: 10_000,
      startsAt: new Date(Date.now() - 86_400_000),
      endsAt: new Date(Date.now() + 86_400_000),
      ...data,
    },
  });
}

describe('coupons', () => {
  it('applies a coupon on the server and lowers the payable total', async () => {
    const ctx = createTestContext();
    const { user, reference } = await bookedFlight(ctx);
    const before = await prisma.booking.findFirstOrThrow();
    const res = await apply(ctx, user.accessToken, reference, 'zproofirst').expect(200);
    expect(res.body.data.coupon).toEqual({ code: 'ZPROOFIRST', discountPaise: 15_000 });
    expect(res.body.data.price.totalPaise).toBe(before.totalAmountPaise - 15_000);
    expect(res.body.data.price.lines.at(-1)).toEqual({
      label: 'Coupon ZPROOFIRST',
      amountPaise: -15_000,
    });
    // The payment order is for the discounted total.
    const order = await createOrder(ctx, user.accessToken, reference);
    expect(order.body.data.amount).toBe(before.totalAmountPaise - 15_000);
  });

  it('recomputes on removal and replaces the open payment order', async () => {
    const ctx = createTestContext();
    const { user, reference } = await bookedFlight(ctx);
    const { totalAmountPaise } = await prisma.booking.findFirstOrThrow();
    const first = await createOrder(ctx, user.accessToken, reference);
    await apply(ctx, user.accessToken, reference, 'ZPROOFIRST').expect(200);
    const second = await createOrder(ctx, user.accessToken, reference);
    expect(second.body.data.orderId).not.toBe(first.body.data.orderId);
    const removed = await request(ctx.app)
      .post('/api/coupons/remove')
      .set(bearer(user.accessToken))
      .send({ bookingRef: reference })
      .expect(200);
    expect(removed.body.data.coupon).toBeNull();
    expect(removed.body.data.price.totalPaise).toBe(totalAmountPaise);
    await payWithMock(ctx, user.accessToken, reference);
    expect(await prisma.payment.findFirstOrThrow({ where: { status: 'CAPTURED' } })).toMatchObject({
      amountPaise: totalAmountPaise,
    });
  });

  it.each([
    ['expired', { endsAt: new Date(Date.now() - 1000) }],
    ['not_applicable', { serviceType: 'BUS' as const }],
    ['min_amount', { minAmountPaise: 100_000_000 }],
  ])('refuses with reason %s', async (reason, data) => {
    const ctx = createTestContext();
    const { user, reference } = await bookedFlight(ctx);
    const c = await coupon(data);
    const res = await apply(ctx, user.accessToken, reference, c.code).expect(422);
    expect(res.body.error).toMatchObject({
      code: 'COUPON_INVALID',
      message: "This coupon can't be used for this booking.",
      details: { reason },
    });
    expect((await prisma.booking.findFirstOrThrow()).discountAmountPaise).toBe(0);
  });

  it('refuses an unknown code as not applicable', async () => {
    const ctx = createTestContext();
    const { user, reference } = await bookedFlight(ctx);
    const res = await apply(ctx, user.accessToken, reference, 'NOSUCHCODE').expect(422);
    expect(res.body.error.details).toEqual({ reason: 'not_applicable' });
  });

  it('enforces the per-user limit across bookings, but frees it when a hold expires', async () => {
    const ctx = createTestContext();
    const first = await bookedFlight(ctx);
    const c = await coupon({ perUserLimit: 1 });
    await apply(ctx, first.user.accessToken, first.reference, c.code).expect(200);
    // Reapplying to the same booking is fine.
    await apply(ctx, first.user.accessToken, first.reference, c.code).expect(200);
    const second = await request(ctx.app)
      .post('/api/flights/book')
      .set(bearer(first.user.accessToken))
      .set('Idempotency-Key', crypto.randomUUID())
      .send((await secondBookingBody(ctx)) as object)
      .expect(201);
    const refused = await apply(ctx, first.user.accessToken, second.body.data.reference, c.code);
    expect(refused.status).toBe(422);
    expect(refused.body.error.details).toEqual({ reason: 'usage_limit' });

    await prisma.booking.update({
      where: { reference: first.reference },
      data: { holdExpiresAt: new Date(Date.now() - 1000) },
    });
    await ctx.services.bookings.expireHolds();
    await apply(ctx, first.user.accessToken, second.body.data.reference, c.code).expect(200);
  });

  it('enforces the total limit under concurrent applications', async () => {
    const ctx = createTestContext();
    const c = await coupon({ totalLimit: 1, perUserLimit: 5 });
    const bookings = await Promise.all([bookedFlight(ctx), bookedFlight(ctx), bookedFlight(ctx)]);
    const results = await Promise.all(
      bookings.map((b) => apply(ctx, b.user.accessToken, b.reference, c.code)),
    );
    expect(results.map((r) => r.status).sort()).toEqual([200, 422, 422]);
  });

  it("refuses another user's booking and bookings that are already paid", async () => {
    const ctx = createTestContext();
    const { user, reference } = await bookedFlight(ctx);
    const stranger = await signUp(ctx);
    await apply(ctx, stranger.accessToken, reference, 'ZPROOFIRST').expect(403);
    await payWithMock(ctx, user.accessToken, reference);
    await apply(ctx, user.accessToken, reference, 'ZPROOFIRST').expect(409);
  });

  it('lists active coupons by service', async () => {
    const ctx = createTestContext();
    const res = await request(ctx.app).get('/api/coupons').query({ service: 'BUS' }).expect(200);
    const codes = res.body.data.map((c: { code: string }) => c.code);
    expect(codes).toEqual(expect.arrayContaining(['BUS10', 'ZPROOFIRST']));
    expect(codes).not.toContain('FLY500');
    expect(codes).not.toContain('MONSOON20');
  });
});

/** A second, different flight booking body for the same user. */
async function secondBookingBody(ctx: Ctx) {
  const search = await request(ctx.app)
    .get('/api/flights/search')
    .query({
      from: 'BOM',
      to: 'DEL',
      date: new Date(Date.now() + 25 * 86_400_000).toISOString().slice(0, 10),
    })
    .expect(200);
  const offer = search.body.data.legs[0].offers[0];
  return {
    offerIds: [offer.id],
    passengers: [
      { type: 'ADULT', title: 'MR', firstName: 'Amit', lastName: 'Sharma', gender: 'MALE' },
    ],
    contact: { email: 'amit@example.com', phone: '+919876543210' },
    expectedTotalPaise: offer.totalPaise,
  };
}
