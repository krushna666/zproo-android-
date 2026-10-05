import {
  emailSchema,
  indianMobileSchema,
  passwordSchema,
  personNameSchema,
} from '@zproo/validation';
import { Router } from 'express';
import type { Logger } from 'pino';
import type { Redis } from 'ioredis';
import { z } from 'zod';
import type { Env } from '../config/env';
import type { Services } from '../container';
import { requestContext } from '../controllers/auth.controller';
import { releaseExpiredHolds } from '../jobs/releaseExpiredHolds';
import { validate, validated } from '../middleware/validate';
import { setRefreshCookie } from '../utils/cookies';
import { sendSuccess } from '../utils/response';

/** Tables holding customer data; reference data (roles, timetables, coupons) stays. */
const CUSTOMER_TABLES = [
  'users',
  'otp_codes',
  'refresh_tokens',
  'audit_logs',
  'auth_identities',
  'addresses',
  'user_roles',
  'payments',
  'booking_events',
  'webhook_events',
  'idempotency_keys',
  'coupon_redemptions',
  'flight_bookings',
  'bus_bookings',
  'bus_seat_bookings',
  'bus_trips',
  'booking_passengers',
  'bookings',
  'flight_inventory',
];

const testUserSchema = z.strictObject({
  fullName: personNameSchema.default('Test Traveller'),
  phone: indianMobileSchema.optional(),
  email: emailSchema.optional(),
  password: passwordSchema.default('travel2026'),
  roles: z
    .array(z.enum(['ADMIN', 'SUPPORT', 'SUPER_ADMIN', 'OPERATOR']))
    .max(4)
    .optional(),
});

/** Throws if anything tries to mount test routes outside NODE_ENV=test. */
export function assertTestEnvironment(env: Pick<Env, 'isTest' | 'isProduction'>): void {
  if (!env.isTest || env.isProduction)
    throw new Error('Refusing to start: /api/test routes are only allowed with NODE_ENV=test');
}

/**
 * End-to-end test support. Mounted by createApp only when NODE_ENV=test; createApp refuses to
 * start if asked to mount it in any other environment.
 */
export function testRoutes(
  services: Services,
  env: Env,
  deps: {
    prisma: { $executeRawUnsafe: (sql: string) => Promise<number> };
    redis?: Redis;
    logger: Logger;
  },
): Router {
  assertTestEnvironment(env);
  const router = Router();

  // Creates a signed-in customer (OTP 123456 also works when ALLOW_TEST_OTP=true).
  router.post('/users', validate({ body: testUserSchema }), async (req, res) => {
    const body = validated<z.output<typeof testUserSchema>>(req, 'body');
    const phone = body.phone ?? `+919${String(Math.floor(Math.random() * 1e9)).padStart(9, '0')}`;
    const issued = await services.auth.createTestUser(
      { ...body, phone, email: body.email },
      requestContext(req),
    );
    setRefreshCookie(res, issued.refreshToken, services.tokens.refreshTokenTtlMs, env);
    sendSuccess(
      res,
      { ...issued.session, phone, password: body.password, refreshToken: issued.refreshToken },
      'Test user created',
      201,
    );
  });

  // Wipes customer data (users, sessions, bookings, payments) between test runs.
  router.post('/reset', async (_req, res) => {
    await deps.prisma.$executeRawUnsafe(
      `TRUNCATE TABLE ${CUSTOMER_TABLES.join(', ')} RESTART IDENTITY CASCADE`,
    );
    sendSuccess(res, null, 'Test data reset');
  });

  // Runs the minute job now (respects X-Test-Now, e.g. to expire holds).
  router.post('/jobs/release-holds', async (_req, res) => {
    sendSuccess(res, await releaseExpiredHolds(services, deps.redis, deps.logger), 'Job ran');
  });

  return router;
}
