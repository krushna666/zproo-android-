import type { FlightOffer, PassengerType, PaxCounts, PaxFare, PriceBreakdown } from '@zproo/types';

/** Price of one offer for a passenger mix. */
export function offerTotal(fares: Record<PassengerType, PaxFare>, pax: PaxCounts): number {
  return (
    fares.ADULT.totalPaise * pax.adults +
    fares.CHILD.totalPaise * pax.children +
    fares.INFANT.totalPaise * pax.infants
  );
}

/** Customer-facing price breakdown for one or more flight legs. No hidden fees are added. */
export function flightPriceBreakdown(offers: FlightOffer[], pax: PaxCounts): PriceBreakdown {
  let basePaise = 0;
  let taxesPaise = 0;
  const lines: { label: string; amountPaise: number }[] = [];
  const counts: [PassengerType, number, string][] = [
    ['ADULT', pax.adults, 'Adult'],
    ['CHILD', pax.children, 'Child'],
    ['INFANT', pax.infants, 'Infant'],
  ];
  for (const [type, n, label] of counts) {
    if (n === 0) continue;
    const base = offers.reduce((sum, o) => sum + o.fares[type].basePaise, 0) * n;
    lines.push({ label: `Base fare — ${label} × ${n}`, amountPaise: base });
    basePaise += base;
    taxesPaise += offers.reduce((sum, o) => sum + o.fares[type].taxesPaise, 0) * n;
  }
  lines.push({ label: 'Taxes & airport fees', amountPaise: taxesPaise });
  return {
    lines,
    basePaise,
    taxesPaise,
    feesPaise: 0,
    discountPaise: 0,
    totalPaise: basePaise + taxesPaise,
    currency: 'INR',
  };
}
