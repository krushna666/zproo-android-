import { Router } from 'express';
import type { Env } from '../config/env';
import type { Services } from '../container';
import { createAdminUsersController } from '../controllers/adminUsers.controller';
import { createAuthController } from '../controllers/auth.controller';
import { createBookingsController } from '../controllers/bookings.controller';
import { createBusesController } from '../controllers/buses.controller';
import { createFlightsController } from '../controllers/flights.controller';
import { createHotelsController } from '../controllers/hotels.controller';
import { createPaymentsController } from '../controllers/payments.controller';
import { createMeController } from '../controllers/me.controller';
import { authenticate } from '../middleware/auth';
import { requireCsrf } from '../middleware/csrf';
import {
  authRateLimiters,
  commerceRateLimiters,
  type RateLimitStoreFactory,
} from '../middleware/rateLimit';
import { adminRoutes } from './admin.routes';
import { authRoutes } from './auth.routes';
import {
  bookingRoutes,
  busRoutes,
  flightRoutes,
  hotelRoutes,
  paymentRoutes,
} from './commerce.routes';
import { couponRoutes } from './coupon.routes';
import { healthRoutes } from './health.routes';
import { meRoutes } from './me.routes';

/** Mounts every module router under `/api`. New modules register here. */
export function createApiRouter(
  services: Services,
  env: Env,
  rateLimitStore: RateLimitStoreFactory,
): Router {
  const requireUser = authenticate(services.tokens);
  const commerce = commerceRateLimiters(rateLimitStore);
  const router = Router();
  router.use('/health', healthRoutes(services.health));
  router.use(
    '/auth',
    authRoutes(
      createAuthController(services.auth, services.tokens, env),
      authRateLimiters(rateLimitStore),
      requireUser,
      requireCsrf(env),
    ),
  );
  router.use('/me', meRoutes(createMeController(services.users, services.auth), requireUser));
  router.use(
    '/admin',
    adminRoutes({ users: createAdminUsersController(services.users) }, requireUser, services.rbac),
  );
  router.use(
    '/flights',
    flightRoutes(
      createFlightsController(services.flights, services.bookings, services.cancellations),
      requireUser,
      services.rbac,
      services.idempotency,
      commerce,
    ),
  );
  router.use(
    '/buses',
    busRoutes(
      createBusesController(services.buses, services.bookings, services.cancellations),
      requireUser,
      services.rbac,
      services.idempotency,
      commerce,
    ),
  );
  router.use(
    '/hotels',
    hotelRoutes(
      createHotelsController(services.hotels, services.bookings, services.cancellations),
      requireUser,
      services.rbac,
      services.idempotency,
      commerce,
    ),
  );
  router.use(
    '/bookings',
    bookingRoutes(
      createBookingsController(
        services.bookings,
        services.tickets,
        services.rbac,
        services.cancellations,
        services.payments,
      ),
      requireUser,
      services.rbac,
    ),
  );
  router.use(
    '/payments',
    paymentRoutes(
      createPaymentsController(services.payments),
      requireUser,
      services.rbac,
      services.idempotency,
      commerce,
      {
        mockCheckout: services.payments.providerName === 'mock' && !env.isProduction,
      },
    ),
  );
  router.use('/coupons', couponRoutes(services.coupons, requireUser, services.rbac));
  return router;
}
