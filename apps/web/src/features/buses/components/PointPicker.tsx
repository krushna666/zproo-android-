import type { BusPoint } from '@zproo/types';
import { cn } from '@zproo/ui';
import { istTime } from '../format';

interface PointPickerProps {
  label: string;
  points: BusPoint[];
  value: string;
  onChange: (id: string) => void;
}

/** Boarding or dropping point choice (radio group). */
export function PointPicker({ label, points, value, onChange }: PointPickerProps) {
  return (
    <fieldset className="space-y-2">
      <legend className="mb-2 text-sm font-bold">{label}</legend>
      {points.map((p) => (
        <label
          key={p.id}
          className={cn(
            'flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors',
            value === p.id
              ? 'border-primary bg-primary-light'
              : 'border-border hover:border-foreground/30',
          )}
        >
          <input
            type="radio"
            name={label}
            value={p.id}
            checked={value === p.id}
            onChange={() => onChange(p.id)}
            className="mt-1 size-4 accent-primary"
          />
          <span className="w-12 shrink-0 font-bold tabular-nums">{istTime(p.time)}</span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold">{p.name}</span>
            <span className="block text-xs text-muted">{p.address}</span>
          </span>
        </label>
      ))}
    </fieldset>
  );
}
