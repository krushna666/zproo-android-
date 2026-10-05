import { Button } from '@zproo/ui';
import { useId } from 'react';
import { Check, Group, TimeGroup } from '@/components/filters/FilterControls';
import { toggle } from '@/lib/list';
import {
  activeFilterCount,
  EMPTY_FILTERS,
  type FilterFacets,
  type FlightFilters,
} from '../filters';
import { inr, stopsLabel } from '../format';

interface FiltersPanelProps {
  facets: FilterFacets;
  value: FlightFilters;
  onChange: (next: FlightFilters) => void;
  fromCity: string;
  toCity: string;
}

export function FiltersPanel({ facets, value, onChange, fromCity, toCity }: FiltersPanelProps) {
  const priceId = useId();
  const set = (patch: Partial<FlightFilters>) => onChange({ ...value, ...patch });
  const maxPrice = value.maxPricePaise ?? facets.maxPricePaise;
  // Whole rupees, rounded up to ₹100, so the slider lands on tidy values.
  const step = 10_000;
  const sliderMax = Math.ceil(facets.maxPricePaise / step) * step;
  const sliderMin = Math.floor(facets.minPricePaise / step) * step;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold">Filters</h2>
        {activeFilterCount(value) > 0 && (
          <Button variant="ghost" size="sm" onClick={() => onChange(EMPTY_FILTERS)}>
            Clear all
          </Button>
        )}
      </div>

      <Group title="Stops">
        {facets.stops.map((s) => (
          <Check
            key={s.stops}
            label={s.stops === 2 ? '2+ stops' : stopsLabel(s.stops)}
            hint={inr(s.fromPaise)}
            checked={value.stops.includes(s.stops)}
            onChange={() => set({ stops: toggle(value.stops, s.stops) })}
          />
        ))}
      </Group>

      {facets.maxPricePaise > facets.minPricePaise && (
        <Group title="Price">
          <label htmlFor={priceId} className="flex justify-between text-sm">
            <span className="text-muted">Up to</span>
            <span className="font-semibold tabular-nums">{inr(Math.min(maxPrice, sliderMax))}</span>
          </label>
          <input
            id={priceId}
            type="range"
            min={sliderMin}
            max={sliderMax}
            step={step}
            value={Math.min(maxPrice, sliderMax)}
            onChange={(e) => {
              const v = Number(e.target.value);
              set({ maxPricePaise: v >= sliderMax ? null : v });
            }}
            className="w-full accent-primary"
          />
          <div className="flex justify-between text-xs text-muted tabular-nums">
            <span>{inr(sliderMin)}</span>
            <span>{inr(sliderMax)}</span>
          </div>
        </Group>
      )}

      <TimeGroup
        title={`Departure from ${fromCity}`}
        selected={value.departure}
        onToggle={(b) => set({ departure: toggle(value.departure, b) })}
      />
      <TimeGroup
        title={`Arrival at ${toCity}`}
        selected={value.arrival}
        onToggle={(b) => set({ arrival: toggle(value.arrival, b) })}
      />

      {facets.airlines.length > 1 && (
        <Group title="Airlines">
          {facets.airlines.map((a) => (
            <Check
              key={a.code}
              label={a.name}
              hint={inr(a.fromPaise)}
              checked={value.airlines.includes(a.code)}
              onChange={() => set({ airlines: toggle(value.airlines, a.code) })}
            />
          ))}
        </Group>
      )}

      <Group title="Fare type">
        <Check
          label="Refundable only"
          checked={value.refundableOnly}
          onChange={() => set({ refundableOnly: !value.refundableOnly })}
        />
      </Group>
    </div>
  );
}
