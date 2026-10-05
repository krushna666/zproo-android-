import { TRAIN_CLASS_LABELS, TrainClass } from '@zproo/types';
import { addDays, todayIso, trainSearchSchema } from '@zproo/validation';
import { CalendarDays, MapPin, Navigation, Ticket } from 'lucide-react';
import { useId } from 'react';
import { Controller } from 'react-hook-form';
import { DateField } from '../components/DateField';
import { FieldShell } from '../components/FieldShell';
import { fieldInputClass } from '../components/fieldStyles';
import { PlaceCombobox } from '../components/PlaceCombobox';
import { SearchButton } from '../components/SearchButton';
import { SwapButton } from '../components/SwapButton';
import { STATION_OPTIONS } from '../components/options';
import { trainsUrl } from '../url';
import { useSearchForm } from '../useSearchForm';
import { QuickDates } from './QuickDates';

export function TrainSearchForm() {
  const today = todayIso();
  const classId = useId();
  const { form, onSubmit } = useSearchForm(
    trainSearchSchema,
    { from: 'PUNE', to: 'NDLS', date: addDays(today, 3), travelClass: 'ALL' },
    trainsUrl,
  );
  const { control, getValues, setValue, formState, register } = form;
  const errors = formState.errors;
  return (
    <form onSubmit={onSubmit} noValidate aria-label="Search trains" className="space-y-4">
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_minmax(0,0.8fr)] lg:items-start">
        <div className="relative grid gap-3 sm:grid-cols-2 lg:col-span-2">
          <Controller
            control={control}
            name="from"
            render={({ field }) => (
              <PlaceCombobox
                label="From"
                value={field.value}
                onChange={field.onChange}
                options={STATION_OPTIONS}
                placeholder="Station or city"
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
                options={STATION_OPTIONS}
                placeholder="Station or city"
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
              label="Journey date"
              value={field.value}
              onChange={field.onChange}
              min={today}
              max={addDays(today, 120)}
              icon={<CalendarDays aria-hidden />}
              error={errors.date?.message}
            />
          )}
        />
        <FieldShell id={classId} label="Class" icon={<Ticket aria-hidden />}>
          <select
            id={classId}
            {...register('travelClass')}
            className={`${fieldInputClass} cursor-pointer appearance-none`}
          >
            <option value="ALL">All classes</option>
            {Object.values(TrainClass).map((c) => (
              <option key={c} value={c}>
                {TRAIN_CLASS_LABELS[c]}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted">Reservation class</p>
        </FieldShell>
        <SearchButton label="Search Trains" className="lg:h-[4.25rem]" />
      </div>
      <QuickDates onPick={(d) => setValue('date', d, { shouldValidate: formState.isSubmitted })} />
    </form>
  );
}
