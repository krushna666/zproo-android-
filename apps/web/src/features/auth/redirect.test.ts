import { describe, expect, it } from 'vitest';
import { loginPath, maskPhone, safeReturnTo } from './redirect';

describe('safeReturnTo (open-redirect protection)', () => {
  it.each([
    ['/buses/trp_123/seats', '/buses/trp_123/seats'],
    ['/bookings/ZF7K3QX9M2PA?tab=invoice', '/bookings/ZF7K3QX9M2PA?tab=invoice'],
    ['/flights/search?from=PNQ&to=DEL', '/flights/search?from=PNQ&to=DEL'],
    ['/hotels/htl_1?checkIn=2026-10-20', '/hotels/htl_1?checkIn=2026-10-20'],
    ['/', '/'],
    [null, '/'],
    ['', '/'],
    ['https://evil.com', '/'],
    ['//evil.com', '/'],
    ['/\\evil.com', '/'],
    ['/%5Cevil.com', '/'],
    ['/%2F%2Fevil.com', '/'],
    ['javascript:alert(1)', '/'],
    ['/javascript:alert(1)', '/'],
    ['data:text/html,hi', '/'],
    ['\t/buses', '/'],
    ['/buses\nLocation: x', '/'],
    ['/login', '/'],
    ['/verify-otp?returnTo=/buses', '/'],
    ['/unknown-page', '/'],
    ['/busesX', '/'],
  ])('%j → %s', (input, expected) => {
    expect(safeReturnTo(input)).toBe(expected);
  });
});

describe('loginPath', () => {
  it('encodes the destination', () => {
    expect(loginPath('/bookings?x=1')).toBe('/login?returnTo=%2Fbookings%3Fx%3D1');
    expect(loginPath('/')).toBe('/login');
    expect(loginPath('https://evil.com')).toBe('/login');
  });
});

describe('maskPhone', () => {
  it('formats Indian numbers for display', () => {
    expect(maskPhone('+919876543210')).toBe('+91 98765 43210');
  });
});
