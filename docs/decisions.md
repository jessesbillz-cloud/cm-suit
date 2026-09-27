# Decisions

Short entries, newest first. One line on what, one on why.

- **2026-09-26 — Repo name `cm-suit`, project codename `cm-suite`.** The product name is undecided (`FUTURE_NAME`); the repo name is throwaway and doesn't appear in the product.
- **2026-09-26 — Staging Supabase project `cm-suite-staging` in Jesse's Pro org, us-west-1.** Production is created at first promotion, same org.
- **2026-09-26 — pgmq lives in schema `queue`, wrapped by `public.enqueue_job`.** `pgmq` and `pgmq_public` are never exposed to PostgREST.
- **2026-09-26 — Access links carry an opaque 32-byte token; only its SHA-256 is stored.** A leaked database dump can't be replayed into a session.
- **2026-09-26 — Rate limits live in `public.rate_limits` (token bucket per key), checked by `_shared/ratelimit.ts`.** One implementation for all public endpoints.
- **2026-09-27 — Staging is hosted on GitHub Pages (like My Daily Reports), not Cloudflare Pages.** Jesse's rule: use the services he already has. Workflow `deploy-pages.yml`; URL https://jessesbillz-cloud.github.io/cm-suit/ (sub-path, so `BASE_PATH` and `APP_BASE_PATH`). Cloudflare Pages/R2 and Fly stay in SPEC as options, not requirements, until Jesse says otherwise.
- **2026-09-27 — Email provider is Resend (MDR already uses it), not Postmark.** `_shared/email.ts`, the two webhooks and the Auth SMTP settings move to Resend. The domain question (SPEC §16 Q2) is unchanged.
- **2026-09-27 — Railway is not used.** Jesse's Railway trial has ended; nothing there.

- **2026-09-27 — Companies and jobs are created in the app through `create_org` / `create_project` (migrations 0013-0014).** Invoker rights, so RLS stays the gate; the database makes the id and a repeat returns the first row. No more SQL seeding.
- **2026-09-27 — People may set only a job's and a company's own columns (column grants).** `org_id`, `created_by`, intake/inbound addresses and tokens are written by triggers, RPCs or the service role only.
- **2026-09-27 — Sealed bids are locked once a bid is in.** A signed-in person can't lift the seal or pull bid time earlier until bid time; otherwise the seal would be one checkbox away from peeking.
- **2026-09-27 — Job modules gate the rail: Bids, Files, Calendar.** Board, People and Settings are always on. New jobs start with all three; jobs with none were given all three.
