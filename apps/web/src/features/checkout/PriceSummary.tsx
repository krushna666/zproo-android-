import type { PriceBreakdown } from '@zproo/types';
import { Card, CardContent, CardHeader, CardTitle } from '@zproo/ui';
import { ShieldCheck } from 'lucide-react';
import { formatMoney as inr } from '@zproo/utils';

/** Fare breakdown. All taxes are shown up front; there are no convenience fees. */
export function PriceSummary({
  price,
  title = 'Fare summary',
}: {
  price: PriceBreakdown;
  title?: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <dl className="space-y-2">
          {price.lines.map((line) => (
            <div key={line.label} className="flex justify-between gap-3">
              <dt className="text-muted">{line.label}</dt>
              <dd className="tabular-nums">{inr(line.amountPaise)}</dd>
            </div>
          ))}
          <div className="flex justify-between gap-3">
            <dt className="text-muted">Convenience fee</dt>
            <dd className="font-semibold text-success">Free</dd>
          </div>
          <div className="flex justify-between gap-3 border-t border-border pt-3 text-base font-extrabold">
            <dt>Total</dt>
            <dd className="tabular-nums">{inr(price.totalPaise)}</dd>
          </div>
        </dl>
        <p className="flex items-center gap-1.5 pt-1 text-xs text-muted">
          <ShieldCheck aria-hidden className="size-3.5 text-success" /> Includes all taxes. No
          hidden charges.
        </p>
      </CardContent>
    </Card>
  );
}
