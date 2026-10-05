begin;
select plan(31);
-- The job's part of the rail (migration 0051): per person, per job, the tools under the job's name. Own rows only, only
-- while on the job; the one write is save_job_rail with a version check; unknown tools are refused; null (or no row)
-- means my position's recommendation, which my_recommended_tools still answers. Since 0058 a job's own Board and
-- Calendar are job tools too (on a job the rail is the job's alone); Timesheets never is.
\ir _helpers.psql

select pg_temp.mk_user('a0000000-0000-0000-0000-000000000441', 'probe+jr-admin@example.test', 'JR Admin');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000442', 'probe+jr-insp@example.test', 'JR Inspector');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000443', 'probe+jr-sub@example.test', 'JR Sub');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000444', 'probe+jr-other@example.test', 'JR Other');

insert into public.orgs (id, name, kind, created_by) values
  ('b0000000-0000-0000-0000-000000000441', 'Sample Job Rail Builders', 'gc', 'a0000000-0000-0000-0000-000000000441');
insert into public.projects (id, org_id, name, stage, timezone, created_by) values
  ('c0000000-0000-0000-0000-000000000441', 'b0000000-0000-0000-0000-000000000441', 'Job Rail J', 'construction',
   'America/Los_Angeles', 'a0000000-0000-0000-0000-000000000441'),
  ('c0000000-0000-0000-0000-000000000442', 'b0000000-0000-0000-0000-000000000441', 'Job Rail K', 'construction',
   'America/Los_Angeles', 'a0000000-0000-0000-0000-000000000441');
insert into public.project_members (org_id, project_id, user_id, invite_email, role, status)
select 'b0000000-0000-0000-0000-000000000441', p, u, e, r, 'active'
  from (values
    ('c0000000-0000-0000-0000-000000000441'::uuid, 'a0000000-0000-0000-0000-000000000442'::uuid, 'probe+jr-insp@example.test', 'inspector'),
    ('c0000000-0000-0000-0000-000000000442', 'a0000000-0000-0000-0000-000000000442', 'probe+jr-insp@example.test', 'inspector'),
    ('c0000000-0000-0000-0000-000000000441', 'a0000000-0000-0000-0000-000000000443', 'probe+jr-sub@example.test', 'sub')) v(p, u, e, r);

-- ---------------------------------------------------------------------------------------------------------------
-- Shape and locks
-- ---------------------------------------------------------------------------------------------------------------
select has_table('public', 'user_job_rail', 'user_job_rail exists');
select ok((select relrowsecurity from pg_class where oid = 'public.user_job_rail'::regclass), 'RLS is on');
select ok(not has_table_privilege('anon', 'public.user_job_rail', 'SELECT'), 'anon reads nothing');
select ok(has_table_privilege('authenticated', 'public.user_job_rail', 'SELECT')
          and not has_table_privilege('authenticated', 'public.user_job_rail', 'INSERT')
          and not has_table_privilege('authenticated', 'public.user_job_rail', 'UPDATE')
          and not has_table_privilege('authenticated', 'public.user_job_rail', 'DELETE'),
  'signed in: read only; writes go through save_job_rail');
select ok((select prosecdef from pg_proc where oid = 'public.save_job_rail(uuid, text[], int)'::regprocedure)
          and not has_function_privilege('anon', 'public.save_job_rail(uuid, text[], int)', 'EXECUTE')
          and has_function_privilege('authenticated', 'public.save_job_rail(uuid, text[], int)', 'EXECUTE'),
  'save_job_rail: SECURITY DEFINER, for signed-in people, never anon');
select ok('board' = any (public.job_rail_tools()) and 'calendar' = any (public.job_rail_tools())
          and not 'timesheets' = any (public.job_rail_tools()),
  'a job''s own Board and Calendar are job tools (0058); Timesheets is All my jobs only');
select is_empty($$ select t from unnest(public.job_rail_tools()) t
                   where t not in ('board','files','bids','calendar','dailies','inspections','revs','rfis','permits',
                                   'deliveries','corrections','safety','schedule','requirements','people','hours') $$,
  'job tools are rail tools');

-- ---------------------------------------------------------------------------------------------------------------
-- null = the recommendation
-- ---------------------------------------------------------------------------------------------------------------
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000442');
select is_empty($$ select * from public.user_job_rail $$, 'no row at first: the rail is my recommendation');
select is((select tools from public.my_recommended_tools('c0000000-0000-0000-0000-000000000441')),
  '{board,calendar,dailies,inspections,corrections,files}'::text[], 'the recommendation the app starts from');

-- ---------------------------------------------------------------------------------------------------------------
-- Saving: my list, per job, with a version check
-- ---------------------------------------------------------------------------------------------------------------
select is((select (public.save_job_rail('c0000000-0000-0000-0000-000000000441', '{inspections,rfis,dailies}')).version), 1,
  'the first save makes my list (version 1)');
select is((select tools from public.user_job_rail where project_id = 'c0000000-0000-0000-0000-000000000441'),
  '{inspections,rfis,dailies}'::text[], 'kept in my order');
select is((select user_id from public.user_job_rail where project_id = 'c0000000-0000-0000-0000-000000000441'),
  'a0000000-0000-0000-0000-000000000442'::uuid, 'the owner is the caller');
select throws_ok($$ select public.save_job_rail('c0000000-0000-0000-0000-000000000441', '{files}') $$, '40001', null,
  'a second "first save" is a conflict, never a second row');
select is((select (public.save_job_rail('c0000000-0000-0000-0000-000000000441', '{files,inspections}', 1)).version), 2,
  'a save on the current version moves it on');
select throws_ok($$ select public.save_job_rail('c0000000-0000-0000-0000-000000000441', '{rfis}', 1) $$, '40001', null,
  'a stale version is refused');
select is((select tools from public.user_job_rail where project_id = 'c0000000-0000-0000-0000-000000000441'),
  '{files,inspections}'::text[], 'the stale save changed nothing');
select is((select tools from public.user_job_rail where project_id = 'c0000000-0000-0000-0000-000000000442'), null::text[],
  'another job keeps its own (no list there yet)');
select lives_ok($$ select public.save_job_rail('c0000000-0000-0000-0000-000000000442', '{}') $$,
  'an empty list is a choice: nothing under the job''s name');
select is((select tools from public.user_job_rail where project_id = 'c0000000-0000-0000-0000-000000000442'), '{}'::text[],
  'the empty list is kept, apart from job J''s');
select is((select (public.save_job_rail('c0000000-0000-0000-0000-000000000441', null, 2)).tools), null::text[],
  'null goes back to my recommendation');

-- ---------------------------------------------------------------------------------------------------------------
-- Unknown or repeated tools are refused
-- ---------------------------------------------------------------------------------------------------------------
select throws_ok($$ select public.save_job_rail('c0000000-0000-0000-0000-000000000441', '{rfis,plans}', 3) $$, '22023', null,
  'an unknown tool is refused');
select throws_ok($$ select public.save_job_rail('c0000000-0000-0000-0000-000000000441', '{timesheets,rfis}', 3) $$, '22023', null,
  'Timesheets is All my jobs only, never a job''s tool');
select throws_ok($$ select public.save_job_rail('c0000000-0000-0000-0000-000000000441', '{rfis,rfis}', 3) $$, '22023', null,
  'a tool twice is refused');
select throws_ok($$ select public.save_job_rail('c0000000-0000-0000-0000-000000000441', array['rfis', null], 3) $$, '22023', null,
  'a blank entry is refused');
select is((select (public.save_job_rail('c0000000-0000-0000-0000-000000000441', '{calendar,rfis,board}', 3)).tools),
  '{calendar,rfis,board}'::text[], 'the job''s own Calendar and Board may be in my list, in my order (0058)');

-- ---------------------------------------------------------------------------------------------------------------
-- Own rows only, only on my jobs
-- ---------------------------------------------------------------------------------------------------------------
select pg_temp.login('a0000000-0000-0000-0000-000000000443');
select is_empty($$ select * from public.user_job_rail where user_id <> auth.uid() $$, 'nobody reads someone else''s list');
select lives_ok($$ select public.save_job_rail('c0000000-0000-0000-0000-000000000441', '{rfis}') $$,
  'another member keeps a list of their own on the same job');
select throws_ok($$ select public.save_job_rail('c0000000-0000-0000-0000-000000000442', '{rfis}') $$, '42501', null,
  'not on the job: can''t save a list there');

select pg_temp.login('a0000000-0000-0000-0000-000000000444');
select throws_ok($$ select public.save_job_rail('c0000000-0000-0000-0000-000000000441', '{rfis}') $$, '42501', null,
  'no jobs at all: refused');

reset role;
update public.project_members set status = 'revoked' where user_id = 'a0000000-0000-0000-0000-000000000443';
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000443');
select is_empty($$ select * from public.user_job_rail $$, 'off the job: my list there is hidden');

select pg_temp.login('a0000000-0000-0000-0000-000000000442');
select is((select count(*)::int from public.user_job_rail), 2, 'the inspector still sees exactly their two lists');

select * from finish();
rollback;
