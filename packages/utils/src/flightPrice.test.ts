import type { FareFamily, PaxFare } from '@zproo/types';
import { describe, expect, it } from 'vitest';
import { fareTotal, flightPriceBreakdown } from './flightPrice';

const pax = (base: number, taxes: number, fees: number): PaxFare => ({
  base,
  taxes,
  fees,
  total: base + taxes + fees,
});

const fare = (adult: PaxFare, child: PaxFare, infant: PaxFare) =>
  ({ perPax: { ADULT: adult, CHILD: child, INFANT: infant } }) as FareFamily;

const outbound = fare(
  pax(3_499_00, 175_00, 650_00),
  pax(3_199_00, 160_00, 650_00),
  pax(1_500_00, 75_00, 0),
);
const inbound = fare(
  pax(4_000_00, 200_00, 650_00),
  pax(3_600_00, 180_00, 650_00),
  pax(1_500_00, 75_00, 0),
);

describe('fareTotal', () => {
  it('adds each passenger type × count', () => {
    expect(fareTotal(outbound.perPax, { adults: 2, children: 1, infants: 1 })).toBe(
      2 * 4_324_00 + 4_009_00 + 1_575_00,
    );
    expect(fareTotal(outbound.perPax, { adults: 1, children: 0, infants: 0 })).toBe(4_324_00);
  });
});

describe('flightPriceBreakdown', () => {
  it('itemises base per type, GST and airport fees; no convenience fee', () => {
    const p = flightPriceBreakdown([outbound], { adults: 2, children: 1, infants: 0 });
    expect(p.lines).toEqual([
      { label: 'Base fare — Adult × 2', amountPaise: 6_998_00 },
      { label: 'Base fare — Child × 1', amountPaise: 3_199_00 },
      { label: 'Taxes (GST)', amountPaise: 510_00 },
      { label: 'Airport fees', amountPaise: 1_950_00 },
    ]);
    expect(p).toMatchObject({
      basePaise: 10_197_00,
      taxesPaise: 2_460_00,
      feesPaise: 0,
      discountPaise: 0,
      totalPaise: 12_657_00,
      currency: 'INR',
    });
    expect(p.totalPaise).toBe(fareTotal(outbound.perPax, { adults: 2, children: 1, infants: 0 }));
  });

  it('sums both legs of a round trip', () => {
    const counts = { adults: 1, children: 0, infants: 0 };
    const p = flightPriceBreakdown([outbound, inbound], counts);
    expect(p.totalPaise).toBe(
      fareTotal(outbound.perPax, counts) + fareTotal(inbound.perPax, counts),
    );
    expect(p.lines[0]).toEqual({ label: 'Base fare — Adult × 1', amountPaise: 7_499_00 });
  });

  it('omits the airport-fee line when there are none', () => {
    const p = flightPriceBreakdown([outbound], { adults: 0, children: 0, infants: 1 });
    expect(p.lines.map((l) => l.label)).toEqual(['Base fare — Infant × 1', 'Taxes (GST)']);
    expect(p.totalPaise).toBe(1_575_00);
  });
});
