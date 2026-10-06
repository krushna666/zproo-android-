import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { BusSeat, BusSeatMap, BusTripDetails } from '@zproo/types';
import { Button, EmptyState, FormAlert, Skeleton, toast } from '@zproo/ui';
import { formatMoney } from '@zproo/utils';
import { BUS_MESSAGES } from '@zproo/validation';
import { ArrowRight, BusFront, Info } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { loginPath } from '@/features/auth/redirect';
import { useAuthStore } from '@/features/auth/store';
import { busKeys, useBusTrip, useSeatMap } from '@/features/buses/api';
import { BusTripSummary } from '@/features/buses/components/BusTripSummary';
import { PointPicker } from '@/features/buses/components/PointPicker';
import { SeatMap } from '@/features/buses/components/SeatMap';
import { seatIsOpen } from '@/features/buses/seats';
import { useBusDraft } from '@/features/buses/draft';
import { busPriceBreakdown } from '@/features/buses/price';
import { checkoutApi } from '@/features/checkout/api';
import { CheckoutShell } from '@/features/checkout/CheckoutShell';
import { DemoBanner } from '@/features/checkout/DemoBanner';
import { userMessage } from '@/lib/apiErrors';

const LADIES_NOTE = "This seat is reserved for women. You'll need to enter a female traveller.";

function seatUnavailableMessage(seats: string[]): string {
  const list =
    seats.length <= 1 ? (seats[0] ?? '') : `${seats.slice(0, -1).join(', ')} and ${seats.at(-1)}`;
  return `Seat ${list} was just booked by someone else. Please choose another seat.`;
}

/**
 * Back on the seat page with an unpaid hold from this draft (e.g. "Change seats" from review): the
 * customer is choosing again, so the old hold is released first — otherwise their own seats
 * would show as taken.
 */
function useReleaseOwnHold(tripId: string | undefined) {
  const queryClient = useQueryClient();
  const draft = useBusDraft();
  const own = draft.reference !== null && draft.selection?.tripId === tripId;
  const release = useMutation({
    mutationFn: (reference: string) => checkoutApi.releaseHold(reference),
    onSettled: async () => {
      useBusDraft.getState().forgetReference();
      await queryClient.invalidateQueries({ queryKey: busKeys.seats(tripId ?? '') });
    },
  });
  const { mutate } = release;
  useEffect(() => {
    if (own && draft.reference) mutate(draft.reference);
  }, [own, draft.reference, mutate]);
  return own || release.isPending;
}

export default function BusSeatsPage() {
  const { id } = useParams();
  const releasing = useReleaseOwnHold(id);
  const trip = useBusTrip(id);
  const map = useSeatMap(id);

  if (releasing || trip.isPending || map.isPending) {
    return (
      <CheckoutShell step={1} service="bus" title="Choose your seats">
        <Skeleton className="h-96 rounded-[14px]" data-testid="bus-seats-loading" />
      </CheckoutShell>
    );
  }
  if (trip.error || map.error || !trip.data || !map.data) {
    return (
      <CheckoutShell step={1} service="bus" title="Choose your seats">
        <div data-testid="bus-seats-error" role="alert" className="space-y-3">
          <FormAlert>{userMessage(trip.error ?? map.error)}</FormAlert>
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => {
                void trip.refetch();
                void map.refetch();
              }}
            >
              Retry
            </Button>
            <Button asChild variant="ghost">
              <Link to="/buses">Search buses</Link>
            </Button>
          </div>
        </div>
      </CheckoutShell>
    );
  }
  if (!trip.data.bookable || !map.data.bookable) {
    return (
      <CheckoutShell step={1} service="bus" title="Choose your seats">
        <EmptyState
          icon={BusFront}
          title={BUS_MESSAGES.closed}
          description="Sales close 30 minutes before departure. Please choose another bus."
          actions={
            <Button asChild>
              <Link to="/buses">Search buses</Link>
            </Button>
          }
        />
      </CheckoutShell>
    );
  }
  return <Seats key={trip.data.tripId} trip={trip.data} map={map.data} />;
}

function Seats({ trip, map }: { trip: BusTripDetails; map: BusSeatMap }) {
  const navigate = useNavigate();
  const location = useLocation();
  const back = (location.state as { from?: string } | null)?.from;
  const signedIn = useAuthStore((s) => s.status === 'authenticated');
  const draft = useBusDraft();
  // Back from checkout, or returning from login: start from what was chosen (re-validated below).
  const previous = draft.selection?.tripId === trip.tripId ? draft.selection : null;
  const [selected, setSelected] = useState<string[]>(previous?.seats.map((s) => s.seatNo) ?? []);
  const [boardingId, setBoardingId] = useState(previous?.boardingPointId ?? '');
  const [droppingId, setDroppingId] = useState(previous?.droppingPointId ?? '');
  const [ladiesNote, setLadiesNote] = useState(false);

  const seats = new Map(map.decks.flatMap((d) => d.seats).map((s) => [s.seatNo, s]));
  // Each refresh (20 s) re-checks the selection: seats someone else took drop out of it (they
  // stay listed in `selected` only until the next change) with the SEAT_UNAVAILABLE message.
  const chosen = selected
    .map((n) => seats.get(n))
    .filter((s): s is BusSeat => s !== undefined && seatIsOpen(s));
  const lost = selected.filter((n) => !chosen.some((s) => s.seatNo === n));
  const lostMessage = lost.length > 0 ? seatUnavailableMessage(lost) : null;
  const reported = useRef<string | null>(null);
  useEffect(() => {
    if (lostMessage && reported.current !== lostMessage) toast.error(lostMessage);
    reported.current = lostMessage;
  }, [lostMessage]);

  const price = busPriceBreakdown(
    chosen.map((s) => ({ seatNo: s.seatNo, price: s.price, ladiesOnly: s.ladiesOnly })),
    trip.busType.ac,
  );
  const ready = chosen.length > 0 && Boolean(boardingId) && Boolean(droppingId);

  const toggle = (seat: BusSeat) => {
    const current = chosen.map((s) => s.seatNo);
    if (current.includes(seat.seatNo)) {
      setSelected(current.filter((n) => n !== seat.seatNo));
      return;
    }
    if (chosen.length >= map.maxSelectable) {
      toast.error(BUS_MESSAGES.maxSeats);
      return;
    }
    if (seat.ladiesOnly) setLadiesNote(true);
    setSelected([...current, seat.seatNo]);
  };

  const proceed = () => {
    if (!ready) return;
    draft.start({
      tripId: trip.tripId,
      seats: chosen.map((s) => ({ seatNo: s.seatNo, price: s.price, ladiesOnly: s.ladiesOnly })),
      boardingPointId: boardingId,
      droppingPointId: droppingId,
      expectedTotal: price.totalPaise,
      seatsUrl: location.pathname,
    });
    // Logged out: the draft is saved; log in and come back here (seats re-checked on return).
    if (!signedIn) return void navigate(loginPath(location.pathname));
    void navigate('/buses/booking');
  };

  const seatList = chosen.map((s) => s.seatNo).join(', ');
  const bar = (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <p className="truncate text-xs text-muted" aria-live="polite">
          {chosen.length === 0
            ? 'No seats selected'
            : `Seat${chosen.length === 1 ? '' : 's'} ${seatList}`}
        </p>
        <p className="text-xl font-extrabold tabular-nums" data-testid="bus-seats-total">
          {formatMoney(price.totalPaise)}
        </p>
      </div>
      <Button
        size="lg"
        disabled={!ready}
        aria-disabled={!ready}
        data-testid="bus-seats-continue"
        onClick={proceed}
      >
        Continue <ArrowRight aria-hidden />
      </Button>
    </div>
  );

  return (
    <div className="pb-28">
      <CheckoutShell
        step={1}
        service="bus"
        title="Choose your seats"
        back={{ to: back ?? '/buses', label: back ? 'Back to buses' : 'Search buses' }}
        aside={
          <>
            <PointPicker
              kind="boarding"
              points={trip.boardingPoints}
              value={boardingId}
              onChange={setBoardingId}
              error={chosen.length > 0 && !boardingId ? BUS_MESSAGES.boardingPoint : undefined}
            />
            <PointPicker
              kind="dropping"
              points={trip.droppingPoints}
              value={droppingId}
              onChange={setDroppingId}
              error={chosen.length > 0 && !droppingId ? BUS_MESSAGES.droppingPoint : undefined}
            />
          </>
        }
      >
        <p className="-mt-3 text-sm text-muted">
          {trip.operator.name} · {trip.busType.label} · {trip.seatsLeft} seats left · up to{' '}
          {map.maxSelectable} per booking
        </p>
        {map.demo && <DemoBanner service="bus" />}
        {lostMessage && <FormAlert>{lostMessage}</FormAlert>}
        {ladiesNote && (
          <p
            role="status"
            className="flex items-start gap-2 rounded-xl border border-primary/30 bg-primary-light px-4 py-3 text-sm"
          >
            <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" /> {LADIES_NOTE}
          </p>
        )}
        <SeatMap map={map} selected={chosen.map((s) => s.seatNo)} onToggle={toggle} />
        <BusTripSummary
          trip={trip}
          boarding={trip.boardingPoints.find((p) => p.id === boardingId)}
          dropping={trip.droppingPoints.find((p) => p.id === droppingId)}
        />
      </CheckoutShell>
      <div className="fixed inset-x-0 bottom-[var(--bottom-nav-height)] z-30 border-t border-border bg-card py-3 lg:bottom-0">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">{bar}</div>
      </div>
    </div>
  );
}
