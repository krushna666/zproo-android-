import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { BookingListItem, CancellationQuote } from '@zproo/types';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  FormAlert,
  Skeleton,
  toast,
} from '@zproo/ui';
import { formatMoney } from '@zproo/utils';
import { useState } from 'react';
import { userMessage } from '@/lib/apiErrors';
import { apiGet, apiPost } from '@/services/http';
import { bookingKeys } from './api';

const cancelPath = (serviceType: string, ref: string) =>
  serviceType === 'FLIGHT' ? `/flights/${ref}/cancel` : `/buses/${ref}/cancel`;

/** "Cancel" for a confirmed booking: shows the server's refund estimate, then cancels. */
export function CancelBooking({ booking }: { booking: BookingListItem }) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const quote = useQuery({
    queryKey: ['bookings', booking.reference, 'cancellation'],
    queryFn: () => apiGet<CancellationQuote>(`/bookings/${booking.reference}/cancellation`),
    enabled: open,
    staleTime: 0,
  });
  const cancel = useMutation({
    mutationFn: () =>
      apiPost<{ bookingRef: string; status: string; refundAmount: number }>(
        cancelPath(booking.serviceType, booking.reference),
      ),
    onSuccess: async (result) => {
      setOpen(false);
      toast.success(
        result.refundAmount > 0
          ? `Booking cancelled. ${formatMoney(result.refundAmount)} will be refunded.`
          : 'Booking cancelled.',
      );
      await queryClient.invalidateQueries({ queryKey: bookingKeys.bookings });
    },
  });
  const q = quote.data;

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        data-testid="booking-cancel"
        onClick={() => {
          cancel.reset();
          setOpen(true);
        }}
      >
        Cancel
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogTitle>Cancel booking {booking.reference}?</DialogTitle>
          <DialogDescription>{booking.title}</DialogDescription>
          {quote.isPending ? (
            <Skeleton className="h-16 rounded-xl" />
          ) : quote.error ? (
            <FormAlert>{userMessage(quote.error)}</FormAlert>
          ) : q && !q.cancellable ? (
            <FormAlert>{q.reason ?? "This booking can't be cancelled."}</FormAlert>
          ) : (
            q && (
              <div className="rounded-xl bg-background p-4 text-sm">
                <p className="text-muted">Refund estimate</p>
                <p
                  className="text-2xl font-extrabold tabular-nums"
                  data-testid="booking-refund-amount"
                >
                  {formatMoney(q.refundAmount)}
                </p>
                <p className="text-muted">
                  {q.refundPercent}% of the fare under the cancellation policy, to your original
                  payment method in 5–7 working days.
                </p>
              </div>
            )
          )}
          {cancel.error && <FormAlert>{userMessage(cancel.error)}</FormAlert>}
          <div className="mt-2 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Keep booking
            </Button>
            <Button
              variant="destructive"
              data-testid="booking-cancel-confirm"
              disabled={!q?.cancellable || cancel.isPending}
              onClick={() => cancel.mutate()}
            >
              {cancel.isPending ? 'Cancelling...' : 'Cancel booking'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
