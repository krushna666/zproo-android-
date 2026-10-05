import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { BookingDetails, PaymentOrder } from '@zproo/types';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  cn,
  FormAlert,
  Skeleton,
} from '@zproo/ui';
import { Building2, CreditCard, Lock, Smartphone, Wallet } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Navigate, useLocation, useSearchParams } from 'react-router';
import { errorMessage } from '@/features/auth/errors';
import { useBusDraft } from '@/features/buses/draft';
import { bookingKeys, checkoutApi, useBooking } from '@/features/checkout/api';
import { CHECKOUT_STEP, type CheckoutService } from '@/features/checkout/steps';
import { confirmationUrl, searchHome, serviceOf } from '@/features/checkout/links';
import { isAwaitingPayment, isConfirmed, isConfirming } from '@/features/checkout/status';
import { TripSummary } from '@/features/checkout/TripSummary';
import { CheckoutShell } from '@/features/checkout/CheckoutShell';
import { HoldExpired, HoldTimer } from '@/features/checkout/HoldTimer';
import { UpiQr } from '@/features/checkout/UpiQr';
import { PriceSummary } from '@/features/checkout/PriceSummary';
import { useFlightDraft } from '@/features/flights/draft';
import { inr } from '@/features/flights/format';
import { useCountdown } from '@/hooks/useCountdown';

const METHOD_NOUN = {
  upi: 'UPI',
  card: 'card',
  netbanking: 'net banking',
  wallet: 'wallet',
} as const;

const METHODS = [
  { id: 'upi', label: 'UPI', hint: 'Google Pay, PhonePe, Paytm & more', icon: Smartphone },
  { id: 'card', label: 'Credit / debit card', hint: 'Visa, Mastercard, RuPay', icon: CreditCard },
  { id: 'netbanking', label: 'Net banking', hint: 'All major banks', icon: Building2 },
  { id: 'wallet', label: 'Wallet', hint: 'ZPROO Wallet and others', icon: Wallet },
] as const;

/** Payment for any booking (flights and buses), at /flights/payment and /buses/payment. */
export default function PaymentPage() {
  const [params] = useSearchParams();
  const service: CheckoutService = useLocation().pathname.startsWith('/buses') ? 'bus' : 'flight';
  const flightReference = useFlightDraft((s) => s.reference);
  const busReference = useBusDraft((s) => s.reference);
  const reference = params.get('ref') ?? (service === 'bus' ? busReference : flightReference);
  const { data: booking, isPending, error } = useBooking(reference);
  const step = CHECKOUT_STEP[service].payment;

  if (!reference) return <Navigate to={searchHome(service)} replace />;
  if (isPending) {
    return (
      <CheckoutShell step={step} service={service} title="Payment">
        <Skeleton className="h-72 rounded-2xl" />
      </CheckoutShell>
    );
  }
  if (error || !booking) {
    return (
      <CheckoutShell step={step} service={service} title="Payment">
        <FormAlert>{errorMessage(error)}</FormAlert>
      </CheckoutShell>
    );
  }
  if (isConfirmed(booking.status) || isConfirming(booking)) {
    return <Navigate to={confirmationUrl(serviceOf(booking), booking.reference)} replace />;
  }
  return <Payment booking={booking} />;
}

function Payment({ booking }: { booking: BookingDetails }) {
  const queryClient = useQueryClient();
  const service = serviceOf(booking);
  const clearFlight = useFlightDraft((s) => s.clear);
  const clearBus = useBusDraft((s) => s.clear);
  const [method, setMethod] = useState<(typeof METHODS)[number]['id']>('upi');
  const [paid, setPaid] = useState<string | null>(null);
  const paying = useRef(false);
  const holdEnds = booking.holdExpiresAt ? Date.parse(booking.holdExpiresAt) : 0;
  const secondsLeft = useCountdown(holdEnds);
  const expired = !isAwaitingPayment(booking) || secondsLeft === 0;

  const order = useMutation({ mutationFn: () => checkoutApi.createPayment(booking.reference) });
  const createOrder = order.mutate;
  // One order per booking: the API returns the open order if one exists, so this is safe to repeat.
  useEffect(() => {
    if (isAwaitingPayment(booking)) createOrder();
  }, [booking, createOrder]);

  const pay = useMutation({
    mutationFn: async (outcome: 'success' | 'failure') => {
      const current = order.data as PaymentOrder;
      const gateway = await checkoutApi.completeMockPayment(current.orderId, outcome);
      if (gateway.outcome === 'failure') return { status: 'FAILED' as const };
      const { outcome: _done, ...result } = gateway;
      return checkoutApi.verifyPayment(booking.reference, result);
    },
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: bookingKeys.booking(booking.reference) });
      if (result.status === 'FAILED') {
        // A failed attempt closes that order; the next attempt gets a fresh one.
        createOrder();
        return;
      }
      if (service === 'bus') clearBus();
      else clearFlight();
      setPaid(booking.reference);
    },
  });

  if (paid) return <Navigate to={confirmationUrl(service, paid)} replace />;

  const mock = order.data?.provider === 'mock';
  const submit = (outcome: 'success' | 'failure') => {
    // Button lock: never two attempts at once (the API is idempotent as well).
    if (paying.current || !order.data) return;
    paying.current = true;
    pay.mutate(outcome, { onSettled: () => (paying.current = false) });
  };

  return (
    <CheckoutShell
      step={CHECKOUT_STEP[service].payment}
      service={service}
      title="Payment"
      aside={
        <>
          <PriceSummary price={booking.price} />
          <TripSummary booking={booking} />
        </>
      }
    >
      {expired ? (
        <HoldExpired searchHref={searchHome(service)} />
      ) : (
        <>
          <HoldTimer secondsLeft={secondsLeft} />
          <p className="-mt-3 text-sm text-muted">
            Booking <strong className="font-mono">{booking.reference}</strong>
          </p>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Choose how to pay</CardTitle>
            </CardHeader>
            <CardContent>
              <div
                role="radiogroup"
                aria-label="Payment method"
                className="grid gap-3 sm:grid-cols-2"
              >
                {METHODS.map(({ id, label, hint, icon: Icon }) => (
                  <button
                    key={id}
                    type="button"
                    role="radio"
                    data-testid={`checkout-pay-method-${id}`}
                    aria-checked={method === id}
                    onClick={() => setMethod(id)}
                    className={cn(
                      'flex min-h-11 items-center gap-3 rounded-xl border p-3 text-left transition-colors',
                      method === id
                        ? 'border-primary bg-primary-light'
                        : 'border-border hover:border-foreground/30',
                    )}
                  >
                    <Icon aria-hidden className="size-5 text-primary" />
                    <span>
                      <span className="block text-sm font-semibold">{label}</span>
                      <span className="block text-xs text-muted">{hint}</span>
                    </span>
                  </button>
                ))}
              </div>
              <div className="mt-4 border-t border-border pt-4">
                {method === 'upi' ? (
                  <UpiQr amountPaise={booking.price.totalPaise} reference={booking.reference} />
                ) : (
                  <p className="text-sm text-muted">
                    You'll enter your {METHOD_NOUN[method]} details on the payment gateway's secure
                    page. ZPROO GO never sees or stores them.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          {order.error && <FormAlert>{errorMessage(order.error)}</FormAlert>}
          {pay.error && <FormAlert>{errorMessage(pay.error)}</FormAlert>}
          {pay.data?.status === 'FAILED' && (
            <FormAlert>The payment was declined. No money was taken — you can try again.</FormAlert>
          )}

          {order.isPending ? (
            <Skeleton className="h-28 rounded-2xl" />
          ) : mock ? (
            <Card className="border-dashed">
              <CardContent className="space-y-3 p-5">
                <p className="text-sm">
                  <strong>Test gateway.</strong> This environment uses a simulated payment provider
                  — nothing is charged. Choose an outcome to continue.
                </p>
                <div className="flex flex-wrap gap-3">
                  <Button
                    size="lg"
                    data-testid="checkout-pay-submit"
                    disabled={pay.isPending || !order.data}
                    onClick={() => submit('success')}
                  >
                    <Lock aria-hidden />{' '}
                    {pay.isPending
                      ? 'Processing payment...'
                      : `Pay ${inr(booking.price.totalPaise)}`}
                  </Button>
                  <Button
                    size="lg"
                    variant="outline"
                    data-testid="checkout-pay-fail"
                    disabled={pay.isPending || !order.data}
                    onClick={() => submit('failure')}
                  >
                    Simulate a failed payment
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            order.data && (
              <FormAlert>
                Online payment isn't available right now. Your seats stay held until the timer runs
                out.
              </FormAlert>
            )
          )}
          <p className="flex items-center gap-1.5 text-xs text-muted">
            <Lock aria-hidden className="size-3.5" /> Payments are verified on our servers before
            your booking is confirmed. We never store card details.
          </p>
        </>
      )}
    </CheckoutShell>
  );
}
