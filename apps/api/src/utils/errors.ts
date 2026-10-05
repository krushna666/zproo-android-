import { ErrorCode, type CouponRejection, type ErrorDetails, type FieldIssue } from '@zproo/types';
import { formatMoney } from '@zproo/utils';

/** Base class for errors whose message is safe to show to API clients. */
export class AppError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
    readonly errorCode: ErrorCode,
    readonly details?: ErrorDetails,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class BadRequestError extends AppError {
  constructor(message = 'Bad request') {
    super(message, 400, ErrorCode.BAD_REQUEST);
  }
}

/**
 * Field paths in `details.fields` drop the request part (`body.`, `query.`, `params.`), so they
 * match the form field names the web app uses. The first message per field wins.
 */
export function fieldMap(issues: FieldIssue[]): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of issues) {
    const key = issue.path.replace(/^(body|query|params|headers)\.?/, '') || '_';
    fields[key] ??= issue.message;
  }
  return fields;
}

export class ValidationError extends AppError {
  constructor(
    readonly issues: FieldIssue[],
    message = 'Please fix the errors',
  ) {
    super(message, 400, ErrorCode.VALIDATION_ERROR, { fields: fieldMap(issues), issues });
  }
}

export class AuthenticationError extends AppError {
  constructor(message = 'Authentication required') {
    super(message, 401, ErrorCode.UNAUTHENTICATED);
  }
}

export class InvalidCredentialsError extends AppError {
  constructor(message = 'Incorrect mobile number, email or password') {
    super(message, 401, ErrorCode.INVALID_CREDENTIALS);
  }
}

export class InvalidOtpError extends AppError {
  constructor(message = 'Incorrect code. Please try again.') {
    super(message, 400, ErrorCode.INVALID_OTP);
  }
}

export class OtpExpiredError extends AppError {
  constructor(message = 'This code has expired. Request a new one.') {
    super(message, 400, ErrorCode.OTP_EXPIRED);
  }
}

export class AccountDisabledError extends AppError {
  constructor(message = 'This account is disabled. Please contact support.') {
    super(message, 403, ErrorCode.ACCOUNT_DISABLED);
  }
}

export class ProviderNotConfiguredError extends AppError {
  constructor(message = 'This sign-in method is not available') {
    super(message, 400, ErrorCode.PROVIDER_NOT_CONFIGURED);
  }
}

/** Seat list in a sentence: "L4", "L4 and L5", "L4, L5 and L6". */
function seatList(seats: string[]): string {
  if (seats.length <= 1) return seats[0] ?? '';
  return `${seats.slice(0, -1).join(', ')} and ${seats.at(-1) ?? ''}`;
}

export class SeatUnavailableError extends AppError {
  constructor(readonly seats: string[] = []) {
    super(
      seats.length > 0
        ? `Seat ${seatList(seats)} was just booked by someone else. Please choose another seat.`
        : 'These seats were just booked by someone else. Please choose other seats.',
      409,
      ErrorCode.SEAT_UNAVAILABLE,
      { seats },
    );
  }
}

export class RoomUnavailableError extends AppError {
  constructor(roomTypeId?: string) {
    super(
      'This room just sold out. Please choose another room.',
      409,
      ErrorCode.ROOM_UNAVAILABLE,
      roomTypeId ? { roomTypeId } : undefined,
    );
  }
}

export class FareUnavailableError extends AppError {
  constructor(message = 'This fare is no longer available. Please choose another flight or fare.') {
    super(message, 409, ErrorCode.FARE_UNAVAILABLE);
  }
}

export class PriceChangedError extends AppError {
  constructor(
    readonly oldTotalPaise: number,
    readonly newTotalPaise: number,
  ) {
    super(
      `The fare changed from ${formatMoney(oldTotalPaise)} to ${formatMoney(newTotalPaise)}.`,
      409,
      ErrorCode.PRICE_CHANGED,
      { oldTotal: oldTotalPaise, newTotal: newTotalPaise },
    );
  }
}

export class HoldExpiredError extends AppError {
  constructor(message = 'Your hold has expired. Please start again.') {
    super(message, 410, ErrorCode.HOLD_EXPIRED);
  }
}

export class BookingClosedError extends AppError {
  constructor(message = 'Booking for this bus has closed') {
    super(message, 409, ErrorCode.BOOKING_CLOSED);
  }
}

export class CouponInvalidError extends AppError {
  constructor(readonly reason: CouponRejection) {
    super("This coupon can't be used for this booking.", 422, ErrorCode.COUPON_INVALID, {
      reason,
    });
  }
}

export class IdempotencyConflictError extends AppError {
  constructor() {
    super(
      'This Idempotency-Key was already used for a different request.',
      409,
      ErrorCode.IDEMPOTENCY_CONFLICT,
    );
  }
}

export class InvalidStateError extends AppError {
  constructor(message: string) {
    super(message, 409, ErrorCode.INVALID_STATE);
  }
}

export class AuthorizationError extends AppError {
  constructor(message = 'You do not have permission to perform this action') {
    super(message, 403, ErrorCode.FORBIDDEN);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(message, 404, ErrorCode.NOT_FOUND);
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Resource already exists') {
    super(message, 409, ErrorCode.CONFLICT);
  }
}

export class RateLimitError extends AppError {
  constructor(
    message = 'Too many requests, please try again later',
    readonly retryAfterSeconds?: number,
  ) {
    super(
      message,
      429,
      ErrorCode.RATE_LIMITED,
      retryAfterSeconds === undefined ? undefined : { retryAfter: retryAfterSeconds },
    );
  }
}

export class PaymentError extends AppError {
  constructor(message = 'Payment could not be processed') {
    super(message, 400, ErrorCode.PAYMENT_ERROR);
  }
}

export class ProviderError extends AppError {
  constructor(
    message = "We couldn't reach the operator right now. Please try again.",
    readonly provider?: string,
  ) {
    super(message, 502, ErrorCode.PROVIDER_ERROR);
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(message = 'ZPROO GO is having trouble right now. Please try again in a moment.') {
    super(message, 503, ErrorCode.SERVICE_UNAVAILABLE);
  }
}
