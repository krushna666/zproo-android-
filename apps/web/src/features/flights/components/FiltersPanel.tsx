import { Button } from '@zproo/ui';
import { useId } from 'react';
import { Check, Group, SlotGroup } from '@/components/filters/FilterControls';
import { toggle } from '@/lib/list';
import {
  activeFlightFilterCount,
  EMPTY_FLIGHT_FILTERS,
  STOP_OPTIONS,
  type FlightFacets,
  type FlightFilters,
} from '../filters';
import { inr } from '../format';

interface FiltersPanelProps {
  facets: FlightFacets;
  value: FlightFilters;
  onChange: (next: FlightFilters) => void;
  fromCity: string;
  toCity: string;
}

/** Stops, times, airlines (lowest price each), price, refundable, meal and duration. */
export function FiltersPanel({ facets, value, onChange, fromCity, toCity }: FiltersPanelProps) {
  const priceId = useId();
  const durationId = useId();
  const set = (patch: Partial<FlightFilters>) => onChange({ ...value, ...patch });
  const step = 10_000; // ₹100
  const sliderMin = Math.floor(facets.priceMin / step) * step;
  const sliderMax = Math.ceil(facets.priceMax / step) * step;
  const maxPrice = Math.min(value.maxPrice ?? sliderMax, sliderMax);
  const maxHours = Math.min(value.maxHours ?? facets.maxHours, facets.maxHours);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold">Filters</h2>
        {activeFlightFilterCount(value) > 0 && (
          <Button
            variant="ghost"
            size="sm"
            data-testid="flight-filter-clear"
            onClick={() => onChange(EMPTY_FLIGHT_FILTERS)}
          >
            Clear all
          </Button>
        )}
      </div>

      <Group title="Stops">
        {STOP_OPTIONS.filter((s) => facets.stops.some((f) => f.id === s.id)).map((s) => {
          const facet = facets.stops.find((f) => f.id === s.id);
          return (
            <Check
              key={s.id}
              testId={`flight-filter-stops-${s.id}`}
              label={s.label}
              hint={facet ? `from ${inr(facet.minPrice)}` : undefined}
              checked={value.stops.includes(s.id)}
              onChange={() => set({ stops: toggle(value.stops, s.id) })}
            />
          );
        })}
      </Group>

      <SlotGroup
        title={`Departure from ${fromCity}`}
        testIdPrefix="flight-filter-dep"
        selected={value.departure}
        onToggle={(s) => set({ departure: toggle(value.departure, s) })}
      />
      <SlotGroup
        title={`Arrival at ${toCity}`}
        testIdPrefix="flight-filter-arr"
        selected={value.arrival}
        onToggle={(s) => set({ arrival: toggle(value.arrival, s) })}
      />

      <Group title="Airlines">
        {facets.airlines.map((a) => (
          <Check
            key={a.code}
            testId={`flight-filter-air-${a.code}`}
            label={a.name}
            hint={`from ${inr(a.minPrice)}`}
            checked={value.airlines.includes(a.code)}
            onChange={() => set({ airlines: toggle(value.airlines, a.code) })}
          />
        ))}
      </Group>

      {sliderMax > sliderMin && (
        <Group title="Price per adult">
          <label htmlFor={priceId} className="flex justify-between text-sm">
            <span className="text-muted">Up to</span>
            <span className="font-semibold tabular-nums">{inr(maxPrice)}</span>
          </label>
          <input
            id={priceId}
            type="range"
            data-testid="flight-filter-price"
            min={sliderMin}
            max={sliderMax}
            step={step}
            value={maxPrice}
            aria-valuetext={`Up to ${inr(maxPrice)}`}
            onChange={(e) => {
              const next = Number(e.target.value);
              set({ maxPrice: next >= sliderMax ? null : next });
            }}
            className="w-full accent-primary"
          />
        </Group>
      )}

      {facets.maxHours > 1 && (
        <Group title="Journey time">
          <label htmlFor={durationId} className="flex justify-between text-sm">
            <span className="text-muted">Up to</span>
            <span className="font-semibold tabular-nums">{maxHours} h</span>
          </label>
          <input
            id={durationId}
            type="range"
            data-testid="flight-filter-duration"
            min={1}
            max={facets.maxHours}
            step={1}
            value={maxHours}
            aria-valuetext={`Up to ${maxHours} hours`}
            onChange={(e) => {
              const next = Number(e.target.value);
              set({ maxHours: next >= facets.maxHours ? null : next });
            }}
            className="w-full accent-primary"
          />
        </Group>
      )}

      <Group title="More">
        {facets.refundable && (
          <Check
            testId="flight-filter-refundable"
            label="Refundable only"
            checked={value.refundable}
            onChange={() => set({ refundable: !value.refundable })}
          />
        )}
        {facets.meal && (
          <Check
            testId="flight-filter-meal"
            label="Meal included"
            checked={value.meal}
            onChange={() => set({ meal: !value.meal })}
          />
        )}
      </Group>
    </div>
  );
}
