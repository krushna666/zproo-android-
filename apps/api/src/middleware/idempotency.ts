import { idempotencyKeySchema } from '@zproo/validation';
import type { Request, RequestHandler } from 'express';
import { requestHash, type IdempotencyService } from '../services/idempotency.service';
import { IdempotencyConflictError, InvalidStateError, ValidationError } from '../utils/errors';
import { requireAuth } from './auth';

type WithKey = Request & { idempotencyKey?: string };

/** How long a retry waits for the first request with the same key to finish. */
const WAIT_MS = 8_000;
const POLL_MS = 150;

function parseKey(req: Request): string {
  const result = idempotencyKeySchema.safeParse(req.get('Idempotency-Key') ?? '');
  if (!result.success) {
    throw new ValidationError([
      {
        path: 'headers.idempotency-key',
        message: 'Send a unique Idempotency-Key header (a UUID)',
      },
    ]);
  }
  return result.data;
}

/** Responses worth replaying: success and deterministic client errors (not 429 or 5xx). */
const storable = (status: number) => status < 500 && status !== 429;

/**
 * Makes a POST safe to retry (double click, flaky network). Requires an `Idempotency-Key` UUID
 * header and an authenticated user. The first request runs; a retry with the same key and body
 * gets the stored response (`Idempotent-Replayed: true`); the same key with a different body is
 * 409 IDEMPOTENCY_CONFLICT. Keys are scoped per user and route and kept for 24 hours.
 */
export function idempotent(store: IdempotencyService): RequestHandler {
  return async (req, res, next) => {
    const key = parseKey(req);
    (req as WithKey).idempotencyKey = key;
    const userId = requireAuth(req).userId;
    const scope = `${req.method} ${req.baseUrl}${req.path}`;
    const hash = requestHash(req.body);

    const deadline = Date.now() + WAIT_MS;
    let claim = await store.claim(userId, scope, key, hash);
    while (claim.kind === 'in-progress' && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, POLL_MS));
      claim = await store.claim(userId, scope, key, hash);
    }
    if (claim.kind === 'conflict') throw new IdempotencyConflictError();
    if (claim.kind === 'in-progress')
      throw new InvalidStateError('This request is still being processed. Please wait.');
    if (claim.kind === 'replay') {
      res.setHeader('Idempotent-Replayed', 'true');
      res.status(claim.status).json(claim.body);
      return;
    }

    const id = claim.id;
    const send = res.json.bind(res);
    let settled = false;
    // Persist the response before it goes out, so an immediate retry can replay it.
    res.json = (body: unknown) => {
      if (settled) return send(body);
      settled = true;
      const status = res.statusCode;
      const save = storable(status) ? store.complete(id, status, body) : store.release(id);
      save.then(
        () => send(body),
        (err: unknown) => {
          req.log.error({ err }, 'Saving idempotent response failed');
          send(body);
        },
      );
      return res;
    };
    // A response that never went through res.json (e.g. the client hung up) is forgotten.
    res.on('close', () => {
      if (!settled) void store.release(id);
    });
    next();
  };
}

/** The key accepted by `idempotent()`, for services that also record it. */
export function idempotencyKey(req: Request): string {
  const key = (req as WithKey).idempotencyKey;
  if (!key) throw new Error('idempotent() middleware missing');
  return key;
}
