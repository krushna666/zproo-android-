import { Button, cn, EmptyState } from '@zproo/ui';
import { Timer, TimerOff } from 'lucide-react';
import { Link } from 'react-router';

const mmss = (seconds: number) =>
  `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;

/** "Complete payment in mm:ss" — warning colour under 2:00. */
export function HoldTimer({ secondsLeft }: { secondsLeft: number }) {
  const low = secondsLeft < 120;
  return (
    <div
      role="timer"
      aria-live="off"
      aria-label={`Complete payment in ${Math.floor(secondsLeft / 60)} minutes ${secondsLeft % 60} seconds`}
      data-testid="checkout-hold-timer"
      data-seconds={secondsLeft}
      className={cn(
        'flex items-center gap-3 rounded-xl border px-4 py-3 text-sm',
        low ? 'border-warning/60 bg-warning/10 text-foreground' : 'border-border bg-card',
      )}
    >
      <Timer aria-hidden className={cn('size-5 shrink-0', low ? 'text-warning' : 'text-primary')} />
      <span>
        Complete payment in <strong className="tabular-nums">{mmss(secondsLeft)}</strong>
      </span>
    </div>
  );
}

/** HOLD_EXPIRED (SOP §6.2): the hold ran out; payment is disabled. */
export function HoldExpired({ searchHref }: { searchHref: string }) {
  return (
    <EmptyState
      data-testid="checkout-hold-expired"
      icon={TimerOff}
      title="Your hold has expired. Please start again."
      description="The seats were released. Any amount debited for this booking will be refunded."
      actions={
        <Button asChild>
          <Link to={searchHref}>Search again</Link>
        </Button>
      }
    />
  );
}
