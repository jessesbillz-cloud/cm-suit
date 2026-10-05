begin;
select plan(39);
-- The file viewer and Files' Delete / Rename (migration 0074):
--   * a PDF is previewed through the same gate as its download (folder, view-only, scan), not logged as a download, one
--     'file.preview' audit line; an SVG or an HTML page is still refused;
--   * a signed record (a daily report's PDF and its earlier version, an RFI PDF) can't be deleted, renamed or moved by
--     anyone through the API, not even by its signer or files.manage; the server's own functions still can;
--   * file_remove / file_rename: the uploader or files.manage, a version check, safe to repeat, never a record, never an
--     unfinished upload, never someone else's file; file_can_change says the same for the screen.
\ir _helpers.psql

-- Download lines and download audit events of a file, and its preview lines, whoever is logged in.
create function pg_temp.logged(p_file uuid) returns int language sql stable security definer as $$
  select ((select count(*) from public.downloads where file_id = p_file)
        + (select count(*) from public.audit_events where entity_id = p_file and action = 'download'))::int $$;
create function pg_temp.previews(p_file uuid) returns int language sql volatile security definer as $$
  select count(*)::int from public.audit_events where entity_id = p_file and action = 'file.preview' $$;
create function pg_temp.fv(p_file uuid) returns int language sql stable security definer as $$
  select version from public.files where id = p_file $$;
create function pg_temp.fname(p_file uuid) returns text language sql stable security definer as $$
  select original_name from public.files where id = p_file $$;
create function pg_temp.gone(p_file uuid) returns boolean language sql stable security definer as $$
  select deleted_at is not null from public.files where id = p_file $$;
grant execute on function pg_temp.logged(uuid), pg_temp.previews(uuid), pg_temp.fv(uuid), pg_temp.fname(uuid),
  pg_temp.gone(uuid) to public;

select pg_temp.mk_user('a0000000-0000-0000-0000-000000000741', 'probe+fv-admin@example.test', 'Ada Admin');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000742', 'probe+fv-super@example.test', 'Sid Super');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000743', 'probe+fv-viewer@example.test', 'Vic Viewer');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000744', 'probe+fv-pm@example.test', 'Pia PM');

insert into public.orgs (id, name, kind, created_by) values
  ('b0000000-0000-0000-0000-000000000741', 'Sample Viewer Builders', 'gc', 'a0000000-0000-0000-0000-000000000741');
insert into public.projects (id, org_id, name, stage, timezone, created_by) values
  ('c0000000-0000-0000-0000-000000000741', 'b0000000-0000-0000-0000-000000000741', 'Viewer Job', 'construction',
   'America/Los_Angeles', 'a0000000-0000-0000-0000-000000000741');
insert into public.project_members (org_id, project_id, user_id, invite_email, role, status)
select 'b0000000-0000-0000-0000-000000000741', 'c0000000-0000-0000-0000-000000000741', u, e, r, 'active'
  from (values
    ('a0000000-0000-0000-0000-000000000742'::uuid, 'probe+fv-super@example.test', 'superintendent'),
    ('a0000000-0000-0000-0000-000000000743', 'probe+fv-viewer@example.test', 'viewer'),
    ('a0000000-0000-0000-0000-000000000744', 'probe+fv-pm@example.test', 'pm')) v(u, e, r);

-- R: a folder everyone on the job reads; VO: view-only.
insert into public.folders (id, org_id, project_id, name, proprietary, view_only, created_by) values
  ('d0000000-0000-0000-0000-000000000741', 'b0000000-0000-0000-0000-000000000741', 'c0000000-0000-0000-0000-000000000741',
   'R', false, false, 'a0000000-0000-0000-0000-000000000741'),
  ('d0000000-0000-0000-0000-000000000742', 'b0000000-0000-0000-0000-000000000741', 'c0000000-0000-0000-0000-000000000741',
   'VO', true, true, 'a0000000-0000-0000-0000-000000000741');
insert into public.folder_access (folder_id, capability, can_read, can_write) values
  ('d0000000-0000-0000-0000-000000000742', 'files.read_project', true, false);

-- 741 plan.pdf, 742 page.html, 743 logo.svg, 744 the super's photo, 745/746 a daily PDF and its later version (by the
-- super), 747 an RFI PDF (by the super), 748 a PDF in the view-only folder, 749 the super's unfinished upload,
-- 750 the viewer's own note.
insert into public.files (id, org_id, project_id, folder_id, storage_path, original_name, mime, created_by, scan_status,
                          upload_complete, version_group_id, version_no)
select f.id, 'b0000000-0000-0000-0000-000000000741', 'c0000000-0000-0000-0000-000000000741', f.folder,
       public.file_storage_path('c0000000-0000-0000-0000-000000000741', f.folder, f.id, f.name), f.name, f.mime, f.by, 'clean',
       f.done, coalesce(f.grp, f.id), f.no
  from (values
    ('e0000000-0000-0000-0000-000000000741'::uuid, 'd0000000-0000-0000-0000-000000000741'::uuid, 'plan.pdf', 'application/pdf',
     'a0000000-0000-0000-0000-000000000742'::uuid, true, null::uuid, 1),
    ('e0000000-0000-0000-0000-000000000742', 'd0000000-0000-0000-0000-000000000741', 'page.html', 'text/html',
     'a0000000-0000-0000-0000-000000000742', true, null, 1),
    ('e0000000-0000-0000-0000-000000000743', 'd0000000-0000-0000-0000-000000000741', 'logo.svg', 'image/svg+xml',
     'a0000000-0000-0000-0000-000000000742', true, null, 1),
    ('e0000000-0000-0000-0000-000000000744', 'd0000000-0000-0000-0000-000000000741', 'crack.jpg', 'image/jpeg',
     'a0000000-0000-0000-0000-000000000742', true, null, 1),
    ('e0000000-0000-0000-0000-000000000745', 'd0000000-0000-0000-0000-000000000741', 'Daily 1.pdf', 'application/pdf',
     'a0000000-0000-0000-0000-000000000742', true, 'e0000000-0000-0000-0000-000000000745', 1),
    ('e0000000-0000-0000-0000-000000000746', 'd0000000-0000-0000-0000-000000000741', 'Daily 1.pdf', 'application/pdf',
     'a0000000-0000-0000-0000-000000000742', true, 'e0000000-0000-0000-0000-000000000745', 2),
    ('e0000000-0000-0000-0000-000000000747', 'd0000000-0000-0000-0000-000000000741', 'RFI 1.pdf', 'application/pdf',
     'a0000000-0000-0000-0000-000000000742', true, null, 1),
    ('e0000000-0000-0000-0000-000000000748', 'd0000000-0000-0000-0000-000000000742', 'secret.pdf', 'application/pdf',
     'a0000000-0000-0000-0000-000000000741', true, null, 1),
    ('e0000000-0000-0000-0000-000000000749', 'd0000000-0000-0000-0000-000000000741', 'half.pdf', 'application/pdf',
     'a0000000-0000-0000-0000-000000000742', false, null, 1),
    ('e0000000-0000-0000-0000-000000000750', 'd0000000-0000-0000-0000-000000000741', 'note.pdf', 'application/pdf',
     'a0000000-0000-0000-0000-000000000743', true, null, 1)
  ) as f (id, folder, name, mime, by, done, grp, no);
update public.files set superseded_by = 'e0000000-0000-0000-0000-000000000746' where id = 'e0000000-0000-0000-0000-000000000745';

-- The records: a daily report pointing at the newer PDF (its earlier version is kept with it), an RFI at its PDF.
insert into public.daily_reports (org_id, project_id, author_id, report_type, report_date, pdf_file_id, created_by)
values ('b0000000-0000-0000-0000-000000000741', 'c0000000-0000-0000-0000-000000000741', 'a0000000-0000-0000-0000-000000000742',
        'daily', '2026-10-01', 'e0000000-0000-0000-0000-000000000746', 'a0000000-0000-0000-0000-000000000742');
insert into public.rfis (org_id, project_id, created_by, title, question, pdf_file_id)
values ('b0000000-0000-0000-0000-000000000741', 'c0000000-0000-0000-0000-000000000741', 'a0000000-0000-0000-0000-000000000742',
        'Slab edge', 'Which governs?', 'e0000000-0000-0000-0000-000000000747');

select ok(not has_function_privilege('anon', 'public.file_remove(uuid, integer)', 'EXECUTE')
          and not has_function_privilege('anon', 'public.file_restore(uuid)', 'EXECUTE')
          and not has_function_privilege('anon', 'public.file_rename(uuid, integer, text)', 'EXECUTE')
          and not has_function_privilege('anon', 'public.file_can_change(uuid)', 'EXECUTE'),
  'anon: no file Delete or Rename');
select ok(not has_function_privilege('authenticated', 'public.file_change_check(uuid)', 'EXECUTE'),
  'the shared check is internal');

set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000743');
select ok(not public.file_kept('e0000000-0000-0000-0000-000000000748'), 'file_kept: no answer about a file the caller can''t see');
select pg_temp.login('a0000000-0000-0000-0000-000000000742');
select ok(public.file_kept('e0000000-0000-0000-0000-000000000745'), 'file_kept: an earlier version of a record is kept too');
reset role;

set local role authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- PDF previews
-- ---------------------------------------------------------------------------------------------------------------
select pg_temp.login('a0000000-0000-0000-0000-000000000743');
select results_eq($$ select original_name, mime from public.authorize_preview('e0000000-0000-0000-0000-000000000741') $$,
  $$ values ('plan.pdf'::text, 'application/pdf'::text) $$, 'viewer: previews a PDF in a folder they read');
select is(array[pg_temp.logged('e0000000-0000-0000-0000-000000000741'), pg_temp.previews('e0000000-0000-0000-0000-000000000741')],
  array[0, 1], 'a PDF preview: no download line, one preview audit line');
select throws_ok($$ select * from public.authorize_preview('e0000000-0000-0000-0000-000000000742') $$, '42501', 'not_image',
  'an HTML page is never previewed');
select throws_ok($$ select * from public.authorize_preview('e0000000-0000-0000-0000-000000000743') $$, '42501', 'not_image',
  'an SVG is still never previewed');
select throws_ok($$ select * from public.authorize_preview('e0000000-0000-0000-0000-000000000748') $$, '42501', 'view_only',
  'a PDF in a view-only folder: refused like its download');
select pg_temp.login('a0000000-0000-0000-0000-000000000741');
select results_eq($$ select original_name from public.authorize_preview('e0000000-0000-0000-0000-000000000748') $$,
  $$ values ('secret.pdf'::text) $$, 'the admin (files.manage) previews it, as he downloads it');

-- ---------------------------------------------------------------------------------------------------------------
-- Signed records stay on file
-- ---------------------------------------------------------------------------------------------------------------
select pg_temp.login('a0000000-0000-0000-0000-000000000742');
select throws_ok($$ update public.files set deleted_at = now() where id = 'e0000000-0000-0000-0000-000000000746' $$, '42501',
  'A signed record stays on file.', 'the author cannot soft-delete their daily PDF');
select throws_ok($$ update public.files set deleted_at = now() where id = 'e0000000-0000-0000-0000-000000000747' $$, '42501',
  'A signed record stays on file.', 'the signer cannot soft-delete the RFI PDF');
select ok(not public.file_can_change('e0000000-0000-0000-0000-000000000746'), 'the author: no Delete or Rename on the daily PDF');
select throws_ok($$ select public.file_remove('e0000000-0000-0000-0000-000000000746', pg_temp.fv('e0000000-0000-0000-0000-000000000746')) $$,
  '42501', 'A signed record stays on file.', 'file_remove refuses the daily PDF');
select throws_ok($$ select public.file_rename('e0000000-0000-0000-0000-000000000747', pg_temp.fv('e0000000-0000-0000-0000-000000000747'),
  'Other.pdf') $$, '42501', 'A signed record stays on file.', 'file_rename refuses the RFI PDF');
select pg_temp.login('a0000000-0000-0000-0000-000000000741');
select throws_ok($$ update public.files set deleted_at = now() where id = 'e0000000-0000-0000-0000-000000000745' $$, '42501',
  'A signed record stays on file.', 'files.manage cannot delete the daily PDF''s earlier version either');
select throws_ok($$ select public.file_remove('e0000000-0000-0000-0000-000000000747', pg_temp.fv('e0000000-0000-0000-0000-000000000747')) $$,
  '42501', 'A signed record stays on file.', 'files.manage: file_remove refuses the RFI PDF');
reset role;
-- Even with a column grant the server keeps for itself, a person can't rename or move a record.
grant update (original_name, folder_id) on public.files to authenticated;
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000741');
select throws_ok($$ update public.files set original_name = 'x.pdf' where id = 'e0000000-0000-0000-0000-000000000746' $$, '42501',
  'A signed record stays on file.', 'a record is never renamed by a person');
select throws_ok($$ update public.files set folder_id = 'd0000000-0000-0000-0000-000000000742'
                    where id = 'e0000000-0000-0000-0000-000000000747' $$, '42501',
  'A signed record stays on file.', 'nor moved');
reset role;
revoke update (original_name, folder_id) on public.files from authenticated;
-- The server's own work (e.g. a submit that could not finish takes its PDF back) still runs.
select lives_ok($$ update public.files set deleted_at = now() where id = 'e0000000-0000-0000-0000-000000000747' $$,
  'the server (its own functions) can still take a record back');
update public.files set deleted_at = null where id = 'e0000000-0000-0000-0000-000000000747';
set local role service_role;
select pg_temp.login_service();
select lives_ok($$ update public.files set deleted_at = now() where id = 'e0000000-0000-0000-0000-000000000747' $$,
  'and so can the server key');
reset role;

-- ---------------------------------------------------------------------------------------------------------------
-- Delete and Rename in Files
-- ---------------------------------------------------------------------------------------------------------------
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000743');
select ok(not public.file_can_change('e0000000-0000-0000-0000-000000000741'), 'viewer: no Delete on someone else''s file');
select throws_ok($$ select public.file_remove('e0000000-0000-0000-0000-000000000741', 1) $$, '42501', 'forbidden',
  'viewer: file_remove refuses someone else''s file');
select ok(public.file_can_change('e0000000-0000-0000-0000-000000000750'), 'viewer: Delete and Rename on their own file');
select throws_ok($$ select public.file_rename('e0000000-0000-0000-0000-000000000750', 1, '  ') $$, '23514', 'Give the file a name.',
  'rename: a blank name is refused');
select throws_ok($$ select public.file_rename('e0000000-0000-0000-0000-000000000750', 1, 'a/b.pdf') $$, '23514', null,
  'rename: no slash');
select is(public.file_rename('e0000000-0000-0000-0000-000000000750', 1, ' Field note.pdf '), 2, 'rename: the new version back');
select is(pg_temp.fname('e0000000-0000-0000-0000-000000000750'), 'Field note.pdf', 'rename: the name is trimmed and saved');
select throws_ok($$ select public.file_rename('e0000000-0000-0000-0000-000000000750', 1, 'Again.pdf') $$, '40001', null,
  'rename: an old version is a conflict');

select pg_temp.login('a0000000-0000-0000-0000-000000000742');
select throws_ok($$ select public.file_remove('e0000000-0000-0000-0000-000000000749', pg_temp.fv('e0000000-0000-0000-0000-000000000749')) $$,
  '42501', 'That file is still uploading.', 'an unfinished upload goes through Remove on its line, not Delete');
select lives_ok($$ select public.file_remove('e0000000-0000-0000-0000-000000000744', pg_temp.fv('e0000000-0000-0000-0000-000000000744')) $$,
  'super: deletes their own photo');
select ok(pg_temp.gone('e0000000-0000-0000-0000-000000000744'), 'the photo is soft-deleted');
select lives_ok($$ select public.file_remove('e0000000-0000-0000-0000-000000000744', 1) $$, 'a repeat is fine');
select pg_temp.login('a0000000-0000-0000-0000-000000000744');
select throws_ok($$ select public.file_restore('e0000000-0000-0000-0000-000000000744') $$, '42501', null,
  'Undo: only the person who deleted it');
select pg_temp.login('a0000000-0000-0000-0000-000000000742');
select lives_ok($$ select public.file_restore('e0000000-0000-0000-0000-000000000744') $$, 'Undo: the super brings it back');
select ok(not pg_temp.gone('e0000000-0000-0000-0000-000000000744'), 'the photo is back');
select lives_ok($$ select public.file_restore('e0000000-0000-0000-0000-000000000744') $$, 'Undo: a repeat is fine');
reset role;
update public.files set deleted_at = now(), upload_complete = true where id = 'e0000000-0000-0000-0000-000000000749';
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000742');
select throws_ok($$ select public.file_restore('e0000000-0000-0000-0000-000000000749') $$, '42501',
  'That file can''t be brought back here.', 'Undo never brings back what the server took away');

select pg_temp.login('a0000000-0000-0000-0000-000000000744');
select lives_ok($$ select public.file_remove('e0000000-0000-0000-0000-000000000741', pg_temp.fv('e0000000-0000-0000-0000-000000000741')) $$,
  'the PM (files.manage) deletes another person''s plan');

select * from finish();
rollback;
