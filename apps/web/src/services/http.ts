import type { ApiFailure, ApiSuccess, ErrorCode, ErrorDetails } from '@zproo/types';
import axios, { AxiosError, type AxiosRequestConfig, type InternalAxiosRequestConfig } from 'axios';
import { env } from '@/lib/env';

export type ClientErrorCode = ErrorCode | 'NETWORK_ERROR' | 'TIMEOUT' | 'OFFLINE';

/** Normalised error for every failed API call; UI code never inspects raw Axios errors. */
export class ApiClientError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly errorCode: ClientErrorCode,
    readonly details: ErrorDetails = {},
    readonly requestId?: string,
    /** Seconds from the Retry-After header (429). */
    readonly retryAfter?: number,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }

  /** Field name → message for VALIDATION_ERROR (empty otherwise). */
  get fieldErrors(): Record<string, string> {
    return this.details.fields ?? {};
  }
}

function isApiFailure(value: unknown): value is ApiFailure {
  if (typeof value !== 'object' || value === null || !('error' in value)) return false;
  const error = (value as ApiFailure).error as unknown;
  return typeof error === 'object' && error !== null && 'code' in error && 'message' in error;
}

const isOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false;

export function toApiClientError(error: unknown): ApiClientError {
  if (error instanceof ApiClientError) return error;
  if (error instanceof AxiosError) {
    const body: unknown = error.response?.data;
    if (error.response && isApiFailure(body)) {
      const header: unknown = error.response.headers['retry-after'];
      const retryAfter = Number(header ?? body.error.details?.retryAfter);
      return new ApiClientError(
        body.error.message,
        error.response.status,
        body.error.code,
        body.error.details,
        body.error.requestId,
        Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined,
      );
    }
    if (error.code === AxiosError.ECONNABORTED || error.code === AxiosError.ETIMEDOUT) {
      return new ApiClientError('The request timed out. Please try again.', 0, 'TIMEOUT');
    }
    if (!error.response) {
      return isOffline()
        ? new ApiClientError("You're offline. Check your connection and try again.", 0, 'OFFLINE')
        : new ApiClientError(
            'ZPROO GO is having trouble right now. Please try again in a moment.',
            0,
            'NETWORK_ERROR',
          );
    }
    return new ApiClientError(
      'Something went wrong. Please try again.',
      error.response.status,
      'INTERNAL_ERROR',
    );
  }
  return new ApiClientError('Something went wrong. Please try again.', 0, 'INTERNAL_ERROR');
}

export const http = axios.create({
  baseURL: env.apiUrl,
  timeout: 20_000,
  withCredentials: true,
  headers: { Accept: 'application/json' },
  // Static mode answers API calls in the browser; the engine loads on the first call.
  ...(env.staticMode && {
    adapter: async (config: InternalAxiosRequestConfig) =>
      (await import('@/static/server')).staticAdapter(config),
  }),
});

interface AuthBridge {
  getAccessToken: () => string | null;
  /** Renews the session; resolves to the new access token, or null when signed out. */
  refresh: () => Promise<string | null>;
}

let auth: AuthBridge = { getAccessToken: () => null, refresh: async () => null };

/** Registered by the auth feature at startup (keeps this module free of auth imports). */
export function configureAuth(bridge: AuthBridge): void {
  auth = bridge;
}

type RetriableConfig = InternalAxiosRequestConfig & { _retried?: boolean };

http.interceptors.request.use((config) => {
  const token = auth.getAccessToken();
  if (token && !config.headers.Authorization) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

http.interceptors.response.use(undefined, async (error: unknown) => {
  const apiError = toApiClientError(error);
  const config =
    error instanceof AxiosError ? (error.config as RetriableConfig | undefined) : undefined;
  // An expired access token: renew once and replay the request. Auth endpoints never retry.
  if (apiError.status === 401 && config && !config._retried && !config.url?.startsWith('/auth/')) {
    config._retried = true;
    const token = await auth.refresh().catch(() => null);
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
      return http.request(config);
    }
  }
  return Promise.reject(apiError);
});

/** GET returning the unwrapped `data` of the success envelope. */
export async function apiGet<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
  const res = await http.get<ApiSuccess<T>>(url, config);
  return res.data.data;
}

export async function apiPost<T, B = unknown>(
  url: string,
  body?: B,
  config?: AxiosRequestConfig,
): Promise<T> {
  const res = await http.post<ApiSuccess<T>>(url, body, config);
  return res.data.data;
}
