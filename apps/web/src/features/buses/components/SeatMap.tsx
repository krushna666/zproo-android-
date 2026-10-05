import type { BusSeatInfo, BusSeatMap } from '@zproo/types';
import { cn } from '@zproo/ui';
import { Disc, Venus } from 'lucide-react';
import { inr } from '@/features/flights/format';

interface SeatMapProps {
  map: BusSeatMap;
  selected: string[];
  onToggle: (seat: BusSeatInfo) => void;
}

const DECK_LABEL = { LOWER: 'Lower deck', UPPER: 'Upper deck' } as const;

function seatLabel(seat: BusSeatInfo, selected: boolean): string {
  const kind = seat.kind === 'SLEEPER' ? 'sleeper' : 'seat';
  const state = !seat.available ? 'booked' : selected ? 'selected' : 'available';
  return `${kind === 'sleeper' ? 'Sleeper' : 'Seat'} ${seat.number}, ${seat.deck.toLowerCase()} deck, ${inr(seat.pricePaise)}${seat.ladiesOnly ? ', reserved for women' : ''}, ${state}`;
}

/**
 * Bus layout, one panel per deck. Seats are real buttons (keyboard and screen-reader friendly):
 * the label reads the seat, price and state.
 */
export function SeatMap({ map, selected, onToggle }: SeatMapProps) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        {map.decks.map((deck) => (
          <section
            key={deck.deck}
            aria-label={DECK_LABEL[deck.deck]}
            className="rounded-2xl border border-border bg-card p-4"
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-bold">{DECK_LABEL[deck.deck]}</h3>
              {deck.deck === 'LOWER' && (
                <span className="inline-flex items-center gap-1 text-xs text-muted">
                  <Disc aria-hidden className="size-4" /> Driver
                </span>
              )}
            </div>
            <div
              className="mx-auto grid w-fit gap-2"
              style={{
                gridTemplateColumns: `repeat(${deck.columns}, minmax(2.5rem, 2.75rem))`,
                gridTemplateRows: `repeat(${deck.rows}, auto)`,
              }}
            >
              {deck.seats.map((seat) => {
                const isSelected = selected.includes(seat.number);
                return (
                  <button
                    key={seat.number}
                    type="button"
                    disabled={!seat.available}
                    aria-pressed={isSelected}
                    aria-label={seatLabel(seat, isSelected)}
                    title={seatLabel(seat, isSelected)}
                    onClick={() => onToggle(seat)}
                    style={{ gridRow: seat.row, gridColumn: seat.column + 1 }}
                    className={cn(
                      'relative flex flex-col items-center justify-center rounded-lg border-2 text-[10px] font-bold leading-tight transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      seat.kind === 'SLEEPER' ? 'h-20' : 'h-11',
                      isSelected && 'border-primary bg-primary text-primary-foreground',
                      !isSelected &&
                        seat.available &&
                        !seat.ladiesOnly &&
                        'border-success/60 bg-card hover:bg-success/10',
                      !isSelected &&
                        seat.available &&
                        seat.ladiesOnly &&
                        'border-pink-400 bg-pink-50 text-pink-800 hover:bg-pink-100',
                      !seat.available && 'cursor-not-allowed border-border bg-border/60 text-muted',
                    )}
                  >
                    {seat.ladiesOnly && seat.available && !isSelected && (
                      <Venus aria-hidden className="absolute right-0.5 top-0.5 size-3" />
                    )}
                    <span>{seat.number}</span>
                    {seat.available && (
                      <span className="font-medium tabular-nums opacity-80">
                        ₹{Math.round(seat.pricePaise / 100)}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
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
          <span className="size-4 rounded border-2 border-pink-400 bg-pink-50" /> Reserved for women
        </li>
        <li className="inline-flex items-center gap-2">
          <span className="size-4 rounded border-2 border-border bg-border/60" /> Booked
        </li>
      </ul>
    </div>
  );
}
