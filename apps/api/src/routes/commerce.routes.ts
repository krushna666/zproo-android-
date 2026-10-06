import { Permission } from '@zproo/types';
import { BOOKING_REFERENCE_PATTERN } from '@zproo/utils';
import {
  bookBusSchema,
  bookFlightSchema,
  bookHotelSchema,
  busTripIdSchema,
  hotelIdSchema,
} from '@zproo/validation';
import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import type { createBookingsController } from '../controllers/bookings.controller';
import type { createBusesController } from '../controllers/buses.controller';
import type { createFlightsController } from '../controllers/flights.controller';
import type { createHotelsController } from '../controllers/hotels.controller';
import type { createPaymentsController } from '../controllers/payments.controller';
import { authorize } from '../middleware/auth';
import { idempotent } from '../middleware/idempotency';
import type { commerceRateLimiters } from '../middleware/rateLimit';
import { validate } from '../middleware/validate';
import type { IdempotencyService } from '../services/idempotency.service';
import type { RbacService } from '../services/rbac.service';

export const referenceParams = z.object({
  reference: z
    .string()
    .trim()
    .toUpperCase()
    .regex(BOOKING_REFERENCE_PATTERN, 'Invalid booking reference'),
});

const tripParams = z.strictObject({ tripId: busTripIdSchema });

export function busRoutes(
  c: ReturnType<typeof createBusesController>,
  authenticate: RequestHandler,
  rbac: RbacService,
  idempotency: IdempotencyService,
  limits: CommerceLimits,
): Router {
  const router = Router();
  router.get(
    '/cities',
    validate({
      query: z.strictObject({
        q: z
          .string()
          .trim()
          .min(1, 'Type a city name')
          .max(40)
          .regex(/^[A-Za-z ]+$/, 'Use letters only'),
      }),
    }),
    c.cities,
  );
  router.get('/search', limits.search, c.search);
  router.post(
    '/book',
    authenticate,
    limits.book,
    authorize(rbac, Permission.BOOKING_CREATE),
    idempotent(idempotency),
    validate({ body: bookBusSchema }),
    c.book,
  );
  router.post(
    '/:reference/cancel',
    authenticate,
    authorize(rbac, Permission.BOOKING_CANCEL_OWN),
    validate({ params: referenceParams }),
    c.cancel,
  );
  router.get('/:tripId', validate({ params: tripParams }), c.trip);
  router.get('/:tripId/seats', validate({ params: tripParams }), c.seats);
  return router;
}

export function flightRoutes(
  c: ReturnType<typeof createFlightsController>,
  authenticate: RequestHandler,
  rbac: RbacService,
  idempotency: IdempotencyService,
  limits: CommerceLimits,
): Router {
  const router = Router();
  router.get(
    '/airports',
    validate({
      query: z.strictObject({
        q: z
          .string()
          .trim()
          .min(1, 'Type a city or airport')
          .max(40)
          .regex(/^[A-Za-z ]+$/, 'Use letters only'),
      }),
    }),
    c.airports,
  );
  router.get('/search', limits.search, c.search);
  router.post(
    '/book',
    authenticate,
    limits.book,
    authorize(rbac, Permission.BOOKING_CREATE),
    idempotent(idempotency),
    validate({ body: bookFlightSchema }),
    c.book,
  );
  router.post(
    '/:reference/cancel',
    authenticate,
    authorize(rbac, Permission.BOOKING_CANCEL_OWN),
    validate({ params: referenceParams }),
    c.cancel,
  );
  router.get(
    '/:offerId',
    validate({
      params: z.strictObject({
        offerId: z.string().regex(/^off_[A-Za-z0-9_]{20,80}$/, 'Invalid offer'),
      }),
      query: z.strictObject({
        reprice: z
          .enum(['0', '1'])
          .optional()
          .transform((v) => v === '1'),
      }),
    }),
    c.offer,
  );
  return router;
}

export function hotelRoutes(
  c: ReturnType<typeof createHotelsController>,
  authenticate: RequestHandler,
  rbac: RbacService,
  idempotency: IdempotencyService,
  limits: CommerceLimits,
): Router {
  const router = Router();
  const hotelParams = z.strictObject({ hotelId: hotelIdSchema });
  router.get(
    '/destinations',
    validate({
      query: z.strictObject({
        q: z
          .string()
          .trim()
          .min(1, 'Type a city, area or hotel')
          .max(60)
          .regex(/^[A-Za-z0-9 '&-]+$/, 'Use letters and numbers only'),
      }),
    }),
    c.destinations,
  );
  router.get('/search', limits.search, c.search);
  router.post(
    '/book',
    authenticate,
    limits.book,
    authorize(rbac, Permission.BOOKING_CREATE),
    idempotent(idempotency),
    validate({ body: bookHotelSchema }),
    c.book,
  );
  router.post(
    '/:reference/cancel',
    authenticate,
    authorize(rbac, Permission.BOOKING_CANCEL_OWN),
    validate({ params: referenceParams }),
    c.cancel,
  );
  router.get('/:hotelId', validate({ params: hotelParams }), c.details);
  router.get('/:hotelId/rooms', validate({ params: hotelParams }), c.rooms);
  return router;
}

export function bookingRoutes(
  c: ReturnType<typeof createBookingsController>,
  authenticate: RequestHandler,
  rbac: RbacService,
): Router {
  const router = Router();
  router.use(authenticate, authorize(rbac, Permission.BOOKING_READ_OWN));
  router.get('/', c.list);
  router.get('/:reference', validate({ params: referenceParams }), c.get);
  router.get('/:reference/ticket.pdf', validate({ params: referenceParams }), c.ticket);
  router.get('/:reference/cancellation', validate({ params: referenceParams }), c.cancellation);
  router.post(
    '/:reference/release',
    authorize(rbac, Permission.BOOKING_CANCEL_OWN),
    validate({ params: referenceParams }),
    c.release,
  );
  return router;
}

type CommerceLimits = ReturnType<typeof commerceRateLimiters>;

const orderId = z
  .string()
  .trim()
  .regex(/^order_[A-Za-z0-9]{6,40}$/, 'Invalid order');

export function paymentRoutes(
  c: ReturnType<typeof createPaymentsController>,
  authenticate: RequestHandler,
  rbac: RbacService,
  idempotency: IdempotencyService,
  limits: CommerceLimits,
  options: { mockCheckout: boolean },
): Router {
  const router = Router();
  // Called by the gateway, not a customer: authenticated by its signature over the raw body.
  router.post('/webhook', c.webhook);

  router.use(authenticate, limits.payments, authorize(rbac, Permission.BOOKING_CREATE));
  router.post(
    '/create',
    idempotent(idempotency),
    validate({ body: z.strictObject({ bookingRef: referenceParams.shape.reference }) }),
    c.create,
  );
  router.post(
    '/verify',
    idempotent(idempotency),
    validate({
      body: z.strictObject({
        bookingRef: referenceParams.shape.reference,
        orderId,
        paymentId: z
          .string()
          .trim()
          .regex(/^pay_[A-Za-z0-9]{6,40}$/, 'Invalid payment'),
        signature: z
          .string()
          .trim()
          .regex(/^[0-9a-f]{64}$/, 'Invalid signature'),
      }),
    }),
    c.verify,
  );
  router.post(
    '/fail',
    validate({
      body: z.strictObject({ orderId, reason: z.string().trim().min(1).max(200) }),
    }),
    c.fail,
  );
  // Development checkout only; not mounted in production (env validation also forbids the mock gateway there).
  if (options.mockCheckout) {
    router.post(
      '/mock/complete',
      validate({
        body: z.strictObject({ orderId, outcome: z.enum(['success', 'failure']) }),
      }),
      c.mockComplete,
    );
  }
  return router;
}
