import type { BusTripSummary } from '@zproo/types';
import { Badge, Button, cn, Skeleton, Tabs, TabsContent, TabsList, TabsTrigger } from '@zproo/ui';
import { formatMoney } from '@zproo/utils';
import { ChevronDown, MapPinned, Star } from 'lucide-react';
import { useId, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { useBusTrip } from '../api';
import { busDayShift, busDuration, istTime, policyRows, ratingVariant } from '../format';
import { busSeatsUrl } from '../links';
import { AmenityList } from './AmenityList';

const TABS = [
  ['photos', 'Photos'],
  ['amenities', 'Amenities'],
  ['points', 'Boarding & dropping'],
  ['policy', 'Cancellation policy'],
  ['reviews', 'Reviews'],
] as const;

/** Details tabs, fetched only when the card is expanded. */
function CardDetails({ trip }: { trip: BusTripSummary }) {
  const { data, isPending, error } = useBusTrip(trip.tripId);
  if (isPending) return <Skeleton className="h-32 rounded-xl" />;
  if (error || !data)
    return <p className="text-sm text-muted">Details aren't available right now.</p>;
  return (
    <Tabs defaultValue="photos">
      <TabsList className="-mx-1 gap-1 overflow-x-auto pb-1" aria-label="Bus details">
        {TABS.map(([id, label]) => (
          <TabsTrigger
            key={id}
            value={id}
            className="min-h-11 shrink-0 rounded-full px-3 text-sm data-[state=active]:bg-primary-light data-[state=active]:text-primary"
          >
            {label}
          </TabsTrigger>
        ))}
      </TabsList>
      <TabsContent value="photos" className="pt-3">
        <ul className="flex gap-3 overflow-x-auto pb-1">
          {data.photos.map((p) => (
            <li key={p.url} className="shrink-0">
              <img
                src={p.url}
                alt={p.alt}
                loading="lazy"
                width={192}
                height={128}
                className="h-32 w-48 rounded-xl border border-border bg-background object-cover"
              />
            </li>
          ))}
        </ul>
      </TabsContent>
      <TabsContent value="amenities" className="pt-3">
        <AmenityList amenities={data.amenities} />
      </TabsContent>
      <TabsContent value="points" className="grid gap-4 pt-3 sm:grid-cols-2">
        {(
          [
            ['Boarding', data.boardingPoints],
            ['Dropping', data.droppingPoints],
          ] as const
        ).map(([title, points]) => (
          <div key={title}>
            <h4 className="mb-2 text-sm font-bold">{title}</h4>
            <ol className="space-y-2 text-sm">
              {points.map((p) => (
                <li key={p.id} className="flex gap-3">
                  <span className="w-12 shrink-0 font-bold tabular-nums">{istTime(p.time)}</span>
                  <span>
                    <span className="block font-semibold">{p.name}</span>
                    <span className="block text-xs text-muted">{p.landmark}</span>
                  </span>
                </li>
              ))}
            </ol>
          </div>
        ))}
      </TabsContent>
      <TabsContent value="policy" className="pt-3">
        <table className="w-full text-sm">
          <tbody className="divide-y divide-border">
            {policyRows(data.cancellationPolicy).map((r) => (
              <tr key={r.when}>
                <td className="py-2 text-muted">{r.when}</td>
                <td className="py-2 text-right font-semibold">{r.refund}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TabsContent>
      <TabsContent value="reviews" className="pt-3 text-sm">
        <p>
          <strong>{data.operator.rating.toFixed(1)} / 5</strong> from{' '}
          {data.operator.ratingCount.toLocaleString('en-IN')} traveller ratings for{' '}
          {data.operator.name}.
        </p>
        <p className="mt-1 text-muted">Written reviews are coming soon.</p>
      </TabsContent>
    </Tabs>
  );
}

/** One search result. Carries data-* attributes the end-to-end tests read. */
export function BusCard({ trip }: { trip: BusTripSummary }) {
  const location = useLocation();
  // Lets the seat page link back to these exact results (with filters).
  const from = { from: location.pathname + location.search };
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const shift = busDayShift(trip.departure, trip.arrival);
  const rating = trip.operator.rating;
  return (
    <article
      data-testid={`bus-result-card-${trip.tripId}`}
      data-price={trip.fromPrice}
      data-duration={trip.durationMin}
      data-departure={trip.departure}
      aria-label={`${trip.operator.name}, ${trip.busType.label}, departs ${istTime(trip.departure)}, from ${formatMoney(trip.fromPrice)}`}
      className="rounded-[14px] border border-border bg-card p-4 shadow-card sm:p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-lg font-bold">{trip.operator.name}</h3>
          <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
            <span>{trip.busType.label}</span>
            <span aria-hidden>·</span>
            <span>{trip.serviceNumber}</span>
          </p>
        </div>
        <Badge
          variant={ratingVariant(rating)}
          title={`${trip.operator.ratingCount.toLocaleString('en-IN')} ratings`}
          aria-label={`Rated ${rating.toFixed(1)} out of 5`}
        >
          <Star aria-hidden className="size-3 fill-current" /> {rating.toFixed(1)}
        </Badge>
      </div>

      <div className="mt-4 grid grid-cols-[auto_1fr_auto] items-center gap-3">
        <p className="text-lg font-extrabold tabular-nums">{istTime(trip.departure)}</p>
        <div className="whitespace-nowrap text-center text-xs text-muted">
          <p>{busDuration(trip.durationMin)}</p>
          <div className="my-1 h-px bg-border" />
          <p>
            {trip.boardingCount} boarding · {trip.droppingCount} dropping
          </p>
        </div>
        <p className="text-right text-lg font-extrabold tabular-nums">
          {istTime(trip.arrival)}
          {shift > 0 && (
            <sup
              className="ml-0.5 text-[10px] font-bold text-primary"
              title={`Arrives ${shift} day${shift === 1 ? '' : 's'} later`}
            >
              +{shift}
            </sup>
          )}
        </p>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
        <div className="flex flex-wrap items-center gap-3">
          <AmenityList amenities={trip.amenities} compact />
          {trip.liveTracking && (
            <span className="inline-flex items-center gap-1 text-xs text-muted">
              <MapPinned aria-hidden className="size-3.5" /> Live tracking
            </span>
          )}
          {trip.seatsLeft < 5 ? (
            <Badge variant="warning">
              Only {trip.seatsLeft} seat{trip.seatsLeft === 1 ? '' : 's'} left
            </Badge>
          ) : (
            <span className="text-xs font-semibold text-muted">{trip.seatsLeft} seats left</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-xs text-muted">from</p>
            <p className="text-xl font-extrabold tabular-nums">{formatMoney(trip.fromPrice)}</p>
          </div>
          <Button asChild data-testid={`bus-view-seats-${trip.tripId}`}>
            <Link to={busSeatsUrl(trip.tripId)} state={from}>
              View seats
            </Link>
          </Button>
        </div>
      </div>

      <button
        type="button"
        className="mt-2 inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-primary hover:underline"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
      >
        Photos, amenities, points & policy
        <ChevronDown
          aria-hidden
          className={cn('size-4 transition-transform', open && 'rotate-180')}
        />
      </button>
      {open && (
        <div id={panelId} className="mt-2 border-t border-border pt-3">
          <CardDetails trip={trip} />
        </div>
      )}
    </article>
  );
}
