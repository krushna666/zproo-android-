import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  FormAlert,
  FormField,
  Input,
  Skeleton,
  toast,
} from '@zproo/ui';
import {
  ageOn,
  BUS_MESSAGES,
  busTravellerSchema,
  splitFullName,
  todayInIst,
  travelContactSchema,
  type BusTravellerInput,
  type TravelContact,
} from '@zproo/validation';
import { ArrowRight, Venus } from 'lucide-react';
import { useState } from 'react';
import { useForm, useWatch, type FieldErrors } from 'react-hook-form';
import { useNavigate } from 'react-router';
import { z } from 'zod';
import { invalidForm } from '@/features/auth/errors';
import { useAuthStore } from '@/features/auth/store';
import { busesApi, useBusTrip } from '@/features/buses/api';
import { BusTripSummary } from '@/features/buses/components/BusTripSummary';
import { useBusDraft, type BusSelection } from '@/features/buses/draft';
import { busPriceBreakdown } from '@/features/buses/price';
import { CheckoutShell, NothingSelected } from '@/features/checkout/CheckoutShell';
import { ContactCard, GenderControl } from '@/features/checkout/ContactCard';
import { PriceChangedDialog } from '@/features/checkout/PriceChangedDialog';
import { PriceSummary } from '@/features/checkout/PriceSummary';
import { SavedTravellerControls } from '@/features/checkout/SavedTravellerControls';
import { travellerName, useSaveTravellers, useSavedTravellers } from '@/features/travellers/api';
import { userMessage } from '@/lib/apiErrors';
import { ApiClientError } from '@/services/http';

export default function BusTravellersPage() {
  const selection = useBusDraft((s) => s.selection);
  if (!selection) return <NothingSelected service="bus" />;
  return <Travellers selection={selection} />;
}

function Travellers({ selection }: { selection: BusSelection }) {
  const { data: trip, isPending, error, refetch } = useBusTrip(selection.tripId);
  return (
    <CheckoutShell
      step={2}
      service="bus"
      title="Traveller details"
      back={{ to: selection.seatsUrl, label: 'Change seats' }}
      aside={
        trip ? (
          <>
            <PriceSummary price={busPriceBreakdown(selection.seats, trip.busType.ac)} />
            <BusTripSummary
              trip={trip}
              boarding={trip.boardingPoints.find((p) => p.id === selection.boardingPointId)}
              dropping={trip.droppingPoints.find((p) => p.id === selection.droppingPointId)}
              seats={selection.seats.map((s) => s.seatNo)}
            />
          </>
        ) : (
          <Skeleton className="h-64 rounded-[14px]" />
        )
      }
    >
      {error ? (
        <div role="alert" className="space-y-3">
          <FormAlert>{userMessage(error)}</FormAlert>
          <Button variant="outline" onClick={() => void refetch()}>
            Retry
          </Button>
        </div>
      ) : isPending || !trip ? (
        <Skeleton className="h-96 rounded-[14px]" />
      ) : (
        <TravellerForm selection={selection} />
      )}
    </CheckoutShell>
  );
}

function TravellerForm({ selection }: { selection: BusSelection }) {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const draft = useBusDraft();
  const [priceChange, setPriceChange] = useState<{ oldTotal: number; newTotal: number } | null>(
    null,
  );
  const ladies = new Set(selection.seats.filter((s) => s.ladiesOnly).map((s) => s.seatNo));

  const schema = z
    .object({ travellers: z.array(busTravellerSchema), contact: travelContactSchema })
    .superRefine((v, ctx) =>
      v.travellers.forEach((t, i) => {
        if (ladies.has(t.seatNo) && t.gender !== 'FEMALE')
          ctx.addIssue({
            code: 'custom',
            path: ['travellers', i, 'gender'],
            message: BUS_MESSAGES.ladiesSeat,
          });
      }),
    );

  const saved = new Map(draft.travellers?.map((t) => [t.seatNo, t]) ?? []);
  const defaults = selection.seats.map(
    (seat, i) =>
      saved.get(seat.seatNo) ?? {
        seatNo: seat.seatNo,
        name: i === 0 ? (user?.fullName ?? '') : '',
        age: '' as unknown as number,
        gender: seat.ladiesOnly ? ('FEMALE' as const) : ('MALE' as const),
      },
  );

  const form = useForm<z.input<typeof schema>, unknown, z.output<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      travellers: defaults,
      contact: draft.contact ?? {
        email: user?.email ?? '',
        mobile: user?.phone?.replace(/^\+91/, '') ?? '',
      },
    },
    mode: 'onTouched',
  });
  const { register, handleSubmit, formState, control, setValue } = form;
  const errors = formState.errors as FieldErrors<z.output<typeof schema>>;
  const genders = useWatch({ control, name: 'travellers' });
  const savedTravellers = useSavedTravellers().data ?? [];
  const saveTravellers = useSaveTravellers();
  const [keep, setKeep] = useState<boolean[]>(() => defaults.map(() => false));
  const pick = (i: number, t: (typeof savedTravellers)[number]) => {
    const opts = { shouldValidate: formState.isSubmitted, shouldDirty: true };
    setValue(`travellers.${i}.name`, travellerName(t), opts);
    if (t.dob) setValue(`travellers.${i}.age`, ageOn(t.dob, todayInIst()), opts);
    if (t.gender) setValue(`travellers.${i}.gender`, t.gender, opts);
  };

  const book = useMutation({
    mutationFn: (input: {
      travellers: BusTravellerInput[];
      contact: TravelContact;
      expectedTotal: number;
      key: string;
    }) =>
      busesApi.book(
        {
          tripId: selection.tripId,
          seats: selection.seats.map((s) => s.seatNo),
          boardingPointId: selection.boardingPointId,
          droppingPointId: selection.droppingPointId,
          travellers: input.travellers,
          contact: input.contact,
          expectedTotal: input.expectedTotal,
        },
        input.key,
      ),
    onSuccess: (result, input) => {
      // "Save traveller for next time": kept once the seats are held.
      saveTravellers(
        input.travellers
          .filter((_, i) => keep[i])
          .map((t) => ({ ...splitFullName(t.name), gender: t.gender })),
      );
      useBusDraft.getState().setReference(result.bookingRef);
      void navigate(`/buses/review?ref=${encodeURIComponent(result.bookingRef)}`);
    },
    onError: (err) => {
      if (!(err instanceof ApiClientError)) return;
      if (err.errorCode === 'PRICE_CHANGED' && err.details.newTotal !== undefined) {
        setPriceChange({
          oldTotal: err.details.oldTotal ?? selection.expectedTotal,
          newTotal: err.details.newTotal,
        });
      } else if (err.errorCode === 'SEAT_UNAVAILABLE') {
        // Back to the seat map, which refreshes and drops the taken seats with the same message.
        toast.error(userMessage(err));
        void navigate(selection.seatsUrl);
      }
    },
  });

  const submit = (values: z.output<typeof schema>, expectedTotal: number, key: string) =>
    book.mutate({ travellers: values.travellers, contact: values.contact, expectedTotal, key });

  const onSubmit = handleSubmit((values) => {
    if (book.isPending) return;
    // Remember what was typed; a new idempotency key only when the travellers changed.
    const unchanged =
      JSON.stringify(values.travellers) === JSON.stringify(draft.travellers) &&
      JSON.stringify(values.contact) === JSON.stringify(draft.contact);
    if (!unchanged) draft.setTravellers(values.travellers, values.contact);
    const state = useBusDraft.getState();
    submit(values, selection.expectedTotal, state.idempotencyKey);
  }, invalidForm);

  const continueAtNewPrice = () => {
    if (!priceChange) return;
    // A new key and the server's total (SOP edge case 2).
    draft.acceptPrice(priceChange.newTotal);
    const state = useBusDraft.getState();
    const values = form.getValues() as z.output<typeof schema>;
    setPriceChange(null);
    submit(values, priceChange.newTotal, state.idempotencyKey);
  };

  const otherError =
    book.error instanceof ApiClientError &&
    ['PRICE_CHANGED', 'SEAT_UNAVAILABLE'].includes(book.error.errorCode)
      ? null
      : book.error;

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6">
      <p className="text-sm text-muted">One traveller per seat.</p>
      {otherError && <FormAlert>{userMessage(otherError)}</FormAlert>}
      {defaults.map((t, i) => {
        const e = errors.travellers?.[i];
        const prefix = `checkout-traveller-${i}`;
        return (
          <Card key={t.seatNo}>
            <CardHeader className="pb-3">
              <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                Traveller {i + 1} · Seat {t.seatNo}
                {ladies.has(t.seatNo) && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary-light px-2 py-0.5 text-xs font-semibold text-primary">
                    <Venus aria-hidden className="size-3" /> Reserved for women
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-[2fr_1fr]">
              <SavedTravellerControls
                index={i}
                saved={savedTravellers}
                onPick={(t) => pick(i, t)}
                keep={keep[i] ?? false}
                onKeepChange={(on) => setKeep((k) => k.map((v, j) => (j === i ? on : v)))}
              />
              <FormField
                label="Full name"
                name={`traveller-${i}-name`}
                error={e?.name?.message}
                hint="As on your ID — used for tickets"
              >
                <Input
                  autoComplete={i === 0 ? 'name' : 'off'}
                  data-testid={`${prefix}-name`}
                  {...register(`travellers.${i}.name`)}
                />
              </FormField>
              <FormField label="Age" name={`traveller-${i}-age`} error={e?.age?.message}>
                <Input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={120}
                  data-testid={`${prefix}-age`}
                  {...register(`travellers.${i}.age`)}
                />
              </FormField>
              <div className="sm:col-span-2">
                <GenderControl
                  name={`travellers.${i}.gender`}
                  value={genders?.[i]?.gender}
                  register={register(`travellers.${i}.gender`)}
                  testIdPrefix={prefix}
                  error={e?.gender?.message}
                />
              </div>
            </CardContent>
          </Card>
        );
      })}

      <ContactCard
        email={register('contact.email')}
        mobile={register('contact.mobile')}
        errors={{ email: errors.contact?.email?.message, mobile: errors.contact?.mobile?.message }}
        note="We send the ticket and bus updates here."
      />

      <div className="flex justify-end">
        <Button
          type="submit"
          size="lg"
          data-testid="checkout-travellers-continue"
          disabled={book.isPending}
        >
          {book.isPending ? 'Holding your seats...' : 'Continue to review'}
          {!book.isPending && <ArrowRight aria-hidden />}
        </Button>
      </div>

      <PriceChangedDialog
        change={priceChange}
        pending={book.isPending}
        onContinue={continueAtNewPrice}
        onBack={() => {
          setPriceChange(null);
          void navigate(selection.seatsUrl);
        }}
      />
    </form>
  );
}
