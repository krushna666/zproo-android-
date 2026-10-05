import request from 'supertest';
import type { createTestContext } from './helpers';

type Ctx = ReturnType<typeof createTestContext>;

export const idem = () => ({ 'Idempotency-Key': crypto.randomUUID() });
const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

/** POST /payments/create for a booking (expects 201 unless told otherwise). */
export function createOrder(ctx: Ctx, token: string, bookingRef: string, status = 201) {
  return request(ctx.app)
    .post('/api/payments/create')
    .set(bearer(token))
    .set(idem())
    .send({ bookingRef })
    .expect(status);
}

/** The mock gateway's checkout: what Razorpay hands the browser after the customer pays. */
export function mockCheckout(
  ctx: Ctx,
  token: string,
  orderId: string,
  outcome: 'success' | 'failure' = 'success',
  status = 200,
) {
  return request(ctx.app)
    .post('/api/payments/mock/complete')
    .set(bearer(token))
    .send({ orderId, outcome })
    .expect(status);
}

export function verifyPayment(
  ctx: Ctx,
  token: string,
  body: { bookingRef: string; orderId: string; paymentId: string; signature: string },
) {
  return request(ctx.app).post('/api/payments/verify').set(bearer(token)).set(idem()).send(body);
}

/** Create order → pay at the mock gateway → verify on the server, like the web app does. */
export async function payWithMock(
  ctx: Ctx,
  token: string,
  bookingRef: string,
  outcome: 'success' | 'failure' = 'success',
) {
  const order = await createOrder(ctx, token, bookingRef);
  const orderId = order.body.data.orderId as string;
  const gateway = await mockCheckout(ctx, token, orderId, outcome);
  if (outcome === 'failure') return { order, gateway, verified: null };
  const verified = await verifyPayment(ctx, token, {
    bookingRef,
    orderId,
    paymentId: gateway.body.data.paymentId as string,
    signature: gateway.body.data.signature as string,
  }).expect(200);
  return { order, gateway, verified };
}
