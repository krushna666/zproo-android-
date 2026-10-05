import { RoleName, UserStatus } from '@zproo/types';
import { paginationQuerySchema } from '@zproo/validation';
import { z } from 'zod';

export const adminUserListQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().max(100).optional(),
  role: z.enum(Object.values(RoleName) as [RoleName, ...RoleName[]]).optional(),
  status: z.enum(Object.values(UserStatus) as [UserStatus, ...UserStatus[]]).optional(),
});
