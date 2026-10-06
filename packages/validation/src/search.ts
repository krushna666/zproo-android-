import { findAirport, findCity, findStation } from '@zproo/config';
import { CabinClass, TrainClass } from '@zproo/types';
import { z } from 'zod';
import { isoDateSchema } from './common';

/** Today's date as YYYY-MM-DD in the user's local time zone (dates are travel dates, not instants). */
export function todayIso(now: Date = new Date()): string {
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** Bookings open up to a year ahead (typical for airlines and hotels). */
const MAX_DAYS_AHEAD = 365;

const travelDate = (label: string) =>
  isoDateSchema
    .refine((d) => d >= todayIso(), `${label} can't be in the past`)
    .refine((d) => daysBetween(todayIso(), d) <= MAX_DAYS_AHEAD, `${label} must be within a year`);

const count = (min: number, max: number) => z.coerce.number().int().min(min).max(max);

/** A city code (or, for older links, a city slug), normalised to the 3-letter code. */
const cityCode = z
  .string()
  .trim()
  .min(1, 'Choose a city')
  .transform((value, ctx) => {
    const city = findCity(value);
    if (!city) {
      ctx.addIssue({ code: 'custom', message: 'Choose a city' });
      return z.NEVER;
    }
    return city.code;
  });
const stationCode = z
  .string()
  .trim()
  .toUpperCase()
  .refine((code) => Boolean(findStation(code)), 'Choose a station from the list');

// ───────────────────────────── Flights ─────────────────────────────

/** Flights open 330 days ahead (airline schedules). */
export const FLIGHT_MAX_DAYS_AHEAD = 330;

export const FLIGHT_SEARCH_MESSAGES = {
  airport: 'Choose an airport',
  sameAirport: 'Choose different airports for From and To',
  dateWindow: `Choose a date within the next ${FLIGHT_MAX_DAYS_AHEAD} days`,
  returnDate: 'Return date must be on or after the departure date',
  maxTravellers: 'You can book up to 9 travellers at a time',
  infants: 'Each infant must travel with an adult',
  adults: 'Add at least one adult',
} as const;

/** An IATA code of a known airport (any case in, upper case out). */
const iata = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, FLIGHT_SEARCH_MESSAGES.airport)
  .refine((code) => Boolean(findAirport(code)), FLIGHT_SEARCH_MESSAGES.airport);

/**
 * Passenger counts with the airline rules (shared by the search widget, the results URL and the
 * API): 1–9 adults, 0–8 children (2–11), 0–4 infants (under 2); adults + children ≤ 9; one infant
 * per adult.
 */
export const flightPaxSchema = z
  .object({
    adults: z.coerce.number().int().min(0).max(9),
    children: z.coerce.number().int().min(0).max(8),
    infants: z.coerce.number().int().min(0).max(4),
  })
  .superRefine((p, ctx) => {
    if (p.adults < 1)
      ctx.addIssue({ code: 'custom', path: ['adults'], message: FLIGHT_SEARCH_MESSAGES.adults });
    if (p.adults + p.children > 9)
      ctx.addIssue({
        code: 'custom',
        path: ['children'],
        message: FLIGHT_SEARCH_MESSAGES.maxTravellers,
      });
    if (p.infants > p.adults)
      ctx.addIssue({ code: 'custom', path: ['infants'], message: FLIGHT_SEARCH_MESSAGES.infants });
  });

/** Flight search (one-way or round trip), validated against `now` ("today" is IST). */
export function flightSearchSchemaAt(now: () => Date = () => new Date()) {
  const inWindow = (d: string) => {
    const today = todayInIst(now());
    return d >= today && daysBetween(today, d) <= FLIGHT_MAX_DAYS_AHEAD;
  };
  return z
    .strictObject({
      from: iata,
      to: iata,
      date: isoDateSchema.refine(inWindow, FLIGHT_SEARCH_MESSAGES.dateWindow),
      returnDate: z
        .union([z.literal('').transform(() => undefined), isoDateSchema])
        .optional()
        .refine((d) => d === undefined || inWindow(d), FLIGHT_SEARCH_MESSAGES.dateWindow),
      adults: z.coerce.number().int().min(0).max(9).default(1),
      children: z.coerce.number().int().min(0).max(8).default(0),
      infants: z.coerce.number().int().min(0).max(4).default(0),
      cabin: z.enum(Object.values(CabinClass) as [CabinClass, ...CabinClass[]]).default('ECONOMY'),
    })
    .superRefine((s, ctx) => {
      if (s.from === s.to)
        ctx.addIssue({ code: 'custom', path: ['to'], message: FLIGHT_SEARCH_MESSAGES.sameAirport });
      if (s.returnDate !== undefined && s.returnDate < s.date)
        ctx.addIssue({
          code: 'custom',
          path: ['returnDate'],
          message: FLIGHT_SEARCH_MESSAGES.returnDate,
        });
      const pax = flightPaxSchema.safeParse(s);
      if (!pax.success)
        for (const issue of pax.error.issues) ctx.addIssue({ ...issue, code: 'custom' });
    });
}
export const flightSearchSchema = flightSearchSchemaAt();
export type FlightSearch = z.output<typeof flightSearchSchema>;

// ───────────────────────────── Ground transport ─────────────────────────────

/** Today's date in India (bus and hotel dates are IST calendar dates). */
export function todayInIst(now: Date = new Date()): string {
  return new Date(now.getTime() + 330 * 60_000).toISOString().slice(0, 10);
}

/** Bus bookings open 120 days ahead. */
export const BUS_MAX_DAYS_AHEAD = 120;
export const BUS_SEARCH_MESSAGES = {
  sameCity: 'Choose different cities for From and To',
  dateWindow: `Choose a date within the next ${BUS_MAX_DAYS_AHEAD} days`,
} as const;

/** `now` is injectable so the API can use its (testable) clock. */
export function busSearchSchemaAt(now: () => Date = () => new Date()) {
  return z
    .strictObject({
      from: cityCode,
      to: cityCode,
      date: isoDateSchema.refine((d) => {
        const today = todayInIst(now());
        return d >= today && daysBetween(today, d) <= BUS_MAX_DAYS_AHEAD;
      }, BUS_SEARCH_MESSAGES.dateWindow),
    })
    .refine((s) => s.from !== s.to, { path: ['to'], message: BUS_SEARCH_MESSAGES.sameCity });
}

export const busSearchSchema = busSearchSchemaAt();
export type BusSearch = z.output<typeof busSearchSchema>;

export const trainSearchSchema = z
  .object({
    from: stationCode,
    to: stationCode,
    date: travelDate('Travel date'),
    travelClass: z
      .enum([...(Object.values(TrainClass) as [TrainClass, ...TrainClass[]]), 'ALL'])
      .default('ALL'),
  })
  .refine((s) => s.from !== s.to, { path: ['to'], message: 'From and To must be different' });
export type TrainSearch = z.output<typeof trainSearchSchema>;

const place = (label: string) =>
  z
    .string()
    .trim()
    .min(3, `Enter a ${label}`)
    .max(200, `${label[0]?.toUpperCase()}${label.slice(1)} is too long`);

export const cabSearchSchema = z
  .object({
    pickup: place('pickup location'),
    drop: place('drop location'),
    when: z.enum(['NOW', 'LATER']).default('NOW'),
    date: travelDate('Pickup date').optional(),
    time: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM')
      .optional(),
  })
  .superRefine((s, ctx) => {
    if (s.when === 'LATER' && (!s.date || !s.time)) {
      ctx.addIssue({
        code: 'custom',
        path: [s.date ? 'time' : 'date'],
        message: 'Choose when to be picked up',
      });
    }
  });
export type CabSearch = z.output<typeof cabSearchSchema>;

export const bikeSearchSchema = z.object({
  pickup: place('pickup location'),
  drop: place('drop location'),
});
export type BikeSearch = z.output<typeof bikeSearchSchema>;

// ───────────────────────────── Stays & packages ─────────────────────────────

export const HOLIDAY_CATEGORIES = [
  'DOMESTIC',
  'INTERNATIONAL',
  'HONEYMOON',
  'FAMILY',
  'ADVENTURE',
  'LUXURY',
  'WEEKEND',
] as const;
export type HolidayCategory = (typeof HOLIDAY_CATEGORIES)[number];

export const holidaySearchSchema = z.object({
  destination: z.string().trim().max(80).optional(),
  month: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Choose a month')
    .refine((m) => m >= todayIso().slice(0, 7), "Month can't be in the past")
    .optional(),
  travellers: count(1, 20).default(2),
  category: z.enum(HOLIDAY_CATEGORIES).optional(),
});
export type HolidaySearch = z.output<typeof holidaySearchSchema>;

// ───────────────────────────── Parcel ─────────────────────────────

const pincode = (label: string) =>
  z
    .string()
    .trim()
    .regex(/^[1-9]\d{5}$/, `Enter a valid 6-digit ${label} PIN code`);

export const parcelQuoteSchema = z.object({
  fromPincode: pincode('pickup'),
  toPincode: pincode('delivery'),
  weightKg: z.coerce.number().positive('Enter the weight').max(50, 'Up to 50 kg per parcel'),
});
export type ParcelQuote = z.output<typeof parcelQuoteSchema>;

// ───────────────────────────── URL / query parsing ─────────────────────────────

/**
 * Links in prerendered pages (deals, popular routes) can't contain a date — it would be frozen at
 * build time — so they omit it and these defaults apply.
 */
export const DEFAULT_LEAD_DAYS = { flight: 14, bus: 1, train: 3, hotel: 7 } as const;

/** Raw flight search input from URL query parameters (results page and GET /api/flights/search). */
export function flightSearchInputFromParams(params: { get(name: string): string | null }) {
  const returnDate = params.get('returnDate');
  return {
    from: params.get('from') ?? '',
    to: params.get('to') ?? '',
    date: params.get('date') ?? addDays(todayInIst(), DEFAULT_LEAD_DAYS.flight),
    ...(returnDate ? { returnDate } : {}),
    adults: params.get('adults') ?? '1',
    children: params.get('children') ?? '0',
    infants: params.get('infants') ?? '0',
    cabin: params.get('cabin') ?? 'ECONOMY',
  };
}

/** Raw bus search input from URL query parameters (web results page and GET /api/buses/search). */
export function busSearchInputFromParams(params: { get(name: string): string | null }) {
  return {
    from: params.get('from') ?? '',
    to: params.get('to') ?? '',
    date: params.get('date') ?? addDays(todayInIst(), DEFAULT_LEAD_DAYS.bus),
  };
}
