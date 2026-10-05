import { Check, Copy, TicketPercent } from 'lucide-react';
import { useState } from 'react';
import { OFFERS } from '../content';
import { railItem } from './rail';
import { Rail, Section, SectionHeader } from './SectionHeader';

function CopyCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard
          ?.writeText(code)
          .then(() => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 2000);
          })
          .catch(() => undefined);
      }}
      className="flex items-center gap-2 rounded-xl border-2 border-dashed border-primary/40 bg-primary-light/60 px-3 py-1.5 font-mono text-sm font-bold tracking-wider text-primary transition-colors hover:border-primary"
      aria-label={copied ? `${code} copied` : `Copy code ${code}`}
    >
      {code}
      {copied ? <Check aria-hidden className="size-4" /> : <Copy aria-hidden className="size-4" />}
    </button>
  );
}

export function OffersSection() {
  return (
    <Section id="offers-title">
      <SectionHeader
        id="offers-title"
        title="Offers for you"
        subtitle="Apply the code at checkout. T&Cs apply."
        action={{ to: '/offers', label: 'All offers' }}
      />
      <Rail label="Offers" cols="md:grid-cols-2 lg:grid-cols-4">
        {OFFERS.map((offer) => (
          <li key={offer.code} className={railItem}>
            <article className="relative flex h-full flex-col overflow-hidden rounded-card border border-border bg-card p-5">
              <span
                aria-hidden
                className="absolute -right-3 top-1/2 size-6 -translate-y-1/2 rounded-full bg-background ring-1 ring-border"
              />
              <span
                aria-hidden
                className="absolute -left-3 top-1/2 size-6 -translate-y-1/2 rounded-full bg-background ring-1 ring-border"
              />
              <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted">
                <TicketPercent aria-hidden className="size-4 text-primary" /> {offer.service}
              </p>
              <h3 className="mt-2 text-lg font-extrabold leading-snug">{offer.title}</h3>
              <p className="mt-1 flex-1 text-sm text-muted">{offer.detail}</p>
              <div className="mt-4">
                <CopyCode code={offer.code} />
              </div>
            </article>
          </li>
        ))}
      </Rail>
    </Section>
  );
}
