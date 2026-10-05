import { createHash } from 'node:crypto';
import { Prisma, type PrismaClient } from '@prisma/client';
import { clock } from '../lib/testContext';

const TTL_MS = 24 * 60 * 60_000;

/** JSON with object keys sorted, so `{a,b}` and `{b,a}` hash the same. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

export const requestHash = (body: unknown) =>
  createHash('sha256').update(canonicalJson(body)).digest('hex');

export type Claim =
  | { kind: 'new'; id: string }
  | { kind: 'replay'; status: number; body: unknown }
  | { kind: 'conflict' }
  | { kind: 'in-progress' };

/** Stored responses for `Idempotency-Key` retries (see IdempotencyKey in the schema). */
export class IdempotencyService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly now: () => Date = clock.now,
  ) {}

  /**
   * Claims a key for this request. A new key is recorded IN_PROGRESS; a completed one with the
   * same body is replayed; a different body is a conflict. Expired entries are forgotten.
   */
  async claim(userId: string, scope: string, key: string, hash: string): Promise<Claim> {
    for (let attempt = 0; attempt < 3; attempt++) {
      const existing = await this.prisma.idempotencyKey.findUnique({
        where: { userId_scope_key: { userId, scope, key } },
      });
      if (existing && existing.expiresAt <= this.now()) {
        await this.prisma.idempotencyKey.deleteMany({ where: { id: existing.id } });
        continue;
      }
      if (existing) {
        if (existing.requestHash !== hash) return { kind: 'conflict' };
        if (existing.state === 'COMPLETED' && existing.responseStatus !== null)
          return { kind: 'replay', status: existing.responseStatus, body: existing.responseBody };
        return { kind: 'in-progress' };
      }
      try {
        const created = await this.prisma.idempotencyKey.create({
          data: {
            userId,
            scope,
            key,
            requestHash: hash,
            expiresAt: new Date(this.now().getTime() + TTL_MS),
          },
        });
        return { kind: 'new', id: created.id };
      } catch (err) {
        // A concurrent request with the same key won the insert; read it on the next pass.
        if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002'))
          throw err;
      }
    }
    return { kind: 'in-progress' };
  }

  complete(id: string, status: number, body: unknown) {
    return this.prisma.idempotencyKey.updateMany({
      where: { id },
      data: {
        state: 'COMPLETED',
        responseStatus: status,
        responseBody: (body ?? Prisma.JsonNull) as Prisma.InputJsonValue,
      },
    });
  }

  /** Transient failures are not remembered, so the client can retry with the same key. */
  release(id: string) {
    return this.prisma.idempotencyKey.deleteMany({ where: { id } });
  }

  purgeExpired() {
    return this.prisma.idempotencyKey.deleteMany({ where: { expiresAt: { lt: this.now() } } });
  }
}
