import { Button } from '@zproo/ui';
import { useCountdown } from '@/hooks/useCountdown';

interface ResendCountdownProps {
  availableAt: number;
  onResend: () => void;
  pending?: boolean;
}

/** "Resend OTP in mm:ss" (disabled) until the cooldown ends, then "Resend OTP". */
export function ResendCountdown({ availableAt, onResend, pending }: ResendCountdownProps) {
  const seconds = useCountdown(availableAt);
  const waiting = seconds > 0;
  const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
  const ss = String(seconds % 60).padStart(2, '0');
  return (
    <div className="text-center">
      <Button
        type="button"
        variant="ghost"
        className="text-primary disabled:text-muted"
        data-testid="auth-resend"
        onClick={onResend}
        disabled={waiting || pending}
        aria-disabled={waiting || pending}
      >
        {pending ? (
          'Sending...'
        ) : waiting ? (
          <span aria-live="off">
            Resend OTP in <span className="tabular-nums">{`${mm}:${ss}`}</span>
          </span>
        ) : (
          'Resend OTP'
        )}
      </Button>
    </div>
  );
}
