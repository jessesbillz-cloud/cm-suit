begin;
select plan(26);
-- The sub directory (migration 0018): directory managers (bids.manage on one of the org's jobs, or org admin) read,
-- edit and import; the import merges and is safe to repeat; other orgs' subs are untouched; nobody else writes.
\ir _helpers.psql

select pg_temp.mk_user('a0000000-0000-0000-0000-000000000051', 'probe+dir-admin@example.test', 'Dir Admin');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000052', 'probe+dir-estimator@example.test', 'Dir Estimator');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000053', 'probe+dir-pm@example.test', 'Dir PM');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000054', 'probe+dir-other@example.test', 'Other Admin');
-- Org 1 (admin owns it) with one job; the estimator and the pm are job members only, not org members.
insert into public.orgs (id, name, kind, created_by) values
  ('b0000000-0000-0000-0000-000000000051', 'Sample Dir Org', 'gc', 'a0000000-0000-0000-0000-000000000051'),
  ('b0000000-0000-0000-0000-000000000052', 'Sample Other Org', 'gc', 'a0000000-0000-0000-0000-000000000054');
insert into public.projects (id, org_id, name, stage, created_by) values
  ('c0000000-0000-0000-0000-000000000051', 'b0000000-0000-0000-0000-000000000051', 'Sample Dir Job', 'bidding', 'a0000000-0000-0000-0000-000000000051'),
  ('c0000000-0000-0000-0000-000000000052', 'b0000000-0000-0000-0000-000000000052', 'Sample Other Job', 'bidding', 'a0000000-0000-0000-0000-000000000054');
insert into public.project_members (org_id, project_id, user_id, invite_email, role, status, created_by) values
  ('b0000000-0000-0000-0000-000000000051', 'c0000000-0000-0000-0000-000000000051', 'a0000000-0000-0000-0000-000000000052', 'probe+dir-estimator@example.test', 'estimator', 'active', 'a0000000-0000-0000-0000-000000000051'),
  ('b0000000-0000-0000-0000-000000000051', 'c0000000-0000-0000-0000-000000000051', 'a0000000-0000-0000-0000-000000000053', 'probe+dir-pm@example.test', 'pm', 'active', 'a0000000-0000-0000-0000-000000000051');
-- Org 2 already has a sub with the same name as one being imported into org 1.
insert into public.subs (id, org_id, company, cslb_number, created_by) values
  ('5b000000-0000-0000-0000-000000000052', 'b0000000-0000-0000-0000-000000000052', 'Sample Other Co', '999999', 'a0000000-0000-0000-0000-000000000054');
insert into public.sub_history (org_id, sub_id, project_id, kind) values
  ('b0000000-0000-0000-0000-000000000052', '5b000000-0000-0000-0000-000000000052', 'c0000000-0000-0000-0000-000000000052', 'invited');

create temp table ids (k text primary key, v uuid not null);
grant all on ids to public;
create function pg_temp.id(p_k text) returns uuid language sql stable as $$ select v from pg_temp.ids where k = p_k $$;
grant execute on function pg_temp.id(text) to public;

set local role authenticated;

-- ---------------------------------------------------------------------------
-- Import as the estimator (bids.manage on a job of org 1, not an org member)
-- ---------------------------------------------------------------------------
select pg_temp.login('a0000000-0000-0000-0000-000000000052');
select results_eq(
  $$ select added, updated, unchanged from public.import_subs('b0000000-0000-0000-0000-000000000051', '[
       {"company": "Sample Drywall Co", "trades": ["09A"], "city": "Sample City", "cslb_number": "100001",
        "contacts": [{"name": "Ann Sample", "email": "ANN@example.test", "phone": "(760) 555-0101", "title": ""}],
        "extra": {"Website": "sample.example"}},
       {"company": "Sample Other Co", "trades": ["03a", "bad"], "dir_number": "1000000001", "contacts": []}
     ]'::jsonb) $$,
  $$ values (2, 0, 0) $$, 'import: two new companies are added');
select results_eq(
  $$ select company, trades, city, cslb_number, contacts->0->>'email' from public.subs
     where org_id = 'b0000000-0000-0000-0000-000000000051' and company = 'Sample Drywall Co' $$,
  $$ values ('Sample Drywall Co', '{09A}'::text[], 'Sample City', '100001', 'ann@example.test') $$,
  'import: fields, trades and a lowercased contact email are stored');
select is((select trades from public.subs where org_id = 'b0000000-0000-0000-0000-000000000051' and company = 'Sample Other Co'),
  '{03A}'::text[], 'import: trade codes are uppercased and anything not like 09A is dropped');

select results_eq(
  $$ select added, updated, unchanged from public.import_subs('b0000000-0000-0000-0000-000000000051', '[
       {"company": "Sample Drywall Co", "trades": ["09A"], "city": "Sample City", "cslb_number": "100001",
        "contacts": [{"name": "Ann Sample", "email": "ANN@example.test", "phone": "(760) 555-0101", "title": ""}],
        "extra": {"Website": "sample.example"}},
       {"company": "Sample Other Co", "trades": ["03a", "bad"], "dir_number": "1000000001", "contacts": []}
     ]'::jsonb) $$,
  $$ values (0, 0, 2) $$, 'import: the same list again changes nothing');
select is((select version from public.subs where org_id = 'b0000000-0000-0000-0000-000000000051' and company = 'Sample Drywall Co'),
  1, 'import: an unchanged sub is not rewritten');
insert into ids select 'drywall', id from public.subs where org_id = 'b0000000-0000-0000-0000-000000000051' and company = 'Sample Drywall Co';

-- A second list: same company in another case and spacing, more trades, a known contact by phone, a new contact,
-- a different city (kept), a zip (filled) and a different license number (kept).
select results_eq(
  $$ select added, updated, unchanged from public.import_subs('b0000000-0000-0000-0000-000000000051', '[
       {"company": "  sample   DRYWALL co ", "trades": ["09B", "09A"], "city": "Changed City", "zip": "92000",
        "cslb_number": "222222",
        "contacts": [{"name": "Ann Sample", "phone": "760-555-0101", "title": "Estimator"},
                     {"name": "Bob Sample", "email": "bob@example.test"}],
        "extra": {"Website": "changed.example", "Fax": "760-555-0199"}}
     ]'::jsonb) $$,
  $$ values (0, 1, 0) $$, 'merge: the same company in another case is updated, not added');
select results_eq(
  $$ select company, trades, city, zip, cslb_number, jsonb_array_length(contacts), contacts->0->>'title',
            extra->>'Website', extra->>'Fax'
     from public.subs where org_id = 'b0000000-0000-0000-0000-000000000051' and lower(company) = 'sample drywall co' $$,
  $$ values ('Sample Drywall Co', '{09A,09B}'::text[], 'Sample City', '92000', '100001', 2, 'Estimator',
             'sample.example', '760-555-0199') $$,
  'merge: trades unioned, contact matched by phone gets its title, empty fields filled, nothing wiped');
select results_eq(
  $$ select added, updated, unchanged from public.import_subs('b0000000-0000-0000-0000-000000000051', '[
       {"company": "  sample   DRYWALL co ", "trades": ["09B", "09A"], "city": "Changed City", "zip": "92000",
        "cslb_number": "222222",
        "contacts": [{"name": "Ann Sample", "phone": "760-555-0101", "title": "Estimator"},
                     {"name": "Bob Sample", "email": "bob@example.test"}],
        "extra": {"Website": "changed.example", "Fax": "760-555-0199"}}
     ]'::jsonb) $$,
  $$ values (0, 0, 1) $$, 'merge: repeating the second list changes nothing');
select is((select count(*)::int from public.subs where org_id = 'b0000000-0000-0000-0000-000000000051'), 2,
  'import: one sub per company');

-- The directory is readable by the estimator; org 2 is not.
select is((select count(*)::int from public.subs), 2, 'read: the estimator sees org 1''s directory only');
select is_empty($$ select id from public.sub_history where org_id = 'b0000000-0000-0000-0000-000000000052' $$,
  'read: another org''s history is hidden');
select throws_ok($$ select * from public.import_subs('b0000000-0000-0000-0000-000000000052', '[{"company": "Sample Sneak Co"}]'::jsonb) $$,
  '42501', null, 'import: not into another org');
select throws_ok($$ select * from public.import_subs('b0000000-0000-0000-0000-000000000051', '{"company": "Sample Co"}'::jsonb) $$,
  '22023', null, 'import: rows must be a list');

-- Edits: the directory fields only, with the version bump.
select lives_ok($$ update public.subs set notes = 'Sample note' where org_id = 'b0000000-0000-0000-0000-000000000051' and company = 'Sample Other Co' $$,
  'edit: the estimator edits a directory field');
select throws_ok($$ update public.subs set extra = '{}'::jsonb where company = 'Sample Other Co' $$,
  '42501', null, 'edit: extra is written by the import only');
select throws_ok($$ update public.subs set cslb_checked_at = now() where company = 'Sample Other Co' $$,
  '42501', null, 'edit: the check time is written by record_cslb_check only');
select lives_ok($$ insert into public.subs (org_id, company, trades, created_by)
                   values ('b0000000-0000-0000-0000-000000000051', 'Sample Added Co', '{05A}', 'a0000000-0000-0000-0000-000000000052') $$,
  'add: the estimator adds a sub');

-- CSLB check result, server time, version checked.
select results_eq(
  $$ select cslb_status, cslb_checked_at is not null, version
     from public.record_cslb_check(pg_temp.id('drywall'), 'active', 2) $$,
  $$ values ('active', true, 3) $$, 'cslb: the result and the time are recorded');
select throws_ok($$ select public.record_cslb_check(pg_temp.id('drywall'), 'expired', 2) $$,
  '40001', null, 'cslb: a stale version is refused');
select throws_ok($$ select public.record_cslb_check(pg_temp.id('drywall'), 'maybe', 3) $$,
  '22023', null, 'cslb: only the four results');

-- ---------------------------------------------------------------------------
-- A job member without bids.manage: no directory, no import, no writes
-- ---------------------------------------------------------------------------
select pg_temp.login('a0000000-0000-0000-0000-000000000053');
select throws_ok($$ select * from public.import_subs('b0000000-0000-0000-0000-000000000051', '[{"company": "Sample Sneak Co"}]'::jsonb) $$,
  '42501', null, 'import: a pm (no bids.manage) cannot import');
select is_empty($$ select id from public.subs $$, 'read: a pm who is not an org member sees no directory');
select throws_ok($$ insert into public.subs (org_id, company, created_by)
                    values ('b0000000-0000-0000-0000-000000000051', 'Sample Sneak Co', 'a0000000-0000-0000-0000-000000000053') $$,
  '42501', null, 'add: a pm cannot add a sub');
select throws_ok($$ select public.record_cslb_check(pg_temp.id('drywall'), 'active', 3) $$,
  '42501', null, 'cslb: a pm cannot record a check');

-- The org owner imports too.
select pg_temp.login('a0000000-0000-0000-0000-000000000051');
select results_eq($$ select added, updated, unchanged from public.import_subs('b0000000-0000-0000-0000-000000000051', '[{"company": "Sample Owner Co"}]'::jsonb) $$,
  $$ values (1, 0, 0) $$, 'import: the org owner imports');

-- Another org's sub with the same name is untouched.
reset role;
select results_eq($$ select company, trades, cslb_number, version from public.subs where id = '5b000000-0000-0000-0000-000000000052' $$,
  $$ values ('Sample Other Co', '{}'::text[], '999999', 1) $$, 'isolation: another org''s sub is untouched');

select * from finish();
rollback;
