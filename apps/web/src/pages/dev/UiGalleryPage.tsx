import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  DevCodeHint,
  EmptyState,
  FormAlert,
  FormField,
  Input,
  OtpInput,
  PasswordInput,
  PhoneInput,
  Skeleton,
  toast,
} from '@zproo/ui';
import { SearchX } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Seo } from '@/components/seo/Seo';

/** The 13 SOP colour tokens, as Tailwind classes (never hex in components). */
const TOKENS = [
  ['primary', 'bg-primary'],
  ['primary-hover', 'bg-primary-hover'],
  ['primary-light', 'bg-primary-light'],
  ['primary-foreground', 'bg-primary-foreground'],
  ['background', 'bg-background'],
  ['foreground', 'bg-foreground'],
  ['muted', 'bg-muted'],
  ['border', 'bg-border'],
  ['card', 'bg-card'],
  ['ring', 'bg-ring'],
  ['success', 'bg-success'],
  ['warning', 'bg-warning'],
  ['danger', 'bg-danger'],
] as const;

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-4">
      <h2 className="text-lg font-bold">{title}</h2>
      {children}
    </section>
  );
}

/** Development-only gallery of the shared UI (route exists only in `vite dev`). */
export default function UiGalleryPage() {
  const [otp, setOtp] = useState('');
  return (
    <div className="mx-auto max-w-5xl space-y-10 px-4 py-10">
      <Seo title="UI gallery" noIndex />
      <h1 className="text-[28px] font-extrabold">UI gallery</h1>

      <Section title="Colour tokens">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {TOKENS.map(([name, cls]) => (
            <div key={name} className="flex items-center gap-3 rounded-xl border border-border p-2">
              <span className={`size-10 rounded-lg border border-border ${cls}`} />
              <code className="text-xs">{name}</code>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Buttons">
        <div className="flex flex-wrap items-center gap-3">
          {(['default', 'secondary', 'outline', 'ghost', 'link', 'destructive'] as const).map(
            (variant) => (
              <Button key={variant} variant={variant}>
                {variant}
              </Button>
            ),
          )}
          <Button disabled>Disabled</Button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm">Small 36</Button>
          <Button size="md">Medium 44</Button>
          <Button size="lg">Large 48</Button>
          <Button size="icon" aria-label="Search">
            <SearchX aria-hidden />
          </Button>
        </div>
      </Section>

      <Section title="Badges">
        <div className="flex flex-wrap gap-2">
          {(['default', 'soft', 'success', 'warning', 'danger', 'outline'] as const).map((v) => (
            <Badge key={v} variant={v}>
              {v}
            </Badge>
          ))}
        </div>
      </Section>

      <Section title="Inputs">
        <div className="grid gap-5 sm:grid-cols-2">
          <FormField label="Name" hint="As on your ID — used for tickets">
            <Input placeholder="Amit Sharma" />
          </FormField>
          <FormField name="email" label="Email" error="Enter a valid email address">
            <Input defaultValue="amit@" />
          </FormField>
          <FormField label="Mobile number">
            <PhoneInput />
          </FormField>
          <FormField label="Password">
            <PasswordInput placeholder="Enter password" />
          </FormField>
          <FormField label="One-time code">
            <OtpInput value={otp} onChange={setOtp} />
          </FormField>
          <DevCodeHint code="123456" />
        </div>
      </Section>

      <Section title="Feedback">
        <FormAlert>Something went wrong. Please try again.</FormAlert>
        <FormAlert tone="success">Password updated. Log in with your new password.</FormAlert>
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => toast.success('Login successful!')}>
            Success toast
          </Button>
          <Button variant="outline" onClick={() => toast.error('Please fix the errors')}>
            Error toast
          </Button>
        </div>
      </Section>

      <Section title="Cards, skeletons and empty state">
        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Card title (18px bold)</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted">Radius 14px, shadow-card.</CardContent>
          </Card>
          <div className="space-y-3">
            <Skeleton className="h-6 w-2/3" />
            <Skeleton className="h-24" />
          </div>
        </div>
        <EmptyState
          icon={SearchX}
          title="No buses found for this date"
          description="Try another date or a nearby city."
          actions={<Button variant="secondary">Try tomorrow</Button>}
        />
      </Section>
    </div>
  );
}
