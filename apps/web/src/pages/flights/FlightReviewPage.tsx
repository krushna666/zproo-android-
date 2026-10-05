import { useMutation } from '@tanstack/react-query';
import type { FlightOffer } from '@zproo/types';
import { Button, Card, CardContent, CardHeader, CardTitle, Skeleton } from '@zproo/ui';
import { flightPriceBreakdown } from '@zproo/utils';
import { ArrowRight, Lock, Mail, Phone } from 'lucide-react';
import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router';
import { FormAlert } from '@/features/auth/components/FormAlert';
import { errorMessage } from '@/features/auth/errors';
import { flightsApi, useItineraryOffers } from '@/features/flights/api';
import { CheckoutShell, NothingSelected } from '@/features/checkout/CheckoutShell';
import { DemoBanner } from '@/features/checkout/DemoBanner';
import { ItinerarySummary } from '@/features/flights/components/ItinerarySummary';
import { PriceSummary } from '@/features/checkout/PriceSummary';
import { useFlightDraft } from '@/features/flights/draft';
import { inr } from '@/features/flights/format';
import { paymentUrl } from '@/features/checkout/links';
import { ApiClientError } from '@/services/http';

const TITLE = { MR: 'Mr', MRS: 'Mrs', MS: 'Ms', MSTR: 'Master', MISS: 'Miss' } as const;

export default function FlightReviewPage() {
  const draft = useFlightDraft();
  if (!draft.itinerary) return <NothingSelected />;
  if (!draft.passengers || !draft.contact) return <Navigate to="/flights/booking" replace />;
  return <Review />;
}

function Review() {
  const navigate = useNavigate();
  const draft = useFlightDraft();
  const itinerary = draft.itinerary as NonNullable<typeof draft.itinerary>;
  const passengers = draft.passengers ?? [];
  const contact = draft.contact as NonNullable<typeof draft.contact>;
  const {
    offers,
    isPending,
    error: offersError,
    refetch,
  } = useItineraryOffers(itinerary.offerIds, itinerary.pax);
  const [unavailable, setUnavailable] = useState(false);

  const book = useMutation({
    mutationFn: () =>
      flightsApi.book(
        {
          offerIds: itinerary.offerIds,
          passengers,
          contact,
          expectedTotalPaise: itinerary.expectedTotalPaise,
        },
        draft.idempotencyKey,
      ),
    onSuccess: (booking) => {
      draft.setReference(booking.reference);
      void navigate(paymentUrl('flight', booking.reference));
    },
    onError: (err) => {
      if (err instanceof ApiClientError && err.errorCode === 'PRICE_CHANGED') void refetch();
      if (
        err instanceof ApiClientError &&
        (err.errorCode === 'SOLD_OUT' || err.errorCode === 'OFFER_EXPIRED')
      ) {
        setUnavailable(true);
      }
    },
  });

  const currentTotal = offers?.reduce((sum, o) => sum + o.totalPaise, 0);
  const priceMoved = currentTotal !== undefined && currentTotal !== itinerary.expectedTotalPaise;
  const bookingError =
    book.error instanceof ApiClientError && book.error.errorCode === 'PRICE_CHANGED'
      ? null
      : book.error;

  const continueToPayment = () => {
    // Already booked from this draft (e.g. came back from payment): don't book again.
    if (draft.reference) return void navigate(paymentUrl('flight', draft.reference));
    book.mutate();
  };

  return (
    <CheckoutShell
      step={2}
      title="Review your booking"
      back={{ to: '/flights/booking', label: 'Edit travellers' }}
      aside={
        offers ? (
          <>
            <PriceSummary price={flightPriceBreakdown(offers, itinerary.pax)} />
            {priceMoved ? (
              <PriceChanged
                from={itinerary.expectedTotalPaise}
                to={currentTotal}
                onAccept={() => {
                  draft.acceptPrice(currentTotal);
                  book.reset();
                }}
              />
            ) : (
              <Button
                size="lg"
                className="w-full"
                disabled={book.isPending || unavailable}
                onClick={continueToPayment}
              >
                <Lock aria-hidden />{' '}
                {book.isPending ? 'Holding your seats…' : 'Continue to payment'}
                {!book.isPending && <ArrowRight aria-hidden />}
              </Button>
            )}
            <p className="text-center text-xs text-muted">
              By continuing you agree to the fare rules, our{' '}
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
        ) : (
          <Skeleton className="h-64 rounded-2xl" />
        )
      }
    >
      {offers?.some((o) => o.provider === 'mock') && <DemoBanner />}
      {unavailable && (
        <FormAlert>
          {errorMessage(book.error)}{' '}
          <Link to={itinerary.searchUrl} className="underline">
            Choose another flight
          </Link>
        </FormAlert>
      )}
      {bookingError && !unavailable && <FormAlert>{errorMessage(bookingError)}</FormAlert>}
      {offersError && !unavailable && (
        <FormAlert>
          {errorMessage(offersError)}{' '}
          <Link to={itinerary.searchUrl} className="underline">
            Choose another flight
          </Link>
        </FormAlert>
      )}

      <section aria-labelledby="itinerary-heading" className="space-y-3">
        <h2 id="itinerary-heading" className="text-lg font-bold">
          Itinerary
        </h2>
        {isPending || !offers ? (
          <Skeleton className="h-48 rounded-2xl" />
        ) : (
          <ItinerarySummary offers={offers as FlightOffer[]} detailed />
        )}
      </section>

      <Card>
        <CardHeader className="flex-row items-center justify-between pb-3">
          <CardTitle className="text-base">Travellers</CardTitle>
          <Link
            to="/flights/booking"
            className="text-sm font-semibold text-primary hover:underline"
          >
            Edit
          </Link>
        </CardHeader>
        <CardContent>
          <ol className="divide-y divide-border text-sm">
            {passengers.map((p, i) => (
              <li key={i} className="flex justify-between gap-3 py-2">
                <span className="font-semibold">
                  {TITLE[p.title]} {p.firstName} {p.lastName}
                </span>
                <span className="text-muted">
                  {p.type.charAt(0) + p.type.slice(1).toLowerCase()}
                  {p.dateOfBirth && ` · born ${p.dateOfBirth}`}
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

function PriceChanged({ from, to, onAccept }: { from: number; to: number; onAccept: () => void }) {
  return (
    <div
      role="alert"
      className="space-y-3 rounded-2xl border border-warning/50 bg-warning/10 p-4 text-sm"
    >
      <p>
        <strong>The fare has changed</strong> from {inr(from)} to {inr(to)} since you selected it.
      </p>
      <Button className="w-full" onClick={onAccept}>
        Continue with {inr(to)}
      </Button>
    </div>
  );
}
