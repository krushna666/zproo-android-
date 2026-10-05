import { ProviderError } from '../utils/errors';
import { currentScenario } from './testContext';

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Generic supplier failures for mock providers, driven by X-Mock-Scenario (NODE_ENV=test only):
 * `provider_down` fails like an unreachable supplier, `slow` answers after 3 s.
 */
export async function simulateSupplier(): Promise<void> {
  const scenario = currentScenario();
  if (scenario === 'provider_down')
    throw new ProviderError("We couldn't reach the operator right now. Please try again.", 'mock');
  if (scenario === 'slow') await sleep(3_000);
}
