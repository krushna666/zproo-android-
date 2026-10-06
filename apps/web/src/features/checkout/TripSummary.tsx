import type { BookingDetails } from '@zproo/types';
import { BusTripSummary } from '@/features/buses/components/BusTripSummary';
import { ItinerarySummary } from '@/features/flights/components/ItinerarySummary';
import { StaySummary } from '@/features/hotels/components/StaySummary';

/** What was booked: flight legs, the bus journey or the hotel stay. */
export function TripSummary({
  booking,
  detailed = false,
}: {
  booking: BookingDetails;
  detailed?: boolean;
}) {
  if (booking.hotel) return <StaySummary stay={booking.hotel} detailed={detailed} />;
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
  return <ItinerarySummary legs={booking.flights} detailed={detailed} />;
}
