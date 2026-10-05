begin;
select plan(19);
-- Migration 0081: my_readable_tools answers, per job, the tools my role may read there (from role_permissions through
-- has_capability, never role names), so More and Edit offer only those (audit Oct 4, frame #12).
\ir _helpers.psql

select pg_temp.mk_user('a0000000-0000-0000-0000-000000000621', 'probe+readable-pm@example.test', 'Readable PM');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000622', 'probe+readable-bidder@example.test', 'Readable Bidder');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000623', 'probe+readable-safety@example.test', 'Readable Safety');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000624', 'probe+readable-other@example.test', 'Readable Other');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000625', 'probe+readable-req@example.test', 'Readable Requester');
-- The job's creator (who runs it); the PM probe is a PM only.
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000626', 'probe+readable-admin@example.test', 'Readable Admin');

insert into public.orgs (id, name, kind, created_by) values
  ('b0000000-0000-0000-0000-000000000621', 'Sample Readable Builders', 'gc', 'a0000000-0000-0000-0000-000000000626');
insert into public.projects (id, org_id, name, stage, timezone, created_by) values
  ('c0000000-0000-0000-0000-000000000621', 'b0000000-0000-0000-0000-000000000621', 'Readable Job', 'construction',
   'America/Los_Angeles', 'a0000000-0000-0000-0000-000000000626');
insert into public.project_members (org_id, project_id, user_id, invite_email, role, status)
select 'b0000000-0000-0000-0000-000000000621', 'c0000000-0000-0000-0000-000000000621', u, e, r, 'active'
  from (values
    ('a0000000-0000-0000-0000-000000000621'::uuid, 'probe+readable-pm@example.test', 'pm'),
    ('a0000000-0000-0000-0000-000000000622', 'probe+readable-bidder@example.test', 'bidder'),
    ('a0000000-0000-0000-0000-000000000623', 'probe+readable-safety@example.test', 'safety'),
    ('a0000000-0000-0000-0000-000000000625', 'probe+readable-req@example.test', 'requester')) v(u, e, r);

select ok(not has_function_privilege('anon', 'public.my_readable_tools(uuid)', 'EXECUTE'), 'anon cannot call it');
select ok(has_function_privilege('authenticated', 'public.my_readable_tools(uuid)', 'EXECUTE'), 'signed-in people can');
select ok(not (select prosecdef from pg_proc where oid = 'public.my_readable_tools(uuid)'::regprocedure),
  'it runs as the caller (no SECURITY DEFINER)');

set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000621');
select is((select tools from public.my_readable_tools('c0000000-0000-0000-0000-000000000621')),
  '{board,files,calendar,dailies,inspections,revs,rfis,permits,deliveries,corrections,safety,schedule,requirements,people,hours}'::text[],
  'the PM reads every job tool but Bids (no bids.*), in the rail''s order');

select pg_temp.login('a0000000-0000-0000-0000-000000000622');
select is((select tools from public.my_readable_tools('c0000000-0000-0000-0000-000000000621')),
  '{board,bids}'::text[], 'a bidder: the board and Bids only');

select pg_temp.login('a0000000-0000-0000-0000-000000000623');
select is((select tools from public.my_readable_tools('c0000000-0000-0000-0000-000000000621')),
  '{board,calendar,revs,safety,schedule,requirements,people}'::text[], 'a safety manager: no dailies, hours, RFIs or files');

select pg_temp.login('a0000000-0000-0000-0000-000000000625');
select ok((select not ('dailies' = any (tools)) and 'inspections' = any (tools)
             from public.my_readable_tools('c0000000-0000-0000-0000-000000000621')),
  'a requester: Inspections (to ask), never Dailies');

select pg_temp.login('a0000000-0000-0000-0000-000000000624');
select is_empty($$ select * from public.my_readable_tools('c0000000-0000-0000-0000-000000000621') $$, 'not on the job: nothing');
select is_empty($$ select * from public.my_readable_tools() $$, 'no jobs: nothing');

-- The matrix is data: taking a capability away takes the tool away.
reset role;
delete from public.role_permissions where role = 'safety' and capability = 'safety.read';
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000623');
select ok((select not ('safety' = any (tools)) from public.my_readable_tools('c0000000-0000-0000-0000-000000000621')),
  'changing role_permissions changes what I may open (no role names in code)');

-- An access end date in the past: the member reads nothing there any more.
reset role;
update public.project_members set access_ends_at = now() - interval '1 day'
 where user_id = 'a0000000-0000-0000-0000-000000000621' and project_id = 'c0000000-0000-0000-0000-000000000621';
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000621');
select is_empty($$ select * from public.my_readable_tools('c0000000-0000-0000-0000-000000000621') $$,
  'access ended: nothing');

-- The invite form offers only the roles one is invited to; the link-only roles are data, not names in the app.
reset role;
select is((select array_agg(name order by name) from public.roles where not invitable), '{bidder,requester}'::text[],
  'bidder and requester join by their own links, not by an invite');
select col_not_null('public', 'roles', 'invitable', 'every role says whether People can invite to it');

-- "Add row" in a schedule draft (schedule_activity_add): managers on a draft only, last in order, safe to repeat.
select ok(not has_function_privilege('anon', 'public.schedule_activity_add(uuid, text, text, text, text, text, date, date, boolean)', 'EXECUTE'),
  'anon cannot add schedule rows');
reset role;
update public.project_members set access_ends_at = null
 where user_id = 'a0000000-0000-0000-0000-000000000621' and project_id = 'c0000000-0000-0000-0000-000000000621';
create temp table sv (id uuid);
grant all on sv to public;
insert into sv values (gen_random_uuid());
insert into public.schedule_versions (id, created_by, org_id, project_id, source_kind)
select id, 'a0000000-0000-0000-0000-000000000621', 'b0000000-0000-0000-0000-000000000621',
       'c0000000-0000-0000-0000-000000000621', 'csv' from sv;
insert into public.schedule_activities (org_id, project_id, version_id, sort, name)
select 'b0000000-0000-0000-0000-000000000621', 'c0000000-0000-0000-0000-000000000621', id, 1, 'Sample form footings' from sv;
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000621');
create temp table added as
select public.schedule_activity_add((select id from sv), 'C130', 'Sample strip forms', null, 'Level 1', 'Sample Concrete Co',
                                    current_date + 7, current_date + 8, false) as id;
select is((select sort from public.schedule_activities where id = (select id from added)), 2, 'the added row goes last');
select is((select unsure from public.schedule_activities where id = (select id from added)), false, 'and counts as checked');
select is(public.schedule_activity_add((select id from sv), 'C130', 'Sample strip forms', null, 'Level 1', 'Sample Concrete Co',
                                       current_date + 7, current_date + 8, false), (select id from added),
  'adding the same row again returns it, not a second one');
select pg_temp.login('a0000000-0000-0000-0000-000000000622');
select throws_ok($$ select public.schedule_activity_add((select id from sv), null, 'Sample bidder row', null, null, null, null, null, false) $$,
  'P0002', null, 'a bidder cannot add a row (the draft is not there for them)');
select pg_temp.login('a0000000-0000-0000-0000-000000000621');
select throws_ok($$ select public.schedule_activity_add((select id from sv), null, '  ', null, null, null, null, null, false) $$,
  '23514', null, 'a row needs a name');

select * from finish();
rollback;
