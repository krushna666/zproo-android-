import { z } from 'zod';

export const COUPON_MESSAGES = {
  code: 'Enter a valid coupon code',
} as const;

/** Coupon codes are case-insensitive: stored and compared in upper case. */
export const couponCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9]{4,20}$/, COUPON_MESSAGES.code);
