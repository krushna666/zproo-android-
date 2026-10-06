import { currentScenario } from '../lib/testContext';
import type { Logger } from 'pino';
import { AppError, ProviderError } from '../utils/errors';

export interface ResilienceOptions<T> {
  /** Supplier name for logs and errors, e.g. `bus:mock`. */
  name: string;
  logger: Logger;
  /** Idempotent read methods: safe to retry. Everything else (hold, issue, release) never is. */
  reads: readonly (keyof T & string)[];
  timeoutMs?: number;
  retries?: number;
  /** Failures within `windowMs` that open the circuit. */
  failureThreshold?: number;
  windowMs?: number;
  /** How long an open circuit fails fast before letting one trial call through. */
  openMs?: number;
  /** Back-off base in ms (attempt n waits base·2ⁿ plus up to 50% jitter). */
  backoffMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

/** Errors that mean the supplier is unhealthy (count towards the breaker, may be retried). */
function isSupplierFailure(err: unknown): boolean {
  return !(err instanceof AppError) || err.statusCode >= 500;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Wraps a supplier (BusProvider, FlightProvider, HotelProvider…) so every call gets: a timeout
 * (8 s), retries with exponential back-off and jitter for reads only, a circuit breaker (opens
 * after 5 failures in 30 s and fails fast with PROVIDER_ERROR), mapping of unknown supplier errors
 * to PROVIDER_ERROR (their payload never reaches the client), and latency logging. Domain errors
 * (seat taken, price changed — 4xx AppErrors) pass straight through and are not failures.
 */
export function withResilience<T extends object>(provider: T, options: ResilienceOptions<T>): T {
  const timeoutMs = options.timeoutMs ?? 8_000;
  const retries = options.retries ?? 2;
  const threshold = options.failureThreshold ?? 5;
  const windowMs = options.windowMs ?? 30_000;
  const openMs = options.openMs ?? 30_000;
  const backoffMs = options.backoffMs ?? 200;
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? defaultSleep;
  const reads = new Set<string>(options.reads);

  // One breaker per X-Mock-Scenario (test builds only): a simulated outage in one end-to-end test
  // must not open the circuit for the others. In production there is never a scenario: one breaker.
  const breakers = new Map<string, { failures: number[]; openUntil: number }>();
  const breaker = () => {
    const scope = currentScenario() ?? '';
    let b = breakers.get(scope);
    if (!b) {
      b = { failures: [], openUntil: 0 };
      breakers.set(scope, b);
    }
    return b;
  };

  const unavailable = () =>
    new ProviderError("We couldn't reach the operator right now. Please try again.", options.name);

  function recordFailure() {
    const b = breaker();
    const t = now();
    b.failures = [...b.failures.filter((f) => t - f < windowMs), t];
    if (b.failures.length >= threshold) {
      b.openUntil = t + openMs;
      b.failures = [];
      options.logger.warn({ provider: options.name }, 'Supplier circuit opened');
    }
  }

  async function withTimeout<R>(work: Promise<R>): Promise<R> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new SupplierTimeout()), timeoutMs);
    });
    try {
      return await Promise.race([work, timeout]);
    } finally {
      clearTimeout(timer);
    }
  }

  async function call(method: string, fn: () => Promise<unknown>): Promise<unknown> {
    if (now() < breaker().openUntil) throw unavailable();
    const attempts = reads.has(method) ? retries + 1 : 1;
    for (let attempt = 0; ; attempt++) {
      const started = now();
      try {
        const result = await withTimeout(fn());
        options.logger.debug(
          { provider: options.name, method, ms: now() - started },
          'Supplier call',
        );
        breaker().failures = [];
        return result;
      } catch (err) {
        options.logger.warn(
          {
            provider: options.name,
            method,
            ms: now() - started,
            attempt: attempt + 1,
            err: err instanceof Error ? { name: err.name, message: err.message } : undefined,
          },
          'Supplier call failed',
        );
        if (!isSupplierFailure(err)) throw err;
        recordFailure();
        if (attempt + 1 >= attempts || now() < breaker().openUntil) {
          throw err instanceof ProviderError ? err : unavailable();
        }
        await sleep(backoffMs * 2 ** attempt * (1 + Math.random() * 0.5));
      }
    }
  }

  return new Proxy(provider, {
    get(target, property, receiver) {
      const value: unknown = Reflect.get(target, property, receiver);
      if (typeof value !== 'function' || typeof property !== 'string') return value;
      return (...args: unknown[]) =>
        call(property, () =>
          Promise.resolve((value as (...a: unknown[]) => unknown).apply(target, args)),
        );
    },
  });
}

class SupplierTimeout extends Error {
  constructor() {
    super('Supplier call timed out');
    this.name = 'SupplierTimeout';
  }
}
