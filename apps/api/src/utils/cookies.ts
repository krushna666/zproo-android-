import type { CookieOptions, Request, Response } from 'express';
import type { Env } from '../config/env';
import { AUTH } from '../config/constants';
import { randomToken } from './crypto';

type CookieEnv = Pick<Env, 'isProduction' | 'COOKIE_DOMAIN'>;

function refreshCookieOptions(env: CookieEnv): CookieOptions {
  return {
    httpOnly: true, // unreadable by JavaScript, so XSS cannot steal it
    secure: env.isProduction, // HTTPS only in production (local dev runs on http)
    sameSite: 'strict', // never sent on cross-site requests (CSRF), plus requireCsrf on the routes
    path: AUTH.refreshCookiePath, // only sent to auth endpoints
    ...(env.COOKIE_DOMAIN && { domain: env.COOKIE_DOMAIN }),
  };
}

/** The CSRF cookie must be readable by the web app (it echoes it in a header), site-wide. */
function csrfCookieOptions(env: CookieEnv): CookieOptions {
  return {
    httpOnly: false,
    secure: env.isProduction,
    sameSite: 'strict',
    path: '/',
    ...(env.COOKIE_DOMAIN && { domain: env.COOKIE_DOMAIN }),
  };
}

/** Sets the refresh token and a fresh double-submit CSRF token with the same lifetime. */
export function setRefreshCookie(res: Response, token: string, maxAgeMs: number, env: CookieEnv) {
  res.cookie(AUTH.refreshCookieName, token, { ...refreshCookieOptions(env), maxAge: maxAgeMs });
  res.cookie(AUTH.csrfCookieName, randomToken(24), { ...csrfCookieOptions(env), maxAge: maxAgeMs });
}

export function clearRefreshCookie(res: Response, env: CookieEnv) {
  res.clearCookie(AUTH.refreshCookieName, refreshCookieOptions(env));
  res.clearCookie(AUTH.csrfCookieName, csrfCookieOptions(env));
}

export function readRefreshCookie(req: Request): string | undefined {
  const value: unknown = req.cookies?.[AUTH.refreshCookieName];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}
