import { useQueryClient } from '@tanstack/react-query';
import type { FlightOfferDetails } from '@zproo/types';
import { Button, Card, CardContent, EmptyState, FormAlert, Skeleton } from '@zproo/ui';
import { ArrowRight, PlaneTakeoff, Timer } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router';
import { Seo } from '@/components/seo/Seo';
import { loginPath } from '@/features/auth/redirect';
import { useAuthStore } from '@/features/auth/store';
import { DemoBanner } from '@/features/checkout/DemoBanner';
import { PriceChangedDialog } from '@/features/checkout/PriceChangedDialog';
import { flightKeys, flightsApi, useFlightOffer } from '@/features/flights/api';
import { FareFamilies } from '@/features/flights/components/FareFamilies';
import { FlightTimeline } from '@/features/flights/components/FlightTimeline';
import { useFlightDraft } from '@/features/flights/draft';
import {
  inr,
  localDateOf,
  shortDay,
  sliceDeparture,
  travellersLabel,
} from '@/features/flights/format';
import { offerUrl } from '@/features/flights/links';
import { useCountdown } from '@/hooks/useCountdown';
import { syncServerClock } from '@/lib/clock';
import { userMessage } from '@/lib/apiErrors';
import { ApiClientError } from '@/services/http';

export default function FlightDetailsPage() {
  const { offerId } = useParams();
  const [params] = useSearchParams();
  const returnId = params.get('return') ?? undefined;
  const outbound = useFlightOffer(offerId);
  const inbound = useFlightOffer(returnId);
  const error = outbound.error ?? inbound.error;

  if (outbound.isPending || (returnId && inbound.isPending)) {
    return (
      <div className="mx-auto max-w-6xl space-y-4 px-4 py-8 sm:px-6" aria-busy>
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-72 rounded-[14px]" />
      </div>
    );
  }
  if (error || !outbound.data) return <Unavailable error={error} />;
  return (
    <Fares
      key={`${outbound.data.offerId}:${inbound.data?.offerId ?? ''}`}
      outbound={outbound.data}
      inbound={inbound.data ?? null}
    />
  );
}

function Unavailable({ error }: { error: unknown }) {
  const gone = error instanceof ApiClientError && error.errorCode === 'FARE_UNAVAILABLE';
  return (
    <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
      <Seo title="Flight fares" noIndex />
      <EmptyState
        data-testid="flight-fare-unavailable"
        icon={PlaneTakeoff}
        title={
          gone
            ? 'This fare is no longer available. Please choose another flight or fare.'
            : userMessage(error)
        }
        actions={
          <Button asChild>
            <Link to="/flights">Search again</Link>
          </Button>
        }
      />
    </div>
  );
}

const mmss = (s: number) =>
  `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

function Fares({
  outbound,
  inbound,
}: {
  outbound: FlightOfferDetails;
  inbound: FlightOfferDetails | null;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const signedIn = useAuthStore((s) => s.status === 'authenticated');
  const draft = useFlightDraft();
  const previous = draft.selection?.offerId === outbound.offerId ? draft.selection : null;
  const [fareId, setFareId] = useState(previous?.fareId ?? outbound.fareFamilies[0]?.fareId ?? '');
  const [returnFareId, setReturnFareId] = useState(
    previous?.returnFareId ?? inbound?.fareFamilies[0]?.fareId ?? '',
  );
  const [change, setChange] = useState<{ oldTotal: number; newTotal: number } | null>(null);
  const [gone, setGone] = useState<unknown>(null);
  syncServerClock(outbound.serverNow);

  const fare = outbound.fareFamilies.find((f) => f.fareId === fareId);
  const returnFare = inbound?.fareFamilies.find((f) => f.fareId === returnFareId);
  const total = (fare?.total ?? 0) + (returnFare?.total ?? 0);
  // The offer that expires first sets the clock.
  const expiresAt = Math.min(
    Date.parse(outbound.expiresAt),
    inbound ? Date.parse(inbound.expiresAt) : Infinity,
  );
  const secondsLeft = useCountdown(expiresAt);

  // On expiry: re-price both offers; a new price asks the customer, a gone fare says so.
  const repricing = useRef(false);
  const pendingNavigation = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (secondsLeft > 0 || repricing.current) return;
    repricing.current = true;
    const familyOf = (d: FlightOfferDetails, id: string) =>
      d.fareFamilies.find((f) => f.fareId === id)?.name;
    void Promise.all([
      flightsApi.reprice(outbound.offerId),
      inbound ? flightsApi.reprice(inbound.offerId) : Promise.resolve(null),
    ])
      .then(([out, back]) => {
        const name = familyOf(outbound, fareId);
        const backName = inbound ? familyOf(inbound, returnFareId) : undefined;
        const nextFare = out.fareFamilies.find((f) => f.name === name);
        const nextBack = back?.fareFamilies.find((f) => f.name === backName);
        const newTotal = (nextFare?.total ?? 0) + (nextBack?.total ?? 0);
        queryClient.setQueryData(flightKeys.offer(out.offerId), out);
        if (back) queryClient.setQueryData(flightKeys.offer(back.offerId), back);
        const go = () => void navigate(offerUrl(out.offerId, back?.offerId), { replace: true });
        if (newTotal !== total) {
          setChange({ oldTotal: total, newTotal });
          pendingNavigation.current = go;
        } else go();
      })
      .catch((err: unknown) => setGone(err));
  }, [secondsLeft, outbound, inbound, fareId, returnFareId, total, navigate, queryClient]);

  if (gone) return <Unavailable error={gone} />;

  const proceed = () => {
    if (!fare || (inbound && !returnFare)) return;
    draft.start({
      offerId: outbound.offerId,
      fareId: fare.fareId,
      ...(inbound && returnFare
        ? { returnOfferId: inbound.offerId, returnFareId: returnFare.fareId }
        : {}),
      pax: outbound.pax,
      expectedTotal: total,
      offerUrl: location.pathname + location.search,
    });
    // Logged out: the draft is saved; log in and come back here (re-priced on return).
    if (!signedIn) return void navigate(loginPath(location.pathname + location.search));
    void navigate('/flights/booking');
  };

  const legs = inbound ? [outbound, inbound] : [outbound];
  const first = outbound.slices[0]?.segments[0];
  const last = outbound.slices[0]?.segments.at(-1);
  return (
    <div className="mx-auto max-w-6xl px-4 py-6 pb-28 sm:px-6 sm:py-8">
      <Seo title="Choose your fare" noIndex />
      <button
        type="button"
        onClick={() => void navigate(-1)}
        className="mb-4 inline-flex min-h-11 items-center text-sm font-semibold text-primary hover:underline"
      >
        ← Back to results
      </button>
      <h1 className="text-[28px] font-extrabold tracking-tight">
        {first?.from} {inbound ? '⇄' : '→'} {last?.to}
      </h1>
      <p className="mt-1 text-muted">
        {travellersLabel(outbound.pax)} · {outbound.cabin.replace('_', ' ').toLowerCase()}
      </p>
      <div
        role="timer"
        aria-live="off"
        data-testid="flight-fare-timer"
        className="mt-4 inline-flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm"
      >
        <Timer aria-hidden className="size-4 text-primary" /> Fare valid for{' '}
        <strong className="tabular-nums">{mmss(secondsLeft)}</strong>
      </div>
      <div className="mt-4">
        <DemoBanner service="flight" />
      </div>

      {legs.map((leg, i) => {
        const slice = leg.slices[0];
        if (!slice) return null;
        const value = i === 0 ? fareId : returnFareId;
        const setValue = i === 0 ? setFareId : setReturnFareId;
        return (
          <section key={leg.offerId} className="mt-8 space-y-4" aria-labelledby={`leg-${i}`}>
            <h2 id={`leg-${i}`} className="text-lg font-bold">
              {inbound ? (i === 0 ? 'Outbound' : 'Return') : 'Your flight'} ·{' '}
              {shortDay(localDateOf(sliceDeparture(slice)))}
            </h2>
            <Card>
              <CardContent className="p-4 sm:p-5">
                <FlightTimeline slice={slice} />
              </CardContent>
            </Card>
            <FareFamilies
              fares={leg.fareFamilies}
              value={value}
              onChange={setValue}
              pax={leg.pax}
              legend={`Fares for ${slice.segments[0]?.from} to ${slice.segments.at(-1)?.to}`}
            />
            <details className="rounded-[14px] border border-border bg-card p-4">
              <summary className="cursor-pointer text-sm font-semibold">Fare rules</summary>
              <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-muted">
                {leg.fareRules.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </details>
          </section>
        );
      })}
      {secondsLeft === 0 && !change && <FormAlert>Checking the latest fare...</FormAlert>}

      <div className="fixed inset-x-0 bottom-[var(--bottom-nav-height)] z-30 border-t border-border bg-card py-3 lg:bottom-0">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <div>
            <p className="text-xs text-muted">Total for {travellersLabel(outbound.pax)}</p>
            <p className="text-xl font-extrabold tabular-nums" data-testid="flight-fare-total">
              {inr(total)}
            </p>
          </div>
          <Button
            size="lg"
            data-testid="flight-continue"
            disabled={!fare || (Boolean(inbound) && !returnFare) || secondsLeft === 0}
            onClick={proceed}
          >
            Continue <ArrowRight aria-hidden />
          </Button>
        </div>
      </div>

      <PriceChangedDialog
        change={change}
        onContinue={() => {
          setChange(null);
          pendingNavigation.current?.();
        }}
        onBack={() => {
          setChange(null);
          void navigate(-1);
        }}
      />
    </div>
  );
}
