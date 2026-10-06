import { useBusDraft } from '@/features/buses/draft';
import { useFlightDraft } from '@/features/flights/draft';
import { useHotelDraft } from '@/features/hotels/draft';
import type { CheckoutService } from './steps';

const STORES = { flight: useFlightDraft, bus: useBusDraft, hotel: useHotelDraft } as const;

/** The booking held for a service's draft in this tab (payment pages fall back to it). */
export function useDraftReference(service: CheckoutService): string | null {
  const flight = useFlightDraft((s) => s.reference);
  const bus = useBusDraft((s) => s.reference);
  const hotel = useHotelDraft((s) => s.reference);
  return { flight, bus, hotel }[service];
}

/** Forgets a service's draft once its booking is paid. */
export function clearDraft(service: CheckoutService): void {
  STORES[service].getState().clear();
}

/**
 * Booking drafts (`zproo:draft:<module>` in sessionStorage) survive sign-in, so a customer comes
 * back to the same step with the same selection. They are cleared on sign-out (and after booking)
 * so the next person on a shared device never sees them.
 */
export function clearAllDrafts(): void {
  for (const store of Object.values(STORES)) {
    store.getState().clear();
    try {
      store.persist.clearStorage();
    } catch {
      /* storage unavailable */
    }
  }
}
