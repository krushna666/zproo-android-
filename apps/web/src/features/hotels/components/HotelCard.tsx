import { HOTEL_AMENITY_LABELS, type HotelSummary } from '@zproo/types';
import { Badge, Button } from '@zproo/ui';
import { MapPin } from 'lucide-react';
import { Link } from 'react-router';
import { inr, nightsLabel, reviewsLabel } from '../format';
import { RatingBadge, Stars } from './Stars';

/** One search result, with the data-* attributes the end-to-end tests read. */
export function HotelCard({
  hotel,
  nights,
  href,
}: {
  hotel: HotelSummary;
  nights: number;
  href: string;
}) {
  return (
    <article
      data-testid={`hotel-result-card-${hotel.hotelId}`}
      data-price={hotel.pricePerNight}
      data-stars={hotel.stars}
      data-rating={hotel.rating}
      aria-label={`${hotel.name}, ${hotel.stars} star, ${hotel.area}, ${inr(hotel.pricePerNight)} per night`}
      className="grid overflow-hidden rounded-[14px] border border-border bg-card shadow-card sm:grid-cols-[14rem_1fr]"
    >
      <div className="aspect-[4/3] bg-background sm:aspect-auto sm:h-full">
        <img
          src={hotel.thumbnail.url}
          alt={hotel.thumbnail.alt}
          loading="lazy"
          decoding="async"
          width={448}
          height={336}
          className="size-full object-cover"
        />
      </div>
      <div className="flex min-w-0 flex-col gap-3 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="text-lg font-bold leading-snug">{hotel.name}</h3>
            <p className="mt-1 flex items-center gap-2 text-sm text-muted">
              <Stars count={hotel.stars} />
              <span className="inline-flex items-center gap-1">
                <MapPin aria-hidden className="size-3.5" /> {hotel.area}
              </span>
            </p>
          </div>
          <p className="text-right">
            <RatingBadge rating={hotel.rating} label={hotel.ratingLabel} />
            <span className="block text-xs text-muted">({reviewsLabel(hotel.ratingCount)})</span>
          </p>
        </div>
        <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
          {hotel.amenities
            .filter((a) => a !== 'breakfast')
            .slice(0, 3)
            .map((a) => (
              <li key={a}>{HOTEL_AMENITY_LABELS[a]}</li>
            ))}
        </ul>
        <div className="flex flex-wrap gap-2">
          {hotel.freeCancellation && <Badge variant="success">Free cancellation</Badge>}
          {hotel.breakfastIncluded && <Badge variant="soft">Breakfast included</Badge>}
          {hotel.roomsLeft === 1 && <Badge variant="warning">Only 1 room left</Badge>}
        </div>
        <div className="mt-auto flex flex-wrap items-end justify-between gap-3 border-t border-border pt-3">
          <div>
            <p className="text-xl font-extrabold tabular-nums">
              {inr(hotel.pricePerNight)}{' '}
              <span className="text-xs font-normal text-muted">per night</span>
            </p>
            <p className="text-xs text-muted">
              {inr(hotel.totalPrice)} total for {nightsLabel(nights)} + {inr(hotel.taxes)} taxes
            </p>
          </div>
          <Button asChild data-testid={`hotel-view-rooms-${hotel.hotelId}`}>
            <Link to={href}>View rooms</Link>
          </Button>
        </div>
      </div>
    </article>
  );
}
