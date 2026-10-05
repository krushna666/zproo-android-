import { addDays, hotelSearchSchema, todayIso } from '@zproo/validation';
import { BedDouble, CalendarDays, MapPin } from 'lucide-react';
import { Controller, useWatch } from 'react-hook-form';
import { DateField } from '../components/DateField';
import { PlaceCombobox } from '../components/PlaceCombobox';
import { PopoverField } from '../components/PopoverField';
import { SearchButton } from '../components/SearchButton';
import { Stepper } from '../components/Stepper';
import { CITY_OPTIONS } from '../components/options';
import { hotelsUrl } from '../url';
import { useSearchForm } from '../useSearchForm';

export function HotelSearchForm() {
  const today = todayIso();
  const { form, onSubmit } = useSearchForm(
    hotelSearchSchema,
    {
      city: 'goa',
      checkIn: addDays(today, 7),
      checkOut: addDays(today, 9),
      rooms: 1,
      adults: 2,
      children: 0,
    },
    hotelsUrl,
  );
  const { control, setValue, getValues, formState } = form;
  const errors = formState.errors;
  const [rooms, adults, children, checkIn] = useWatch({
    control,
    name: ['rooms', 'adults', 'children', 'checkIn'],
  }) as [number, number, number, string];
  const set = (name: 'rooms' | 'adults' | 'children', v: number) =>
    setValue(name, v, { shouldValidate: formState.isSubmitted });
  const guests = adults + children;

  return (
    <form onSubmit={onSubmit} noValidate aria-label="Search hotels" className="space-y-4">
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_minmax(0,1fr)_minmax(0,0.8fr)] lg:items-start">
        <Controller
          control={control}
          name="city"
          render={({ field }) => (
            <PlaceCombobox
              label="City, area or property"
              value={field.value}
              onChange={field.onChange}
              options={CITY_OPTIONS}
              placeholder="Where to?"
              icon={<MapPin aria-hidden />}
              error={errors.city?.message}
            />
          )}
        />
        <Controller
          control={control}
          name="checkIn"
          render={({ field }) => (
            <DateField
              label="Check-in"
              value={field.value}
              onChange={(v) => {
                field.onChange(v);
                // Keep check-out after check-in so the stay stays valid.
                if (v && getValues('checkOut') <= v) setValue('checkOut', addDays(v, 1));
              }}
              min={today}
              max={addDays(today, 365)}
              icon={<CalendarDays aria-hidden />}
              error={errors.checkIn?.message}
            />
          )}
        />
        <Controller
          control={control}
          name="checkOut"
          render={({ field }) => (
            <DateField
              label="Check-out"
              value={field.value}
              onChange={field.onChange}
              min={checkIn ? addDays(checkIn, 1) : today}
              max={addDays(today, 395)}
              icon={<CalendarDays aria-hidden />}
              error={errors.checkOut?.message}
            />
          )}
        />
        <PopoverField
          label="Rooms & Guests"
          summary={`${guests} Guest${guests === 1 ? '' : 's'}`}
          detail={`${rooms} room${rooms === 1 ? '' : 's'} · ${adults} adult${adults === 1 ? '' : 's'}${children ? ` · ${children} child${children === 1 ? '' : 'ren'}` : ''}`}
          icon={<BedDouble aria-hidden />}
          error={errors.rooms?.message ?? errors.adults?.message}
        >
          <Stepper
            label="Rooms"
            hint="Up to 4 guests each"
            value={rooms}
            min={1}
            max={8}
            onChange={(v) => set('rooms', v)}
          />
          <Stepper
            label="Adults"
            hint="13+ years"
            value={adults}
            min={1}
            max={24}
            onChange={(v) => set('adults', v)}
          />
          <Stepper
            label="Children"
            hint="0–12 years"
            value={children}
            min={0}
            max={12}
            onChange={(v) => set('children', v)}
          />
        </PopoverField>
        <SearchButton label="Search Hotels" className="lg:h-[4.25rem]" />
      </div>
    </form>
  );
}
