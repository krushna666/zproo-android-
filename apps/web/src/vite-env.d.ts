/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_SITE_URL?: string;
  /** Enables "Continue with Google" when set. */
  readonly VITE_GOOGLE_CLIENT_ID?: string;
  /** "static" (default): demo data in the browser, no server. "api": use the ZPROO GO API. */
  readonly VITE_DATA_SOURCE?: 'static' | 'api';
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
