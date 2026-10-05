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

const travellerName = (label: string) =>
  z
    .string()
    .trim()
    .min(1, `Enter ${label}`)
    .max(40, `${label[0]?.toUpperCase()}${label.slice(1)} is too long`)
    .regex(/^[A-Za-z][A-Za-z .'-]*$/, 'Use English letters as on the ID');

export const passengerSchema = z
  .object({
    type: z.enum(['ADULT', 'CHILD', 'INFANT']),
    title: z.enum(['MR', 'MRS', 'MS', 'MSTR', 'MISS']),
    firstName: travellerName('first name'),
    lastName: travellerName('last name'),
    dateOfBirth: isoDateSchema.optional(),
    gender: z.enum(['MALE', 'FEMALE', 'OTHER']),
  })
  .superRefine((p, ctx) => {
    if (!(PASSENGER_TITLES[p.type] as readonly string[]).includes(p.title)) {
      ctx.addIssue({ code: 'custom', path: ['title'], message: 'Choose a title' });
    }
    if (p.type !== 'ADULT' && !p.dateOfBirth) {
      ctx.addIssue({
        code: 'custom',
        path: ['dateOfBirth'],
        message: 'Date of birth is required for children and infants',
      });
    }
  });
export type PassengerInput = z.output<typeof passengerSchema>;

export const contactSchema = z.object({ email: emailSchema, phone: indianMobileSchema });

/**
 * Checks each passenger's age band on the travel date (so an 11-year-old who turns 12 before the
 * flight travels as an adult).
 */
export function passengerAgeIssues(
  passengers: PassengerInput[],
  travelDate: string,
): { index: number; message: string }[] {
  const issues: { index: number; message: string }[] = [];
  passengers.forEach((p, index) => {
    if (!p.dateOfBirth) return;
    if (p.dateOfBirth > travelDate) {
      issues.push({ index, message: 'Date of birth must be before the travel date' });
      return;
    }
    const actual = passengerTypeForAge(ageOn(p.dateOfBirth, travelDate));
    if (actual !== p.type) {
      const band = {
        ADULT: 'an adult (12+)',
        CHILD: 'a child (2–11)',
        INFANT: 'an infant (under 2)',
      }[actual];
      issues.push({ index, message: `On the travel date this passenger is ${band}` });
    }
  });
  return issues;
}

export const bookFlightSchema = z.object({
  /** One offer per journey leg, in order. */
  offerIds: z.array(z.string().min(5).max(200)).min(1).max(5),
  passengers: z.array(passengerSchema).min(1).max(18),
  contact: contactSchema,
  /** The total the customer saw; if the price moved, the API refuses with PRICE_CHANGED. */
  expectedTotalPaise: z.number().int().positive(),
});
export type BookFlightInput = z.output<typeof bookFlightSchema>;

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

/** Contact for tickets: email and Indian mobile (both modules). */
export const travelContactSchema = z.strictObject({
  email: emailSchema,
  mobile: indianMobileSchema,
});
export type TravelContact = z.output<typeof travelContactSchema>;

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
