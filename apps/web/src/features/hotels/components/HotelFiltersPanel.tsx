import { HOTEL_AMENITY_LABELS, PROPERTY_TYPE_LABELS, type HotelSearchResponse } from '@zproo/types';
import { cn } from '@zproo/ui';
import { GUEST_RATING_STEPS, HOTEL_FILTER_AMENITIES } from '@zproo/validation';
import { Star } from 'lucide-react';
import { useId } from 'react';
import { Check, Group } from '@/components/filters/FilterControls';
import { toggle } from '@/lib/list';
import { activeHotelFilterCount, EMPTY_HOTEL_FILTERS, type ResultFilters } from '../filters';
import { inr } from '../format';

const STEP = 50_000;

export function HotelFiltersPanel({
  facets,
  value,
  onChange,
}: {
  facets: HotelSearchResponse['filters'];
  value: ResultFilters;
  onChange: (next: ResultFilters) => void;
}) {
  const priceId = useId();
  const floor = Math.floor(facets.priceMin / STEP) * STEP;
  const ceiling = Math.ceil(facets.priceMax / STEP) * STEP;
  const max = value.priceMax ?? ceiling;
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold">Filters</h2>
        {activeHotelFilterCount(value) > 0 && (
          <button
            type="button"
            data-testid="hotel-filter-clear"
            onClick={() => onChange({ ...EMPTY_HOTEL_FILTERS, sort: value.sort })}
            className="min-h-11 text-sm font-semibold text-primary hover:underline"
          >
            Clear all
          </button>
        )}
      </div>

      <Group title="Price per night">
        <label htmlFor={priceId} className="flex justify-between text-sm">
          <span>Up to</span>
          <strong className="tabular-nums">{inr(max)}</strong>
        </label>
        <input
          id={priceId}
          type="range"
          data-testid="hotel-filter-price"
          min={floor}
          max={ceiling}
          step={STEP}
          value={max}
          onChange={(e) => {
            const v = Number(e.target.value);
            onChange({ ...value, priceMax: v >= ceiling ? undefined : v });
          }}
          className="w-full accent-primary"
        />
        <p className="flex justify-between text-xs text-muted tabular-nums">
          <span>{inr(floor)}</span>
          <span>{inr(ceiling)}</span>
        </p>
      </Group>

      <Group title="Star rating">
        <div className="flex flex-wrap gap-2">
          {[5, 4, 3, 2].map((s) => {
            const on = value.stars.includes(s);
            return (
              <button
                key={s}
                type="button"
                aria-pressed={on}
                data-testid={`hotel-filter-stars-${s}`}
                onClick={() => onChange({ ...value, stars: toggle(value.stars, s) })}
                className={cn(
                  'inline-flex min-h-11 items-center gap-1 rounded-full border px-3 text-sm font-semibold',
                  on ? 'border-primary bg-primary-light text-primary' : 'border-border',
                )}
              >
                {s} <Star aria-hidden className="size-3.5 fill-current" />
                <span className="sr-only">star</span>
              </button>
            );
          })}
        </div>
      </Group>

      <Group title="Guest rating">
        {GUEST_RATING_STEPS.map((r) => (
          <Check
            key={r}
            label={`${r}+`}
            checked={value.rating === r}
            testId={`hotel-filter-rating-${r}`}
            onChange={() => onChange({ ...value, rating: value.rating === r ? undefined : r })}
          />
        ))}
      </Group>

      <Group title="Policies and meals">
        <Check
          label="Free cancellation"
          checked={value.freeCancellation}
          testId="hotel-filter-free-cancellation"
          onChange={() => onChange({ ...value, freeCancellation: !value.freeCancellation })}
        />
        <Check
          label="Breakfast included"
          checked={value.breakfast}
          testId="hotel-filter-breakfast"
          onChange={() => onChange({ ...value, breakfast: !value.breakfast })}
        />
      </Group>

      <Group title="Amenities">
        {HOTEL_FILTER_AMENITIES.map((a) => (
          <Check
            key={a}
            label={HOTEL_AMENITY_LABELS[a]}
            checked={value.amenities.includes(a)}
            testId={`hotel-filter-amenity-${a}`}
            onChange={() => onChange({ ...value, amenities: toggle(value.amenities, a) })}
          />
        ))}
      </Group>

      {facets.areas.length > 1 && (
        <Group title="Area">
          {facets.areas.map((a) => (
            <Check
              key={a.name}
              label={a.name}
              hint={String(a.count)}
              checked={value.areas.includes(a.name)}
              testId={`hotel-filter-area-${a.name.toLowerCase().replace(/\s+/g, '-')}`}
              onChange={() => onChange({ ...value, areas: toggle(value.areas, a.name) })}
            />
          ))}
        </Group>
      )}

      <Group title="Property type">
        {facets.propertyTypes.map((t) => (
          <Check
            key={t.type}
            label={PROPERTY_TYPE_LABELS[t.type]}
            hint={String(t.count)}
            checked={value.types.includes(t.type)}
            testId={`hotel-filter-type-${t.type.toLowerCase()}`}
            onChange={() => onChange({ ...value, types: toggle(value.types, t.type) })}
          />
        ))}
      </Group>
    </div>
  );
}
