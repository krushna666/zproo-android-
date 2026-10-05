/** Crockford base32 without I, L, O, U — unambiguous when read aloud or typed. */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** Reference prefix per bookable service: ZB (bus), ZF (flight), ZH (hotel). */
export const REFERENCE_PREFIX = { BUS: 'ZB', FLIGHT: 'ZF', HOTEL: 'ZH' } as const;
export type ReferenceService = keyof typeof REFERENCE_PREFIX;

/** Two-letter prefix + 10 base32 characters (50 random bits). */
export const BOOKING_REFERENCE_PATTERN = /^Z[BFH][0-9A-HJKMNP-TV-Z]{10}$/;

function randomCode(length: number): string {
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  let out = '';
  // 256 is a multiple of 32, so `byte % 32` is unbiased.
  for (const byte of bytes) out += ALPHABET[byte % 32];
  return out;
}

/**
 * Generates an unguessable booking reference such as `ZB7K3QX9M2PA`. Owners are still checked on
 * every read; uniqueness is guaranteed by a unique index in the database (callers retry).
 */
export function generateBookingReference(service: ReferenceService): string {
  return `${REFERENCE_PREFIX[service]}${randomCode(10)}`;
}

export function isBookingReference(value: string): boolean {
  return BOOKING_REFERENCE_PATTERN.test(value);
}

/** Normalises user input (lower case, spaces, O→0, I/L→1 after the prefix) before lookup. */
export function normalizeBookingReference(value: string): string {
  const compact = value
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '');
  return compact.slice(0, 2) + compact.slice(2).replace(/O/g, '0').replace(/[IL]/g, '1');
}
