import { Prisma, type PrismaClient } from '@prisma/client';
import type { BookingDetails, BookingListItem, BusBookResponse, FlightOffer } from '@zproo/types';
import type { Redis } from 'ioredis';
import { OPEN_HOLD_STATUSES, generateBookingReference } from '@zproo/utils';
import {
  BUS_MESSAGES,
  passengerAgeIssues,
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
  NotFoundError,
  PriceChangedError,
  SeatUnavailableError,
  ValidationError,
} from '../utils/errors';
import { localDate } from '../utils/time';
import type { AuditService, RequestContext } from './audit.service';
import { busFareBreakdown } from './busPricing';
import { flightPriceBreakdown, type PaxCounts } from './flightPricing';
import { clock } from '../lib/testContext';

interface BookingServiceDeps {
  prisma: PrismaClient;
  flights: FlightProvider;
  buses: BusProvider;
  audit: AuditService;
  logger: Logger;
  holdMinutes: number;
  /** Seat locks; optional (the database constraint alone also keeps holds exclusive). */
  redis?: Redis | undefined;
  now?: () => Date;
}

export class BookingService {
  private readonly now: () => Date;

  constructor(private readonly deps: BookingServiceDeps) {
    this.now = deps.now ?? clock.now;
  }

  createFlightBooking(
    userId: string,
    input: BookFlightInput,
    idempotencyKey: string,
    ctx: RequestContext,
  ): Promise<BookingDetails> {
    return this.idempotent(
      userId,
      idempotencyKey,
      () => this.newFlightBooking(userId, input, idempotencyKey, ctx),
      (record) => toBookingDetails(record, this.now()),
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
   * Creates a flight booking awaiting payment: re-prices every offer, checks passengers, then holds
   * the seats and writes the booking in one transaction. Retrying with the same Idempotency-Key
   * returns the original booking instead of holding seats twice.
   */
  private async newFlightBooking(
    userId: string,
    input: BookFlightInput,
    idempotencyKey: string,
    ctx: RequestContext,
  ): Promise<BookingRecord> {
    const pax = this.countPassengers(input);
    const offers: FlightOffer[] = [];
    for (const id of input.offerIds) {
      const offer = await this.deps.flights.getOffer(id, pax);
      if (!offer) throw new FareUnavailableError();
      offers.push(offer);
    }
    this.checkItinerary(offers);
    const travelDate = localDate(
      new Date(offers[0]?.departureAt ?? ''),
      offers[0]?.from.timezone ?? 'Asia/Kolkata',
    );
    const ageIssues = passengerAgeIssues(input.passengers, travelDate);
    if (ageIssues.length > 0) {
      throw new ValidationError(
        ageIssues.map((i) => ({
          path: `body.passengers.${i.index}.dateOfBirth`,
          message: i.message,
        })),
      );
    }

    const price = flightPriceBreakdown(offers, pax);
    if (price.totalPaise !== input.expectedTotalPaise)
      throw new PriceChangedError(input.expectedTotalPaise, price.totalPaise);

    const seats = pax.adults + pax.children; // infants travel on a lap
    return this.createHeld(userId, 'FLIGHT', ctx, async (reference, tx) => {
      for (const offer of offers) await this.deps.flights.hold(offer.id, seats, tx);
      return new BookingRepository(tx).create({
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
        contactPhone: input.contact.phone,
        travelDate: new Date(`${travelDate}T00:00:00Z`),
        holdExpiresAt: new Date(this.now().getTime() + this.deps.holdMinutes * 60_000),
        idempotencyKey,
        metadata: { demo: this.deps.flights.isDemo, provider: this.deps.flights.name },
        passengers: {
          create: input.passengers.map((p, i) => ({
            sequence: i + 1,
            type: p.type,
            title: p.title,
            firstName: p.firstName,
            lastName: p.lastName,
            dateOfBirth: p.dateOfBirth ? new Date(`${p.dateOfBirth}T00:00:00Z`) : null,
            gender: p.gender,
          })),
        },
        flights: {
          create: offers.map((offer, i) => {
            const service = this.mockServiceKey(offer.id);
            return {
              sequence: i + 1,
              provider: offer.provider,
              offerId: offer.id,
              flightId: service?.flightId ?? null,
              serviceDate: service ? new Date(`${service.date}T00:00:00Z`) : null,
              cabin: offer.cabin,
              seats,
              originCode: offer.from.code,
              destinationCode: offer.to.code,
              departureAt: new Date(offer.departureAt),
              arrivalAt: new Date(offer.arrivalAt),
              offer: offer as unknown as Prisma.InputJsonValue,
            };
          }),
        },
      });
    });
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
    for (const leg of booking.flights) await this.deps.flights.release(leg.offerId, leg.seats, tx);
    if (booking.bus) await this.deps.buses.release(booking.id, tx);
  }

  // ───────── internals ─────────

  private countPassengers(input: BookFlightInput): PaxCounts {
    const count = (t: string) => input.passengers.filter((p) => p.type === t).length;
    const pax = { adults: count('ADULT'), children: count('CHILD'), infants: count('INFANT') };
    const issues = [];
    if (pax.adults < 1)
      issues.push({ path: 'body.passengers', message: 'At least one adult must travel' });
    if (pax.infants > pax.adults)
      issues.push({ path: 'body.passengers', message: 'Each infant must travel with an adult' });
    if (pax.adults + pax.children > 9)
      issues.push({
        path: 'body.passengers',
        message: 'Up to 9 travellers per booking (excluding infants)',
      });
    if (issues.length > 0) throw new ValidationError(issues);
    return pax;
  }

  private checkItinerary(offers: FlightOffer[]) {
    offers.forEach((offer, i) => {
      const previous = offers[i - 1];
      if (previous && Date.parse(offer.departureAt) < Date.parse(previous.arrivalAt)) {
        throw new ValidationError([
          {
            path: `body.offerIds.${i}`,
            message: 'This flight departs before the previous one lands',
          },
        ]);
      }
    });
  }

  private mockServiceKey(offerId: string): { flightId: string; date: string } | null {
    const m = /^mk_([a-z0-9]+)_(\d{4})(\d{2})(\d{2})_[EPBF]$/.exec(offerId);
    return m ? { flightId: m[1] as string, date: `${m[2]}-${m[3]}-${m[4]}` } : null;
  }

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
