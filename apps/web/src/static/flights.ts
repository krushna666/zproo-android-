import {
  FLIGHT_AIRPORT_CODES,
  FLIGHT_HOLD_MINUTES,
  fareFamiliesFor,
  flightOfferDetails,
  flightOfferSummary,
  flightPlan,
  flightPlans,
  flightSearchFilters,
  isInternationalAirport,
  istDate,
  parseFlightOfferId,
  seatsNeeded,
  staticOfferSigner,
  type FlightPlan,
} from '@zproo/catalog';
import { searchAirports } from '@zproo/config';
import type {
  AirportSuggestion,
  FareFamily,
  FlightBookResponse,
  FlightOfferSummary,
  FlightSearchResponse,
  PaxCounts,
} from '@zproo/types';
import { flightPriceBreakdown, generateBookingReference } from '@zproo/utils';
import {
  bookFlightSchema,
  flightAgeIssues,
  flightSearchInputFromParams,
  flightSearchSchema,
} from '@zproo/validation';
import { activeHolds, newBooking } from './bookings';
import {
  currentUser,
  db,
  fareUnavailable,
  invalid,
  parse,
  priceChanged,
  save,
  type StaticRequest,
  type StaticResult,
} from './core';

/** Sales close this long before departure (as the API's mock airline). */
const SALES_CUTOFF_MS = 2 * 60 * 60 * 1000;
const sign = staticOfferSigner;

/** Seats held or booked in this browser per itinerary (the static mode's flight_seat_holds). */
function heldSeats(itineraryKey: string): number {
  return activeHolds()
    .filter(
      (h): h is { kind: 'flight'; itineraryKey: string; seats: number } => h.kind === 'flight',
    )
    .filter((h) => h.itineraryKey === itineraryKey)
    .reduce((sum, h) => sum + h.seats, 0);
}

const sellable = (plan: FlightPlan, now: Date) =>
  (plan.segments[0]?.departureMs ?? 0) - now.getTime() > SALES_CUTOFF_MS;

function search(
  from: string,
  to: string,
  date: string,
  cabin: FlightPlan['key']['cabin'],
  pax: PaxCounts,
  now: Date,
) {
  return flightPlans(from, to, date, cabin)
    .filter((p) => sellable(p, now))
    .map((p) =>
      flightOfferSummary(p, {
        pax,
        heldSeats: heldSeats(p.itineraryKey),
        issuedAtMs: now.getTime(),
        sign,
        today: istDate(now),
      }),
    )
    .filter((o) => o.seatsLeft >= seatsNeeded(pax));
}

interface Quote {
  plan: FlightPlan;
  offer: FlightOfferSummary;
  fare: FareFamily;
  pax: PaxCounts;
  date: string;
}

/** Same rules as the API's mock: expired, gone or sold out → null; a foreign fare → 'BAD_FARE'. */
function quote(offerId: string, fareId: string, now: Date): Quote | 'BAD_FARE' | null {
  const parsed = parseFlightOfferId(offerId, sign);
  if (!parsed || now.getTime() >= parsed.expiresAtMs) return null;
  const plan = flightPlan(parsed);
  if (!plan || !sellable(plan, now)) return null;
  const held = heldSeats(plan.itineraryKey);
  if (plan.seats - held < seatsNeeded(parsed.pax)) return null;
  const fare = fareFamiliesFor(plan, parsed.pax, istDate(now)).find((f) => f.fareId === fareId);
  if (!fare) return 'BAD_FARE';
  return {
    plan,
    offer: {
      ...flightOfferSummary(plan, {
        pax: parsed.pax,
        heldSeats: held,
        issuedAtMs: parsed.issuedAtMs,
        sign,
        today: istDate(now),
      }),
      offerId,
    },
    fare,
    pax: parsed.pax,
    date: parsed.date,
  };
}

export function flightRoutes(req: StaticRequest): StaticResult | null {
  const { method, path, params } = req;
  const now = new Date();

  if (method === 'GET' && path === '/flights/airports') {
    const q = (params.q ?? '').trim();
    if (!/^[A-Za-z ]{1,40}$/.test(q))
      throw invalid([{ path: 'query.q', message: 'Type a city or airport' }]);
    const airports: AirportSuggestion[] = searchAirports(q, { only: FLIGHT_AIRPORT_CODES }).map(
      (a) => ({ iata: a.code, city: a.city, name: a.name, country: a.country }),
    );
    return { data: airports };
  }

  if (method === 'GET' && path === '/flights/search') {
    const s = parse(
      flightSearchSchema,
      flightSearchInputFromParams({ get: (n) => params[n] ?? null }),
      'query',
    );
    if (isInternationalAirport(s.from) || isInternationalAirport(s.to))
      throw invalid([{ path: 'query.to', message: 'International flights are coming soon' }]);
    const pax = { adults: s.adults, children: s.children, infants: s.infants };
    const offers = search(s.from, s.to, s.date, s.cabin, pax, now);
    const returnOffers = s.returnDate ? search(s.to, s.from, s.returnDate, s.cabin, pax, now) : [];
    const result: FlightSearchResponse = {
      searchId: `srch_static_${s.from}${s.to}_${s.date}`,
      serverNow: now.toISOString(),
      from: s.from,
      to: s.to,
      date: s.date,
      returnDate: s.returnDate ?? null,
      pax,
      cabin: s.cabin,
      offers,
      returnOffers,
      filters: flightSearchFilters([...offers, ...returnOffers]),
      demo: true,
    };
    return { data: result };
  }

  if (method === 'POST' && path === '/flights/book') {
    const user = currentUser();
    const key = idempotencyKey(req);
    const input = parse(bookFlightSchema, req.body, 'body');
    const existing = db().bookings.find((b) => b.userId === user.id && b.idempotencyKey === key);
    if (existing) {
      const replay: FlightBookResponse = {
        bookingRef: existing.details.reference,
        status: 'HELD',
        holdExpiresAt: existing.details.holdExpiresAt ?? now.toISOString(),
        serverNow: now.toISOString(),
        priceBreakdown: existing.details.price,
      };
      return { status: 201, data: replay };
    }

    const leg = (offerId: string, fareId: string, field: string) => {
      const q = quote(offerId, fareId, now);
      if (q === null) throw fareUnavailable();
      if (q === 'BAD_FARE') throw invalid([{ path: `body.${field}`, message: 'Invalid fare' }]);
      return q;
    };
    const outbound = leg(input.offerId, input.fareId, 'fareId');
    const inbound =
      input.returnOfferId && input.returnFareId
        ? leg(input.returnOfferId, input.returnFareId, 'returnFareId')
        : null;
    const legs = inbound ? [outbound, inbound] : [outbound];
    const pax = outbound.pax;

    const issues: { path: string; message: string }[] = [];
    if (
      inbound &&
      (inbound.plan.key.from !== outbound.plan.key.to ||
        inbound.plan.key.to !== outbound.plan.key.from ||
        inbound.date < outbound.date ||
        JSON.stringify(inbound.pax) !== JSON.stringify(pax))
    )
      issues.push({ path: 'body.returnOfferId', message: 'Choose a return flight for this trip' });
    const count = (t: string) => input.travellers.filter((p) => p.type === t).length;
    if (
      count('ADULT') !== pax.adults ||
      count('CHILD') !== pax.children ||
      count('INFANT') !== pax.infants
    )
      issues.push({ path: 'body.travellers', message: 'Travellers must match your search' });
    for (const issue of flightAgeIssues(input.travellers, outbound.date, istDate(now)))
      issues.push({ path: `body.travellers.${issue.index}.dob`, message: issue.message });
    if (issues.length > 0) throw invalid(issues);

    const price = flightPriceBreakdown(
      legs.map((l) => l.fare),
      pax,
    );
    if (price.totalPaise !== input.expectedTotal)
      throw priceChanged(input.expectedTotal, price.totalPaise);

    const holdMinutes = Math.min(
      FLIGHT_HOLD_MINUTES,
      ...legs.map((l) => l.plan.airlineTimeLimitMin),
    );
    const details = newBooking(
      {
        reference: generateBookingReference('FLIGHT'),
        serviceType: 'FLIGHT',
        price,
        travelDate: outbound.date,
        contact: { email: input.contact.email, phone: input.contact.mobile },
        // Static mode stores no passport details at all.
        passengers: input.travellers.map((t, i) => ({
          id: `p${i + 1}`,
          type: t.type,
          title: t.title,
          firstName: t.firstName,
          lastName: t.lastName,
          dateOfBirth: t.dob ?? null,
          travellingWith: t.infantOfIndex ?? null,
          age: null,
          gender: t.gender,
          seatNumber: null,
        })),
        flights: legs.map((l, i) => ({
          sequence: i + 1,
          offer: l.offer,
          fare: l.fare,
          pnr: null,
          tickets: [],
        })),
        bus: null,
      },
      holdMinutes,
    );
    db().bookings.push({
      userId: user.id,
      idempotencyKey: key,
      details,
      holds: legs.map((l) => ({
        kind: 'flight' as const,
        itineraryKey: l.plan.itineraryKey,
        seats: seatsNeeded(pax),
      })),
    });
    save();
    const result: FlightBookResponse = {
      bookingRef: details.reference,
      status: 'HELD',
      holdExpiresAt: details.holdExpiresAt ?? now.toISOString(),
      serverNow: now.toISOString(),
      priceBreakdown: details.price,
    };
    return { status: 201, data: result, message: 'Seats held. Complete payment to confirm.' };
  }

  const offerMatch = /^\/flights\/([^/]+)$/.exec(path);
  if (method === 'GET' && offerMatch) {
    const offerId = decodeURIComponent(offerMatch[1] as string);
    const parsed = parseFlightOfferId(offerId, sign);
    if (!parsed) throw fareUnavailable();
    const expired = now.getTime() >= parsed.expiresAtMs;
    if (expired && params.reprice !== '1') throw fareUnavailable();
    const plan = flightPlan(parsed);
    if (!plan || !sellable(plan, now)) throw fareUnavailable();
    const held = heldSeats(plan.itineraryKey);
    if (plan.seats - held < seatsNeeded(parsed.pax)) throw fareUnavailable();
    return {
      data: flightOfferDetails(plan, {
        pax: parsed.pax,
        heldSeats: held,
        issuedAtMs: expired ? now.getTime() : parsed.issuedAtMs,
        sign,
        today: istDate(now),
        serverNow: now.toISOString(),
        replacesOfferId: expired ? offerId : null,
      }),
    };
  }
  return null;
}

export function idempotencyKey(req: StaticRequest): string {
  const key = req.headers['idempotency-key'] ?? '';
  if (key.length < 8) {
    throw invalid([
      {
        path: 'headers.idempotency-key',
        message: 'Send a unique Idempotency-Key header (e.g. a UUID)',
      },
    ]);
  }
  return key;
}
