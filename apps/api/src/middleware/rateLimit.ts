import { ipKeyGenerator, rateLimit, type Store } from 'express-rate-limit';
import type { Request } from 'express';
import type { Env } from '../config/env';
import { AUTH } from '../config/constants';
import { RateLimitError } from '../utils/errors';

/** Creates a store for one limiter (Redis in running servers, in-memory when undefined). */
export type RateLimitStoreFactory = (prefix: string) => Store | undefined;

interface LimiterOptions {
  name: string;
  windowMs: number;
  limit: number;
  message: string;
  key?: (req: Request) => string | undefined;
  skip?: (req: Request) => boolean;
}

function limiter(storeFactory: RateLimitStoreFactory, options: LimiterOptions) {
  const store = storeFactory(`rl:${options.name}:`);
  return rateLimit({
    windowMs: options.windowMs,
    limit: options.limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    ...(store && { store }),
    // If Redis is unreachable, let requests through rather than taking the API down.
    // OTP guessing stays capped by the per-code attempt limit stored in PostgreSQL.
    passOnStoreError: true,
    ...(options.skip && { skip: options.skip }),
    ...(options.key && {
      // Fall back to the client IP when the request carries no key (validation will reject it anyway).
      keyGenerator: (req: Request) => options.key?.(req) ?? ipKeyGenerator(req.ip ?? ''),
    }),
    handler: (req, _res, next) => next(new RateLimitError(options.message, retryAfter(req))),
  });
}

/** Whole seconds until the caller's window resets (at least 1). */
function retryAfter(req: Request): number {
  const reset = (req as Request & { rateLimit?: { resetTime?: Date } }).rateLimit?.resetTime;
  return reset ? Math.max(1, Math.ceil((reset.getTime() - Date.now()) / 1000)) : 60;
}

/** Global per-IP limiter for the whole API. */
export function apiRateLimiter(
  env: Pick<Env, 'RATE_LIMIT_WINDOW_MS' | 'RATE_LIMIT_MAX'>,
  storeFactory: RateLimitStoreFactory,
) {
  return limiter(storeFactory, {
    name: 'api',
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    limit: env.RATE_LIMIT_MAX,
    message: 'Too many requests, please try again later',
    skip: (req) => req.path.startsWith('/health'),
  });
}

function bodyKey(req: Request, field: 'phone' | 'identifier'): string | undefined {
  const body = req.validated?.body as Record<string, unknown> | undefined;
  const value = body?.[field];
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'value' in value) return String(value.value);
  return undefined;
}

/**
 * Authentication limits. Per-target limits protect each phone/email/account whatever IP the
 * attacker uses; the per-IP limit is generous because many Indian mobile users share IPs (CGNAT).
 */
export function authRateLimiters(
  storeFactory: RateLimitStoreFactory,
  perIpLimits: { auth: number; otp: number } = { auth: 60, otp: AUTH.otpMaxSendsPerIpPerHour },
) {
  const otpKey = (req: Request) => bodyKey(req, 'phone') ?? bodyKey(req, 'identifier');
  return {
    perIp: limiter(storeFactory, {
      name: 'auth-ip',
      windowMs: 10 * 60_000,
      limit: perIpLimits.auth,
      message: 'Too many attempts from your network. Please try again in a few minutes.',
      skip: (req) => req.path === '/refresh' || req.path === '/logout',
    }),
    // Per flow (sign-in vs password reset), so one does not block the other.
    otpCooldown: limiter(storeFactory, {
      name: 'otp-cooldown',
      windowMs: AUTH.otpResendSeconds * 1000,
      limit: 1,
      message: 'Please wait before requesting another code.',
      key: (req) => {
        const target = otpKey(req);
        return target && `${req.path}:${target}`;
      },
    }),
    // Shared across flows: caps SMS/email volume to any one number or address.
    otpHourly: limiter(storeFactory, {
      name: 'otp-hourly',
      windowMs: 60 * 60_000,
      limit: AUTH.otpMaxSendsPerHour,
      message: 'Too many codes requested. Please try again in an hour.',
      key: otpKey,
    }),
    // Caps how many numbers one client can spam with codes.
    otpPerIp: limiter(storeFactory, {
      name: 'otp-ip',
      windowMs: 60 * 60_000,
      limit: perIpLimits.otp,
      message: 'Too many codes requested from your network. Please try again later.',
    }),
    otpVerify: limiter(storeFactory, {
      name: 'otp-verify',
      windowMs: 15 * 60_000,
      limit: 20,
      message: 'Too many attempts. Please try again later.',
      key: otpKey,
    }),
    // Per client and account: 10 tries in 15 minutes, then 429 with Retry-After.
    login: limiter(storeFactory, {
      name: 'login',
      windowMs: 15 * 60_000,
      limit: 10,
      message: 'Too many attempts. Please try again later.',
      key: (req) => {
        const identifier = bodyKey(req, 'identifier');
        return identifier && `${ipKeyGenerator(req.ip ?? '')}:${identifier}`;
      },
    }),
  };
}

/** Signed-in user for per-user limits (falls back to the IP before authentication). */
function userKey(req: Request): string | undefined {
  return (req as Request & { auth?: { userId?: string } }).auth?.userId;
}

/** Commerce limits: searches per client IP, bookings and payments per signed-in customer. */
export function commerceRateLimiters(storeFactory: RateLimitStoreFactory, searchLimit = 60) {
  return {
    search: limiter(storeFactory, {
      name: 'search',
      windowMs: 60_000,
      limit: searchLimit,
      message: 'Too many searches. Please try again in a minute.',
    }),
    book: limiter(storeFactory, {
      name: 'book',
      windowMs: 60_000,
      limit: 10,
      message: 'Too many booking attempts. Please try again in a minute.',
      key: userKey,
    }),
    payments: limiter(storeFactory, {
      name: 'payments',
      windowMs: 60_000,
      limit: 10,
      message: 'Too many payment attempts. Please try again in a minute.',
      key: userKey,
    }),
  };
}
