import type { HotelSort } from '@zproo/types';
import { hotelFiltersSchema, type HotelFilters } from '@zproo/validation';

/*
 * Results filters, sort and page, kept in the URL (?stars=4,5&amenities=pool&sort=price_asc&page=2)
 * and applied by the server, which pages the filtered list.
 */

export const HOTEL_SORT_OPTIONS: readonly { id: HotelSort; label: string }[] = [
  { id: 'popularity', label: 'Popularity' },
  { id: 'price_asc', label: 'Price: low to high' },
  { id: 'price_desc', label: 'Price: high to low' },
  { id: 'rating', label: 'Guest rating' },
  { id: 'stars', label: 'Star rating' },
];

export const FILTER_KEYS = [
  'sort',
  'priceMin',
  'priceMax',
  'stars',
  'rating',
  'freeCancellation',
  'breakfast',
  'amenities',
  'areas',
  'types',
  'page',
  'pageSize',
] as const;

export type ResultFilters = Omit<HotelFilters, 'page' | 'pageSize'>;

export const EMPTY_HOTEL_FILTERS: ResultFilters = {
  stars: [],
  freeCancellation: false,
  breakfast: false,
  amenities: [],
  areas: [],
  types: [],
};

export function readHotelFilters(params: URLSearchParams): {
  filters: ResultFilters;
  page: number;
} {
  const raw: Record<string, string> = {};
  for (const key of FILTER_KEYS) {
    const value = params.get(key);
    if (value !== null) raw[key] = value;
  }
  const { page, pageSize: _size, ...filters } = hotelFiltersSchema.parse(raw);
  return { filters, page };
}

/** Filter parameters only (no search, no page), in a stable order. */
export function filterParams(f: ResultFilters): URLSearchParams {
  const out = new URLSearchParams();
  if (f.sort && f.sort !== 'popularity') out.set('sort', f.sort);
  if (f.priceMin !== undefined) out.set('priceMin', String(f.priceMin));
  if (f.priceMax !== undefined) out.set('priceMax', String(f.priceMax));
  if (f.stars.length > 0) out.set('stars', [...f.stars].sort().join(','));
  if (f.rating !== undefined) out.set('rating', String(f.rating));
  if (f.freeCancellation) out.set('freeCancellation', '1');
  if (f.breakfast) out.set('breakfast', '1');
  if (f.amenities.length > 0) out.set('amenities', [...f.amenities].sort().join(','));
  if (f.areas.length > 0) out.set('areas', [...f.areas].sort().join(','));
  if (f.types.length > 0) out.set('types', [...f.types].sort().join(','));
  return out;
}

/** The URL with new filters (back to page 1); the search parameters are kept. */
export function writeHotelFilters(params: URLSearchParams, f: ResultFilters): URLSearchParams {
  const next = new URLSearchParams(params);
  for (const key of FILTER_KEYS) next.delete(key);
  for (const [key, value] of filterParams(f)) next.set(key, value);
  return next;
}

export function activeHotelFilterCount(f: ResultFilters): number {
  return (
    (f.priceMin !== undefined || f.priceMax !== undefined ? 1 : 0) +
    f.stars.length +
    (f.rating !== undefined ? 1 : 0) +
    (f.freeCancellation ? 1 : 0) +
    (f.breakfast ? 1 : 0) +
    f.amenities.length +
    f.areas.length +
    f.types.length
  );
}
