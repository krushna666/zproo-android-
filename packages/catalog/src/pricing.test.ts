import { describe, expect, it } from 'vitest';
import {
  BUS_AC_GST_PERCENT,
  BUS_MAX_SEAT_PAISE,
  BUS_MIN_SEAT_PAISE,
  busFareBreakdown,
  busSeatPrice,
  splitGst,
} from './busPricing';
import { hotelPriceBreakdown } from './hotels';

/** Prompt 04 §7: price calculation is covered branch by branch. */
describe('busFareBreakdown', () => {
  it('splits 5% GST out of A/C seat prices', () => {
    expect(splitGst(105_000, true)).toEqual({ basePaise: 100_000, taxPaise: 5_000 });
    const p = busFareBreakdown(
      [
        { seatNo: 'L1', price: 105_000 },
        { seatNo: 'L2', price: 126_000 },
      ],
      true,
    );
    expect(p.lines).toEqual([
      { label: 'Base fare — 2 seats', amountPaise: 220_000 },
      { label: `GST (${BUS_AC_GST_PERCENT}%)`, amountPaise: 11_000 },
    ]);
    expect(p).toMatchObject({
      basePaise: 220_000,
      taxesPaise: 11_000,
      feesPaise: 0,
      totalPaise: 231_000,
    });
  });

  it('charges no GST on non-A/C seats and shows a convenience fee only when there is one', () => {
    const plain = busFareBreakdown([{ seatNo: 'U1', price: 59_900 }], false);
    expect(plain.lines).toEqual([{ label: 'Base fare — 1 seat', amountPaise: 59_900 }]);
    expect(plain.totalPaise).toBe(59_900);
    const withFee = busFareBreakdown([{ seatNo: 'U1', price: 59_900 }], false, 4_900);
    expect(withFee.lines.at(-1)).toEqual({ label: 'Convenience fee', amountPaise: 4_900 });
    expect(withFee).toMatchObject({ feesPaise: 4_900, totalPaise: 64_800, currency: 'INR' });
  });
});

describe('hotelPriceBreakdown', () => {
  it('adds rooms, taxes and the convenience fee', () => {
    const p = hotelPriceBreakdown(
      [
        { price: 600_000, taxes: 72_000 },
        { price: 400_000, taxes: 48_000 },
      ],
      3,
      19_900,
    );
    expect(p.lines).toEqual([
      { label: 'Room charges — 2 rooms × 3 nights', amountPaise: 1_000_000 },
      { label: 'Taxes (GST)', amountPaise: 120_000 },
      { label: 'Convenience fee', amountPaise: 19_900 },
    ]);
    expect(p).toMatchObject({ basePaise: 1_000_000, taxesPaise: 120_000, totalPaise: 1_139_900 });
  });

  it('uses singular labels and drops a zero fee', () => {
    const p = hotelPriceBreakdown([{ price: 300_000, taxes: 36_000 }], 1, 0);
    expect(p.lines.map((l) => l.label)).toEqual(['Room charges — 1 room × 1 night', 'Taxes (GST)']);
    expect(p).toMatchObject({ feesPaise: 0, totalPaise: 336_000, discountPaise: 0 });
  });
});

describe('busSeatPrice', () => {
  // 2026-10-07 is a Wednesday, 2026-10-09 a Friday.
  const at = (date: string, today: string, baseFarePaise = 100_000, seatFarePercent = 100) =>
    busSeatPrice({ baseFarePaise, seatFarePercent, date, today });

  it('applies weekend, last-minute and early-booking demand, ending in ₹9', () => {
    expect(at('2026-10-14', '2026-10-07')).toBe(99_900); // weekday, a week out
    expect(at('2026-10-16', '2026-10-09')).toBe(111_900); // Friday +12%
    expect(at('2026-10-07', '2026-10-07')).toBe(109_900); // today +10%
    expect(at('2026-10-08', '2026-10-07')).toBe(109_900); // tomorrow +10%
    expect(at('2026-11-04', '2026-10-07')).toBe(94_900); // 4 weeks out −5%
  });

  it('stays within ₹599–₹2,899', () => {
    expect(at('2026-10-14', '2026-10-07', 10_000)).toBe(BUS_MIN_SEAT_PAISE);
    expect(at('2026-10-14', '2026-10-07', 900_000)).toBe(BUS_MAX_SEAT_PAISE);
  });
});
