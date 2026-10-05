import type {
  BusBookResponse,
  BusSearchResponse,
  BusSeatMap,
  BusTripDetails,
  CancellationQuote,
} from '@zproo/types';
import type { BookBusInput, BusSearch } from '@zproo/validation';
import { useQuery } from '@tanstack/react-query';
import { apiGet, apiPost } from '@/services/http';

export const busKeys = {
  search: (s: BusSearch) => ['buses', 'search', s.from, s.to, s.date] as const,
  trip: (id: string) => ['buses', 'trip', id] as const,
  seats: (id: string) => ['buses', 'seats', id] as const,
  quote: (ref: string) => ['bookings', ref, 'cancellation'] as const,
};

/** Search results are cached for a minute; filtering and sorting happen on this cached list. */
export function useBusSearch(search: BusSearch | null) {
  return useQuery({
    queryKey: search ? busKeys.search(search) : ['buses', 'search', null],
    queryFn: () => apiGet<BusSearchResponse>('/buses/search', { params: search }),
    enabled: search !== null,
    staleTime: 60_000,
  });
}

export function useBusTrip(tripId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: busKeys.trip(tripId ?? ''),
    queryFn: () => apiGet<BusTripDetails>(`/buses/${encodeURIComponent(tripId ?? '')}`),
    enabled: Boolean(tripId) && enabled,
    staleTime: 30_000,
  });
}

/**
 * Live seat availability, refreshed every 20 seconds while the page is visible (TanStack Query
 * pauses interval refetches while the tab is hidden, via the Page Visibility API).
 */
export function useSeatMap(tripId: string | undefined) {
  return useQuery({
    queryKey: busKeys.seats(tripId ?? ''),
    queryFn: () => apiGet<BusSeatMap>(`/buses/${encodeURIComponent(tripId ?? '')}/seats`),
    enabled: Boolean(tripId),
    refetchInterval: 20_000,
    refetchIntervalInBackground: false,
    staleTime: 0,
  });
}

/** What cancelling now would refund (from the server's policy). */
export function useCancellationQuote(reference: string, enabled: boolean) {
  return useQuery({
    queryKey: busKeys.quote(reference),
    queryFn: () => apiGet<CancellationQuote>(`/bookings/${reference}/cancellation`),
    enabled,
    staleTime: 0,
  });
}

export const busesApi = {
  book: (input: BookBusInput, idempotencyKey: string) =>
    apiPost<BusBookResponse>('/buses/book', input, {
      headers: { 'Idempotency-Key': idempotencyKey },
    }),
  cancel: (reference: string) =>
    apiPost<{ bookingRef: string; status: string; refundAmount: number }>(
      `/buses/${reference}/cancel`,
    ),
};
