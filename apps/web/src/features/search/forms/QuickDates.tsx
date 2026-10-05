import { addDays, todayIso } from '@zproo/validation';

/** "Today / Tomorrow" shortcuts common on Indian bus and train booking. */
export function QuickDates({ onPick }: { onPick: (date: string) => void }) {
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
          onClick={() => onPick(date as string)}
          className="rounded-full bg-background px-3 py-1 font-semibold ring-1 ring-border transition-colors hover:text-primary hover:ring-primary/40"
        >
          {label}
        </button>
      ))}
    </div>
  );
}
