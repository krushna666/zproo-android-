import { Button } from '@zproo/ui';
import { formatMoney } from '@zproo/utils';
import { Lock } from 'lucide-react';
import { useId, useState } from 'react';
import { Link } from 'react-router';

/** Required terms checkbox and "Proceed to pay ₹{total}" (review step of every checkout). */
export function TermsAndProceed({
  totalPaise,
  onProceed,
  policy = "the operator's cancellation policy",
}: {
  totalPaise: number;
  onProceed: () => void;
  /** Whose rules the customer accepts, e.g. "the airline fare rules" */
  policy?: string;
}) {
  const termsId = useId();
  const [accepted, setAccepted] = useState(false);
  const [termsError, setTermsError] = useState(false);
  return (
    <div className="space-y-3">
      <div>
        <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm">
          <input
            id={termsId}
            type="checkbox"
            data-testid="checkout-terms"
            checked={accepted}
            aria-invalid={termsError || undefined}
            aria-describedby={termsError ? `${termsId}-error` : undefined}
            onChange={(e) => {
              setAccepted(e.target.checked);
              if (e.target.checked) setTermsError(false);
            }}
            className="mt-0.5 size-4 accent-primary"
          />
          <span>
            I agree to {policy}, the{' '}
            <Link to="/terms" className="font-semibold text-primary underline">
              Terms
            </Link>{' '}
            and the{' '}
            <Link to="/refund-policy" className="font-semibold text-primary underline">
              Refund Policy
            </Link>
            .
          </span>
        </label>
        {termsError && (
          <p
            id={`${termsId}-error`}
            data-testid="field-error-terms"
            className="text-xs font-semibold text-danger"
          >
            Please accept the terms to continue
          </p>
        )}
      </div>
      <Button
        size="lg"
        className="w-full"
        data-testid="checkout-proceed"
        onClick={() => {
          if (!accepted) {
            setTermsError(true);
            document.getElementById(termsId)?.focus();
            return;
          }
          onProceed();
        }}
      >
        <Lock aria-hidden /> Proceed to pay {formatMoney(totalPaise)}
      </Button>
    </div>
  );
}
