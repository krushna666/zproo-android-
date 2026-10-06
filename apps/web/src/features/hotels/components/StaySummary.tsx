import type { HotelBookingInfo } from '@zproo/types';
import { Badge, Card, CardContent, cn } from '@zproo/ui';
import { MapPin } from 'lucide-react';
import { useNow } from '@/hooks/useNow';
import {
  boardLabel,
  cancellationLabel,
  inr,
  nightsLabel,
  occupancyLabel,
  stayDay,
} from '../format';
import { Stars } from './Stars';

/** The booked stay: property, dates, rooms with board and cancellation terms. */
export function StaySummary({
  stay,
  detailed = false,
}: {
  stay: HotelBookingInfo;
  detailed?: boolean;
}) {
  const now = useNow();
  const image = stay.hotel.images[0];
  return (
    <Card>
      <CardContent className="space-y-4 p-4 sm:p-5">
        <div className="flex gap-3">
          {image && (
            <img
              src={image.url}
              alt={image.alt}
              className="size-20 shrink-0 rounded-xl bg-background object-cover"
            />
          )}
          <div className="min-w-0">
            <h3 className="font-bold leading-snug">{stay.hotel.name}</h3>
            <Stars count={stay.hotel.stars} />
            <p className="mt-1 flex items-start gap-1 text-xs text-muted">
              <MapPin aria-hidden className="mt-0.5 size-3.5 shrink-0" /> {stay.hotel.address}
            </p>
          </div>
        </div>
        <dl className="grid grid-cols-3 gap-2 rounded-xl bg-background p-3 text-sm">
          <div>
            <dt className="text-xs text-muted">Check-in</dt>
            <dd className="font-semibold">{stayDay(stay.checkIn)}</dd>
            <dd className="text-xs text-muted">from {stay.hotel.checkInTime}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Check-out</dt>
            <dd className="font-semibold">{stayDay(stay.checkOut)}</dd>
            <dd className="text-xs text-muted">until {stay.hotel.checkOutTime}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Stay</dt>
            <dd className="font-semibold" data-testid="hotel-nights">
              {nightsLabel(stay.nights)}
            </dd>
            <dd className="text-xs text-muted">
              {stay.rooms.length} room{stay.rooms.length === 1 ? '' : 's'}
            </dd>
          </div>
        </dl>
        <ol className="space-y-3">
          {stay.rooms.map((room, i) => {
            const terms = cancellationLabel(room, now);
            return (
              <li
                key={`${room.rateId}-${i}`}
                className="rounded-xl border border-border p-3 text-sm"
              >
                <p className="font-semibold">
                  Room {i + 1}: {room.roomName}
                </p>
                <p className="text-xs text-muted">
                  {occupancyLabel(room)} · {boardLabel(room.boardBasis)}
                  {room.leadGuest.firstName &&
                    ` · Lead guest ${room.leadGuest.firstName} ${room.leadGuest.lastName}`}
                </p>
                <Badge
                  variant={terms.tone === 'success' ? 'success' : 'outline'}
                  className={cn('mt-2', terms.tone === 'danger' && 'border-danger/50 text-danger')}
                >
                  {terms.text}
                </Badge>
                {detailed && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs font-semibold text-primary">
                      Price per night
                    </summary>
                    <ul className="mt-1 space-y-0.5 text-xs">
                      {room.nightlyBreakdown.map((n) => (
                        <li key={n.date} className="flex justify-between tabular-nums">
                          <span>{stayDay(n.date)}</span>
                          <span>{inr(n.price)}</span>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </li>
            );
          })}
        </ol>
        {stay.specialRequests && (
          <div className="text-sm">
            <p className="text-xs font-semibold text-muted">Special requests (not guaranteed)</p>
            {/* Plain text: React escapes it, and the server removed any markup. */}
            <p className="whitespace-pre-line break-words" data-testid="hotel-special-requests">
              {stay.specialRequests}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
