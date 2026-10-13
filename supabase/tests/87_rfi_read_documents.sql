begin;
select plan(7);
-- Migration 0100 (Jesse, Oct 12: "specials still need to see rfi/submittals and plans"): the special inspector reads the
-- job's Plans, Submittals and RFI documents. The fire marshal still reads no RFI documents.
\ir _helpers.psql

create temp table ids (k text primary key, v uuid);
grant all on ids to public;
create function pg_temp.rid(p_k text) returns uuid language sql stable as $$ select v from ids where k = p_k $$;
create function pg_temp.files_of(p_uid uuid) returns text[] language plpgsql as $$
begin
  perform pg_temp.login(p_uid);
  return coalesce((select array_agg(i.k order by i.k collate "C") from public.files f join ids i on i.v = f.id), '{}'::text[]);
end $$;
create function pg_temp.kinds_of(p_uid uuid) returns text[] language plpgsql as $$
begin
  perform pg_temp.login(p_uid);
  return (select array_agg(s.kind) from public.files_sections('c0000000-0000-0000-0000-000000000871') s);
end $$;
grant execute on all functions in schema pg_temp to public;

select pg_temp.mk_user('a0000000-0000-0000-0000-000000000871', 'probe+rd-admin@example.test', 'Ada Admin');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000872', 'probe+rd-pm@example.test', 'Pia PM');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000873', 'probe+rd-si@example.test', 'Sid Special');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000874', 'probe+rd-ahj@example.test', 'Dana Deputy');

insert into public.orgs (id, name, kind, created_by) values
  ('b0000000-0000-0000-0000-000000000871', 'Sample Docs Builders', 'gc', 'a0000000-0000-0000-0000-000000000871');
insert into public.projects (id, org_id, name, stage, timezone, created_by) values
  ('c0000000-0000-0000-0000-000000000871', 'b0000000-0000-0000-0000-000000000871', 'Sample Docs Job', 'construction',
   'America/Los_Angeles', 'a0000000-0000-0000-0000-000000000871');
insert into public.project_members (org_id, project_id, user_id, invite_email, role, status)
select 'b0000000-0000-0000-0000-000000000871', 'c0000000-0000-0000-0000-000000000871', u::uuid, e, r, 'active'
  from (values ('a0000000-0000-0000-0000-000000000872', 'probe+rd-pm@example.test', 'pm'),
               ('a0000000-0000-0000-0000-000000000873', 'probe+rd-si@example.test', 'special_inspector'),
               ('a0000000-0000-0000-0000-000000000874', 'probe+rd-ahj@example.test', 'ahj')) v(u, e, r);

set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000872');
insert into ids select 's_' || s.kind, s.folder_id from public.files_sections('c0000000-0000-0000-0000-000000000871') s;
reset role;
insert into ids select 'uploaded', fo.id from public.folders fo
 where fo.parent_id = pg_temp.rid('s_rfis') and fo.name = 'Uploaded';
insert into public.files (id, org_id, project_id, folder_id, storage_path, original_name, mime, created_by, scan_status, upload_complete)
select v.id::uuid, 'b0000000-0000-0000-0000-000000000871', 'c0000000-0000-0000-0000-000000000871', pg_temp.rid(v.folder),
       'test/docs/' || v.name, v.name, 'application/pdf', 'a0000000-0000-0000-0000-000000000872', 'clean', true
  from (values
    ('e0000000-0000-0000-0000-000000000871', 's_plans', 'A101 Sample Plan.pdf'),
    ('e0000000-0000-0000-0000-000000000872', 's_submittals', '092900_04.0_Sample Board_NET.pdf'),
    ('e0000000-0000-0000-0000-000000000873', 'uploaded', 'RFI 012 Sample response.pdf'),
    ('e0000000-0000-0000-0000-000000000874', 's_reports', 'Sample Daily Report 7.pdf')
  ) as v (id, folder, name);
insert into ids values
  ('plan', 'e0000000-0000-0000-0000-000000000871'), ('submittal', 'e0000000-0000-0000-0000-000000000872'),
  ('rfi_doc', 'e0000000-0000-0000-0000-000000000873'), ('report', 'e0000000-0000-0000-0000-000000000874');

set local role authenticated;
select is(pg_temp.files_of('a0000000-0000-0000-0000-000000000873'), '{plan,rfi_doc,submittal}'::text[],
  'special inspector: Plans, Submittals and RFI documents (no Reports)');
select is(pg_temp.kinds_of('a0000000-0000-0000-0000-000000000873'), '{plans,specs,submittals,rfis,ccd}'::text[],
  'special inspector: an RFIs section');
select is(pg_temp.files_of('a0000000-0000-0000-0000-000000000874'), '{plan,submittal}'::text[],
  'fire marshal: still no RFI documents');
select is(pg_temp.kinds_of('a0000000-0000-0000-0000-000000000874'), '{plans,specs,submittals,ccd}'::text[],
  'fire marshal: still no RFIs section');
reset role;

select is((select array_agg(role order by role) from public.role_permissions where capability = 'rfi.read_documents'),
  '{architect,estimator,foreman,inspector,inspector_admin,owner_rep,pe,pm,project_admin,special_inspector,sub,superintendent,viewer}'::text[],
  'matrix: rfi.read_documents is every Plans reader but the fire marshal');
select ok(exists (select 1 from public.folder_access where folder_id = pg_temp.rid('uploaded')
                   and capability = 'rfi.read_documents' and can_read and not can_write),
  'the Uploaded folder reads rfi.read_documents');
select ok(not has_function_privilege('authenticated', 'public.files_rfi_uploads_make(uuid, uuid)', 'EXECUTE'),
  'files_rfi_uploads_make stays internal');

select * from finish();
rollback;
