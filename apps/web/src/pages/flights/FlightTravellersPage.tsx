import { zodResolver } from '@hookform/resolvers/zod';
import type { FlightOffer, PaxCounts } from '@zproo/types';
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Skeleton } from '@zproo/ui';
import { flightPriceBreakdown } from '@zproo/utils';
import {
  contactSchema,
  passengerAgeIssues,
  passengerSchema,
  type PassengerInput,
} from '@zproo/validation';
import { ArrowRight } from 'lucide-react';
import type { ComponentProps } from 'react';
import { useForm, type FieldErrors } from 'react-hook-form';
import { useNavigate } from 'react-router';
import { z } from 'zod';
import { FormAlert } from '@/features/auth/components/FormAlert';
import { FormField } from '@/features/auth/components/FormField';
import { PhoneInput } from '@/features/auth/components/PhoneInput';
import { errorMessage } from '@/features/auth/errors';
import { useAuthStore } from '@/features/auth/store';
import { useItineraryOffers } from '@/features/flights/api';
import { CheckoutShell, NothingSelected } from '@/features/checkout/CheckoutShell';
import { ItinerarySummary } from '@/features/flights/components/ItinerarySummary';
import { PriceSummary } from '@/features/checkout/PriceSummary';
import { useFlightDraft, type Itinerary } from '@/features/flights/draft';
import { departureDate, travelDate as formatDate } from '@/features/flights/format';

const formSchema = z.object({ passengers: z.array(passengerSchema), contact: contactSchema });
type FormInput = z.input<typeof formSchema>;
type FormOutput = z.output<typeof formSchema>;

const TYPE_LABEL = { ADULT: 'Adult', CHILD: 'Child', INFANT: 'Infant' } as const;
const TITLE_OPTIONS = {
  ADULT: [
    ['MR', 'Mr'],
    ['MRS', 'Mrs'],
    ['MS', 'Ms'],
  ],
  CHILD: [
    ['MSTR', 'Master'],
    ['MISS', 'Miss'],
  ],
  INFANT: [
    ['MSTR', 'Master'],
    ['MISS', 'Miss'],
  ],
} as const;

function blankPassengers(pax: PaxCounts): PassengerInput[] {
  const make = (type: PassengerInput['type'], n: number) =>
    Array.from({ length: n }, () => ({
      type,
      title: type === 'ADULT' ? 'MR' : 'MSTR',
      firstName: '',
      lastName: '',
      gender: 'MALE',
    })) as PassengerInput[];
  return [
    ...make('ADULT', pax.adults),
    ...make('CHILD', pax.children),
    ...make('INFANT', pax.infants),
  ];
}

export default function FlightTravellersPage() {
  const itinerary = useFlightDraft((s) => s.itinerary);
  if (!itinerary) return <NothingSelected />;
  return <Travellers itinerary={itinerary} />;
}

function Travellers({ itinerary }: { itinerary: Itinerary }) {
  const { offers, isPending, error } = useItineraryOffers(itinerary.offerIds, itinerary.pax);
  const back = { to: itinerary.searchUrl, label: 'Change flight' };
  return (
    <CheckoutShell
      step={1}
      title="Traveller details"
      back={back}
      aside={
        offers ? (
          <>
            <PriceSummary price={flightPriceBreakdown(offers, itinerary.pax)} />
            <ItinerarySummary offers={offers} />
          </>
        ) : (
          <Skeleton className="h-64 rounded-2xl" />
        )
      }
    >
      {error ? (
        <FormAlert>{errorMessage(error)} Please choose another flight.</FormAlert>
      ) : isPending || !offers ? (
        <Skeleton className="h-96 rounded-2xl" />
      ) : (
        <TravellerForm itinerary={itinerary} offers={offers} />
      )}
    </CheckoutShell>
  );
}

function TravellerForm({ itinerary, offers }: { itinerary: Itinerary; offers: FlightOffer[] }) {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const draft = useFlightDraft();
  const saved = draft.passengers;
  const expected = blankPassengers(itinerary.pax);
  const sameMix =
    saved?.length === expected.length && saved.every((p, i) => p.type === expected[i]?.type);
  // The passenger mix is fixed by the search, so the list of forms never changes.
  const passengers = sameMix && saved ? saved : expected;
  const travelDate = departureDate(offers[0] as FlightOffer);

  const form = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      passengers,
      contact: draft.contact ?? {
        email: user?.email ?? '',
        phone: user?.phone?.replace(/^\+91/, '') ?? '',
      },
    },
    mode: 'onTouched',
  });
  const { register, handleSubmit, formState, setError } = form;

  const onSubmit = handleSubmit((values) => {
    const issues = passengerAgeIssues(values.passengers, travelDate);
    if (issues.length > 0) {
      for (const issue of issues)
        setError(`passengers.${issue.index}.dateOfBirth`, { message: issue.message });
      return;
    }
    draft.setTravellers(values.passengers, values.contact);
    void navigate('/flights/review');
  });

  const errors = formState.errors as FieldErrors<FormOutput>;
  const numbers = passengers.map(
    (p, i) => passengers.slice(0, i + 1).filter((q) => q.type === p.type).length,
  );
  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6">
      <p className="text-sm text-muted">
        Enter names exactly as on the government ID each traveller will carry. Travel date:{' '}
        {formatDate(travelDate)}.
      </p>
      {passengers.map((p, i) => {
        const e = errors.passengers?.[i];
        const dobRequired = p.type !== 'ADULT';
        return (
          <Card key={i}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">
                {TYPE_LABEL[p.type]} {numbers[i]}
                <span className="ml-2 text-sm font-normal text-muted">
                  {p.type === 'ADULT'
                    ? '12+ years'
                    : p.type === 'CHILD'
                      ? '2–11 years'
                      : 'Under 2 years'}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <FormField label="Title" error={e?.title?.message}>
                <Select {...register(`passengers.${i}.title`)}>
                  {TITLE_OPTIONS[p.type].map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField label="Gender" error={e?.gender?.message}>
                <Select {...register(`passengers.${i}.gender`)}>
                  <option value="MALE">Male</option>
                  <option value="FEMALE">Female</option>
                  <option value="OTHER">Other</option>
                </Select>
              </FormField>
              <FormField label="First & middle name" error={e?.firstName?.message}>
                <Input
                  autoComplete={i === 0 ? 'given-name' : 'off'}
                  {...register(`passengers.${i}.firstName`)}
                />
              </FormField>
              <FormField label="Last name" error={e?.lastName?.message}>
                <Input
                  autoComplete={i === 0 ? 'family-name' : 'off'}
                  {...register(`passengers.${i}.lastName`)}
                />
              </FormField>
              <FormField
                label={dobRequired ? 'Date of birth' : 'Date of birth (optional)'}
                error={e?.dateOfBirth?.message}
              >
                <Input
                  type="date"
                  max={travelDate}
                  {...register(`passengers.${i}.dateOfBirth`, {
                    setValueAs: (v: string) => v || undefined,
                  })}
                />
              </FormField>
            </CardContent>
          </Card>
        );
      })}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Contact details</CardTitle>
          <p className="text-sm text-muted">We send the e-ticket and flight updates here.</p>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <FormField label="Email" error={errors.contact?.email?.message}>
            <Input type="email" autoComplete="email" {...register('contact.email')} />
          </FormField>
          <FormField label="Mobile number" error={errors.contact?.phone?.message}>
            <PhoneInput {...register('contact.phone')} />
          </FormField>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button type="submit" size="lg">
          Continue to review <ArrowRight aria-hidden />
        </Button>
      </div>
    </form>
  );
}

function Select(props: ComponentProps<'select'>) {
  return (
    <select
      {...props}
      className="flex h-11 w-full rounded-xl border border-border bg-card px-3 text-sm focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 aria-invalid:border-danger"
    />
  );
}
