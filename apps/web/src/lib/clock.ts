import { testClockOffsetMs } from './testHooks';

/** The app's clock: real time, shifted only by the E2E test clock in test builds. */
export function clientNow(): number {
  return Date.now() + testClockOffsetMs();
}
