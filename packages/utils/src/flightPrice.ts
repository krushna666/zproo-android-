import type { FareFamily, PassengerType, PaxCounts, PaxFare, PriceBreakdown } from '@zproo/types';

const PAX: [PassengerType, keyof PaxCounts, string][] = [
  ['ADULT', 'adults', 'Adult'],
  ['CHILD', 'children', 'Child'],
  ['INFANT', 'infants', 'Infant'],
];

/** Price of one fare for a passenger mix (all-inclusive). */
export function fareTotal(perPax: Record<PassengerType, PaxFare>, pax: PaxCounts): number {
  return PAX.reduce((sum, [type, key]) => sum + perPax[type].total * pax[key], 0);
}

/**
 * The bill for one or two fares (one-way or round trip): base fare per passenger type, GST and
 * airport fees. Airport fees are government charges, so they are part of `taxesPaise`; ZPROO GO
 * adds no convenience fee (`feesPaise` 0).
 */
export function flightPriceBreakdown(fares: readonly FareFamily[], pax: PaxCounts): PriceBreakdown {
  const lines: { label: string; amountPaise: number }[] = [];
  let basePaise = 0;
  let gst = 0;
  let airport = 0;
  for (const [type, key, label] of PAX) {
    const n = pax[key];
    if (n === 0) continue;
    const base = fares.reduce((sum, f) => sum + f.perPax[type].base, 0) * n;
    lines.push({ label: `Base fare — ${label} × ${n}`, amountPaise: base });
    basePaise += base;
    gst += fares.reduce((sum, f) => sum + f.perPax[type].taxes, 0) * n;
    airport += fares.reduce((sum, f) => sum + f.perPax[type].fees, 0) * n;
  }
  lines.push({ label: 'Taxes (GST)', amountPaise: gst });
  if (airport > 0) lines.push({ label: 'Airport fees', amountPaise: airport });
  return {
    lines,
    basePaise,
    taxesPaise: gst + airport,
    feesPaise: 0,
    discountPaise: 0,
    totalPaise: basePaise + gst + airport,
    currency: 'INR',
  };
}
