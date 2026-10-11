begin;
select plan(31);
-- Migration 0096 (Jesse, Oct 11: Files is "a dumping ground of files that aren't even organized"). Every row in Files
-- gets Delete and Move: file_move takes a file (and its earlier versions) to another folder of its job, for the people
-- who may change the file and add to that folder, never a signed record, never into or out of a folder only the app
-- fills (Emailed in is a tray to sort from), version-checked, safe to repeat, audited. files_changeable answers which
-- rows of a list may be changed (with their versions), my_writable_folders the folders "Move to" offers.
\ir _helpers.psql

create function pg_temp.folder_of(p_file uuid) returns uuid language sql stable security definer as $$
  select folder_id from public.files where id = p_file $$;
create function pg_temp.moves(p_file uuid) returns text language sql stable security definer as $$
  select string_agg((details->>'from') || '>' || (details->>'to'), ',' order by occurred_at, id)
    from public.audit_events where entity_id = p_file and action = 'file.move' $$;
grant execute on function pg_temp.folder_of(uuid), pg_temp.moves(uuid) to public;

select pg_temp.mk_user('a0000000-0000-0000-0000-000000000831', 'probe+fm-admin@example.test', 'Ada Admin');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000832', 'probe+fm-pm@example.test', 'Pia PM');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000833', 'probe+fm-insp@example.test', 'Ivy Inspector');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000834', 'probe+fm-viewer@example.test', 'Vic Viewer');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000835', 'probe+fm-out@example.test', 'Otto Outsider');

insert into public.orgs (id, name, kind, created_by) values
  ('b0000000-0000-0000-0000-000000000831', 'Sample Move Builders', 'gc', 'a0000000-0000-0000-0000-000000000831');
insert into public.projects (id, org_id, name, stage, timezone, created_by) values
  ('c0000000-0000-0000-0000-000000000831', 'b0000000-0000-0000-0000-000000000831', 'Sample Move Job', 'construction',
   'America/Los_Angeles', 'a0000000-0000-0000-0000-000000000831'),
  ('c0000000-0000-0000-0000-000000000832', 'b0000000-0000-0000-0000-000000000831', 'Sample Other Move Job', 'construction',
   'America/Los_Angeles', 'a0000000-0000-0000-0000-000000000831');
insert into public.project_members (org_id, project_id, user_id, invite_email, role, status)
select 'b0000000-0000-0000-0000-000000000831', p::uuid, u::uuid, e, r, 'active'
  from (values ('c0000000-0000-0000-0000-000000000831', 'a0000000-0000-0000-0000-000000000832', 'probe+fm-pm@example.test', 'pm'),
               ('c0000000-0000-0000-0000-000000000832', 'a0000000-0000-0000-0000-000000000832', 'probe+fm-pm@example.test', 'pm'),
               ('c0000000-0000-0000-0000-000000000831', 'a0000000-0000-0000-0000-000000000833', 'probe+fm-insp@example.test', 'inspector'),
               ('c0000000-0000-0000-0000-000000000831', 'a0000000-0000-0000-0000-000000000834', 'probe+fm-viewer@example.test', 'viewer'))
       v(p, u, e, r);

-- A and B: plain folders. L: only files.manage adds to it. M: an Emailed in tray. R: a Reports folder. X: the other job.
insert into public.folders (id, org_id, project_id, name, kind, created_by)
select f.id, 'b0000000-0000-0000-0000-000000000831', f.p, f.name, f.kind, 'a0000000-0000-0000-0000-000000000831'
  from (values
    ('d0000000-0000-0000-0000-000000000831'::uuid, 'c0000000-0000-0000-0000-000000000831'::uuid, 'Sample A', 'general'),
    ('d0000000-0000-0000-0000-000000000832', 'c0000000-0000-0000-0000-000000000831', 'Sample B', 'general'),
    ('d0000000-0000-0000-0000-000000000833', 'c0000000-0000-0000-0000-000000000831', 'Sample Locked', 'general'),
    ('d0000000-0000-0000-0000-000000000834', 'c0000000-0000-0000-0000-000000000831', 'Sample Mail', 'inbound'),
    ('d0000000-0000-0000-0000-000000000835', 'c0000000-0000-0000-0000-000000000831', 'Sample Reports', 'reports'),
    ('d0000000-0000-0000-0000-000000000836', 'c0000000-0000-0000-0000-000000000832', 'Sample X', 'general')) f (id, p, name, kind);
insert into public.folder_access (folder_id, capability, can_read, can_write) values
  ('d0000000-0000-0000-0000-000000000833', 'files.read_project', true, false),
  ('d0000000-0000-0000-0000-000000000833', 'files.manage', true, true);

-- 831 the PM's plan, 832 the inspector's own, 833/834 a file and its later version, 835 an RFI PDF (a signed record),
-- 836 a file emailed in, 837 a report, 838 an unfinished upload.
insert into public.files (id, org_id, project_id, folder_id, storage_path, original_name, mime, created_by, scan_status,
                          upload_complete, version_group_id, version_no)
select f.id, 'b0000000-0000-0000-0000-000000000831', 'c0000000-0000-0000-0000-000000000831', f.folder,
       public.file_storage_path('c0000000-0000-0000-0000-000000000831', f.folder, f.id, f.name), f.name, 'application/pdf',
       f.by, 'clean', f.done, coalesce(f.grp, f.id), f.no
  from (values
    ('e0000000-0000-0000-0000-000000000831'::uuid, 'd0000000-0000-0000-0000-000000000831'::uuid, 'A101 Plan.pdf',
     'a0000000-0000-0000-0000-000000000832'::uuid, true, null::uuid, 1),
    ('e0000000-0000-0000-0000-000000000832', 'd0000000-0000-0000-0000-000000000831', 'Inspector note.pdf',
     'a0000000-0000-0000-0000-000000000833', true, null, 1),
    ('e0000000-0000-0000-0000-000000000833', 'd0000000-0000-0000-0000-000000000831', 'Schedule.pdf',
     'a0000000-0000-0000-0000-000000000832', true, 'e0000000-0000-0000-0000-000000000833', 1),
    ('e0000000-0000-0000-0000-000000000834', 'd0000000-0000-0000-0000-000000000831', 'Schedule.pdf',
     'a0000000-0000-0000-0000-000000000832', true, 'e0000000-0000-0000-0000-000000000833', 2),
    ('e0000000-0000-0000-0000-000000000835', 'd0000000-0000-0000-0000-000000000831', 'RFI 1.pdf',
     'a0000000-0000-0000-0000-000000000832', true, null, 1),
    ('e0000000-0000-0000-0000-000000000836', 'd0000000-0000-0000-0000-000000000834', 'Emailed sheet.pdf',
     'a0000000-0000-0000-0000-000000000832', true, null, 1),
    ('e0000000-0000-0000-0000-000000000837', 'd0000000-0000-0000-0000-000000000835', 'Report.pdf',
     'a0000000-0000-0000-0000-000000000832', true, null, 1),
    ('e0000000-0000-0000-0000-000000000838', 'd0000000-0000-0000-0000-000000000831', 'Half.pdf',
     'a0000000-0000-0000-0000-000000000832', false, null, 1)
  ) as f (id, folder, name, by, done, grp, no);
update public.files set superseded_by = 'e0000000-0000-0000-0000-000000000834' where id = 'e0000000-0000-0000-0000-000000000833';
insert into public.rfis (org_id, project_id, created_by, title, question, pdf_file_id)
values ('b0000000-0000-0000-0000-000000000831', 'c0000000-0000-0000-0000-000000000831', 'a0000000-0000-0000-0000-000000000832',
        'Sample slab edge', 'Which governs?', 'e0000000-0000-0000-0000-000000000835');

-- ---------------------------------------------------------------------------------------------------------------
-- Who may call what
-- ---------------------------------------------------------------------------------------------------------------
select ok(not has_function_privilege('anon', 'public.file_move(uuid, integer, uuid)', 'EXECUTE')
          and not has_function_privilege('anon', 'public.files_changeable(uuid[])', 'EXECUTE')
          and not has_function_privilege('anon', 'public.my_writable_folders(uuid)', 'EXECUTE'),
  'anon: no Move, no list answers');
select ok(has_function_privilege('authenticated', 'public.file_move(uuid, integer, uuid)', 'EXECUTE')
          and has_function_privilege('authenticated', 'public.files_changeable(uuid[])', 'EXECUTE')
          and has_function_privilege('authenticated', 'public.my_writable_folders(uuid)', 'EXECUTE'),
  'signed-in people call all three');
select ok(not has_function_privilege('authenticated', 'public.folder_app_only(uuid)', 'EXECUTE'), 'folder_app_only is internal');
select ok(public.folder_app_only('d0000000-0000-0000-0000-000000000835') and public.folder_app_only('d0000000-0000-0000-0000-000000000834')
          and not public.folder_app_only('d0000000-0000-0000-0000-000000000831'),
  'folder_app_only: Reports and Emailed in yes, a plain folder no');

set local role authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- What a list may offer
-- ---------------------------------------------------------------------------------------------------------------
select pg_temp.login('a0000000-0000-0000-0000-000000000832');
select results_eq(
  $$ select file_id, version from public.files_changeable(array['e0000000-0000-0000-0000-000000000831',
       'e0000000-0000-0000-0000-000000000832', 'e0000000-0000-0000-0000-000000000834', 'e0000000-0000-0000-0000-000000000835',
       'e0000000-0000-0000-0000-000000000838']::uuid[]) order by file_id $$,
  $$ values ('e0000000-0000-0000-0000-000000000831'::uuid, 1), ('e0000000-0000-0000-0000-000000000832'::uuid, 1),
            ('e0000000-0000-0000-0000-000000000834'::uuid, 1) $$,
  'files_changeable (PM): every finished file but the signed record, with its version');
select pg_temp.login('a0000000-0000-0000-0000-000000000833');
select results_eq(
  $$ select file_id from public.files_changeable(array['e0000000-0000-0000-0000-000000000831',
       'e0000000-0000-0000-0000-000000000832']::uuid[]) $$,
  $$ values ('e0000000-0000-0000-0000-000000000832'::uuid) $$, 'files_changeable (inspector): only their own');
select ok((select array_agg(folder_id) from public.my_writable_folders('c0000000-0000-0000-0000-000000000831'))
            @> array['d0000000-0000-0000-0000-000000000831', 'd0000000-0000-0000-0000-000000000832']::uuid[]
          and not exists (select 1 from public.my_writable_folders('c0000000-0000-0000-0000-000000000831')
                           where folder_id = 'd0000000-0000-0000-0000-000000000833'),
  'my_writable_folders (inspector): the plain folders, not the locked one');
select pg_temp.login('a0000000-0000-0000-0000-000000000834');
select is_empty($$ select 1 from public.my_writable_folders('c0000000-0000-0000-0000-000000000831') $$,
  'my_writable_folders (viewer): none');
select pg_temp.login('a0000000-0000-0000-0000-000000000835');
select is_empty($$ select 1 from public.my_writable_folders('c0000000-0000-0000-0000-000000000831') $$,
  'my_writable_folders (not on the job): none');

-- ---------------------------------------------------------------------------------------------------------------
-- Move: allowed
-- ---------------------------------------------------------------------------------------------------------------
select pg_temp.login('a0000000-0000-0000-0000-000000000832');
select is(public.file_move('e0000000-0000-0000-0000-000000000831', 1, 'd0000000-0000-0000-0000-000000000832'), 2,
  'PM moves a file: the new version');
select is(pg_temp.folder_of('e0000000-0000-0000-0000-000000000831'), 'd0000000-0000-0000-0000-000000000832'::uuid, 'it is in B');
select is(public.file_move('e0000000-0000-0000-0000-000000000831', 1, 'd0000000-0000-0000-0000-000000000832'), 2,
  'the same move again changes nothing (safe to repeat)');
select is(pg_temp.moves('e0000000-0000-0000-0000-000000000831'),
  'd0000000-0000-0000-0000-000000000831>d0000000-0000-0000-0000-000000000832', 'one audit line, from A to B');
select is(public.file_move('e0000000-0000-0000-0000-000000000831', 2, 'd0000000-0000-0000-0000-000000000831'), 3,
  'Undo is the move back');
select is(public.file_move('e0000000-0000-0000-0000-000000000834', 1, 'd0000000-0000-0000-0000-000000000832'), 2,
  'a file with an earlier version moves');
select is(pg_temp.folder_of('e0000000-0000-0000-0000-000000000833'), 'd0000000-0000-0000-0000-000000000832'::uuid,
  'its earlier version goes with it');
select is(public.file_move('e0000000-0000-0000-0000-000000000836', 1, 'd0000000-0000-0000-0000-000000000831'), 2,
  'a file emailed in is sorted out of the tray');
select is(public.file_move('e0000000-0000-0000-0000-000000000836', 2, 'd0000000-0000-0000-0000-000000000834'), 3,
  'and Undo puts it back in the tray');
select pg_temp.login('a0000000-0000-0000-0000-000000000833');
select is(public.file_move('e0000000-0000-0000-0000-000000000832', 1, 'd0000000-0000-0000-0000-000000000832'), 2,
  'the inspector moves their own file to a folder they add to');

-- ---------------------------------------------------------------------------------------------------------------
-- Move: refused
-- ---------------------------------------------------------------------------------------------------------------
select throws_ok($$ select public.file_move('e0000000-0000-0000-0000-000000000832', 2, 'd0000000-0000-0000-0000-000000000833') $$,
  '42501', 'forbidden', 'the inspector can''t move into a folder they don''t add to');
select throws_ok($$ select public.file_move('e0000000-0000-0000-0000-000000000831', 3, 'd0000000-0000-0000-0000-000000000832') $$,
  '42501', 'forbidden', 'the inspector can''t move someone else''s file');
select pg_temp.login('a0000000-0000-0000-0000-000000000834');
select throws_ok($$ select public.file_move('e0000000-0000-0000-0000-000000000831', 3, 'd0000000-0000-0000-0000-000000000832') $$,
  '42501', 'forbidden', 'the viewer can''t move files');
select pg_temp.login('a0000000-0000-0000-0000-000000000835');
select throws_ok($$ select public.file_move('e0000000-0000-0000-0000-000000000831', 3, 'd0000000-0000-0000-0000-000000000832') $$,
  'P0002', 'not_found', 'someone not on the job: not found');
select pg_temp.login('a0000000-0000-0000-0000-000000000832');
select throws_ok($$ select public.file_move('e0000000-0000-0000-0000-000000000831', 2, 'd0000000-0000-0000-0000-000000000832') $$,
  '40001', 'version_conflict', 'an old version is a conflict');
select throws_ok($$ select public.file_move('e0000000-0000-0000-0000-000000000831', 3, 'd0000000-0000-0000-0000-000000000836') $$,
  '22023', 'That folder is in another job.', 'never into another job''s folder');
select throws_ok($$ select public.file_move('e0000000-0000-0000-0000-000000000831', 3, 'd0000000-0000-0000-0000-000000000899') $$,
  'P0002', 'not_found', 'a folder that is not there');
select throws_ok($$ select public.file_move('e0000000-0000-0000-0000-000000000831', 3, 'd0000000-0000-0000-0000-000000000835') $$,
  '42501', 'Only the app adds to that folder.', 'never into a folder only the app fills');
select throws_ok($$ select public.file_move('e0000000-0000-0000-0000-000000000837', 1, 'd0000000-0000-0000-0000-000000000831') $$,
  '42501', 'The app keeps this file in its folder.', 'never out of one either');
select throws_ok($$ select public.file_move('e0000000-0000-0000-0000-000000000835', 1, 'd0000000-0000-0000-0000-000000000832') $$,
  '42501', 'A signed record stays on file.', 'a signed record stays where it is');
select throws_ok($$ select public.file_move('e0000000-0000-0000-0000-000000000838', 1, 'd0000000-0000-0000-0000-000000000832') $$,
  '42501', 'That file is still uploading.', 'an unfinished upload stays where it is');
select is(pg_temp.folder_of('e0000000-0000-0000-0000-000000000831'), 'd0000000-0000-0000-0000-000000000831'::uuid,
  'after every refusal the file is where it was');

reset role;
select * from finish();
rollback;
