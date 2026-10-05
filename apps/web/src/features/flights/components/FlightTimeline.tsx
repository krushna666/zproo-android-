import type { FlightSlice } from '@zproo/types';
import { Badge } from '@zproo/ui';
import { Plane, TriangleAlert } from 'lucide-react';
import { clockTime, duration, layoverWarnings, localDateOf, shortDay } from '../format';
import { AirlineMark } from './AirlineMark';

/** Segment-by-segment journey with terminals and layovers (warnings in the warning colour). */
export function FlightTimeline({ slice }: { slice: FlightSlice }) {
  return (
    <ol className="space-y-4">
      {slice.segments.map((seg, i) => {
        const layover = slice.layovers[i];
        return (
          <li key={`${seg.flightNo}-${i}`}>
            <div className="flex gap-3">
              <AirlineMark code={seg.carrier.code} className="size-8 text-[10px]" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">
                  {seg.carrier.name} · {seg.flightNo}
                  <span className="ml-2 font-normal text-muted">{seg.aircraft}</span>
                </p>
                <div className="mt-2 grid grid-cols-[auto_1fr_auto] items-center gap-3 text-sm">
                  <div>
                    <p className="text-base font-bold tabular-nums">{clockTime(seg.departure)}</p>
                    <p className="text-xs text-muted">
                      {seg.from} · T{seg.terminalFrom} · {shortDay(localDateOf(seg.departure))}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted">
                    <span className="h-px flex-1 bg-border" />
                    <Plane aria-hidden className="size-3.5" /> {duration(seg.durationMin)}
                    <span className="h-px flex-1 bg-border" />
                  </div>
                  <div className="text-right">
                    <p className="text-base font-bold tabular-nums">{clockTime(seg.arrival)}</p>
                    <p className="text-xs text-muted">
                      {seg.to} · T{seg.terminalTo} · {shortDay(localDateOf(seg.arrival))}
                    </p>
                  </div>
                </div>
              </div>
            </div>
            {layover && i < slice.segments.length - 1 && (
              <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-border px-3 py-2 text-xs">
                <span className="text-muted">
                  Layover {duration(layover.durationMin)} at {layover.airport}
                </span>
                {layoverWarnings(layover).map((w) => (
                  <Badge key={w} variant="warning">
                    <TriangleAlert aria-hidden className="size-3" /> {w}
                  </Badge>
                ))}
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
