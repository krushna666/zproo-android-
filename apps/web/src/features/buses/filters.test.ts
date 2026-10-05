import { describe, expect, it } from 'vitest';
import {
  activeChips,
  applyBusFilters,
  busFacets,
  EMPTY_BUS_FILTERS,
  readBusFilters,
  sortBuses,
  writeBusFilters,
} from './filters';
import { TRIPS } from './test/fixtures';

const codes = (list: { operator: { code: string } }[]) => list.map((t) => t.operator.code);
const f = EMPTY_BUS_FILTERS;

describe('bus filters', () => {
  it('treats AC/Non AC and Sleeper/Seater as alternatives that narrow each other', () => {
    expect(codes(applyBusFilters(TRIPS, { ...f, types: ['ac'] }))).toEqual(['SSK', 'ECO']);
    expect(applyBusFilters(TRIPS, { ...f, types: ['ac', 'nonac'] })).toHaveLength(3);
    expect(codes(applyBusFilters(TRIPS, { ...f, types: ['ac', 'seater'] }))).toEqual(['ECO']);
    expect(codes(applyBusFilters(TRIPS, { ...f, types: ['sleeper'] }))).toEqual(['SSK']);
  });

  it('filters by departure and arrival time in IST', () => {
    expect(codes(applyBusFilters(TRIPS, { ...f, departure: ['night'] }))).toEqual(['SSK']);
    expect(codes(applyBusFilters(TRIPS, { ...f, departure: ['morning'] }))).toEqual(['PPR', 'ECO']);
    expect(codes(applyBusFilters(TRIPS, { ...f, arrival: ['early'] }))).toEqual(['SSK']);
  });

  it('filters by price, operator, amenities, rating and live tracking', () => {
    expect(codes(applyBusFilters(TRIPS, { ...f, maxPrice: 90_000 }))).toEqual(['PPR', 'ECO']);
    expect(codes(applyBusFilters(TRIPS, { ...f, operators: ['PPR'] }))).toEqual(['PPR']);
    expect(codes(applyBusFilters(TRIPS, { ...f, amenities: ['charging'] }))).toEqual([
      'SSK',
      'ECO',
    ]);
    expect(codes(applyBusFilters(TRIPS, { ...f, rating4: true }))).toEqual(['SSK', 'ECO']);
    expect(codes(applyBusFilters(TRIPS, { ...f, tracking: true }))).toEqual(['SSK']);
  });

  it('sorts by each option, earliest by default', () => {
    expect(codes(sortBuses(TRIPS, 'earliest'))).toEqual(['PPR', 'ECO', 'SSK']);
    expect(codes(sortBuses(TRIPS, 'latest'))).toEqual(['SSK', 'ECO', 'PPR']);
    expect(codes(sortBuses(TRIPS, 'cheapest'))).toEqual(['PPR', 'ECO', 'SSK']);
    expect(codes(sortBuses(TRIPS, 'fastest'))).toEqual(['ECO', 'PPR', 'SSK']);
    expect(codes(sortBuses(TRIPS, 'rating'))).toEqual(['ECO', 'SSK', 'PPR']);
  });

  it('filters and sorts a large list in well under 100ms', () => {
    const many = Array.from({ length: 2_000 }, (_, i) => TRIPS[i % 3] as (typeof TRIPS)[number]);
    const start = performance.now();
    sortBuses(
      applyBusFilters(many, { ...f, types: ['ac'], departure: ['night', 'morning'] }),
      'cheapest',
    );
    expect(performance.now() - start).toBeLessThan(100);
  });

  it('round-trips filters and sort through the URL and ignores junk', () => {
    const filters = {
      ...f,
      types: ['ac' as const, 'sleeper' as const],
      departure: ['night' as const],
      maxPrice: 150_000,
      operators: ['SSK'],
      amenities: ['wifi' as const],
      rating4: true,
      tracking: true,
    };
    const params = writeBusFilters(new URLSearchParams('from=PNQ&to=BOM'), filters, 'cheapest');
    expect(params.get('from')).toBe('PNQ');
    expect(params.get('price')).toBe('1500');
    expect(readBusFilters(params)).toEqual({ filters, sort: 'cheapest' });
    expect(readBusFilters(new URLSearchParams('type=boat,ac&sort=random&price=-5'))).toEqual({
      filters: { ...f, types: ['ac'] },
      sort: 'earliest',
    });
    expect(writeBusFilters(new URLSearchParams(), f, 'earliest').toString()).toBe('');
  });

  it('builds facets and removable chips', () => {
    const facets = busFacets(TRIPS);
    expect(facets).toMatchObject({ priceMin: 59_900, priceMax: 124_900, tracking: true });
    expect(facets.operators.map((o) => o.code)).toEqual(['ECO', 'PPR', 'SSK']);
    const chips = activeChips({ ...f, types: ['ac'], rating4: true }, (c) => c);
    expect(chips.map((c) => c.label)).toEqual(['AC', 'Rating 4+']);
    expect(chips[0]?.without.types).toEqual([]);
  });
});
