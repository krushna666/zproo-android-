import { randomUUID } from 'node:crypto';
import type { Redis } from 'ioredis';

/** Deletes the key only if it still holds our token (never another holder's lock). */
const RELEASE = `if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end`;

export interface Lock {
  release(): Promise<void>;
}

/**
 * Takes a Redis lock (`SET key token NX PX ttl`). Returns null if someone else holds it. The
 * TTL bounds how long a crashed holder can block others.
 */
export async function acquireLock(redis: Redis, key: string, ttlMs: number): Promise<Lock | null> {
  const token = randomUUID();
  const ok = await redis.set(key, token, 'PX', ttlMs, 'NX');
  if (ok !== 'OK') return null;
  return {
    release: async () => {
      await redis.eval(RELEASE, 1, key, token);
    },
  };
}

/** Runs `fn` while holding the lock; resolves to `{ ran: false }` if the lock is taken. */
export async function withLock<T>(
  redis: Redis,
  key: string,
  ttlMs: number,
  fn: () => Promise<T>,
): Promise<{ ran: true; result: T } | { ran: false }> {
  const lock = await acquireLock(redis, key, ttlMs);
  if (!lock) return { ran: false };
  try {
    return { ran: true, result: await fn() };
  } finally {
    await lock.release();
  }
}
