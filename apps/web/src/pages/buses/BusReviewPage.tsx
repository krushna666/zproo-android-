import type { BookingDetails } from '@zproo/types';
import { Button, Card, CardContent, CardHeader, CardTitle, FormAlert, Skeleton } from '@zproo/ui';
import { formatMoney } from '@zproo/utils';
import { Lock, Mail, Phone } from 'lucide-react';
import { useId, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router';
import { BusTripSummary } from '@/features/buses/components/BusTripSummary';
import { useBusDraft } from '@/features/buses/draft';
import { policyRows } from '@/features/buses/format';
import { useBooking } from '@/features/checkout/api';
import { CheckoutShell } from '@/features/checkout/CheckoutShell';
import { CouponBox } from '@/features/checkout/CouponBox';
import { DemoBanner } from '@/features/checkout/DemoBanner';
import { HoldExpired, HoldTimer } from '@/features/checkout/HoldTimer';
import { paymentUrl } from '@/features/checkout/links';
import { PriceSummary } from '@/features/checkout/PriceSummary';
import { isAwaitingPayment } from '@/features/checkout/status';
import { useCountdown } from '@/hooks/useCountdown';
import { userMessage } from '@/lib/apiErrors';

const GENDER = { MALE: 'Male', FEMALE: 'Female', OTHER: 'Other' } as const;

export default function BusReviewPage() {
  const [params] = useSearchParams();
  const draftRef = useBusDraft((s) => s.reference);
  const reference = params.get('ref') ?? draftRef;
  const { data: booking, isPending, error, refetch } = useBooking(reference);

  if (!reference) return <Navigate to="/buses" replace />;
  if (isPending) {
    return (
      <CheckoutShell step={3} service="bus" title="Review your booking">
        <Skeleton className="h-96 rounded-[14px]" />
      </CheckoutShell>
    );
  }
  if (error || !booking?.bus) {
    return (
      <CheckoutShell step={3} service="bus" title="Review your booking">
        <div role="alert" className="space-y-3">
          <FormAlert>{userMessage(error)}</FormAlert>
          <Button variant="outline" onClick={() => void refetch()}>
            Retry
          </Button>
        </div>
      </CheckoutShell>
    );
  }
  return <Review booking={booking} />;
}

function Review({ booking }: { booking: BookingDetails }) {
  const navigate = useNavigate();
  const termsId = useId();
  const [accepted, setAccepted] = useState(false);
  const [termsError, setTermsError] = useState(false);
  const bus = booking.bus as NonNullable<BookingDetails['bus']>;
  const seatsUrl = `/buses/${encodeURIComponent(bus.trip.tripId)}/seats`;
  const secondsLeft = useCountdown(booking.holdExpiresAt ? Date.parse(booking.holdExpiresAt) : 0);
  const expired = !isAwaitingPayment(booking) || secondsLeft === 0;

  const proceed = () => {
    if (!accepted) {
      setTermsError(true);
      document.getElementById(termsId)?.focus();
      return;
    }
    void navigate(paymentUrl('bus', booking.reference));
  };

  return (
    <CheckoutShell
      step={3}
      service="bus"
      title="Review your booking"
      back={{ to: '/buses/booking', label: 'Edit travellers' }}
      aside={
        <>
          <PriceSummary price={booking.price} />
          {!expired && <CouponBox booking={booking} />}
          {!expired && (
            <div className="space-y-3">
              <div>
                <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm">
                  <input
                    id={termsId}
                    type="checkbox"
                    data-testid="checkout-terms"
                    checked={accepted}
                    aria-invalid={termsError || undefined}
                    aria-describedby={termsError ? `${termsId}-error` : undefined}
                    onChange={(e) => {
                      setAccepted(e.target.checked);
                      if (e.target.checked) setTermsError(false);
                    }}
                    className="mt-0.5 size-4 accent-primary"
                  />
                  <span>
                    I agree to the operator's cancellation policy, the{' '}
                    <Link to="/terms" className="font-semibold text-primary underline">
                      Terms
                    </Link>{' '}
                    and the{' '}
                    <Link to="/refund-policy" className="font-semibold text-primary underline">
                      Refund Policy
                    </Link>
                    .
                  </span>
                </label>
                {termsError && (
                  <p
                    id={`${termsId}-error`}
                    data-testid="field-error-terms"
                    className="text-xs font-semibold text-danger"
                  >
                    Please accept the terms to continue
                  </p>
                )}
              </div>
              <Button size="lg" className="w-full" data-testid="checkout-proceed" onClick={proceed}>
                <Lock aria-hidden /> Proceed to pay {formatMoney(booking.price.totalPaise)}
              </Button>
            </div>
          )}
        </>
      }
    >
      {booking.demo && <DemoBanner service="bus" />}
      {expired ? <HoldExpired searchHref="/buses" /> : <HoldTimer secondsLeft={secondsLeft} />}

      <section aria-labelledby="journey-heading" className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 id="journey-heading" className="text-lg font-bold">
            Journey
          </h2>
          {!expired && (
            <Link to={seatsUrl} className="text-sm font-semibold text-primary hover:underline">
              Change seats
            </Link>
          )}
        </div>
        <BusTripSummary
          trip={bus.trip}
          boarding={bus.boardingPoint}
          dropping={bus.droppingPoint}
          seats={bus.seats}
        />
      </section>

      <Card>
        <CardHeader className="flex-row items-center justify-between pb-3">
          <CardTitle className="text-base">Travellers</CardTitle>
          {!expired && (
            <Link
              to="/buses/booking"
              className="text-sm font-semibold text-primary hover:underline"
            >
              Edit
            </Link>
          )}
        </CardHeader>
        <CardContent>
          <ol className="divide-y divide-border text-sm">
            {booking.passengers.map((p) => (
              <li key={p.id} className="flex justify-between gap-3 py-2">
                <span className="font-semibold">
                  {p.firstName} {p.lastName}
                </span>
                <span className="text-muted">
                  {p.age} yrs · {p.gender ? GENDER[p.gender] : ''} · Seat {p.seatNumber}
                </span>
              </li>
            ))}
          </ol>
          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 border-t border-border pt-4 text-sm text-muted">
            <span className="inline-flex items-center gap-1.5">
              <Mail aria-hidden className="size-4" /> {booking.contact.email}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Phone aria-hidden className="size-4" /> {booking.contact.phone}
            </span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Cancellation policy</CardTitle>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <tbody className="divide-y divide-border">
              {policyRows(bus.trip.cancellationPolicy).map((r) => (
                <tr key={r.when}>
                  <td className="py-2 text-muted">{r.when}</td>
                  <td className="py-2 text-right font-semibold">{r.refund}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </CheckoutShell>
  );
}
