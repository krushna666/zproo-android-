import { hotelDestination } from '@zproo/catalog';
import type { HotelSummary } from '@zproo/types';
import {
  DEFAULT_ROOMS,
  hotelSearchInputFromParams,
  hotelSearchSchema,
  nightsBetween,
  parseRoomsParam,
  serializeRooms,
  type HotelSearch,
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
import { BedDouble, Pencil, SearchX, SlidersHorizontal } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { SortChips } from '@/components/results/SortChips';
import { Seo } from '@/components/seo/Seo';
import { DemoBanner } from '@/features/checkout/DemoBanner';
import { useHotelSearchPages } from '@/features/hotels/api';
import { HotelCard } from '@/features/hotels/components/HotelCard';
import { HotelFiltersPanel } from '@/features/hotels/components/HotelFiltersPanel';
import {
  activeHotelFilterCount,
  EMPTY_HOTEL_FILTERS,
  filterParams,
  HOTEL_SORT_OPTIONS,
  readHotelFilters,
  writeHotelFilters,
  type ResultFilters,
} from '@/features/hotels/filters';
import { guestsLabel, nightsLabel, stayRange } from '@/features/hotels/format';
import { hotelDetailsUrl } from '@/features/hotels/links';
import { HotelSearchForm } from '@/features/search/forms/HotelSearchForm';
import { userMessage } from '@/lib/apiErrors';

export default function HotelResultsPage() {
  const [params] = useSearchParams();
  const input = hotelSearchInputFromParams(params);
  // Re-validated on every visit: a check-in that became "past" at midnight IST is caught here.
  const parsed = hotelSearchSchema.safeParse(input);
  if (!parsed.success)
    return <InvalidSearch input={input} messages={parsed.error.issues.map((i) => i.message)} />;
  const s = parsed.data;
  const key = [s.destinationId, s.checkIn, s.checkOut, serializeRooms(s.rooms)].join(':');
  return <Results key={key} search={s} />;
}

/** A bad deep link: explain, and pre-fill the widget with what was valid (else 1 room, 2 adults). */
function InvalidSearch({ input, messages }: { input: Record<string, string>; messages: string[] }) {
  const destination = hotelDestination(input.destinationId ?? '');
  const rooms = parseRoomsParam(input.rooms);
  return (
    <div
      className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-6"
      data-testid="hotel-results-error"
    >
      <Seo title="Search hotels" noIndex />
      <h1 className="text-[28px] font-extrabold tracking-tight">Search hotels</h1>
      <FormAlert>That search can't be shown. {[...new Set(messages)].join('. ')}.</FormAlert>
      <div className="rounded-[1.75rem] border border-border bg-card p-4 shadow-card">
        <HotelSearchForm
          initial={{
            ...(destination ? { destinationId: destination.id } : {}),
            rooms:
              rooms && rooms.every((r) => r.adults >= 1 && r.childAges.every((a) => a !== null))
                ? rooms
                : [...DEFAULT_ROOMS],
          }}
        />
      </div>
    </div>
  );
}

function Results({ search }: { search: HotelSearch }) {
  const [params, setParams] = useSearchParams();
  const { filters, page } = useMemo(() => readHotelFilters(params), [params]);
  const [editing, setEditing] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetFilters, setSheetFilters] = useState<ResultFilters>(filters);
  const roomsParam = serializeRooms(search.rooms);
  const query = new URLSearchParams({
    destinationId: search.destinationId,
    checkIn: search.checkIn,
    checkOut: search.checkOut,
    rooms: roomsParam,
  });
  for (const [k, v] of filterParams(filters)) query.set(k, v);
  const results = useHotelSearchPages(query.toString(), page);
  const first = results.pages[0];
  const hotels: HotelSummary[] = results.pages.flatMap((p) => p.hotels);
  const total = first?.total ?? 0;
  const nights = nightsBetween(search.checkIn, search.checkOut);
  const destination = first?.destination ?? hotelDestination(search.destinationId);
  const stay = { checkIn: search.checkIn, checkOut: search.checkOut, rooms: roomsParam };

  const update = (next: ResultFilters) =>
    setParams(writeHotelFilters(params, next), { replace: true, preventScrollReset: true });
  const loadMore = () => {
    const next = new URLSearchParams(params);
    next.set('page', String(page + 1));
    setParams(next, { replace: true, preventScrollReset: true });
  };
  const loading = results.isPending && hotels.length === 0;

  const panel = (value: ResultFilters, onChange: (f: ResultFilters) => void) =>
    first ? (
      <HotelFiltersPanel facets={first.filters} value={value} onChange={onChange} />
    ) : (
      <Skeleton className="h-64 rounded-xl" />
    );

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <Seo title={`Hotels in ${destination?.name ?? 'your destination'}`} noIndex />

      <header className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-border bg-card p-4 shadow-card">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-extrabold tracking-tight sm:text-[28px]">
            Hotels in {destination?.name}
          </h1>
          <p className="text-sm text-muted">
            {stayRange(search.checkIn, search.checkOut)} ·{' '}
            <span data-testid="hotel-nights">{nightsLabel(nights)}</span> ·{' '}
            {guestsLabel(search.rooms)}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
          <Pencil aria-hidden /> Modify
        </Button>
      </header>

      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent className="max-w-5xl">
          <DialogTitle>Modify search</DialogTitle>
          <HotelSearchForm initial={search} />
        </DialogContent>
      </Dialog>

      {first?.demo && (
        <div className="mt-4">
          <DemoBanner service="hotel" />
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[17rem_1fr]">
        <aside className="hidden lg:block" aria-label="Filters">
          <div className="sticky top-[calc(var(--header-height)+1rem)] max-h-[calc(100vh-var(--header-height)-2rem)] overflow-y-auto rounded-[14px] border border-border bg-card p-5 shadow-card">
            {panel(filters, update)}
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
            {panel(sheetFilters, setSheetFilters)}
            <div className="sticky bottom-0 mt-6 flex gap-3 bg-card pt-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setSheetFilters({ ...EMPTY_HOTEL_FILTERS, sort: filters.sort })}
              >
                Clear all
              </Button>
              <Button
                data-testid="hotel-filters-apply"

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
          aria-busy={results.isFetching}
          className="min-w-0 space-y-4"
        >
          <div className="flex flex-wrap items-center gap-2">
            <h2
              id="results-heading"
              data-testid="hotel-results-count"
              className="mr-auto text-sm font-semibold text-muted"
              aria-live="polite"
            >
              {loading ? 'Searching...' : `${total} hotel${total === 1 ? '' : 's'} found`}
            </h2>
            <Button
              variant="outline"
              size="sm"
              className="lg:hidden"
              data-testid="hotel-filters-open"
              onClick={() => setSheetOpen(true)}
            >
              <SlidersHorizontal aria-hidden /> Filters
              {activeHotelFilterCount(filters) > 0 && (
                <Badge className="ml-1">{activeHotelFilterCount(filters)}</Badge>
              )}
            </Button>
          </div>

          <SortChips
            options={HOTEL_SORT_OPTIONS}
            value={filters.sort ?? 'popularity'}
            onChange={(sort) => update({ ...filters, sort })}
            label="Sort hotels"
            testIdPrefix="hotel-sort"
          />

          {results.error && hotels.length === 0 ? (
            <div
              data-testid="hotel-results-error"
              role="alert"
              className="space-y-3 rounded-[14px] border border-danger/30 bg-card p-5"
            >
              <p className="text-sm font-semibold text-danger">{userMessage(results.error)}</p>
              <Button
                variant="outline"
                data-testid="hotel-results-retry"
                onClick={() => void results.refetch()}
              >
                Retry
              </Button>
            </div>
          ) : loading ? (
            <ul
              className="space-y-4"
              data-testid="hotel-results-loading"
              aria-label="Loading hotels"
            >
              {[0, 1, 2, 3].map((i) => (
                <li key={i}>
                  <Skeleton className="h-56 rounded-[14px]" />
                </li>
              ))}
            </ul>
          ) : hotels.length === 0 ? (
            <EmptyState
              data-testid="hotel-results-empty"
              icon={activeHotelFilterCount(filters) > 0 ? SearchX : BedDouble}
              title="No hotels found"
              description={
                activeHotelFilterCount(filters) > 0
                  ? 'No hotel matches all your filters.'
                  : 'Try other dates or fewer rooms.'
              }
              actions={
                <>
                  {activeHotelFilterCount(filters) > 0 && (
                    <Button
                      data-testid="hotel-results-clear"
                      variant="outline"
                      onClick={() => update({ ...EMPTY_HOTEL_FILTERS, sort: filters.sort })}
                    >
                      Clear filters
                    </Button>
                  )}
                  <Button variant="outline" onClick={() => setEditing(true)}>
                    Change dates
                  </Button>
                </>
              }
            />
          ) : (
            <>
              <ul className="space-y-4">
                {hotels.map((hotel) => (
                  <li key={hotel.hotelId}>
                    <HotelCard
                      hotel={hotel}
                      nights={nights}
                      href={hotelDetailsUrl(hotel.hotelId, stay)}
                    />
                  </li>
                ))}
              </ul>
              {results.error && <FormAlert>{userMessage(results.error)}</FormAlert>}
              {hotels.length < total && (
                <div className="flex flex-col items-center gap-2 pt-2">
                  <p className="text-sm text-muted">
                    Showing {hotels.length} of {total}
                  </p>
                  <Button
                    variant="outline"
                    data-testid="hotel-results-load-more"
                    disabled={results.isFetching}
                    onClick={loadMore}
                  >
                    {results.isFetching ? 'Loading...' : 'Load more hotels'}
                  </Button>
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
