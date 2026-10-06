import { cn } from '@zproo/ui';
import { ArrowLeftRight } from 'lucide-react';

/** Circular swap control placed between From and To fields. */
export function SwapButton({
  onClick,
  className,
  label = 'Swap origin and destination',
  testId,
}: {
  onClick: () => void;
  className?: string;
  label?: string;
  testId?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      data-testid={testId}
      className={cn(
        'z-10 grid size-11 place-items-center md:size-10 rounded-full border border-border bg-card text-primary shadow-sm transition-transform hover:rotate-180 hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className,
      )}
    >
      <ArrowLeftRight aria-hidden className="size-4" />
    </button>
  );
}
