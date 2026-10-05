import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  document.cookie = 'zproo_mock_scenario=; expires=Thu, 01 Jan 1970 00:00:00 GMT';
  document.cookie = 'zproo_clock_offset_ms=; expires=Thu, 01 Jan 1970 00:00:00 GMT';
});

describe('E2E test hooks', () => {
  it('are inert unless the build enables them', async () => {
    vi.stubEnv('VITE_TEST_HOOKS', 'false');
    document.cookie = 'zproo_mock_scenario=seat_taken';
    const { testHeaders, testClockOffsetMs } = await import('./testHooks');
    expect(testHeaders()).toEqual({});
    expect(testClockOffsetMs()).toBe(0);
  });

  it('forward the scenario and test clock cookies as headers in test builds', async () => {
    vi.stubEnv('VITE_TEST_HOOKS', 'true');
    document.cookie = 'zproo_mock_scenario=price_changed';
    document.cookie = `zproo_clock_offset_ms=${16 * 60_000}`;
    const { testHeaders } = await import('./testHooks');
    const headers = testHeaders();
    expect(headers['X-Mock-Scenario']).toBe('price_changed');
    expect(Date.parse(headers['X-Test-Now'] ?? '') - Date.now()).toBeGreaterThan(15 * 60_000);
  });
});
