import type { LeadGuestInput, TravelContact } from '@zproo/validation';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { releaseHold, safeSessionStorage } from '@/features/checkout/safeStorage';
import type { GstDetails } from '@/features/flights/draft';

/** A searched room and the rate chosen for it on the details page. */
export interface HotelRoomChoice {
  roomTypeId: string;
  rateId: string;
  roomName: string;
  adults: number;
  childAges: number[];
}

/** What the details page hands to checkout (and what deep login restores). */
export interface HotelSelection {
  hotelId: string;
  hotelName: string;
  checkIn: string;
  checkOut: string;
  rooms: HotelRoomChoice[];
  /** Total shown on the details page; the API refuses the booking if it has moved. */
  expectedTotal: number;
  /** Where "Change rooms" goes back to */
  detailsUrl: string;
}

interface HotelDraftState {
  selection: HotelSelection | null;
  guests: LeadGuestInput[] | null;
  contact: TravelContact | null;
  specialRequests: string;
  gstDetails: GstDetails | null;
  /** Renewed whenever the selection or guests change, so edits aren't mistaken for retries. */
  idempotencyKey: string;
  /** Booking held for this draft (after POST /hotels/book). */
  reference: string | null;
  start: (selection: HotelSelection) => void;
  /** Keeps what was typed (also before submitting), so a deep-login round trip restores it. */
  saveGuests: (
    guests: LeadGuestInput[],
    contact: TravelContact,
    specialRequests: string,
    gst: GstDetails | null,
  ) => void;
  setGuests: (
    guests: LeadGuestInput[],
    contact: TravelContact,
    specialRequests: string,
    gst: GstDetails | null,
  ) => void;
  acceptPrice: (total: number) => void;
  setReference: (reference: string) => void;
  forgetReference: () => void;
  clear: () => void;
}

const newKey = () => crypto.randomUUID();

/**
 * The stay being booked, per browser tab in sessionStorage under `zproo:draft:hotel`. Cleared
 * after booking and on logout.
 */
export const useHotelDraft = create<HotelDraftState>()(
  persist(
    (set) => ({
      selection: null,
      guests: null,
      contact: null,
      specialRequests: '',
      gstDetails: null,
      idempotencyKey: newKey(),
      reference: null,
      start: (selection) =>
        set((s) => {
          releaseHold(s.reference);
          const sameRooms = s.selection?.rooms.length === selection.rooms.length;
          return {
            selection,
            guests: sameRooms ? s.guests : null,
            idempotencyKey: newKey(),
            reference: null,
          };
        }),
      saveGuests: (guests, contact, specialRequests, gstDetails) =>
        set({ guests, contact, specialRequests, gstDetails }),
      setGuests: (guests, contact, specialRequests, gstDetails) =>
        set((s) => {
          releaseHold(s.reference);
          return {
            guests,
            contact,
            specialRequests,
            gstDetails,
            idempotencyKey: newKey(),
            reference: null,
          };
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
          guests: null,
          specialRequests: '',
          gstDetails: null,
          reference: null,
          idempotencyKey: newKey(),
        }),
    }),
    {
      name: 'zproo:draft:hotel',
      version: 1,
      storage: createJSONStorage(() => safeSessionStorage),
      partialize: ({
        selection,
        guests,
        contact,
        specialRequests,
        gstDetails,
        idempotencyKey,
        reference,
      }) => ({
        selection,
        guests,
        contact,
        specialRequests,
        gstDetails,
        idempotencyKey,
        reference,
      }),
    },
  ),
);
