import { addDays, busSearchSchema, todayIso, type BusSearch } from '@zproo/validation';
import { CalendarDays, MapPin, Navigation } from 'lucide-react';
import { Controller } from 'react-hook-form';
import { DateField } from '../components/DateField';
import { PlaceCombobox } from '../components/PlaceCombobox';
import { SearchButton } from '../components/SearchButton';
import { SwapButton } from '../components/SwapButton';
import { CITY_OPTIONS } from '../components/options';
import { busesUrl } from '../url';
import { useSearchForm } from '../useSearchForm';
import { QuickDates } from './QuickDates';

/** `initial` pre-fills the form (the results page's "Modify search"). */
export function BusSearchForm({ initial }: { initial?: BusSearch }) {
  const today = todayIso();
  const { form, onSubmit } = useSearchForm(
    busSearchSchema,
    initial ?? { from: 'pune', to: 'mumbai', date: addDays(today, 1) },
    busesUrl,
  );
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
                options={CITY_OPTIONS}
                placeholder="Leaving from"
                icon={<Navigation aria-hidden />}
                error={errors.from?.message}
              />
            )}
          />
          <SwapButton
            onClick={() => {
              const from = getValues('from');
              setValue('from', getValues('to'));
              setValue('to', from);
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
                options={CITY_OPTIONS}
                placeholder="Going to"
                icon={<MapPin aria-hidden />}
                error={errors.to?.message}
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
              max={addDays(today, 365)}
              icon={<CalendarDays aria-hidden />}
              error={errors.date?.message}
            />
          )}
        />
        <SearchButton label="Search Buses" className="lg:h-[4.25rem]" />
      </div>
      <QuickDates onPick={(d) => setValue('date', d, { shouldValidate: formState.isSubmitted })} />
    </form>
  );
}
