import type { AuthSession } from '@zproo/types';
import { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { render, screen } from '@testing-library/react';
import { Toaster } from '@zproo/ui';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useBusDraft } from '@/features/buses/draft';
import { apiGet, http } from '@/services/http';
import { makeUser } from '@/test/render';
import {
  bootstrapSession,
  closeAuthChannel,
  installAuth,
  refreshSession,
  signOut,
} from './session';
import { sessionHint, useAuthStore } from './store';

const session = (token: string): AuthSession => ({
  user: makeUser(),
  accessToken: token,
  expiresIn: 900,
});

type Handler = (config: InternalAxiosRequestConfig) => { status: number; data: unknown };
const originalAdapter = http.defaults.adapter;

/** Routes requests to `handler` instead of the network, like a tiny mock server. */
function mockServer(handler: Handler) {
  const calls: { url: string; authorization: string | undefined }[] = [];
  http.defaults.adapter = async (config) => {
    calls.push({
      url: config.url ?? '',
      authorization: config.headers.Authorization as string | undefined,
    });
    const { status, data } = handler(config);
    const response = { status, statusText: '', data, headers: {}, config };
    if (status >= 400)
      throw new AxiosError('Request failed', 'ERR_BAD_REQUEST', config, null, response);
    return response;
  };
  return calls;
}

const unauthenticated = {
  status: 401,
  data: { error: { code: 'UNAUTHENTICATED', message: 'Please sign in' } },
};
const ok = (data: unknown) => ({ status: 200, data: { success: true, message: 'Success', data } });

beforeEach(() => {
  installAuth();
  useAuthStore.setState({ status: 'anonymous', user: null, accessToken: null });
  sessionHint.set(false);
});

afterEach(() => {
  http.defaults.adapter = originalAdapter;
  closeAuthChannel();
});

describe('refreshSession', () => {
  it('shares one request between concurrent callers', async () => {
    const calls = mockServer(() => ok(session('fresh')));
    const [a, b] = await Promise.all([refreshSession(), refreshSession()]);
    expect(calls.filter((c) => c.url === '/auth/refresh')).toHaveLength(1);
    expect(a?.accessToken).toBe('fresh');
    expect(b).toBe(a);
    expect(useAuthStore.getState()).toMatchObject({
      status: 'authenticated',
      accessToken: 'fresh',
    });
    expect(sessionHint.get()).toBe(true);
  });

  it('signs out locally when the refresh cookie is rejected', async () => {
    sessionHint.set(true);
    mockServer(() => unauthenticated);
    expect(await refreshSession()).toBeNull();
    expect(useAuthStore.getState().status).toBe('anonymous');
    expect(sessionHint.get()).toBe(false);
  });
});

describe('bootstrapSession', () => {
  it('skips the network for visitors who never signed in', async () => {
    const calls = mockServer(() => ok(session('x')));
    await bootstrapSession();
    expect(calls).toHaveLength(0);
    expect(useAuthStore.getState().status).toBe('anonymous');
  });

  it('restores the session for returning users', async () => {
    sessionHint.set(true);
    mockServer(() => ok(session('restored')));
    await bootstrapSession();
    expect(useAuthStore.getState()).toMatchObject({
      status: 'authenticated',
      accessToken: 'restored',
    });
  });
});

describe('HTTP client with auth', () => {
  it('attaches the access token', async () => {
    useAuthStore.setState({ status: 'authenticated', user: makeUser(), accessToken: 'abc' });
    const calls = mockServer(() => ok({ fine: true }));
    await apiGet('/me');
    expect(calls[0]?.authorization).toBe('Bearer abc');
  });

  it('renews an expired access token once and replays the request', async () => {
    useAuthStore.setState({ status: 'authenticated', user: makeUser(), accessToken: 'expired' });
    const calls = mockServer((config) => {
      if (config.url === '/auth/refresh') return ok(session('renewed'));
      return config.headers.Authorization === 'Bearer renewed'
        ? ok({ name: 'Amit' })
        : unauthenticated;
    });
    expect(await apiGet('/me')).toEqual({ name: 'Amit' });
    expect(calls.map((c) => [c.url, c.authorization])).toEqual([
      ['/me', 'Bearer expired'],
      ['/auth/refresh', 'Bearer expired'],
      ['/me', 'Bearer renewed'],
    ]);
  });

  it('gives up after one renewal attempt', async () => {
    useAuthStore.setState({ status: 'authenticated', user: makeUser(), accessToken: 'expired' });
    const calls = mockServer(() => unauthenticated);
    await expect(apiGet('/me')).rejects.toMatchObject({
      status: 401,
      errorCode: 'UNAUTHENTICATED',
    });
    expect(calls.map((c) => c.url)).toEqual(['/me', '/auth/refresh']);
    expect(useAuthStore.getState().status).toBe('anonymous');
  });

  it('never tries to renew for auth endpoints', async () => {
    const calls = mockServer(() => unauthenticated);
    await expect(http.post('/auth/login', {})).rejects.toMatchObject({ status: 401 });
    expect(calls).toHaveLength(1);
  });
});

describe('session expiry and sign-out', () => {
  it('sends the double-submit CSRF token on refresh and logout', async () => {
    document.cookie = 'zp_csrf=csrf-token-123';
    const headers: (string | undefined)[] = [];
    http.defaults.adapter = async (config) => {
      headers.push(config.headers['X-CSRF-Token'] as string | undefined);
      return { status: 200, statusText: '', headers: {}, config, data: ok(session('t')).data };
    };
    await refreshSession();
    await signOut();
    expect(headers).toEqual(['csrf-token-123', 'csrf-token-123']);
    document.cookie = 'zp_csrf=; expires=Thu, 01 Jan 1970 00:00:00 GMT';
  });

  it('keeps booking drafts and says so when a signed-in session expires', async () => {
    useAuthStore.setState({ status: 'authenticated', user: makeUser(), accessToken: 'old' });
    useBusDraft.getState().setReference('ZB0000000BBB');
    mockServer(() => unauthenticated);
    expect(await refreshSession()).toBeNull();
    expect(useAuthStore.getState().status).toBe('anonymous');
    expect(useBusDraft.getState().reference).toBe('ZB0000000BBB');
    render(<Toaster />);
    expect(await screen.findByTestId('toast-error')).toHaveTextContent(
      'Your session expired. Please log in again.',
    );
  });

  it('clears drafts on sign-out and signs out the other tabs', async () => {
    mockServer(() => ok(null));
    useAuthStore.setState({ status: 'authenticated', user: makeUser(), accessToken: 'a' });
    useBusDraft.getState().setReference('ZB0000000BBB');
    const otherTab = new BroadcastChannel('zproo-auth');
    const received = new Promise<unknown>((resolve) =>
      otherTab.addEventListener('message', (e) => resolve(e.data), { once: true }),
    );
    await signOut();
    expect(useBusDraft.getState().reference).toBeNull();
    expect(await received).toEqual({ type: 'logout' });
    otherTab.close();
  });

  it('signs this tab out when another tab signs out', async () => {
    useAuthStore.setState({ status: 'authenticated', user: makeUser(), accessToken: 'a' });
    const otherTab = new BroadcastChannel('zproo-auth');
    otherTab.postMessage({ type: 'logout' });
    await vi.waitFor(() => expect(useAuthStore.getState().status).toBe('anonymous'));
    otherTab.close();
  });
});
