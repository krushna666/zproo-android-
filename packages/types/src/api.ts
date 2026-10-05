/** Machine-readable error codes returned in `error.code` of every error response. */
export const ErrorCode = {
  BAD_REQUEST: 'BAD_REQUEST',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  INVALID_OTP: 'INVALID_OTP',
  OTP_EXPIRED: 'OTP_EXPIRED',
  ACCOUNT_DISABLED: 'ACCOUNT_DISABLED',
  PROVIDER_NOT_CONFIGURED: 'PROVIDER_NOT_CONFIGURED',
  PRICE_CHANGED: 'PRICE_CHANGED',
  SEAT_UNAVAILABLE: 'SEAT_UNAVAILABLE',
  ROOM_UNAVAILABLE: 'ROOM_UNAVAILABLE',
  FARE_UNAVAILABLE: 'FARE_UNAVAILABLE',
  IDEMPOTENCY_CONFLICT: 'IDEMPOTENCY_CONFLICT',
  HOLD_EXPIRED: 'HOLD_EXPIRED',
  COUPON_INVALID: 'COUPON_INVALID',
  BOOKING_CLOSED: 'BOOKING_CLOSED',
  INVALID_STATE: 'INVALID_STATE',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  RATE_LIMITED: 'RATE_LIMITED',
  PAYMENT_ERROR: 'PAYMENT_ERROR',
  PROVIDER_ERROR: 'PROVIDER_ERROR',
  DATABASE_ERROR: 'DATABASE_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;
export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export interface ApiSuccess<T> {
  success: true;
  message: string;
  data: T;
}

export interface FieldIssue {
  path: string;
  message: string;
}

/** Why a coupon was refused (`details.reason` of COUPON_INVALID). */
export type CouponRejection = 'expired' | 'not_applicable' | 'min_amount' | 'usage_limit';

/**
 * Structured extras on an error. Each code documents which keys it sets:
 * VALIDATION_ERROR → `fields` (+ `issues`), PRICE_CHANGED → `oldTotal`/`newTotal` (paise),
 * SEAT_UNAVAILABLE → `seats`, ROOM_UNAVAILABLE → `roomTypeId`, COUPON_INVALID → `reason`,
 * RATE_LIMITED → `retryAfter` (seconds).
 */
export interface ErrorDetails {
  /** Field path (e.g. `travellers.0.gender`) → user-facing message. */
  fields?: Record<string, string>;
  /** Every validation issue in order, including several on one field. */
  issues?: FieldIssue[];
  oldTotal?: number;
  newTotal?: number;
  seats?: string[];
  roomTypeId?: string;
  reason?: CouponRejection;
  retryAfter?: number;
  refundAmount?: number;
}

export interface ApiErrorBody {
  code: ErrorCode;
  /** A human sentence that is safe to show. */
  message: string;
  /** Correlates the response with server logs (same as the X-Request-Id header). */
  requestId?: string;
  details?: ErrorDetails;
}

/** Every error response: `{ "error": { code, message, requestId, details? } }`. */
export interface ApiFailure {
  error: ApiErrorBody;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export interface Paginated<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
}

export type HealthStatus = 'ok' | 'degraded';
export type DependencyStatus = 'up' | 'down';

export interface HealthReport {
  status: HealthStatus;
  version: string;
  uptimeSeconds: number;
  timestamp: string;
  checks: Record<string, { status: DependencyStatus; latencyMs: number; error?: string }>;
}
