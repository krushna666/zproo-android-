import { Button, Dialog, DialogContent, DialogDescription, DialogTitle } from '@zproo/ui';
import { formatMoney } from '@zproo/utils';

interface PriceChangedDialogProps {
  /** Set while the dialog is open: the totals from the PRICE_CHANGED error. */
  change: { oldTotal: number; newTotal: number } | null;
  onContinue: () => void;
  onBack: () => void;
  pending?: boolean;
}

/** PRICE_CHANGED (SOP §6.2): "Continue at ₹new" re-submits with a new key; "Go back" returns. */
export function PriceChangedDialog({
  change,
  onContinue,
  onBack,
  pending,
}: PriceChangedDialogProps) {
  return (
    <Dialog open={change !== null} onOpenChange={(open) => !open && onBack()}>
      <DialogContent data-testid="dialog-price-changed" className="max-w-md">
        <DialogTitle>The fare has changed</DialogTitle>
        {change && (
          <DialogDescription>
            The fare changed from {formatMoney(change.oldTotal)} to {formatMoney(change.newTotal)}.
          </DialogDescription>
        )}
        <div className="mt-4 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button variant="outline" data-testid="dialog-price-back" onClick={onBack}>
            Go back
          </Button>
          <Button data-testid="dialog-price-continue" disabled={pending} onClick={onContinue}>
            {change ? `Continue at ${formatMoney(change.newTotal)}` : 'Continue'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
