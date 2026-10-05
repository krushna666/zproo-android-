import { zodResolver } from '@hookform/resolvers/zod';
import {
  Button,
  cn,
  FormAlert,
  FormField,
  Input,
  PasswordInput,
  PhoneInput,
  toast,
} from '@zproo/ui';
import { TOASTS } from '@zproo/validation';
import { ArrowRight } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router';
import type { z } from 'zod';
import { Seo } from '@/components/seo/Seo';
import { authApi } from '@/features/auth/api';
import { AuthHeader } from '@/features/auth/components/AuthHeader';
import { AuthModeSwitch } from '@/features/auth/components/AuthModeSwitch';
import { SocialSignIn } from '@/features/auth/components/SocialSignIn';
import { invalidForm } from '@/features/auth/errors';
import { userMessage } from '@/lib/apiErrors';
import { ApiClientError } from '@/services/http';
import { useAuthFlow } from '@/features/auth/flowStore';
import { safeReturnTo, withReturnTo } from '@/features/auth/redirect';
import { passwordLoginFormSchema, phoneFormSchema } from '@/features/auth/schemas';
import { useAuthStore } from '@/features/auth/store';

type Method = 'email' | 'mobile';

export default function LoginPage() {
  const [params] = useSearchParams();
  const location = useLocation();
  const notice = (location.state as { notice?: string } | null)?.notice;
  const returnTo = safeReturnTo(params.get('returnTo'));
  const [method, setMethod] = useState<Method>(notice ? 'email' : 'mobile');

  return (
    <>
      <Seo title="Log in" description="Log in to ZPROO GO with your mobile number or email." />
      <AuthHeader title="Welcome back" subtitle="Log in to continue your journey" />
      <AuthModeSwitch />
      {notice && (
        <div className="mb-5">
          <FormAlert tone="success">{notice}</FormAlert>
        </div>
      )}
      <div
        role="radiogroup"
        aria-label="Login method"
        className="mb-5 grid grid-cols-2 gap-2 text-sm font-semibold"
      >
        {(
          [
            ['email', 'Email'],
            ['mobile', 'Mobile'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="radio"
            data-testid={`auth-method-${value}`}
            aria-checked={method === value}
            onClick={() => setMethod(value)}
            className={cn(
              'h-10 rounded-xl border transition-colors',
              method === value
                ? 'border-primary bg-primary-light text-primary'
                : 'border-border text-foreground/70 hover:border-foreground/30',
            )}
          >
            {label}
          </button>
        ))}
      </div>
      {method === 'mobile' ? (
        <OtpLoginForm returnTo={returnTo} />
      ) : (
        <PasswordLoginForm returnTo={returnTo} />
      )}
      <SocialSignIn returnTo={returnTo} />
      <p className="mt-8 text-center text-xs text-muted">
        By continuing you agree to our{' '}
        <Link to="/terms" className="font-semibold text-foreground hover:text-primary">
          Terms
        </Link>{' '}
        and{' '}
        <Link to="/privacy" className="font-semibold text-foreground hover:text-primary">
          Privacy Policy
        </Link>
        .
      </p>
    </>
  );
}

/** Also used by the signup page: the same mobile OTP flow creates or signs into an account. */
export function OtpLoginForm({
  returnTo,
  submitLabel = 'Get OTP',
}: {
  returnTo: string;
  submitLabel?: string;
}) {
  const navigate = useNavigate();
  const startOtp = useAuthFlow((s) => s.startOtp);
  const [error, setError] = useState<string>();
  const form = useForm<z.input<typeof phoneFormSchema>, unknown, z.output<typeof phoneFormSchema>>({
    resolver: zodResolver(phoneFormSchema),
    defaultValues: { phone: useAuthFlow.getState().otp?.phone.replace(/^\+91/, '') ?? '' },
  });

  const onSubmit = form.handleSubmit(async ({ phone }) => {
    setError(undefined);
    try {
      startOtp(phone, returnTo, await authApi.sendOtp(phone));
      toast.success(TOASTS.otpSent(`+91 ${phone.slice(3)}`));
      // `returnTo` stays in the URL so every guard agrees on where the user ends up.
      void navigate(withReturnTo('/verify-otp', returnTo));
    } catch (e) {
      setError(userMessage(e));
    }
  }, invalidForm);

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      {error && <FormAlert>{error}</FormAlert>}
      <FormField name="phone" label="Mobile number" error={form.formState.errors.phone?.message}>
        <PhoneInput data-testid="auth-mobile" {...form.register('phone')} />
      </FormField>
      <Button
        type="submit"
        size="lg"
        className="w-full"
        data-testid="auth-submit"
        disabled={form.formState.isSubmitting}
      >
        {form.formState.isSubmitting ? 'Sending...' : submitLabel} <ArrowRight aria-hidden />
      </Button>
    </form>
  );
}

function PasswordLoginForm({ returnTo }: { returnTo: string }) {
  const navigate = useNavigate();
  const [error, setError] = useState<string>();
  const form = useForm<
    z.input<typeof passwordLoginFormSchema>,
    unknown,
    z.output<typeof passwordLoginFormSchema>
  >({
    resolver: zodResolver(passwordLoginFormSchema),
    defaultValues: { identifier: '', password: '' },
  });

  const onSubmit = form.handleSubmit(async ({ identifier, password }) => {
    setError(undefined);
    try {
      useAuthStore.getState().setSession(await authApi.login(identifier.value, password));
      toast.success(TOASTS.loginSuccess);
      void navigate(returnTo, { replace: true });
    } catch (e) {
      if (e instanceof ApiClientError && e.errorCode === 'INVALID_CREDENTIALS') {
        // Generic on purpose: never says whether the account exists.
        form.setError('password', { message: e.message }, { shouldFocus: true });
      } else {
        setError(userMessage(e));
      }
      form.resetField('password', { keepError: true });
    }
  }, invalidForm);

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      {error && <FormAlert>{error}</FormAlert>}
      <FormField
        name="identifier"
        label="Email or mobile number"
        error={form.formState.errors.identifier?.message}
      >
        <Input
          className="h-12"
          autoComplete="username"
          placeholder="you@example.com or 98765 43210"
          data-testid="auth-email"
          {...form.register('identifier')}
        />
      </FormField>
      <FormField
        name="password"
        label="Password"
        error={form.formState.errors.password?.message}
        action={
          <Link
            to="/forgot-password"
            className="text-xs font-semibold text-primary hover:underline"
          >
            Forgot password?
          </Link>
        }
      >
        <PasswordInput
          autoComplete="current-password"
          placeholder="Enter password"
          data-testid="auth-password"
          {...form.register('password')}
        />
      </FormField>
      <Button
        type="submit"
        size="lg"
        className="w-full"
        data-testid="auth-submit"
        disabled={form.formState.isSubmitting}
      >
        {form.formState.isSubmitting ? 'Logging in...' : 'Log in'}
      </Button>
    </form>
  );
}
