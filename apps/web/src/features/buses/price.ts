import { busFareBreakdown } from '@zproo/catalog';
import type { PriceBreakdown } from '@zproo/types';
import type { BusSelectedSeat } from './draft';

/**
 * The fare for chosen seats, split exactly as the server will bill it (same shared function).
 * The booked amounts still come back from the API; this is only the preview.
 */
export function busPriceBreakdown(seats: readonly BusSelectedSeat[], ac: boolean): PriceBreakdown {
  return busFareBreakdown(
    seats.map((s) => ({ seatNo: s.seatNo, price: s.price })),
    ac,
  );
}
