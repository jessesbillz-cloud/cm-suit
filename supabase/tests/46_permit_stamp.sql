begin;
select plan(66);
-- The official stamps the plans (migration 0053): the folders (Approved plans read by permits.read and written by no
-- one; To stamp for the officials; Stamping for the server only), the PDFs the official may stamp and the download gate
-- for one, recording a set (permits.manage only, a fresh sign-in, the version, server-made copies only, each file once),
-- the issue it brings (stage, dates, the event, the calendar, no Undo), ONE board line for permit readers, repeat
-- safety, a revision superseding the earlier set, what each person sees, and the records staying records.
\ir _helpers.psql

create temp table ids (k text primary key, v uuid);
grant all on ids to public;
create function pg_temp.rid(p_k text) returns uuid language sql stable as $$ select v from ids where k = p_k $$;
create function pg_temp.ver(p_k text) returns int language sql volatile security definer as $$
  select p.version from public.permits p where p.id = (select v from ids where k = p_k) $$;
-- A copy the server stamped for the official, waiting in the job's "Stamping" folder (what storeGeneratedPdf writes).
create function pg_temp.stamped(p_k text, p_name text) returns uuid language plpgsql volatile security definer as $$
declare v uuid := gen_random_uuid(); fo public.folders;
begin
  select * into fo from public.folders where project_id = 'c0000000-0000-0000-0000-000000000461' and kind = 'stamping';
  insert into public.files (id, org_id, project_id, folder_id, storage_path, original_name, mime, size, sha256, scan_status,
                            text_status, upload_complete, created_by)
  values (v, fo.org_id, fo.project_id, fo.id, public.file_storage_path(fo.project_id, fo.id, v, p_name), p_name,
          'application/pdf', 1000, repeat('b', 64), 'clean', 'none', true, 'a0000000-0000-0000-0000-000000000462');
  insert into ids values (p_k, v);
  return v;
end $$;
-- One item of a set: the original, the stamped copy, its hash, stamped now.
create function pg_temp.item(p_src text, p_out text) returns jsonb language sql stable as $$
  select jsonb_build_object('source_file_id', pg_temp.rid(p_src), 'stamped_file_id', pg_temp.rid(p_out),
                            'content_hash', repeat(substr(md5(p_out), 1, 1), 64), 'stamped_at', now()) $$;
create function pg_temp.lines(p_permit text, p_kind text) returns int language sql volatile security definer as $$
  select count(*)::int from public.activity where entity_id = pg_temp.rid(p_permit) and kind = p_kind $$;
create function pg_temp.downloads(p_file text) returns int language sql volatile security definer as $$
  select count(*)::int from public.downloads where file_id = pg_temp.rid(p_file) $$;
create function pg_temp.folder_of(p_file text) returns uuid language sql volatile security definer as $$
  select folder_id from public.files where id = pg_temp.rid(p_file) $$;
create function pg_temp.fname(p_folder uuid) returns text language sql volatile security definer as $$
  select name from public.folders where id = p_folder $$;
create function pg_temp.fparent(p_folder uuid) returns uuid language sql volatile security definer as $$
  select parent_id from public.folders where id = p_folder $$;
-- What a person sees of a permit's stamped sets (logs them in).
create function pg_temp.seen(p_uid uuid) returns int language plpgsql as $$
begin
  perform pg_temp.login(p_uid);
  return (select count(*) from public.permit_approved_sets where project_id = 'c0000000-0000-0000-0000-000000000461');
end $$;
grant execute on all functions in schema pg_temp to public;

select pg_temp.mk_user('a0000000-0000-0000-0000-000000000461', 'probe+ps-admin@example.test', 'Ada Admin');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000462', 'probe+ps-ahj@example.test', 'Dana Deputy');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000463', 'probe+ps-ahj2@example.test', 'Drew Deputy');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000464', 'probe+ps-pm@example.test', 'Pat Manager');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000465', 'probe+ps-arch@example.test', 'Ann Architect');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000466', 'probe+ps-sub@example.test', 'Sam Sub');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000467', 'probe+ps-viewer@example.test', 'Vi Viewer');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000468', 'probe+ps-out@example.test', 'Oz Outsider');

insert into public.orgs (id, name, kind, created_by) values
  ('b0000000-0000-0000-0000-000000000461', 'Sample Stamp Builders', 'gc', 'a0000000-0000-0000-0000-000000000461');
insert into public.projects (id, org_id, name, stage, timezone, created_by) values
  ('c0000000-0000-0000-0000-000000000461', 'b0000000-0000-0000-0000-000000000461', 'Stamp Job 1', 'construction',
   'America/Los_Angeles', 'a0000000-0000-0000-0000-000000000461'),
  ('c0000000-0000-0000-0000-000000000462', 'b0000000-0000-0000-0000-000000000461', 'Stamp Job 2', 'construction',
   'America/Los_Angeles', 'a0000000-0000-0000-0000-000000000461');
insert into public.project_members (org_id, project_id, user_id, invite_email, role, status)
select 'b0000000-0000-0000-0000-000000000461', 'c0000000-0000-0000-0000-000000000461', u, e, r, 'active'
  from (values
    ('a0000000-0000-0000-0000-000000000462'::uuid, 'probe+ps-ahj@example.test', 'ahj'),
    ('a0000000-0000-0000-0000-000000000463', 'probe+ps-ahj2@example.test', 'ahj'),
    ('a0000000-0000-0000-0000-000000000464', 'probe+ps-pm@example.test', 'pm'),
    ('a0000000-0000-0000-0000-000000000465', 'probe+ps-arch@example.test', 'architect'),
    ('a0000000-0000-0000-0000-000000000466', 'probe+ps-sub@example.test', 'sub'),
    ('a0000000-0000-0000-0000-000000000467', 'probe+ps-viewer@example.test', 'viewer')) v(u, e, r);

-- The originals in the job's Plans (clean, made by the admin): two plan PDFs, a third, a drawing that isn't a PDF, and a
-- PDF on the other job.
insert into ids select k, gen_random_uuid() from unnest(array['S1', 'S2', 'S3', 'SX', 'SO']) k;
insert into public.files (id, org_id, project_id, folder_id, storage_path, original_name, mime, size, scan_status,
                          upload_complete, created_by)
select pg_temp.rid(k), 'b0000000-0000-0000-0000-000000000461', fo.project_id, fo.id,
       public.file_storage_path(fo.project_id, fo.id, pg_temp.rid(k), n), n, m, 2000, 'clean', true,
       'a0000000-0000-0000-0000-000000000461'
  from (values ('S1', 'Sample A-101.pdf', 'application/pdf', 'c0000000-0000-0000-0000-000000000461'::uuid),
               ('S2', 'Sample A-201.PDF', 'application/pdf', 'c0000000-0000-0000-0000-000000000461'),
               ('S3', 'Sample FP-1.pdf', 'application/pdf', 'c0000000-0000-0000-0000-000000000461'),
               ('SX', 'Sample A-101.dwg', 'application/octet-stream', 'c0000000-0000-0000-0000-000000000461'),
               ('SO', 'Sample other job.pdf', 'application/pdf', 'c0000000-0000-0000-0000-000000000462')) v(k, n, m, p)
  join public.folders fo on fo.project_id = v.p and fo.kind = 'plans' and fo.parent_id is null;

-- ---------------------------------------------------------------------------------------------------------------
-- Shape and grants
-- ---------------------------------------------------------------------------------------------------------------
select ok((select relrowsecurity from pg_class where oid = 'public.permit_approved_sets'::regclass), 'RLS is on');
select ok(not has_table_privilege('anon', 'public.permit_approved_sets', 'SELECT')
          and has_table_privilege('authenticated', 'public.permit_approved_sets', 'SELECT')
          and not has_table_privilege('authenticated', 'public.permit_approved_sets', 'INSERT')
          and not has_table_privilege('authenticated', 'public.permit_approved_sets', 'UPDATE')
          and not has_table_privilege('authenticated', 'public.permit_approved_sets', 'DELETE'),
  'anon reads nothing; signed in: read only, written by the RPC');
select is_empty($$ select f from unnest(array[
    'public.permit_stamp_folders(uuid)', 'public.permit_stamp_source(uuid, uuid)', 'public.permit_stamp_sources(uuid)',
    'public.permit_record_stamped_set(uuid, integer, jsonb, text)', 'public.permit_approved(uuid)']) f
   where has_function_privilege('anon', f, 'EXECUTE') or not has_function_privilege('authenticated', f, 'EXECUTE') $$,
  'grants: the stamp functions are for signed-in people, never anon');
select is_empty($$ select f from unnest(array[
    'public.permit_stamp_mode(text)', 'public.permit_items(jsonb)', 'public.permit_folder_make(uuid, uuid, text, text, integer)',
    'public.permit_folder_ensure(uuid, uuid, text, text, integer, text, boolean, boolean)',
    'public.permit_approved_root(uuid)', 'public.permit_set_folder(uuid)']) f
   where has_function_privilege('authenticated', f, 'EXECUTE') $$, 'grants: the helpers are internal');
select is(array[public.permit_stamp_mode('draft'), public.permit_stamp_mode('accepted'), public.permit_stamp_mode('in_review'),
                public.permit_stamp_mode('backcheck'), public.permit_stamp_mode('issued'), public.permit_stamp_mode('approved'),
                public.permit_stamp_mode('complete'), public.permit_stamp_mode('cancelled')],
  array[null, null, 'issue', 'issue', 'revise', 'revise', null, null]::text[],
  'stamping issues where the permit may be issued next, revises once issued, else not at all');

-- ---------------------------------------------------------------------------------------------------------------
-- The permits and the folders
-- ---------------------------------------------------------------------------------------------------------------
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000462');
insert into ids select 'A', (public.permit_create('c0000000-0000-0000-0000-000000000461', '24-0001',
  'Building - new construction', 'building', '{}', null, '', 'in_review')).id;
insert into ids select 'B', (public.permit_create('c0000000-0000-0000-0000-000000000461', '24-0002',
  'Fire sprinkler (deferred)', 'deferred_sprinkler', '{}', null, '', 'draft')).id;

select pg_temp.login('a0000000-0000-0000-0000-000000000464');
select throws_ok($$ select public.permit_stamp_folders(pg_temp.rid('A')) $$, '42501', null, 'a PM doesn''t make the stamp folders');
select pg_temp.login('a0000000-0000-0000-0000-000000000462');
insert into ids select 'UP', (public.permit_stamp_folders(pg_temp.rid('A')) ->> 'uploads')::uuid;
insert into ids select 'ST', (public.permit_stamp_folders(pg_temp.rid('A')) ->> 'staging')::uuid;
insert into ids select 'ROOT', pg_temp.fparent(pg_temp.rid('UP'));
select is(array[pg_temp.fname(pg_temp.rid('ROOT')), pg_temp.fname(pg_temp.rid('UP')), pg_temp.fname(pg_temp.rid('ST'))],
  array['Approved plans', 'To stamp', 'Stamping'], 'Approved plans, with To stamp and Stamping in it');
select ok(pg_temp.fparent(pg_temp.rid('ROOT')) is null and pg_temp.fparent(pg_temp.rid('ST')) = pg_temp.rid('ROOT'),
  'Approved plans sits at the top of the job');
select is((public.permit_stamp_folders(pg_temp.rid('A')) ->> 'uploads')::uuid, pg_temp.rid('UP'), 'made once');
select is(array[pg_temp.can_read_as('a0000000-0000-0000-0000-000000000462', pg_temp.rid('ROOT')),
                pg_temp.can_read_as('a0000000-0000-0000-0000-000000000464', pg_temp.rid('ROOT')),
                pg_temp.can_read_as('a0000000-0000-0000-0000-000000000465', pg_temp.rid('ROOT')),
                pg_temp.can_read_as('a0000000-0000-0000-0000-000000000466', pg_temp.rid('ROOT')),
                pg_temp.can_read_as('a0000000-0000-0000-0000-000000000467', pg_temp.rid('ROOT'))],
  array[true, true, true, false, false], 'Approved plans: everyone who reads permits, nobody else');
select is(array[pg_temp.can_write_as('a0000000-0000-0000-0000-000000000462', pg_temp.rid('ROOT')),
                pg_temp.can_write_as('a0000000-0000-0000-0000-000000000464', pg_temp.rid('ROOT')),
                pg_temp.can_write_as('a0000000-0000-0000-0000-000000000461', pg_temp.rid('ROOT'))],
  array[false, false, false], 'Approved plans: nobody writes (not the official, not files.manage)');
select is(array[pg_temp.can_read_as('a0000000-0000-0000-0000-000000000462', pg_temp.rid('UP')),
                pg_temp.can_write_as('a0000000-0000-0000-0000-000000000462', pg_temp.rid('UP')),
                pg_temp.can_read_as('a0000000-0000-0000-0000-000000000464', pg_temp.rid('UP')),
                pg_temp.can_write_as('a0000000-0000-0000-0000-000000000464', pg_temp.rid('UP'))],
  array[true, true, false, false], 'To stamp: the officials read and upload, nobody else');
select is(array[pg_temp.can_read_as('a0000000-0000-0000-0000-000000000462', pg_temp.rid('ST')),
                pg_temp.can_write_as('a0000000-0000-0000-0000-000000000462', pg_temp.rid('ST')),
                pg_temp.can_read_as('a0000000-0000-0000-0000-000000000461', pg_temp.rid('ST')),
                pg_temp.can_write_as('a0000000-0000-0000-0000-000000000461', pg_temp.rid('ST'))],
  array[false, false, false, false], 'Stamping: no one but the server');
select pg_temp.login('a0000000-0000-0000-0000-000000000462');
select throws_ok($$ select public.register_file(pg_temp.rid('ST'), 'Sneaky.pdf', 'application/pdf', 10) $$, '42501', null,
  'the official can''t put a file of their own into Stamping');

-- ---------------------------------------------------------------------------------------------------------------
-- What the official may stamp
-- ---------------------------------------------------------------------------------------------------------------
select pg_temp.stamped('T0', 'Sample A-101 - Approved 24-0001.pdf');
select is((select array_agg(name order by name) from public.permit_stamp_sources(pg_temp.rid('A'))),
  array['Sample A-101.pdf', 'Sample A-201.PDF', 'Sample FP-1.pdf'],
  'the job''s PDFs: not a drawing, not another job, not a stamped copy waiting in Stamping');
select is((select folder_kind from public.permit_stamp_sources(pg_temp.rid('A')) limit 1), 'plans', 'plan folders first');
select pg_temp.login('a0000000-0000-0000-0000-000000000464');
select throws_ok($$ select * from public.permit_stamp_sources(pg_temp.rid('A')) $$, '42501', null, 'not for a PM');
select pg_temp.login('a0000000-0000-0000-0000-000000000462');
select is((select original_name from public.permit_stamp_source(pg_temp.rid('A'), pg_temp.rid('S1'))), 'Sample A-101.pdf',
  'one original, through the download gate');
select is(pg_temp.downloads('S1'), 1, 'the read is logged as a download');
select throws_ok($$ select * from public.permit_stamp_source(pg_temp.rid('A'), pg_temp.rid('SX')) $$, '22023',
  'Only PDFs can be stamped.', 'PDFs only');
select throws_ok($$ select * from public.permit_stamp_source(pg_temp.rid('A'), pg_temp.rid('T0')) $$, '22023',
  'Pick the original, not a stamped copy.', 'never a stamped copy');
select throws_ok($$ select * from public.permit_stamp_source(pg_temp.rid('A'), pg_temp.rid('SO')) $$, 'P0002', null,
  'never a file on another job');
select throws_ok($$ select * from public.permit_stamp_source(pg_temp.rid('B'), pg_temp.rid('S1')) $$, '22023',
  'This permit can''t be stamped now.', 'a draft can''t be stamped');

-- ---------------------------------------------------------------------------------------------------------------
-- Recording the set: the official only, signed in just now, at the version they saw, server-made copies only
-- ---------------------------------------------------------------------------------------------------------------
select pg_temp.stamped('T1', 'Sample A-101 - Approved 24-0001.pdf');
select pg_temp.stamped('T2', 'Sample A-201 - Approved 24-0001.pdf');
select pg_temp.login('a0000000-0000-0000-0000-000000000464');
select throws_ok($$ select public.permit_record_stamped_set(pg_temp.rid('A'), pg_temp.ver('A'),
  jsonb_build_array(pg_temp.item('S1', 'T1'))) $$, '42501', 'forbidden', 'a PM can''t record a set');
select pg_temp.login_stale('a0000000-0000-0000-0000-000000000462');
select throws_ok($$ select public.permit_record_stamped_set(pg_temp.rid('A'), pg_temp.ver('A'),
  jsonb_build_array(pg_temp.item('S1', 'T1'))) $$, '42501', null, 'an old sign-in must sign in again');
select pg_temp.login('a0000000-0000-0000-0000-000000000462');
select throws_ok($$ select public.permit_record_stamped_set(pg_temp.rid('A'), pg_temp.ver('A') - 1,
  jsonb_build_array(pg_temp.item('S1', 'T1'))) $$, '40001', null, 'a stale version is refused');
select throws_ok($$ select public.permit_record_stamped_set(pg_temp.rid('A'), pg_temp.ver('A'),
  jsonb_build_array(pg_temp.item('S1', 'S2'))) $$, '22023', 'A stamped file is missing. Stamp it again.',
  'a "stamped" file that the server didn''t make is refused');
select throws_ok($$ select public.permit_record_stamped_set(pg_temp.rid('A'), pg_temp.ver('A'),
  jsonb_build_array(pg_temp.item('S1', 'T1'), pg_temp.item('S1', 'T2'))) $$, '22023', 'Each file once.', 'each file once');
select throws_ok($$ select public.permit_record_stamped_set(pg_temp.rid('A'), pg_temp.ver('A'),
  jsonb_build_array(pg_temp.item('SO', 'T1'))) $$, '22023', null, 'an original from another job is refused');
select throws_ok($$ select public.permit_record_stamped_set(pg_temp.rid('B'), pg_temp.ver('B'),
  jsonb_build_array(pg_temp.item('S1', 'T1'))) $$, '22023', 'This permit can''t be stamped now.', 'nor a draft''s set');
select throws_ok($$ select public.permit_record_stamped_set(pg_temp.rid('A'), pg_temp.ver('A'), '[]') $$, '22023',
  'Pick the files to stamp.', 'an empty set is refused');

select is((select array[(x ->> 'set_no'), (x ->> 'files'), (x ->> 'issued'), (x -> 'permit' ->> 'stage')]
             from public.permit_record_stamped_set(pg_temp.rid('A'), pg_temp.ver('A'),
                    jsonb_build_array(pg_temp.item('S1', 'T1'), pg_temp.item('S2', 'T2'))) x),
  array['1', '2', 'true', 'issued'], 'the official records the set: set 1, two files, issued');
select is((select array[stage, issued_on::text, expires_on::text] from public.permits where id = pg_temp.rid('A')),
  array['issued', (now() at time zone 'America/Los_Angeles')::date::text,
        ((now() at time zone 'America/Los_Angeles')::date + interval '12 months')::date::text],
  'issued today on the job''s clock, expiring 12 months on');
select is((select note from public.permit_stage_events where permit_id = pg_temp.rid('A') order by id desc limit 1),
  'Approved set 1: 2 files', 'the move is in the history with the set');
select ok(exists (select 1 from public.calendar_entries where source_type = 'permit' and source_id = pg_temp.rid('A')
                   and kind = 'milestones' and read_capability = 'permits.read'), 'the expiry is on the calendar');
insert into ids select 'PF', approved_folder_id from public.permits where id = pg_temp.rid('A');
select is(array[pg_temp.fname(pg_temp.rid('PF'))::text, (pg_temp.fparent(pg_temp.rid('PF')) = pg_temp.rid('ROOT'))::text],
  array['24-0001', 'true'], 'the permit''s own folder in Approved plans, named by its number');
select is(array[pg_temp.folder_of('T1'), pg_temp.folder_of('T2')], array[pg_temp.rid('PF'), pg_temp.rid('PF')],
  'the stamped files moved out of Stamping into it');
select is((select array_agg(array[set_no::text, position::text, (stamped_by = 'a0000000-0000-0000-0000-000000000462')::text]
                            order by position) from public.permit_approved_sets where permit_id = pg_temp.rid('A')),
  array[array['1', '1', 'true'], array['1', '2', 'true']], 'one row per file, in the order picked, by the official');
select is(array[pg_temp.lines('A', 'permit.approved_set'), pg_temp.lines('A', 'permit.stage')], array[1, 0],
  'ONE board line for the set, and no second line for the move');
select is((select summary || ' / ' || audience_capability from public.activity
            where entity_id = pg_temp.rid('A') and kind = 'permit.approved_set'),
  'Permit 24-0001 issued: approved set (2 files) / permits.read', 'it goes to everyone who reads permits');
select pg_temp.login('a0000000-0000-0000-0000-000000000465');
select is((select count(*)::int from public.activity where kind = 'permit.approved_set'), 1, 'the architect sees it');
select pg_temp.login('a0000000-0000-0000-0000-000000000466');
select is((select count(*)::int from public.activity where kind = 'permit.approved_set'), 0, 'a sub doesn''t');

select pg_temp.login('a0000000-0000-0000-0000-000000000462');
select is((public.permit_record_stamped_set(pg_temp.rid('A'), 1,
             jsonb_build_array(pg_temp.item('S1', 'T1'), pg_temp.item('S2', 'T2'))) ->> 'set_no'), '1',
  'the same set again returns the first answer (even at an old version)');
select is(array[(select count(*)::int from public.permit_approved_sets where permit_id = pg_temp.rid('A')),
                pg_temp.lines('A', 'permit.approved_set')], array[2, 1], 'and records nothing twice');
select throws_ok($$ select public.permit_undo_move(pg_temp.rid('A'), pg_temp.ver('A')) $$, '22023',
  'That move can''t be undone now.', 'the issue that came with a stamped set can''t be undone');
select throws_ok($$ update public.files set deleted_at = now() where id = pg_temp.rid('T1') $$, '42501', null,
  'a stamped approved file can''t be deleted, not even by the one who stamped it');

-- ---------------------------------------------------------------------------------------------------------------
-- A revision: the stage stays, the earlier set is superseded
-- ---------------------------------------------------------------------------------------------------------------
select pg_temp.stamped('T3', 'Sample FP-1 - Approved 24-0001.pdf');
select throws_ok($$ select public.permit_record_stamped_set(pg_temp.rid('A'), pg_temp.ver('A'),
  jsonb_build_array(pg_temp.item('S3', 'T3'), pg_temp.item('S1', 'T1'))) $$, '22023',
  'Some of these files are already recorded.', 'a recorded file can''t go into another set');
select is((select array[(x ->> 'set_no'), (x ->> 'issued'), (x -> 'permit' ->> 'stage')]
             from public.permit_record_stamped_set(pg_temp.rid('A'), pg_temp.ver('A'),
                    jsonb_build_array(pg_temp.item('S3', 'T3')), 'Sample revision 1') x),
  array['2', 'false', 'issued'], 'a revised set: set 2, the permit stays issued');
select is((select array_agg(coalesce(superseded_by::text, 'current') order by set_no, position)
             from public.permit_approved_sets where permit_id = pg_temp.rid('A')),
  array['2', '2', 'current'], 'set 1 is superseded by set 2');
select is(array[pg_temp.fname(pg_temp.folder_of('T1')), pg_temp.fname(pg_temp.folder_of('T2'))],
  array['Superseded', 'Superseded'], 'the earlier files moved to Superseded');
select is(pg_temp.fparent(pg_temp.folder_of('T1')), pg_temp.rid('PF'), 'inside the permit''s folder');
select is(pg_temp.folder_of('T3'), pg_temp.rid('PF'), 'the new file is the current set');
select is((select array_agg(summary order by summary) from public.activity
            where entity_id = pg_temp.rid('A') and kind = 'permit.approved_set'),
  array['Permit 24-0001 issued: approved set (2 files)', 'Permit 24-0001: approved set revised (1 file)'],
  'one more board line, for the revision');

-- ---------------------------------------------------------------------------------------------------------------
-- What people see
-- ---------------------------------------------------------------------------------------------------------------
select is((select array[public.permit_approved(pg_temp.rid('A')) ->> 'stamp',
                        jsonb_array_length(public.permit_approved(pg_temp.rid('A')) -> 'sets')::text]),
  array['revise', '2'], 'the official: two sets, and may stamp a revision');
select pg_temp.login('a0000000-0000-0000-0000-000000000464');
select is((select array[coalesce(x ->> 'stamp', 'none'), x -> 'sets' -> 0 ->> 'set_no',
                        x -> 'sets' -> 0 -> 'files' -> 0 ->> 'name', x -> 'sets' -> 0 -> 'files' -> 0 ->> 'source_name',
                        coalesce(x -> 'sets' -> 0 ->> 'superseded_at', 'current'),
                        (x -> 'sets' -> 1 ->> 'superseded_at' is not null)::text, x -> 'sets' -> 0 ->> 'note',
                        x -> 'sets' -> 0 ->> 'stamped_by_name']
             from public.permit_approved(pg_temp.rid('A')) x),
  array['none', '2', 'Sample FP-1 - Approved 24-0001.pdf', 'Sample FP-1.pdf', 'current', 'true', 'Sample revision 1',
        'Dana Deputy'], 'a PM: the current set first, the superseded one under it, no stamping');
select is((select count(*)::int from public.files where id in (pg_temp.rid('T1'), pg_temp.rid('T2'), pg_temp.rid('T3'))), 3,
  'a PM reads the stamped files, current and superseded');
select is((select original_name from public.authorize_download(pg_temp.rid('T3'))), 'Sample FP-1 - Approved 24-0001.pdf',
  'and downloads them (the gate, logged)');
select is(array[pg_temp.seen('a0000000-0000-0000-0000-000000000464'), pg_temp.seen('a0000000-0000-0000-0000-000000000465'),
                pg_temp.seen('a0000000-0000-0000-0000-000000000466'), pg_temp.seen('a0000000-0000-0000-0000-000000000467'),
                pg_temp.seen('a0000000-0000-0000-0000-000000000468')],
  array[3, 3, 0, 0, 0], 'the rows: the PM and the architect; a sub, a viewer and an outsider nothing');
select pg_temp.login('a0000000-0000-0000-0000-000000000466');
select throws_ok($$ select public.permit_approved(pg_temp.rid('A')) $$, 'P0002', null, 'a sub: not found');
select is((select count(*)::int from public.files where id = pg_temp.rid('T3')), 0, 'and can''t read the stamped file');

-- ---------------------------------------------------------------------------------------------------------------
-- Records stay records; the folders stay put
-- ---------------------------------------------------------------------------------------------------------------
select pg_temp.login('a0000000-0000-0000-0000-000000000462');
select throws_ok($$ insert into public.permit_approved_sets (org_id, project_id, permit_id, set_no, position, source_file_id,
    stamped_file_id, stamped_by, stamped_at, content_hash)
  values ('b0000000-0000-0000-0000-000000000461', 'c0000000-0000-0000-0000-000000000461', pg_temp.rid('A'), 9, 1,
    pg_temp.rid('S1'), pg_temp.rid('S2'), 'a0000000-0000-0000-0000-000000000462', now(), repeat('a', 64)) $$,
  '42501', null, 'nobody writes the table directly');
reset role;
select throws_ok($$ update public.permit_approved_sets set content_hash = repeat('c', 64) where stamped_file_id = pg_temp.rid('T3') $$,
  '42501', 'A stamped set is a record.', 'a recorded row never changes, not even for the server');
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000464');
select throws_ok($$ update public.folders set deleted_at = now() where id = pg_temp.rid('ROOT') $$, '42501', null,
  'files.manage can''t delete Approved plans');
select throws_ok($$ update public.folders set parent_id = null where id = pg_temp.rid('PF') $$, '42501', null,
  'nor move a permit''s folder out of it');
select pg_temp.login('a0000000-0000-0000-0000-000000000462');
select lives_ok($$ select public.permit_update(pg_temp.rid('A'), pg_temp.ver('A'), '24-0001A', 'Building - new construction',
  'building', '{}', null, (select issued_on from public.permits where id = pg_temp.rid('A')),
  (select expires_on from public.permits where id = pg_temp.rid('A')), 0, '') $$, 'the official corrects the number');
select is(pg_temp.fname(pg_temp.rid('PF')), '24-0001A', 'and the permit''s folder follows');

select * from finish();
rollback;
