import { addDays, todayInIst } from '@zproo/validation';
import { cn } from '@zproo/ui';
import { formatMoney } from '@zproo/utils';
import { useRef, type KeyboardEvent } from 'react';
import { Link } from 'react-router';

/** "Mon, 5 Oct" */
const shortDate = (date: string) =>
  new Intl.DateTimeFormat('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`));

interface DateStripProps {
  date: string;
  /** URL for a date (keeps the route and filters). */
  hrefFor: (date: string) => string;
  /** Lowest fare per date, when known. */
  prices?: Readonly<Record<string, number>>;
  /** Booking window (days ahead of today, IST) */
  maxDaysAhead: number;
  /** e.g. bus-date-strip → bus-date-strip-2026-10-20 */
  testIdPrefix: string;
}

/** Selected date ±3 days; arrow keys move along the strip. Dates outside the booking window are off. */
export function DateStrip({
  date,
  hrefFor,
  prices = {},
  maxDaysAhead,
  testIdPrefix,
}: DateStripProps) {
  const today = todayInIst();
  const last = addDays(today, maxDaysAhead);
  const days = [-3, -2, -1, 0, 1, 2, 3].map((n) => addDays(date, n));
  const list = useRef<HTMLUListElement>(null);

  const onKeyDown = (e: KeyboardEvent<HTMLAnchorElement>) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const links = [...(list.current?.querySelectorAll<HTMLAnchorElement>('a') ?? [])];
    const index = links.indexOf(document.activeElement as HTMLAnchorElement);
    const next = links[index + (e.key === 'ArrowRight' ? 1 : -1)];
    if (next) {
      e.preventDefault();
      next.focus();
      next.scrollIntoView?.({ inline: 'nearest', block: 'nearest' });
    }
  };

  return (
    <nav aria-label="Choose another date">
      <ul ref={list} className="flex gap-2 overflow-x-auto pb-1">
        {days.map((d) => {
          const disabled = d < today || d > last;
          const current = d === date;
          const content = (
            <>
              <span className="block text-xs font-semibold">{shortDate(d)}</span>
              <span className="block text-xs tabular-nums">
                {prices[d] !== undefined ? formatMoney(prices[d]) : ' '}
              </span>
            </>
          );
          return (
            <li key={d} className="shrink-0">
              {disabled ? (
                <span
                  aria-disabled
                  data-testid={`${testIdPrefix}-${d}`}
                  className="block min-w-24 rounded-xl border border-border px-3 py-2 text-center text-muted opacity-50"
                >
                  {content}
                </span>
              ) : (
                <Link
                  to={hrefFor(d)}
                  data-testid={`${testIdPrefix}-${d}`}
                  aria-current={current ? 'date' : undefined}
                  onKeyDown={onKeyDown}
                  className={cn(
                    'block min-h-11 min-w-24 rounded-xl border px-3 py-2 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    current
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-card hover:border-primary/40',
                  )}
                >
                  {content}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
