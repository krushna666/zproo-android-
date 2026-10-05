import type { FlightOfferSummary } from '@zproo/types';
import { Badge, Button, cn } from '@zproo/ui';
import { ChevronDown, Utensils } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';
import {
  clockTime,
  dayShift,
  duration,
  inr,
  sliceArrival,
  sliceDeparture,
  stopsLabel,
} from '../format';
import { AirlineMark } from './AirlineMark';
import { FlightTimeline } from './FlightTimeline';

interface FlightCardProps {
  offer: FlightOfferSummary;
  /** The main action: "View fares" link, or "Select" for round-trip legs */
  action: ReactNode;
  selected?: boolean;
}

/** One search result, with the data-* attributes the end-to-end tests read. */
export function FlightCard({ offer, action, selected = false }: FlightCardProps) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const slice = offer.slices[0];
  if (!slice) return null;
  const departure = sliceDeparture(slice);
  const arrival = sliceArrival(slice);
  const shift = dayShift(departure, arrival);
  const first = slice.segments[0];
  return (
    <article
      data-testid={`flight-result-card-${offer.offerId}`}
      data-price={offer.fromPrice}
      data-duration={slice.durationMin}
      data-stops={slice.stops}
      aria-label={`${offer.carrier.name}, departs ${clockTime(departure)}, ${stopsLabel(slice)}, ${inr(offer.fromPrice)} per adult`}
      className={cn(
        'rounded-[14px] border bg-card p-4 shadow-card sm:p-5',
        selected ? 'border-primary ring-2 ring-primary/30' : 'border-border',
      )}
    >
      <div className="flex flex-wrap items-center gap-3">
        <AirlineMark code={offer.carrier.code} />
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-bold">{offer.carrier.name}</h3>
          <p className="text-xs text-muted">{slice.segments.map((s) => s.flightNo).join(' · ')}</p>
        </div>
        <Badge variant={offer.refundable ? 'success' : 'outline'}>
          {offer.refundable ? 'Refundable' : 'Non-refundable'}
        </Badge>
      </div>

      <div className="mt-4 grid grid-cols-[auto_1fr_auto] items-center gap-3">
        <div>
          <p className="text-lg font-extrabold tabular-nums">{clockTime(departure)}</p>
          <p className="text-xs text-muted">{first?.from}</p>
        </div>
        <div className="text-center text-xs text-muted">
          <p>{duration(slice.durationMin)}</p>
          <div className="my-1 h-px bg-border" />
          <p className={cn(slice.stops > 0 && 'font-semibold text-foreground')}>
            {stopsLabel(slice)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-lg font-extrabold tabular-nums">
            {clockTime(arrival)}
            {shift > 0 && (
              <sup
                className="ml-0.5 text-[10px] font-bold text-primary"
                title={`Arrives ${shift} day${shift === 1 ? '' : 's'} later`}
              >
                +{shift}
              </sup>
            )}
          </p>
          <p className="text-xs text-muted">{slice.segments.at(-1)?.to}</p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
        <div className="flex flex-wrap items-center gap-3 text-xs">
          {offer.mealIncluded && (
            <span className="inline-flex items-center gap-1 text-muted">
              <Utensils aria-hidden className="size-3.5" />
              <span>Meal included</span>
            </span>
          )}
          {offer.seatsLeft < 5 && (
            <Badge variant="warning">
              {offer.seatsLeft} seat{offer.seatsLeft === 1 ? '' : 's'} left
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-xl font-extrabold tabular-nums">{inr(offer.fromPrice)}</p>
            <p className="text-xs text-muted">per adult</p>
          </div>
          {action}
        </div>
      </div>

      <button
        type="button"
        className="mt-2 inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-primary hover:underline"
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
      {open && (
        <div id={panelId} className="mt-2 border-t border-border pt-3">
          <FlightTimeline slice={slice} />
        </div>
      )}
    </article>
  );
}

/** "Select" button for a round-trip leg. */
export function SelectButton({
  selected,
  onSelect,
  testId,
}: {
  selected: boolean;
  onSelect: () => void;
  testId: string;
}) {
  return (
    <Button
      variant={selected ? 'default' : 'outline'}
      aria-pressed={selected}
      data-testid={testId}
      onClick={onSelect}
    >
      {selected ? 'Selected' : 'Select'}
    </Button>
  );
}
