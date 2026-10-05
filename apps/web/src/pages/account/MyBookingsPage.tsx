import type { BookingListItem, BookingStatus } from '@zproo/types';
import { Badge, Button, Skeleton } from '@zproo/ui';
import { formatMoney } from '@zproo/utils';
import { Bus, ChevronRight, Plane, Ticket } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { Seo } from '@/components/seo/Seo';
import { FormAlert } from '@/features/auth/components/FormAlert';
import { errorMessage } from '@/features/auth/errors';
import { useMyBookings } from '@/features/checkout/api';
import { confirmationUrl, paymentUrl } from '@/features/checkout/links';
import { travelDate } from '@/features/flights/format';

const STATUS: Record<
  BookingStatus,
  { label: string; tone: 'success' | 'warning' | 'danger' | 'outline' }
> = {
  INITIATED: { label: 'Started', tone: 'outline' },
  PENDING_PAYMENT: { label: 'Awaiting payment', tone: 'warning' },
  CONFIRMED: { label: 'Confirmed', tone: 'success' },
  COMPLETED: { label: 'Completed', tone: 'outline' },
  CANCELLED: { label: 'Cancelled', tone: 'danger' },
  REFUND_PENDING: { label: 'Refund pending', tone: 'warning' },
  REFUNDED: { label: 'Refunded', tone: 'outline' },
};

const TABS = [
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'past', label: 'Past' },
  { id: 'cancelled', label: 'Cancelled' },
] as const;
type Tab = (typeof TABS)[number]['id'];

const today = () => new Date().toISOString().slice(0, 10);

function tabOf(b: BookingListItem): Tab {
  if (b.status === 'CANCELLED' || b.status === 'REFUNDED' || b.status === 'REFUND_PENDING')
    return 'cancelled';
  return b.travelDate >= today() && b.status !== 'COMPLETED' ? 'upcoming' : 'past';
}

const serviceOf = (b: BookingListItem) => (b.serviceType === 'BUS' ? 'bus' : 'flight');

/** The signed-in customer's flight and bus bookings. */
export default function MyBookingsPage() {
  const { data, isPending, error } = useMyBookings();
  const [tab, setTab] = useState<Tab>('upcoming');
  const bookings = (data ?? []).filter((b) => tabOf(b) === tab);

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8 sm:px-6 sm:py-12">
      <Seo title="My bookings" noIndex />
      <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">My bookings</h1>

      <div role="tablist" aria-label="Bookings" className="flex gap-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={
              tab === t.id
                ? 'rounded-full bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground'
                : 'rounded-full border border-border bg-card px-4 py-1.5 text-sm font-semibold hover:border-foreground/30'
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      {error ? (
        <FormAlert>{errorMessage(error)}</FormAlert>
      ) : isPending ? (
        <div className="space-y-3" aria-busy>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
      ) : bookings.length === 0 ? (
        <div className="flex flex-col items-center rounded-2xl border border-dashed border-border bg-card px-6 py-12 text-center">
          <span className="grid size-12 place-items-center rounded-2xl bg-primary-light text-primary">
            <Ticket aria-hidden className="size-6" />
          </span>
          <h2 className="mt-4 text-lg font-bold">No {tab} bookings</h2>
          <p className="mt-1 text-sm text-muted">Your flight and bus tickets will appear here.</p>
          <div className="mt-5 flex gap-3">
            <Button asChild>
              <Link to="/flights">Book flights</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/buses">Book buses</Link>
            </Button>
          </div>
        </div>
      ) : (
        <ul className="space-y-3">
          {bookings.map((b) => {
            const status = STATUS[b.status];
            const Icon = b.serviceType === 'BUS' ? Bus : Plane;
            const href =
              b.status === 'PENDING_PAYMENT'
                ? paymentUrl(serviceOf(b), b.reference)
                : confirmationUrl(serviceOf(b), b.reference);
            return (
              <li key={b.reference}>
                <Link
                  to={href}
                  className="flex items-center gap-4 rounded-2xl border border-border bg-card p-4 shadow-card transition-colors hover:border-primary/40"
                >
                  <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary-light text-primary">
                    <Icon aria-hidden className="size-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-bold">{b.title}</span>
                      <Badge variant={status.tone}>{status.label}</Badge>
                    </span>
                    <span className="block truncate text-sm text-muted">
                      {travelDate(b.travelDate)} · {b.subtitle}
                    </span>
                    <span className="block text-xs text-muted">{b.reference}</span>
                  </span>
                  <span className="text-right">
                    <span className="block font-extrabold tabular-nums">
                      {formatMoney(b.totalPaise)}
                    </span>
                    <ChevronRight aria-hidden className="ml-auto size-4 text-muted" />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
