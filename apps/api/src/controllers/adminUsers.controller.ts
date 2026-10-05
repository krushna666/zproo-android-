import type { RequestHandler } from 'express';
import { validated } from '../middleware/validate';
import type { UserListQuery } from '../repositories/user.repository';
import type { UserService } from '../services/user.service';
import { sendSuccess } from '../utils/response';

export function createAdminUsersController(users: UserService) {
  const list: RequestHandler = async (req, res) => {
    sendSuccess(res, await users.listForAdmin(validated<UserListQuery>(req, 'query')));
  };
  return { list };
}
