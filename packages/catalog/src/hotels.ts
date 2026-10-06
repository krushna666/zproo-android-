/**
 * Development (mock) hotel inventory, shared by the API's MockHotelProvider and the static website
 * so both data modes show the same hotels, rooms and prices.
 *
 * Six cities (Goa, Mumbai, Delhi, Bengaluru, Jaipur, Pune) with 40–150 invented properties each,
 * 2–5 stars, 2–5 room types with 1–3 rates (room only or breakfast; refundable or not). Nightly
 * prices follow the date (Friday and Saturday nights cost more; Goa's peak season more again);
 * availability is per room type and night. A few properties have a single room of each type, so
 * "Only 1 room left" and last-room races are easy to reproduce. Images are local placeholders
 * under /assets/hotels/.
 */
import { findCity } from '@zproo/config';
import type {
  BoardBasis,
  HotelAmenity,
  HotelAmenityGroup,
  HotelDestination,
  HotelDetails,
  HotelImage,
  HotelRate,
  HotelRoomType,
  HotelSearchResponse,
  HotelSort,
  HotelSummary,
  PriceBreakdown,
  PropertyType,
  RoomOccupancy,
} from '@zproo/types';
import { unitHash } from './hash';
import { addDaysIso, daysBetweenIso, isoWeekday, toLocalIso, zonedTimeToUtc } from './time';

const IST = 'Asia/Kolkata';

// ───────────────────────────── Cities and areas ─────────────────────────────

interface HotelCity {
  code: string;
  /** Localities: [name, lat, lng] */
  areas: [string, number, number][];
  /** Price level against the national average */
  priceIndex: number;
  /** STD code for phone numbers */
  std: string;
  pin: string;
  /** Mostly leisure (resorts, villas) rather than business hotels */
  leisure: boolean;
}

const HOTEL_CITIES: readonly HotelCity[] = [
  {
    code: 'GOI',
    areas: [
      ['Calangute', 15.5439, 73.7553],
      ['Baga', 15.5553, 73.7517],
      ['Candolim', 15.5182, 73.7623],
      ['Anjuna', 15.5736, 73.7407],
      ['Panaji', 15.4909, 73.8278],
      ['Colva', 15.2798, 73.9116],
      ['Palolem', 15.01, 74.0232],
    ],
    priceIndex: 1.1,
    std: '832',
    pin: '403516',
    leisure: true,
  },
  {
    code: 'BOM',
    areas: [
      ['Andheri East', 19.1136, 72.8697],
      ['Bandra West', 19.0596, 72.8295],
      ['Colaba', 18.9067, 72.8147],
      ['Juhu', 19.1075, 72.8263],
      ['Powai', 19.1176, 72.906],
      ['Lower Parel', 18.9953, 72.8302],
    ],
    priceIndex: 1.3,
    std: '22',
    pin: '400050',
    leisure: false,
  },
  {
    code: 'DEL',
    areas: [
      ['Connaught Place', 28.6315, 77.2167],
      ['Aerocity', 28.5562, 77.1199],
      ['Karol Bagh', 28.6519, 77.1909],
      ['Paharganj', 28.6448, 77.2167],
      ['Saket', 28.5245, 77.2066],
      ['Chanakyapuri', 28.5975, 77.1878],
    ],
    priceIndex: 1.15,
    std: '11',
    pin: '110001',
    leisure: false,
  },
  {
    code: 'BLR',
    areas: [
      ['MG Road', 12.9756, 77.6066],
      ['Indiranagar', 12.9784, 77.6408],
      ['Koramangala', 12.9352, 77.6245],
      ['Whitefield', 12.9698, 77.75],
      ['Electronic City', 12.8452, 77.6602],
      ['Hebbal', 13.0358, 77.597],
    ],
    priceIndex: 1.1,
    std: '80',
    pin: '560001',
    leisure: false,
  },
  {
    code: 'JAI',
    areas: [
      ['MI Road', 26.9157, 75.8015],
      ['Bani Park', 26.9312, 75.7915],
      ['Civil Lines', 26.9056, 75.7836],
      ['Amer Road', 26.9535, 75.8478],
      ['Malviya Nagar', 26.8549, 75.8243],
      ['C Scheme', 26.9056, 75.8046],
    ],
    priceIndex: 1.0,
    std: '141',
    pin: '302001',
    leisure: true,
  },
  {
    code: 'PNQ',
    areas: [
      ['Koregaon Park', 18.5362, 73.8939],
      ['Hinjewadi', 18.5912, 73.7389],
      ['Shivajinagar', 18.5308, 73.8475],
      ['Viman Nagar', 18.5679, 73.9143],
      ['Baner', 18.559, 73.7868],
      ['Kharadi', 18.5515, 73.9348],
    ],
    priceIndex: 0.95,
    std: '20',
    pin: '411001',
    leisure: false,
  },
];

const CITY_BY_CODE = new Map(HOTEL_CITIES.map((c) => [c.code, c]));

/** City codes with hotels. */
export const HOTEL_CITY_CODES: ReadonlySet<string> = new Set(HOTEL_CITIES.map((c) => c.code));

const slugify = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/** Number of properties in a city (40–150, fixed per city). */
export function hotelCount(cityCode: string): number {
  return 40 + Math.floor(unitHash(`hotels:${cityCode}`) * 111);
}

// ───────────────────────────── Properties ─────────────────────────────

const NAME_FIRST = [
  'Saffron',
  'Coral',
  'Monsoon',
  'Teakwood',
  'Lotus',
  'Peacock',
  'Sandalwood',
  'Marigold',
  'Jasmine',
  'Amberwood',
  'Kesar',
  'Neem',
  'Tamarind',
  'Mango Grove',
  'Cardamom',
  'Palmyra',
  'Seashell',
  'Rosewood',
  'Banyan Court',
  'Moonstone',
  'Silver Oak',
  'Vetiver',
  'Kingfisher Bay',
  'Hornbill',
] as const;

const NAME_LAST: Record<PropertyType, readonly string[]> = {
  HOTEL: ['Residency', 'Grand', 'Suites', 'Inn', 'Plaza', 'Regency', 'Heritage'],
  RESORT: ['Resort', 'Beach Resort', 'Retreat', 'Resort & Spa'],
  VILLA: ['Villas', 'Pool Villas'],
  HOMESTAY: ['Homestay', 'House'],
  APARTMENT: ['Serviced Apartments', 'Stays'],
};

export interface HotelPlan {
  hotelId: string;
  cityCode: string;
  index: number;
  name: string;
  stars: number;
  propertyType: PropertyType;
  area: string;
  geo: { lat: number; lng: number };
  rating: number;
  ratingCount: number;
  popularity: number;
  amenities: HotelAmenity[];
  /** Every room type has a single room (last-room demos) */
  scarce: boolean;
  /** Nightly price of the cheapest room type, before demand (paise) */
  basePaise: number;
  roomTypes: RoomTypePlan[];
  checkInTime: string;
  checkOutTime: string;
  petsAllowed: boolean;
  localIdsAccepted: boolean;
}

export interface RoomTypePlan {
  roomTypeId: string;
  index: number;
  name: string;
  sizeSqft: number;
  bed: string;
  maxAdults: number;
  maxChildren: number;
  /** Rooms of this type in the property */
  inventory: number;
  /** Price multiplier on the property's base price */
  priceFactor: number;
  rates: RatePlan[];
  images: HotelImage[];
  amenities: string[];
}

export interface RatePlan {
  rateId: string;
  code: string;
  boardBasis: BoardBasis;
  refundable: boolean;
  priceFactor: number;
}

const RATE_OPTIONS: readonly Omit<RatePlan, 'rateId'>[] = [
  { code: 'ronr', boardBasis: 'ROOM_ONLY', refundable: false, priceFactor: 0.9 },
  { code: 'ro', boardBasis: 'ROOM_ONLY', refundable: true, priceFactor: 1 },
  { code: 'bf', boardBasis: 'BREAKFAST', refundable: true, priceFactor: 1.12 },
  { code: 'bfnr', boardBasis: 'BREAKFAST', refundable: false, priceFactor: 1.02 },
  { code: 'hb', boardBasis: 'HALF_BOARD', refundable: true, priceFactor: 1.3 },
];

/** Room types by grade: [name, size sq ft, bed, max adults, max children, price factor]. */
const ROOM_GRADES: readonly [string, number, string, number, number, number][] = [
  ['Standard Room', 180, '1 Queen', 2, 1, 1],
  ['Superior Twin Room', 220, '2 Twin', 2, 1, 1.15],
  ['Deluxe Room', 260, '1 King', 3, 2, 1.3],
  ['Premium Room', 300, '1 King', 3, 2, 1.5],
  ['Family Room', 380, '1 King + 2 Single', 4, 2, 1.75],
  ['Executive Suite', 520, '1 King + Sofa bed', 3, 2, 2.3],
];

const ASSET = '/assets/hotels';
const img = (file: string, alt: string): HotelImage => ({ url: `${ASSET}/${file}`, alt });

const PROPERTY_WEIGHTS: Record<'leisure' | 'business', [PropertyType, number][]> = {
  leisure: [
    ['HOTEL', 0.4],
    ['RESORT', 0.3],
    ['VILLA', 0.12],
    ['HOMESTAY', 0.12],
    ['APARTMENT', 0.06],
  ],
  business: [
    ['HOTEL', 0.7],
    ['RESORT', 0.05],
    ['VILLA', 0.03],
    ['HOMESTAY', 0.07],
    ['APARTMENT', 0.15],
  ],
};

function pick<T>(items: readonly [T, number][], u: number): T {
  let acc = 0;
  for (const [item, weight] of items) {
    acc += weight;
    if (u < acc) return item;
  }
  return (items.at(-1) as [T, number])[0];
}

const hotelIdFor = (cityCode: string, index: number) =>
  `htl_${cityCode}${String(index).padStart(3, '0')}`;

function parseHotelId(hotelId: string): { cityCode: string; index: number } | null {
  const m = /^htl_([A-Z]{3})(\d{3})$/.exec(hotelId);
  if (!m) return null;
  const cityCode = m[1] ?? '';
  const index = Number(m[2]);
  if (!CITY_BY_CODE.has(cityCode) || index < 1 || index > hotelCount(cityCode)) return null;
  return { cityCode, index };
}

function planHotel(cityCode: string, index: number): HotelPlan {
  const city = CITY_BY_CODE.get(cityCode) as HotelCity;
  const hotelId = hotelIdFor(cityCode, index);
  const u = (salt: string) => unitHash(`${hotelId}:${salt}`);

  const propertyType = pick(PROPERTY_WEIGHTS[city.leisure ? 'leisure' : 'business'], u('type'));
  const starWeights: [number, number][] =
    propertyType === 'HOMESTAY'
      ? [
          [2, 0.5],
          [3, 0.5],
        ]
      : propertyType === 'RESORT' || propertyType === 'VILLA'
        ? [
            [3, 0.2],
            [4, 0.45],
            [5, 0.35],
          ]
        : [
            [2, 0.15],
            [3, 0.4],
            [4, 0.3],
            [5, 0.15],
          ];
  const stars = pick(starWeights, u('stars'));
  const [areaName, lat, lng] = city.areas[Math.floor(u('area') * city.areas.length)] ??
    city.areas[0] ?? ['Centre', 0, 0];
  const first = NAME_FIRST[Math.floor(u('n1') * NAME_FIRST.length)] ?? 'Saffron';
  const lasts = NAME_LAST[propertyType];
  const last = lasts[Math.floor(u('n2') * lasts.length)] ?? 'Residency';
  // Names repeat across a big city; the locality keeps each one distinct.
  const name = `${first} ${last} ${areaName}`;

  const rating = Math.round((3.2 + u('rating') * 1.4 + (stars - 3) * 0.15) * 10) / 10;
  const amenities: HotelAmenity[] = ['wifi'];
  if (propertyType !== 'HOMESTAY' || u('ac') < 0.7) amenities.push('ac');
  if (stars >= 4 || propertyType === 'RESORT' || propertyType === 'VILLA' || u('pool') < 0.15)
    amenities.push('pool');
  if (u('parking') < 0.75) amenities.push('parking');
  if (stars >= 4 || u('gym') < 0.2) amenities.push('gym');
  if (stars === 5 || (stars === 4 && u('spa') < 0.5)) amenities.push('spa');
  if (stars >= 3) amenities.push('restaurant');
  if (u('pets') < 0.15) amenities.push('pet_friendly');
  if (stars >= 3 || u('bfast') < 0.5) amenities.push('breakfast');
  if (stars >= 4) amenities.push('bar', 'room_service');
  if (stars >= 4 && u('shuttle') < 0.4) amenities.push('airport_shuttle');

  const scarce = u('scarce') < 0.06;
  const starBase: Record<number, [number, number]> = {
    2: [1_400, 2_500],
    3: [2_500, 4_500],
    4: [4_500, 8_000],
    5: [8_000, 16_000],
  };
  const [lo, hi] = starBase[stars] ?? [2_500, 4_500];
  const basePaise = Math.round((lo + (hi - lo) * u('price')) * city.priceIndex) * 100;

  const typeCount = 2 + Math.floor(u('types') * 4); // 2–5
  const firstGrade = stars >= 4 ? 2 : 0;
  const grades = ROOM_GRADES.slice(firstGrade, firstGrade + typeCount);
  if (grades.length < typeCount) grades.unshift(...ROOM_GRADES.slice(0, typeCount - grades.length));
  const roomTypes = grades.map(([gradeName, size, bed, maxAdults, maxChildren, factor], i) => {
    const rtIndex = i + 1;
    const roomTypeId = `rt_${cityCode}${String(index).padStart(3, '0')}_${rtIndex}`;
    const ru = (salt: string) => unitHash(`${roomTypeId}:${salt}`);
    const seaView = cityCode === 'GOI' && gradeName === 'Deluxe Room';
    const rateCount = 1 + Math.floor(ru('rates') * 3); // 1–3
    const start = Math.floor(ru('rate0') * RATE_OPTIONS.length);
    const options = Array.from(
      { length: rateCount },
      (_, k) => RATE_OPTIONS[(start + k * 2) % RATE_OPTIONS.length] as Omit<RatePlan, 'rateId'>,
    );
    const roomNo = (rtIndex % 4) + 1;
    return {
      roomTypeId,
      index: rtIndex,
      name: seaView ? 'Deluxe Sea View' : gradeName,
      sizeSqft: size + Math.round(ru('size') * 40),
      bed,
      maxAdults,
      maxChildren,
      inventory: scarce ? 1 : 2 + Math.floor(ru('inv') * 8),
      priceFactor: factor * (seaView ? 1.15 : 1),
      rates: options.map((o) => ({ ...o, rateId: `rate_${roomTypeId.slice(3)}_${o.code}` })),
      images: [
        img(`room-${roomNo}.svg`, `${gradeName} with ${bed.toLowerCase()} bed`),
        img('bathroom.svg', `${gradeName} bathroom`),
        ...(seaView ? [img('view-sea.svg', 'Sea view from the balcony')] : []),
      ],
      amenities: [
        'Air conditioning',
        'Free Wi-Fi',
        'Television',
        ...(stars >= 3 ? ['Tea and coffee maker', 'Minibar'] : ['Kettle']),
        ...(size >= 300 ? ['Work desk', 'Seating area'] : []),
        ...(seaView ? ['Balcony'] : []),
      ],
    } satisfies RoomTypePlan;
  });

  return {
    hotelId,
    cityCode,
    index,
    name,
    stars,
    propertyType,
    area: areaName,
    geo: {
      lat: Math.round((lat + (u('lat') - 0.5) * 0.02) * 10_000) / 10_000,
      lng: Math.round((lng + (u('lng') - 0.5) * 0.02) * 10_000) / 10_000,
    },
    rating: Math.min(4.9, rating),
    ratingCount: 80 + Math.floor(u('reviews') * 3_900),
    popularity: Math.round((rating * 20 + u('pop') * 40 + stars * 5) * 10) / 10,
    amenities,
    scarce,
    basePaise,
    roomTypes,
    checkInTime: '14:00',
    checkOutTime: u('checkout') < 0.5 ? '11:00' : '12:00',
    petsAllowed: amenities.includes('pet_friendly'),
    localIdsAccepted: u('localid') < 0.6,
  };
}

const planCache = new Map<string, HotelPlan>();

/** A property by id, or null if it doesn't exist. */
export function hotelPlan(hotelId: string): HotelPlan | null {
  const cached = planCache.get(hotelId);
  if (cached) return cached;
  const parsed = parseHotelId(hotelId);
  if (!parsed) return null;
  const plan = planHotel(parsed.cityCode, parsed.index);
  planCache.set(hotelId, plan);
  return plan;
}

export function hotelPlansInCity(cityCode: string): HotelPlan[] {
  if (!CITY_BY_CODE.has(cityCode)) return [];
  return Array.from(
    { length: hotelCount(cityCode) },
    (_, i) => hotelPlan(hotelIdFor(cityCode, i + 1)) as HotelPlan,
  );
}

export const ratingLabel = (rating: number) =>
  rating >= 4.5 ? 'Exceptional' : rating >= 4 ? 'Excellent' : rating >= 3.5 ? 'Very good' : 'Good';

// ───────────────────────────── Destinations ─────────────────────────────

function cityDestination(code: string): HotelDestination | null {
  const city = findCity(code);
  if (!city || !HOTEL_CITY_CODES.has(code)) return null;
  return { id: `city_${code}`, type: 'CITY', name: city.name, city: city.name, state: city.state };
}

/** A destination by id (city, area or hotel), or null. */
export function hotelDestination(id: string): HotelDestination | null {
  if (id.startsWith('city_')) return cityDestination(id.slice(5));
  if (id.startsWith('area_')) {
    const [, code = '', slug = ''] = /^area_([A-Z]{3})_(.+)$/.exec(id) ?? [];
    const city = cityDestination(code);
    const area = CITY_BY_CODE.get(code)?.areas.find(([name]) => slugify(name) === slug);
    return city && area ? { ...city, id, type: 'AREA', name: area[0] } : null;
  }
  const plan = hotelPlan(id);
  const city = plan && cityDestination(plan.cityCode);
  return plan && city ? { ...city, id, type: 'HOTEL', name: plan.name } : null;
}

/** Every destination, city by city: the city, its areas, then its properties. */
export function allHotelDestinations(): HotelDestination[] {
  return HOTEL_CITIES.flatMap((c) => {
    const city = cityDestination(c.code);
    if (!city) return [];
    return [
      city,
      ...c.areas.map(([area]) => ({
        ...city,
        id: `area_${c.code}_${slugify(area)}`,
        type: 'AREA' as const,
        name: area,
      })),
      ...hotelPlansInCity(c.code).map((p) => ({
        ...city,
        id: p.hotelId,
        type: 'HOTEL' as const,
        name: p.name,
      })),
    ];
  });
}

/** Suggestions for the destination picker: cities, then areas, then properties. */
export function searchHotelDestinations(query: string, limit = 10): HotelDestination[] {
  const q = query.trim().toLowerCase();
  if (!q) {
    return HOTEL_CITIES.map((c) => cityDestination(c.code)).filter(
      (d): d is HotelDestination => d !== null,
    );
  }
  const matches = (text: string) =>
    text
      .toLowerCase()
      .split(/[\s-]+/)
      .some((word) => word.startsWith(q)) || text.toLowerCase().startsWith(q);
  const cities: HotelDestination[] = [];
  const areas: HotelDestination[] = [];
  const hotels: HotelDestination[] = [];
  for (const c of HOTEL_CITIES) {
    const city = cityDestination(c.code);
    if (!city) continue;
    const cityHit =
      matches(city.name) || (findCity(c.code)?.aliases ?? '').toLowerCase().includes(q);
    if (cityHit) cities.push(city);
    for (const [area] of c.areas)
      if (matches(area) || cityHit)
        areas.push({ ...city, id: `area_${c.code}_${slugify(area)}`, type: 'AREA', name: area });
    if (q.length >= 3)
      for (const plan of hotelPlansInCity(c.code))
        if (plan.name.toLowerCase().includes(q))
          hotels.push({ ...city, id: plan.hotelId, type: 'HOTEL', name: plan.name });
  }
  return [...cities, ...areas, ...hotels].slice(0, limit);
}

// ───────────────────────────── Prices and availability ─────────────────────────────

/** GST on hotel rooms: 5% up to ₹7,500 a night, 18% above (per room, per night). */
export const HOTEL_GST_LOW_PERCENT = 5;
export const HOTEL_GST_HIGH_PERCENT = 18;
export const HOTEL_GST_THRESHOLD_PAISE = 750_000;
/** ZPROO GO convenience fee per hotel booking (none today; shown when non-zero). */
export const HOTEL_CONVENIENCE_FEE_PAISE = 0;
/** Unpaid hotel holds last 15 minutes. */
export const HOTEL_HOLD_MINUTES = 15;
/** Refundable rates: free cancellation until noon, two days before check-in. */
export const HOTEL_FREE_CANCEL_DAYS = 2;

/** GST on one room-night, rounded to whole rupees (as hotels invoice it). */
export const hotelNightTax = (pricePaise: number) =>
  Math.round(
    (pricePaise *
      (pricePaise <= HOTEL_GST_THRESHOLD_PAISE ? HOTEL_GST_LOW_PERCENT : HOTEL_GST_HIGH_PERCENT)) /
      10_000,
  ) * 100;

/** Prices end in 9 rupees (₹4,899). */
const roundPrice = (paise: number) => Math.max(49_900, Math.round(paise / 10_000) * 10_000 - 100);

/** One room of `rate` on `night` (before taxes). Friday/Saturday nights and Goa's peak cost more. */
export function hotelNightPrice(
  plan: HotelPlan,
  roomType: RoomTypePlan,
  rate: RatePlan,
  night: string,
): number {
  let demand = 1;
  const weekday = isoWeekday(night);
  if (weekday === 5 || weekday === 6) demand += 0.18;
  const md = night.slice(5);
  if (plan.cityCode === 'GOI' && (md >= '12-20' || md <= '01-05')) demand += 0.35;
  demand += (unitHash(`${roomType.roomTypeId}:${night}`) - 0.5) * 0.08;
  return roundPrice(plan.basePaise * roomType.priceFactor * rate.priceFactor * demand);
}

/** A hold or sale of rooms of one type for a stay (from ZPROO GO bookings). */
export interface LiveHotelHold {
  roomTypeId: string;
  checkIn: string;
  checkOut: string;
  rooms: number;
}

const nightsOf = (checkIn: string, checkOut: string) =>
  Array.from({ length: Math.max(0, daysBetweenIso(checkIn, checkOut)) }, (_, i) =>
    addDaysIso(checkIn, i),
  );

/** Rooms of a type sold elsewhere on a night (up to half the inventory; none in scarce hotels). */
function soldElsewhere(plan: HotelPlan, roomType: RoomTypePlan, night: string): number {
  if (plan.scarce) return 0;
  return Math.floor(unitHash(`${roomType.roomTypeId}:sold:${night}`) * roomType.inventory * 0.5);
}

/** Rooms of a type free for every night of the stay. */
export function roomsLeftFor(
  plan: HotelPlan,
  roomType: RoomTypePlan,
  checkIn: string,
  checkOut: string,
  holds: readonly LiveHotelHold[] = [],
): number {
  let left = roomType.inventory;
  for (const night of nightsOf(checkIn, checkOut)) {
    const held = holds
      .filter(
        (h) => h.roomTypeId === roomType.roomTypeId && h.checkIn <= night && night < h.checkOut,
      )
      .reduce((sum, h) => sum + h.rooms, 0);
    left = Math.min(left, roomType.inventory - soldElsewhere(plan, roomType, night) - held);
  }
  return Math.max(0, left);
}

/** Refundable rates: noon IST, two days before check-in. */
export function freeCancellationDeadline(checkIn: string): string {
  return toLocalIso(
    zonedTimeToUtc(addDaysIso(checkIn, -HOTEL_FREE_CANCEL_DAYS), '12:00', IST).getTime(),
    IST,
  );
}

function rateFor(
  plan: HotelPlan,
  roomType: RoomTypePlan,
  rate: RatePlan,
  checkIn: string,
  checkOut: string,
  roomsLeft: number,
): HotelRate {
  const nightlyBreakdown = nightsOf(checkIn, checkOut).map((date) => ({
    date,
    price: hotelNightPrice(plan, roomType, rate, date),
  }));
  const totalPrice = nightlyBreakdown.reduce((s, n) => s + n.price, 0);
  return {
    rateId: rate.rateId,
    boardBasis: rate.boardBasis,
    refundable: rate.refundable,
    freeCancellationUntil: rate.refundable ? freeCancellationDeadline(checkIn) : null,
    // Average per night, in whole rupees (the total stays exact).
    pricePerNight: Math.round(totalPrice / Math.max(1, nightlyBreakdown.length) / 100) * 100,
    totalPrice,
    taxes: nightlyBreakdown.reduce((s, n) => s + hotelNightTax(n.price), 0),
    nightlyBreakdown,
    roomsLeft,
  };
}

/** Live room types and rates for a stay (GET /hotels/:id/rooms). */
export function hotelRoomTypes(
  plan: HotelPlan,
  checkIn: string,
  checkOut: string,
  holds: readonly LiveHotelHold[] = [],
): HotelRoomType[] {
  return plan.roomTypes.map((rt) => {
    const left = roomsLeftFor(plan, rt, checkIn, checkOut, holds);
    return {
      roomTypeId: rt.roomTypeId,
      name: rt.name,
      sizeSqft: rt.sizeSqft,
      bed: rt.bed,
      maxAdults: rt.maxAdults,
      maxChildren: rt.maxChildren,
      images: rt.images,
      amenities: rt.amenities,
      rates: rt.rates
        .map((r) => rateFor(plan, rt, r, checkIn, checkOut, left))
        .sort((a, b) => a.totalPrice - b.totalPrice),
    };
  });
}

const fits = (rt: { maxAdults: number; maxChildren: number }, room: RoomOccupancy) =>
  room.adults <= rt.maxAdults && room.childAges.length <= rt.maxChildren;

/**
 * The hotel as a search result for these rooms: each searched room gets the cheapest rate of a
 * room type that fits it and still has a room (largest parties placed first). Null when some room
 * can't be placed (sold out for this search).
 */
export function hotelSummary(
  plan: HotelPlan,
  checkIn: string,
  checkOut: string,
  rooms: readonly RoomOccupancy[],
  now: Date,
  holds: readonly LiveHotelHold[] = [],
): HotelSummary | null {
  const types = hotelRoomTypes(plan, checkIn, checkOut, holds);
  const left = new Map(types.map((t) => [t.roomTypeId, t.rates[0]?.roomsLeft ?? 0]));
  const order = [...rooms].sort(
    (a, b) => b.adults + b.childAges.length - (a.adults + a.childAges.length),
  );
  let totalPrice = 0;
  let taxes = 0;
  let cheapestLeft = Infinity;
  for (const room of order) {
    const options = types
      .filter((t) => fits(t, room) && (left.get(t.roomTypeId) ?? 0) > 0)
      .map((t) => ({ t, rate: t.rates[0] as HotelRate }))
      .filter((o) => o.rate)
      .sort((a, b) => a.rate.totalPrice - b.rate.totalPrice);
    const best = options[0];
    if (!best) return null;
    left.set(best.t.roomTypeId, (left.get(best.t.roomTypeId) ?? 1) - 1);
    totalPrice += best.rate.totalPrice;
    taxes += best.rate.taxes;
    cheapestLeft = Math.min(cheapestLeft, best.rate.roomsLeft);
  }
  const nights = Math.max(1, daysBetweenIso(checkIn, checkOut));
  const allRates = types.flatMap((t) => (t.rates[0]?.roomsLeft ? t.rates : []));
  const deadlineOpen = Date.parse(freeCancellationDeadline(checkIn)) > now.getTime();
  return {
    hotelId: plan.hotelId,
    name: plan.name,
    stars: plan.stars,
    propertyType: plan.propertyType,
    area: plan.area,
    city: findCity(plan.cityCode)?.name ?? plan.cityCode,
    rating: plan.rating,
    ratingCount: plan.ratingCount,
    ratingLabel: ratingLabel(plan.rating),
    thumbnail: hotelImages(plan)[0] as HotelImage,
    amenities: plan.amenities,
    pricePerNight: Math.round(totalPrice / nights / 100) * 100,
    totalPrice,
    taxes,
    taxesIncluded: false,
    freeCancellation: deadlineOpen && allRates.some((r) => r.refundable),
    breakfastIncluded: allRates.some((r) => r.boardBasis !== 'ROOM_ONLY'),
    roomsLeft: Number.isFinite(cheapestLeft) ? cheapestLeft : 0,
    popularity: plan.popularity,
    geo: plan.geo,
  };
}

/** Properties at a destination (city, area or a single hotel). */
export function hotelPlansAt(destinationId: string): HotelPlan[] {
  const destination = hotelDestination(destinationId);
  if (!destination) return [];
  if (destination.type === 'HOTEL') return [hotelPlan(destinationId) as HotelPlan];
  const code = /^(?:city|area)_([A-Z]{3})/.exec(destinationId)?.[1] ?? '';
  const all = hotelPlansInCity(code);
  return destination.type === 'AREA' ? all.filter((p) => p.area === destination.name) : all;
}

// ───────────────────────────── Results: filters, sort, pages ─────────────────────────────

export interface HotelResultFilters {
  sort?: HotelSort | undefined;
  priceMin?: number | undefined;
  priceMax?: number | undefined;
  stars: number[];
  rating?: number | undefined;
  freeCancellation: boolean;
  breakfast: boolean;
  amenities: string[];
  areas: string[];
  types: string[];
  page: number;
  pageSize: number;
}

/** Price filters are per night in rupees-as-paise (the slider works on per-night prices). */
export function matchesHotelFilters(h: HotelSummary, f: HotelResultFilters): boolean {
  if (f.priceMin !== undefined && h.pricePerNight < f.priceMin) return false;
  if (f.priceMax !== undefined && h.pricePerNight > f.priceMax) return false;
  if (f.stars.length > 0 && !f.stars.includes(h.stars)) return false;
  if (f.rating !== undefined && h.rating < f.rating) return false;
  if (f.freeCancellation && !h.freeCancellation) return false;
  if (f.breakfast && !h.breakfastIncluded) return false;
  if (f.amenities.some((a) => !(h.amenities as string[]).includes(a))) return false;
  if (f.areas.length > 0 && !f.areas.includes(h.area)) return false;
  if (f.types.length > 0 && !f.types.includes(h.propertyType)) return false;
  return true;
}

const SORTERS: Record<HotelSort, (a: HotelSummary, b: HotelSummary) => number> = {
  popularity: (a, b) => b.popularity - a.popularity,
  price_asc: (a, b) => a.pricePerNight - b.pricePerNight,
  price_desc: (a, b) => b.pricePerNight - a.pricePerNight,
  rating: (a, b) => b.rating - a.rating || b.ratingCount - a.ratingCount,
  stars: (a, b) => b.stars - a.stars || b.rating - a.rating,
};

/** Filters, sorts (popularity by default; ties by id) and pages the hotels; facets cover them all. */
export function hotelResultsPage(
  hotels: readonly HotelSummary[],
  f: HotelResultFilters,
): Pick<HotelSearchResponse, 'total' | 'page' | 'pageSize' | 'hotels' | 'filters'> {
  const sorter = SORTERS[f.sort ?? 'popularity'];
  const matching = hotels
    .filter((h) => matchesHotelFilters(h, f))
    .sort((a, b) => sorter(a, b) || a.hotelId.localeCompare(b.hotelId));
  const start = (f.page - 1) * f.pageSize;
  const count = <K extends string>(keys: K[]) => {
    const m = new Map<K, number>();
    for (const k of keys) m.set(k, (m.get(k) ?? 0) + 1);
    return [...m];
  };
  const prices = hotels.map((h) => h.pricePerNight);
  return {
    total: matching.length,
    page: f.page,
    pageSize: f.pageSize,
    hotels: matching.slice(start, start + f.pageSize),
    filters: {
      priceMin: prices.length > 0 ? Math.min(...prices) : 0,
      priceMax: prices.length > 0 ? Math.max(...prices) : 0,
      areas: count(hotels.map((h) => h.area))
        .map(([name, n]) => ({ name, count: n }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      propertyTypes: count(hotels.map((h) => h.propertyType)).map(([type, n]) => ({
        type,
        count: n,
      })),
    },
  };
}

// ───────────────────────────── Details ─────────────────────────────

export function hotelImages(plan: HotelPlan): HotelImage[] {
  const n = (plan.index % 4) + 1;
  const kind = plan.propertyType === 'HOTEL' ? 'Hotel' : plan.propertyType.toLowerCase();
  return [
    img(`exterior-${n}.svg`, `${plan.name} — ${kind} exterior`),
    img(`lobby-${(plan.index % 2) + 1}.svg`, `Reception and lobby at ${plan.name}`),
    img(`room-${n}.svg`, `A guest room at ${plan.name}`),
    ...(plan.amenities.includes('pool')
      ? [img(`pool-${(plan.index % 2) + 1}.svg`, `Swimming pool at ${plan.name}`)]
      : []),
    ...(plan.amenities.includes('restaurant')
      ? [img('restaurant.svg', `Restaurant at ${plan.name}`)]
      : []),
    ...(plan.amenities.includes('spa') ? [img('spa.svg', `Spa at ${plan.name}`)] : []),
    img('bathroom.svg', `Bathroom at ${plan.name}`),
    plan.cityCode === 'GOI' || plan.cityCode === 'BOM'
      ? img('view-sea.svg', `View near ${plan.name}`)
      : img('view-city.svg', `View of ${plan.area} near ${plan.name}`),
  ];
}

const AMENITY_GROUP: Record<HotelAmenity, [HotelAmenityGroup, string]> = {
  wifi: ['General', 'Free Wi-Fi'],
  parking: ['General', 'Free parking'],
  airport_shuttle: ['General', 'Airport shuttle (on request)'],
  pet_friendly: ['General', 'Pets allowed'],
  ac: ['Room', 'Air conditioning'],
  room_service: ['Room', '24-hour room service'],
  restaurant: ['Food', 'Restaurant'],
  breakfast: ['Food', 'Breakfast available'],
  bar: ['Food', 'Bar'],
  pool: ['Wellness', 'Swimming pool'],
  gym: ['Wellness', 'Fitness centre'],
  spa: ['Wellness', 'Spa'],
};

/** GET /hotels/:hotelId — gallery, description, amenities, policies. */
export function hotelDetails(plan: HotelPlan, demo: boolean): HotelDetails {
  const city = CITY_BY_CODE.get(plan.cityCode) as HotelCity;
  const cityInfo = findCity(plan.cityCode);
  const cityName = cityInfo?.name ?? plan.cityCode;
  const u = (salt: string) => unitHash(`${plan.hotelId}:${salt}`);
  const groups = new Map<HotelAmenityGroup, string[]>();
  for (const a of plan.amenities) {
    const [group, label] = AMENITY_GROUP[a];
    groups.set(group, [...(groups.get(group) ?? []), label]);
  }
  groups.set('Room', [...(groups.get('Room') ?? []), 'Television', 'Daily housekeeping']);
  groups.set('Accessibility', [
    ...(plan.stars >= 3 ? ['Lift to all floors'] : []),
    ...(plan.stars >= 4 ? ['Accessible rooms on request', 'Step-free entrance'] : []),
    'Ground-floor rooms on request',
  ]);
  const order: HotelAmenityGroup[] = ['General', 'Room', 'Food', 'Wellness', 'Accessibility'];
  const kind =
    plan.propertyType === 'HOTEL' ? `${plan.stars}-star hotel` : plan.propertyType.toLowerCase();
  const score = (offset: number) =>
    Math.min(5, Math.max(1, Math.round((plan.rating + offset) * 10) / 10));
  return {
    hotelId: plan.hotelId,
    name: plan.name,
    stars: plan.stars,
    propertyType: plan.propertyType,
    description:
      `${plan.name} is a ${kind} in ${plan.area}, ${cityName}, with ${plan.roomTypes.length} room ` +
      `types${plan.amenities.includes('pool') ? ', a swimming pool' : ''}` +
      `${plan.amenities.includes('restaurant') ? ' and an all-day restaurant' : ''}. ` +
      `Check-in is from ${plan.checkInTime} and check-out until ${plan.checkOutTime}.`,
    address: [
      `${10 + Math.floor(u('street') * 190)}, ${plan.area} Main Road`,
      plan.area,
      cityName,
      `${cityInfo?.state && cityInfo.state !== cityName ? `${cityInfo.state} ` : ''}${city.pin}`,
    ].join(', '),
    area: plan.area,
    city: cityName,
    state: cityInfo?.state ?? '',
    phone: `+91 ${city.std} 4100 ${String(1000 + plan.index).slice(-4)}`,
    geo: plan.geo,
    rating: plan.rating,
    ratingCount: plan.ratingCount,
    ratingLabel: ratingLabel(plan.rating),
    ratingBreakdown: [
      { label: 'Cleanliness', score: score(0.1) },
      { label: 'Location', score: score(0.2) },
      { label: 'Service', score: score(0) },
      { label: 'Rooms', score: score(-0.1) },
      { label: 'Value for money', score: score(-0.2) },
    ],
    images: hotelImages(plan),
    amenities: plan.amenities,
    amenityGroups: order
      .filter((g) => (groups.get(g) ?? []).length > 0)
      .map((g) => ({ group: g, items: groups.get(g) ?? [] })),
    checkInTime: plan.checkInTime,
    checkOutTime: plan.checkOutTime,
    houseRules: [
      'A valid government photo ID is required at check-in for every adult guest.',
      'The lead guest must be 18 or older.',
      'Unmarried couples are welcome.',
      plan.localIdsAccepted ? 'Local IDs are accepted.' : 'Local IDs are not accepted.',
      plan.petsAllowed ? 'Pets are allowed on request.' : 'Pets are not allowed.',
      'Smoking is not allowed inside rooms.',
    ],
    cancellationSummary:
      `Refundable rates can be cancelled free of charge until 12:00 noon, ` +
      `${HOTEL_FREE_CANCEL_DAYS} days before check-in; after that the first night is charged. ` +
      'Non-refundable rates are not refunded. No cancellations after the check-in date.',
    demo,
  };
}

// ───────────────────────────── Booking: quote, bill, refund ─────────────────────────────

export interface HotelRoomRequest {
  roomTypeId: string;
  rateId: string;
  adults: number;
  childAges: number[];
}

export interface QuotedRoom extends HotelRoomRequest {
  roomName: string;
  boardBasis: BoardBasis;
  refundable: boolean;
  freeCancellationUntil: string | null;
  /** Whole stay, before taxes */
  price: number;
  taxes: number;
  nightlyBreakdown: { date: string; price: number }[];
}

export type HotelQuoteResult =
  | { ok: true; rooms: QuotedRoom[] }
  | { ok: false; error: 'BAD_RATE'; index: number }
  | { ok: false; error: 'OCCUPANCY'; index: number; field: 'adults' | 'childAges'; max: number }
  | { ok: false; error: 'ROOM_UNAVAILABLE'; roomTypeId: string };

/**
 * Prices the requested rooms live and checks them: the rate belongs to the room type, each room's
 * guests fit the room type, and enough rooms of each type are free for every night.
 */
export function quoteHotelRooms(
  plan: HotelPlan,
  checkIn: string,
  checkOut: string,
  requests: readonly HotelRoomRequest[],
  holds: readonly LiveHotelHold[] = [],
): HotelQuoteResult {
  const rooms: QuotedRoom[] = [];
  const wanted = new Map<string, number>();
  for (const [index, req] of requests.entries()) {
    const rt = plan.roomTypes.find((t) => t.roomTypeId === req.roomTypeId);
    const rate = rt?.rates.find((r) => r.rateId === req.rateId);
    if (!rt || !rate) return { ok: false, error: 'BAD_RATE', index };
    if (req.adults > rt.maxAdults)
      return { ok: false, error: 'OCCUPANCY', index, field: 'adults', max: rt.maxAdults };
    if (req.childAges.length > rt.maxChildren)
      return { ok: false, error: 'OCCUPANCY', index, field: 'childAges', max: rt.maxChildren };
    wanted.set(rt.roomTypeId, (wanted.get(rt.roomTypeId) ?? 0) + 1);
    const priced = rateFor(plan, rt, rate, checkIn, checkOut, 0);
    rooms.push({
      ...req,
      roomName: rt.name,
      boardBasis: rate.boardBasis,
      refundable: rate.refundable,
      freeCancellationUntil: priced.freeCancellationUntil,
      price: priced.totalPrice,
      taxes: priced.taxes,
      nightlyBreakdown: priced.nightlyBreakdown,
    });
  }
  for (const [roomTypeId, count] of wanted) {
    const rt = plan.roomTypes.find((t) => t.roomTypeId === roomTypeId) as RoomTypePlan;
    if (roomsLeftFor(plan, rt, checkIn, checkOut, holds) < count)
      return { ok: false, error: 'ROOM_UNAVAILABLE', roomTypeId };
  }
  return { ok: true, rooms };
}

/**
 * The server's bill for a stay: room charges (every night of every room), GST per room-night,
 * the convenience fee and the total. Coupons are applied to the booking afterwards.
 */
export function hotelPriceBreakdown(
  rooms: readonly { price: number; taxes: number }[],
  nights: number,
  feePaise: number = HOTEL_CONVENIENCE_FEE_PAISE,
): PriceBreakdown {
  const basePaise = rooms.reduce((s, r) => s + r.price, 0);
  const taxesPaise = rooms.reduce((s, r) => s + r.taxes, 0);
  const n = rooms.length;
  return {
    lines: [
      {
        label: `Room charges — ${n} room${n === 1 ? '' : 's'} × ${nights} night${nights === 1 ? '' : 's'}`,
        amountPaise: basePaise,
      },
      { label: 'Taxes (GST)', amountPaise: taxesPaise },
      ...(feePaise > 0 ? [{ label: 'Convenience fee', amountPaise: feePaise }] : []),
    ],
    basePaise,
    taxesPaise,
    feesPaise: feePaise,
    discountPaise: 0,
    totalPaise: basePaise + taxesPaise + feePaise,
    currency: 'INR',
  };
}

export interface RefundableRoom {
  refundable: boolean;
  freeCancellationUntil: string | null;
  price: number;
  nightlyBreakdown: { date: string; price: number }[];
}

/**
 * Refund for cancelling a stay at `now`: nothing on or after the check-in date (IST); per room,
 * everything before its free-cancellation deadline, everything but the first night after it,
 * nothing for non-refundable rates. Room shares are applied to what was actually paid (after any
 * coupon); the convenience fee is never refunded.
 */
export function hotelRefund(input: {
  rooms: readonly RefundableRoom[];
  checkIn: string;
  paidPaise: number;
  feesPaise: number;
  now: Date;
}): { cancellable: boolean; refundPaise: number; reason?: string } {
  const checkInStart = zonedTimeToUtc(input.checkIn, '00:00', IST).getTime();
  if (input.now.getTime() >= checkInStart)
    return {
      cancellable: false,
      refundPaise: 0,
      reason: 'Cancellation is closed from the check-in date. Please contact the hotel.',
    };
  const gross = (r: RefundableRoom) =>
    r.nightlyBreakdown.reduce((s, n) => s + n.price + hotelNightTax(n.price), 0);
  const refundableShare = (r: RefundableRoom) => {
    if (!r.refundable) return 0;
    const deadline = r.freeCancellationUntil ? Date.parse(r.freeCancellationUntil) : 0;
    if (input.now.getTime() < deadline) return gross(r);
    const first = r.nightlyBreakdown[0];
    return Math.max(0, gross(r) - (first ? first.price + hotelNightTax(first.price) : 0));
  };
  const total = input.rooms.reduce((s, r) => s + gross(r), 0);
  const back = input.rooms.reduce((s, r) => s + refundableShare(r), 0);
  const paid = Math.max(0, input.paidPaise - input.feesPaise);
  return {
    cancellable: true,
    refundPaise: total > 0 ? Math.floor((paid * back) / total) : 0,
  };
}

/** Today in IST for a clock. */
export const hotelToday = (now: Date) => toLocalIso(now.getTime(), IST).slice(0, 10);
