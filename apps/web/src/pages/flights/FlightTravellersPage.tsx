import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import type { FlightOfferDetails, PassengerType } from '@zproo/types';
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
  toast,
} from '@zproo/ui';
import { flightPriceBreakdown } from '@zproo/utils';
import {
  flightAgeIssues,
  flightTravellerSchema,
  gstDetailsSchema,
  infantLinkIssues,
  PASSENGER_TITLES,
  todayInIst,
  travelContactSchema,
  type FlightTravellerInput,
} from '@zproo/validation';
import { ArrowRight, PlaneTakeoff } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm, useWatch, type FieldErrors } from 'react-hook-form';
import { Link, useNavigate } from 'react-router';
import { z } from 'zod';
import { invalidForm } from '@/features/auth/errors';
import { useAuthStore } from '@/features/auth/store';
import { CheckoutShell, NothingSelected } from '@/features/checkout/CheckoutShell';
import { ContactCard, GenderControl } from '@/features/checkout/ContactCard';
import { GstCard } from '@/features/checkout/GstCard';
import { SelectInput } from '@/features/checkout/SelectInput';
import { PriceChangedDialog } from '@/features/checkout/PriceChangedDialog';
import { PriceSummary } from '@/features/checkout/PriceSummary';
import { flightsApi, useFlightOffer } from '@/features/flights/api';
import { ItinerarySummary } from '@/features/flights/components/ItinerarySummary';
import { useFlightDraft, type FlightSelection } from '@/features/flights/draft';
import { localDateOf } from '@/features/flights/format';
import { userMessage } from '@/lib/apiErrors';
import { ApiClientError } from '@/services/http';
import { TITLE_LABEL } from '@/features/checkout/titles';

const TYPE_LABEL: Record<PassengerType, string> = {
  ADULT: 'Adult',
  CHILD: 'Child',
  INFANT: 'Infant',
};

export default function FlightTravellersPage() {
  const selection = useFlightDraft((s) => s.selection);
  if (!selection) return <NothingSelected service="flight" />;
  return <Travellers selection={selection} />;
}

function Travellers({ selection }: { selection: FlightSelection }) {
  const outbound = useFlightOffer(selection.offerId);
  const inbound = useFlightOffer(selection.returnOfferId);
  const error = outbound.error ?? inbound.error;
  const fare = outbound.data?.fareFamilies.find((f) => f.fareId === selection.fareId);
  const returnFare = inbound.data?.fareFamilies.find((f) => f.fareId === selection.returnFareId);
  const ready = outbound.data && fare && (!selection.returnOfferId || (inbound.data && returnFare));
  const legs = ready
    ? [
        { sequence: 1, offer: outbound.data as FlightOfferDetails, fare },
        ...(inbound.data && returnFare
          ? [{ sequence: 2, offer: inbound.data, fare: returnFare }]
          : []),
      ]
    : [];
  return (
    <CheckoutShell
      step={1}
      service="flight"
      title="Traveller details"
      back={{ to: selection.offerUrl, label: 'Change fare' }}
      aside={
        ready ? (
          <>
            <PriceSummary
              price={flightPriceBreakdown(
                legs.map((l) => l.fare),
                selection.pax,
              )}
            />
            <ItinerarySummary legs={legs} />
          </>
        ) : (
          <Skeleton className="h-64 rounded-[14px]" />
        )
      }
    >
      {error ? (
        <EmptyState
          icon={PlaneTakeoff}
          title={userMessage(error)}
          actions={
            <Button asChild>
              <Link to="/flights">Search again</Link>
            </Button>
          }
        />
      ) : !ready ? (
        <Skeleton className="h-96 rounded-[14px]" />
      ) : (
        <TravellerForm
          selection={selection}
          travelDate={localDateOf(
            (outbound.data as FlightOfferDetails).slices[0]?.segments[0]?.departure ?? '',
          )}
        />
      )}
    </CheckoutShell>
  );
}

function blankTravellers(pax: FlightSelection['pax']): FlightTravellerInput[] {
  const make = (type: PassengerType, n: number) =>
    Array.from({ length: n }, () => ({
      type,
      title: (type === 'ADULT' ? 'MR' : 'MSTR') as FlightTravellerInput['title'],
      firstName: '',
      lastName: '',
      gender: 'MALE' as const,
    }));
  const adults = make('ADULT', pax.adults);
  const children = make('CHILD', pax.children);
  const infants = make('INFANT', pax.infants).map((t, i) => ({ ...t, infantOfIndex: i }));
  return [...adults, ...children, ...infants];
}

function TravellerForm({
  selection,
  travelDate,
}: {
  selection: FlightSelection;
  travelDate: string;
}) {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const draft = useFlightDraft();
  const [priceChange, setPriceChange] = useState<{ oldTotal: number; newTotal: number } | null>(
    null,
  );
  const [withGst, setWithGst] = useState(Boolean(draft.gstDetails));

  const schema = z
    .object({
      travellers: z.array(flightTravellerSchema),
      contact: travelContactSchema,
      gst: gstDetailsSchema.optional(),
    })
    .superRefine((v, ctx) => {
      for (const issue of flightAgeIssues(v.travellers, travelDate, todayInIst()))
        ctx.addIssue({
          code: 'custom',
          path: ['travellers', issue.index, 'dob'],
          message: issue.message,
        });
      for (const issue of infantLinkIssues(v.travellers))
        ctx.addIssue({
          code: 'custom',
          path: ['travellers', issue.index, 'infantOfIndex'],
          message: issue.message,
        });
    });

  // Restored after a deep-login round trip (sessionStorage), else blank cards per passenger.
  const restored =
    draft.travellers && draft.travellers.length === blankTravellers(selection.pax).length
      ? draft.travellers
      : null;
  // A fresh form starts with the signed-in user as the first traveller.
  const [first = '', ...rest] = user?.fullName?.trim().split(/\s+/) ?? [];
  const defaults =
    restored ??
    blankTravellers(selection.pax).map((t, i) =>
      i === 0 && first ? { ...t, firstName: first, lastName: rest.join(' ') } : t,
    );

  const form = useForm<z.input<typeof schema>, unknown, z.output<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      travellers: defaults,
      contact: draft.contact ?? {
        email: user?.email ?? '',
        mobile: user?.phone?.replace(/^\+91/, '') ?? '',
      },
      ...(draft.gstDetails ? { gst: draft.gstDetails } : {}),
    },
    mode: 'onTouched',
  });
  const { register, handleSubmit, formState, control, getValues, subscribe } = form;
  const errors = formState.errors as FieldErrors<z.output<typeof schema>>;
  const watched = useWatch({ control, name: 'travellers' });

  // Keep what was typed in the tab's draft, so a session expiry → login → back restores it.
  useEffect(() => {
    return subscribe({
      formState: { values: true },
      callback: ({ values }) => {
        const v = values as z.input<typeof schema>;
        draft.saveTravellers(
          (v.travellers ?? []) as FlightTravellerInput[],
          (v.contact ?? { email: '', mobile: '' }) as { email: string; mobile: string },
          withGst && v.gst ? (v.gst as { gstin: string; companyName: string }) : null,
        );
      },
    });
  }, [subscribe, draft, withGst]);

  const book = useMutation({
    mutationFn: (input: { values: z.output<typeof schema>; expectedTotal: number; key: string }) =>
      flightsApi.book(
        {
          offerId: selection.offerId,
          fareId: selection.fareId,
          ...(selection.returnOfferId && selection.returnFareId
            ? { returnOfferId: selection.returnOfferId, returnFareId: selection.returnFareId }
            : {}),
          travellers: input.values.travellers,
          contact: input.values.contact,
          ...(withGst && input.values.gst ? { gstDetails: input.values.gst } : {}),
          expectedTotal: input.expectedTotal,
        },
        input.key,
      ),
    onSuccess: (result) => {
      useFlightDraft.getState().setReference(result.bookingRef);
      void navigate(`/flights/review?ref=${encodeURIComponent(result.bookingRef)}`);
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
      else if (err instanceof ApiClientError && err.errorCode === 'FARE_UNAVAILABLE')
        toast.error(userMessage(err));
    },
  });

  const onSubmit = handleSubmit((values) => {
    if (book.isPending) return;
    const gst = withGst && values.gst ? values.gst : null;
    const changed =
      JSON.stringify(values.travellers) !== JSON.stringify(draft.travellers) ||
      JSON.stringify(values.contact) !== JSON.stringify(draft.contact) ||
      JSON.stringify(gst) !== JSON.stringify(draft.gstDetails) ||
      draft.reference !== null;
    if (changed) draft.setTravellers(values.travellers, values.contact, gst);
    book.mutate({
      values,
      expectedTotal: selection.expectedTotal,
      key: useFlightDraft.getState().idempotencyKey,
    });
  }, invalidForm);

  const otherError =
    book.error instanceof ApiClientError && book.error.errorCode === 'PRICE_CHANGED'
      ? null
      : book.error;
  const adults = (watched ?? []).map((t, i) => ({ t, i })).filter(({ t }) => t?.type === 'ADULT');

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6">
      <p className="text-sm text-muted">
        Enter names exactly as on the government ID you'll carry.
      </p>
      {otherError && (
        <div role="alert" className="space-y-3">
          <FormAlert>{userMessage(otherError)}</FormAlert>
          {otherError instanceof ApiClientError && otherError.errorCode === 'FARE_UNAVAILABLE' && (
            <Button asChild variant="outline">
              <Link to="/flights">Search again</Link>
            </Button>
          )}
        </div>
      )}
      {defaults.map((t, i) => {
        const e = errors.travellers?.[i];
        const prefix = `checkout-traveller-${i}`;
        const typeIndex = defaults.slice(0, i).filter((x) => x.type === t.type).length + 1;
        return (
          <Card key={i}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">
                {TYPE_LABEL[t.type]} {typeIndex}
                <span className="ml-2 text-xs font-normal text-muted">
                  {t.type === 'ADULT' ? '12+ yrs' : t.type === 'CHILD' ? '2–11 yrs' : 'Under 2 yrs'}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-[8rem_1fr_1fr]">
              <FormField label="Title" name={`traveller-${i}-title`} error={e?.title?.message}>
                <SelectInput data-testid={`${prefix}-title`} {...register(`travellers.${i}.title`)}>
                  {PASSENGER_TITLES[t.type].map((title) => (
                    <option key={title} value={title}>
                      {TITLE_LABEL[title]}
                    </option>
                  ))}
                </SelectInput>
              </FormField>
              <FormField
                label="First & middle name"
                name={`traveller-${i}-firstName`}
                error={e?.firstName?.message}
              >
                <Input
                  autoComplete={i === 0 ? 'given-name' : 'off'}
                  data-testid={`${prefix}-first-name`}
                  {...register(`travellers.${i}.firstName`)}
                />
              </FormField>
              <FormField
                label="Last name"
                name={`traveller-${i}-lastName`}
                error={e?.lastName?.message}
              >
                <Input
                  autoComplete={i === 0 ? 'family-name' : 'off'}
                  data-testid={`${prefix}-last-name`}
                  {...register(`travellers.${i}.lastName`)}
                />
              </FormField>
              <div className="sm:col-span-2">
                <GenderControl
                  name={`travellers.${i}.gender`}
                  value={watched?.[i]?.gender}
                  register={register(`travellers.${i}.gender`)}
                  testIdPrefix={prefix}
                  error={e?.gender?.message}
                />
              </div>
              <FormField
                label={t.type === 'ADULT' ? 'Date of birth (optional)' : 'Date of birth'}
                name={`traveller-${i}-dob`}
                error={e?.dob?.message}
              >
                <Input
                  type="date"
                  max={todayInIst()}
                  data-testid={`${prefix}-dob`}
                  {...register(`travellers.${i}.dob`, {
                    setValueAs: (v: string) => v || undefined,
                  })}
                />
              </FormField>
              {t.type === 'INFANT' && (
                <FormField
                  label="Travelling with"
                  name={`traveller-${i}-infantOfIndex`}
                  error={e?.infantOfIndex?.message}
                >
                  <SelectInput
                    data-testid={`${prefix}-infant-of`}
                    {...register(`travellers.${i}.infantOfIndex`, {
                      setValueAs: (v: string) => (v === '' ? undefined : Number(v)),
                    })}
                  >
                    {adults.map(({ t: a, i: index }) => (
                      <option key={index} value={index}>
                        {`${a?.firstName ?? ''} ${a?.lastName ?? ''}`.trim() ||
                          `Adult ${adults.findIndex((x) => x.i === index) + 1}`}
                      </option>
                    ))}
                  </SelectInput>
                </FormField>
              )}
            </CardContent>
          </Card>
        );
      })}

      <ContactCard
        email={register('contact.email')}
        mobile={register('contact.mobile')}
        errors={{ email: errors.contact?.email?.message, mobile: errors.contact?.mobile?.message }}
      />

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
          {book.isPending ? 'Holding your seats...' : 'Continue to review'}
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
            key: useFlightDraft.getState().idempotencyKey,
          });
        }}
        onBack={() => {
          setPriceChange(null);
          void navigate(selection.offerUrl);
        }}
      />
    </form>
  );
}
