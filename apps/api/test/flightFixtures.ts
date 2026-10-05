import type { FlightOfferDetails, FlightSearchResponse } from '@zproo/types';
import request from 'supertest';
import { type createTestContext, signUp } from './helpers';

/** An IST calendar date `days` from now (inside the bookable window). */
export function daysAhead(days: number): string {
  return new Date(Date.now() + 330 * 60_000 + days * 86_400_000).toISOString().slice(0, 10);
}

export const adult = {
  type: 'ADULT',
  title: 'MR',
  firstName: 'Amit',
  lastName: 'Sharma',
  gender: 'MALE',
} as const;

export type Ctx = ReturnType<typeof createTestContext>;

/** An offer plus one of its fares, ready to book (prices for the searched passengers). */
export interface BookableOffer {
  offerId: string;
  fareId: string;
  totalPaise: number;
  details: FlightOfferDetails;
}

export async function search(
  ctx: Ctx,
  query: Record<string, string> = {},
): Promise<FlightSearchResponse> {
  const res = await request(ctx.app)
    .get('/api/flights/search')
    .query({ from: 'PNQ', to: 'DEL', date: daysAhead(20), ...query })
    .expect(200);
  return res.body.data as FlightSearchResponse;
}

export async function offerDetails(ctx: Ctx, offerId: string): Promise<FlightOfferDetails> {
  return (await request(ctx.app).get(`/api/flights/${offerId}`).expect(200)).body
    .data as FlightOfferDetails;
}

/**
 * A few offers of a PNQ → DEL search (those with the most seats, so several bookings fit), each
 * with its `fare` (default Saver).
 */
export async function searchOffers(
  ctx: Ctx,
  query: Record<string, string> = {},
  fare: 'Saver' | 'Flexi' | 'Super Flexi' = 'Saver',
): Promise<BookableOffer[]> {
  const { offers } = await search(ctx, query);
  return Promise.all(
    [...offers]
      .sort((a, b) => b.seatsLeft - a.seatsLeft)
      .slice(0, 3)
      .map(async (o) => {
        const details = await offerDetails(ctx, o.offerId);
        const chosen = details.fareFamilies.find((f) => f.name === fare);
        if (!chosen) throw new Error('fare missing');
        return { offerId: o.offerId, fareId: chosen.fareId, totalPaise: chosen.total, details };
      }),
  );
}

export function book(
  ctx: Ctx,
  token: string,
  offer: BookableOffer,
  options: {
    key?: string;
    travellers?: object[];
    expectedTotalPaise?: number;
    returnOffer?: BookableOffer;
    headers?: Record<string, string>;
    extra?: Record<string, unknown>;
  } = {},
) {
  return request(ctx.app)
    .post('/api/flights/book')
    .set('Authorization', `Bearer ${token}`)
    .set('Idempotency-Key', options.key ?? crypto.randomUUID())
    .set(options.headers ?? {})
    .send({
      offerId: offer.offerId,
      fareId: offer.fareId,
      ...(options.returnOffer && {
        returnOfferId: options.returnOffer.offerId,
        returnFareId: options.returnOffer.fareId,
      }),
      travellers: options.travellers ?? [adult],
      contact: { email: 'amit@example.com', mobile: '9876543210' },
      expectedTotal:
        options.expectedTotalPaise ?? offer.totalPaise + (options.returnOffer?.totalPaise ?? 0),
      ...options.extra,
    });
}

/** Signs up, books the first PNQ→DEL Saver fare for one adult and returns the booking. */
export async function bookedFlight(ctx: Ctx) {
  const user = await signUp(ctx);
  const [offer] = await searchOffers(ctx);
  if (!offer) throw new Error('No offers');
  const res = await book(ctx, user.accessToken, offer).expect(201);
  return { user, offer, reference: res.body.data.bookingRef as string };
}
