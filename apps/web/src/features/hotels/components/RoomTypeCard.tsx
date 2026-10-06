import type { HotelRate, HotelRoomType, RoomOccupancy } from '@zproo/types';
import { Badge, Button, Card, CardContent, cn } from '@zproo/ui';
import { BedDouble, Check, Maximize2, Users } from 'lucide-react';
import { fitProblem } from '../rooms';
import { boardLabel, cancellationLabel, inr, nightsLabel } from '../format';

/**
 * A room type with its rates. "Select" assigns the rate to the searched room being filled; it is
 * disabled when that room's guests don't fit or every room of the type is already chosen.
 */
export function RoomTypeCard({
  roomType,
  nights,
  activeRoom,
  activeLabel,
  chosenOfType,
  selectedRateId,
  now,
  onSelect,
}: {
  roomType: HotelRoomType;
  nights: number;
  activeRoom: RoomOccupancy;
  /** "Room 2" — which searched room a Select fills */
  activeLabel: string;
  /** Rooms of this type already chosen for other searched rooms */
  chosenOfType: number;
  selectedRateId: string | null;
  now: number;
  onSelect: (rate: HotelRate) => void;
}) {
  const problem = fitProblem(roomType, activeRoom);
  const left = roomType.rates[0]?.roomsLeft ?? 0;
  const soldOut = left - chosenOfType <= 0;
  return (
    <Card data-testid={`hotel-room-type-${roomType.roomTypeId}`}>
      <CardContent className="grid gap-4 p-4 sm:grid-cols-[12rem_1fr] sm:p-5">
        <div>
          {roomType.images[0] && (
            <img
              src={roomType.images[0].url}
              alt={roomType.images[0].alt}
              loading="lazy"
              className="aspect-[4/3] w-full rounded-xl bg-background object-cover"
            />
          )}
          <h3 className="mt-3 font-bold">{roomType.name}</h3>
          <ul className="mt-1 space-y-0.5 text-xs text-muted">
            <li className="flex items-center gap-1.5">
              <Maximize2 aria-hidden className="size-3.5" /> {roomType.sizeSqft} sq ft
            </li>
            <li className="flex items-center gap-1.5">
              <BedDouble aria-hidden className="size-3.5" /> {roomType.bed}
            </li>
            <li className="flex items-center gap-1.5">
              <Users aria-hidden className="size-3.5" /> Up to {roomType.maxAdults} adults,{' '}
              {roomType.maxChildren} {roomType.maxChildren === 1 ? 'child' : 'children'}
            </li>
          </ul>
          <p className="mt-2 text-xs text-muted">{roomType.amenities.join(' · ')}</p>
        </div>
        <ul className="space-y-3">
          {problem && (
            <li role="note" className="rounded-lg bg-warning/10 px-3 py-2 text-sm text-amber-900">
              {problem}
            </li>
          )}
          {roomType.rates.map((rate) => {
            const terms = cancellationLabel(rate, now);
            const selected = selectedRateId === rate.rateId;
            return (
              <li
                key={rate.rateId}
                className={cn(
                  'flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3',
                  selected ? 'border-primary ring-2 ring-primary/20' : 'border-border',
                )}
              >
                <div className="min-w-0 space-y-1">
                  <p className="text-sm font-semibold">{boardLabel(rate.boardBasis)}</p>
                  <Badge
                    variant={terms.tone === 'success' ? 'success' : 'outline'}
                    className={cn(terms.tone === 'danger' && 'border-danger/50 text-danger')}
                  >
                    {terms.text}
                  </Badge>
                  {left <= 3 && left > 0 && (
                    <p className="text-xs font-semibold text-amber-800">
                      Only {left} room{left === 1 ? '' : 's'} left
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="font-extrabold tabular-nums">
                      {inr(rate.pricePerNight)}
                      <span className="text-xs font-normal text-muted"> / night</span>
                    </p>
                    <p className="text-xs text-muted tabular-nums">
                      {inr(rate.totalPrice)} for {nightsLabel(nights)} + {inr(rate.taxes)} taxes
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant={selected ? 'default' : 'outline'}
                    data-testid={`hotel-room-select-${rate.rateId}`}
                    aria-pressed={selected}
                    disabled={Boolean(problem) || (soldOut && !selected)}
                    aria-label={`Select ${roomType.name}, ${boardLabel(rate.boardBasis)}, for ${activeLabel}`}
                    onClick={() => onSelect(rate)}
                  >
                    {selected ? (
                      <>
                        <Check aria-hidden /> Selected
                      </>
                    ) : soldOut ? (
                      'Sold out'
                    ) : (
                      'Select'
                    )}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
