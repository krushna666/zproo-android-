import { useNavigate } from 'react-router';
import { useState } from 'react';
import { authApi } from '../api';
import { useAuthStore } from '../store';
import { errorMessage } from '../errors';
import { FormAlert } from './FormAlert';
import { GoogleSignInButton } from './GoogleSignInButton';

/** "Or continue with" block. Renders nothing when no social provider is configured. */
export function SocialSignIn({ next }: { next: string }) {
  const navigate = useNavigate();
  const [error, setError] = useState<string>();
  if (!import.meta.env.VITE_GOOGLE_CLIENT_ID) return null;

  const onGoogle = async (idToken: string) => {
    setError(undefined);
    try {
      useAuthStore.getState().setSession(await authApi.social('google', idToken));
      void navigate(next, { replace: true });
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
      <GoogleSignInButton onCredential={(token) => void onGoogle(token)} />
    </div>
  );
}
