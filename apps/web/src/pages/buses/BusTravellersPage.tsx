import { zodResolver } from '@hookform/resolvers/zod';
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Skeleton } from '@zproo/ui';
import { busPassengerSchema, contactSchema } from '@zproo/validation';
import { ArrowRight, Venus } from 'lucide-react';
import type { ComponentProps } from 'react';
import { useForm, type FieldErrors } from 'react-hook-form';
import { useNavigate } from 'react-router';
import { z } from 'zod';
import { FormAlert } from '@/features/auth/components/FormAlert';
import { FormField } from '@/features/auth/components/FormField';
import { PhoneInput } from '@/features/auth/components/PhoneInput';
import { errorMessage } from '@/features/auth/errors';
import { useAuthStore } from '@/features/auth/store';
import { useBusTrip } from '@/features/buses/api';
import { BusTripSummary } from '@/features/buses/components/BusTripSummary';
import { useBusDraft, type BusSelection } from '@/features/buses/draft';
import { CheckoutShell, NothingSelected } from '@/features/checkout/CheckoutShell';
import { PriceSummary } from '@/features/checkout/PriceSummary';
import { busPriceBreakdown } from '@/features/buses/price';

export default function BusTravellersPage() {
  const selection = useBusDraft((s) => s.selection);
  if (!selection) return <NothingSelected service="bus" />;
  return <Travellers selection={selection} />;
}

function Travellers({ selection }: { selection: BusSelection }) {
  const { data: trip, isPending, error } = useBusTrip(selection.tripId);
  return (
    <CheckoutShell
      step={2}
      service="bus"
      title="Traveller details"
      back={{ to: selection.seatsUrl, label: 'Change seats' }}
      aside={
        trip ? (
          <>
            <PriceSummary price={busPriceBreakdown(selection)} />
            <BusTripSummary
              trip={trip}
              boarding={trip.boardingPoints.find((p) => p.id === selection.boardingPointId)}
              dropping={trip.droppingPoints.find((p) => p.id === selection.droppingPointId)}
              seatNumbers={selection.seats.map((s) => s.number)}
            />
          </>
        ) : (
          <Skeleton className="h-64 rounded-2xl" />
        )
      }
    >
      {error ? (
        <FormAlert>{errorMessage(error)}</FormAlert>
      ) : isPending || !trip ? (
        <Skeleton className="h-96 rounded-2xl" />
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
  const ladies = new Set(selection.seats.filter((s) => s.ladiesOnly).map((s) => s.number));

  const schema = z
    .object({ passengers: z.array(busPassengerSchema), contact: contactSchema })
    .superRefine((v, ctx) =>
      v.passengers.forEach((p, i) => {
        if (ladies.has(p.seatNumber) && p.gender !== 'FEMALE') {
          ctx.addIssue({
            code: 'custom',
            path: ['passengers', i, 'gender'],
            message: `Seat ${p.seatNumber} is reserved for women`,
          });
        }
      }),
    );

  const saved = new Map(draft.passengers?.map((p) => [p.seatNumber, p]) ?? []);
  const passengers = selection.seats.map(
    (seat) =>
      saved.get(seat.number) ?? {
        seatNumber: seat.number,
        firstName: '',
        lastName: '',
        age: '' as unknown as number,
        gender: seat.ladiesOnly ? ('FEMALE' as const) : ('MALE' as const),
      },
  );

  const form = useForm<z.input<typeof schema>, unknown, z.output<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      passengers,
      contact: draft.contact ?? {
        email: user?.email ?? '',
        phone: user?.phone?.replace(/^\+91/, '') ?? '',
      },
    },
    mode: 'onTouched',
  });
  const { register, handleSubmit, formState } = form;
  const errors = formState.errors as FieldErrors<z.output<typeof schema>>;

  const onSubmit = handleSubmit((values) => {
    draft.setTravellers(values.passengers, values.contact);
    void navigate('/buses/review');
  });

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6">
      <p className="text-sm text-muted">
        One traveller per seat. Names as on a government photo ID.
      </p>
      {passengers.map((p, i) => {
        const e = errors.passengers?.[i];
        return (
          <Card key={p.seatNumber}>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                Seat {p.seatNumber}
                {ladies.has(p.seatNumber) && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-pink-50 px-2 py-0.5 text-xs font-semibold text-pink-800">
                    <Venus aria-hidden className="size-3" /> Reserved for women
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
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
              <FormField label="Age" error={e?.age?.message}>
                <Input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={120}
                  {...register(`passengers.${i}.age`)}
                />
              </FormField>
              <FormField label="Gender" error={e?.gender?.message}>
                <Select {...register(`passengers.${i}.gender`)}>
                  <option value="MALE">Male</option>
                  <option value="FEMALE">Female</option>
                  <option value="OTHER">Other</option>
                </Select>
              </FormField>
            </CardContent>
          </Card>
        );
      })}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Contact details</CardTitle>
          <p className="text-sm text-muted">We send the ticket and bus updates here.</p>
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
