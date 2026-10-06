import { cn } from '@zproo/ui';
import { Star } from 'lucide-react';

/** Star rating as icons, read as "4 star hotel". */
export function Stars({ count, className }: { count: number; className?: string }) {
  return (
    <span
      role="img"
      aria-label={`${count} star hotel`}
      className={cn('inline-flex items-center gap-0.5 text-warning', className)}
    >
      {Array.from({ length: count }, (_, i) => (
        <Star key={i} aria-hidden className="size-3.5 fill-current" />
      ))}
    </span>
  );
}

/** "4.4 Excellent" in a rating chip. */
export function RatingBadge({ rating, label }: { rating: number; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="rounded-md bg-green-700 px-1.5 py-0.5 text-xs font-bold text-primary-foreground tabular-nums">
        {rating.toFixed(1)}
      </span>
      <span className="text-sm font-semibold">{label}</span>
    </span>
  );
}
