import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { hotelPriceBreakdown } from '@zproo/catalog';
import type { HotelRoomType } from '@zproo/types';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  FormAlert,
  FormField,
  Input,
  Skeleton,
} from '@zproo/ui';
import {
  gstDetailsSchema,
  HOTEL_TITLES,
  leadGuestSchema,
  nightsBetween,
  serializeRooms,
  SPECIAL_REQUESTS_MAX,
  travelContactSchema,
  type LeadGuestInput,
} from '@zproo/validation';
import { ArrowRight, BedDouble } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm, useWatch, type FieldErrors } from 'react-hook-form';
import { Link, useNavigate } from 'react-router';
import { z } from 'zod';
import { invalidForm } from '@/features/auth/errors';
import { useAuthStore } from '@/features/auth/store';
import { CheckoutShell, NothingSelected } from '@/features/checkout/CheckoutShell';
import { ContactCard } from '@/features/checkout/ContactCard';
import { GstCard } from '@/features/checkout/GstCard';
import { PriceChangedDialog } from '@/features/checkout/PriceChangedDialog';
import { PriceSummary } from '@/features/checkout/PriceSummary';
import { SavedTravellerControls } from '@/features/checkout/SavedTravellerControls';
import { useSaveTravellers, useSavedTravellers } from '@/features/travellers/api';
import { SelectInput } from '@/features/checkout/SelectInput';
import { CHECKOUT_STEP } from '@/features/checkout/steps';
import { TITLE_LABEL } from '@/features/checkout/titles';
import { hotelKeys, hotelsApi, useHotelRooms } from '@/features/hotels/api';
import { useHotelDraft, type HotelSelection } from '@/features/hotels/draft';
import {
  boardLabel,
  guestsLabel,
  nightsLabel,
  occupancyLabel,
  stayRange,
} from '@/features/hotels/format';
import { userMessage } from '@/lib/apiErrors';
import { ApiClientError } from '@/services/http';

export default function HotelGuestsPage() {
  const selection = useHotelDraft((s) => s.selection);
  if (!selection) return <NothingSelected service="hotel" />;
  return <Guests selection={selection} />;
}

function Guests({ selection }: { selection: HotelSelection }) {
  const rooms = useHotelRooms(selection.hotelId, {
    checkIn: selection.checkIn,
    checkOut: selection.checkOut,
    rooms: serializeRooms(selection.rooms),
  });
  const nights = nightsBetween(selection.checkIn, selection.checkOut);
  const priced = selection.rooms.map((r) => {
    const rate = rooms.data?.roomTypes
      .find((t: HotelRoomType) => t.roomTypeId === r.roomTypeId)
      ?.rates.find((x) => x.rateId === r.rateId);
    return rate ? { price: rate.totalPrice, taxes: rate.taxes, boardBasis: rate.boardBasis } : null;
  });
  const ready = priced.every((p) => p !== null);
  return (
    <CheckoutShell
      step={CHECKOUT_STEP.hotel.travellers}
      service="hotel"
      title="Guest details"
      back={{ to: selection.detailsUrl, label: 'Change rooms' }}
      aside={
        rooms.isPending ? (
          <Skeleton className="h-64 rounded-[14px]" />
        ) : (
          <>
            {ready && (
              <PriceSummary
                price={hotelPriceBreakdown(priced as { price: number; taxes: number }[], nights)}
              />
            )}
            <Card>
              <CardContent className="space-y-2 p-4 text-sm">
                <p className="font-bold">{selection.hotelName}</p>
                <p className="text-muted">
                  {stayRange(selection.checkIn, selection.checkOut)} · {nightsLabel(nights)} ·{' '}
                  {guestsLabel(selection.rooms)}
                </p>
                <ol className="space-y-1">
                  {selection.rooms.map((r, i) => (
                    <li key={i}>
                      Room {i + 1}: {r.roomName}
                      {priced[i] ? ` · ${boardLabel(priced[i].boardBasis)}` : ''}
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          </>
        )
      }
    >
      {rooms.error ? (
        <EmptyState
          icon={BedDouble}
          title={userMessage(rooms.error)}
          actions={
            <Button asChild>
              <Link to={selection.detailsUrl}>Choose rooms again</Link>
            </Button>
          }
        />
      ) : (
        <GuestForm selection={selection} />
      )}
    </CheckoutShell>
  );
}

const schema = z.object({
  guests: z.array(leadGuestSchema),
  contact: travelContactSchema,
  specialRequests: z.string().max(SPECIAL_REQUESTS_MAX, `Up to ${SPECIAL_REQUESTS_MAX} characters`),
  gst: gstDetailsSchema.optional(),
});

function GuestForm({ selection }: { selection: HotelSelection }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const draft = useHotelDraft();
  const [priceChange, setPriceChange] = useState<{ oldTotal: number; newTotal: number } | null>(
    null,
  );
  const [withGst, setWithGst] = useState(Boolean(draft.gstDetails));

  // Restored after a deep-login round trip, else the signed-in user leads room 1.
  const [first = '', ...rest] = user?.fullName?.trim().split(/\s+/) ?? [];
  const defaults: LeadGuestInput[] =
    draft.guests && draft.guests.length === selection.rooms.length
      ? draft.guests
      : selection.rooms.map((_, i) => ({
          title: 'MR',
          firstName: i === 0 ? first : '',
          lastName: i === 0 ? rest.join(' ') : '',
        }));

  const form = useForm<z.input<typeof schema>, unknown, z.output<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      guests: defaults,
      contact: draft.contact ?? {
        email: user?.email ?? '',
        mobile: user?.phone?.replace(/^\+91/, '') ?? '',
      },
      specialRequests: draft.specialRequests,
      ...(draft.gstDetails ? { gst: draft.gstDetails } : {}),
    },
    mode: 'onTouched',
  });
  const { register, handleSubmit, formState, control, getValues, subscribe, setValue } = form;
  const savedTravellers = useSavedTravellers().data ?? [];
  const saveTravellers = useSaveTravellers();
  const [keep, setKeep] = useState<boolean[]>(() => selection.rooms.map(() => false));
  const pick = (i: number, t: (typeof savedTravellers)[number]) => {
    const opts = { shouldValidate: formState.isSubmitted, shouldDirty: true };
    if (t.title) setValue(`guests.${i}.title`, t.title, opts);
    setValue(`guests.${i}.firstName`, t.firstName, opts);
    setValue(`guests.${i}.lastName`, t.lastName, opts);
  };
  const errors = formState.errors as FieldErrors<z.output<typeof schema>>;
  const requests = useWatch({ control, name: 'specialRequests' }) ?? '';

  // Keep what was typed in the tab's draft, so a session expiry → login → back restores it.
  useEffect(() => {
    return subscribe({
      formState: { values: true },
      callback: ({ values }) => {
        const v = values as z.input<typeof schema>;
        draft.saveGuests(
          (v.guests ?? []) as LeadGuestInput[],
          (v.contact ?? { email: '', mobile: '' }) as { email: string; mobile: string },
          v.specialRequests ?? '',
          withGst && v.gst ? (v.gst as { gstin: string; companyName: string }) : null,
        );
      },
    });
  }, [subscribe, draft, withGst]);

  const book = useMutation({
    mutationFn: (input: { values: z.output<typeof schema>; expectedTotal: number; key: string }) =>
      hotelsApi.book(
        {
          hotelId: selection.hotelId,
          checkIn: selection.checkIn,
          checkOut: selection.checkOut,
          rooms: selection.rooms.map((r, i) => ({
            roomTypeId: r.roomTypeId,
            rateId: r.rateId,
            adults: r.adults,
            childAges: r.childAges,
            leadGuest: input.values.guests[i] as LeadGuestInput,
          })),
          contact: input.values.contact,
          ...(input.values.specialRequests.trim()
            ? { specialRequests: input.values.specialRequests.trim() }
            : {}),
          ...(withGst && input.values.gst ? { gstDetails: input.values.gst } : {}),
          expectedTotal: input.expectedTotal,
        },
        input.key,
      ),
    onSuccess: (result, input) => {
      // "Save traveller for next time": kept once the rooms are held.
      saveTravellers(
        input.values.guests
          .filter((_, i) => keep[i])
          .map((g) => ({ title: g.title, firstName: g.firstName, lastName: g.lastName })),
      );
      useHotelDraft.getState().setReference(result.bookingRef);
      void navigate(`/hotels/review?ref=${encodeURIComponent(result.bookingRef)}`);
    },
    onError: (err) => {
      if (
        err instanceof ApiClientError &&
        err.errorCode === 'PRICE_CHANGED' &&
        err.details.newTotal !== undefined
      )
        setPriceChange({
          oldTotal: err.details.oldTotal ?? selection.expectedTotal,
          newTotal: err.details.newTotal,
        });
      // A room sold out: the live room list is fetched again when the customer goes back.
      if (err instanceof ApiClientError && err.errorCode === 'ROOM_UNAVAILABLE')
        void queryClient.invalidateQueries({ queryKey: hotelKeys.roomsOf(selection.hotelId) });
    },
  });

  const onSubmit = handleSubmit((values) => {
    if (book.isPending) return;
    const gst = withGst && values.gst ? values.gst : null;
    const changed =
      JSON.stringify(values.guests) !== JSON.stringify(draft.guests) ||
      JSON.stringify(values.contact) !== JSON.stringify(draft.contact) ||
      values.specialRequests !== draft.specialRequests ||
      JSON.stringify(gst) !== JSON.stringify(draft.gstDetails) ||
      draft.reference !== null;
    if (changed) draft.setGuests(values.guests, values.contact, values.specialRequests, gst);
    book.mutate({
      values,
      expectedTotal: selection.expectedTotal,
      key: useHotelDraft.getState().idempotencyKey,
    });
  }, invalidForm);

  const otherError =
    book.error instanceof ApiClientError && book.error.errorCode === 'PRICE_CHANGED'
      ? null
      : book.error;
  const soldOut =
    book.error instanceof ApiClientError && book.error.errorCode === 'ROOM_UNAVAILABLE';

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6">
      <p className="text-sm text-muted">
        The lead guest must be 18 or older and carry a valid photo ID at check-in.
      </p>
      {otherError && (
        <div role="alert" className="space-y-3" data-testid="hotel-book-error">
          <FormAlert>{userMessage(otherError)}</FormAlert>
          {soldOut && (
            <Button asChild variant="outline" data-testid="hotel-choose-another">
              <Link to={selection.detailsUrl}>Choose another room</Link>
            </Button>
          )}
        </div>
      )}
      {selection.rooms.map((room, i) => {
        const e = errors.guests?.[i];
        const prefix = `checkout-traveller-${i}`;
        return (
          <Card key={i}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">
                Room {i + 1}: {room.roomName}
                <span className="ml-2 text-xs font-normal text-muted">{occupancyLabel(room)}</span>
              </CardTitle>
              <p className="text-sm text-muted">Lead guest</p>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-[8rem_1fr_1fr]">
              <SavedTravellerControls
                index={i}
                saved={savedTravellers}
                onPick={(st) => pick(i, st)}
                keep={keep[i] ?? false}
                onKeepChange={(on) => setKeep((k) => k.map((v, j) => (j === i ? on : v)))}
              />
              <FormField label="Title" name={`guest-${i}-title`} error={e?.title?.message}>
                <SelectInput data-testid={`${prefix}-title`} {...register(`guests.${i}.title`)}>
                  {HOTEL_TITLES.map((title) => (
                    <option key={title} value={title}>
                      {TITLE_LABEL[title]}
                    </option>
                  ))}
                </SelectInput>
              </FormField>
              <FormField
                label="First & middle name"
                name={`guest-${i}-firstName`}
                error={e?.firstName?.message}
              >
                <Input
                  autoComplete={i === 0 ? 'given-name' : 'off'}
                  data-testid={`${prefix}-first-name`}
                  {...register(`guests.${i}.firstName`)}
                />
              </FormField>
              <FormField
                label="Last name"
                name={`guest-${i}-lastName`}
                error={e?.lastName?.message}
              >
                <Input
                  autoComplete={i === 0 ? 'family-name' : 'off'}
                  data-testid={`${prefix}-last-name`}
                  {...register(`guests.${i}.lastName`)}
                />
              </FormField>
            </CardContent>
          </Card>
        );
      })}

      <ContactCard
        email={register('contact.email')}
        mobile={register('contact.mobile')}
        note="We send the voucher and booking updates here."
        errors={{ email: errors.contact?.email?.message, mobile: errors.contact?.mobile?.message }}
      />

      <Card>
        <CardContent className="p-4 sm:p-5">
          <FormField
            label="Special requests (optional)"
            name="specialRequests"
            error={errors.specialRequests?.message}
          >
            <textarea
              rows={3}
              maxLength={SPECIAL_REQUESTS_MAX}
              data-testid="checkout-special-requests"
              placeholder="Late check-in, high floor, quiet room…"
              className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
              {...register('specialRequests')}
            />
          </FormField>
          <p className="mt-1 flex justify-between text-xs text-muted">
            <span>Special requests can't be guaranteed.</span>
            <span aria-live="polite" className="tabular-nums">
              {requests.length}/{SPECIAL_REQUESTS_MAX}
            </span>
          </p>
        </CardContent>
      </Card>

      <GstCard
        enabled={withGst}
        onToggle={(on) => {
          setWithGst(on);
          if (!on) form.setValue('gst', undefined);
        }}
        register={(field) => register(`gst.${field}`)}
        errors={{
          gstin: errors.gst?.gstin?.message,
          companyName: errors.gst?.companyName?.message,
        }}
      />

      <div className="flex justify-end">
        <Button
          type="submit"
          size="lg"
          data-testid="checkout-travellers-continue"
          disabled={book.isPending}
        >
          {book.isPending ? 'Holding your rooms...' : 'Continue to review'}
          {!book.isPending && <ArrowRight aria-hidden />}
        </Button>
      </div>

      <PriceChangedDialog
        change={priceChange}
        pending={book.isPending}
        onContinue={() => {
          if (!priceChange) return;
          // A new idempotency key and the server's total.
          draft.acceptPrice(priceChange.newTotal);
          const values = getValues() as z.output<typeof schema>;
          setPriceChange(null);
          book.mutate({
            values,
            expectedTotal: priceChange.newTotal,
            key: useHotelDraft.getState().idempotencyKey,
          });
        }}
        onBack={() => {
          setPriceChange(null);
          void navigate(selection.detailsUrl);
        }}
      />
    </form>
  );
}
