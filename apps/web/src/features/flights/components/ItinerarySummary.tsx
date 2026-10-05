import type { FlightBookingLeg } from '@zproo/types';
import { Badge, Card, CardContent } from '@zproo/ui';
import {
  clockTime,
  arrivalLabel,
  duration,
  localDateOf,
  shortDay,
  sliceArrival,
  sliceDeparture,
  stopsLabel,
} from '../format';
import { AirlineMark } from './AirlineMark';
import { FlightTimeline } from './FlightTimeline';

/** The flights of a booking (outbound, return), with the fare family; `detailed` shows segments. */
export function ItinerarySummary({
  legs,
  detailed = false,
}: {
  legs: readonly Pick<FlightBookingLeg, 'sequence' | 'offer' | 'fare'>[];
  detailed?: boolean;
}) {
  return (
    <div className="space-y-3">
      {legs.map((leg) => {
        const slice = leg.offer.slices[0];
        if (!slice) return null;
        const departure = sliceDeparture(slice);
        return (
          <Card key={leg.sequence}>
            <CardContent className="space-y-3 p-4 sm:p-5">
              <div className="flex flex-wrap items-center gap-3">
                <AirlineMark code={leg.offer.carrier.code} className="size-9" />
                <div className="min-w-0 flex-1">
                  <p className="font-bold">
                    {legs.length > 1 ? (leg.sequence === 1 ? 'Outbound · ' : 'Return · ') : ''}
                    {slice.segments[0]?.from} → {slice.segments.at(-1)?.to}
                  </p>
                  <p className="text-xs text-muted">
                    {shortDay(localDateOf(departure))} · {leg.offer.carrier.name} ·{' '}
                    {slice.segments.map((s) => s.flightNo).join(', ')}
                  </p>
                </div>
                <Badge variant="soft">{leg.fare.name}</Badge>
              </div>
              <p className="text-sm">
                <strong className="tabular-nums">{clockTime(departure)}</strong> →{' '}
                <strong className="tabular-nums">
                  {arrivalLabel(departure, sliceArrival(slice))}
                </strong>
                <span className="text-muted">
                  {' '}
                  · {duration(slice.durationMin)} · {stopsLabel(slice)}
                </span>
              </p>
              <p className="text-xs text-muted">
                Cabin bag {leg.fare.cabinBaggageKg} kg · Check-in {leg.fare.checkinBaggageKg} kg ·{' '}
                {leg.fare.cancellationFee === null ? 'Non-refundable' : 'Refundable'}
              </p>
              {detailed && <FlightTimeline slice={slice} />}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
