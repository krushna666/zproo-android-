/**
 * Demo coupons: seeded into the database (prisma/seed/coupons.ts) and used by the static website.
 * Amounts in paise; PERCENT values in basis points (1000 = 10%). Dates are IST.
 */
export interface DemoCoupon {
  code: string;
  description: string;
  serviceType: 'BUS' | 'FLIGHT' | 'HOTEL' | null;
  discountType: 'FLAT' | 'PERCENT';
  value: number;
  maxDiscountPaise: number | null;
  minAmountPaise: number;
  perUserLimit: number;
  startsAt: string;
  endsAt: string;
}

const always = { startsAt: '2026-01-01T00:00:00+05:30', endsAt: '2030-12-31T23:59:59+05:30' };

export const DEMO_COUPONS: readonly DemoCoupon[] = [
  {
    code: 'ZPROOFIRST',
    description: '₹150 off your first booking',
    serviceType: null,
    discountType: 'FLAT',
    value: 15_000,
    maxDiscountPaise: null,
    minAmountPaise: 50_000,
    perUserLimit: 1,
    ...always,
  },
  {
    code: 'BUS10',
    description: '10% off bus tickets, up to ₹200',
    serviceType: 'BUS',
    discountType: 'PERCENT',
    value: 1_000,
    maxDiscountPaise: 20_000,
    minAmountPaise: 40_000,
    perUserLimit: 5,
    ...always,
  },
  {
    code: 'FLY500',
    description: '₹500 off flights above ₹4,000',
    serviceType: 'FLIGHT',
    discountType: 'FLAT',
    value: 50_000,
    maxDiscountPaise: null,
    minAmountPaise: 400_000,
    perUserLimit: 3,
    ...always,
  },
  {
    code: 'STAY15',
    description: '15% off hotel stays, up to ₹1,500',
    serviceType: 'HOTEL',
    discountType: 'PERCENT',
    value: 1_500,
    maxDiscountPaise: 150_000,
    minAmountPaise: 200_000,
    perUserLimit: 3,
    ...always,
  },
  {
    code: 'MONSOON20',
    description: '20% off (ended 31 Aug 2026)',
    serviceType: null,
    discountType: 'PERCENT',
    value: 2_000,
    maxDiscountPaise: 50_000,
    minAmountPaise: 0,
    perUserLimit: 1,
    startsAt: '2026-06-01T00:00:00+05:30',
    endsAt: '2026-08-31T23:59:59+05:30',
  },
];
