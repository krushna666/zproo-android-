import { searchCities } from '@zproo/config';
import {
  BUS_CITY_CODES,
  busFareBreakdown,
  busSearchFilters,
  busSeatsFor,
  busTripDetails,
  busTripPlan,
  busTripPlans,
  busTripSummary,
  type LiveHold,
} from '@zproo/catalog';
import type {
  BookingPassengerInfo,
  BusBookResponse,
  BusCity,
  BusSearchResponse,
  BusSeatMap,
} from '@zproo/types';
import { generateBookingReference } from '@zproo/utils';
import {
  BUS_MESSAGES,
  bookBusSchema,
  busSearchInputFromParams,
  busSearchSchema,
  MAX_BUS_SEATS,
} from '@zproo/validation';
import { activeHolds, newBooking } from './bookings';
import {
  currentUser,
  db,
  invalid,
  parse,
  priceChanged,
  save,
  seatUnavailable,
  StaticError,
  type StaticRequest,
  type StaticResult,
} from './core';
import { idempotencyKey } from './flights';

const GONE = 'This bus is no longer available. Please search again.';
const TRIP_PATH = /^trp_[A-Z]{3}_[A-Z]{3}_\d{8}_\d{2}$/;

/** Seats held or booked in this browser for a trip (the static mode's bus_seat_holds). */
function holdsFor(tripId: string): LiveHold[] {
  return activeHolds().flatMap((h) => (h.kind === 'bus' && h.tripId === tripId ? h.seats : []));
}

function planOf(tripId: string) {
  return TRIP_PATH.test(tripId) ? busTripPlan(tripId) : null;
}

function seatMap(tripId: string): BusSeatMap | null {
  const plan = planOf(tripId);
  if (!plan) return null;
  const now = new Date();
  const { layout, decks } = busSeatsFor(plan, now, holdsFor(tripId));
  return {
    tripId,
    serverNow: now.toISOString(),
    layout,
    decks,
    maxSelectable: MAX_BUS_SEATS,
    bookable: busTripDetails(plan, now).bookable,
    demo: true,
  };
}

const busTitle = (gender: string, age: number): BookingPassengerInfo['title'] =>
  gender === 'MALE'
    ? age < 12
      ? 'MSTR'
      : 'MR'
    : gender === 'FEMALE'
      ? age < 12
        ? 'MISS'
        : 'MS'
      : 'MX';

function splitName(name: string) {
  const parts = name.trim().split(/\s+/);
  return parts.length > 1
    ? { firstName: parts.slice(0, -1).join(' '), lastName: parts.at(-1) as string }
    : { firstName: parts[0] ?? name, lastName: '' };
}

export function busRoutes(req: StaticRequest): StaticResult | null {
  const { method, path, params } = req;

  if (method === 'GET' && path === '/buses/cities') {
    const q = (params.q ?? '').trim();
    if (!/^[A-Za-z ]{1,40}$/.test(q))
      throw invalid([{ path: 'query.q', message: 'Type a city name' }]);
    const cities: BusCity[] = searchCities(q, { only: BUS_CITY_CODES, limit: 10 }).map((c) => ({
      code: c.code,
      name: c.name,
      state: c.state,
      popular: Boolean(c.popular),
    }));
    return { data: cities };
  }

  if (method === 'GET' && path === '/buses/search') {
    const search = parse(
      busSearchSchema,
      busSearchInputFromParams({ get: (n) => params[n] ?? null }),
      'query',
    );
    const now = new Date();
    const trips = busTripPlans(search.from, search.to, search.date, now)
      .map((p) => busTripSummary(p, now, holdsFor(p.tripId)))
      .filter((t) => t.seatsLeft > 0);
    const result: BusSearchResponse = {
      searchId: `srch_static_${search.from}_${search.to}_${search.date.replaceAll('-', '')}`,
      serverNow: now.toISOString(),
      from: search.from,
      to: search.to,
      date: search.date,
      trips,
      filters: busSearchFilters(trips),
      demo: true,
    };
    return { data: result };
  }

  if (method === 'POST' && path === '/buses/book') {
    const user = currentUser();
    const key = idempotencyKey(req);
    const input = parse(bookBusSchema, req.body, 'body');
    const existing = db().bookings.find((b) => b.userId === user.id && b.idempotencyKey === key);
    if (existing) {
      const d = existing.details;
      const replay: BusBookResponse = {
        bookingRef: d.reference,
        status: 'HELD',
        holdExpiresAt: d.holdExpiresAt ?? new Date().toISOString(),
        serverNow: new Date().toISOString(),
        priceBreakdown: d.price,
      };
      return { status: 201, data: replay };
    }

    const plan = planOf(input.tripId);
    const now = new Date();
    const trip = plan && busTripDetails(plan, now, holdsFor(input.tripId));
    const map = seatMap(input.tripId);
    if (!plan || !trip || !map) throw new StaticError(404, 'NOT_FOUND', GONE);
    if (!trip.bookable) throw new StaticError(409, 'BOOKING_CLOSED', BUS_MESSAGES.closed);

    const boarding = trip.boardingPoints.find((p) => p.id === input.boardingPointId);
    const dropping = trip.droppingPoints.find((p) => p.id === input.droppingPointId);
    const issues: { path: string; message: string }[] = [];
    if (!boarding)
      issues.push({ path: 'body.boardingPointId', message: BUS_MESSAGES.boardingPoint });
    if (!dropping)
      issues.push({ path: 'body.droppingPointId', message: BUS_MESSAGES.droppingPoint });
    if (boarding && dropping && Date.parse(boarding.time) >= Date.parse(dropping.time))
      issues.push({
        path: 'body.droppingPointId',
        message: 'Choose a dropping point after your boarding point',
      });
    const bySeat = new Map(map.decks.flatMap((d) => d.seats).map((s) => [s.seatNo, s]));
    input.seats.forEach((seatNo, i) => {
      if (!bySeat.has(seatNo))
        issues.push({ path: `body.seats.${i}`, message: `Seat ${seatNo} isn't on this bus` });
    });
    input.travellers.forEach((t, i) => {
      if (bySeat.get(t.seatNo)?.ladiesOnly && t.gender !== 'FEMALE')
        issues.push({ path: `body.travellers.${i}.gender`, message: BUS_MESSAGES.ladiesSeat });
    });
    if (issues.length > 0) throw invalid(issues);

    const taken = input.seats.filter((n) => bySeat.get(n)?.status !== 'AVAILABLE');
    if (taken.length > 0) throw seatUnavailable(taken);

    const price = busFareBreakdown(
      input.seats.map((seatNo) => ({ seatNo, price: bySeat.get(seatNo)?.price ?? 0 })),
      trip.busType.ac,
    );
    if (price.totalPaise !== input.expectedTotal)
      throw priceChanged(input.expectedTotal, price.totalPaise);

    const gender = new Map(input.travellers.map((t) => [t.seatNo, t.gender]));
    const details = newBooking({
      reference: generateBookingReference('BUS'),
      serviceType: 'BUS',
      price,
      travelDate: trip.date,
      contact: { email: input.contact.email, phone: input.contact.mobile },
      passengers: input.travellers.map((t, i) => ({
        id: `p${i + 1}`,
        type: t.age < 12 ? 'CHILD' : 'ADULT',
        title: busTitle(t.gender, t.age),
        ...splitName(t.name),
        dateOfBirth: null,
        travellingWith: null,
        age: t.age,
        gender: t.gender,
        seatNumber: t.seatNo,
      })),
      flights: [],
      bus: {
        trip,
        seats: input.seats,
        boardingPoint: boarding as NonNullable<typeof boarding>,
        droppingPoint: dropping as NonNullable<typeof dropping>,
        pnr: null,
      },
    });
    db().bookings.push({
      userId: user.id,
      idempotencyKey: key,
      details,
      holds: [
        {
          kind: 'bus',
          tripId: trip.tripId,
          seats: input.seats.map((seatNo) => ({ seatNo, female: gender.get(seatNo) === 'FEMALE' })),
        },
      ],
    });
    save();
    const result: BusBookResponse = {
      bookingRef: details.reference,
      status: 'HELD',
      holdExpiresAt: details.holdExpiresAt ?? now.toISOString(),
      serverNow: now.toISOString(),
      priceBreakdown: details.price,
    };
    return { status: 201, data: result, message: 'Seats held. Complete payment to confirm.' };
  }

  const seatsMatch = /^\/buses\/([^/]+)\/seats$/.exec(path);
  if (method === 'GET' && seatsMatch) {
    const map = seatMap(decodeURIComponent(seatsMatch[1] as string));
    if (!map) throw new StaticError(404, 'NOT_FOUND', GONE);
    return { data: map };
  }

  const tripMatch = /^\/buses\/([^/]+)$/.exec(path);
  if (method === 'GET' && tripMatch) {
    const id = decodeURIComponent(tripMatch[1] as string);
    const plan = planOf(id);
    if (!plan) throw new StaticError(404, 'NOT_FOUND', GONE);
    return { data: busTripDetails(plan, new Date(), holdsFor(id)) };
  }
  return null;
}
