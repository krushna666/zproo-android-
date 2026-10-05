import type { BusAmenity, BusTripSummary } from '@zproo/types';
import { BUS_AMENITY_LABELS } from '@zproo/types';
import { inSlots, listParam, TIME_SLOTS, type TimeSlot } from '@/components/filters/timeSlots';
import { istHour } from './format';

/*
 * Results filters and sort, kept in the URL (?type=ac,sleeper&dep=night&sort=cheapest…) so a
 * filtered list is shareable and survives reloads. Everything runs on the cached search result.
 */

export const BUS_SORTS = [
  { id: 'cheapest', label: 'Cheapest' },
  { id: 'fastest', label: 'Fastest' },
  { id: 'earliest', label: 'Earliest' },
  { id: 'latest', label: 'Latest' },
  { id: 'rating', label: 'Top rated' },
] as const;
export type BusSortId = (typeof BUS_SORTS)[number]['id'];
export const DEFAULT_BUS_SORT: BusSortId = 'earliest';

export const BUS_TYPES = [
  { id: 'ac', label: 'AC' },
  { id: 'nonac', label: 'Non AC' },
  { id: 'sleeper', label: 'Sleeper' },
  { id: 'seater', label: 'Seater' },
] as const;
export type BusTypeFilter = (typeof BUS_TYPES)[number]['id'];

export { TIME_SLOTS, type TimeSlot };

export const AMENITY_FILTERS = Object.keys(BUS_AMENITY_LABELS) as BusAmenity[];

export interface BusFilters {
  types: BusTypeFilter[];
  departure: TimeSlot[];
  arrival: TimeSlot[];
  /** Highest "from" price, in paise */
  maxPrice: number | null;
  operators: string[];
  amenities: BusAmenity[];
  rating4: boolean;
  tracking: boolean;
}

export const EMPTY_BUS_FILTERS: BusFilters = {
  types: [],
  departure: [],
  arrival: [],
  maxPrice: null,
  operators: [],
  amenities: [],
  rating4: false,
  tracking: false,
};

const list = listParam;

/** Reads filters and sort from the URL; unknown values are ignored. */
export function readBusFilters(params: URLSearchParams): { filters: BusFilters; sort: BusSortId } {
  const price = Number(params.get('price'));
  const sort = params.get('sort');
  return {
    filters: {
      types: list(
        params.get('type'),
        BUS_TYPES.map((t) => t.id),
      ),
      departure: list(
        params.get('dep'),
        TIME_SLOTS.map((t) => t.id),
      ),
      arrival: list(
        params.get('arr'),
        TIME_SLOTS.map((t) => t.id),
      ),
      maxPrice: Number.isInteger(price) && price > 0 ? price * 100 : null,
      operators: (params.get('ops') ?? '').split(',').filter((c) => /^[A-Z0-9]{2,6}$/.test(c)),
      amenities: list(params.get('amen'), AMENITY_FILTERS),
      rating4: params.get('rating') === '4',
      tracking: params.get('tracking') === '1',
    },
    sort: BUS_SORTS.some((s) => s.id === sort) ? (sort as BusSortId) : DEFAULT_BUS_SORT,
  };
}

/** Writes filters and sort into `params` (keeping from/to/date). Empty values are removed. */
export function writeBusFilters(
  params: URLSearchParams,
  filters: BusFilters,
  sort: BusSortId,
): URLSearchParams {
  const next = new URLSearchParams(params);
  const set = (key: string, value: string | null) =>
    value ? next.set(key, value) : next.delete(key);
  set('type', filters.types.join(','));
  set('dep', filters.departure.join(','));
  set('arr', filters.arrival.join(','));
  set('price', filters.maxPrice === null ? null : String(Math.round(filters.maxPrice / 100)));
  set('ops', filters.operators.join(','));
  set('amen', filters.amenities.join(','));
  set('rating', filters.rating4 ? '4' : null);
  set('tracking', filters.tracking ? '1' : null);
  set('sort', sort === DEFAULT_BUS_SORT ? null : sort);
  return next;
}

export function activeBusFilterCount(f: BusFilters): number {
  return (
    f.types.length +
    f.departure.length +
    f.arrival.length +
    f.operators.length +
    f.amenities.length +
    (f.maxPrice === null ? 0 : 1) +
    (f.rating4 ? 1 : 0) +
    (f.tracking ? 1 : 0)
  );
}

function matchesType(trip: BusTripSummary, type: BusTypeFilter): boolean {
  switch (type) {
    case 'ac':
      return trip.busType.ac;
    case 'nonac':
      return !trip.busType.ac;
    case 'sleeper':
      return trip.busType.sleeper;
    case 'seater':
      return trip.busType.seater;
  }
}

/**
 * AC and Non AC are alternatives (either matches), as are Sleeper and Seater; the two groups
 * narrow each other (AC + Sleeper = AC sleepers). Every other filter narrows the list.
 */
export function applyBusFilters(trips: readonly BusTripSummary[], f: BusFilters): BusTripSummary[] {
  const climate = f.types.filter((t) => t === 'ac' || t === 'nonac');
  const berth = f.types.filter((t) => t === 'sleeper' || t === 'seater');
  return trips.filter(
    (t) =>
      (climate.length === 0 || climate.some((k) => matchesType(t, k))) &&
      (berth.length === 0 || berth.some((k) => matchesType(t, k))) &&
      inSlots(istHour(t.departure), f.departure) &&
      inSlots(istHour(t.arrival), f.arrival) &&
      (f.maxPrice === null || t.fromPrice <= f.maxPrice) &&
      (f.operators.length === 0 || f.operators.includes(t.operator.code)) &&
      f.amenities.every((a) => t.amenities.includes(a)) &&
      (!f.rating4 || t.operator.rating >= 4) &&
      (!f.tracking || t.liveTracking),
  );
}

export function sortBuses(trips: readonly BusTripSummary[], sort: BusSortId): BusTripSummary[] {
  const dep = (t: BusTripSummary) => Date.parse(t.departure);
  const by = (key: (t: BusTripSummary) => number) =>
    [...trips].sort((a, b) => key(a) - key(b) || dep(a) - dep(b));
  switch (sort) {
    case 'cheapest':
      return by((t) => t.fromPrice);
    case 'fastest':
      return by((t) => t.durationMin);
    case 'earliest':
      return by(dep);
    case 'latest':
      return by((t) => -dep(t));
    case 'rating':
      return by((t) => -t.operator.rating);
  }
}

export interface BusFacets {
  priceMin: number;
  priceMax: number;
  operators: { code: string; name: string; rating: number; count: number }[];
  types: BusTypeFilter[];
  amenities: BusAmenity[];
  tracking: boolean;
}

/** Filter options from the unfiltered results (only what can match something). */
export function busFacets(trips: readonly BusTripSummary[]): BusFacets {
  const operators = new Map<string, BusFacets['operators'][number]>();
  for (const t of trips) {
    const op = operators.get(t.operator.code) ?? {
      code: t.operator.code,
      name: t.operator.name,
      rating: t.operator.rating,
      count: 0,
    };
    op.count += 1;
    operators.set(op.code, op);
  }
  const prices = trips.map((t) => t.fromPrice);
  return {
    priceMin: prices.length ? Math.min(...prices) : 0,
    priceMax: prices.length ? Math.max(...prices) : 0,
    operators: [...operators.values()].sort((a, b) => a.name.localeCompare(b.name)),
    types: BUS_TYPES.map((t) => t.id).filter((k) => trips.some((t) => matchesType(t, k))),
    amenities: AMENITY_FILTERS.filter((a) => trips.some((t) => t.amenities.includes(a))),
    tracking: trips.some((t) => t.liveTracking),
  };
}

/** Labels for the active-filter chips, each with the filters minus that one. */
export function activeChips(f: BusFilters, operatorName: (code: string) => string) {
  const chips: { key: string; label: string; without: BusFilters }[] = [];
  for (const t of f.types)
    chips.push({
      key: `type-${t}`,
      label: BUS_TYPES.find((x) => x.id === t)?.label ?? t,
      without: { ...f, types: f.types.filter((x) => x !== t) },
    });
  for (const s of f.departure)
    chips.push({
      key: `dep-${s}`,
      label: `Departs ${TIME_SLOTS.find((x) => x.id === s)?.label ?? s}`,
      without: { ...f, departure: f.departure.filter((x) => x !== s) },
    });
  for (const s of f.arrival)
    chips.push({
      key: `arr-${s}`,
      label: `Arrives ${TIME_SLOTS.find((x) => x.id === s)?.label ?? s}`,
      without: { ...f, arrival: f.arrival.filter((x) => x !== s) },
    });
  if (f.maxPrice !== null)
    chips.push({
      key: 'price',
      label: `Up to ₹${Math.round(f.maxPrice / 100).toLocaleString('en-IN')}`,
      without: { ...f, maxPrice: null },
    });
  for (const o of f.operators)
    chips.push({
      key: `op-${o}`,
      label: operatorName(o),
      without: { ...f, operators: f.operators.filter((x) => x !== o) },
    });
  for (const a of f.amenities)
    chips.push({
      key: `amen-${a}`,
      label: BUS_AMENITY_LABELS[a],
      without: { ...f, amenities: f.amenities.filter((x) => x !== a) },
    });
  if (f.rating4)
    chips.push({ key: 'rating4', label: 'Rating 4+', without: { ...f, rating4: false } });
  if (f.tracking)
    chips.push({ key: 'tracking', label: 'Live tracking', without: { ...f, tracking: false } });
  return chips;
}
