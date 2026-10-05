import type { Db } from './db';

/** Seats held or sold through ZPROO GO on generated (mock) itineraries. */
export class FlightRepository {
  constructor(private readonly db: Db) {}

  /** Seats taken per itinerary: paid holds and unpaid holds that have not lapsed. */
  async heldSeats(itineraryKeys: string[], now: Date): Promise<Map<string, number>> {
    if (itineraryKeys.length === 0) return new Map();
    const rows = await this.db.flightSeatHold.groupBy({
      by: ['itineraryKey'],
      where: {
        itineraryKey: { in: itineraryKeys },
        active: true,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      _sum: { seats: true },
    });
    return new Map(rows.map((r) => [r.itineraryKey, r._sum.seats ?? 0]));
  }

  /**
   * Holds `seats` if the itinerary still has them. A transaction-scoped advisory lock per
   * itinerary serialises concurrent holds, so the last seats can never be sold twice.
   * Must run inside a transaction.
   */
  async hold(
    itineraryKey: string,
    seats: number,
    capacity: number,
    bookingId: string,
    expiresAt: Date,
    now: Date,
  ): Promise<boolean> {
    await this.db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`flight:${itineraryKey}`}))`;
    const taken = (await this.heldSeats([itineraryKey], now)).get(itineraryKey) ?? 0;
    if (taken + seats > capacity) return false;
    await this.db.flightSeatHold.create({ data: { itineraryKey, seats, bookingId, expiresAt } });
    return true;
  }

  release(bookingId: string) {
    return this.db.flightSeatHold.updateMany({
      where: { bookingId, active: true },
      data: { active: null },
    });
  }

  markPaid(bookingId: string) {
    return this.db.flightSeatHold.updateMany({
      where: { bookingId, active: true },
      data: { expiresAt: null },
    });
  }
}
