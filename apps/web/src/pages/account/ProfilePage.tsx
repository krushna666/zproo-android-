import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  Input,
} from '@zproo/ui';
import { KeyRound, LayoutDashboard, LogOut, Mail, MonitorSmartphone, Phone } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router';
import type { z } from 'zod';
import { Seo } from '@/components/seo/Seo';
import { authApi } from '@/features/auth/api';
import { FormAlert } from '@/features/auth/components/FormAlert';
import { FormField } from '@/features/auth/components/FormField';
import { UserAvatar } from '@/features/auth/components/UserAvatar';
import { errorMessage } from '@/features/auth/errors';
import { maskPhone } from '@/features/auth/redirect';
import { nameFormSchema } from '@/features/auth/schemas';
import { signOut } from '@/features/auth/session';
import { hasPermission, useAuthStore } from '@/features/auth/store';

const memberSince = new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric' });

export default function ProfilePage() {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  if (!user) return null; // RequireAuth guarantees a user; this narrows the type.

  const staffRoles = user.roles.filter((r) => r !== 'USER');
  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8 sm:px-6 sm:py-12">
      <Seo title="My profile" noIndex />
      <section className="flex items-center gap-4">
        <UserAvatar name={user.fullName} src={user.avatarUrl} size={72} />
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-extrabold tracking-tight sm:text-3xl">
            {user.fullName}
          </h1>
          <p className="text-sm text-muted">
            Member since {memberSince.format(new Date(user.createdAt))}
          </p>
          {staffRoles.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {staffRoles.map((role) => (
                <Badge key={role} variant="soft">
                  {role.replace(/_/g, ' ').toLowerCase()}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </section>

      <EditName fullName={user.fullName} />

      <Card>
        <CardHeader>
          <CardTitle>Contact & sign-in</CardTitle>
          <CardDescription>How you log in and where we send tickets.</CardDescription>
        </CardHeader>
        <CardContent className="divide-y divide-border">
          <DetailRow
            icon={<Phone aria-hidden />}
            label="Mobile number"
            value={user.phone ? maskPhone(user.phone) : 'Not added'}
            verified={user.phone ? user.phoneVerified : undefined}
          />
          <DetailRow
            icon={<Mail aria-hidden />}
            label="Email"
            value={user.email ?? 'Not added'}
            verified={user.email ? user.emailVerified : undefined}
          />
          <DetailRow
            icon={<KeyRound aria-hidden />}
            label="Password"
            value={user.hasPassword ? 'Set' : 'Not set — you log in with OTP'}
            action={
              <Link
                to="/forgot-password"
                className="text-sm font-semibold text-primary hover:underline"
              >
                {user.hasPassword ? 'Reset' : 'Set password'}
              </Link>
            }
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Security</CardTitle>
          <CardDescription>Sign out here, or everywhere if you lost a device.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          {hasPermission(user, 'admin:access') && (
            <Button asChild variant="secondary">
              <Link to="/admin">
                <LayoutDashboard aria-hidden /> Admin panel
              </Link>
            </Button>
          )}
          <Button variant="outline" onClick={() => void signOut().finally(() => navigate('/'))}>
            <LogOut aria-hidden /> Sign out
          </Button>
          <SignOutEverywhere
            onDone={() =>
              void navigate('/login', {
                state: { notice: 'You have been signed out of all devices.' },
              })
            }
          />
        </CardContent>
      </Card>
    </div>
  );
}

function DetailRow({
  icon,
  label,
  value,
  verified,
  action,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  verified?: boolean | undefined;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-4 py-3.5 first:pt-0 last:pb-0">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary-light text-primary [&_svg]:size-5">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-muted">{label}</p>
        <p className="truncate font-semibold">{value}</p>
      </div>
      {verified !== undefined && (
        <Badge variant={verified ? 'success' : 'warning'}>
          {verified ? 'Verified' : 'Not verified'}
        </Badge>
      )}
      {action}
    </div>
  );
}

function EditName({ fullName }: { fullName: string }) {
  const setUser = useAuthStore((s) => s.setUser);
  const [saved, setSaved] = useState(false);
  const form = useForm<z.input<typeof nameFormSchema>, unknown, z.output<typeof nameFormSchema>>({
    resolver: zodResolver(nameFormSchema),
    values: { fullName },
  });
  const mutation = useMutation({
    mutationFn: authApi.updateMe,
    onSuccess: (user) => {
      setUser(user);
      setSaved(true);
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Personal details</CardTitle>
        <CardDescription>
          Use your name exactly as on your ID; it is printed on tickets.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          noValidate
          className="flex flex-col gap-3 sm:flex-row sm:items-start"
          onSubmit={form.handleSubmit((values) => {
            setSaved(false);
            mutation.mutate(values);
          })}
        >
          <div className="flex-1">
            <FormField label="Full name" error={form.formState.errors.fullName?.message}>
              <Input className="h-11" autoComplete="name" {...form.register('fullName')} />
            </FormField>
          </div>
          <Button
            type="submit"
            className="sm:mt-6"
            disabled={mutation.isPending || !form.formState.isDirty}
          >
            {mutation.isPending ? 'Saving…' : 'Save'}
          </Button>
        </form>
        <div className="mt-3 empty:hidden">
          {mutation.isError && <FormAlert>{errorMessage(mutation.error)}</FormAlert>}
          {saved && !form.formState.isDirty && <FormAlert tone="success">Saved</FormAlert>}
        </div>
      </CardContent>
    </Card>
  );
}

function SignOutEverywhere({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        variant="ghost"
        className="text-danger hover:bg-danger/5"
        onClick={() => setOpen(true)}
      >
        <MonitorSmartphone aria-hidden /> Sign out of all devices
      </Button>
      <DialogContent>
        <DialogTitle>Sign out of all devices?</DialogTitle>
        <DialogDescription className="mt-2">
          You'll be signed out everywhere, including this browser. Your bookings and wallet are not
          affected.
        </DialogDescription>
        <div className="mt-6 flex justify-end gap-3">
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button
            variant="destructive"
            disabled={pending}
            onClick={() => {
              setPending(true);
              void signOut({ everywhere: true }).finally(() => {
                setPending(false);
                setOpen(false);
                onDone();
              });
            }}
          >
            {pending ? 'Signing out…' : 'Sign out everywhere'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
