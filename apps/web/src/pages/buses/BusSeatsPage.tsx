import type { BusSeatInfo } from '@zproo/types';
import { Button, Card, CardContent, Skeleton } from '@zproo/ui';
import { ArrowRight } from 'lucide-react';
import { useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { FormAlert } from '@/features/auth/components/FormAlert';
import { errorMessage } from '@/features/auth/errors';
import { useBusTrip, useSeatMap } from '@/features/buses/api';
import { BusTripSummary } from '@/features/buses/components/BusTripSummary';
import { PointPicker } from '@/features/buses/components/PointPicker';
import { SeatMap } from '@/features/buses/components/SeatMap';
import { useBusDraft } from '@/features/buses/draft';
import { busTypeLabel } from '@/features/buses/format';
import { CheckoutShell } from '@/features/checkout/CheckoutShell';
import { DemoBanner } from '@/features/checkout/DemoBanner';
import { inr } from '@/features/flights/format';

export default function BusSeatsPage() {
  const { id } = useParams();
  const trip = useBusTrip(id);
  const map = useSeatMap(id);

  if (trip.isPending || map.isPending) {
    return (
      <CheckoutShell step={1} service="bus" title="Choose your seats">
        <Skeleton className="h-96 rounded-2xl" />
      </CheckoutShell>
    );
  }
  if (trip.error || map.error || !trip.data || !map.data) {
    return (
      <CheckoutShell step={1} service="bus" title="Choose your seats">
        <FormAlert>{errorMessage(trip.error ?? map.error)}</FormAlert>
        <Button asChild variant="outline">
          <Link to="/buses">Search buses</Link>
        </Button>
      </CheckoutShell>
    );
  }
  return <Seats key={trip.data.id} />;
}

function Seats() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const back = (location.state as { from?: string } | null)?.from;
  const trip = useBusTrip(id).data;
  const map = useSeatMap(id).data;
  const draft = useBusDraft();
  // Coming back from the traveller step: start from the seats and points already chosen.
  const previous = draft.selection?.tripId === trip?.id ? draft.selection : null;
  const [selected, setSelected] = useState<string[]>(previous?.seats.map((s) => s.number) ?? []);
  const [boardingId, setBoardingId] = useState(
    previous?.boardingPointId ?? trip?.boardingPoints[0]?.id ?? '',
  );
  const [droppingId, setDroppingId] = useState(
    previous?.droppingPointId ?? trip?.droppingPoints.at(-1)?.id ?? '',
  );
  const [notice, setNotice] = useState<string | null>(null);
  if (!trip || !map) return null;

  const seats = new Map(map.decks.flatMap((d) => d.seats).map((s) => [s.number, s]));
  // Seats someone else took since they were chosen drop out of the selection.
  const chosen = selected
    .map((n) => seats.get(n))
    .filter((s): s is BusSeatInfo => Boolean(s?.available));
  const lost = selected.length - chosen.length;
  const total = chosen.reduce((sum, s) => sum + s.pricePaise, 0);

  const toggle = (seat: BusSeatInfo) => {
    setNotice(null);
    if (selected.includes(seat.number)) {
      setSelected(selected.filter((n) => n !== seat.number));
    } else if (chosen.length >= map.maxSeats) {
      setNotice(`You can book up to ${map.maxSeats} seats at a time.`);
    } else {
      setSelected([...selected.filter((n) => seats.get(n)?.available), seat.number]);
    }
  };

  const proceed = () => {
    draft.start({
      tripId: trip.id,
      seats: chosen.map((s) => ({
        number: s.number,
        pricePaise: s.pricePaise,
        ladiesOnly: s.ladiesOnly,
      })),
      boardingPointId: boardingId,
      droppingPointId: droppingId,
      expectedTotalPaise: total,
      seatsUrl: location.pathname,
    });
    void navigate('/buses/booking');
  };

  const summary = (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <p className="truncate text-xs text-muted">
          {chosen.length === 0
            ? 'No seats selected'
            : `Seat${chosen.length === 1 ? '' : 's'} ${chosen.map((s) => s.number).join(', ')}`}
        </p>
        <p className="text-xl font-extrabold tabular-nums">{inr(total)}</p>
      </div>
      <Button
        size="lg"
        disabled={chosen.length === 0 || !boardingId || !droppingId}
        onClick={proceed}
      >
        Continue <ArrowRight aria-hidden />
      </Button>
    </div>
  );

  return (
    <div className="pb-28 lg:pb-0">
      <CheckoutShell
        step={1}
        service="bus"
        title="Choose your seats"
        back={{ to: back ?? '/buses', label: back ? 'Back to buses' : 'Search buses' }}
        aside={
          <>
            <PointPicker
              label="Boarding point"
              points={trip.boardingPoints}
              value={boardingId}
              onChange={setBoardingId}
            />
            <PointPicker
              label="Dropping point"
              points={trip.droppingPoints}
              value={droppingId}
              onChange={setDroppingId}
            />
            <Card className="hidden lg:block">
              <CardContent className="p-4">{summary}</CardContent>
            </Card>
          </>
        }
      >
        <p className="-mt-3 text-sm text-muted">
          {trip.operator.name} · {busTypeLabel(trip.bus)} · {trip.seatsAvailable} seats left
        </p>
        {trip.provider === 'mock' && <DemoBanner service="bus" />}
        {lost > 0 && (
          <FormAlert>
            {lost === 1 ? 'A seat you chose was' : `${lost} seats you chose were`} just booked by
            someone else and removed from your selection.
          </FormAlert>
        )}
        {notice && <FormAlert>{notice}</FormAlert>}
        <SeatMap map={map} selected={chosen.map((s) => s.number)} onToggle={toggle} />
        <BusTripSummary
          trip={trip}
          boarding={trip.boardingPoints.find((p) => p.id === boardingId)}
          dropping={trip.droppingPoints.find((p) => p.id === droppingId)}
        />
      </CheckoutShell>
      <div className="fixed inset-x-0 bottom-[var(--bottom-nav-height)] z-30 border-t border-border bg-card/95 px-4 py-3 backdrop-blur lg:hidden">
        {summary}
      </div>
    </div>
  );
}
