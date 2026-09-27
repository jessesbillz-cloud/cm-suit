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
- **2026-09-27 — A membership row's company must be its job's company (composite foreign key, migration 0015).** The member policies trust `is_org_admin(org_id)`; without the key, anyone could make a company and write themselves into another company's job. Found by an independent review of 0013.
- **2026-09-27 — `submit_bid` holds the job row while recording a bid.** Lifting a seal waits for an in-flight bid, and the seal guard then sees it.
- **2026-09-27 — Sign-in allowlist (migration 0016).** Jesse: only his two addresses sign in to staging. The list is data on staging (`signin_allowlist`); an empty list means no limit, so outside people work again once it's emptied or they're added. The sign-in email box no longer invites the browser's saved addresses.
- **2026-09-27 — Bids are read without the worker.** `extract-bid` reads a PDF (unpdf, the serverless pdf.js), `.eml` or `.txt` itself when the worker has not written `file_pages`, stores the pages once, and marks Word/Excel/images and scans `text_status` none ("Can't read": open the file). The office drops a folder of bids into the Received view; the package comes from the leading CSI division in the file name, the sub link from the bidder name after reading.
- **2026-09-27 — The sub directory is used by whoever holds `bids.manage` on one of the org's jobs, or an org admin (`can_manage_subs`, migration 0018).** SPEC §5.2 puts "directory use" under `bids.manage`; before, only org members could read it (an estimator added to a job is not one) and any org member could write it. The CSLB result is recorded through `record_cslb_check` so its time is the server's.
- **2026-09-27 — Master sub lists are imported server-side (`import-subs`, ExcelJS `npm:exceljs@4.4.0` for .xlsx, a small CSV parser for .csv).** The file is grouped per company in the function and merged by `import_subs` as the caller: trades unioned, contacts merged, empty fields filled, nothing wiped, safe to repeat.
