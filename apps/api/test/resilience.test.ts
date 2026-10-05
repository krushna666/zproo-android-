import { pino } from 'pino';
import { describe, expect, it, vi } from 'vitest';
import { withResilience } from '../src/providers/resilience';
import { ProviderError, SeatUnavailableError } from '../src/utils/errors';

const logger = pino({ level: 'silent' });

function supplier() {
  return {
    name: 'fake',
    search: vi.fn<() => Promise<string>>(),
    hold: vi.fn<() => Promise<string>>(),
  };
}

function wrap(s: ReturnType<typeof supplier>, overrides: { now?: () => number } = {}) {
  return withResilience(s, {
    name: 'bus:fake',
    logger,
    reads: ['search'],
    timeoutMs: 50,
    sleep: async () => {},
    ...overrides,
  });
}

describe('withResilience', () => {
  it('retries reads twice, then maps the failure to PROVIDER_ERROR without leaking it', async () => {
    const s = supplier();
    s.search.mockRejectedValue(new Error('ECONNRESET upstream payload {secret}'));
    const err = await wrap(s)
      .search()
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect((err as Error).message).toBe(
      "We couldn't reach the operator right now. Please try again.",
    );
    expect(s.search).toHaveBeenCalledTimes(3);
  });

  it('recovers when a retry succeeds', async () => {
    const s = supplier();
    s.search.mockRejectedValueOnce(new Error('blip')).mockResolvedValue('trips');
    expect(await wrap(s).search()).toBe('trips');
  });

  it('never retries writes such as hold or issue', async () => {
    const s = supplier();
    s.hold.mockRejectedValue(new Error('timeout'));
    await expect(wrap(s).hold()).rejects.toBeInstanceOf(ProviderError);
    expect(s.hold).toHaveBeenCalledTimes(1);
  });

  it('times out slow calls', async () => {
    const s = supplier();
    s.search.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve('late'), 500)),
    );
    await expect(wrap(s).search()).rejects.toBeInstanceOf(ProviderError);
  });

  it('passes domain errors through without retrying or counting them', async () => {
    const s = supplier();
    s.hold.mockRejectedValue(new SeatUnavailableError(['L4']));
    const p = wrap(s);
    for (let i = 0; i < 6; i++) await expect(p.hold()).rejects.toBeInstanceOf(SeatUnavailableError);
    s.search.mockResolvedValue('ok');
    expect(await p.search()).toBe('ok'); // breaker still closed
  });

  it('opens the circuit after 5 failures in 30s, fails fast, then lets a trial through', async () => {
    let t = 1_000_000;
    const s = supplier();
    s.hold.mockRejectedValue(new Error('down'));
    const p = wrap(s, { now: () => t });
    for (let i = 0; i < 5; i++) await expect(p.hold()).rejects.toBeInstanceOf(ProviderError);
    expect(s.hold).toHaveBeenCalledTimes(5);
    await expect(p.hold()).rejects.toBeInstanceOf(ProviderError);
    expect(s.hold).toHaveBeenCalledTimes(5); // failed fast, supplier not called
    t += 30_001;
    s.hold.mockResolvedValue('held');
    expect(await p.hold()).toBe('held');
  });

  it('keeps non-function properties', () => {
    expect(wrap(supplier()).name).toBe('fake');
  });
});
