import { BUS_AMENITY_LABELS, type BusAmenity } from '@zproo/types';
import { cn } from '@zproo/ui';
import {
  Bed,
  Cctv,
  Cookie,
  Droplet,
  Lamp,
  MapPin,
  Plug,
  Wifi,
  type LucideIcon,
} from 'lucide-react';

const AMENITY_ICONS: Record<BusAmenity, LucideIcon> = {
  wifi: Wifi,
  charging: Plug,
  water: Droplet,
  blanket: Bed,
  reading_light: Lamp,
  cctv: Cctv,
  tracking: MapPin,
  snacks: Cookie,
};

/** Amenities with labels; `compact` shows icons only (labels stay for screen readers). */
export function AmenityList({
  amenities,
  compact = false,
  className,
}: {
  amenities: readonly BusAmenity[];
  compact?: boolean;
  className?: string;
}) {
  return (
    <ul
      className={cn('flex flex-wrap', compact ? 'gap-2' : 'gap-x-4 gap-y-2', className)}
      aria-label="Amenities"
    >
      {amenities.map((a) => {
        const Icon = AMENITY_ICONS[a];
        return (
          <li
            key={a}
            className="inline-flex items-center gap-1.5 text-sm"
            title={compact ? BUS_AMENITY_LABELS[a] : undefined}
          >
            <Icon aria-hidden className="size-4 text-muted" />
            <span className={compact ? 'sr-only' : undefined}>{BUS_AMENITY_LABELS[a]}</span>
          </li>
        );
      })}
    </ul>
  );
}
