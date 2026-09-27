/// <reference types="vite/client" />

// The only env the browser bundle reads. Everything else is server-side (SPEC §6.6: no secrets in the bundle).
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  readonly VITE_SENTRY_DSN?: string;
  readonly VITE_APP_ORIGIN?: string;
  /** 'true' only in the Playwright build: enables src/data/mock behind isMock(). */
  readonly VITE_E2E_MOCK?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** Injected by vite.config.ts from BASE_PATH ('/' by default). */
declare const __BASE_PATH__: string;
