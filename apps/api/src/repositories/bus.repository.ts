import { Prisma } from '@prisma/client';
import type { LiveHold } from '@zproo/catalog';
import type { Db } from './db';

export class BusRepository {
  constructor(private readonly db: Db) {}

  /** Seats held or sold through ZPROO GO on these trips (unpaid holds count until they lapse). */
  async liveHolds(tripIds: string[], now: Date): Promise<Map<string, LiveHold[]>> {
    const rows = await this.db.busSeatHold.findMany({
      where: {
        tripId: { in: tripIds },
        active: true,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      select: { tripId: true, seatNo: true, female: true },
    });
    const byTrip = new Map<string, LiveHold[]>();
    for (const row of rows) {
      const list = byTrip.get(row.tripId) ?? [];
      list.push({ seatNo: row.seatNo, female: row.female });
      byTrip.set(row.tripId, list);
    }
    return byTrip;
  }

  /**
   * Holds seats for a booking, all or nothing. The unique (trip, seat, active) constraint means
   * a seat can have only one live hold: returns false if any seat is already taken.
   */
  async hold(
    tripId: string,
    seats: { seatNo: string; female: boolean }[],
    bookingId: string,
    expiresAt: Date,
  ): Promise<boolean> {
    try {
      await this.db.busSeatHold.createMany({
        data: seats.map((s) => ({
          tripId,
          seatNo: s.seatNo,
          female: s.female,
          bookingId,
          expiresAt,
        })),
      });
      return true;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return false;
      throw err;
    }
  }

  /** Releases a booking's seats (active → NULL keeps the row for history). */
  release(bookingId: string) {
    return this.db.busSeatHold.updateMany({
      where: { bookingId, active: true },
      data: { active: null },
    });
  }

  /** Paid: the hold no longer lapses. */
  markPaid(bookingId: string) {
    return this.db.busSeatHold.updateMany({
      where: { bookingId, active: true },
      data: { expiresAt: null },
    });
  }
}
