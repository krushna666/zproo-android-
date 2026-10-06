import {
  hotelDestination,
  hotelDetails,
  hotelPlan,
  hotelPlansAt,
  hotelPriceBreakdown,
  hotelResultsPage,
  hotelRoomTypes,
  hotelSummary,
  quoteHotelRooms,
  searchHotelDestinations,
  type LiveHotelHold,
} from '@zproo/catalog';
import type {
  HotelBookResponse,
  HotelRoomsResponse,
  HotelSearchResponse,
  HotelSummary,
} from '@zproo/types';
import { generateBookingReference } from '@zproo/utils';
import {
  bookHotelSchema,
  HOTEL_MESSAGES,
  hotelRoomsQuerySchemaAt,
  hotelSearchSchemaAt,
  nightsBetween,
  roomFitsMessage,
  serializeRooms,
  todayInIst,
} from '@zproo/validation';
import { activeHolds, newBooking } from './bookings';
import {
  currentUser,
  db,
  invalid,
  parse,
  priceChanged,
  roomUnavailable,
  save,
  StaticError,
  type StaticRequest,
  type StaticResult,
} from './core';
import { idempotencyKey } from './flights';

const GONE = 'This hotel is no longer available. Please search again.';
const HOTEL_PATH = /^htl_[A-Z]{3}\d{3}$/;

/** Rooms held or booked in this browser for a hotel (the static mode's hotel_room_holds). */
function holdsFor(hotelId: string): LiveHotelHold[] {
  return activeHolds().flatMap((h) =>
    h.kind === 'hotel' && h.hotelId === hotelId
      ? [{ roomTypeId: h.roomTypeId, checkIn: h.checkIn, checkOut: h.checkOut, rooms: h.rooms }]
      : [],
  );
}

const planOf = (hotelId: string) => (HOTEL_PATH.test(hotelId) ? hotelPlan(hotelId) : null);

const leadGuestGender = (title: string) =>
  title === 'MR' || title === 'MSTR'
    ? 'MALE'
    : title === 'MRS' || title === 'MS' || title === 'MISS'
      ? 'FEMALE'
      : 'OTHER';

export function hotelRoutes(req: StaticRequest): StaticResult | null {
  const { method, path, params } = req;
  const now = () => new Date();

  if (method === 'GET' && path === '/hotels/destinations') {
    const q = (params.q ?? '').trim();
    if (!/^[A-Za-z0-9 '&-]{1,60}$/.test(q))
      throw invalid([{ path: 'query.q', message: 'Type a city, area or hotel' }]);
    return { data: searchHotelDestinations(q) };
  }

  if (method === 'GET' && path === '/hotels/search') {
    const search = parse(hotelSearchSchemaAt(now), params, 'query');
    const destination = hotelDestination(search.destinationId);
    if (!destination)
      throw invalid([{ path: 'query.destinationId', message: HOTEL_MESSAGES.destination }]);
    const at = now();
    const hotels = hotelPlansAt(search.destinationId)
      .map((p) =>
        hotelSummary(p, search.checkIn, search.checkOut, search.rooms, at, holdsFor(p.hotelId)),
      )
      .filter((h): h is HotelSummary => h !== null);
    const result: HotelSearchResponse = {
      searchId: `hsrch_static_${search.destinationId}_${search.checkIn}_${serializeRooms(search.rooms)}`,
      serverNow: at.toISOString(),
      destination,
      checkIn: search.checkIn,
      checkOut: search.checkOut,
      nights: nightsBetween(search.checkIn, search.checkOut),
      rooms: search.rooms,
      ...hotelResultsPage(hotels, search),
      demo: true,
    };
    return { data: result };
  }

  if (method === 'POST' && path === '/hotels/book') {
    const user = currentUser();
    const key = idempotencyKey(req);
    const input = parse(bookHotelSchema, req.body, 'body');
    const existing = db().bookings.find((b) => b.userId === user.id && b.idempotencyKey === key);
    if (existing) {
      const d = existing.details;
      const replay: HotelBookResponse = {
        bookingRef: d.reference,
        status: 'HELD',
        holdExpiresAt: d.holdExpiresAt ?? now().toISOString(),
        serverNow: now().toISOString(),
        priceBreakdown: d.price,
      };
      return { status: 201, data: replay };
    }

    const today = todayInIst(now());
    const nights = nightsBetween(input.checkIn, input.checkOut);
    const issues: { path: string; message: string }[] = [];
    if (input.checkIn < today)
      issues.push({ path: 'body.checkIn', message: HOTEL_MESSAGES.checkInPast });
    if (nights < 1) issues.push({ path: 'body.checkOut', message: HOTEL_MESSAGES.checkOut });
    else if (nights > 30) issues.push({ path: 'body.checkOut', message: HOTEL_MESSAGES.maxNights });
    if (issues.length > 0) throw invalid(issues);

    const plan = planOf(input.hotelId);
    if (!plan) throw new StaticError(404, 'NOT_FOUND', GONE);
    const quote = quoteHotelRooms(
      plan,
      input.checkIn,
      input.checkOut,
      input.rooms,
      holdsFor(plan.hotelId),
    );
    if (!quote.ok) {
      if (quote.error === 'ROOM_UNAVAILABLE') throw roomUnavailable(quote.roomTypeId);
      if (quote.error === 'OCCUPANCY')
        throw invalid([
          {
            path: `body.rooms.${quote.index}.${quote.field}`,
            message: roomFitsMessage(quote.max, quote.field === 'adults' ? 'adults' : 'children'),
          },
        ]);
      throw invalid([{ path: `body.rooms.${quote.index}.rateId`, message: HOTEL_MESSAGES.rate }]);
    }
    const price = hotelPriceBreakdown(quote.rooms, nights);
    if (price.totalPaise !== input.expectedTotal)
      throw priceChanged(input.expectedTotal, price.totalPaise);

    const details = hotelDetails(plan, true);
    const booking = newBooking({
      reference: generateBookingReference('HOTEL'),
      serviceType: 'HOTEL',
      price,
      travelDate: input.checkIn,
      contact: { email: input.contact.email, phone: input.contact.mobile },
      passengers: input.rooms.map((r, i) => ({
        id: `p${i + 1}`,
        type: 'ADULT',
        title: r.leadGuest.title,
        firstName: r.leadGuest.firstName,
        lastName: r.leadGuest.lastName,
        dateOfBirth: null,
        travellingWith: null,
        age: null,
        gender: leadGuestGender(r.leadGuest.title),
        seatNumber: null,
      })),
      flights: [],
      bus: null,
      hotel: {
        hotel: {
          hotelId: details.hotelId,
          name: details.name,
          stars: details.stars,
          address: details.address,
          city: details.city,
          phone: details.phone,
          checkInTime: details.checkInTime,
          checkOutTime: details.checkOutTime,
          images: details.images.slice(0, 3),
          houseRules: details.houseRules,
        },
        checkIn: input.checkIn,
        checkOut: input.checkOut,
        nights,
        rooms: quote.rooms.map((q, i) => ({
          roomTypeId: q.roomTypeId,
          roomName: q.roomName,
          rateId: q.rateId,
          boardBasis: q.boardBasis,
          refundable: q.refundable,
          freeCancellationUntil: q.freeCancellationUntil,
          adults: q.adults,
          childAges: q.childAges,
          leadGuest: input.rooms[i]?.leadGuest ?? { title: '', firstName: '', lastName: '' },
          price: q.price,
          nightlyBreakdown: q.nightlyBreakdown,
        })),
        specialRequests: input.specialRequests || null,
        confirmationNo: null,
        supplierRef: null,
      },
    });
    const perType = new Map<string, number>();
    for (const r of input.rooms) perType.set(r.roomTypeId, (perType.get(r.roomTypeId) ?? 0) + 1);
    db().bookings.push({
      userId: user.id,
      idempotencyKey: key,
      details: booking,
      holds: [...perType].map(([roomTypeId, rooms]) => ({
        kind: 'hotel' as const,
        hotelId: plan.hotelId,
        roomTypeId,
        checkIn: input.checkIn,
        checkOut: input.checkOut,
        rooms,
      })),
    });
    save();
    const result: HotelBookResponse = {
      bookingRef: booking.reference,
      status: 'HELD',
      holdExpiresAt: booking.holdExpiresAt ?? now().toISOString(),
      serverNow: now().toISOString(),
      priceBreakdown: booking.price,
    };
    return { status: 201, data: result, message: 'Rooms held. Complete payment to confirm.' };
  }

  const roomsMatch = /^\/hotels\/([^/]+)\/rooms$/.exec(path);
  if (method === 'GET' && roomsMatch) {
    const plan = planOf(decodeURIComponent(roomsMatch[1] as string));
    if (!plan) throw new StaticError(404, 'NOT_FOUND', GONE);
    const stay = parse(hotelRoomsQuerySchemaAt(now), params, 'query');
    const result: HotelRoomsResponse = {
      hotelId: plan.hotelId,
      serverNow: now().toISOString(),
      checkIn: stay.checkIn,
      checkOut: stay.checkOut,
      nights: nightsBetween(stay.checkIn, stay.checkOut),
      roomTypes: hotelRoomTypes(plan, stay.checkIn, stay.checkOut, holdsFor(plan.hotelId)),
      demo: true,
    };
    return { data: result };
  }

  const hotelMatch = /^\/hotels\/([^/]+)$/.exec(path);
  if (method === 'GET' && hotelMatch) {
    const plan = planOf(decodeURIComponent(hotelMatch[1] as string));
    if (!plan) throw new StaticError(404, 'NOT_FOUND', GONE);
    return { data: hotelDetails(plan, true) };
  }
  return null;
}
