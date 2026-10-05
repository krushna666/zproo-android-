import type { BusPoint, BusTripDetails } from '@zproo/types';
import { Badge, Card, CardContent } from '@zproo/ui';
import { Armchair, Star } from 'lucide-react';
import { arrivalLabel, busDuration, istTime, shortDate } from '../format';

interface BusTripSummaryProps {
  trip: BusTripDetails;
  boarding?: BusPoint | undefined;
  dropping?: BusPoint | undefined;
  seats?: readonly string[];
}

/** Operator, coach, date, the chosen boarding/dropping points (time + address) and seats. */
export function BusTripSummary({ trip, boarding, dropping, seats }: BusTripSummaryProps) {
  const from = boarding ?? trip.boardingPoints[0];
  const to = dropping ?? trip.droppingPoints.at(-1);
  return (
    <Card>
      <CardContent className="space-y-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="font-bold">
              {trip.from.name} → {trip.to.name}
            </h3>
            <p className="text-sm text-muted">
              {trip.operator.name} · {trip.serviceNumber}
            </p>
          </div>
          <span className="text-sm text-muted">{shortDate(trip.date)}</span>
        </div>
        <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-3 text-sm">
          <div className="min-w-0">
            <p className="text-lg font-extrabold tabular-nums">
              {istTime(from?.time ?? trip.departure)}
            </p>
            <p className="font-semibold">{from?.name}</p>
            <p className="text-xs text-muted">{from?.address}</p>
          </div>
          <p className="pt-1.5 text-xs text-muted">{busDuration(trip.durationMin)}</p>
          <div className="min-w-0 text-right">
            <p className="text-lg font-extrabold tabular-nums">
              {arrivalLabel(trip.departure, to?.time ?? trip.arrival)}
            </p>
            <p className="font-semibold">{to?.name}</p>
            <p className="text-xs text-muted">{to?.address}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="soft">{trip.busType.label}</Badge>
          <Badge variant="outline">
            <Star aria-hidden className="size-3 fill-current" /> {trip.operator.rating.toFixed(1)}
          </Badge>
          {seats && seats.length > 0 && (
            <Badge variant="outline">
              <Armchair aria-hidden className="size-3" /> Seat{seats.length === 1 ? '' : 's'}{' '}
              {seats.join(', ')}
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
