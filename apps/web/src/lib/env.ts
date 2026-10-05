/**
 * Public (browser) configuration. Never put secrets in VITE_* variables — they ship to users.
 * Validated by hand to keep a schema library out of the entry bundle.
 */
function readUrl(name: 'VITE_SITE_URL', value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    return new URL(value).origin;
  } catch {
    throw new Error(`${name} must be an absolute URL`);
  }
}

const apiUrl = import.meta.env.VITE_API_URL || '/api';

export const env = {
  apiUrl: apiUrl.replace(/\/$/, ''),
  /**
   * Static mode (the default): the site runs entirely in the browser with built-in demo data and
   * needs no server. Set VITE_DATA_SOURCE=api to use the ZPROO GO API instead.
   */
  staticMode: import.meta.env.VITE_DATA_SOURCE !== 'api',
  /** Absolute site URL. Empty only when prerendering without VITE_SITE_URL (canonical links are then omitted). */
  siteUrl:
    readUrl('VITE_SITE_URL', import.meta.env.VITE_SITE_URL) ??
    (typeof window === 'undefined' ? '' : window.location.origin),
};
