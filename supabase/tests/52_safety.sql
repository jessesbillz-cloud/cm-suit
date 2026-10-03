begin;
select plan(135);
-- Safety (migration 0060): the role and matrix as data, the module and rail, the Safety folder, the starter library and
-- the company's own topics (RLS by company, managers only, version checks, remove and restore, a topic's PDF through its
-- own gate), meetings (start with the job's day, the next number and the outline as read, the token's hash only, the
-- repeat, the new QR, ticking members in, removing a line and Undo, close with its version, reopen within 15 minutes,
-- the sheet's facts, the service-only attach, the sheet kept on file), the calendar line, the no-login surface (service
-- role only, null for a wrong token, no names back, one line per name, the 18-hour limit, closed means gone), the
-- reminder every 10 working days (board line and tasks to the positions that run them, once, done by a closed
-- tailgate), and the Safety tool's badge.
\ir _helpers.psql

create temp table res (k text primary key, j jsonb);
grant all on res to public;
create function pg_temp.h(p text) returns text language sql immutable as $$ select encode(extensions.digest(p, 'sha256'), 'hex') $$;
create function pg_temp.j(p_k text) returns jsonb language sql stable as $$ select j from res where k = p_k $$;
create function pg_temp.tok(p_k text) returns text language sql stable as $$ select j->>'token' from res where k = p_k $$;
create function pg_temp.mid(p_k text) returns uuid language sql stable as $$ select (j->>'id')::uuid from res where k = p_k $$;
-- Read past RLS, whoever is logged in.
create function pg_temp.ver(p_id uuid) returns int language sql stable security definer as $$
  select version from public.safety_meetings where id = p_id $$;
create function pg_temp.hash_of(p_id uuid) returns text language sql stable security definer as $$
  select token_hash from public.safety_meetings where id = p_id $$;
create function pg_temp.lines(p_id uuid) returns int language sql stable security definer as $$
  select count(*)::int from public.safety_signins where meeting_id = p_id and removed_at is null $$;
create function pg_temp.sig() returns jsonb language sql immutable as $$
  select '[[[0.1,0.5],[0.2,0.4],[0.3,0.6]],[[0.5,0.5],[0.6,0.52]]]'::jsonb $$;
-- link_meeting_sign as the service role with one signature.
create function pg_temp.sign(p_k text, p_name text, p_company text default 'Sample Framing') returns jsonb language sql as $$
  select public.link_meeting_sign(pg_temp.mid(p_k), pg_temp.h(pg_temp.tok(p_k)), p_name, p_company, 'Framer', pg_temp.sig()) $$;
-- What a person sees of the meetings and lines of job J (logs them in).
create function pg_temp.seen(p_uid uuid) returns int language plpgsql as $$
begin
  perform pg_temp.login(p_uid);
  return (select count(*) from public.safety_meetings where project_id = 'c0000000-0000-0000-0000-000000000521')
       + (select count(*) from public.safety_signins where project_id = 'c0000000-0000-0000-0000-000000000521');
end $$;
grant execute on all functions in schema pg_temp to public;

select pg_temp.mk_user('a0000000-0000-0000-0000-000000000521', 'probe+sf-admin@example.test', 'Ada Admin');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000522', 'probe+sf-super@example.test', 'Sol Super');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000523', 'probe+sf-foreman@example.test', 'Fay Foreman');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000524', 'probe+sf-safety@example.test', 'Sid Safety');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000525', 'probe+sf-sub@example.test', 'Sam Sub');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000526', 'probe+sf-req@example.test', 'Rae Requester');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000527', 'probe+sf-bidder@example.test', 'Bo Bidder');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000528', 'probe+sf-out@example.test', 'Oz Outsider');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000529', 'probe+sf-pm@example.test', 'Pat Manager');

insert into public.orgs (id, name, kind, created_by) values
  ('b0000000-0000-0000-0000-000000000521', 'Sample Safety Builders', 'gc', 'a0000000-0000-0000-0000-000000000521'),
  ('b0000000-0000-0000-0000-000000000522', 'Sample Other Builders', 'gc', 'a0000000-0000-0000-0000-000000000528');
-- J and K: the company's jobs being built (Safety on). X: another company's. P: a prospect (Safety off until built).
-- L: being built, only its admin, for the working-day sums.
insert into public.projects (id, org_id, name, stage, timezone, created_by) values
  ('c0000000-0000-0000-0000-000000000521', 'b0000000-0000-0000-0000-000000000521', 'Safety Job J', 'construction',
   'America/Los_Angeles', 'a0000000-0000-0000-0000-000000000521'),
  ('c0000000-0000-0000-0000-000000000522', 'b0000000-0000-0000-0000-000000000521', 'Safety Job K', 'construction',
   'America/Los_Angeles', 'a0000000-0000-0000-0000-000000000521'),
  ('c0000000-0000-0000-0000-000000000523', 'b0000000-0000-0000-0000-000000000522', 'Other Job X', 'construction',
   'America/Los_Angeles', 'a0000000-0000-0000-0000-000000000528'),
  ('c0000000-0000-0000-0000-000000000524', 'b0000000-0000-0000-0000-000000000521', 'Prospect P', 'prospect',
   'America/Los_Angeles', 'a0000000-0000-0000-0000-000000000521'),
  ('c0000000-0000-0000-0000-000000000525', 'b0000000-0000-0000-0000-000000000521', 'Safety Job L', 'construction',
   'America/Los_Angeles', 'a0000000-0000-0000-0000-000000000521');
insert into public.project_members (org_id, project_id, user_id, invite_email, role, status)
select 'b0000000-0000-0000-0000-000000000521', m.project, u.id, u.email, m.role, 'active'
  from (values
    ('c0000000-0000-0000-0000-000000000521'::uuid, 'a0000000-0000-0000-0000-000000000522'::uuid, 'superintendent'),
    ('c0000000-0000-0000-0000-000000000521', 'a0000000-0000-0000-0000-000000000523', 'foreman'),
    ('c0000000-0000-0000-0000-000000000521', 'a0000000-0000-0000-0000-000000000524', 'safety'),
    ('c0000000-0000-0000-0000-000000000521', 'a0000000-0000-0000-0000-000000000525', 'sub'),
    ('c0000000-0000-0000-0000-000000000521', 'a0000000-0000-0000-0000-000000000526', 'requester'),
    ('c0000000-0000-0000-0000-000000000521', 'a0000000-0000-0000-0000-000000000527', 'bidder'),
    ('c0000000-0000-0000-0000-000000000521', 'a0000000-0000-0000-0000-000000000529', 'pm'),
    ('c0000000-0000-0000-0000-000000000522', 'a0000000-0000-0000-0000-000000000525', 'sub')) m (project, uid, role)
  join auth.users u on u.id = m.uid;

-- ---------------------------------------------------------------------------------------------------------------------
-- The role, the matrix, the module and the rail, as data
-- ---------------------------------------------------------------------------------------------------------------------
select results_eq($$ select description, recommended_tools from public.roles where name = 'safety' $$,
  $$ values ('Safety manager'::text, '{board,safety,calendar}'::text[]) $$, 'role: the safety manager, with Safety on its rail');
select set_eq($$ select role from public.role_permissions where capability = 'safety.read' $$,
  $$ select name from public.roles where not public.role_is_walled(name) and name <> 'requester' $$,
  'matrix: safety.read for every role but the walled ones and the requester');
select is((select array_agg(role order by role) from public.role_permissions where capability = 'safety.run'),
  '{foreman,inspector_admin,pm,project_admin,safety,superintendent}'::text[], 'matrix: who leads a meeting');
select is((select array_agg(role order by role) from public.role_permissions where capability = 'safety.manage'),
  '{inspector_admin,project_admin,safety}'::text[], 'matrix: who keeps the library (inspector_admin follows the project admin, 0044)');
select is((select array_agg(capability order by capability) from public.role_permissions where role = 'safety'),
  '{calendar.read,comments.write,members.view,revs.read,safety.manage,safety.read,safety.run,schedule.read}'::text[], 'matrix: the safety manager''s whole list (schedule.read from 0062)');
select results_eq($$ select name, recommended_tools from public.roles where name in ('superintendent', 'foreman') order by name $$,
  $$ values ('foreman'::text, '{board,calendar,dailies,safety,inspections,deliveries}'::text[]),
            ('superintendent', '{board,calendar,schedule,dailies,safety,inspections,deliveries}') $$,
  'rail: Safety right after Dailies for the superintendent and the foreman');
select ok('safety' = any (public.job_rail_tools()), 'rail: Safety is a job tool');
select ok((select 'safety' = any (modules) from public.projects where id = 'c0000000-0000-0000-0000-000000000521')
          and (select not 'safety' = any (modules) from public.projects where id = 'c0000000-0000-0000-0000-000000000524'),
  'module: on for a job being built, off for a prospect');
update public.projects set stage = 'construction' where id = 'c0000000-0000-0000-0000-000000000524';
select ok((select 'safety' = any (modules) from public.projects where id = 'c0000000-0000-0000-0000-000000000524'),
  'module: comes on when the job starts building');

-- ---------------------------------------------------------------------------------------------------------------------
-- Tables: deny by default
-- ---------------------------------------------------------------------------------------------------------------------
select ok(not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                       where n.nspname = 'public' and c.relname in ('safety_topics', 'safety_meetings', 'safety_signins')
                         and not c.relrowsecurity), 'tables: RLS on');
select ok(not exists (select 1 from unnest(array['safety_topics', 'safety_meetings', 'safety_signins']) t
                       where has_table_privilege('anon', 'public.' || t, 'SELECT')
                          or has_table_privilege('authenticated', 'public.' || t, 'INSERT')
                          or has_table_privilege('authenticated', 'public.' || t, 'UPDATE')
                          or has_table_privilege('authenticated', 'public.' || t, 'DELETE')
                          or has_table_privilege('service_role', 'public.' || t, 'DELETE')),
  'tables: anon reads nothing; signed in: read only, writes go through the RPCs; nobody deletes');
select ok(not has_column_privilege('authenticated', 'public.safety_meetings', 'token_hash', 'SELECT')
          and not has_column_privilege('service_role', 'public.safety_meetings', 'token_hash', 'SELECT')
          and has_column_privilege('authenticated', 'public.safety_meetings', 'token_made_at', 'SELECT'),
  'tables: the token''s hash is never handed out (when it was made is)');
select ok(not has_function_privilege('authenticated', 'public.link_meeting_open(uuid, text)', 'EXECUTE')
          and not has_function_privilege('authenticated', 'public.link_meeting_sign(uuid, text, text, text, text, jsonb)', 'EXECUTE')
          and not has_function_privilege('authenticated', 'public.safety_meeting_attach(uuid, uuid, text)', 'EXECUTE')
          and not has_function_privilege('authenticated', 'public.safety_tailgate_check(timestamp with time zone)', 'EXECUTE')
          and not has_function_privilege('anon', 'public.safety_meeting_start(uuid, uuid, text, uuid, text, text, uuid, text)', 'EXECUTE')
          and has_function_privilege('authenticated', 'public.safety_meeting_start(uuid, uuid, text, uuid, text, text, uuid, text)', 'EXECUTE'),
  'functions: the link, the attach and the reminder for the service role only; the RPCs for people, never anon');

-- ---------------------------------------------------------------------------------------------------------------------
-- The starter library
-- ---------------------------------------------------------------------------------------------------------------------
select is((select count(*)::int from public.safety_topics where org_id is null), 15, 'starters: 15 built-in talks');
select is_empty($$ select slug from public.safety_topics where org_id is null
                    and (cardinality(points) not between 5 and 8 or cardinality(questions) <> 2 or language <> 'en'
                         or source is null or source_url !~ '^https://www\.(dir\.ca\.gov/title8|osha\.gov/laws-regs)/') $$,
  'starters: 5 to 8 points, 2 questions, English, a regulation and a link to its official page');
select is((select count(distinct category)::int from public.safety_topics where org_id is null), 7, 'starters: in 7 categories');
select ok(exists (select 1 from public.safety_topics where slug = 'heat-illness' and source = '8 CCR 3395'),
  'starters: heat illness rests on 8 CCR 3395');
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000527');
select is((select count(*)::int from public.safety_topics), 15, 'starters: readable by anyone signed in (no user data in them)');
reset role;
set local role anon;
select throws_ok($$ select count(*) from public.safety_topics $$, '42501', null, 'starters: not for anon');
reset role;

-- ---------------------------------------------------------------------------------------------------------------------
-- The company's library (safety.manage)
-- ---------------------------------------------------------------------------------------------------------------------
-- A PDF talk in J's Safety folder, and a PDF somewhere else.
insert into res values ('folder', to_jsonb(public.safety_folder_make('c0000000-0000-0000-0000-000000000521')));
insert into public.files (id, org_id, project_id, folder_id, storage_path, original_name, mime, created_by, scan_status) values
  ('e0000000-0000-0000-0000-000000000521', 'b0000000-0000-0000-0000-000000000521', 'c0000000-0000-0000-0000-000000000521',
   (pg_temp.j('folder')#>>'{}')::uuid, 'test/safety/talk.pdf', 'Sample Crane Talk.pdf', 'application/pdf',
   'a0000000-0000-0000-0000-000000000524', 'clean'),
  ('e0000000-0000-0000-0000-000000000522', 'b0000000-0000-0000-0000-000000000521', 'c0000000-0000-0000-0000-000000000521',
   (select id from public.folders where project_id = 'c0000000-0000-0000-0000-000000000521' and kind = 'plans' limit 1),
   'test/safety/plan.pdf', 'Sample Plan.pdf', 'application/pdf', 'a0000000-0000-0000-0000-000000000521', 'clean');
select results_eq($$ select name, kind, parent_id is null from public.folders where id = (pg_temp.j('folder')#>>'{}')::uuid $$,
  $$ values ('Safety'::text, 'safety'::text, true) $$, 'folder: "Safety" at the top of the job, its own kind');
select results_eq($$ select capability, can_read, can_write from public.folder_access
                     where folder_id = (pg_temp.j('folder')#>>'{}')::uuid order by capability $$,
  $$ values ('safety.manage'::text, true, true), ('safety.read', true, false), ('safety.run', true, true) $$,
  'folder: safety.read reads; leaders and managers upload talks');
select ok(public.folder_name_reserved('c0000000-0000-0000-0000-000000000521', null, 'Safety'), 'folder: the name is the system''s');

set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000524');
select is(public.safety_folder('c0000000-0000-0000-0000-000000000521'), (pg_temp.j('folder')#>>'{}')::uuid, 'folder: the same one again');
select ok(pg_temp.can_read_as('a0000000-0000-0000-0000-000000000525', (pg_temp.j('folder')#>>'{}')::uuid)
          and not pg_temp.can_write_as('a0000000-0000-0000-0000-000000000525', (pg_temp.j('folder')#>>'{}')::uuid)
          and pg_temp.can_write_as('a0000000-0000-0000-0000-000000000522', (pg_temp.j('folder')#>>'{}')::uuid)
          and not pg_temp.can_read_as('a0000000-0000-0000-0000-000000000526', (pg_temp.j('folder')#>>'{}')::uuid),
  'folder: a sub reads it, a super writes it, a requester neither');
select pg_temp.login('a0000000-0000-0000-0000-000000000525');
select throws_ok($$ select public.safety_folder('c0000000-0000-0000-0000-000000000521') $$, '42501', 'forbidden',
  'folder: not for someone who only reads');

select pg_temp.login('a0000000-0000-0000-0000-000000000524');
insert into res select 'topic', to_jsonb(t) from public.safety_topic_save('c0000000-0000-0000-0000-000000000521', null, null, 'equipment',
  '  Crane   signals ', array['Only the signal person talks to the operator.', ' ', 'Agree on the signals first.'],
  array['Who is the signal person today?'], '8 CCR 5001', 'https://www.dir.ca.gov/title8/5001.html',
  'e0000000-0000-0000-0000-000000000521') t;
select results_eq($$ select org_id, title, points, questions, created_by from public.safety_topics where id = pg_temp.mid('topic') $$,
  $$ values ('b0000000-0000-0000-0000-000000000521'::uuid, 'Crane signals'::text,
             '{Only the signal person talks to the operator.,Agree on the signals first.}'::text[],
             '{Who is the signal person today?}'::text[], 'a0000000-0000-0000-0000-000000000524'::uuid) $$,
  'library: the company''s topic, tidied, blank lines dropped');
select throws_ok($$ select public.safety_topic_save('c0000000-0000-0000-0000-000000000521', null, null, 'equipment', 'Other',
  array['A point'], '{}', null, null, 'e0000000-0000-0000-0000-000000000522') $$, '22023', 'Pick a PDF from a Safety folder.',
  'library: a PDF only from a Safety folder');
select throws_ok($$ select public.safety_topic_save('c0000000-0000-0000-0000-000000000521', null, null, 'equipment', 'Other',
  array['A point'], '{}', null, 'http://example.test/x', null) $$, '22023', 'The link must start with https://',
  'library: links are https');
select throws_ok($$ select public.safety_topic_save('c0000000-0000-0000-0000-000000000521', null, null, 'nope', 'Other',
  array['A point'], '{}', null, null, null) $$, '22023', 'Pick a category.', 'library: a known category');
select throws_ok($$ select public.safety_topic_save('c0000000-0000-0000-0000-000000000521', null, null, 'site', 'Empty',
  '{}', '{}', null, null, null) $$, '22023', 'Add the points or a PDF.', 'library: something to read out');
select throws_ok($$ select public.safety_topic_save('c0000000-0000-0000-0000-000000000521',
  (select id from public.safety_topics where slug = 'ladders'), 1, 'falls', 'Ladders', array['Mine now'], '{}', null, null, null) $$,
  '42501', 'Built-in topics stay as they are.', 'library: built-ins stay as they are');
select throws_ok(format($$ select public.safety_topic_save('c0000000-0000-0000-0000-000000000521', %L, 99, 'equipment', 'Crane signals',
  array['A point'], '{}', null, null, null) $$, pg_temp.mid('topic')), '40001', null, 'library: an edit carries the version');
select is((select t.version from public.safety_topic_save('c0000000-0000-0000-0000-000000000521', pg_temp.mid('topic'),
  (pg_temp.j('topic')->>'version')::int, 'equipment', 'Crane signals', array['Only the signal person talks to the operator.'],
  '{}', '8 CCR 5001', null, 'e0000000-0000-0000-0000-000000000521') t), 2, 'library: saved with its version');
select pg_temp.login('a0000000-0000-0000-0000-000000000529');
select throws_ok($$ select public.safety_topic_save('c0000000-0000-0000-0000-000000000521', null, null, 'site', 'Mine',
  array['A point'], '{}', null, null, null) $$, '42501', 'forbidden', 'library: a PM leads meetings but doesn''t keep the library');
select pg_temp.login('a0000000-0000-0000-0000-000000000525');
select is((select count(*)::int from public.safety_topics where org_id is not null), 1, 'library: a sub on the company''s job reads it');
select pg_temp.login('a0000000-0000-0000-0000-000000000528');
select is((select count(*)::int from public.safety_topics where org_id is not null), 0, 'library: another company never sees it');
select pg_temp.login('a0000000-0000-0000-0000-000000000526');
select is((select count(*)::int from public.safety_topics where org_id is not null), 0, 'library: a requester doesn''t');

-- The topic's PDF from the company's other job: its own gate, logged.
select pg_temp.login('a0000000-0000-0000-0000-000000000525');
select results_eq($$ select original_name from public.safety_topic_file('c0000000-0000-0000-0000-000000000522', pg_temp.mid('topic')) $$,
  $$ values ('Sample Crane Talk.pdf'::text) $$, 'topic PDF: a reader on the company''s other job opens it');
reset role;
select ok(exists (select 1 from public.downloads where file_id = 'e0000000-0000-0000-0000-000000000521'
                  and user_id = 'a0000000-0000-0000-0000-000000000525'), 'topic PDF: logged as a download');
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000528');
select throws_ok($$ select * from public.safety_topic_file('c0000000-0000-0000-0000-000000000523', pg_temp.mid('topic')) $$,
  'P0002', 'not_found', 'topic PDF: another company''s job can''t reach it');
select pg_temp.login('a0000000-0000-0000-0000-000000000525');
select throws_ok($$ select * from public.safety_topic_file('c0000000-0000-0000-0000-000000000522',
  (select id from public.safety_topics where slug = 'ladders')) $$, 'P0002', 'not_found', 'topic PDF: a topic without one');
reset role;
update public.files set folder_id = (select id from public.folders where project_id = 'c0000000-0000-0000-0000-000000000521' and kind = 'plans' limit 1)
 where id = 'e0000000-0000-0000-0000-000000000521';
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000525');
select throws_ok($$ select * from public.safety_topic_file('c0000000-0000-0000-0000-000000000522', pg_temp.mid('topic')) $$,
  'P0002', 'not_found', 'topic PDF: a file moved out of the Safety folder is no longer handed out');
reset role;
update public.files set folder_id = (pg_temp.j('folder')#>>'{}')::uuid where id = 'e0000000-0000-0000-0000-000000000521';
set local role authenticated;

-- Remove and Undo.
select pg_temp.login('a0000000-0000-0000-0000-000000000524');
select ok(public.safety_topic_remove('c0000000-0000-0000-0000-000000000521', pg_temp.mid('topic'), true) > 0, 'library: removed');
select pg_temp.login('a0000000-0000-0000-0000-000000000525');
select is((select count(*)::int from public.safety_topics where org_id is not null), 0, 'library: gone for readers');
select pg_temp.login('a0000000-0000-0000-0000-000000000524');
select is((select count(*)::int from public.safety_topics where org_id is not null), 1, 'library: a manager still sees it (for Undo)');
select ok(public.safety_topic_remove('c0000000-0000-0000-0000-000000000521', pg_temp.mid('topic'), false) > 0, 'library: Undo');
select pg_temp.login('a0000000-0000-0000-0000-000000000525');
select is((select count(*)::int from public.safety_topics where org_id is not null), 1, 'library: back for readers');

-- ---------------------------------------------------------------------------------------------------------------------
-- Start a meeting
-- ---------------------------------------------------------------------------------------------------------------------
select pg_temp.login('a0000000-0000-0000-0000-000000000522');
insert into res select 't1', to_jsonb(s) from public.safety_meeting_start('c0000000-0000-0000-0000-000000000521',
  'f0000000-0000-0000-0000-000000000521', 'tailgate', (select id from public.safety_topics where slug = 'heat-illness'),
  null, '', null, ' North  gate ') s;
select is((pg_temp.j('t1')->>'number')::int, 1, 'start: the job''s first meeting is number 1');
select ok(pg_temp.tok('t1') ~ '^[A-Za-z0-9_-]{43}$', 'start: a 43-character sign-in token, once');
reset role;
select results_eq(
  $$ select kind, held_on, title, cardinality(points), cardinality(questions), source, leader_id, location, status
       from public.safety_meetings where id = pg_temp.mid('t1') $$,
  $$ values ('tailgate'::text, (now() at time zone 'America/Los_Angeles')::date, 'Heat illness'::text, 7, 2, '8 CCR 3395'::text,
             'a0000000-0000-0000-0000-000000000522'::uuid, 'North gate'::text, 'open'::text) $$,
  'start: the job''s day, the topic''s outline as read, me leading, open');
select is(pg_temp.hash_of(pg_temp.mid('t1')), pg_temp.h(pg_temp.tok('t1')), 'start: only the token''s sha256 is kept');
select ok(not exists (select 1 from public.audit_events where details::text like '%' || pg_temp.tok('t1') || '%'),
  'start: the raw token is kept nowhere');
select results_eq($$ select kind, read_capability, status, title from public.calendar_entries
                     where source_type = 'safety_meeting' and source_id = pg_temp.mid('t1') $$,
  $$ values ('meetings'::text, 'safety.read'::text, 'pending'::text, 'Tailgate 1: Heat illness'::text) $$,
  'calendar: the meeting is a Meetings line for safety readers');
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000522');
insert into res select 't1again', to_jsonb(s) from public.safety_meeting_start('c0000000-0000-0000-0000-000000000521',
  'f0000000-0000-0000-0000-000000000521', 'tailgate', null, 'Ignored', '', null, '') s;
select ok(pg_temp.mid('t1again') = pg_temp.mid('t1') and pg_temp.tok('t1again') <> pg_temp.tok('t1'),
  'start: a repeat is the same meeting with a fresh token');
select is(pg_temp.hash_of(pg_temp.mid('t1')), pg_temp.h(pg_temp.tok('t1again')), 'start: the old token stops');
update res set j = pg_temp.j('t1again') where k = 't1';
select pg_temp.login('a0000000-0000-0000-0000-000000000529');
insert into res select 'm2', to_jsonb(s) from public.safety_meeting_start('c0000000-0000-0000-0000-000000000521',
  'f0000000-0000-0000-0000-000000000522', 'meeting', null, 'Precon with the framer', 'Scope and schedule.',
  'e0000000-0000-0000-0000-000000000521', 'Trailer') s;
select is((pg_temp.j('m2')->>'number')::int, 2, 'start: any job meeting, the next number');
select throws_ok($$ select public.safety_meeting_start('c0000000-0000-0000-0000-000000000521', gen_random_uuid(), 'meeting',
  null, 'With a plan', '', 'e0000000-0000-0000-0000-000000000522', '') $$, '22023', 'Pick a PDF from this job''s Safety folder.',
  'start: an own topic''s PDF comes from the job''s Safety folder');
select throws_ok($$ select public.safety_meeting_start('c0000000-0000-0000-0000-000000000521', gen_random_uuid(), 'tailgate',
  null, ' ', '', null, '') $$, '22023', 'Name the topic.', 'start: a topic or a title');
select throws_ok($$ select public.safety_meeting_start('c0000000-0000-0000-0000-000000000521', gen_random_uuid(), 'party',
  null, 'x', '', null, '') $$, '22023', 'Pick Tailgate or Meeting.', 'start: tailgate or meeting');
select pg_temp.login('a0000000-0000-0000-0000-000000000528');
select throws_ok($$ select public.safety_meeting_start('c0000000-0000-0000-0000-000000000523', gen_random_uuid(), 'tailgate',
  pg_temp.mid('topic'), null, '', null, '') $$,
  '22023', 'Pick a topic from the library.', 'start: never another company''s topic');
select pg_temp.login('a0000000-0000-0000-0000-000000000525');
select throws_ok($$ select public.safety_meeting_start('c0000000-0000-0000-0000-000000000521', gen_random_uuid(), 'tailgate',
  null, 'x', '', null, '') $$, '42501', 'forbidden', 'start: a sub signs in, never leads');

-- Who sees the meetings.
select ok(pg_temp.seen('a0000000-0000-0000-0000-000000000525') = 2 and pg_temp.seen('a0000000-0000-0000-0000-000000000529') = 2,
  'read: the job''s readers see its meetings');
select ok(pg_temp.seen('a0000000-0000-0000-0000-000000000526') = 0 and pg_temp.seen('a0000000-0000-0000-0000-000000000527') = 0
          and pg_temp.seen('a0000000-0000-0000-0000-000000000528') = 0, 'read: a requester, a bidder and another company see none');

-- ---------------------------------------------------------------------------------------------------------------------
-- The no-login page's SQL
-- ---------------------------------------------------------------------------------------------------------------------
select pg_temp.login('a0000000-0000-0000-0000-000000000522');
select throws_ok($$ select public.link_meeting_open(pg_temp.mid('t1'), pg_temp.h(pg_temp.tok('t1'))) $$, '42501', null,
  'link: not for signed-in people');
reset role;
set local role service_role;
select pg_temp.login_service();
insert into res values ('open', public.link_meeting_open(pg_temp.mid('t1'), pg_temp.h(pg_temp.tok('t1'))));
select results_eq($$ select k from jsonb_object_keys(pg_temp.j('open')) k order by 1 $$,
  $$ values ('held_on'::text), ('kind'), ('number'), ('open'), ('project_name'), ('title') $$,
  'link open: the job, the number, the kind, the title, the day and whether it takes signatures; no names');
select ok(pg_temp.j('open')->>'project_name' = 'Safety Job J' and (pg_temp.j('open')->>'open')::boolean, 'link open: open now');
select is(public.link_meeting_open(pg_temp.mid('t1'), pg_temp.h('wrong')), null, 'link open: a wrong token opens nothing');
select is(public.link_meeting_open(pg_temp.mid('m2'), pg_temp.h(pg_temp.tok('t1'))), null, 'link open: one meeting''s token opens only it');
select is(pg_temp.sign('t1', '  Lee   Laborer ')->>'status', 'signed', 'sign: signed');
select results_eq($$ select k from jsonb_object_keys(pg_temp.sign('t1', 'Lee Laborer')) k $$, $$ values ('status'::text) $$,
  'sign: the answer is the status only');
select is(pg_temp.sign('t1', 'LEE LABORER')->>'status', 'signed', 'sign: the same name again answers the same');
select is(pg_temp.lines(pg_temp.mid('t1')), 1, 'sign: one line per name');
select is(pg_temp.sign('t1', 'Mo Mason', 'Sample Masonry')->>'status', 'signed', 'sign: the next person');
select throws_ok($$ select public.link_meeting_sign(pg_temp.mid('t1'), pg_temp.h(pg_temp.tok('t1')), 'X', 'Y', '', '[[[0.5,0.5]]]') $$,
  '22023', 'Sign in the box.', 'sign: a dot is not a signature');
select throws_ok($$ select public.link_meeting_sign(pg_temp.mid('t1'), pg_temp.h(pg_temp.tok('t1')), 'X', 'Y', '', '[[[2,0.5],[0,0]]]') $$,
  '22023', 'Sign in the box.', 'sign: strokes stay inside the pad');
select throws_ok($$ select public.link_meeting_sign(pg_temp.mid('t1'), pg_temp.h(pg_temp.tok('t1')), 'X', 'Y', '', '{"a":1}') $$,
  '22023', 'Sign in the box.', 'sign: strokes only');
select throws_ok($$ select public.link_meeting_sign(pg_temp.mid('t1'), pg_temp.h(pg_temp.tok('t1')), ' ', 'Y', '', pg_temp.sig()) $$,
  '22023', 'Enter your name.', 'sign: a name');
select throws_ok($$ select public.link_meeting_sign(pg_temp.mid('t1'), pg_temp.h(pg_temp.tok('t1')), 'X', '', '', pg_temp.sig()) $$,
  '22023', 'Enter your company.', 'sign: a company');
select is(public.link_meeting_sign(pg_temp.mid('t1'), pg_temp.h('wrong'), 'X', 'Y', '', pg_temp.sig()), null,
  'sign: a wrong token signs nothing');
select ok(public.safety_signature_ok('[[[0,0],[1,1]]]') and not public.safety_signature_ok('[]')
          and not public.safety_signature_ok('[[[0.1,0.1,0.1],[0.2,0.2]]]') and not public.safety_signature_ok('[[["a",0.1],[0.2,0.2]]]')
          and not public.safety_signature_ok(null),
  'signature: points of two numbers 0..1, at least two in all');
reset role;
select ok(exists (select 1 from public.audit_events where action = 'safety.sign' and actor_kind = 'public_link'
                  and details->>'name' = 'Lee Laborer'), 'sign: audited as the public link');

-- ---------------------------------------------------------------------------------------------------------------------
-- The leader: tick members in, take a line off, a new QR
-- ---------------------------------------------------------------------------------------------------------------------
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000522');
insert into res values ('tick', to_jsonb(public.safety_tick(pg_temp.mid('t1'), 'a0000000-0000-0000-0000-000000000523')));
select is(to_jsonb(public.safety_tick(pg_temp.mid('t1'), 'a0000000-0000-0000-0000-000000000523')), pg_temp.j('tick'),
  'tick: twice is one line');
reset role;
select results_eq($$ select name, via, person_id, added_by, signature is null from public.safety_signins
                     where id = (pg_temp.j('tick')#>>'{}')::uuid $$,
  $$ values ('Fay Foreman'::text, 'member'::text, 'a0000000-0000-0000-0000-000000000523'::uuid,
             'a0000000-0000-0000-0000-000000000522'::uuid, true) $$, 'tick: the member''s name, ticked in by the leader');
set local role service_role;
select pg_temp.login_service();
select is(pg_temp.sign('t1', 'fay foreman')->>'status', 'signed', 'tick: the ticked-in person also signs from the QR');
reset role;
select ok((select signature is not null and person_id is not null from public.safety_signins where id = (pg_temp.j('tick')#>>'{}')::uuid)
          and pg_temp.lines(pg_temp.mid('t1')) = 3, 'tick: the signature completes the same line');
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000522');
select throws_ok($$ select public.safety_tick(pg_temp.mid('t1'), 'a0000000-0000-0000-0000-000000000528') $$, '22023',
  'Pick someone on this job.', 'tick: only people on the job');
select pg_temp.login('a0000000-0000-0000-0000-000000000523');
select throws_ok($$ select public.safety_tick(pg_temp.mid('t1'), 'a0000000-0000-0000-0000-000000000525') $$, '42501', 'forbidden',
  'tick: only the leader (or a safety manager)');
select pg_temp.login('a0000000-0000-0000-0000-000000000524');
select lives_ok($$ select public.safety_tick(pg_temp.mid('t1'), 'a0000000-0000-0000-0000-000000000525') $$,
  'tick: the safety manager may tick in on anyone''s meeting');
select is(pg_temp.lines(pg_temp.mid('t1')), 4, 'tick: four on the sheet');
select pg_temp.login('a0000000-0000-0000-0000-000000000522');
select lives_ok($$ select public.safety_signin_remove((select id from public.safety_signins where name = 'Mo Mason'), true) $$,
  'remove: a line comes off');
select is(pg_temp.lines(pg_temp.mid('t1')), 3, 'remove: three on the sheet');
select lives_ok($$ select public.safety_signin_remove((select id from public.safety_signins where name = 'Mo Mason'), false) $$,
  'remove: Undo puts it back');
select results_eq($$ select number, signed, leader_name from public.safety_meetings_list('c0000000-0000-0000-0000-000000000521') $$,
  $$ values (2, 0, 'Pat Manager'::text), (1, 4, 'Sol Super') $$, 'list: newest first, with the signed count and the leader');
select ok((select can_lead from public.safety_meeting(pg_temp.mid('t1'))), 'detail: the leader leads');
select pg_temp.login('a0000000-0000-0000-0000-000000000523');
select ok(not (select can_lead from public.safety_meeting(pg_temp.mid('t1'))), 'detail: someone else on the job only reads');
select throws_ok($$ select public.safety_meeting_qr(pg_temp.mid('t1')) $$, '42501', 'forbidden', 'new QR: the leader only');
select pg_temp.login('a0000000-0000-0000-0000-000000000522');
insert into res select 'qr', to_jsonb(q) from public.safety_meeting_qr(pg_temp.mid('t1')) q;
select is(pg_temp.hash_of(pg_temp.mid('t1')), pg_temp.h(pg_temp.tok('qr')), 'new QR: the new token works, the old one stops');
update res set j = pg_temp.j('t1') || jsonb_build_object('token', pg_temp.tok('qr')) where k = 't1';

-- The reminder before any tailgate is closed: due (it's a working day in the job's zone at the moment checked).
reset role;
select pg_temp.login_service();
select is(public.safety_tailgate_check('2026-10-07 18:00+00'), 1, 'reminder: due only on the jobs with someone whose position runs them');
select results_eq(
  $$ select array_agg(assignee_user_id order by assignee_user_id) from public.tasks
      where project_id = 'c0000000-0000-0000-0000-000000000521' and kind = 'safety.tailgate_due' and done_at is null $$,
  $$ values ('{a0000000-0000-0000-0000-000000000522,a0000000-0000-0000-0000-000000000523,a0000000-0000-0000-0000-000000000524}'::uuid[]) $$,
  'reminder: a task for the super, the foreman and the safety manager (their positions run them), not the PM');
select ok(exists (select 1 from public.activity where project_id = 'c0000000-0000-0000-0000-000000000521'
                  and kind = 'safety.tailgate_due' and audience_capability = 'safety.run'), 'reminder: a board line to who may run one');
select is(public.safety_tailgate_check('2026-10-07 19:00+00'), 0, 'reminder: once until it is done');
select is(public.safety_tailgate_check('2026-10-10 18:00+00'), 0, 'reminder: never on a weekend');
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000522');
select results_eq($$ select entity_type, n from public.my_tool_counts('c0000000-0000-0000-0000-000000000521') order by 1 $$,
  $$ values ('safety_due'::text, 1), ('safety_meeting', 1) $$, 'badge: the open meeting I lead and the reminder count on Safety');

-- ---------------------------------------------------------------------------------------------------------------------
-- Close, the sheet, reopen
-- ---------------------------------------------------------------------------------------------------------------------
select throws_ok($$ select public.safety_meeting_sheet(pg_temp.mid('t1')) $$, '22023', 'Close the meeting first.',
  'sheet: only for a closed meeting');
select throws_ok(format('select public.safety_meeting_close(%L, %s)', pg_temp.mid('t1'), pg_temp.ver(pg_temp.mid('t1')) - 1), '40001',
  null, 'close: carries the version');
select pg_temp.login('a0000000-0000-0000-0000-000000000523');
select throws_ok(format('select public.safety_meeting_close(%L, %s)', pg_temp.mid('t1'), pg_temp.ver(pg_temp.mid('t1'))), '42501',
  'forbidden', 'close: the leader or a safety manager');
select pg_temp.login('a0000000-0000-0000-0000-000000000522');
select ok(public.safety_meeting_close(pg_temp.mid('t1'), pg_temp.ver(pg_temp.mid('t1'))) > 0, 'close: closed');
select ok(public.safety_meeting_close(pg_temp.mid('t1'), 1) > 0, 'close: a repeat by the same person is fine');
reset role;
select results_eq($$ select status, closed_by, token_made_at is null from public.safety_meetings where id = pg_temp.mid('t1') $$,
  $$ values ('closed'::text, 'a0000000-0000-0000-0000-000000000522'::uuid, true) $$, 'close: closed by the leader, the token gone');
select is(pg_temp.hash_of(pg_temp.mid('t1')), null, 'close: no QR opens it any more');
select is((select count(*)::int from public.tasks where kind = 'safety.tailgate_due'
           and project_id = 'c0000000-0000-0000-0000-000000000521' and done_at is null), 0, 'close: a tailgate completes the reminders');
select ok(exists (select 1 from public.activity where entity_id = pg_temp.mid('t1') and kind = 'safety.closed'
                  and audience_capability = 'safety.manage' and summary = 'Tailgate 1 closed: Heat illness (4 signed)'),
  'close: a board line for the safety managers');
select is((select status from public.calendar_entries where source_type = 'safety_meeting' and source_id = pg_temp.mid('t1')),
  'confirmed', 'calendar: a closed meeting is confirmed');
set local role service_role;
select pg_temp.login_service();
select is(public.link_meeting_open(pg_temp.mid('t1'), pg_temp.h(pg_temp.tok('t1'))), null, 'closed: the QR opens nothing');
select is(pg_temp.sign('t1', 'Late Larry'), null, 'closed: nobody signs');
reset role;
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000525');
insert into res values ('sheet', public.safety_meeting_sheet(pg_temp.mid('t1')));
select ok(jsonb_array_length(pg_temp.j('sheet')->'attendees') = 4 and pg_temp.j('sheet')->>'leader_name' = 'Sol Super'
          and pg_temp.j('sheet')->>'job_name' = 'Safety Job J' and jsonb_array_length(pg_temp.j('sheet')->'points') = 7,
  'sheet: the job, the leader, the outline and the four on the sheet');
select ok((select bool_and(case a->>'name' when 'Sam Sub' then a->'signature' = 'null'::jsonb and a->>'added_by_name' = 'Sid Safety'
                                           else jsonb_typeof(a->'signature') = 'array' end)
             from jsonb_array_elements(pg_temp.j('sheet')->'attendees') a),
  'sheet: signatures for those who signed; the ticked-in member without one, and who ticked them in');
select pg_temp.login('a0000000-0000-0000-0000-000000000526');
select throws_ok($$ select public.safety_meeting_sheet(pg_temp.mid('t1')) $$, 'P0002', 'not_found', 'sheet: not for a requester');

-- The sheet the server made: recorded by the service role only, kept on file.
select throws_ok($$ select public.safety_meeting_attach(pg_temp.mid('t1'), 'e0000000-0000-0000-0000-000000000521', repeat('a', 64)) $$,
  '42501', null, 'attach: not for people');
reset role;
insert into public.files (id, org_id, project_id, folder_id, storage_path, original_name, mime, created_by, scan_status) values
  ('e0000000-0000-0000-0000-000000000523', 'b0000000-0000-0000-0000-000000000521', 'c0000000-0000-0000-0000-000000000521',
   (pg_temp.j('folder')#>>'{}')::uuid, 'test/safety/sheet.pdf', 'Sample sheet.pdf', 'application/pdf',
   'a0000000-0000-0000-0000-000000000522', 'clean');
set local role service_role;
select pg_temp.login_service();
select throws_ok($$ select public.safety_meeting_attach(pg_temp.mid('t1'), 'e0000000-0000-0000-0000-000000000522', repeat('a', 64)) $$,
  '22023', 'That sheet is not in this job''s Safety folder.', 'attach: only a file of the job''s Safety folder');
select lives_ok($$ select public.safety_meeting_attach(pg_temp.mid('t1'), 'e0000000-0000-0000-0000-000000000523', repeat('a', 64)) $$,
  'attach: recorded');
reset role;
select throws_ok($$ update public.files set deleted_at = now() where id = 'e0000000-0000-0000-0000-000000000523' $$, '42501',
  'A sign-in sheet stays on file.', 'attach: a sign-in sheet stays on file');

-- Undo a close: the one who closed it, within 15 minutes; a fresh token.
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000524');
select throws_ok($$ select public.safety_meeting_reopen(pg_temp.mid('t1')) $$, '22023', 'Too late to undo.',
  'reopen: only the one who closed it');
select pg_temp.login('a0000000-0000-0000-0000-000000000522');
insert into res select 'reopen', to_jsonb(r) from public.safety_meeting_reopen(pg_temp.mid('t1')) r;
select ok(pg_temp.hash_of(pg_temp.mid('t1')) = pg_temp.h(pg_temp.tok('reopen'))
          and (select status from public.safety_meeting(pg_temp.mid('t1'))) = 'open', 'reopen: open again with a new QR');
select ok(public.safety_meeting_close(pg_temp.mid('t1'), (pg_temp.j('reopen')->>'version')::int) > 0, 'reopen: and closed again');
reset role;
update public.safety_meetings set closed_at = now() - interval '16 minutes' where id = pg_temp.mid('t1');
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000522');
select throws_ok($$ select public.safety_meeting_reopen(pg_temp.mid('t1')) $$, '22023', 'Too late to undo.', 'reopen: 15 minutes at most');

-- ---------------------------------------------------------------------------------------------------------------------
-- 18 hours, then sign-in ends
-- ---------------------------------------------------------------------------------------------------------------------
reset role;
update public.safety_meetings set opened_at = now() - interval '19 hours' where id = pg_temp.mid('m2');
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000529');
select throws_ok($$ select public.safety_meeting_qr(pg_temp.mid('m2')) $$, '22023', 'Sign-in has ended. Close the meeting.',
  'after 18 hours: no new QR');
reset role;
update public.safety_meetings set token_hash = pg_temp.h('m2-token'), token_made_at = now() where id = pg_temp.mid('m2');
set local role service_role;
select pg_temp.login_service();
select is((public.link_meeting_open(pg_temp.mid('m2'), pg_temp.h('m2-token'))->>'open')::boolean, false, 'after 18 hours: the page says it ended');
select throws_ok($$ select public.link_meeting_sign(pg_temp.mid('m2'), pg_temp.h('m2-token'), 'Late Larry', 'Sample', '', pg_temp.sig()) $$,
  '22023', 'This sign-in has ended.', 'after 18 hours: nobody signs');
reset role;

-- ---------------------------------------------------------------------------------------------------------------------
-- Every 10 working days
-- ---------------------------------------------------------------------------------------------------------------------
select is(public.safety_due_on('c0000000-0000-0000-0000-000000000525', '2026-10-06'), '2026-10-06'::date, 'due: none yet, due now');
insert into public.safety_meetings (created_by, org_id, project_id, number, kind, held_on, title, leader_id, status, closed_at, closed_by)
values ('a0000000-0000-0000-0000-000000000521', 'b0000000-0000-0000-0000-000000000521', 'c0000000-0000-0000-0000-000000000525',
        1, 'tailgate', '2026-10-05', 'Sample talk', 'a0000000-0000-0000-0000-000000000521', 'closed', now(),
        'a0000000-0000-0000-0000-000000000521');
select is(public.safety_due_on('c0000000-0000-0000-0000-000000000525', '2026-10-06'), '2026-10-19'::date,
  'due: a Monday tailgate is due again on the 10th working day, two Mondays on');
insert into public.safety_meetings (created_by, org_id, project_id, number, kind, held_on, title, leader_id, status, closed_at, closed_by)
values ('a0000000-0000-0000-0000-000000000521', 'b0000000-0000-0000-0000-000000000521', 'c0000000-0000-0000-0000-000000000525',
        2, 'meeting', '2026-10-09', 'Sample OAC', 'a0000000-0000-0000-0000-000000000521', 'closed', now(),
        'a0000000-0000-0000-0000-000000000521');
select is(public.safety_due_on('c0000000-0000-0000-0000-000000000525', '2026-10-06'), '2026-10-19'::date, 'due: only tailgates count');
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000525');
select ok((select last_held_on = today and due_on > today and open_count = 1 from public.safety_due('c0000000-0000-0000-0000-000000000521')),
  'due: the job''s last tailgate (today), the next due day after it, the one open meeting');
select pg_temp.login('a0000000-0000-0000-0000-000000000526');
select throws_ok($$ select * from public.safety_due('c0000000-0000-0000-0000-000000000521') $$, '42501', 'forbidden', 'due: safety readers only');
reset role;
select ok(public.safety_due_on('c0000000-0000-0000-0000-000000000521', (now() at time zone 'America/Los_Angeles')::date)
          > (now() at time zone 'America/Los_Angeles')::date, 'due: a tailgate closed today puts the next one 10 working days out');

select * from finish();
rollback;
