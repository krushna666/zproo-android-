import { z } from 'zod';
import { MESSAGES } from './messages';

/**
 * Shared primitives used by both web forms and API validators, so a value accepted by the
 * browser is always accepted by the server (and vice versa).
 */

/** Indian mobile number. Accepts `9876543210`, `+91 98765 43210`, `09876543210`; outputs `+919876543210`. */
export const indianMobileSchema = z
  .string()
  .trim()
  .transform((value) => value.replace(/[\s-]/g, ''))
  .transform((value) => value.replace(/^(\+91|91|0)(?=\d{10}$)/, ''))
  .refine((value) => /^[6-9]\d{9}$/.test(value), { message: MESSAGES.mobile.invalid })
  .transform((value) => `+91${value}`);

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email({ message: MESSAGES.email.invalid }))
  .refine((value) => value.length <= 254, { message: MESSAGES.email.tooLong });

export const passwordSchema = z
  .string()
  .min(8, MESSAGES.password.tooShort)
  .max(128, MESSAGES.password.tooLong)
  .refine((value) => /[A-Za-z]/.test(value) && /\d/.test(value), {
    message: MESSAGES.password.lettersAndNumbers,
  });

export const otpCodeSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, MESSAGES.otp.invalid);

export const personNameSchema = z
  .string()
  .trim()
  .min(2, MESSAGES.name.tooShort)
  .max(80, MESSAGES.name.tooLong)
  .regex(/^[\p{L}\p{M}' .-]+$/u, MESSAGES.name.invalidCharacters);

export const idSchema = z.string().trim().min(1).max(64);

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

/** `Idempotency-Key` header: client-generated UUID or similar opaque token. */
/** A client-generated UUID sent as the `Idempotency-Key` header. */
export const idempotencyKeySchema = z.uuid('Send a unique Idempotency-Key header (a UUID)');

/** ISO calendar date `YYYY-MM-DD`. */
export const isoDateSchema = z.iso.date({ message: 'Use YYYY-MM-DD' });
