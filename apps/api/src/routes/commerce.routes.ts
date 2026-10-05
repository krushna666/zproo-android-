import { Permission } from '@zproo/types';
import { bookBusSchema, bookFlightSchema, idSchema } from '@zproo/validation';
import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import type { createBookingsController } from '../controllers/bookings.controller';
import type { createBusesController } from '../controllers/buses.controller';
import { offerQuerySchema, type createFlightsController } from '../controllers/flights.controller';
import type { createPaymentsController } from '../controllers/payments.controller';
import { authorize } from '../middleware/auth';
import { requireIdempotencyKey } from '../middleware/idempotency';
import { validate } from '../middleware/validate';
import type { RbacService } from '../services/rbac.service';

const referenceParams = z.object({
  reference: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^ZP-\d{4}-[0-9A-Z]{6}$/, 'Invalid booking reference'),
});

const tripParams = z.object({
  tripId: z.string().regex(/^[A-Za-z0-9_-]{5,120}$/, 'Invalid trip'),
});

export function busRoutes(
  c: ReturnType<typeof createBusesController>,
  authenticate: RequestHandler,
  rbac: RbacService,
): Router {
  const router = Router();
  router.get('/search', c.search);
  router.post(
    '/book',
    authenticate,
    authorize(rbac, Permission.BOOKING_CREATE),
    requireIdempotencyKey,
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
): Router {
  const router = Router();
  router.get('/search', c.search);
  router.post(
    '/book',
    authenticate,
    authorize(rbac, Permission.BOOKING_CREATE),
    requireIdempotencyKey,
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

export function paymentRoutes(
  c: ReturnType<typeof createPaymentsController>,
  authenticate: RequestHandler,
  rbac: RbacService,
  options: { mockCheckout: boolean },
): Router {
  const router = Router();
  router.use(authenticate, authorize(rbac, Permission.BOOKING_CREATE));
  router.post(
    '/create',
    validate({ body: z.object({ bookingReference: referenceParams.shape.reference }) }),
    c.create,
  );
  router.post(
    '/verify',
    validate({
      body: z.object({
        paymentId: idSchema,
        providerPaymentId: z.string().trim().min(4).max(100),
        signature: z.string().trim().min(10).max(200),
        method: z.string().trim().max(30).optional(),
      }),
    }),
    c.verify,
  );
  router.post(
    '/:paymentId/fail',
    validate({
      params: z.object({ paymentId: idSchema }),
      body: z.object({ reason: z.string().trim().min(1).max(200) }),
    }),
    c.fail,
  );
  // Development checkout only; not mounted in production (env validation also forbids the mock gateway there).
  if (options.mockCheckout) {
    router.post(
      '/mock/complete',
      validate({
        body: z.object({ paymentId: idSchema, outcome: z.enum(['success', 'failure']) }),
      }),
      c.mockComplete,
    );
  }
  return router;
}
