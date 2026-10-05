import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MockPaymentProvider, RazorpayPaymentProvider } from '../src/providers/payment';
import { hmacSha256 } from '../src/utils/crypto';
import { book, bookedFlight, searchOffers } from './flightFixtures';
import { createTestContext, prisma, resetUsers, signUp } from './helpers';
import { createOrder, idem, mockCheckout, payWithMock, verifyPayment } from './payments';

beforeEach(resetUsers);

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

type VerifyBody = { bookingRef: string; orderId: string; paymentId: string; signature: string };

describe('Idempotency-Key', () => {
  it('replays the stored response for the same key and body (one booking)', async () => {
    const ctx = createTestContext();
    const { accessToken } = await signUp(ctx);
    const [offer] = await searchOffers(ctx);
    if (!offer) throw new Error('No offers');
    const key = crypto.randomUUID();
    const first = await book(ctx, accessToken, offer, { key }).expect(201);
    const retry = await book(ctx, accessToken, offer, { key }).expect(201);
    expect(retry.headers['idempotent-replayed']).toBe('true');
    expect(retry.body).toEqual(first.body);
    expect(await prisma.booking.count()).toBe(1);
  });

  it('runs a double-click once', async () => {
    const ctx = createTestContext();
    const { accessToken } = await signUp(ctx);
    const [offer] = await searchOffers(ctx);
    if (!offer) throw new Error('No offers');
    const key = crypto.randomUUID();
    const results = await Promise.all([
      book(ctx, accessToken, offer, { key }),
      book(ctx, accessToken, offer, { key }),
      book(ctx, accessToken, offer, { key }),
    ]);
    expect(results.map((r) => r.status)).toEqual([201, 201, 201]);
    expect(new Set(results.map((r) => r.body.data.bookingRef)).size).toBe(1);
    expect(await prisma.booking.count()).toBe(1);
  });

  it('refuses the same key with a different body (409 IDEMPOTENCY_CONFLICT)', async () => {
    const ctx = createTestContext();
    const { accessToken } = await signUp(ctx);
    const [offer] = await searchOffers(ctx);
    if (!offer) throw new Error('No offers');
    const key = crypto.randomUUID();
    await book(ctx, accessToken, offer, { key }).expect(201);
    const res = await book(ctx, accessToken, offer, {
      key,
      expectedTotalPaise: offer.totalPaise + 100,
    }).expect(409);
    expect(res.body.error.code).toBe('IDEMPOTENCY_CONFLICT');
    expect(await prisma.booking.count()).toBe(1);
  });

  it('scopes keys per user and requires a UUID', async () => {
    const ctx = createTestContext();
    const a = await signUp(ctx);
    const b = await signUp(ctx);
    const [offer] = await searchOffers(ctx);
    if (!offer) throw new Error('No offers');
    const key = crypto.randomUUID();
    await book(ctx, a.accessToken, offer, { key }).expect(201);
    await book(ctx, b.accessToken, offer, { key }).expect(201);
    expect(await prisma.booking.count()).toBe(2);
    const bad = await book(ctx, a.accessToken, offer, { key: 'not-a-uuid-123456789' }).expect(400);
    expect(bad.body.error.details.fields).toEqual({
      'idempotency-key': 'Send a unique Idempotency-Key header (a UUID)',
    });
  });

  it('forgets keys after 24 hours', async () => {
    const ctx = createTestContext();
    const { accessToken } = await signUp(ctx);
    const [offer] = await searchOffers(ctx);
    if (!offer) throw new Error('No offers');
    const key = crypto.randomUUID();
    await book(ctx, accessToken, offer, { key }).expect(201);
    await prisma.idempotencyKey.updateMany({ data: { expiresAt: new Date(Date.now() - 1) } });
    await ctx.services.idempotency.purgeExpired();
    expect(await prisma.idempotencyKey.count()).toBe(0);
  });

  it('is required on payments/create and payments/verify', async () => {
    const ctx = createTestContext();
    const { user, reference } = await bookedFlight(ctx);
    for (const path of ['/api/payments/create', '/api/payments/verify']) {
      const res = await request(ctx.app)
        .post(path)
        .set(bearer(user.accessToken))
        .send({ bookingRef: reference })
        .expect(400);
      expect(res.body.error.details.fields).toHaveProperty('idempotency-key');
    }
  });
});

describe('payment verification', () => {
  async function paidAtGateway() {
    const ctx = createTestContext();
    const { user, reference } = await bookedFlight(ctx);
    const order = await createOrder(ctx, user.accessToken, reference);
    const gateway = await mockCheckout(ctx, user.accessToken, order.body.data.orderId);
    return {
      ctx,
      user,
      reference,
      body: {
        bookingRef: reference,
        orderId: order.body.data.orderId as string,
        paymentId: gateway.body.data.paymentId as string,
        signature: gateway.body.data.signature as string,
      },
    };
  }

  it('confirms with a valid signature, and a retried verify returns the same result', async () => {
    const { ctx, user, body } = await paidAtGateway();
    const first = await verifyPayment(ctx, user.accessToken, body).expect(200);
    const again = await verifyPayment(ctx, user.accessToken, body).expect(200);
    expect(first.body.data).toMatchObject({ status: 'CONFIRMED', paymentStatus: 'CAPTURED' });
    expect(again.body.data).toEqual(first.body.data);
  });

  it.each([
    ['tampered signature', (b: VerifyBody): VerifyBody => ({ ...b, signature: 'f'.repeat(64) })],
    ['another payment ID', (b: VerifyBody): VerifyBody => ({ ...b, paymentId: 'pay_forged1234' })],
    [
      'signed with the wrong secret',
      (b: VerifyBody): VerifyBody => ({
        ...b,
        signature: hmacSha256('wrong-secret-0000000000000000', `${b.orderId}|${b.paymentId}`),
      }),
    ],
  ])('rejects a %s and leaves the booking unpaid', async (_name, tamper) => {
    const { ctx, user, body } = await paidAtGateway();
    const res = await verifyPayment(ctx, user.accessToken, tamper(body)).expect(400);
    expect(res.body.error.code).toBe('PAYMENT_ERROR');
    expect(await prisma.booking.findFirstOrThrow()).toMatchObject({
      status: 'PAYMENT_PENDING',
      paymentStatus: 'CREATED',
    });
  });

  it("rejects a payment whose gateway amount doesn't match the booking", async () => {
    const { ctx, user, body } = await paidAtGateway();
    const fetch = vi.spyOn(MockPaymentProvider.prototype, 'fetchPayment').mockResolvedValue({
      paymentId: body.paymentId,
      orderId: body.orderId,
      amountPaise: 100,
      currency: 'INR',
      status: 'captured',
    });
    try {
      await verifyPayment(ctx, user.accessToken, body).expect(400);
      expect((await prisma.booking.findFirstOrThrow()).status).toBe('PAYMENT_PENDING');
      expect(await prisma.auditLog.count({ where: { action: 'PAYMENT_AMOUNT_MISMATCH' } })).toBe(1);
    } finally {
      fetch.mockRestore();
    }
  });

  it("rejects another booking's order", async () => {
    const { ctx, user, body } = await paidAtGateway();
    const [offer] = await searchOffers(ctx);
    if (!offer) throw new Error('No offers');
    const other = await book(ctx, user.accessToken, offer).expect(201);
    await verifyPayment(ctx, user.accessToken, {
      ...body,
      bookingRef: other.body.data.bookingRef,
    }).expect(400);
  });

  it('ignores price fields sent by the browser', async () => {
    const ctx = createTestContext();
    const { user, reference } = await bookedFlight(ctx);
    const res = await request(ctx.app)
      .post('/api/payments/create')
      .set(bearer(user.accessToken))
      .set(idem())
      .send({ bookingRef: reference, amount: 100 })
      .expect(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('payment webhook', () => {
  function webhook(ctx: ReturnType<typeof createTestContext>, payload: object, eventId: string) {
    const raw = JSON.stringify(payload);
    const provider = new MockPaymentProvider(ctx.env.JWT_SECRET);
    return request(ctx.app)
      .post('/api/payments/webhook')
      .set('Content-Type', 'application/json')
      .set('X-Razorpay-Event-Id', eventId)
      .set('X-Razorpay-Signature', provider.signWebhook(raw))
      .send(raw);
  }

  const captured = (orderId: string, paymentId: string, amount: number) => ({
    event: 'payment.captured',
    payload: {
      payment: {
        entity: { id: paymentId, order_id: orderId, amount, currency: 'INR', status: 'captured' },
      },
    },
  });

  async function orderFor() {
    const ctx = createTestContext();
    const { user, reference } = await bookedFlight(ctx);
    const order = await createOrder(ctx, user.accessToken, reference);
    return { ctx, user, reference, orderId: order.body.data.orderId as string };
  }

  it('confirms the booking once per event ID', async () => {
    const { ctx, reference, orderId } = await orderFor();
    const { totalAmountPaise } = await prisma.booking.findFirstOrThrow();
    const event = captured(orderId, 'pay_webhook0001', totalAmountPaise);
    const first = await webhook(ctx, event, 'evt_000001').expect(200);
    expect(first.body.data).toEqual({ outcome: 'processed' });
    expect((await prisma.booking.findUniqueOrThrow({ where: { reference } })).status).toBe(
      'CONFIRMED',
    );
    const replay = await webhook(ctx, event, 'evt_000001').expect(200);
    expect(replay.body.data).toEqual({ outcome: 'duplicate' });
    expect(await prisma.webhookEvent.count()).toBe(1);
  });

  it('rejects a bad signature', async () => {
    const { ctx, orderId } = await orderFor();
    const res = await request(ctx.app)
      .post('/api/payments/webhook')
      .set('Content-Type', 'application/json')
      .set('X-Razorpay-Event-Id', 'evt_000002')
      .set('X-Razorpay-Signature', 'a'.repeat(64))
      .send(JSON.stringify(captured(orderId, 'pay_webhook0002', 1)))
      .expect(400);
    expect(res.body.error.code).toBe('PAYMENT_ERROR');
    expect(await prisma.webhookEvent.count()).toBe(0);
    expect((await prisma.booking.findFirstOrThrow()).status).toBe('PAYMENT_PENDING');
  });

  it('ignores an event whose amount does not match the order', async () => {
    const { ctx, orderId } = await orderFor();
    const res = await webhook(ctx, captured(orderId, 'pay_webhook0003', 100), 'evt_000003');
    expect(res.body.data).toEqual({ outcome: 'ignored' });
    expect((await prisma.booking.findFirstOrThrow()).status).toBe('PAYMENT_PENDING');
  });

  it('is a no-op after the browser verified first', async () => {
    const ctx = createTestContext();
    const { user, reference } = await bookedFlight(ctx);
    const { order, gateway } = await payWithMock(ctx, user.accessToken, reference);
    const { totalAmountPaise } = await prisma.booking.findFirstOrThrow();
    const res = await webhook(
      ctx,
      captured(order.body.data.orderId, gateway.body.data.paymentId, totalAmountPaise),
      'evt_000004',
    ).expect(200);
    expect(res.body.data).toEqual({ outcome: 'processed' });
    expect(await prisma.bookingEvent.count({ where: { toStatus: 'CONFIRMED' } })).toBe(1);
  });
});

describe('RazorpayPaymentProvider', () => {
  const provider = (fetchImpl?: typeof fetch) =>
    new RazorpayPaymentProvider({
      keyId: 'rzp_test_abc123',
      keySecret: 'key-secret-0123456789abcdef',
      webhookSecret: 'webhook-secret-0123456789',
      ...(fetchImpl && { fetch: fetchImpl }),
    });

  it('verifies Razorpay signatures: valid, tampered and wrong secret', () => {
    const valid = hmacSha256('key-secret-0123456789abcdef', 'order_A1|pay_B2');
    expect(
      provider().verifySignature({ orderId: 'order_A1', paymentId: 'pay_B2', signature: valid }),
    ).toBe(true);
    expect(
      provider().verifySignature({ orderId: 'order_A1', paymentId: 'pay_B3', signature: valid }),
    ).toBe(false);
    const wrong = hmacSha256('another-secret-000000000000', 'order_A1|pay_B2');
    expect(
      provider().verifySignature({ orderId: 'order_A1', paymentId: 'pay_B2', signature: wrong }),
    ).toBe(false);
    expect(
      provider().verifySignature({ orderId: 'order_A1', paymentId: 'pay_B2', signature: 'zz' }),
    ).toBe(false);
  });

  it('verifies webhook signatures over the raw body', () => {
    const raw = Buffer.from('{"event":"payment.captured"}');
    const good = hmacSha256('webhook-secret-0123456789', raw.toString());
    expect(provider().verifyWebhook(raw, good)).toBe(true);
    expect(provider().verifyWebhook(Buffer.from('{"event":"payment.failed"}'), good)).toBe(false);
  });

  it('creates orders with basic auth and maps gateway failures to PROVIDER_ERROR', async () => {
    const calls: { url: string; init: RequestInit | undefined }[] = [];
    const ok = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify({ id: 'order_Abc123xyz' }), { status: 200 });
    });
    expect(
      await provider(ok as typeof fetch).createOrder({
        amountPaise: 124900,
        currency: 'INR',
        receipt: 'ZB7K3QX9M2PA',
      }),
    ).toEqual({ orderId: 'order_Abc123xyz' });
    expect(calls[0]?.url).toBe('https://api.razorpay.com/v1/orders');
    expect(JSON.parse(String(calls[0]?.init?.body))).toMatchObject({
      amount: 124900,
      currency: 'INR',
      receipt: 'ZB7K3QX9M2PA',
    });
    expect(new Headers(calls[0]?.init?.headers).get('Authorization')).toBe(
      `Basic ${Buffer.from('rzp_test_abc123:key-secret-0123456789abcdef').toString('base64')}`,
    );

    const failing = vi.fn(
      async () => new Response('{"error":{"description":"secret"}}', { status: 500 }),
    );
    await expect(
      provider(failing as typeof fetch).createOrder({
        amountPaise: 1,
        currency: 'INR',
        receipt: 'x',
      }),
    ).rejects.toMatchObject({ errorCode: 'PROVIDER_ERROR' });
  });
});
