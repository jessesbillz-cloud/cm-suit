# src/data — the only code that talks to Supabase

1. Nothing outside this folder imports `@supabase/supabase-js` or `tus-js-client`, calls `fetch`, or holds a Supabase URL (lint enforces it).
2. One client (`client.ts`), typed with the generated `database.types.ts`. Regenerate with `npm run gen:types` after every migration; never hand-edit it in a PR.
3. Every `{ error }` goes through `throwIfError` / `throwIfErrorMaybe` (`errors.ts`) and becomes a thrown `DataError`. Never swallowed.
4. Edge functions are called only through `callFunction` (`functions.ts`); a non-2xx answer throws `FunctionError` with the status and error ID.
5. Reads are TanStack Query hooks in `queries.ts`; writes are hooks in `mutations.ts`. Query keys live in `keys.ts`.
6. Saves carry a version check: `.eq('version', v)`, and zero rows back means a conflict error. Never compute an ID or a number in the browser.
7. Permissions come from the database (`useCapability` -> `has_capability`). The UI never reasons about role names.
8. Upload only through `upload.ts` (TUS, resumable) and its queue (`UploadQueue.tsx`); download only through `download.ts` -> `lib/saveFile`.
9. Auth is email codes only (`auth.ts`): `sendCode`, `verifyCode`, `signOut` (clears query cache, IndexedDB, Cache Storage, `app:` keys).
10. After every sign-in, `accept_invites()` binds pending invites (`SessionProvider.tsx`).
11. Settings and layout jsonb are parsed with the zod schemas in `lib/settings.ts` / `lib/layout.ts`, where the defaults live.
12. The e2e mock (`mock/`) is switched on only by `isMock()`: a `VITE_E2E_MOCK=true` build AND `localStorage['e2e-mock-user']`.
13. Mock fixtures are synthetic ("Sample Job A"). No real job, customer or user data anywhere in code.
14. No module-level mutable state: caches live in TanStack Query, the upload queue in React state, mock state in sessionStorage.
15. Fonts are not bundled: the app uses `Inter, system-ui` and falls back to the system font (no `@fontsource/inter`, no CDN).
