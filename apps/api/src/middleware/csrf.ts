import { timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from 'express';
import type { Env } from '../config/env';
import { AUTH } from '../config/constants';
import { AuthorizationError } from '../utils/errors';
import { readRefreshCookie } from '../utils/cookies';

function sameToken(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/** Origin of the request from `Origin`, or from `Referer` when a browser omits Origin. */
function requestOrigin(header: (name: string) => string | undefined): string | null {
  const origin = header('origin');
  if (origin) return origin.replace(/\/$/, '');
  const referer = header('referer');
  if (!referer) return null;
  try {
    return new URL(referer).origin;
  } catch {
    return 'invalid';
  }
}

/**
 * CSRF protection for the only cookie-authenticated endpoints (/auth/refresh, /auth/logout).
 * Two independent checks, on top of the SameSite=Strict refresh cookie:
 *  1. A browser Origin (or Referer) must be one of the allowed web origins.
 *  2. Double submit: the `X-CSRF-Token` header must equal the `zp_csrf` cookie. A cross-site page
 *     can neither read that cookie nor set the header.
 * Requests without a refresh cookie carry no ambient authority and are passed through (they get
 * 401 from the handler).
 */
export function requireCsrf(env: Pick<Env, 'corsOrigins'>): RequestHandler {
  return (req, _res, next) => {
    const origin = requestOrigin((name) => req.get(name));
    if (origin !== null && !env.corsOrigins.includes(origin))
      throw new AuthorizationError('Request origin not allowed');
    if (!readRefreshCookie(req)) return next();
    const cookie: unknown = req.cookies?.[AUTH.csrfCookieName];
    const header = req.get(AUTH.csrfHeader);
    if (typeof cookie !== 'string' || !cookie || !header || !sameToken(cookie, header))
      throw new AuthorizationError('Missing or invalid CSRF token');
    next();
  };
}
