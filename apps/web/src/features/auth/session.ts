import type { AuthSession } from '@zproo/types';
import { toast } from '@zproo/ui';
import { clearAllDrafts } from '@/features/checkout/drafts';
import { ApiClientError, configureAuth } from '@/services/http';
import { authApi } from './api';
import { useAuthFlow } from './flowStore';
import { sessionHint, useAuthStore } from './store';

export const SESSION_EXPIRED_MESSAGE = 'Your session expired. Please log in again.';

type AuthMessage = { type: 'logout' };

/**
 * Tabs of this browser tell each other about sign-outs. Opened by installAuth() in the browser
 * only: an open channel would keep a Node process (prerendering, tests) from exiting.
 */
let channel: BroadcastChannel | null = null;

function openAuthChannel(): void {
  if (channel || typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return;
  channel = new BroadcastChannel('zproo-auth');
  channel.addEventListener('message', (event: MessageEvent<AuthMessage>) => {
    // Another tab signed out: its server session is gone, so this tab's is too.
    if (event.data.type === 'logout' && useAuthStore.getState().status === 'authenticated')
      endLocalSession();
  });
}

/** Closes the cross-tab channel (tests). */
export function closeAuthChannel(): void {
  channel?.close();
  channel = null;
}

/** Forget the session locally: store, in-progress auth flows and booking drafts. */
function endLocalSession(): void {
  useAuthStore.getState().clear();
  useAuthFlow.getState().clear();
  clearAllDrafts();
}

let inFlight: Promise<AuthSession | null> | null = null;

/**
 * Exchanges the refresh cookie for a new session. Concurrent callers share one request, and
 * tabs take turns via the Web Locks API: refresh tokens are single-use, so two tabs refreshing
 * with the same cookie would look like token theft and end the session.
 */
export function refreshSession(): Promise<AuthSession | null> {
  inFlight ??= withCrossTabLock(async () => {
    try {
      const session = await authApi.refresh();
      useAuthStore.getState().setSession(session);
      return session;
    } catch (error) {
      if (error instanceof ApiClientError && (error.status === 401 || error.status === 403)) {
        const wasSignedIn = useAuthStore.getState().status === 'authenticated';
        // Booking drafts are kept: after logging in again the customer resumes where they were.
        useAuthStore.getState().clear();
        if (wasSignedIn) toast.error(SESSION_EXPIRED_MESSAGE);
        return null;
      }
      throw error;
    }
  }).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function withCrossTabLock<T>(fn: () => Promise<T>): Promise<T> {
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
  return locks ? locks.request('zproo-auth-refresh', fn) : fn();
}

/** On page load: restore the session if this browser has signed in before. */
export async function bootstrapSession(): Promise<void> {
  if (!sessionHint.get()) {
    useAuthStore.getState().clear();
    return;
  }
  try {
    await refreshSession();
  } catch {
    // Network or server trouble: treat as signed out for now; the next API call retries.
    useAuthStore.setState({ status: 'anonymous' });
  }
}

export async function signOut(options: { everywhere?: boolean } = {}): Promise<void> {
  try {
    await (options.everywhere ? authApi.logoutAll() : authApi.logout());
  } finally {
    endLocalSession();
    channel?.postMessage({ type: 'logout' } satisfies AuthMessage);
  }
}

/** Connects the HTTP client to the session: attaches the access token and renews it on 401. */
export function installAuth(): void {
  openAuthChannel();
  configureAuth({
    getAccessToken: () => useAuthStore.getState().accessToken,
    refresh: async () => (await refreshSession())?.accessToken ?? null,
  });
}
