import type { RouteObject } from 'react-router';
import { PageLoader } from '@/components/feedback/PageLoader';
import { RouteError } from '@/components/feedback/RouteError';
import { RedirectIfAuthenticated, RequireAuth, RequirePermission } from '@/features/auth/guards';
import { PublicLayout } from '@/layouts/PublicLayout';
import HomePage from '@/pages/HomePage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { PUBLIC_ROUTES } from './routeMap';

/** Route-level code splitting: each page (and the whole admin area) loads on demand. */
const page = (loader: () => Promise<{ default: React.ComponentType }>) => async () => ({
  Component: (await loader()).default,
});

const plannedPage = page(() => import('@/pages/PlannedPage'));

/** Shown while the first route's code loads (continues the index.html boot splash). */
const splash = <PageLoader fullscreen />;

const publicPlanned = PUBLIC_ROUTES.filter((r) => !r.requiresAuth);
const accountPlanned = PUBLIC_ROUTES.filter((r) => r.requiresAuth);

export const routes: RouteObject[] = [
  {
    path: '/',
    element: <PublicLayout />,
    errorElement: <RouteError />,
    hydrateFallbackElement: splash,
    children: [
      // Eager: the landing page must paint without waiting for a second chunk.
      { index: true, Component: HomePage },
      { path: '/about', lazy: page(() => import('@/pages/company/AboutPage')) },
      { path: '/terms', lazy: page(() => import('@/pages/company/TermsPage')) },
      { path: '/privacy', lazy: page(() => import('@/pages/company/PrivacyPage')) },
      { path: '/refund-policy', lazy: page(() => import('@/pages/company/RefundPolicyPage')) },
      { path: '/flights', lazy: page(() => import('@/pages/flights/FlightsPage')) },
      { path: '/flights/results', lazy: page(() => import('@/pages/flights/FlightResultsPage')) },
      { path: '/flights/:id', lazy: page(() => import('@/pages/flights/FlightDetailsPage')) },
      { path: '/buses', lazy: page(() => import('@/pages/buses/BusesPage')) },
      { path: '/buses/results', lazy: page(() => import('@/pages/buses/BusResultsPage')) },
      { path: '/buses/:id', lazy: page(() => import('@/pages/buses/BusDetailsPage')) },
      { path: '/buses/:id/seats', lazy: page(() => import('@/pages/buses/BusSeatsPage')) },
      ...publicPlanned.map((meta) => ({ path: meta.path, handle: meta, lazy: plannedPage })),
      {
        element: <RequireAuth />,
        children: [
          { path: '/profile', lazy: page(() => import('@/pages/account/ProfilePage')) },
          { path: '/bookings', lazy: page(() => import('@/pages/account/MyBookingsPage')) },
          {
            path: '/bookings/:id',
            lazy: page(() => import('@/pages/account/BookingRedirectPage')),
          },
          // Checkout: booking needs an account (tickets and payments belong to a user).
          {
            path: '/flights/booking',
            lazy: page(() => import('@/pages/flights/FlightTravellersPage')),
          },
          { path: '/flights/review', lazy: page(() => import('@/pages/flights/FlightReviewPage')) },
          {
            path: '/flights/payment',
            lazy: page(() => import('@/pages/checkout/PaymentPage')),
          },
          {
            path: '/flights/confirmation',
            lazy: page(() => import('@/pages/checkout/ConfirmationPage')),
          },
          { path: '/buses/booking', lazy: page(() => import('@/pages/buses/BusTravellersPage')) },
          { path: '/buses/review', lazy: page(() => import('@/pages/buses/BusReviewPage')) },
          { path: '/buses/payment', lazy: page(() => import('@/pages/checkout/PaymentPage')) },
          {
            path: '/buses/confirmation',
            lazy: page(() => import('@/pages/checkout/ConfirmationPage')),
          },
          ...accountPlanned.map((meta) => ({ path: meta.path, handle: meta, lazy: plannedPage })),
        ],
      },
      // Eager: also used by the error boundary, so it is already in the main bundle.
      { path: '*', Component: NotFoundPage },
    ],
  },
  {
    lazy: async () => ({ Component: (await import('@/layouts/AuthLayout')).AuthLayout }),
    errorElement: <RouteError />,
    hydrateFallbackElement: splash,
    children: [
      {
        element: <RedirectIfAuthenticated />,
        children: [
          { path: '/login', lazy: page(() => import('@/pages/auth/LoginPage')) },
          { path: '/signup', lazy: page(() => import('@/pages/auth/SignupPage')) },
          { path: '/verify-otp', lazy: page(() => import('@/pages/auth/VerifyOtpPage')) },
          { path: '/forgot-password', lazy: page(() => import('@/pages/auth/ForgotPasswordPage')) },
          { path: '/reset-password', lazy: page(() => import('@/pages/auth/ResetPasswordPage')) },
        ],
      },
    ],
  },
  // Printable e-ticket: its own page (no site header/footer) so it prints cleanly.
  {
    element: <RequireAuth />,
    errorElement: <RouteError />,
    hydrateFallbackElement: splash,
    children: [
      { path: '/tickets/:reference', lazy: page(() => import('@/pages/account/TicketPage')) },
    ],
  },
  {
    path: '/admin',
    element: <RequirePermission permission="admin:access" />,
    errorElement: <RouteError />,
    hydrateFallbackElement: splash,
    children: [
      {
        lazy: async () => ({ Component: (await import('@/layouts/AdminLayout')).AdminLayout }),
        children: [
          {
            index: true,
            handle: {
              path: '/admin',
              title: 'Admin dashboard',
              description: 'Users, bookings, revenue, refunds and active drivers at a glance.',
              phase: 18,
            },
            lazy: plannedPage,
          },
          { path: 'users', lazy: page(() => import('@/pages/admin/AdminUsersPage')) },
          { path: ':section', lazy: page(() => import('@/pages/admin/AdminSectionPage')) },
        ],
      },
    ],
  },
];
