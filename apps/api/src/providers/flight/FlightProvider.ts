import type {
  AirportSuggestion,
  CabinClass,
  FareFamily,
  FlightOfferDetails,
  FlightOfferSummary,
  PaxCounts,
} from '@zproo/types';
import type { Db } from '../../repositories/db';

export interface FlightSearchQuery {
  from: string;
  to: string;
  /** Local departure date at the origin, YYYY-MM-DD */
  date: string;
  cabin: CabinClass;
  pax: PaxCounts;
}

/** A priced, bookable offer + fare, re-checked live for booking. */
export interface FlightQuote {
  offer: FlightOfferSummary;
  fare: FareFamily;
  pax: PaxCounts;
  /** Seat holds are counted per itinerary */
  itineraryKey: string;
  from: string;
  to: string;
  date: string;
  departureAt: Date;
  arrivalAt: Date;
  international: boolean;
  /** The airline's own hold limit in minutes (the booking keeps the shorter of this and 15) */
  holdLimitMinutes: number;
}

export type FlightIssueResult =
  | {
      status: 'ISSUED';
      pnr: string;
      /** One per passenger, in the order given */
      ticketNumbers: string[];
    }
  | { status: 'PENDING' };

/**
 * A flight supplier (GDS, NDC or airline API). The booking engine depends only on this
 * interface; select the implementation with FLIGHT_PROVIDER.
 *
 * `hold`/`release`/`markPaid` take the booking's transaction so a provider that keeps inventory
 * locally (the mock) holds seats atomically with the booking; remote providers ignore it.
 */
export interface FlightProvider {
  readonly name: string;
  /** True for development inventory that must never be sold as real travel. */
  readonly isDemo: boolean;
  airports(query: string): Promise<AirportSuggestion[]>;
  search(query: FlightSearchQuery): Promise<FlightOfferSummary[]>;
  /**
   * Live price of an offer with its fare families. An expired offer is re-priced into a fresh
   * one when `reprice` is set; otherwise (or when it is gone) the result is null.
   */
  getOffer(offerId: string, options: { reprice: boolean }): Promise<FlightOfferDetails | null>;
  /**
   * Strict check for booking: null when the offer is expired or no longer sold;
   * 'BAD_FARE' when the fare does not belong to the offer.
   */
  quote(offerId: string, fareId: string): Promise<FlightQuote | 'BAD_FARE' | null>;
  /** Reserves seats; throws FareUnavailableError when there aren't enough. */
  hold(quote: FlightQuote, bookingId: string, expiresAt: Date, db: Db): Promise<void>;
  release(bookingId: string, db: Db): Promise<void>;
  /** The hold becomes a sale (no expiry). */
  markPaid(bookingId: string, db: Db): Promise<void>;
  /** Tickets a paid booking with the airline (idempotent per booking). */
  issue(input: {
    offerId: string;
    /** Marketing carrier of the offer */
    carrierCode: string;
    bookingRef: string;
    passengers: { firstName: string; lastName: string }[];
    /** 1 for the first try after payment, then one more per status poll */
    attempt: number;
    /** Test scenario recorded at booking (issue_pending / issue_failed) */
    scenario?: string | undefined;
  }): Promise<FlightIssueResult>;
  /** Cancels the ticket with the airline and frees the seats. */
  cancel(bookingId: string, db: Db): Promise<void>;
}
