import { useMutation } from '@tanstack/react-query';
import { Button, Card, CardContent, CardHeader, CardTitle, Skeleton } from '@zproo/ui';
import { ArrowRight, Lock, Mail, Phone } from 'lucide-react';
import { Link, Navigate, useNavigate } from 'react-router';
import { FormAlert } from '@/features/auth/components/FormAlert';
import { errorMessage } from '@/features/auth/errors';
import { busesApi, useBusTrip, useSeatMap } from '@/features/buses/api';
import { BusTripSummary } from '@/features/buses/components/BusTripSummary';
import { useBusDraft, type BusSelection } from '@/features/buses/draft';
import { busPriceBreakdown } from '@/features/buses/price';
import { CheckoutShell, NothingSelected } from '@/features/checkout/CheckoutShell';
import { DemoBanner } from '@/features/checkout/DemoBanner';
import { paymentUrl } from '@/features/checkout/links';
import { PriceSummary } from '@/features/checkout/PriceSummary';
import { inr } from '@/features/flights/format';
import { ApiClientError } from '@/services/http';

const GENDER = { MALE: 'Male', FEMALE: 'Female', OTHER: 'Other' } as const;

export default function BusReviewPage() {
  const draft = useBusDraft();
  if (!draft.selection) return <NothingSelected service="bus" />;
  if (!draft.passengers || !draft.contact) return <Navigate to="/buses/booking" replace />;
  return <Review selection={draft.selection} />;
}

function Review({ selection }: { selection: BusSelection }) {
  const navigate = useNavigate();
  const draft = useBusDraft();
  const passengers = draft.passengers ?? [];
  const contact = draft.contact as NonNullable<typeof draft.contact>;
  const trip = useBusTrip(selection.tripId);
  const map = useSeatMap(selection.tripId);

  // Re-check the chosen seats against the live seat map before booking.
  const live = new Map(map.data?.decks.flatMap((d) => d.seats).map((s) => [s.number, s]) ?? []);
  const taken = map.data
    ? selection.seats.filter((s) => !live.get(s.number)?.available && !draft.reference)
    : [];
  const liveSeats = selection.seats.map((s) => ({
    ...s,
    pricePaise: live.get(s.number)?.pricePaise ?? s.pricePaise,
  }));
  const currentTotal = liveSeats.reduce((sum, s) => sum + s.pricePaise, 0);
  const priceMoved = !draft.reference && currentTotal !== selection.expectedTotalPaise;

  const book = useMutation({
    mutationFn: () =>
      busesApi.book(
        {
          tripId: selection.tripId,
          boardingPointId: selection.boardingPointId,
          droppingPointId: selection.droppingPointId,
          passengers,
          contact,
          expectedTotalPaise: selection.expectedTotalPaise,
        },
        draft.idempotencyKey,
      ),
    onSuccess: (booking) => {
      draft.setReference(booking.reference);
      void navigate(paymentUrl('bus', booking.reference));
    },
    onError: (err) => {
      if (
        err instanceof ApiClientError &&
        ['PRICE_CHANGED', 'SEAT_UNAVAILABLE'].includes(err.errorCode)
      ) {
        void map.refetch();
      }
    },
  });

  const continueToPayment = () => {
    // Already booked from this draft (e.g. came back from payment): don't book again.
    if (draft.reference) return void navigate(paymentUrl('bus', draft.reference));
    book.mutate();
  };
  const seatError =
    book.error instanceof ApiClientError && book.error.errorCode === 'PRICE_CHANGED'
      ? null
      : book.error;

  return (
    <CheckoutShell
      step={3}
      service="bus"
      title="Review your booking"
      back={{ to: '/buses/booking', label: 'Edit travellers' }}
      aside={
        <>
          <PriceSummary price={busPriceBreakdown({ seats: liveSeats })} />
          {taken.length > 0 ? (
            <div
              role="alert"
              className="space-y-3 rounded-2xl border border-danger/40 bg-danger/5 p-4 text-sm"
            >
              <p>
                Seat{taken.length === 1 ? '' : 's'} {taken.map((s) => s.number).join(', ')}{' '}
                {taken.length === 1 ? 'was' : 'were'} just booked by someone else.
              </p>
              <Button asChild className="w-full">
                <Link to={selection.seatsUrl}>Choose other seats</Link>
              </Button>
            </div>
          ) : priceMoved ? (
            <div
              role="alert"
              className="space-y-3 rounded-2xl border border-warning/50 bg-warning/10 p-4 text-sm"
            >
              <p>
                <strong>The fare has changed</strong> from {inr(selection.expectedTotalPaise)} to{' '}
                {inr(currentTotal)}.
              </p>
              <Button
                className="w-full"
                onClick={() => {
                  draft.acceptPrice(currentTotal);
                  book.reset();
                }}
              >
                Continue with {inr(currentTotal)}
              </Button>
            </div>
          ) : (
            <Button
              size="lg"
              className="w-full"
              disabled={book.isPending || map.isPending}
              onClick={continueToPayment}
            >
              <Lock aria-hidden /> {book.isPending ? 'Holding your seats…' : 'Continue to payment'}
              {!book.isPending && <ArrowRight aria-hidden />}
            </Button>
          )}
          <p className="text-center text-xs text-muted">
            By continuing you agree to the operator's cancellation policy, our{' '}
            <Link to="/terms" className="underline">
              Terms
            </Link>{' '}
            and{' '}
            <Link to="/refund-policy" className="underline">
              Refund Policy
            </Link>
            .
          </p>
        </>
      }
    >
      {trip.data?.provider === 'mock' && <DemoBanner service="bus" />}
      {seatError && <FormAlert>{errorMessage(seatError)}</FormAlert>}
      {trip.error && <FormAlert>{errorMessage(trip.error)}</FormAlert>}

      <section aria-labelledby="journey-heading" className="space-y-3">
        <h2 id="journey-heading" className="text-lg font-bold">
          Journey
        </h2>
        {trip.data ? (
          <BusTripSummary
            trip={trip.data}
            boarding={trip.data.boardingPoints.find((p) => p.id === selection.boardingPointId)}
            dropping={trip.data.droppingPoints.find((p) => p.id === selection.droppingPointId)}
            seatNumbers={selection.seats.map((s) => s.number)}
          />
        ) : (
          <Skeleton className="h-48 rounded-2xl" />
        )}
      </section>

      <Card>
        <CardHeader className="flex-row items-center justify-between pb-3">
          <CardTitle className="text-base">Travellers</CardTitle>
          <Link to="/buses/booking" className="text-sm font-semibold text-primary hover:underline">
            Edit
          </Link>
        </CardHeader>
        <CardContent>
          <ol className="divide-y divide-border text-sm">
            {passengers.map((p) => (
              <li key={p.seatNumber} className="flex justify-between gap-3 py-2">
                <span className="font-semibold">
                  {p.firstName} {p.lastName}
                </span>
                <span className="text-muted">
                  {p.age} yrs · {GENDER[p.gender]} · Seat {p.seatNumber}
                </span>
              </li>
            ))}
          </ol>
          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 border-t border-border pt-4 text-sm text-muted">
            <span className="inline-flex items-center gap-1.5">
              <Mail aria-hidden className="size-4" /> {contact.email}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Phone aria-hidden className="size-4" /> +91 {contact.phone.replace(/^\+91/, '')}
            </span>
          </div>
        </CardContent>
      </Card>
    </CheckoutShell>
  );
}
