begin;
select plan(10);
-- Migration 0030 (security review of 0021-0029): signing needs a fresh sign-in in the database; people can't make
-- system folders or loops; daily setup settings are bounded in the database.
\ir _helpers.psql

select pg_temp.mk_user('a0000000-0000-0000-0000-000000000241', 'probe+rf-pm@example.test', 'RF PM');
insert into public.orgs (id, name, kind, created_by)
values ('b0000000-0000-0000-0000-000000000241', 'RF Owner Co', 'owner', 'a0000000-0000-0000-0000-000000000241');
insert into public.projects (id, org_id, name, stage, created_by) values
  ('c0000000-0000-0000-0000-000000000241', 'b0000000-0000-0000-0000-000000000241', 'RF Job', 'construction', 'a0000000-0000-0000-0000-000000000241'),
  ('c0000000-0000-0000-0000-000000000242', 'b0000000-0000-0000-0000-000000000241', 'RF Job Two', 'construction', 'a0000000-0000-0000-0000-000000000241');

set local role authenticated;

-- 1. Signing needs a fresh sign-in.
select pg_temp.login_stale('a0000000-0000-0000-0000-000000000241');
select throws_like($$ select public.ir_sign(gen_random_uuid(), 1, repeat('a', 64)) $$, 'reauth_required%',
  'ir_sign: refused when the session signed in an hour ago');
select throws_like($$ select public.begin_daily_submit(gen_random_uuid(), 1, repeat('a', 64), '') $$, 'reauth_required%',
  'begin_daily_submit: refused when the session signed in an hour ago');
select pg_temp.login('a0000000-0000-0000-0000-000000000241');
select throws_ok($$ select public.begin_daily_submit(gen_random_uuid(), 1, repeat('a', 64), '') $$, 'P0002', null,
  'begin_daily_submit: a fresh session gets past the sign-in gate');

-- 2. No system folders by hand.
select throws_ok($$ insert into public.folders (org_id, project_id, name, kind, created_by)
  values ('b0000000-0000-0000-0000-000000000241', 'c0000000-0000-0000-0000-000000000241', 'Quotes', 'bids_received', auth.uid()) $$,
  '42501', null, 'folders: a person can''t make a bids folder');
select throws_ok($$ insert into public.folders (org_id, project_id, name, created_by)
  values ('b0000000-0000-0000-0000-000000000241', 'c0000000-0000-0000-0000-000000000241', 'Bids received', auth.uid()) $$,
  '23505', null, 'folders: a person can''t take a system folder name');
select lives_ok($$ insert into public.folders (id, org_id, project_id, name, created_by)
  values ('f0000000-0000-0000-0000-000000000241', 'b0000000-0000-0000-0000-000000000241', 'c0000000-0000-0000-0000-000000000241', 'Sample A', auth.uid()),
         ('f0000000-0000-0000-0000-000000000242', 'b0000000-0000-0000-0000-000000000241', 'c0000000-0000-0000-0000-000000000241', 'Sample B', auth.uid()) $$,
  'folders: ordinary folders are fine');

-- 3. No loops, no other job's parent.
update public.folders set parent_id = 'f0000000-0000-0000-0000-000000000242' where id = 'f0000000-0000-0000-0000-000000000241';
select throws_ok($$ update public.folders set parent_id = 'f0000000-0000-0000-0000-000000000241' where id = 'f0000000-0000-0000-0000-000000000242' $$,
  '22023', null, 'folders: a move that makes a loop is refused');
select throws_ok($$ insert into public.folders (org_id, project_id, parent_id, name, created_by)
  values ('b0000000-0000-0000-0000-000000000241', 'c0000000-0000-0000-0000-000000000242', 'f0000000-0000-0000-0000-000000000241', 'X', auth.uid()) $$,
  '22023', null, 'folders: a parent in another job is refused');

-- 4. Daily setup bounds.
reset role;
select throws_ok($$ insert into public.daily_setups (org_id, project_id, author_id, report_type, settings)
  values ('b0000000-0000-0000-0000-000000000241', 'c0000000-0000-0000-0000-000000000241', 'a0000000-0000-0000-0000-000000000241', 'daily',
          jsonb_build_object('label', repeat('x', 81))) $$, '23514', null, 'daily setup: a long label is refused');
select throws_ok($$ insert into public.daily_setups (org_id, project_id, author_id, report_type, settings)
  values ('b0000000-0000-0000-0000-000000000241', 'c0000000-0000-0000-0000-000000000241', 'a0000000-0000-0000-0000-000000000241', 'daily',
          jsonb_build_object('recipients', jsonb_build_array('not an email'))) $$, '23514', null, 'daily setup: a bad recipient is refused');

select * from finish();
rollback;
