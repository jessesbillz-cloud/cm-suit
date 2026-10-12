begin;
select plan(18);
-- Migration 0097 (Jesse, Oct 11: the Files page "is completely disorganized and a total mess"). Files shows the job's
-- sections in one order. files_sections finds or makes their folders (safe to repeat), adopts a folder of people's own
-- named like a section instead of making a second, makes RFIs the way rfi_folder does, and answers each section the
-- caller reads with the folders in it and its file count. To sort holds every other top-level folder, never one a tool
-- owns. Anon can't call it, someone not on the job is refused.
\ir _helpers.psql

create function pg_temp.sec(p_kind text) returns uuid language sql volatile as $$
  select folder_id from public.files_sections('c0000000-0000-0000-0000-000000000841') where kind = p_kind $$;
create function pg_temp.sec_ids(p_kind text) returns uuid[] language sql volatile as $$
  select folder_ids from public.files_sections('c0000000-0000-0000-0000-000000000841') where kind = p_kind $$;
create function pg_temp.sec_count(p_kind text) returns int language sql volatile as $$
  select file_count from public.files_sections('c0000000-0000-0000-0000-000000000841') where kind = p_kind $$;
create function pg_temp.folder_row(p_id uuid) returns public.folders language sql stable security definer as $$
  select * from public.folders where id = p_id $$;
create function pg_temp.folders_of_job() returns int language sql stable security definer as $$
  select count(*)::int from public.folders where project_id = 'c0000000-0000-0000-0000-000000000841' $$;
grant execute on all functions in schema pg_temp to public;

select pg_temp.mk_user('a0000000-0000-0000-0000-000000000841', 'probe+fs-admin@example.test', 'Ada Admin');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000842', 'probe+fs-pm@example.test', 'Pia PM');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000843', 'probe+fs-viewer@example.test', 'Vic Viewer');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000844', 'probe+fs-out@example.test', 'Otto Outsider');

insert into public.orgs (id, name, kind, created_by) values
  ('b0000000-0000-0000-0000-000000000841', 'Sample Section Builders', 'gc', 'a0000000-0000-0000-0000-000000000841');
insert into public.projects (id, org_id, name, stage, timezone, created_by) values
  ('c0000000-0000-0000-0000-000000000841', 'b0000000-0000-0000-0000-000000000841', 'Sample Section Job', 'construction',
   'America/Los_Angeles', 'a0000000-0000-0000-0000-000000000841');
insert into public.project_members (org_id, project_id, user_id, invite_email, role, status)
select 'b0000000-0000-0000-0000-000000000841', 'c0000000-0000-0000-0000-000000000841', u::uuid, e, r, 'active'
  from (values ('a0000000-0000-0000-0000-000000000842', 'probe+fs-pm@example.test', 'pm'),
               ('a0000000-0000-0000-0000-000000000843', 'probe+fs-viewer@example.test', 'viewer')) v(u, e, r);

-- People's own folders: "submittals" (with a trade folder under it), "Sample loose", and the app's "Room pictures".
insert into public.folders (id, org_id, project_id, parent_id, name, created_by) values
  ('d0000000-0000-0000-0000-000000000841', 'b0000000-0000-0000-0000-000000000841', 'c0000000-0000-0000-0000-000000000841',
   null, 'submittals', 'a0000000-0000-0000-0000-000000000842'),
  ('d0000000-0000-0000-0000-000000000842', 'b0000000-0000-0000-0000-000000000841', 'c0000000-0000-0000-0000-000000000841',
   'd0000000-0000-0000-0000-000000000841', '092000 - Framing - Sample Co', 'a0000000-0000-0000-0000-000000000842'),
  ('d0000000-0000-0000-0000-000000000843', 'b0000000-0000-0000-0000-000000000841', 'c0000000-0000-0000-0000-000000000841',
   null, 'Sample loose', 'a0000000-0000-0000-0000-000000000842'),
  ('d0000000-0000-0000-0000-000000000844', 'b0000000-0000-0000-0000-000000000841', 'c0000000-0000-0000-0000-000000000841',
   null, 'Room pictures', 'a0000000-0000-0000-0000-000000000842');
insert into public.files (org_id, project_id, folder_id, storage_path, original_name, mime, created_by, scan_status, upload_complete)
select 'b0000000-0000-0000-0000-000000000841', 'c0000000-0000-0000-0000-000000000841', f.folder, 'test/sections/' || f.name, f.name,
       'application/pdf', 'a0000000-0000-0000-0000-000000000842', 'clean', f.done
  from (values ('d0000000-0000-0000-0000-000000000842'::uuid, '092900_04.0_Sample Board_PD_NET.pdf', true),
               ('d0000000-0000-0000-0000-000000000842', '092900_05.0_Sample Half.pdf', false),
               ('d0000000-0000-0000-0000-000000000843', 'Sample loose note.pdf', true),
               ('d0000000-0000-0000-0000-000000000844', 'Sample room 101.pdf', true)) f (folder, name, done);

select ok(not has_function_privilege('anon', 'public.files_sections(uuid)', 'EXECUTE')
          and has_function_privilege('authenticated', 'public.files_sections(uuid)', 'EXECUTE'),
  'anon can''t list sections, signed-in people can');
select ok(not has_function_privilege('authenticated', 'public.files_section_make(uuid, text, text, integer, boolean, text[])', 'EXECUTE')
          and not has_function_privilege('authenticated', 'public.files_subtree(uuid)', 'EXECUTE')
          and not has_function_privilege('authenticated', 'public.files_hidden_root(uuid)', 'EXECUTE'),
  'the helpers are internal');

set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000844');
select throws_ok($$ select * from public.files_sections('c0000000-0000-0000-0000-000000000841') $$, 'P0002', 'not_found',
  'someone not on the job: not found');

select pg_temp.login('a0000000-0000-0000-0000-000000000842');
select is((select array_agg(kind) from public.files_sections('c0000000-0000-0000-0000-000000000841')
            where kind not in ('bids_received', 'inbound')),
  array['plans', 'specs', 'submittals', 'rfis', 'ccd', 'reports', 'photos', 'unsorted'],
  'the sections, in order');
select is(pg_temp.sec('submittals'), 'd0000000-0000-0000-0000-000000000841'::uuid, 'the people''s "submittals" folder is adopted');
select is(((pg_temp.folder_row('d0000000-0000-0000-0000-000000000841')).kind, (pg_temp.folder_row('d0000000-0000-0000-0000-000000000841')).name),
  ('submittals'::text, 'Submittals'::text), 'its kind set and its proper name');
select is(pg_temp.sec_ids('submittals'), array['d0000000-0000-0000-0000-000000000841', 'd0000000-0000-0000-0000-000000000842']::uuid[],
  'a section holds its whole tree');
select is(pg_temp.sec_count('submittals'), 1, 'its count is the finished files in it');
select is(((pg_temp.folder_row(pg_temp.sec('ccd'))).kind, (pg_temp.folder_row(pg_temp.sec('ccd'))).name), ('ccd'::text, 'CCDs'::text),
  'CCDs are made with the kind the DSA folders have');
select ok(pg_temp.sec_ids('unsorted') @> array['d0000000-0000-0000-0000-000000000843']::uuid[]
          and not pg_temp.sec_ids('unsorted') @> array['d0000000-0000-0000-0000-000000000844']::uuid[],
  'To sort holds people''s other folders, never one a tool owns');
select is(pg_temp.sec_count('unsorted'), 1, 'To sort counts the loose file');
select is(pg_temp.sec('rfis'), public.rfi_folder('c0000000-0000-0000-0000-000000000841'), 'RFIs is the RFI tool''s own folder');
select is(pg_temp.sec('plans'), (select id from public.folders where project_id = 'c0000000-0000-0000-0000-000000000841'
                                   and parent_id is null and kind = 'plans'), 'Plans is the job''s Plans folder');

-- Safe to repeat: the same folders, nothing new.
select pg_temp.folders_of_job() as before \gset
select is((select array_agg(folder_id order by kind) from public.files_sections('c0000000-0000-0000-0000-000000000841')),
  (select array_agg(folder_id order by kind) from public.files_sections('c0000000-0000-0000-0000-000000000841')),
  'asked twice: the same folders');
select is(pg_temp.folders_of_job(), :before, 'and no folder made the second time');

-- The viewer reads the job's files but not the RFI folder (rfi.sign_issue browses it).
select pg_temp.login('a0000000-0000-0000-0000-000000000843');
select ok(not exists (select 1 from public.files_sections('c0000000-0000-0000-0000-000000000841') where kind = 'rfis'),
  'viewer: no RFIs section');
select ok(exists (select 1 from public.files_sections('c0000000-0000-0000-0000-000000000841') where kind = 'plans'),
  'viewer: the sections they read');
reset role;

select is((select count(*)::int from public.folders where project_id = 'c0000000-0000-0000-0000-000000000841' and parent_id is null
            and kind in ('plans', 'specs', 'submittals', 'rfis', 'ccd', 'reports', 'photos', 'unsorted') and deleted_at is null),
  8, 'one folder per section, never a second');

select * from finish();
rollback;
