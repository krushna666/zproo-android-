import { useEffect, useRef } from 'react';

interface GoogleAccountsId {
  initialize: (config: {
    client_id: string;
    callback: (response: { credential: string }) => void;
  }) => void;
  renderButton: (element: HTMLElement, options: Record<string, unknown>) => void;
}
declare global {
  interface Window {
    google?: { accounts: { id: GoogleAccountsId } };
  }
}

const SCRIPT_SRC = 'https://accounts.google.com/gsi/client';
let scriptPromise: Promise<void> | undefined;

function loadGoogleScript(): Promise<void> {
  scriptPromise ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Google sign-in failed to load'));
    document.head.appendChild(script);
  });
  return scriptPromise;
}

/**
 * Google Identity Services button. Renders nothing unless VITE_GOOGLE_CLIENT_ID is set; the
 * ID token it returns is verified by the API, never trusted here.
 */
export function GoogleSignInButton({ onCredential }: { onCredential: (idToken: string) => void }) {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  const container = useRef<HTMLDivElement>(null);
  const callback = useRef(onCredential);

  useEffect(() => {
    callback.current = onCredential;
  });

  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;
    loadGoogleScript()
      .then(() => {
        const google = window.google;
        const element = container.current;
        if (cancelled || !google || !element) return;
        google.accounts.id.initialize({
          client_id: clientId,
          callback: (r) => callback.current(r.credential),
        });
        google.accounts.id.renderButton(element, {
          theme: 'outline',
          size: 'large',
          shape: 'pill',
          text: 'continue_with',
          width: Math.min(element.offsetWidth || 320, 400),
        });
      })
      .catch(() => {
        /* Button stays hidden; other sign-in methods still work. */
      });
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  if (!clientId) return null;
  return <div ref={container} className="flex min-h-11 justify-center" />;
}
