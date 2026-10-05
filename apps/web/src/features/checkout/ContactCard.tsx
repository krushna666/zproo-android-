import { Card, CardContent, CardHeader, CardTitle, FormField, Input, PhoneInput } from '@zproo/ui';
import type { UseFormRegisterReturn } from 'react-hook-form';

/** Contact block of every checkout (email + Indian mobile), pre-filled from the profile. */
export function ContactCard({
  email,
  mobile,
  errors,
  note = 'We send the ticket and travel updates here.',
}: {
  email: UseFormRegisterReturn;
  mobile: UseFormRegisterReturn;
  errors: { email?: string | undefined; mobile?: string | undefined };
  note?: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Contact details</CardTitle>
        <p className="text-sm text-muted">{note}</p>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <FormField label="Email" name="email" error={errors.email}>
          <Input
            type="email"
            autoComplete="email"
            data-testid="checkout-contact-email"
            {...email}
          />
        </FormField>
        <FormField label="Mobile number" name="mobile" error={errors.mobile}>
          <PhoneInput data-testid="checkout-contact-mobile" {...mobile} />
        </FormField>
      </CardContent>
    </Card>
  );
}

/** A segmented control for gender (radio inputs styled as one control). */
export function GenderControl({
  name,
  value,
  register,
  testIdPrefix,
  error,
}: {
  name: string;
  value: string | undefined;
  register: UseFormRegisterReturn;
  testIdPrefix: string;
  error?: string | undefined;
}) {
  const errorId = `${testIdPrefix}-gender-error`;
  return (
    <fieldset
      aria-invalid={error ? true : undefined}
      aria-describedby={error ? errorId : undefined}
    >
      <legend className="mb-1.5 text-sm font-semibold">Gender</legend>
      <div className="inline-flex rounded-xl border border-border bg-background p-1">
        {(
          [
            ['MALE', 'Male'],
            ['FEMALE', 'Female'],
            ['OTHER', 'Other'],
          ] as const
        ).map(([id, label]) => (
          <label
            key={id}
            className={
              value === id
                ? 'inline-flex min-h-11 min-w-20 cursor-pointer items-center justify-center rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring'
                : 'inline-flex min-h-11 min-w-20 cursor-pointer items-center justify-center rounded-lg px-3 text-sm font-semibold text-muted hover:text-foreground has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring'
            }
          >
            <input
              type="radio"
              value={id}
              className="sr-only"
              data-testid={`${testIdPrefix}-gender-${id.toLowerCase()}`}
              {...register}
              name={name}
            />
            {label}
          </label>
        ))}
      </div>
      {error && (
        <p
          id={errorId}
          data-testid={`field-error-${testIdPrefix.replace('checkout-', '')}-gender`}
          className="mt-1.5 text-xs font-semibold text-danger"
        >
          {error}
        </p>
      )}
    </fieldset>
  );
}
