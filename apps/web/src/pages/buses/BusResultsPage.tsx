import { findCity } from '@zproo/config';
import {
  addDays,
  BUS_MAX_DAYS_AHEAD,
  busSearchInputFromParams,
  busSearchSchema,
  todayInIst,
  type BusSearch,
} from '@zproo/validation';
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  EmptyState,
  FormAlert,
  Sheet,
  SheetContent,
  Skeleton,
} from '@zproo/ui';
import { Bus, Pencil, SearchX, SlidersHorizontal, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Seo } from '@/components/seo/Seo';
import { useBusSearch } from '@/features/buses/api';
import { BusCard } from '@/features/buses/components/BusCard';
import { BusFiltersPanel } from '@/features/buses/components/BusFiltersPanel';
import { DateStrip } from '@/components/results/DateStrip';
import { SortChips } from '@/components/results/SortChips';
import {
  activeBusFilterCount,
  activeChips,
  applyBusFilters,
  BUS_SORTS,
  busFacets,
  EMPTY_BUS_FILTERS,
  readBusFilters,
  sortBuses,
  writeBusFilters,
  type BusFilters,
  type BusSortId,
} from '@/features/buses/filters';
import { shortDate } from '@/features/buses/format';
import { DemoBanner } from '@/features/checkout/DemoBanner';
import { BusSearchForm } from '@/features/search/forms/BusSearchForm';
import { busesUrl } from '@/features/search/url';
import { userMessage } from '@/lib/apiErrors';

const cityName = (code: string) => findCity(code)?.name ?? code;

export default function BusResultsPage() {
  const [params] = useSearchParams();
  const input = busSearchInputFromParams(params);
  // Re-validated on every visit: a date that became "past" at midnight IST is caught here.
  const parsed = busSearchSchema.safeParse(input);
  if (!parsed.success) return <InvalidSearch input={input} issues={parsed.error.issues} />;
  const s = parsed.data;
  // Remount per route and date (filters live in the URL, so they survive).
  return <Results key={`${s.from}-${s.to}-${s.date}`} search={s} />;
}

/** A bad deep link: explain, and pre-fill the widget with whatever was valid. */
function InvalidSearch({
  input,
  issues,
}: {
  input: { from: string; to: string; date: string };
  issues: { path: PropertyKey[]; message: string }[];
}) {
  const valid = (key: 'from' | 'to' | 'date') => !issues.some((i) => i.path[0] === key);
  const fromCity = findCity(input.from)?.code;
  const toCity = findCity(input.to)?.code;
  const messages = [...new Set(issues.map((i) => i.message))];
  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-6" data-testid="bus-results-error">
      <Seo title="Search buses" noIndex />
      <h1 className="text-[28px] font-extrabold tracking-tight">Search buses</h1>
      <FormAlert>That search can't be shown. {messages.join('. ')}.</FormAlert>
      <div className="rounded-[1.75rem] border border-border bg-card p-4 shadow-card">
        <BusSearchForm
          initial={{
            ...(valid('from') && fromCity ? { from: fromCity } : {}),
            ...(valid('to') && toCity ? { to: toCity } : {}),
            ...(valid('date') ? { date: input.date } : {}),
          }}
        />
      </div>
    </div>
  );
}

function Results({ search }: { search: BusSearch }) {
  const [params, setParams] = useSearchParams();
  const { data, isPending, error, refetch, isFetching } = useBusSearch(search);
  const { filters, sort } = useMemo(() => readBusFilters(params), [params]);
  const [editing, setEditing] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetFilters, setSheetFilters] = useState<BusFilters>(filters);

  const update = (next: BusFilters, nextSort: BusSortId = sort) =>
    setParams(writeBusFilters(params, next, nextSort), { replace: true, preventScrollReset: true });

  const trips = useMemo(() => data?.trips ?? [], [data]);
  const facets = useMemo(() => busFacets(trips), [trips]);
  const visible = useMemo(
    () => sortBuses(applyBusFilters(trips, filters), sort),
    [trips, filters, sort],
  );
  const from = cityName(search.from);
  const to = cityName(search.to);
  const operatorName = (code: string) =>
    facets.operators.find((o) => o.code === code)?.name ?? code;
  const chips = activeChips(filters, operatorName);
  // Other dates keep the filters and sort.
  const extra = writeBusFilters(new URLSearchParams(), filters, sort).toString();
  const hrefFor = (date: string) => busesUrl({ ...search, date }, extra);
  const today = todayInIst();
  const otherDates = [1, 2, 3]
    .map((n) => addDays(search.date, n))
    .concat(search.date > today ? [addDays(search.date, -1)] : []);

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <Seo title={`Buses from ${from} to ${to}`} noIndex />

      <header className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-border bg-card p-4 shadow-card">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-extrabold tracking-tight sm:text-[28px]">
            {from} → {to}
          </h1>
          <p className="text-sm text-muted">{shortDate(search.date)}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
          <Pencil aria-hidden /> Modify
        </Button>
      </header>

      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent className="max-w-4xl">
          <DialogTitle>Modify search</DialogTitle>
          <BusSearchForm initial={search} />
        </DialogContent>
      </Dialog>

      <div className="mt-4">
        <DateStrip
          testIdPrefix="bus-date-strip"
          maxDaysAhead={BUS_MAX_DAYS_AHEAD}
          date={search.date}
          hrefFor={hrefFor}
          prices={data && trips.length > 0 ? { [search.date]: data.filters.priceMin } : {}}
        />
      </div>

      {data?.demo && (
        <div className="mt-4">
          <DemoBanner service="bus" />
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[17rem_1fr]">
        <aside className="hidden lg:block" aria-label="Filters">
          <div className="sticky top-[calc(var(--header-height)+1rem)] max-h-[calc(100vh-var(--header-height)-2rem)] overflow-y-auto rounded-[14px] border border-border bg-card p-5 shadow-card">
            {trips.length > 0 ? (
              <BusFiltersPanel
                facets={facets}
                value={filters}
                onChange={(next) => update(next)}
                fromCity={from}
                toCity={to}
              />
            ) : (
              <Skeleton className="h-64 rounded-xl" />
            )}
          </div>
        </aside>

        <Sheet
          open={sheetOpen}
          onOpenChange={(open) => {
            setSheetOpen(open);
            if (open) setSheetFilters(filters);
          }}
        >
          <SheetContent aria-describedby={undefined} className="p-5">
            <DialogTitle className="sr-only">Filters</DialogTitle>
            <BusFiltersPanel
              facets={facets}
              value={sheetFilters}
              onChange={setSheetFilters}
              fromCity={from}
              toCity={to}
            />
            <div className="sticky bottom-0 mt-6 flex gap-3 bg-card pt-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setSheetFilters(EMPTY_BUS_FILTERS)}
              >
                Clear all
              </Button>
              <Button
                data-testid="bus-filters-apply"

                className="flex-1"
                onClick={() => {
                  update(sheetFilters);
                  setSheetOpen(false);
                }}
              >
                Apply
              </Button>
            </div>
          </SheetContent>
        </Sheet>

        <section
          aria-labelledby="results-heading"
          aria-busy={isPending || isFetching}
          className="min-w-0 space-y-4"
        >
          <div className="flex flex-wrap items-center gap-2">
            <h2
              id="results-heading"
              data-testid="bus-results-count"
              className="mr-auto text-sm font-semibold text-muted"
              aria-live="polite"
            >
              {isPending
                ? 'Searching...'
                : `${visible.length} bus${visible.length === 1 ? '' : 'es'} found`}
            </h2>
            <Button
              variant="outline"
              size="sm"
              className="lg:hidden"
              data-testid="bus-filters-open"
              onClick={() => {
                setSheetFilters(filters);
                setSheetOpen(true);
              }}
            >
              <SlidersHorizontal aria-hidden /> Filters
              {activeBusFilterCount(filters) > 0 && (
                <Badge className="ml-1">{activeBusFilterCount(filters)}</Badge>
              )}
            </Button>
          </div>

          <SortChips
            options={BUS_SORTS}
            value={sort}
            onChange={(s) => update(filters, s)}
            label="Sort buses"
            testIdPrefix="bus-sort"
          />

          {chips.length > 0 && (
            <ul className="flex flex-wrap gap-2" aria-label="Active filters">
              {chips.map((c) => (
                <li key={c.key}>
                  <button
                    type="button"
                    onClick={() => update(c.without)}
                    data-testid={`bus-filter-chip-${c.key}`}
                    aria-label={`Remove filter ${c.label}`}
                    className="inline-flex min-h-9 items-center gap-1 rounded-full bg-primary-light px-3 text-xs font-semibold text-primary"
                  >
                    {c.label} <X aria-hidden className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {error ? (
            <div
              data-testid="bus-results-error"
              role="alert"
              className="space-y-3 rounded-[14px] border border-danger/30 bg-card p-5"
            >
              <p className="text-sm font-semibold text-danger">{userMessage(error)}</p>
              <Button
                variant="outline"
                data-testid="bus-results-retry"
                onClick={() => void refetch()}
              >
                Retry
              </Button>
            </div>
          ) : isPending ? (
            <ul className="space-y-4" data-testid="bus-results-loading" aria-label="Loading buses">
              {[0, 1, 2, 3].map((i) => (
                <li key={i}>
                  <Skeleton className="h-44 rounded-[14px]" />
                </li>
              ))}
            </ul>
          ) : trips.length === 0 ? (
            <EmptyState
              data-testid="bus-results-empty"
              icon={Bus}
              title="No buses found for this date"
              description="Try another date:"
              actions={otherDates.map((d) => (
                <Button key={d} asChild variant="outline" size="sm">
                  <Link to={hrefFor(d)}>{shortDate(d)}</Link>
                </Button>
              ))}
            />
          ) : visible.length === 0 ? (
            <EmptyState
              data-testid="bus-results-empty"
              icon={SearchX}
              title="No buses match your filters"
              actions={
                <Button
                  data-testid="bus-results-clear"
                  variant="outline"
                  onClick={() => update(EMPTY_BUS_FILTERS)}
                >
                  Clear filters
                </Button>
              }
            />
          ) : (
            <ul className="space-y-4">
              {visible.map((trip) => (
                // content-visibility skips rendering off-screen cards in long lists.
                <li
                  key={trip.tripId}
                  className={
                    visible.length > 30
                      ? '[contain-intrinsic-size:auto_14rem] [content-visibility:auto]'
                      : undefined
                  }
                >
                  <BusCard trip={trip} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
