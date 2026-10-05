import { AxiosError, AxiosHeaders } from 'axios';
import { describe, expect, it } from 'vitest';
import { ApiClientError, toApiClientError } from './http';

function axiosErrorWith(status: number, data: unknown) {
  const config = { headers: new AxiosHeaders() };
  return new AxiosError('failed', 'ERR_BAD_RESPONSE', config, null, {
    status,
    statusText: '',
    headers: {},
    config,
    data,
  });
}

describe('toApiClientError', () => {
  it('maps the API error envelope', () => {
    const error = toApiClientError(
      axiosErrorWith(400, {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Please fix the errors',
          requestId: 'req-12345678',
          details: {
            fields: { phone: 'Enter a valid 10-digit mobile number' },
            issues: [{ path: 'body.phone', message: 'Enter a valid 10-digit mobile number' }],
          },
        },
      }),
    );
    expect(error).toBeInstanceOf(ApiClientError);
    expect(error).toMatchObject({
      status: 400,
      errorCode: 'VALIDATION_ERROR',
      message: 'Please fix the errors',
      requestId: 'req-12345678',
    });
    expect(error.fieldErrors).toEqual({ phone: 'Enter a valid 10-digit mobile number' });
  });

  it('maps network failures', () => {
    const error = toApiClientError(new AxiosError('Network Error', 'ERR_NETWORK'));
    expect(error).toMatchObject({ status: 0, errorCode: 'NETWORK_ERROR' });
  });

  it('maps timeouts', () => {
    expect(toApiClientError(new AxiosError('timeout', AxiosError.ECONNABORTED)).errorCode).toBe(
      'TIMEOUT',
    );
  });

  it('does not expose unexpected response bodies', () => {
    const error = toApiClientError(axiosErrorWith(502, '<html>Bad gateway</html>'));
    expect(error).toMatchObject({
      status: 502,
      errorCode: 'INTERNAL_ERROR',
      message: 'Something went wrong. Please try again.',
    });
  });

  it('reads Retry-After on 429', () => {
    const config = { headers: new AxiosHeaders() };
    const error = toApiClientError(
      new AxiosError('limited', 'ERR_BAD_REQUEST', config, null, {
        status: 429,
        statusText: '',
        headers: { 'retry-after': '37' },
        config,
        data: { error: { code: 'RATE_LIMITED', message: 'Too many requests' } },
      }),
    );
    expect(error).toMatchObject({ errorCode: 'RATE_LIMITED', retryAfter: 37 });
  });
});
