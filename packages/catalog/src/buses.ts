/**
 * Development (mock) bus inventory, shared by the API's MockBusProvider and the static website so
 * both data modes show exactly the same trips, seats and prices.
 *
 * Everything is deterministic from (from, to, date): 12–25 trips per route and day, eight
 * operators, five coach layouts, evening/night-heavy departures with overnight (+1) arrivals,
 * 10–40% of seats already sold, exactly two ladies-only seats per coach and seat prices between
 * ₹599 and ₹2,899. Operator names are invented so demo inventory is never mistaken for a real
 * operator's services.
 */
import { findCity } from '@zproo/config';
import type {
  BusAmenity,
  BusCancellationRule,
  BusDeck,
  BusDeckMap,
  BusLayout,
  BusOperatorInfo,
  BusPoint,
  BusRestStop,
  BusSeat,
  BusSearchResponse,
  BusSeatType,
  BusTripDetails,
  BusTripSummary,
  BusTypeInfo,
} from '@zproo/types';
import { busSeatPrice } from './busPricing';
import { unitHash } from './hash';
import { addDaysIso } from './time';

// ───────────────────────────── Operators and coaches ─────────────────────────────

export const MOCK_BUS_OPERATORS: readonly BusOperatorInfo[] = [
  {
    code: 'SSK',
    name: 'Sahyadri Skyline',
    rating: 4.5,
    ratingCount: 3120,
    phone: '+91 20 4000 1001',
  },
  {
    code: 'DDH',
    name: 'Deccan Dhruv Tours',
    rating: 4.4,
    ratingCount: 2710,
    phone: '+91 20 4000 1002',
  },
  {
    code: 'KKN',
    name: 'Konkan Kinara Travels',
    rating: 4.3,
    ratingCount: 2240,
    phone: '+91 22 4000 1003',
  },
  {
    code: 'GGT',
    name: 'Godavari Gati Travels',
    rating: 3.8,
    ratingCount: 1870,
    phone: '+91 253 400 1004',
  },
  {
    code: 'ECO',
    name: 'Ecoline Electric',
    rating: 4.6,
    ratingCount: 1330,
    phone: '+91 20 4000 1005',
  },
  {
    code: 'MMM',
    name: 'Mula Mutha Motors',
    rating: 4.1,
    ratingCount: 1105,
    phone: '+91 20 4000 1006',
  },
  {
    code: 'VVG',
    name: 'Vidarbha Vega Roadways',
    rating: 3.6,
    ratingCount: 960,
    phone: '+91 712 400 1007',
  },
  { code: 'PPR', name: 'Pune Pravas', rating: 2.9, ratingCount: 740, phone: '+91 20 4000 1008' },
];

export interface CoachType {
  key: string;
  layout: BusLayout;
  info: BusTypeInfo;
  /** Fare relative to the route's A/C sleeper fare, in percent */
  farePercent: number;
  amenities: BusAmenity[];
}

const PREMIUM: BusAmenity[] = [
  'wifi',
  'charging',
  'water',
  'blanket',
  'reading_light',
  'cctv',
  'tracking',
];

export const COACH_TYPES: readonly CoachType[] = [
  {
    key: 'AC_SLEEPER',
    layout: 'SLEEPER_2_1',
    info: {
      label: 'A/C Sleeper (2+1)',
      layout: 'SLEEPER_2_1',
      ac: true,
      sleeper: true,
      seater: false,
    },
    farePercent: 100,
    amenities: PREMIUM,
  },
  {
    key: 'AC_SEATER_SLEEPER',
    layout: 'SEATER_SLEEPER_COMBO',
    info: {
      label: 'A/C Seater / Sleeper (2+1)',
      layout: 'SEATER_SLEEPER_COMBO',
      ac: true,
      sleeper: true,
      seater: true,
    },
    farePercent: 88,
    amenities: ['charging', 'water', 'blanket', 'reading_light', 'tracking'],
  },
  {
    key: 'AC_SEMI_SLEEPER',
    layout: 'SEMI_SLEEPER_2_2',
    info: {
      label: 'A/C Semi-Sleeper (2+2)',
      layout: 'SEMI_SLEEPER_2_2',
      ac: true,
      sleeper: false,
      seater: true,
    },
    farePercent: 78,
    amenities: ['wifi', 'charging', 'water', 'reading_light', 'cctv', 'tracking'],
  },
  {
    key: 'AC_SEATER_2_1',
    layout: 'SEATER_2_1',
    info: {
      label: 'A/C Seater (2+1)',
      layout: 'SEATER_2_1',
      ac: true,
      sleeper: false,
      seater: true,
    },
    farePercent: 74,
    amenities: ['wifi', 'charging', 'water', 'snacks', 'tracking'],
  },
  {
    key: 'NON_AC_SLEEPER',
    layout: 'SLEEPER_2_1',
    info: {
      label: 'Non A/C Sleeper (2+1)',
      layout: 'SLEEPER_2_1',
      ac: false,
      sleeper: true,
      seater: false,
    },
    farePercent: 72,
    amenities: ['charging', 'water', 'reading_light', 'tracking'],
  },
  {
    key: 'NON_AC_SEATER',
    layout: 'SEATER_2_2',
    info: {
      label: 'Non A/C Seater (2+2)',
      layout: 'SEATER_2_2',
      ac: false,
      sleeper: false,
      seater: true,
    },
    farePercent: 60,
    amenities: ['charging'],
  },
];

/** Operator → the coach types it runs. */
const FLEET: Record<string, string[]> = {
  SSK: ['AC_SLEEPER', 'AC_SEMI_SLEEPER'],
  DDH: ['AC_SLEEPER', 'AC_SEATER_SLEEPER'],
  KKN: ['AC_SEATER_SLEEPER', 'NON_AC_SLEEPER', 'AC_SEMI_SLEEPER'],
  GGT: ['AC_SEATER_SLEEPER', 'NON_AC_SLEEPER'],
  ECO: ['AC_SEATER_2_1'],
  MMM: ['AC_SEMI_SLEEPER', 'NON_AC_SEATER'],
  VVG: ['AC_SLEEPER', 'NON_AC_SLEEPER'],
  PPR: ['NON_AC_SEATER', 'NON_AC_SLEEPER'],
};

// ───────────────────────────── Seat layouts ─────────────────────────────

export interface SeatSpec {
  seatNo: string;
  deck: BusDeck;
  row: number;
  col: number;
  type: BusSeatType;
  width: number;
  height: number;
  /** Seat price relative to the trip fare, in percent (lower sleepers, windows cost more) */
  farePercent: number;
}

export interface LayoutSpec {
  layout: BusLayout;
  decks: { deck: BusDeck; rows: number; cols: number; seats: SeatSpec[] }[];
}

/** 2+1 sleeper deck: berths in columns 0–1, aisle in column 2, single berth in column 3. */
function sleeperDeck(deck: BusDeck, berthRows: number, farePercent: number) {
  const prefix = deck === 'LOWER' ? 'L' : 'U';
  const seats: SeatSpec[] = [];
  let n = 1;
  for (let r = 0; r < berthRows; r++) {
    for (const col of [0, 1, 3]) {
      seats.push({
        seatNo: `${prefix}${n}`,
        deck,
        row: r * 2,
        col,
        type: 'SLEEPER',
        width: 1,
        height: 2,
        farePercent,
      });
      n += 1;
    }
  }
  return { deck, rows: berthRows * 2, cols: 4, seats };
}

/** Seater deck; `columns` lists seat columns, the missing one is the aisle. Windows cost 5% more. */
function seaterDeck(rows: number, columns: number[], type: BusSeatType, start = 1) {
  const seats: SeatSpec[] = [];
  let n = start;
  const last = Math.max(...columns);
  for (let row = 0; row < rows; row++) {
    for (const col of columns) {
      seats.push({
        seatNo: String(n),
        deck: 'LOWER',
        row,
        col,
        type,
        width: 1,
        height: 1,
        farePercent: col === 0 || col === last ? 105 : 100,
      });
      n += 1;
    }
  }
  return { deck: 'LOWER' as const, rows, cols: last + 1, seats };
}

/** Seat grid for each layout. An aisle is an empty column. */
export function buildSeatLayout(layout: BusLayout): LayoutSpec {
  switch (layout) {
    case 'SLEEPER_2_1':
      return { layout, decks: [sleeperDeck('LOWER', 6, 110), sleeperDeck('UPPER', 6, 100)] };
    case 'SEATER_SLEEPER_COMBO':
      return {
        layout,
        decks: [seaterDeck(10, [0, 1, 3], 'SEATER'), sleeperDeck('UPPER', 6, 112)],
      };
    case 'SEMI_SLEEPER_2_2':
      return { layout, decks: [seaterDeck(11, [0, 1, 3, 4], 'SEMI_SLEEPER')] };
    case 'SEATER_2_1':
      return { layout, decks: [seaterDeck(12, [0, 1, 3], 'SEATER')] };
    case 'SEATER_2_2':
      return { layout, decks: [seaterDeck(10, [0, 1, 3, 4], 'SEATER')] };
  }
}

/**
 * Seats beside each other with no aisle between them (same deck and row, adjacent columns). A
 * woman's booking makes the seat beside it ladies-only.
 */
export function adjacentSeats(layout: LayoutSpec, seatNo: string): string[] {
  for (const deck of layout.decks) {
    const seat = deck.seats.find((s) => s.seatNo === seatNo);
    if (!seat) continue;
    return deck.seats
      .filter((s) => s.row === seat.row && Math.abs(s.col - seat.col) === 1)
      .map((s) => s.seatNo);
  }
  return [];
}

// ───────────────────────────── Route network ─────────────────────────────

/** [from, to, distance km, duration minutes, A/C sleeper fare in rupees] — run in both directions. */
export const BUS_ROUTES: readonly [string, string, number, number, number][] = [
  ['PNQ', 'BOM', 150, 210, 850],
  ['PNQ', 'ISK', 210, 300, 900],
  ['PNQ', 'KLH', 230, 330, 950],
  ['PNQ', 'STR', 115, 150, 700],
  ['PNQ', 'IXU', 235, 330, 950],
  ['PNQ', 'SAG', 185, 270, 850],
  ['PNQ', 'SSE', 250, 330, 950],
  ['PNQ', 'AHL', 120, 180, 700],
  ['PNQ', 'MHB', 120, 180, 750],
  ['PNQ', 'RTN', 300, 420, 1000],
  ['PNQ', 'PND', 205, 270, 800],
  ['PNQ', 'LTR', 360, 480, 1100],
  ['PNQ', 'NDC', 460, 600, 1200],
  ['PNQ', 'JLG', 410, 540, 1150],
  ['PNQ', 'AMR', 600, 780, 1500],
  ['PNQ', 'NAG', 715, 870, 1700],
  ['PNQ', 'GOI', 450, 600, 1300],
  ['PNQ', 'HYD', 560, 720, 1400],
  ['PNQ', 'BLR', 840, 960, 1900],
  ['BOM', 'ISK', 170, 240, 800],
  ['BOM', 'SAG', 240, 330, 950],
  ['BOM', 'KLH', 380, 480, 1100],
  ['BOM', 'IXU', 335, 450, 1050],
  ['BOM', 'RTN', 330, 450, 1000],
  ['BOM', 'MLV', 480, 600, 1250],
  ['BOM', 'MHB', 250, 360, 950],
  ['BOM', 'ALB', 95, 150, 650],
  ['BOM', 'NAG', 830, 960, 1800],
  ['BOM', 'GOI', 590, 720, 1400],
  ['BOM', 'AMD', 525, 540, 1300],
  ['BOM', 'IDR', 590, 720, 1500],
  ['BOM', 'HYD', 710, 840, 1600],
  ['BOM', 'BLR', 985, 1080, 2000],
  ['NAG', 'AMR', 155, 180, 700],
  ['NAG', 'CHN', 155, 180, 700],
  ['NAG', 'IXU', 480, 600, 1300],
  ['NAG', 'HYD', 500, 600, 1300],
  ['ISK', 'SAG', 90, 120, 650],
  ['KLH', 'GOI', 215, 300, 850],
  ['KLH', 'BLR', 600, 720, 1500],
];

/** The network as both directions, keyed `FROM-TO`. */
const ROUTE_INDEX: ReadonlyMap<string, { km: number; minutes: number; fare: number }> = new Map(
  BUS_ROUTES.flatMap(([a, b, km, minutes, fare]) => [
    [`${a}-${b}`, { km, minutes, fare }],
    [`${b}-${a}`, { km, minutes, fare }],
  ]),
);

/** Cities that have bus services (for the city picker). */
export const BUS_CITY_CODES: ReadonlySet<string> = new Set(BUS_ROUTES.flatMap(([a, b]) => [a, b]));

export function busRoute(from: string, to: string) {
  return ROUTE_INDEX.get(`${from}-${to}`) ?? null;
}

/** Boarding/dropping points for the main cities: [name, landmark, address]. */
const CITY_POINTS: Record<string, [string, string, string][]> = {
  PNQ: [
    ['Swargate', 'Near Swargate Bus Stand', 'Shankarshet Road, Swargate, Pune 411042'],
    ['Shivajinagar', 'Opp. Shivajinagar Bus Stand', 'Wakdewadi, Shivajinagar, Pune 411005'],
    ['Wakad', 'Wakad Bridge', 'Mumbai–Bengaluru Highway, Wakad, Pune 411057'],
    ['Hinjewadi', 'Phase 1 Chowk', 'Hinjewadi Phase 1, Pune 411057'],
    ['Nigdi', 'Bhakti Shakti Chowk', 'Nigdi, Pimpri-Chinchwad 411044'],
    ['Katraj', 'Katraj Chowk', 'Pune–Satara Road, Katraj, Pune 411046'],
  ],
  BOM: [
    [
      'Borivali',
      'Near National Park Gate',
      'Western Express Highway, Borivali East, Mumbai 400066',
    ],
    ['Andheri', 'Andheri Flyover', 'Western Express Highway, Andheri East, Mumbai 400069'],
    ['Dadar', 'Dadar TT Circle', 'Dr Ambedkar Road, Dadar East, Mumbai 400014'],
    ['Sion', 'Sion Circle', 'Sion East, Mumbai 400022'],
    ['Vashi', 'Vashi Plaza', 'Sector 17, Vashi, Navi Mumbai 400703'],
    ['Panvel', 'Near Panvel Bus Depot', 'Old Panvel, Panvel 410206'],
  ],
  ISK: [
    ['Nashik CBS', 'Central Bus Stand', 'Old Agra Road, Nashik 422001'],
    ['Dwarka Circle', 'Dwarka Circle', 'Mumbai–Agra Highway, Nashik 422011'],
    ['Nashik Road', 'Near Nashik Road Station', 'Nashik Road, Nashik 422101'],
    ['Pathardi Phata', 'Pathardi Phata', 'Mumbai–Agra Highway, Nashik 422010'],
  ],
  NAG: [
    ['Ganeshpeth', 'Ganeshpeth Bus Stand', 'Ganeshpeth, Nagpur 440018'],
    ['Sitabuldi', 'Variety Square', 'Sitabuldi, Nagpur 440012'],
    ['Chhatrapati Square', 'Chhatrapati Square', 'Wardha Road, Nagpur 440015'],
    ['Medical Square', 'Medical Square', 'Medical College Road, Nagpur 440003'],
  ],
  KLH: [
    ['Kolhapur CBS', 'Central Bus Stand', 'Station Road, Kolhapur 416001'],
    ['Tararani Chowk', 'Tararani Chowk', 'Tarabai Park, Kolhapur 416003'],
    ['Shiroli Phata', 'Shiroli Phata', 'Pune–Bengaluru Highway, Kolhapur 416122'],
  ],
  IXU: [
    [
      'Sambhajinagar CBS',
      'Central Bus Stand',
      'Railway Station Road, Chhatrapati Sambhajinagar 431001',
    ],
    ['Kranti Chowk', 'Kranti Chowk', 'Kranti Chowk, Chhatrapati Sambhajinagar 431001'],
    ['Baba Petrol Pump', 'Baba Petrol Pump Chowk', 'Jalna Road, Chhatrapati Sambhajinagar 431005'],
    ['CIDCO', 'CIDCO Bus Stand', 'N-6, CIDCO, Chhatrapati Sambhajinagar 431003'],
  ],
  GOI: [
    ['Panaji', 'Kadamba Bus Stand', 'Patto, Panaji, Goa 403001'],
    ['Porvorim', 'Porvorim Circle', 'Alto Porvorim, Goa 403521'],
    ['Mapusa', 'Mapusa Bus Stand', 'Mapusa, Goa 403507'],
    ['Margao', 'Kadamba Bus Stand', 'Margao, Goa 403601'],
  ],
  BLR: [
    ['Majestic', 'Kempegowda Bus Station', 'Gandhi Nagar, Bengaluru 560009'],
    ['Anand Rao Circle', 'Anand Rao Circle', 'Seshadripuram, Bengaluru 560020'],
    ['Yeshwanthpur', 'Yeshwanthpur Circle', 'Yeshwanthpur, Bengaluru 560022'],
    ['Nelamangala', 'Nelamangala Toll', 'Tumakuru Road, Nelamangala 562123'],
  ],
  HYD: [
    ['MGBS', 'Mahatma Gandhi Bus Station', 'Gowliguda, Hyderabad 500012'],
    ['Ameerpet', 'Ameerpet Metro', 'Ameerpet, Hyderabad 500016'],
    ['Kukatpally', 'KPHB Colony', 'Kukatpally, Hyderabad 500072'],
    ['Miyapur', 'Miyapur X Roads', 'Miyapur, Hyderabad 500049'],
  ],
  AMD: [
    ['Paldi', 'Paldi Cross Roads', 'Paldi, Ahmedabad 380007'],
    ['Geeta Mandir', 'Geeta Mandir Bus Stand', 'Astodia, Ahmedabad 380022'],
    ['Naroda', 'Naroda Patiya', 'Naroda, Ahmedabad 382330'],
  ],
  SAG: [
    ['Shirdi Bus Stand', 'Near Sai Baba Temple Gate 1', 'Pimpalwadi Road, Shirdi 423109'],
    ['Nimgaon', 'Nimgaon Phata', 'Nagar–Manmad Highway, Shirdi 423109'],
  ],
  STR: [
    ['Satara Bus Stand', 'Central Bus Stand', 'Powai Naka, Satara 415001'],
    ['Wadhe Phata', 'Wadhe Phata', 'Pune–Bengaluru Highway, Satara 415011'],
  ],
  RTN: [
    ['Ratnagiri Bus Stand', 'Central Bus Stand', 'Maruti Mandir Road, Ratnagiri 415612'],
    ['Maruti Mandir', 'Maruti Mandir Circle', 'Ratnagiri 415612'],
  ],
  MHB: [
    ['Mahabaleshwar Bus Stand', 'Main Market', 'Main Market, Mahabaleshwar 412806'],
    ['Panchgani', 'Panchgani Bus Stand', 'Panchgani 412805'],
  ],
};

export function pointsFor(city: string): [string, string, string][] {
  const known = CITY_POINTS[city];
  if (known) return known;
  const name = findCity(city)?.name ?? city;
  return [
    [`${name} Bus Stand`, 'Central Bus Stand', `Central Bus Stand, ${name}`],
    [`${name} Bypass`, 'Highway Bypass', `Highway Bypass Pickup, ${name}`],
  ];
}

// ───────────────────────────── Trips ─────────────────────────────

export const BUS_CANCELLATION_POLICY: readonly BusCancellationRule[] = [
  { hoursBefore: 24, refundPercent: 90 },
  { hoursBefore: 12, refundPercent: 75 },
  { hoursBefore: 4, refundPercent: 50 },
  { hoursBefore: 0, refundPercent: 0 },
];

/** Sales close this long before departure ("Booking for this bus has closed"). */
export const BUS_SALES_CUTOFF_MINUTES = 30;
export const BUS_REPORTING_MINUTES = 15;

const TRIP_ID = /^trp_([A-Z]{3})_([A-Z]{3})_(\d{4})(\d{2})(\d{2})_(\d{2})$/;
const pad = (n: number) => String(n).padStart(2, '0');

/** `YYYY-MM-DDTHH:MM:00+05:30` for `minutes` after midnight IST on `date` (may roll over days). */
export function istIso(date: string, minutes: number): string {
  const days = Math.floor(minutes / 1440);
  const m = minutes - days * 1440;
  return `${addDaysIso(date, days)}T${pad(Math.floor(m / 60))}:${pad(m % 60)}:00+05:30`;
}

export function parseBusTripId(tripId: string) {
  const m = TRIP_ID.exec(tripId);
  if (!m) return null;
  return {
    from: m[1] as string,
    to: m[2] as string,
    date: `${m[3]}-${m[4]}-${m[5]}`,
    index: Number(m[6]),
  };
}

interface TripPlan {
  tripId: string;
  from: string;
  to: string;
  date: string;
  index: number;
  operator: BusOperatorInfo;
  coach: CoachType;
  departureMinutes: number;
  durationMin: number;
  km: number;
  baseFarePaise: number;
}

/** 12–25 trips per route and day; more than half leave in the evening or at night. */
export function busTripCount(from: string, to: string, date: string): number {
  return 12 + Math.floor(unitHash(`bus-count:${from}:${to}:${date}`) * 14);
}

function planTrip(from: string, to: string, date: string, index: number): TripPlan | null {
  const route = busRoute(from, to);
  if (!route || index >= busTripCount(from, to, date)) return null;
  const h = (salt: string) => unitHash(`bus:${from}:${to}:${date}:${index}:${salt}`);
  const night = h('night') < 0.6 || route.km >= 450;
  const departureMinutes = night
    ? 18 * 60 + Math.floor(h('dep') * 23) * 15 // 18:00–23:30
    : 5 * 60 + 30 + Math.floor(h('dep') * 49) * 15; // 05:30–17:30
  const operators = MOCK_BUS_OPERATORS.filter((op) =>
    (FLEET[op.code] ?? []).some((k) => k !== 'AC_SEATER_2_1' || route.km < 400),
  );
  const operator = operators[Math.floor(h('op') * operators.length)] as BusOperatorInfo;
  const fleet = (FLEET[operator.code] ?? []).filter((k) => k !== 'AC_SEATER_2_1' || route.km < 400);
  const sleepers = route.km >= 450 ? fleet.filter((k) => k.includes('SLEEPER')) : [];
  const pool = sleepers.length > 0 ? sleepers : fleet;
  const coach = COACH_TYPES.find(
    (c) => c.key === pool[Math.floor(h('coach') * pool.length)],
  ) as CoachType;
  return {
    tripId: `trp_${from}_${to}_${date.replaceAll('-', '')}_${pad(index)}`,
    from,
    to,
    date,
    index,
    operator,
    coach,
    departureMinutes,
    durationMin: route.minutes + Math.floor(h('dur') * 5) * 10,
    km: route.km,
    baseFarePaise: Math.round((route.fare * coach.farePercent) / 100) * 100,
  };
}

const cityName = (code: string) => findCity(code)?.name ?? code;

function points(plan: TripPlan) {
  const start = plan.departureMinutes;
  const end = start + plan.durationMin;
  const boarding: BusPoint[] = pointsFor(plan.from)
    .slice(0, 6)
    .map(([name, landmark, address], i) => ({
      id: `bp_${i + 1}`,
      name,
      landmark,
      address,
      time: istIso(plan.date, start + i * 15),
    }));
  const dropping: BusPoint[] = pointsFor(plan.to)
    .slice(0, 5)
    .map(([name, landmark, address], i, all) => ({
      id: `dp_${i + 1}`,
      name,
      landmark,
      address,
      time: istIso(plan.date, end - (all.length - 1 - i) * 15),
    }));
  return { boarding, dropping };
}

function restStops(plan: TripPlan): BusRestStop[] {
  const stops = Math.floor(plan.durationMin / 240);
  return Array.from({ length: Math.min(stops, 2) }, (_, i) => ({
    name: i === 0 ? 'Highway food plaza' : 'Fuel and refreshment stop',
    time: istIso(
      plan.date,
      plan.departureMinutes + Math.round((plan.durationMin * (i + 1)) / (stops + 1)),
    ),
    durationMin: i === 0 ? 20 : 15,
  }));
}

export const BUS_PHOTOS = [
  { url: '/assets/buses/exterior.svg', alt: 'Coach exterior' },
  { url: '/assets/buses/interior.svg', alt: 'Aisle and seating inside the coach' },
  { url: '/assets/buses/berth.svg', alt: 'Sleeper berth with blanket and reading light' },
  { url: '/assets/buses/seat.svg', alt: 'Reclining seat with charging point' },
] as const;

// ───────────────────────────── Seats ─────────────────────────────

export interface MockSeat extends SeatSpec {
  price: number;
  ladiesOnly: boolean;
  /** Sold before any ZPROO GO booking (10–40% of the coach) */
  presold: boolean;
  /** For presold seats: bought by a woman */
  presoldFemale: boolean;
}

/** The coach's seats with prices and the operator's own sales (before ZPROO GO holds). */
export function mockSeats(
  plan: TripPlan,
  today: string,
): { layout: LayoutSpec; seats: MockSeat[] } {
  const layout = buildSeatLayout(plan.coach.layout);
  const all = layout.decks.flatMap((d) => d.seats);
  const h = (salt: string) => unitHash(`seat:${plan.tripId}:${salt}`);
  const load = 0.1 + h('load') * 0.3;
  // Exactly two ladies-only seats, on the lower deck.
  const lower = all.filter((s) => s.deck === 'LOWER');
  const firstLady = Math.floor(h('lady') * lower.length);
  const ladies = new Set([
    lower[firstLady]?.seatNo,
    lower[(firstLady + 1 + Math.floor(h('lady2') * (lower.length - 1))) % lower.length]?.seatNo,
  ]);
  // Exactly round(load × seats) seats sold, chosen by a stable hash ranking.
  const soldCount = Math.round(load * all.length);
  const sold = new Set(
    [...all]
      .sort((a, b) => h(`sold:${a.seatNo}`) - h(`sold:${b.seatNo}`))
      .slice(0, soldCount)
      .map((s) => s.seatNo),
  );
  const seats = all.map((spec) => ({
    ...spec,
    price: busSeatPrice({
      baseFarePaise: plan.baseFarePaise,
      seatFarePercent: spec.farePercent,
      date: plan.date,
      today,
    }),
    ladiesOnly: ladies.has(spec.seatNo),
    presold: sold.has(spec.seatNo),
    presoldFemale: h(`female:${spec.seatNo}`) < 0.35,
  }));
  return { layout, seats };
}

export interface LiveHold {
  seatNo: string;
  female: boolean;
}

/**
 * The seat map customers pick from: the operator's sales plus live holds/bookings (`taken`).
 * A seat beside one booked by a woman is ladies-only.
 */
export function busSeatDecks(plan: TripPlan, today: string, taken: readonly LiveHold[]) {
  const { layout, seats } = mockSeats(plan, today);
  const takenBy = new Map(taken.map((t) => [t.seatNo, t]));
  const femaleBooked = new Set(
    seats
      .filter((s) => (s.presold && s.presoldFemale) || takenBy.get(s.seatNo)?.female)
      .map((s) => s.seatNo),
  );
  const decks: BusDeckMap[] = layout.decks.map((deck) => ({
    deck: deck.deck,
    rows: deck.rows,
    cols: deck.cols,
    seats: seats
      .filter((s) => s.deck === deck.deck)
      .map((s): BusSeat => {
        const booked = s.presold || takenBy.has(s.seatNo);
        return {
          seatNo: s.seatNo,
          row: s.row,
          col: s.col,
          type: s.type,
          price: s.price,
          status: booked ? (s.presold ? 'BOOKED' : 'HELD') : 'AVAILABLE',
          ladiesOnly:
            s.ladiesOnly ||
            (!booked && adjacentSeats(layout, s.seatNo).some((n) => femaleBooked.has(n))),
          bookedByFemale: femaleBooked.has(s.seatNo),
          width: s.width,
          height: s.height,
        };
      }),
  }));
  return { layout: layout.layout, decks, seats };
}

// ───────────────────────────── Public API ─────────────────────────────

function summary(plan: TripPlan, today: string, taken: readonly LiveHold[]): BusTripSummary {
  const { decks } = busSeatDecks(plan, today, taken);
  const open = decks.flatMap((d) => d.seats).filter((s) => s.status === 'AVAILABLE');
  const { boarding, dropping } = points(plan);
  return {
    tripId: plan.tripId,
    serviceNumber: `${plan.operator.code} ${pad(Math.floor(plan.departureMinutes / 60))}${pad(plan.departureMinutes % 60)}`,
    operator: plan.operator,
    busType: plan.coach.info,
    from: { code: plan.from, name: cityName(plan.from) },
    to: { code: plan.to, name: cityName(plan.to) },
    date: plan.date,
    departure: istIso(plan.date, plan.departureMinutes),
    arrival: istIso(plan.date, plan.departureMinutes + plan.durationMin),
    durationMin: plan.durationMin,
    fromPrice: open.length > 0 ? Math.min(...open.map((s) => s.price)) : 0,
    seatsLeft: open.length,
    amenities: plan.coach.amenities,
    boardingCount: boarding.length,
    droppingCount: dropping.length,
    liveTracking: plan.coach.amenities.includes('tracking'),
    cancellable: true,
    photos: BUS_PHOTOS.length,
  };
}

export interface BusClock {
  /** Current instant (the API's clock; tests can move it) */
  now: Date;
}

/** IST calendar date of an instant. */
export function istDate(now: Date): string {
  return new Date(now.getTime() + 330 * 60_000).toISOString().slice(0, 10);
}

function minutesUntil(plan: TripPlan, now: Date): number {
  return (Date.parse(istIso(plan.date, plan.departureMinutes)) - now.getTime()) / 60_000;
}

/** Trips on a route and day that still sell (departing in more than 30 minutes). */
export function busTripPlans(from: string, to: string, date: string, now: Date): TripPlan[] {
  return Array.from({ length: busTripCount(from, to, date) }, (_, i) => planTrip(from, to, date, i))
    .filter((p): p is TripPlan => p !== null && minutesUntil(p, now) > BUS_SALES_CUTOFF_MINUTES)
    .sort((a, b) => a.departureMinutes - b.departureMinutes);
}

export function busTripPlan(tripId: string): TripPlan | null {
  const parsed = parseBusTripId(tripId);
  return parsed && planTrip(parsed.from, parsed.to, parsed.date, parsed.index);
}

export function busTripSummary(
  plan: TripPlan,
  now: Date,
  taken: readonly LiveHold[] = [],
): BusTripSummary {
  return summary(plan, istDate(now), taken);
}

export function busTripDetails(
  plan: TripPlan,
  now: Date,
  taken: readonly LiveHold[] = [],
): BusTripDetails {
  const base = summary(plan, istDate(now), taken);
  const { boarding, dropping } = points(plan);
  return {
    ...base,
    photos: BUS_PHOTOS.map((p) => ({ ...p })),
    distanceKm: plan.km,
    boardingPoints: boarding,
    droppingPoints: dropping,
    cancellationPolicy: BUS_CANCELLATION_POLICY.map((r) => ({ ...r })),
    restStops: restStops(plan),
    policies: {
      luggage:
        'Two pieces up to 15 kg in total travel free; extra luggage is charged by the operator.',
      pets: 'Pets are not allowed on board.',
      idProof:
        'Carry a government photo ID; the operator may check it against the traveller names.',
    },
    bookable: minutesUntil(plan, now) > BUS_SALES_CUTOFF_MINUTES,
  };
}

/** Seat-level detail for the book step (prices and statuses). */
export function busSeatsFor(plan: TripPlan, now: Date, taken: readonly LiveHold[] = []) {
  return busSeatDecks(plan, istDate(now), taken);
}

/** Exposed for tests: plan an arbitrary trip index (may be beyond the day's count). */
export const _planTrip = planTrip;
export type BusTripPlan = TripPlan;

/** The filter facets of a search result: operators with trip counts, and the price range. */
export function busSearchFilters(trips: readonly BusTripSummary[]): BusSearchResponse['filters'] {
  const operators = new Map<string, number>();
  for (const t of trips) operators.set(t.operator.name, (operators.get(t.operator.name) ?? 0) + 1);
  const prices = trips.map((t) => t.fromPrice);
  return {
    operators: [...operators]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    priceMin: prices.length > 0 ? Math.min(...prices) : 0,
    priceMax: prices.length > 0 ? Math.max(...prices) : 0,
  };
}
