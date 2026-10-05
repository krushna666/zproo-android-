import type { BookingDetails, BookingListItem, PaymentOrder } from '@zproo/types';
import { useQuery } from '@tanstack/react-query';
import { syncServerClock } from '@/lib/clock';
import { env } from '@/lib/env';
import { apiGet, apiPost, http } from '@/services/http';

export const bookingKeys = {
  booking: (reference: string) => ['bookings', reference] as const,
  bookings: ['bookings'] as const,
};

/**
 * True while a paid booking is still being ticketed ("Confirming with the airline...") or a
 * confirmed one is still waiting for its PNR(s).
 */
const awaitingTickets = (b: BookingDetails | undefined) =>
  (b?.status === 'PAYMENT_PENDING' && b.paymentStatus === 'CAPTURED') ||
  (b?.status === 'CONFIRMED' && (b.flights.some((f) => !f.pnr) || (b.bus !== null && !b.bus.pnr)));

/** Status polls: 5 s, then ×1.5 each time (capped at 20 s), for up to 2 minutes in total. */
export function pollDelay(polls: number): number | false {
  let elapsed = 0;
  let delay = 5_000;
  for (let i = 0; i < polls; i++) {
    elapsed += delay;
    delay = Math.min(delay * 1.5, 20_000);
  }
  return elapsed + delay > 120_000 ? false : delay;
}

export function useBooking(reference: string | null, options: { poll?: boolean } = {}) {
  return useQuery({
    queryKey: bookingKeys.booking(reference ?? ''),
    queryFn: async () => {
      const booking = await apiGet<BookingDetails>(`/bookings/${reference}`);
      syncServerClock(booking.serverNow);
      return booking;
    },
    enabled: Boolean(reference),
    // Tickets are issued just after payment: poll (for about a minute) until every PNR is in.
    refetchInterval: (query) =>
      options.poll && awaitingTickets(query.state.data)
        ? pollDelay(Math.max(0, query.state.dataUpdateCount - 1))
        : false,
  });
}

export function useMyBookings() {
  return useQuery({
    queryKey: bookingKeys.bookings,
    queryFn: () => apiGet<BookingListItem[]>('/bookings'),
    enabled: true,
  });
}

/** What the gateway's checkout hands the browser after a successful payment. */
export interface GatewayResult {
  orderId: string;
  paymentId: string;
  signature: string;
}

export interface PaymentResult {
  bookingRef: string;
  status: BookingDetails['status'];
  paymentStatus: BookingDetails['paymentStatus'];
}

const idempotency = () => ({ headers: { 'Idempotency-Key': crypto.randomUUID() } });

export const checkoutApi = {
  createPayment: (bookingRef: string) =>
    apiPost<PaymentOrder>('/payments/create', { bookingRef }, idempotency()),
  /** Development gateway only: stands in for the checkout popup of a real gateway. */
  completeMockPayment: (orderId: string, outcome: 'success' | 'failure') =>
    apiPost<({ outcome: 'success' } & GatewayResult) | { outcome: 'failure' }>(
      '/payments/mock/complete',
      { orderId, outcome },
    ),
  /** The server checks the signature and the gateway's own record before confirming. */
  verifyPayment: (bookingRef: string, result: GatewayResult) =>
    apiPost<PaymentResult>('/payments/verify', { bookingRef, ...result }, idempotency()),
  failPayment: (orderId: string, reason: string) =>
    apiPost<null>('/payments/fail', { orderId, reason }),
  applyCoupon: (bookingRef: string, code: string) =>
    apiPost<BookingDetails>('/coupons/apply', { bookingRef, code }),
  removeCoupon: (bookingRef: string) => apiPost<BookingDetails>('/coupons/remove', { bookingRef }),
  /** Gives up an unpaid hold so its seats are free again (best effort). */
  releaseHold: (bookingRef: string) =>
    apiPost<{ bookingRef: string; status: 'EXPIRED' }>(`/bookings/${bookingRef}/release`),
  /** Fetched with the access token (a plain link can't send it), then saved via a blob URL. */
  async downloadTicket(reference: string): Promise<void> {
    // Static mode has no PDF service: open the printable ticket (Print → Save as PDF).
    if (env.staticMode) {
      window.open(`/tickets/${encodeURIComponent(reference)}`, '_blank', 'noopener');
      return;
    }
    const res = await http.get<Blob>(`/bookings/${reference}/ticket.pdf`, { responseType: 'blob' });
    const url = URL.createObjectURL(res.data);
    const link = document.createElement('a');
    link.href = url;
    link.download = `ZPROO-GO-${reference}.pdf`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  },
};
