import { BOARD_BASIS_LABELS, type BoardBasis, type RoomOccupancy } from '@zproo/types';
import { formatMoney } from '@zproo/utils';

export const inr = (paise: number) => formatMoney(paise);

export const nightsLabel = (n: number) => `${n} night${n === 1 ? '' : 's'}`;

export function guestsLabel(rooms: readonly { adults: number; childAges: readonly unknown[] }[]) {
  const guests = rooms.reduce((s, r) => s + r.adults + r.childAges.length, 0);
  return `${rooms.length} room${rooms.length === 1 ? '' : 's'} · ${guests} guest${guests === 1 ? '' : 's'}`;
}

/** "2 adults + 1 child (7)" */
export function occupancyLabel(room: Pick<RoomOccupancy, 'adults' | 'childAges'>) {
  const adults = `${room.adults} adult${room.adults === 1 ? '' : 's'}`;
  const n = room.childAges.length;
  if (n === 0) return adults;
  return `${adults} + ${n} child${n === 1 ? '' : 'ren'} (${room.childAges.join(', ')})`;
}

/** "Tue, 20 Oct" for an IST calendar date. */
export function stayDay(date: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`));
}

/** "Tue, 20 Oct – Fri, 23 Oct" */
export const stayRange = (checkIn: string, checkOut: string) =>
  `${stayDay(checkIn)} – ${stayDay(checkOut)}`;

export const boardLabel = (b: BoardBasis) => BOARD_BASIS_LABELS[b];

/** "18 Oct, 12:00" for an ISO instant, in IST. */
export function deadlineLabel(iso: string): string {
  const d = new Date(iso);
  const day = new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    timeZone: 'Asia/Kolkata',
  }).format(d);
  const time = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Kolkata',
  }).format(d);
  return `${day}, ${time}`;
}

/** What a rate's cancellation terms say, given the current time. */
export function cancellationLabel(
  rate: { refundable: boolean; freeCancellationUntil: string | null },
  now: number,
): { text: string; tone: 'success' | 'danger' | 'muted' } {
  if (!rate.refundable) return { text: 'Non-refundable', tone: 'danger' };
  if (rate.freeCancellationUntil && Date.parse(rate.freeCancellationUntil) > now)
    return {
      text: `Free cancellation until ${deadlineLabel(rate.freeCancellationUntil)}`,
      tone: 'success',
    };
  return { text: 'Cancellation charges apply (first night)', tone: 'muted' };
}

export const reviewsLabel = (count: number) =>
  `${count.toLocaleString('en-IN')} review${count === 1 ? '' : 's'}`;
