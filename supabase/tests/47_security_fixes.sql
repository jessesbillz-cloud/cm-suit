begin;
select plan(50);
-- The Oct 2 security review's fixes (migration 0054), each proved with the review's own repro: comments only for the
-- people who may write them (a bidder never reads the estimators' comments on his bid file, a viewer reads none, a board
-- line never reaches someone who can no longer read the item); the stamped set's record takes nothing from the caller
-- (the server's record of each copy, the copy's own sha256) and the old call with a made-up hash is gone; nobody but the
-- server adds anything under Approved plans; a photo preview leaves an audit line; the permit records keep even the
-- service role from truncating them; a replaced permit answer stays on the row; profiles take no insert; the storage
-- update rule is for unfinished uploads; a revoked member can't rejoin under a new email; the stamp sees the stored
-- object's real size; the permit lists start from the caller's own jobs.
\ir _helpers.psql

create temp table ids (k text primary key, v uuid);
grant all on ids to public;
create function pg_temp.rid(p_k text) returns uuid language sql stable as $$ select v from ids where k = p_k $$;
create function pg_temp.ver(p_k text) returns int language sql volatile security definer as $$
  select p.version from public.permits p where p.id = (select v from ids where k = p_k) $$;
-- Board lines about comments on an item, as the person logged in (the board the app reads).
create function pg_temp.comment_lines(p_k text) returns int language sql volatile as $$
  select count(*)::int from public.board_feed('c0000000-0000-0000-0000-000000000541')
   where entity_id = (select v from ids where k = p_k) and kind like 'comment.%' $$;
create function pg_temp.recipient_rows(p_uid uuid) returns int language sql volatile security definer as $$
  select count(*)::int from public.activity_recipients ar join public.activity a on a.id = ar.activity_id
   where ar.user_id = p_uid and a.kind like 'comment.%' $$;
create function pg_temp.previews(p_file uuid) returns int language sql volatile security definer as $$
  select count(*)::int from public.audit_events where entity_id = p_file and action = 'file.preview' $$;
create function pg_temp.download_rows(p_file uuid) returns int language sql volatile security definer as $$
  select count(*)::int from public.downloads where file_id = p_file $$;
-- A copy the server stamped for the official, waiting in the job's "Stamping" (what storeGeneratedPdf writes).
create function pg_temp.stamped_copy(p_k text, p_name text) returns uuid language plpgsql volatile security definer as $$
declare v uuid := gen_random_uuid(); fo public.folders;
begin
  select * into fo from public.folders where project_id = 'c0000000-0000-0000-0000-000000000541' and kind = 'stamping';
  insert into public.files (id, org_id, project_id, folder_id, storage_path, original_name, mime, size, sha256, scan_status,
                            text_status, upload_complete, created_by)
  values (v, fo.org_id, fo.project_id, fo.id, public.file_storage_path(fo.project_id, fo.id, v, p_name), p_name,
          'application/pdf', 1000, repeat('b', 64), 'clean', 'none', true, 'a0000000-0000-0000-0000-000000000546');
  insert into ids values (p_k, v);
  return v;
end $$;
grant execute on all functions in schema pg_temp to public;

-- ---------------------------------------------------------------------------------------------------------------
-- Seed: a GC job (open bidding) with its admin, an estimator, a bidder, a viewer, a PE, the official, a PM, an
-- architect; a revoked visitor for the request link.
-- ---------------------------------------------------------------------------------------------------------------
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000541', 'probe+sf-admin@example.test', 'Ada Admin');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000542', 'probe+sf-est@example.test', 'Eve Estimator');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000543', 'probe+sf-bidder@example.test', 'Bo Bidder');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000544', 'probe+sf-viewer@example.test', 'Vi Viewer');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000545', 'probe+sf-pe@example.test', 'Pat Engineer');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000546', 'probe+sf-ahj@example.test', 'Dana Deputy');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000547', 'probe+sf-pm@example.test', 'Pam Manager');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000548', 'probe+sf-arch@example.test', 'Ann Architect');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000549', 'probe+sf-visitor@example.test', 'Vic Visitor');

insert into public.orgs (id, name, kind, created_by) values
  ('b0000000-0000-0000-0000-000000000541', 'Sample Fix Builders', 'gc', 'a0000000-0000-0000-0000-000000000541');
insert into public.projects (id, org_id, name, stage, timezone, created_by, bid_sealed) values
  ('c0000000-0000-0000-0000-000000000541', 'b0000000-0000-0000-0000-000000000541', 'Fix Job', 'construction',
   'America/Los_Angeles', 'a0000000-0000-0000-0000-000000000541', false);
insert into public.project_members (org_id, project_id, user_id, invite_email, role, status)
select 'b0000000-0000-0000-0000-000000000541', 'c0000000-0000-0000-0000-000000000541', u, e, r, s
  from (values
    ('a0000000-0000-0000-0000-000000000542'::uuid, 'probe+sf-est@example.test', 'estimator', 'active'),
    ('a0000000-0000-0000-0000-000000000543', 'probe+sf-bidder@example.test', 'bidder', 'active'),
    ('a0000000-0000-0000-0000-000000000544', 'probe+sf-viewer@example.test', 'viewer', 'active'),
    ('a0000000-0000-0000-0000-000000000545', 'probe+sf-pe@example.test', 'pe', 'active'),
    ('a0000000-0000-0000-0000-000000000546', 'probe+sf-ahj@example.test', 'ahj', 'active'),
    ('a0000000-0000-0000-0000-000000000547', 'probe+sf-pm@example.test', 'pm', 'active'),
    ('a0000000-0000-0000-0000-000000000548', 'probe+sf-arch@example.test', 'architect', 'active'),
    ('a0000000-0000-0000-0000-000000000549', 'probe+sf-visitor@example.test', 'sub', 'revoked')) v(u, e, r, s);

-- Files (as postgres): the bidder's own bid PDF in "Bids received", a plan PDF, a photo in a folder every reader sees.
insert into ids values ('BID', gen_random_uuid()), ('PLAN', gen_random_uuid()), ('IMG', gen_random_uuid()),
                       ('OPEN', gen_random_uuid());
insert into public.folders (id, org_id, project_id, parent_id, name, created_by)
values (pg_temp.rid('OPEN'), 'b0000000-0000-0000-0000-000000000541', 'c0000000-0000-0000-0000-000000000541', null,
        'Sample photos', 'a0000000-0000-0000-0000-000000000541');
insert into public.files (id, org_id, project_id, folder_id, storage_path, original_name, mime, size, scan_status,
                          upload_complete, created_by)
select pg_temp.rid(x.k), 'b0000000-0000-0000-0000-000000000541', fo.project_id, fo.id,
       public.file_storage_path(fo.project_id, fo.id, pg_temp.rid(x.k), x.n), x.n, x.m, 2000, 'clean', true, x.by
  from (values ('BID', 'Sample bid - Bo.pdf', 'application/pdf', 'bids_received', 'a0000000-0000-0000-0000-000000000543'::uuid),
               ('PLAN', 'Sample A-101.pdf', 'application/pdf', 'plans', 'a0000000-0000-0000-0000-000000000541'),
               ('IMG', 'Sample crack.jpg', 'image/jpeg', 'general', 'a0000000-0000-0000-0000-000000000547')) x(k, n, m, kind, by)
  join public.folders fo on fo.project_id = 'c0000000-0000-0000-0000-000000000541' and fo.parent_id is null
   and ((x.kind = 'general' and fo.id = pg_temp.rid('OPEN')) or (x.kind <> 'general' and fo.kind = x.kind));
-- An RFI draft of the PM's and a correction.
with r as (insert into public.rfis (org_id, project_id, created_by, title, question)
           values ('b0000000-0000-0000-0000-000000000541', 'c0000000-0000-0000-0000-000000000541',
                   'a0000000-0000-0000-0000-000000000547', 'Sample rated wall at C', 'Sample question?') returning id)
insert into ids select 'RFI', id from r;
with c as (insert into public.corrections (org_id, project_id, created_by, number, title, request_key)
           values ('b0000000-0000-0000-0000-000000000541', 'c0000000-0000-0000-0000-000000000541',
                   'a0000000-0000-0000-0000-000000000541', 1, 'Sample missing firestop', 'sample-key-0541') returning id)
insert into ids select 'COR', id from c;

-- ---------------------------------------------------------------------------------------------------------------
-- M4 (review M1): comments on a bidder's own bid file never reach him; viewers read no comments; one gate
-- ---------------------------------------------------------------------------------------------------------------
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000542', 'aal2');
select lives_ok($$ select public.add_comment('c0000000-0000-0000-0000-000000000541', 'file', pg_temp.rid('BID'),
  'Sample: Bo is high on steel; ask him to sharpen it') $$, 'M4: the estimator comments on the bid file');
select is(jsonb_array_length(public.comment_list('c0000000-0000-0000-0000-000000000541', 'file', pg_temp.rid('BID')) -> 'comments'),
  1, 'M4: the estimator reads it');
select pg_temp.login('a0000000-0000-0000-0000-000000000543');
select ok(public.comment_target_readable('c0000000-0000-0000-0000-000000000541', 'file', pg_temp.rid('BID')),
  'M4: the bidder still reads his own file');
select is(public.comment_list('c0000000-0000-0000-0000-000000000541', 'file', pg_temp.rid('BID')),
  '{"can_read": false, "can_write": false, "comments": []}'::jsonb, 'M4: but no comment on it (comment_list)');
select is((select count(*)::int from public.comments where entity_id = pg_temp.rid('BID')), 0,
  'M4: nor through the table');
select is(pg_temp.comment_lines('BID'), 0, 'M4: and no board line about it');
select is((select count(*)::int from public.activity where kind like 'comment.%'), 0, 'M4: not even through the table');
select is(pg_temp.recipient_rows('a0000000-0000-0000-0000-000000000543'), 0,
  'M4: the line is not even addressed to him (he holds no comments.write)');

select pg_temp.login('a0000000-0000-0000-0000-000000000547');
select lives_ok($$ select public.add_comment('c0000000-0000-0000-0000-000000000541', 'correction', pg_temp.rid('COR'),
  'Sample: fixed on Tuesday') $$, 'M4: the PM comments on a correction');
select pg_temp.login('a0000000-0000-0000-0000-000000000544');
select is(array[(public.comment_list('c0000000-0000-0000-0000-000000000541', 'correction', pg_temp.rid('COR')) ->> 'can_read'),
                (select count(*)::text from public.comments), (select count(*)::text from public.comment_edits)],
  array['false', '0', '0'], 'M4: a viewer reads the correction, not its comments');
reset role;
select is((select count(*)::int from pg_policies where schemaname = 'public' and cmd = 'SELECT'
            and tablename in ('comments', 'comment_edits') and qual like '%comment_readable(%'), 2,
  'M4: the comments and comment_edits policies ask the one gate, comment_readable');

-- ---------------------------------------------------------------------------------------------------------------
-- L7: a board line about a comment shows only to someone who may still read the item
-- ---------------------------------------------------------------------------------------------------------------
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000545');
select lives_ok($$ select public.add_comment('c0000000-0000-0000-0000-000000000541', 'rfi', pg_temp.rid('RFI'),
  'Sample: check the UL listing') $$, 'L7: the PE comments on the PM''s RFI draft');
reset role;
-- The PE becomes a sub on this job (still comments, no longer reads the PM's drafts).
update public.project_members set role = 'sub'
 where project_id = 'c0000000-0000-0000-0000-000000000541' and user_id = 'a0000000-0000-0000-0000-000000000545';
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000547');
select lives_ok($$ select public.add_comment('c0000000-0000-0000-0000-000000000541', 'rfi', pg_temp.rid('RFI'),
  'Sample: listing confirmed') $$, 'L7: the PM answers on the draft');
select pg_temp.login('a0000000-0000-0000-0000-000000000545');
select ok(not public.comment_target_readable('c0000000-0000-0000-0000-000000000541', 'rfi', pg_temp.rid('RFI')),
  'L7: the former PE can''t read the draft any more');
select is(pg_temp.comment_lines('RFI'), 0, 'L7: and gets no board line naming it');

-- ---------------------------------------------------------------------------------------------------------------
-- M5 (review M2): the stamped set takes nothing from the caller
-- ---------------------------------------------------------------------------------------------------------------
select pg_temp.login('a0000000-0000-0000-0000-000000000546');
insert into ids select 'P', (public.permit_create('c0000000-0000-0000-0000-000000000541', '24-0541', 'Building',
  'building', '{}', null, '', 'in_review')).id;
insert into ids select 'ST', (public.permit_stamp_folders(pg_temp.rid('P')) ->> 'staging')::uuid;
insert into ids select 'UP', (public.permit_stamp_folders(pg_temp.rid('P')) ->> 'uploads')::uuid;
select pg_temp.stamped_copy('X', 'Sample A-101 - Approved 24-0541.pdf');
-- The review's call: a made-up hash and a "source" of the caller's choosing.
select throws_ok($$ select public.permit_record_stamped_set(pg_temp.rid('P'), pg_temp.ver('P'),
  jsonb_build_array(jsonb_build_object('source_file_id', pg_temp.rid('BID'), 'stamped_file_id', pg_temp.rid('X'),
                                       'content_hash', repeat('0', 64), 'stamped_at', now()))) $$,
  '42883', null, 'M5: the call that took the hash, the original and the time from the caller is gone');
select throws_ok($$ select public.permit_record_stamped_set(pg_temp.rid('P'), pg_temp.ver('P'), array[pg_temp.rid('X')]) $$,
  '22023', 'A stamped file is missing. Stamp it again.', 'M5: a copy without the server''s record of it is refused');
select ok(not has_table_privilege('authenticated', 'public.permit_stamped_copies', 'SELECT')
          and not has_table_privilege('authenticated', 'public.permit_stamped_copies', 'INSERT')
          and not has_table_privilege('service_role', 'public.permit_stamped_copies', 'UPDATE')
          and not has_table_privilege('service_role', 'public.permit_stamped_copies', 'DELETE')
          and has_table_privilege('service_role', 'public.permit_stamped_copies', 'INSERT'),
  'M5: only the server writes the record of a stamped copy, and never changes it');
select throws_ok($$ insert into public.permit_stamped_copies (stamped_file_id, permit_id, source_file_id, source_sha256,
    permit_number, stamped_by, stamped_at, content_hash)
  values (pg_temp.rid('X'), pg_temp.rid('P'), pg_temp.rid('BID'), repeat('0', 64), '24-0541',
          'a0000000-0000-0000-0000-000000000546', now(), repeat('0', 64)) $$, '42501', null,
  'M5: the official can''t write one');
reset role;
set local role service_role;
select pg_temp.login_service();
-- What permit-stamp writes with the service key after storing the copy: the original, its sha256, the printed hash.
select lives_ok($$ insert into public.permit_stamped_copies (stamped_file_id, permit_id, source_file_id, source_sha256,
    permit_number, stamped_by, stamped_at, content_hash)
  values (pg_temp.rid('X'), pg_temp.rid('P'), pg_temp.rid('PLAN'), repeat('c', 64), '24-0541',
          'a0000000-0000-0000-0000-000000000546', now(), repeat('d', 64)) $$, 'M5: the server records the copy it made');
select pg_temp.stamped_copy('X2', 'Sample A-101 - Approved 24-9999.pdf');
insert into public.permit_stamped_copies (stamped_file_id, permit_id, source_file_id, source_sha256, permit_number,
                                          stamped_by, stamped_at, content_hash)
values (pg_temp.rid('X2'), pg_temp.rid('P'), pg_temp.rid('PLAN'), repeat('c', 64), '24-9999',
        'a0000000-0000-0000-0000-000000000546', now(), repeat('e', 64));
reset role;
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000546');
select throws_ok($$ select public.permit_record_stamped_set(pg_temp.rid('P'), pg_temp.ver('P'), array[pg_temp.rid('X2')]) $$,
  '22023', 'The permit number changed. Stamp these again.', 'M5: a copy stamped with another number is refused');
select is((public.permit_record_stamped_set(pg_temp.rid('P'), pg_temp.ver('P'), array[pg_temp.rid('X')]) ->> 'issued'), 'true',
  'M5: the official records the set by the copies alone');
select is((select array[source_file_id::text, content_hash, source_sha256, stamped_sha256, permit_number]
             from public.permit_approved_sets where stamped_file_id = pg_temp.rid('X')),
  array[pg_temp.rid('PLAN')::text, repeat('d', 64), repeat('c', 64), repeat('b', 64), '24-0541'],
  'M5: the record holds the server''s facts: the original, the printed hash, both sha256s, the number');
reset role;
select ok((select s.stamped_at = k.stamped_at from public.permit_approved_sets s
             join public.permit_stamped_copies k on k.stamped_file_id = s.stamped_file_id
            where s.stamped_file_id = pg_temp.rid('X')), 'M5: the time is the one the server stamped');

-- L12: the stamp sees the stored object's own size, not only what the upload reported.
insert into storage.objects (bucket_id, name, metadata)
select 'files', storage_path, jsonb_build_object('size', 99000000) from public.files where id = pg_temp.rid('PLAN');
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000546');
select is((select size from public.permit_stamp_source(pg_temp.rid('P'), pg_temp.rid('PLAN'))), 99000000::bigint,
  'L12: the size checked before the download is the stored object''s');

-- ---------------------------------------------------------------------------------------------------------------
-- M6 (review M3): only the server adds anything under Approved plans
-- ---------------------------------------------------------------------------------------------------------------
reset role;
insert into ids select 'ROOT', id from public.folders
 where project_id = 'c0000000-0000-0000-0000-000000000541' and kind = 'approved_plans' and parent_id is null;
insert into ids select 'PF', approved_folder_id from public.permits where id = pg_temp.rid('P');
-- A folder of the admin's own (they may write it), and one that was already under Approved plans before 0054.
insert into ids values ('MINE', gen_random_uuid()), ('OLD', gen_random_uuid()), ('OLDF', gen_random_uuid());
insert into public.folders (id, org_id, project_id, parent_id, name, created_by) values
  (pg_temp.rid('MINE'), 'b0000000-0000-0000-0000-000000000541', 'c0000000-0000-0000-0000-000000000541', null,
   '24-0541 (approved set)', 'a0000000-0000-0000-0000-000000000541'),
  (pg_temp.rid('OLD'), 'b0000000-0000-0000-0000-000000000541', 'c0000000-0000-0000-0000-000000000541', pg_temp.rid('ROOT'),
   'Sample older set', 'a0000000-0000-0000-0000-000000000541');
insert into public.folder_access (folder_id, capability, can_read, can_write) values
  (pg_temp.rid('MINE'), 'files.manage', true, true), (pg_temp.rid('OLD'), 'files.manage', true, true);
insert into public.files (id, org_id, project_id, folder_id, storage_path, original_name, mime, size, scan_status,
                          text_status, upload_complete, created_by)
values (pg_temp.rid('OLDF'), 'b0000000-0000-0000-0000-000000000541', 'c0000000-0000-0000-0000-000000000541',
        pg_temp.rid('OLD'), public.file_storage_path('c0000000-0000-0000-0000-000000000541', pg_temp.rid('OLD'),
                                                     pg_temp.rid('OLDF'), 'A-101 - Approved 24-0541.pdf'),
        'A-101 - Approved 24-0541.pdf', 'application/pdf', 1000, 'pending', 'pending', false,
        'a0000000-0000-0000-0000-000000000541');
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000541');
select throws_ok($$ update public.folders set parent_id = pg_temp.rid('ROOT') where id = pg_temp.rid('MINE') $$,
  '42501', 'Only the stamp adds to Approved plans.', 'M6: the project admin can''t move a folder into Approved plans');
select throws_ok($$ insert into public.folders (org_id, project_id, parent_id, name, created_by)
  values ('b0000000-0000-0000-0000-000000000541', 'c0000000-0000-0000-0000-000000000541', pg_temp.rid('PF'), 'Sample extra',
          auth.uid()) $$, '42501', 'Only the stamp adds to Approved plans.', 'M6: nor make one in a permit''s set');
select throws_ok($$ update public.folders set name = 'Sample approved' where id = pg_temp.rid('PF') $$,
  '42501', 'Only the stamp adds to Approved plans.', 'M6: nor rename a set''s folder');
select ok(not pg_temp.can_write_as('a0000000-0000-0000-0000-000000000541', pg_temp.rid('OLD')),
  'M6: a folder already under it, with a list that says files.manage writes, takes no writes');
select throws_ok($$ select public.register_file(pg_temp.rid('OLD'), 'Sample A-102 - Approved.pdf', 'application/pdf', 10) $$,
  '42501', null, 'M6: no upload is registered there');
select throws_ok($$ insert into public.files (id, org_id, project_id, folder_id, storage_path, original_name, created_by)
  select x, 'b0000000-0000-0000-0000-000000000541', 'c0000000-0000-0000-0000-000000000541', pg_temp.rid('OLD'),
         public.file_storage_path('c0000000-0000-0000-0000-000000000541', pg_temp.rid('OLD'), x, 'x.pdf'), 'x.pdf', auth.uid()
    from (select gen_random_uuid() x) g $$, '42501', null, 'M6: nor a file row inserted directly');
select throws_ok($$ insert into storage.objects (bucket_id, name, owner)
  select 'files', storage_path, auth.uid() from public.files where id = pg_temp.rid('OLDF') $$, '42501', null,
  'M6: nor the bytes of a file registered there');
select throws_ok($$ insert into public.folder_access (folder_id, user_id, can_read, can_write)
  values (pg_temp.rid('OLD'), auth.uid(), true, true) $$, '42501', null, 'M6: nor an access list written there');
select ok(pg_temp.can_write_as('a0000000-0000-0000-0000-000000000546', pg_temp.rid('UP')),
  'M6: "To stamp" stays the official''s upload folder');

-- ---------------------------------------------------------------------------------------------------------------
-- M9 (review M6): a photo preview is still not a download, but it leaves an audit line
-- ---------------------------------------------------------------------------------------------------------------
select pg_temp.login('a0000000-0000-0000-0000-000000000544');
select is((select original_name from public.authorize_preview(pg_temp.rid('IMG'))), 'Sample crack.jpg',
  'M9: the viewer previews the photo');
select is(array[pg_temp.previews(pg_temp.rid('IMG')), pg_temp.download_rows(pg_temp.rid('IMG'))], array[1, 0],
  'M9: one preview audit line, no download line');
reset role;
select is((select details ->> 'via' from public.audit_events where entity_id = pg_temp.rid('IMG') and action = 'file.preview'),
  'folder', 'M9: the line says where it was opened from');

-- ---------------------------------------------------------------------------------------------------------------
-- L2: the permit records, even for the service role
-- ---------------------------------------------------------------------------------------------------------------
select is_empty($$ select t from unnest(array['public.permits', 'public.permit_stage_events', 'public.permit_reviews',
                                              'public.permit_comments', 'public.permit_approved_sets']) t
                    where has_table_privilege('service_role', t, 'TRUNCATE') or has_table_privilege('service_role', t, 'DELETE') $$,
  'L2: service_role neither truncates nor deletes the permit records');
select ok(not has_table_privilege('service_role', 'public.permit_stage_events', 'UPDATE')
          and not has_table_privilege('service_role', 'public.permit_approved_sets', 'UPDATE'),
  'L2: nor rewrites the stage history or the stamped sets');

-- ---------------------------------------------------------------------------------------------------------------
-- L1: a replaced permit answer stays on the comment
-- ---------------------------------------------------------------------------------------------------------------
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000546');
insert into ids select 'P2', (public.permit_create('c0000000-0000-0000-0000-000000000541', '24-0542', 'Fire sprinkler',
  'other', '{}', null, '', 'in_review')).id;
insert into ids select 'RV', (public.permit_review_open(pg_temp.rid('P2'))).id;
insert into ids select 'PC', (public.permit_comment_add(pg_temp.rid('RV'), 'Sample: show the rated wall at grid C.', 'A-201')).id;
select pg_temp.login('a0000000-0000-0000-0000-000000000548');
select lives_ok($$ select public.permit_comment_respond(pg_temp.rid('PC'), null, 'Sample: see 5/A-501, UL U419.') $$,
  'L1: the architect answers');
select pg_temp.login('a0000000-0000-0000-0000-000000000547');
select is((select response from public.permit_comment_respond(pg_temp.rid('PC'), null, 'Sample: will field verify.')),
  'Sample: will field verify.', 'L1: the PM answers over it');
select is((select array[earlier_answers -> 0 ->> 'response', earlier_answers -> 0 ->> 'by_name',
                        jsonb_array_length(earlier_answers)::text]
             from public.permit_comments where id = pg_temp.rid('PC')),
  array['Sample: see 5/A-501, UL U419.', 'Ann Architect', '1'], 'L1: the architect''s answer stays, with who wrote it');
reset role;
update public.permit_comments set earlier_answers = '[]'::jsonb where id = pg_temp.rid('PC');
select is((select jsonb_array_length(earlier_answers) from public.permit_comments where id = pg_temp.rid('PC')), 1,
  'L1: and nobody clears it, not even the owner');

-- ---------------------------------------------------------------------------------------------------------------
-- L9, L4: profiles take no insert; the storage update rule is for unfinished uploads only
-- ---------------------------------------------------------------------------------------------------------------
select ok(not has_table_privilege('authenticated', 'public.profiles', 'INSERT')
          and not has_any_column_privilege('authenticated', 'public.profiles', 'INSERT'),
  'L9: signed-in people insert no profile row (the sign-up trigger does)');
select ok((select qual like '%upload_complete%' and qual like '%deleted_at%' and with_check like '%upload_complete%'
             from pg_policies where schemaname = 'storage' and tablename = 'objects'
              and policyname = 'storage files: uploader may resume (update) own object'),
  'L4: an uploader updates only the object of an unfinished upload');

-- ---------------------------------------------------------------------------------------------------------------
-- L8: a revoked member can't rejoin through the request link after changing their email
-- ---------------------------------------------------------------------------------------------------------------
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000541');
select (public.rotate_request_link('c0000000-0000-0000-0000-000000000541')).token as qr_token \gset
reset role;
update auth.users set email = 'probe+sf-visitor-new@example.test' where id = 'a0000000-0000-0000-0000-000000000549';
set local role service_role;
select pg_temp.login_service();
select throws_ok(format($$ select public.link_request_join('c0000000-0000-0000-0000-000000000541', %L, null,
    'probe+sf-visitor-new@example.test', 'Vic', 'Sample Co') $$, encode(extensions.digest(:'qr_token', 'sha256'), 'hex')),
  '42501', 'Your access to this job has ended. Ask the inspector.', 'L8: the revoked visitor under a new address is refused');
select is((public.link_request_join('c0000000-0000-0000-0000-000000000541', encode(extensions.digest(:'qr_token', 'sha256'), 'hex'),
    null, 'probe+sf-someone@example.test', 'Sam', 'Sample Co') ->> 'status'), 'added', 'L8: someone new still joins');
reset role;

-- ---------------------------------------------------------------------------------------------------------------
-- L10: the permit lists start from the caller's own jobs (same answers)
-- ---------------------------------------------------------------------------------------------------------------
select ok(pg_get_functiondef('public.permit_list(uuid)'::regprocedure) like '%project_members%'
          and pg_get_functiondef('public.permit_progress(uuid, uuid)'::regprocedure) like '%project_members%',
  'L10: permit_list and permit_progress go through the caller''s memberships');
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000546');
select set_eq($$ select id from public.my_permits() $$, $$ values (pg_temp.rid('P')), (pg_temp.rid('P2')) $$,
  'L10: the official''s caseload is the same');
select pg_temp.login('a0000000-0000-0000-0000-000000000543');
select is((select count(*)::int from public.permit_list(null)), 0, 'L10: a bidder lists none');

select * from finish();
rollback;
