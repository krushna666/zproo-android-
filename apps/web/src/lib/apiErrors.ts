import { formatMoney } from '@zproo/utils';
import { ApiClientError } from '@/services/http';

/** Copy for each reason a coupon is refused (shown under the SOP coupon message). */
export const COUPON_REASON_COPY = {
  expired: 'This coupon has expired.',
  not_applicable: "This coupon doesn't apply to this booking.",
  min_amount: "Your booking total is below this coupon's minimum amount.",
  usage_limit: 'This coupon has reached its usage limit.',
} as const;

export const FALLBACK_ERROR = 'Something went wrong. Please try again.';

/**
 * The one place that turns an API failure into the SOP copy (UI Style SOP §6.2). Screens show
 * this text instead of composing their own, so every module words errors the same way.
 */
export function userMessage(error: unknown): string {
  if (!(error instanceof ApiClientError)) return FALLBACK_ERROR;
  const d = error.details;
  switch (error.errorCode) {
    case 'PRICE_CHANGED':
      return d.oldTotal !== undefined && d.newTotal !== undefined
        ? `The fare changed from ${formatMoney(d.oldTotal)} to ${formatMoney(d.newTotal)}.`
        : error.message;
    case 'SEAT_UNAVAILABLE':
      return d.seats && d.seats.length > 0
        ? `Seat ${listSeats(d.seats)} was just booked by someone else. Please choose another seat.`
        : 'These seats were just booked by someone else. Please choose other seats.';
    case 'ROOM_UNAVAILABLE':
      return 'This room just sold out. Please choose another room.';
    case 'FARE_UNAVAILABLE':
      return 'This fare is no longer available. Please choose another flight or fare.';
    case 'HOLD_EXPIRED':
      return 'Your hold has expired. Please start again.';
    case 'COUPON_INVALID':
      return "This coupon can't be used for this booking.";
    case 'RATE_LIMITED':
      return `Too many attempts. Please try again in ${error.retryAfter ?? d.retryAfter ?? 60} seconds.`;
    case 'PROVIDER_ERROR':
    case 'TIMEOUT':
      return "We couldn't reach the operator right now. Please try again.";
    case 'SERVICE_UNAVAILABLE':
    case 'NETWORK_ERROR':
      return 'ZPROO GO is having trouble right now. Please try again in a moment.';
    case 'OFFLINE':
      return "You're offline. Check your connection and try again.";
    case 'INTERNAL_ERROR':
    case 'DATABASE_ERROR':
      return FALLBACK_ERROR;
    default:
      return error.message || FALLBACK_ERROR;
  }
}

/** The reason line under COUPON_INVALID, if the server gave one. */
export function couponReason(error: unknown): string | null {
  if (!(error instanceof ApiClientError) || error.errorCode !== 'COUPON_INVALID') return null;
  const reason = error.details.reason;
  return reason ? COUPON_REASON_COPY[reason] : null;
}

function listSeats(seats: string[]): string {
  if (seats.length <= 1) return seats[0] ?? '';
  return `${seats.slice(0, -1).join(', ')} and ${seats.at(-1) ?? ''}`;
}
