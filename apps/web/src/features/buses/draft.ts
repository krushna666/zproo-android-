import type { BusTravellerInput, TravelContact } from '@zproo/validation';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { releaseHold, safeSessionStorage } from '@/features/checkout/safeStorage';

export interface BusSelectedSeat {
  seatNo: string;
  /** Price shown when chosen (taxes included) */
  price: number;
  ladiesOnly: boolean;
}

/** What the seat page hands to checkout (and what deep login restores). */
export interface BusSelection {
  tripId: string;
  seats: BusSelectedSeat[];
  boardingPointId: string;
  droppingPointId: string;
  /** Total shown on the seat page; the API refuses the booking if it has moved. */
  expectedTotal: number;
  /** Where "Change seats" goes back to. */
  seatsUrl: string;
}

interface BusDraftState {
  selection: BusSelection | null;
  travellers: BusTravellerInput[] | null;
  contact: TravelContact | null;
  /** Renewed whenever the selection or travellers change, so edits aren't mistaken for retries. */
  idempotencyKey: string;
  /** Booking held for this draft (set after POST /buses/book). */
  reference: string | null;
  start: (selection: BusSelection) => void;
  setTravellers: (travellers: BusTravellerInput[], contact: TravelContact) => void;
  /** "Continue at ₹new": take the server's total and book again with a new key. */
  acceptPrice: (total: number) => void;
  setReference: (reference: string) => void;
  /** Forget the hold without releasing it (it was released elsewhere). */
  forgetReference: () => void;
  clear: () => void;
}

const newKey = () => crypto.randomUUID();

/**
 * The bus being booked, kept per browser tab in sessionStorage under `zproo:draft:bus` — it
 * survives the deep-login round trip and is cleared on logout. Holds no payment data.
 */
export const useBusDraft = create<BusDraftState>()(
  persist(
    (set) => ({
      selection: null,
      travellers: null,
      contact: null,
      idempotencyKey: newKey(),
      reference: null,
      start: (selection) =>
        set((s) => {
          releaseHold(s.reference);
          return {
            selection,
            // Keep travellers already typed for seats that are still chosen.
            travellers:
              s.travellers?.filter((t) => selection.seats.some((x) => x.seatNo === t.seatNo)) ??
              null,
            idempotencyKey: newKey(),
            reference: null,
          };
        }),
      setTravellers: (travellers, contact) =>
        set((s) => {
          releaseHold(s.reference);
          return { travellers, contact, idempotencyKey: newKey(), reference: null };
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
          reference: null,
          idempotencyKey: newKey(),
        }),
    }),
    {
      name: 'zproo:draft:bus',
      version: 2,
      storage: createJSONStorage(() => safeSessionStorage),
      // Drafts from the old contract (seat "number", passengers) are dropped, not migrated.
      migrate: () => ({ selection: null, travellers: null, contact: null, reference: null }),
      partialize: ({ selection, travellers, contact, idempotencyKey, reference }) => ({
        selection,
        travellers,
        contact,
        idempotencyKey,
        reference,
      }),
    },
  ),
);
