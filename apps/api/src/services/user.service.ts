import type { AdminUserRow, Paginated, PublicUser } from '@zproo/types';
import { toAdminUserRow, toPublicUser, roleNames } from '../models/user.dto';
import type { UserListQuery, UserRepository } from '../repositories/user.repository';
import { AuthenticationError } from '../utils/errors';
import type { AuditService, RequestContext } from './audit.service';
import type { RbacService } from './rbac.service';

export class UserService {
  constructor(
    private readonly users: UserRepository,
    private readonly rbac: RbacService,
    private readonly audit: AuditService,
  ) {}

  async getProfile(userId: string): Promise<PublicUser> {
    const user = await this.users.findById(userId);
    // The access token outlived the account (deleted); treat as signed out.
    if (!user) throw new AuthenticationError('Please sign in to continue');
    return toPublicUser(user, await this.rbac.permissionsFor(roleNames(user)));
  }

  async updateProfile(
    userId: string,
    changes: { fullName: string },
    ctx: RequestContext,
  ): Promise<PublicUser> {
    const before = await this.users.findById(userId);
    if (!before) throw new AuthenticationError('Please sign in to continue');
    const user = await this.users.update(userId, { fullName: changes.fullName });
    await this.audit.record({
      action: 'USER_PROFILE_UPDATED',
      actorId: userId,
      entityType: 'User',
      entityId: userId,
      before: { fullName: before.fullName },
      after: { fullName: user.fullName },
      context: ctx,
    });
    return toPublicUser(user, await this.rbac.permissionsFor(roleNames(user)));
  }

  async listForAdmin(query: UserListQuery): Promise<Paginated<AdminUserRow>> {
    const { items, total } = await this.users.list(query);
    return { items: items.map(toAdminUserRow), page: query.page, limit: query.limit, total };
  }
}
