import { z } from 'zod';
import { emailSchema, indianMobileSchema, isoDateSchema } from './common';

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

export const busPassengerSchema = z.object({
  seatNumber: z.string().trim().min(1).max(8),
  firstName: travellerName('first name'),
  lastName: travellerName('last name'),
  age: z.coerce
    .number({ message: 'Enter age' })
    .int('Enter age in whole years')
    .min(1, 'Enter age')
    .max(120, 'Enter a valid age'),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER']),
});
export type BusPassengerInput = z.output<typeof busPassengerSchema>;

export const bookBusSchema = z
  .object({
    tripId: z.string().min(5).max(200),
    boardingPointId: z.string().min(1).max(64),
    droppingPointId: z.string().min(1).max(64),
    /** One traveller per seat */
    passengers: z
      .array(busPassengerSchema)
      .min(1)
      .max(MAX_BUS_SEATS, `Up to ${MAX_BUS_SEATS} seats per booking`),
    contact: contactSchema,
    /** The total the customer saw; if the price moved, the API refuses with PRICE_CHANGED. */
    expectedTotalPaise: z.number().int().positive(),
  })
  .superRefine((b, ctx) => {
    const seen = new Set<string>();
    b.passengers.forEach((p, i) => {
      if (seen.has(p.seatNumber)) {
        ctx.addIssue({
          code: 'custom',
          path: ['passengers', i, 'seatNumber'],
          message: 'Each traveller needs their own seat',
        });
      }
      seen.add(p.seatNumber);
    });
  });
export type BookBusInput = z.output<typeof bookBusSchema>;
