import { dayShift, duration, localHour, localTime } from '@/features/flights/format';

export const IST = 'Asia/Kolkata';

/** "21:30" in India time. */
export const istTime = (iso: string) => localTime(iso, IST);
export const istHour = (iso: string) => localHour(iso, IST);

/** Calendar days between departure and arrival in IST (0, +1, +2…). */
export const busDayShift = (departure: string, arrival: string) =>
  dayShift(departure, IST, arrival, IST);

/** "06:15 +1" — arrival time with the day shift the SOP asks for. */
export function arrivalLabel(departure: string, arrival: string): string {
  const shift = busDayShift(departure, arrival);
  return shift > 0 ? `${istTime(arrival)} +${shift}` : istTime(arrival);
}

/** "8h 45m" */
export const busDuration = duration;

export const ratingLabel = (rating: number) => rating.toFixed(1);

/** Badge variant for an operator rating: success ≥ 4, warning 3–3.9, outline otherwise. */
export function ratingVariant(rating: number): 'success' | 'warning' | 'outline' {
  if (rating >= 4) return 'success';
  if (rating >= 3) return 'warning';
  return 'outline';
}

/** "Mon, 5 Oct" */
export function shortDate(date: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`));
}

/** "More than 24 hours before departure" style rows for a refund table. */
export function policyRows(rules: readonly { hoursBefore: number; refundPercent: number }[]) {
  return rules.map((r, i) => {
    const previous = rules[i - 1];
    const when =
      i === 0
        ? `More than ${r.hoursBefore} hours before departure`
        : r.hoursBefore > 0
          ? `${r.hoursBefore}–${previous?.hoursBefore} hours before departure`
          : `Less than ${previous?.hoursBefore} hours before departure`;
    return { when, refund: r.refundPercent === 0 ? 'No refund' : `${r.refundPercent}% refund` };
  });
}
