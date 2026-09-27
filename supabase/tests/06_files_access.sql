begin;
select plan(38);
-- SPEC §5.6 / §6.5 / §5.2 money rule: folder access inheritance, the pricing-only "Bids received" folder,
-- the files insert policy, and authorize_download gates.
\ir _helpers.psql

select pg_temp.mk_user('a0000000-0000-0000-0000-000000000001', 'probe+project_admin@example.test', 'Admin');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000002', 'probe+estimator@example.test', 'Estimator');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000003', 'probe+pm@example.test', 'PM');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000005', 'probe+superintendent@example.test', 'Super');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000009', 'probe+bidder@example.test', 'Bidder 1');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000013', 'probe+viewer@example.test', 'Viewer');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000014', 'probe+bidder2@example.test', 'Bidder 2');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000017', 'probe+revoked@example.test', 'Soon revoked');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000018', 'probe+outsider@example.test', 'Outsider');

insert into public.orgs (id, name, kind, created_by) values
  ('b0000000-0000-0000-0000-00000000000a', 'Org A', 'gc', 'a0000000-0000-0000-0000-000000000001');
insert into public.projects (id, org_id, name, created_by) values
  ('c0000000-0000-0000-0000-00000000000a', 'b0000000-0000-0000-0000-00000000000a', 'Project A', 'a0000000-0000-0000-0000-000000000001');
insert into public.project_members (org_id, project_id, user_id, invite_email, role, status, created_by)
select 'b0000000-0000-0000-0000-00000000000a', 'c0000000-0000-0000-0000-00000000000a', u.id, u.email, m.role, 'active',
       'a0000000-0000-0000-0000-000000000001'
from (values
  ('a0000000-0000-0000-0000-000000000002'::uuid, 'estimator'),
  ('a0000000-0000-0000-0000-000000000003', 'pm'),
  ('a0000000-0000-0000-0000-000000000005', 'superintendent'),
  ('a0000000-0000-0000-0000-000000000009', 'bidder'),
  ('a0000000-0000-0000-0000-000000000013', 'viewer'),
  ('a0000000-0000-0000-0000-000000000014', 'bidder'),
  ('a0000000-0000-0000-0000-000000000017', 'superintendent')
) as m (uid, role)
join auth.users u on u.id = m.uid;

-- Folder tree:  R (no list)   P (list: dailies.read_all read-only) > C (no list) > G (list: viewer read)
--               VO (proprietary, view_only; list: files.read_project read)   + the default "Bids received" folder.
insert into public.folders (id, org_id, project_id, parent_id, name, proprietary, view_only, created_by) values
  ('d0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-00000000000a', 'c0000000-0000-0000-0000-00000000000a', null, 'R', false, false, 'a0000000-0000-0000-0000-000000000001'),
  ('d0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-00000000000a', 'c0000000-0000-0000-0000-00000000000a', null, 'P', false, false, 'a0000000-0000-0000-0000-000000000001'),
  ('d0000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-00000000000a', 'c0000000-0000-0000-0000-00000000000a', 'd0000000-0000-0000-0000-000000000002', 'C', false, false, 'a0000000-0000-0000-0000-000000000001'),
  ('d0000000-0000-0000-0000-000000000004', 'b0000000-0000-0000-0000-00000000000a', 'c0000000-0000-0000-0000-00000000000a', 'd0000000-0000-0000-0000-000000000003', 'G', false, false, 'a0000000-0000-0000-0000-000000000001'),
  ('d0000000-0000-0000-0000-000000000005', 'b0000000-0000-0000-0000-00000000000a', 'c0000000-0000-0000-0000-00000000000a', null, 'VO', true, true, 'a0000000-0000-0000-0000-000000000001');
insert into public.folder_access (folder_id, capability, user_id, can_read, can_write) values
  ('d0000000-0000-0000-0000-000000000002', 'dailies.read_all', null, true, false),
  ('d0000000-0000-0000-0000-000000000004', null, 'a0000000-0000-0000-0000-000000000013', true, false),
  ('d0000000-0000-0000-0000-000000000005', 'files.read_project', null, true, false);

create temp table ids (k text primary key, v uuid not null);
grant select on ids to public;
insert into ids select 'bids', id from public.folders
  where project_id = 'c0000000-0000-0000-0000-00000000000a' and kind = 'bids_received';
create function pg_temp.id(p_k text) returns uuid language sql stable as $$ select v from pg_temp.ids where k = p_k $$;
grant execute on function pg_temp.id(text) to public;

-- Files (inserted as postgres, i.e. the way the worker / bid-intake function registers them).
insert into public.files (id, org_id, project_id, folder_id, storage_path, original_name, created_by, scan_status)
select f.id, 'b0000000-0000-0000-0000-00000000000a', 'c0000000-0000-0000-0000-00000000000a', f.folder,
       public.file_storage_path('c0000000-0000-0000-0000-00000000000a', f.folder, f.id, f.name), f.name, f.by, f.scan
from (values
  ('e0000000-0000-0000-0000-000000000001'::uuid, pg_temp.id('bids'), 'bid-1.pdf', 'a0000000-0000-0000-0000-000000000009'::uuid, 'clean'),
  ('e0000000-0000-0000-0000-000000000002', pg_temp.id('bids'), 'bid-2.pdf', 'a0000000-0000-0000-0000-000000000014', 'clean'),
  ('e0000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000001', 'pending.pdf', 'a0000000-0000-0000-0000-000000000005', 'pending'),
  ('e0000000-0000-0000-0000-000000000004', 'd0000000-0000-0000-0000-000000000001', 'eicar.pdf', 'a0000000-0000-0000-0000-000000000005', 'infected'),
  ('e0000000-0000-0000-0000-000000000005', 'd0000000-0000-0000-0000-000000000001', 'plan.pdf', 'a0000000-0000-0000-0000-000000000005', 'clean'),
  ('e0000000-0000-0000-0000-000000000006', 'd0000000-0000-0000-0000-000000000005', 'secret.pdf', 'a0000000-0000-0000-0000-000000000001', 'clean'),
  ('e0000000-0000-0000-0000-000000000007', 'd0000000-0000-0000-0000-000000000001', 'mine.pdf', 'a0000000-0000-0000-0000-000000000017', 'clean'),
  ('e0000000-0000-0000-0000-000000000008', 'd0000000-0000-0000-0000-000000000001', 'draft.pdf', 'a0000000-0000-0000-0000-000000000005', 'clean')
) as f (id, folder, name, by, scan);

set local role authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- Inheritance: a folder uses its own access list, else its nearest ancestor's, else the project defaults.
-- ---------------------------------------------------------------------------------------------------------------
select ok(pg_temp.can_read_as('a0000000-0000-0000-0000-000000000005', 'd0000000-0000-0000-0000-000000000003'),
  'C inherits P''s list: superintendent (dailies.read_all) can read');
select ok(not pg_temp.can_read_as('a0000000-0000-0000-0000-000000000013', 'd0000000-0000-0000-0000-000000000003'),
  'C inherits P''s list: viewer cannot read, even with files.read_project');
select ok(pg_temp.can_read_as('a0000000-0000-0000-0000-000000000013', 'd0000000-0000-0000-0000-000000000004'),
  'G has its own list: viewer (listed by user) can read');
select ok(not pg_temp.can_read_as('a0000000-0000-0000-0000-000000000005', 'd0000000-0000-0000-0000-000000000004'),
  'G''s own list wins over P''s: superintendent cannot read');
select ok(not pg_temp.can_write_as('a0000000-0000-0000-0000-000000000005', 'd0000000-0000-0000-0000-000000000003'),
  'C inherits P''s read-only entry: superintendent cannot write');
select ok(pg_temp.can_write_as('a0000000-0000-0000-0000-000000000005', 'd0000000-0000-0000-0000-000000000001'),
  'R has no list anywhere up the tree: files.write_project applies (superintendent writes)');
select ok(not pg_temp.can_write_as('a0000000-0000-0000-0000-000000000013', 'd0000000-0000-0000-0000-000000000001'),
  'R: viewer (no files.write_project) cannot write');
select ok(pg_temp.can_read_as('a0000000-0000-0000-0000-000000000013', 'd0000000-0000-0000-0000-000000000001'),
  'R: viewer reads via files.read_project');

-- ---------------------------------------------------------------------------------------------------------------
-- "Bids received": pricing only (bids.view_pricing, aal2). A bidder sees only the file it uploaded.
-- ---------------------------------------------------------------------------------------------------------------
select ok(not pg_temp.can_read_as('a0000000-0000-0000-0000-000000000002', pg_temp.id('bids'), 'aal1'), 'Bids received: estimator at aal1 cannot read');
select ok(pg_temp.can_read_as('a0000000-0000-0000-0000-000000000002', pg_temp.id('bids'), 'aal2'), 'Bids received: estimator at aal2 can read');
select ok(pg_temp.can_read_as('a0000000-0000-0000-0000-000000000001', pg_temp.id('bids'), 'aal2'), 'Bids received: project_admin at aal2 can read');
select ok(not pg_temp.can_read_as('a0000000-0000-0000-0000-000000000001', pg_temp.id('bids'), 'aal1'), 'Bids received: project_admin at aal1 cannot read');
select ok(not pg_temp.can_read_as('a0000000-0000-0000-0000-000000000003', pg_temp.id('bids'), 'aal2'), 'Bids received: pm (no pricing) cannot read');
select ok(not pg_temp.can_read_as('a0000000-0000-0000-0000-000000000005', pg_temp.id('bids'), 'aal2'), 'Bids received: superintendent cannot read');
select ok(not pg_temp.can_read_as('a0000000-0000-0000-0000-000000000009', pg_temp.id('bids')), 'Bids received: bidder cannot read the folder');

select pg_temp.login('a0000000-0000-0000-0000-000000000009');
select results_eq($$ select id from public.files where folder_id = pg_temp.id('bids') order by 1 $$,
  $$ values ('e0000000-0000-0000-0000-000000000001'::uuid) $$, 'bidder 1 sees exactly its own received bid file');
select pg_temp.login('a0000000-0000-0000-0000-000000000014');
select is_empty($$ select id from public.files where id = 'e0000000-0000-0000-0000-000000000001' $$, 'bidder 2 cannot see bidder 1''s bid file');
select pg_temp.login('a0000000-0000-0000-0000-000000000003', 'aal2');
select is_empty($$ select id from public.files where folder_id = pg_temp.id('bids') $$, 'pm (no pricing) sees no received bid files');
select pg_temp.login('a0000000-0000-0000-0000-000000000002', 'aal2');
select results_eq($$ select id from public.files where folder_id = pg_temp.id('bids') order by 1 $$,
  $$ values ('e0000000-0000-0000-0000-000000000001'::uuid), ('e0000000-0000-0000-0000-000000000002'::uuid) $$,
  'estimator at aal2 sees both received bid files');

-- ---------------------------------------------------------------------------------------------------------------
-- files insert / update policies.
-- ---------------------------------------------------------------------------------------------------------------
select pg_temp.login('a0000000-0000-0000-0000-000000000005');
select throws_ok(
  $$ insert into public.files (id, org_id, project_id, folder_id, storage_path, original_name, created_by)
     values ('e0000000-0000-0000-0000-000000000010', 'b0000000-0000-0000-0000-00000000000a', 'c0000000-0000-0000-0000-00000000000a',
             'd0000000-0000-0000-0000-000000000001', 'project/elsewhere/x.pdf', 'x.pdf', 'a0000000-0000-0000-0000-000000000005') $$,
  '42501', null, 'files insert: a storage_path that is not file_storage_path(...) is rejected');
select lives_ok(
  $$ insert into public.files (id, org_id, project_id, folder_id, storage_path, original_name, created_by)
     values ('e0000000-0000-0000-0000-000000000011', 'b0000000-0000-0000-0000-00000000000a', 'c0000000-0000-0000-0000-00000000000a',
             'd0000000-0000-0000-0000-000000000001',
             public.file_storage_path('c0000000-0000-0000-0000-00000000000a', 'd0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000011', 'ok.pdf'),
             'ok.pdf', 'a0000000-0000-0000-0000-000000000005') $$,
  'files insert: the canonical path into a writable folder is accepted');
select pg_temp.login('a0000000-0000-0000-0000-000000000009');
select throws_ok(
  $$ insert into public.files (id, org_id, project_id, folder_id, storage_path, original_name, created_by)
     select 'e0000000-0000-0000-0000-000000000012', 'b0000000-0000-0000-0000-00000000000a', 'c0000000-0000-0000-0000-00000000000a',
            pg_temp.id('bids'), public.file_storage_path('c0000000-0000-0000-0000-00000000000a', pg_temp.id('bids'), 'e0000000-0000-0000-0000-000000000012', 'b.pdf'),
            'b.pdf', 'a0000000-0000-0000-0000-000000000009' $$,
  '42501', null, 'files insert: a bidder cannot write into Bids received directly');
select pg_temp.login('a0000000-0000-0000-0000-000000000005');
select throws_ok(
  $$ update public.files set storage_path = 'project/other/cached-stamped-copy.pdf' where id = 'e0000000-0000-0000-0000-000000000008' $$,
  '42501', null, 'files update: the uploader cannot repoint storage_path (would sign someone else''s object)');
select throws_ok(
  $$ update public.files set folder_id = pg_temp.id('bids') where id = 'e0000000-0000-0000-0000-000000000008' $$,
  '42501', null, 'files update: the uploader cannot move a file into a folder it cannot write');

-- ---------------------------------------------------------------------------------------------------------------
-- authorize_download gates.
-- ---------------------------------------------------------------------------------------------------------------
select pg_temp.login('a0000000-0000-0000-0000-000000000013');
select throws_ok($$ select * from public.authorize_download('e0000000-0000-0000-0000-000000000003') $$,
  '42501', 'scan_pending', 'download: a non-uploader is blocked while the scan is pending');
select pg_temp.login('a0000000-0000-0000-0000-000000000005');
select lives_ok($$ select * from public.authorize_download('e0000000-0000-0000-0000-000000000003') $$,
  'download: the uploader may fetch its own pending file');
select throws_ok($$ select * from public.authorize_download('e0000000-0000-0000-0000-000000000004') $$,
  '42501', 'infected', 'download: an infected file is blocked, even for the uploader');
select pg_temp.login('a0000000-0000-0000-0000-000000000013');
select results_eq(
  $$ select storage_path, original_name from public.authorize_download('e0000000-0000-0000-0000-000000000005') $$,
  $$ select public.file_storage_path('c0000000-0000-0000-0000-00000000000a', 'd0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000005', 'plan.pdf'), 'plan.pdf'::text $$,
  'download: a clean file returns its storage path and original filename');
reset role;
select isnt_empty($$ select id from public.downloads where file_id = 'e0000000-0000-0000-0000-000000000005'
                    and user_id = 'a0000000-0000-0000-0000-000000000013' and variant = 'original' $$,
  'download: a downloads row is written');
select isnt_empty($$ select id from public.audit_events where action = 'download' and entity_id = 'e0000000-0000-0000-0000-000000000005'
                    and actor_user_id = 'a0000000-0000-0000-0000-000000000013' $$,
  'download: an audit row is written');
set local role authenticated;
select throws_ok($$ select * from public.authorize_download('e0000000-0000-0000-0000-000000000006') $$,
  '42501', 'view_only', 'download: a view-only folder hands no URL to a non-manager');
select pg_temp.login('a0000000-0000-0000-0000-000000000003');
select lives_ok($$ select * from public.authorize_download('e0000000-0000-0000-0000-000000000006') $$,
  'download: a files.manage member may download from a view-only folder');
select pg_temp.login('a0000000-0000-0000-0000-000000000018');
select throws_ok($$ select * from public.authorize_download('e0000000-0000-0000-0000-000000000005') $$,
  '42501', 'forbidden', 'download: a non-member is refused');

-- view_only only on proprietary folders; only project.manage may set it.
reset role;
select throws_ok($$ update public.folders set view_only = true where id = 'd0000000-0000-0000-0000-000000000001' $$,
  '23514', null, 'folders: view_only without proprietary violates the check constraint');
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000003');
select throws_ok($$ update public.folders set proprietary = true, view_only = true where id = 'd0000000-0000-0000-0000-000000000002' $$,
  '42501', null, 'folders: pm (files.manage, no project.manage) cannot set view_only');
select pg_temp.login('a0000000-0000-0000-0000-000000000001');
select lives_ok($$ update public.folders set proprietary = true, view_only = true where id = 'd0000000-0000-0000-0000-000000000002' $$,
  'folders: project_admin can set view_only on a proprietary folder');

-- Revoking a member ends access to the files it uploaded, too.
reset role;
update public.project_members set status = 'revoked' where user_id = 'a0000000-0000-0000-0000-000000000017';
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000017');
select is_empty($$ select id from public.files where id = 'e0000000-0000-0000-0000-000000000007' $$,
  'revoked uploader: its own file row is no longer visible');
select throws_ok($$ select * from public.authorize_download('e0000000-0000-0000-0000-000000000007') $$,
  '42501', null, 'revoked uploader: cannot download its own file');

select * from finish();
rollback;
