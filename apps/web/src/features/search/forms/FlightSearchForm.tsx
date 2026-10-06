import { FLIGHT_AIRPORT_CODES } from '@zproo/catalog';
import { CABIN_CLASS_LABELS, CabinClass } from '@zproo/types';
import {
  addDays,
  FLIGHT_MAX_DAYS_AHEAD,
  flightSearchSchema,
  todayInIst,
  type FlightSearch,
} from '@zproo/validation';
import { cn } from '@zproo/ui';
import { CalendarDays, PlaneLanding, PlaneTakeoff, Users } from 'lucide-react';
import { useState } from 'react';
import { Controller, useWatch } from 'react-hook-form';
import { DateField } from '../components/DateField';
import { PlaceCombobox } from '../components/PlaceCombobox';
import { PopoverField } from '../components/PopoverField';
import { SearchButton } from '../components/SearchButton';
import { Stepper } from '../components/Stepper';
import { SwapButton } from '../components/SwapButton';
import { AIRPORT_OPTIONS } from '../components/options';
import { flightsUrl } from '../url';
import { useSearchForm } from '../useSearchForm';

/** Airports with flights, shown as "City (IATA)" with the airport name. */
const FLIGHT_AIRPORTS = AIRPORT_OPTIONS.filter((o) => FLIGHT_AIRPORT_CODES.has(o.value)).map(
  (o) => ({ ...o, label: `${o.label} (${o.value})` }),
);

type Trip = 'ONE_WAY' | 'ROUND_TRIP';
const CABIN_TESTID: Record<CabinClass, string> = {
  ECONOMY: 'economy',
  PREMIUM_ECONOMY: 'premium-economy',
  BUSINESS: 'business',
  FIRST: 'first',
};

/** `initial` pre-fills the form (the results page's "Modify" and invalid deep links). */
export function FlightSearchForm({ initial }: { initial?: Partial<FlightSearch> }) {
  const today = todayInIst();
  const [trip, setTrip] = useState<Trip>(initial?.returnDate ? 'ROUND_TRIP' : 'ONE_WAY');
  const { form, onSubmit } = useSearchForm(
    flightSearchSchema,
    {
      from: initial?.from ?? 'PNQ',
      to: initial?.to ?? 'DEL',
      date: initial?.date ?? addDays(today, 7),
      returnDate: initial?.returnDate ?? '',
      adults: initial?.adults ?? 1,
      children: initial?.children ?? 0,
      infants: initial?.infants ?? 0,
      cabin: initial?.cabin ?? 'ECONOMY',
    },
    flightsUrl,
  );
  const { control, setValue, getValues, formState, trigger } = form;
  const [adults, children, infants, cabin, date] = useWatch({
    control,
    name: ['adults', 'children', 'infants', 'cabin', 'date'],
  }) as [number, number, number, CabinClass, string];
  const errors = formState.errors;
  const travellers = adults + children + infants;
  const paxError = errors.children?.message ?? errors.infants?.message ?? errors.adults?.message;
  const maxDate = addDays(today, FLIGHT_MAX_DAYS_AHEAD);

  const setPax = (key: 'adults' | 'children' | 'infants', value: number) => {
    setValue(key, value);
    // Passenger rules are checked as soon as they change (inline errors in the panel).
    void trigger(['adults', 'children', 'infants']);
  };
  const chooseTrip = (next: Trip) => {
    setTrip(next);
    if (next === 'ONE_WAY') setValue('returnDate', '');
    else if (!getValues('returnDate')) setValue('returnDate', addDays(getValues('date'), 3));
  };

  return (
    <form onSubmit={onSubmit} noValidate aria-label="Search flights" className="space-y-4">
      <div role="radiogroup" aria-label="Trip type" className="flex flex-wrap gap-2">
        {(
          [
            ['ONE_WAY', 'One-way', 'flight-trip-oneway'],
            ['ROUND_TRIP', 'Round-trip', 'flight-trip-round'],
          ] as const
        ).map(([value, label, testId]) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={trip === value}
            data-testid={testId}
            onClick={() => chooseTrip(value)}
            className={cn(
              'min-h-11 rounded-full px-4 text-sm font-semibold transition-colors',
              trip === value
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'bg-background text-foreground/70 ring-1 ring-border hover:text-foreground',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1.15fr)_minmax(0,0.85fr)_minmax(0,0.85fr)_minmax(0,1fr)]">
        <div className="relative col-span-full grid gap-3 sm:grid-cols-2 lg:col-span-2">
          <Controller
            control={control}
            name="from"
            render={({ field }) => (
              <PlaceCombobox
                label="From"
                value={field.value}
                onChange={field.onChange}
                options={FLIGHT_AIRPORTS}
                placeholder="City or airport"
                icon={<PlaneTakeoff aria-hidden />}
                error={errors.from?.message}
                testId="flight-search-from"
              />
            )}
          />
          <SwapButton
            label="Swap airports"
            testId="flight-search-swap"
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
                options={FLIGHT_AIRPORTS}
                placeholder="City or airport"
                icon={<PlaneLanding aria-hidden />}
                error={errors.to?.message}
                testId="flight-search-to"
              />
            )}
          />
        </div>
        <Controller
          control={control}
          name="date"
          render={({ field }) => (
            <DateField
              label="Depart"
              value={field.value}
              onChange={field.onChange}
              min={today}
              max={maxDate}
              icon={<CalendarDays aria-hidden />}
              error={errors.date?.message}
              testId="flight-search-date"
            />
          )}
        />
        <Controller
          control={control}
          name="returnDate"
          render={({ field }) => (
            <DateField
              label="Return"
              value={field.value ?? ''}
              onChange={(v) => {
                field.onChange(v);
                if (v && trip === 'ONE_WAY') setTrip('ROUND_TRIP');
              }}
              min={date || today}
              max={maxDate}
              icon={<CalendarDays aria-hidden />}
              emptyHint="Add return"
              error={errors.returnDate?.message}
              testId="flight-search-return"
              disabled={trip === 'ONE_WAY'}
            />
          )}
        />
        <PopoverField
          label="Travellers & class"
          summary={`${travellers} Traveller${travellers === 1 ? '' : 's'}`}
          detail={CABIN_CLASS_LABELS[cabin]}
          icon={<Users aria-hidden />}
          error={paxError}
          testIds={{ open: 'flight-pax-open', done: 'flight-pax-done' }}
        >
          <Stepper
            label="Adults"
            hint="12+ yrs"
            value={adults}
            min={1}
            max={9}
            onChange={(v) => setPax('adults', v)}
            testIdPrefix="flight-pax-adults"
          />
          <Stepper
            label="Children"
            hint="2–11 yrs"
            value={children}
            min={0}
            max={8}
            onChange={(v) => setPax('children', v)}
            testIdPrefix="flight-pax-children"
          />
          <Stepper
            label="Infants"
            hint="Under 2 yrs, on lap"
            value={infants}
            min={0}
            max={4}
            onChange={(v) => setPax('infants', v)}
            testIdPrefix="flight-pax-infants"
          />
          {paxError && (
            <p
              role="alert"
              data-testid="field-error-pax"
              className="text-xs font-semibold text-danger"
            >
              {paxError}
            </p>
          )}
          <fieldset className="mt-2 border-t border-border pt-3">
            <legend className="mb-2 text-sm font-bold">Cabin class</legend>
            <div className="grid grid-cols-2 gap-2">
              {Object.values(CabinClass).map((c) => (
                <label
                  key={c}
                  className={cn(
                    'flex min-h-11 cursor-pointer items-center justify-center rounded-xl border px-3 py-2 text-center text-xs font-semibold transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring',
                    cabin === c
                      ? 'border-primary bg-primary-light text-primary'
                      : 'border-border hover:border-foreground/30',
                  )}
                >
                  <input
                    type="radio"
                    name="cabin"
                    value={c}
                    checked={cabin === c}
                    data-testid={`flight-cabin-${CABIN_TESTID[c]}`}
                    onChange={() => setValue('cabin', c)}
                    className="sr-only"
                  />
                  {CABIN_CLASS_LABELS[c]}
                </label>
              ))}
            </div>
          </fieldset>
        </PopoverField>
      </div>

      <SearchButton
        label="Search flights"
        className="lg:mx-auto lg:flex lg:w-72"
        testId="flight-search-submit"
      />
    </form>
  );
}
