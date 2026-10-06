import { describe, expect, it } from 'vitest';
import {
  HOTEL_CITY_CODES,
  hotelCount,
  hotelDestination,
  hotelDetails,
  hotelNightTax,
  hotelPlan,
  hotelPlansAt,
  hotelPlansInCity,
  hotelPriceBreakdown,
  hotelRefund,
  hotelResultsPage,
  hotelRoomTypes,
  hotelSummary,
  quoteHotelRooms,
  roomsLeftFor,
  searchHotelDestinations,
  type HotelPlan,
  type HotelResultFilters,
} from './hotels';

const now = new Date('2026-10-05T10:00:00Z');
const IN = '2026-10-20';
const OUT = '2026-10-23';
const TWO = [{ adults: 2, childAges: [] }];
const noFilters: HotelResultFilters = {
  stars: [],
  freeCancellation: false,
  breakfast: false,
  amenities: [],
  areas: [],
  types: [],
  page: 1,
  pageSize: 20,
};
const goa = hotelPlansInCity('GOI');
const summaries = goa.map((p) => hotelSummary(p, IN, OUT, TWO, now)).filter((h) => h !== null);

describe('hotel inventory', () => {
  it('has 40–150 properties in each of six cities, 2–5 stars, 2–5 room types', () => {
    expect([...HOTEL_CITY_CODES].sort()).toEqual(['BLR', 'BOM', 'DEL', 'GOI', 'JAI', 'PNQ']);
    for (const code of HOTEL_CITY_CODES) {
      const plans = hotelPlansInCity(code);
      expect(plans).toHaveLength(hotelCount(code));
      expect(plans.length).toBeGreaterThanOrEqual(40);
      expect(plans.length).toBeLessThanOrEqual(150);
      for (const p of plans) {
        expect(p.stars).toBeGreaterThanOrEqual(2);
        expect(p.stars).toBeLessThanOrEqual(5);
        expect(p.roomTypes.length).toBeGreaterThanOrEqual(2);
        expect(p.roomTypes.length).toBeLessThanOrEqual(5);
        for (const rt of p.roomTypes) expect(rt.rates.length).toBeGreaterThanOrEqual(1);
      }
    }
    expect(goa.some((p) => p.scarce)).toBe(true);
  });

  it('is deterministic and rejects unknown ids', () => {
    expect(hotelPlan('htl_GOI007')).toEqual(hotelPlan('htl_GOI007'));
    expect(hotelPlan('htl_GOI999')).toBeNull();
    expect(hotelPlan('htl_XXX001')).toBeNull();
  });

  it('describes properties with a gallery of local images and the house rules', () => {
    const details = hotelDetails(hotelPlan('htl_GOI007') as HotelPlan, true);
    expect(details.images.length).toBeGreaterThanOrEqual(5);
    for (const image of details.images) {
      expect(image.url).toMatch(/^\/assets\/hotels\/[a-z0-9-]+\.svg$/);
      expect(image.alt.length).toBeGreaterThan(5);
    }
    expect(details.amenityGroups.map((g) => g.group)).toContain('Accessibility');
    expect(details.houseRules.join(' ')).toMatch(/photo ID/);
    expect(details.address).not.toMatch(/Goa, Goa/);
  });
});

describe('destinations', () => {
  it('suggests cities, areas and properties', () => {
    const results = searchHotelDestinations('goa');
    expect(results[0]).toMatchObject({ id: 'city_GOI', type: 'CITY', name: 'Goa' });
    expect(results.some((d) => d.type === 'AREA' && d.name === 'Calangute')).toBe(true);
    expect(searchHotelDestinations('calan')[0]).toMatchObject({ id: 'area_GOI_calangute' });
    expect(hotelDestination('area_GOI_calangute')?.name).toBe('Calangute');
    expect(hotelDestination('area_GOI_nowhere')).toBeNull();
    expect(hotelPlansAt('area_GOI_calangute').every((p) => p.area === 'Calangute')).toBe(true);
    expect(hotelPlansAt('htl_GOI007')).toHaveLength(1);
  });
});

describe('prices and availability', () => {
  it('prices every night; weekends cost more; GST is 5% up to ₹7,500 and 18% above', () => {
    const plan = hotelPlan('htl_GOI007') as HotelPlan;
    const rate = hotelRoomTypes(plan, '2026-10-21', '2026-10-25')[0]?.rates[0];
    expect(rate?.nightlyBreakdown.map((n) => n.date)).toEqual([
      '2026-10-21',
      '2026-10-22',
      '2026-10-23',
      '2026-10-24',
    ]);
    const [wed, , fri] = rate?.nightlyBreakdown ?? [];
    expect((fri?.price ?? 0) > (wed?.price ?? 0)).toBe(true);
    expect(rate?.totalPrice).toBe(rate?.nightlyBreakdown.reduce((s, n) => s + n.price, 0));
    expect(hotelNightTax(500_000)).toBe(25_000);
    expect(hotelNightTax(750_000)).toBe(37_500);
    expect(hotelNightTax(800_000)).toBe(144_000);
  });

  it('counts holds per night and never goes below zero', () => {
    const plan = goa.find((p) => p.scarce) as HotelPlan;
    const rt = plan.roomTypes[0] as HotelPlan['roomTypes'][number];
    expect(roomsLeftFor(plan, rt, IN, OUT)).toBe(1);
    const hold = {
      roomTypeId: rt.roomTypeId,
      checkIn: '2026-10-22',
      checkOut: '2026-10-24',
      rooms: 1,
    };
    expect(roomsLeftFor(plan, rt, IN, OUT, [hold])).toBe(0);
    // A stay ending the day the hold begins doesn't overlap.
    expect(roomsLeftFor(plan, rt, IN, '2026-10-22', [hold])).toBe(1);
    expect(hotelSummary(plan, IN, OUT, TWO, now)?.roomsLeft).toBe(1);
  });

  it('places multi-room searches in fitting room types', () => {
    const plan = hotelPlan('htl_GOI007') as HotelPlan;
    const one = hotelSummary(plan, IN, OUT, TWO, now);
    const two = hotelSummary(plan, IN, OUT, [...TWO, { adults: 2, childAges: [7] }], now);
    expect((two?.totalPrice ?? 0) > (one?.totalPrice ?? 0)).toBe(true);
    const nobody = hotelSummary(plan, IN, OUT, [{ adults: 4, childAges: [1, 2, 3] }], now);
    expect(nobody).toBeNull();
  });
});

describe('results', () => {
  it('filters, sorts and pages, with facets over every hotel', () => {
    const page = hotelResultsPage(summaries, { ...noFilters, sort: 'price_asc', pageSize: 10 });
    expect(page.total).toBe(summaries.length);
    expect(page.hotels).toHaveLength(10);
    const prices = page.hotels.map((h) => h.pricePerNight);
    expect(prices).toEqual([...prices].sort((a, b) => a - b));
    const second = hotelResultsPage(summaries, {
      ...noFilters,
      sort: 'price_asc',
      page: 2,
      pageSize: 10,
    });
    expect(second.hotels[0]?.pricePerNight).toBeGreaterThanOrEqual(prices.at(-1) ?? 0);

    const filtered = hotelResultsPage(summaries, {
      ...noFilters,
      stars: [4],
      freeCancellation: true,
      amenities: ['pool'],
    });
    expect(filtered.total).toBeGreaterThan(0);
    for (const h of filtered.hotels) {
      expect(h.stars).toBe(4);
      expect(h.freeCancellation).toBe(true);
      expect(h.amenities).toContain('pool');
    }
    expect(filtered.filters).toEqual(page.filters);
    expect(page.filters.areas.reduce((s, a) => s + a.count, 0)).toBe(summaries.length);
  });
});

describe('booking quote', () => {
  const plan = hotelPlan('htl_GOI007') as HotelPlan;
  const rt = plan.roomTypes[0] as HotelPlan['roomTypes'][number];
  const rate = rt.rates[0] as HotelPlan['roomTypes'][number]['rates'][number];
  const room = { roomTypeId: rt.roomTypeId, rateId: rate.rateId, adults: 2, childAges: [] };

  it('prices rooms and checks occupancy, rates and availability', () => {
    const quote = quoteHotelRooms(plan, IN, OUT, [room]);
    expect(quote.ok && quote.rooms[0]?.nightlyBreakdown).toHaveLength(3);
    expect(quoteHotelRooms(plan, IN, OUT, [{ ...room, adults: rt.maxAdults + 1 }])).toMatchObject({
      ok: false,
      error: 'OCCUPANCY',
      field: 'adults',
      max: rt.maxAdults,
    });
    expect(quoteHotelRooms(plan, IN, OUT, [{ ...room, rateId: 'rate_GOI008_1_ro' }])).toMatchObject(
      {
        ok: false,
        error: 'BAD_RATE',
      },
    );
    const all = roomsLeftFor(plan, rt, IN, OUT);
    expect(quoteHotelRooms(plan, IN, OUT, Array(all + 1).fill(room))).toEqual({
      ok: false,
      error: 'ROOM_UNAVAILABLE',
      roomTypeId: rt.roomTypeId,
    });
  });

  it('bills nightly sums + taxes + fee', () => {
    const bill = hotelPriceBreakdown(
      [
        { price: 1_000_000, taxes: 50_000 },
        { price: 500_000, taxes: 25_000 },
      ],
      3,
      19_900,
    );
    expect(bill.lines).toEqual([
      { label: 'Room charges — 2 rooms × 3 nights', amountPaise: 1_500_000 },
      { label: 'Taxes (GST)', amountPaise: 75_000 },
      { label: 'Convenience fee', amountPaise: 19_900 },
    ]);
    expect(bill.totalPaise).toBe(1_594_900);
  });
});

describe('hotelRefund', () => {
  const nights = [
    { date: IN, price: 400_000 },
    { date: '2026-10-21', price: 400_000 },
  ];
  const gross = 2 * (400_000 + 20_000);
  const refundable = {
    refundable: true,
    freeCancellationUntil: '2026-10-18T12:00:00+05:30',
    price: 800_000,
    nightlyBreakdown: nights,
  };
  const at = (iso: string) => new Date(iso);

  it('refunds in full before the deadline, all but the first night after it', () => {
    expect(
      hotelRefund({
        rooms: [refundable],
        checkIn: IN,
        paidPaise: gross,
        feesPaise: 0,
        now: at('2026-10-18T06:00:00Z'),
      }),
    ).toEqual({ cancellable: true, refundPaise: gross });
    expect(
      hotelRefund({
        rooms: [refundable],
        checkIn: IN,
        paidPaise: gross,
        feesPaise: 0,
        now: at('2026-10-18T07:00:00Z'),
      }),
    ).toEqual({ cancellable: true, refundPaise: 420_000 });
  });

  it('refunds nothing for non-refundable rates and closes on the check-in date', () => {
    const nonRefundable = { ...refundable, refundable: false, freeCancellationUntil: null };
    expect(
      hotelRefund({ rooms: [nonRefundable], checkIn: IN, paidPaise: gross, feesPaise: 0, now }),
    ).toEqual({ cancellable: true, refundPaise: 0 });
    expect(
      hotelRefund({
        rooms: [refundable],
        checkIn: IN,
        paidPaise: gross,
        feesPaise: 0,
        now: at('2026-10-19T18:30:00Z'),
      }).cancellable,
    ).toBe(false);
  });

  it('applies room shares to what was paid after a coupon, keeping the fee', () => {
    const nonRefundable = { ...refundable, refundable: false, freeCancellationUntil: null };
    const result = hotelRefund({
      rooms: [refundable, nonRefundable],
      checkIn: IN,
      paidPaise: 2 * gross - 100_000 + 10_000,
      feesPaise: 10_000,
      now,
    });
    expect(result.refundPaise).toBe(Math.floor(((2 * gross - 100_000) * gross) / (2 * gross)));
  });
});
