import {
  HOTEL_CITY_CODES,
  hotelDetails,
  hotelPlan,
  hotelPlansAt,
  hotelRoomTypes,
  hotelSummary,
  quoteHotelRooms,
  roomsLeftFor,
  searchHotelDestinations,
  type HotelQuoteResult,
  type HotelRoomRequest,
} from '@zproo/catalog';
import type { HotelDestination, HotelDetails, HotelRoomType, HotelSummary } from '@zproo/types';
import { simulateSupplier } from '../../lib/scenario';
import { clock, currentScenario } from '../../lib/testContext';
import type { Db } from '../../repositories/db';
import { HotelRepository } from '../../repositories/hotel.repository';
import { randomDigits } from '../../utils/crypto';
import { RoomUnavailableError } from '../../utils/errors';
import type { HotelProvider, HotelSearchQuery, HotelStay } from './HotelProvider';

/** `price_changed` scenario: each room's first night is this much dearer at booking. */
const PRICE_CHANGE_PAISE = 40_000;
const REF_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * Development hotel supplier on the shared deterministic generator (@zproo/catalog). Rooms held or
 * sold through ZPROO GO are rows in hotel_room_holds. `isDemo` is true; vouchers say so.
 *
 * Test scenarios (X-Mock-Scenario, NODE_ENV=test only): room_sold_out, price_changed,
 * provider_down, slow, no_results.
 */
export class MockHotelProvider implements HotelProvider {
  readonly name = 'mock';
  readonly isDemo = true;

  constructor(
    private readonly db: Db,
    private readonly now: () => Date = clock.now,
  ) {}

  async destinations(query: string): Promise<HotelDestination[]> {
    return searchHotelDestinations(query);
  }

  async search(query: HotelSearchQuery): Promise<HotelSummary[]> {
    await simulateSupplier();
    if (currentScenario() === 'no_results') return [];
    const plans = hotelPlansAt(query.destinationId);
    const holds = await new HotelRepository(this.db).liveHolds(
      plans.map((p) => p.hotelId),
      query.checkIn,
      query.checkOut,
      this.now(),
    );
    const now = this.now();
    return plans
      .map((p) =>
        hotelSummary(p, query.checkIn, query.checkOut, query.rooms, now, holds.get(p.hotelId)),
      )
      .filter((h): h is HotelSummary => h !== null);
  }

  async details(hotelId: string): Promise<HotelDetails | null> {
    await simulateSupplier();
    const plan = hotelPlan(hotelId);
    return plan && HOTEL_CITY_CODES.has(plan.cityCode) ? hotelDetails(plan, this.isDemo) : null;
  }

  async rooms(stay: HotelStay): Promise<HotelRoomType[] | null> {
    await simulateSupplier();
    const plan = hotelPlan(stay.hotelId);
    if (!plan) return null;
    return hotelRoomTypes(plan, stay.checkIn, stay.checkOut, await this.holds(stay));
  }

  async quote(stay: HotelStay, rooms: HotelRoomRequest[]): Promise<HotelQuoteResult | null> {
    await simulateSupplier();
    const plan = hotelPlan(stay.hotelId);
    if (!plan) return null;
    const quote = quoteHotelRooms(plan, stay.checkIn, stay.checkOut, rooms, await this.holds(stay));
    if (!quote.ok || currentScenario() !== 'price_changed') return quote;
    // The hotel raised its price since the customer looked.
    return {
      ok: true,
      rooms: quote.rooms.map((r) => ({
        ...r,
        price: r.price + PRICE_CHANGE_PAISE,
        nightlyBreakdown: r.nightlyBreakdown.map((n, i) =>
          i === 0 ? { ...n, price: n.price + PRICE_CHANGE_PAISE } : n,
        ),
      })),
    };
  }

  /**
   * Under per-room-type advisory locks (this transaction), re-counts free rooms with every live
   * hold and inserts the new ones, so two customers can never both take the last room.
   */
  async hold(
    stay: HotelStay,
    rooms: { roomTypeId: string; count: number }[],
    bookingId: string,
    expiresAt: Date,
    db: Db,
  ): Promise<void> {
    const first = rooms[0];
    if (currentScenario() === 'room_sold_out' && first)
      throw new RoomUnavailableError(first.roomTypeId);
    const plan = hotelPlan(stay.hotelId);
    if (!plan) throw new RoomUnavailableError(first?.roomTypeId);
    const repo = new HotelRepository(db);
    await repo.lockRoomTypes(rooms.map((r) => r.roomTypeId));
    const holds =
      (await repo.liveHolds([stay.hotelId], stay.checkIn, stay.checkOut, this.now())).get(
        stay.hotelId,
      ) ?? [];
    for (const r of rooms) {
      const rt = plan.roomTypes.find((t) => t.roomTypeId === r.roomTypeId);
      if (!rt || roomsLeftFor(plan, rt, stay.checkIn, stay.checkOut, holds) < r.count)
        throw new RoomUnavailableError(r.roomTypeId);
    }
    await repo.hold(stay.hotelId, stay.checkIn, stay.checkOut, rooms, bookingId, expiresAt);
  }

  async release(bookingId: string, db: Db): Promise<void> {
    await new HotelRepository(db).release(bookingId);
  }

  async markPaid(bookingId: string, db: Db): Promise<void> {
    await new HotelRepository(db).markPaid(bookingId);
  }

  async issue(hotelId: string): Promise<{ confirmationNo: string; supplierRef: string }> {
    const ref = Array.from(
      { length: 8 },
      (_, i) => REF_ALPHABET[Number(randomDigits(2)) % REF_ALPHABET.length] ?? String(i),
    ).join('');
    return { confirmationNo: `${hotelId.slice(4, 7)}${randomDigits(7)}`, supplierRef: `MB-${ref}` };
  }

  async cancel(bookingId: string, _confirmationNo: string | null, db: Db): Promise<void> {
    await new HotelRepository(db).release(bookingId);
  }

  private async holds(stay: HotelStay) {
    return (
      (
        await new HotelRepository(this.db).liveHolds(
          [stay.hotelId],
          stay.checkIn,
          stay.checkOut,
          this.now(),
        )
      ).get(stay.hotelId) ?? []
    );
  }
}
