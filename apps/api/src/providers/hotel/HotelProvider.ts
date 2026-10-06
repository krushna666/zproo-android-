import type { HotelQuoteResult, HotelRoomRequest } from '@zproo/catalog';
import type {
  HotelDestination,
  HotelDetails,
  HotelRoomType,
  HotelSummary,
  RoomOccupancy,
} from '@zproo/types';
import type { Db } from '../../repositories/db';

export interface HotelSearchQuery {
  destinationId: string;
  /** IST calendar dates */
  checkIn: string;
  checkOut: string;
  rooms: RoomOccupancy[];
}

export interface HotelStay {
  hotelId: string;
  checkIn: string;
  checkOut: string;
}

/**
 * A hotel inventory supplier (aggregator or bed bank). The booking engine depends only on this
 * interface; select the implementation with HOTEL_PROVIDER. Switching suppliers changes no screen.
 *
 * `hold`/`release`/`markPaid`/`cancel` take the booking's database transaction so a supplier that
 * keeps inventory locally (the mock) can hold rooms atomically with the booking.
 */
export interface HotelProvider {
  readonly name: string;
  /** True for development inventory that must never be sold as real stays. */
  readonly isDemo: boolean;
  destinations(query: string): Promise<HotelDestination[]>;
  /** Every property at the destination with a room for each searched room (unfiltered). */
  search(query: HotelSearchQuery): Promise<HotelSummary[]>;
  details(hotelId: string): Promise<HotelDetails | null>;
  /** Live room types and rates for a stay (never cached); null for an unknown hotel. */
  rooms(stay: HotelStay): Promise<HotelRoomType[] | null>;
  /** Live price and availability of the requested rooms; null for an unknown hotel. */
  quote(stay: HotelStay, rooms: HotelRoomRequest[]): Promise<HotelQuoteResult | null>;
  /** Holds rooms for a booking; throws RoomUnavailableError when a type has sold out. */
  hold(
    stay: HotelStay,
    rooms: { roomTypeId: string; count: number }[],
    bookingId: string,
    expiresAt: Date,
    db: Db,
  ): Promise<void>;
  release(bookingId: string, db: Db): Promise<void>;
  /** Paid: the hold no longer lapses. */
  markPaid(bookingId: string, db: Db): Promise<void>;
  /** Confirms a paid booking with the hotel. Idempotent per booking. */
  issue(
    hotelId: string,
    bookingRef: string,
  ): Promise<{ confirmationNo: string; supplierRef: string }>;
  /** Cancels a confirmed stay with the hotel and frees its rooms. */
  cancel(bookingId: string, confirmationNo: string | null, db: Db): Promise<void>;
}
