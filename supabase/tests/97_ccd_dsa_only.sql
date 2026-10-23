begin;
select plan(16);
-- Migration 0111 (Jesse, Oct 23: "No CCDs on a CSU job, DSA only - it's in the Files section"). files_sections makes
-- and lists the CCDs section only on a DSA job. A job that is not DSA never gets a CCD folder, none of people's own is
-- adopted as one, and a CCD folder it already has stays where it is: in To sort while files are in it, nowhere while
-- empty. Turning DSA on brings the section back with the same folder. The fire marshal on a CSU job sees no CCDs.
\ir _helpers.psql

create function pg_temp.kinds(p_project uuid) returns text[] language sql volatile as $$
  select array_agg(kind) from public.files_sections(p_project) where kind not in ('bids_received', 'inbound') $$;
create function pg_temp.sec(p_project uuid, p_kind text) returns uuid language sql volatile as $$
  select folder_id from public.files_sections(p_project) where kind = p_kind $$;
create function pg_temp.sec_ids(p_project uuid, p_kind text) returns uuid[] language sql volatile as $$
  select folder_ids from public.files_sections(p_project) where kind = p_kind $$;
create function pg_temp.sec_count(p_project uuid, p_kind text) returns int language sql volatile as $$
  select file_count from public.files_sections(p_project) where kind = p_kind $$;
create function pg_temp.all_ids(p_project uuid) returns uuid[] language sql volatile as $$
  select coalesce(array_agg(t.id), '{}'::uuid[]) from public.files_sections(p_project) s cross join lateral unnest(s.folder_ids) as t (id) $$;
create function pg_temp.ccd_folders(p_project uuid) returns int language sql stable security definer as $$
  select count(*)::int from public.folders where project_id = p_project and kind = 'ccd' $$;
create function pg_temp.folder_row(p_id uuid) returns public.folders language sql stable security definer as $$
  select * from public.folders where id = p_id $$;
grant execute on all functions in schema pg_temp to public;

select pg_temp.mk_user('a0000000-0000-0000-0000-000000000971', 'probe+ccd-admin@example.test', 'Ada Admin');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000972', 'probe+ccd-pm@example.test', 'Pia PM');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000973', 'probe+ccd-ahj@example.test', 'Dana Deputy');

insert into public.orgs (id, name, kind, created_by) values
  ('b0000000-0000-0000-0000-000000000971', 'Sample CCD Builders', 'gc', 'a0000000-0000-0000-0000-000000000971');
-- 971 a CSU job, fresh. 972 a CSU job with an old CCD folder holding a file. 973 a CSU job with an old empty CCD
-- folder. 974 a DSA job.
insert into public.projects (id, org_id, name, stage, timezone, is_dsa, created_by)
select p::uuid, 'b0000000-0000-0000-0000-000000000971', n, 'construction', 'America/Los_Angeles', d,
       'a0000000-0000-0000-0000-000000000971'
  from (values ('c0000000-0000-0000-0000-000000000971', 'Sample Hall', false),
               ('c0000000-0000-0000-0000-000000000972', 'Sample Library', false),
               ('c0000000-0000-0000-0000-000000000973', 'Sample Gym', false),
               ('c0000000-0000-0000-0000-000000000974', 'Sample School', true)) v (p, n, d);
insert into public.project_members (org_id, project_id, user_id, invite_email, role, status)
select 'b0000000-0000-0000-0000-000000000971', p::uuid, 'a0000000-0000-0000-0000-000000000972', 'probe+ccd-pm@example.test', 'pm', 'active'
  from (values ('c0000000-0000-0000-0000-000000000971'), ('c0000000-0000-0000-0000-000000000972'),
               ('c0000000-0000-0000-0000-000000000973'), ('c0000000-0000-0000-0000-000000000974')) v (p);
insert into public.project_members (org_id, project_id, user_id, invite_email, role, status) values
  ('b0000000-0000-0000-0000-000000000971', 'c0000000-0000-0000-0000-000000000972', 'a0000000-0000-0000-0000-000000000973',
   'probe+ccd-ahj@example.test', 'ahj', 'active');

-- 971: people's own folder named "CCD". 972: a CCD folder with a file in a folder under it. 973: an empty CCD folder.
insert into public.folders (id, org_id, project_id, parent_id, name, kind, created_by) values
  ('d0000000-0000-0000-0000-000000000971', 'b0000000-0000-0000-0000-000000000971', 'c0000000-0000-0000-0000-000000000971',
   null, 'CCD', 'general', 'a0000000-0000-0000-0000-000000000972'),
  ('d0000000-0000-0000-0000-000000000972', 'b0000000-0000-0000-0000-000000000971', 'c0000000-0000-0000-0000-000000000972',
   null, 'CCDs', 'ccd', 'a0000000-0000-0000-0000-000000000972'),
  ('d0000000-0000-0000-0000-000000000973', 'b0000000-0000-0000-0000-000000000971', 'c0000000-0000-0000-0000-000000000972',
   'd0000000-0000-0000-0000-000000000972', 'Sample older', 'general', 'a0000000-0000-0000-0000-000000000972'),
  ('d0000000-0000-0000-0000-000000000974', 'b0000000-0000-0000-0000-000000000971', 'c0000000-0000-0000-0000-000000000973',
   null, 'CCDs', 'ccd', 'a0000000-0000-0000-0000-000000000972');
insert into public.files (org_id, project_id, folder_id, storage_path, original_name, mime, created_by, scan_status, upload_complete)
values ('b0000000-0000-0000-0000-000000000971', 'c0000000-0000-0000-0000-000000000972', 'd0000000-0000-0000-0000-000000000973',
        'test/ccd/Sample CCD 3.pdf', 'Sample CCD 3.pdf', 'application/pdf', 'a0000000-0000-0000-0000-000000000972', 'clean', true);

set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000972');

-- A CSU job, fresh: no CCDs section, no CCD folder made, people's own "CCD" folder not taken for one.
select is(pg_temp.kinds('c0000000-0000-0000-0000-000000000971'), array['plans', 'specs', 'submittals', 'rfis', 'reports', 'photos', 'unsorted'],
  'CSU job: the sections, no CCDs');
select is(pg_temp.ccd_folders('c0000000-0000-0000-0000-000000000971'), 0, 'CSU job: no CCD folder made');
select is((pg_temp.folder_row('d0000000-0000-0000-0000-000000000971')).kind, 'general', 'CSU job: people''s own "CCD" folder is not adopted');
select ok(pg_temp.sec_ids('c0000000-0000-0000-0000-000000000971', 'unsorted') @> array['d0000000-0000-0000-0000-000000000971']::uuid[],
  'CSU job: it is in To sort like their other folders');

-- A CSU job with an old CCD folder holding a file: the folder and file stay, To sort shows them.
select is(pg_temp.kinds('c0000000-0000-0000-0000-000000000972'),
  array['plans', 'specs', 'submittals', 'rfis', 'reports', 'photos', 'unsorted'], 'CSU job with CCD files: no CCDs section');
select ok(pg_temp.sec_ids('c0000000-0000-0000-0000-000000000972', 'unsorted')
            @> array['d0000000-0000-0000-0000-000000000972', 'd0000000-0000-0000-0000-000000000973']::uuid[],
  'CSU job with CCD files: the folder and the one under it are in To sort');
select is(pg_temp.sec_count('c0000000-0000-0000-0000-000000000972', 'unsorted'), 1, 'CSU job with CCD files: To sort counts the file');
select is(((pg_temp.folder_row('d0000000-0000-0000-0000-000000000972')).kind, (pg_temp.folder_row('d0000000-0000-0000-0000-000000000972')).deleted_at),
  ('ccd'::text, null::timestamptz), 'CSU job with CCD files: the folder is not moved, changed or removed');

-- A CSU job with an old empty CCD folder: it shows nowhere, and stays.
select ok(not pg_temp.all_ids('c0000000-0000-0000-0000-000000000973') @> array['d0000000-0000-0000-0000-000000000974']::uuid[],
  'CSU job, empty CCD folder: in no section');
select is((pg_temp.folder_row('d0000000-0000-0000-0000-000000000974')).deleted_at, null, 'CSU job, empty CCD folder: kept');

-- A DSA job: CCDs as before.
select is(pg_temp.kinds('c0000000-0000-0000-0000-000000000974'),
  array['plans', 'specs', 'submittals', 'rfis', 'ccd', 'reports', 'photos', 'unsorted'], 'DSA job: the sections, CCDs among them');
select is(((pg_temp.folder_row(pg_temp.sec('c0000000-0000-0000-0000-000000000974', 'ccd'))).kind,
           (pg_temp.folder_row(pg_temp.sec('c0000000-0000-0000-0000-000000000974', 'ccd'))).name),
  ('ccd'::text, 'CCDs'::text), 'DSA job: its CCDs folder');

-- The fire marshal on a CSU job: no CCDs.
select pg_temp.login('a0000000-0000-0000-0000-000000000973');
select is(pg_temp.kinds('c0000000-0000-0000-0000-000000000972'), array['plans', 'specs'], 'fire marshal on a CSU job: Plans and Specs, no CCDs');
reset role;

-- DSA turned on: the section comes back with the folder the job had. Turned off: gone again, the folder kept.
update public.projects set is_dsa = true where id = 'c0000000-0000-0000-0000-000000000973';
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000972');
select is(pg_temp.sec('c0000000-0000-0000-0000-000000000973', 'ccd'), 'd0000000-0000-0000-0000-000000000974'::uuid,
  'DSA turned on: CCDs is the folder the job had');
select is(pg_temp.ccd_folders('c0000000-0000-0000-0000-000000000973'), 1, 'DSA turned on: no second CCD folder');
reset role;
update public.projects set is_dsa = false where id = 'c0000000-0000-0000-0000-000000000973';
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000972');
select ok(not 'ccd' = any (pg_temp.kinds('c0000000-0000-0000-0000-000000000973')), 'DSA turned off: no CCDs section again');
reset role;

select * from finish();
rollback;
