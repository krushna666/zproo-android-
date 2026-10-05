/*
 * Bus API contract (Prompt 01). Amounts are integer paise; times are ISO 8601 with the +05:30
 * offset; dates are IST calendar dates (YYYY-MM-DD).
 */

export type BusLayout =
  | 'SEATER_2_2'
  | 'SEATER_2_1'
  | 'SLEEPER_2_1'
  | 'SEMI_SLEEPER_2_2'
  | 'SEATER_SLEEPER_COMBO';

export type BusAmenity =
  | 'wifi'
  | 'charging'
  | 'water'
  | 'blanket'
  | 'reading_light'
  | 'cctv'
  | 'tracking'
  | 'snacks';

export const BUS_AMENITY_LABELS: Record<BusAmenity, string> = {
  wifi: 'Wi-Fi',
  charging: 'Charging point',
  water: 'Water bottle',
  blanket: 'Blanket',
  reading_light: 'Reading light',
  cctv: 'CCTV',
  tracking: 'Live tracking',
  snacks: 'Snacks',
};

export type BusDeck = 'LOWER' | 'UPPER';

export interface BusCity {
  code: string;
  name: string;
  state: string;
  popular: boolean;
}

export interface BusOperatorInfo {
  code: string;
  name: string;
  rating: number;
  ratingCount: number;
  /** Operator helpline printed on tickets. */
  phone: string;
}

export interface BusTypeInfo {
  /** e.g. "A/C Sleeper (2+1)" */
  label: string;
  layout: BusLayout;
  ac: boolean;
  sleeper: boolean;
  seater: boolean;
}

export interface BusCancellationRule {
  /** Applies when cancelling at least this many hours before departure (0 = up to departure). */
  hoursBefore: number;
  /** Share of the fare refunded, in percent. */
  refundPercent: number;
}

/** A trip in search results. */
export interface BusTripSummary {
  tripId: string;
  serviceNumber: string;
  operator: BusOperatorInfo;
  busType: BusTypeInfo;
  from: { code: string; name: string };
  to: { code: string; name: string };
  /** Travel date (IST) of departure */
  date: string;
  departure: string;
  arrival: string;
  durationMin: number;
  /** Cheapest available seat, taxes included */
  fromPrice: number;
  seatsLeft: number;
  amenities: BusAmenity[];
  boardingCount: number;
  droppingCount: number;
  liveTracking: boolean;
  cancellable: boolean;
  /** Number of photos (fetch the trip for the URLs) */
  photos: number;
}

export interface BusSearchResponse {
  searchId: string;
  serverNow: string;
  from: string;
  to: string;
  date: string;
  trips: BusTripSummary[];
  filters: {
    operators: { name: string; count: number }[];
    priceMin: number;
    priceMax: number;
  };
  /** True when results come from the development provider, not real operator inventory. */
  demo: boolean;
}

/** Where a bus picks up or drops off, with the scheduled time there. */
export interface BusPoint {
  id: string;
  name: string;
  landmark: string;
  address: string;
  /** ISO 8601 with offset */
  time: string;
}

export interface BusPhoto {
  url: string;
  alt: string;
}

export interface BusRestStop {
  name: string;
  time: string;
  durationMin: number;
}

/** GET /buses/:tripId */
export interface BusTripDetails extends Omit<BusTripSummary, 'photos'> {
  photos: BusPhoto[];
  distanceKm: number;
  boardingPoints: BusPoint[];
  droppingPoints: BusPoint[];
  cancellationPolicy: BusCancellationRule[];
  restStops: BusRestStop[];
  policies: { luggage: string; pets: string; idProof: string };
  /** False when departure is less than 30 minutes away (sales closed). */
  bookable: boolean;
}

export type BusSeatStatus = 'AVAILABLE' | 'BOOKED' | 'HELD' | 'BLOCKED';
export type BusSeatType = 'SEATER' | 'SEMI_SLEEPER' | 'SLEEPER';

export interface BusSeat {
  /** Printed seat number, e.g. "L4", "U12" or "17" */
  seatNo: string;
  /** Grid position on the deck (0-based; an aisle is an empty column) */
  row: number;
  col: number;
  type: BusSeatType;
  /** Price of this seat, taxes included */
  price: number;
  status: BusSeatStatus;
  /** Reserved for women travellers */
  ladiesOnly: boolean;
  /** Already booked by a woman: the seat beside it is for women only */
  bookedByFemale: boolean;
  /** Grid cells covered (sleepers are 1 × 2) */
  width: number;
  height: number;
}

export interface BusDeckMap {
  deck: BusDeck;
  rows: number;
  cols: number;
  seats: BusSeat[];
}

/** GET /buses/:tripId/seats (never cached) */
export interface BusSeatMap {
  tripId: string;
  serverNow: string;
  layout: BusLayout;
  decks: BusDeckMap[];
  maxSelectable: number;
  bookable: boolean;
}

/** POST /buses/book response */
export interface BusBookResponse {
  bookingRef: string;
  status: 'HELD';
  holdExpiresAt: string;
  serverNow: string;
  priceBreakdown: import('./flights').PriceBreakdown;
}

/** The bus journey of a booking. */
export interface BusBookingInfo {
  trip: BusTripDetails;
  seats: string[];
  boardingPoint: BusPoint;
  droppingPoint: BusPoint;
  /** Operator ticket/PNR number, set on confirmation */
  pnr: string | null;
}
