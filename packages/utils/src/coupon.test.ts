import { describe, expect, it } from 'vitest';
import { couponDiscount, subtotalOf, totalOf } from './coupon';

describe('couponDiscount', () => {
  it('takes a flat amount off the base fare', () => {
    expect(
      couponDiscount({ discountType: 'FLAT', value: 15_000, maxDiscountPaise: null }, 124_900),
    ).toBe(15_000);
  });

  it('computes percentages in basis points, rounding down to the paisa', () => {
    // 10% of ₹1,249.99 = ₹124.999 → ₹124.99
    expect(
      couponDiscount({ discountType: 'PERCENT', value: 1_000, maxDiscountPaise: null }, 124_999),
    ).toBe(12_499);
  });

  it('caps at the maximum discount', () => {
    expect(
      couponDiscount({ discountType: 'PERCENT', value: 1_500, maxDiscountPaise: 20_000 }, 500_000),
    ).toBe(20_000);
  });

  it('never exceeds the base fare (taxes and fees stay payable)', () => {
    expect(
      couponDiscount({ discountType: 'FLAT', value: 200_000, maxDiscountPaise: null }, 59_900),
    ).toBe(59_900);
    expect(couponDiscount({ discountType: 'FLAT', value: 100, maxDiscountPaise: null }, 0)).toBe(0);
  });

  it('totals stay integers and include every part', () => {
    const amounts = { basePaise: 124_900, taxPaise: 6_245, feePaise: 4_900, discountPaise: 12_490 };
    expect(subtotalOf(amounts)).toBe(136_045);
    expect(totalOf(amounts)).toBe(123_555);
  });
});
