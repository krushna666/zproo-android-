import type { FlightBookResponse, FlightOfferDetails, FlightSearchResponse } from '@zproo/types';
import type { BookFlightInput, FlightSearch } from '@zproo/validation';
import { useQuery } from '@tanstack/react-query';
import { apiGet, apiPost } from '@/services/http';

export const flightKeys = {
  search: (s: FlightSearch) =>
    [
      'flights',
      'search',
      s.from,
      s.to,
      s.date,
      s.returnDate ?? '',
      s.adults,
      s.children,
      s.infants,
      s.cabin,
    ] as const,
  offer: (id: string) => ['flights', 'offer', id] as const,
};

/** The search in the API's (and the results page's) URL format. */
export function searchParams(s: FlightSearch): Record<string, string> {
  return {
    from: s.from,
    to: s.to,
    date: s.date,
    ...(s.returnDate ? { returnDate: s.returnDate } : {}),
    adults: String(s.adults),
    children: String(s.children),
    infants: String(s.infants),
    cabin: s.cabin,
  };
}

/** Results are cached for a minute; filtering and sorting run on this cached list. */
export function useFlightSearch(search: FlightSearch | null) {
  return useQuery({
    queryKey: search ? flightKeys.search(search) : ['flights', 'search', null],
    queryFn: () =>
      apiGet<FlightSearchResponse>('/flights/search', {
        params: searchParams(search as FlightSearch),
      }),
    enabled: search !== null,
    staleTime: 60_000,
  });
}

/** Live price and fare families of an offer (the API never caches this). */
export function useFlightOffer(offerId: string | undefined) {
  return useQuery({
    queryKey: flightKeys.offer(offerId ?? ''),
    queryFn: () => apiGet<FlightOfferDetails>(`/flights/${encodeURIComponent(offerId ?? '')}`),
    enabled: Boolean(offerId),
    staleTime: 0,
  });
}

export const flightsApi = {
  /** Renews an expired offer at the current price (or FARE_UNAVAILABLE). */
  reprice: (offerId: string) =>
    apiGet<FlightOfferDetails>(`/flights/${encodeURIComponent(offerId)}`, {
      params: { reprice: '1' },
    }),
  book: (input: BookFlightInput, idempotencyKey: string) =>
    apiPost<FlightBookResponse>('/flights/book', input, {
      headers: { 'Idempotency-Key': idempotencyKey },
    }),
};
