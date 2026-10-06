import { useQueries, useQuery } from '@tanstack/react-query';
import type {
  HotelBookResponse,
  HotelDetails,
  HotelRoomsResponse,
  HotelSearchResponse,
} from '@zproo/types';
import type { BookHotelInput } from '@zproo/validation';
import { apiGet, apiPost } from '@/services/http';

export const hotelKeys = {
  search: (query: string, page: number) => ['hotels', 'search', query, page] as const,
  details: (hotelId: string) => ['hotels', 'details', hotelId] as const,
  roomsOf: (hotelId: string) => ['hotels', 'rooms', hotelId] as const,
  rooms: (hotelId: string, stay: string) => ['hotels', 'rooms', hotelId, stay] as const,
};

/**
 * Pages 1…`pages` of a search (`query` is the search + filters as URL parameters, without the
 * page). Each page is its own cached query, so "Load more" fetches only the next one and a
 * shared link with `page=3` shows the same list.
 */
export function useHotelSearchPages(query: string | null, pages: number) {
  return useQueries({
    queries: Array.from({ length: query ? pages : 0 }, (_, i) => ({
      queryKey: hotelKeys.search(query ?? '', i + 1),
      queryFn: () =>
        apiGet<HotelSearchResponse>(
          `/hotels/search?${query ?? ''}${i > 0 ? `&page=${i + 1}` : ''}`,
        ),
      enabled: Boolean(query),
      staleTime: 60_000,
    })),
    combine: (results) => ({
      pages: results.map((r) => r.data).filter((d): d is HotelSearchResponse => Boolean(d)),
      first: results[0],
      isPending: results.some((r) => r.isPending),
      isFetching: results.some((r) => r.isFetching),
      error: results.find((r) => r.error)?.error ?? null,
      refetch: () => Promise.all(results.map((r) => r.refetch())),
    }),
  });
}

export function useHotelDetails(hotelId: string | undefined) {
  return useQuery({
    queryKey: hotelKeys.details(hotelId ?? ''),
    queryFn: () => apiGet<HotelDetails>(`/hotels/${encodeURIComponent(hotelId ?? '')}`),
    enabled: Boolean(hotelId),
    staleTime: 5 * 60_000,
  });
}

/** Live rooms and rates for a stay (never cached by the API; re-checked on every visit). */
export function useHotelRooms(
  hotelId: string | undefined,
  stay: { checkIn: string; checkOut: string; rooms: string } | null,
) {
  const key = stay ? `${stay.checkIn}:${stay.checkOut}:${stay.rooms}` : '';
  return useQuery({
    queryKey: hotelKeys.rooms(hotelId ?? '', key),
    queryFn: () =>
      apiGet<HotelRoomsResponse>(`/hotels/${encodeURIComponent(hotelId ?? '')}/rooms`, {
        params: stay ?? {},
      }),
    enabled: Boolean(hotelId && stay),
    staleTime: 0,
  });
}

export const hotelsApi = {
  book: (input: BookHotelInput, idempotencyKey: string) =>
    apiPost<HotelBookResponse>('/hotels/book', input, {
      headers: { 'Idempotency-Key': idempotencyKey },
    }),
};
