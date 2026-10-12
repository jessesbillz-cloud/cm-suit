begin;
select plan(33);
-- Migration 0099 (Jesse, Oct 11 and 12): "the entirety of the work product and everything associated with the
-- administrative portion of construction should be available". Every role that reads Plans and Specs reads Submittals:
-- the sub, the architect, the viewer and the fire marshal. The RFI documents uploaded in Files: the inside roles, the sub
-- and the architect, never the fire marshal ("the fire marshal does not see every RFI"). Someone not on the job reads
-- nothing. The RFI tool's own folder keeps its list (a draft's photos stay with the draft), and the fire marshal reads
-- no Reports or Photos. Writing is unchanged.
\ir _helpers.psql

create temp table ids (k text primary key, v uuid);
grant all on ids to public;
create function pg_temp.rid(p_k text) returns uuid language sql stable as $$ select v from ids where k = p_k $$;
-- The files (by key) a person reads in the files table (logs them in).
create function pg_temp.files_of(p_uid uuid) returns text[] language plpgsql as $$
begin
  perform pg_temp.login(p_uid);
  return coalesce((select array_agg(i.k order by i.k collate "C") from public.files f join ids i on i.v = f.id), '{}'::text[]);
end $$;
-- The sections a person gets, in order (logs them in).
create function pg_temp.kinds_of(p_uid uuid) returns text[] language plpgsql as $$
begin
  perform pg_temp.login(p_uid);
  return (select array_agg(s.kind) from public.files_sections('c0000000-0000-0000-0000-000000000861') s);
end $$;
create function pg_temp.sec_of(p_uid uuid, p_kind text) returns uuid language plpgsql as $$
begin
  perform pg_temp.login(p_uid);
  return (select s.folder_id from public.files_sections('c0000000-0000-0000-0000-000000000861') s where s.kind = p_kind);
end $$;
create function pg_temp.access_of(p_folder uuid) returns text[] language sql stable security definer as $$
  select array_agg(capability || ':' || can_read::text || ':' || can_write::text order by capability)
    from public.folder_access where folder_id = p_folder $$;
create function pg_temp.uploaded_count() returns int language sql stable security definer as $$
  select count(*)::int from public.folders fo join public.folders r on r.id = fo.parent_id
   where r.project_id = 'c0000000-0000-0000-0000-000000000861' and r.kind = 'rfis' and fo.name = 'Uploaded' $$;
grant execute on all functions in schema pg_temp to public;

select pg_temp.mk_user('a0000000-0000-0000-0000-000000000861', 'probe+fa-admin@example.test', 'Ada Admin');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000862', 'probe+fa-pm@example.test', 'Pia PM');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000863', 'probe+fa-sub@example.test', 'Sam Sub');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000864', 'probe+fa-arch@example.test', 'Art Architect');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000865', 'probe+fa-viewer@example.test', 'Vic Viewer');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000866', 'probe+fa-ahj@example.test', 'Dana Deputy');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000867', 'probe+fa-out@example.test', 'Otto Outsider');

insert into public.orgs (id, name, kind, created_by) values
  ('b0000000-0000-0000-0000-000000000861', 'Sample Access Builders', 'gc', 'a0000000-0000-0000-0000-000000000861');
insert into public.projects (id, org_id, name, stage, timezone, created_by) values
  ('c0000000-0000-0000-0000-000000000861', 'b0000000-0000-0000-0000-000000000861', 'Sample Access Job', 'construction',
   'America/Los_Angeles', 'a0000000-0000-0000-0000-000000000861');
insert into public.project_members (org_id, project_id, user_id, invite_email, role, status)
select 'b0000000-0000-0000-0000-000000000861', 'c0000000-0000-0000-0000-000000000861', u::uuid, e, r, 'active'
  from (values ('a0000000-0000-0000-0000-000000000862', 'probe+fa-pm@example.test', 'pm'),
               ('a0000000-0000-0000-0000-000000000863', 'probe+fa-sub@example.test', 'sub'),
               ('a0000000-0000-0000-0000-000000000864', 'probe+fa-arch@example.test', 'architect'),
               ('a0000000-0000-0000-0000-000000000865', 'probe+fa-viewer@example.test', 'viewer'),
               ('a0000000-0000-0000-0000-000000000866', 'probe+fa-ahj@example.test', 'ahj')) v(u, e, r);

select ok(public.folder_kind_is_document('submittals') and public.folder_kind_is_document('plans')
          and public.folder_kind_is_document('ccd') and not public.folder_kind_is_document('reports')
          and not public.folder_kind_is_document('rfis') and not public.folder_kind_is_document('photos'),
  'Submittals are one of the job''s documents, Reports, Photos and the RFI tool''s folder are not');
select ok(not has_function_privilege('authenticated', 'public.files_rfi_uploads_make(uuid, uuid)', 'EXECUTE')
          and not has_function_privilege('anon', 'public.folder_kind_is_document(text)', 'EXECUTE'),
  'the helpers: internal, and nothing for anon');

-- The PM opens Files: the sections and RFIs' Uploaded folder are made.
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000862');
insert into ids select 's_' || s.kind, s.folder_id from public.files_sections('c0000000-0000-0000-0000-000000000861') s;
reset role;
insert into ids select 'uploaded', fo.id from public.folders fo
 where fo.parent_id = pg_temp.rid('s_rfis') and fo.name = 'Uploaded';
insert into public.folders (id, org_id, project_id, parent_id, name, created_by) values
  ('d0000000-0000-0000-0000-000000000861', 'b0000000-0000-0000-0000-000000000861', 'c0000000-0000-0000-0000-000000000861',
   pg_temp.rid('s_submittals'), '092000 - Framing - Sample Drywall Co', 'a0000000-0000-0000-0000-000000000862');
insert into ids values ('trade', 'd0000000-0000-0000-0000-000000000861');
insert into public.files (id, org_id, project_id, folder_id, storage_path, original_name, mime, created_by, scan_status, upload_complete)
select v.id::uuid, 'b0000000-0000-0000-0000-000000000861', 'c0000000-0000-0000-0000-000000000861', pg_temp.rid(v.folder),
       'test/access/' || v.name, v.name, 'application/pdf', 'a0000000-0000-0000-0000-000000000862', 'clean', true
  from (values
    ('e0000000-0000-0000-0000-000000000861', 's_plans', 'A101 Sample Site Plan.pdf'),
    ('e0000000-0000-0000-0000-000000000862', 'trade', '092900_04.0_Sample Board_PD_NET.pdf'),
    ('e0000000-0000-0000-0000-000000000863', 's_submittals', 'S-0147.0-079200-Sample Sealants-AAN.pdf'),
    ('e0000000-0000-0000-0000-000000000864', 'uploaded', 'RFI 012 Sample response.pdf'),
    ('e0000000-0000-0000-0000-000000000865', 's_rfis', 'Sample draft photo.pdf'),
    ('e0000000-0000-0000-0000-000000000866', 's_reports', 'Sample Daily Report 7.pdf'),
    ('e0000000-0000-0000-0000-000000000867', 's_photos', 'Sample site photo.pdf'),
    ('e0000000-0000-0000-0000-000000000868', 's_ccd', 'Sample CCD 3.pdf')
  ) as v (id, folder, name);
insert into ids values
  ('plan', 'e0000000-0000-0000-0000-000000000861'), ('submittal', 'e0000000-0000-0000-0000-000000000862'),
  ('submittal_top', 'e0000000-0000-0000-0000-000000000863'), ('rfi_doc', 'e0000000-0000-0000-0000-000000000864'),
  ('rfi_tool', 'e0000000-0000-0000-0000-000000000865'), ('report', 'e0000000-0000-0000-0000-000000000866'),
  ('photo', 'e0000000-0000-0000-0000-000000000867'), ('ccd', 'e0000000-0000-0000-0000-000000000868');

-- ---------------------------------------------------------------------------------------------------------------------
-- RFIs' Uploaded folder
-- ---------------------------------------------------------------------------------------------------------------------
select is(pg_temp.uploaded_count(), 1, 'RFIs has an Uploaded folder');
select is(pg_temp.access_of(pg_temp.rid('uploaded')),
  '{files.manage:true:true,files.read_records:true:false,files.write_project:true:true,rfi.answer:true:false,rfi.create_draft:true:false}'::text[],
  'its list: the inside roles and the RFI writers and answerers read it, files writers add to it');
select is(pg_temp.access_of(pg_temp.rid('s_rfis')),
  '{rfi.answer:false:true,rfi.create_draft:false:true,rfi.sign_issue:true:false}'::text[],
  'the RFI tool''s own folder keeps its list');
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000862');
select ok((select folder_ids @> array[pg_temp.rid('s_rfis'), pg_temp.rid('uploaded')]
             from public.files_sections('c0000000-0000-0000-0000-000000000861') where kind = 'rfis'),
  'PM: RFIs holds the tool''s folder and Uploaded');
select is(pg_temp.uploaded_count(), 1, 'asked again: no second Uploaded folder');
select ok(pg_temp.can_write_as('a0000000-0000-0000-0000-000000000862', pg_temp.rid('uploaded')), 'PM adds to Uploaded');
select ok(not pg_temp.can_write_as('a0000000-0000-0000-0000-000000000863', pg_temp.rid('uploaded'))
          and not pg_temp.can_write_as('a0000000-0000-0000-0000-000000000866', pg_temp.rid('uploaded')),
  'the sub and the fire marshal don''t add to it');

-- ---------------------------------------------------------------------------------------------------------------------
-- Who reads what
-- ---------------------------------------------------------------------------------------------------------------------
select is(pg_temp.files_of('a0000000-0000-0000-0000-000000000862'),
  '{ccd,photo,plan,report,rfi_doc,rfi_tool,submittal,submittal_top}'::text[], 'PM: everything');
select is(pg_temp.files_of('a0000000-0000-0000-0000-000000000863'),
  '{ccd,plan,rfi_doc,submittal,submittal_top}'::text[], 'sub: Plans, Submittals, CCDs and RFI documents, as Plans');
select is(pg_temp.files_of('a0000000-0000-0000-0000-000000000864'),
  '{ccd,photo,plan,report,rfi_doc,submittal,submittal_top}'::text[], 'architect: Submittals and RFI documents too');
select is(pg_temp.files_of('a0000000-0000-0000-0000-000000000865'),
  '{ccd,photo,plan,report,rfi_doc,submittal,submittal_top}'::text[], 'viewer: the same as Plans');
select is(pg_temp.files_of('a0000000-0000-0000-0000-000000000866'),
  '{ccd,plan,submittal,submittal_top}'::text[], 'fire marshal: Plans, Submittals, CCDs, no RFI documents, Reports or Photos');
select is(pg_temp.files_of('a0000000-0000-0000-0000-000000000867'), '{}'::text[], 'someone not on the job: nothing');

select ok(pg_temp.can_read_as('a0000000-0000-0000-0000-000000000863', pg_temp.rid('trade'))
          and pg_temp.can_read_as('a0000000-0000-0000-0000-000000000864', pg_temp.rid('trade')),
  'a trade folder in Submittals: the sub and the architect read it');
select ok(not pg_temp.can_read_as('a0000000-0000-0000-0000-000000000867', pg_temp.rid('s_submittals')),
  'Submittals: not someone not on the job');
select ok(not pg_temp.can_write_as('a0000000-0000-0000-0000-000000000863', pg_temp.rid('s_submittals'))
          and not pg_temp.can_write_as('a0000000-0000-0000-0000-000000000866', pg_temp.rid('s_submittals')),
  'reading is not writing: the sub and the fire marshal don''t add to Submittals');
select ok(not pg_temp.can_read_as('a0000000-0000-0000-0000-000000000863', pg_temp.rid('s_rfis'))
          and not pg_temp.can_read_as('a0000000-0000-0000-0000-000000000866', pg_temp.rid('s_rfis'))
          and not pg_temp.can_read_as('a0000000-0000-0000-0000-000000000864', pg_temp.rid('s_rfis')),
  'the RFI tool''s own folder: still not the sub, the fire marshal or the architect');
select ok(not pg_temp.can_read_as('a0000000-0000-0000-0000-000000000866', pg_temp.rid('s_reports'))
          and not pg_temp.can_read_as('a0000000-0000-0000-0000-000000000866', pg_temp.rid('s_photos')),
  'fire marshal: Reports and Photos stay closed');

-- ---------------------------------------------------------------------------------------------------------------------
-- The sections each person gets
-- ---------------------------------------------------------------------------------------------------------------------
select is(pg_temp.kinds_of('a0000000-0000-0000-0000-000000000863'), '{plans,specs,submittals,rfis,ccd}'::text[],
  'sub: Plans, Specs, Submittals, RFIs and CCDs');
select is(pg_temp.kinds_of('a0000000-0000-0000-0000-000000000866'), '{plans,specs,submittals,ccd}'::text[],
  'fire marshal: no RFIs section');
select ok(not pg_temp.can_read_as('a0000000-0000-0000-0000-000000000866', pg_temp.rid('uploaded')),
  'fire marshal: an uploaded RFI document''s folder stays closed');
select ok(pg_temp.can_read_as('a0000000-0000-0000-0000-000000000863', pg_temp.rid('uploaded'))
          and pg_temp.can_read_as('a0000000-0000-0000-0000-000000000864', pg_temp.rid('uploaded'))
          and pg_temp.can_read_as('a0000000-0000-0000-0000-000000000865', pg_temp.rid('uploaded')),
  'the sub, the architect and the viewer read it');
select is(pg_temp.sec_of('a0000000-0000-0000-0000-000000000863', 'rfis'), pg_temp.rid('uploaded'),
  'sub: RFIs is its Uploaded folder');
select is(pg_temp.sec_of('a0000000-0000-0000-0000-000000000862', 'rfis'), pg_temp.rid('s_rfis'),
  'PM: RFIs is the tool''s folder');
select ok(pg_temp.kinds_of('a0000000-0000-0000-0000-000000000864') @> '{submittals,rfis}'::text[],
  'architect: Submittals and RFIs');
select is((select folder_ids from public.files_sections('c0000000-0000-0000-0000-000000000861') where kind = 'rfis'),
  array[pg_temp.rid('uploaded')], 'architect: RFIs holds only the Uploaded folder');
select is((select file_count from public.files_sections('c0000000-0000-0000-0000-000000000861') where kind = 'rfis'), 1,
  'and counts only its file');
select throws_ok($$ select pg_temp.kinds_of('a0000000-0000-0000-0000-000000000867') $$, 'P0002', 'not_found',
  'someone not on the job: no sections');

-- The fire marshal's requests are as 0090 left them: the matrix gives him the OFS pair, no other request right.
select ok(pg_temp.cap_as('a0000000-0000-0000-0000-000000000866', 'c0000000-0000-0000-0000-000000000861', 'ir.ofs_decide')
          and not pg_temp.cap_as('a0000000-0000-0000-0000-000000000866', 'c0000000-0000-0000-0000-000000000861', 'ir.view_all')
          and not pg_temp.cap_as('a0000000-0000-0000-0000-000000000866', 'c0000000-0000-0000-0000-000000000861', 'files.read_records'),
  'fire marshal: ir.ofs_decide, no ir.view_all, no files.read_records');
reset role;

select is((select array_agg(role order by role) from public.role_permissions where capability = 'files.read_project'),
  '{ahj,architect,estimator,foreman,inspector,inspector_admin,owner_rep,pe,pm,project_admin,special_inspector,sub,superintendent,viewer}'::text[],
  'matrix: files.read_project unchanged');
select is((select array_agg(role order by role) from public.role_permissions where capability = 'ir.ofs_decide'),
  '{ahj}'::text[], 'matrix: ir.ofs_decide (approved or not, never stamp codes) unchanged');

select * from finish();
rollback;
