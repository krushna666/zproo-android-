import { findAirport } from '@zproo/config';
import { CABIN_CLASS_LABELS, type FlightOffer } from '@zproo/types';
import { addDays, flightSearchSchema, todayIso, type FlightSearch } from '@zproo/validation';
import {
  Badge,
  Button,
  cn,
  Dialog,
  DialogContent,
  DialogTitle,
  Sheet,
  SheetContent,
  Skeleton,
} from '@zproo/ui';
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Pencil,
  PlaneTakeoff,
  SlidersHorizontal,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { Seo } from '@/components/seo/Seo';
import { FormAlert } from '@/features/auth/components/FormAlert';
import { errorMessage } from '@/features/auth/errors';
import { useFlightSearch } from '@/features/flights/api';
import { DemoBanner } from '@/features/checkout/DemoBanner';
import { FiltersPanel } from '@/features/flights/components/FiltersPanel';
import { FlightCard } from '@/features/flights/components/FlightCard';
import { useFlightDraft } from '@/features/flights/draft';
import {
  activeFilterCount,
  applyFilters,
  EMPTY_FILTERS,
  facets as buildFacets,
  SORTS,
  sortOffers,
  type FlightFilters,
  type SortId,
} from '@/features/flights/filters';
import { inr, travelDate, travellersLabel } from '@/features/flights/format';
import { offerUrl } from '@/features/flights/links';
import { FlightSearchForm } from '@/features/search/forms/FlightSearchForm';
import { flightsUrl, parseFlightSearch } from '@/features/search/url';

const cityOf = (code: string) => findAirport(code)?.city ?? code;

export default function FlightResultsPage() {
  const [params] = useSearchParams();
  const parsed = useMemo(() => flightSearchSchema.safeParse(parseFlightSearch(params)), [params]);
  const search = parsed.success ? parsed.data : null;
  // Remount per search so selections and filters start fresh.
  return search ? <Results key={params.toString()} search={search} /> : <InvalidSearch />;
}

function InvalidSearch() {
  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-6">
      <Seo title="Flight results" noIndex />
      <h1 className="text-2xl font-extrabold tracking-tight">Search flights</h1>
      <FormAlert>
        That search isn't complete. Choose your cities and dates to see flights.
      </FormAlert>
      <div className="rounded-[1.75rem] border border-border bg-card p-4 shadow-card">
        <FlightSearchForm />
      </div>
    </div>
  );
}

function Results({ search }: { search: FlightSearch }) {
  const navigate = useNavigate();
  const startDraft = useFlightDraft((s) => s.start);
  const { data, isPending, error, refetch } = useFlightSearch(search);
  const [legIndex, setLegIndex] = useState(0);
  const [selected, setSelected] = useState<(FlightOffer | undefined)[]>([]);
  const [filters, setFilters] = useState<FlightFilters[]>([]);
  const [sort, setSort] = useState<SortId>('BEST');
  const [editing, setEditing] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const pax = { adults: search.adults, children: search.children, infants: search.infants };
  const legs = data?.legs ?? [];
  const leg = legs[legIndex];
  const legFilters = filters[legIndex] ?? EMPTY_FILTERS;
  const facets = useMemo(() => buildFacets(leg?.offers ?? []), [leg]);
  const visible = useMemo(
    () => sortOffers(applyFilters(leg?.offers ?? [], legFilters), sort),
    [leg, legFilters, sort],
  );
  const multiLeg = legs.length > 1;
  const allChosen = multiLeg && legs.every((_, i) => selected[i]);
  const total = selected.reduce((sum, o) => sum + (o?.totalPaise ?? 0), 0);

  const setLegFilters = (next: FlightFilters) =>
    setFilters((all) => {
      const copy = [...all];
      copy[legIndex] = next;
      return copy;
    });

  const proceed = (offers: FlightOffer[]) => {
    startDraft({
      offerIds: offers.map((o) => o.id),
      pax,
      expectedTotalPaise: offers.reduce((sum, o) => sum + o.totalPaise, 0),
      searchUrl: flightsUrl(search),
    });
    void navigate('/flights/booking');
  };

  const choose = (offer: FlightOffer) => {
    if (!multiLeg) return proceed([offer]);
    const next = [...selected];
    next[legIndex] = offer;
    setSelected(next);
    const pending = legs.findIndex((_, i) => !next[i]);
    if (pending !== -1) {
      setLegIndex(pending);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const first = search.legs[0];
  const last = search.legs.at(-1);
  const title =
    search.tripType === 'MULTI_CITY'
      ? search.legs
          .map((l) => l.from)
          .concat(last?.to ?? '')
          .join(' → ')
      : `${cityOf(first?.from ?? '')} ${search.tripType === 'ROUND_TRIP' ? '⇄' : '→'} ${cityOf(first?.to ?? '')}`;
  const shiftDate = (days: number) => {
    if (!first) return;
    const date = addDays(first.date, days);
    const returnDate = search.returnDate && search.returnDate < date ? date : search.returnDate;
    void navigate(flightsUrl({ ...search, legs: [{ ...first, date }], returnDate }));
  };
  const canGoEarlier = first ? first.date > todayIso() : false;

  const filterButton = (
    <Button variant="outline" size="sm" className="lg:hidden" onClick={() => setFiltersOpen(true)}>
      <SlidersHorizontal aria-hidden /> Filters
      {activeFilterCount(legFilters) > 0 && (
        <Badge className="ml-1">{activeFilterCount(legFilters)}</Badge>
      )}
    </Button>
  );

  return (
    <div className={cn('mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8', allChosen && 'pb-28')}>
      <Seo title={`Flights: ${title}`} noIndex />

      <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4 shadow-card">
        <div className="min-w-0">
          <h1 className="truncate text-lg font-extrabold tracking-tight sm:text-xl">{title}</h1>
          <p className="text-sm text-muted">
            {search.tripType === 'MULTI_CITY'
              ? `${search.legs.length} flights`
              : `${travelDate(first?.date ?? '')}${search.returnDate ? ` – ${travelDate(search.returnDate)}` : ''}`}
            {' · '}
            {travellersLabel(pax)} · {CABIN_CLASS_LABELS[search.cabin]}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
          <Pencil aria-hidden /> Modify search
        </Button>
      </header>

      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent className="max-w-5xl">
          <DialogTitle>Modify search</DialogTitle>
          <FlightSearchForm initial={search} />
        </DialogContent>
      </Dialog>

      {data?.demo && (
        <div className="mt-4">
          <DemoBanner />
        </div>
      )}

      {multiLeg && (
        <div
          role="tablist"
          aria-label="Flights in this trip"
          className="mt-4 flex gap-2 overflow-x-auto pb-1"
        >
          {legs.map((l, i) => (
            <button
              key={`${l.from}-${l.to}-${i}`}
              role="tab"
              type="button"
              aria-selected={i === legIndex}
              onClick={() => setLegIndex(i)}
              className={cn(
                'min-w-[11rem] shrink-0 rounded-2xl border px-4 py-3 text-left transition-colors',
                i === legIndex
                  ? 'border-primary bg-primary-light'
                  : 'border-border bg-card hover:border-foreground/30',
              )}
            >
              <span className="block text-xs font-semibold text-muted">
                {search.tripType === 'ROUND_TRIP'
                  ? i === 0
                    ? 'Departure'
                    : 'Return'
                  : `Flight ${i + 1}`}{' '}
                · {travelDate(l.date)}
              </span>
              <span className="block font-bold">
                {l.from} → {l.to}
              </span>
              <span className="block text-xs text-muted">
                {selected[i]
                  ? `${selected[i]?.flightNumber} · ${inr(selected[i]?.totalPaise ?? 0)}`
                  : 'Not selected'}
              </span>
            </button>
          ))}
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[17rem_1fr]">
        <aside className="hidden lg:block">
          <div className="sticky top-[calc(var(--header-height)+1rem)] rounded-2xl border border-border bg-card p-5 shadow-card">
            {leg && (
              <FiltersPanel
                facets={facets}
                value={legFilters}
                onChange={setLegFilters}
                fromCity={cityOf(leg.from)}
                toCity={cityOf(leg.to)}
              />
            )}
          </div>
        </aside>

        <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
          <SheetContent aria-describedby={undefined} className="p-5">
            <DialogTitle className="sr-only">Filters</DialogTitle>
            {leg && (
              <FiltersPanel
                facets={facets}
                value={legFilters}
                onChange={setLegFilters}
                fromCity={cityOf(leg.from)}
                toCity={cityOf(leg.to)}
              />
            )}
            <Button className="mt-6 w-full" onClick={() => setFiltersOpen(false)}>
              Show {visible.length} flight{visible.length === 1 ? '' : 's'}
            </Button>
          </SheetContent>
        </Sheet>

        <section
          aria-labelledby="results-heading"
          aria-busy={isPending}
          className="min-w-0 space-y-4"
        >
          <div className="flex flex-wrap items-center gap-2">
            <h2
              id="results-heading"
              className="mr-auto text-sm font-semibold text-muted"
              aria-live="polite"
            >
              {isPending
                ? 'Searching flights…'
                : leg
                  ? `${visible.length} of ${leg.offers.length} flights · ${cityOf(leg.from)} to ${cityOf(leg.to)}`
                  : ''}
            </h2>
            {filterButton}
          </div>

          <div
            role="radiogroup"
            aria-label="Sort flights"
            className="flex gap-2 overflow-x-auto pb-1"
          >
            {SORTS.map((s) => (
              <button
                key={s.id}
                type="button"
                role="radio"
                aria-checked={sort === s.id}
                onClick={() => setSort(s.id)}
                className={cn(
                  'shrink-0 rounded-full border px-4 py-1.5 text-sm font-semibold transition-colors',
                  sort === s.id
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-card hover:border-foreground/30',
                )}
              >
                {s.label}
              </button>
            ))}
          </div>

          {search.tripType === 'ONE_WAY' && (
            <div className="flex items-center justify-between gap-2">
              <Button
                variant="ghost"
                size="sm"
                disabled={!canGoEarlier}
                onClick={() => shiftDate(-1)}
              >
                <ChevronLeft aria-hidden /> Previous day
              </Button>
              <Button variant="ghost" size="sm" onClick={() => shiftDate(1)}>
                Next day <ChevronRight aria-hidden />
              </Button>
            </div>
          )}

          {error ? (
            <div className="space-y-3">
              <FormAlert>{errorMessage(error)}</FormAlert>
              <Button variant="outline" onClick={() => void refetch()}>
                Try again
              </Button>
            </div>
          ) : isPending ? (
            <ul className="space-y-4" aria-hidden>
              {[0, 1, 2, 3].map((i) => (
                <li key={i}>
                  <Skeleton className="h-36 rounded-2xl" />
                </li>
              ))}
            </ul>
          ) : visible.length === 0 ? (
            <EmptyResults
              filtered={(leg?.offers.length ?? 0) > 0}
              onClear={() => setLegFilters(EMPTY_FILTERS)}
            />
          ) : (
            <ul className="space-y-4">
              {visible.map((offer) => (
                <li key={offer.id}>
                  <FlightCard
                    offer={offer}
                    detailsHref={offerUrl(offer.id, pax)}
                    actionLabel={
                      multiLeg
                        ? selected[legIndex]?.id === offer.id
                          ? 'Selected'
                          : 'Select'
                        : 'Book'
                    }
                    selected={selected[legIndex]?.id === offer.id}
                    onAction={() => choose(offer)}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {allChosen && (
        <div className="fixed inset-x-0 bottom-[var(--bottom-nav-height)] z-30 border-t border-border bg-card/95 backdrop-blur lg:bottom-0">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
            <div>
              <p className="text-xs text-muted">Total for {travellersLabel(pax)}</p>
              <p className="text-xl font-extrabold tabular-nums">{inr(total)}</p>
            </div>
            <Button size="lg" onClick={() => proceed(selected as FlightOffer[])}>
              Continue <ArrowRight aria-hidden />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function EmptyResults({ filtered, onClear }: { filtered: boolean; onClear: () => void }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-border bg-card px-6 py-12 text-center">
      <span className="grid size-12 place-items-center rounded-2xl bg-primary-light text-primary">
        <PlaneTakeoff aria-hidden className="size-6" />
      </span>
      {filtered ? (
        <>
          <h3 className="mt-4 text-lg font-bold">No flights match these filters</h3>
          <p className="mt-1 text-sm text-muted">Try removing a filter to see more options.</p>
          <Button variant="outline" className="mt-5" onClick={onClear}>
            Clear filters
          </Button>
        </>
      ) : (
        <>
          <h3 className="mt-4 text-lg font-bold">No flights on this date</h3>
          <p className="mt-1 text-sm text-muted">
            There are no bookable flights for this route and date. Try a nearby date or another
            airport.
          </p>
          <Button asChild variant="outline" className="mt-5">
            <Link to="/flights">New search</Link>
          </Button>
        </>
      )}
    </div>
  );
}
