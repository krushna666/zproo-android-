import type { BookingDetails } from '@zproo/types';
import { BusTripSummary } from '@/features/buses/components/BusTripSummary';
import { ItinerarySummary } from '@/features/flights/components/ItinerarySummary';

/** What was booked: flight legs or the bus journey. */
export function TripSummary({
  booking,
  detailed = false,
}: {
  booking: BookingDetails;
  detailed?: boolean;
}) {
  if (booking.bus) {
    return (
      <BusTripSummary
        trip={booking.bus.trip}
        boarding={booking.bus.boardingPoint}
        dropping={booking.bus.droppingPoint}
        seats={booking.bus.seats}
      />
    );
  }
  return <ItinerarySummary offers={booking.flights.map((f) => f.offer)} detailed={detailed} />;
}
