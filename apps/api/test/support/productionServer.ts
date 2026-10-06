/**
 * The API exactly as it runs with NODE_ENV=production, except that the suppliers and the payment
 * gateway are the mock ones: production refuses to boot with mocks and no real supplier exists
 * yet. Used only by the security suite (SEC-13/14: production error bodies, /api/test routes and
 * X-Mock-Scenario). Never deployed.
 *
 *   PORT=5199 DATABASE_URL=… REDIS_URL=… npx tsx test/support/productionServer.ts
 */
import { createServer } from 'node:http';
import { createApp } from '../../src/app';
import { parseEnv } from '../../src/config/env';
import { createServices } from '../../src/container';
import { createPrismaClient } from '../../src/lib/prisma';
import { redisRateLimitStore } from '../../src/lib/rateLimitStore';
import { createRedisClient } from '../../src/lib/redis';
import { createLogger } from '../../src/utils/logger';

// Validated as development (mocks allowed), then switched to production behaviour.
const parsed = parseEnv({ ...process.env, NODE_ENV: 'development', ALLOW_TEST_OTP: 'false' });
const env = {
  ...parsed,
  NODE_ENV: 'production' as const,
  isProduction: true,
  isTest: false,
  allowTestOtp: false,
  apiDocsEnabled: false,
};

const logger = createLogger({ level: env.LOG_LEVEL, pretty: false, version: env.APP_VERSION });
const prisma = createPrismaClient(logger);
const redis = createRedisClient(env.REDIS_URL, logger);
await redis.connect().catch(() => undefined);

const services = createServices({ env, logger, prisma, redis });
const app = createApp({
  env,
  logger,
  services,
  prisma,
  redis,
  rateLimitStore: redisRateLimitStore(redis),
});
const server = createServer(app).listen(env.PORT, () =>
  logger.info({ port: env.PORT }, 'Production-mode probe listening'),
);

const stop = () => {
  server.close();
  void Promise.allSettled([prisma.$disconnect(), redis.quit()]).then(() => process.exit(0));
};
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
