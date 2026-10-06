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
import { CHECKOUT_STEP } from '@/features/checkout/steps';
import { TermsAndProceed } from '@/features/checkout/TermsAndProceed';
import { StaySummary } from '@/features/hotels/components/StaySummary';
import { useHotelDraft } from '@/features/hotels/draft';
import { useCountdown } from '@/hooks/useCountdown';
import { userMessage } from '@/lib/apiErrors';

const STEP = CHECKOUT_STEP.hotel.review;

export default function HotelReviewPage() {
  const [params] = useSearchParams();
  const draftRef = useHotelDraft((s) => s.reference);
  const reference = params.get('ref') ?? draftRef;
  const { data: booking, isPending, error, refetch } = useBooking(reference);

  if (!reference) return <Navigate to="/hotels" replace />;
  if (isPending) {
    return (
      <CheckoutShell step={STEP} service="hotel" title="Review your booking">
        <Skeleton className="h-96 rounded-[14px]" />
      </CheckoutShell>
    );
  }
  if (error || !booking?.hotel) {
    return (
      <CheckoutShell step={STEP} service="hotel" title="Review your booking">
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
  const detailsUrl = useHotelDraft((s) => s.selection?.detailsUrl);
  const stay = booking.hotel;
  if (!stay) return null;

  return (
    <CheckoutShell
      step={STEP}
      service="hotel"
      title="Review your booking"
      back={{ to: '/hotels/booking', label: 'Edit guests' }}
      aside={
        <>
          <PriceSummary price={booking.price} />
          {!expired && <CouponBox booking={booking} />}
          {!expired && (
            <TermsAndProceed
              totalPaise={booking.price.totalPaise}
              policy="the hotel's cancellation terms and house rules"
              onProceed={() => void navigate(paymentUrl('hotel', booking.reference))}
            />
          )}
        </>
      }
    >
      {booking.demo && <DemoBanner service="hotel" />}
      {expired ? <HoldExpired searchHref="/hotels" /> : <HoldTimer secondsLeft={secondsLeft} />}

      <section aria-labelledby="stay-heading" className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 id="stay-heading" className="text-lg font-bold">
            Your stay
          </h2>
          {!expired && detailsUrl && (
            <Link to={detailsUrl} className="text-sm font-semibold text-primary hover:underline">
              Change rooms
            </Link>
          )}
        </div>
        <StaySummary stay={stay} detailed />
      </section>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Policies</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            <li>
              Check-in from {stay.hotel.checkInTime}, check-out until {stay.hotel.checkOutTime}.
            </li>
            {stay.hotel.houseRules.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between pb-3">
          <CardTitle className="text-base">Contact</CardTitle>
          {!expired && (
            <Link
              to="/hotels/booking"
              className="text-sm font-semibold text-primary hover:underline"
            >
              Edit
            </Link>
          )}
        </CardHeader>
        <CardContent className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted">
          <span className="inline-flex items-center gap-1.5">
            <Mail aria-hidden className="size-4" /> {booking.contact.email}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Phone aria-hidden className="size-4" /> {booking.contact.phone}
          </span>
        </CardContent>
      </Card>
    </CheckoutShell>
  );
}
