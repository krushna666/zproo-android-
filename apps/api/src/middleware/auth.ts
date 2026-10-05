import type { Permission } from '@zproo/types';
import type { Request, RequestHandler } from 'express';
import type { RbacService } from '../services/rbac.service';
import type { TokenService } from '../services/token.service';
import { AuthenticationError, AuthorizationError } from '../utils/errors';

/** Requires a valid `Authorization: Bearer <access token>`; sets `req.auth`. */
export function authenticate(tokens: TokenService): RequestHandler {
  return async (req, _res, next) => {
    const header = req.headers.authorization;
    const match = header?.match(/^Bearer ([A-Za-z0-9._-]+)$/);
    if (!match?.[1]) throw new AuthenticationError('Please sign in to continue');
    req.auth = await tokens.verifyAccessToken(match[1]);
    next();
  };
}

/**
 * Requires every listed permission. Permissions are resolved server-side from the roles in the
 * verified token — never from anything the client sends.
 */
export function authorize(rbac: RbacService, ...required: Permission[]): RequestHandler {
  return async (req, _res, next) => {
    const auth = requireAuth(req);
    if (!(await rbac.hasAll(auth.roles, required))) throw new AuthorizationError();
    next();
  };
}

export function requireAuth(req: Request) {
  if (!req.auth) throw new AuthenticationError('Please sign in to continue');
  return req.auth;
}
