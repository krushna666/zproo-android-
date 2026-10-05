import cookieParser from 'cookie-parser';
import express, { type Express } from 'express';
import type { Logger } from 'pino';
import type { Env } from './config/env';
import type { Services } from './container';
import { docsRouter } from './docs/router';
import { errorHandler } from './middleware/errorHandler';
import { httpLogger } from './middleware/httpLogger';
import { notFoundHandler } from './middleware/notFound';
import { apiRateLimiter, type RateLimitStoreFactory } from './middleware/rateLimit';
import { corsPolicy, securityHeaders } from './middleware/security';
import { createApiRouter } from './routes';

const WEBHOOK_PATH = '/api/payments/webhook';

export interface AppOptions {
  env: Env;
  logger: Logger;
  services: Services;
  /** Rate-limit store per limiter; omitted = in-memory (single process, tests). */
  rateLimitStore?: RateLimitStoreFactory;
}

/** Builds the Express app without binding a port, so tests can drive it with Supertest. */
export function createApp({
  env,
  logger,
  services,
  rateLimitStore = () => undefined,
}: AppOptions): Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', env.TRUST_PROXY);

  app.use(httpLogger(logger));
  app.use(securityHeaders());
  app.use(corsPolicy(env));
  app.use(
    express.json({
      limit: '100kb',
      // The payment webhook signature covers the exact bytes; keep them for that route only.
      verify: (req, _res, buf) => {
        if ((req as { url?: string }).url === WEBHOOK_PATH)
          (req as typeof req & { rawBody?: Buffer }).rawBody = Buffer.from(buf);
      },
    }),
  );
  app.use(cookieParser());

  if (env.apiDocsEnabled) app.use('/api/docs', docsRouter(env.APP_VERSION));
  app.use(
    '/api',
    apiRateLimiter(env, rateLimitStore),
    createApiRouter(services, env, rateLimitStore),
  );

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
