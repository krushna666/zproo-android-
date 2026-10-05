import type { BookingStatus, Prisma } from '@prisma/client';
import { OPEN_HOLD_STATUSES, transition } from '@zproo/utils';
import type { Db } from './db';

export interface MoveOptions {
  /** Who caused it: `user:<id>`, `system`, `job:release-holds`, `webhook:<provider>`. */
  actor: string;
  reason?: string | undefined;
  /** Extra columns to set with the status. */
  data?: Prisma.BookingUpdateManyMutationInput;
  /** Extra conditions that must still hold (e.g. the hold has not expired). */
  where?: Prisma.BookingWhereInput;
}

export const bookingInclude = {
  passengers: { orderBy: { sequence: 'asc' } },
  flights: { orderBy: { sequence: 'asc' } },
  bus: true,
} satisfies Prisma.BookingInclude;

export type BookingRecord = Prisma.BookingGetPayload<{ include: typeof bookingInclude }>;

export class BookingRepository {
  constructor(private readonly db: Db) {}

  findByReference(reference: string) {
    return this.db.booking.findUnique({ where: { reference }, include: bookingInclude });
  }

  findByIdempotencyKey(userId: string, idempotencyKey: string) {
    return this.db.booking.findUnique({
      where: { userId_idempotencyKey: { userId, idempotencyKey } },
      include: bookingInclude,
    });
  }

  listForUser(userId: string, take = 50) {
    return this.db.booking.findMany({
      where: { userId },
      include: bookingInclude,
      orderBy: { createdAt: 'desc' },
      take,
    });
  }

  create(data: Prisma.BookingUncheckedCreateInput) {
    return this.db.booking.create({ data, include: bookingInclude });
  }

  /**
   * Moves a booking to `to` if it is currently in one of `from` (and `where` still holds), and
   * records a BookingEvent. Each edge is checked against the shared state machine, so an illegal
   * move is a programming error. The update is conditional on the status read, so two concurrent
   * moves cannot both win. Returns false when the booking was not in a `from` state.
   * Call inside a transaction so the status change and its event commit together.
   */
  async move(
    id: string,
    from: readonly BookingStatus[],
    to: BookingStatus,
    options: MoveOptions,
  ): Promise<boolean> {
    for (const status of from) transition(status, to);
    const current = await this.db.booking.findUnique({ where: { id }, select: { status: true } });
    if (!current || !from.includes(current.status)) return false;
    const { count } = await this.db.booking.updateMany({
      where: { id, status: current.status, ...options.where },
      data: { ...options.data, status: to },
    });
    if (count !== 1) return false;
    await this.recordEvent(id, current.status, to, options.actor, options.reason);
    return true;
  }

  recordEvent(
    bookingId: string,
    fromStatus: BookingStatus | null,
    toStatus: BookingStatus,
    actor: string,
    reason?: string,
  ) {
    return this.db.bookingEvent.create({
      data: { bookingId, fromStatus, toStatus, actor, reason: reason ?? null },
    });
  }

  events(bookingId: string) {
    return this.db.bookingEvent.findMany({ where: { bookingId }, orderBy: { at: 'asc' } });
  }

  /** Unpaid bookings whose hold ran out (captured payments clear `holdExpiresAt`). */
  findExpiredHolds(now: Date, take = 100) {
    return this.db.booking.findMany({
      where: { status: { in: [...OPEN_HOLD_STATUSES] }, holdExpiresAt: { lt: now } },
      include: bookingInclude,
      take,
    });
  }

  /** Paid bookings still waiting for the supplier to issue (crash recovery / pending airlines). */
  findAwaitingIssue(take = 50) {
    return this.db.booking.findMany({
      where: { status: 'PAYMENT_PENDING', paymentStatus: 'CAPTURED' },
      include: bookingInclude,
      take,
    });
  }

  setBusPnr(bookingId: string, pnr: string) {
    return this.db.busBooking.update({ where: { bookingId }, data: { pnr } });
  }

  setFlightTickets(
    flightBookingId: string,
    pnr: string,
    tickets: { passengerId: string; ticketNumber: string }[],
  ) {
    return this.db.flightBooking.update({ where: { id: flightBookingId }, data: { pnr, tickets } });
  }
}
