import type { FlightOffer } from '@zproo/types';
import request from 'supertest';
import { type createTestContext, signUp } from './helpers';

/** A date comfortably inside the bookable window, as YYYY-MM-DD. */
export function daysAhead(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

export const adult = {
  type: 'ADULT',
  title: 'MR',
  firstName: 'Amit',
  lastName: 'Sharma',
  gender: 'MALE',
} as const;

export type Ctx = ReturnType<typeof createTestContext>;

export async function searchOffers(
  ctx: Ctx,
  query: Record<string, string> = {},
): Promise<FlightOffer[]> {
  const res = await request(ctx.app)
    .get('/api/flights/search')
    .query({ from: 'PNQ', to: 'DEL', date: daysAhead(20), ...query })
    .expect(200);
  return res.body.data.legs[0].offers as FlightOffer[];
}

export function book(
  ctx: Ctx,
  token: string,
  offer: FlightOffer,
  options: { key?: string; passengers?: object[]; expectedTotalPaise?: number } = {},
) {
  return request(ctx.app)
    .post('/api/flights/book')
    .set('Authorization', `Bearer ${token}`)
    .set('Idempotency-Key', options.key ?? crypto.randomUUID())
    .send({
      offerIds: [offer.id],
      passengers: options.passengers ?? [adult],
      contact: { email: 'amit@example.com', phone: '+919876543210' },
      expectedTotalPaise: options.expectedTotalPaise ?? offer.totalPaise,
    });
}

/** Signs up, books the cheapest PNQ→DEL fare for one adult and returns the booking. */
export async function bookedFlight(ctx: Ctx) {
  const user = await signUp(ctx);
  const [offer] = await searchOffers(ctx);
  if (!offer) throw new Error('No offers');
  const res = await book(ctx, user.accessToken, offer).expect(201);
  return { user, offer, reference: res.body.data.reference as string };
}
