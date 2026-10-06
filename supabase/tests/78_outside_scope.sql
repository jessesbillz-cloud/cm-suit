begin;
select plan(59);
-- Migration 0090 (Jesse, Oct 5, 7:28 and 7:30 pm): outside people see only their part of the job.
--   * The fire marshal reads OFS requests sent to OFS and nothing else, on every path: rows, history, files, calendar,
--     board, comments, the permit's record. A person who filed an IOR request and now holds the fire marshal's role
--     (View as) no longer reads it.
--   * A request's files go with the request: the special inspection report attached to an OFS request reaches the fire
--     marshal once the request is sent to OFS, and not before. A folder shared with him (its access list) works too.
--   * Files: files.read_project reads the job's documents only (plans, specs ...). Photos, Reports, folders people make
--     and every author's daily photos need files.read_records, which the inside roles hold and the outside roles
--     (fire marshal, special inspector, sub, foreman) don't. Their own uploads stay theirs.
--   * my_calendar_kinds: no calendar type that is always empty for the person.
\ir _helpers.psql

create temp table ids (k text primary key, v uuid);
grant all on ids to public;
create function pg_temp.rid(p_k text) returns uuid language sql stable as $$ select v from ids where k = p_k $$;
create function pg_temp.d(p_days int) returns date language sql stable as $$
  select (now() at time zone 'America/Los_Angeles')::date + p_days $$;
create function pg_temp.ver(p_k text) returns int language sql stable security definer as $$
  select version from public.inspection_requests where id = (select v from ids where k = p_k) $$;
create function pg_temp.ask(p_kind text, p_items text, p_files uuid[] default '{}', p_ack boolean default false)
returns public.inspection_requests language sql volatile as $$
  select public.ir_submit('c0000000-0000-0000-0000-000000000781', 'Sample Firestop Co', pg_temp.d(3), p_kind, p_items, true,
    '08:00', 'timed', 60,
    case when p_kind = 'special' then (select id from public.ir_special_kinds where active order by sort, name limit 1) end,
    p_files, case when p_kind = 'ofs' then true end, p_ack) $$;
-- The files (by key) a person reads in the files table (logs them in).
create function pg_temp.files_of(p_uid uuid) returns text[] language plpgsql as $$
begin
  perform pg_temp.login(p_uid);
  return coalesce((select array_agg(i.k order by i.k collate "C") from public.files f join ids i on i.v = f.id), '{}'::text[]);
end $$;
-- The requests (by key) a person reads (logs them in).
create function pg_temp.requests_of(p_uid uuid) returns text[] language plpgsql as $$
begin
  perform pg_temp.login(p_uid);
  return coalesce((select array_agg(i.k order by i.k collate "C") from public.inspection_requests r join ids i on i.v = r.id), '{}'::text[]);
end $$;
grant execute on all functions in schema pg_temp to public;

select pg_temp.mk_user('a0000000-0000-0000-0000-000000000781', 'probe+os-admin@example.test', 'Ada Admin');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000782', 'probe+os-insp@example.test', 'Ivy Inspector');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000783', 'probe+os-ahj@example.test', 'Dana Deputy');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000784', 'probe+os-sub@example.test', 'Sam Sub');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000785', 'probe+os-si@example.test', 'Lee Lab');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000786', 'probe+os-fore@example.test', 'Fay Foreman');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000787', 'probe+os-owner@example.test', 'Olive Owner');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000788', 'probe+os-arch@example.test', 'Art Architect');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000789', 'probe+os-tester@example.test', 'Tess Tester');

insert into public.orgs (id, name, kind, created_by) values
  ('b0000000-0000-0000-0000-000000000781', 'Sample Scope Builders', 'gc', 'a0000000-0000-0000-0000-000000000781');
insert into public.projects (id, org_id, name, stage, timezone, created_by, settings) values
  ('c0000000-0000-0000-0000-000000000781', 'b0000000-0000-0000-0000-000000000781', 'Sample Scope Job', 'construction',
   'America/Los_Angeles', 'a0000000-0000-0000-0000-000000000781', '{"ir_ofs_allowed": true}');
insert into public.project_members (org_id, project_id, user_id, invite_email, role, status)
select 'b0000000-0000-0000-0000-000000000781', 'c0000000-0000-0000-0000-000000000781', u::uuid, e, r, 'active'
  from (values
    ('a0000000-0000-0000-0000-000000000782', 'probe+os-insp@example.test', 'inspector'),
    ('a0000000-0000-0000-0000-000000000783', 'probe+os-ahj@example.test', 'ahj'),
    ('a0000000-0000-0000-0000-000000000784', 'probe+os-sub@example.test', 'sub'),
    ('a0000000-0000-0000-0000-000000000785', 'probe+os-si@example.test', 'special_inspector'),
    ('a0000000-0000-0000-0000-000000000786', 'probe+os-fore@example.test', 'foreman'),
    ('a0000000-0000-0000-0000-000000000787', 'probe+os-owner@example.test', 'owner_rep'),
    ('a0000000-0000-0000-0000-000000000788', 'probe+os-arch@example.test', 'architect'),
    ('a0000000-0000-0000-0000-000000000789', 'probe+os-tester@example.test', 'inspector')) v(u, e, r);

-- ---------------------------------------------------------------------------------------------------------------------
-- The matrix
-- ---------------------------------------------------------------------------------------------------------------------
select is((select array_agg(role order by role) from public.role_permissions where capability = 'files.read_records'),
  '{architect,estimator,inspector,inspector_admin,owner_rep,pe,pm,project_admin,superintendent,viewer}'::text[],
  'matrix: files.read_records is the inside roles''');
select is((select array_agg(role order by role) from public.role_permissions
            where capability = 'files.read_project'
              and role not in (select role from public.role_permissions where capability = 'files.read_records')),
  '{ahj,foreman,special_inspector,sub}'::text[], 'matrix: the outside roles read the job''s documents only');

-- ---------------------------------------------------------------------------------------------------------------------
-- The job's folders and files
-- ---------------------------------------------------------------------------------------------------------------------
insert into ids
select 'f_' || kind, id from public.folders
 where project_id = 'c0000000-0000-0000-0000-000000000781' and parent_id is null and kind in ('plans', 'photos', 'reports');
insert into ids values ('attach', public.ir_folder_make('c0000000-0000-0000-0000-000000000781', 'attachments')),
                       ('dailyphotos', public.daily_author_folder('c0000000-0000-0000-0000-000000000781',
                                                                  'a0000000-0000-0000-0000-000000000782', 'photos'));
insert into public.folders (id, org_id, project_id, parent_id, name, kind, created_by) values
  ('d0000000-0000-0000-0000-000000000781', 'b0000000-0000-0000-0000-000000000781', 'c0000000-0000-0000-0000-000000000781',
   pg_temp.rid('f_plans'), 'Level 01', 'general', 'a0000000-0000-0000-0000-000000000781'),
  ('d0000000-0000-0000-0000-000000000782', 'b0000000-0000-0000-0000-000000000781', 'c0000000-0000-0000-0000-000000000781',
   null, 'Sample Misc', 'general', 'a0000000-0000-0000-0000-000000000781'),
  ('d0000000-0000-0000-0000-000000000783', 'b0000000-0000-0000-0000-000000000781', 'c0000000-0000-0000-0000-000000000781',
   null, 'Sample SI reports for OFS', 'general', 'a0000000-0000-0000-0000-000000000781');
-- The shared folder: the inside roles and the fire marshal read it (its access list names them).
insert into public.folder_access (folder_id, capability, can_read, can_write) values
  ('d0000000-0000-0000-0000-000000000783', 'files.read_records', true, false),
  ('d0000000-0000-0000-0000-000000000783', 'ir.ofs_view', true, false);
insert into ids values ('level', 'd0000000-0000-0000-0000-000000000781'), ('misc', 'd0000000-0000-0000-0000-000000000782'),
                       ('shared', 'd0000000-0000-0000-0000-000000000783');
insert into public.files (id, org_id, project_id, folder_id, storage_path, original_name, mime, created_by, scan_status, upload_complete)
select v.id::uuid, 'b0000000-0000-0000-0000-000000000781', 'c0000000-0000-0000-0000-000000000781', pg_temp.rid(v.folder),
       'test/scope/' || v.name, v.name, v.mime, v.by::uuid, 'clean', true
  from (values
    ('e0000000-0000-0000-0000-000000000781', 'f_plans', 'A101.pdf', 'application/pdf', 'a0000000-0000-0000-0000-000000000781'),
    ('e0000000-0000-0000-0000-000000000782', 'level', 'A201.pdf', 'application/pdf', 'a0000000-0000-0000-0000-000000000781'),
    ('e0000000-0000-0000-0000-000000000783', 'f_photos', 'site.jpg', 'image/jpeg', 'a0000000-0000-0000-0000-000000000781'),
    ('e0000000-0000-0000-0000-000000000784', 'f_reports', 'SI report 12.pdf', 'application/pdf', 'a0000000-0000-0000-0000-000000000781'),
    ('e0000000-0000-0000-0000-000000000785', 'misc', 'notes.pdf', 'application/pdf', 'a0000000-0000-0000-0000-000000000781'),
    ('e0000000-0000-0000-0000-000000000786', 'dailyphotos', 'daily.jpg', 'image/jpeg', 'a0000000-0000-0000-0000-000000000782'),
    ('e0000000-0000-0000-0000-000000000787', 'shared', 'SI report 13.pdf', 'application/pdf', 'a0000000-0000-0000-0000-000000000781'),
    ('e0000000-0000-0000-0000-000000000788', 'attach', 'ior.jpg', 'image/jpeg', 'a0000000-0000-0000-0000-000000000782'),
    ('e0000000-0000-0000-0000-000000000789', 'attach', 'special.jpg', 'image/jpeg', 'a0000000-0000-0000-0000-000000000782'),
    ('e0000000-0000-0000-0000-000000000790', 'attach', 'ofs-si.pdf', 'application/pdf', 'a0000000-0000-0000-0000-000000000782'),
    ('e0000000-0000-0000-0000-000000000791', 'attach', 'sub-si.pdf', 'application/pdf', 'a0000000-0000-0000-0000-000000000784'),
    ('e0000000-0000-0000-0000-000000000792', 'f_photos', 'sub-own.jpg', 'image/jpeg', 'a0000000-0000-0000-0000-000000000784')
  ) as v (id, folder, name, mime, by);
insert into ids values
  ('plan', 'e0000000-0000-0000-0000-000000000781'), ('sheet', 'e0000000-0000-0000-0000-000000000782'),
  ('photo', 'e0000000-0000-0000-0000-000000000783'), ('si_report', 'e0000000-0000-0000-0000-000000000784'),
  ('misc_file', 'e0000000-0000-0000-0000-000000000785'), ('daily_photo', 'e0000000-0000-0000-0000-000000000786'),
  ('shared_si', 'e0000000-0000-0000-0000-000000000787'), ('ior_photo', 'e0000000-0000-0000-0000-000000000788'),
  ('special_photo', 'e0000000-0000-0000-0000-000000000789'), ('ofs_si', 'e0000000-0000-0000-0000-000000000790'),
  ('sub_si', 'e0000000-0000-0000-0000-000000000791'), ('sub_own', 'e0000000-0000-0000-0000-000000000792');

-- The requests: the inspector's IOR, special and OFS (his own goes straight to OFS), the sub's OFS (at the GC), and the
-- tester's IOR (filed as the inspector).
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000782');
insert into ids select 'r_ior', (pg_temp.ask('ior', 'North wall framing', array['e0000000-0000-0000-0000-000000000788'::uuid])).id;
insert into ids select 'r_special', (pg_temp.ask('special', 'Epoxy anchors', array['e0000000-0000-0000-0000-000000000789'::uuid])).id;
insert into ids select 'r_ofs', (pg_temp.ask('ofs', 'Damper test', array['e0000000-0000-0000-0000-000000000790'::uuid], true)).id;
select pg_temp.login('a0000000-0000-0000-0000-000000000784');
insert into ids select 'r_sub_ofs', (pg_temp.ask('ofs', 'Sprinkler hydro', array['e0000000-0000-0000-0000-000000000791'::uuid])).id;
select pg_temp.login('a0000000-0000-0000-0000-000000000789');
insert into ids select 'r_tester', (pg_temp.ask('ior', 'Tester''s own request')).id;
reset role;

-- ---------------------------------------------------------------------------------------------------------------------
-- Requests: the fire marshal reads the OFS bucket only
-- ---------------------------------------------------------------------------------------------------------------------
set local role authenticated;
select is(pg_temp.requests_of('a0000000-0000-0000-0000-000000000783'), '{r_ofs}'::text[],
  'fire marshal: the OFS request sent to OFS, not the IOR, not the special, not the OFS request still at the GC');
select is((select count(*)::int from public.ir_events e where e.request_id in (pg_temp.rid('r_ior'), pg_temp.rid('r_special'))), 0,
  'fire marshal: no history of the IOR or special request');
select is((select array_agg(kind order by kind) from public.calendar_inspections('c0000000-0000-0000-0000-000000000781', pg_temp.d(0), pg_temp.d(7))),
  '{ofs}'::text[], 'fire marshal: the calendar shows his OFS inspection only');
select is((select count(*)::int from public.activity a where a.entity_id in (pg_temp.rid('r_ior'), pg_temp.rid('r_special'), pg_temp.rid('r_sub_ofs'))), 0,
  'fire marshal: no board line about the others');
select ok(not public.comment_target_readable('c0000000-0000-0000-0000-000000000781', 'inspection_request', pg_temp.rid('r_special')),
  'fire marshal: no comments on the special request');
select ok(public.comment_target_readable('c0000000-0000-0000-0000-000000000781', 'inspection_request', pg_temp.rid('r_ofs')),
  'fire marshal: comments on his OFS request');
select throws_ok($$ select * from public.authorize_ir_file(pg_temp.rid('r_special'), 'e0000000-0000-0000-0000-000000000789') $$,
  'P0002', null, 'fire marshal: the special request''s photo, through the request: not found');
select is((select original_name from public.authorize_ir_file(pg_temp.rid('r_ofs'), 'e0000000-0000-0000-0000-000000000790')),
  'ofs-si.pdf', 'fire marshal: the SI report attached to his OFS request, through the request');

select is(pg_temp.requests_of('a0000000-0000-0000-0000-000000000787'),
  '{r_ior,r_ofs,r_special,r_sub_ofs,r_tester}'::text[], 'owner''s rep (inside): every request');
select is(pg_temp.requests_of('a0000000-0000-0000-0000-000000000784'), '{r_sub_ofs}'::text[], 'sub: its own request only');
select is(pg_temp.requests_of('a0000000-0000-0000-0000-000000000785'), '{}'::text[], 'special inspector: none');

-- View as: the tester filed an IOR request as the inspector, then takes the fire marshal's role.
reset role;
update public.project_members set role = 'ahj' where user_id = 'a0000000-0000-0000-0000-000000000789';
set local role authenticated;
select is(pg_temp.requests_of('a0000000-0000-0000-0000-000000000789'), '{r_ofs}'::text[],
  'viewing as the fire marshal: the IOR request I filed is gone, the OFS one is there');
reset role;
update public.project_members set role = 'inspector' where user_id = 'a0000000-0000-0000-0000-000000000789';
set local role authenticated;
select is(pg_temp.requests_of('a0000000-0000-0000-0000-000000000789'), '{r_ior,r_ofs,r_special,r_sub_ofs,r_tester}'::text[],
  'back to my own role: everything again');

-- ---------------------------------------------------------------------------------------------------------------------
-- Files: documents for everyone who reads files, records with their record, working folders for the inside roles
-- ---------------------------------------------------------------------------------------------------------------------
select is(pg_temp.files_of('a0000000-0000-0000-0000-000000000783'), '{ofs_si,plan,shared_si,sheet}'::text[],
  'fire marshal: plans (and a plan subfolder), the SI report on his OFS request, the folder shared with him. No photos, reports, request files or daily photos');
select is(pg_temp.files_of('a0000000-0000-0000-0000-000000000784'), '{plan,sheet,sub_own,sub_si}'::text[],
  'sub: plans and its own uploads only. No one else''s photos');
select is(pg_temp.files_of('a0000000-0000-0000-0000-000000000785'), '{plan,sheet}'::text[], 'special inspector: plans only');
select is(pg_temp.files_of('a0000000-0000-0000-0000-000000000786'), '{plan,sheet}'::text[], 'foreman: plans only');
select is(pg_temp.files_of('a0000000-0000-0000-0000-000000000787'),
  '{daily_photo,ior_photo,misc_file,ofs_si,photo,plan,shared_si,sheet,si_report,special_photo,sub_own,sub_si}'::text[],
  'owner''s rep (inside): every file, as before');
select is(pg_temp.files_of('a0000000-0000-0000-0000-000000000788'),
  '{daily_photo,misc_file,photo,plan,shared_si,sheet,si_report,sub_own}'::text[],
  'architect (inside): the job''s folders and daily photos, not the request files (no inspection rights)');

select pg_temp.login('a0000000-0000-0000-0000-000000000783');
select is((select array_agg(name order by name collate "C") from public.folders where project_id = 'c0000000-0000-0000-0000-000000000781'),
  array['Level 01', 'Plans', 'Sample SI reports for OFS', 'Specs'], 'fire marshal: the folders he can browse (the documents and the one shared with him)');
select throws_ok($$ select * from public.authorize_download('e0000000-0000-0000-0000-000000000783') $$, '42501', null,
  'fire marshal: no download of a site photo');
select throws_ok($$ select * from public.authorize_download('e0000000-0000-0000-0000-000000000786') $$, '42501', null,
  'fire marshal: no download of a daily photo');
select throws_ok($$ select * from public.authorize_download('e0000000-0000-0000-0000-000000000784') $$, '42501', null,
  'fire marshal: no download of an SI report nobody shared');
select throws_ok($$ select * from public.authorize_preview('e0000000-0000-0000-0000-000000000783') $$, '42501', null,
  'fire marshal: no preview of a site photo');
select is((select original_name from public.authorize_download('e0000000-0000-0000-0000-000000000781')), 'A101.pdf',
  'fire marshal: downloads a plan');
select is((select original_name from public.authorize_download('e0000000-0000-0000-0000-000000000787')), 'SI report 13.pdf',
  'fire marshal: downloads the SI report in the folder shared with him');
select ok(not public.comment_target_readable('c0000000-0000-0000-0000-000000000781', 'file', 'e0000000-0000-0000-0000-000000000783'),
  'fire marshal: no comments on a site photo');
select is((select count(*)::int from public.file_pages where file_id = 'e0000000-0000-0000-0000-000000000784'), 0,
  'fire marshal: no pages of an unshared SI report');
select throws_ok($$ insert into public.share_links (org_id, project_id, target_type, target_id, recipient_email, created_by)
                    values ('b0000000-0000-0000-0000-000000000781', 'c0000000-0000-0000-0000-000000000781', 'file',
                            'e0000000-0000-0000-0000-000000000783', 'someone@example.test', 'a0000000-0000-0000-0000-000000000783') $$,
  '42501', null, 'fire marshal: can''t share a photo he can''t see');
select ok(not public.folder_can_read(pg_temp.rid('attach')), 'fire marshal: doesn''t browse the request folder');
select ok(not public.folder_can_read(pg_temp.rid('dailyphotos')), 'fire marshal: doesn''t browse the inspector''s daily photos');

select pg_temp.login('a0000000-0000-0000-0000-000000000784');
select throws_ok($$ select * from public.authorize_download('e0000000-0000-0000-0000-000000000783') $$, '42501', null,
  'sub: no download of the GC''s site photo');
select is((select original_name from public.authorize_download('e0000000-0000-0000-0000-000000000792')), 'sub-own.jpg',
  'sub: downloads its own photo');
select ok(not public.folder_can_read(pg_temp.rid('f_photos')), 'sub: doesn''t browse Photos');
select ok(not public.folder_can_read(pg_temp.rid('misc')), 'sub: nor a folder people made');
select ok(public.folder_can_read(pg_temp.rid('level')), 'sub: browses a plan subfolder');
select pg_temp.login('a0000000-0000-0000-0000-000000000787');
select ok(public.folder_can_read(pg_temp.rid('f_photos')) and public.folder_can_read(pg_temp.rid('dailyphotos'))
          and public.folder_can_read(pg_temp.rid('misc')) and public.folder_can_read(pg_temp.rid('f_reports')),
  'owner''s rep: Photos, daily photos, folders people made, Reports');

-- ---------------------------------------------------------------------------------------------------------------------
-- The SI report on the sub's OFS request reaches the fire marshal once it is sent to OFS
-- ---------------------------------------------------------------------------------------------------------------------
select pg_temp.login('a0000000-0000-0000-0000-000000000783');
select ok(not ('sub_si' = any (pg_temp.files_of('a0000000-0000-0000-0000-000000000783'))),
  'at the GC: the fire marshal doesn''t see the SI report on it');
select throws_ok($$ select * from public.authorize_ir_file(pg_temp.rid('r_sub_ofs'), 'e0000000-0000-0000-0000-000000000791') $$,
  'P0002', null, '... nor through the request');
select pg_temp.login('a0000000-0000-0000-0000-000000000781');
select is((public.ir_gc_decide(pg_temp.rid('r_sub_ofs'), pg_temp.ver('r_sub_ofs'), true)).status, 'pending', 'the GC confirms');
select pg_temp.login('a0000000-0000-0000-0000-000000000783');
select ok(not ('sub_si' = any (pg_temp.files_of('a0000000-0000-0000-0000-000000000783'))),
  'with the inspector: still not');
select pg_temp.login('a0000000-0000-0000-0000-000000000782');
select ok((public.ir_send_ofs(pg_temp.rid('r_sub_ofs'), pg_temp.ver('r_sub_ofs'))).ofs_sent_at is not null, 'the inspector sends it to OFS');
select ok('sub_si' = any (pg_temp.files_of('a0000000-0000-0000-0000-000000000783')),
  'sent to OFS: the fire marshal sees the SI report on it');
select is((select original_name from public.authorize_ir_file(pg_temp.rid('r_sub_ofs'), 'e0000000-0000-0000-0000-000000000791')),
  'sub-si.pdf', '... and opens it through the request');
select is(pg_temp.requests_of('a0000000-0000-0000-0000-000000000783'), '{r_ofs,r_sub_ofs}'::text[],
  'fire marshal: both OFS requests now, still no IOR or special');

-- ---------------------------------------------------------------------------------------------------------------------
-- The calendar's types
-- ---------------------------------------------------------------------------------------------------------------------
select pg_temp.login('a0000000-0000-0000-0000-000000000783');
select is((select kinds from public.my_calendar_kinds('c0000000-0000-0000-0000-000000000781')),
  '{inspections,meetings,pours,milestones,lookahead}'::text[],
  'fire marshal: no special inspections, deliveries or due items');
select pg_temp.login('a0000000-0000-0000-0000-000000000782');
select is((select kinds from public.my_calendar_kinds('c0000000-0000-0000-0000-000000000781')),
  '{inspections,special_inspections,deliveries,meetings,pours,milestones,lookahead,my_due}'::text[], 'inspector: every type');
select pg_temp.login('a0000000-0000-0000-0000-000000000784');
select is((select kinds from public.my_calendar_kinds()), '{inspections,special_inspections,deliveries,meetings,pours,milestones,lookahead}'::text[],
  'sub (all my jobs): no due items');
select pg_temp.login('a0000000-0000-0000-0000-000000000788');
select is((select kinds from public.my_calendar_kinds('c0000000-0000-0000-0000-000000000781')),
  '{deliveries,meetings,pours,milestones,lookahead,my_due}'::text[], 'architect: no inspections');
select pg_temp.login('a0000000-0000-0000-0000-000000000798');
select is((select count(*)::int from public.my_calendar_kinds()), 0, 'not on the job: nothing');

-- ---------------------------------------------------------------------------------------------------------------------
-- New daily photos folders name files.read_records, and no folder access list names files.read_project
-- ---------------------------------------------------------------------------------------------------------------------
reset role;
select is((select array_agg(capability order by capability) from public.folder_access where folder_id = pg_temp.rid('dailyphotos') and capability is not null),
  '{dailies.read_all,files.manage,files.read_records}'::text[], 'a daily photos folder: the inside roles, not every file reader');
select is((select count(*)::int from public.folder_access where capability = 'files.read_project'), 0,
  'no access list names files.read_project');

-- ---------------------------------------------------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------------------------------------------------
select ok(not has_function_privilege('anon', 'public.my_calendar_kinds(uuid)', 'execute'), 'anon: no my_calendar_kinds');
select ok(not has_function_privilege('anon', 'public.file_on_visible_request(uuid, uuid)', 'execute'), 'anon: no file_on_visible_request');
select ok(not has_function_privilege('anon', 'public.folder_is_document(uuid)', 'execute'), 'anon: no folder_is_document');
select ok(has_function_privilege('authenticated', 'public.my_calendar_kinds(uuid)', 'execute'), 'members: my_calendar_kinds');
set local role anon;
select pg_temp.login(null);
select throws_ok($$ select count(*) from public.files $$, '42501', null, 'anon: no files');
reset role;

select * from finish();
rollback;
