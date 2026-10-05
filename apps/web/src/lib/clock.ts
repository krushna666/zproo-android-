import { testClockOffsetMs } from './testHooks';

/** Server clock minus this browser's clock, learned from `serverNow` in API responses. */
let serverOffsetMs = 0;

/**
 * Remembers how far this device's clock is from the server's (phones are often minutes off), so
 * hold countdowns end when the server's hold does. Differences under a second are ignored.
 */
export function syncServerClock(serverNow: string | null | undefined): void {
  const server = serverNow ? Date.parse(serverNow) : Number.NaN;
  if (Number.isNaN(server)) return;
  const offset = server - (Date.now() + testClockOffsetMs());
  serverOffsetMs = Math.abs(offset) < 1_000 ? 0 : offset;
}

/** The app's clock: real time, corrected to the server's, shifted by the E2E test clock in test builds. */
export function clientNow(): number {
  return Date.now() + testClockOffsetMs() + serverOffsetMs;
}

/** Test helper. */
export function resetServerClock(): void {
  serverOffsetMs = 0;
}
