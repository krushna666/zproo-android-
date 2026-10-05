import type { BookingStatus } from '@zproo/types';

/**
 * The booking lifecycle, shared by the API and the static engine:
 *
 *   DRAFT → HELD → PAYMENT_PENDING → CONFIRMED → COMPLETED
 *             ↘ EXPIRED     ↘ EXPIRED / FAILED
 *   CONFIRMED → CANCELLED → REFUND_PENDING → REFUNDED
 *
 * A payment captured after EXPIRED never re-opens the booking: the payment is marked REFUND_DUE.
 * FAILED means the supplier could not issue after payment (the payment becomes REFUND_DUE too).
 */
export const BOOKING_TRANSITIONS: Readonly<Record<BookingStatus, readonly BookingStatus[]>> = {
  DRAFT: ['HELD', 'FAILED'],
  HELD: ['PAYMENT_PENDING', 'EXPIRED', 'FAILED'],
  PAYMENT_PENDING: ['CONFIRMED', 'EXPIRED', 'FAILED'],
  CONFIRMED: ['CANCELLED', 'COMPLETED'],
  CANCELLED: ['REFUND_PENDING'],
  REFUND_PENDING: ['REFUNDED'],
  EXPIRED: [],
  FAILED: [],
  REFUNDED: [],
  COMPLETED: [],
};

export class IllegalTransitionError extends Error {
  constructor(
    readonly from: BookingStatus,
    readonly to: BookingStatus,
  ) {
    super(`Illegal booking transition ${from} → ${to}`);
    this.name = 'IllegalTransitionError';
  }
}

export function canTransition(from: BookingStatus, to: BookingStatus): boolean {
  return BOOKING_TRANSITIONS[from].includes(to);
}

/** Returns `to` if the move is legal, otherwise throws IllegalTransitionError. */
export function transition(from: BookingStatus, to: BookingStatus): BookingStatus {
  if (!canTransition(from, to)) throw new IllegalTransitionError(from, to);
  return to;
}

/** States from which `to` can be reached in one step (used for race-safe conditional updates). */
export function sourcesOf(to: BookingStatus): BookingStatus[] {
  return (Object.keys(BOOKING_TRANSITIONS) as BookingStatus[]).filter((from) =>
    canTransition(from, to),
  );
}

/** Unpaid states whose seats/rooms are held until `holdExpiresAt`. */
export const OPEN_HOLD_STATUSES: readonly BookingStatus[] = ['HELD', 'PAYMENT_PENDING'];

export const isTerminal = (status: BookingStatus) => BOOKING_TRANSITIONS[status].length === 0;
