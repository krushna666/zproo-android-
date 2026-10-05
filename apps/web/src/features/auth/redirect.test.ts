import { describe, expect, it } from 'vitest';
import { loginPath, maskPhone, safeNext } from './redirect';

describe('safeNext', () => {
  it.each([
    ['/wallet', '/wallet'],
    ['/bookings/ZF7K3QX9M2PA?tab=invoice', '/bookings/ZF7K3QX9M2PA?tab=invoice'],
    [null, '/'],
    ['https://evil.example', '/'],
    ['//evil.example', '/'],
    ['/\\evil.example', '/'],
    ['javascript:alert(1)', '/'],
    ['/login', '/'],
    ['/verify-otp', '/'],
  ])('%s → %s', (input, expected) => {
    expect(safeNext(input)).toBe(expected);
  });
});

describe('loginPath', () => {
  it('encodes the destination', () => {
    expect(loginPath('/bookings?x=1')).toBe('/login?next=%2Fbookings%3Fx%3D1');
    expect(loginPath('/')).toBe('/login');
  });
});

describe('maskPhone', () => {
  it('formats Indian numbers for display', () => {
    expect(maskPhone('+919876543210')).toBe('+91 98765 43210');
  });
});
