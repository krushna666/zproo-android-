import type { BookingDetails, FlightOffer, FlightSearchResult, PaxCounts } from '@zproo/types';
import type { BookFlightInput, FlightSearch } from '@zproo/validation';
import { useQueries, useQuery } from '@tanstack/react-query';
import { apiGet, apiPost } from '@/services/http';

export const flightKeys = {
  search: (s: FlightSearch) => ['flights', 'search', s] as const,
  offer: (id: string, pax: PaxCounts) => ['flights', 'offer', id, pax] as const,
};

/** Search query parameters in the API's URL format (the same one the results page uses). */
function searchParams(s: FlightSearch): Record<string, string> {
  const params: Record<string, string> = {
    trip: s.tripType,
    adults: String(s.adults),
    children: String(s.children),
    infants: String(s.infants),
    cabin: s.cabin,
  };
  if (s.tripType === 'MULTI_CITY') {
    params.legs = s.legs.map((l) => `${l.from}.${l.to}.${l.date}`).join(',');
  } else {
    const [leg] = s.legs;
    if (leg) Object.assign(params, { from: leg.from, to: leg.to, date: leg.date });
    if (s.tripType === 'ROUND_TRIP' && s.returnDate) params.return = s.returnDate;
  }
  return params;
}

export function useFlightSearch(search: FlightSearch | null) {
  return useQuery({
    queryKey: search ? flightKeys.search(search) : ['flights', 'search', null],
    queryFn: () =>
      apiGet<FlightSearchResult>('/flights/search', {
        params: searchParams(search as FlightSearch),
      }),
    enabled: search !== null,
    staleTime: 60_000,
  });
}

export function useFlightOffer(offerId: string | undefined, pax: PaxCounts) {
  return useQuery({
    queryKey: flightKeys.offer(offerId ?? '', pax),
    queryFn: () =>
      apiGet<FlightOffer>(`/flights/${encodeURIComponent(offerId ?? '')}`, { params: pax }),
    enabled: Boolean(offerId),
    staleTime: 30_000,
  });
}

export const flightsApi = {
  book: (input: BookFlightInput, idempotencyKey: string) =>
    apiPost<BookingDetails>('/flights/book', input, {
      headers: { 'Idempotency-Key': idempotencyKey },
    }),
};

/** Current price and availability of every flight in the itinerary. */
export function useItineraryOffers(offerIds: string[], pax: PaxCounts) {
  return useQueries({
    queries: offerIds.map((id) => ({
      queryKey: flightKeys.offer(id, pax),
      queryFn: () => apiGet<FlightOffer>(`/flights/${encodeURIComponent(id)}`, { params: pax }),
      enabled: true,
      staleTime: 30_000,
    })),
    combine: (results) => ({
      offers: results.every((r) => r.data) ? results.map((r) => r.data as FlightOffer) : null,
      isPending: results.some((r) => r.isPending),
      error: results.find((r) => r.error)?.error ?? null,
      refetch: () => Promise.all(results.map((r) => r.refetch())),
    }),
  });
}
