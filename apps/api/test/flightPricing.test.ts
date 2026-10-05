import { fareFamiliesFor, flightPlans } from '@zproo/catalog';
import { describe, expect, it } from 'vitest';
import { fareTotal, flightPriceBreakdown } from '../src/services/flightPricing';

const pax = { adults: 2, children: 1, infants: 1 };
const fares = (from: string, to: string) => {
  const [plan] = flightPlans(from, to, '2026-11-12', 'ECONOMY');
  if (!plan) throw new Error('no plan');
  return fareFamiliesFor(plan, pax, '2026-10-20');
};

describe('flightPriceBreakdown', () => {
  it('bills base fare per passenger type, GST and airport fees', () => {
    const [saver] = fares('PNQ', 'DEL');
    if (!saver) throw new Error('no fare');
    const bill = flightPriceBreakdown([saver], pax);
    expect(bill.lines.map((l) => l.label)).toEqual([
      'Base fare — Adult × 2',
      'Base fare — Child × 1',
      'Base fare — Infant × 1',
      'Taxes (GST)',
      'Airport fees',
    ]);
    expect(bill.totalPaise).toBe(fareTotal(saver.perPax, pax));
    expect(bill.basePaise + bill.taxesPaise + bill.feesPaise).toBe(bill.totalPaise);
    expect(bill.feesPaise).toBe(0);
  });

  it('adds both directions of a round trip into one total', () => {
    const [out] = fares('PNQ', 'DEL');
    const [back] = fares('DEL', 'PNQ');
    if (!out || !back) throw new Error('no fares');
    expect(flightPriceBreakdown([out, back], pax).totalPaise).toBe(
      fareTotal(out.perPax, pax) + fareTotal(back.perPax, pax),
    );
  });
});
