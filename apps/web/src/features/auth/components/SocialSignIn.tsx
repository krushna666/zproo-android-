import { Button, FormAlert, toast } from '@zproo/ui';
import { TOASTS } from '@zproo/validation';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { authApi } from '../api';
import { errorMessage } from '../errors';
import { useAuthStore } from '../store';
import { GoogleSignInButton } from './GoogleSignInButton';
import { GOOGLE_NOT_CONFIGURED } from '../messages';

/** "Or continue with" block with Google. */
export function SocialSignIn({ returnTo }: { returnTo: string }) {
  const navigate = useNavigate();
  const [error, setError] = useState<string>();
  const configured = Boolean(import.meta.env.VITE_GOOGLE_CLIENT_ID);

  const onGoogle = async (idToken: string) => {
    setError(undefined);
    try {
      useAuthStore.getState().setSession(await authApi.social('google', idToken));
      toast.success(TOASTS.loginSuccess);
      void navigate(returnTo, { replace: true });
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <div className="mt-6 space-y-4">
      <div className="flex items-center gap-3 text-xs font-semibold text-muted">
        <span className="h-px flex-1 bg-border" /> or continue with{' '}
        <span className="h-px flex-1 bg-border" />
      </div>
      {error && <FormAlert>{error}</FormAlert>}
      {configured ? (
        <div data-testid="auth-google">
          <GoogleSignInButton onCredential={(token) => void onGoogle(token)} />
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="w-full"
          data-testid="auth-google"
          onClick={() => setError(GOOGLE_NOT_CONFIGURED)}
        >
          <GoogleMark /> Continue with Google
        </Button>
      )}
    </div>
  );
}

/** A plain "G" glyph (we don't redraw third-party logos). */
function GoogleMark() {
  return (
    <span
      aria-hidden
      className="grid size-5 place-items-center rounded-full border text-xs font-bold"
    >
      G
    </span>
  );
}
