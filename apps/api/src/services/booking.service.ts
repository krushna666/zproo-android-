import { Prisma, type PrismaClient } from '@prisma/client';
import type { BookingDetails, BookingListItem, FlightOffer } from '@zproo/types';
import { generateBookingReference } from '@zproo/utils';
import { passengerAgeIssues, type BookBusInput, type BookFlightInput } from '@zproo/validation';
import type { Logger } from 'pino';
import { toBookingDetails, toBookingListItem } from '../models/booking.dto';
import type { BusProvider } from '../providers/bus';
import type { FlightProvider } from '../providers/flight';
import { BookingRepository, type BookingRecord } from '../repositories/booking.repository';
import { PaymentRepository } from '../repositories/payment.repository';
import {
  NotFoundError,
  OfferExpiredError,
  PriceChangedError,
  SeatUnavailableError,
  ValidationError,
} from '../utils/errors';
import { localDate } from '../utils/time';
import type { AuditService, RequestContext } from './audit.service';
import { flightPriceBreakdown, type PaxCounts } from './flightPricing';

interface BookingServiceDeps {
  prisma: PrismaClient;
  flights: FlightProvider;
  buses: BusProvider;
  audit: AuditService;
  logger: Logger;
  holdMinutes: number;
  now?: () => Date;
}

export class BookingService {
  private readonly now: () => Date;

  constructor(private readonly deps: BookingServiceDeps) {
    this.now = deps.now ?? (() => new Date());
  }

  createFlightBooking(
    userId: string,
    input: BookFlightInput,
    idempotencyKey: string,
    ctx: RequestContext,
  ): Promise<BookingDetails> {
    return this.idempotent(userId, idempotencyKey, () =>
      this.newFlightBooking(userId, input, idempotencyKey, ctx),
    );
  }

  createBusBooking(
    userId: string,
    input: BookBusInput,
    idempotencyKey: string,
    ctx: RequestContext,
  ): Promise<BookingDetails> {
    return this.idempotent(userId, idempotencyKey, () =>
      this.newBusBooking(userId, input, idempotencyKey, ctx),
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
  ): Promise<BookingDetails> {
    const pax = this.countPassengers(input);
    const offers: FlightOffer[] = [];
    for (const id of input.offerIds) {
      const offer = await this.deps.flights.getOffer(id, pax);
      if (!offer) throw new OfferExpiredError();
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
      throw new PriceChangedError(price.totalPaise);

    const seats = pax.adults + pax.children; // infants travel on a lap
    return this.createHeld(userId, 'FLIGHT', ctx, async (reference, tx) => {
      for (const offer of offers) await this.deps.flights.hold(offer.id, seats, tx);
      return new BookingRepository(tx).create({
        reference,
        userId,
        serviceType: 'FLIGHT',
        status: 'PENDING_PAYMENT',
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
   * Creates a bus booking awaiting payment: re-checks the trip, seats, points and prices, then
   * holds the seats and writes the booking in one transaction. Retrying with the same
   * Idempotency-Key returns the original booking.
   */
  private async newBusBooking(
    userId: string,
    input: BookBusInput,
    idempotencyKey: string,
    ctx: RequestContext,
  ): Promise<BookingDetails> {
    const unavailable = 'This bus is no longer available. Please choose another.';
    const trip = await this.deps.buses.getTrip(input.tripId);
    const seatMap = trip && (await this.deps.buses.seatMap(input.tripId));
    if (!trip || !seatMap) throw new OfferExpiredError(unavailable);

    const boarding = trip.boardingPoints.find((p) => p.id === input.boardingPointId);
    const dropping = trip.droppingPoints.find((p) => p.id === input.droppingPointId);
    const issues = [];
    if (!boarding)
      issues.push({ path: 'body.boardingPointId', message: 'Choose a boarding point' });
    if (!dropping)
      issues.push({ path: 'body.droppingPointId', message: 'Choose a dropping point' });

    const seatsByNumber = new Map(seatMap.decks.flatMap((d) => d.seats).map((s) => [s.number, s]));
    const seats = input.passengers.map((p, i) => {
      const seat = seatsByNumber.get(p.seatNumber);
      if (!seat) {
        issues.push({
          path: `body.passengers.${i}.seatNumber`,
          message: `Seat ${p.seatNumber} does not exist on this bus`,
        });
      } else if (seat.ladiesOnly && p.gender !== 'FEMALE') {
        issues.push({
          path: `body.passengers.${i}.gender`,
          message: `Seat ${p.seatNumber} is reserved for women`,
        });
      }
      return seat;
    });
    if (issues.length > 0) throw new ValidationError(issues);
    if (seats.some((s) => !s?.available)) throw new SeatUnavailableError();

    const basePaise = seats.reduce((sum, s) => sum + (s?.basePaise ?? 0), 0);
    const taxPaise = seats.reduce((sum, s) => sum + (s?.taxPaise ?? 0), 0);
    const totalPaise = basePaise + taxPaise;
    if (totalPaise !== input.expectedTotalPaise) throw new PriceChangedError(totalPaise);

    const seatNumbers = input.passengers.map((p) => p.seatNumber);
    return this.createHeld(userId, 'BUS', ctx, async (reference, tx) => {
      const repo = new BookingRepository(tx);
      const created = await repo.create({
        reference,
        userId,
        serviceType: 'BUS',
        status: 'PENDING_PAYMENT',
        paymentStatus: 'CREATED',
        baseAmountPaise: basePaise,
        taxAmountPaise: taxPaise,
        feeAmountPaise: 0,
        totalAmountPaise: totalPaise,
        contactEmail: input.contact.email,
        contactPhone: input.contact.phone,
        travelDate: new Date(`${trip.date}T00:00:00Z`),
        holdExpiresAt: new Date(this.now().getTime() + this.deps.holdMinutes * 60_000),
        idempotencyKey,
        metadata: { demo: this.deps.buses.isDemo, provider: this.deps.buses.name },
        passengers: {
          create: input.passengers.map((p, i) => ({
            sequence: i + 1,
            type: p.age < 12 ? 'CHILD' : 'ADULT',
            title: busTitle(p.gender, p.age),
            firstName: p.firstName,
            lastName: p.lastName,
            age: p.age,
            gender: p.gender,
            seatNumber: p.seatNumber,
          })),
        },
        bus: {
          create: {
            provider: trip.provider,
            offerId: trip.id,
            operatorName: trip.operator.name,
            originCity: trip.from.code,
            destinationCity: trip.to.code,
            departureAt: new Date(trip.departureAt),
            arrivalAt: new Date(trip.arrivalAt),
            seatNumbers,
            boardingPoint: boarding as unknown as Prisma.InputJsonValue,
            droppingPoint: dropping as unknown as Prisma.InputJsonValue,
            offer: trip as unknown as Prisma.InputJsonValue,
          },
        },
      });
      const { localTripId } = await this.deps.buses.hold(trip.id, seatNumbers, created.id, tx);
      if (localTripId)
        await tx.busBooking.update({
          where: { bookingId: created.id },
          data: { tripId: localTripId },
        });
      return created;
    });
  }

  /** Owners see their bookings; staff with booking:read:any see all. Others get 404, not 403. */
  async get(
    reference: string,
    viewer: { userId: string; canReadAny: boolean },
  ): Promise<BookingRecord> {
    const booking = await new BookingRepository(this.deps.prisma).findByReference(reference);
    if (!booking || (booking.userId !== viewer.userId && !viewer.canReadAny))
      throw new NotFoundError('Booking not found');
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

  /** Cancels unpaid bookings whose hold ran out and returns their seats. Safe to run on every replica. */
  async expireHolds(): Promise<number> {
    const expired = await new BookingRepository(this.deps.prisma).findExpiredHolds(this.now());
    let count = 0;
    for (const booking of expired) {
      const done = await this.deps.prisma.$transaction(async (tx) => {
        const moved = await new BookingRepository(tx).transition(
          booking.id,
          'PENDING_PAYMENT',
          {
            status: 'CANCELLED',
            cancelledAt: this.now(),
            cancellationReason: 'HOLD_EXPIRED',
            paymentStatus: 'CANCELLED',
          },
          { holdExpiresAt: { lt: this.now() } },
        );
        if (!moved) return false; // paid or handled by another instance meanwhile
        for (const leg of booking.flights)
          await this.deps.flights.release(leg.offerId, leg.seats, tx);
        if (booking.bus) await this.deps.buses.release(booking.id, tx);
        await new PaymentRepository(tx).cancelOpenForBooking(booking.id);
        return true;
      });
      if (done) count += 1;
    }
    if (count > 0) this.deps.logger.info({ count }, 'Expired unpaid booking holds');
    return count;
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
  private async idempotent(
    userId: string,
    idempotencyKey: string,
    create: () => Promise<BookingDetails>,
  ): Promise<BookingDetails> {
    const repo = new BookingRepository(this.deps.prisma);
    const existing = await repo.findByIdempotencyKey(userId, idempotencyKey);
    if (existing) return toBookingDetails(existing);
    try {
      return await create();
    } catch (err) {
      const winner = await repo.findByIdempotencyKey(userId, idempotencyKey);
      if (winner) return toBookingDetails(winner);
      throw err;
    }
  }

  /** Holds inventory and writes a booking in one transaction (via `create`), with a unique reference. */
  private async createHeld(
    userId: string,
    service: 'FLIGHT' | 'BUS',
    ctx: RequestContext,
    create: (reference: string, tx: Prisma.TransactionClient) => Promise<BookingRecord>,
  ): Promise<BookingDetails> {
    const booking = await this.withUniqueReference((reference) =>
      this.deps.prisma.$transaction((tx) => create(reference, tx)),
    );
    await this.deps.audit.record({
      action: 'BOOKING_CREATED',
      actorId: userId,
      entityType: 'Booking',
      entityId: booking.id,
      after: { reference: booking.reference, service, totalPaise: booking.totalAmountPaise },
      context: ctx,
    });
    return toBookingDetails(booking);
  }

  /** Booking references are random; on the (very rare) collision, try again with a new one. */
  private async withUniqueReference<T>(create: (reference: string) => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await create(generateBookingReference(this.now()));
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

/** Title printed on bus tickets, from gender and age. */
function busTitle(gender: 'MALE' | 'FEMALE' | 'OTHER', age: number): string {
  if (gender === 'MALE') return age < 12 ? 'MSTR' : 'MR';
  if (gender === 'FEMALE') return age < 12 ? 'MISS' : 'MS';
  return 'MX';
}
