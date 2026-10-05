import { cn } from '@zproo/ui';
import { ArrowLeft } from 'lucide-react';
import { Suspense } from 'react';
import { Link, NavLink, Outlet } from 'react-router';
import { Logo } from '@/components/brand/Logo';
import { PageLoader } from '@/components/feedback/PageLoader';
import { Seo } from '@/components/seo/Seo';
import { ADMIN_NAV } from '@/config/navigation';

/**
 * Admin shell (separate lazy chunk). Access control is enforced by the API on every
 * `/api/admin/*` call; the route guard added in Phase 2 only improves UX.
 */
export function AdminLayout() {
  return (
    <div className="min-h-dvh bg-background lg:grid lg:grid-cols-[16rem_1fr]">
      <Seo title="Admin" noIndex />
      <aside className="border-b border-border bg-card lg:sticky lg:top-0 lg:h-dvh lg:overflow-y-auto lg:border-b-0 lg:border-r">
        <div className="flex items-center justify-between gap-3 px-5 py-4">
          <Link to="/admin" aria-label="Admin dashboard">
            <Logo height={28} />
          </Link>
          <span className="rounded-full bg-foreground px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
            Admin
          </span>
        </div>
        <nav aria-label="Admin">
          <ul className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-col lg:overflow-visible">
            {ADMIN_NAV.map(({ label, path, icon: Icon }) => (
              <li key={path}>
                <NavLink
                  to={path}
                  end={path === '/admin'}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-3 whitespace-nowrap rounded-xl px-3 py-2 text-sm font-semibold transition-colors',
                      isActive
                        ? 'bg-primary-light text-primary'
                        : 'text-foreground/75 hover:bg-background hover:text-foreground',
                    )
                  }
                >
                  <Icon aria-hidden className="size-4" />
                  {label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <div className="hidden px-3 pb-6 lg:block">
          <Link
            to="/"
            className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-muted hover:text-foreground"
          >
            <ArrowLeft aria-hidden className="size-4" /> Back to site
          </Link>
        </div>
      </aside>
      <main id="main" className="min-w-0 p-4 sm:p-6 lg:p-8">
        <Suspense fallback={<PageLoader />}>
          <Outlet />
        </Suspense>
      </main>
    </div>
  );
}
