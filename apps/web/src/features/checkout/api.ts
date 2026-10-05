import type { BookingDetails, BookingListItem, PaymentOrder } from '@zproo/types';
import { useQuery } from '@tanstack/react-query';
import { env } from '@/lib/env';
import { apiGet, apiPost, http } from '@/services/http';

export const bookingKeys = {
  booking: (reference: string) => ['bookings', reference] as const,
  bookings: ['bookings'] as const,
};

/** True while a confirmed booking is still waiting for its PNR(s) from the airline or operator. */
const awaitingTickets = (b: BookingDetails | undefined) =>
  b?.status === 'CONFIRMED' && (b.flights.some((f) => !f.pnr) || (b.bus !== null && !b.bus.pnr));

export function useBooking(reference: string | null, options: { poll?: boolean } = {}) {
  return useQuery({
    queryKey: bookingKeys.booking(reference ?? ''),
    queryFn: () => apiGet<BookingDetails>(`/bookings/${reference}`),
    enabled: Boolean(reference),
    // Tickets are issued just after payment: poll (for about a minute) until every PNR is in.
    refetchInterval: (query) =>
      options.poll && awaitingTickets(query.state.data) && query.state.dataUpdateCount < 20
        ? 3_000
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

export const checkoutApi = {
  createPayment: (bookingReference: string) =>
    apiPost<PaymentOrder>('/payments/create', { bookingReference }),
  /** Development gateway only: stands in for the checkout popup of a real gateway. */
  completeMockPayment: (paymentId: string, outcome: 'success' | 'failure') =>
    apiPost<{ reference: string; status: 'SUCCESS' | 'FAILED' }>('/payments/mock/complete', {
      paymentId,
      outcome,
    }),
  verifyPayment: (body: {
    paymentId: string;
    providerPaymentId: string;
    signature: string;
    method?: string;
  }) => apiPost<{ reference: string }>('/payments/verify', body),
  failPayment: (paymentId: string, reason: string) =>
    apiPost<null>(`/payments/${paymentId}/fail`, { reason }),
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
