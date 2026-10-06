import { hotelPriceBreakdown } from '@zproo/catalog';
import type { HotelDetails, HotelRoomType, RoomOccupancy } from '@zproo/types';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  cn,
  Dialog,
  DialogContent,
  DialogTitle,
  EmptyState,
  FormAlert,
  Skeleton,
} from '@zproo/ui';
import {
  hotelRoomsQuerySchemaAt,
  hotelSearchInputFromParams,
  nightsBetween,
  serializeRooms,
} from '@zproo/validation';
import { ArrowRight, BedDouble, CalendarDays, Clock, MapPin, Pencil } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router';
import { Seo } from '@/components/seo/Seo';
import { loginPath } from '@/features/auth/redirect';
import { useAuthStore } from '@/features/auth/store';
import { DemoBanner } from '@/features/checkout/DemoBanner';
import { useHotelDetails, useHotelRooms } from '@/features/hotels/api';
import { Gallery } from '@/features/hotels/components/Gallery';
import { RoomTypeCard } from '@/features/hotels/components/RoomTypeCard';
import { fitProblem } from '@/features/hotels/rooms';
import { RatingBadge, Stars } from '@/features/hotels/components/Stars';
import { useHotelDraft, type HotelRoomChoice } from '@/features/hotels/draft';
import {
  guestsLabel,
  inr,
  nightsLabel,
  occupancyLabel,
  reviewsLabel,
  stayDay,
} from '@/features/hotels/format';
import { HotelSearchForm } from '@/features/search/forms/HotelSearchForm';
import { useNow } from '@/hooks/useNow';
import { clientNow } from '@/lib/clock';
import { userMessage } from '@/lib/apiErrors';

export default function HotelDetailsPage() {
  const { hotelId } = useParams();
  const [params] = useSearchParams();
  const details = useHotelDetails(hotelId);
  // The stay comes from the URL (defaults: a week from today, 2 nights, 1 room for 2 adults).
  const input = hotelSearchInputFromParams(params);
  const parsed = hotelRoomsQuerySchemaAt(() => new Date(clientNow())).safeParse({
    checkIn: input.checkIn,
    checkOut: input.checkOut,
    rooms: input.rooms,
  });
  const stay = parsed.success
    ? { checkIn: parsed.data.checkIn, checkOut: parsed.data.checkOut, rooms: parsed.data.rooms }
    : null;

  if (details.isPending) {
    return (
      <div className="mx-auto max-w-6xl space-y-4 px-4 py-8 sm:px-6" aria-busy>
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-72 rounded-[14px]" />
      </div>
    );
  }
  if (details.error || !details.data) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
        <Seo title="Hotel" noIndex />
        <EmptyState
          icon={BedDouble}
          title={userMessage(details.error)}
          actions={
            <Button asChild>
              <Link to="/hotels">Search hotels</Link>
            </Button>
          }
        />
      </div>
    );
  }
  return (
    <Hotel
      key={stay ? `${stay.checkIn}:${stay.checkOut}:${serializeRooms(stay.rooms)}` : 'no-stay'}
      hotel={details.data}
      stay={stay}
      stayErrors={parsed.success ? [] : parsed.error.issues.map((i) => i.message)}
    />
  );
}

type Assignment = HotelRoomChoice | null;

function Hotel({
  hotel,
  stay,
  stayErrors,
}: {
  hotel: HotelDetails;
  stay: { checkIn: string; checkOut: string; rooms: RoomOccupancy[] } | null;
  stayErrors: string[];
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const signedIn = useAuthStore((s) => s.status === 'authenticated');
  const draft = useHotelDraft();
  const now = useNow();
  const [editing, setEditing] = useState(false);
  const roomsParam = stay ? serializeRooms(stay.rooms) : '';
  const rooms = useHotelRooms(
    hotel.hotelId,
    stay ? { checkIn: stay.checkIn, checkOut: stay.checkOut, rooms: roomsParam } : null,
  );
  const searched = stay?.rooms ?? [];
  const nights = rooms.data?.nights ?? 0;

  // Rooms chosen before a deep-login round trip come back here (same hotel, dates and guests).
  const restorable =
    draft.selection &&
    stay &&
    draft.selection.hotelId === hotel.hotelId &&
    draft.selection.checkIn === stay.checkIn &&
    draft.selection.checkOut === stay.checkOut &&
    draft.selection.rooms.length === searched.length &&
    draft.selection.rooms.every(
      (r, i) =>
        r.adults === searched[i]?.adults &&
        r.childAges.join(',') === searched[i]?.childAges.join(','),
    )
      ? draft.selection.rooms
      : null;
  const [picked, setPicked] = useState<Assignment[]>(() => restorable ?? searched.map(() => null));
  const [active, setActive] = useState(() =>
    Math.max(
      0,
      picked.findIndex((p) => p === null),
    ),
  );

  // Every choice is re-checked against the live list: a rate that disappeared or a room type
  // that no longer has enough rooms is dropped (the other rooms stay chosen).
  const live = rooms.data?.roomTypes;
  const assignments = useMemo<Assignment[]>(() => {
    if (!live) return picked;
    const used = new Map<string, number>();
    return picked.map((p) => {
      if (!p) return null;
      const type = live.find((t) => t.roomTypeId === p.roomTypeId);
      const rate = type?.rates.find((r) => r.rateId === p.rateId);
      const count = (used.get(p.roomTypeId) ?? 0) + 1;
      if (!type || !rate || rate.roomsLeft < count) return null;
      used.set(p.roomTypeId, count);
      return p;
    });
  }, [picked, live]);
  const dropped = picked.some((p, i) => p !== null && assignments[i] === null);

  const priced = assignments.map((a) => {
    const rate =
      a &&
      live?.find((t) => t.roomTypeId === a.roomTypeId)?.rates.find((r) => r.rateId === a.rateId);
    return rate ? { price: rate.totalPrice, taxes: rate.taxes } : null;
  });
  const complete = searched.length > 0 && priced.every((p) => p !== null);
  const total = complete
    ? hotelPriceBreakdown(priced as { price: number; taxes: number }[], nights).totalPaise
    : priced.reduce((s, p) => s + (p ? p.price + p.taxes : 0), 0);
  const chosenCount = assignments.filter(Boolean).length;
  const activeRoom = searched[active] ?? { adults: 1, childAges: [] };

  const choose = (type: HotelRoomType, rateId: string) => {
    const next = [...assignments];
    next[active] = {
      roomTypeId: type.roomTypeId,
      rateId,
      roomName: type.name,
      adults: activeRoom.adults,
      childAges: activeRoom.childAges,
    };
    setPicked(next);
    const following = next.findIndex((p, i) => p === null && i !== active);
    if (following >= 0) setActive(following);
  };

  const reserve = () => {
    if (!stay || !complete) return;
    draft.start({
      hotelId: hotel.hotelId,
      hotelName: hotel.name,
      checkIn: stay.checkIn,
      checkOut: stay.checkOut,
      rooms: assignments as HotelRoomChoice[],
      expectedTotal: total,
      detailsUrl: location.pathname + location.search,
    });
    // Logged out: the draft is saved; log in and come back here (rooms re-checked on return).
    if (!signedIn) return void navigate(loginPath(location.pathname + location.search));
    void navigate('/hotels/booking');
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 pb-32 sm:px-6 sm:py-8">
      <Seo title={hotel.name} description={hotel.description} noIndex />
      <button
        type="button"
        onClick={() => void navigate(-1)}
        className="mb-4 inline-flex min-h-11 items-center text-sm font-semibold text-primary hover:underline"
      >
        ← Back to results
      </button>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[28px] font-extrabold leading-tight tracking-tight">{hotel.name}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
            <Stars count={hotel.stars} />
            <span className="inline-flex items-start gap-1">
              <MapPin aria-hidden className="mt-0.5 size-3.5 shrink-0" /> {hotel.address}
            </span>
          </p>
        </div>
        <p className="text-right">
          <RatingBadge rating={hotel.rating} label={hotel.ratingLabel} />
          <span className="block text-xs text-muted">({reviewsLabel(hotel.ratingCount)})</span>
        </p>
      </div>

      {hotel.demo && (
        <div className="mt-4">
          <DemoBanner service="hotel" />
        </div>
      )}

      <div className="mt-5">
        <Gallery images={hotel.images} name={hotel.name} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="min-w-0 space-y-6">
          <section aria-labelledby="about-heading">
            <h2 id="about-heading" className="text-lg font-bold">
              About
            </h2>
            <p className="mt-2 text-sm leading-relaxed">{hotel.description}</p>
          </section>

          <section aria-labelledby="amenities-heading">
            <h2 id="amenities-heading" className="text-lg font-bold">
              Amenities
            </h2>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              {hotel.amenityGroups.map((g) => (
                <div key={g.group}>
                  <h3 className="text-sm font-semibold">{g.group}</h3>
                  <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-muted">
                    {g.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        </div>

        <Card className="self-start">
          <CardHeader className="flex-row items-center justify-between pb-3">
            <CardTitle className="text-base">Your stay</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
              <Pencil aria-hidden /> Change
            </Button>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {stay ? (
              <>
                <p className="flex items-center gap-2">
                  <CalendarDays aria-hidden className="size-4 text-muted" />
                  {stayDay(stay.checkIn)} – {stayDay(stay.checkOut)} ·{' '}
                  <strong data-testid="hotel-nights">
                    {nightsLabel(nightsBetween(stay.checkIn, stay.checkOut))}
                  </strong>
                </p>
                <p className="flex items-center gap-2">
                  <Clock aria-hidden className="size-4 text-muted" /> Check-in from{' '}
                  {hotel.checkInTime} · check-out until {hotel.checkOutTime}
                </p>
                <p className="flex items-center gap-2">
                  <BedDouble aria-hidden className="size-4 text-muted" /> {guestsLabel(searched)}
                </p>
              </>
            ) : (
              <FormAlert>{[...new Set(stayErrors)].join('. ')}.</FormAlert>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent className="max-w-5xl">
          <DialogTitle>Change your stay</DialogTitle>
          <HotelSearchForm
            initial={{
              destinationId: hotel.hotelId,
              ...(stay
                ? { checkIn: stay.checkIn, checkOut: stay.checkOut, rooms: stay.rooms }
                : {}),
            }}
          />
        </DialogContent>
      </Dialog>

      {stay && (
        <section aria-labelledby="rooms-heading" className="mt-8 space-y-4">
          <h2 id="rooms-heading" className="text-lg font-bold">
            Choose your rooms
          </h2>
          {searched.length > 1 && (
            <div role="tablist" aria-label="Searched rooms" className="flex flex-wrap gap-2">
              {searched.map((r, i) => (
                <button
                  key={i}
                  type="button"
                  role="tab"
                  aria-selected={active === i}
                  data-testid={`hotel-assign-room-${i + 1}`}
                  onClick={() => setActive(i)}
                  className={cn(
                    'min-h-11 rounded-full border px-4 text-sm font-semibold',
                    active === i
                      ? 'border-primary bg-primary text-primary-foreground'
                      : assignments[i]
                        ? 'border-success/50 bg-success/10'
                        : 'border-border bg-card',
                  )}
                >
                  Room {i + 1}: {occupancyLabel(r)}
                  {assignments[i] ? ` · ${assignments[i]?.roomName}` : ''}
                </button>
              ))}
            </div>
          )}
          {dropped && (
            <FormAlert>
              A room you chose is no longer available. Your other rooms are still selected — please
              choose another for the highlighted room.
            </FormAlert>
          )}
          {rooms.error ? (
            <div
              role="alert"
              className="space-y-3 rounded-[14px] border border-danger/30 bg-card p-5"
            >
              <p className="text-sm font-semibold text-danger">{userMessage(rooms.error)}</p>
              <Button variant="outline" onClick={() => void rooms.refetch()}>
                Retry
              </Button>
            </div>
          ) : rooms.isPending ? (
            <Skeleton className="h-64 rounded-[14px]" />
          ) : (
            <ul className="space-y-4">
              {(live ?? []).map((type) => (
                <li key={type.roomTypeId}>
                  <RoomTypeCard
                    roomType={type}
                    nights={nights}
                    activeRoom={activeRoom}
                    activeLabel={`room ${active + 1}`}
                    chosenOfType={
                      assignments.filter(
                        (a, i) => i !== active && a?.roomTypeId === type.roomTypeId,
                      ).length
                    }
                    selectedRateId={
                      assignments[active]?.roomTypeId === type.roomTypeId
                        ? (assignments[active]?.rateId ?? null)
                        : null
                    }
                    now={now}
                    onSelect={(rate) => {
                      if (!fitProblem(type, activeRoom)) choose(type, rate.rateId);
                    }}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section aria-labelledby="rules-heading" className="mt-8 grid gap-6 sm:grid-cols-2">
        <div>
          <h2 id="rules-heading" className="text-lg font-bold">
            House rules
          </h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
            {hotel.houseRules.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
          <p className="mt-3 text-sm text-muted">{hotel.cancellationSummary}</p>
        </div>
        <div>
          <h2 className="text-lg font-bold">Location</h2>
          <p className="mt-2 text-sm">{hotel.address}</p>
          <p className="mt-1 text-xs text-muted">
            {hotel.geo.lat.toFixed(4)}° N, {hotel.geo.lng.toFixed(4)}° E · Hotel phone {hotel.phone}
          </p>
        </div>
      </section>

      {stay && (
        <div className="fixed inset-x-0 bottom-[var(--bottom-nav-height)] z-30 border-t border-border bg-card/95 py-3 backdrop-blur lg:bottom-0">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
            <div>
              <p className="text-xs text-muted" data-testid="hotel-rooms-selected">
                {chosenCount} of {searched.length} room{searched.length === 1 ? '' : 's'} selected
              </p>
              <p className="text-xl font-extrabold tabular-nums" data-testid="hotel-total">
                {inr(total)}
                <span className="ml-1 text-xs font-normal text-muted">
                  for {nightsLabel(nights || nightsBetween(stay.checkIn, stay.checkOut))}, incl.
                  taxes
                </span>
              </p>
            </div>
            <Button size="lg" data-testid="hotel-reserve" disabled={!complete} onClick={reserve}>
              Reserve <ArrowRight aria-hidden />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
