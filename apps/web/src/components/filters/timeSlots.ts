/** Time-of-day filter buckets shared by result pages (bus, flight). */
export const TIME_SLOTS = [
  { id: 'early', label: 'Before 6 AM', from: 0, to: 6 },
  { id: 'morning', label: '6 AM–12 PM', from: 6, to: 12 },
  { id: 'afternoon', label: '12 PM–6 PM', from: 12, to: 18 },
  { id: 'night', label: 'After 6 PM', from: 18, to: 24 },
] as const;
export type TimeSlot = (typeof TIME_SLOTS)[number]['id'];

export const inSlots = (hour: number, slots: readonly TimeSlot[]) =>
  slots.length === 0 ||
  TIME_SLOTS.some((s) => slots.includes(s.id) && hour >= s.from && hour < s.to);

/** Comma-separated URL value → known ids (unknown and duplicate values dropped). */
export function listParam<T extends string>(value: string | null, allowed: readonly T[]): T[] {
  return (value ?? '')
    .split(',')
    .filter((v): v is T => (allowed as readonly string[]).includes(v))
    .filter((v, i, all) => all.indexOf(v) === i);
}
