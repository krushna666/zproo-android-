import type { BookingDetails } from '@zproo/types';
import { Button, Card, CardContent, CardHeader, CardTitle, FormAlert, Skeleton } from '@zproo/ui';
import { Mail, Phone } from 'lucide-react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router';
import { useBooking } from '@/features/checkout/api';
import { CheckoutShell } from '@/features/checkout/CheckoutShell';
import { CouponBox } from '@/features/checkout/CouponBox';
import { DemoBanner } from '@/features/checkout/DemoBanner';
import { HoldExpired, HoldTimer } from '@/features/checkout/HoldTimer';
import { paymentUrl } from '@/features/checkout/links';
import { PriceSummary } from '@/features/checkout/PriceSummary';
import { isAwaitingPayment } from '@/features/checkout/status';
import { TermsAndProceed } from '@/features/checkout/TermsAndProceed';
import { ItinerarySummary } from '@/features/flights/components/ItinerarySummary';
import { useFlightDraft } from '@/features/flights/draft';
import { inr } from '@/features/flights/format';
import { useCountdown } from '@/hooks/useCountdown';
import { userMessage } from '@/lib/apiErrors';

const TITLE: Record<string, string> = {
  MR: 'Mr',
  MRS: 'Mrs',
  MS: 'Ms',
  MSTR: 'Master',
  MISS: 'Miss',
};

export default function FlightReviewPage() {
  const [params] = useSearchParams();
  const draftRef = useFlightDraft((s) => s.reference);
  const reference = params.get('ref') ?? draftRef;
  const { data: booking, isPending, error, refetch } = useBooking(reference);

  if (!reference) return <Navigate to="/flights" replace />;
  if (isPending) {
    return (
      <CheckoutShell step={2} service="flight" title="Review your booking">
        <Skeleton className="h-96 rounded-[14px]" />
      </CheckoutShell>
    );
  }
  if (error || !booking || booking.flights.length === 0) {
    return (
      <CheckoutShell step={2} service="flight" title="Review your booking">
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
  const secondsLeft = useCountdown(booking.holdExpiresAt ? Date.parse(booking.holdExpiresAt) : 0);
  const expired = !isAwaitingPayment(booking) || secondsLeft === 0;
  const offerUrl = useFlightDraft((s) => s.selection?.offerUrl);

  return (
    <CheckoutShell
      step={2}
      service="flight"
      title="Review your booking"
      back={{ to: '/flights/booking', label: 'Edit travellers' }}
      aside={
        <>
          <PriceSummary price={booking.price} />
          {!expired && <CouponBox booking={booking} />}
          {!expired && (
            <TermsAndProceed
              totalPaise={booking.price.totalPaise}
              policy="the airline fare rules"
              onProceed={() => void navigate(paymentUrl('flight', booking.reference))}
            />
          )}
        </>
      }
    >
      {booking.demo && <DemoBanner service="flight" />}
      {expired ? <HoldExpired searchHref="/flights" /> : <HoldTimer secondsLeft={secondsLeft} />}

      <section aria-labelledby="itinerary-heading" className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 id="itinerary-heading" className="text-lg font-bold">
            Itinerary
          </h2>
          {!expired && offerUrl && (
            <Link to={offerUrl} className="text-sm font-semibold text-primary hover:underline">
              Change fare
            </Link>
          )}
        </div>
        <ItinerarySummary legs={booking.flights} detailed />
      </section>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Fare benefits</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {booking.flights.map((leg) => (
            <div key={leg.sequence}>
              <p className="font-semibold">
                {booking.flights.length > 1 ? (leg.sequence === 1 ? 'Outbound: ' : 'Return: ') : ''}
                {leg.fare.name}
              </p>
              <p className="text-muted">
                Cabin {leg.fare.cabinBaggageKg} kg · Check-in {leg.fare.checkinBaggageKg} kg ·{' '}
                {leg.fare.changeFee === 0
                  ? 'free date change'
                  : `change fee ${inr(leg.fare.changeFee)}`}{' '}
                ·{' '}
                {leg.fare.cancellationFee === null
                  ? 'non-refundable'
                  : leg.fare.cancellationFee === 0
                    ? 'free cancellation'
                    : `cancellation fee ${inr(leg.fare.cancellationFee)}`}{' '}
                · meal {leg.fare.meal === 'INCLUDED' ? 'included' : 'at a charge'}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between pb-3">
          <CardTitle className="text-base">Travellers</CardTitle>
          {!expired && (
            <Link
              to="/flights/booking"
              className="text-sm font-semibold text-primary hover:underline"
            >
              Edit
            </Link>
          )}
        </CardHeader>
        <CardContent>
          <ol className="divide-y divide-border text-sm">
            {booking.passengers.map((p) => (
              <li key={p.id} className="flex flex-wrap justify-between gap-3 py-2">
                <span className="font-semibold">
                  {TITLE[p.title] ?? p.title} {p.firstName} {p.lastName}
                </span>
                <span className="text-muted">
                  {p.type.charAt(0) + p.type.slice(1).toLowerCase()}
                  {p.dateOfBirth ? ` · born ${p.dateOfBirth}` : ''}
                  {p.travellingWith !== null && booking.passengers[p.travellingWith]
                    ? ` · with ${booking.passengers[p.travellingWith]?.firstName ?? ''}`
                    : ''}
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
    </CheckoutShell>
  );
}
