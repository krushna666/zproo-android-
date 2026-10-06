import {
  hotelRoomsQuerySchemaAt,
  hotelSearchSchemaAt,
  type BookHotelInput,
} from '@zproo/validation';
import type { RequestHandler } from 'express';
import type { z } from 'zod';
import { clock } from '../lib/testContext';
import { requireAuth } from '../middleware/auth';
import { idempotencyKey } from '../middleware/idempotency';
import { validated } from '../middleware/validate';
import type { BookingService } from '../services/booking.service';
import type { CancellationService } from '../services/cancellation.service';
import type { HotelService } from '../services/hotel.service';
import { NotFoundError, ValidationError } from '../utils/errors';
import { sendSuccess } from '../utils/response';
import { zodIssues } from '../utils/zod';
import { requestContext } from './auth.controller';

const GONE = 'This hotel is no longer available. Please search again.';

/** Query validation against the API clock ("today" in IST moves with X-Test-Now in tests). */
function parseQuery<T>(schema: z.ZodType<T>, query: unknown): T {
  const parsed = schema.safeParse(query);
  if (!parsed.success)
    throw new ValidationError(
      zodIssues(parsed.error).map((i) => ({ ...i, path: `query.${i.path}` })),
    );
  return parsed.data;
}

export function createHotelsController(
  hotels: HotelService,
  bookings: BookingService,
  cancellations: CancellationService,
) {
  const destinations: RequestHandler = async (req, res) => {
    const { q } = validated<{ q: string }>(req, 'query');
    sendSuccess(res, await hotels.destinations(q));
  };

  const search: RequestHandler = async (req, res) => {
    const query = parseQuery(hotelSearchSchemaAt(clock.now), req.query);
    const result = await hotels.search(query);
    if (!result)
      throw new ValidationError([{ path: 'query.destinationId', message: 'Choose a destination' }]);
    res.setHeader('Cache-Control', 'private, max-age=60');
    sendSuccess(res, result);
  };

  const details: RequestHandler = async (req, res) => {
    const { hotelId } = validated<{ hotelId: string }>(req, 'params');
    const found = await hotels.details(hotelId);
    if (!found) throw new NotFoundError(GONE);
    sendSuccess(res, found);
  };

  const rooms: RequestHandler = async (req, res) => {
    const { hotelId } = validated<{ hotelId: string }>(req, 'params');
    const query = parseQuery(hotelRoomsQuerySchemaAt(clock.now), req.query);
    // Never cached anywhere: availability changes as people book.
    res.setHeader('Cache-Control', 'no-store');
    const result = await hotels.rooms(hotelId, query.checkIn, query.checkOut);
    if (!result) throw new NotFoundError(GONE);
    sendSuccess(res, result);
  };

  const book: RequestHandler = async (req, res) => {
    const auth = requireAuth(req);
    const result = await bookings.createHotelBooking(
      auth.userId,
      validated<BookHotelInput>(req, 'body'),
      idempotencyKey(req),
      requestContext(req),
    );
    sendSuccess(res, result, 'Rooms held. Complete payment to confirm.', 201);
  };

  const cancel: RequestHandler = async (req, res) => {
    const { reference } = validated<{ reference: string }>(req, 'params');
    const result = await cancellations.cancel(
      requireAuth(req).userId,
      reference,
      'HOTEL',
      requestContext(req),
    );
    sendSuccess(res, result, 'Booking cancelled');
  };

  return { destinations, search, details, rooms, book, cancel };
}
