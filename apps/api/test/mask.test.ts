import { describe, expect, it } from 'vitest';
import { maskEmail, maskIdentifier, maskPhone } from '../src/utils/mask';

describe('PII masking', () => {
  it('masks mobile numbers to +91 98XXXXXX10', () => {
    expect(maskPhone('+919876543210')).toBe('+91 98XXXXXX10');
    expect(maskPhone('garbage')).toBe('+91 XXXXXXXXXX');
  });
  it('masks emails', () => {
    expect(maskEmail('amit.sharma@example.com')).toBe('a***@example.com');
    expect(maskIdentifier('+919876543210')).toBe('+91 98XXXXXX10');
  });
});
