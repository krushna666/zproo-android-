import {
  BUS_CITY_CODES,
  busSeatsFor,
  busTripDetails,
  busTripPlan,
  busTripPlans,
  busTripSummary,
} from '@zproo/catalog';
import { searchCities } from '@zproo/config';
import type { BusCity, BusSeatMap, BusTripDetails, BusTripSummary } from '@zproo/types';
import { MAX_BUS_SEATS } from '@zproo/validation';
import { simulateSupplier } from '../../lib/scenario';
import { clock, currentScenario } from '../../lib/testContext';
import { BusRepository } from '../../repositories/bus.repository';
import type { Db } from '../../repositories/db';
import { randomDigits } from '../../utils/crypto';
import { SeatUnavailableError } from '../../utils/errors';
import type { BusProvider, BusSearchQuery, SeatHoldRequest } from './BusProvider';

/** `price_changed` scenario: the re-price at booking is this much higher. */
const PRICE_CHANGE_PAISE = 15_000;

/**
 * Development bus supplier. Trips, seats and prices come from the shared deterministic generator
 * (@zproo/catalog, also used by the static website); seats held or sold through ZPROO GO are
 * rows in bus_seat_holds. `isDemo` is true, and tickets are marked as demo.
 *
 * Test scenarios (X-Mock-Scenario, NODE_ENV=test only): seat_taken, price_changed,
 * provider_down, slow, no_results.
 */
export class MockBusProvider implements BusProvider {
  readonly name = 'mock';
  readonly isDemo = true;
  /** Seats "sold by another customer" in the seat_taken scenario (process memory, tests only). */
  private readonly takenElsewhere = new Set<string>();

  constructor(
    private readonly db: Db,
    private readonly now: () => Date = clock.now,
  ) {}

  async cities(query: string): Promise<BusCity[]> {
    return searchCities(query, { only: BUS_CITY_CODES, limit: 10 }).map((c) => ({
      code: c.code,
      name: c.name,
      state: c.state,
      popular: Boolean(c.popular),
    }));
  }

  async search(query: BusSearchQuery): Promise<BusTripSummary[]> {
    await simulateSupplier();
    if (currentScenario() === 'no_results') return [];
    const now = this.now();
    const plans = busTripPlans(query.from, query.to, query.date, now);
    const holds = await this.holds(plans.map((p) => p.tripId));
    return plans
      .map((p) => busTripSummary(p, now, holds.get(p.tripId)))
      .filter((t) => t.seatsLeft > 0);
  }

  async getTrip(tripId: string): Promise<BusTripDetails | null> {
    await simulateSupplier();
    const plan = busTripPlan(tripId);
    if (!plan) return null;
    return busTripDetails(plan, this.now(), (await this.holds([tripId])).get(tripId));
  }

  async getSeatMap(tripId: string): Promise<BusSeatMap | null> {
    await simulateSupplier();
    const plan = busTripPlan(tripId);
    if (!plan) return null;
    const now = this.now();
    const { layout, decks } = busSeatsFor(plan, now, (await this.holds([tripId])).get(tripId));
    return {
      tripId,
      serverNow: now.toISOString(),
      layout,
      decks,
      maxSelectable: MAX_BUS_SEATS,
      bookable: busTripDetails(plan, now).bookable,
      demo: this.isDemo,
    };
  }

  async reprice(tripId: string, seats: string[]) {
    await simulateSupplier();
    const plan = busTripPlan(tripId);
    if (!plan) return null;
    const all = busSeatsFor(plan, this.now()).seats;
    const quotes = seats.map((seatNo, i) => {
      const seat = all.find((s) => s.seatNo === seatNo);
      const bump = currentScenario() === 'price_changed' && i === 0 ? PRICE_CHANGE_PAISE : 0;
      return { seatNo, price: (seat?.price ?? 0) + bump };
    });
    return { seats: quotes, ac: plan.coach.info.ac };
  }

  async hold(
    tripId: string,
    seats: SeatHoldRequest[],
    bookingId: string,
    expiresAt: Date,
    db: Db,
  ): Promise<void> {
    if (currentScenario() === 'seat_taken' && seats[0]) {
      // Someone else buys the first chosen seat just before us.
      this.takenElsewhere.add(`${tripId}:${seats[0].seatNo}`);
      throw new SeatUnavailableError([seats[0].seatNo]);
    }
    const plan = busTripPlan(tripId);
    if (!plan) throw new SeatUnavailableError(seats.map((s) => s.seatNo));
    const { seats: all } = busSeatsFor(plan, this.now());
    const sold = seats
      .filter((s) => {
        const seat = all.find((x) => x.seatNo === s.seatNo);
        return !seat || seat.presold || this.takenElsewhere.has(`${tripId}:${s.seatNo}`);
      })
      .map((s) => s.seatNo);
    if (sold.length > 0) throw new SeatUnavailableError(sold);
    const ok = await new BusRepository(db).hold(tripId, seats, bookingId, expiresAt);
    if (!ok) {
      // Find which seats a concurrent booking took, for the message.
      const holds =
        (await new BusRepository(this.db).liveHolds([tripId], this.now())).get(tripId) ?? [];
      const taken = seats.map((s) => s.seatNo).filter((n) => holds.some((h) => h.seatNo === n));
      throw new SeatUnavailableError(taken.length > 0 ? taken : seats.map((s) => s.seatNo));
    }
  }

  async release(bookingId: string, db: Db): Promise<void> {
    await new BusRepository(db).release(bookingId);
  }

  async issue(tripId: string): Promise<{ pnr: string }> {
    const operator = busTripPlan(tripId)?.operator.code ?? 'BUS';
    return { pnr: `${operator}${randomDigits(7)}` };
  }

  async cancel(bookingId: string, _pnr: string | null, db: Db): Promise<void> {
    await new BusRepository(db).release(bookingId);
  }

  private async holds(tripIds: string[]) {
    const holds = await new BusRepository(this.db).liveHolds(tripIds, this.now());
    for (const key of this.takenElsewhere) {
      const [trip = '', seatNo = ''] = key.split(':');
      if (!tripIds.includes(trip)) continue;
      const list = holds.get(trip) ?? [];
      list.push({ seatNo, female: false });
      holds.set(trip, list);
    }
    return holds;
  }
}
