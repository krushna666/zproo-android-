/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_SITE_URL?: string;
  /** Enables "Continue with Google" when set. */
  readonly VITE_GOOGLE_CLIENT_ID?: string;
  /** "static" (default): demo data in the browser, no server. "api": use the ZPROO GO API. */
  readonly VITE_DATA_SOURCE?: 'static' | 'api';
  /** E2E builds only: forward test cookies as X-Mock-Scenario / X-Test-Now headers. */
  readonly VITE_TEST_HOOKS?: 'true' | 'false';
  /** UPI ID for the payment QR code (public). */
  readonly VITE_UPI_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
