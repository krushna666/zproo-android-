import type { BusCancellationRule, PriceBreakdown } from '@zproo/types';
import { daysBetweenIso, isoWeekday } from './time';

/** GST on A/C bus tickets (included in seat prices); non-A/C fares carry none. */
export const BUS_AC_GST_PERCENT = 5;
/** ZPROO GO convenience fee per bus booking, in paise (none today; shown when non-zero). */
export const BUS_CONVENIENCE_FEE_PAISE = 0;

/** Every mock seat costs between ₹599 and ₹2,899. */
export const BUS_MIN_SEAT_PAISE = 59_900;
export const BUS_MAX_SEAT_PAISE = 289_900;

/**
 * Price of one seat (taxes included), in paise. Weekend departures and last-minute travel cost
 * more, early bookings slightly less; lower sleepers and window seats carry their premium. Prices
 * end in 9 rupees (₹1,249) and stay within ₹599–₹2,899.
 */
export function busSeatPrice(input: {
  baseFarePaise: number;
  seatFarePercent: number;
  date: string;
  today: string;
}): number {
  const daysAhead = daysBetweenIso(input.today, input.date);
  let demand = 1;
  if (isoWeekday(input.date) >= 5) demand += 0.12; // Friday–Sunday
  if (daysAhead <= 1) demand += 0.1;
  else if (daysAhead >= 20) demand -= 0.05;
  const raw = (input.baseFarePaise * demand * input.seatFarePercent) / 100;
  const rounded = Math.round(raw / 1_000) * 1_000 - 100; // whole tens of rupees, minus ₹1
  return Math.min(BUS_MAX_SEAT_PAISE, Math.max(BUS_MIN_SEAT_PAISE, rounded));
}

/** Splits a tax-inclusive seat price into fare and GST (A/C only). */
export function splitGst(pricePaise: number, ac: boolean): { basePaise: number; taxPaise: number } {
  if (!ac) return { basePaise: pricePaise, taxPaise: 0 };
  const basePaise = Math.round((pricePaise * 100) / (100 + BUS_AC_GST_PERCENT));
  return { basePaise, taxPaise: pricePaise - basePaise };
}

/**
 * The server's bill for a bus booking: seat fares, GST, the convenience fee and the total. The
 * browser's `expectedTotal` is only compared with `totalPaise`, never charged.
 */
export function busFareBreakdown(
  seats: { seatNo: string; price: number }[],
  ac: boolean,
): PriceBreakdown {
  const parts = seats.map((s) => splitGst(s.price, ac));
  const basePaise = parts.reduce((sum, p) => sum + p.basePaise, 0);
  const taxesPaise = parts.reduce((sum, p) => sum + p.taxPaise, 0);
  const feesPaise = BUS_CONVENIENCE_FEE_PAISE;
  const n = seats.length;
  return {
    lines: [
      { label: `Base fare — ${n} seat${n === 1 ? '' : 's'}`, amountPaise: basePaise },
      ...(taxesPaise > 0
        ? [{ label: `GST (${BUS_AC_GST_PERCENT}%)`, amountPaise: taxesPaise }]
        : []),
      ...(feesPaise > 0 ? [{ label: 'Convenience fee', amountPaise: feesPaise }] : []),
    ],
    basePaise,
    taxesPaise,
    feesPaise,
    discountPaise: 0,
    totalPaise: basePaise + taxesPaise + feesPaise,
    currency: 'INR',
  };
}

/**
 * Refund for cancelling a bus booking `minutesBeforeDeparture` before it leaves: the first tier
 * whose `hoursBefore` the customer still meets (tiers ordered from most to least notice). The
 * convenience fee is never refunded. Nothing is refundable after departure.
 */
export function busRefund(
  paidPaise: number,
  feesPaise: number,
  minutesBeforeDeparture: number,
  policy: readonly BusCancellationRule[],
): { refundPaise: number; refundPercent: number } {
  if (minutesBeforeDeparture <= 0) return { refundPaise: 0, refundPercent: 0 };
  const tiers = [...policy].sort((a, b) => b.hoursBefore - a.hoursBefore);
  const tier = tiers.find((t) => minutesBeforeDeparture >= t.hoursBefore * 60);
  const refundPercent = tier?.refundPercent ?? 0;
  const refundable = Math.max(0, paidPaise - feesPaise);
  return { refundPaise: Math.floor((refundable * refundPercent) / 100), refundPercent };
}
