import { useBusDraft } from '@/features/buses/draft';
import { useFlightDraft } from '@/features/flights/draft';

/**
 * Booking drafts (`zproo:draft:<module>` in sessionStorage) survive sign-in, so a customer comes
 * back to the same step with the same selection. They are cleared on sign-out (and after booking)
 * so the next person on a shared device never sees them.
 */
export function clearAllDrafts(): void {
  useBusDraft.getState().clear();
  useFlightDraft.getState().clear();
  for (const store of [useBusDraft, useFlightDraft]) {
    try {
      store.persist.clearStorage();
    } catch {
      /* storage unavailable */
    }
  }
}
