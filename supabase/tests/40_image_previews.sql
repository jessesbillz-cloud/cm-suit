begin;
select plan(32);
-- Photo previews (migration 0047): authorize_preview answers exactly what the download gate of the same file answers
-- (folder access, view-only, infected, the pending-scan rule; RFI privacy through the RFI; a request's own files through
-- the request), then refuses anything that is not an image or (0074) a PDF, and never writes a download line or download audit event
-- (0054 adds a 'file.preview' audit line: 47_security_fixes.sql).
\ir _helpers.psql

create temp table ids (k text primary key, v uuid);
grant all on ids to public;
create function pg_temp.rid(p_k text) returns uuid language sql stable as $$ select v from ids where k = p_k $$;
-- Download lines and download audit events of a file, whoever is logged in.
create function pg_temp.logged(p_file uuid) returns int language sql stable security definer as $$
  select ((select count(*) from public.downloads where file_id = p_file)
        + (select count(*) from public.audit_events where entity_id = p_file and action = 'download'))::int $$;
grant execute on function pg_temp.rid(text), pg_temp.logged(uuid) to public;

select pg_temp.mk_user('a0000000-0000-0000-0000-000000000471', 'probe+pv-admin@example.test', 'Pia Admin');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000472', 'probe+pv-super@example.test', 'Stu Super');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000473', 'probe+pv-viewer@example.test', 'Val Viewer');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000474', 'probe+pv-outsider@example.test', 'Oz Outsider');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000475', 'probe+pv-sub@example.test', 'Sam Sub');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000476', 'probe+pv-sub2@example.test', 'Sue Sub');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000477', 'probe+pv-pe@example.test', 'Pat Engineer');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000478', 'probe+pv-insp@example.test', 'Ivy Inspector');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000479', 'probe+pv-pm@example.test', 'Pam PM');

insert into public.orgs (id, name, kind, created_by) values
  ('b0000000-0000-0000-0000-000000000471', 'Sample Builders', 'gc', 'a0000000-0000-0000-0000-000000000471');
insert into public.projects (id, org_id, name, stage, timezone, created_by) values
  ('c0000000-0000-0000-0000-000000000471', 'b0000000-0000-0000-0000-000000000471', 'Preview Job', 'construction',
   'America/Los_Angeles', 'a0000000-0000-0000-0000-000000000471');
insert into public.project_members (org_id, project_id, user_id, invite_email, role, status)
select 'b0000000-0000-0000-0000-000000000471', 'c0000000-0000-0000-0000-000000000471', u, e, r, 'active'
  from (values
    ('a0000000-0000-0000-0000-000000000472'::uuid, 'probe+pv-super@example.test', 'superintendent'),
    ('a0000000-0000-0000-0000-000000000473', 'probe+pv-viewer@example.test', 'viewer'),
    ('a0000000-0000-0000-0000-000000000475', 'probe+pv-sub@example.test', 'sub'),
    ('a0000000-0000-0000-0000-000000000476', 'probe+pv-sub2@example.test', 'sub'),
    ('a0000000-0000-0000-0000-000000000477', 'probe+pv-pe@example.test', 'pe'),
    ('a0000000-0000-0000-0000-000000000478', 'probe+pv-insp@example.test', 'inspector'),
    ('a0000000-0000-0000-0000-000000000479', 'probe+pv-pm@example.test', 'pm')) v(u, e, r);

-- Folders: R (no access list: the job's readers) and VO (proprietary, view-only, readable with files.read_project);
-- the pricing-only "Bids received" comes with a GC job.
insert into public.folders (id, org_id, project_id, name, proprietary, view_only, created_by) values
  ('d0000000-0000-0000-0000-000000000471', 'b0000000-0000-0000-0000-000000000471', 'c0000000-0000-0000-0000-000000000471',
   'R', false, false, 'a0000000-0000-0000-0000-000000000471'),
  ('d0000000-0000-0000-0000-000000000472', 'b0000000-0000-0000-0000-000000000471', 'c0000000-0000-0000-0000-000000000471',
   'VO', true, true, 'a0000000-0000-0000-0000-000000000471');
insert into public.folder_access (folder_id, capability, can_read, can_write) values
  ('d0000000-0000-0000-0000-000000000472', 'files.read_project', true, false);
insert into ids select 'bids', id from public.folders
 where project_id = 'c0000000-0000-0000-0000-000000000471' and kind = 'bids_received';

insert into public.files (id, org_id, project_id, folder_id, storage_path, original_name, mime, created_by, scan_status)
select f.id, 'b0000000-0000-0000-0000-000000000471', 'c0000000-0000-0000-0000-000000000471', f.folder,
       public.file_storage_path('c0000000-0000-0000-0000-000000000471', f.folder, f.id, f.name), f.name, f.mime, f.by, f.scan
  from (values
    ('e0000000-0000-0000-0000-000000000471'::uuid, 'd0000000-0000-0000-0000-000000000471'::uuid, 'crack.jpg', 'image/jpeg',
     'a0000000-0000-0000-0000-000000000472'::uuid, 'clean'),
    ('e0000000-0000-0000-0000-000000000472', 'd0000000-0000-0000-0000-000000000471', 'wet.jpg', 'image/jpeg',
     'a0000000-0000-0000-0000-000000000472', 'pending'),
    ('e0000000-0000-0000-0000-000000000473', 'd0000000-0000-0000-0000-000000000471', 'plan.pdf', 'application/pdf',
     'a0000000-0000-0000-0000-000000000472', 'clean'),
    ('e0000000-0000-0000-0000-000000000474', 'd0000000-0000-0000-0000-000000000471', 'fake.jpg', 'application/pdf',
     'a0000000-0000-0000-0000-000000000472', 'clean'),
    ('e0000000-0000-0000-0000-000000000475', 'd0000000-0000-0000-0000-000000000471', 'bad.jpg', 'image/jpeg',
     'a0000000-0000-0000-0000-000000000472', 'infected'),
    ('e0000000-0000-0000-0000-000000000476', 'd0000000-0000-0000-0000-000000000471', 'draft.pdf', 'application/pdf',
     'a0000000-0000-0000-0000-000000000472', 'pending'),
    ('e0000000-0000-0000-0000-000000000477', 'd0000000-0000-0000-0000-000000000472', 'secret.jpg', 'image/jpeg',
     'a0000000-0000-0000-0000-000000000471', 'clean'),
    ('e0000000-0000-0000-0000-000000000478', pg_temp.rid('bids'), 'bid.jpg', 'image/jpeg',
     'a0000000-0000-0000-0000-000000000471', 'clean'),
    ('e0000000-0000-0000-0000-000000000479', 'd0000000-0000-0000-0000-000000000471', 'photo.svg', 'image/svg+xml',
     'a0000000-0000-0000-0000-000000000472', 'clean')
  ) as f (id, folder, name, mime, by, scan);

select ok(not has_function_privilege('anon', 'public.authorize_preview(uuid, uuid, uuid)', 'EXECUTE'),
  'anon cannot ask for a preview');
select ok(has_function_privilege('authenticated', 'public.authorize_preview(uuid, uuid, uuid)', 'EXECUTE'),
  'signed-in people can');

set local role authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- A file in a folder: the download gate's answer, images only, nothing logged.
-- ---------------------------------------------------------------------------------------------------------------
select pg_temp.login('a0000000-0000-0000-0000-000000000473');
select results_eq($$ select storage_path, original_name, mime from public.authorize_preview('e0000000-0000-0000-0000-000000000471') $$,
  $$ values (public.file_storage_path('c0000000-0000-0000-0000-000000000471', 'd0000000-0000-0000-0000-000000000471',
               'e0000000-0000-0000-0000-000000000471', 'crack.jpg'), 'crack.jpg'::text, 'image/jpeg'::text) $$,
  'viewer: previews a clean photo in a folder they read');
select is(pg_temp.logged('e0000000-0000-0000-0000-000000000471'), 0, 'a preview writes no download line and no audit event');
select results_eq($$ select original_name from public.authorize_download('e0000000-0000-0000-0000-000000000471') $$,
  $$ values ('crack.jpg'::text) $$, 'the download of the same file still works');
select is(pg_temp.logged('e0000000-0000-0000-0000-000000000471'), 2, 'and a download is still logged (line + audit event)');
select results_eq($$ select original_name from public.authorize_preview('e0000000-0000-0000-0000-000000000472') $$,
  $$ values ('wet.jpg'::text) $$, 'viewer: a photo still waiting for the scan shows (0027, like its download)');
select results_eq($$ select original_name from public.authorize_preview('e0000000-0000-0000-0000-000000000473') $$,
  $$ values ('plan.pdf'::text) $$, 'viewer: a PDF is previewed too (0074: the file viewer)');
select throws_ok($$ select * from public.authorize_preview('e0000000-0000-0000-0000-000000000474') $$, '42501', 'not_image',
  'viewer: an image name on a PDF is not an image');
select throws_ok($$ select * from public.authorize_preview('e0000000-0000-0000-0000-000000000479') $$, '42501', 'not_image',
  'viewer: an SVG (it can carry script) is not previewed');
select throws_ok($$ select * from public.authorize_preview('e0000000-0000-0000-0000-000000000475') $$, '42501', 'infected',
  'viewer: an infected photo is refused like its download');
select throws_ok($$ select * from public.authorize_preview('e0000000-0000-0000-0000-000000000476') $$, '42501', 'scan_pending',
  'viewer: someone else''s unscanned PDF: the gate answers first');
select throws_ok($$ select * from public.authorize_preview('e0000000-0000-0000-0000-000000000477') $$, '42501', 'view_only',
  'viewer: a photo in a view-only folder is never handed out');
select throws_ok($$ select * from public.authorize_preview('e0000000-0000-0000-0000-000000000499') $$, 'P0002', null,
  'a file that is not there: not found');
select throws_ok($$ select * from public.authorize_preview('e0000000-0000-0000-0000-000000000471',
    'e0000000-0000-0000-0000-000000000471', 'e0000000-0000-0000-0000-000000000471') $$, '22023', null,
  'an RFI or a request, not both');
select pg_temp.login('a0000000-0000-0000-0000-000000000472');
select results_eq($$ select original_name from public.authorize_preview('e0000000-0000-0000-0000-000000000476') $$,
  $$ values ('draft.pdf'::text) $$, 'super: their own unscanned PDF passes the gate, like its download');
select pg_temp.login('a0000000-0000-0000-0000-000000000479', 'aal2');
select throws_ok($$ select * from public.authorize_preview('e0000000-0000-0000-0000-000000000478') $$, '42501', 'forbidden',
  'pm (no pricing): a photo in Bids received is not previewed');
select pg_temp.login('a0000000-0000-0000-0000-000000000474');
select throws_ok($$ select * from public.authorize_preview('e0000000-0000-0000-0000-000000000471') $$, '42501', 'forbidden',
  'someone off the job: refused');

-- ---------------------------------------------------------------------------------------------------------------
-- Through an RFI: who may see that RFI (its photos live in the RFIs folder, which subs cannot browse).
-- ---------------------------------------------------------------------------------------------------------------
select pg_temp.login('a0000000-0000-0000-0000-000000000475');
insert into ids values ('F', public.rfi_folder('c0000000-0000-0000-0000-000000000471'));
insert into ids select 'P1', (public.register_file(pg_temp.rid('F'), 'slab.jpg', 'image/jpeg', 100)).id;
insert into ids select 'D1', (public.register_file(pg_temp.rid('F'), 'sketch.pdf', 'application/pdf', 100)).id;
insert into ids select 'A', (public.rfi_create('c0000000-0000-0000-0000-000000000471', 'Slab edge at grid B', 'Which governs?',
  array[pg_temp.rid('P1'), pg_temp.rid('D1')])).id;
select results_eq($$ select original_name from public.authorize_preview(pg_temp.rid('P1'), pg_temp.rid('A')) $$,
  $$ values ('slab.jpg'::text) $$, 'RFI: the originator previews its photo');
select results_eq($$ select original_name from public.authorize_preview(pg_temp.rid('D1'), pg_temp.rid('A')) $$,
  $$ values ('sketch.pdf'::text) $$, 'RFI: a PDF on it is previewed through the RFI (0074)');
select throws_ok($$ select * from public.authorize_preview('e0000000-0000-0000-0000-000000000471', pg_temp.rid('A')) $$,
  '42501', 'forbidden', 'RFI: a photo that is not on the RFI cannot ride through it');
select pg_temp.login('a0000000-0000-0000-0000-000000000477');
select results_eq($$ select original_name from public.authorize_preview(pg_temp.rid('P1'), pg_temp.rid('A')) $$,
  $$ values ('slab.jpg'::text) $$, 'RFI: the PE (rfi.sign_issue) sees the draft and its photo');
select pg_temp.login('a0000000-0000-0000-0000-000000000476');
select throws_ok($$ select * from public.authorize_preview(pg_temp.rid('P1'), pg_temp.rid('A')) $$, 'P0002', null,
  'RFI: another sub cannot see the draft, so no preview through it');
select throws_ok($$ select * from public.authorize_preview(pg_temp.rid('P1')) $$, '42501', 'forbidden',
  'RFI: nor straight from the RFIs folder');
select is(pg_temp.logged(pg_temp.rid('P1')), 0, 'RFI: previews are not logged as downloads');

-- ---------------------------------------------------------------------------------------------------------------
-- Through an inspection request: its requester and those who see every request; the request's scan rule.
-- ---------------------------------------------------------------------------------------------------------------
select pg_temp.login('a0000000-0000-0000-0000-000000000475');
insert into ids values ('attach', public.ir_folder('c0000000-0000-0000-0000-000000000471', 'attachments'));
reset role;
insert into public.files (id, org_id, project_id, folder_id, storage_path, original_name, mime, created_by, upload_complete)
select v.id, 'b0000000-0000-0000-0000-000000000471', 'c0000000-0000-0000-0000-000000000471', pg_temp.rid('attach'),
       public.file_storage_path('c0000000-0000-0000-0000-000000000471', pg_temp.rid('attach'), v.id, v.name), v.name, v.mime,
       'a0000000-0000-0000-0000-000000000475', true
  from (values ('e0000000-0000-0000-0000-000000000481'::uuid, 'rebar.jpg', 'image/jpeg'),
               ('e0000000-0000-0000-0000-000000000482'::uuid, 'notes.pdf', 'application/pdf')) v(id, name, mime);
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000475');
insert into ids select 'IR', (public.ir_submit(p_project_id => 'c0000000-0000-0000-0000-000000000471',
  p_company => 'Sample Concrete Co', p_request_date => (now() at time zone 'America/Los_Angeles')::date + 1, p_kind => 'ior',
  p_items => 'Footing rebar, grid A', p_notice_ack => true, p_start_time => '09:00', p_duration_min => 60,
  p_attachment_ids => array['e0000000-0000-0000-0000-000000000481'::uuid, 'e0000000-0000-0000-0000-000000000482'])).id;
select results_eq($$ select original_name from public.authorize_preview('e0000000-0000-0000-0000-000000000481', null,
    pg_temp.rid('IR')) $$, $$ values ('rebar.jpg'::text) $$, 'request: the requester previews their photo');
select results_eq($$ select original_name from public.authorize_preview('e0000000-0000-0000-0000-000000000482', null,
    pg_temp.rid('IR')) $$, $$ values ('notes.pdf'::text) $$, 'request: a PDF on it is previewed through the request (0074)');
select pg_temp.login('a0000000-0000-0000-0000-000000000478');
select throws_ok($$ select * from public.authorize_preview('e0000000-0000-0000-0000-000000000481', null, pg_temp.rid('IR')) $$,
  '42501', 'scan_pending', 'request: the inspector waits for the scan, exactly like the download');
reset role;
update public.files set scan_status = 'clean' where id = 'e0000000-0000-0000-0000-000000000481';
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000478');
select results_eq($$ select original_name from public.authorize_preview('e0000000-0000-0000-0000-000000000481', null,
    pg_temp.rid('IR')) $$, $$ values ('rebar.jpg'::text) $$, 'request: once scanned, the inspector previews it');
select throws_ok($$ select * from public.authorize_preview('e0000000-0000-0000-0000-000000000471', null, pg_temp.rid('IR')) $$,
  '42501', 'forbidden', 'request: a photo that is not on the request cannot ride through it');
select pg_temp.login('a0000000-0000-0000-0000-000000000476');
select throws_ok($$ select * from public.authorize_preview('e0000000-0000-0000-0000-000000000481', null, pg_temp.rid('IR')) $$,
  'P0002', null, 'request: another sub cannot see the request');
select is(pg_temp.logged('e0000000-0000-0000-0000-000000000481'), 0, 'request: previews are not logged as downloads');

select * from finish();
rollback;
