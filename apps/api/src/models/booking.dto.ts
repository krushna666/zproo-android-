import { findCity } from '@zproo/config';
import type {
  BookingDetails,
  BookingListItem,
  BusBookingInfo,
  BusPoint,
  BusTripOffer,
  FlightOffer,
  PassengerType,
  PriceBreakdown,
} from '@zproo/types';
import type { BookingRecord } from '../repositories/booking.repository';
import { flightPriceBreakdown } from '../services/flightPricing';

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
    offer: bus.offer as unknown as BusTripOffer,
    seatNumbers: bus.seatNumbers,
    boardingPoint: bus.boardingPoint as unknown as BusPoint,
    droppingPoint: bus.droppingPoint as unknown as BusPoint,
    pnr: bus.pnr,
  };
}

/** Customer-facing lines for the stored amounts; amounts always come from the booking itself. */
function priceLines(booking: BookingRecord, offers: FlightOffer[]): PriceBreakdown['lines'] {
  if (booking.serviceType === 'FLIGHT')
    return flightPriceBreakdown(offers, paxCounts(booking)).lines;
  const seats = booking.passengers.length;
  return [
    {
      label: `Base fare — ${seats} seat${seats === 1 ? '' : 's'}`,
      amountPaise: booking.baseAmountPaise,
    },
    ...(booking.taxAmountPaise > 0 ? [{ label: 'GST', amountPaise: booking.taxAmountPaise }] : []),
  ];
}

export function toBookingDetails(booking: BookingRecord): BookingDetails {
  const offers = booking.flights.map((f) => f.offer as unknown as FlightOffer);
  return {
    reference: booking.reference,
    serviceType: booking.serviceType === 'BUS' ? 'BUS' : 'FLIGHT',
    status: booking.status,
    paymentStatus: booking.paymentStatus,
    createdAt: booking.createdAt.toISOString(),
    holdExpiresAt: iso(booking.holdExpiresAt),
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
  };
}

export function toBookingListItem(booking: BookingRecord): BookingListItem {
  if (booking.bus) {
    const seats = booking.bus.seatNumbers;
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
