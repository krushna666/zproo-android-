import type { PaxCounts } from '@zproo/types';
import type { FlightTravellerInput, TravelContact } from '@zproo/validation';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { releaseHold, safeSessionStorage } from '@/features/checkout/safeStorage';

/** What the fare page hands to checkout (and what deep login restores). */
export interface FlightSelection {
  offerId: string;
  fareId: string;
  returnOfferId?: string | undefined;
  returnFareId?: string | undefined;
  pax: PaxCounts;
  /** Total shown on the fare page; the API refuses the booking if it has moved. */
  expectedTotal: number;
  /** Where "Change flight" goes back to */
  offerUrl: string;
}

export interface GstDetails {
  gstin: string;
  companyName: string;
}

interface FlightDraftState {
  selection: FlightSelection | null;
  travellers: FlightTravellerInput[] | null;
  contact: TravelContact | null;
  gstDetails: GstDetails | null;
  /** Renewed whenever the selection or travellers change, so edits aren't mistaken for retries. */
  idempotencyKey: string;
  /** Booking held for this draft (after POST /flights/book). */
  reference: string | null;
  start: (selection: FlightSelection) => void;
  /** Keeps what was typed (also before submitting), so a deep-login round trip restores it. */
  saveTravellers: (
    travellers: FlightTravellerInput[],
    contact: TravelContact,
    gst: GstDetails | null,
  ) => void;
  setTravellers: (
    travellers: FlightTravellerInput[],
    contact: TravelContact,
    gst: GstDetails | null,
  ) => void;
  acceptPrice: (total: number) => void;
  setReference: (reference: string) => void;
  forgetReference: () => void;
  clear: () => void;
}

const newKey = () => crypto.randomUUID();

/**
 * The flight being booked, per browser tab in sessionStorage under `zproo:draft:flight` (never
 * localStorage: it holds dates of birth). Cleared after booking and on logout.
 */
export const useFlightDraft = create<FlightDraftState>()(
  persist(
    (set) => ({
      selection: null,
      travellers: null,
      contact: null,
      gstDetails: null,
      idempotencyKey: newKey(),
      reference: null,
      start: (selection) =>
        set((s) => {
          releaseHold(s.reference);
          const samePax = JSON.stringify(s.selection?.pax) === JSON.stringify(selection.pax);
          return {
            selection,
            travellers: samePax ? s.travellers : null,
            idempotencyKey: newKey(),
            reference: null,
          };
        }),
      saveTravellers: (travellers, contact, gstDetails) => set({ travellers, contact, gstDetails }),
      setTravellers: (travellers, contact, gstDetails) =>
        set((s) => {
          releaseHold(s.reference);
          return { travellers, contact, gstDetails, idempotencyKey: newKey(), reference: null };
        }),
      acceptPrice: (total) =>
        set((s) => ({
          selection: s.selection && { ...s.selection, expectedTotal: total },
          idempotencyKey: newKey(),
        })),
      setReference: (reference) => set({ reference }),
      forgetReference: () => set({ reference: null, idempotencyKey: newKey() }),
      clear: () =>
        set({
          selection: null,
          travellers: null,
          gstDetails: null,
          reference: null,
          idempotencyKey: newKey(),
        }),
    }),
    {
      name: 'zproo:draft:flight',
      version: 2,
      storage: createJSONStorage(() => safeSessionStorage),
      // Drafts from the old contract (offerIds, passengers) are dropped, not migrated.
      migrate: () => ({
        selection: null,
        travellers: null,
        contact: null,
        gstDetails: null,
        reference: null,
      }),
      partialize: ({ selection, travellers, contact, gstDetails, idempotencyKey, reference }) => ({
        selection,
        travellers,
        contact,
        gstDetails,
        idempotencyKey,
        reference,
      }),
    },
  ),
);
