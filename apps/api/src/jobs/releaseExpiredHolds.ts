import type { Redis } from 'ioredis';
import type { Logger } from 'pino';
import type { Services } from '../container';
import { withLock } from '../lib/lock';

export const RELEASE_HOLDS_LOCK = 'lock:job:release-expired-holds';

/**
 * Every minute: HELD / PAYMENT_PENDING bookings past `holdExpiresAt` become EXPIRED and their
 * inventory is released; paid bookings still waiting for the supplier are issued again.
 *
 * A Redis lock makes one instance do the work per tick. If Redis is unreachable the job still
 * runs: every state change is a conditional update, so concurrent runs cannot double-release.
 */
export async function releaseExpiredHolds(
  services: Pick<Services, 'bookings' | 'payments'>,
  redis: Redis | undefined,
  logger: Logger,
): Promise<{ ran: boolean; expired: number; issued: number }> {
  const work = async () => ({
    expired: await services.bookings.expireHolds(),
    issued: await services.payments.issuePending(),
  });
  if (!redis || redis.status !== 'ready') return { ran: true, ...(await work()) };
  try {
    const outcome = await withLock(redis, RELEASE_HOLDS_LOCK, 55_000, work);
    return outcome.ran ? { ran: true, ...outcome.result } : { ran: false, expired: 0, issued: 0 };
  } catch (err) {
    logger.warn({ err }, 'Hold-release lock unavailable; running without it');
    return { ran: true, ...(await work()) };
  }
}

export function scheduleReleaseExpiredHolds(
  services: Pick<Services, 'bookings' | 'payments'>,
  redis: Redis | undefined,
  logger: Logger,
  everyMs = 60_000,
): () => void {
  const timer = setInterval(() => {
    releaseExpiredHolds(services, redis, logger).catch((err: unknown) =>
      logger.error({ err }, 'Releasing expired holds failed'),
    );
  }, everyMs);
  timer.unref();
  return () => clearInterval(timer);
}
