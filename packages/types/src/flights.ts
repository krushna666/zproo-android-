import type { BusBookingInfo } from './buses';
import type { BookingStatus, CabinClass, PaymentStatus } from './enums';

export interface AirportInfo {
  code: string;
  city: string;
  name: string;
  country: string;
  /** IANA time zone; flight times are shown in the airport's local time. */
  timezone: string;
}

export interface AirlineInfo {
  code: string;
  name: string;
}

export interface FlightSegmentInfo {
  airline: AirlineInfo;
  flightNumber: string;
  from: AirportInfo;
  to: AirportInfo;
  /** ISO 8601 instant (UTC). */
  departureAt: string;
  arrivalAt: string;
  durationMinutes: number;
  aircraft: string;
}

export interface PaxFare {
  basePaise: number;
  taxesPaise: number;
  totalPaise: number;
}

export type PassengerType = 'ADULT' | 'CHILD' | 'INFANT';

export interface PaxCounts {
  adults: number;
  children: number;
  infants: number;
}

export interface FlightOffer {
  /** Opaque, provider-scoped; pass back to fetch or book the offer. */
  id: string;
  provider: string;
  airline: AirlineInfo;
  flightNumber: string;
  from: AirportInfo;
  to: AirportInfo;
  departureAt: string;
  arrivalAt: string;
  durationMinutes: number;
  stops: number;
  segments: FlightSegmentInfo[];
  layovers: { airport: AirportInfo; minutes: number }[];
  cabin: CabinClass;
  fareFamily: string;
  refundable: boolean;
  /** Airline cancellation charge per passenger, or null when non-refundable. */
  cancellationFeePaise: number | null;
  baggage: { cabinKg: number; checkInKg: number };
  seatsLeft: number;
  fares: Record<PassengerType, PaxFare>;
  /** Price for the passengers in the search. */
  totalPaise: number;
}

export interface FlightSearchLeg {
  from: string;
  to: string;
  date: string;
  offers: FlightOffer[];
}

export interface FlightSearchResult {
  legs: FlightSearchLeg[];
  passengers: { adults: number; children: number; infants: number };
  cabin: CabinClass;
  /** True when results come from the development provider, not real airline inventory. */
  demo: boolean;
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
  /** Age on the travel date, where the service asks for age (buses) */
  age: number | null;
  gender: 'MALE' | 'FEMALE' | 'OTHER';
  /** Seat assigned to this traveller (buses) */
  seatNumber: string | null;
}

export interface FlightBookingLeg {
  sequence: number;
  offer: FlightOffer;
  pnr: string | null;
  tickets: { passengerId: string; ticketNumber: string }[];
}

export interface BookingDetails {
  reference: string;
  serviceType: 'FLIGHT' | 'BUS';
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
