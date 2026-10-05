import { formatMoney } from '@zproo/utils';
import type { FlightLayover, FlightSlice } from '@zproo/types';

/** Money in paise → "₹5,320". */
export const inr = (paise: number) => formatMoney(paise);

/*
 * Flight times come as local ISO strings with the airport's offset
 * ("2026-10-20T21:30:00+05:30"), so the wall-clock time and date are read straight from them.
 */

/** "21:30" (local to the airport) */
export const clockTime = (iso: string) => iso.slice(11, 16);
/** Hour of day (0–23), local to the airport, for time-of-day filters */
export const localHourOf = (iso: string) => Number(iso.slice(11, 13));
/** YYYY-MM-DD, local to the airport */
export const localDateOf = (iso: string) => iso.slice(0, 10);

/** Calendar days between a local departure and a local arrival (0, +1, +2…). */
export function dayShift(departure: string, arrival: string): number {
  return Math.round(
    (Date.parse(`${localDateOf(arrival)}T00:00:00Z`) -
      Date.parse(`${localDateOf(departure)}T00:00:00Z`)) /
      86_400_000,
  );
}

/** "06:15 +1" */
export function arrivalLabel(departure: string, arrival: string): string {
  const shift = dayShift(departure, arrival);
  return shift > 0 ? `${clockTime(arrival)} +${shift}` : clockTime(arrival);
}

/** 135 → "2h 15m". */
export function duration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/** "2026-10-25" → "Sun, 25 Oct 2026" (a travel date: no time-zone shift). */
export function travelDate(date: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`));
}

/** "Sun, 25 Oct" */
export function shortDay(date: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`));
}

/** "Non-stop", "1 stop via BLR (1h 25m)", "2 stops via BLR, HYD" */
export function stopsLabel(slice: Pick<FlightSlice, 'stops' | 'layovers'>): string {
  if (slice.stops === 0) return 'Non-stop';
  if (slice.stops === 1 && slice.layovers[0])
    return `1 stop via ${slice.layovers[0].airport} (${duration(slice.layovers[0].durationMin)})`;
  return `${slice.stops} stops via ${slice.layovers.map((l) => l.airport).join(', ')}`;
}

/** Warnings for a connection, in the order shown. */
export function layoverWarnings(l: FlightLayover): string[] {
  return [
    ...(l.changeOfTerminal ? ['Change of terminal'] : []),
    ...(l.selfTransfer ? ['Self-transfer'] : []),
    ...(l.overnight ? ['Overnight layover'] : []),
  ];
}

export function travellersLabel(p: { adults: number; children: number; infants: number }): string {
  const parts = [`${p.adults} adult${p.adults > 1 ? 's' : ''}`];
  if (p.children) parts.push(`${p.children} child${p.children > 1 ? 'ren' : ''}`);
  if (p.infants) parts.push(`${p.infants} infant${p.infants > 1 ? 's' : ''}`);
  return parts.join(', ');
}

/** Departure (local) of a slice */
export const sliceDeparture = (slice: FlightSlice) => slice.segments[0]?.departure ?? '';
/** Arrival (local) of a slice */
export const sliceArrival = (slice: FlightSlice) => slice.segments.at(-1)?.arrival ?? '';

/** "06:45" of an instant in a time zone (for instants such as booking times). */
export function localTime(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone,
  }).format(new Date(iso));
}

/** "Sat, 25 Oct" of an instant in a time zone. */
export function localDay(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone,
  }).format(new Date(iso));
}
