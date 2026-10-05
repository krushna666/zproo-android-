import { Button } from '@zproo/ui';
import { ArrowRight, BadgeCheck, FileText, ShieldCheck, Users } from 'lucide-react';
import { Link } from 'react-router';

const POINTS = [
  { icon: ShieldCheck, text: 'Travel policies and approval workflows' },
  { icon: Users, text: 'Employees, managers and a shared corporate wallet' },
  { icon: FileText, text: 'GST invoices and spend reports' },
  { icon: BadgeCheck, text: 'Dedicated vehicles for employee transport' },
];

export function CorporatePanel() {
  return (
    <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr] lg:items-center">
      <div>
        <h3 className="text-lg font-bold">ZPROO GO for Business</h3>
        <p className="mt-1 text-sm text-muted">
          One account for your company's flights, hotels, cabs and employee transport.
        </p>
        <ul className="mt-4 grid gap-2.5 sm:grid-cols-2">
          {POINTS.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-start gap-2.5 text-sm">
              <Icon aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" /> {text}
            </li>
          ))}
        </ul>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
        <Button asChild size="lg" className="h-14 text-base">
          <Link to="/corporate">
            Register your company <ArrowRight aria-hidden />
          </Link>
        </Button>
        <Button asChild size="lg" variant="outline" className="h-14 text-base">
          <Link to="/login?next=/corporate">Corporate login</Link>
        </Button>
      </div>
    </div>
  );
}
