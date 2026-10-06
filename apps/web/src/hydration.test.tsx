import { act, StrictMode } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { createBrowserRouter, matchRoutes, type HydrationState } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import indexable from '../scripts/indexable-pages.json';
import { App } from './App';
import { render } from './entry-server';
import { routes } from './routes/routes';

/**
 * The prerendered HTML must hydrate without a mismatch: a mismatch makes React throw the page
 * away and render it again (slow on phones, and an error in the console).
 */
describe('hydrating prerendered pages', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    window.history.replaceState(null, '', '/');
  });

  it.each(indexable)('%s hydrates without a mismatch', async (path) => {
    window.history.replaceState(null, '', path);
    const html = await render(path);
    const container = document.createElement('div');
    container.id = 'root';
    container.innerHTML = html;
    document.body.append(container);

    // What the router's data <script> would set, and the lazy routes main.tsx loads first.
    const script = container.querySelector('script')?.textContent ?? '';
    const data = /__staticRouterHydrationData = JSON\.parse\((.*)\);?\s*$/s.exec(script)?.[1];
    const hydrationData = data
      ? (JSON.parse(JSON.parse(data) as string) as HydrationState)
      : undefined;
    for (const m of matchRoutes(routes, window.location) ?? []) {
      if (!m.route.lazy) continue;
      const loader = m.route.lazy as () => Promise<Record<string, unknown>>;
      Object.assign(m.route, { ...(await loader()), lazy: undefined });
    }

    const problems: unknown[] = [];
    const consoleError = vi.spyOn(console, 'error').mockImplementation((...args) => {
      problems.push(args.join(' '));
    });
    const router = createBrowserRouter(routes, { ...(hydrationData && { hydrationData }) });
    await act(async () => {
      hydrateRoot(
        container,
        <StrictMode>
          <App router={router} />
        </StrictMode>,
        {
          onRecoverableError: (error) => problems.push(error),
          onCaughtError: (error) => problems.push(error),
        },
      );
    });
    consoleError.mockRestore();
    expect(
      problems.map(String).filter((p) => /hydrat|getServerSnapshot|did not match/i.test(p)),
    ).toEqual([]);
  });
});
