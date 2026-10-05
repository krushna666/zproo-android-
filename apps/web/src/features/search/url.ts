import type {
  BikeSearch,
  BusSearch,
  CabSearch,
  FlightSearch,
  HolidaySearch,
  HotelSearch,
  ParcelQuote,
  TrainSearch,
} from '@zproo/validation';

/**
 * Search forms navigate to result pages with the search encoded in the URL, so results are
 * shareable and survive reloads. Each `…Url` has a matching `parse…` used by the result page;
 * parsed values are raw (strings) and must still go through the shared schema.
 */

const qs = (params: Record<string, string | number | undefined>) => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value));
  }
  return search.toString();
};

// ───────── Flights ─────────
// /flights/search?from=PNQ&to=DEL&date=…[&returnDate=…]&adults=1&children=0&infants=0&cabin=ECONOMY

export function flightsUrl(s: FlightSearch, extra = ''): string {
  return `/flights/search?${qs({
    from: s.from,
    to: s.to,
    date: s.date,
    returnDate: s.returnDate,
    adults: s.adults,
    children: s.children,
    infants: s.infants,
    cabin: s.cabin,
  })}${extra ? `&${extra}` : ''}`;
}

/** Parsing lives in @zproo/validation so the API reads search URLs exactly like the web app. */
export {
  DEFAULT_LEAD_DAYS,
  flightSearchInputFromParams as parseFlightSearch,
} from '@zproo/validation';

// ───────── Other services ─────────

export const busesUrl = (s: Pick<BusSearch, 'from' | 'to' | 'date'>, extra = '') =>
  `/buses/search?${qs({ from: s.from, to: s.to, date: s.date })}${extra ? `&${extra}` : ''}`;

export const trainsUrl = (s: TrainSearch) =>
  `/trains/results?${qs({ from: s.from, to: s.to, date: s.date, class: s.travelClass === 'ALL' ? undefined : s.travelClass })}`;

export const hotelsUrl = (s: HotelSearch) =>
  `/hotels/results?${qs({
    city: s.city,
    checkIn: s.checkIn,
    checkOut: s.checkOut,
    rooms: s.rooms,
    adults: s.adults,
    children: s.children || undefined,
  })}`;

export const cabsUrl = (s: CabSearch) =>
  `/cabs?${qs({ pickup: s.pickup, drop: s.drop, when: s.when, date: s.when === 'LATER' ? s.date : undefined, time: s.when === 'LATER' ? s.time : undefined })}`;

export const bikesUrl = (s: BikeSearch) => `/bikes?${qs({ pickup: s.pickup, drop: s.drop })}`;

export const holidaysUrl = (s: HolidaySearch) =>
  `/holidays?${qs({ destination: s.destination, month: s.month, travellers: s.travellers, category: s.category })}`;

export const parcelUrl = (s: ParcelQuote) =>
  `/parcel?${qs({ from: s.fromPincode, to: s.toPincode, weight: s.weightKg })}`;

// ───────── Date-free links for prerendered merchandising ─────────

export const flightDealUrl = (from: string, to: string) =>
  `/flights/search?${qs({ from, to, adults: 1, cabin: 'ECONOMY' })}`;
export const busRouteUrl = (from: string, to: string) => `/buses/search?${qs({ from, to })}`;
export const trainRouteUrl = (from: string, to: string) => `/trains/results?${qs({ from, to })}`;
export const hotelCityUrl = (city: string) =>
  `/hotels/results?${qs({ city, rooms: 1, adults: 2 })}`;
