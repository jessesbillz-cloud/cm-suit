begin;
select plan(9);
-- Migration 0092 (staging, Oct 6): a member who holds files.manage made a folder in Files and got 403 "new row violates
-- row-level security policy for table folders". The app inserts with RETURNING, so the new row must pass "folders:
-- readable". That policy asked folder_can_read(id), which looks the folder up by id, and the row being inserted is not
-- there yet. The policy now reads the row's own columns: the same answer folder_can_read gives once the row exists.
\ir _helpers.psql

create temp table ids (k text primary key, v uuid);
grant all on ids to public;
grant execute on all functions in schema pg_temp to public;

select pg_temp.mk_user('a0000000-0000-0000-0000-000000000801', 'probe+rb-admin@example.test', 'Ada Admin');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000802', 'probe+rb-pm@example.test', 'Pat Manager');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000803', 'probe+rb-insp@example.test', 'Ivy Inspector');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000804', 'probe+rb-sub@example.test', 'Sam Sub');

insert into public.orgs (id, name, kind, created_by) values
  ('b0000000-0000-0000-0000-000000000801', 'Sample Readback Builders', 'gc', 'a0000000-0000-0000-0000-000000000801');
insert into public.projects (id, org_id, name, stage, timezone, created_by) values
  ('c0000000-0000-0000-0000-000000000801', 'b0000000-0000-0000-0000-000000000801', 'Sample Readback Job', 'construction',
   'America/Los_Angeles', 'a0000000-0000-0000-0000-000000000801');
insert into public.project_members (org_id, project_id, user_id, invite_email, role, status)
select 'b0000000-0000-0000-0000-000000000801', 'c0000000-0000-0000-0000-000000000801', u::uuid, e, r, 'active'
  from (values
    ('a0000000-0000-0000-0000-000000000802', 'probe+rb-pm@example.test', 'pm'),
    ('a0000000-0000-0000-0000-000000000803', 'probe+rb-insp@example.test', 'inspector'),
    ('a0000000-0000-0000-0000-000000000804', 'probe+rb-sub@example.test', 'sub')) v(u, e, r);

-- A parent whose access list names files.manage only (the inspector and the sub don't read it).
insert into public.folders (id, org_id, project_id, name, created_by) values
  ('d0000000-0000-0000-0000-000000000801', 'b0000000-0000-0000-0000-000000000801', 'c0000000-0000-0000-0000-000000000801',
   'Sample Closed', 'a0000000-0000-0000-0000-000000000801');
insert into public.folder_access (folder_id, capability, can_read, can_write)
values ('d0000000-0000-0000-0000-000000000801', 'files.manage', true, true);

set local role authenticated;

-- The bug: insert ... returning as a files.manage member, at the top and inside a folder.
select pg_temp.login('a0000000-0000-0000-0000-000000000802');
select lives_ok($$
  with x as (
    insert into public.folders (org_id, project_id, parent_id, name, created_by)
    values ('b0000000-0000-0000-0000-000000000801', 'c0000000-0000-0000-0000-000000000801', null, 'Sample Made',
            'a0000000-0000-0000-0000-000000000802')
    returning id) insert into ids select 'top', id from x $$, 'a files.manage member makes a folder and reads it back (insert ... returning)');
select lives_ok($$
  with x as (
    insert into public.folders (org_id, project_id, parent_id, name, created_by)
    values ('b0000000-0000-0000-0000-000000000801', 'c0000000-0000-0000-0000-000000000801',
            'd0000000-0000-0000-0000-000000000801', 'Sample Inside', 'a0000000-0000-0000-0000-000000000802')
    returning id) insert into ids select 'sub', id from x $$, 'and inside a folder whose access list names files.manage');
select is((select count(*) from public.folders where id in (select v from ids))::int, 2, 'both read afterwards');

-- Nobody else's reading changes: the policy gives what folder_can_read gives.
select is(pg_temp.can_read_as('a0000000-0000-0000-0000-000000000803', (select v from ids where k = 'top')), true,
  'the inspector (files.read_records) reads the new top folder');
select is(pg_temp.can_read_as('a0000000-0000-0000-0000-000000000803', (select v from ids where k = 'sub')), false,
  'not the one inside the closed folder');
select pg_temp.login('a0000000-0000-0000-0000-000000000803');
select is((select count(*) from public.folders where id in (select v from ids))::int, 1, 'the rows say the same');
select pg_temp.login('a0000000-0000-0000-0000-000000000804');
select is((select count(*) from public.folders where id in (select v from ids))::int, 0, 'the sub reads neither');

-- Still only files.manage makes folders.
select pg_temp.login('a0000000-0000-0000-0000-000000000803');
select throws_ok($$
  insert into public.folders (org_id, project_id, parent_id, name, created_by)
  values ('b0000000-0000-0000-0000-000000000801', 'c0000000-0000-0000-0000-000000000801', null, 'Sample Not Mine',
          'a0000000-0000-0000-0000-000000000803')
  returning id $$, '42501', null, 'the inspector does not make folders');

-- folder_row_can_read is for the policy: not callable by anon.
reset role;
select is(has_function_privilege('anon', 'public.folder_row_can_read(uuid, uuid, uuid, text)', 'execute'), false,
  'anon cannot call folder_row_can_read');

select * from finish();
rollback;
