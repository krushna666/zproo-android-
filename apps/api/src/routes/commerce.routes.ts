import { Permission } from '@zproo/types';
import { BOOKING_REFERENCE_PATTERN } from '@zproo/utils';
import { bookBusSchema, bookFlightSchema, idSchema } from '@zproo/validation';
import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import type { createBookingsController } from '../controllers/bookings.controller';
import type { createBusesController } from '../controllers/buses.controller';
import { offerQuerySchema, type createFlightsController } from '../controllers/flights.controller';
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

const tripParams = z.object({
  tripId: z.string().regex(/^[A-Za-z0-9_-]{5,120}$/, 'Invalid trip'),
});

export function busRoutes(
  c: ReturnType<typeof createBusesController>,
  authenticate: RequestHandler,
  rbac: RbacService,
  idempotency: IdempotencyService,
  limits: CommerceLimits,
): Router {
  const router = Router();
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
  router.get(
    '/:offerId',
    validate({ params: z.object({ offerId: idSchema.max(200) }), query: offerQuerySchema }),
    c.offer,
  );
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
