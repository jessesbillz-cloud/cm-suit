# FUTURE_NAME — Construction Management Suite — Build Spec v1.2

**Name:** not decided yet. Use the placeholder `FUTURE_NAME` everywhere: UI, emails, config and docs. It lives in **one** constant (`src/lib/brand.ts`, plus `BRAND_NAME` in env for server code), so renaming later is a one-line change. Don't hard-code the name anywhere else.

**Owner:** Jesse Saltzman. **First customer:** Matt Lulling (Lulling Construction).

**Builder:** Fable, working in Claude Code in this repo. Jesse approves each phase.

**Written:** 2026-09-26, from Jesse's design sessions and a review of his existing app, My Daily Reports (MDR). The notes behind it live in the claude.ai project "MJ CM Tools":
- `cm-suite-plan`
- `cm-suite-layout-notes`
- `mdr-processes-to-carry-over`
- `mdr-lessons-and-build-rules`
- `matt-current-bid-process`

If this spec and those notes disagree, stop and ask Jesse.

---

## 0. How to use this spec (Fable, read first)

**v1.2 (Oct 3, 2026): §18 (roles and processes) is the current build plan. Where §18 and an earlier section disagree, §18 wins. Start at §18.7 step 6a.**

1. **Read `CLAUDE.md` before every session.** Its rules are hard rules.
2. **Build one phase at a time, in order** (§10 onward). A phase is done when:
   - its acceptance tests pass, both in CI and on staging;
   - you have shown Jesse what was built;
   - Jesse says go.
3. **Don't invent features.** If it isn't in this spec, ask.
   - Items in §16 are open questions. Each one blocks only the phase marked next to it; ask it when you reach that phase.
   - Items marked **[confirm]** are designs Jesse hasn't explicitly signed off. Confirm each with him at the start of its phase.
4. **Don't add extras "while you're in there."** Log ideas in `docs/ideas.md`.
5. **The bar is ironclad.** MDR kept fixing the same bugs. The causes were:
   - giant files;
   - silent failures;
   - schema edited directly in production;
   - many ways of doing the same thing;
   - job data in the code;
   - weak access rules.

   The rules below exist to make those failures impossible. If a rule is inconvenient, follow it anyway and tell Jesse why it hurt.

---

## 1. What we're building

A construction-management suite for small and mid-size contractors. It should be affordable, fast and uncluttered, sitting between BuildingConnected/Procore and the old way. It is desktop-first, and the field pieces (calendar, daily reports, photos, inspections) must work well on a phone.

**The company running the job pays.** Everyone it invites uses the tools on that job for free: subs, inspectors, special inspectors, architects, owner reps. An invited person can later get their own paid workspace for their other jobs, walled off from the inviting company.
- Build no pricing or billing in v1.
- Do keep the account model able to support that paid workspace later (§5).

**Modules.** Each one is turned on per project, and each person picks the ones they use:
- **Bids:** prospect → invite subs → pre-bid Q&A and addenda → bids received in any format → leveling → proposal package.
- **Files and drawings:** large-file transfer, sheets, transmittals, one-click downloads.
- **Daily reports:** for anyone who writes them (inspector, superintendent, foreman). Uses MDR's process.
- **Inspection scheduling:** subs and GCs request, the inspector decides, and a signed IR PDF comes out. Uses MDR's process.
- **Deliveries:** the job-site delivery board. Uses MDR's process.
- **Corrections log / punchlist.**
- **RFIs, submittals, transmittals.**
- **Calendar, message board, schedule look-ahead, meetings.**
- **Special inspections log.**

**Not goals:**
- It is not a Bluebeam replacement; there's no drawing markup suite. The job is processing documents efficiently.
- It is not a scheduling engine; it imports the GC's schedule.
- No pricing/billing UI until Jesse says so.

---

## 2. Non-negotiables

These are also in `CLAUDE.md`.

1. **Deny by default.**
   - Every table has row-level security (RLS) in the migration that creates it.
   - Every edge function verifies the user, except a short, named list of public endpoints (§6.4).
   - Storage is private.
   - Automated tests prove what each role can and can't see.
2. **One way to do each thing, enforced by tooling:**
   - one data layer;
   - one auth module;
   - one uploader;
   - one download helper;
   - one photo compressor;
   - one toast;
   - one status-color source;
   - one filename builder;
   - one PDF signature stamp.
3. **Migrations are the only way to change the schema.** Types are generated from the schema. Nothing is ever typed into production.
4. **Errors are loud.**
   - No swallowed errors.
   - Real HTTP status codes.
   - "Failed" never looks like "empty."
5. **The database owns** numbering, uniqueness, duplicates, access and money visibility.
6. **No job, customer or user data in code.** That covers IDs, names, contractor lists and plan images.
7. **Small pieces:** components under about 300 lines, functions under about 500.
8. **AI proposes, people decide.**
   - Document text is untrusted data.
   - The AI never sends, approves, deletes or saves instructions on its own.
9. **Downloads are always easy.** Anything you can see, you can download in one click, with its original filename. (Jesse's reaction to Procore.)
10. **Every change passes the gates in CI:**
    - typecheck, lint, knip, hygiene;
    - unit tests;
    - database and RLS tests;
    - anon and role probes;
    - end-to-end tests.

    Changes go to staging before production. Nobody deploys from a laptop.
11. **No wasted movements.**
    - One way to reach each thing.
    - Information is stored once and linked everywhere else.
    - Prefill whatever is already known.
    - Offer undo instead of "are you sure?", except for signatures and legal records.
    - Tap budgets are tested (§7.9).
12. **The code stays clean.**
    - A fixed folder map.
    - No scratch files in the repo.
    - Unused files fail the build.
    - Commits never sweep in junk.

---

## 3. Stack and infrastructure (decided — no alternatives)

| Piece | Choice | Notes |
|---|---|---|
| App | React 18 + **TypeScript strict** + Vite, installable PWA | |
| Routing | **TanStack Router** | No hand-rolled history hacks or app-flow window events |
| Server data | supabase-js v2 + **generated types** + TanStack Query | Only in `src/data/` |
| Validation | zod | Every form, edge-function input and settings object |
| Styling | Tailwind CSS + design tokens (§7.1) | |
| Icons | Lucide | **No emojis anywhere in the UI** |
| Backend | **New** Supabase projects `staging` and `production`, both on a paid plan | Separate from MDR. Paid is needed for large-file limits, backups and PITR (point-in-time recovery) on production |
| Server code | Supabase Edge Functions (Deno, TS) | Shared code in `supabase/functions/_shared/` |
| Queue | `pgmq` in a **non-exposed schema**, reached only through wrapper RPCs (§8.9) | Never expose `pgmq_public` |
| Worker | One container on **Fly.io** (Node/TS + ClamAV + LibreOffice headless + poppler/pdf tools) | Heavy work: scanning, text extraction, sheet split, thumbnails, legal PDF rendering, DOCX→PDF, workbook recalc, zips, stamping, nightly storage copy |
| Hosting | **Cloudflare Pages** | `public/_headers` for the CSP and security headers |
| Email out | **Resend** (transactional sends only, no broadcasts), fully authenticated domain (SPF/DKIM/DMARC) | Bid invites, addenda, Q&A and receipts all go **transactional**, because recipients must never be able to unsubscribe from those |
| Auth email | Supabase Auth **custom SMTP through Resend** | Supabase's built-in mailer only sends to team members |
| Email in | Resend Inbound on `in.<appdomain>` | |
| Push | Web Push (VAPID) from an edge function | |
| AI | Anthropic API, Claude, through one module (§8.7) **[provisional until §16 Q1]** | MDR's multi-vendor wrapper is not carried over |
| Errors | Sentry (front end + functions) | Users see a short error ID |
| CI/CD | GitHub Actions (§9) | |
| Local dev | Supabase CLI + Docker Desktop or OrbStack | Without Docker, rely on CI for database tests |

**Pre-approved dependencies** (anything else needs Jesse's OK):
- react, react-dom, @tanstack/react-router, @tanstack/react-query, @supabase/supabase-js
- zod, tailwindcss, lucide-react
- pdf-lib, pdfjs-dist, tus-js-client, exceljs, docxtemplater (+ pizzip), date-fns / date-fns-tz
- vitest, @playwright/test, eslint (+ react-hooks, typescript-eslint), knip
- web-push (server), @sentry/*

**Model defaults** live in env, not code: `AI_MODEL_HEAVY=claude-sonnet-5` (extraction, drafting) and `AI_MODEL_FAST=claude-haiku-4-5-20251001` (sorting, classification). Before first use, confirm the IDs against Anthropic's current model list.

**Email domain timing:**
- Until the name and domain are decided (§16 Q2), Phase 0 runs with `EMAIL_TEST_MODE=true` (nothing is handed to Resend). No real outside email goes out.
- The domain, Resend domain verification and DNS records (SPF/DKIM/DMARC plus inbound MX) must be in place **at least 2–4 weeks before the first live bid**, so the new sending domain has time to warm up.
- `<appdomain>` below means that future domain.

---

## 4. Repo layout and hygiene

**Allowed at the root, and nothing else:**
- `README.md`, `CLAUDE.md`, `SPEC.md`
- `package.json`, `package-lock.json`
- `tsconfig.json`, `tsconfig.node.json`
- `vite.config.ts`, `tailwind.config.ts`, `postcss.config.js`
- `eslint.config.js`, `knip.json`, `playwright.config.ts`, `vitest.config.ts`
- `index.html`
- `.env.example`, `.gitignore`, `.nvmrc`
- `.github/`, `.husky/`

**Folders:**
```
src/
  app/                  router, layout frame, providers
  features/<module>/    bids, files, dailies, scheduling, deliveries, corrections, rfis, submittals, calendar, board, ...
  data/                 the ONLY code that talks to Supabase (queries, mutations, generated types)
  ui/                   shared components (Card, Button, LogTable, ReadingPane, Toast, Icon, JobPicker, ...)
  lib/                  pure helpers: brand.ts, dates.ts, status.ts, buildFilename.ts, compressPhoto.ts, saveFile.ts, pdf/
public/                 manifest.webmanifest, sw.js (generated), _headers, icons — no job files ever
supabase/
  config.toml           every function listed
  migrations/
  functions/<name>/
  functions/_shared/    auth.ts, http.ts, db.ts, email.ts, ai.ts, audit.ts, queue.ts, validate.ts
  tests/                SQL/pgTAP tests + anon_allowlist.sql + admin_service_key_allowlist.txt
worker/                 Dockerfile, fly.toml, src/
prompts/                <task>.md + fixtures/<task>/ (synthetic fixtures only)
scripts/                hygiene checks and dev scripts
tests/
  e2e/                  Playwright
  security/             anon-probe.ts, role-probe.ts
docs/                   ideas.md, decisions.md, runbooks/
scratch/                gitignored; wiped by `npm run clean`
```

**Hygiene gates** (CI plus the pre-commit hook):
- **Allowlist:** a file at the root or folder outside the map above fails.
- **Junk patterns:** `* 2.*`, `.fuse_hidden*`, `.DS_Store`, `*.tmp*`, `*.bak`, `*.zip`, `*.orig`.
- **knip** reports zero unused files, exports and dependencies.
- **Commits** use explicit paths only. Never `git add -A` or `git add .`. The PR description lists every added file.
- **No real job files in the repo** (plans, specs, bids, RFIs, customer data), and none in `prompts/fixtures`, which holds synthetic documents only. Real-job fixtures live in staging's private storage (§9.3).

---

## 5. Data model

Fable writes the DDL. This section fixes the entities, the key columns and the access rules.

**Every table has:**
- `id uuid pk default gen_random_uuid()`;
- `created_at`, `updated_at` (set by a trigger), `created_by`;
- `version int`, incremented on each update and checked on save (optimistic concurrency).

**Project-scoped tables** also have `org_id` and `project_id`.

**Deletes:** soft delete (`deleted_at`) wherever users can delete. Hard deletes happen only through admin runbooks.

### 5.1 Tenancy and people
- **`orgs`:** `name`, `kind` (gc, sub, inspector, architect, owner, other), `settings jsonb` (one zod schema, one set of defaults), `intake_address` (see §11.1).
- **`org_members`:** `(org_id, user_id, org_role: owner|admin|member)`.
- **`profiles`:** `user_id`, `full_name`, `email`, `phone`, `title`, `signature_path` (private), `cert_numbers jsonb`, `timezone`.
  - **Only the user can read their own profile.**
  - Other people's display info comes from `people_display(project_id)`. It returns name and company only, and only for people the caller is allowed to see (bidders are never shown to other bidders).
- **`projects`:**
  - `org_id`, `name`, `number`, `address`, `timezone`, `stage` (prospect | bidding | awarded | lost | construction | closeout | archived);
  - `job_type`, `funding`, `prevailing_wage bool`, `modules text[]`;
  - `settings jsonb` (zod);
  - `inbound_address` (unique), `delivery_token_hash`, `bid_due_at`, `bid_sealed bool` **[confirm]**.
- **`project_members`:**
  - `project_id`, `user_id` (null until the invite is accepted), `invite_email`, `member_org_id`;
  - `role`, `status` (invited | active | revoked);
  - `access_ends_at` (nullable; e.g. bidders at bid due + grace);
  - `invited_by`, `revoked_at`.
  - Membership lives in a real table. **Never in ID arrays on the project.**
- **`member_scopes`:**
  - `(project_member_id, scope_type, scope_id)`, e.g. `('bid_package', <id>)`;
  - a per-member module switch, e.g. `('module', 'dailies')`.
- **`user_layout`:** `user_id`, `rail_items text[]`, `main_default`, `docked_panel`, `collapsed jsonb`, `calendar_types text[]`, `notification_kinds text[]`.

### 5.2 Roles, capabilities, access helpers

**Project roles:**
- `project_admin`, `estimator`, `pm`, `pe`
- `superintendent`, `foreman`
- `inspector`, `special_inspector`
- `bidder`, `sub`
- `architect`, `owner_rep`, `viewer`

**Capabilities:**
- The global table `role_permissions(role, capability)` is seeded by migration. Per-org overrides come later, as data.
- Only the service role can change it. Normal users can't write to it.

**Access helpers** (all STABLE SECURITY DEFINER, with `search_path` set, and the caller always taken from `auth.uid()`):
- **`has_capability(project_id, cap)`:**
  - the member must be active and not past `access_ends_at`;
  - the role must grant `cap`;
  - for pricing capabilities, the session must also be **two-factor (`aal2`)**.
- **`has_scope(project_id, scope_type, scope_id)`:** e.g. whether this bidder can reach package X.
- **`is_owner_of(entity_type, entity_id)`:** for author-owned records such as a daily report or an inspector's IR.

**How RLS policies are built:** only from these three helpers plus plain column checks. Never hard-code role names.

**Starting capability matrix** (seeded; Jesse and Matt can change it later as data):

| Capability | Roles |
|---|---|
| `bids.view_pricing` (requires aal2) | project_admin, estimator |
| `bids.manage` (invites, Q&A, addenda, packages, directory use) | project_admin, estimator |
| `bids.submit` (own scoped packages only) | bidder |
| `bids.view_ai_findings` | project_admin, estimator (same as pricing) |
| `dailies.write` (own) | any member with the `module:dailies` scope |
| `dailies.read_all` | project_admin, pm, pe, superintendent, inspector, owner_rep |
| `ir.request` | sub, superintendent, foreman, pe, project_admin |
| `ir.decide` | inspector who owns the IR; an assigned co-inspector (limited, §13.2) |
| `deliveries.manage` | superintendent, pm, project_admin |
| `corrections.close` | inspector |
| `rfi.create_draft` | sub, superintendent, foreman, pe, pm, project_admin |
| `rfi.sign_issue` | pm, pe, project_admin |
| `rfi.answer` | architect |
| `rfi.view_internal_research` | project_admin, pm, pe, estimator |
| `files.*` | per-folder access list (§5.6) |
| `members.manage` | project_admin |

**Money rule:** dollar amounts live only in tables whose RLS requires `bids.view_pricing`: `bid_pricing`, `bid_extraction_pricing`, `estimate_exports`.
- **Never** hide money only in the UI.
- Received bid files sit in a **pricing-only folder**. The submitting bidder can see their own file; nobody else without pricing access can.

**Inspector independence:** an inspector's reports and IR PDFs belong to the inspector. Others read them once they're issued; nobody else can edit them.

### 5.3 Numbering
- **`project_counters(project_id, kind, next_value)`** with `next_number(project_id, kind)`, which does an atomic `update … returning`. Every numbered table has `unique(project_id, number)`.
- **Kinds:** `rfi`, `submittal`, `transmittal`, `ir`, `cn`, `addendum`, `delivery`, `bid_question`, `bid_receipt`.
- **Daily reports:** numbered per `(project_id, author_id, report_type)`, assigned **at first submit**.
  - Drafts show "will be #N".
  - Deleted drafts never burn a number.
  - A back-dated report gets the next number when it's submitted.
  - A per-member `start_number` can continue an existing sequence.
- Numbers are never computed in the browser.

### 5.4 Audit log
- **`audit_events`:** `occurred_at`, `org_id`, `project_id`, `actor_user_id`, `actor_kind`, `action`, `entity_type`, `entity_id`, `ip`, `user_agent`, `content_hash`, `details jsonb`.
- **Append-only:**
  - UPDATE and DELETE are revoked from every role, and a trigger blocks them;
  - `audit()` **isn't callable by users**. It runs only inside triggers and inside SECURITY DEFINER RPCs, which take the actor from `auth.uid()`.
- **What gets logged:**
  - every create, update, sign, approve, send, download, upload, delete and permission change;
  - **views** of sensitive items (bids, pricing, internal research), through the `log_view(entity)` RPC called by the data layer;
  - **logins**, copied from `auth.audit_log_entries` by a cron job every 5 minutes.
- **Export:** a "project record" PDF or CSV for any date range and module. For example, the bid file (§11.7).

### 5.5 Activity, message board, "Needs you"
- **`activity`:** `project_id`, `kind`, `entity_type`, `entity_id`, `summary`, `actor`, `created_at`, plus the audience:
  - `audience_capability`, or
  - `audience_user_ids`, a set held in the child table `activity_recipients`.
- RLS shows a row only to its audience.
- **`read_marks(user_id, project_id, last_seen_at)`** drives unread bolding and the "What's new" line.
- **`tasks`:** `project_id`, `assignee_user_id`, `kind`, `entity_type`, `entity_id`, `due_at`, `done_at`.
  - Workflows create tasks (sign this RFI, acknowledge addendum 2, confirm this IR, approve this invoice).
  - Each task is handled **in place** on the board, with no trip to another page.

### 5.6 Files
- **`folders(project_id, parent_id, name, kind, sort, ai_reads bool, proprietary bool, view_only bool [confirm])`** and **`folder_access(folder_id, capability or user_id, can_read, can_write)`**.
  - A new job's folders come from `folder_templates` (company kind, DSA or not); `ai_reads` = search and the AI read the folder.
- **`files`:**
  - `project_id`, `folder_id`, `storage_path`, `original_name`, `mime`, `size`, `sha256`;
  - `version_group_id`, `version_no`, `superseded_by`;
  - `scan_status` (pending | clean | infected | too_large_to_scan), `text_status`.
- **`file_pages(file_id, page_no, sheet_number, sheet_title, text, thumbnail_path, tsv)`**, full-text indexed.
- **`downloads(file_id, user_id, at, ip, variant: original|stamped)`**, also written to the audit log.
- **`share_links`:**
  - `id`, `target_type`, `target_id`, `recipient_email`, `member_id`, `created_by`, `revoked_at`;
  - **permanent** (§6.4);
  - scoped to one recipient.
- **`transmittals`:**
  - `project_id`, `number`, `from_user`, `to_emails[]`, `to_members[]`, `file_ids[]`, `message`, `sent_at`;
  - `delivery_status`, `first_opened_at`, `provider_message_id`.

---

## 6. Security model

### 6.1 RLS
- Policies use only the §5.2 helpers.
- **No `USING (true)`**, and nothing granted to `public` or `anon` except what's listed in `supabase/tests/anon_allowlist.sql`.
- **A SQL test fails CI if:**
  - RLS is off on any table in any exposed schema;
  - a policy says `true`;
  - an `anon` grant is missing from the allowlist;
  - an internal schema such as `pgmq` or `pgmq_public` is exposed to the API.

### 6.2 Database functions
- Every SECURITY DEFINER function:
  - sets `search_path = public, pg_temp`;
  - gets identity from `auth.uid()`, never from a parameter;
  - has EXECUTE revoked from `public` and `anon` unless it's on the allowlist.
- A SQL test enforces all three.

### 6.3 Edge functions
- **`_shared/auth.ts`:**
  - `requireUser(req)`: explicit `getUser(jwt)`, `persistSession:false`. **This is the real gate.** The platform's `verify_jwt` is only extra defense; check the current Supabase docs for how it behaves with the new API key types.
  - `requireCapability(user, projectId, cap)`
  - `requireAal2(user)`
  - `requireCron(req)`: `CRON_SECRET`, constant-time compare
  - `requireWebhook(req, provider)`
- **Missing secrets:** if a secret or env var is missing, **refuse the request**. Never skip the check.
- **Service-role key.** Allowed only in:
  - cron jobs;
  - webhooks;
  - queue workers;
  - the public endpoints in §6.4;
  - functions named in `supabase/tests/admin_service_key_allowlist.txt`. These are admin actions that need the Auth admin API, such as `invite-member` and `revoke-member`. Each one calls `requireCapability` **before** using the key.

  A CI grep fails on any other use.
- **`_shared/http.ts` is the only way to build a response:**
  - `ok`, `created`, `badRequest`, `unauthorized`, `forbidden`, `notFound`, `conflict`, `tooMany`, `serverError(errId)`;
  - **never 200 on a failure**;
  - CORS: authenticated functions allow only the app origin (plus localhost in dev); public endpoints allow `*`.

### 6.4 Public endpoints (the complete list)
Each one has:
- a comment explaining why it's public;
- zod validation;
- a rate limit per IP and per token (a counter table);
- entries in the anon probe.

1. **`access` (permanent link + email code), the entry point for every invited outside person** (bidders, subs, architects, owner reps, inspectors' offices).
   - Links in emails point to `/<app>/a/<link-id>`. That link **never expires by itself.**
   - Opening it asks for an **email one-time code**, sent through Supabase Auth (`signInWithOtp`, delivered by Resend SMTP) to the invited address.
   - Once signed in, the device stays signed in, so the next visit needs no code.
   - Access ends when the membership is revoked, or when `access_ends_at` passes (e.g. bidders close automatically at bid time + grace **[confirm]**).
   - **Why not magic links:** magic links are single-use and short-lived, and corporate email scanners pre-click and burn them.
2. **`share` (permanent file or folder share link):** same code check for recipients who aren't members. After the code, it redirects to a fresh signed URL.
3. **`delivery-board` (token-gated per project; the super can rotate the token):** post a delivery; view the board and TV mode. Returns board fields only (§13.3).
4. **`request-link` (token-gated per project QR poster for inspection requests):**
   - anyone with the link requests with no login: the job's day (time, length, type, color only), the request with up to 3 photos or PDFs, their name, company and phone or email; a private status link shows the tracker and the result (Jesse, Oct 2);
   - on an OFS job the same visitor makes the revs request (Jesse, Oct 3): the job's walls with each item's status only (open, requested, passed, N/A; never a number, a note or a name), then walls and up to 3 items; the status link's receipt opens that request's map and nothing else (draw it until the result, its sheet, the map PDF; each download logged);
   - a visitor who wants to see all their requests verifies their email by code and becomes a `requester` member (requests only);
   - the project admin can revoke them.
5. **`inbound-email` (Resend Inbound `email.received` webhook):** Svix signature (HMAC-SHA256 over id, timestamp and raw body, `RESEND_WEBHOOK_SECRET`) with a 5-minute timestamp window. De-duplicated on the Resend `email_id`.
6. **`email-events` (delivery, bounce, complaint and open webhook):** same auth. De-duplicated on the webhook's `svix-id`.
7. **`calendar-feed` (per-user secret token, rotatable).**
8. **`meeting-signin` (token-gated per meeting; the QR on a tailgate safety meeting's or a job meeting's screen, Jesse, Oct 3):**
   - the crew signs in with no login: the page shows the job, the meeting's number, title and day; each person enters name, company, an optional trade and signs on the pad, then sees "Signed" and is done;
   - only the token's hash is stored; the leader's "New QR" replaces it at once, closing the meeting drops it, and signing ends 18 hours after the start;
   - the same name twice in a meeting is one line; the answer is the status only, never anyone's name.

Everything else requires a signed-in user.

**A "known sender" on inbound email** also requires SPF and DKIM (aligned with the From domain) to pass. A spoofed `From` address is never trusted.

### 6.5 Storage
- **All buckets are private.**
- **Uploads:** only through the single uploader (`src/data/upload.ts`), using TUS resumable uploads to paths the storage policies scope by project and folder. Set the project's global file-size limit to allow multi-GB plan sets.
- **Scanning** (worker, ClamAV):
  - limits set to the maximum supported, with `AlertExceedsMax` on;
  - an oversize file becomes `too_large_to_scan`, shown with a notice, **never marked clean**;
  - **before the scan finishes:** only the uploader can download, except photos (image type and name), which the folder's readers can open;
  - **infected:** download blocked, and the project admin notified.
- **Downloads:**
  - always a fresh signed URL (about 10 minutes) generated per click;
  - the signed URL's `download` parameter keeps the **original filename**;
  - project members get the **original file**.
- **Stamped drawings [confirm]:** for bidders, outside recipients and subs, drawing PDFs are stamped with name, company, email and date. The worker makes the stamped copy on first request and caches it per recipient. It's labeled "stamped copy" in the download log.
- **View-only folders [confirm]:** the viewer shows server-rendered page images, with no file URL handed out. Only project_admin can set a folder to view-only, and only on folders marked proprietary. Jesse's rule, "if you can see it you can download it," is the default everywhere else.
- **Backups:**
  - PITR on production (database);
  - a **nightly copy of all storage objects** to a second provider (Cloudflare R2), done by the worker, with a monthly restore test (runbook).

### 6.6 Front end
- Standard supabase-js sessions; no hand-rolled refresh.
- All libraries are bundled; nothing loads from a CDN at runtime.
- CSP through `public/_headers`.
- **On logout:** sign out, then clear the TanStack Query cache, IndexedDB (offline queue), Cache Storage and any user-scoped storage.
- No credentials, emails, allowlists, IDs or feature gates in the bundle.

### 6.7 AI safety
- Document, email, bid and request text goes **only** into the user turn, as escaped `<document source="…" untrusted="true">` blocks.
- The model returns typed JSON, validated with zod. It has no tools that cause side effects.
- Every output is saved as a **draft** that a person confirms.
- There is no "remember this instruction" feature.
- AI findings about bids and RFIs are visible only to `bids.view_ai_findings` / `rfi.view_internal_research`.

### 6.8 Probes (permanent tests)
**`tests/security/anon-probe.ts`** uses only the anon key. It tries to:
- read every table and call every RPC;
- list and download from every bucket;
- call every edge function without a token.

Every attempt must be denied, except the §6.4 endpoints, which must return only their allowed fields. It also runs **positive checks**, e.g. the delivery token still works.

**`tests/security/role-probe.ts`** seeds two projects with one user per role and checks:
- the capability matrix, cross-project isolation and `access_ends_at`;
- **Bidder A can't see Bidder B** (names, prices, questions, files, existence);
- non-pricing roles can't see money;
- pricing without `aal2` is denied;
- requesters see only the anonymized fields of other people's requests.

Both probes run in CI on every PR and after every staging deploy.

### 6.9 Signing and legal records
- **Records that get signed:** daily reports, IR PDFs, RFIs, proposals, addenda.
- **Signing:**
  1. The person reviews the exact content.
  2. They re-confirm their identity (email code or 2FA code; a fresh sign-in within 5 minutes also counts).
  3. The server writes an audit event bound to the **content hash**.
  4. The **worker renders the PDF** from the saved content. **Legal PDFs are built on the server, not in the browser.**
- The signed time is stored and never changes when a PDF is regenerated.
- If content changes after signing, it needs a new signature. An unsigned or stale PDF is never sent.
- **Before Matt's first live bid:** a full security review — both probes, Supabase's security advisor at zero ERRORs, and a Claude security review of all code since Phase 0.

---

## 7. UX system (from Jesse's design sessions)

### 7.1 Look
- **Surfaces:**
  - Near-white page (`#EDF0F4`).
  - White cards with a hairline edge and a two-step shadow (`shadow-card` in `tailwind.config.ts`), an 8px radius, and headers on a faint tint.
  - IBM Plex Sans (self-hosted, `public/fonts`), gray secondary text, one accent color.
- **Nothing comical:** no emojis, illustrations, mascots or celebration animations. Lucide line icons, only where they carry meaning.
- **Status colors come only from `src/lib/status.ts`** (it generates CSS variables). They appear as status chips and calendar marks:
  - pending: yellow
  - confirmed/approved: green
  - postponed: amber
  - not approved / blocked: red
  - cancelled: gray
  - assigned to a co-inspector: blue

  These are MDR's hues, adjusted for a white background.
- **Row highlights:**
  - **impact claimed** uses an amber *row* highlight (§7.4);
  - **errors** use red text and banners.

  **[confirm with Jesse: amber row = impact claimed, alongside amber = postponed chip]**

### 7.2 The frame (desktop)
```
┌──────┬──────────────────────────────┬──────────────────┐
│ rail │  MAIN AREA                   │  RIGHT COLUMN    │
│ icons│  message board by default,   │  one docked      │
│      │  or the log/tool picked      │  panel, or the   │
│      │                              │  item opened     │
└──────┴──────────────────────────────┴──────────────────┘
```
- **Rail:** fixed width; it can collapse to a strip of icons. Settings is pinned at the bottom. A tool never shows twice.
  - On **"All my jobs"**: the tools that work across jobs (Board, Calendar, and the bids pipeline, permit caseload and timesheets when they apply to the person).
  - On **a job**, only that job (Jesse, Oct 3): its name, then its tools in the person's order, More for the job's other tools, and Edit to choose them. Nothing from All my jobs; the job picker goes back there.
  - A job's own Board and Calendar are job tools like any other. Until the person chooses with Edit, a job's tools are their position's recommendation without the Board (the right column already shows the job's board), then Files, so Files is always one tap.
  - The phone has no right column, so its bar on a job starts with the job's Board, then the job's tools (§7.7).
- **Main area:** there is no separate home screen.
  - By default it opens on the **message board**, or on the person's chosen default (e.g. the calendar).
  - A rail icon switches the main area.
- **Right column:** fixed width, holding one docked panel.
  - An opened item takes over the column; closing the item brings the docked panel back.
  - The column can go full width or collapse.
- **Every item and document** has **Open in new window** and **Download**.
- **The only layout choices a person has:** each job's rail tools, main default, docked panel, collapsed panes, calendar types. No dragging or resizing.
- **Job picker:** always top-left in the same spot.
  - Recent jobs first, then type-to-find.
  - "All my jobs" for the board and the calendar, always in view under the jobs.
  - **Switching jobs keeps you in the same tool.**

### 7.3 Message board
- One line per event, newest first, unread in bold.
- Scrolls back forever; filter by job or type.
- Clicking a line opens it in the right column.
- **"Needs you"** strip on top: tasks handled in place.
- **"What's new since you were last in"** line, which can be turned off.

### 7.4 Logs (RFIs, submittals, transmittals, IRs, corrections, deliveries)
- **Rows:** number, **full title (wraps, never cut off)**, date asked, date answered. Click a column to sort.
- **Never shown:**
  - expand/collapse boxes inside items;
  - a ball-in-court column or days-open counters by default. Both are tracked; a PE can turn the ball-in-court column on for themselves.
- **Impact claimed** (RFIs):
  - it's the originator's claim and is permanent; the GC can add a note but never remove it;
  - amber row, and the owner and PM are notified;
  - only these rows show "needed by" and the contract due date (the contract turnaround is set once per project);
  - there's an impact-claims report.
- **Reading pane:** one flat view (body, attachment thumbnails, answer with its attachments), history behind one link, arrow keys move to the next item.

### 7.5 Search
- One box on every log and in Files. It searches number, title, body, answer and **extracted attachment text**, with matches highlighted.
- A full sentence triggers Claude-assisted search. It turns the sentence into filters, date ranges and synonyms, then runs the database search, and **returns items, not essays.**

### 7.6 Calendar
- Each person checks the types they want to see:
  - inspections, special inspections
  - deliveries, meetings
  - pours/shutdowns, milestones, look-ahead activities
  - their own due items
- Week view is the default in the field; day and month views are also available.
- One line per entry, with a type icon, and "All my jobs" available.

### 7.7 Phone
- **Its own layout:** one screen at a time, the job picker on top, the person's top tools along the bottom, items full screen.
- **Built for the phone:** calendar, dailies, photos, IR requests and decisions, deliveries, corrections, field RFIs.
- **Photos:**
  - **Camera** opens straight to the camera, allows several shots in a row, and each photo lands on the item you started from, stamped with job/date/time, with no save step.
  - **Upload** offers only photo or file.
  - Never three buttons, and never a menu that repeats a button already on screen.
  - Test on a real iPhone; Apple's picker sheet is outside our control.

### 7.8 Notifications
- Web Push, and each person picks the kinds they get. The default is quiet: your tasks, answers to your RFIs, impact claims, your IR results.
- Tapping a notification opens the item.
- On the iPhone, show a one-time install guide (push requires the home-screen app).

### 7.9 Tap budgets
Budgets marked **CI** are Playwright tests (click counts). **Manual** means Jesse checks on a device.

| Task | Budget | Test |
|---|---|---|
| Download any file you can see | 1 | CI |
| Switch job, same tool | 2 | CI |
| Open an RFI by number | type the number + Enter | CI |
| Acknowledge an addendum (bidder) | 1 from the bid page | CI |
| Confirm a pending IR from the day view | 2 | CI |
| Submit today's daily report from the report screen | ≤3 + signature confirm | CI |
| Simple approve in "Needs you" | 1 + signature where required | CI |
| Photo onto today's report from the job screen (iPhone) | 2 | Manual |

---

## 8. Cross-cutting services

### 8.1 Files, downloads, transmittals
- **Upload:** drag in a folder or a multi-GB set. The single uploader uses TUS, resumes after dropped connections, and shows progress per file.
- **Worker pipeline (queued):**
  1. scan;
  2. extract text per page;
  3. make thumbnails;
  4. for **plan sets**, split into sheets **[confirm]**. The sheet number comes from the text layer; Claude vision reads it only when the text layer is empty.
- **Revisions:** a newer sheet supersedes the old one, which stays viewable. The change shows in What's new.
- **Viewer:** page by page (pdf.js), so you never download a whole set just to look.
- **Download:** one click, original filename. **Download all (zip)** on any folder or log; the worker builds it and a notification says when it's ready.
- **Share by email:** a permanent share link (§6.4). Small files can also be attached when the recipient needs the file itself.
- **Every send creates a transmittal:** what, to whom, when, delivered/bounced, first opened.
- **My shelf:** star any file, sheet, spec section or approved submittal.

### 8.2 PDFs
- **PDF builders** are pure TypeScript functions in `src/lib/pdf/` (data in, bytes out, using pdf-lib), shared by the browser (previews) and the worker (official renders).
- **Signed and legal PDFs are rendered by the worker** (§6.9). The signature stamp is identical everywhere: signature image + "Signed by {name} · {date time, project timezone}".
- **Stored PDFs carry `content_hash`.** If content changed after the PDF was made, it is regenerated (and re-signed if required) before download or send.

### 8.3 Templates (company forms)
- **Scope per org:** daily report forms, IR forms, the ITB, proposal cover, RFI form, transmittal.
- **Learned the MDR way:**
  - Fillable PDF fields are read directly.
  - For flat PDFs and DOCX, Claude proposes which fields are daily and which are fixed, and finds the date, number, signature and notes fields.
  - It also proposes the **filename convention**, e.g. `Daily Report {#} {Project} {MM-DD-YYYY}`, with zero-padding and a start number.
  - The person confirms each field as Edit, Lock, Auto-Date or Auto-#, and can draw fields onto the page.
- **Locked project values** are typed once and reused everywhere.
- **Filenames:** one `buildFilename(pattern, values)`, with tests.
- **Overflow** goes to continuation pages, **never silently cut off.**
- **DOCX output** is filled with docxtemplater. The worker converts it to PDF with LibreOffice. Both the DOCX (editable) and the PDF are kept.
- **Company form generators:**
  - a per-org setting can point to a built-in generator for a specific company's form. MDR's VIS daily report is the first example, rebuilt as a pure PDF builder;
  - the choice is stored as data (`orgs.settings.report_generator`), never as company IDs in code.

### 8.4 Email out
- **Recipients always come from the database** (members, contacts, requester), never from request bodies. Templates escape all user text.
- **Transactional stream only in v1:** invites, addenda, Q&A, receipts, results, transmittals, digests. There's no marketing or broadcast use.
- **Delivery status** comes from `email-events` and is shown on the send or transmittal record within minutes.
- **Deliberately few emails.** The live calendar and the board are the channel. (MDR lesson: silent confirmations, one results email, one weekly digest.)
- **Fallback on every send screen:** "Open in my mail app" (mailto with the recipients and the permanent link) and "Copy recipients."
- **Allowlist sheet:** a generated PDF for a recipient's IT department, listing the exact sending domain, DKIM and return-path to allow at their gateway.
- **"Send as me"** through Gmail/Outlook arrives in Phase 5, unless Jesse moves it earlier (§16 Q4).

### 8.5 Email in
- **Addresses:**
  - every project gets one, e.g. `rsa-21050@in.<appdomain>`;
  - every org gets an **intake address** for new leads, e.g. `lulling@in.<appdomain>`, which creates prospect drafts.
- **Pipeline:** `inbound-email` stores the raw message and attachments privately, then queues sorting.
- **Sorting:**
  - Match the sender to a member. **Also require SPF/DKIM pass.**
  - `classifyInboundEmail` (FAST model) labels it: bid, bid question, RFI draft, submittal, special-inspection report, invoice, general. It then proposes a destination.
  - **Known and verified senders:** filed as a draft in the right place, plus a "Needs you" task for the responsible person.
  - **Everyone else:** quarantined for the project admin.
  - **Nothing is ever sent or approved automatically.**
- **Replies to app emails** carry a thread token in the reply-to address, so they attach to the right item.

### 8.6 Push
- `push_subscriptions(user_id, endpoint, keys)`, sent by an edge function with VAPID. Expired endpoints are pruned.

### 8.7 AI module **[provisional until §16 Q1]**
- **One module:** `supabase/functions/_shared/ai.ts` (plus the worker equivalent). It exposes **typed tasks**:
  - `extractProjectFromRfp`
  - `extractBid`
  - `classifyInboundEmail`
  - `learnTemplate`
  - `readSheetNumber`
  - `draftRfi`
  - `buildSubmittalRegister`
  - `extractRequirements` (one spec section's dated commitments beyond submittals, each with its quoted sentence; the Requirements register's drafts, migration 0063)
  - `describePhoto`
  - `compileNotes`
  - `searchToFilters`
- **Each task has:**
  - `prompts/<task>.md` with a version header;
  - a zod output schema;
  - **synthetic** fixtures in `prompts/fixtures/<task>/`;
  - a real-job acceptance run on staging (§9.3).
- **Long jobs** (e.g. 136 bid files) run through the queue, with progress shown.
- **No vector database in v1.** Postgres full-text search finds candidates, and Claude reads the full text of the few that matter.
- **Every call is logged:** task, model, tokens, latency, project, user. The cost view is admin-only.

### 8.8 Time
- Store UTC. Compute "today," reminders and report dates in the **project time zone**.
- Tests cover Pacific-time evenings and DST changes (this is where MDR's reminder bug came from).

### 8.9 Queue and background jobs
- **Queues live in `pgmq` in a non-exposed schema.**
  - Enqueuing goes through the `enqueue_job(kind, payload)` wrapper RPC. It is SECURITY DEFINER, checks capabilities, and is callable by edge functions.
  - The worker consumes jobs using the service role.
- **Consumer loop:**
  - the worker polls continuously (there's also a `pg_cron` health check every minute);
  - visibility timeout per job kind;
  - **up to 5 attempts** with backoff;
  - after that, the job moves to `dead_jobs`, the project admin gets a notice, and a Sentry alert fires.
- **Idempotency:** every job has an idempotency key.

---

## 9. CI/CD and environments

### 9.1 Pipeline
- **Branches and PRs:** every change goes on a feature branch into one PR that lists each added file. Jesse approves merges.
- **CI on every PR:**
  - `tsc --noEmit`;
  - ESLint, including these rules:
    - no `fetch`/Supabase URLs outside `src/data`
    - no empty catch
    - react-hooks
    - no components defined inside components
    - max file length
  - knip, and the hygiene checks;
  - Vitest;
  - `supabase start`, then apply all migrations from zero, then `supabase test db` (RLS matrix, allowlists, SECURITY DEFINER rules, schema exposure);
  - the anon probe and role probe;
  - Playwright end-to-end tests, including the CI tap budgets;
  - prompt tests against synthetic fixtures with recorded responses;
  - stale generated types fail the build.
- **Merging to `main` deploys to staging:**
  - migrations, then functions, then the worker, then the app;
  - then the anon probe and a smoke end-to-end test run against staging;
  - Supabase's security advisor must show zero ERRORs.
- **Production:** Jesse runs the **"Promote to production"** workflow, which repeats the same steps against production. Nobody deploys from a laptop.

### 9.2 Secrets
- GitHub Actions secrets: staging and production Supabase keys, Resend API key and webhook secret, Anthropic key, VAPID keys, CRON_SECRET, webhook credentials, R2 keys.
- Never in the repo; `.env.example` lists the names only.

### 9.3 Real-job acceptance runs
- Real files (e.g. the RSA bid files, the Hunter Hall specs) are uploaded **once** into a private `fixtures` bucket on **staging**, by Jesse, through the app.
- A manual GitHub workflow, **"Acceptance run"**, runs a phase's real-job checks against staging and posts a report as a workflow artifact.
- These files and their AI responses **never** go into the repo.

---

## 10. Phase 0 — Foundation

**Scope** (only what Phase 1 needs, done properly):
1. **Setup first:**
   - the `FUTURE_NAME` placeholder constant, and email in test mode until the domain exists (§16 Q2);
   - Resend account, domain verification, DNS (SPF/DKIM/DMARC/MX);
   - staging and production Supabase projects;
   - Cloudflare Pages;
   - Fly.io worker app;
   - R2 bucket;
   - Sentry.
2. **Repo and gates:** tooling, hygiene gates, CI/CD (§4, §9).
3. **Auth:**
   - email one-time codes through Resend SMTP;
   - permanent access links (§6.4);
   - **two-factor (TOTP) required** for org owners and admins and for anyone holding a pricing capability **[confirm]**;
   - invite and revoke flows (in the service-key allowlist);
   - `access_ends_at`.
4. **Tenancy:** tenancy tables, capabilities, the helpers from §5.2, and the role probe.
5. **Audit and activity:**
   - audit log, including logins and `log_view`;
   - activity and message board;
   - "Needs you" tasks.
6. **Files core:**
   - folders and access;
   - single uploader (TUS);
   - worker scanning and text extraction;
   - one-click download with the original filename;
   - share links, transmittals.

   (Sheet splitting, the viewer, zips and My shelf come in Phase 2.)
7. **Worker skeleton:** queue consumer, retries, dead jobs, nightly R2 copy, LibreOffice and PDF rendering available.
8. **Email:** transactional out, `email-events`, the mail-app fallback, the allowlist-sheet PDF. **Email in:** receiving, storing and quarantining; sorting comes in Phase 1.
9. **UX:** tokens, frame, rail, job picker, collapsible panes, open-in-new-window, board, the `LogTable` and `ReadingPane` components, the phone shell.
10. **Security gates:** anon probe, advisor gate, Sentry.

**Acceptance:**
- All CI gates pass, the probes pass, and the advisor shows zero ERRORs.
- **Access link:**
  - an outside email opens the permanent link, enters the code and gets in;
  - the same link works again a week later (time is simulated in the test);
  - revoking the member, or passing `access_ends_at`, locks them out immediately.
- A 1 GB file uploads over a throttled connection, survives a forced disconnect and resume, gets scanned, and downloads in one click with its original name.
- An EICAR test file is blocked.
- Transmittal delivery and bounce statuses arrive via webhook, and a duplicate webhook is ignored.
- A forged `From` on inbound email (DKIM fails) is quarantined.
- CI tap budgets pass for downloads and job switching.

---

## 11. Phase 1 — Bids (Matt's original ask)

Matt's goal is to automate as much as possible from **"Prospective Project" to "Bid Proposal Submission."** He wants to bid more of his own jobs and run them as construction manager. **His Excel estimate workbook stays the pricing engine.** The app fills it in and reads from it, and never replaces it.

**Blocked until:** §16 Q1 (AI) and Q3 (Matt's templates) are answered.

### 11.1 Prospect → project
- **Getting a lead in:** forward the lead or RFP to the org intake address, or upload it.
  - `extractProjectFromRfp` proposes the project data (the equivalent of Matt's "Project Data - Input" tab): owner, address, architect, bid due, job walk (and whether it's mandatory), RFI due, funding and prevailing wage, job type, required forms, bonds and insurance.
  - The estimator confirms each value, and the project is created with its own inbound address.
- **No architect or drawings:** Matt's sketch and walk notes (photos, markups, dictation) become the scope source.
- **Compliance checklist per job type:**
  - built from **data** (org-level checklist templates) covering state requirements such as DIR registration, prevailing wage, PCC 4104 sub listing, bonds and insurance, plus owner-specific RFP forms;
  - missing items are flagged;
  - the seed list is confirmed by Matt and Jesse (§16 Q3).

### 11.2 Packages and the sub directory
- **Packages** follow Matt's scheme (01A GCs, 01B site, 02A–33B trades).
  - His **CSI master list** (~7,500 MasterFormat rows mapped to packages) and **clarifications library** are imported from his workbook as org data.
  - A project selects its packages.
  - Each package's scope text is drafted from the plans and specs (or the sketch and notes) and edited by Matt.
- **Sub directory** (org-level):
  - fields: company, contacts, trades/packages, region, CSLB license # and status, DIR #, notes, and history (invites, bids, awards);
  - imported from Matt's master bid list (1,578 rows) and Jesse's contacts;
  - **every received bid adds or updates the sub**;
  - the **CSLB status** check is manual-assisted (a lookup link, then the recorded result and date). No scraping without Jesse's OK.

### 11.3 Invitations to bid
- **The ITB** is filled per package from the org's ITB template (§16 Q3 settles which template: Matt's workbook ITB tab or the HABC-style DOCX). It's output as DOCX plus PDF and includes:
  - project description, scope, key dates;
  - "your proposal must include": PW statement, DIR/CSLB #, addenda acknowledgment, validity, exclusions.
- **Invites** go out on the transactional stream to subs picked from the directory, filtered by package and region.
  - Each invite creates a `bidder` member with `member_scopes` for their packages, `access_ends_at = bid_due_at + grace` **[confirm grace]**, and a **permanent access link** (§6.4).
- **Tracking per invite:** sent, delivered, opened, intends to bid, not bidding (with an optional reason), submitted, late.
- **If an email fails,** the mail-app fallback and the allowlist sheet are one click away.

### 11.4 The bidder's page
- **What they see:**
  - project card and key dates;
  - **their package scope**;
  - documents (viewer, one-click download, stamped for bidders **[confirm]**);
  - Q&A (published answers);
  - addenda (acknowledge in 1 click);
  - intent buttons;
  - **Submit bid**.
- **Submit bid:**
  - upload in any format (their own form, PDF, Excel, photo), or email it to the project address;
  - they get a **time-stamped receipt**, numbered from `bid_receipt`: on screen, as a PDF and by email;
  - **that's all they get back. No AI readback, no "we found $X", no hint of what was checked.**
- **Revisions:** allowed until bid time, and every version is kept.
- **Late bids:** the official time is the **server receipt time**. Bids received after `bid_due_at` are accepted, marked **Late**, and Matt decides what to do with them.
- **Walled off:**
  - no other bidder's name, price, question, file, or even existence is visible;
  - the bidder list is hidden;
  - enforced by RLS and proven by the role probe.
- **Sealed until bid time [confirm]:** when on, nobody opens the submissions, Matt included, until `bid_due_at`. That covers AI extraction, the quarantine preview, and the pricing views; extraction jobs are held until then.

### 11.5 Pre-bid questions and addenda
- **How questions come in:** on the bidder's page, or by email to the project address. They land in Matt's queue.
- **Matt's options:**
  1. **Answer.** The answer is published **anonymized** in the `published_answers` table, which has no asker columns. It goes to all bidders by default (§16 Q5).
  2. **Addendum.** Used when the answer changes scope or price. It's numbered and signed (§6.9), every bidder must acknowledge it, and acknowledgment status shows on the coverage board.
  3. **Pre-bid RFI to the architect.** Numbered, logged and emailed as a PDF. It moves into the RFI module once Phase 4 exists.
- Everything is audited and goes into the bid file.

### 11.6 Receiving, leveling, comparing (internal; pricing roles only)
- **Extraction.** `extractBid` turns each received file into a draft record:
  - bidder, date, document kind;
  - **base amount with a short verbatim evidence quote and page number**;
  - alternates, adds and deducts, unit prices;
  - prevailing wage (included / excluded / adder / not stated), with evidence;
  - validity, scope summary, inclusions, exclusions, notable terms;
  - project match, confidence.

  Numbers come only from the document, never estimates. Dollar fields go into `bid_extraction_pricing`.
- **Leveling per package:**
  - the latest price per bidder is current; earlier ones are superseded;
  - duplicates and backups are detected;
  - **combined bids are split** across packages and **misfiled trades reassigned**, each with a human confirm;
  - comparable flag, notes.
- **Flags:**
  - prevailing wage not stated on a PW job;
  - stale or expired validity;
  - escalation compared with the bidder's earlier price;
  - **scope gaps** (one bidder excludes what another includes; a package with no bids);
  - overlaps (the same item in two packages);
  - single-bid packages;
  - **combined vs separate**: a combined bid compared with the sum of the separate low bids for the same scope. Jesse's example: "a third sub could do it cheaper."
  - terms that conflict with Matt's trade agreement (payment, retention, bonds, insurance; needs the agreement template, §16 Q3);
  - document mismatch (the quote is for a different project).
- **Views:**
  - **coverage board** by package: invited / intends / declined / submitted / none;
  - **leveling grid**: evidence on hover, click through to the source page;
  - **summary**: low per package, spread, sum of lows, flag count.
- **Workbook round-trip:**
  1. Write the selected bidders into the Sub 1–3 columns and leveling tabs, and the project data into the input tab of **Matt's own template**. The cell map is built from the template and **confirmed by Matt**. ExcelJS does the write.
  2. The **worker recalculates** in LibreOffice headless and reads the totals back.
  3. **Round-trip test:** open → write → recalculate → compare formulas and formatting against the original. It must match everywhere except the written cells.
- **Clarifications:** picked per job from Matt's library.

### 11.7 Proposal and the bid file
- **Proposal:** assembled from the cover letter, the estimate summary (from the recalculated workbook), clarifications, and allowances & alternates, then rendered by the worker. **Matt sends it**, through Download or Email. Nothing is sent automatically.
- **The bid file:** a one-click PDF plus a zip, generated from the audit log. It contains:
  - invites, receipts, and late flags;
  - questions and answers;
  - addenda and their acknowledgments;
  - leveling snapshots, the final selection, and the proposal.

### 11.8 Phase 1 acceptance

**CI** (synthetic fixtures):
- extraction, leveling, flags, receipt numbering, late handling, sealed-bid hold, anonymized answers, addendum acknowledgment tracking;
- the role probe covers bidder walls and pricing with `aal2`;
- the workbook round-trip on a **synthetic** workbook with the same structure.

**Acceptance run on staging** (the real RSA BHCIP job, Lulling #21050, using Matt's files; results compared with the Sept 25 trial):
- **136 files classified.** Target: 77 current / 27 duplicate / 21 superseded / 10 backup / 1 reference. Any category that's off by more than 2 must be explained, and Jesse accepts the explanation.
- **69 bidders across 28 packages** (exact).
- **PW flags on the low bidder** in 09A, 09B, 10B, 22A, 23A, 32A, 32B and 33A (all 8 present).
- **Coverage gaps:** fire alarm (design-build), low voltage, signage, sealants. **Single-bid packages:** concrete, doors/frames/hardware, painting, misc metals.
- **Scope issues:** condensate split between plumbing and HVAC; gutters appearing in two packages; the Slater combined vs Golden Glass + Progressive comparison.
- **Escalation:** Rick Hamm +28.7%, DFS +13.6%, Golden Glass +10.6%.
- The 23A HVAC ITB generates from the chosen template.
- The workbook round-trip works on Matt's real template.

**Manual:**
- Matt grades the run against how the job actually ended, and his corrections become fixture updates.
- The security review (§6.9) passes **before the first live bid**.

---

## 12. Phase 2 — Files, calendar, push, search, schedule reader

These are what Phase 3 field work depends on.
1. **Plan sets:** sheet splitting **[confirm]**, revisions, What's new, the viewer, zips, My shelf (§8.1).
2. **Push notifications** and preferences (§7.8, §8.6).
3. **Calendar** (§7.6) with "All my jobs."
4. **Search** (§7.5): full-text search over titles, bodies and page text, plus sentence search.
5. **Schedule reader:** a photo or PDF of the GC's schedule becomes weekly look-ahead rows (carryover, new starts, hot walks), following MDR's process.
   - These rows feed the calendar, the request form's sub list, and "put the schedule on the report."
   - P6/MS Project file import comes in Phase 5.

**Acceptance:**
- A real plan set (staging acceptance run) splits into sheets with the correct numbers on a checked sample of 30 sheets.
- A revision supersedes the old sheet and shows in What's new.
- A push notification arrives on an installed iPhone PWA (manual).
- The sentence search "the RFI about storefront attachments back in October" finds a seeded item (CI).
- A schedule photo produces the week's look-ahead rows, checked against a hand-made sample.

---

## 13. Phase 3 — Field: daily reports, inspection scheduling, deliveries, corrections

This phase rebuilds **Jesse's MDR processes** (`mdr-processes-to-carry-over`). Keep every "why it works" behavior, and fix the rough edges listed there.

### 13.1 Daily reports (anyone who writes them)
- **Setup** (per member and project, each role with its own template):
  - the template: learned (§8.3), a company generator (e.g. VIS), the built-in superintendent's or foreman's daily (the role's default), or a work-log form;
  - schedule days, "submit by" time and reminder lead time;
  - filename pattern and start number, recipients;
  - digital signature (on by default); AI photo descriptions and proofread (off by default);
  - a standing note.
- **Every day:**
  - A working copy is **already waiting** on scheduled days: dated, with project info locked in and the standing note filled.
  - A deleted draft stays deleted; the flag is server-side.
  - "Past date" creates a report for another day.
  - **Carryover:** work-log crews marked to carry over, and sections marked "carry over to tomorrow." Earlier drafts show in a banner.
  - **Input:**
    - typing or dictation; **Field Mode** (a big photo button plus notes);
    - photos (§7.7) attach to what you started from, with captions, timestamps, 1/2/4 per page, and an optional AI description;
    - the assistant files a rough dictated note into the right field, in the author's voice, under an ALL-CAPS header, **as a proposed edit the author accepts**;
    - "put all my notes on the report";
    - "put the schedule on the report" (today's look-ahead plus today's inspections);
    - **delivery-ticket photo** → structured work-log entry (ticket #, supplier, mix, yardage, times, "truck 3 of 18");
    - **IR results** are written into the report for the **inspection date**, once only. Regenerating updates that entry rather than adding a second one.
  - **Saving:** autosave within ~1 second and when the app goes to the background.
    - An **offline queue** (IndexedDB) holds text and photos and replays them in order.
    - Conflicts are resolved with the version check, never last-writer-wins.
  - **Clean Up** removes duplicate notes and obvious typos, never touches the schedule block, and has one-tap undo.
- **Submit:**
  1. Optional proofread. Fixes go into the **saved report**, and a proofread failure never blocks submit.
  2. Signature (§6.9); the worker renders the PDF; `buildFilename`.
  3. The PDF is stored **in the project's Reports folder / author subfolder**, readable per folder access (`dailies.read_all` by default).
  4. Hours prompt if the template bills hours.
  5. Success screen with **Download** / **Email to project team** (with the fallback). Nothing is sent automatically.
- **After submit:**
  - "Update & resubmit" keeps the number and filename, and requires re-signing.
  - The stale-PDF rule applies (§8.2).
  - A failed upload **fails the submit loudly**. A report is never marked submitted without its stored PDF.
- **Bulk:** week and month zips per author or for everyone; the project photo gallery.
- **Reminders:** a "report due" push in the **project time zone**; the Start / Continue / Edit Submitted button.
- **Feeds:** the weekly summary and digest; DSA 151/156 forms on DSA jobs (template-driven); hours rollups (Phase 5).

### 13.2 Inspection scheduling and IRs
- **Who requests:** subs, the GC, the super and the PE, as members through their access link. There's also a **QR poster per project** (`request-link`, §6.4); visitors request with no login, and sign in by email code only to see all their requests. On an OFS job a visitor makes the same revs request a member makes (pick walls and up to 3 items, draw the IR map on the sheet, get the map), with no login.
- **The requester's calendar:**
  - a live, anonymized view: times and types for everyone, full detail only for their own requests;
  - status colors from §7.1;
  - a **conflict preview** before submitting that sees all bookings (MDR's preview couldn't);
  - "Flexible — anytime today" is an option.
- **The request form:**
  - prefilled: project, GC, IOR, date;
  - the **IR number is assigned by the database on submit**;
  - sub list from the look-ahead (most-used first);
  - time: Flexible or half-hour slots;
  - duration: 5 min to All Day, or Periodic / As Needed;
  - type: IOR, Special (list from data), or OFS where enabled;
  - items to inspect; photos/PDFs (AI prefill arrives as a draft);
  - the notice acknowledgment: 24 hours (48 for specials), be present, safe access, plans on site;
  - the "request, not a booking" notice.
- **After submitting:** a receipt (screen, PDF, email). The inspector gets a push and a board line; the GC team gets a board line. No email blasts.
- **The tracker:** Submitted → (GC) → Inspector → Result, with notes, postpone reason and expected date, edit history, attendance tag, and "View completed IR."
- **GC approval step:** a per-project setting, **off by default**. UI wording must follow the setting. (MDR said "Sent to your GC" while the step was off.)
- **The inspector's steps** (each is silent unless noted):
  1. **Confirm**, with an optional note visible to the GC.
  2. **Attendance:** "be present with the IOR" or "I've got this alone."
  3. **Approved / Not approved.** Can be changed. One-tap "No issues" note, plus photos.
  4. **Generate IR PDF:** on the agency's form template, signed (§6.9), rendered by the worker. The IR becomes complete, and the summary is written to the inspection-date report.
  5. **Send results:** the only results email. The recipient picker is prefilled from the database.
  6. **Update PDF / Delete PDF & start over.**
- **Postpone isn't cancel.**
  - Reasons: Not ready / Weather / GC requested / Other, plus a note and an optional expected date.
  - The request stays on its date with a postponed chip, and its time slot is freed.
  - It counts as an extra request.
  - The requester is notified, and the PDF is stamped POSTPONED.
- **Block time** (repeatable).
- **Co-inspectors:** assign or claim. The helper reports passed or issues; the owning inspector generates and sends.
- **Edits:**
  - only the inspector changes a scheduled request;
  - requesters can move or withdraw their own;
  - moving a confirmed request sends it back to pending, with history kept and a push to the inspector.
- **One IR number field, one way to complete an IR.**
- **Inspection log** per project, by week or month, with a zip of IR PDFs per group.
- **Calendar feed.**
- **Friday digest:** sent once, idempotent.

### 13.3 Deliveries
- A per-project module, usually managed by the superintendent.
- **Posting:**
  - who: members in the app, or anyone with the **tokenized delivery link and QR poster** (no login, rate-limited, rotatable token);
  - fields: company (project subs, most-used first; "Other" adds a new name), date, time or TBD, duration, description, photos/tickets.
- **Overlaps are never refused.** "Heads up — X already has a delivery 7:00–8:00." If they post anyway, the delivery is marked **Standby**.
- **Board:** TV mode with a live clock, the screen kept awake, and a 30-second refresh; a three-week calendar; day cards; receipts with numbers.
- **Edits** are allowed and audited. **Delete** requires a name and is logged.
- **Monthly summary** with an "I reviewed this month" acknowledgment.
- Deliveries show on the **project calendar**. A ticket photo can feed the daily report.
- Delivery-link read responses contain board fields only.

### 13.4 Corrections log / punchlist
- **CN-numbered items:** photo, status (Open / Corrected / Signed off / Reopened), trade, location, spec tags, and a link to the formal notice.
- **Mark ready:** a GC or sub can mark an item ready for re-inspection, with a note and up to 6 photos. **Only the inspector** sets Corrected, Signed off or Reopened.
- **Progress page:** a read-only weekly snapshot, published with the weekly summary.

### 13.5 Phase 3 acceptance
**CI:**
- A super, a foreman and an inspector each file a daily for the same project and day with no collisions. Filenames and numbering are correct, and deleted drafts don't use up numbers.
- The full IR lifecycle works end to end:
  - request → confirm → attendance → result → worker PDF;
  - the results email is recorded as delivered;
  - the summary is written on the inspection-date report exactly once;
  - postpone → re-confirm regenerates the same file.
- A delivery overlap becomes standby, and a rotated delivery token locks out the old link.
- Reminders fire at the correct local time in Pacific-time and DST tests.
- Role probe: requesters see only anonymized data for others; the delivery link sees board fields only.

**Manual:**
- A photo reaches the report in 2 taps on an iPhone.
- In airplane mode, notes plus 5 photos all save after reconnecting, in order.
- The TV board runs for 8 hours without a reload.

---

## 14. Phase 4 — RFIs, submittals, drawings and specs

### 14.1 RFIs (legal records)
- **Intake, in any form:** typed, dictated, a photo, the sub's own long-used form, an email to the project address, or a text entered by a member.
- **Drafting:** `draftRfi` produces a formal draft with the question, references (sheet, detail, spec section) and suggested attachments.
- **Two signatures:**
  1. The **originator confirms and signs** the draft. It goes back to them to check it says what they meant.
  2. A **PM or PE signs and issues** it. Only then does the RFI get its number from the database and go to the architect.
- **Impact claimed:** see §7.4.
- **Internal research panel:** Claude's findings on related spec sections, sheets, prior RFIs and submittals. Visible **only** to `rfi.view_internal_research`.
- **Architect:** gets a permanent access link. They answer on the page **or by replying to the email**, and the reply attaches to the RFI. The answer is then distributed and posted to the board.
- **Log** (§7.4), **search** (§7.5), and the **impact-claims report**.

### 14.2 Submittals
- **Register built from the specs.** `buildSubmittalRegister` reads Division 01 and each section's Submittals, Closeout Submittals and Warranty articles. It proposes the register:
  - every required submittal, by section;
  - warranties and their durations;
  - O&M manuals, attic stock, training, as-builts.

  The PE confirms it. The same list becomes the **closeout log**.
- **Workflow:**
  1. The package is prepared.
  2. PM/PE review.
  3. Transmittal to the architect.
  4. The architect stamps it: Approved / Approved as Noted / Revise & Resubmit / Rejected.
  5. It's distributed.

  Revisions are numbered `-01`, `-02`, and so on.
- **Log** (§7.4). Approved submittals can be starred to My shelf.

### 14.3 Drawings and specs
- Sheets come from Phase 2.
- Spec sections are split by section number, with full text, so they're searchable and can be starred.
- Proprietary folders and view-only work as in §6.5.

### 14.4 Phase 4 acceptance
- **CI:** a rough text-plus-photo becomes a draft, then is originator-signed, PE-signed, numbered and issued. A reply by email attaches to the RFI. The role probe hides the internal research from the sub and the architect.
- **Acceptance run:** the submittal register built from a real spec set (Hunter Hall Vol 1/2) matches a hand-checked sample of 20 sections.

---

## 15. Phase 5 — Schedule import, meetings, special inspectors, timesheets, send-as

- **Schedule import:** P6 (XER/XML) and MS Project (XML), shown as a 3-week look-ahead and milestones. What's new shows what moved.
- **Meetings:** agenda, minutes and action items.
  - Open items carry forward.
  - Record or dictate the meeting, Claude drafts the minutes, a person approves them, and the PDF goes to attendees.
  - Action items become tasks.
- **Special inspectors:** invited per project.
  - They upload reports in any format, or email them in.
  - The log gets a draft extraction (type, date, location, result), with the original file as the record.
  - Each report is matched to its calendar entry.
  - Failing or nonconforming results are flagged **internally** to the IOR.
- **Timesheets and invoices** from daily-report hours:
  - the contract / used / remaining table (MDR's timesheet math and tests, with the `priorWindow` UTC fix);
  - invoice approval happens in place from "Needs you."
- **Send as me:** Gmail/Outlook OAuth, with tokens in Vault.
- **Paid-workspace account mechanics** (no pricing UI).
- **When a job ends,** invited people keep copies of their own work, such as inspector reports and the bids they sent.
- **Role dashboards:** the superintendent setup (designed with a super) and the PM setup (from Matt's real use).
- **Leave-now traffic pushes.**

---

## 16. Open questions

Each one is tagged with the phase it blocks.

1. **Blocks Phase 1: the AI approach.** Jesse wants to talk about the AI piece. §8.7 is the default until then: Claude only, no vector database, drafts that people confirm.
2. **Blocks the first real outside email:** the app name and domain, including the `in.` subdomain for project email addresses.
   - Jesse is deciding the name later; the placeholder is `FUTURE_NAME`.
   - The domain must be set up at least 2–4 weeks before the first live bid (warm-up).
   - It does not block starting Phase 0.
3. **Blocks Phase 1: Matt's inputs.**
   - His latest estimate workbook template.
   - Which ITB template to use.
   - His clarifications library.
   - His trade-agreement template.
   - The required-forms and compliance seed list for each job type.
   - How he'll grade the RSA run.
4. **Blocks Phase 1: should "send as me" (Gmail/Outlook) move earlier?** It makes emails to districts and architects far more likely to arrive.
5. **Blocks Phase 1: who sees pre-bid answers?** All bidders on the job, or only the asking trade? The recommendation is all bidders.
6. **Blocks Phase 1: Phase 1a.** Jesse originally wanted to test on a real bid right away. Option: run the first live bid with the Phase 0 foundation plus §11.3–11.5 (invites, bidder page, receipts, Q&A, addenda, audit, probes, security review), and do leveling in a Claude session the way the RSA trial was done, until §11.6 ships. Jesse decides.
7. **Confirm at the start of each item's phase:**
   - two-factor authentication for admins and pricing roles;
   - drawing stamps for outside people;
   - view-only folders;
   - the sealed-bid switch, and the bidder grace period after bid time;
   - sheet splitting;
   - permanent access links plus email codes replacing MDR's no-account links;
   - the amber row highlight for impact claimed alongside the amber postponed chip;
   - whether PEs get any bid capabilities.
8. **Phase 3: MDR inspector tools.**
   - Which of MDR's inspector tools come into the suite, and when: inspection cards, trackers, correction notices, UL checklists, framing reader, inspection ledger, morning briefing.
   - The MDR copy table (Appendix A) covers the code pieces.

---

## 17. Definition of done (every phase)

- Every acceptance item is either an automated test or recorded as manually verified by Jesse, with a date.
- CI is fully green.
- Staging is deployed, and the anon probe passes on staging.
- The security advisor shows zero ERRORs.
- `docs/decisions.md` has a short entry for each non-obvious choice.
- `CLAUDE.md` is updated only if a rule changed, and it stays under 200 lines.
- Jesse has walked through the phase and said go.

---

## 18. Phase 6 — Roles and processes (Jesse, Oct 3, 2026)

Written from Jesse's role-by-role walkthrough on the evening of Oct 3, after a day of research into what each role on a
California commercial / public job actually does (Cal/OSHA Title 8, AIA A201-2017, ConsensusDocs, the California
prompt-payment, retention and lien statutes, DSA's IR A-8 and PR 13-01, OSFM's 2026 permitting guidelines, CSU's plan
review program, UC campus fire-marshal procedures, GC job descriptions, practitioner write-ups and vendor docs).
**Where §18 and an earlier section disagree, §18 wins.** It supersedes in particular: §1 "Not goals" about markup (the
IR map highlighter and the Bluebeam round trip are in), §13.1's fixed daily form (forms are configurable, below), §13.2's
OFS flow (the route below), and §15's ordering.

### 18.1 Principles (every phase from here)

1. **Process, not features.** Jesse: "We're not just adding a bunch of shit and dumping it in here as 'look at all the
   stuff our thing can do' — that's what everybody else has done, and poorly." Streamline the process; make everything
   talk to everything; show a good amount, not everything. If a screen grows a pile of options, the process is wrong.
2. **Kill the paper chain.** Today: fill out paper → photograph it → attach to an email → someone downloads it →
   re-enters it somewhere else. Every step happens once, in the app, by the person doing the work; everyone else pulls
   it from where it lives. Nothing is passed around or downloaded to be re-uploaded.
3. **Give people something back.** People only feed a system that pays them back: smart processes that save time,
   remember for them and capture everything. Accurate documentation; no action a person repeats that an algorithm can
   do.
4. **One source, many views.** A record is stored once. Logs, the permit's record, reports, the board and the zip
   exports all read it. When the deputy approves an inspection it is in his record set because it is the same record.
5. **The job is typed once.** Whoever creates the job enters its facts (name, number, address, ZIP, phone, owner,
   permit numbers, people). Every document prefills from them; nobody types an address again.
   - **Weather is automatic:** the National Weather Service API (free, no key) for the job's location, recorded on each
     daily (high / low / conditions); the person can correct it. The address is geocoded once, at job creation, with the
     US Census geocoder (free, no key). (External services approved by Jesse Oct 3.)
6. **All my jobs is the to-do list.** The landing page feeds everything a person owes or must act on, from every job, in
   one place, most urgent first: due dates, notice clocks ("4 days left to submit this"), failed tests, unsigned T&M,
   overdue tailgates. A morning briefing; on Monday, "this is your week." Deadlines are shown as they are: no leeway.
7. **Every repeated record is a document and a log line.** Dailies, sign-in sheets, inspections, special inspection
   reports, minutes, T&M tickets, safety inspections: each is its own signed PDF and a line on its log. **Every log
   downloads as a zip** for a week, a month or the whole log (like MDR's IR result log).
8. **Frequencies are theirs.** Daily / weekly / as needed / every N working days are settings with sensible defaults.
   Legal minimums are rules the app watches (e.g. tailgates every 10 working days per crew).
9. **Colors stay ours** (lib/status): red = late, rejected, failed; yellow = pending, due soon; green = approved,
   confirmed, done.
10. **Forms: ours, configurable, or theirs.** Every form (dailies, minutes, T&M, safety inspection, pay app) comes as
    our standard with every field worth having; each company ticks the fields it wants, renames and reorders them,
    adds its own. Or it uploads its own form once and maps the fields (§8.3, the VIS daily pattern), and we fill it.
    "That's not ours to dictate."
11. **Settings stay open.** Each person picks their tools (rail Edit) and ticks the notifications they want ("tell me
    every time an RFI is answered"). Gate only what must be gated: money stays in pricing tables (rule 3); the owner
    doesn't see the GC's pay internals; subs don't see budgets.
12. **Not ours: accounting, payroll filing, legal advice.** We track the paperwork and the dates and raise flags; a
    person verifies. E.g. the payroll cross-check says only "looks fine" or "found inconsistencies — double-check".

### 18.2 Where things stand (Oct 4)

- **Live on staging** (migrations 0001–0062, 0065–0067): bids (Phase 1 core), files (failed uploads can be stopped and
  removed, drop to upload), calendar, dailies (company forms, VIS), inspections (member form, GC step, no-login QR
  requests 0055, Requester role), deliveries, corrections, RFIs (route strip, signed sections), permits + stamping
  (0052–0053, reviews under one permit 0061), comments (0050), the job-only rail (0058), Safety (0060), Schedule (0062)
  and **Revs** (0056–0059): rev lists pasted from the legend, walls by level and drawn on the plan sheet, wall pages with
  the 3-D wall, the OFS request with its IR map (3 colors, drawn from the walls).
- **6a is done and walked on the real screens (Oct 4):** the OFS route (0061, P1): sub → GC → inspector (Send to OFS /
  Postpone only) → fire marshal (confirm, pass / fail per wall, signature, IR, signed map); OFS IRs and maps in their
  own folder; an IOR request beside it keeps the inspector's steps and its own folder; the deputy's lists show OFS
  requests only. The readiness checklist is gone.
- **Found by that walk, fixed (0066, 0067):** the hosted database gave the server key almost no table rights, so no
  server-made PDF had ever been stored on staging (now written down in 0066 and tested, CLAUDE.md rule 1); the hosted
  runtime writes times with a narrow space the PDF font can't draw, which stopped every signature (`pdfSafe`, the one
  stamp); an upload that never finished was offered as a plan sheet.
- **Built, not live** — branches `wave2-requirements` (0063) and `wave2-dailies` (0064), on GitHub; they merge into
  main in 6b (most conflicts are "both sides appended to a list"; migrations that re-create `job_rail_tools()` and
  other shared functions must end with the union of every tool). Not applied to staging, so their files may still be
  edited.
- **Build environment notes:** npm is blocked in the cloud container (pdf.js is vendored, `src/vendor/pdfjs`); vitest,
  knip and `vite build` run only in CI; migrations are applied with the Supabase MCP `apply_migration` using the file's
  exact text, then the stored SHA-256 is checked; edge functions are deployed from bundles and read back byte for byte.
  A test database is built two ways locally: from zero, and with the hosted project's stricter default privileges;
  the suite passes on both. Details: `claude/handoff-next-session.md` in the project.

### 18.3 Accounts (roles)

Roles are data (`roles`, `role_permissions`); capabilities only, never role names in code (rule 2). Each role below is
its **default**; the person can add tools (rail Edit) and notifications (checkboxes) within what the role may see.

| Account | Is | Sees | Never sees | Default tools |
|---|---|---|---|---|
| **Inspector** (IOR; `inspector`, `inspector_admin`) | Jesse's role; already built from MDR | Everything on the job's documents: plans, specs, submittals, RFIs, CCDs (as soon as the architect posts them), the punch list, dailies | The GC's money | Inspections, plans/specs/submittals/RFIs, the inspection log, the inspection schedule page, punch list, dailies, hours |
| **Superintendent** ("super tools") | The GC's field lead | The whole field: sign-ins and live manpower by company, dailies, deliveries, inspections, the look-ahead, safety, T&M, punch list, RFIs, submittals | Pricing | Board, the day's crew / manpower, daily, inspections, deliveries, look-ahead, safety, punch list |
| **Foreman / field lead** (`foreman`) | The sub's (or GC's) crew lead: "that lower level of management that's still super important" | Their crew, their daily, their requests, their T&M, their tailgates, their punch items, the look-ahead, plans/specs | Other subs' paperwork, money | Crew sign-in, daily, inspections, T&M, tailgates, punch list |
| **PM/PE** (`pm`, `pe`: one account in the picker, same capabilities) | Interchangeable in practice ("PMs wind up doing a lot of PE work") | All documents and logs; money (pricing roles) | — | Board, requirements, submittals, RFIs, change events, minutes, schedule, files; they choose the rest |
| **Safety manager** (`safety`) | Minimal: "there's not much for them to do" | Safety: tailgates, the safety library, site safety inspections, incidents | Everything else unless granted | Safety |
| **Owner's rep / CM** (`owner_rep`) | The district's or university's person | All RFIs and CM documents, meeting minutes, safety briefs, dailies, the punch list; **allowance and contingency logs** (they approve each item and every spend) | The GC's pay and money internals | Board, RFIs, minutes, dailies, allowances, punch list |
| **Architect / consultant** (`architect`; consultants are the same account type) | Design team; engineers sometimes answer without the architect | RFIs, submittals, ASIs and field orders, plans/specs, minutes, punch list | Money (except change orders they sign) | Review queue (RFIs + submittals), ASIs / field orders, punch list, files |
| **Fire marshal** (`ahj`) | OFS deputy / AHJ | Permits, Revs, OFS inspections routed to them, the permit's record, plans | Money | Permits, inspections, Revs |
| **Special inspector / lab** (`special_inspector`) | Gets requests through the inspector | **View-only** plans, specs, RFIs, submittals (no edits; downloads off by default) and their own requests | Everything else | Their requests, their reports |
| **Sub company office** (`sub`) | The sub's PM / admin behind the foreman | What they owe on every job (on All my jobs and per job), their foremen's work, their pay package | Other subs, the GC's money, budgets | Board, what I owe, submittals, RFIs, pay package |
| **Requester** (no login, 0055) | Sub in the field via QR | Their own requests and status | Everything else | — |
| **Meeting sign-in** (no login) | Anyone at a tailgate, job meeting or the morning crew sign-in, via its QR | That meeting's sign-in page only: sign your name, done | Everything | — |

Estimator / bidder / viewer are unchanged (Phase 1). **Provisional:** the matrix rows added on Oct 3 (safety,
schedule, requirements, revs.manage) are Jesse's to confirm.

### 18.4 Processes

**P1. Inspection requests: the route is the readiness check.**
1. The sub (member, or no-login QR) requests → **the GC reviews and confirms what's ready** (the existing GC step, as in
   MDR) → **the inspector** decides, and routes it on:
   - **special inspection:** the inspector gets an **email** for each one and forwards it to the lab (it works today;
     keep it).
   - **OFS:** the inspector sends it to the deputy. The deputy confirms, inspects, passes/fails per wall and item.
2. **No per-item yes/N/A readiness boxes** (remove 0061's checklist). Every step is already on record because the route
   recorded it. When the **inspector files a request themselves**, one acknowledgment, once: "submitting as the
   inspector, I state the following is true", not a box per item.
3. **One extra question: special inspection required?** If yes, a small notice: "Have the special inspector's reports
   on site and available for the fire marshal."
4. **Numbers:** the IR number and the OFS IR number are assigned **when the request is submitted**, by the database
   from a locked counter (as MDR's Oct 2 fix: a typed number is only the requester's own reference).
5. **Revs out of order: no warning.** Opening the wall shows what's already signed off.
6. **Signatures:** the deputy signs and dates a passed OFS IR; an extra project signature box is available, never
   required.
7. **Results feed everything:** a failed result or failed test shows **red** on the board of everyone who chose to know;
   every OFS inspection and every rev (as created) feeds the permit's record automatically.

**P2. The field day.**
1. **Morning crew sign-in.** Each foreman signs their guys in on their phone (yesterday's crew, a tap each), or
   everyone signs in at the morning QR (the same no-login sign-in page as meetings). No paper roster. The **super sees
   live manpower by company** ("the electricians only have two guys here today"). This is the day's record of who was
   on the job.
2. **The super's daily is built from the sign-in.** Manpower, deliveries, inspections and results, weather (automatic),
   tailgates held come in by themselves; the super adds work performed, delays and anything else, and signs. Our
   standard form (fields ticked on/off per company) or their own mapped form. No separate "for the record" line.
3. **The foreman's daily** fills the same way (crew and hours from the sign-in); they add work by area, quantities,
   materials, delays.
4. **Payroll cross-check (public works):** compares sign-in hours with what the company reports, and only says
   "looks fine" or "found inconsistencies — double-check this." We are not responsible for payroll.
5. **T&M tickets:** the crew checks in with whoever is watching the work (foreman, super, PE or inspector — anyone with
   the right), who verifies through the day and **signs the same day**: check-in, photo, description, signature. It's
   only a verification signature. Unsigned turns yellow, then red the next day. A ticket can attach to a change event
   (P5).
6. **Tailgate safety meetings** (built, 0060): run by the crew's own supervisor at least every **10 working days per
   crew** (8 CCR 1509(e)); topic from the library (OSHA / NIOSH public-domain talks we may host; CPWR and Cal/OSHA only
   by link) or their own upload; attendees sign in on the meeting's **public QR page** (the only no-login page besides
   QR requests); a signed sign-in sheet PDF. "Due soon" to the foreman on day 8, "overdue" on day 10 (then the super and
   safety manager see it too).
7. **Super tools:** the site safety inspection is **as needed**: the super starts one and the app fills what it knows.
   Incidents: a serious injury shows a red banner "report to Cal/OSHA within 8 hours" (8 CCR 342); the app doesn't file
   it.
8. **No job hazard analyses / pre-task plans** for now (a safety-department form, not a legal daily task).
9. **Spanish only where a state or federal rule requires it** (e.g. the heat illness plan, required postings). Leave
   the rest alone for now.

**P3. Documents and reviews.**
1. **RFIs:** the existing route and signed sections. Option per job: **the inspector holds an RFI before it goes to the
   architect** (some inspectors do it, and DSA jobs lean that way; Jesse doesn't). The architect answers fast: their **stamp** (an
   image they upload once) is placed on the RFI in the app, with a comment — seconds, not a download / stamp / re-upload.
   Consultants answer and sign their own section; sometimes without the architect.
2. **Submittals: one register for everyone**, built from the spec book (P4). The PE sees everything they owe without
   being told; the architect sees everything they're expecting and checks items off by spec section as they arrive;
   anyone with the right uploads (intern, PM, PE). The architect stamps in the app the same way. Inspectors aren't
   notified of new submittals; they look them up.
3. **ASIs and field orders:** their own log.
4. **CCDs and DSA documents:** we don't produce DSA forms. We store them, and **connect to Box** (DSA works in DSAbox) so
   a CCD posted there shows up here — the inspector sees it as soon as the architect posts it.
5. **Bluebeam round trip:** architects live in Bluebeam (markups, Studio, BIM). Make opening a sheet in Bluebeam and
   bringing the marked-up file back as the next version one step each way.
6. **Plan links (later step, P-order 6g):** like Forma — tap a detail bubble, land on that sheet; specs and submittals
   linked; tap a wall and the right column shows a light summary (its submittal, its spec section), never the full
   documents (keep the backend light). An answered RFI that names its detail ("detail 10 on S10.5") links itself onto
   that sheet; others are placed by hand if someone wants them there.
7. **Special inspection log:** special inspectors upload their reports here (they email them today); lab test reports
   are uploaded by hand. The log builds itself; clocks per §18.5.

**P4. The spec book → the requirements register → the schedule.**
1. **Requirements register** (built, 0063): everything the books commit someone to — submittals (action /
   informational / closeout / maintenance material), tests and witnessing, manufacturer field reps (flexible: "not every
   manufacturer sends a rep, sometimes they just take pictures"), special warranties, attic stock, training, mockups,
   notices, recurring reports, owner-furnished (OFCI) items — each with the source paragraph, who owns it, its trigger
   and its due date. AI drafts from a spec section; a person confirms every line (rule 12).
2. **The procurement chain:** need date (from the schedule activity) → order-by (minus lead time) → submit-by (minus
   review times from 01 33 00). Yellow, then red.
3. **OFCI:** the notice-to-owner date counted back from the need date. Jesse's example: the contractor must tell the
   owner 60 days ahead for the Hunter Hall restroom accessories — when restroom finishes first appear in the two-month
   look-ahead, the PE's board says "order the OFCI accessories."
4. **Closeout from day one:** the same register filtered to closeout items, each owned by a sub, visible to that sub on
   day one (and on their All my jobs).
5. **Schedule** (built, 0062): one Upload button — PDF or photo first (what supers actually hand out), then P6 XER
   (common on CA public work), MS Project XML, CSV / the super's Excel look-ahead. No live API feeds yet (Project Online
   retired Sep 30, 2026; Autodesk Build has no schedule API; Procore later). Activities matched to register lines by ID,
   codes, keywords/CSI, then AI — a person confirms each match; matches survive monthly updates by activity ID. The
   3-week look-ahead is the super's weekly view; the monthly update rides with the pay app. Reminder rules are data.

**P5. From a change to getting paid.**
1. **A field event, CCD or RFI answer starts a change event in one tap** and starts its **notice clock** (the contract's
   own days; defaults: A201 claims 21 days, concealed conditions 14; ConsensusDocs 14), shown up front on the board.
   The app never says "notice given" unless the notice was sent the way the contract requires.
2. Signed T&M tickets attach; sub quotes → the GC's proposal to the owner → executed change order → a line on the next
   pay app.
3. **The pay app package (monthly):** their own pay app PDF mapped once and filled, or our standard one (schedule of
   values, percent complete from the super's walk, change orders, retention). The package fills itself and shows what's
   missing per sub: the updated schedule, **conditional lien waivers** (the four California statutory forms, CC
   8132–8138; an unconditional waiver is never recorded before payment shows as paid), the payroll flag, as-builts
   reviewed. Clocks per §18.5.
4. **Owner money:** allowance and contingency logs; the owner's rep approves each one and every spend under it.
5. **Budget / cost forecasting:** not built in for everyone; an option a job turns on when there's a need.

**P6. Meetings and minutes.** Our standard minutes (attendees, the standing sections, items carried forward with who /
due / resolved) — the standing sections fill themselves from the live logs (open RFIs, submittals due, change status,
pay app status); they add their own fields, rename and move them. Who writes them is a job setting. Attendance by the
meeting's QR sign-in.

**P7. One punch list.** One live list per job — never three or four versions on the site. Anyone with an account adds
items (open, photo, one line, done); every item shows who added it; sort and filter by who added it (inspector,
architect, owner, GC). Sign-off by whoever added it, or by a person or group allowed to (e.g. the architect may sign off
the inspector's items). The architect's substantial-completion punch goes on the same list. Separate from the
inspector's corrections log, linkable.

**P8. Permits and the OFS record.** Keep 0061's fixes that match OSFM's process: deferred items, addenda and change
orders are **reviews under one permit**; several reviews open at once; the stage after Issued is **Inspected (IS)**
(every required inspection passed); expiry is 12 months from issue **or the last inspection**, whichever is later. The
permitted plan set comes in when the job is created / its first plans are uploaded, and markups go back in as new
versions. Every OFS inspection and every rev feeds the permit's record (P1.7). Later: correction notices from failed
items with a prefilled reinspection, system tests (sprinkler hydros, alarm acceptance, fire pump, dampers, generator),
NFPA 13 / 72 completion records, a one-page job card per permit.

**P9. Logs and exports.** Every log: filter, the record's PDF one tap away, a zip of a week / month / everything (§18.1
#7). Downloads logged (rule 13).

### 18.5 Rules as data (defaults; a job's contract or spec overrides)

| Rule | Value | Source |
|---|---|---|
| Tailgate meeting per crew | at least every 10 working days; records kept 1 year | 8 CCR 1509(e), 3203(b)(2) |
| Serious injury report | within 8 hours (banner only) | 8 CCR 342 |
| High heat | pre-shift meeting at 95°F | 8 CCR 3395 |
| Claim notice | 21 days (A201 15.1.3); concealed conditions 14 days (3.7.4); ConsensusDocs 14 | AIA / ConsensusDocs |
| Pay app | submitted 10 days before the pay date; architect certifies within 7 | A201 9.3.1, 9.4.1 |
| Pay subs | within 7 days of being paid | B&P 7108.5 |
| Retention | public ≤5%; released 60 days after completion, then 7 days to subs (private: 45 / 10) | PCC 7201, 7107; CC 8812/8814 |
| Lien waivers | four statutory forms (conditional / unconditional × progress / final) | CC 8132–8138 |
| Preliminary notice | within 20 days of first furnishing | CC 8200 ff. |
| Certified payroll | to DIR eCPR at least monthly (weekly if the contract says) | LC 1771.4 |
| Apprenticeship (DAS 140) | within 10 days of signing | LC 1777.5 |
| Insurance certificate | reminder 30 days before expiry | practice |
| Special inspector daily | within 1 day; nonconforming results immediately | CBC 1704; DSA PR 13-01 |
| Lab report | within 1 working day (on site), 7 days at most | DSA PR 13-01 |
| IOR review of test reports | by the end of the next working day | DSA IR A-8 |
| DSA semi-monthly (DSA 155) | 1st and 16th | DSA IR A-8 |
| Fire marshal request notice | 48 h (UC campus practice) — **confirm with the OFS deputy** | UCI procedure |
| OSFM permit | expires 12 months from issue or the last inspection; at most 2 extensions of ≤180 days | OSFM guidelines 2026 |
| OSFM IR map | one map per IR, 3 colors max, never two alike, title with both IR numbers, phase, date and what; deputy signs passes, writes why on fails | Hunter Hall convention — confirm with the deputy |
| Closeout | O&M draft 30 days before training; training booked with 14 days' notice; correction period 1 year from substantial completion | typical specs; A201 12.2.2 |

### 18.6 Not now

- The building metadata / spec digest for inspection cards (MDR's inspector tools): a later phase, elsewhere.
- A live, marked-up master plan set ("the biggest hurdle"): not until Jesse decides it's ours to solve.
- Accounting, payroll filing, budget forecasting for everyone (optional module only), Cal/OSHA 300 logs.
- Spanish beyond what a rule requires; job hazard analyses; live schedule APIs (Procore later); weather-driven
  triggers beyond recording the day's weather.

### 18.7 Build order

Each step: CI green, live on staging, Jesse walks it (§0). Matrix changes stay provisional until he confirms.

- **6a — Monday, Oct 5 (the OFS deputy's first look). Done Oct 4 (§18.2).** Run Revs end to end on staging with the A202 sheet (Jesse
  uploads it; Claude may not upload files): walls on Level 02 drawn on the plan, an OFS request with its map, the
  deputy's pass/fail, signature. Rework the OFS route per P1 (sub → GC → inspector → OFS; inspector acknowledgment;
  special-inspection notice) and **remove 0061's readiness checklist**; keep 0061's permit fixes (P8) and the permit
  link; merge and ship.
- **6b — Ship the rest of wave 2 with tonight's changes.** Merge `wave2-requirements` and `wave2-dailies` into
  `wave2` (union every shared list; `job_rail_tools()` ends with every tool). Changes: dailies weather from the NWS
  API (typed override) and per-company field ticks / rename / add; super's and foreman's manpower from the crew
  sign-in (6c); requirements visible to each sub for their own lines; Safety as built (QR is meetings only).
- **6c — The field day:** foreman crew sign-in + live manpower, T&M tickets, super tools (site safety inspection),
  logs with zip export, job facts typed once + geocode + weather.
- **6d — Documents:** one punch list (P7); the submittal register (expected list / owed list); the architect's stamp
  in the app; ASIs / field orders log; the optional inspector RFI hold; special inspector view-only access, report
  upload and the special inspection log; failed results red on boards; notification checkboxes; the morning briefing
  and Monday "this is your week."
- **6e — Spec → schedule triggers:** the procurement chain, OFCI notices, closeout from day one, notice clocks.
- **6f — Money:** change events with notice clocks, the pay app package (theirs mapped or ours), lien waivers, the
  payroll flag, allowance / contingency logs (owner approves), budget as an optional module. **Matt reviews first.**
- **6g — Connections:** Box (DSAbox) for CCDs and DSA documents; the Bluebeam round trip; plan links (detail bubbles,
  RFIs on sheets).

### 18.8 Open questions

- **For the OFS deputy (Monday):** who builds the revs and may change them; who assigns the OFS IR number today; whether
  OSFM's Procore requirement (Info Bulletin 24-010) applies to CSU jobs; request notice period; whether "Revs" and the
  map rules are OFS practice or Hunter Hall's; what record OFS must own; who gets `revs.manage`.
- **For Matt:** how deep the money goes (6f); pay app format; budget module.
- **For Jesse:** confirm the provisional matrix rows (safety, schedule, requirements, revs.manage); the special
  inspector download setting; whether the lab gets its own account or only the inspector's forwarded email.

---

## Appendix A — What to take from MDR

- MDR's repo is at `~/Documents/my-daily-reports-pwa` on Jesse's Mac. **It is reference only; never modify it.** Copy the **behavior** and rewrite it in TypeScript under these rules. Don't paste its structure in.
- The workflow reference is the project doc `mdr-processes-to-carry-over`.

| MDR source | Destination | Required changes |
|---|---|---|
| `src/utils/saveFile.js` | `src/lib/saveFile.ts` | Make it the only download path. Phone share sheet vs desktop download; handle cancel. |
| `src/components/ObservationEditor.jsx` (photo compressor, ~lines 23–48) | `src/lib/compressPhoto.ts` | Return a Blob for upload, never base64 in database rows. |
| `src/utils/camera.js` | inside `src/lib/compressPhoto.ts` or `ui/Camera` | Keep the Android-only capture detail. Test on iPhone. |
| `src/utils/dates.js` (`getTodayISO`) | `src/lib/dates.ts` | Use the project time zone (date-fns-tz). |
| `src/constants/irStatus.js` + generated `public/shared/ir-constants.js` | `src/lib/status.ts` | The only status color and label source. Adjust hues for the white background. |
| `src/utils/timesheetMath.js` + its tests | `src/lib/timesheet.ts` (Phase 5) | Fix the `priorWindow` UTC date shift. Keep the tests. |
| `src/utils/vis-generator.js`, `src/utils/pdf.js` | `src/lib/pdf/generators/vis.ts` (Phase 3) | Pure builder. Bundle pdf-lib; no CDN polling. Use the logo passed in. Continuation pages for overflow. |
| `public/ir-generator.js` | `src/lib/pdf/ir.ts` (Phase 3) | The worker renders it. Signature per §6.9. POSTPONED/CONFIRMED stamps. |
| `supabase/functions/acknowledge-observation` | Pattern for `delivery-board` / `request-link` | Input checks, "is this meant to be public", database unique for repeats, real status codes. |
| `supabase/functions/send-report` (suppression list, rate-limit backoff, send counter) | `_shared/email.ts` | Recipients from the database only. No arbitrary URL fetches. Escape everything. |
| `supabase/functions/parse-template` (field learning + filename convention) | `learnTemplate` task + `lib/buildFilename.ts` | Typed prompt with fixtures. One filename function. |
| `supabase/functions/parse-schedule-photo` + the `construction-schedule-reader` skill | Schedule reader (Phase 2) | Same carryover / new starts / hot walks shape. |
| `src/utils/navStack.js` | not copied | Use the router instead. |
| LLM wrapper, embeddings, specialist core | **not copied** | Jesse's decision (§16 Q1). |
