import {
  flightSearchInputFromParams,
  flightSearchSchemaAt,
  type BookFlightInput,
} from '@zproo/validation';
import type { RequestHandler } from 'express';
import { clock } from '../lib/testContext';
import { requireAuth } from '../middleware/auth';
import { idempotencyKey } from '../middleware/idempotency';
import { validated } from '../middleware/validate';
import type { BookingService } from '../services/booking.service';
import type { CancellationService } from '../services/cancellation.service';
import type { FlightService } from '../services/flight.service';
import { FareUnavailableError, ValidationError } from '../utils/errors';
import { sendSuccess } from '../utils/response';
import { zodIssues } from '../utils/zod';
import { requestContext } from './auth.controller';

export function createFlightsController(
  flights: FlightService,
  bookings: BookingService,
  cancellations: CancellationService,
) {
  const airports: RequestHandler = async (req, res) => {
    const { q } = validated<{ q: string }>(req, 'query');
    sendSuccess(res, await flights.airports(q));
  };

  const search: RequestHandler = async (req, res) => {
    // Validated against the API clock ("today" in IST moves with X-Test-Now in tests).
    const keys = new Set([
      'from',
      'to',
      'date',
      'returnDate',
      'adults',
      'children',
      'infants',
      'cabin',
    ]);
    const unknown = Object.keys(req.query).filter((k) => !keys.has(k));
    if (unknown.length > 0)
      throw new ValidationError(
        unknown.map((k) => ({ path: `query.${k}`, message: 'Unknown parameter' })),
      );
    const params = new URLSearchParams(req.query as Record<string, string>);
    const parsed = flightSearchSchemaAt(clock.now).safeParse(flightSearchInputFromParams(params));
    if (!parsed.success) {
      throw new ValidationError(
        zodIssues(parsed.error).map((i) => ({ ...i, path: `query.${i.path}` })),
      );
    }
    // Search results change with bookings; clients may cache for a minute at most.
    res.setHeader('Cache-Control', 'private, max-age=60');
    sendSuccess(res, await flights.search(parsed.data));
  };

  /** Live re-price with fare families; never cached. `?reprice=1` renews an expired offer. */
  const offer: RequestHandler = async (req, res) => {
    const { offerId } = validated<{ offerId: string }>(req, 'params');
    const { reprice } = validated<{ reprice: boolean }>(req, 'query');
    res.setHeader('Cache-Control', 'no-store');
    const found = await flights.getOffer(offerId, reprice);
    if (!found) throw new FareUnavailableError();
    sendSuccess(res, found);
  };

  const book: RequestHandler = async (req, res) => {
    const auth = requireAuth(req);
    const result = await bookings.createFlightBooking(
      auth.userId,
      validated<BookFlightInput>(req, 'body'),
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
      'FLIGHT',
      requestContext(req),
    );
    sendSuccess(res, result, 'Booking cancelled');
  };

  return { airports, search, offer, book, cancel };
}
