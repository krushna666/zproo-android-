import type { BusPoint } from '@zproo/types';
import { cn } from '@zproo/ui';
import { istTime } from '../format';

interface PointPickerProps {
  kind: 'boarding' | 'dropping';
  points: readonly BusPoint[];
  value: string;
  onChange: (id: string) => void;
  error?: string | undefined;
}

const LEGEND = { boarding: 'Boarding point', dropping: 'Dropping point' } as const;

/** Boarding or dropping point as radio cards: time, name, landmark and address. */
export function PointPicker({ kind, points, value, onChange, error }: PointPickerProps) {
  const errorId = `${kind}-point-error`;
  return (
    <fieldset
      className="space-y-2"
      aria-invalid={error ? true : undefined}
      aria-describedby={error ? errorId : undefined}
    >
      <legend className="mb-2 text-sm font-bold">{LEGEND[kind]}</legend>
      {points.map((p) => (
        <label
          key={p.id}
          data-testid={`bus-${kind}-${p.id}`}
          data-selected={value === p.id}
          className={cn(
            'flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring',
            value === p.id
              ? 'border-primary bg-primary-light'
              : 'border-border bg-card hover:border-foreground/30',
          )}
        >
          <input
            type="radio"
            name={`${kind}-point`}
            value={p.id}
            checked={value === p.id}
            onChange={() => onChange(p.id)}
            className="mt-1 size-4 accent-primary"
          />
          <span className="w-12 shrink-0 font-bold tabular-nums">{istTime(p.time)}</span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold">{p.name}</span>
            <span className="block text-xs text-muted">{p.landmark}</span>
            <span className="block text-xs text-muted">{p.address}</span>
          </span>
        </label>
      ))}
      {error && (
        <p
          id={errorId}
          data-testid={`field-error-${kind}PointId`}
          className="text-xs font-semibold text-danger"
        >
          {error}
        </p>
      )}
    </fieldset>
  );
}
