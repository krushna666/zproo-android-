import { findCity } from '@zproo/config';
import type {
  BookingDetails,
  BookingListItem,
  BusBookResponse,
  BusBookingInfo,
  BusPoint,
  BusTripDetails,
  FlightOffer,
  PassengerType,
  PriceBreakdown,
} from '@zproo/types';
import type { BookingRecord } from '../repositories/booking.repository';
import { BUS_AC_GST_PERCENT } from '../services/busPricing';
import { flightPriceBreakdown } from '../services/flightPricing';
import { clock } from '../lib/testContext';

const iso = (d: Date | null) => (d ? d.toISOString() : null);
const isoDate = (d: Date) => d.toISOString().slice(0, 10);

function paxCounts(booking: BookingRecord) {
  const count = (t: PassengerType) => booking.passengers.filter((p) => p.type === t).length;
  return { adults: count('ADULT'), children: count('CHILD'), infants: count('INFANT') };
}

function busInfo(booking: BookingRecord): BusBookingInfo | null {
  const bus = booking.bus;
  if (!bus) return null;
  return {
    trip: bus.offer as unknown as BusTripDetails,
    seats: bus.seats,
    boardingPoint: bus.boardingPoint as unknown as BusPoint,
    droppingPoint: bus.droppingPoint as unknown as BusPoint,
    pnr: bus.pnr,
  };
}

/** Customer-facing lines for the stored amounts; amounts always come from the booking itself. */
function priceLines(booking: BookingRecord, offers: FlightOffer[]): PriceBreakdown['lines'] {
  const discount =
    booking.discountAmountPaise > 0
      ? [
          {
            label: booking.coupon ? `Coupon ${booking.coupon.code}` : 'Discount',
            amountPaise: -booking.discountAmountPaise,
          },
        ]
      : [];
  return [...fareLines(booking, offers), ...discount];
}

function fareLines(booking: BookingRecord, offers: FlightOffer[]): PriceBreakdown['lines'] {
  if (booking.serviceType === 'FLIGHT')
    return flightPriceBreakdown(offers, paxCounts(booking)).lines;
  const seats = booking.passengers.length;
  return [
    {
      label: `Base fare — ${seats} seat${seats === 1 ? '' : 's'}`,
      amountPaise: booking.baseAmountPaise,
    },
    ...(booking.taxAmountPaise > 0
      ? [{ label: `GST (${BUS_AC_GST_PERCENT}%)`, amountPaise: booking.taxAmountPaise }]
      : []),
    ...(booking.feeAmountPaise > 0
      ? [{ label: 'Convenience fee', amountPaise: booking.feeAmountPaise }]
      : []),
  ];
}

export function toBookingDetails(booking: BookingRecord, now: Date = clock.now()): BookingDetails {
  const offers = booking.flights.map((f) => f.offer as unknown as FlightOffer);
  return {
    reference: booking.reference,
    serviceType: booking.serviceType === 'BUS' ? 'BUS' : 'FLIGHT',
    status: booking.status,
    paymentStatus: booking.paymentStatus,
    createdAt: booking.createdAt.toISOString(),
    holdExpiresAt: iso(booking.holdExpiresAt),
    serverNow: now.toISOString(),
    confirmedAt: iso(booking.confirmedAt),
    cancelledAt: iso(booking.cancelledAt),
    travelDate: isoDate(booking.travelDate),
    // Amounts come from the stored booking (what was charged), not re-computed.
    price: {
      lines: priceLines(booking, offers),
      currency: 'INR',
      basePaise: booking.baseAmountPaise,
      taxesPaise: booking.taxAmountPaise,
      feesPaise: booking.feeAmountPaise,
      discountPaise: booking.discountAmountPaise,
      totalPaise: booking.totalAmountPaise,
    },
    contact: { email: booking.contactEmail, phone: booking.contactPhone },
    coupon: booking.coupon
      ? { code: booking.coupon.code, discountPaise: booking.discountAmountPaise }
      : null,
    passengers: booking.passengers.map((p) => ({
      id: p.id,
      type: p.type,
      title: p.title,
      firstName: p.firstName,
      lastName: p.lastName,
      dateOfBirth: p.dateOfBirth ? isoDate(p.dateOfBirth) : null,
      age: p.age,
      gender: p.gender,
      seatNumber: p.seatNumber,
    })),
    flights: booking.flights.map((f, i) => ({
      sequence: f.sequence,
      offer: offers[i] as FlightOffer,
      pnr: f.pnr,
      tickets: (f.tickets as { passengerId: string; ticketNumber: string }[] | null) ?? [],
    })),
    bus: busInfo(booking),
    demo: Boolean((booking.metadata as { demo?: boolean } | null)?.demo),
  };
}

/** POST /…/book response: the held booking, its hold deadline and the server's bill. */
export function toBookResult(booking: BookingRecord, now: Date = clock.now()): BusBookResponse {
  return {
    bookingRef: booking.reference,
    status: 'HELD',
    holdExpiresAt: (booking.holdExpiresAt ?? now).toISOString(),
    serverNow: now.toISOString(),
    priceBreakdown: toBookingDetails(booking, now).price,
  };
}

export function toBookingListItem(booking: BookingRecord): BookingListItem {
  if (booking.bus) {
    const seats = booking.bus.seats;
    return {
      reference: booking.reference,
      serviceType: booking.serviceType,
      status: booking.status,
      paymentStatus: booking.paymentStatus,
      title: `${findCity(booking.bus.originCity)?.name ?? booking.bus.originCity} → ${findCity(booking.bus.destinationCity)?.name ?? booking.bus.destinationCity}`,
      subtitle: `${booking.bus.operatorName} · Seat${seats.length === 1 ? '' : 's'} ${seats.join(', ')}`,
      travelDate: isoDate(booking.travelDate),
      totalPaise: booking.totalAmountPaise,
      createdAt: booking.createdAt.toISOString(),
    };
  }
  const first = booking.flights[0];
  const last = booking.flights.at(-1);
  const roundTrip = booking.flights.length === 2 && first?.originCode === last?.destinationCode;
  return {
    reference: booking.reference,
    serviceType: booking.serviceType,
    status: booking.status,
    paymentStatus: booking.paymentStatus,
    title:
      first && last
        ? `${first.originCode} ${roundTrip ? '⇄' : '→'} ${roundTrip ? first.destinationCode : last.destinationCode}`
        : 'Booking',
    subtitle: `${booking.passengers.length} traveller${booking.passengers.length === 1 ? '' : 's'} · ${booking.flights.length} flight${booking.flights.length === 1 ? '' : 's'}`,
    travelDate: isoDate(booking.travelDate),
    totalPaise: booking.totalAmountPaise,
    createdAt: booking.createdAt.toISOString(),
  };
}
