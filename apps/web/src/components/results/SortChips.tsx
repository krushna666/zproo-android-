import { cn } from '@zproo/ui';

/** Sort options as a radio group of chips (`<prefix>-<id>` test ids). */
export function SortChips<T extends string>({
  options,
  value,
  onChange,
  label,
  testIdPrefix,
}: {
  options: readonly { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
  label: string;
  testIdPrefix: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex gap-2 overflow-x-auto pb-1">
      {options.map((s) => (
        <button
          key={s.id}
          type="button"
          role="radio"
          aria-checked={value === s.id}
          data-testid={`${testIdPrefix}-${s.id}`}
          onClick={() => onChange(s.id)}
          className={cn(
            'min-h-11 shrink-0 rounded-full border px-4 text-sm font-semibold transition-colors',
            value === s.id
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-border bg-card hover:border-foreground/30',
          )}
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}
