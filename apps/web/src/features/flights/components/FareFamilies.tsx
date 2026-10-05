import type { FareFamily, PaxCounts } from '@zproo/types';
import { Badge, cn } from '@zproo/ui';
import { Check, X } from 'lucide-react';
import { useRef, type KeyboardEvent } from 'react';
import { inr, travellersLabel } from '../format';

interface FareFamiliesProps {
  fares: readonly FareFamily[];
  value: string;
  onChange: (fareId: string) => void;
  pax: PaxCounts;
  legend: string;
}

function Row({ ok, children }: { ok: boolean; children: string }) {
  const Icon = ok ? Check : X;
  return (
    <li className="flex items-start gap-2">
      <Icon
        aria-hidden
        className={cn('mt-0.5 size-4 shrink-0', ok ? 'text-success' : 'text-muted')}
      />
      <span>{children}</span>
    </li>
  );
}

/**
 * Saver / Flexi / Super Flexi side by side: a keyboard-accessible radio group (arrow keys move
 * the choice, as native radios do).
 */
export function FareFamilies({ fares, value, onChange, pax, legend }: FareFamiliesProps) {
  const refs = useRef(new Map<string, HTMLButtonElement>());
  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const delta =
      e.key === 'ArrowRight' || e.key === 'ArrowDown'
        ? 1
        : e.key === 'ArrowLeft' || e.key === 'ArrowUp'
          ? -1
          : 0;
    if (!delta) return;
    e.preventDefault();
    const next = fares[(index + delta + fares.length) % fares.length];
    if (!next) return;
    onChange(next.fareId);
    refs.current.get(next.fareId)?.focus();
  };
  return (
    <div role="radiogroup" aria-label={legend} className="grid gap-3 md:grid-cols-3">
      {fares.map((fare, i) => {
        const selected = fare.fareId === value;
        return (
          <button
            key={fare.fareId}
            ref={(el) => {
              if (el) refs.current.set(fare.fareId, el);
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected || (!value && i === 0) ? 0 : -1}
            data-testid={`flight-fare-${fare.fareId}`}
            onClick={() => onChange(fare.fareId)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={cn(
              'flex flex-col rounded-[14px] border-2 bg-card p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              selected ? 'border-primary' : 'border-border hover:border-foreground/30',
            )}
          >
            <span className="flex items-center justify-between gap-2">
              <span className="text-lg font-bold">{fare.name}</span>
              {fare.mostPopular && <Badge variant="soft">Most popular</Badge>}
            </span>
            <span className="mt-1 text-xl font-extrabold tabular-nums">{inr(fare.price)}</span>
            <span className="text-xs text-muted">
              per adult · {inr(fare.total)} for {travellersLabel(pax)}
            </span>
            <ul className="mt-3 space-y-1.5 text-sm">
              <Row ok>{`Cabin bag ${fare.cabinBaggageKg} kg`}</Row>
              <Row ok>{`Check-in bag ${fare.checkinBaggageKg} kg`}</Row>
              <Row ok={fare.changeFee === 0}>
                {fare.changeFee === 0 ? 'Free date change' : `Change fee ${inr(fare.changeFee)}`}
              </Row>
              <Row ok={fare.cancellationFee !== null}>
                {fare.cancellationFee === null
                  ? 'Non-refundable'
                  : fare.cancellationFee === 0
                    ? 'Free cancellation'
                    : `Cancellation fee ${inr(fare.cancellationFee)}`}
              </Row>
              <Row ok={fare.meal === 'INCLUDED'}>
                {fare.meal === 'INCLUDED' ? 'Meal included' : 'Meal at a charge'}
              </Row>
              <Row ok={fare.seatSelection === 'FREE'}>
                {fare.seatSelection === 'FREE'
                  ? 'Free seat selection'
                  : 'Seat selection at a charge'}
              </Row>
              <Row ok={fare.priority}>
                {fare.priority ? 'Priority check-in & boarding' : 'Standard boarding'}
              </Row>
            </ul>
          </button>
        );
      })}
    </div>
  );
}
