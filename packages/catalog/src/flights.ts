import { airportTimezone, findAirport } from '@zproo/config';
import type {
  CabinClass,
  FareFamily,
  FareFamilyName,
  FlightCarrier,
  FlightLayover,
  FlightOfferDetails,
  FlightOfferSummary,
  FlightSegment,
  FlightSlice,
  PassengerType,
  PaxCounts,
  PaxFare,
} from '@zproo/types';
import { unitHash } from './hash';
import { daysBetweenIso, isoWeekday, toLocalIso, zonedTimeToUtc } from './time';

/*
 * Deterministic development flight supplier, shared by the API's mock provider and the static
 * website. The same (from, to, date, cabin) always gives the same 15–30 itineraries, schedules
 * and fares. Airlines are fictional on purpose: invented schedules and fares must never appear
 * under a real airline's name.
 */

export interface MockAirline extends FlightCarrier {
  /** Full-service carriers include meals in every fare */
  fullService: boolean;
  /** Three-digit prefix of e-ticket numbers */
  ticketPrefix: string;
  /** Helpline printed on e-tickets */
  phone: string;
}

export const MOCK_AIRLINES: readonly MockAirline[] = [
  {
    code: 'SF',
    name: 'Saffron Air',
    fullService: true,
    ticketPrefix: '981',
    phone: '+91 22 4000 2001',
  },
  {
    code: 'MN',
    name: 'Monsoon Airways',
    fullService: false,
    ticketPrefix: '982',
    phone: '+91 22 4000 2002',
  },
  {
    code: 'DB',
    name: 'Deccan Blue',
    fullService: false,
    ticketPrefix: '983',
    phone: '+91 80 4000 2003',
  },
  {
    code: 'CW',
    name: 'Coral Wings',
    fullService: false,
    ticketPrefix: '984',
    phone: '+91 44 4000 2004',
  },
  {
    code: 'HM',
    name: 'Himalaya Air',
    fullService: true,
    ticketPrefix: '985',
    phone: '+91 11 4000 2005',
  },
  {
    code: 'GS',
    name: 'Gulf Star',
    fullService: true,
    ticketPrefix: '986',
    phone: '+971 4 400 2006',
  },
];
const DOMESTIC = MOCK_AIRLINES.filter((a) => a.code !== 'GS');
export const findMockAirline = (code: string) => MOCK_AIRLINES.find((a) => a.code === code);

/** [from, to, economy base fare in rupees, block time in minutes] — flown in both directions. */
export const FLIGHT_ROUTES: readonly [string, string, number, number][] = [
  ['PNQ', 'DEL', 3900, 140],
  ['BOM', 'GOI', 2300, 75],
  ['BLR', 'DEL', 4500, 170],
  ['DEL', 'SXR', 3200, 90],
  ['HYD', 'COK', 2900, 100],
  ['BOM', 'DXB', 9800, 190],
  ['PNQ', 'BLR', 3000, 100],
  ['BOM', 'DEL', 4200, 135],
  ['PNQ', 'GOI', 2600, 60],
  ['DEL', 'GOI', 5200, 155],
  ['BLR', 'HYD', 2500, 75],
  ['MAA', 'DEL', 5100, 170],
  ['CCU', 'DEL', 4600, 135],
  ['DEL', 'DXB', 11500, 225],
  ['PNQ', 'HYD', 2800, 85],
  ['BOM', 'BLR', 3400, 105],
  ['DEL', 'JAI', 2100, 60],
  ['BOM', 'COK', 3800, 120],
  ['BLR', 'COK', 2400, 70],
  ['PNQ', 'BOM', 1900, 45],
  ['BOM', 'HYD', 3000, 85],
  ['BOM', 'MAA', 3600, 115],
  ['BOM', 'CCU', 5000, 165],
  ['BLR', 'MAA', 2200, 55],
  ['HYD', 'DEL', 4400, 135],
  ['PNQ', 'NAG', 2900, 90],
  ['BOM', 'NAG', 3100, 85],
  ['DEL', 'NAG', 4100, 110],
  ['BLR', 'NAG', 3500, 110],
  ['BOM', 'IXU', 2400, 55],
  ['DEL', 'IXU', 4300, 125],
  ['BOM', 'KLH', 2200, 55],
  ['BLR', 'KLH', 2600, 75],
  ['HYD', 'SAG', 2600, 75],
  ['DEL', 'SAG', 4600, 130],
  ['DEL', 'ISK', 4200, 120],
  ['HYD', 'NDC', 2400, 65],
  ['BOM', 'SDW', 2300, 60],
  ['NMI', 'DEL', 4300, 135],
  ['NMI', 'BLR', 3400, 105],
  ['NMI', 'GOI', 2300, 70],
  ['PNQ', 'AMD', 3200, 85],
  ['PNQ', 'MAA', 3400, 105],
  ['PNQ', 'CCU', 5200, 150],
  ['PNQ', 'JAI', 3900, 115],
];

const ROUTE_INDEX = new Map(
  FLIGHT_ROUTES.flatMap(([a, b, fare, minutes]) => [
    [`${a}-${b}`, { fare, minutes }],
    [`${b}-${a}`, { fare, minutes }],
  ]),
);
export const flightRoute = (from: string, to: string) => ROUTE_INDEX.get(`${from}-${to}`) ?? null;

/** Airports with flights (for the airport picker). */
export const FLIGHT_AIRPORT_CODES: ReadonlySet<string> = new Set(
  FLIGHT_ROUTES.flatMap(([a, b]) => [a, b]),
);

const HUBS = ['DEL', 'BOM', 'BLR', 'HYD', 'MAA', 'CCU'];

/** Hubs a one-stop journey can connect through. */
export function connectionHubs(from: string, to: string): string[] {
  return HUBS.filter((h) => h !== from && h !== to && flightRoute(from, h) && flightRoute(h, to));
}

export const isInternationalAirport = (code: string) => findAirport(code)?.country !== 'India';

/** Terminals per airport (the rest have one). */
const TERMINALS: Record<string, string[]> = {
  DEL: ['1', '2', '3'],
  BOM: ['1', '2'],
  BLR: ['1', '2'],
  MAA: ['1', '4'],
  DXB: ['1', '3'],
};
const terminal = (airport: string, salt: string) => {
  const list = TERMINALS[airport] ?? ['1'];
  return list[Math.floor(unitHash(salt) * list.length)] as string;
};

export const CABIN_CODE: Record<CabinClass, string> = {
  ECONOMY: 'E',
  PREMIUM_ECONOMY: 'W',
  BUSINESS: 'B',
  FIRST: 'F',
};
const CABIN_FROM_CODE: Record<string, CabinClass> = {
  E: 'ECONOMY',
  W: 'PREMIUM_ECONOMY',
  B: 'BUSINESS',
  F: 'FIRST',
};

/** Offers are valid for 20 minutes after the search. */
export const FLIGHT_OFFER_TTL_MINUTES = 20;
/** Seats are held for 15 minutes, or the airline's own time limit if shorter. */
export const FLIGHT_HOLD_MINUTES = 15;
/** Customer cancellations close this long before departure. */
export const FLIGHT_CANCEL_CUTOFF_HOURS = 3;
/** ZPROO GO's cancellation service fee, per booking. */
export const ZPROO_FLIGHT_CANCELLATION_FEE_PAISE = 30_000;

// ───────────────────────────── Offer ids ─────────────────────────────

/** Signs an offer id payload. The API passes an HMAC with a server secret. */
export type OfferSigner = (payload: string) => string;

/** Static website signer: a checksum, not a secret (anything in the browser can be read). */
export const staticOfferSigner: OfferSigner = (payload) =>
  Math.floor(unitHash(`zproo-static:${payload}`) * 2 ** 32)
    .toString(16)
    .padStart(8, '0');

export interface OfferKey {
  from: string;
  to: string;
  date: string;
  cabin: CabinClass;
  pax: PaxCounts;
  index: number;
}

const OFFER_ID =
  /^off_([A-Z]{3})([A-Z]{3})_(\d{4})(\d{2})(\d{2})_([EWBF])_(\d)(\d)(\d)_(\d{2})_([0-9a-z]{6,10})_([0-9a-f]{8,16})$/;
const pad2 = (n: number) => String(n).padStart(2, '0');

/** The itinerary (without passengers or issue time): what seat holds are counted against. */
export const itineraryKey = (k: Omit<OfferKey, 'pax'>) =>
  `${k.from}${k.to}_${k.date.replaceAll('-', '')}_${CABIN_CODE[k.cabin]}_${pad2(k.index)}`;

export function flightOfferId(key: OfferKey, issuedAtMs: number, sign: OfferSigner): string {
  const payload = `off_${itineraryKey(key).replace(/_(\d{2})$/, '')}_${key.pax.adults}${key.pax.children}${key.pax.infants}_${pad2(key.index)}_${Math.floor(issuedAtMs / 1000).toString(36)}`;
  return `${payload}_${sign(payload)}`;
}

/** Parses and checks an offer id; null when malformed or not signed by `sign`. */
export function parseFlightOfferId(
  offerId: string,
  sign: OfferSigner,
): (OfferKey & { issuedAtMs: number; expiresAtMs: number }) | null {
  const m = OFFER_ID.exec(offerId);
  if (!m) return null;
  const payload = offerId.slice(0, offerId.lastIndexOf('_'));
  if (sign(payload) !== m[12]) return null;
  const issuedAtMs = parseInt(m[11] as string, 36) * 1000;
  return {
    from: m[1] as string,
    to: m[2] as string,
    date: `${m[3]}-${m[4]}-${m[5]}`,
    cabin: CABIN_FROM_CODE[m[6] as string] as CabinClass,
    pax: { adults: Number(m[7]), children: Number(m[8]), infants: Number(m[9]) },
    index: Number(m[10]),
    issuedAtMs,
    expiresAtMs: issuedAtMs + FLIGHT_OFFER_TTL_MINUTES * 60_000,
  };
}

// ───────────────────────────── Itineraries ─────────────────────────────

interface SegmentPlan {
  airline: MockAirline;
  flightNo: string;
  from: string;
  to: string;
  departureMs: number;
  durationMin: number;
  aircraft: string;
  terminalFrom: string;
  terminalTo: string;
}

export interface FlightPlan {
  key: Omit<OfferKey, 'pax'>;
  itineraryKey: string;
  airline: MockAirline;
  segments: SegmentPlan[];
  /** Seats the airline still sells (before holds made through ZPROO GO) */
  seats: number;
  /** Economy base fare per adult, in paise, before cabin and demand */
  baseFarePaise: number;
  international: boolean;
  /** The airline's own hold limit, in minutes */
  airlineTimeLimitMin: number;
}

/** 15–30 itineraries when the route is flown (directly or via a hub), otherwise none. */
export function flightItineraryCount(
  from: string,
  to: string,
  date: string,
  cabin: CabinClass,
): number {
  if (!flightRoute(from, to) && connectionHubs(from, to).length === 0) return 0;
  return 15 + Math.floor(unitHash(`fl-count:${from}:${to}:${date}:${cabin}`) * 16);
}

function aircraftFor(minutes: number, h: number): string {
  if (minutes <= 70) return h < 0.4 ? 'ATR 72-600' : 'A320neo';
  if (minutes >= 200) return h < 0.5 ? 'A321neo' : 'B787-8';
  return ['A320neo', 'A321neo', 'B737-8'][Math.floor(h * 3)] as string;
}

function segment(
  airline: MockAirline,
  from: string,
  to: string,
  departureMs: number,
  salt: string,
): SegmentPlan {
  const route = flightRoute(from, to);
  const minutes = (route?.minutes ?? 120) + Math.floor(unitHash(`${salt}:dur`) * 4) * 5;
  const number = 100 + Math.floor(unitHash(`${airline.code}:${from}:${to}:${salt}:no`) * 8800);
  return {
    airline,
    flightNo: `${airline.code} ${number}`,
    from,
    to,
    departureMs,
    durationMin: minutes,
    aircraft: aircraftFor(minutes, unitHash(`${salt}:ac`)),
    terminalFrom: terminal(from, `${salt}:tf`),
    terminalTo: terminal(to, `${salt}:tt`),
  };
}

/** One itinerary (0 ≤ index < count), or null when out of range. */
export function flightPlan(key: Omit<OfferKey, 'pax'>): FlightPlan | null {
  const { from, to, date, cabin, index } = key;
  if (index < 0 || index >= flightItineraryCount(from, to, date, cabin)) return null;
  const salt = `fl:${from}:${to}:${date}:${cabin}:${index}`;
  const h = (k: string) => unitHash(`${salt}:${k}`);
  const direct = flightRoute(from, to);
  const hubs = connectionHubs(from, to);
  const nonStop = direct && (hubs.length === 0 || h('stops') < 0.6);
  const international = isInternationalAirport(from) || isInternationalAirport(to);
  const pool = international
    ? [...DOMESTIC.filter((a) => a.fullService), MOCK_AIRLINES[5] as MockAirline]
    : DOMESTIC;
  const airline = pool[Math.floor(h('airline') * pool.length)] as MockAirline;
  // 05:00–23:30 local at the origin, every 5 minutes.
  const depMinutes = 300 + Math.floor(h('dep') * 223) * 5;
  const depTime = `${pad2(Math.floor(depMinutes / 60))}:${pad2(depMinutes % 60)}`;
  const departureMs = zonedTimeToUtc(date, depTime, tzOf(from)).getTime();

  let segments: SegmentPlan[];
  let baseFareRupees: number;
  if (nonStop && direct) {
    segments = [segment(airline, from, to, departureMs, salt)];
    baseFareRupees = direct.fare;
  } else {
    const hub = hubs[Math.floor(h('hub') * hubs.length)] as string;
    const first = segment(airline, from, hub, departureMs, `${salt}:1`);
    const layover = 45 + Math.floor(h('layover') * 64) * 5; // 45 min – 6 h
    // Some connections are sold as two separate tickets on different airlines (self-transfer).
    const selfTransfer = !international && h('self') < 0.15;
    const second = selfTransfer
      ? (DOMESTIC.filter((a) => a.code !== airline.code)[Math.floor(h('a2') * 4)] as MockAirline)
      : airline;
    const secondDep = departureMs + (first.durationMin + layover) * 60_000;
    segments = [first, segment(second, hub, to, secondDep, `${salt}:2`)];
    baseFareRupees =
      ((flightRoute(from, hub)?.fare ?? 3000) + (flightRoute(hub, to)?.fare ?? 3000)) * 0.72;
  }
  return {
    key,
    itineraryKey: itineraryKey(key),
    airline,
    segments,
    seats: 1 + Math.floor(h('seats') * 9),
    baseFarePaise: Math.round(baseFareRupees * (0.9 + h('fare') * 0.25)) * 100,
    international,
    airlineTimeLimitMin: h('ttl') < 0.25 ? 10 : 30,
  };
}

export function flightPlans(
  from: string,
  to: string,
  date: string,
  cabin: CabinClass,
): FlightPlan[] {
  const count = flightItineraryCount(from, to, date, cabin);
  return Array.from({ length: count }, (_, index) => flightPlan({ from, to, date, cabin, index }))
    .filter((p): p is FlightPlan => p !== null)
    .sort((a, b) => (a.segments[0]?.departureMs ?? 0) - (b.segments[0]?.departureMs ?? 0));
}

function tzOf(code: string) {
  const airport = findAirport(code);
  return airport ? airportTimezone(airport) : 'Asia/Kolkata';
}

function localDayOf(instant: number, code: string) {
  return toLocalIso(instant, tzOf(code)).slice(0, 10);
}

export function planSlice(plan: FlightPlan): FlightSlice {
  const segments: FlightSegment[] = plan.segments.map((s) => {
    const arrivalMs = s.departureMs + s.durationMin * 60_000;
    return {
      carrier: { code: s.airline.code, name: s.airline.name },
      flightNo: s.flightNo,
      from: s.from,
      to: s.to,
      departure: toLocalIso(s.departureMs, tzOf(s.from)),
      arrival: toLocalIso(arrivalMs, tzOf(s.to)),
      durationMin: s.durationMin,
      aircraft: s.aircraft,
      terminalFrom: s.terminalFrom,
      terminalTo: s.terminalTo,
    };
  });
  const layovers: FlightLayover[] = plan.segments.slice(1).map((next, i) => {
    const prev = plan.segments[i] as SegmentPlan;
    const arrivedMs = prev.departureMs + prev.durationMin * 60_000;
    return {
      airport: next.from,
      durationMin: Math.round((next.departureMs - arrivedMs) / 60_000),
      changeOfTerminal: prev.terminalTo !== next.terminalFrom,
      selfTransfer: prev.airline.code !== next.airline.code,
      overnight: localDayOf(arrivedMs, next.from) !== localDayOf(next.departureMs, next.from),
    };
  });
  const first = plan.segments[0] as SegmentPlan;
  const last = plan.segments.at(-1) as SegmentPlan;
  return {
    segments,
    stops: plan.segments.length - 1,
    layovers,
    durationMin: Math.round(
      (last.departureMs + last.durationMin * 60_000 - first.departureMs) / 60_000,
    ),
  };
}

// ───────────────────────────── Fares ─────────────────────────────

const CABIN_MULTIPLIER: Record<CabinClass, number> = {
  ECONOMY: 1,
  PREMIUM_ECONOMY: 1.7,
  BUSINESS: 3.4,
  FIRST: 5.5,
};

function demandFactor(daysAhead: number): number {
  if (daysAhead <= 2) return 1.5;
  if (daysAhead <= 6) return 1.3;
  if (daysAhead <= 13) return 1.12;
  if (daysAhead <= 30) return 1;
  return 0.92;
}

/** Nearest ₹100, minus ₹1 (₹3,899); at least ₹1,499. */
const roundFare = (paise: number) => Math.max(149_900, Math.round(paise / 10_000) * 10_000 - 100);
const roundRupee = (paise: number) => Math.round(paise / 100) * 100;

const FAMILIES: { name: FareFamilyName; slug: string; factor: number }[] = [
  { name: 'Saver', slug: 'saver', factor: 1 },
  { name: 'Flexi', slug: 'flexi', factor: 1.12 },
  { name: 'Super Flexi', slug: 'superflexi', factor: 1.28 },
];

const fareScope = (plan: FlightPlan) =>
  Math.floor(unitHash(`fare-scope:${plan.itineraryKey}`) * 0xffffff)
    .toString(16)
    .padStart(6, '0');

/** fare_<offer scope>_<family>: a fareId only fits the itinerary it was issued for. */
export const fareIdFor = (plan: FlightPlan, slug: string) => `fare_${fareScope(plan)}_${slug}`;

/** Fare families for an itinerary, priced for `pax` (`today` is the seller's local date). */
export function fareFamiliesFor(
  plan: FlightPlan,
  pax: PaxCounts,
  today: string,
  bumpPaise = 0,
): FareFamily[] {
  const { cabin, date } = plan.key;
  const daysAhead = Math.max(0, daysBetweenIso(today, date));
  const weekday = isoWeekday(date);
  const weekend = weekday === 5 || weekday === 7 ? 1.08 : 1;
  const saverBase =
    plan.baseFarePaise * CABIN_MULTIPLIER[cabin] * demandFactor(daysAhead) * weekend;
  const gstRate = cabin === 'ECONOMY' ? 0.05 : 0.12;
  const airportFees = (plan.international ? 240_000 : 65_000) + (plan.segments.length - 1) * 20_000;
  const premiumCabin = cabin === 'BUSINESS' || cabin === 'FIRST';
  const lowCost = !plan.airline.fullService;

  return FAMILIES.map((family, i): FareFamily => {
    const adultBase = roundFare(saverBase * family.factor) + (i === 0 ? bumpPaise : 0);
    const paxFare = (base: number, fees: number): PaxFare => {
      const taxes = roundRupee(base * gstRate);
      return { base, taxes, fees, total: base + taxes + fees };
    };
    const perPax: Record<PassengerType, PaxFare> = {
      ADULT: paxFare(adultBase, airportFees),
      CHILD: paxFare(roundFare(adultBase * 0.75), airportFees),
      INFANT: paxFare(plan.international ? 400_000 : 150_000, 0),
    };
    const cancellationFee =
      i === 0
        ? lowCost
          ? null
          : plan.international
            ? 600_000
            : 350_000
        : i === 1
          ? plan.international
            ? 400_000
            : 250_000
          : 0;
    const total =
      perPax.ADULT.total * pax.adults +
      perPax.CHILD.total * pax.children +
      perPax.INFANT.total * pax.infants;
    return {
      fareId: fareIdFor(plan, family.slug),
      name: family.name,
      price: perPax.ADULT.total,
      total,
      perPax,
      cabinBaggageKg: premiumCabin ? 12 : 7,
      checkinBaggageKg: premiumCabin ? 35 : (plan.international ? 20 : 15) + i * 5,
      changeFee: i === 0 ? 300_000 : i === 1 ? 100_000 : 0,
      cancellationFee,
      refundable: cancellationFee !== null,
      meal: i === 2 || plan.airline.fullService || premiumCabin ? 'INCLUDED' : 'PAID',
      seatSelection: i === 0 && !premiumCabin ? 'PAID' : 'FREE',
      priority: i === 2 || premiumCabin,
      mostPopular: i === 1,
    };
  });
}

export function fareRulesFor(plan: FlightPlan): string[] {
  return [
    'Fares are per traveller and include GST and airport fees. Infants travel on an adult’s lap.',
    'Changes: the change fee shown for your fare, plus any fare difference, up to 3 hours before departure.',
    'Cancellation: the airline cancellation fee shown for your fare and a ZPROO GO service fee of ₹300 per booking are deducted; cancellation closes 3 hours before departure.',
    'Non-refundable fares: only statutory taxes and airport fees are refunded.',
    'Names must match the government photo ID each traveller carries. Name changes are not allowed.',
    plan.international
      ? 'International travel needs a passport valid for 6 months and any required visa.'
      : 'Web check-in opens 48 hours and closes 60 minutes before departure.',
  ];
}

// ───────────────────────────── Offers ─────────────────────────────

export interface OfferContext {
  pax: PaxCounts;
  /** Seats held through ZPROO GO for this itinerary */
  heldSeats: number;
  issuedAtMs: number;
  sign: OfferSigner;
  /** The seller's local date (IST), for demand pricing */
  today: string;
  /** price_changed scenario: added to the Saver fare */
  bumpPaise?: number;
}

export const seatsNeeded = (pax: PaxCounts) => pax.adults + pax.children;

export function flightOfferSummary(plan: FlightPlan, ctx: OfferContext): FlightOfferSummary {
  const fares = fareFamiliesFor(plan, ctx.pax, ctx.today, ctx.bumpPaise);
  const saver = fares[0] as FareFamily;
  return {
    offerId: flightOfferId({ ...plan.key, pax: ctx.pax }, ctx.issuedAtMs, ctx.sign),
    expiresAt: new Date(ctx.issuedAtMs + FLIGHT_OFFER_TTL_MINUTES * 60_000).toISOString(),
    carrier: { code: plan.airline.code, name: plan.airline.name },
    slices: [planSlice(plan)],
    cabin: plan.key.cabin,
    fromPrice: saver.price,
    currency: 'INR',
    refundable: saver.refundable,
    mealIncluded: saver.meal === 'INCLUDED',
    seatsLeft: Math.max(0, plan.seats - ctx.heldSeats),
  };
}

export function flightOfferDetails(
  plan: FlightPlan,
  ctx: OfferContext & { serverNow: string; replacesOfferId: string | null },
): FlightOfferDetails {
  return {
    ...flightOfferSummary(plan, ctx),
    pax: ctx.pax,
    fareFamilies: fareFamiliesFor(plan, ctx.pax, ctx.today, ctx.bumpPaise),
    fareRules: fareRulesFor(plan),
    serverNow: ctx.serverNow,
    replacesOfferId: ctx.replacesOfferId,
  };
}

/** Lowest per-adult price per airline and the overall range, for result filters. */
export function flightSearchFilters(offers: readonly FlightOfferSummary[]) {
  const airlines = new Map<
    string,
    { code: string; name: string; count: number; minPrice: number }
  >();
  for (const o of offers) {
    for (const code of new Set(o.slices.flatMap((s) => s.segments.map((x) => x.carrier.code)))) {
      const carrier = o.slices
        .flatMap((s) => s.segments)
        .find((x) => x.carrier.code === code)?.carrier;
      const entry = airlines.get(code) ?? {
        code,
        name: carrier?.name ?? code,
        count: 0,
        minPrice: o.fromPrice,
      };
      entry.count += 1;
      entry.minPrice = Math.min(entry.minPrice, o.fromPrice);
      airlines.set(code, entry);
    }
  }
  const prices = offers.map((o) => o.fromPrice);
  return {
    airlines: [...airlines.values()].sort((a, b) => a.name.localeCompare(b.name)),
    priceMin: prices.length ? Math.min(...prices) : 0,
    priceMax: prices.length ? Math.max(...prices) : 0,
  };
}

/**
 * Refund for cancelling a flight booking: what was paid, minus each traveller's airline
 * cancellation fee (non-refundable fares keep only taxes and fees refundable) and ZPROO GO's
 * service fee. Never negative.
 */
export function flightRefund(
  legs: readonly { fare: FareFamily }[],
  pax: PaxCounts,
  paidPaise: number,
): number {
  let deductions = ZPROO_FLIGHT_CANCELLATION_FEE_PAISE;
  for (const { fare } of legs) {
    const travellers: [PassengerType, number][] = [
      ['ADULT', pax.adults],
      ['CHILD', pax.children],
      ['INFANT', pax.infants],
    ];
    for (const [type, n] of travellers) {
      const f = fare.perPax[type];
      const fee = fare.cancellationFee === null ? f.base : Math.min(f.base, fare.cancellationFee);
      deductions += fee * n;
    }
  }
  return Math.max(0, paidPaise - deductions);
}
