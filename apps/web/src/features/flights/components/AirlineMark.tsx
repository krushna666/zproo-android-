import { cn } from '@zproo/ui';

/**
 * Airline badge: the two-letter code in a soft badge (no airline logos unless properly licensed
 * assets exist). Pair it with the airline name in text.
 */
export function AirlineMark({ code, className }: { code: string; className?: string }) {
  return (
    <span
      aria-hidden
      data-testid="flight-airline-code"
      className={cn(
        'grid size-10 shrink-0 place-items-center rounded-xl bg-primary-light text-xs font-extrabold text-primary',
        className,
      )}
    >
      {code}
    </span>
  );
}
