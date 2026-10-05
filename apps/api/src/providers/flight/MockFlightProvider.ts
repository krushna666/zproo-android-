import {
  FLIGHT_AIRPORT_CODES,
  fareFamiliesFor,
  findMockAirline,
  flightOfferDetails,
  flightOfferSummary,
  flightPlan,
  flightPlans,
  istDate,
  parseFlightOfferId,
  seatsNeeded,
  type FlightPlan,
  type OfferSigner,
} from '@zproo/catalog';
import { searchAirports } from '@zproo/config';
import type { AirportSuggestion, FlightOfferDetails, FlightOfferSummary } from '@zproo/types';
import { simulateSupplier } from '../../lib/scenario';
import { clock, currentScenario } from '../../lib/testContext';
import type { Db } from '../../repositories/db';
import { FlightRepository } from '../../repositories/flight.repository';
import { randomDigits } from '../../utils/crypto';
import { FareUnavailableError } from '../../utils/errors';
import type {
  FlightIssueResult,
  FlightProvider,
  FlightQuote,
  FlightSearchQuery,
} from './FlightProvider';

/** Sales close this long before departure. */
const SALES_CUTOFF_MS = 2 * 60 * 60 * 1000;
/** `price_changed` scenario: the re-price is this much higher (Saver, per adult). */
const PRICE_CHANGE_PAISE = 50_000;
/** `issue_pending`: the airline answers "pending" until this many attempts (payment + 2 polls). */
const PENDING_ATTEMPTS = 3;
const PNR_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * Development flight supplier on the shared deterministic generator (@zproo/catalog). Seats held
 * or sold through ZPROO GO are rows in flight_seat_holds. `isDemo` is true; tickets say so.
 *
 * Test scenarios (X-Mock-Scenario, NODE_ENV=test only): price_changed, fare_unavailable,
 * provider_down, slow, no_results, issue_pending, issue_failed.
 */
export class MockFlightProvider implements FlightProvider {
  readonly name = 'mock';
  readonly isDemo = true;

  constructor(
    private readonly db: Db,
    private readonly sign: OfferSigner,
    private readonly now: () => Date = clock.now,
  ) {}

  async airports(query: string): Promise<AirportSuggestion[]> {
    return searchAirports(query, { only: FLIGHT_AIRPORT_CODES, limit: 10 }).map((a) => ({
      iata: a.code,
      city: a.city,
      name: a.name,
      country: a.country,
    }));
  }

  async search(query: FlightSearchQuery): Promise<FlightOfferSummary[]> {
    await simulateSupplier();
    if (currentScenario() === 'no_results') return [];
    const now = this.now();
    const plans = flightPlans(query.from, query.to, query.date, query.cabin).filter((p) =>
      this.sellable(p, now),
    );
    const held = await new FlightRepository(this.db).heldSeats(
      plans.map((p) => p.itineraryKey),
      now,
    );
    return plans
      .map((p) =>
        flightOfferSummary(p, {
          pax: query.pax,
          heldSeats: held.get(p.itineraryKey) ?? 0,
          issuedAtMs: now.getTime(),
          sign: this.sign,
          today: istDate(now),
        }),
      )
      .filter((o) => o.seatsLeft >= seatsNeeded(query.pax));
  }

  async getOffer(
    offerId: string,
    options: { reprice: boolean },
  ): Promise<FlightOfferDetails | null> {
    await simulateSupplier();
    const parsed = parseFlightOfferId(offerId, this.sign);
    if (!parsed || currentScenario() === 'fare_unavailable') return null;
    const now = this.now();
    const expired = now.getTime() >= parsed.expiresAtMs;
    if (expired && !options.reprice) return null;
    const plan = flightPlan(parsed);
    if (!plan || !this.sellable(plan, now)) return null;
    const held = await this.heldFor(plan, now);
    if (plan.seats - held < seatsNeeded(parsed.pax)) return null;
    return flightOfferDetails(plan, {
      pax: parsed.pax,
      heldSeats: held,
      issuedAtMs: expired ? now.getTime() : parsed.issuedAtMs,
      sign: this.sign,
      today: istDate(now),
      bumpPaise: this.bump(),
      serverNow: now.toISOString(),
      replacesOfferId: expired ? offerId : null,
    });
  }

  async quote(offerId: string, fareId: string): Promise<FlightQuote | 'BAD_FARE' | null> {
    await simulateSupplier();
    const parsed = parseFlightOfferId(offerId, this.sign);
    if (!parsed || currentScenario() === 'fare_unavailable') return null;
    const now = this.now();
    if (now.getTime() >= parsed.expiresAtMs) return null;
    const plan = flightPlan(parsed);
    if (!plan || !this.sellable(plan, now)) return null;
    const held = await this.heldFor(plan, now);
    if (plan.seats - held < seatsNeeded(parsed.pax)) return null;
    const fare = fareFamiliesFor(plan, parsed.pax, istDate(now), this.bump()).find(
      (f) => f.fareId === fareId,
    );
    if (!fare) return 'BAD_FARE';
    const offer = flightOfferSummary(plan, {
      pax: parsed.pax,
      heldSeats: held,
      issuedAtMs: parsed.issuedAtMs,
      sign: this.sign,
      today: istDate(now),
      bumpPaise: this.bump(),
    });
    const first = plan.segments[0];
    const last = plan.segments.at(-1);
    return {
      offer: { ...offer, offerId },
      fare,
      pax: parsed.pax,
      itineraryKey: plan.itineraryKey,
      from: parsed.from,
      to: parsed.to,
      date: parsed.date,
      departureAt: new Date(first?.departureMs ?? 0),
      arrivalAt: new Date((last?.departureMs ?? 0) + (last?.durationMin ?? 0) * 60_000),
      international: plan.international,
      holdLimitMinutes: plan.airlineTimeLimitMin,
    };
  }

  async hold(quote: FlightQuote, bookingId: string, expiresAt: Date, db: Db): Promise<void> {
    const parsed = parseFlightOfferId(quote.offer.offerId, this.sign);
    const plan = parsed && flightPlan(parsed);
    if (!plan) throw new FareUnavailableError();
    const ok = await new FlightRepository(db).hold(
      plan.itineraryKey,
      seatsNeeded(quote.pax),
      plan.seats,
      bookingId,
      expiresAt,
      this.now(),
    );
    if (!ok) throw new FareUnavailableError();
  }

  async release(bookingId: string, db: Db): Promise<void> {
    await new FlightRepository(db).release(bookingId);
  }

  async markPaid(bookingId: string, db: Db): Promise<void> {
    await new FlightRepository(db).markPaid(bookingId);
  }

  async issue(input: {
    offerId: string;
    carrierCode: string;
    bookingRef: string;
    passengers: { firstName: string; lastName: string }[];
    attempt: number;
    scenario?: string | undefined;
  }): Promise<FlightIssueResult> {
    if (input.scenario === 'issue_failed')
      throw new Error('Airline rejected the ticketing request');
    if (input.scenario === 'issue_pending' && input.attempt <= PENDING_ATTEMPTS)
      return { status: 'PENDING' };
    const prefix = findMockAirline(input.carrierCode)?.ticketPrefix ?? '980';
    const pnr = Array.from(
      { length: 6 },
      () => PNR_ALPHABET[Number(randomDigits(2)) % PNR_ALPHABET.length],
    ).join('');
    return {
      status: 'ISSUED',
      pnr,
      ticketNumbers: input.passengers.map(() => `${prefix}${randomDigits(10)}`),
    };
  }

  async cancel(bookingId: string, db: Db): Promise<void> {
    await new FlightRepository(db).release(bookingId);
  }

  // ───────── internals ─────────

  private sellable(plan: FlightPlan, now: Date): boolean {
    const first = plan.segments[0];
    return first !== undefined && first.departureMs - now.getTime() > SALES_CUTOFF_MS;
  }

  private async heldFor(plan: FlightPlan, now: Date): Promise<number> {
    return (
      (await new FlightRepository(this.db).heldSeats([plan.itineraryKey], now)).get(
        plan.itineraryKey,
      ) ?? 0
    );
  }

  private bump(): number {
    return currentScenario() === 'price_changed' ? PRICE_CHANGE_PAISE : 0;
  }
}
