import type { AdminUserRow, Paginated, RoleName, UserStatus } from '@zproo/types';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { apiGet } from '@/services/http';

export interface AdminUserFilters {
  search: string;
  role: RoleName | '';
  status: UserStatus | '';
  page: number;
  limit: number;
}

export const adminKeys = {
  users: (filters: AdminUserFilters) => ['admin', 'users', filters] as const,
};

export function useAdminUsers(filters: AdminUserFilters) {
  return useQuery({
    queryKey: adminKeys.users(filters),
    queryFn: () =>
      apiGet<Paginated<AdminUserRow>>('/admin/users', {
        params: {
          page: filters.page,
          limit: filters.limit,
          ...(filters.search && { search: filters.search }),
          ...(filters.role && { role: filters.role }),
          ...(filters.status && { status: filters.status }),
        },
      }),
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  });
}
