# Database tests (pgTAP)

- CI (`database` job): `supabase start` → `supabase db reset` (all migrations from zero) → `supabase test db`, which enables pgTAP and runs every `*.sql` here through `pg_prove`, one transaction per file, always rolled back.
- Locally: `npm run test:db` (needs Docker and the Supabase CLI). No Docker? Say so and rely on CI.
- `01`-`03` are static checks of the catalog (RLS, SECURITY DEFINER rules, anon grants, schema exposure); `04`-`07` seed users and act as them.
- Acting as a user: `select pg_temp.login('<uuid>', 'aal1')` then `set local role authenticated`; `reset role` goes back to postgres.
- `_helpers.psql` (users, login, capability probes) and `anon_allowlist.sql` are pulled in with `\ir`; the `.psql` extension keeps pg_prove from running the helpers as a test.
- `anon_allowlist.sql` is the only place anon may be granted anything. Phase 0 keeps it empty; every row needs a reason.
- Every file starts `begin; select plan(N);` and ends `select * from finish(); rollback;`. Change N whenever you add or remove an assertion.
- Fixed UUIDs: `a…` users, `b…` orgs, `c…` projects, `d…` folders, `e…` files, `f…` activity. Emails are `probe+<role>@example.test`.
- A failing test here is a bug report: fix the migration (new migration file), not the test, unless the spec changed.
