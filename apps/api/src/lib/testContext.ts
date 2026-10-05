import { AsyncLocalStorage } from 'node:async_hooks';
import type { RequestHandler } from 'express';
import { z } from 'zod';

/**
 * Failure modes the mock providers can be told to simulate. Honoured only when NODE_ENV=test:
 * the middleware that reads them is never installed otherwise.
 */
export const MOCK_SCENARIOS = [
  'price_changed',
  'seat_taken',
  'room_sold_out',
  'fare_unavailable',
  'provider_down',
  'slow',
  'no_results',
  'issue_pending',
] as const;
export type MockScenario = (typeof MOCK_SCENARIOS)[number];

interface TestContext {
  /** Milliseconds added to the real clock (from X-Test-Now). */
  offsetMs: number;
  scenario: MockScenario | undefined;
}

const storage = new AsyncLocalStorage<TestContext>();

/**
 * The API's clock. Outside tests it is the real time. In NODE_ENV=test a request may move it
 * with `X-Test-Now: <ISO datetime>` so hold timers, OTP cooldowns and "today" are controllable.
 */
export const clock = {
  now: (): Date => new Date(Date.now() + (storage.getStore()?.offsetMs ?? 0)),
};

/** The mock scenario of the current request, if any (test environment only). */
export function currentScenario(): MockScenario | undefined {
  return storage.getStore()?.scenario;
}

/** Runs `fn` with a given test context (jobs and unit tests). */
export function withTestContext<T>(
  context: { now?: Date; scenario?: MockScenario },
  fn: () => T,
): T {
  return storage.run(
    {
      offsetMs: context.now ? context.now.getTime() - Date.now() : 0,
      scenario: context.scenario,
    },
    fn,
  );
}

const scenarioHeader = z.enum(MOCK_SCENARIOS);
const nowHeader = z.iso.datetime({ offset: true });

/**
 * Reads `X-Test-Now` and `X-Mock-Scenario`. Mounted by createApp only when NODE_ENV=test, so
 * these headers are ignored in development and production.
 */
export const testContextMiddleware: RequestHandler = (req, _res, next) => {
  const now = nowHeader.safeParse(req.get('X-Test-Now'));
  const scenario = scenarioHeader.safeParse(req.get('X-Mock-Scenario'));
  storage.run(
    {
      offsetMs: now.success ? Date.parse(now.data) - Date.now() : 0,
      scenario: scenario.success ? scenario.data : undefined,
    },
    () => next(),
  );
};
