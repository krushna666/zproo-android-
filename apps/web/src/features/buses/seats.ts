import type { BusDeck, BusSeat } from '@zproo/types';
import { formatMoney } from '@zproo/utils';

const TYPE_LABEL = { SEATER: 'seater', SEMI_SLEEPER: 'semi-sleeper', SLEEPER: 'sleeper' } as const;

export const seatIsOpen = (seat: BusSeat) => seat.status === 'AVAILABLE';

/** "Seat L4, lower deck, sleeper, ₹1,249, available" */
export function seatLabel(seat: BusSeat, deck: BusDeck, selected: boolean): string {
  const state = selected
    ? 'selected'
    : seat.status === 'AVAILABLE'
      ? 'available'
      : seat.status === 'HELD'
        ? 'held'
        : 'booked';
  return [
    `Seat ${seat.seatNo}`,
    `${deck.toLowerCase()} deck`,
    TYPE_LABEL[seat.type],
    formatMoney(seat.price),
    ...(seat.ladiesOnly ? ['reserved for women'] : []),
    state,
  ].join(', ');
}

/** The seat to move to from `from` with an arrow key (grid geometry; sleepers span 2 rows). */
export function nextSeat(seats: readonly BusSeat[], from: BusSeat, key: string): BusSeat | null {
  const overlapRows = (s: BusSeat) => s.row < from.row + from.height && from.row < s.row + s.height;
  const overlapCols = (s: BusSeat) => s.col < from.col + from.width && from.col < s.col + s.width;
  const pick = (
    list: BusSeat[],
    primary: (s: BusSeat) => number,
    secondary: (s: BusSeat) => number,
  ) => list.sort((a, b) => primary(a) - primary(b) || secondary(a) - secondary(b))[0] ?? null;
  const others = seats.filter((s) => s !== from);
  switch (key) {
    case 'ArrowRight':
      return pick(
        others.filter((s) => s.col > from.col && overlapRows(s)),
        (s) => s.col - from.col,
        (s) => Math.abs(s.row - from.row),
      );
    case 'ArrowLeft':
      return pick(
        others.filter((s) => s.col < from.col && overlapRows(s)),
        (s) => from.col - s.col,
        (s) => Math.abs(s.row - from.row),
      );
    case 'ArrowDown':
      return pick(
        others.filter((s) => s.row > from.row),
        (s) => (overlapCols(s) ? 0 : 1000) + s.row - from.row,
        (s) => Math.abs(s.col - from.col),
      );
    case 'ArrowUp':
      return pick(
        others.filter((s) => s.row < from.row),
        (s) => (overlapCols(s) ? 0 : 1000) + from.row - s.row,
        (s) => Math.abs(s.col - from.col),
      );
    default:
      return null;
  }
}
