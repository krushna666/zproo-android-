import type { BookingStatus, PaymentStatus } from '@zproo/types';
import { OPEN_HOLD_STATUSES } from '@zproo/utils';

type Tone = 'success' | 'warning' | 'danger' | 'outline';

/** Customer-facing label and badge tone for every booking status. */
export const BOOKING_STATUS_LABEL: Record<BookingStatus, { label: string; tone: Tone }> = {
  DRAFT: { label: 'Started', tone: 'outline' },
  HELD: { label: 'Awaiting payment', tone: 'warning' },
  PAYMENT_PENDING: { label: 'Awaiting payment', tone: 'warning' },
  CONFIRMED: { label: 'Confirmed', tone: 'success' },
  EXPIRED: { label: 'Hold expired', tone: 'outline' },
  FAILED: { label: 'Failed', tone: 'danger' },
  COMPLETED: { label: 'Completed', tone: 'outline' },
  CANCELLED: { label: 'Cancelled', tone: 'danger' },
  REFUND_PENDING: { label: 'Refund pending', tone: 'warning' },
  REFUNDED: { label: 'Refunded', tone: 'outline' },
};

/** Still payable: inventory held and no payment captured yet. */
export function isAwaitingPayment(b: { status: BookingStatus; paymentStatus: PaymentStatus }) {
  return OPEN_HOLD_STATUSES.includes(b.status) && b.paymentStatus !== 'CAPTURED';
}

/** Paid; the supplier is still issuing ("Confirming with the airline..."). */
export function isConfirming(b: { status: BookingStatus; paymentStatus: PaymentStatus }) {
  return b.status === 'PAYMENT_PENDING' && b.paymentStatus === 'CAPTURED';
}

export const isConfirmed = (status: BookingStatus) =>
  status === 'CONFIRMED' || status === 'COMPLETED';
