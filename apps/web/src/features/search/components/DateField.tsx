import { useId, useRef, type ReactNode } from 'react';
import { FieldShell } from './FieldShell';

const dayMonthYear = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});
const weekday = new Intl.DateTimeFormat('en-IN', { weekday: 'long', timeZone: 'UTC' });

interface DateFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
  icon?: ReactNode;
  error?: string | undefined;
  className?: string;
  /** Shown when empty, e.g. "Add return" for an optional date. */
  emptyHint?: string;
}

/**
 * Shows the date as "25 Oct 2026 / Saturday" (the same in every browser locale) while a native
 * date input covers the card, so keyboard entry, screen readers and mobile pickers keep working.
 */
export function DateField({
  label,
  value,
  onChange,
  min,
  max,
  icon,
  error,
  className,
  emptyHint,
}: DateFieldProps) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const date = value ? new Date(`${value}T00:00:00Z`) : null;
  return (
    <FieldShell id={id} label={label} icon={icon} error={error} className={className}>
      <input
        ref={input}
        id={id}
        type="date"
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(e.target.value)}
        onClick={() => {
          try {
            input.current?.showPicker();
          } catch {
            /* Not supported or not allowed: the browser's default behaviour applies. */
          }
        }}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className="absolute inset-0 z-10 size-full cursor-pointer opacity-0"
      />
      <p
        aria-hidden
        className={
          date
            ? 'truncate text-base font-bold sm:text-lg'
            : 'truncate text-base font-semibold text-muted sm:text-lg'
        }
      >
        {date ? dayMonthYear.format(date) : (emptyHint ?? 'Select date')}
      </p>
      <p aria-hidden className="truncate text-xs text-muted">
        {date ? weekday.format(date) : ' '}
      </p>
    </FieldShell>
  );
}
