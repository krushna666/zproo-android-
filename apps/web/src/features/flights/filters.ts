import type { FlightOfferSummary } from '@zproo/types';
import { inSlots, listParam, TIME_SLOTS, type TimeSlot } from '@/components/filters/timeSlots';
import { localHourOf, sliceArrival, sliceDeparture } from './format';

/*
 * Results filters and sort, kept in the URL (?stops=0&air=SF,MN&sort=cheapest…) and applied on
 * the cached search result.
 */

export const FLIGHT_SORTS = [
  { id: 'best', label: 'Best' },
  { id: 'cheapest', label: 'Cheapest' },
  { id: 'fastest', label: 'Fastest' },
  { id: 'earliest', label: 'Earliest departure' },
  { id: 'latest', label: 'Latest departure' },
] as const;
export type FlightSortId = (typeof FLIGHT_SORTS)[number]['id'];
export const DEFAULT_FLIGHT_SORT: FlightSortId = 'best';

export const STOP_OPTIONS = [
  { id: '0', label: 'Non-stop' },
  { id: '1', label: '1 stop' },
  { id: '2', label: '2+ stops' },
] as const;
export type StopOption = (typeof STOP_OPTIONS)[number]['id'];

export interface FlightFilters {
  stops: StopOption[];
  departure: TimeSlot[];
  arrival: TimeSlot[];
  airlines: string[];
  /** Highest per-adult price, in paise */
  maxPrice: number | null;
  refundable: boolean;
  meal: boolean;
  /** Longest journey, in hours */
  maxHours: number | null;
}

export const EMPTY_FLIGHT_FILTERS: FlightFilters = {
  stops: [],
  departure: [],
  arrival: [],
  airlines: [],
  maxPrice: null,
  refundable: false,
  meal: false,
  maxHours: null,
};

const slice = (o: FlightOfferSummary) => o.slices[0];
const stopsOf = (o: FlightOfferSummary) => slice(o)?.stops ?? 0;
const durationOf = (o: FlightOfferSummary) => slice(o)?.durationMin ?? 0;
const departureOf = (o: FlightOfferSummary) => {
  const s = slice(o);
  return s ? sliceDeparture(s) : '';
};
const arrivalOf = (o: FlightOfferSummary) => {
  const s = slice(o);
  return s ? sliceArrival(s) : '';
};
const carriersOf = (o: FlightOfferSummary) =>
  new Set(o.slices.flatMap((s) => s.segments.map((x) => x.carrier.code)));

export function readFlightFilters(params: URLSearchParams): {
  filters: FlightFilters;
  sort: FlightSortId;
} {
  const price = Number(params.get('price'));
  const hours = Number(params.get('dur'));
  const sort = params.get('sort');
  return {
    filters: {
      stops: listParam(
        params.get('stops'),
        STOP_OPTIONS.map((s) => s.id),
      ),
      departure: listParam(
        params.get('dep'),
        TIME_SLOTS.map((t) => t.id),
      ),
      arrival: listParam(
        params.get('arr'),
        TIME_SLOTS.map((t) => t.id),
      ),
      airlines: (params.get('air') ?? '').split(',').filter((c) => /^[A-Z0-9]{2}$/.test(c)),
      maxPrice: Number.isInteger(price) && price > 0 ? price * 100 : null,
      refundable: params.get('refundable') === '1',
      meal: params.get('meal') === '1',
      maxHours: Number.isInteger(hours) && hours > 0 && hours <= 48 ? hours : null,
    },
    sort: FLIGHT_SORTS.some((s) => s.id === sort) ? (sort as FlightSortId) : DEFAULT_FLIGHT_SORT,
  };
}

/** Writes filters and sort into `params` (keeping the search). Empty values are removed. */
export function writeFlightFilters(
  params: URLSearchParams,
  f: FlightFilters,
  sort: FlightSortId,
): URLSearchParams {
  const next = new URLSearchParams(params);
  const set = (key: string, value: string | null) =>
    value ? next.set(key, value) : next.delete(key);
  set('stops', f.stops.join(','));
  set('dep', f.departure.join(','));
  set('arr', f.arrival.join(','));
  set('air', f.airlines.join(','));
  set('price', f.maxPrice === null ? null : String(Math.round(f.maxPrice / 100)));
  set('refundable', f.refundable ? '1' : null);
  set('meal', f.meal ? '1' : null);
  set('dur', f.maxHours === null ? null : String(f.maxHours));
  set('sort', sort === DEFAULT_FLIGHT_SORT ? null : sort);
  return next;
}

export function activeFlightFilterCount(f: FlightFilters): number {
  return (
    f.stops.length +
    f.departure.length +
    f.arrival.length +
    f.airlines.length +
    (f.maxPrice === null ? 0 : 1) +
    (f.refundable ? 1 : 0) +
    (f.meal ? 1 : 0) +
    (f.maxHours === null ? 0 : 1)
  );
}

export function applyFlightFilters(
  offers: readonly FlightOfferSummary[],
  f: FlightFilters,
): FlightOfferSummary[] {
  return offers.filter(
    (o) =>
      (f.stops.length === 0 || f.stops.includes(String(Math.min(stopsOf(o), 2)) as StopOption)) &&
      inSlots(localHourOf(departureOf(o)), f.departure) &&
      inSlots(localHourOf(arrivalOf(o)), f.arrival) &&
      (f.airlines.length === 0 || f.airlines.some((a) => carriersOf(o).has(a))) &&
      (f.maxPrice === null || o.fromPrice <= f.maxPrice) &&
      (!f.refundable || o.refundable) &&
      (!f.meal || o.mealIncluded) &&
      (f.maxHours === null || durationOf(o) <= f.maxHours * 60),
  );
}

/**
 * "Best" balances price and journey time, relative to the cheapest and the fastest offer in the
 * list: score = price / cheapest price + 0.1 × (extra hours over the fastest journey). An extra
 * hour of travel weighs like paying 10% more; the lowest score is best.
 */
export function bestScore(o: FlightOfferSummary, minPrice: number, minDuration: number): number {
  return o.fromPrice / minPrice + ((durationOf(o) - minDuration) / 60) * 0.1;
}

export function sortFlights(
  offers: readonly FlightOfferSummary[],
  sort: FlightSortId,
): FlightOfferSummary[] {
  const dep = (o: FlightOfferSummary) => Date.parse(departureOf(o));
  const by = (key: (o: FlightOfferSummary) => number) =>
    [...offers].sort((a, b) => key(a) - key(b) || a.fromPrice - b.fromPrice || dep(a) - dep(b));
  switch (sort) {
    case 'cheapest':
      return by((o) => o.fromPrice);
    case 'fastest':
      return by(durationOf);
    case 'earliest':
      return by(dep);
    case 'latest':
      return by((o) => -dep(o));
    case 'best': {
      const minPrice = Math.min(...offers.map((o) => o.fromPrice));
      const minDuration = Math.min(...offers.map(durationOf));
      return by((o) => bestScore(o, minPrice, minDuration));
    }
  }
}

export interface FlightFacets {
  priceMin: number;
  priceMax: number;
  maxHours: number;
  airlines: { code: string; name: string; count: number; minPrice: number }[];
  stops: { id: StopOption; count: number; minPrice: number }[];
  refundable: boolean;
  meal: boolean;
}

export function flightFacets(offers: readonly FlightOfferSummary[]): FlightFacets {
  const airlines = new Map<string, FlightFacets['airlines'][number]>();
  const stops = new Map<StopOption, FlightFacets['stops'][number]>();
  for (const o of offers) {
    for (const code of carriersOf(o)) {
      const name = o.slices.flatMap((s) => s.segments).find((x) => x.carrier.code === code)
        ?.carrier.name;
      const a = airlines.get(code) ?? { code, name: name ?? code, count: 0, minPrice: o.fromPrice };
      a.count += 1;
      a.minPrice = Math.min(a.minPrice, o.fromPrice);
      airlines.set(code, a);
    }
    const id = String(Math.min(stopsOf(o), 2)) as StopOption;
    const s = stops.get(id) ?? { id, count: 0, minPrice: o.fromPrice };
    s.count += 1;
    s.minPrice = Math.min(s.minPrice, o.fromPrice);
    stops.set(id, s);
  }
  const prices = offers.map((o) => o.fromPrice);
  return {
    priceMin: prices.length ? Math.min(...prices) : 0,
    priceMax: prices.length ? Math.max(...prices) : 0,
    maxHours: Math.ceil(Math.max(0, ...offers.map(durationOf)) / 60),
    airlines: [...airlines.values()].sort((a, b) => a.minPrice - b.minPrice),
    stops: [...stops.values()].sort((a, b) => a.id.localeCompare(b.id)),
    refundable: offers.some((o) => o.refundable),
    meal: offers.some((o) => o.mealIncluded),
  };
}
