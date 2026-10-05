import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { BookingDetails } from '@zproo/types';
import { Button, Card, CardContent, CardHeader, CardTitle, Input, toast } from '@zproo/ui';
import { formatMoney } from '@zproo/utils';
import { TicketPercent, X } from 'lucide-react';
import { useId, useState } from 'react';
import { couponReason, userMessage } from '@/lib/apiErrors';
import { bookingKeys, checkoutApi } from './api';

/** Apply / remove a coupon on a held booking; the server recomputes the total. */
export function CouponBox({ booking }: { booking: BookingDetails }) {
  const queryClient = useQueryClient();
  const inputId = useId();
  const [code, setCode] = useState('');
  const store = (next: BookingDetails) =>
    queryClient.setQueryData(bookingKeys.booking(booking.reference), next);
  const apply = useMutation({
    mutationFn: () => checkoutApi.applyCoupon(booking.reference, code.trim()),
    onSuccess: (next) => {
      store(next);
      setCode('');
      toast.success(`Coupon ${next.coupon?.code ?? ''} applied`);
    },
  });
  const remove = useMutation({
    mutationFn: () => checkoutApi.removeCoupon(booking.reference),
    onSuccess: (next) => {
      store(next);
      apply.reset();
    },
  });
  const reason = couponReason(apply.error);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <TicketPercent aria-hidden className="size-5 text-primary" /> Coupon
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {booking.coupon ? (
          <div className="flex items-center justify-between gap-3 rounded-xl bg-success/10 px-3 py-2 text-sm">
            <span>
              <strong className="font-mono">{booking.coupon.code}</strong> applied — you save{' '}
              {formatMoney(booking.coupon.discountPaise)}
            </span>
            <Button
              variant="ghost"
              size="sm"
              data-testid="checkout-coupon-remove"
              disabled={remove.isPending}
              onClick={() => remove.mutate()}
            >
              <X aria-hidden /> Remove
            </Button>
          </div>
        ) : (
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (code.trim()) apply.mutate();
            }}
          >
            <label htmlFor={inputId} className="sr-only">
              Coupon code
            </label>
            <Input
              id={inputId}
              data-testid="checkout-coupon-input"
              placeholder="Enter coupon code"
              autoComplete="off"
              value={code}
              maxLength={20}
              aria-invalid={apply.error ? true : undefined}
              aria-describedby={apply.error ? `${inputId}-error` : undefined}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
            />
            <Button
              type="submit"
              variant="outline"
              data-testid="checkout-coupon-apply"
              disabled={apply.isPending || !code.trim()}
            >
              {apply.isPending ? 'Applying...' : 'Apply'}
            </Button>
          </form>
        )}
        {apply.error && (
          <div id={`${inputId}-error`} data-testid="field-error-coupon" className="text-xs">
            <p className="font-semibold text-danger">{userMessage(apply.error)}</p>
            {reason && <p className="text-muted">{reason}</p>}
          </div>
        )}
        {remove.error && (
          <p className="text-xs font-semibold text-danger">{userMessage(remove.error)}</p>
        )}
      </CardContent>
    </Card>
  );
}
