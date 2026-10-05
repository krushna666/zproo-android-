import { BRAND } from '@zproo/config';
import { Headset, ShieldCheck, Smartphone, Zap } from 'lucide-react';
import { Link } from 'react-router';
import { Logo } from '@/components/brand/Logo';
import { FOOTER_LINKS } from '@/config/navigation';
import { SERVICES } from '@/config/services';
import { ApiStatus } from '@/features/system/ApiStatus';
import { env } from '@/lib/env';

const PROMISES = [
  { icon: Zap, label: 'Fast & reliable' },
  { icon: ShieldCheck, label: 'Secure payments' },
  { icon: Headset, label: '24×7 support' },
];

function LinkColumn({
  title,
  links,
}: {
  title: string;
  links: readonly { label: string; path: string }[];
}) {
  return (
    <div>
      <h2 className="mb-3 text-sm font-bold">{title}</h2>
      <ul className="space-y-2 text-sm text-muted">
        {links.map((link) => (
          <li key={link.path}>
            <Link to={link.path} className="transition-colors hover:text-primary">
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-card pb-(--bottom-nav-height) md:pb-0">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-[1.4fr_repeat(4,1fr)]">
          <div className="space-y-4">
            <Logo height={36} />
            <p className="max-w-xs text-sm text-muted">
              {BRAND.description}. Flights, buses, trains, hotels, cabs, bikes, holidays, parcels
              and corporate travel — in one app.
            </p>
            <ul className="flex flex-wrap gap-x-4 gap-y-2 text-xs font-semibold">
              {PROMISES.map(({ icon: Icon, label }) => (
                <li key={label} className="inline-flex items-center gap-1.5">
                  <Icon aria-hidden className="size-4 text-primary" /> {label}
                </li>
              ))}
            </ul>
          </div>
          <LinkColumn
            title="Travel"
            links={SERVICES.slice(0, 5).map(({ label, path }) => ({ label, path }))}
          />
          <LinkColumn
            title="More services"
            links={SERVICES.slice(5).map(({ label, path }) => ({ label, path }))}
          />
          <LinkColumn title="Company" links={FOOTER_LINKS.company} />
          <LinkColumn title="Support" links={[...FOOTER_LINKS.support]} />
        </div>

        <div className="mt-10 flex flex-col gap-4 rounded-card bg-background p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-primary-light text-primary">
              <Smartphone aria-hidden className="size-5" />
            </span>
            <div>
              <p className="text-sm font-bold">ZPROO GO mobile apps</p>
              <p className="text-xs text-muted">Coming soon to the App Store and Google Play.</p>
            </div>
          </div>
          <p className="text-sm font-bold text-primary">{BRAND.tagline}</p>
        </div>

        <div className="mt-8 flex flex-col gap-3 border-t border-border pt-6 text-xs text-muted sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {new Date().getFullYear()} {BRAND.name}. All rights reserved.
          </p>
          <ul className="flex flex-wrap gap-x-5 gap-y-2">
            {FOOTER_LINKS.legal.map((link) => (
              <li key={link.path}>
                <Link to={link.path} className="hover:text-primary">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
          {import.meta.env.DEV && !env.staticMode && <ApiStatus />}
        </div>
      </div>
    </footer>
  );
}
