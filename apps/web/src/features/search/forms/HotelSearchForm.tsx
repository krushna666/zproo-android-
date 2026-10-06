import { allHotelDestinations } from '@zproo/catalog';
import { cn } from '@zproo/ui';
import {
  addDays,
  DEFAULT_ROOMS,
  HOTEL_MAX_ADULTS_PER_ROOM,
  HOTEL_MAX_CHILD_AGE,
  HOTEL_MAX_CHILDREN_PER_ROOM,
  HOTEL_MAX_DAYS_AHEAD,
  HOTEL_MAX_NIGHTS,
  HOTEL_MAX_ROOMS,
  hotelSearchFormSchema,
  nightsBetween,
  todayInIst,
  type RoomInput,
} from '@zproo/validation';
import { BedDouble, Building2, CalendarDays, MapPin, Plus } from 'lucide-react';
import { Controller, useFieldArray, useWatch, type FieldErrors } from 'react-hook-form';
import { DateField } from '../components/DateField';
import { PlaceCombobox, type PlaceOption } from '../components/PlaceCombobox';
import { PopoverField } from '../components/PopoverField';
import { SearchButton } from '../components/SearchButton';
import { Stepper } from '../components/Stepper';
import { hotelsUrl } from '../url';
import { useSearchForm } from '../useSearchForm';
import { guestsLabel, nightsLabel } from '@/features/hotels/format';

const ICON = {
  CITY: <MapPin />,
  AREA: <Building2 />,
  HOTEL: <BedDouble />,
} as const;
const TYPE_LABEL = { CITY: 'City', AREA: 'Area', HOTEL: 'Hotel' } as const;

/** Every city, area and property; before typing, only cities and areas are listed. */
const ALL_OPTIONS: readonly PlaceOption[] = allHotelDestinations().map((d) => ({
  value: d.id,
  label: d.name,
  detail:
    d.type === 'CITY' ? `${TYPE_LABEL.CITY} · ${d.state}` : `${TYPE_LABEL[d.type]} · ${d.city}`,
  keywords: `${d.city} ${d.state}`,
  icon: ICON[d.type],
  group: d.city,
}));
const DESTINATIONS = ALL_OPTIONS.filter((o) => !o.value.startsWith('htl_'));

type FormRooms = RoomInput[];

/** `initial` pre-fills the form (the results page's "Modify" and invalid deep links). */
export function HotelSearchForm({
  initial,
}: {
  initial?: { destinationId?: string; checkIn?: string; checkOut?: string; rooms?: RoomInput[] };
}) {
  const today = todayInIst();
  const checkInDefault = initial?.checkIn ?? addDays(today, 7);
  const { form, onSubmit } = useSearchForm(
    hotelSearchFormSchema,
    {
      destinationId: initial?.destinationId ?? 'city_GOI',
      checkIn: checkInDefault,
      checkOut: initial?.checkOut ?? addDays(checkInDefault, 2),
      rooms: (initial?.rooms ?? DEFAULT_ROOMS).map((r) => ({ ...r, childAges: [...r.childAges] })),
    },
    (values) => hotelsUrl(values),
  );
  const { control, setValue, getValues, formState, trigger } = form;
  const errors = formState.errors;
  const rooms = useFieldArray({ control, name: 'rooms' });
  const [checkIn, checkOut, values] = useWatch({
    control,
    name: ['checkIn', 'checkOut', 'rooms'],
  }) as [string, string, FormRooms];
  const nights = checkIn && checkOut ? nightsBetween(checkIn, checkOut) : 0;
  const roomErrors = (errors.rooms ?? []) as FieldErrors<FormRooms>;
  const roomsError =
    (errors.rooms as { message?: string } | undefined)?.message ??
    (Array.isArray(errors.rooms)
      ? errors.rooms
          .flatMap((r: FieldErrors<RoomInput> | undefined) => [
            r?.adults?.message,
            r?.childAges?.message,
            ...(Array.isArray(r?.childAges)
              ? (r.childAges as ({ message?: string } | undefined)[]).map((a) => a?.message)
              : []),
          ])
          .find(Boolean)
      : undefined);
  const revalidate = () => {
    if (formState.isSubmitted) void trigger('rooms');
  };
  const setAdults = (i: number, v: number) => {
    setValue(`rooms.${i}.adults`, v);
    revalidate();
  };
  const setChildren = (i: number, n: number) => {
    const ages = getValues(`rooms.${i}.childAges`);
    setValue(
      `rooms.${i}.childAges`,
      n > ages.length ? [...ages, ...Array<null>(n - ages.length).fill(null)] : ages.slice(0, n),
    );
    revalidate();
  };

  return (
    <form onSubmit={onSubmit} noValidate aria-label="Search hotels" className="space-y-4">
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_minmax(0,1fr)_minmax(0,0.8fr)] lg:items-start">
        <Controller
          control={control}
          name="destinationId"
          render={({ field }) => (
            <PlaceCombobox
              label="City, area or property"
              value={field.value}
              onChange={field.onChange}
              options={ALL_OPTIONS}
              browseOptions={DESTINATIONS}
              placeholder="Where to?"
              icon={<MapPin aria-hidden />}
              error={errors.destinationId?.message}
              testId="hotel-search-destination"
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
              max={addDays(today, HOTEL_MAX_DAYS_AHEAD)}
              icon={<CalendarDays aria-hidden />}
              error={errors.checkIn?.message}
              testId="hotel-search-checkin"
            />
          )}
        />
        <div>
          <Controller
            control={control}
            name="checkOut"
            render={({ field }) => (
              <DateField
                label="Check-out"
                value={field.value}
                onChange={field.onChange}
                min={checkIn ? addDays(checkIn, 1) : today}
                max={addDays(checkIn || today, HOTEL_MAX_NIGHTS)}
                icon={<CalendarDays aria-hidden />}
                error={errors.checkOut?.message}
                testId="hotel-search-checkout"
              />
            )}
          />
          {nights > 0 && (
            <p
              className="mt-1 px-1 text-xs font-semibold text-muted"
              data-testid="hotel-nights"
              aria-live="polite"
            >
              {nightsLabel(nights)}
            </p>
          )}
        </div>
        <PopoverField
          label="Rooms & guests"
          summary={guestsLabel(values)}
          detail={`${values.reduce((s, r) => s + r.adults, 0)} adults${values.some((r) => r.childAges.length > 0) ? ` · ${values.reduce((s, r) => s + r.childAges.length, 0)} children` : ''}`}
          icon={<BedDouble aria-hidden />}
          error={roomsError}
          testIds={{ open: 'hotel-guests-open', done: 'hotel-guests-done' }}
        >
          <div className="space-y-3">
            {rooms.fields.map((field, i) => {
              const n = i + 1;
              const room = values[i] ?? { adults: 1, childAges: [] };
              const ageErrors = roomErrors[i]?.childAges as
                ({ message?: string } | undefined)[] | undefined;
              return (
                <fieldset key={field.id} className="rounded-xl border border-border p-3">
                  <div className="flex items-center justify-between">
                    <legend className="text-sm font-bold">Room {n}</legend>
                    {rooms.fields.length > 1 && (
                      <button
                        type="button"
                        className="min-h-11 px-2 text-sm font-semibold text-primary hover:underline"
                        data-testid={`hotel-room-${n}-remove`}
                        onClick={() => {
                          rooms.remove(i);
                          revalidate();
                        }}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  <Stepper
                    label="Adults"
                    hint="18+ years"
                    value={room.adults}
                    min={1}
                    max={HOTEL_MAX_ADULTS_PER_ROOM}
                    onChange={(v) => setAdults(i, v)}
                    testIdPrefix={`hotel-room-${n}-adults`}
                  />
                  <Stepper
                    label="Children"
                    hint="0–17 years"
                    value={room.childAges.length}
                    min={0}
                    max={HOTEL_MAX_CHILDREN_PER_ROOM}
                    onChange={(v) => setChildren(i, v)}
                    testIdPrefix={`hotel-room-${n}-children`}
                  />
                  {room.childAges.length > 0 && (
                    <div className="grid grid-cols-3 gap-2 pt-1">
                      {room.childAges.map((age, m) => {
                        const id = `room-${n}-child-${m + 1}-age`;
                        const invalid = Boolean(ageErrors?.[m]?.message);
                        return (
                          <label key={id} htmlFor={id} className="text-xs font-semibold">
                            Child {m + 1} age
                            <select
                              id={id}
                              data-testid={`hotel-room-${n}-child-${m + 1}-age`}
                              value={age ?? ''}
                              aria-invalid={invalid || undefined}
                              onChange={(e) => {
                                const ages = [...getValues(`rooms.${i}.childAges`)];
                                ages[m] = e.target.value === '' ? null : Number(e.target.value);
                                setValue(`rooms.${i}.childAges`, ages);
                                revalidate();
                              }}
                              className={cn(
                                'mt-1 h-11 w-full rounded-lg border bg-card px-2 text-sm',
                                invalid ? 'border-danger' : 'border-border',
                              )}
                            >
                              <option value="">Age</option>
                              {Array.from({ length: HOTEL_MAX_CHILD_AGE + 1 }, (_, a) => (
                                <option key={a} value={a}>
                                  {a === 0 ? 'Under 1' : `${a} yr${a === 1 ? '' : 's'}`}
                                </option>
                              ))}
                            </select>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </fieldset>
              );
            })}
          </div>
          {roomsError && (
            <p
              role="alert"
              data-testid="field-error-rooms"
              className="text-xs font-semibold text-danger"
            >
              {roomsError}
            </p>
          )}
          <button
            type="button"
            data-testid="hotel-add-room"
            disabled={rooms.fields.length >= HOTEL_MAX_ROOMS}
            onClick={() => rooms.append({ adults: 2, childAges: [] })}
            className="mt-2 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-primary hover:underline disabled:pointer-events-none disabled:opacity-40"
          >
            <Plus aria-hidden className="size-4" /> Add room
          </button>
        </PopoverField>
        <SearchButton
          label="Search hotels"
          className="lg:h-[4.25rem]"
          testId="hotel-search-submit"
        />
      </div>
    </form>
  );
}
