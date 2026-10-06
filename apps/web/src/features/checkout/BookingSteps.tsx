import { cn } from '@zproo/ui';
import { Check } from 'lucide-react';
import { STEPS, type CheckoutService } from './steps';

/** Checkout progress. `current` is the index of the active step. */
export function BookingSteps({
  current,
  service = 'flight',
}: {
  current: number;
  service?: CheckoutService;
}) {
  const steps = STEPS[service];
  return (
    <ol
      aria-label="Booking progress"
      className="flex flex-wrap items-center gap-1 gap-y-2 text-xs sm:gap-2 sm:text-sm"
    >
      {steps.map((step, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li
            key={step}
            className="flex shrink-0 items-center gap-1 sm:gap-2"
            aria-current={active ? 'step' : undefined}
          >
            <span
              className={cn(
                'grid size-6 place-items-center rounded-full border text-[11px] font-bold',
                done && 'border-success bg-success text-white',
                active && 'border-primary bg-primary text-primary-foreground',
                !done && !active && 'border-border text-muted',
              )}
            >
              {done ? <Check aria-hidden className="size-3.5" /> : i + 1}
            </span>
            <span
              className={cn(
                'font-semibold',
                // Phones show only the current step's name; the others stay readable to screen readers.
                active ? 'text-foreground' : 'sr-only text-muted sm:not-sr-only',
              )}
            >
              {step}
            </span>
            {i < steps.length - 1 && (
              <span aria-hidden className="mx-1 h-px w-4 bg-border sm:w-8" />
            )}
          </li>
        );
      })}
    </ol>
  );
}
