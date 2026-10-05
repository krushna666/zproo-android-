import { Redis } from 'ioredis';
import { pino } from 'pino';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { RELEASE_HOLDS_LOCK, releaseExpiredHolds } from '../src/jobs/releaseExpiredHolds';
import { acquireLock, withLock } from '../src/lib/lock';

const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  keyPrefix: `test:${process.pid}:`,
});
const logger = pino({ level: 'silent' });

afterAll(async () => {
  await redis.quit();
});

beforeEach(async () => {
  await redis.del(RELEASE_HOLDS_LOCK, 'lock:a');
});

const fakeServices = () => ({
  bookings: { expireHolds: vi.fn().mockResolvedValue(2) },
  payments: { issuePending: vi.fn().mockResolvedValue(1) },
  idempotency: { purgeExpired: vi.fn().mockResolvedValue({ count: 0 }) },
});

describe('Redis lock', () => {
  it('lets only one holder in and releases only its own lock', async () => {
    const first = await acquireLock(redis, 'lock:a', 5_000);
    expect(first).not.toBeNull();
    expect(await acquireLock(redis, 'lock:a', 5_000)).toBeNull();
    await first?.release();
    const second = await acquireLock(redis, 'lock:a', 5_000);
    expect(second).not.toBeNull();
    // A stale holder releasing again must not drop the new holder's lock.
    await first?.release();
    expect(await acquireLock(redis, 'lock:a', 5_000)).toBeNull();
    await second?.release();
  });

  it('releases the lock even if the work throws', async () => {
    await expect(
      withLock(redis, 'lock:a', 5_000, async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(await acquireLock(redis, 'lock:a', 5_000)).not.toBeNull();
  });
});

describe('release-expired-holds job', () => {
  it('runs once when two instances tick at the same time', async () => {
    await redis.ping();
    const a = fakeServices();
    const b = fakeServices();
    let releaseA: () => void = () => {};
    a.bookings.expireHolds.mockImplementation(
      () => new Promise((resolve) => (releaseA = () => resolve(2))),
    );
    const runA = releaseExpiredHolds(a as never, redis, logger);
    await vi.waitFor(() => expect(a.bookings.expireHolds).toHaveBeenCalled());
    const runB = await releaseExpiredHolds(b as never, redis, logger);
    releaseA();
    expect(await runA).toEqual({ ran: true, expired: 2, issued: 1 });
    expect(runB).toEqual({ ran: false, expired: 0, issued: 0 });
    expect(b.bookings.expireHolds).not.toHaveBeenCalled();
  });

  it('still runs without Redis (state changes are conditional)', async () => {
    const services = fakeServices();
    expect(await releaseExpiredHolds(services as never, undefined, logger)).toEqual({
      ran: true,
      expired: 2,
      issued: 1,
    });
  });
});
