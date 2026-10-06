import type { LiveHotelHold } from '@zproo/catalog';
import type { Db } from './db';

const isoDate = (d: Date) => d.toISOString().slice(0, 10);
const asDate = (iso: string) => new Date(`${iso}T00:00:00Z`);

/** Rooms held or sold through ZPROO GO on generated (mock) properties. */
export class HotelRepository {
  constructor(private readonly db: Db) {}

  /** Live holds overlapping a stay, per hotel: paid holds and unpaid ones that have not lapsed. */
  async liveHolds(
    hotelIds: string[],
    checkIn: string,
    checkOut: string,
    now: Date,
  ): Promise<Map<string, LiveHotelHold[]>> {
    if (hotelIds.length === 0) return new Map();
    const rows = await this.db.hotelRoomHold.findMany({
      where: {
        hotelId: { in: hotelIds },
        active: true,
        checkIn: { lt: asDate(checkOut) },
        checkOut: { gt: asDate(checkIn) },
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      select: { hotelId: true, roomTypeId: true, checkIn: true, checkOut: true, rooms: true },
    });
    const byHotel = new Map<string, LiveHotelHold[]>();
    for (const row of rows) {
      const list = byHotel.get(row.hotelId) ?? [];
      list.push({
        roomTypeId: row.roomTypeId,
        checkIn: isoDate(row.checkIn),
        checkOut: isoDate(row.checkOut),
        rooms: row.rooms,
      });
      byHotel.set(row.hotelId, list);
    }
    return byHotel;
  }

  /**
   * Serialises holds on a hotel: a transaction-scoped advisory lock per room type, taken in a
   * fixed order, so the last room can't be held twice. Must run inside a transaction.
   */
  async lockRoomTypes(roomTypeIds: string[]): Promise<void> {
    for (const id of [...roomTypeIds].sort())
      await this.db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`hotel:${id}`}))`;
  }

  async hold(
    hotelId: string,
    checkIn: string,
    checkOut: string,
    rooms: { roomTypeId: string; count: number }[],
    bookingId: string,
    expiresAt: Date,
  ): Promise<void> {
    await this.db.hotelRoomHold.createMany({
      data: rooms.map((r) => ({
        hotelId,
        roomTypeId: r.roomTypeId,
        bookingId,
        checkIn: asDate(checkIn),
        checkOut: asDate(checkOut),
        rooms: r.count,
        expiresAt,
      })),
    });
  }

  release(bookingId: string) {
    return this.db.hotelRoomHold.updateMany({
      where: { bookingId, active: true },
      data: { active: null },
    });
  }

  markPaid(bookingId: string) {
    return this.db.hotelRoomHold.updateMany({
      where: { bookingId, active: true },
      data: { expiresAt: null },
    });
  }
}
