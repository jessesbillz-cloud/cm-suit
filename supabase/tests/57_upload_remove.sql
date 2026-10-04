begin;
select plan(27);
-- Migration 0065: remove_unfinished_upload. The person who registered an upload that never finished takes its row
-- back (soft delete); nobody else can, a finished file is never removed this way, it is safe to repeat, and the same
-- file registers clean afterwards.
\ir _helpers.psql

select pg_temp.mk_user('a0000000-0000-0000-0000-000000000571', 'probe+project_admin@example.test', 'Admin');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000572', 'probe+superintendent@example.test', 'Super');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000573', 'probe+pm@example.test', 'PM');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000574', 'probe+viewer@example.test', 'Viewer');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000575', 'probe+outsider@example.test', 'Outsider');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000576', 'probe+revoked@example.test', 'Soon revoked');

insert into public.orgs (id, name, kind, created_by) values
  ('b0000000-0000-0000-0000-00000000057a', 'Org A', 'gc', 'a0000000-0000-0000-0000-000000000571');
insert into public.projects (id, org_id, name, created_by) values
  ('c0000000-0000-0000-0000-00000000057a', 'b0000000-0000-0000-0000-00000000057a', 'Project A', 'a0000000-0000-0000-0000-000000000571');
insert into public.project_members (org_id, project_id, user_id, invite_email, role, status, created_by)
select 'b0000000-0000-0000-0000-00000000057a', 'c0000000-0000-0000-0000-00000000057a', u.id, u.email, m.role, 'active',
       'a0000000-0000-0000-0000-000000000571'
from (values
  ('a0000000-0000-0000-0000-000000000572'::uuid, 'superintendent'),
  ('a0000000-0000-0000-0000-000000000573', 'pm'),
  ('a0000000-0000-0000-0000-000000000574', 'viewer'),
  ('a0000000-0000-0000-0000-000000000576', 'superintendent')
) as m (uid, role)
join auth.users u on u.id = m.uid;
insert into public.folders (id, org_id, project_id, parent_id, name, created_by) values
  ('d0000000-0000-0000-0000-000000000571', 'b0000000-0000-0000-0000-00000000057a', 'c0000000-0000-0000-0000-00000000057a', null, 'R',
   'a0000000-0000-0000-0000-000000000571');

create temp table ids (k text primary key, v uuid not null);
grant all on ids to public;
create function pg_temp.id(p_k text) returns uuid language sql stable as $$ select v from pg_temp.ids where k = p_k $$;
grant execute on function pg_temp.id(text) to public;
-- The row as the table owner sees it (a removed row is hidden from everyone else).
create function pg_temp.row_of(p_k text) returns public.files language sql stable security definer as $$
  select f from public.files f where f.id = (select v from pg_temp.ids where k = p_k)
$$;
grant execute on function pg_temp.row_of(text) to public;

-- ---------------------------------------------------------------------------------------------------------------
-- The function is closed to anon and open to signed-in people
-- ---------------------------------------------------------------------------------------------------------------
select ok(not has_function_privilege('anon', 'public.remove_unfinished_upload(uuid)', 'EXECUTE'), 'anon cannot call it');
select ok(has_function_privilege('authenticated', 'public.remove_unfinished_upload(uuid)', 'EXECUTE'), 'a signed-in person can call it');

-- ---------------------------------------------------------------------------------------------------------------
-- An upload that never finished: only the person who registered it removes it
-- ---------------------------------------------------------------------------------------------------------------
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000572');
insert into ids select 'big', (public.register_file('d0000000-0000-0000-0000-000000000571', '38.pdf', 'application/pdf', 96468992)).id;
select ok(not (pg_temp.row_of('big')).upload_complete and (pg_temp.row_of('big')).deleted_at is null,
  'register_file leaves an unfinished row (the upload has not happened yet)');

select pg_temp.login('a0000000-0000-0000-0000-000000000574');
select throws_ok($$ select public.remove_unfinished_upload(pg_temp.id('big')) $$, 'P0002', 'not_found',
  'someone who can read the folder cannot remove another person''s unfinished upload');
select pg_temp.login('a0000000-0000-0000-0000-000000000573');
select throws_ok($$ select public.remove_unfinished_upload(pg_temp.id('big')) $$, 'P0002', 'not_found',
  'a files manager cannot either: only the person who registered it');
select pg_temp.login('a0000000-0000-0000-0000-000000000575');
select throws_ok($$ select public.remove_unfinished_upload(pg_temp.id('big')) $$, 'P0002', 'not_found',
  'someone off the job cannot');
select pg_temp.login('a0000000-0000-0000-0000-000000000572');
select throws_ok($$ select public.remove_unfinished_upload('e0000000-0000-0000-0000-000000000579') $$, 'P0002', 'not_found',
  'an unknown file answers the same way');
select ok((pg_temp.row_of('big')).deleted_at is null, 'the refused calls changed nothing');

select lives_ok($$ select public.remove_unfinished_upload(pg_temp.id('big')) $$, 'the person who registered it removes it');
select ok((pg_temp.row_of('big')).deleted_at is not null, 'the row is soft-deleted');
select ok(not (pg_temp.row_of('big')).upload_complete, 'and never marked as uploaded');
select is_empty($$ select id from public.files where id = pg_temp.id('big') $$, 'it is gone from the uploader''s own list');
select pg_temp.login('a0000000-0000-0000-0000-000000000574');
select is_empty($$ select id from public.files where id = pg_temp.id('big') $$, 'and from everyone else''s (no ghost file)');
reset role;
select isnt_empty($$ select id from public.audit_events where entity_id = pg_temp.id('big') and action = 'delete'
                    and actor_user_id = 'a0000000-0000-0000-0000-000000000572' $$,
  'the removal is in the audit log under the person who did it');
create temp table stamp as select (pg_temp.row_of('big')).deleted_at as at;
grant select on stamp to public;
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000572');
select lives_ok($$ select public.remove_unfinished_upload(pg_temp.id('big')) $$, 'removing it again is fine (safe to repeat)');
select is((pg_temp.row_of('big')).deleted_at, (select at from stamp), 'and changes nothing the second time');
select throws_ok($$ insert into storage.objects (bucket_id, name) values ('files', (pg_temp.row_of('big')).storage_path) $$,
  '42501', null, 'storage refuses bytes for the removed row''s path');

-- ---------------------------------------------------------------------------------------------------------------
-- The same file again starts clean
-- ---------------------------------------------------------------------------------------------------------------
insert into ids select 'again', (public.register_file('d0000000-0000-0000-0000-000000000571', '38.pdf', 'application/pdf', 96468992)).id;
select isnt(pg_temp.id('again'), pg_temp.id('big'), 'registering the same file again makes a new row');
select isnt((pg_temp.row_of('again')).storage_path, (pg_temp.row_of('big')).storage_path, 'on a new storage path');
-- What the app asks before it uploads (data/upload.ts findUnfinished): my unfinished row for this file in this folder.
select results_eq(
  $$ select id from public.files where folder_id = 'd0000000-0000-0000-0000-000000000571' and original_name = '38.pdf'
       and size = 96468992 and created_by = 'a0000000-0000-0000-0000-000000000572' and upload_complete = false and deleted_at is null $$,
  $$ select pg_temp.id('again') $$, 'the app finds only the new row to resume, never the removed one');
select lives_ok($$ insert into storage.objects (bucket_id, name) values ('files', (pg_temp.row_of('again')).storage_path) $$,
  'storage takes bytes for the new row''s path');

-- ---------------------------------------------------------------------------------------------------------------
-- A finished file is never removed here
-- ---------------------------------------------------------------------------------------------------------------
update public.files set upload_complete = true where id = pg_temp.id('again');
select throws_ok($$ select public.remove_unfinished_upload(pg_temp.id('again')) $$, '42501', 'That file finished uploading.',
  'a file that finished uploading is refused');
select ok((pg_temp.row_of('again')).deleted_at is null, 'and stays');
select pg_temp.login('a0000000-0000-0000-0000-000000000574');
select isnt_empty($$ select id from public.files where id = pg_temp.id('again') $$, 'others on the job still see the finished file');

-- ---------------------------------------------------------------------------------------------------------------
-- Leaving the job ends it, like every other right of an uploader
-- ---------------------------------------------------------------------------------------------------------------
select pg_temp.login('a0000000-0000-0000-0000-000000000576');
insert into ids select 'left', (public.register_file('d0000000-0000-0000-0000-000000000571', 'left.pdf', 'application/pdf', 10)).id;
reset role;
update public.project_members set status = 'revoked' where user_id = 'a0000000-0000-0000-0000-000000000576';
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000576');
select throws_ok($$ select public.remove_unfinished_upload(pg_temp.id('left')) $$, 'P0002', 'not_found',
  'a revoked member cannot remove the upload they left');
select ok((pg_temp.row_of('left')).deleted_at is null, 'the row is untouched');
select pg_temp.login(null);
select throws_ok($$ select public.remove_unfinished_upload(pg_temp.id('left')) $$, 'P0002', 'not_found',
  'no signed-in person: refused');

select * from finish();
rollback;
