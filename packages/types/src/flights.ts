import type { BusBookingInfo } from './buses';
import type { HotelBookingInfo } from './hotels';
import type { BookingStatus, CabinClass, PaymentStatus } from './enums';

/*
 * Flight API contract (Prompt 02). Amounts are integer paise; times are ISO 8601 with the local
 * airport's offset (e.g. +05:30); dates are local calendar dates (YYYY-MM-DD).
 */

export type PassengerType = 'ADULT' | 'CHILD' | 'INFANT';

export interface PaxCounts {
  adults: number;
  children: number;
  infants: number;
}

/** GET /flights/airports */
export interface AirportSuggestion {
  iata: string;
  city: string;
  name: string;
  country: string;
}

export interface FlightCarrier {
  code: string;
  name: string;
}

export interface FlightSegment {
  carrier: FlightCarrier;
  /** e.g. "SF 5123" */
  flightNo: string;
  /** IATA codes */
  from: string;
  to: string;
  /** ISO 8601 with the airport's local offset */
  departure: string;
  arrival: string;
  durationMin: number;
  aircraft: string;
  terminalFrom: string;
  terminalTo: string;
}

export interface FlightLayover {
  airport: string;
  durationMin: number;
  /** Arrive and depart from different terminals */
  changeOfTerminal: boolean;
  /** Separate tickets: collect bags and check in again */
  selfTransfer: boolean;
  /** The connection runs past midnight */
  overnight: boolean;
}

/** One direction of travel (an origin-to-destination journey with its connections). */
export interface FlightSlice {
  segments: FlightSegment[];
  stops: number;
  layovers: FlightLayover[];
  durationMin: number;
}

/** A search result: one itinerary for one direction (round trips combine two). */
export interface FlightOfferSummary {
  offerId: string;
  /** Offer validity (20 minutes from search); details re-price it, booking refuses it after. */
  expiresAt: string;
  /** The marketing carrier of the first segment */
  carrier: FlightCarrier;
  slices: FlightSlice[];
  cabin: CabinClass;
  /** Cheapest fare per adult, taxes and fees included */
  fromPrice: number;
  currency: 'INR';
  /** Whether the cheapest fare is refundable */
  refundable: boolean;
  /** Whether the cheapest fare includes a meal */
  mealIncluded: boolean;
  seatsLeft: number;
}

export interface FlightSearchResponse {
  searchId: string;
  serverNow: string;
  from: string;
  to: string;
  date: string;
  returnDate: string | null;
  pax: PaxCounts;
  cabin: CabinClass;
  offers: FlightOfferSummary[];
  /** Round trips: the return-direction offers (booked together with an outbound offer) */
  returnOffers: FlightOfferSummary[];
  filters: {
    airlines: { code: string; name: string; count: number; minPrice: number }[];
    priceMin: number;
    priceMax: number;
  };
  /** True when results come from the development provider, not real airline inventory. */
  demo: boolean;
}

/** One passenger type's fare: base, taxes (GST) and fees (airport charges). */
export interface PaxFare {
  base: number;
  taxes: number;
  fees: number;
  total: number;
}

export type FareFamilyName = 'Saver' | 'Flexi' | 'Super Flexi';

export interface FareFamily {
  /** Scoped to its offer: a fareId from another offer is refused. */
  fareId: string;
  name: FareFamilyName;
  /** Per adult, all-inclusive */
  price: number;
  /** For all the travellers in the search */
  total: number;
  perPax: Record<PassengerType, PaxFare>;
  cabinBaggageKg: number;
  checkinBaggageKg: number;
  /** Per traveller; 0 = free changes */
  changeFee: number;
  /** Per traveller; null = non-refundable */
  cancellationFee: number | null;
  refundable: boolean;
  meal: 'PAID' | 'INCLUDED';
  seatSelection: 'PAID' | 'FREE';
  priority: boolean;
  mostPopular: boolean;
}

/** GET /flights/:offerId — live, never cached. */
export interface FlightOfferDetails extends FlightOfferSummary {
  pax: PaxCounts;
  fareFamilies: FareFamily[];
  fareRules: string[];
  serverNow: string;
  /** Set when an expired offer was re-priced into this fresh one */
  replacesOfferId: string | null;
}

/** POST /flights/book response */
export interface FlightBookResponse {
  bookingRef: string;
  status: 'HELD';
  holdExpiresAt: string;
  serverNow: string;
  priceBreakdown: PriceBreakdown;
}

export interface PriceLine {
  label: string;
  amountPaise: number;
}

export interface PriceBreakdown {
  lines: PriceLine[];
  basePaise: number;
  taxesPaise: number;
  feesPaise: number;
  discountPaise: number;
  totalPaise: number;
  currency: 'INR';
}

export interface BookingPassengerInfo {
  id: string;
  type: PassengerType;
  title: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string | null;
  /** Infants: the index (in `passengers`) of the adult they travel with */
  travellingWith: number | null;
  /** Age on the travel date, where the service asks for age (buses) */
  age: number | null;
  gender: 'MALE' | 'FEMALE' | 'OTHER';
  /** Seat assigned to this traveller (buses) */
  seatNumber: string | null;
}

export interface FlightBookingLeg {
  sequence: number;
  /** The offer as sold (outbound = 1, return = 2) */
  offer: FlightOfferSummary;
  fare: FareFamily;
  pnr: string | null;
  tickets: { passengerId: string; ticketNumber: string; segmentKey: string }[];
}

export interface BookingDetails {
  reference: string;
  serviceType: 'FLIGHT' | 'BUS' | 'HOTEL';
  status: BookingStatus;
  paymentStatus: PaymentStatus;
  createdAt: string;
  holdExpiresAt: string | null;
  /** Server clock when this was sent; hold countdowns use it to avoid client clock skew. */
  serverNow: string;
  confirmedAt: string | null;
  cancelledAt: string | null;
  travelDate: string;
  price: PriceBreakdown;
  contact: { email: string; phone: string };
  /** Applied coupon; its discount is already in `price`. */
  coupon: { code: string; discountPaise: number } | null;
  passengers: BookingPassengerInfo[];
  /** Flight legs (flight bookings; empty otherwise) */
  flights: FlightBookingLeg[];
  /** Bus journey (bus bookings; null otherwise) */
  bus: BusBookingInfo | null;
  /** Hotel stay (hotel bookings; null otherwise) */
  hotel: HotelBookingInfo | null;
  /** Booked against a development provider: simulated inventory and payment. */
  demo: boolean;
}

export interface BookingListItem {
  reference: string;
  serviceType: string;
  status: BookingStatus;
  paymentStatus: PaymentStatus;
  title: string;
  subtitle: string;
  travelDate: string;
  totalPaise: number;
  createdAt: string;
}

/** A gateway order for a booking (POST /payments/create). Amount is the stored booking total. */
export interface PaymentOrder {
  orderId: string;
  /** Paise */
  amount: number;
  currency: 'INR';
  /** Public checkout key (Razorpay key_id). Never a secret. */
  keyId: string | null;
  provider: string;
  bookingRef: string;
  holdExpiresAt: string | null;
  /** Server clock when this was sent; countdowns use it to avoid client clock skew. */
  serverNow: string;
}

/** GET /bookings/:ref/cancellation — what cancelling now would refund. */
export interface CancellationQuote {
  bookingRef: string;
  cancellable: boolean;
  /** Why not, when `cancellable` is false */
  reason?: string;
  /** Paise */
  refundAmount: number;
  refundPercent: number;
}
