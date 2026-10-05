import { Permission } from '@zproo/types';
import { Router, type RequestHandler } from 'express';
import type { createAdminUsersController } from '../controllers/adminUsers.controller';
import { authorize } from '../middleware/auth';
import { validate } from '../middleware/validate';
import type { RbacService } from '../services/rbac.service';
import { adminUserListQuerySchema } from '../validators/admin.validators';

/** Every admin route requires a signed-in user with `admin:access`, plus its own permission. */
export function adminRoutes(
  deps: { users: ReturnType<typeof createAdminUsersController> },
  authenticate: RequestHandler,
  rbac: RbacService,
): Router {
  const router = Router();
  router.use(authenticate, authorize(rbac, Permission.ADMIN_ACCESS));
  router.get(
    '/users',
    authorize(rbac, Permission.USER_READ_ANY),
    validate({ query: adminUserListQuerySchema }),
    deps.users.list,
  );
  return router;
}
