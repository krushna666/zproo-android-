import { z } from 'zod';
import { emailSchema, indianMobileSchema, isoDateSchema } from './common';
import { MESSAGES } from './messages';

export const PASSENGER_TITLES = {
  ADULT: ['MR', 'MRS', 'MS'],
  CHILD: ['MSTR', 'MISS'],
  INFANT: ['MSTR', 'MISS'],
} as const;

/** Whole years between date of birth and a date (both YYYY-MM-DD). */
export function ageOn(dateOfBirth: string, onDate: string): number {
  const [by = 0, bm = 0, bd = 0] = dateOfBirth.split('-').map(Number);
  const [ty = 0, tm = 0, td = 0] = onDate.split('-').map(Number);
  return ty - by - (tm < bm || (tm === bm && td < bd) ? 1 : 0);
}

/** Airline age bands on the date of travel: infant under 2, child 2–11, adult 12+. */
export function passengerTypeForAge(age: number): 'ADULT' | 'CHILD' | 'INFANT' {
  if (age < 2) return 'INFANT';
  if (age < 12) return 'CHILD';
  return 'ADULT';
}

/** Contact for tickets: email and Indian mobile (both modules). */
export const travelContactSchema = z.strictObject({
  email: emailSchema,
  mobile: indianMobileSchema,
});
export type TravelContact = z.output<typeof travelContactSchema>;

export const FLIGHT_MESSAGES = {
  name: 'Enter the name as on your government ID',
  title: 'Choose a title',
  dob: 'Enter a valid date of birth',
  adultAge: 'An adult must be 12 or older on the travel date',
  childAge: 'A child must be 2–11 years old on the travel date',
  infantAge: 'An infant must be under 2 years old on the travel date',
  infantAdult: 'Each infant must travel with an adult',
  infantDistinct: 'Each infant must travel with a different adult',
  gstin: 'Enter a valid GSTIN',
  company: 'Enter the company name',
  passport: 'Enter a valid passport number',
  passportExpiry: 'The passport must be valid on the travel date',
  nationality: 'Choose a nationality',
  returnFare: 'Choose a fare for the return flight',
} as const;

const flightName = (min: number) =>
  z
    .string()
    .trim()
    .min(min, FLIGHT_MESSAGES.name)
    .max(32, FLIGHT_MESSAGES.name)
    .regex(/^[A-Za-z]+( [A-Za-z]+)*$/, FLIGHT_MESSAGES.name);

/** Passport details (international only); stored encrypted. */
export const passportSchema = z.strictObject({
  number: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{6,9}$/, FLIGHT_MESSAGES.passport),
  expiry: isoDateSchema,
  nationality: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/, FLIGHT_MESSAGES.nationality),
});

export const flightTravellerSchema = z
  .strictObject({
    type: z.enum(['ADULT', 'CHILD', 'INFANT']),
    title: z.enum(['MR', 'MRS', 'MS', 'MSTR', 'MISS'], { message: FLIGHT_MESSAGES.title }),
    firstName: flightName(1),
    lastName: flightName(2),
    dob: isoDateSchema.optional(),
    gender: z.enum(['MALE', 'FEMALE', 'OTHER']),
    /** Infants: index of the adult (in `travellers`) they sit with */
    infantOfIndex: z.number().int().min(0).max(12).optional(),
    passport: passportSchema.optional(),
  })
  .superRefine((t, ctx) => {
    if (!(PASSENGER_TITLES[t.type] as readonly string[]).includes(t.title))
      ctx.addIssue({ code: 'custom', path: ['title'], message: FLIGHT_MESSAGES.title });
    if (t.type !== 'ADULT' && !t.dob)
      ctx.addIssue({ code: 'custom', path: ['dob'], message: FLIGHT_MESSAGES.dob });
  });
export type FlightTravellerInput = z.output<typeof flightTravellerSchema>;

export const GSTIN_PATTERN = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

export const gstDetailsSchema = z.strictObject({
  gstin: z.string().trim().toUpperCase().regex(GSTIN_PATTERN, FLIGHT_MESSAGES.gstin),
  companyName: z.string().trim().min(2, FLIGHT_MESSAGES.company).max(100, FLIGHT_MESSAGES.company),
});

const offerIdSchema = z.string().regex(/^off_[A-Za-z0-9_]{20,80}$/, 'Invalid offer');
const fareIdSchema = z
  .string()
  .regex(/^fare_[0-9a-f]{6}_(saver|flexi|superflexi)$/, 'Invalid fare');

/**
 * Infant links: each infant names an adult (by index) and no adult carries two infants. Shared by
 * the traveller form and the API.
 */
export function infantLinkIssues(
  travellers: readonly { type: string; infantOfIndex?: number | undefined }[],
): { index: number; message: string }[] {
  const issues: { index: number; message: string }[] = [];
  const taken = new Set<number>();
  travellers.forEach((t, index) => {
    if (t.type !== 'INFANT') return;
    const adult = t.infantOfIndex;
    if (adult === undefined || travellers[adult]?.type !== 'ADULT') {
      issues.push({ index, message: FLIGHT_MESSAGES.infantAdult });
    } else if (taken.has(adult)) {
      issues.push({ index, message: FLIGHT_MESSAGES.infantDistinct });
    } else taken.add(adult);
  });
  return issues;
}

export const bookFlightSchema = z
  .strictObject({
    offerId: offerIdSchema,
    fareId: fareIdSchema,
    returnOfferId: offerIdSchema.optional(),
    returnFareId: fareIdSchema.optional(),
    travellers: z.array(flightTravellerSchema).min(1).max(13),
    contact: travelContactSchema,
    gstDetails: gstDetailsSchema.optional(),
    /** The total the customer saw; if the price moved, the API refuses with PRICE_CHANGED. */
    expectedTotal: z.number().int().positive(),
  })
  .superRefine((b, ctx) => {
    if (Boolean(b.returnOfferId) !== Boolean(b.returnFareId))
      ctx.addIssue({ code: 'custom', path: ['returnFareId'], message: FLIGHT_MESSAGES.returnFare });
    for (const issue of infantLinkIssues(b.travellers))
      ctx.addIssue({
        code: 'custom',
        path: ['travellers', issue.index, 'infantOfIndex'],
        message: issue.message,
      });
  });
export type BookFlightInput = z.output<typeof bookFlightSchema>;

/**
 * Age rules on the travel date (adult ≥ 12, child 2–11, infant under 2 and at least 7 days old;
 * no date of birth in the future). Adults may omit the date of birth on domestic flights.
 */
export function flightAgeIssues(
  travellers: readonly { type: 'ADULT' | 'CHILD' | 'INFANT'; dob?: string | undefined }[],
  travelDate: string,
  today: string,
): { index: number; message: string }[] {
  const issues: { index: number; message: string }[] = [];
  travellers.forEach((t, index) => {
    if (!t.dob) return;
    if (t.dob > today || t.dob > travelDate) {
      issues.push({ index, message: FLIGHT_MESSAGES.dob });
      return;
    }
    const age = ageOn(t.dob, travelDate);
    if (t.type === 'INFANT') {
      const days = Math.round((Date.parse(travelDate) - Date.parse(t.dob)) / 86_400_000);
      if (days < 7) issues.push({ index, message: FLIGHT_MESSAGES.dob });
      else if (age >= 2) issues.push({ index, message: FLIGHT_MESSAGES.infantAge });
    } else if (t.type === 'CHILD' && (age < 2 || age > 11)) {
      issues.push({ index, message: FLIGHT_MESSAGES.childAge });
    } else if (t.type === 'ADULT' && age < 12) {
      issues.push({ index, message: FLIGHT_MESSAGES.adultAge });
    }
  });
  return issues;
}

// ───────────────────────────── Buses ─────────────────────────────

export const MAX_BUS_SEATS = 6;

export const BUS_MESSAGES = {
  ladiesSeat: 'This seat is reserved for women',
  age: 'Enter a valid age',
  maxSeats: `You can select up to ${MAX_BUS_SEATS} seats`,
  boardingPoint: 'Choose a boarding point',
  droppingPoint: 'Choose a dropping point',
  closed: 'Booking for this bus has closed',
  seatOnce: 'Choose each seat once',
  travellerPerSeat: 'Add one traveller for each seat',
} as const;

/** Bus trip IDs from the supplier: `trp_<FROM>_<TO>_<YYYYMMDD>_<NN>`. */
export const busTripIdSchema = z
  .string()
  .regex(/^trp_[A-Z]{3}_[A-Z]{3}_\d{8}_\d{2}$/, 'Invalid trip');

export const busSeatNoSchema = z.string().regex(/^(L|U)?\d{1,2}$/, 'Invalid seat');

/** Traveller name on tickets: 2–60 letters, spaces and . ' - (SOP name messages). */
export const travellerFullNameSchema = z
  .string()
  .trim()
  .min(2, MESSAGES.name.tooShort)
  .max(60, MESSAGES.name.tooLong)
  .regex(/^[A-Za-z][A-Za-z .'-]*$/, MESSAGES.name.invalidCharacters);

export const busTravellerSchema = z.strictObject({
  seatNo: busSeatNoSchema,
  name: travellerFullNameSchema,
  age: z.coerce
    .number({ message: BUS_MESSAGES.age })
    .int(BUS_MESSAGES.age)
    .min(1, BUS_MESSAGES.age)
    .max(120, BUS_MESSAGES.age),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER']),
});
export type BusTravellerInput = z.output<typeof busTravellerSchema>;

/**
 * POST /buses/book. Strict: unknown keys (e.g. a price) are rejected. `expectedTotal` is only
 * compared with the server's price; the charged amount always comes from the server.
 */
export const bookBusSchema = z
  .strictObject({
    tripId: busTripIdSchema,
    seats: z
      .array(busSeatNoSchema)
      .min(1, 'Choose at least one seat')
      .max(MAX_BUS_SEATS, BUS_MESSAGES.maxSeats),
    boardingPointId: z.string().regex(/^bp_\d{1,2}$/, BUS_MESSAGES.boardingPoint),
    droppingPointId: z.string().regex(/^dp_\d{1,2}$/, BUS_MESSAGES.droppingPoint),
    travellers: z.array(busTravellerSchema).min(1).max(MAX_BUS_SEATS),
    contact: travelContactSchema,
    expectedTotal: z.number().int().positive(),
  })
  .superRefine((b, ctx) => {
    if (new Set(b.seats).size !== b.seats.length)
      ctx.addIssue({ code: 'custom', path: ['seats'], message: BUS_MESSAGES.seatOnce });
    if (b.travellers.length !== b.seats.length)
      ctx.addIssue({
        code: 'custom',
        path: ['travellers'],
        message: BUS_MESSAGES.travellerPerSeat,
      });
    const seen = new Set<string>();
    b.travellers.forEach((t, i) => {
      if (!b.seats.includes(t.seatNo) || seen.has(t.seatNo))
        ctx.addIssue({
          code: 'custom',
          path: ['travellers', i, 'seatNo'],
          message: BUS_MESSAGES.travellerPerSeat,
        });
      seen.add(t.seatNo);
    });
  });
export type BookBusInput = z.output<typeof bookBusSchema>;
