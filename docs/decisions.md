# Decisions

Short entries, newest first. One line on what, one on why.

- **2026-09-26 — Repo name `cm-suit`, project codename `cm-suite`.** The product name is undecided (`FUTURE_NAME`); the repo name is throwaway and doesn't appear in the product.
- **2026-09-26 — Staging Supabase project `cm-suite-staging` in Jesse's Pro org, us-west-1.** Production is created at first promotion, same org.
- **2026-09-26 — pgmq lives in schema `queue`, wrapped by `public.enqueue_job`.** `pgmq` and `pgmq_public` are never exposed to PostgREST.
- **2026-09-26 — Access links carry an opaque 32-byte token; only its SHA-256 is stored.** A leaked database dump can't be replayed into a session.
- **2026-09-26 — Rate limits live in `public.rate_limits` (token bucket per key), checked by `_shared/ratelimit.ts`.** One implementation for all public endpoints.
