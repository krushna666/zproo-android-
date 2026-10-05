import { findAirport } from '@zproo/config';
import { CABIN_CLASS_LABELS, type FlightOfferSummary } from '@zproo/types';
import {
  addDays,
  FLIGHT_MAX_DAYS_AHEAD,
  flightSearchInputFromParams,
  flightSearchSchema,
  todayInIst,
  type FlightSearch,
} from '@zproo/validation';
import {
  Badge,
  Button,
  cn,
  Dialog,
  DialogContent,
  DialogTitle,
  EmptyState,
  FormAlert,
  Sheet,
  SheetContent,
  Skeleton,
} from '@zproo/ui';
import { ArrowRight, Pencil, PlaneTakeoff, SearchX, SlidersHorizontal } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { DateStrip } from '@/components/results/DateStrip';
import { SortChips } from '@/components/results/SortChips';
import { Seo } from '@/components/seo/Seo';
import { DemoBanner } from '@/features/checkout/DemoBanner';
import { useFlightSearch } from '@/features/flights/api';
import { FiltersPanel } from '@/features/flights/components/FiltersPanel';
import { FlightCard, SelectButton } from '@/features/flights/components/FlightCard';
import {
  activeFlightFilterCount,
  applyFlightFilters,
  EMPTY_FLIGHT_FILTERS,
  FLIGHT_SORTS,
  flightFacets,
  readFlightFilters,
  sortFlights,
  writeFlightFilters,
  type FlightFilters,
  type FlightSortId,
} from '@/features/flights/filters';
import { inr, shortDay, travellersLabel } from '@/features/flights/format';
import { offerUrl } from '@/features/flights/links';
import { FlightSearchForm } from '@/features/search/forms/FlightSearchForm';
import { flightsUrl } from '@/features/search/url';
import { userMessage } from '@/lib/apiErrors';

const cityName = (code: string) => findAirport(code)?.city ?? code;

export default function FlightResultsPage() {
  const [params] = useSearchParams();
  const input = flightSearchInputFromParams(params);
  // Re-validated on every visit: a date that became "past" at midnight IST is caught here.
  const parsed = flightSearchSchema.safeParse(input);
  if (!parsed.success)
    return <InvalidSearch input={input} messages={parsed.error.issues.map((i) => i.message)} />;
  const s = parsed.data;
  return <Results key={flightsUrl(s)} search={s} />;
}

/** A bad deep link: explain, and pre-fill the widget with what was valid. */
function InvalidSearch({
  input,
  messages,
}: {
  input: ReturnType<typeof flightSearchInputFromParams>;
  messages: string[];
}) {
  const from = findAirport(input.from.toUpperCase())?.code;
  const to = findAirport(input.to.toUpperCase())?.code;
  return (
    <div
      className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-6"
      data-testid="flight-results-error"
    >
      <Seo title="Search flights" noIndex />
      <h1 className="text-[28px] font-extrabold tracking-tight">Search flights</h1>
      <FormAlert>That search can't be shown. {[...new Set(messages)].join('. ')}.</FormAlert>
      <div className="rounded-[1.75rem] border border-border bg-card p-4 shadow-card">
        <FlightSearchForm initial={{ ...(from ? { from } : {}), ...(to ? { to } : {}) }} />
      </div>
    </div>
  );
}

function Results({ search }: { search: FlightSearch }) {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { data, isPending, error, refetch, isFetching } = useFlightSearch(search);
  const { filters, sort } = useMemo(() => readFlightFilters(params), [params]);
  const [editing, setEditing] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetFilters, setSheetFilters] = useState<FlightFilters>(filters);
  const roundTrip = Boolean(search.returnDate);
  const [outbound, setOutbound] = useState<FlightOfferSummary | null>(null);
  const [inbound, setInbound] = useState<FlightOfferSummary | null>(null);
  // Mobile round trip: pick the outbound flight first, then the return.
  const [step, setStep] = useState<'out' | 'ret'>('out');

  const update = (next: FlightFilters, nextSort: FlightSortId = sort) =>
    setParams(writeFlightFilters(params, next, nextSort), {
      replace: true,
      preventScrollReset: true,
    });

  const offers = useMemo(() => data?.offers ?? [], [data]);
  const returnOffers = useMemo(() => data?.returnOffers ?? [], [data]);
  const facets = useMemo(() => flightFacets([...offers, ...returnOffers]), [offers, returnOffers]);
  const visible = useMemo(
    () => sortFlights(applyFlightFilters(offers, filters), sort),
    [offers, filters, sort],
  );
  const visibleReturn = useMemo(
    () => sortFlights(applyFlightFilters(returnOffers, filters), sort),
    [returnOffers, filters, sort],
  );
  const from = cityName(search.from);
  const to = cityName(search.to);
  const extra = writeFlightFilters(new URLSearchParams(), filters, sort).toString();
  const hrefFor = (date: string) =>
    flightsUrl(
      {
        ...search,
        date,
        returnDate: search.returnDate && search.returnDate < date ? date : search.returnDate,
      },
      extra,
    );
  const today = todayInIst();
  const nearby = [-2, -1, 1, 2].map((n) => addDays(search.date, n)).filter((d) => d >= today);
  const pax = { adults: search.adults, children: search.children, infants: search.infants };

  const panel = (value: FlightFilters, onChange: (f: FlightFilters) => void) => (
    <FiltersPanel facets={facets} value={value} onChange={onChange} fromCity={from} toCity={to} />
  );

  const list = (items: FlightOfferSummary[], leg: 'out' | 'ret') =>
    items.length === 0 ? (
      <EmptyState
        data-testid="flight-results-empty"
        icon={SearchX}
        title="No flights match your filters"
        actions={
          <Button variant="outline" onClick={() => update(EMPTY_FLIGHT_FILTERS)}>
            Clear filters
          </Button>
        }
      />
    ) : (
      <ul className="space-y-4">
        {items.map((offer) => {
          const chosen = (leg === 'out' ? outbound : inbound)?.offerId === offer.offerId;
          return (
            <li key={offer.offerId}>
              <FlightCard
                offer={offer}
                selected={roundTrip && chosen}
                action={
                  roundTrip ? (
                    <SelectButton
                      selected={chosen}
                      testId={`flight-select-${leg}-${offer.offerId}`}
                      onSelect={() => {
                        if (leg === 'out') {
                          setOutbound(offer);
                          setStep('ret');
                        } else setInbound(offer);
                      }}
                    />
                  ) : (
                    <Button asChild data-testid={`flight-view-fares-${offer.offerId}`}>
                      <Link to={offerUrl(offer.offerId)}>View fares</Link>
                    </Button>
                  )
                }
              />
            </li>
          );
        })}
      </ul>
    );

  return (
    <div className={cn('mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8', roundTrip && 'pb-28')}>
      <Seo title={`Flights from ${from} to ${to}`} noIndex />

      <header className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-border bg-card p-4 shadow-card">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-extrabold tracking-tight sm:text-[28px]">
            {from} {roundTrip ? '⇄' : '→'} {to}
          </h1>
          <p className="text-sm text-muted">
            {shortDay(search.date)}
            {search.returnDate ? ` – ${shortDay(search.returnDate)}` : ''} · {travellersLabel(pax)}{' '}
            · {CABIN_CLASS_LABELS[search.cabin]}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
          <Pencil aria-hidden /> Modify
        </Button>
      </header>

      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent className="max-w-5xl">
          <DialogTitle>Modify search</DialogTitle>
          <FlightSearchForm initial={search} />
        </DialogContent>
      </Dialog>

      <div className="mt-4">
        <DateStrip
          testIdPrefix="flight-date-strip"
          maxDaysAhead={FLIGHT_MAX_DAYS_AHEAD}
          date={search.date}
          hrefFor={hrefFor}
          prices={
            data && offers.length > 0
              ? { [search.date]: Math.min(...offers.map((o) => o.fromPrice)) }
              : {}
          }
        />
      </div>

      {data?.demo && (
        <div className="mt-4">
          <DemoBanner service="flight" />
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[17rem_1fr]">
        <aside className="hidden lg:block" aria-label="Filters">
          <div className="sticky top-[calc(var(--header-height)+1rem)] max-h-[calc(100vh-var(--header-height)-2rem)] overflow-y-auto rounded-[14px] border border-border bg-card p-5 shadow-card">
            {offers.length > 0 ? (
              panel(filters, (next) => update(next))
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
            {panel(sheetFilters, setSheetFilters)}
            <div className="sticky bottom-0 mt-6 flex gap-3 bg-card pt-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setSheetFilters(EMPTY_FLIGHT_FILTERS)}
              >
                Clear all
              </Button>
              <Button
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
              data-testid="flight-results-count"
              className="mr-auto text-sm font-semibold text-muted"
              aria-live="polite"
            >
              {isPending
                ? 'Searching...'
                : `${visible.length} flight${visible.length === 1 ? '' : 's'} found`}
            </h2>
            <Button
              variant="outline"
              size="sm"
              className="lg:hidden"
              onClick={() => setSheetOpen(true)}
            >
              <SlidersHorizontal aria-hidden /> Filters
              {activeFlightFilterCount(filters) > 0 && (
                <Badge className="ml-1">{activeFlightFilterCount(filters)}</Badge>
              )}
            </Button>
          </div>

          <SortChips
            options={FLIGHT_SORTS}
            value={sort}
            onChange={(s) => update(filters, s)}
            label="Sort flights"
            testIdPrefix="flight-sort"
          />

          {error ? (
            <div
              data-testid="flight-results-error"
              role="alert"
              className="space-y-3 rounded-[14px] border border-danger/30 bg-card p-5"
            >
              <p className="text-sm font-semibold text-danger">{userMessage(error)}</p>
              <Button variant="outline" onClick={() => void refetch()}>
                Retry
              </Button>
            </div>
          ) : isPending ? (
            <ul
              className="space-y-4"
              data-testid="flight-results-loading"
              aria-label="Loading flights"
            >
              {[0, 1, 2, 3].map((i) => (
                <li key={i}>
                  <Skeleton className="h-40 rounded-[14px]" />
                </li>
              ))}
            </ul>
          ) : offers.length === 0 || (roundTrip && returnOffers.length === 0) ? (
            <EmptyState
              data-testid="flight-results-empty"
              icon={PlaneTakeoff}
              title="No flights found"
              description="Try a nearby date:"
              actions={nearby.map((d) => (
                <Button key={d} asChild variant="outline" size="sm">
                  <Link to={hrefFor(d)}>{shortDay(d)}</Link>
                </Button>
              ))}
            />
          ) : roundTrip ? (
            <>
              <div role="tablist" aria-label="Choose flights" className="flex gap-2 lg:hidden">
                {(
                  [
                    ['out', `1. ${search.from} → ${search.to}`],
                    ['ret', `2. ${search.to} → ${search.from}`],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={step === id}
                    onClick={() => setStep(id)}
                    className={cn(
                      'min-h-11 flex-1 rounded-full border px-3 text-sm font-semibold',
                      step === id
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border bg-card',
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <section
                  aria-label="Outbound flights"
                  className={cn('space-y-3', step !== 'out' && 'hidden lg:block')}
                >
                  <h3 className="text-sm font-bold">Outbound · {shortDay(search.date)}</h3>
                  {list(visible, 'out')}
                </section>
                <section
                  aria-label="Return flights"
                  className={cn('space-y-3', step !== 'ret' && 'hidden lg:block')}
                >
                  <h3 className="text-sm font-bold">
                    Return · {search.returnDate ? shortDay(search.returnDate) : ''}
                  </h3>
                  {list(visibleReturn, 'ret')}
                </section>
              </div>
            </>
          ) : (
            list(visible, 'out')
          )}
        </section>
      </div>

      {roundTrip && (
        <div className="fixed inset-x-0 bottom-[var(--bottom-nav-height)] z-30 border-t border-border bg-card/95 py-3 backdrop-blur lg:bottom-0">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
            <div className="min-w-0 text-sm">
              <p className="truncate text-muted">
                {outbound
                  ? `${outbound.carrier.name} ${outbound.slices[0]?.segments[0]?.flightNo ?? ''}`
                  : 'Choose an outbound flight'}
                {' · '}
                {inbound
                  ? `${inbound.carrier.name} ${inbound.slices[0]?.segments[0]?.flightNo ?? ''}`
                  : 'choose a return flight'}
              </p>
              <p
                className="text-xl font-extrabold tabular-nums"
                data-testid="flight-roundtrip-total"
              >
                {inr((outbound?.fromPrice ?? 0) + (inbound?.fromPrice ?? 0))}
                <span className="ml-1 text-xs font-normal text-muted">per adult</span>
              </p>
            </div>
            <Button
              size="lg"
              data-testid="flight-continue"
              disabled={!outbound || !inbound}
              onClick={() =>
                outbound && inbound && void navigate(offerUrl(outbound.offerId, inbound.offerId))
              }
            >
              Continue <ArrowRight aria-hidden />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
