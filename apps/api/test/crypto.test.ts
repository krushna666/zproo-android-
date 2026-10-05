import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { decryptField, encryptField, hmacSigner } from '../src/lib/crypto';

describe('field encryption', () => {
  const key = randomBytes(32);

  it('round-trips and never repeats a ciphertext', () => {
    const a = encryptField('K1234567', key);
    const b = encryptField('K1234567', key);
    expect(a).not.toBe(b);
    expect(a).not.toContain('K1234567');
    expect(a).toMatch(/^v1\./);
    expect(decryptField(a, key)).toBe('K1234567');
  });

  it('refuses tampered values and the wrong key', () => {
    const value = encryptField('K1234567', key);
    const parts = value.split('.');
    parts[3] = Buffer.from('X').toString('base64url') + (parts[3] ?? '').slice(2);
    expect(() => decryptField(parts.join('.'), key)).toThrow();
    expect(() => decryptField(value, randomBytes(32))).toThrow();
  });
});

describe('hmacSigner', () => {
  it('is stable per secret and purpose', () => {
    const sign = hmacSigner('s'.repeat(40), 'offers');
    expect(sign('x')).toMatch(/^[0-9a-f]{16}$/);
    expect(sign('x')).toBe(hmacSigner('s'.repeat(40), 'offers')('x'));
    expect(sign('x')).not.toBe(hmacSigner('t'.repeat(40), 'offers')('x'));
  });
});
