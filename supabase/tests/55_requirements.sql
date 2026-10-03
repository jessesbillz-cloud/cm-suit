begin;
select plan(105);
-- Requirements (migration 0063): the matrix and the rail as data, the module, deny by default, add and change by hand
-- (due date from the trigger, the save key, version checks, the shapes), who reads what (drafts to managers only), the
-- AI's drafts (skipped when the job has them, dropped ones too), Keep and Drop with Undo, the one-tap status, the
-- evidence and the Requirements folder, the spec book's sections from the page text, and the reminder each morning
-- (due within 7 days or past, the job's clock, once per due date, a board line and tasks, done when the status moves).
\ir _helpers.psql

create temp table res (k text primary key, j jsonb);
grant all on res to public;
create function pg_temp.j(p_k text) returns jsonb language sql stable as $$ select j from res where k = p_k $$;
create function pg_temp.rid(p_k text) returns uuid language sql stable as $$ select (j->>'id')::uuid from res where k = p_k $$;
-- Read past RLS, whoever is logged in.
create function pg_temp.ver(p_id uuid) returns int language sql stable security definer as $$
  select version from public.requirements where id = p_id $$;
create function pg_temp.row_of(p_id uuid) returns public.requirements language sql stable security definer as $$
  select * from public.requirements where id = p_id $$;
-- What a person sees of job J's requirements (logs them in).
create function pg_temp.seen(p_uid uuid) returns int language plpgsql as $$
begin
  perform pg_temp.login(p_uid);
  return (select count(*) from public.requirements where project_id = 'c0000000-0000-0000-0000-000000000551');
end $$;
-- One requirement_save as the logged-in user (a new one when p_id is null).
create function pg_temp.save(p_id uuid, p_version int, p_kind text, p_title text, p_trigger date, p_notice int default null,
                             p_lead int default null, p_section text default '10 28 00', p_required text default 'yes',
                             p_key uuid default null, p_project uuid default 'c0000000-0000-0000-0000-000000000551')
returns jsonb language sql as $$
  select to_jsonb(s) from public.requirement_save(p_project, p_id, p_version, p_key, p_kind, p_title, '', p_section, '',
    '', 'Owner', p_required, p_notice, p_lead, '', '', p_trigger) s $$;
create function pg_temp.open_tasks(p_id uuid) returns int language sql stable security definer as $$
  select count(*)::int from public.tasks where entity_id = p_id and done_at is null and deleted_at is null $$;
create function pg_temp.today() returns date language sql stable as $$ select (now() at time zone 'America/Los_Angeles')::date $$;
grant execute on all functions in schema pg_temp to public;

select pg_temp.mk_user('a0000000-0000-0000-0000-000000000551', 'probe+rq-admin@example.test', 'Ada Admin');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000552', 'probe+rq-pe@example.test', 'Pia Engineer');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000553', 'probe+rq-pm@example.test', 'Pat Manager');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000554', 'probe+rq-super@example.test', 'Sol Super');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000555', 'probe+rq-owner@example.test', 'Ona Owner');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000556', 'probe+rq-sub@example.test', 'Sam Sub');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000557', 'probe+rq-out@example.test', 'Oz Outsider');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000558', 'probe+rq-arch@example.test', 'Ari Architect');

insert into public.orgs (id, name, kind, created_by) values
  ('b0000000-0000-0000-0000-000000000551', 'Sample Requirement Builders', 'gc', 'a0000000-0000-0000-0000-000000000551'),
  ('b0000000-0000-0000-0000-000000000552', 'Sample Other Builders', 'gc', 'a0000000-0000-0000-0000-000000000557');
-- J: being built (Requirements on). X: another company's. P: a prospect (off until built).
insert into public.projects (id, org_id, name, stage, timezone, created_by) values
  ('c0000000-0000-0000-0000-000000000551', 'b0000000-0000-0000-0000-000000000551', 'Requirements Job J', 'construction',
   'America/Los_Angeles', 'a0000000-0000-0000-0000-000000000551'),
  ('c0000000-0000-0000-0000-000000000552', 'b0000000-0000-0000-0000-000000000552', 'Other Job X', 'construction',
   'America/Los_Angeles', 'a0000000-0000-0000-0000-000000000557'),
  ('c0000000-0000-0000-0000-000000000553', 'b0000000-0000-0000-0000-000000000551', 'Prospect P', 'prospect',
   'America/Los_Angeles', 'a0000000-0000-0000-0000-000000000551');
insert into public.project_members (org_id, project_id, user_id, invite_email, role, status)
select 'b0000000-0000-0000-0000-000000000551', m.project, u.id, u.email, m.role, 'active'
  from (values
    ('c0000000-0000-0000-0000-000000000551'::uuid, 'a0000000-0000-0000-0000-000000000552'::uuid, 'pe'),
    ('c0000000-0000-0000-0000-000000000551', 'a0000000-0000-0000-0000-000000000553', 'pm'),
    ('c0000000-0000-0000-0000-000000000551', 'a0000000-0000-0000-0000-000000000554', 'superintendent'),
    ('c0000000-0000-0000-0000-000000000551', 'a0000000-0000-0000-0000-000000000555', 'owner_rep'),
    ('c0000000-0000-0000-0000-000000000551', 'a0000000-0000-0000-0000-000000000556', 'sub'),
    ('c0000000-0000-0000-0000-000000000551', 'a0000000-0000-0000-0000-000000000558', 'architect')) m (project, uid, role)
  join auth.users u on u.id = m.uid;

-- ---------------------------------------------------------------------------------------------------------------------
-- The matrix, the rail and the module, as data
-- ---------------------------------------------------------------------------------------------------------------------
select is((select array_agg(role order by role) from public.role_permissions where capability = 'requirements.read'),
  '{architect,foreman,inspector,inspector_admin,owner_rep,pe,pm,project_admin,safety,special_inspector,superintendent}'::text[],
  'matrix: the GC team, the inspectors, the owner rep and the architect read');
select is((select array_agg(role order by role) from public.role_permissions where capability = 'requirements.manage'),
  '{inspector_admin,pe,pm,project_admin}'::text[], 'matrix: the PE, the PM, the project admin (and inspector_admin, 0044) manage');
select ok(not exists (select 1 from public.role_permissions where capability like 'requirements.%' and requires_aal2),
  'matrix: no second factor needed');
select results_eq($$ select name, recommended_tools from public.roles where name in ('pe', 'pm', 'project_admin', 'superintendent') order by name $$,
  $$ values ('pe'::text, '{board,calendar,rfis,inspections,requirements,files}'::text[]),
            ('pm', '{board,calendar,rfis,inspections,requirements,files}'),
            ('project_admin', '{board,calendar,bids,rfis,inspections,requirements,files,hours}'),
            ('superintendent', '{board,calendar,dailies,safety,inspections,deliveries,requirements}') $$,
  'rail: Requirements before Files (else at the end) for the PE, the PM, the project admin and the super');
select is((select recommended_tools from public.roles where name = 'inspector_admin'),
  (select recommended_tools from public.roles where name = 'inspector'), 'rail: inspector_admin keeps the inspector''s eight');
select ok('requirements' = any (public.job_rail_tools()) and 'safety' = any (public.job_rail_tools()), 'rail: Requirements is a job tool');
select ok((select 'requirements' = any (modules) from public.projects where id = 'c0000000-0000-0000-0000-000000000551')
          and (select not 'requirements' = any (modules) from public.projects where id = 'c0000000-0000-0000-0000-000000000553'),
  'module: on for a job being built, off for a prospect');
update public.projects set stage = 'construction' where id = 'c0000000-0000-0000-0000-000000000553';
select ok((select 'requirements' = any (modules) from public.projects where id = 'c0000000-0000-0000-0000-000000000553'),
  'module: comes on when the job starts building');

-- ---------------------------------------------------------------------------------------------------------------------
-- Deny by default
-- ---------------------------------------------------------------------------------------------------------------------
select ok(not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                       where n.nspname = 'public' and c.relname in ('requirements', 'requirement_reminders')
                         and not c.relrowsecurity), 'tables: RLS on');
select ok(not has_table_privilege('anon', 'public.requirements', 'SELECT')
          and not has_table_privilege('authenticated', 'public.requirements', 'INSERT')
          and not has_table_privilege('authenticated', 'public.requirements', 'UPDATE')
          and not has_table_privilege('authenticated', 'public.requirements', 'DELETE')
          and not has_table_privilege('service_role', 'public.requirements', 'DELETE')
          and not has_table_privilege('authenticated', 'public.requirement_reminders', 'SELECT')
          and not has_table_privilege('anon', 'public.requirement_reminders', 'SELECT'),
  'tables: anon reads nothing; signed in: read only, writes go through the RPCs; nobody deletes; the reminders are the server''s');
select ok(not has_column_privilege('authenticated', 'public.requirements', 'request_key', 'SELECT')
          and has_column_privilege('authenticated', 'public.requirements', 'due_on', 'SELECT'),
  'tables: the save key is never handed out');
select ok(not has_function_privilege('authenticated', 'public.requirements_check(timestamp with time zone)', 'EXECUTE')
          and has_function_privilege('service_role', 'public.requirements_check(timestamp with time zone)', 'EXECUTE')
          and not has_function_privilege('authenticated', 'public.requirements_folder_make(uuid)', 'EXECUTE')
          and not has_function_privilege('authenticated', 'public.requirement_lock(uuid)', 'EXECUTE')
          and not has_function_privilege('anon', 'public.requirements_add_drafts(uuid, text, uuid, jsonb)', 'EXECUTE')
          and has_function_privilege('authenticated', 'public.requirements_add_drafts(uuid, text, uuid, jsonb)', 'EXECUTE')
          and not has_function_privilege('anon', 'public.requirements_list(uuid)', 'EXECUTE'),
  'functions: the reminder and the helpers for the server only; the RPCs for people, never anon');
select ok((select prosecdef from pg_proc where oid = 'public.requirement_save(uuid, uuid, integer, uuid, text, text, text, text, text, text, text, text, integer, integer, text, text, date)'::regprocedure)
          and not (select prosecdef from pg_proc where oid = 'public.requirements_list(uuid)'::regprocedure)
          and not (select prosecdef from pg_proc where oid = 'public.requirements_spec_sections(uuid)'::regprocedure),
  'functions: writes run as the definer; the reads run as the caller (RLS decides)');
select is((select count(*)::int from cron.job where jobname = 'requirements-check'), 1, 'reminder: scheduled each morning');

-- ---------------------------------------------------------------------------------------------------------------------
-- Add and change by hand (requirements.manage)
-- ---------------------------------------------------------------------------------------------------------------------
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000552');
insert into res values ('ofci', pg_temp.save(null, null, 'ofci', '  Restroom   accessories ', '2026-12-02', 60, null, '102800', 'yes',
  'd0000000-0000-0000-0000-000000000551'));
select results_eq($$ select version, kind, title, spec_section, due_on, origin, draft, status, created_by
                       from pg_temp.row_of(pg_temp.rid('ofci')) $$,
  $$ values (1, 'ofci'::text, 'Restroom accessories'::text, '10 28 00'::text, '2026-10-03'::date, 'hand'::text, false, 'open'::text,
             'a0000000-0000-0000-0000-000000000552'::uuid) $$,
  'add: the PE adds one; the title cleaned, the section spaced, due = trigger - 60 days, open, kept');
select is(pg_temp.save(null, null, 'ofci', 'Restroom accessories', '2026-12-02', 60, null, '102800', 'yes',
  'd0000000-0000-0000-0000-000000000551'), pg_temp.j('ofci'), 'add: a repeat with the same key is the same requirement');
insert into res values ('fixed', pg_temp.save(null, null, 'closeout_doc', 'O&M manuals', '2027-03-01', null, null, '01 78 23'));
select is((pg_temp.row_of(pg_temp.rid('fixed'))).due_on, '2027-03-01'::date, 'add: a fixed date alone is the due date');
insert into res values ('nodate', pg_temp.save(null, null, 'mfr_rep', 'Roofing manufacturer''s field rep', null, null, null, '07 54 23',
  'if_applicable'));
select is((pg_temp.row_of(pg_temp.rid('nodate'))).due_on, null, 'add: no trigger date, no due date yet');
insert into res values ('both', pg_temp.save(null, null, 'cfci', 'Sample lockers', '2026-12-31', 14, 30, '10 51 13'));
select is((pg_temp.row_of(pg_temp.rid('both'))).due_on, '2026-11-17'::date, 'add: notice and lead days both count back');

select throws_ok($$ select pg_temp.save(null, null, 'lunch', 'Sample', null) $$, '22023', 'Pick a kind.', 'shape: a kind from the list');
select throws_ok($$ select pg_temp.save(null, null, 'other', '   ', null) $$, '22023', 'Name it.', 'shape: a title');
select throws_ok($$ select pg_temp.save(null, null, 'other', 'Sample', null, null, null, '10 28 00', 'maybe') $$, '22023',
  'Pick required, optional or if applicable.', 'shape: required, optional or if applicable');
select throws_ok($$ select pg_temp.save(null, null, 'other', 'Sample', null, 800) $$, '22023', 'Days are 0 to 730.', 'shape: days');
select throws_ok($$ select pg_temp.save(null, null, 'other', 'Sample', null, null, null, 'ten<28>') $$, '22023',
  'The section is a number like 10 28 00.', 'shape: a section number');
select throws_ok($$ select pg_temp.save(null, null, 'other', 'Sample', null, null, null, '', 'yes', null,
                                         'c0000000-0000-0000-0000-000000000552') $$, '42501', 'forbidden',
  'add: not on another company''s job');

select pg_temp.login('a0000000-0000-0000-0000-000000000554');
select throws_ok($$ select pg_temp.save(null, null, 'other', 'Sample', null) $$, '42501', 'forbidden', 'add: the super reads, does not add');
select pg_temp.login('a0000000-0000-0000-0000-000000000556');
select throws_ok($$ select pg_temp.save(null, null, 'other', 'Sample', null) $$, '42501', 'forbidden', 'add: not a sub');

select pg_temp.login('a0000000-0000-0000-0000-000000000553');
select throws_ok(format('select pg_temp.save(%L, %s, %L, %L, %L, 60)', pg_temp.rid('ofci'), 9, 'ofci', 'Restroom accessories', '2026-12-09'),
  '40001', null, 'change: carries the version');
select is(pg_temp.save(pg_temp.rid('ofci'), 1, 'ofci', 'Restroom accessories', '2026-12-09', 60)->>'version', '2',
  'change: the PM moves the trigger date with the version');
select is((pg_temp.row_of(pg_temp.rid('ofci'))).due_on, '2026-10-10'::date, 'change: the due date moves with it');

-- ---------------------------------------------------------------------------------------------------------------------
-- Who reads
-- ---------------------------------------------------------------------------------------------------------------------
select is(pg_temp.seen('a0000000-0000-0000-0000-000000000555'), 4, 'read: the owner rep reads the register');
select is(pg_temp.seen('a0000000-0000-0000-0000-000000000558'), 4, 'read: the architect reads it');
select is(pg_temp.seen('a0000000-0000-0000-0000-000000000554'), 4, 'read: the super reads it');
select is(pg_temp.seen('a0000000-0000-0000-0000-000000000556'), 0, 'read: not a sub (yet)');
select is(pg_temp.seen('a0000000-0000-0000-0000-000000000557'), 0, 'read: nobody off the job');
select pg_temp.login('a0000000-0000-0000-0000-000000000552');
select results_eq($$ select title, days_left from public.requirements_list('c0000000-0000-0000-0000-000000000551') where kind = 'ofci' $$,
  $$ values ('Restroom accessories'::text, '2026-10-10'::date - pg_temp.today()) $$, 'list: days left on the job''s clock');
select is((select count(*)::int from public.requirements_list('c0000000-0000-0000-0000-000000000551')), 4, 'list: every live one');

-- ---------------------------------------------------------------------------------------------------------------------
-- The AI's drafts (the edge function calls this as the person, after its checks)
-- ---------------------------------------------------------------------------------------------------------------------
-- A spec book in J's Specs folder, and a file on X.
reset role;
insert into public.files (id, org_id, project_id, folder_id, storage_path, original_name, mime, created_by, scan_status,
                          upload_complete, text_status, page_count) values
  ('e0000000-0000-0000-0000-000000000551', 'b0000000-0000-0000-0000-000000000551', 'c0000000-0000-0000-0000-000000000551',
   (select id from public.folders where project_id = 'c0000000-0000-0000-0000-000000000551' and kind = 'specs' limit 1),
   'test/req/specs.pdf', 'Sample Spec Book A.pdf', 'application/pdf', 'a0000000-0000-0000-0000-000000000551', 'clean', true, 'done', 5),
  ('e0000000-0000-0000-0000-000000000552', 'b0000000-0000-0000-0000-000000000551', 'c0000000-0000-0000-0000-000000000551',
   (select id from public.folders where project_id = 'c0000000-0000-0000-0000-000000000551' and kind = 'specs' limit 1),
   'test/req/specs2.pdf', 'Sample Spec Book B.pdf', 'application/pdf', 'a0000000-0000-0000-0000-000000000551', 'clean', true,
   'pending', null),
  ('e0000000-0000-0000-0000-000000000553', 'b0000000-0000-0000-0000-000000000552', 'c0000000-0000-0000-0000-000000000552',
   (select id from public.folders where project_id = 'c0000000-0000-0000-0000-000000000552' and kind = 'specs' limit 1),
   'test/req/x.pdf', 'Other Spec.pdf', 'application/pdf', 'a0000000-0000-0000-0000-000000000557', 'clean', true, 'done', 1);
insert into public.file_pages (file_id, project_id, page_no, text) values
  ('e0000000-0000-0000-0000-000000000551', 'c0000000-0000-0000-0000-000000000551', 1,
   E'SAMPLE PROJECT 100\nSECTION 10 28 00 - TOILET ACCESSORIES\nPART 1 - GENERAL\nNotify the Owner 60 days before restroom finishes start.'),
  ('e0000000-0000-0000-0000-000000000551', 'c0000000-0000-0000-0000-000000000551', 2,
   E'Coordinate blocking with Section 06 10 00.\nSECTION 10 28 00 continues on this page as a cross reference only.'),
  ('e0000000-0000-0000-0000-000000000551', 'c0000000-0000-0000-0000-000000000551', 3,
   E'SECTION 102800 – TOILET ACCESSORIES\nPART 3 - EXECUTION\nEND OF SECTION 10 28 00'),
  ('e0000000-0000-0000-0000-000000000551', 'c0000000-0000-0000-0000-000000000551', 4,
   E'SECTION 28 46 21.11: FIRE ALARM\nPART 1 - GENERAL\nThe acceptance test shall be witnessed by the IOR.'),
  ('e0000000-0000-0000-0000-000000000551', 'c0000000-0000-0000-0000-000000000551', 5,
   E'PART 3 - EXECUTION\nEND OF SECTION');

set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000552');
select results_eq($$ select file_name, text_ready, section, title, first_page, last_page
                       from public.requirements_spec_sections('c0000000-0000-0000-0000-000000000551') $$,
  $$ values ('Sample Spec Book A.pdf'::text, true, '10 28 00'::text, 'TOILET ACCESSORIES'::text, 1, 3),
            ('Sample Spec Book A.pdf', true, '28 46 21.11', 'FIRE ALARM', 4, 5),
            ('Sample Spec Book B.pdf', false, null, null, null, null) $$,
  'spec book: a section starts at its header and runs to the next one (a repeated header, a cross reference and the END line don''t split it); a file not read yet is one row');
select is_empty($$ select 1 from public.requirements_spec_sections('c0000000-0000-0000-0000-000000000552') $$,
  'spec book: nothing of another company''s job');

select pg_temp.login('a0000000-0000-0000-0000-000000000553');
insert into res select 'd1', to_jsonb(d) from public.requirements_add_drafts('c0000000-0000-0000-0000-000000000551', 'model-x',
  'e0000000-0000-0000-0000-000000000551', $$[
    {"kind": "ofci", "title": "Toilet paper dispensers", "details": "Owner furnishes; contractor installs.", "spec_section": "10 28 00",
     "spec_title": "Toilet Accessories", "spec_ref": "1.4.A", "responsible": "Owner", "required": "yes", "notice_days": 60,
     "lead_days": null, "activity_name": "Restroom finishes start", "quote": "Notify the Owner 60 days before restroom finishes start.", "page": 1},
    {"kind": "witness", "title": "Fire alarm acceptance test", "details": "", "spec_section": "284621.11", "spec_title": "Fire Alarm",
     "spec_ref": "1.6", "responsible": "Electrical sub", "required": "yes", "notice_days": 10, "lead_days": null,
     "activity_name": "", "quote": "The acceptance test shall be witnessed by the IOR.", "page": 4},
    {"kind": "training", "title": "Owner training", "details": "", "spec_section": "28 46 21.11", "spec_title": "", "spec_ref": "",
     "responsible": "", "required": "optional", "notice_days": 14, "lead_days": null, "activity_name": "", "quote": "", "page": null}
  ]$$::jsonb) d;
select is(pg_temp.j('d1'), '{"added": 3, "skipped": 0}'::jsonb, 'drafts: the PM reads a section: three drafts');
select results_eq($$ select origin, draft, model, source_page, spec_section from public.requirements
                      where project_id = 'c0000000-0000-0000-0000-000000000551' and kind = 'witness' $$,
  $$ values ('ai'::text, true, 'model-x'::text, 4, '28 46 21.11'::text) $$, 'drafts: from the AI, a draft, the model and the page kept');
select is(pg_temp.seen('a0000000-0000-0000-0000-000000000552'), 7, 'drafts: a manager sees them');
select is(pg_temp.seen('a0000000-0000-0000-0000-000000000555'), 4, 'drafts: the owner rep doesn''t (only kept ones)');
select pg_temp.login('a0000000-0000-0000-0000-000000000552');
select is((select source_file_name from public.requirements_list('c0000000-0000-0000-0000-000000000551') where kind = 'witness'),
  'Sample Spec Book A.pdf', 'drafts: the list names the file it came from');
select pg_temp.login('a0000000-0000-0000-0000-000000000553');
select is((select to_jsonb(d) from public.requirements_add_drafts('c0000000-0000-0000-0000-000000000551', 'model-x', null, $$[
    {"kind": "ofci", "title": "toilet paper DISPENSERS", "spec_section": "10 28 00", "quote": "Something else", "required": "yes"},
    {"kind": "witness", "title": "Witness the alarm test", "spec_section": "28 46 21.11",
     "quote": "The acceptance test shall be witnessed by the IOR.", "required": "yes"},
    {"kind": "ofci", "title": "Restroom accessories", "spec_section": "10 28 00", "quote": "", "required": "yes"}
  ]$$::jsonb) d), '{"added": 0, "skipped": 3}'::jsonb,
  'drafts: what the job already has is skipped (same kind, section and title; or the same quote; kept ones too)');
select throws_ok($$ select public.requirements_add_drafts('c0000000-0000-0000-0000-000000000551', 'model-x', null,
                      '[{"kind": "lunch", "title": "Sample", "required": "yes"}]'::jsonb) $$, '22023',
  'A draft is not in the expected shape.', 'drafts: a bad shape fails loudly');
select throws_ok($$ select public.requirements_add_drafts('c0000000-0000-0000-0000-000000000551', 'model-x',
                      'e0000000-0000-0000-0000-000000000553', '[]'::jsonb) $$, '22023', 'Pick a file of this job.',
  'drafts: the source file is this job''s');
select pg_temp.login('a0000000-0000-0000-0000-000000000554');
select throws_ok($$ select public.requirements_add_drafts('c0000000-0000-0000-0000-000000000551', 'model-x', null, '[]'::jsonb) $$,
  '42501', 'forbidden', 'drafts: managers only');

-- ---------------------------------------------------------------------------------------------------------------------
-- Keep and Drop, with Undo
-- ---------------------------------------------------------------------------------------------------------------------
select pg_temp.login('a0000000-0000-0000-0000-000000000552');
insert into res select 'witness', jsonb_build_object('id', id) from public.requirements
 where project_id = 'c0000000-0000-0000-0000-000000000551' and kind = 'witness';
insert into res select 'training', jsonb_build_object('id', id) from public.requirements
 where project_id = 'c0000000-0000-0000-0000-000000000551' and kind = 'training';
select throws_ok(format('select public.requirement_set_status(%L, 1, %L)', pg_temp.rid('witness'), 'done'), '22023',
  'Keep the draft first.', 'status: not on a draft');
select throws_ok(format('select public.requirement_keep(%L, 5, true)', pg_temp.rid('witness')), '40001', null, 'keep: carries the version');
select is((select version from public.requirement_keep(pg_temp.rid('witness'), 1, true)), 2, 'keep: one tap');
select results_eq($$ select draft, confirmed_by from pg_temp.row_of(pg_temp.rid('witness')) $$,
  $$ values (false, 'a0000000-0000-0000-0000-000000000552'::uuid) $$, 'keep: kept by the PE');
select throws_ok(format('select public.requirement_keep(%L, 2, true)', pg_temp.rid('witness')), '22023', 'Already kept.',
  'keep: once');
select is((select version from public.requirement_keep(pg_temp.rid('witness'), 2, false)), 3, 'keep: Undo sends it back');
select ok((pg_temp.row_of(pg_temp.rid('witness'))).draft, 'keep: a draft again');
select throws_ok(format('select public.requirement_keep(%L, %s, false)', pg_temp.rid('ofci'), pg_temp.ver(pg_temp.rid('ofci'))),
  '22023', 'Only a kept draft goes back.', 'keep: Undo is for the AI''s lines only');
select is((select version from public.requirement_keep(pg_temp.rid('witness'), 3, true)), 4, 'keep: kept again');
select ok(public.requirement_remove(pg_temp.rid('training'), true) > 0, 'drop: one tap');
select is((select count(*)::int from public.requirements_list('c0000000-0000-0000-0000-000000000551') where kind = 'training'), 0,
  'drop: gone from the list');
select is((select added from public.requirements_add_drafts('c0000000-0000-0000-0000-000000000551', 'model-x', null,
    '[{"kind": "training", "title": "Owner training", "spec_section": "28 46 21.11", "quote": "", "required": "yes"}]'::jsonb)), 0,
  'drop: reading the section again doesn''t bring it back');
select ok(public.requirement_remove(pg_temp.rid('training'), false) > 0, 'drop: Undo');
select is((select count(*)::int from public.requirements_list('c0000000-0000-0000-0000-000000000551') where kind = 'training'), 1,
  'drop: back after Undo');
select pg_temp.login('a0000000-0000-0000-0000-000000000554');
select throws_ok(format('select public.requirement_remove(%L, true)', pg_temp.rid('ofci')), '42501', 'forbidden',
  'remove: managers only');
select pg_temp.login('a0000000-0000-0000-0000-000000000557');
select throws_ok(format('select public.requirement_remove(%L, true)', pg_temp.rid('ofci')), 'P0002', 'not_found',
  'remove: nobody off the job even finds it');

-- ---------------------------------------------------------------------------------------------------------------------
-- The one-tap status and the evidence
-- ---------------------------------------------------------------------------------------------------------------------
select pg_temp.login('a0000000-0000-0000-0000-000000000553');
select throws_ok(format('select public.requirement_set_status(%L, 1, %L)', pg_temp.rid('fixed'), 'lost'), '22023', 'Pick a status.',
  'status: one of the list');
select throws_ok(format('select public.requirement_set_status(%L, 7, %L)', pg_temp.rid('fixed'), 'requested'), '40001', null,
  'status: carries the version');
select results_eq(format('select version, status from public.requirement_set_status(%L, 1, %L)', pg_temp.rid('fixed'), 'requested'),
  $$ values (2, 'requested'::text) $$, 'status: one tap');
select results_eq($$ select status_by from pg_temp.row_of(pg_temp.rid('fixed')) $$,
  $$ values ('a0000000-0000-0000-0000-000000000553'::uuid) $$, 'status: who and when');
select results_eq(format('select version, status from public.requirement_set_status(%L, 2, %L)', pg_temp.rid('fixed'), 'open'),
  $$ values (3, 'open'::text) $$, 'status: Undo sets it back');
select pg_temp.login('a0000000-0000-0000-0000-000000000555');
select throws_ok(format('select public.requirement_set_status(%L, 3, %L)', pg_temp.rid('fixed'), 'done'), '42501', 'forbidden',
  'status: the owner rep reads, does not set');

select pg_temp.login('a0000000-0000-0000-0000-000000000554');
select throws_ok($$ select public.requirements_folder('c0000000-0000-0000-0000-000000000551') $$, '42501', 'forbidden',
  'folder: managers make it');
select pg_temp.login('a0000000-0000-0000-0000-000000000552');
insert into res values ('folder', to_jsonb(public.requirements_folder('c0000000-0000-0000-0000-000000000551')));
select is(to_jsonb(public.requirements_folder('c0000000-0000-0000-0000-000000000551')), pg_temp.j('folder'), 'folder: one per job');
reset role;
select results_eq($$ select name, kind, parent_id is null from public.folders where id = (pg_temp.j('folder')#>>'{}')::uuid $$,
  $$ values ('Requirements'::text, 'requirements'::text, true) $$, 'folder: "Requirements" at the top of the job, its own kind');
select results_eq($$ select capability, can_read, can_write from public.folder_access
                     where folder_id = (pg_temp.j('folder')#>>'{}')::uuid order by capability $$,
  $$ values ('requirements.manage'::text, true, true), ('requirements.read', true, false) $$,
  'folder: whoever reads requirements reads it; managers upload');
select ok(public.folder_name_reserved('c0000000-0000-0000-0000-000000000551', null, 'Requirements'), 'folder: the name is reserved');
insert into public.files (id, org_id, project_id, folder_id, storage_path, original_name, mime, created_by, scan_status, upload_complete) values
  ('e0000000-0000-0000-0000-000000000554', 'b0000000-0000-0000-0000-000000000551', 'c0000000-0000-0000-0000-000000000551',
   (pg_temp.j('folder')#>>'{}')::uuid, 'test/req/rep.jpg', 'Sample rep photos.jpg', 'image/jpeg',
   'a0000000-0000-0000-0000-000000000552', 'clean', true);
select ok(pg_temp.can_read_as('a0000000-0000-0000-0000-000000000555', (pg_temp.j('folder')#>>'{}')::uuid)
          and not pg_temp.can_write_as('a0000000-0000-0000-0000-000000000555', (pg_temp.j('folder')#>>'{}')::uuid)
          and pg_temp.can_write_as('a0000000-0000-0000-0000-000000000553', (pg_temp.j('folder')#>>'{}')::uuid)
          and not pg_temp.can_read_as('a0000000-0000-0000-0000-000000000556', (pg_temp.j('folder')#>>'{}')::uuid),
  'folder: the owner rep reads, the PM writes, a sub does neither');

set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000553');
select throws_ok(format('select public.requirement_evidence(%L, %s, %L, %L)', pg_temp.rid('nodate'), pg_temp.ver(pg_temp.rid('nodate')),
  'x', 'e0000000-0000-0000-0000-000000000553'), '22023', 'Pick a file of this job.', 'evidence: a file of this job');
select is((select version from public.requirement_evidence(pg_temp.rid('nodate'), 1, '  The rep took pictures; no visit. ',
  'e0000000-0000-0000-0000-000000000554')), 2, 'evidence: a note and the rep''s photos');
select results_eq($$ select evidence_note, evidence_file_name from public.requirements_list('c0000000-0000-0000-0000-000000000551')
                     where id = pg_temp.rid('nodate') $$,
  $$ values ('The rep took pictures; no visit.'::text, 'Sample rep photos.jpg'::text) $$, 'evidence: shown on the list');
select pg_temp.login('a0000000-0000-0000-0000-000000000554');
select results_eq($$ select evidence_file_name from public.requirements_list('c0000000-0000-0000-0000-000000000551')
                     where id = pg_temp.rid('nodate') $$,
  $$ values ('Sample rep photos.jpg'::text) $$, 'evidence: the super sees the file (he reads requirements)');

-- ---------------------------------------------------------------------------------------------------------------------
-- The reminder: due within 7 days or past, the job's clock, once per due date
-- ---------------------------------------------------------------------------------------------------------------------
-- Checked at Monday Oct 5, 2026, 8:00 in the job's zone (15:00 UTC), on fresh lines: the ones above come off first.
-- J's leads are the admin, the PE and the PM (the super reads but doesn't manage).
reset role;
update public.requirements set deleted_at = now(), deleted_by = 'a0000000-0000-0000-0000-000000000551'
 where project_id = 'c0000000-0000-0000-0000-000000000551';
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000552');
select throws_ok($$ select public.requirements_check() $$, '42501', null, 'reminder: not for people (the schedule runs it)');
insert into res values ('soon', pg_temp.save(null, null, 'ofci', 'Restroom accessories', '2026-12-08', 60));      -- due Oct 9
insert into res values ('late', pg_temp.save(null, null, 'warranty', 'Roofing special warranty', '2026-10-01')); -- due Oct 1
insert into res values ('later', pg_temp.save(null, null, 'testing', 'Sample flush test', '2026-10-13'));        -- due Oct 13
insert into res values ('opt', pg_temp.save(null, null, 'training', 'Sample optional training', '2026-10-06', null, null, '', 'optional'));
insert into res values ('sched', pg_temp.save(null, null, 'witness', 'Sample witnessed test', '2026-10-06'));
select ok((select status from public.requirement_set_status(pg_temp.rid('sched'), 1, 'scheduled')) = 'scheduled', 'reminder: one already scheduled');
-- The PE's day on the job is still Oct 4 at 06:00 UTC Monday: Oct 12 (8 days past Oct 4) isn't within 7 days yet.
insert into res values ('edge', pg_temp.save(null, null, 'notice', 'Sample shutdown notice', '2026-10-12'));
reset role;
select pg_temp.login_service();
select is(public.requirements_check('2026-10-05 06:00+00'), 2, 'reminder: Sunday night on the job: the one due Oct 9 and the late one');
select is(public.requirements_check('2026-10-05 15:00+00'), 1, 'reminder: Monday morning on the job: Oct 12 is now within 7 days');
select is(public.requirements_check('2026-10-05 16:00+00'), 0, 'reminder: once per due date');
select set_eq($$ select summary from public.activity where project_id = 'c0000000-0000-0000-0000-000000000551' and kind = 'requirements.due' $$,
  $$ values ('Notify the owner: Restroom accessories (OFCI) — due Oct 9'::text), ('Get the warranty: Roofing special warranty — was due Oct 1'),
            ('Send the notice: Sample shutdown notice — due Oct 12') $$,
  'reminder: a short board line each (not the one due Oct 13, the optional one or the scheduled one)');
select ok(not exists (select 1 from public.activity where project_id = 'c0000000-0000-0000-0000-000000000551'
                       and kind = 'requirements.due' and (audience_capability <> 'requirements.manage' or entity_type <> 'requirement')),
  'reminder: the board line is for the managers and opens the requirement');
select results_eq(
  $$ select array_agg(distinct assignee_user_id order by assignee_user_id) from public.tasks
      where project_id = 'c0000000-0000-0000-0000-000000000551' and kind = 'requirements.due' and done_at is null $$,
  $$ values ('{a0000000-0000-0000-0000-000000000551,a0000000-0000-0000-0000-000000000552,a0000000-0000-0000-0000-000000000553}'::uuid[]) $$,
  'reminder: tasks for the admin, the PE and the PM (their positions run the register), not the super');
select is((select count(*)::int from public.tasks where project_id = 'c0000000-0000-0000-0000-000000000551'
             and kind = 'requirements.due' and done_at is null), 9, 'reminder: three requirements, three people');
select is((select due_at from public.tasks where entity_id = pg_temp.rid('soon') limit 1), '2026-10-10 06:59:59+00'::timestamptz,
  'reminder: the task is due at the end of the due day on the job''s clock');

-- A new due date reminds again; an open task isn't doubled.
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000552');
select is(pg_temp.save(pg_temp.rid('soon'), 1, 'ofci', 'Restroom accessories', '2026-12-07', 60)->>'version', '2', 'reminder: the date moves');
reset role;
select pg_temp.login_service();
select is(public.requirements_check('2026-10-05 17:00+00'), 1, 'reminder: a new due date reminds again');
select is(pg_temp.open_tasks(pg_temp.rid('soon')), 3,
  'reminder: still one open task each');
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000553');
select results_eq($$ select entity_type, n from public.my_tool_counts('c0000000-0000-0000-0000-000000000551') order by 1 $$,
  $$ values ('requirement'::text, 3) $$, 'badge: the reminders count on Requirements');
select ok((select status from public.requirement_set_status(pg_temp.rid('soon'), 2, 'requested')) = 'requested', 'requested');
select is(pg_temp.open_tasks(pg_temp.rid('soon')), 3,
  'reminder: requested keeps the tasks');
select ok((select status from public.requirement_set_status(pg_temp.rid('soon'), 3, 'done')) = 'done', 'done');
select is(pg_temp.open_tasks(pg_temp.rid('soon')), 0,
  'reminder: done completes them');
select ok((select status from public.requirement_set_status(pg_temp.rid('soon'), 4, 'requested')) = 'requested', 'Undo: requested again');
reset role;
select pg_temp.login_service();
select is(public.requirements_check('2026-10-05 18:00+00'), 1, 'reminder: after an Undo back to requested, the next check reminds again');
select is(pg_temp.open_tasks(pg_temp.rid('soon')), 3, 'reminder: its tasks are back');
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000552');
select is(pg_temp.save(pg_temp.rid('soon'), 5, 'ofci', 'Restroom accessories', '2027-02-01', 60)->>'version', '6',
  'the trigger date moves past the window');
select is(pg_temp.open_tasks(pg_temp.rid('soon')), 0, 'reminder: a moved due date completes the old reminder''s tasks');
select ok(public.requirement_remove(pg_temp.rid('late'), true) > 0, 'removed');
select is(pg_temp.open_tasks(pg_temp.rid('late')), 0,
  'reminder: removing it completes them');

select * from finish();
rollback;
