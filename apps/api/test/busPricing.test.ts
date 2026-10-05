import { describe, expect, it } from 'vitest';
import { busFareBreakdown, busRefund, busSeatPrice, splitGst } from '../src/services/busPricing';

// 2026-10-07 is a Wednesday, 2026-10-09 a Friday.
const base = { baseFarePaise: 85_000, seatFarePercent: 100, today: '2026-09-26' };
const POLICY = [
  { hoursBefore: 24, refundPercent: 90 },
  { hoursBefore: 12, refundPercent: 75 },
  { hoursBefore: 4, refundPercent: 50 },
  { hoursBefore: 0, refundPercent: 0 },
];

describe('busSeatPrice', () => {
  it('charges more at weekends and at the last minute, less when booked early', () => {
    const midweek = busSeatPrice({ ...base, date: '2026-10-07' });
    expect(busSeatPrice({ ...base, date: '2026-10-09' })).toBeGreaterThan(midweek);
    expect(busSeatPrice({ ...base, date: '2026-09-27' })).toBeGreaterThan(
      busSeatPrice({ ...base, date: '2026-09-30' }),
    );
    expect(busSeatPrice({ ...base, date: '2026-10-21' })).toBeLessThan(midweek);
  });

  it('ends in 9 rupees and stays within ₹599–₹2,899', () => {
    for (const fare of [10_000, 45_000, 85_000, 190_000, 900_000]) {
      for (const pct of [100, 108, 115]) {
        const price = busSeatPrice({ ...base, baseFarePaise: fare, seatFarePercent: pct, date: '2026-10-09' });
        expect(price % 1000).toBe(900);
        expect(price).toBeGreaterThanOrEqual(59_900);
        expect(price).toBeLessThanOrEqual(289_900);
      }
    }
  });
});

describe('busFareBreakdown', () => {
  it('splits 5% GST out of A/C fares and none from non-A/C', () => {
    expect(splitGst(105_000, true)).toEqual({ basePaise: 100_000, taxPaise: 5_000 });
    expect(splitGst(105_000, false)).toEqual({ basePaise: 105_000, taxPaise: 0 });
    const bill = busFareBreakdown(
      [
        { seatNo: 'L1', price: 104_900 },
        { seatNo: 'L2', price: 99_900 },
      ],
      true,
    );
    expect(bill.totalPaise).toBe(204_800);
    expect(bill.basePaise + bill.taxesPaise).toBe(204_800);
    expect(bill.lines.map((l) => l.label)).toEqual(['Base fare — 2 seats', 'GST (5%)']);
    expect(busFareBreakdown([{ seatNo: '1', price: 59_900 }], false).lines).toEqual([
      { label: 'Base fare — 1 seat', amountPaise: 59_900 },
    ]);
  });
});

describe('busRefund', () => {
  it.each([
    [48 * 60, 90],
    [24 * 60, 90],
    [24 * 60 - 1, 75],
    [12 * 60, 75],
    [6 * 60, 50],
    [4 * 60, 50],
    [60, 0],
    [0, 0],
    [-30, 0],
  ])('%i minutes before departure refunds %i%%', (minutes, percent) => {
    expect(busRefund(100_000, 0, minutes, POLICY)).toEqual({
      refundPaise: percent * 1_000,
      refundPercent: percent,
    });
  });

  it('never refunds the convenience fee', () => {
    expect(busRefund(100_000, 2_000, 48 * 60, POLICY).refundPaise).toBe(88_200);
  });
});
