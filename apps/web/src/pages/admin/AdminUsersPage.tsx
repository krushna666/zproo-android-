import { RoleName, UserStatus } from '@zproo/types';
import { Badge, Button, Card, Input, Skeleton } from '@zproo/ui';
import { ChevronLeft, ChevronRight, Search, Users } from 'lucide-react';
import { useState } from 'react';
import { Seo } from '@/components/seo/Seo';
import { useAdminUsers, type AdminUserFilters } from '@/features/admin/api';
import { errorMessage } from '@/features/auth/errors';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';

const dateFormat = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});
const label = (value: string) =>
  value
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/^\w/, (c) => c.toUpperCase());
const selectClass =
  'h-11 rounded-xl border border-border bg-card px-3 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

export default function AdminUsersPage() {
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<Omit<AdminUserFilters, 'search'>>({
    role: '',
    status: '',
    page: 1,
    limit: 20,
  });
  const debouncedSearch = useDebouncedValue(search.trim());
  const query = useAdminUsers({ ...filters, search: debouncedSearch });
  const data = query.data;
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;

  return (
    <div className="space-y-6">
      <Seo title="Users · Admin" noIndex />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-xl bg-primary-light text-primary">
            <Users aria-hidden className="size-5" />
          </span>
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">Users</h1>
            <p className="text-sm text-muted">
              {data ? `${data.total.toLocaleString('en-IN')} users` : 'Loading…'}
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search
            aria-hidden
            className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted"
          />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setFilters((f) => ({ ...f, page: 1 }));
            }}
            placeholder="Search name, mobile or email"
            aria-label="Search users"
            className="pl-10"
          />
        </div>
        <select
          aria-label="Filter by role"
          value={filters.role}
          onChange={(e) =>
            setFilters((f) => ({ ...f, role: e.target.value as AdminUserFilters['role'], page: 1 }))
          }
          className={selectClass}
        >
          <option value="">All roles</option>
          {Object.values(RoleName).map((r) => (
            <option key={r} value={r}>
              {label(r)}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter by status"
          value={filters.status}
          onChange={(e) =>
            setFilters((f) => ({
              ...f,
              status: e.target.value as AdminUserFilters['status'],
              page: 1,
            }))
          }
          className={selectClass}
        >
          <option value="">All statuses</option>
          {Object.values(UserStatus).map((s) => (
            <option key={s} value={s}>
              {label(s)}
            </option>
          ))}
        </select>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-background text-xs font-bold uppercase tracking-wider text-muted">
              <tr>
                <th scope="col" className="px-4 py-3">
                  Name
                </th>
                <th scope="col" className="px-4 py-3">
                  Contact
                </th>
                <th scope="col" className="px-4 py-3">
                  Roles
                </th>
                <th scope="col" className="px-4 py-3">
                  Status
                </th>
                <th scope="col" className="px-4 py-3">
                  Joined
                </th>
                <th scope="col" className="px-4 py-3">
                  Last login
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border" aria-busy={query.isFetching}>
              {query.isPending &&
                Array.from({ length: 6 }, (_, i) => (
                  <tr key={i}>
                    <td colSpan={6} className="px-4 py-3">
                      <Skeleton className="h-6" />
                    </td>
                  </tr>
                ))}
              {query.isError && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-danger">
                    {errorMessage(query.error)}
                  </td>
                </tr>
              )}
              {data?.items.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-muted">
                    No users match these filters.
                  </td>
                </tr>
              )}
              {data?.items.map((u) => (
                <tr key={u.id} className="hover:bg-background/60">
                  <td className="px-4 py-3 font-semibold">{u.fullName}</td>
                  <td className="px-4 py-3">
                    <div>{u.phone ?? '—'}</div>
                    <div className="text-xs text-muted">{u.email ?? ''}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {u.roles.map((r) => (
                        <Badge key={r} variant={r === 'USER' ? 'outline' : 'soft'}>
                          {label(r)}
                        </Badge>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Badge
                      variant={
                        u.status === 'ACTIVE'
                          ? 'success'
                          : u.status === 'SUSPENDED'
                            ? 'danger'
                            : 'warning'
                      }
                    >
                      {label(u.status)}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-muted">
                    {dateFormat.format(new Date(u.createdAt))}
                  </td>
                  <td className="px-4 py-3 text-muted">
                    {u.lastLoginAt ? dateFormat.format(new Date(u.lastLoginAt)) : 'Never'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <nav
          aria-label="Pagination"
          className="flex items-center justify-between gap-3 border-t border-border px-4 py-3 text-sm"
        >
          <span className="text-muted">
            Page {filters.page} of {totalPages}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={filters.page <= 1}
              onClick={() => setFilters((f) => ({ ...f, page: f.page - 1 }))}
            >
              <ChevronLeft aria-hidden /> Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={filters.page >= totalPages}
              onClick={() => setFilters((f) => ({ ...f, page: f.page + 1 }))}
            >
              Next <ChevronRight aria-hidden />
            </Button>
          </div>
        </nav>
      </Card>
    </div>
  );
}
