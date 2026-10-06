import type { ImageId } from '@/config/images';

/**
 * Home page merchandising. Fares are indicative "starting from" prices shown as such on the
 * page; from Phase 4 these rows come from live supplier data instead of this file.
 * Amounts are in paise.
 */

export const FLIGHT_DEALS = [
  {
    from: 'PNQ',
    to: 'DEL',
    fromCity: 'Pune',
    toCity: 'New Delhi',
    farePaise: 485000,
    duration: '2h 20m',
  },
  {
    from: 'BOM',
    to: 'GOI',
    fromCity: 'Mumbai',
    toCity: 'Goa',
    farePaise: 289900,
    duration: '1h 15m',
  },
  {
    from: 'BLR',
    to: 'DEL',
    fromCity: 'Bengaluru',
    toCity: 'New Delhi',
    farePaise: 549900,
    duration: '2h 50m',
  },
  {
    from: 'DEL',
    to: 'SXR',
    fromCity: 'New Delhi',
    toCity: 'Srinagar',
    farePaise: 399900,
    duration: '1h 30m',
  },
  {
    from: 'HYD',
    to: 'COK',
    fromCity: 'Hyderabad',
    toCity: 'Kochi',
    farePaise: 369900,
    duration: '1h 40m',
  },
  {
    from: 'BOM',
    to: 'DXB',
    fromCity: 'Mumbai',
    toCity: 'Dubai',
    farePaise: 1149900,
    duration: '3h 10m',
  },
] as const;

/** Popular bus routes (3-letter city codes) with indicative lowest seat fares. */
export const BUS_ROUTES = [
  { from: 'PNQ', to: 'BOM', label: 'Pune → Mumbai', farePaise: 59900, duration: '3h 30m' },
  { from: 'BOM', to: 'GOI', label: 'Mumbai → Goa', farePaise: 119900, duration: '12h' },
  { from: 'PNQ', to: 'GOI', label: 'Pune → Goa', farePaise: 109900, duration: '10h' },
  { from: 'PNQ', to: 'ISK', label: 'Pune → Nashik', farePaise: 64900, duration: '5h' },
  { from: 'BOM', to: 'KLH', label: 'Mumbai → Kolhapur', farePaise: 84900, duration: '8h' },
  { from: 'PNQ', to: 'NAG', label: 'Pune → Nagpur', farePaise: 149900, duration: '14h 30m' },
  {
    from: 'BOM',
    to: 'IXU',
    label: 'Mumbai → Chhatrapati Sambhajinagar',
    farePaise: 84900,
    duration: '7h 30m',
  },
  { from: 'PNQ', to: 'BLR', label: 'Pune → Bengaluru', farePaise: 179900, duration: '16h' },
] as const;

export const TRAIN_ROUTES = [
  { from: 'PUNE', to: 'NDLS', label: 'Pune → New Delhi', classes: ['1A', '2A', '3A', 'SL'] },
  { from: 'CSMT', to: 'MAO', label: 'Mumbai → Madgaon (Goa)', classes: ['2A', '3A', 'SL', 'CC'] },
  { from: 'NDLS', to: 'JP', label: 'New Delhi → Jaipur', classes: ['CC', 'EC', '3A'] },
  { from: 'SBC', to: 'MAS', label: 'Bengaluru → Chennai', classes: ['CC', 'EC', '2S'] },
] as const;

export const HOTEL_DESTINATIONS: readonly {
  city: string;
  /** City code (destination `city_<code>`) */
  code: string;
  image: ImageId;
  fromPaise: number;
  tagline: string;
}[] = [
  {
    city: 'Goa',
    code: 'GOI',
    image: 'hotels/goa',
    fromPaise: 179900,
    tagline: 'Beach resorts & villas',
  },
  {
    city: 'Mumbai',
    code: 'BOM',
    image: 'hotels/mumbai',
    fromPaise: 179900,
    tagline: 'Sea-facing city hotels',
  },
  {
    city: 'Jaipur',
    code: 'JAI',
    image: 'destinations/rajasthan',
    fromPaise: 159900,
    tagline: 'Heritage havelis & palaces',
  },
  {
    city: 'New Delhi',
    code: 'DEL',
    image: 'destinations/delhi',
    fromPaise: 149900,
    tagline: 'Business & boutique stays',
  },
  {
    city: 'Bengaluru',
    code: 'BLR',
    image: 'destinations/bangalore',
    fromPaise: 149900,
    tagline: 'Tech-park & garden hotels',
  },
  {
    city: 'Pune',
    code: 'PNQ',
    image: 'destinations/pune',
    fromPaise: 119900,
    tagline: 'Weekend & business stays',
  },
];

export const DESTINATIONS: readonly { name: string; image: ImageId; tagline: string }[] = [
  { name: 'Goa', image: 'destinations/goa', tagline: 'Beaches & nightlife' },
  { name: 'Kashmir', image: 'destinations/kashmir', tagline: 'Paradise on earth' },
  { name: 'Kerala', image: 'destinations/kerala', tagline: 'Backwaters & hills' },
  { name: 'Manali', image: 'destinations/manali', tagline: 'Snow & adventure' },
  { name: 'Rajasthan', image: 'destinations/rajasthan', tagline: 'Forts & deserts' },
  { name: 'Dubai', image: 'destinations/dubai', tagline: 'City of superlatives' },
  { name: 'Mumbai', image: 'destinations/mumbai', tagline: 'The city of dreams' },
  { name: 'Delhi', image: 'destinations/delhi', tagline: 'History meets hustle' },
  { name: 'Pune', image: 'destinations/pune', tagline: 'Culture & weekend treks' },
  { name: 'Bangalore', image: 'destinations/bangalore', tagline: 'Garden city' },
  { name: 'Hyderabad', image: 'destinations/hyderabad', tagline: 'Biryani & heritage' },
];

/** Codes from the live coupon list (DEMO_COUPONS); a test keeps them in step. */
export const OFFERS = [
  {
    code: 'ZPROOFIRST',
    title: '₹150 off your first booking',
    detail: 'Any service, minimum booking ₹500. Once per customer.',
    service: 'All services',
  },
  {
    code: 'FLY500',
    title: '₹500 off flights',
    detail: 'Fares above ₹4,000, up to three times.',
    service: 'Flights',
  },
  {
    code: 'BUS10',
    title: '10% off bus tickets',
    detail: 'Up to ₹200 off, minimum booking ₹400.',
    service: 'Buses',
  },
  {
    code: 'STAY15',
    title: '15% off hotel stays',
    detail: 'Up to ₹1,500 off, minimum booking ₹2,000.',
    service: 'Hotels',
  },
] as const;
