import type { FlightOffer } from '@zproo/types';
import { Badge, Button, cn } from '@zproo/ui';
import { Check, ChevronDown } from 'lucide-react';
import { useId, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { dayShift, duration, inr, localTime, stopsLabel } from '../format';
import { AirlineMark } from './AirlineMark';
import { FlightTimeline } from './FlightTimeline';

interface FlightCardProps {
  offer: FlightOffer;
  /** Link to the offer page (with passenger counts). */
  detailsHref: string;
  actionLabel: string;
  onAction: () => void;
  selected?: boolean;
}

export function FlightCard({
  offer,
  detailsHref,
  actionLabel,
  onAction,
  selected = false,
}: FlightCardProps) {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const shift = dayShift(
    offer.departureAt,
    offer.from.timezone,
    offer.arrivalAt,
    offer.to.timezone,
  );
  const via = offer.layovers.map((l) => l.airport.code).join(', ');
  return (
    <article
      aria-label={`${offer.airline.name} ${offer.flightNumber}, ${localTime(offer.departureAt, offer.from.timezone)} to ${localTime(offer.arrivalAt, offer.to.timezone)}, ${inr(offer.totalPaise)}`}
      className={cn(
        'rounded-2xl border bg-card p-4 shadow-card transition-colors sm:p-5',
        selected ? 'border-primary ring-1 ring-primary' : 'border-border',
      )}
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <div className="flex w-full items-center gap-3 sm:w-auto sm:min-w-[9rem]">
          <AirlineMark code={offer.airline.code} />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{offer.airline.name}</p>
            <p className="text-xs text-muted">{offer.flightNumber}</p>
          </div>
        </div>

        <div className="grid flex-1 grid-cols-[auto_1fr_auto] items-center gap-3">
          <div>
            <p className="text-lg font-extrabold tabular-nums">
              {localTime(offer.departureAt, offer.from.timezone)}
            </p>
            <p className="text-xs font-medium text-muted">{offer.from.code}</p>
          </div>
          <div className="whitespace-nowrap text-center text-xs text-muted">
            <p>{duration(offer.durationMinutes)}</p>
            <div className="relative my-1 h-px bg-border">
              {offer.stops > 0 && (
                <span className="absolute left-1/2 top-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary" />
              )}
            </div>
            <p className={offer.stops === 0 ? 'text-success' : undefined}>
              {stopsLabel(offer.stops)}
              {via && ` via ${via}`}
            </p>
          </div>
          <div className="text-right">
            <p className="text-lg font-extrabold tabular-nums">
              {localTime(offer.arrivalAt, offer.to.timezone)}
              {shift > 0 && (
                <sup
                  className="ml-0.5 text-[10px] font-bold text-primary"
                  title={`Arrives ${shift} day later`}
                >
                  +{shift}
                </sup>
              )}
            </p>
            <p className="text-xs font-medium text-muted">{offer.to.code}</p>
          </div>
        </div>

        <div className="flex w-full items-center justify-between gap-3 sm:w-auto sm:flex-col sm:items-end">
          <div className="sm:text-right">
            <p className="text-xl font-extrabold tabular-nums">{inr(offer.totalPaise)}</p>
            <p className="text-xs text-muted">{offer.fareFamily} fare</p>
          </div>
          <Button
            size="sm"
            onClick={onAction}
            variant={selected ? 'secondary' : 'default'}
            aria-pressed={selected || undefined}
          >
            {selected && <Check aria-hidden />}
            {actionLabel}
          </Button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
        {offer.refundable ? (
          <Badge variant="success">Refundable</Badge>
        ) : (
          <Badge variant="outline">Non-refundable</Badge>
        )}
        {offer.seatsLeft <= 5 && <Badge variant="warning">{offer.seatsLeft} seats left</Badge>}
        <button
          type="button"
          className="ml-auto inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((v) => !v)}
        >
          Flight details
          <ChevronDown
            aria-hidden
            className={cn('size-4 transition-transform', open && 'rotate-180')}
          />
        </button>
      </div>

      {open && (
        <div id={panelId} className="mt-4 space-y-4 border-t border-border pt-4">
          <FlightTimeline offer={offer} />
          <Link
            to={detailsHref}
            state={{ from: location.pathname + location.search }}
            className="inline-block text-sm font-semibold text-primary hover:underline"
          >
            Fare rules and full details
          </Link>
        </div>
      )}
    </article>
  );
}
