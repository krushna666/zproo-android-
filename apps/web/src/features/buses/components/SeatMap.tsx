import type { BusDeck, BusDeckMap, BusSeat, BusSeatMap } from '@zproo/types';
import { cn } from '@zproo/ui';
import { formatMoney } from '@zproo/utils';
import { Disc, Venus } from 'lucide-react';
import { useRef, useState, type KeyboardEvent } from 'react';
import { nextSeat, seatIsOpen, seatLabel } from '../seats';

interface SeatMapProps {
  map: BusSeatMap;
  selected: readonly string[];
  onToggle: (seat: BusSeat) => void;
}

const DECK_LABEL: Record<BusDeck, string> = { LOWER: 'Lower deck', UPPER: 'Upper deck' };
function DeckGrid({
  deck,
  selected,
  onToggle,
}: {
  deck: BusDeckMap;
  selected: readonly string[];
  onToggle: (seat: BusSeat) => void;
}) {
  const ordered = [...deck.seats].sort((a, b) => a.row - b.row || a.col - b.col);
  const firstOpen = ordered.find(seatIsOpen) ?? ordered[0];
  const [focusId, setFocusId] = useState<string | undefined>(undefined);
  // Roving tabindex: exactly one seat per deck is in the tab order.
  const tabStop = deck.seats.some((s) => s.seatNo === focusId) ? focusId : firstOpen?.seatNo;
  const refs = useRef(new Map<string, HTMLButtonElement>());

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, seat: BusSeat) => {
    let target: BusSeat | null | undefined = null;
    if (e.key === 'Home') target = ordered[0];
    else if (e.key === 'End') target = ordered.at(-1);
    else target = nextSeat(deck.seats, seat, e.key);
    if (!target) return;
    e.preventDefault();
    setFocusId(target.seatNo);
    refs.current.get(target.seatNo)?.focus();
  };

  return (
    <div
      role="group"
      aria-label={`${DECK_LABEL[deck.deck]} seats`}
      className="mx-auto grid w-fit gap-1.5"
      style={{
        gridTemplateColumns: `repeat(${deck.cols}, minmax(2.75rem, 3rem))`,
        gridTemplateRows: `repeat(${deck.rows}, minmax(1.75rem, auto))`,
      }}
    >
      {deck.seats.map((seat) => {
        const isSelected = selected.includes(seat.seatNo);
        const open = seatIsOpen(seat);
        const label = seatLabel(seat, deck.deck, isSelected);
        return (
          <button
            key={seat.seatNo}
            ref={(el) => {
              if (el) refs.current.set(seat.seatNo, el);
              else refs.current.delete(seat.seatNo);
            }}
            type="button"
            tabIndex={seat.seatNo === tabStop ? 0 : -1}
            data-testid={`bus-seat-${seat.seatNo}`}
            data-status={isSelected ? 'SELECTED' : seat.status}
            aria-pressed={isSelected}
            aria-disabled={!open || undefined}
            aria-label={label}
            title={label}
            onFocus={() => setFocusId(seat.seatNo)}
            onKeyDown={(e) => onKeyDown(e, seat)}
            onClick={() => open && onToggle(seat)}
            style={{
              gridRow: `${seat.row + 1} / span ${seat.height}`,
              gridColumn: `${seat.col + 1} / span ${seat.width}`,
            }}
            className={cn(
              'relative flex min-h-11 flex-col items-center justify-center rounded-lg border-2 text-[10px] font-bold leading-tight transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              isSelected && 'border-primary bg-primary text-primary-foreground',
              !isSelected &&
                open &&
                !seat.ladiesOnly &&
                'border-success/60 bg-card hover:bg-success/10',
              !isSelected &&
                open &&
                seat.ladiesOnly &&
                'border-primary/40 bg-primary-light text-primary hover:border-primary',
              seat.status === 'HELD' &&
                'cursor-not-allowed border-warning/50 bg-warning/10 text-muted',
              (seat.status === 'BOOKED' || seat.status === 'BLOCKED') &&
                'cursor-not-allowed border-border bg-border/60 text-muted',
            )}
          >
            {seat.ladiesOnly && open && !isSelected && (
              <Venus aria-hidden className="absolute right-0.5 top-0.5 size-3" />
            )}
            <span>{seat.seatNo}</span>
            {open && (
              <span className="font-medium tabular-nums opacity-80">{formatMoney(seat.price)}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/**
 * The coach layout with a Lower / Upper toggle: mobile shows the chosen deck, desktop shows both
 * side by side (the toggle then only marks the deck in focus). Seats are buttons (aria-pressed, full aria-label) with arrow-key navigation per deck.
 */
export function SeatMap({ map, selected, onToggle }: SeatMapProps) {
  const [active, setActive] = useState<BusDeck>('LOWER');
  const twoDecks = map.decks.length > 1;
  return (
    <div className="space-y-4">
      <div role="group" aria-label="Deck" className="flex gap-2">
        {map.decks.map((d) => (
          <button
            key={d.deck}
            type="button"
            data-testid={`bus-deck-${d.deck.toLowerCase()}`}
            aria-pressed={active === d.deck}
            onClick={() => {
              setActive(d.deck);
              document.getElementById(`deck-${d.deck}`)?.scrollIntoView?.({ block: 'nearest' });
            }}
            className={cn(
              'min-h-11 rounded-full border px-4 text-sm font-semibold transition-colors',
              active === d.deck
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-card hover:border-foreground/30',
            )}
          >
            {d.deck === 'LOWER' ? 'Lower' : 'Upper'}
          </button>
        ))}
      </div>
      <div className={cn('grid gap-4', twoDecks && 'lg:grid-cols-2')}>
        {map.decks.map((deck) => (
          <section
            key={deck.deck}
            id={`deck-${deck.deck}`}
            aria-label={DECK_LABEL[deck.deck]}
            className={cn(
              'rounded-2xl border border-border bg-card p-4',
              twoDecks && active !== deck.deck && 'hidden lg:block',
            )}
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-bold">{DECK_LABEL[deck.deck]}</h3>
              {deck.deck === 'LOWER' && (
                <span className="inline-flex items-center gap-1 text-xs text-muted">
                  <Disc aria-hidden className="size-4" /> Driver
                </span>
              )}
            </div>
            <DeckGrid deck={deck} selected={selected} onToggle={onToggle} />
          </section>
        ))}
      </div>
      <ul className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted" aria-label="Seat legend">
        <li className="inline-flex items-center gap-2">
          <span className="size-4 rounded border-2 border-success/60 bg-card" /> Available
        </li>
        <li className="inline-flex items-center gap-2">
          <span className="size-4 rounded border-2 border-primary bg-primary" /> Selected
        </li>
        <li className="inline-flex items-center gap-2">
          <span className="grid size-4 place-items-center rounded border-2 border-primary/40 bg-primary-light text-primary">
            <Venus aria-hidden className="size-2.5" />
          </span>{' '}
          Ladies
        </li>
        <li className="inline-flex items-center gap-2">
          <span className="size-4 rounded border-2 border-warning/50 bg-warning/10" /> Held
        </li>
        <li className="inline-flex items-center gap-2">
          <span className="size-4 rounded border-2 border-border bg-border/60" /> Booked
        </li>
      </ul>
    </div>
  );
}
