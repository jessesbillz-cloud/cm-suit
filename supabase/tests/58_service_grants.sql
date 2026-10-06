begin;
select plan(27);
-- Migration 0066: the server key's table rights are written down, the same on every database. The hosted project's
-- defaults give service_role almost nothing on a new table and a from-zero database gives it everything, so before 0066
-- the tests passed while staging refused every server-made PDF ("permission denied for table files").
\ir _helpers.psql

-- ---------------------------------------------------------------------------------------------------------------
-- The map: every public table follows the rule (read, add, change) or is one of the listed exceptions
-- ---------------------------------------------------------------------------------------------------------------
create temp table want (t text primary key, p text not null);
insert into want values
  ('audit_events', ''), ('comments', ''), ('comment_edits', ''), ('ir_link_receipts', ''), ('safety_meetings', ''),
  ('signin_keys', ''), ('requirements', ''),
  ('csi_divisions', 'SELECT'), ('csi_sections', 'SELECT'), ('ir_maps', 'SELECT'), ('ir_rev_items', 'SELECT'),
  ('rev_areas', 'SELECT'), ('rev_items', 'SELECT'), ('rev_lists', 'SELECT'), ('rev_marks', 'SELECT'), ('revs', 'SELECT'),
  ('rev_signoffs', 'SELECT'), ('rev_rooms', 'SELECT'), ('rev_room_walls', 'SELECT'),
  ('safety_signins', 'SELECT'), ('safety_topics', 'SELECT'), ('schedule_activities', 'SELECT'),
  ('project_places', 'SELECT'), ('project_weather', 'SELECT'),
  ('schedule_versions', 'SELECT'), ('role_permissions', 'SELECT'), ('roles', 'SELECT'), ('job_kinds', 'SELECT'),
  ('folder_templates', 'SELECT'), ('owner_lookup', 'SELECT'), ('security_switches', 'SELECT'),
  ('signin_allowlist', 'SELECT'), ('testing_superusers', 'SELECT'), ('testing_role_home', 'SELECT'),
  ('permit_stamped_copies', 'INSERT,SELECT'), ('permit_approved_sets', 'INSERT,SELECT'),
  ('permit_stage_events', 'INSERT,SELECT'), ('requirement_reminders', 'INSERT,SELECT'),
  ('calendar_feed_tokens', 'DELETE,INSERT,SELECT,UPDATE'), ('corrections', 'DELETE,INSERT,SELECT,UPDATE'),
  ('correction_history', 'DELETE,INSERT,SELECT,UPDATE'), ('email_events', 'DELETE,INSERT,SELECT,UPDATE');

create temp view have as
select c.relname::text as t,
       coalesce((select string_agg(a.privilege_type, ',' order by a.privilege_type)
                   from aclexplode(c.relacl) a
                  where a.grantee = (select r.oid from pg_roles r where r.rolname = 'service_role')), '') as p
  from pg_class c
 where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p', 'v', 'm');

select is_empty($$ select w.t from want w where not exists (select 1 from have h where h.t = w.t) $$,
  'every listed exception is a real table');
select is_empty(
  $$ select h.t, h.p from have h left join want w on w.t = h.t
      where h.p is distinct from coalesce(w.p, 'INSERT,SELECT,UPDATE') order by 1 $$,
  'every public table: read, add, change for the server key, or its listed exception');
select is_empty($$ select t from have where p ~ 'TRUNCATE|REFERENCES|TRIGGER|MAINTAIN' $$,
  'no table lets the server key truncate it or hang triggers on it');

-- A table made by a later migration starts from the rule.
create table public.zz_service_grants_probe (id int primary key);
select is((select p from have where t = 'zz_service_grants_probe'), 'INSERT,SELECT,UPDATE',
  'a new table starts with read, add, change');

-- ---------------------------------------------------------------------------------------------------------------
-- What the server code does with its key (edge functions and the worker), table by table
-- ---------------------------------------------------------------------------------------------------------------
select is_empty(
  $$ select n.t, v from (values
       ('access_links', 'INSERT,UPDATE'), ('activity', 'SELECT'), ('ai_calls', 'INSERT'),
       ('bid_extraction_pricing', 'INSERT,UPDATE'), ('bid_extractions', 'INSERT,UPDATE,SELECT'),
       ('bid_packages', 'SELECT'), ('calendar_feed_tokens', 'SELECT'), ('downloads', 'INSERT'),
       ('email_events', 'INSERT,DELETE,SELECT'), ('email_inbound', 'INSERT,SELECT'),
       ('email_outbound', 'INSERT,SELECT,UPDATE'), ('email_suppressions', 'SELECT,INSERT,UPDATE'),
       ('file_pages', 'INSERT,UPDATE,SELECT'), ('files', 'INSERT,SELECT,UPDATE'), ('folders', 'SELECT,INSERT,UPDATE'),
       ('folder_access', 'INSERT'), ('ir_maps', 'SELECT'), ('member_scopes', 'INSERT,UPDATE,SELECT'),
       ('orgs', 'SELECT'), ('permit_stamped_copies', 'INSERT'), ('profiles', 'SELECT'),
       ('project_members', 'INSERT,SELECT,UPDATE'), ('projects', 'SELECT'), ('role_permissions', 'SELECT'),
       ('roles', 'SELECT'), ('share_links', 'INSERT,SELECT,UPDATE'), ('sub_history', 'INSERT'),
       ('subs', 'INSERT,SELECT'), ('tasks', 'SELECT'), ('transmittals', 'INSERT,UPDATE,SELECT')
     ) n (t, privs), unnest(string_to_array(n.privs, ',')) v
     where not has_table_privilege('service_role', 'public.' || n.t, v) $$,
  'the server key holds every right its own code uses');

-- ---------------------------------------------------------------------------------------------------------------
-- A job with a sheet on it
-- ---------------------------------------------------------------------------------------------------------------
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000581', 'probe+admin58@example.test', 'Admin');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000582', 'probe+new58@example.test', 'New');
insert into public.orgs (id, name, kind, created_by) values
  ('b0000000-0000-0000-0000-00000000058a', 'Org A', 'gc', 'a0000000-0000-0000-0000-000000000581');
insert into public.projects (id, org_id, name, created_by) values
  ('c0000000-0000-0000-0000-00000000058a', 'b0000000-0000-0000-0000-00000000058a', 'Project A', 'a0000000-0000-0000-0000-000000000581');
insert into public.folders (id, org_id, project_id, parent_id, name, created_by) values
  ('d0000000-0000-0000-0000-000000000581', 'b0000000-0000-0000-0000-00000000058a', 'c0000000-0000-0000-0000-00000000058a', null,
   'Plans 58', 'a0000000-0000-0000-0000-000000000581');
insert into public.files (id, org_id, project_id, folder_id, storage_path, original_name, mime, size, scan_status,
                          upload_complete, created_by) values
  ('e0000000-0000-0000-0000-000000000581', 'b0000000-0000-0000-0000-00000000058a', 'c0000000-0000-0000-0000-00000000058a',
   'd0000000-0000-0000-0000-000000000581', 'project/x/y/z/sheet.pdf', 'sheet.pdf', 'application/pdf', 1000, 'clean', true,
   'a0000000-0000-0000-0000-000000000581');

set local role service_role;
select pg_temp.login_service();

-- ir-map reads the sheet and the signer's signature (the call that failed on staging).
select is((select count(*)::int from public.files where id = 'e0000000-0000-0000-0000-000000000581' and deleted_at is null), 1,
  'the sheet row is readable');
select lives_ok($$ select signature_path from public.profiles where user_id = 'a0000000-0000-0000-0000-000000000581' $$,
  'the signature path is readable');
select lives_ok($$ select content_hash, map_file_id from public.ir_maps limit 1 $$, 'the stored map is readable');

-- _shared/generatedPdf.ts: folder, storage path, the new row, then the old one points at it.
select is((select project_id from public.folders where id = 'd0000000-0000-0000-0000-000000000581' and deleted_at is null),
  'c0000000-0000-0000-0000-00000000058a'::uuid, 'generated PDF: the folder is readable');
select is(public.file_storage_path('c0000000-0000-0000-0000-00000000058a', 'd0000000-0000-0000-0000-000000000581',
                                   'e0000000-0000-0000-0000-000000000582', 'IR 1.pdf'),
  'project/c0000000-0000-0000-0000-00000000058a/d0000000-0000-0000-0000-000000000581/e0000000-0000-0000-0000-000000000582/IR 1.pdf',
  'generated PDF: the storage path');
select lives_ok($$
  insert into public.files (id, org_id, project_id, folder_id, storage_path, original_name, mime, size, sha256, scan_status,
                            scanned_at, text_status, upload_complete, created_by, version_group_id, version_no)
  select 'e0000000-0000-0000-0000-000000000582', f.org_id, f.project_id, f.folder_id, 'project/x/y/z/IR 1.pdf', 'IR 1.pdf',
         'application/pdf', 2000, repeat('a', 64), 'clean', now(), 'none', true, 'a0000000-0000-0000-0000-000000000581',
         f.version_group_id, f.version_no + 1
    from public.files f where f.id = 'e0000000-0000-0000-0000-000000000581' $$,
  'generated PDF: the row is stored');
select lives_ok($$ update public.files set superseded_by = 'e0000000-0000-0000-0000-000000000582'
                    where id = 'e0000000-0000-0000-0000-000000000581' $$, 'generated PDF: the old version points at the new one');
select lives_ok($$ update public.files set text_status = 'done', page_count = 1 where id = 'e0000000-0000-0000-0000-000000000582' $$,
  'the worker records what it read from a file');

-- The folders the server makes on first use (functions that run as their caller).
select lives_ok($$ select public.ir_folder_make('c0000000-0000-0000-0000-00000000058a', 'reports') $$,
  'the "Inspection reports" folder is made');
select lives_ok($$ select public.ir_folder_make('c0000000-0000-0000-0000-00000000058a', 'ofs_reports') $$,
  'the "OFS inspection reports" folder is made');
select isnt(public.ir_folder_make('c0000000-0000-0000-0000-00000000058a', 'ofs_reports'),
            public.ir_folder_make('c0000000-0000-0000-0000-00000000058a', 'reports'), 'they are two folders');
select lives_ok($$ select public.safety_folder_make('c0000000-0000-0000-0000-00000000058a') $$, 'the "Safety" folder is made');

-- invite-member: the membership row, then its scopes and link.
select lives_ok($$
  insert into public.project_members (org_id, project_id, invite_email, role, status, invited_by, created_by)
  values ('b0000000-0000-0000-0000-00000000058a', 'c0000000-0000-0000-0000-00000000058a', 'probe+new58@example.test', 'viewer',
          'invited', 'a0000000-0000-0000-0000-000000000581', 'a0000000-0000-0000-0000-000000000581') $$,
  'an invite is stored');
select lives_ok($$ update public.project_members set role = 'pm'
                    where project_id = 'c0000000-0000-0000-0000-00000000058a' and invite_email = 'probe+new58@example.test' $$,
  'an invite is changed');
select lives_ok($$ select role from public.role_permissions where capability = 'bids.submit' $$, 'the matrix is readable');

-- What the key cannot do.
select throws_ok($$ delete from public.files where id = 'e0000000-0000-0000-0000-000000000582' $$, '42501', null,
  'it cannot delete a file row');
select throws_ok($$ truncate public.files cascade $$, '42501', null, 'it cannot truncate a table');
select throws_ok($$ update public.role_permissions set capability = capability where false $$, '42501', null,
  'it cannot change the matrix');
select throws_ok($$ insert into public.audit_events default values $$, '42501', null, 'it cannot write the audit log directly');
select throws_ok($$ select 1 from public.comments limit 1 $$, '42501', null, 'it cannot read comments directly');
select throws_ok($$ select 1 from public.signin_keys limit 1 $$, '42501', null, 'it cannot read the testing sign-in keys');

-- Its writes are still logged (the audit trigger runs as its owner).
reset role;
select ok(exists (select 1 from public.audit_events where entity_id = 'e0000000-0000-0000-0000-000000000582'),
  'a server-made file is in the audit log');

select * from finish();
rollback;
