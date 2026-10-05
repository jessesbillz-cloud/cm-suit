begin;
select plan(105);
-- Schedule (migration 0062): the matrix and rails as data, the module, the Schedule folder, imports landing as drafts
-- (as the caller, the file in the folder, a repeat answers the same draft), draft edits with version checks, remove and
-- Undo, publish (the data date, every row dated, the next update number, the old version superseded, the calendar's
-- 60-day window, the board line), Undo of a publish, discard and Undo, the reads (drafts to managers only), the
-- reminder data (schedule_upcoming) and the morning check (window roll, "Schedule update due" once per version).
\ir _helpers.psql

create temp table res (k text primary key, j jsonb);
grant all on res to public;
create function pg_temp.v(p_k text) returns uuid language sql stable as $$ select (j #>> '{}')::uuid from res where k = p_k $$;
-- A day of the job's clock, n days from today.
create function pg_temp.d(n int) returns date language sql stable as $$
  select (now() at time zone 'America/Los_Angeles')::date + n $$;
-- Read past RLS, whoever is logged in.
create function pg_temp.ver(p_id uuid) returns int language sql stable security definer as $$
  select version from public.schedule_versions where id = p_id $$;
create function pg_temp.status_of(p_id uuid) returns text language sql stable security definer as $$
  select status from public.schedule_versions where id = p_id $$;
create function pg_temp.act(p_version uuid, p_code text) returns uuid language sql stable security definer as $$
  select id from public.schedule_activities where version_id = p_version and activity_code = p_code $$;
create function pg_temp.act_ver(p_id uuid) returns int language sql stable security definer as $$
  select version from public.schedule_activities where id = p_id $$;
create function pg_temp.cal(p_job uuid) returns text[] language sql stable security definer as $$
  select coalesce(array_agg(ce.kind || ':' || ce.title order by ce.title), '{}') from public.calendar_entries ce
   where ce.project_id = p_job and ce.source_type = 'schedule_activity' $$;
create function pg_temp.lines(p_job uuid, p_kind text) returns int language sql stable security definer as $$
  select count(*)::int from public.activity where project_id = p_job and kind = p_kind $$;
-- An import's rows: done, underway, this week, in 10 days, a milestone in 45, one 75 days out, one with no dates.
create function pg_temp.rows1() returns jsonb language sql stable as $$
  select jsonb_build_array(
    jsonb_build_object('code', 'A100', 'name', 'Sample mobilize', 'start', pg_temp.d(-20), 'finish', pg_temp.d(-15),
                       'actual_start', pg_temp.d(-20), 'actual_finish', pg_temp.d(-15), 'percent', 100),
    jsonb_build_object('code', 'A110', 'name', 'Sample underground plumbing', 'start', pg_temp.d(-3), 'finish', pg_temp.d(4),
                       'actual_start', pg_temp.d(-3), 'percent', 40, 'area', 'Building A', 'trade', 'Sample Plumbing'),
    jsonb_build_object('code', 'A120', 'name', 'Sample slab on grade pour', 'start', pg_temp.d(2), 'finish', pg_temp.d(2),
                       'wbs', 'Building A / Concrete', 'csi_division', '03 30 00'),
    jsonb_build_object('code', 'A130', 'name', 'Sample level 1 framing', 'start', pg_temp.d(10), 'finish', pg_temp.d(30)),
    jsonb_build_object('code', 'M200', 'name', 'Sample dry-in', 'start', pg_temp.d(45), 'finish', pg_temp.d(45), 'is_milestone', true),
    jsonb_build_object('code', 'A300', 'name', 'Sample restroom finishes', 'start', pg_temp.d(75), 'finish', pg_temp.d(90)),
    jsonb_build_object('name', 'Sample site cleanup', 'unsure', true, 'source_ref', 'p2')) $$;
-- schedule_import_draft as whoever is logged in.
create function pg_temp.import(p_file uuid, p_rows jsonb, p_date date default null) returns uuid language sql as $$
  select public.schedule_import_draft('c0000000-0000-0000-0000-000000000541', p_file, 'xer', 'Sample Master Schedule',
    p_date, repeat('a', 64), null, '{}', p_rows) $$;
grant execute on all functions in schema pg_temp to public;

select pg_temp.mk_user('a0000000-0000-0000-0000-000000000541', 'probe+sc-admin@example.test', 'Ada Admin');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000542', 'probe+sc-super@example.test', 'Sol Super');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000543', 'probe+sc-pm@example.test', 'Pat Manager');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000544', 'probe+sc-sub@example.test', 'Sam Sub');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000545', 'probe+sc-req@example.test', 'Rae Requester');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000546', 'probe+sc-bidder@example.test', 'Bo Bidder');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000547', 'probe+sc-out@example.test', 'Oz Outsider');

insert into public.orgs (id, name, kind, created_by) values
  ('b0000000-0000-0000-0000-000000000541', 'Sample Schedule Builders', 'gc', 'a0000000-0000-0000-0000-000000000541'),
  ('b0000000-0000-0000-0000-000000000542', 'Sample Other Builders', 'gc', 'a0000000-0000-0000-0000-000000000547');
-- J: being built (Schedule on). P: a prospect (off until built). X: another company's job.
insert into public.projects (id, org_id, name, stage, timezone, created_by) values
  ('c0000000-0000-0000-0000-000000000541', 'b0000000-0000-0000-0000-000000000541', 'Schedule Job J', 'construction',
   'America/Los_Angeles', 'a0000000-0000-0000-0000-000000000541'),
  ('c0000000-0000-0000-0000-000000000542', 'b0000000-0000-0000-0000-000000000541', 'Prospect P', 'prospect',
   'America/Los_Angeles', 'a0000000-0000-0000-0000-000000000541'),
  ('c0000000-0000-0000-0000-000000000543', 'b0000000-0000-0000-0000-000000000542', 'Other Job X', 'construction',
   'America/Los_Angeles', 'a0000000-0000-0000-0000-000000000547');
insert into public.project_members (org_id, project_id, user_id, invite_email, role, status)
select 'b0000000-0000-0000-0000-000000000541', 'c0000000-0000-0000-0000-000000000541', u.id, u.email, m.role, 'active'
  from (values
    ('a0000000-0000-0000-0000-000000000542'::uuid, 'superintendent'),
    ('a0000000-0000-0000-0000-000000000543', 'pm'),
    ('a0000000-0000-0000-0000-000000000544', 'sub'),
    ('a0000000-0000-0000-0000-000000000545', 'requester'),
    ('a0000000-0000-0000-0000-000000000546', 'bidder')) m (uid, role)
  join auth.users u on u.id = m.uid;

-- ---------------------------------------------------------------------------------------------------------------------
-- The matrix, the rails and the module, as data
-- ---------------------------------------------------------------------------------------------------------------------
select set_eq($$ select role from public.role_permissions where capability = 'schedule.read' $$,
  $$ select name from public.roles where not public.role_is_walled(name) and name <> 'requester' $$,
  'matrix: schedule.read for every role but the walled ones and the requester');
select is((select array_agg(role order by role) from public.role_permissions where capability = 'schedule.manage'),
  '{inspector_admin,pe,pm,project_admin,superintendent}'::text[], 'matrix: who uploads and publishes (provisional)');
select results_eq($$ select name, recommended_tools from public.roles where name in ('pe', 'pm', 'project_admin', 'superintendent') order by name $$,
  $$ values ('pe'::text, '{board,calendar,schedule,rfis,inspections,requirements,files}'::text[]),
            ('pm', '{board,calendar,schedule,rfis,inspections,requirements,files}'),
            ('project_admin', '{board,calendar,schedule,bids,rfis,inspections,files,hours}'),
            ('superintendent', '{board,calendar,schedule,dailies,safety,inspections,deliveries,requirements}') $$,
  'rail: Schedule right after Calendar for the superintendent, pm, pe and project admin');
select ok(not exists (select 1 from public.roles where name in ('inspector', 'inspector_admin') and 'schedule' = any (recommended_tools)),
  'rail: not on the inspector''s (or its twin''s) full rail');
select ok('schedule' = any (public.job_rail_tools()), 'rail: Schedule is a job tool');
select ok((select 'schedule' = any (modules) from public.projects where id = 'c0000000-0000-0000-0000-000000000541')
          and (select not 'schedule' = any (modules) from public.projects where id = 'c0000000-0000-0000-0000-000000000542'),
  'module: on for a job being built, off for a prospect');
update public.projects set stage = 'construction' where id = 'c0000000-0000-0000-0000-000000000542';
select ok((select 'schedule' = any (modules) from public.projects where id = 'c0000000-0000-0000-0000-000000000542'),
  'module: comes on when the job starts building');

-- ---------------------------------------------------------------------------------------------------------------------
-- Tables and functions: deny by default
-- ---------------------------------------------------------------------------------------------------------------------
select ok(not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                       where n.nspname = 'public' and c.relname in ('schedule_versions', 'schedule_activities')
                         and not c.relrowsecurity), 'tables: RLS on');
select ok(not exists (select 1 from unnest(array['schedule_versions', 'schedule_activities']) t
                       where has_table_privilege('anon', 'public.' || t, 'SELECT')
                          or has_table_privilege('authenticated', 'public.' || t, 'INSERT')
                          or has_table_privilege('authenticated', 'public.' || t, 'UPDATE')
                          or has_table_privilege('authenticated', 'public.' || t, 'DELETE')
                          or has_table_privilege('service_role', 'public.' || t, 'DELETE')),
  'tables: anon reads nothing; signed in: read only, writes go through the RPCs; nobody deletes');
select ok(not exists (select 1 from unnest(array[
    'public.schedule_folder(uuid)', 'public.schedule_import_draft(uuid, uuid, text, text, date, text, text, text[], jsonb)',
    'public.schedule_draft_save(uuid, integer, text, date)',
    'public.schedule_activity_save(uuid, integer, text, text, text, text, text, date, date, boolean)',
    'public.schedule_activity_remove(uuid, boolean)', 'public.schedule_discard(uuid, boolean)',
    'public.schedule_publish(uuid, integer)', 'public.schedule_unpublish(uuid)', 'public.schedule_versions_list(uuid)',
    'public.schedule_version(uuid)', 'public.schedule_status(uuid)']) f
   where not (select prosecdef from pg_proc where oid = f::regprocedure)
      or has_function_privilege('anon', f, 'EXECUTE') or not has_function_privilege('authenticated', f, 'EXECUTE')),
  'RPCs: SECURITY DEFINER, for signed-in people, never anon');
select ok(not (select prosecdef from pg_proc where oid = 'public.schedule_current(uuid)'::regprocedure)
          and not (select prosecdef from pg_proc where oid = 'public.schedule_upcoming(uuid, integer)'::regprocedure)
          and has_function_privilege('authenticated', 'public.schedule_upcoming(uuid, integer)', 'EXECUTE')
          and has_function_privilege('service_role', 'public.schedule_upcoming(uuid, integer)', 'EXECUTE'),
  'schedule_current / schedule_upcoming run as the caller (RLS answers)');
select ok(not exists (select 1 from unnest(array[
    'public.schedule_daily(timestamp with time zone)', 'public.schedule_folder_make(uuid)',
    'public.schedule_calendar_sync(uuid, timestamp with time zone)', 'public.schedule_version_lock(uuid)',
    'public.schedule_draft_lock(uuid)']) f
   where has_function_privilege('authenticated', f, 'EXECUTE') or has_function_privilege('anon', f, 'EXECUTE')),
  'internal functions: nobody signed in calls them');

-- ---------------------------------------------------------------------------------------------------------------------
-- The Schedule folder
-- ---------------------------------------------------------------------------------------------------------------------
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000544');
select throws_ok($$ select public.schedule_folder('c0000000-0000-0000-0000-000000000541') $$, '42501', null,
  'folder: a sub can''t upload a schedule');
select pg_temp.login('a0000000-0000-0000-0000-000000000542');
insert into res values ('folder', to_jsonb(public.schedule_folder('c0000000-0000-0000-0000-000000000541')));
select is(public.schedule_folder('c0000000-0000-0000-0000-000000000541'), pg_temp.v('folder'), 'folder: made once, the same after');
select ok(pg_temp.can_write_as('a0000000-0000-0000-0000-000000000542', pg_temp.v('folder')), 'folder: the super uploads there');
select ok(pg_temp.can_read_as('a0000000-0000-0000-0000-000000000544', pg_temp.v('folder'))
          and not pg_temp.can_write_as('a0000000-0000-0000-0000-000000000544', pg_temp.v('folder')),
  'folder: a sub reads the originals, can''t upload');
select ok(not pg_temp.can_read_as('a0000000-0000-0000-0000-000000000546', pg_temp.v('folder')), 'folder: a bidder can''t read it');
reset role;
select is((select name from public.folders where id = pg_temp.v('folder')), 'Schedule', 'folder: named Schedule, at the top of the job');
select ok(public.folder_name_reserved('c0000000-0000-0000-0000-000000000541', null, 'Schedule'), 'folder: the name is reserved');

-- The uploaded files: three in the folder, one in Plans.
insert into public.files (id, org_id, project_id, folder_id, storage_path, original_name, mime, created_by, scan_status, upload_complete) values
  ('e0000000-0000-0000-0000-000000000541', 'b0000000-0000-0000-0000-000000000541', 'c0000000-0000-0000-0000-000000000541',
   pg_temp.v('folder'), 'test/schedule/one.xer', 'Sample Schedule 1.xer', 'application/octet-stream',
   'a0000000-0000-0000-0000-000000000542', 'clean', true),
  ('e0000000-0000-0000-0000-000000000542', 'b0000000-0000-0000-0000-000000000541', 'c0000000-0000-0000-0000-000000000541',
   pg_temp.v('folder'), 'test/schedule/two.xer', 'Sample Schedule 2.xer', 'application/octet-stream',
   'a0000000-0000-0000-0000-000000000542', 'clean', true),
  ('e0000000-0000-0000-0000-000000000543', 'b0000000-0000-0000-0000-000000000541', 'c0000000-0000-0000-0000-000000000541',
   pg_temp.v('folder'), 'test/schedule/three.csv', 'Sample Look-ahead.csv', 'text/csv',
   'a0000000-0000-0000-0000-000000000542', 'clean', true),
  ('e0000000-0000-0000-0000-000000000544', 'b0000000-0000-0000-0000-000000000541', 'c0000000-0000-0000-0000-000000000541',
   (select id from public.folders where project_id = 'c0000000-0000-0000-0000-000000000541' and kind = 'plans' limit 1),
   'test/schedule/plan.pdf', 'Sample Plan.pdf', 'application/pdf', 'a0000000-0000-0000-0000-000000000541', 'clean', true);

-- ---------------------------------------------------------------------------------------------------------------------
-- Import: a draft, as the caller
-- ---------------------------------------------------------------------------------------------------------------------
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000544');
select throws_ok($$ select pg_temp.import('e0000000-0000-0000-0000-000000000541', pg_temp.rows1()) $$, '42501', null,
  'import: a sub can''t');
select pg_temp.login('a0000000-0000-0000-0000-000000000542');
select throws_ok($$ select pg_temp.import('e0000000-0000-0000-0000-000000000544', pg_temp.rows1()) $$, 'P0002', null,
  'import: only a file in the job''s Schedule folder');
select throws_ok($$ select pg_temp.import('e0000000-0000-0000-0000-000000000541', '[]'::jsonb) $$, '22023', 'No activities in this file.',
  'import: nothing to import is refused');
select throws_ok($$ select pg_temp.import('e0000000-0000-0000-0000-000000000541',
                      '[{"code": "A1", "name": "One"}, {"code": "a1 ", "name": "Two"}]'::jsonb) $$, '23505', null,
  'import: one row per Activity ID (the database owns duplicates)');
select throws_ok($$ select pg_temp.import('e0000000-0000-0000-0000-000000000541',
                      '[{"name": "One", "start": "2026-10-09", "finish": "2026-10-01"}]'::jsonb) $$, '23514', null,
  'import: a finish before its start is refused');
insert into res values ('v1', to_jsonb(pg_temp.import('e0000000-0000-0000-0000-000000000541', pg_temp.rows1())));
select is(pg_temp.import('e0000000-0000-0000-0000-000000000541', pg_temp.rows1()), pg_temp.v('v1'),
  'import: a repeat for the same file is the same draft');
select results_eq($$ select status, number, source_kind, title, data_date, created_by from public.schedule_versions where id = pg_temp.v('v1') $$,
  $$ values ('draft'::text, null::int, 'xer'::text, 'Sample Master Schedule'::text, null::date, 'a0000000-0000-0000-0000-000000000542'::uuid) $$,
  'import: a draft, no number yet, uploaded by the caller');
select results_eq($$ select activity_code, name, sort, unsure from public.schedule_activities where version_id = pg_temp.v('v1') order by sort $$,
  $$ values ('A100'::text, 'Sample mobilize'::text, 1, false), ('A110', 'Sample underground plumbing', 2, false),
            ('A120', 'Sample slab on grade pour', 3, false), ('A130', 'Sample level 1 framing', 4, false),
            ('M200', 'Sample dry-in', 5, false), ('A300', 'Sample restroom finishes', 6, false),
            (null, 'Sample site cleanup', 7, true) $$,
  'import: the rows in file order, with their Activity IDs');
select results_eq($$ select area, trade, percent, actual_start from public.schedule_activities where id = pg_temp.act(pg_temp.v('v1'), 'A110') $$,
  $$ values ('Building A'::text, 'Sample Plumbing'::text, 40.00::numeric, pg_temp.d(-3)) $$, 'import: area, trade, percent, actuals kept');

-- Drafts: managers only.
select pg_temp.login('a0000000-0000-0000-0000-000000000543');
select is((select count(*)::int from public.schedule_activities where version_id = pg_temp.v('v1')), 7, 'draft: the pm (a manager) sees it');
select pg_temp.login('a0000000-0000-0000-0000-000000000544');
select is((select count(*)::int from public.schedule_versions where project_id = 'c0000000-0000-0000-0000-000000000541')
          + (select count(*)::int from public.schedule_activities where project_id = 'c0000000-0000-0000-0000-000000000541'), 0,
  'draft: a sub sees nothing of it');
select throws_ok($$ select * from public.schedule_version(pg_temp.v('v1')) $$, 'P0002', null, 'draft: not even through its RPC');
select is((select count(*)::int from public.schedule_versions_list('c0000000-0000-0000-0000-000000000541')), 0, 'draft: not in a sub''s list');

-- ---------------------------------------------------------------------------------------------------------------------
-- Draft edits
-- ---------------------------------------------------------------------------------------------------------------------
select throws_ok($$ select public.schedule_activity_remove(pg_temp.act(pg_temp.v('v1'), 'A300'), true) $$, 'P0002', null,
  'edit: a sub can''t (the draft is not his to see)');
select pg_temp.login('a0000000-0000-0000-0000-000000000542');
select throws_ok($$ select public.schedule_draft_save(pg_temp.v('v1'), pg_temp.ver(pg_temp.v('v1')) + 1, 'x', null) $$, '40001', null,
  'edit: a stale version is refused');
select is(public.schedule_draft_save(pg_temp.v('v1'), pg_temp.ver(pg_temp.v('v1')), '  Sample Master  ', null),
  pg_temp.ver(pg_temp.v('v1')) + 1, 'edit: title saved, the next version answered');
select is((select title from public.schedule_versions where id = pg_temp.v('v1')), 'Sample Master', 'edit: trimmed');
insert into res values ('cleanup', to_jsonb((select id from public.schedule_activities where version_id = pg_temp.v('v1') and activity_code is null)));
select throws_ok($$ select public.schedule_activity_save(pg_temp.v('cleanup'), pg_temp.act_ver(pg_temp.v('cleanup')), null, 'Sample site cleanup',
                      null, null, null, pg_temp.d(5), pg_temp.d(3), false) $$, '23514', null, 'edit: a finish before the start is refused');
select throws_ok($$ select public.schedule_activity_save(pg_temp.v('cleanup'), pg_temp.act_ver(pg_temp.v('cleanup')), 'A120', 'Sample site cleanup',
                      null, null, null, pg_temp.d(5), pg_temp.d(6), false) $$, '23505', null, 'edit: an Activity ID already in the draft is refused');
select is(public.schedule_activity_save(pg_temp.v('cleanup'), pg_temp.act_ver(pg_temp.v('cleanup')), ' A400 ', ' Sample site cleanup ',
            null, '  ', 'Sample Laborers', pg_temp.d(5), null, false), pg_temp.act_ver(pg_temp.v('cleanup')) + 1, 'edit: a row saved');
select results_eq($$ select activity_code, name, area, trade, start_date, finish_date, unsure from public.schedule_activities where id = pg_temp.v('cleanup') $$,
  $$ values ('A400'::text, 'Sample site cleanup'::text, null::text, 'Sample Laborers'::text, pg_temp.d(5), null::date, false) $$,
  'edit: trimmed, blanks are none, checked by a person (no longer unsure)');
select lives_ok($$ select public.schedule_activity_remove(pg_temp.act(pg_temp.v('v1'), 'A100'), true) $$, 'edit: a row removed');
select is((select count(*)::int from public.schedule_activities where version_id = pg_temp.v('v1') and deleted_at is null), 6,
  'edit: it is off the draft');
select lives_ok($$ select public.schedule_activity_remove(pg_temp.act(pg_temp.v('v1'), 'A100'), false) $$, 'edit: Undo puts it back');
select is((select count(*)::int from public.schedule_activities where version_id = pg_temp.v('v1') and deleted_at is null), 7, 'edit: back');

-- ---------------------------------------------------------------------------------------------------------------------
-- Publish
-- ---------------------------------------------------------------------------------------------------------------------
select throws_ok($$ select * from public.schedule_publish(pg_temp.v('v1'), pg_temp.ver(pg_temp.v('v1'))) $$, '22023', 'Add the data date.',
  'publish: needs the data date');
select lives_ok($$ select public.schedule_draft_save(pg_temp.v('v1'), pg_temp.ver(pg_temp.v('v1')), 'Sample Master', pg_temp.d(-2)) $$,
  'publish: the data date set');
select lives_ok($$ select public.schedule_activity_save(pg_temp.v('cleanup'), pg_temp.act_ver(pg_temp.v('cleanup')), 'A400', 'Sample site cleanup',
                     null, null, null, null, null, false) $$, 'publish: (a row without dates again)');
select throws_ok($$ select * from public.schedule_publish(pg_temp.v('v1'), pg_temp.ver(pg_temp.v('v1'))) $$, '22023', '1 activity needs a start date.',
  'publish: every row needs a start date');
select lives_ok($$ select public.schedule_activity_remove(pg_temp.v('cleanup'), true) $$, 'publish: the undated row removed');
select throws_ok($$ select * from public.schedule_publish(pg_temp.v('v1'), pg_temp.ver(pg_temp.v('v1')) - 1) $$, '40001', null,
  'publish: a stale version is refused');
select pg_temp.login('a0000000-0000-0000-0000-000000000544');
select throws_ok($$ select * from public.schedule_publish(pg_temp.v('v1'), pg_temp.ver(pg_temp.v('v1'))) $$, 'P0002', null, 'publish: a sub can''t');
select pg_temp.login('a0000000-0000-0000-0000-000000000542');
select results_eq($$ select number from public.schedule_publish(pg_temp.v('v1'), pg_temp.ver(pg_temp.v('v1'))) $$, $$ values (1) $$,
  'publish: Update 1');
select results_eq($$ select status, published_by from public.schedule_versions where id = pg_temp.v('v1') $$,
  $$ values ('current'::text, 'a0000000-0000-0000-0000-000000000542'::uuid) $$, 'publish: current, by the super');
select is((select finish_date from public.schedule_activities where id = pg_temp.act(pg_temp.v('v1'), 'M200')), pg_temp.d(45),
  'publish: dates kept');
select throws_ok($$ select public.schedule_activity_remove(pg_temp.act(pg_temp.v('v1'), 'A120'), true) $$, '22023', 'This schedule is published.',
  'publish: a published version is not edited');
select throws_ok($$ select public.schedule_discard(pg_temp.v('v1'), true) $$, '22023', 'This schedule is published.',
  'publish: nor discarded');
select is(pg_temp.lines('c0000000-0000-0000-0000-000000000541', 'schedule.published'), 1, 'publish: a board line for the job');
select is((select summary from public.activity where project_id = 'c0000000-0000-0000-0000-000000000541' and kind = 'schedule.published'),
  'Schedule update 1 published (data date ' || to_char(pg_temp.d(-2), 'Mon FMDD') || ')', 'publish: the line says which update and its data date');

-- The calendar: the current version's activities in the next 60 days, not done.
select is(pg_temp.cal('c0000000-0000-0000-0000-000000000541'),
  '{milestones:Sample dry-in,lookahead:Sample level 1 framing,lookahead:Sample slab on grade pour,lookahead:Sample underground plumbing}'::text[],
  'calendar: underway, this week, in 10 days and the milestone; not the done one, not the one 75 days out');
select results_eq($$ select all_day, read_capability, starts_at, ends_at, location from public.calendar_entries
                      where source_type = 'schedule_activity' and source_id = pg_temp.act(pg_temp.v('v1'), 'A110') $$,
  $$ values (true, 'schedule.read'::text, pg_temp.d(-3)::timestamp at time zone 'America/Los_Angeles',
             pg_temp.d(4)::timestamp at time zone 'America/Los_Angeles', 'Building A'::text) $$,
  'calendar: all day from its start to its finish on the job''s clock, read by schedule.read, the area as the place');
select is((select ends_at from public.calendar_entries where source_type = 'schedule_activity'
            and source_id = pg_temp.act(pg_temp.v('v1'), 'A120')), null, 'calendar: a one-day activity has no end');

-- Readers.
select pg_temp.login('a0000000-0000-0000-0000-000000000544');
select is((select count(*)::int from public.schedule_current('c0000000-0000-0000-0000-000000000541')), 6, 'read: a sub reads the current schedule');
select is((select array_agg(activity_code) from public.schedule_current('c0000000-0000-0000-0000-000000000541')),
  '{A100,A110,A120,A130,M200,A300}'::text[], 'read: by start, removed rows left out');
select results_eq($$ select number, status, activities from public.schedule_versions_list('c0000000-0000-0000-0000-000000000541') $$,
  $$ values (1, 'current'::text, 6) $$, 'read: the list, with the count');
select is((select count(*)::int from public.calendar_entries where source_type = 'schedule_activity'), 4, 'read: the calendar lines too');
select pg_temp.login('a0000000-0000-0000-0000-000000000545');
select is((select count(*)::int from public.schedule_current('c0000000-0000-0000-0000-000000000541'))
          + (select count(*)::int from public.calendar_entries where source_type = 'schedule_activity'), 0,
  'read: the requester sees none of it');
select throws_ok($$ select * from public.schedule_versions_list('c0000000-0000-0000-0000-000000000541') $$, '42501', null,
  'read: nor its list');
select pg_temp.login('a0000000-0000-0000-0000-000000000546');
select is((select count(*)::int from public.schedule_current('c0000000-0000-0000-0000-000000000541')), 0, 'read: a bidder sees nothing');
select pg_temp.login('a0000000-0000-0000-0000-000000000547');
select is((select count(*)::int from public.schedule_activities) + (select count(*)::int from public.schedule_versions), 0,
  'read: another company sees nothing');

-- Where it stands.
select pg_temp.login('a0000000-0000-0000-0000-000000000544');
select results_eq($$ select today, number, data_date, days_old, update_due, drafts from public.schedule_status('c0000000-0000-0000-0000-000000000541') $$,
  $$ values (pg_temp.d(0), 1, pg_temp.d(-2), 2, false, 0) $$, 'status: the update, its data date, 2 days old, nothing due');

-- Reminder data: starting within N days, not started.
select is((select array_agg(activity_code || '+' || days_until) from public.schedule_upcoming('c0000000-0000-0000-0000-000000000541', 14)),
  '{A120+2,A130+10}'::text[], 'upcoming: starting within 14 days (the one underway is not upcoming)');
select is((select array_agg(activity_code) from public.schedule_upcoming('c0000000-0000-0000-0000-000000000541', 90)),
  '{A120,A130,M200,A300}'::text[], 'upcoming: 90 days reaches the restroom finishes');
select pg_temp.login('a0000000-0000-0000-0000-000000000545');
select is_empty($$ select * from public.schedule_upcoming('c0000000-0000-0000-0000-000000000541', 90) $$, 'upcoming: as the caller (RLS)');

-- ---------------------------------------------------------------------------------------------------------------------
-- The next update supersedes it; Undo puts the old one back
-- ---------------------------------------------------------------------------------------------------------------------
select pg_temp.login('a0000000-0000-0000-0000-000000000543');
insert into res values ('v2', to_jsonb(pg_temp.import('e0000000-0000-0000-0000-000000000542',
  jsonb_build_array(
    jsonb_build_object('code', 'A120', 'name', 'Sample slab on grade pour', 'start', pg_temp.d(5), 'finish', pg_temp.d(5)),
    jsonb_build_object('code', 'A300', 'name', 'Sample restroom finishes', 'start', pg_temp.d(50), 'finish', pg_temp.d(70))),
  pg_temp.d(-3))));
select throws_ok($$ select * from public.schedule_publish(pg_temp.v('v2'), pg_temp.ver(pg_temp.v('v2'))) $$, '22023', null,
  'next: a data date older than the current one''s is refused');
select lives_ok($$ select public.schedule_draft_save(pg_temp.v('v2'), pg_temp.ver(pg_temp.v('v2')), null, pg_temp.d(0)) $$, 'next: data date today');
select pg_temp.login('a0000000-0000-0000-0000-000000000542');
select is((select drafts from public.schedule_status('c0000000-0000-0000-0000-000000000541')), 1, 'next: a manager sees one draft waiting');
select pg_temp.login('a0000000-0000-0000-0000-000000000543');
select results_eq($$ select number from public.schedule_publish(pg_temp.v('v2'), pg_temp.ver(pg_temp.v('v2'))) $$, $$ values (2) $$, 'next: Update 2');
select is(pg_temp.status_of(pg_temp.v('v1')), 'superseded', 'next: Update 1 is superseded');
select is(pg_temp.cal('c0000000-0000-0000-0000-000000000541'),
  '{lookahead:Sample restroom finishes,lookahead:Sample slab on grade pour}'::text[], 'next: the calendar follows the new version');
select is((select count(*)::int from public.calendar_entries ce where ce.source_type = 'schedule_activity'
            and ce.source_id in (select id from public.schedule_activities where version_id = pg_temp.v('v1'))), 0,
  'next: no line of the old version is left');
select pg_temp.login('a0000000-0000-0000-0000-000000000542');
select throws_ok($$ select public.schedule_unpublish(pg_temp.v('v2')) $$, '22023', 'Too late to undo.', 'undo: only the one who published it');
select pg_temp.login('a0000000-0000-0000-0000-000000000543');
select ok((select can_undo from public.schedule_version(pg_temp.v('v2'))), 'undo: offered to the publisher');
select lives_ok($$ select public.schedule_unpublish(pg_temp.v('v2')) $$, 'undo: the publisher, at once');
select results_eq($$ select pg_temp.status_of(pg_temp.v('v1')), pg_temp.status_of(pg_temp.v('v2')),
                            (select number from public.schedule_versions where id = pg_temp.v('v2')) $$,
  $$ values ('current'::text, 'draft'::text, 2) $$, 'undo: Update 1 is current again; the draft keeps its number');
select is(array_length(pg_temp.cal('c0000000-0000-0000-0000-000000000541'), 1), 4, 'undo: the calendar is back to Update 1');
select results_eq($$ select number from public.schedule_publish(pg_temp.v('v2'), pg_temp.ver(pg_temp.v('v2'))) $$, $$ values (2) $$,
  'undo: publishing again is the same Update 2');
reset role;
update public.schedule_versions set published_at = now() - interval '16 minutes' where id = pg_temp.v('v2');
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000543');
select throws_ok($$ select public.schedule_unpublish(pg_temp.v('v2')) $$, '22023', 'Too late to undo.', 'undo: 15 minutes at most');

-- Discard a draft, and Undo.
select pg_temp.login('a0000000-0000-0000-0000-000000000542');
insert into res values ('v3', to_jsonb(pg_temp.import('e0000000-0000-0000-0000-000000000543',
  '[{"name": "Sample punch walk", "start": "2026-12-01"}]'::jsonb)));
select lives_ok($$ select public.schedule_discard(pg_temp.v('v3'), true) $$, 'discard: a draft');
select is((select count(*)::int from public.schedule_versions_list('c0000000-0000-0000-0000-000000000541') where status = 'draft'), 0,
  'discard: gone from the list');
select lives_ok($$ select public.schedule_discard(pg_temp.v('v3'), false) $$, 'discard: Undo');
select is((select count(*)::int from public.schedule_versions_list('c0000000-0000-0000-0000-000000000541') where status = 'draft'), 1,
  'discard: back');
select lives_ok($$ select public.schedule_discard(pg_temp.v('v3'), true) $$, 'discard: again');
select is(pg_temp.import('e0000000-0000-0000-0000-000000000543', '[{"name": "x"}]'::jsonb), pg_temp.v('v3'),
  'discard: importing the same file again brings the draft back');
select is((select deleted_at from public.schedule_versions where id = pg_temp.v('v3')), null, 'discard: not discarded any more');
select results_eq($$ select status from public.schedule_versions_list('c0000000-0000-0000-0000-000000000541') $$,
  $$ values ('draft'::text), ('current'), ('superseded') $$, 'list: drafts first, then the newest published');
select pg_temp.login('a0000000-0000-0000-0000-000000000544');
select results_eq($$ select status from public.schedule_versions_list('c0000000-0000-0000-0000-000000000541') $$,
  $$ values ('current'::text), ('superseded') $$, 'list: a sub sees the published ones');

-- ---------------------------------------------------------------------------------------------------------------------
-- Each morning: the window rolls, and an old data date says an update is due (once per version)
-- ---------------------------------------------------------------------------------------------------------------------
select throws_ok($$ select public.schedule_daily() $$, '42501', null, 'daily: not for people');
reset role;
set local role service_role;
select pg_temp.login_service();
select is(public.schedule_daily(now() + interval '20 days'), 0, 'daily: 22 days old, nothing due');
select is(pg_temp.cal('c0000000-0000-0000-0000-000000000541'), '{lookahead:Sample restroom finishes}'::text[],
  'daily: the window rolled (the pour is past)');
select is(public.schedule_daily(now() + interval '36 days'), 1, 'daily: 36 days old, one board line');
select is(public.schedule_daily(now() + interval '37 days'), 0, 'daily: once per version');
select results_eq($$ select summary, audience_capability, entity_type, entity_id from public.activity
                      where project_id = 'c0000000-0000-0000-0000-000000000541' and kind = 'schedule.update_due' $$,
  $$ values ('Schedule update due (data date ' || to_char(pg_temp.d(0), 'Mon FMDD') || ')', 'schedule.read'::text, 'schedule_due'::text, pg_temp.v('v2')) $$,
  'daily: "Schedule update due" to everyone who reads the schedule');
select is((select count(*)::int from public.schedule_upcoming('c0000000-0000-0000-0000-000000000541', 90)), 2,
  'upcoming: the service role reads any job''s');
reset role;
select is(public.schedule_daily(now()), 0, 'daily: back to today, nothing more');
select is(pg_temp.cal('c0000000-0000-0000-0000-000000000541'),
  '{lookahead:Sample restroom finishes,lookahead:Sample slab on grade pour}'::text[], 'daily: and the window with it');

select * from finish();
rollback;
