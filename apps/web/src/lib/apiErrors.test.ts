import { describe, expect, it } from 'vitest';
import { ApiClientError } from '@/services/http';
import { couponReason, userMessage } from './apiErrors';

const err = (code: ConstructorParameters<typeof ApiClientError>[2], details = {}, retry?: number) =>
  new ApiClientError('server text', 409, code, details, undefined, retry);

describe('userMessage (SOP §6.2 copy)', () => {
  it('formats price changes in rupees', () => {
    expect(userMessage(err('PRICE_CHANGED', { oldTotal: 124900, newTotal: 139900 }))).toBe(
      'The fare changed from ₹1,249 to ₹1,399.',
    );
  });

  it('names taken seats', () => {
    expect(userMessage(err('SEAT_UNAVAILABLE', { seats: ['L4', 'L5'] }))).toBe(
      'Seat L4 and L5 was just booked by someone else. Please choose another seat.',
    );
  });

  it.each([
    ['ROOM_UNAVAILABLE', 'This room just sold out. Please choose another room.'],
    ['FARE_UNAVAILABLE', 'This fare is no longer available. Please choose another flight or fare.'],
    ['HOLD_EXPIRED', 'Your hold has expired. Please start again.'],
    ['COUPON_INVALID', "This coupon can't be used for this booking."],
    ['PROVIDER_ERROR', "We couldn't reach the operator right now. Please try again."],
    ['SERVICE_UNAVAILABLE', 'ZPROO GO is having trouble right now. Please try again in a moment.'],
    ['OFFLINE', "You're offline. Check your connection and try again."],
    ['INTERNAL_ERROR', 'Something went wrong. Please try again.'],
  ] as const)('%s', (code, text) => {
    expect(userMessage(err(code))).toBe(text);
  });

  it('uses Retry-After seconds for rate limits', () => {
    expect(userMessage(err('RATE_LIMITED', {}, 42))).toBe(
      'Too many attempts. Please try again in 42 seconds.',
    );
  });

  it('falls back for non-API errors', () => {
    expect(userMessage(new Error('boom'))).toBe('Something went wrong. Please try again.');
  });

  it('explains coupon reasons', () => {
    expect(couponReason(err('COUPON_INVALID', { reason: 'expired' }))).toBe(
      'This coupon has expired.',
    );
    expect(couponReason(err('PRICE_CHANGED'))).toBeNull();
  });
});
