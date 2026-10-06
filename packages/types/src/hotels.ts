/*
 * Hotel API contract (Prompt 03). Amounts are integer paise; check-in and check-out are IST
 * calendar dates (YYYY-MM-DD); instants are ISO 8601 with the +05:30 offset.
 */

import type { PriceBreakdown } from './flights';

export type HotelDestinationType = 'CITY' | 'AREA' | 'HOTEL';

/** GET /hotels/destinations?q= */
export interface HotelDestination {
  /** `city_GOI`, `area_GOI_calangute` or a hotel id (`htl_…`) */
  id: string;
  type: HotelDestinationType;
  name: string;
  city: string;
  state: string;
}

export type HotelAmenity =
  | 'pool'
  | 'wifi'
  | 'parking'
  | 'gym'
  | 'spa'
  | 'restaurant'
  | 'ac'
  | 'pet_friendly'
  | 'breakfast'
  | 'bar'
  | 'room_service'
  | 'airport_shuttle';

export const HOTEL_AMENITY_LABELS: Record<HotelAmenity, string> = {
  pool: 'Pool',
  wifi: 'Wi-Fi',
  parking: 'Parking',
  gym: 'Gym',
  spa: 'Spa',
  restaurant: 'Restaurant',
  ac: 'Air conditioning',
  pet_friendly: 'Pet friendly',
  breakfast: 'Breakfast',
  bar: 'Bar',
  room_service: '24-hour room service',
  airport_shuttle: 'Airport shuttle',
};

export type PropertyType = 'HOTEL' | 'RESORT' | 'VILLA' | 'HOMESTAY' | 'APARTMENT';

export const PROPERTY_TYPE_LABELS: Record<PropertyType, string> = {
  HOTEL: 'Hotel',
  RESORT: 'Resort',
  VILLA: 'Villa',
  HOMESTAY: 'Homestay',
  APARTMENT: 'Apartment',
};

export type BoardBasis = 'ROOM_ONLY' | 'BREAKFAST' | 'HALF_BOARD' | 'FULL_BOARD';

export const BOARD_BASIS_LABELS: Record<BoardBasis, string> = {
  ROOM_ONLY: 'Room only',
  BREAKFAST: 'Breakfast included',
  HALF_BOARD: 'Breakfast and dinner',
  FULL_BOARD: 'All meals',
};

export interface HotelImage {
  url: string;
  alt: string;
}

/** One searched room: adults and the age of each child. */
export interface RoomOccupancy {
  adults: number;
  childAges: number[];
}

/** A hotel in search results. */
export interface HotelSummary {
  hotelId: string;
  name: string;
  stars: number;
  propertyType: PropertyType;
  area: string;
  city: string;
  rating: number;
  ratingCount: number;
  ratingLabel: string;
  thumbnail: HotelImage;
  amenities: HotelAmenity[];
  /** Cheapest available rate for the searched rooms, per night (all rooms, before taxes) */
  pricePerNight: number;
  /** That rate for the whole stay (all rooms, before taxes) */
  totalPrice: number;
  /** Taxes on `totalPrice` */
  taxes: number;
  taxesIncluded: false;
  freeCancellation: boolean;
  breakfastIncluded: boolean;
  roomsLeft: number;
  popularity: number;
  geo: { lat: number; lng: number };
}

export type HotelSort = 'popularity' | 'price_asc' | 'price_desc' | 'rating' | 'stars';

export interface HotelSearchResponse {
  searchId: string;
  serverNow: string;
  destination: HotelDestination;
  checkIn: string;
  checkOut: string;
  nights: number;
  rooms: RoomOccupancy[];
  /** Hotels matching the filters (all pages) */
  total: number;
  page: number;
  pageSize: number;
  hotels: HotelSummary[];
  /** Facets over every hotel for the stay (before filters) */
  filters: {
    priceMin: number;
    priceMax: number;
    areas: { name: string; count: number }[];
    propertyTypes: { type: PropertyType; count: number }[];
  };
  demo: boolean;
}

export type HotelAmenityGroup = 'General' | 'Room' | 'Food' | 'Wellness' | 'Accessibility';

/** GET /hotels/:hotelId */
export interface HotelDetails {
  hotelId: string;
  name: string;
  stars: number;
  propertyType: PropertyType;
  description: string;
  address: string;
  area: string;
  city: string;
  state: string;
  phone: string;
  geo: { lat: number; lng: number };
  rating: number;
  ratingCount: number;
  ratingLabel: string;
  ratingBreakdown: { label: string; score: number }[];
  images: HotelImage[];
  amenities: HotelAmenity[];
  amenityGroups: { group: HotelAmenityGroup; items: string[] }[];
  checkInTime: string;
  checkOutTime: string;
  houseRules: string[];
  cancellationSummary: string;
  demo: boolean;
}

export interface HotelRate {
  rateId: string;
  boardBasis: BoardBasis;
  refundable: boolean;
  /** Full refund until this instant (refundable rates); null for non-refundable rates */
  freeCancellationUntil: string | null;
  /** Average per night for one room, before taxes */
  pricePerNight: number;
  /** Whole stay for one room, before taxes */
  totalPrice: number;
  /** Taxes on `totalPrice` (one room) */
  taxes: number;
  nightlyBreakdown: { date: string; price: number }[];
  roomsLeft: number;
}

export interface HotelRoomType {
  roomTypeId: string;
  name: string;
  sizeSqft: number;
  bed: string;
  maxAdults: number;
  maxChildren: number;
  images: HotelImage[];
  amenities: string[];
  rates: HotelRate[];
}

/** GET /hotels/:hotelId/rooms (live, never cached) */
export interface HotelRoomsResponse {
  hotelId: string;
  serverNow: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  roomTypes: HotelRoomType[];
  demo: boolean;
}

/** POST /hotels/book response */
export interface HotelBookResponse {
  bookingRef: string;
  status: 'HELD';
  holdExpiresAt: string;
  serverNow: string;
  priceBreakdown: PriceBreakdown;
}

export interface HotelLeadGuest {
  title: string;
  firstName: string;
  lastName: string;
}

/** A booked room. */
export interface HotelBookedRoom {
  roomTypeId: string;
  roomName: string;
  rateId: string;
  boardBasis: BoardBasis;
  refundable: boolean;
  freeCancellationUntil: string | null;
  adults: number;
  childAges: number[];
  leadGuest: HotelLeadGuest;
  /** Whole stay for this room, before taxes */
  price: number;
  nightlyBreakdown: { date: string; price: number }[];
}

/** The hotel stay of a booking. */
export interface HotelBookingInfo {
  hotel: Pick<
    HotelDetails,
    | 'hotelId'
    | 'name'
    | 'stars'
    | 'address'
    | 'city'
    | 'phone'
    | 'checkInTime'
    | 'checkOutTime'
    | 'images'
    | 'houseRules'
  >;
  checkIn: string;
  checkOut: string;
  nights: number;
  rooms: HotelBookedRoom[];
  specialRequests: string | null;
  /** Hotel confirmation number, set when the hotel confirms */
  confirmationNo: string | null;
  supplierRef: string | null;
}
