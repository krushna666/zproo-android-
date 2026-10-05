import { Router } from 'express';
import type { Env } from '../config/env';
import type { Services } from '../container';
import { createAdminUsersController } from '../controllers/adminUsers.controller';
import { createAuthController } from '../controllers/auth.controller';
import { createBookingsController } from '../controllers/bookings.controller';
import { createBusesController } from '../controllers/buses.controller';
import { createFlightsController } from '../controllers/flights.controller';
import { createPaymentsController } from '../controllers/payments.controller';
import { createMeController } from '../controllers/me.controller';
import { authenticate } from '../middleware/auth';
import { authRateLimiters, type RateLimitStoreFactory } from '../middleware/rateLimit';
import { adminRoutes } from './admin.routes';
import { authRoutes } from './auth.routes';
import { bookingRoutes, busRoutes, flightRoutes, paymentRoutes } from './commerce.routes';
import { healthRoutes } from './health.routes';
import { meRoutes } from './me.routes';

/** Mounts every module router under `/api`. New modules register here. */
export function createApiRouter(
  services: Services,
  env: Env,
  rateLimitStore: RateLimitStoreFactory,
): Router {
  const requireUser = authenticate(services.tokens);
  const router = Router();
  router.use('/health', healthRoutes(services.health));
  router.use(
    '/auth',
    authRoutes(
      createAuthController(services.auth, services.tokens, env),
      authRateLimiters(rateLimitStore),
      requireUser,
    ),
  );
  router.use('/me', meRoutes(createMeController(services.users), requireUser));
  router.use(
    '/admin',
    adminRoutes({ users: createAdminUsersController(services.users) }, requireUser, services.rbac),
  );
  router.use(
    '/flights',
    flightRoutes(
      createFlightsController(services.flights, services.bookings),
      requireUser,
      services.rbac,
    ),
  );
  router.use(
    '/buses',
    busRoutes(createBusesController(services.buses, services.bookings), requireUser, services.rbac),
  );
  router.use(
    '/bookings',
    bookingRoutes(
      createBookingsController(services.bookings, services.tickets, services.rbac),
      requireUser,
      services.rbac,
    ),
  );
  router.use(
    '/payments',
    paymentRoutes(createPaymentsController(services.payments), requireUser, services.rbac, {
      mockCheckout: services.payments.providerName === 'mock' && !env.isProduction,
    }),
  );
  return router;
}
