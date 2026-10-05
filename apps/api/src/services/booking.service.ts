import { Prisma, type PrismaClient } from '@prisma/client';
import type {
  BookingDetails,
  BookingListItem,
  BusBookResponse,
  FlightBookResponse,
} from '@zproo/types';
import type { Redis } from 'ioredis';
import { OPEN_HOLD_STATUSES, generateBookingReference } from '@zproo/utils';
import {
  BUS_MESSAGES,
  FLIGHT_MESSAGES,
  flightAgeIssues,
  type BookBusInput,
  type BookFlightInput,
} from '@zproo/validation';
import { acquireLock } from '../lib/lock';
import type { Logger } from 'pino';
import { toBookResult, toBookingDetails, toBookingListItem } from '../models/booking.dto';
import type { BusProvider } from '../providers/bus';
import type { FlightProvider } from '../providers/flight';
import { BookingRepository, type BookingRecord } from '../repositories/booking.repository';
import { PaymentRepository } from '../repositories/payment.repository';
import {
  AuthorizationError,
  BookingClosedError,
  FareUnavailableError,
  InvalidStateError,
  NotFoundError,
  PriceChangedError,
  SeatUnavailableError,
  ValidationError,
} from '../utils/errors';
import { localDate } from '../utils/time';
import type { AuditService, RequestContext } from './audit.service';
import { busFareBreakdown } from './busPricing';
import { flightPriceBreakdown } from './flightPricing';
import { encryptField } from '../lib/crypto';
import { clock, currentScenario } from '../lib/testContext';

interface BookingServiceDeps {
  prisma: PrismaClient;
  flights: FlightProvider;
  buses: BusProvider;
  audit: AuditService;
  logger: Logger;
  holdMinutes: number;
  /** Key for passport fields (AES-256-GCM) */
  piiKey?: Buffer | undefined;
  /** INTL_FLIGHTS */
  internationalFlights?: boolean;
  /** Seat locks; optional (the database constraint alone also keeps holds exclusive). */
  redis?: Redis | undefined;
  now?: () => Date;
}

export class BookingService {
  private readonly now: () => Date;

  constructor(private readonly deps: BookingServiceDeps) {
    this.now = deps.now ?? clock.now;
  }

  /** POST /flights/book — returns `{ bookingRef, status, holdExpiresAt, serverNow, priceBreakdown }`. */
  createFlightBooking(
    userId: string,
    input: BookFlightInput,
    idempotencyKey: string,
    ctx: RequestContext,
  ): Promise<FlightBookResponse> {
    return this.idempotent(
      userId,
      idempotencyKey,
      () => this.newFlightBooking(userId, input, idempotencyKey, ctx),
      (record) => toBookResult(record, this.now()),
    );
  }

  /** POST /buses/book — returns `{ bookingRef, status, holdExpiresAt, serverNow, priceBreakdown }`. */
  createBusBooking(
    userId: string,
    input: BookBusInput,
    idempotencyKey: string,
    ctx: RequestContext,
  ): Promise<BusBookResponse> {
    return this.idempotent(
      userId,
      idempotencyKey,
      () => this.newBusBooking(userId, input, idempotencyKey, ctx),
      (record) => toBookResult(record, this.now()),
    );
  }

  /**
   * Holds a flight (one-way, or outbound + return) for a booking, in the order the contract
   * requires:
   *  1. validate: travellers match the searched passengers, ages on the travel date, infant links
   *     (schema), the fare belongs to the offer, the return mirrors the outbound;
   *  2. re-price live → FARE_UNAVAILABLE / PRICE_CHANGED before anything is held;
   *  3. hold seats for 15 minutes, or the airline's own limit when shorter;
   *  4. booking (HELD) + passengers (passports encrypted) + flight legs + event, in one transaction.
   */
  private async newFlightBooking(
    userId: string,
    input: BookFlightInput,
    idempotencyKey: string,
    ctx: RequestContext,
  ): Promise<BookingRecord> {
    const outbound = await this.flightQuote(input.offerId, input.fareId, 'fareId');
    const inbound =
      input.returnOfferId && input.returnFareId
        ? await this.flightQuote(input.returnOfferId, input.returnFareId, 'returnFareId')
        : null;
    const legs = inbound ? [outbound, inbound] : [outbound];
    const pax = outbound.pax;

    // 1. Validation that needs the offer.
    const issues: { path: string; message: string }[] = [];
    if (
      inbound &&
      (inbound.from !== outbound.to ||
        inbound.to !== outbound.from ||
        inbound.date < outbound.date ||
        inbound.offer.cabin !== outbound.offer.cabin ||
        JSON.stringify(inbound.pax) !== JSON.stringify(pax))
    ) {
      issues.push({ path: 'body.returnOfferId', message: 'Choose a return flight for this trip' });
    }
    const count = (t: string) => input.travellers.filter((p) => p.type === t).length;
    if (
      count('ADULT') !== pax.adults ||
      count('CHILD') !== pax.children ||
      count('INFANT') !== pax.infants
    ) {
      issues.push({ path: 'body.travellers', message: 'Travellers must match your search' });
    }
    for (const issue of flightAgeIssues(
      input.travellers,
      outbound.date,
      localDate(this.now(), 'Asia/Kolkata'),
    ))
      issues.push({ path: `body.travellers.${issue.index}.dob`, message: issue.message });
    if (legs.some((l) => l.international) && !this.deps.internationalFlights)
      issues.push({ path: 'body.offerId', message: 'International flights are coming soon' });
    input.travellers.forEach((t, i) => {
      if (t.passport && t.passport.expiry <= (inbound ?? outbound).date)
        issues.push({
          path: `body.travellers.${i}.passport.expiry`,
          message: FLIGHT_MESSAGES.passportExpiry,
        });
    });
    if (issues.length > 0) throw new ValidationError(issues);

    // 2. Live price; the browser's figure is only compared.
    const fares = legs.map((l) => l.fare);
    const price = flightPriceBreakdown(fares, pax);
    if (price.totalPaise !== input.expectedTotal)
      throw new PriceChangedError(input.expectedTotal, price.totalPaise);

    // 3–4. Hold and write.
    const holdMinutes = Math.min(this.deps.holdMinutes, ...legs.map((l) => l.holdLimitMinutes));
    const holdExpiresAt = new Date(this.now().getTime() + holdMinutes * 60_000);
    const key = this.deps.piiKey;
    const scenario = currentScenario();
    return this.createHeld(userId, 'FLIGHT', ctx, async (reference, tx) => {
      const created = await new BookingRepository(tx).create({
        reference,
        userId,
        serviceType: 'FLIGHT',
        status: 'HELD',
        paymentStatus: 'CREATED',
        baseAmountPaise: price.basePaise,
        taxAmountPaise: price.taxesPaise,
        feeAmountPaise: price.feesPaise,
        totalAmountPaise: price.totalPaise,
        contactEmail: input.contact.email,
        contactPhone: input.contact.mobile,
        travelDate: new Date(`${outbound.date}T00:00:00Z`),
        holdExpiresAt,
        idempotencyKey,
        metadata: {
          demo: this.deps.flights.isDemo,
          provider: this.deps.flights.name,
          ...(input.gstDetails && { gst: input.gstDetails }),
          // Test builds only: lets the mock airline answer "pending"/"failed" when issuing.
          ...(scenario === 'issue_pending' || scenario === 'issue_failed'
            ? { issueScenario: scenario }
            : {}),
        },
        passengers: {
          create: input.travellers.map((t, i) => ({
            sequence: i + 1,
            type: t.type,
            title: t.title,
            firstName: t.firstName,
            lastName: t.lastName,
            dateOfBirth: t.dob ? new Date(`${t.dob}T00:00:00Z`) : null,
            gender: t.gender,
            travellingWith: t.infantOfIndex === undefined ? null : t.infantOfIndex + 1,
            ...(t.passport && key
              ? {
                  passportNumberEnc: encryptField(t.passport.number, key),
                  passportExpiryEnc: encryptField(t.passport.expiry, key),
                  nationality: t.passport.nationality,
                }
              : {}),
          })),
        },
        flights: {
          create: legs.map((leg, i) => ({
            sequence: i + 1,
            provider: this.deps.flights.name,
            offerId: leg.offer.offerId,
            itineraryKey: leg.itineraryKey,
            fareId: leg.fare.fareId,
            fareFamily: leg.fare.name,
            cabin: leg.offer.cabin,
            seats: pax.adults + pax.children,
            originCode: leg.from,
            destinationCode: leg.to,
            departureAt: leg.departureAt,
            arrivalAt: leg.arrivalAt,
            offer: leg.offer as unknown as Prisma.InputJsonValue,
            fare: leg.fare as unknown as Prisma.InputJsonValue,
          })),
        },
      });
      for (const leg of legs) await this.deps.flights.hold(leg, created.id, holdExpiresAt, tx);
      return created;
    });
  }

  /** A live quote for an offer + fare, or the right error (FARE_UNAVAILABLE / bad fare). */
  private async flightQuote(offerId: string, fareId: string, field: 'fareId' | 'returnFareId') {
    const quote = await this.deps.flights.quote(offerId, fareId);
    if (quote === null) throw new FareUnavailableError();
    if (quote === 'BAD_FARE')
      throw new ValidationError([{ path: `body.${field}`, message: 'Invalid fare' }]);
    return quote;
  }

  /**
   * Holds bus seats for a booking, in the order the contract requires:
   *  1. trip, points (belonging to the trip, boarding before dropping) and seats on the coach;
   *  2. the ladies-seat rule (ladies-only seats, and seats beside one booked by a woman);
   *  3. the live seat map from the supplier (never cached) — any seat taken → SEAT_UNAVAILABLE;
   *  4. a live re-price — a different total → PRICE_CHANGED (nothing is held);
   *  5. under per-seat Redis locks, one transaction: supplier hold + booking (HELD) + event.
   * The browser's expectedTotal is only compared; the stored amounts come from the supplier.
   */
  private async newBusBooking(
    userId: string,
    input: BookBusInput,
    idempotencyKey: string,
    ctx: RequestContext,
  ): Promise<BookingRecord> {
    const trip = await this.deps.buses.getTrip(input.tripId);
    if (!trip) throw new NotFoundError('This bus is no longer available. Please search again.');
    if (!trip.bookable) throw new BookingClosedError(BUS_MESSAGES.closed);

    // 1. Points and seats.
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
    const map = await this.deps.buses.getSeatMap(input.tripId);
    if (!map) throw new NotFoundError('This bus is no longer available. Please search again.');
    const bySeat = new Map(map.decks.flatMap((d) => d.seats).map((s) => [s.seatNo, s]));
    input.seats.forEach((seatNo, i) => {
      if (!bySeat.has(seatNo))
        issues.push({ path: `body.seats.${i}`, message: `Seat ${seatNo} isn't on this bus` });
    });
    // 2. Ladies-only seats (fixed, or beside a woman's seat) need a woman traveller.
    input.travellers.forEach((t, i) => {
      if (bySeat.get(t.seatNo)?.ladiesOnly && t.gender !== 'FEMALE')
        issues.push({ path: `body.travellers.${i}.gender`, message: BUS_MESSAGES.ladiesSeat });
    });
    if (issues.length > 0) throw new ValidationError(issues);

    // 3. Live availability.
    const taken = input.seats.filter((n) => bySeat.get(n)?.status !== 'AVAILABLE');
    if (taken.length > 0) throw new SeatUnavailableError(taken);

    // 4. Live price; the browser's figure is only a comparison value.
    const quote = await this.deps.buses.reprice(input.tripId, input.seats);
    if (!quote) throw new NotFoundError('This bus is no longer available. Please search again.');
    const price = busFareBreakdown(quote.seats, quote.ac);
    if (price.totalPaise !== input.expectedTotal)
      throw new PriceChangedError(input.expectedTotal, price.totalPaise);

    // 5. Hold and write the booking.
    const holdExpiresAt = new Date(this.now().getTime() + this.deps.holdMinutes * 60_000);
    const genderOf = new Map(input.travellers.map((t) => [t.seatNo, t.gender]));
    const locks = await this.lockSeats(input.tripId, input.seats);
    try {
      return await this.createHeld(userId, 'BUS', ctx, async (reference, tx) => {
        const created = await new BookingRepository(tx).create({
          reference,
          userId,
          serviceType: 'BUS',
          status: 'HELD',
          paymentStatus: 'CREATED',
          baseAmountPaise: price.basePaise,
          taxAmountPaise: price.taxesPaise,
          feeAmountPaise: price.feesPaise,
          totalAmountPaise: price.totalPaise,
          contactEmail: input.contact.email,
          contactPhone: input.contact.mobile,
          travelDate: new Date(`${trip.date}T00:00:00Z`),
          holdExpiresAt,
          idempotencyKey,
          metadata: {
            demo: this.deps.buses.isDemo,
            provider: this.deps.buses.name,
            seatPrices: Object.fromEntries(quote.seats.map((q) => [q.seatNo, q.price])),
          },
          passengers: {
            create: input.travellers.map((t, i) => {
              const { firstName, lastName } = splitName(t.name);
              return {
                sequence: i + 1,
                type: t.age < 12 ? 'CHILD' : 'ADULT',
                title: busTitle(t.gender, t.age),
                firstName,
                lastName,
                age: t.age,
                gender: t.gender,
                seatNumber: t.seatNo,
              };
            }),
          },
          bus: {
            create: {
              provider: this.deps.buses.name,
              tripId: trip.tripId,
              operatorName: trip.operator.name,
              busType: trip.busType.label,
              originCity: trip.from.code,
              destinationCity: trip.to.code,
              departureAt: new Date(trip.departure),
              arrivalAt: new Date(trip.arrival),
              seats: input.seats,
              boardingPoint: boarding as unknown as Prisma.InputJsonValue,
              droppingPoint: dropping as unknown as Prisma.InputJsonValue,
              offer: trip as unknown as Prisma.InputJsonValue,
            },
          },
        });
        await this.deps.buses.hold(
          trip.tripId,
          input.seats.map((seatNo) => ({ seatNo, female: genderOf.get(seatNo) === 'FEMALE' })),
          created.id,
          holdExpiresAt,
          tx,
        );
        return created;
      });
    } finally {
      await locks.release();
    }
  }

  /**
   * Short Redis locks (`lock:bus:<trip>:<seat>`, SET NX PX) so two customers racing for a seat
   * don't both reach the database; the unique (trip, seat, active) constraint is the final guard.
   * Without Redis (tests, outages) the constraint alone keeps holds exclusive.
   */
  private async lockSeats(tripId: string, seats: string[]) {
    const redis = this.deps.redis;
    const held: { release(): Promise<void> }[] = [];
    const releaseAll = async () => {
      await Promise.allSettled(held.map((l) => l.release()));
    };
    if (!redis || redis.status !== 'ready') return { release: releaseAll };
    // Sorted, so two bookings of overlapping seats always lock in the same order.
    for (const seatNo of [...seats].sort()) {
      const lock = await acquireLock(redis, `lock:bus:${tripId}:${seatNo}`, 10_000).catch(
        () => null,
      );
      if (!lock) {
        await releaseAll();
        throw new SeatUnavailableError([seatNo]);
      }
      held.push(lock);
    }
    return { release: releaseAll };
  }

  /**
   * Owners see their bookings; staff with booking:read:any see all; anyone else gets 403 with no
   * booking data. References are unguessable (50 random bits), so 403 does not help enumeration.
   */
  async get(
    reference: string,
    viewer: { userId: string; canReadAny: boolean },
  ): Promise<BookingRecord> {
    const booking = await new BookingRepository(this.deps.prisma).findByReference(reference);
    if (!booking) throw new NotFoundError('Booking not found');
    if (booking.userId !== viewer.userId && !viewer.canReadAny)
      throw new AuthorizationError("You don't have access to this booking");
    return booking;
  }

  async getDetails(
    reference: string,
    viewer: { userId: string; canReadAny: boolean },
  ): Promise<BookingDetails> {
    return toBookingDetails(await this.get(reference, viewer));
  }

  /**
   * The customer gives up an unpaid hold (changed seats or travellers): HELD/PAYMENT_PENDING →
   * EXPIRED and the inventory is released at once instead of when the timer runs out. A paid
   * booking is never released this way.
   */
  async release(
    userId: string,
    reference: string,
  ): Promise<{ bookingRef: string; status: 'EXPIRED' }> {
    const booking = await this.get(reference, { userId, canReadAny: false });
    if (booking.paymentStatus === 'CAPTURED' || !OPEN_HOLD_STATUSES.includes(booking.status))
      throw new InvalidStateError('This booking is not on hold');
    const done = await this.deps.prisma.$transaction(async (tx) => {
      const moved = await new BookingRepository(tx).move(
        booking.id,
        OPEN_HOLD_STATUSES,
        'EXPIRED',
        {
          actor: `user:${userId}`,
          reason: 'Hold released by customer',
          data: { paymentStatus: 'CANCELLED' },
          where: { paymentStatus: { not: 'CAPTURED' } },
        },
      );
      if (!moved) return false;
      await this.releaseInventory(booking, tx);
      await new PaymentRepository(tx).cancelOpenForBooking(booking.id);
      return true;
    });
    if (!done) throw new InvalidStateError('This booking was already changed. Please refresh.');
    return { bookingRef: booking.reference, status: 'EXPIRED' };
  }

  async list(userId: string): Promise<BookingListItem[]> {
    return (await new BookingRepository(this.deps.prisma).listForUser(userId)).map(
      toBookingListItem,
    );
  }

  /**
   * Moves unpaid bookings whose hold ran out to EXPIRED and releases their inventory. Each move is
   * conditional (still unpaid, still expired), so it is safe if a payment lands meanwhile or two
   * instances run it at once.
   */
  async expireHolds(): Promise<number> {
    const expired = await new BookingRepository(this.deps.prisma).findExpiredHolds(this.now());
    let count = 0;
    for (const booking of expired) {
      const done = await this.deps.prisma.$transaction(async (tx) => {
        const moved = await new BookingRepository(tx).move(
          booking.id,
          OPEN_HOLD_STATUSES,
          'EXPIRED',
          {
            actor: 'job:release-holds',
            reason: 'Hold expired before payment',
            data: { paymentStatus: 'CANCELLED' },
            where: { holdExpiresAt: { lt: this.now() } },
          },
        );
        if (!moved) return false; // paid or handled by another instance meanwhile
        await this.releaseInventory(booking, tx);
        await new PaymentRepository(tx).cancelOpenForBooking(booking.id);
        return true;
      });
      if (done) count += 1;
    }
    if (count > 0) this.deps.logger.info({ count }, 'Expired unpaid booking holds');
    return count;
  }

  /** Returns a booking's seats to the supplier (expiry, failed issue, cancellation). */
  async releaseInventory(booking: BookingRecord, tx: Prisma.TransactionClient): Promise<void> {
    if (booking.flights.length > 0) await this.deps.flights.release(booking.id, tx);
    if (booking.bus) await this.deps.buses.release(booking.id, tx);
  }

  // ───────── internals ─────────

  /**
   * Retries with the same Idempotency-Key return the original booking. Checked before creating
   * and again if creating fails: a concurrent retry may have won the race (unique key conflict)
   * or taken the very seats this request wanted.
   */
  private async idempotent<T>(
    userId: string,
    idempotencyKey: string,
    create: () => Promise<BookingRecord>,
    present: (record: BookingRecord) => T,
  ): Promise<T> {
    const repo = new BookingRepository(this.deps.prisma);
    const existing = await repo.findByIdempotencyKey(userId, idempotencyKey);
    if (existing) return present(existing);
    try {
      return present(await create());
    } catch (err) {
      const winner = await repo.findByIdempotencyKey(userId, idempotencyKey);
      if (winner) return present(winner);
      throw err;
    }
  }

  /** Holds inventory and writes a booking in one transaction (via `create`), with a unique reference. */
  private async createHeld(
    userId: string,
    service: 'FLIGHT' | 'BUS',
    ctx: RequestContext,
    create: (reference: string, tx: Prisma.TransactionClient) => Promise<BookingRecord>,
  ): Promise<BookingRecord> {
    const booking = await this.withUniqueReference(service, (reference) =>
      this.deps.prisma.$transaction(async (tx) => {
        const created = await create(reference, tx);
        await new BookingRepository(tx).recordEvent(
          created.id,
          'DRAFT',
          'HELD',
          `user:${userId}`,
          'Inventory held',
        );
        return created;
      }),
    );
    await this.deps.audit.record({
      action: 'BOOKING_CREATED',
      actorId: userId,
      entityType: 'Booking',
      entityId: booking.id,
      after: { reference: booking.reference, service, totalPaise: booking.totalAmountPaise },
      context: ctx,
    });
    return booking;
  }

  /** Booking references are random; on the (very rare) collision, try again with a new one. */
  private async withUniqueReference<T>(
    service: 'FLIGHT' | 'BUS',
    create: (reference: string) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await create(generateBookingReference(service));
      } catch (err) {
        const collision =
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002' &&
          String((err.meta as { target?: unknown } | undefined)?.target ?? '').includes(
            'reference',
          );
        if (!collision || attempt >= 3) throw err;
      }
    }
  }
}

/** "Amit Kumar Sharma" → first "Amit Kumar", last "Sharma" (single names keep last empty). */
function splitName(name: string): { firstName: string; lastName: string } {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0] ?? '', lastName: '' };
  return { firstName: parts.slice(0, -1).join(' '), lastName: parts.at(-1) ?? '' };
}

/** Title printed on bus tickets, from gender and age. */
function busTitle(gender: 'MALE' | 'FEMALE' | 'OTHER', age: number): string {
  if (gender === 'MALE') return age < 12 ? 'MSTR' : 'MR';
  if (gender === 'FEMALE') return age < 12 ? 'MISS' : 'MS';
  return 'MX';
}
