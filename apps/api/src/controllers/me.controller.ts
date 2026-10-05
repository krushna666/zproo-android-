import type { RequestHandler } from 'express';
import { requireAuth } from '../middleware/auth';
import { validated } from '../middleware/validate';
import type { UserService } from '../services/user.service';
import { sendSuccess } from '../utils/response';
import { requestContext } from './auth.controller';

export function createMeController(users: UserService) {
  const get: RequestHandler = async (req, res) => {
    sendSuccess(res, await users.getProfile(requireAuth(req).userId));
  };

  const update: RequestHandler = async (req, res) => {
    const changes = validated<{ fullName: string }>(req, 'body');
    sendSuccess(
      res,
      await users.updateProfile(requireAuth(req).userId, changes, requestContext(req)),
      'Profile updated',
    );
  };

  return { get, update };
}
