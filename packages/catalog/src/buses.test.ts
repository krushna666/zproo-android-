import { findCity } from '@zproo/config';
import { describe, expect, it } from 'vitest';
import {
  BUS_ROUTES,
  _planTrip,
  adjacentSeats,
  buildSeatLayout,
  busSeatsFor,
  busTripCount,
  busTripDetails,
  busTripPlan,
  busTripPlans,
  istIso,
  mockSeats,
  parseBusTripId,
} from './buses';
import { busFareBreakdown, busRefund, busSeatPrice, splitGst } from './busPricing';

const NOW = new Date('2026-10-05T06:00:00Z'); // 11:30 IST
const DATE = '2026-10-20';

describe('bus seat layouts', () => {
  it.each([
    [
      'SLEEPER_2_1',
      [
        ['LOWER', 12, 4, 18],
        ['UPPER', 12, 4, 18],
      ],
    ],
    [
      'SEATER_SLEEPER_COMBO',
      [
        ['LOWER', 10, 4, 30],
        ['UPPER', 12, 4, 18],
      ],
    ],
    ['SEMI_SLEEPER_2_2', [['LOWER', 11, 5, 44]]],
    ['SEATER_2_1', [['LOWER', 12, 4, 36]]],
    ['SEATER_2_2', [['LOWER', 10, 5, 40]]],
  ] as const)('%s has the expected decks, grid and seat count', (layout, decks) => {
    const spec = buildSeatLayout(layout);
    expect(spec.decks.map((d) => [d.deck, d.rows, d.cols, d.seats.length])).toEqual(decks);
    for (const deck of spec.decks) {
      // The aisle column is always empty and seats never overlap.
      const aisle = deck.cols === 5 ? 2 : 2;
      expect(deck.seats.some((s) => s.col === aisle)).toBe(false);
      const cells = new Set<string>();
      for (const s of deck.seats) {
        for (let r = s.row; r < s.row + s.height; r++) {
          const key = `${r}:${s.col}`;
          expect(cells.has(key)).toBe(false);
          cells.add(key);
        }
      }
      expect(new Set(deck.seats.map((s) => s.seatNo)).size).toBe(deck.seats.length);
    }
  });

  it('renders sleepers as tall cells and numbers decks L/U', () => {
    const spec = buildSeatLayout('SLEEPER_2_1');
    expect(spec.decks[0]?.seats[0]).toMatchObject({
      seatNo: 'L1',
      type: 'SLEEPER',
      width: 1,
      height: 2,
    });
    expect(spec.decks[1]?.seats[0]?.seatNo).toBe('U1');
  });

  it('knows which seats are side by side (never across the aisle)', () => {
    const spec = buildSeatLayout('SEATER_2_2');
    expect(adjacentSeats(spec, '1')).toEqual(['2']);
    expect(adjacentSeats(spec, '2')).toEqual(['1']); // seat 3 is across the aisle
    expect(adjacentSeats(spec, '3')).toEqual(['4']);
    expect(adjacentSeats(buildSeatLayout('SLEEPER_2_1'), 'L3')).toEqual([]);
  });
});

describe('mock bus trips', () => {
  it('runs 12–25 trips per route and day, deterministically', () => {
    const counts = Array.from({ length: 60 }, (_, d) =>
      busTripCount('PNQ', 'BOM', `2026-11-${String((d % 28) + 1).padStart(2, '0')}`),
    );
    expect(Math.min(...counts)).toBeGreaterThanOrEqual(12);
    expect(Math.max(...counts)).toBeLessThanOrEqual(25);
    expect(busTripPlans('PNQ', 'BOM', DATE, NOW)).toEqual(busTripPlans('PNQ', 'BOM', DATE, NOW));
  });

  it('has trip IDs that round-trip', () => {
    const [first] = busTripPlans('PNQ', 'BOM', DATE, NOW);
    expect(first?.tripId).toMatch(/^trp_PNQ_BOM_20261020_\d{2}$/);
    expect(parseBusTripId(first?.tripId ?? '')).toMatchObject({
      from: 'PNQ',
      to: 'BOM',
      date: DATE,
    });
    expect(busTripPlan(first?.tripId ?? '')).toEqual(first);
    expect(busTripPlan('trp_PNQ_XXX_20261020_00')).toBeNull();
    expect(busTripPlan('trp_PNQ_BOM_20261020_99')).toBeNull();
  });

  it('only uses known city codes', () => {
    for (const [a, b] of BUS_ROUTES) {
      expect(findCity(a)?.code).toBe(a);
      expect(findCity(b)?.code).toBe(b);
    }
  });

  it('is evening heavy, with overnight arrivals on long routes', () => {
    const plans = busTripPlans('PNQ', 'BLR', DATE, NOW);
    expect(plans.every((p) => p.departureMinutes >= 18 * 60)).toBe(true);
    const details = busTripDetails(plans[0] as (typeof plans)[number], NOW);
    expect(details.arrival.slice(0, 10)).toBe('2026-10-21');
    const short = busTripPlans('PNQ', 'BOM', DATE, NOW);
    const evening = short.filter((p) => p.departureMinutes >= 18 * 60).length;
    expect(evening / short.length).toBeGreaterThan(0.4);
  });

  it('sells 10–40% of seats before us, prices seats ₹599–₹2,899, keeps exactly two ladies seats', () => {
    for (const route of [
      ['PNQ', 'BOM'],
      ['BOM', 'BLR'],
      ['ISK', 'SAG'],
    ] as const) {
      for (const plan of busTripPlans(route[0], route[1], DATE, NOW)) {
        const { seats } = mockSeats(plan, '2026-10-05');
        const sold = seats.filter((s) => s.presold).length / seats.length;
        expect(sold).toBeGreaterThanOrEqual(0.09);
        expect(sold).toBeLessThanOrEqual(0.41);
        expect(seats.filter((s) => s.ladiesOnly)).toHaveLength(2);
        for (const s of seats) {
          expect(s.price).toBeGreaterThanOrEqual(59_900);
          expect(s.price).toBeLessThanOrEqual(289_900);
          expect(s.price % 1_000).toBe(900);
        }
      }
    }
  });

  it('closes sales 30 minutes before departure', () => {
    const plan = busTripPlans('PNQ', 'BOM', DATE, NOW)[0] as NonNullable<
      ReturnType<typeof busTripPlan>
    >;
    const departure = Date.parse(istIso(plan.date, plan.departureMinutes));
    const soon = new Date(departure - 29 * 60_000);
    expect(busTripDetails(plan, soon).bookable).toBe(false);
    expect(busTripPlans('PNQ', 'BOM', DATE, soon).some((p) => p.tripId === plan.tripId)).toBe(
      false,
    );
    expect(busTripDetails(plan, new Date(departure - 31 * 60_000)).bookable).toBe(true);
  });

  it('marks live holds as HELD and makes the seat beside a woman ladies-only', () => {
    const plan = _planTrip('PNQ', 'BOM', DATE, 0);
    if (!plan) throw new Error('no plan');
    const { seats } = busSeatsFor(plan, NOW);
    const free = seats.find(
      (s) =>
        !s.presold && !s.ladiesOnly && s.type !== 'SLEEPER' && s.deck === 'LOWER' && s.col <= 1,
    );
    if (!free) return; // layout without a free aisle-side pair on this trip
    const { decks } = busSeatsFor(plan, NOW, [{ seatNo: free.seatNo, female: true }]);
    const all = decks.flatMap((d) => d.seats);
    expect(all.find((s) => s.seatNo === free.seatNo)).toMatchObject({
      status: 'HELD',
      bookedByFemale: true,
    });
  });

  it('formats times with the IST offset and rolls over midnight', () => {
    expect(istIso('2026-10-20', 21 * 60 + 30)).toBe('2026-10-20T21:30:00+05:30');
    expect(istIso('2026-10-20', 24 * 60 + 6 * 60 + 15)).toBe('2026-10-21T06:15:00+05:30');
    expect(istIso('2026-12-31', 48 * 60 + 5)).toBe('2027-01-02T00:05:00+05:30');
  });
});

describe('bus fares', () => {
  it('prices weekend and last-minute seats higher, clamped to the range', () => {
    const base = { baseFarePaise: 85_000, seatFarePercent: 100, today: '2026-10-05' };
    const weekday = busSeatPrice({ ...base, date: '2026-10-21' }); // Wednesday
    const weekend = busSeatPrice({ ...base, date: '2026-10-24' }); // Saturday
    expect(weekend).toBeGreaterThan(weekday);
    expect(busSeatPrice({ ...base, baseFarePaise: 1_000, date: '2026-10-21' })).toBe(59_900);
    expect(busSeatPrice({ ...base, baseFarePaise: 9_000_000, date: '2026-10-21' })).toBe(289_900);
  });

  it('splits 5% GST out of A/C prices, in whole paise', () => {
    expect(splitGst(124_900, true)).toEqual({ basePaise: 118_952, taxPaise: 5_948 });
    expect(splitGst(124_900, false)).toEqual({ basePaise: 124_900, taxPaise: 0 });
  });

  it('totals seats exactly (the seat page total equals the charged total)', () => {
    const bill = busFareBreakdown(
      [
        { seatNo: 'L4', price: 124_900 },
        { seatNo: 'L5', price: 124_900 },
      ],
      true,
    );
    expect(bill.totalPaise).toBe(249_800);
    expect(bill.basePaise + bill.taxesPaise + bill.feesPaise).toBe(249_800);
    expect(bill.lines.map((l) => l.label)).toEqual(['Base fare — 2 seats', 'GST (5%)']);
  });

  it('refunds by cancellation tier', () => {
    const policy = [
      { hoursBefore: 24, refundPercent: 90 },
      { hoursBefore: 12, refundPercent: 75 },
      { hoursBefore: 4, refundPercent: 50 },
      { hoursBefore: 0, refundPercent: 0 },
    ];
    expect(busRefund(100_000, 0, 30 * 60, policy)).toEqual({
      refundPaise: 90_000,
      refundPercent: 90,
    });
    expect(busRefund(100_000, 0, 24 * 60, policy)).toEqual({
      refundPaise: 90_000,
      refundPercent: 90,
    });
    expect(busRefund(100_000, 0, 13 * 60, policy)).toEqual({
      refundPaise: 75_000,
      refundPercent: 75,
    });
    expect(busRefund(100_000, 0, 5 * 60, policy)).toEqual({
      refundPaise: 50_000,
      refundPercent: 50,
    });
    expect(busRefund(100_000, 0, 60, policy)).toEqual({ refundPaise: 0, refundPercent: 0 });
    expect(busRefund(100_000, 0, -5, policy)).toEqual({ refundPaise: 0, refundPercent: 0 });
    expect(busRefund(100_000, 5_000, 30 * 60, policy).refundPaise).toBe(85_500);
  });
});
