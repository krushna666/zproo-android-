import { describe, expect, it } from 'vitest';
import {
  applyFlightFilters,
  bestScore,
  EMPTY_FLIGHT_FILTERS,
  flightFacets,
  readFlightFilters,
  sortFlights,
  writeFlightFilters,
} from './filters';
import { arrivalLabel, dayShift, stopsLabel } from './format';
import { OFFERS } from './test/fixtures';

const codes = (list: { carrier: { code: string } }[]) => list.map((o) => o.carrier.code);
const f = EMPTY_FLIGHT_FILTERS;

describe('flight filters', () => {
  it('filters by stops, times, airlines, price, refundable, meal and duration', () => {
    expect(codes(applyFlightFilters(OFFERS, { ...f, stops: ['0'] }))).toEqual(['SF', 'DB']);
    expect(codes(applyFlightFilters(OFFERS, { ...f, stops: ['1'] }))).toEqual(['MN']);
    expect(codes(applyFlightFilters(OFFERS, { ...f, departure: ['night'] }))).toEqual(['DB']);
    expect(codes(applyFlightFilters(OFFERS, { ...f, arrival: ['early'] }))).toEqual(['DB']);
    expect(codes(applyFlightFilters(OFFERS, { ...f, airlines: ['MN', 'DB'] }))).toEqual([
      'MN',
      'DB',
    ]);
    expect(codes(applyFlightFilters(OFFERS, { ...f, maxPrice: 420_000 }))).toEqual(['MN', 'DB']);
    expect(codes(applyFlightFilters(OFFERS, { ...f, refundable: true }))).toEqual(['SF', 'DB']);
    expect(codes(applyFlightFilters(OFFERS, { ...f, meal: true }))).toEqual(['SF']);
    expect(codes(applyFlightFilters(OFFERS, { ...f, maxHours: 3 }))).toEqual(['SF', 'DB']);
  });

  it('sorts by each option', () => {
    expect(codes(sortFlights(OFFERS, 'cheapest'))).toEqual(['MN', 'DB', 'SF']);
    expect(codes(sortFlights(OFFERS, 'fastest'))).toEqual(['SF', 'DB', 'MN']);
    expect(codes(sortFlights(OFFERS, 'earliest'))).toEqual(['SF', 'MN', 'DB']);
    expect(codes(sortFlights(OFFERS, 'latest'))).toEqual(['DB', 'MN', 'SF']);
    // Best: price relative to the cheapest + 0.1 per extra hour over the fastest.
    expect(codes(sortFlights(OFFERS, 'best'))).toEqual(['DB', 'MN', 'SF']);
  });

  it('scores "best" as price ratio plus 10% per extra hour', () => {
    const [sf, mn] = OFFERS;
    if (!sf || !mn) throw new Error('fixtures');
    expect(bestScore(mn, 359_900, 140)).toBeCloseTo(1 + ((355 - 140) / 60) * 0.1, 5);
    expect(bestScore(sf, 359_900, 140)).toBeCloseTo(489_900 / 359_900, 5);
  });

  it('round-trips through the URL and ignores junk', () => {
    const filters = {
      ...f,
      stops: ['0' as const],
      departure: ['morning' as const],
      airlines: ['SF'],
      maxPrice: 450_000,
      refundable: true,
      meal: true,
      maxHours: 4,
    };
    const params = writeFlightFilters(new URLSearchParams('from=PNQ'), filters, 'cheapest');
    expect(params.get('from')).toBe('PNQ');
    expect(readFlightFilters(params)).toEqual({ filters, sort: 'cheapest' });
    expect(readFlightFilters(new URLSearchParams('stops=7,0&air=x&dur=99&sort=x'))).toEqual({
      filters: { ...f, stops: ['0'] },
      sort: 'best',
    });
  });

  it('builds facets with the lowest price per airline and stop count', () => {
    const facets = flightFacets(OFFERS);
    expect(facets.airlines.map((a) => [a.code, a.minPrice])).toEqual([
      ['MN', 359_900],
      ['DB', 419_900],
      ['SF', 489_900],
    ]);
    expect(facets.stops.map((s) => s.id)).toEqual(['0', '1']);
    expect(facets.maxHours).toBe(6);
  });
});

describe('flight formatting', () => {
  it('labels stops and layovers', () => {
    const [nonStop, oneStop] = OFFERS.map((o) => o.slices[0]);
    if (!nonStop || !oneStop) throw new Error('fixtures');
    expect(stopsLabel(nonStop)).toBe('Non-stop');
    expect(stopsLabel(oneStop)).toBe('1 stop via BLR (1h 25m)');
  });

  it('shows +1 / +2 for arrivals on later days (local dates)', () => {
    expect(dayShift('2026-10-25T22:40:00+05:30', '2026-10-26T01:05:00+05:30')).toBe(1);
    expect(dayShift('2026-10-25T22:40:00+05:30', '2026-10-27T01:05:00+04:00')).toBe(2);
    expect(arrivalLabel('2026-10-25T22:40:00+05:30', '2026-10-26T01:05:00+05:30')).toBe('01:05 +1');
    expect(arrivalLabel('2026-10-25T06:30:00+05:30', '2026-10-25T08:50:00+05:30')).toBe('08:50');
  });
});
