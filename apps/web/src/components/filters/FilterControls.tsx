import { cn } from '@zproo/ui';
import { Moon, Sun, Sunrise, Sunset } from 'lucide-react';
import type { ReactNode } from 'react';
import { TIME_SLOTS, type TimeSlot } from './timeSlots';

/** Shared building blocks for search-result filter panels (flights, buses, …). */

const SLOT_ICONS: Record<TimeSlot, typeof Sun> = {
  early: Sunrise,
  morning: Sun,
  afternoon: Sunset,
  night: Moon,
};

export function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="space-y-2">
      <legend className="mb-2 text-sm font-semibold">{title}</legend>
      {children}
    </fieldset>
  );
}

export function Check({
  label,
  hint,
  checked,
  onChange,
  testId,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: () => void;
  testId?: string;
}) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg py-1 text-sm">
      <input
        type="checkbox"
        data-testid={testId}
        checked={checked}
        onChange={onChange}
        className="size-4 accent-primary"
      />
      <span className="flex-1">{label}</span>
      {hint && <span className="text-xs text-muted tabular-nums">{hint}</span>}
    </label>
  );
}

/** Time-of-day buckets as toggle buttons (`<testIdPrefix>-<slot>` test ids). */
export function SlotGroup({
  title,
  testIdPrefix,
  selected,
  onToggle,
}: {
  title: string;
  testIdPrefix: string;
  selected: readonly TimeSlot[];
  onToggle: (slot: TimeSlot) => void;
}) {
  return (
    <Group title={title}>
      <div className="grid grid-cols-2 gap-2">
        {TIME_SLOTS.map((slot) => {
          const Icon = SLOT_ICONS[slot.id];
          const on = selected.includes(slot.id);
          return (
            <button
              key={slot.id}
              type="button"
              aria-pressed={on}
              data-testid={`${testIdPrefix}-${slot.id}`}
              onClick={() => onToggle(slot.id)}
              className={cn(
                'flex min-h-11 flex-col items-center gap-1 rounded-xl border px-2 py-2 text-xs font-medium transition-colors',
                on
                  ? 'border-primary bg-primary-light text-primary'
                  : 'border-border hover:border-foreground/30',
              )}
            >
              <Icon aria-hidden className="size-4" />
              {slot.label}
            </button>
          );
        })}
      </div>
    </Group>
  );
}
