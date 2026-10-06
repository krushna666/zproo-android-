import { z } from 'zod';
import { idNameSchema } from './booking';
import { isoDateSchema } from './common';

/** SOP §6.3: "Save traveller for next time" — the saved list lives on the profile. */
export const SAVED_TRAVELLERS_MAX = 20;
export const SAVED_TRAVELLER_TITLES = ['MR', 'MRS', 'MS', 'MISS', 'MSTR', 'DR'] as const;

export const TRAVELLER_MESSAGES = {
  limit: `You can save up to ${SAVED_TRAVELLERS_MAX} travellers`,
  dob: 'Enter a valid date of birth',
} as const;

/**
 * A traveller to keep: the name as on a government ID, plus what the module forms reuse. A
 * one-word name (some bus travellers) has an empty last name.
 */
export const savedTravellerSchema = z.strictObject({
  title: z.enum(SAVED_TRAVELLER_TITLES).optional(),
  firstName: idNameSchema(1),
  lastName: idNameSchema(1).or(z.literal('')).default(''),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER']).optional(),
  dob: isoDateSchema.optional(),
});
export type SavedTravellerInput = z.input<typeof savedTravellerSchema>;
export type SavedTravellerData = z.output<typeof savedTravellerSchema>;

export const savedTravellerIdSchema = z.strictObject({
  id: z.string().regex(/^[a-z0-9]{20,32}$/, 'Not found'),
});

/** "Amit Kumar Sharma" → first "Amit Kumar", last "Sharma" (the bus form has one name field). */
export function splitFullName(name: string): { firstName: string; lastName: string } {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return { firstName: parts[0] ?? '', lastName: '' };
  return { firstName: parts.slice(0, -1).join(' '), lastName: parts.at(-1) ?? '' };
}
