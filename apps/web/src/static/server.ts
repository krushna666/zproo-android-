import type { ApiFailure, ApiSuccess } from '@zproo/types';
import {
  AxiosError,
  AxiosHeaders,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios';
import { authRoutes } from './auth';
import { bookingRoutes } from './bookings';
import { busRoutes } from './buses';
import { StaticError, type StaticRequest, type StaticResult } from './core';
import { flightRoutes } from './flights';

const ROUTERS = [authRoutes, flightRoutes, busRoutes, bookingRoutes];

async function route(req: StaticRequest): Promise<StaticResult> {
  if (req.method === 'GET' && req.path.startsWith('/health')) {
    return {
      data: {
        status: 'ok',
        version: 'static',
        uptimeSeconds: 0,
        timestamp: new Date().toISOString(),
        checks: {},
      },
    };
  }
  if (req.path.startsWith('/admin')) {
    throw new StaticError(403, 'FORBIDDEN', 'The admin panel needs the ZPROO GO server');
  }
  for (const router of ROUTERS) {
    const result = await router(req);
    if (result) return result;
  }
  throw new StaticError(404, 'NOT_FOUND', `Route ${req.method} ${req.path} not found`);
}

function toRequest(config: InternalAxiosRequestConfig): StaticRequest {
  const url = new URL(config.url ?? '/', 'http://static.local');
  const params: Record<string, string> = Object.fromEntries(url.searchParams);
  for (const [key, value] of Object.entries((config.params ?? {}) as Record<string, unknown>)) {
    if (value !== undefined && value !== null) params[key] = String(value);
  }
  let body: unknown = config.data;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      /* not JSON: leave as is */
    }
  }
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(AxiosHeaders.from(config.headers).toJSON())) {
    if (typeof value === 'string') headers[key.toLowerCase()] = value;
  }
  return {
    method: (config.method ?? 'get').toUpperCase(),
    path: url.pathname,
    params,
    body,
    headers,
  };
}

/** A short, realistic network delay (none in tests). */
const pause = () =>
  import.meta.env.MODE === 'test'
    ? Promise.resolve()
    : new Promise((resolve) => setTimeout(resolve, 120 + Math.random() * 180));

/**
 * Axios adapter for static mode: answers every API call in the browser with the same envelopes,
 * status codes and error codes as the real API, so the website works unchanged.
 */
export async function staticAdapter(config: InternalAxiosRequestConfig): Promise<AxiosResponse> {
  await pause();
  const respond = (status: number, data: ApiSuccess<unknown> | ApiFailure): AxiosResponse => ({
    data,
    status,
    statusText: String(status),
    headers: new AxiosHeaders({ 'content-type': 'application/json' }),
    config,
    request: null,
  });
  try {
    const result = await route(toRequest(config));
    return respond(result.status ?? 200, {
      success: true,
      message: result.message ?? 'Success',
      data: result.data,
    });
  } catch (err) {
    const e =
      err instanceof StaticError
        ? err
        : new StaticError(500, 'INTERNAL_ERROR', 'Something went wrong. Please try again.');
    if (!(err instanceof StaticError)) console.error(err);
    const response = respond(e.status, {
      success: false,
      message: e.message,
      errorCode: e.errorCode,
      data: null,
      ...(e.details && { details: e.details }),
    });
    throw new AxiosError(e.message, undefined, config, null, response);
  }
}
