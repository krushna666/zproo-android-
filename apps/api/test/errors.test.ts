import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { toFailure } from '../src/middleware/errorHandler';
import {
  ConflictError,
  CouponInvalidError,
  HoldExpiredError,
  PaymentError,
  PriceChangedError,
  ProviderError,
  SeatUnavailableError,
  ValidationError,
} from '../src/utils/errors';

describe('toFailure', () => {
  it('passes AppError details through', () => {
    expect(toFailure(new ConflictError('Mobile number already registered'))).toEqual({
      status: 409,
      errorCode: 'CONFLICT',
      message: 'Mobile number already registered',
      details: undefined,
    });
    expect(toFailure(new PaymentError()).status).toBe(400);
    expect(toFailure(new ProviderError('Flight supplier timed out', 'amadeus')).status).toBe(502);
  });

  it('maps ZodError to VALIDATION_ERROR with field paths', () => {
    const result = z.object({ phone: z.string() }).safeParse({});
    expect(result.success).toBe(false);
    const failure = toFailure(result.error);
    expect(failure).toMatchObject({ status: 400, errorCode: 'VALIDATION_ERROR' });
    expect(failure.details?.issues?.[0]?.path).toBe('phone');
    expect(failure.details?.fields).toEqual({ phone: expect.any(String) });
  });

  it('maps Prisma unique violations to 409 and missing records to 404', () => {
    const unique = new Prisma.PrismaClientKnownRequestError('dup', {
      code: 'P2002',
      clientVersion: 'x',
    });
    const missing = new Prisma.PrismaClientKnownRequestError('missing', {
      code: 'P2025',
      clientVersion: 'x',
    });
    expect(toFailure(unique)).toMatchObject({ status: 409, errorCode: 'CONFLICT' });
    expect(toFailure(missing)).toMatchObject({ status: 404, errorCode: 'NOT_FOUND' });
  });

  it('never leaks unknown error messages', () => {
    const failure = toFailure(new Error('connect ECONNREFUSED 10.0.0.5:5432 password=secret'));
    expect(failure).toEqual({
      status: 500,
      errorCode: 'INTERNAL_ERROR',
      message: 'Something went wrong. Please try again.',
    });
  });
});

describe('error details', () => {
  it('maps validation issues to a field → message map without the request part', () => {
    const err = new ValidationError([
      { path: 'body.travellers.0.gender', message: 'This seat is reserved for women' },
      { path: 'body.travellers.0.gender', message: 'second message is ignored' },
      { path: 'query.date', message: 'Choose a date within the next 120 days' },
    ]);
    expect(err.details?.fields).toEqual({
      'travellers.0.gender': 'This seat is reserved for women',
      date: 'Choose a date within the next 120 days',
    });
    expect(err.message).toBe('Please fix the errors');
  });

  it('names the taken seats in SEAT_UNAVAILABLE', () => {
    expect(new SeatUnavailableError(['L4']).message).toBe(
      'Seat L4 was just booked by someone else. Please choose another seat.',
    );
    expect(new SeatUnavailableError(['L4', 'L5', 'U1']).message).toBe(
      'Seat L4, L5 and U1 was just booked by someone else. Please choose another seat.',
    );
    expect(new SeatUnavailableError(['L4']).details).toEqual({ seats: ['L4'] });
  });

  it('carries old and new totals on PRICE_CHANGED and a reason on COUPON_INVALID', () => {
    const changed = toFailure(new PriceChangedError(124900, 139900));
    expect(changed).toMatchObject({
      status: 409,
      errorCode: 'PRICE_CHANGED',
      message: 'The fare changed from ₹1,249 to ₹1,399.',
      details: { oldTotal: 124900, newTotal: 139900 },
    });
    expect(toFailure(new CouponInvalidError('expired'))).toMatchObject({
      status: 422,
      details: { reason: 'expired' },
    });
    expect(toFailure(new HoldExpiredError()).status).toBe(410);
  });
});
