import { addDays, todayIso } from '@zproo/validation';

/** "Today / Tomorrow" shortcuts common on Indian bus and train booking. */
export function QuickDates({
  onPick,
  testIdPrefix,
}: {
  onPick: (date: string) => void;
  testIdPrefix?: string;
}) {
  const today = todayIso();
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-muted">Quick pick:</span>
      {[
        ['Today', today],
        ['Tomorrow', addDays(today, 1)],
      ].map(([label, date]) => (
        <button
          key={label}
          type="button"
          data-testid={testIdPrefix && `${testIdPrefix}-${(label as string).toLowerCase()}`}
          onClick={() => onPick(date as string)}
          className="inline-flex min-h-11 items-center rounded-full bg-background px-3 py-1 font-semibold md:min-h-0 ring-1 ring-border transition-colors hover:text-primary hover:ring-primary/40"
        >
          {label}
        </button>
      ))}
    </div>
  );
}
