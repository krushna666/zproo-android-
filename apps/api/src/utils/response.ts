import type { ApiFailure, ApiSuccess, ErrorCode, ErrorDetails } from '@zproo/types';
import type { Response } from 'express';

export function sendSuccess<T>(res: Response, data: T, message = 'Success', status = 200) {
  const body: ApiSuccess<T> = { success: true, message, data };
  return res.status(status).json(body);
}

/** The one error shape: `{ error: { code, message, requestId, details? } }`. */
export function buildFailure(
  message: string,
  code: ErrorCode,
  extras: { details?: ErrorDetails | undefined; requestId?: string | undefined } = {},
): ApiFailure {
  return {
    error: {
      code,
      message,
      ...(extras.requestId && { requestId: extras.requestId }),
      ...(extras.details && { details: extras.details }),
    },
  };
}
