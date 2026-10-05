import type { PassengerInput } from '@zproo/validation';
import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import type { PaxCounts } from '@zproo/types';

export interface Itinerary {
  offerIds: string[];
  pax: PaxCounts;
  /** Total shown when the flights were chosen; the API refuses the booking if it has moved. */
  expectedTotalPaise: number;
  /** Where "change flight" goes back to. */
  searchUrl: string;
}

export interface Contact {
  email: string;
  phone: string;
}

interface FlightDraftState {
  itinerary: Itinerary | null;
  passengers: PassengerInput[] | null;
  contact: Contact | null;
  /**
   * Sent with the booking request so a retry can't hold seats twice. Renewed whenever the
   * itinerary or travellers change, so an edited booking isn't mistaken for a retry.
   */
  idempotencyKey: string;
  /** The booking created from this draft, once there is one. */
  reference: string | null;
  start: (itinerary: Itinerary) => void;
  setTravellers: (passengers: PassengerInput[], contact: Contact) => void;
  acceptPrice: (totalPaise: number) => void;
  setReference: (reference: string) => void;
  clear: () => void;
}

/** sessionStorage can throw (blocked storage); the draft then lasts until reload. */
const safeSessionStorage: StateStorage = {
  getItem: (name) => {
    try {
      return window.sessionStorage.getItem(name);
    } catch {
      return null;
    }
  },
  setItem: (name, value) => {
    try {
      window.sessionStorage.setItem(name, value);
    } catch {
      /* ignore */
    }
  },
  removeItem: (name) => {
    try {
      window.sessionStorage.removeItem(name);
    } catch {
      /* ignore */
    }
  },
};

const newKey = () => crypto.randomUUID();

/**
 * The flight being booked, kept per browser tab (sessionStorage) so a reload mid-checkout
 * doesn't lose it. Holds no payment data.
 */
export const useFlightDraft = create<FlightDraftState>()(
  persist(
    (set) => ({
      itinerary: null,
      passengers: null,
      contact: null,
      idempotencyKey: newKey(),
      reference: null,
      start: (itinerary) =>
        set((s) => ({
          itinerary,
          // Travellers carry over to a new flight choice when the passenger mix is the same.
          passengers:
            s.itinerary &&
            s.itinerary.pax.adults === itinerary.pax.adults &&
            s.itinerary.pax.children === itinerary.pax.children &&
            s.itinerary.pax.infants === itinerary.pax.infants
              ? s.passengers
              : null,
          idempotencyKey: newKey(),
          reference: null,
        })),
      setTravellers: (passengers, contact) =>
        set({ passengers, contact, idempotencyKey: newKey(), reference: null }),
      acceptPrice: (totalPaise) =>
        set((s) => ({
          itinerary: s.itinerary && { ...s.itinerary, expectedTotalPaise: totalPaise },
          idempotencyKey: newKey(),
        })),
      setReference: (reference) => set({ reference }),
      clear: () =>
        set({ itinerary: null, passengers: null, reference: null, idempotencyKey: newKey() }),
    }),
    {
      name: 'zproo-flight-draft',
      version: 1,
      storage: createJSONStorage(() => safeSessionStorage),
      partialize: ({ itinerary, passengers, contact, idempotencyKey, reference }) => ({
        itinerary,
        passengers,
        contact,
        idempotencyKey,
        reference,
      }),
    },
  ),
);
