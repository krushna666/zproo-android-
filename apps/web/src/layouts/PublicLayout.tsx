import { Suspense } from 'react';
import { Outlet, ScrollRestoration } from 'react-router';
import { PageLoader } from '@/components/feedback/PageLoader';
import { MobileBottomNav } from '@/components/layout/MobileBottomNav';
import { SiteFooter } from '@/components/layout/SiteFooter';
import { SiteHeader } from '@/components/layout/SiteHeader';

export function PublicLayout() {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main id="main" tabIndex={-1} className="flex-1 focus:outline-none">
        <Suspense fallback={<PageLoader />}>
          <Outlet />
        </Suspense>
      </main>
      <SiteFooter />
      <MobileBottomNav />
      <ScrollRestoration />
    </div>
  );
}
