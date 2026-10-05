/**
 * Coupon arithmetic shared by the API and the static engine. All amounts are integer paise.
 *
 * The discount applies to the base fare only (never to taxes or fees) and is capped at
 * `maxDiscountPaise` (if set) and at the base fare, so a total can never go below taxes + fees.
 */
export interface CouponTerms {
  discountType: 'FLAT' | 'PERCENT';
  /** FLAT: paise. PERCENT: basis points (1000 = 10%). */
  value: number;
  maxDiscountPaise: number | null;
}

export function couponDiscount(terms: CouponTerms, basePaise: number): number {
  if (!Number.isSafeInteger(basePaise) || basePaise <= 0) return 0;
  const raw =
    terms.discountType === 'FLAT' ? terms.value : Math.floor((basePaise * terms.value) / 10_000);
  const capped = terms.maxDiscountPaise === null ? raw : Math.min(raw, terms.maxDiscountPaise);
  return Math.max(0, Math.min(capped, basePaise));
}

export interface Amounts {
  basePaise: number;
  taxPaise: number;
  feePaise: number;
  discountPaise: number;
}

/** Total payable: base + taxes + fees − discount. */
export function totalOf(a: Amounts): number {
  return a.basePaise + a.taxPaise + a.feePaise - a.discountPaise;
}

/** Amount a coupon's minimum is checked against: the booking before any discount. */
export function subtotalOf(a: Omit<Amounts, 'discountPaise'>): number {
  return a.basePaise + a.taxPaise + a.feePaise;
}
