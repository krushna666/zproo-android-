import { BUS_AMENITY_LABELS } from '@zproo/types';
import { Button, cn, Input } from '@zproo/ui';
import { formatMoney } from '@zproo/utils';
import { Moon, Sun, Sunrise, Sunset } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';
import { Check, Group } from '@/components/filters/FilterControls';
import { toggle } from '@/lib/list';
import {
  activeBusFilterCount,
  BUS_TYPES,
  EMPTY_BUS_FILTERS,
  TIME_SLOTS,
  type BusFacets,
  type BusFilters,
  type TimeSlot,
} from '../filters';

const SLOT_ICONS: Record<TimeSlot, typeof Sun> = {
  early: Sunrise,
  morning: Sun,
  afternoon: Sunset,
  night: Moon,
};

interface BusFiltersPanelProps {
  facets: BusFacets;
  value: BusFilters;
  onChange: (next: BusFilters) => void;
  fromCity: string;
  toCity: string;
}

function Chip({
  on,
  onClick,
  testId,
  children,
}: {
  on: boolean;
  onClick: () => void;
  testId: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      data-testid={testId}
      onClick={onClick}
      className={cn(
        'min-h-11 rounded-full border px-3 text-sm font-medium transition-colors',
        on
          ? 'border-primary bg-primary-light text-primary'
          : 'border-border hover:border-foreground/30',
      )}
    >
      {children}
    </button>
  );
}

function SlotGroup({
  title,
  prefix,
  selected,
  onToggle,
}: {
  title: string;
  prefix: 'dep' | 'arr';
  selected: TimeSlot[];
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
              data-testid={`bus-filter-${prefix}-${slot.id}`}
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

/** Results filters: bus type, times, price, operators (searchable), amenities, rating, tracking. */
export function BusFiltersPanel({
  facets,
  value,
  onChange,
  fromCity,
  toCity,
}: BusFiltersPanelProps) {
  const priceId = useId();
  const [operatorQuery, setOperatorQuery] = useState('');
  const set = (patch: Partial<BusFilters>) => onChange({ ...value, ...patch });
  const step = 5_000; // ₹50
  const sliderMin = Math.floor(facets.priceMin / step) * step;
  const sliderMax = Math.ceil(facets.priceMax / step) * step;
  const maxPrice = Math.min(value.maxPrice ?? sliderMax, sliderMax);
  const operators = facets.operators.filter((o) =>
    o.name.toLowerCase().includes(operatorQuery.trim().toLowerCase()),
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold">Filters</h2>
        {activeBusFilterCount(value) > 0 && (
          <Button
            variant="ghost"
            size="sm"
            data-testid="bus-filter-clear"
            onClick={() => onChange(EMPTY_BUS_FILTERS)}
          >
            Clear all
          </Button>
        )}
      </div>

      <Group title="Bus type">
        <div className="flex flex-wrap gap-2">
          {BUS_TYPES.filter((t) => facets.types.includes(t.id)).map((t) => (
            <Chip
              key={t.id}
              testId={`bus-filter-${t.id}`}
              on={value.types.includes(t.id)}
              onClick={() => set({ types: toggle(value.types, t.id) })}
            >
              {t.label}
            </Chip>
          ))}
        </div>
      </Group>

      <SlotGroup
        title={`Departure from ${fromCity}`}
        prefix="dep"
        selected={value.departure}
        onToggle={(s) => set({ departure: toggle(value.departure, s) })}
      />
      <SlotGroup
        title={`Arrival at ${toCity}`}
        prefix="arr"
        selected={value.arrival}
        onToggle={(s) => set({ arrival: toggle(value.arrival, s) })}
      />

      {sliderMax > sliderMin && (
        <Group title="Price">
          <label htmlFor={priceId} className="flex justify-between text-sm">
            <span className="text-muted">Up to</span>
            <span className="font-semibold tabular-nums">{formatMoney(maxPrice)}</span>
          </label>
          <input
            id={priceId}
            type="range"
            data-testid="bus-filter-price"
            min={sliderMin}
            max={sliderMax}
            step={step}
            value={maxPrice}
            aria-valuetext={`Up to ${formatMoney(maxPrice)}`}
            onChange={(e) => {
              const next = Number(e.target.value);
              set({ maxPrice: next >= sliderMax ? null : next });
            }}
            className="w-full accent-primary"
          />
          <div className="flex justify-between text-xs text-muted tabular-nums">
            <span>{formatMoney(sliderMin)}</span>
            <span>{formatMoney(sliderMax)}</span>
          </div>
        </Group>
      )}

      <Group title="Operators">
        {facets.operators.length > 6 && (
          <Input
            aria-label="Search operators"
            placeholder="Search operators"
            data-testid="bus-filter-operator-search"
            value={operatorQuery}
            onChange={(e) => setOperatorQuery(e.target.value)}
            className="mb-2"
          />
        )}
        {operators.map((o) => (
          <Check
            key={o.code}
            testId={`bus-filter-op-${o.code}`}
            label={o.name}
            hint={`★ ${o.rating.toFixed(1)} · ${o.count}`}
            checked={value.operators.includes(o.code)}
            onChange={() => set({ operators: toggle(value.operators, o.code) })}
          />
        ))}
        {operators.length === 0 && <p className="text-sm text-muted">No operators match</p>}
      </Group>

      {facets.amenities.length > 0 && (
        <Group title="Amenities">
          {facets.amenities.map((a) => (
            <Check
              key={a}
              testId={`bus-filter-amen-${a}`}
              label={BUS_AMENITY_LABELS[a]}
              checked={value.amenities.includes(a)}
              onChange={() => set({ amenities: toggle(value.amenities, a) })}
            />
          ))}
        </Group>
      )}

      <Group title="More">
        <Check
          testId="bus-filter-rating4"
          label="Rating 4+"
          checked={value.rating4}
          onChange={() => set({ rating4: !value.rating4 })}
        />
        {facets.tracking && (
          <Check
            testId="bus-filter-tracking"
            label="Live tracking"
            checked={value.tracking}
            onChange={() => set({ tracking: !value.tracking })}
          />
        )}
      </Group>
    </div>
  );
}
