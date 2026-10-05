import type { BusCity, BusSeatMap, BusTripDetails, BusTripSummary } from '@zproo/types';
import type { Db } from '../../repositories/db';

export interface BusSearchQuery {
  /** City codes, e.g. PNQ */
  from: string;
  to: string;
  /** Travel date (IST), YYYY-MM-DD */
  date: string;
}

export interface SeatQuote {
  seatNo: string;
  /** Current price, taxes included (paise) */
  price: number;
}

export interface SeatHoldRequest {
  seatNo: string;
  /** The traveller is a woman (affects the ladies-only rule for the seat beside it). */
  female: boolean;
}

/**
 * A bus inventory supplier (aggregator or operator API). The booking engine depends only on this
 * interface; select the implementation with BUS_PROVIDER. Switching suppliers changes no screen.
 *
 * `hold`/`release`/`cancel` take the booking's database transaction so a supplier that keeps
 * inventory locally (the mock) can hold seats atomically with the booking; remote ones ignore it.
 */
export interface BusProvider {
  readonly name: string;
  /** True for development inventory that must never be sold as real travel. */
  readonly isDemo: boolean;
  cities(query: string): Promise<BusCity[]>;
  search(query: BusSearchQuery): Promise<BusTripSummary[]>;
  /** Current details of a trip, or null if it is not sold. */
  getTrip(tripId: string): Promise<BusTripDetails | null>;
  /** Live seat map with availability and prices (never cached). */
  getSeatMap(tripId: string): Promise<BusSeatMap | null>;
  /** Live prices of the chosen seats, plus whether GST applies (A/C). */
  reprice(tripId: string, seats: string[]): Promise<{ seats: SeatQuote[]; ac: boolean } | null>;
  /** Holds the seats for a booking; throws SeatUnavailableError naming any seat already taken. */
  hold(
    tripId: string,
    seats: SeatHoldRequest[],
    bookingId: string,
    expiresAt: Date,
    db: Db,
  ): Promise<void>;
  release(bookingId: string, db: Db): Promise<void>;
  /** Confirms a paid booking with the operator. Idempotent per booking. */
  issue(tripId: string, seats: string[], bookingRef: string): Promise<{ pnr: string }>;
  /** Cancels a confirmed booking with the operator and frees its seats. */
  cancel(bookingId: string, pnr: string | null, db: Db): Promise<void>;
}
