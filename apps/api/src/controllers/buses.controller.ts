import { busSearchSchemaAt, type BookBusInput } from '@zproo/validation';
import type { RequestHandler } from 'express';
import { clock } from '../lib/testContext';
import { requireAuth } from '../middleware/auth';
import { idempotencyKey } from '../middleware/idempotency';
import { validated } from '../middleware/validate';
import type { BookingService } from '../services/booking.service';
import type { BusService } from '../services/bus.service';
import type { CancellationService } from '../services/cancellation.service';
import { NotFoundError, ValidationError } from '../utils/errors';
import { sendSuccess } from '../utils/response';
import { zodIssues } from '../utils/zod';
import { requestContext } from './auth.controller';

const GONE = 'This bus is no longer available. Please search again.';

export function createBusesController(
  buses: BusService,
  bookings: BookingService,
  cancellations: CancellationService,
) {
  const cities: RequestHandler = async (req, res) => {
    const { q } = validated<{ q: string }>(req, 'query');
    sendSuccess(res, await buses.cities(q));
  };

  const search: RequestHandler = async (req, res) => {
    // Validated against the API clock ("today" in IST moves with X-Test-Now in tests).
    const parsed = busSearchSchemaAt(clock.now).safeParse(req.query);
    if (!parsed.success) {
      throw new ValidationError(
        zodIssues(parsed.error).map((i) => ({ ...i, path: `query.${i.path}` })),
      );
    }
    res.setHeader('Cache-Control', 'private, max-age=60');
    sendSuccess(res, await buses.search(parsed.data));
  };

  const trip: RequestHandler = async (req, res) => {
    const { tripId } = validated<{ tripId: string }>(req, 'params');
    const found = await buses.getTrip(tripId);
    if (!found) throw new NotFoundError(GONE);
    sendSuccess(res, found);
  };

  const seats: RequestHandler = async (req, res) => {
    const { tripId } = validated<{ tripId: string }>(req, 'params');
    // Never cached anywhere: availability changes as people book.
    res.setHeader('Cache-Control', 'no-store');
    const map = await buses.seatMap(tripId);
    if (!map) throw new NotFoundError(GONE);
    sendSuccess(res, map);
  };

  const book: RequestHandler = async (req, res) => {
    const auth = requireAuth(req);
    const result = await bookings.createBusBooking(
      auth.userId,
      validated<BookBusInput>(req, 'body'),
      idempotencyKey(req),
      requestContext(req),
    );
    sendSuccess(res, result, 'Seats held. Complete payment to confirm.', 201);
  };

  const cancel: RequestHandler = async (req, res) => {
    const { reference } = validated<{ reference: string }>(req, 'params');
    const result = await cancellations.cancel(
      requireAuth(req).userId,
      reference,
      'BUS',
      requestContext(req),
    );
    sendSuccess(res, result, 'Booking cancelled');
  };

  return { cities, search, trip, seats, book, cancel };
}
