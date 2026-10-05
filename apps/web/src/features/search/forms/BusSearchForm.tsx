import { BUS_CITY_CODES } from '@zproo/catalog';
import { findCity } from '@zproo/config';
import {
  addDays,
  BUS_MAX_DAYS_AHEAD,
  busSearchSchema,
  todayInIst,
  type BusSearch,
} from '@zproo/validation';
import { CalendarDays, History, MapPin, Navigation } from 'lucide-react';
import { useState } from 'react';
import { Controller } from 'react-hook-form';
import { Link } from 'react-router';
import { recentBusSearches, rememberBusSearch } from '@/features/buses/recent';
import { DateField } from '../components/DateField';
import { PlaceCombobox } from '../components/PlaceCombobox';
import { SearchButton } from '../components/SearchButton';
import { SwapButton } from '../components/SwapButton';
import { CITY_OPTIONS } from '../components/options';
import { busesUrl } from '../url';
import { useSearchForm } from '../useSearchForm';
import { QuickDates } from './QuickDates';

/** Bus cities only, popular ones first. */
const BUS_CITY_OPTIONS = CITY_OPTIONS.filter((o) => BUS_CITY_CODES.has(o.value))
  .map((o) => ({
    ...o,
    badge: o.value,
    group: findCity(o.value)?.popular ? 'Popular' : 'All cities',
  }))
  .sort((a, b) => (a.group === b.group ? 0 : a.group === 'Popular' ? -1 : 1));

const cityName = (code: string) => findCity(code)?.name ?? code;

/** `initial` pre-fills the form (the results page's "Modify" and invalid deep links). */
export function BusSearchForm({ initial }: { initial?: Partial<BusSearch> }) {
  const today = todayInIst();
  const { form, onSubmit } = useSearchForm(
    busSearchSchema,
    {
      from: initial?.from ?? 'PNQ',
      to: initial?.to ?? 'BOM',
      date: initial?.date ?? addDays(today, 1),
    },
    (values) => {
      rememberBusSearch(values);
      return busesUrl(values);
    },
  );
  const [recent] = useState(recentBusSearches);
  const { control, getValues, setValue, formState } = form;
  const errors = formState.errors;
  return (
    <form onSubmit={onSubmit} noValidate aria-label="Search buses" className="space-y-4">
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.9fr)_minmax(0,0.8fr)] lg:items-start">
        <div className="relative grid gap-3 sm:grid-cols-2 lg:col-span-2">
          <Controller
            control={control}
            name="from"
            render={({ field }) => (
              <PlaceCombobox
                label="From"
                value={field.value}
                onChange={field.onChange}
                options={BUS_CITY_OPTIONS}
                placeholder="Leaving from"
                icon={<Navigation aria-hidden />}
                error={errors.from?.message}
                testId="bus-search-from"
              />
            )}
          />
          <SwapButton
            label="Swap cities"
            testId="bus-search-swap"
            onClick={() => {
              const from = getValues('from');
              setValue('from', getValues('to'), { shouldValidate: formState.isSubmitted });
              setValue('to', from, { shouldValidate: formState.isSubmitted });
            }}
            className="absolute right-6 top-[3.2rem] sm:left-1/2 sm:right-auto sm:top-3.5 sm:-translate-x-1/2"
          />
          <Controller
            control={control}
            name="to"
            render={({ field }) => (
              <PlaceCombobox
                label="To"
                value={field.value}
                onChange={field.onChange}
                options={BUS_CITY_OPTIONS}
                placeholder="Going to"
                icon={<MapPin aria-hidden />}
                error={errors.to?.message}
                testId="bus-search-to"
              />
            )}
          />
        </div>
        <Controller
          control={control}
          name="date"
          render={({ field }) => (
            <DateField
              label="Travel date"
              value={field.value}
              onChange={field.onChange}
              min={today}
              max={addDays(today, BUS_MAX_DAYS_AHEAD)}
              icon={<CalendarDays aria-hidden />}
              error={errors.date?.message}
              testId="bus-search-date"
            />
          )}
        />
        <SearchButton label="Search buses" className="lg:h-[4.25rem]" testId="bus-search-submit" />
      </div>
      <QuickDates
        testIdPrefix="bus-search-date"
        onPick={(d) => setValue('date', d, { shouldValidate: formState.isSubmitted })}
      />
      {recent.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="inline-flex items-center gap-1 text-muted">
            <History aria-hidden className="size-4" /> Recent:
          </span>
          {recent.map((r) => (
            <Link
              key={`${r.from}-${r.to}-${r.date}`}
              to={busesUrl({ ...r, date: r.date < today ? addDays(today, 1) : r.date })}
              className="rounded-full bg-background px-3 py-1 font-semibold ring-1 ring-border transition-colors hover:text-primary hover:ring-primary/40"
            >
              {cityName(r.from)} → {cityName(r.to)}
            </Link>
          ))}
        </div>
      )}
    </form>
  );
}
