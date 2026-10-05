import { readCookie } from './cookies';

/**
 * End-to-end test hooks, compiled in only when VITE_TEST_HOOKS=true (the E2E build). Selenium sets
 * cookies; the app forwards them to the API, which honours them only with NODE_ENV=test:
 *  - `zproo_mock_scenario` → `X-Mock-Scenario` (forced supplier failures)
 *  - `zproo_clock_offset_ms` → moves the client clock and sends `X-Test-Now`
 */
export const testHooksEnabled = import.meta.env.VITE_TEST_HOOKS === 'true';

export function testClockOffsetMs(): number {
  if (!testHooksEnabled) return 0;
  const value = Number(readCookie('zproo_clock_offset_ms') ?? 0);
  return Number.isFinite(value) ? value : 0;
}

export function testHeaders(): Record<string, string> {
  if (!testHooksEnabled) return {};
  const headers: Record<string, string> = {};
  const scenario = readCookie('zproo_mock_scenario');
  if (scenario) headers['X-Mock-Scenario'] = scenario;
  const offset = testClockOffsetMs();
  if (offset !== 0) headers['X-Test-Now'] = new Date(Date.now() + offset).toISOString();
  return headers;
}
