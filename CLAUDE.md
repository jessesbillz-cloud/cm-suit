# CLAUDE.md — rules for this repo

Read this at the start of every session. **Keep this file under 200 lines.** It holds rules, not history; history lives in git and in `docs/decisions.md`.

## What this is
The product name isn't decided. Use `FUTURE_NAME` from `src/lib/brand.ts` (server: `BRAND_NAME` env). Never hard-code a name anywhere else.

A construction-management suite (bids, daily reports, inspection scheduling, deliveries, corrections, RFIs, submittals, files, calendar). The owner is Jesse Saltzman, and the first customer is Matt Lulling. The full spec is in `SPEC.md`; build it one phase at a time, and stop for Jesse's OK at the end of each phase. The design source notes live in the claude.ai project "MJ CM Tools." If the spec and the notes disagree, ask Jesse.

**This is not My Daily Reports (MDR).** Don't read MDR's code or conventions as rules for this repo. The only MDR pieces allowed here are the ones the spec names, rewritten to these rules.

## Hard rules
1. **Deny by default.**
   - Every table gets row-level security (RLS) in the migration that creates it.
   - No `USING (true)` policies, no `anon` or `public` grants, except the entries in `supabase/tests/anon_allowlist.sql`.
   - The server key (`service_role`) gets its table rights from migrations, never from the database's defaults (hosted and from-zero differ). The map is `supabase/tests/58_service_grants.sql`.
   - Every SECURITY DEFINER function sets `search_path = public, pg_temp`, gets the caller from `auth.uid()` (never from a parameter), and has EXECUTE revoked from `public` and `anon` unless it's on the allowlist.
2. **Permissions come from one place.**
   - RLS calls `has_capability(project_id, '<cap>')`, which reads the `role_permissions` table.
   - Never hard-code role names in policies, edge functions or the UI.
3. **Money lives only in pricing tables** that only pricing roles can read. Never hide money in the UI alone.
4. **Edge functions.**
   - Use `_shared/auth.ts` for auth: `requireUser`, `requireCapability`, `requireCron`, `requireWebhook`.
   - Use `_shared/http.ts` for every response. Never return 200 on a failure.
   - A missing secret or env var means refuse the request, never skip the check.
   - `requireUser` is the real gate. `verify_jwt` stays on as a second layer, except on the public endpoints listed in SPEC §6.4, and every function is listed in `supabase/config.toml`.
   - The service-role key is used only in:
     - cron jobs, webhooks, queue workers and the listed public endpoints;
     - admin functions named in `supabase/tests/admin_service_key_allowlist.txt`, which must call `requireCapability` first.
   - Queues (`pgmq`) are never exposed to the API. Jobs are enqueued only through the `enqueue_job` RPC.
   - Outside people get in through permanent access links plus an email code (SPEC §6.4). Never through magic links, which expire and get burned by email scanners.
5. **The app talks to Supabase only through `src/data/`**, which holds the generated types, queries and mutations. Lint bans `fetch(` and Supabase URLs anywhere else.
6. **Errors are loud.**
   - No empty or swallowing catch blocks.
   - A Supabase `{ error }` is always checked and turned into a thrown error.
   - Every screen shows loading, empty and error states differently.
7. **The database owns numbering, uniqueness and duplicates.**
   - Numbers come from `next_number(project_id, kind)`, backed by unique constraints.
   - Writes are safe to repeat.
   - Saves carry a version check.
   - Never compute a number or an ID in the browser.
8. **No job, customer or user data in code.** That means no UUIDs, names, contractor lists, company rules or plan images. Put them in the database or private storage.
9. **Settings have one zod schema per settings object**, with defaults defined in one place only.
10. **Small pieces.**
    - Components under about 300 lines; edge functions under about 500.
    - No module-level mutable state.
    - No components defined inside components.
    - No window events for app flow; use the router.
11. **One implementation of each shared thing:**
    - download: `lib/saveFile`
    - upload: `data/upload`
    - photo compression: `lib/compressPhoto`
    - toast: `ui/Toast`
    - status colors: `lib/status`
    - filenames: `lib/buildFilename`
    - PDF signature stamp: `supabase/functions/_shared/pdf/stamp.ts`
    - storing a server-made PDF: `_shared/generatedPdf.ts`; signing button: `features/auth/SignButton`; content hash: `_shared/crypto.ts contentHash`

    Don't write a second one.
12. **AI.**
    - Only through `_shared/ai.ts` typed tasks.
    - Prompts live in `prompts/<task>.md` with fixtures.
    - Document, email and bid text goes in the user turn as escaped untrusted blocks, never in the system prompt.
    - Output is validated with zod.
    - The AI never sends, approves, deletes, or saves instructions. It only creates drafts that a person confirms.
    - Subs never see AI output about their own submissions.
13. **Files and signed records.**
    - Signed and legal PDFs (daily reports, IRs, RFIs, proposals, addenda) are rendered by the worker from saved content and bound to a content hash. Never in the browser.
    - Signing requires re-confirming identity (SPEC §6.9).
    - Storage is private.
    - Every download is one click, with the original filename, through a fresh signed URL.
    - Emailed links are permanent share links that check access on every click.
    - Log every download.
14. **Time.** Store UTC. Compute "today," reminders and report dates in the project's time zone. The browser's zone is detected and written to the profile (`sync_detected_timezone`); a new job takes its creator's zone. Nobody is asked to pick one, and no screen ever shows a raw UTC time: every display goes through `lib/dates` (lint bans `toLocale*` and `toISOString` outside it).
15. **UI.**
    - White cards with soft shadows on a near-white page, one accent color.
    - Status chips and calendar marks use colors from `lib/status` only.
    - An amber *row* highlight means "impact claimed" only. Errors use red text or a red banner.
    - **No emojis.** Lucide line icons only where they carry meaning.
    - The fixed frame is rail / main / right column. People can't drag or resize anything.
    - No expand/collapse boxes inside items, no cut-off titles, no ball-in-court or days-open columns. The RFI log shows each RFI's route strip with the time at each step instead (Jesse, Sep 30).
    - **Fewer words.** Short labels, no explanatory paragraphs on screens, no helper text unless something would fail without it. If a screen needs explaining, simplify the screen.
16. **No wasted movements.**
    - One way to reach each thing.
    - Each piece of information is stored once and linked everywhere else.
    - Prefill anything already known.
    - Undo instead of "are you sure?" (except signatures and legal records).
    - Tap budgets in SPEC §7.9 are Playwright tests. Don't break them.

## Schema changes
- **Only through a migration file** in `supabase/migrations/`, applied by the pipeline. Never run DDL by hand against staging or production.
- Regenerate types after every migration, and commit them in the same PR.
- No `;` in a migration's comments: the hosted SQL tool splits on it and refuses the cut statement (hygiene checks it).

## Repo hygiene (enforced by CI and the pre-commit hook)
- **Folder map:**
  - root holds only the files listed in SPEC §4;
  - code lives in `src/`, `public/`, `supabase/`, `worker/`, `prompts/`, `scripts/` and `tests/`;
  - notes live in `docs/` (`ideas.md`, `decisions.md`, `runbooks/`).
- **`prompts/fixtures` holds synthetic documents only.** Real job files run only in the staging "Acceptance run" (SPEC §9.3).
- **Scratch work goes in `scratch/`**, which is gitignored and wiped by `npm run clean`. Never put one-off scripts, handoff notes, dumps or test files anywhere else.
- **Commit with explicit paths.** Never `git add -A` or `git add .`.
  - The PR description lists every added file and says why.
  - If you created a file you no longer need, delete it in the same PR.
- **Blocked patterns:** `* 2.*`, `.fuse_hidden*`, `.DS_Store`, `*.tmp*`, `*.bak`, `*.zip`, stray scripts at the root.
- **knip must report no unused files, exports or dependencies.**
- **Real job files never enter the repo.** That includes plans, specs, bids and RFIs. Fixtures live in staging's private storage, or outside the repo at `$FIXTURES_DIR`.

## Workflow
1. Branch per change.
2. Write or extend tests first where practical: RLS or role probe for anything touching access, and e2e for flows.
3. Run `npm run check` locally. It runs typecheck, lint, knip, hygiene, unit, `supabase test db`, the probes and e2e (Docker required for the database parts; if Docker isn't available, say so and rely on CI).
4. Open a PR. CI must be fully green. Jesse approves the merge.
5. Merging deploys to **staging** automatically, and the anon probe plus smoke e2e run against staging.
6. **Production is promoted only by Jesse**, through the "Promote to production" workflow. Nobody deploys from a laptop.

## Commands
- `npm run dev`: app against local Supabase
- `npm run check`: every gate
- `npm run test:security`: anon probe plus role probe
- `npm run gen:types`: regenerate database types
- `npm run clean`: wipe `scratch/` and build output

## When something breaks
- **Reproduce it first**: a failing test or a probe. Then fix the cause, not the symptom. Prefer a structural fix, like a constraint, a type or a single helper, over adding another rule.
- Tell Jesse plainly what broke and the fix. Don't pile apologies onto the explanation.
- If a fix shows a rule was missing, add **one line** here. Don't write a story.

## Ask Jesse before
- anything the spec doesn't cover;
- changing the capability matrix or a public endpoint;
- deleting data or files;
- anything that sends email to real outside people from staging;
- adding a dependency or an external service.
