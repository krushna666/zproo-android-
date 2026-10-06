import { formatMoney } from '@zproo/utils';
import { ArrowRight, BadgePercent, BedDouble, ShieldCheck } from 'lucide-react';
import { lazy, Suspense } from 'react';
import { Link } from 'react-router';
import { Seo } from '@/components/seo/Seo';
import { HOTEL_DESTINATIONS } from '@/features/home/content';
import { SearchWidgetSkeleton } from '@/features/search/components/SearchWidgetSkeleton';
import { hotelCityUrl } from '@/features/search/url';
import { useHydrated } from '@/hooks/useHydrated';

const SearchWidget = lazy(async () => ({
  default: (await import('@/features/search/components/SearchWidget')).SearchWidget,
}));

const PROMISES = [
  {
    icon: BedDouble,
    title: 'Choose the exact room',
    text: 'Room types, beds, sizes and meal plans for every guest.',
  },
  {
    icon: ShieldCheck,
    title: 'Free cancellation shown upfront',
    text: 'The deadline and refund are shown before you pay.',
  },
  {
    icon: BadgePercent,
    title: 'Taxes shown separately',
    text: 'Per-night price, total for the stay and GST — no surprises.',
  },
];

export default function HotelsPage() {
  const hydrated = useHydrated();
  return (
    <>
      <Seo
        title="Hotels"
        description="Book hotels, resorts and villas in Goa, Mumbai, Jaipur, New Delhi, Bengaluru and Pune — compare rooms, meal plans and free-cancellation rates."
      />
      <section className="bg-gradient-to-b from-primary-light/60 to-background pb-8 pt-8 sm:pt-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Book hotels</h1>
          <p className="mt-2 text-muted">
            Hotels, resorts, villas and homestays — compare rooms and book in minutes.
          </p>
          <div className="mt-6">
            {hydrated ? (
              <Suspense fallback={<SearchWidgetSkeleton />}>
                <SearchWidget initial="HOTEL" />
              </Suspense>
            ) : (
              <SearchWidgetSkeleton />
            )}
          </div>
          <ul className="mt-6 grid gap-3 sm:grid-cols-3">
            {PROMISES.map(({ icon: Icon, title, text }) => (
              <li
                key={title}
                className="flex items-start gap-3 rounded-2xl border border-border bg-card p-4"
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary-light text-primary">
                  <Icon aria-hidden className="size-5" />
                </span>
                <span>
                  <span className="block text-sm font-bold">{title}</span>
                  <span className="block text-sm text-muted">{text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section
        aria-labelledby="hotel-cities"
        className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8"
      >
        <h2 id="hotel-cities" className="text-2xl font-extrabold tracking-tight">
          Popular destinations
        </h2>
        <p className="mt-1 text-sm text-muted">Indicative lowest prices per night.</p>
        <ul className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {HOTEL_DESTINATIONS.map((d) => (
            <li key={d.code}>
              <Link
                to={hotelCityUrl(d.code)}
                className="group flex h-full items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4 transition-colors hover:border-primary/40"
              >
                <span className="min-w-0">
                  <span className="block truncate font-bold">{d.city}</span>
                  <span className="block text-xs text-muted">
                    {d.tagline} · from {formatMoney(d.fromPaise)}
                  </span>
                </span>
                <ArrowRight aria-hidden className="size-4 shrink-0 text-primary" />
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
