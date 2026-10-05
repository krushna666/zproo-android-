import { describe, expect, it } from 'vitest';
import {
  generateBookingReference,
  isBookingReference,
  normalizeBookingReference,
} from './reference';

describe('booking reference', () => {
  it('generates module-prefixed references with 10 base32 characters', () => {
    expect(generateBookingReference('BUS')).toMatch(/^ZB[0-9A-Z]{10}$/);
    expect(generateBookingReference('FLIGHT')).toMatch(/^ZF[0-9A-Z]{10}$/);
    expect(generateBookingReference('HOTEL')).toMatch(/^ZH[0-9A-Z]{10}$/);
    expect(isBookingReference(generateBookingReference('BUS'))).toBe(true);
  });

  it('never uses ambiguous characters and does not repeat', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 500; i++) {
      const ref = generateBookingReference('HOTEL');
      expect(ref.slice(2)).not.toMatch(/[ILOU]/);
      seen.add(ref);
    }
    expect(seen.size).toBe(500);
  });

  it('validates format', () => {
    expect(isBookingReference('ZB7K3QX9M2PA')).toBe(true);
    expect(isBookingReference('ZB7K3QX9M2PO')).toBe(false);
    expect(isBookingReference('ZX7K3QX9M2PA')).toBe(false);
    expect(isBookingReference('ZP-2026-7K3QX9')).toBe(false);
  });

  it('normalises user input', () => {
    expect(normalizeBookingReference(' zb7k3qx9m2po ')).toBe('ZB7K3QX9M2P0');
    expect(normalizeBookingReference('ZH-L1AB CD12 34')).toBe('ZH11ABCD1234');
  });
});
