begin;
select plan(25);
-- Migration 0045, today's reports on All my jobs (SPEC §13.1, MDR's home): my_daily_today() runs as the caller and
-- answers one row per job where I write dailies: only my own setups (someone else's setup or report never shows), only
-- jobs that are going with Dailies on where I still write dailies; my form there is the setup I chose last; "today" is
-- the JOB's day in its own time zone, and so is "scheduled today"; the status follows today's report on that form (none,
-- draft, submitted; a deleted draft or another day's report is not today's); the number is the report's own once signed,
-- else the one the next report gets.
\ir _helpers.psql

-- Users: me (an inspector), someone else (an inspector), the admin who made the jobs.
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000391', 'probe+today-me@example.test', 'Sample Today Inspector');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000392', 'probe+today-other@example.test', 'Sample Today Other');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000393', 'probe+today-admin@example.test', 'Sample Today Admin');

insert into public.orgs (id, name, kind, created_by)
values ('b0000000-0000-0000-0000-000000000391', 'Sample Today Inspection Co', 'inspector', 'a0000000-0000-0000-0000-000000000393');
-- East (UTC+14) and West (UTC-11) are 25 hours apart: never on the same calendar day.
insert into public.projects (id, org_id, name, number, timezone, stage, created_by)
select p::uuid, 'b0000000-0000-0000-0000-000000000391', n, num, tz, 'construction', 'a0000000-0000-0000-0000-000000000393'
  from (values ('c0000000-0000-0000-0000-000000000391', 'Sample Today East', 'S-391', 'Pacific/Kiritimati'),
               ('c0000000-0000-0000-0000-000000000392', 'Sample Today West', 'S-392', 'Pacific/Pago_Pago'),
               ('c0000000-0000-0000-0000-000000000393', 'Sample Today Archived', 'S-393', 'America/Los_Angeles'),
               ('c0000000-0000-0000-0000-000000000394', 'Sample Today No Dailies', 'S-394', 'America/Los_Angeles'),
               ('c0000000-0000-0000-0000-000000000395', 'Sample Today Sub Job', 'S-395', 'America/Los_Angeles'),
               ('c0000000-0000-0000-0000-000000000396', 'Sample Today Others', 'S-396', 'America/Los_Angeles')) v(p, n, num, tz);
insert into public.project_members (org_id, project_id, user_id, invite_email, role, status)
select 'b0000000-0000-0000-0000-000000000391', p::uuid, u::uuid, e, r, 'active'
  from (values
    ('c0000000-0000-0000-0000-000000000391', 'a0000000-0000-0000-0000-000000000391', 'probe+today-me@example.test', 'inspector'),
    ('c0000000-0000-0000-0000-000000000392', 'a0000000-0000-0000-0000-000000000391', 'probe+today-me@example.test', 'inspector'),
    ('c0000000-0000-0000-0000-000000000393', 'a0000000-0000-0000-0000-000000000391', 'probe+today-me@example.test', 'inspector'),
    ('c0000000-0000-0000-0000-000000000394', 'a0000000-0000-0000-0000-000000000391', 'probe+today-me@example.test', 'inspector'),
    ('c0000000-0000-0000-0000-000000000395', 'a0000000-0000-0000-0000-000000000391', 'probe+today-me@example.test', 'sub'),
    ('c0000000-0000-0000-0000-000000000396', 'a0000000-0000-0000-0000-000000000391', 'probe+today-me@example.test', 'inspector'),
    ('c0000000-0000-0000-0000-000000000391', 'a0000000-0000-0000-0000-000000000392', 'probe+today-other@example.test', 'inspector'),
    ('c0000000-0000-0000-0000-000000000396', 'a0000000-0000-0000-0000-000000000392', 'probe+today-other@example.test', 'inspector')
  ) v(p, u, e, r);

create temp table t (k text primary key, v uuid);
grant all on t to public;
create function pg_temp.v(p_k text) returns uuid language sql stable as $$ select v from t where k = p_k $$;
create function pg_temp.east_today() returns date language sql stable as $$ select (now() at time zone 'Pacific/Kiritimati')::date $$;
create function pg_temp.west_today() returns date language sql stable as $$ select (now() at time zone 'Pacific/Pago_Pago')::date $$;
-- East's weekday only: a scheduled day on East, never on West (another calendar day).
create function pg_temp.east_days() returns jsonb language sql stable as $$
  select jsonb_build_array(extract(dow from (now() at time zone 'Pacific/Kiritimati')::date)::int) $$;
-- My row for a job, as the signed-in caller sees it.
create function pg_temp.today_of(p_project uuid) returns jsonb language sql stable as $$
  select to_jsonb(d) from public.my_daily_today() d where d.project_id = p_project $$;
create function pg_temp.ver(p_id uuid) returns int language sql stable as $$ select version from public.daily_reports where id = p_id $$;
grant execute on function pg_temp.v(text), pg_temp.east_today(), pg_temp.west_today(), pg_temp.east_days(),
  pg_temp.today_of(uuid), pg_temp.ver(uuid) to public;

-- The function itself.
select ok(not (select prosecdef from pg_proc where oid = 'public.my_daily_today()'::regprocedure), 'runs as the caller (SECURITY INVOKER)');
select ok(not has_function_privilege('anon', 'public.my_daily_today()', 'EXECUTE'), 'anon cannot call it');
select ok(has_function_privilege('authenticated', 'public.my_daily_today()', 'EXECUTE'), 'signed-in people can');
select isnt(pg_temp.east_today(), pg_temp.west_today(), 'zones: the two jobs are on different days right now');

-- ---------------------------------------------------------------------------------------------------------------
-- Setups, made the way the app makes them.
-- ---------------------------------------------------------------------------------------------------------------
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000391');
-- East: the work log first, then the VIS form chosen (the setup chosen last is the form I write).
select public.save_daily_setup('c0000000-0000-0000-0000-000000000391', 'daily',
  jsonb_build_object('label', 'Work Log', 'schedule_days', pg_temp.east_days()));
select public.choose_daily_form('c0000000-0000-0000-0000-000000000391', 'vis_daily',
  jsonb_build_object('label', 'Daily Report', 'schedule_days', pg_temp.east_days()));
-- West: the same schedule days (East's weekday).
select public.save_daily_setup('c0000000-0000-0000-0000-000000000392', 'daily',
  jsonb_build_object('label', 'West Log', 'schedule_days', pg_temp.east_days()));
select public.save_daily_setup('c0000000-0000-0000-0000-000000000393', 'daily', '{"schedule_days": [0,1,2,3,4,5,6]}');
select public.save_daily_setup('c0000000-0000-0000-0000-000000000394', 'daily', '{"schedule_days": [0,1,2,3,4,5,6]}');
select pg_temp.login('a0000000-0000-0000-0000-000000000392');
select public.save_daily_setup('c0000000-0000-0000-0000-000000000391', 'daily', '{"label": "Other Log", "schedule_days": [0,1,2,3,4,5,6]}');
select public.save_daily_setup('c0000000-0000-0000-0000-000000000396', 'daily', '{"schedule_days": [0,1,2,3,4,5,6]}');
reset role;

-- One job archived, one with Dailies switched off, and a setup on a job where I'm a sub (no dailies.write).
update public.projects set stage = 'archived' where id = 'c0000000-0000-0000-0000-000000000393';
update public.projects set modules = array_remove(modules, 'dailies') where id = 'c0000000-0000-0000-0000-000000000394';
insert into public.daily_setups (org_id, project_id, author_id, report_type, settings, created_by)
values ('b0000000-0000-0000-0000-000000000391', 'c0000000-0000-0000-0000-000000000395', 'a0000000-0000-0000-0000-000000000391',
        'daily', '{"schedule_days": [0,1,2,3,4,5,6]}', 'a0000000-0000-0000-0000-000000000391');

-- ---------------------------------------------------------------------------------------------------------------
-- My rows.
-- ---------------------------------------------------------------------------------------------------------------
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000391');
select results_eq($$ select project_id from public.my_daily_today() $$,
  $$ values ('c0000000-0000-0000-0000-000000000391'::uuid), ('c0000000-0000-0000-0000-000000000392'::uuid) $$,
  'rows: my jobs with a setup, by name; not archived, not Dailies off, not where I no longer write dailies, not someone else''s');
select results_eq($$ select project_name, report_type, label, schedule_days from public.my_daily_today()
                     where project_id = 'c0000000-0000-0000-0000-000000000391' $$,
  $$ select 'Sample Today East'::text, 'vis_daily'::text, 'Daily Report'::text,
            array[extract(dow from (now() at time zone 'Pacific/Kiritimati')::date)::int] $$,
  'chosen form: the setup I chose last, with its label and schedule days');
select is((pg_temp.today_of('c0000000-0000-0000-0000-000000000391')->>'today')::date, pg_temp.east_today(),
  'today: East''s own day (UTC+14)');
select is((pg_temp.today_of('c0000000-0000-0000-0000-000000000392')->>'today')::date, pg_temp.west_today(),
  'today: West''s own day (UTC-11), whatever my own zone');
select is(pg_temp.today_of('c0000000-0000-0000-0000-000000000391')->>'scheduled_today', 'true',
  'scheduled: today is a schedule day in East''s zone');
select is(pg_temp.today_of('c0000000-0000-0000-0000-000000000392')->>'scheduled_today', 'false',
  'scheduled: the same schedule days are not today in West''s zone');
select is(pg_temp.today_of('c0000000-0000-0000-0000-000000000391') - 'project_id' - 'project_name' - 'report_type' - 'label'
            - 'schedule_days' - 'today' - 'scheduled_today',
  '{"report_id": null, "status": "none", "number": null, "next_number": 1}'::jsonb,
  'status: none before today''s report is made; it will be #1');

-- Today's working copy on East: a draft.
insert into t values ('east', public.ensure_todays_draft('c0000000-0000-0000-0000-000000000391', 'vis_daily', null));
select is(pg_temp.today_of('c0000000-0000-0000-0000-000000000391')->>'status', 'draft', 'status: today''s draft');
select is((pg_temp.today_of('c0000000-0000-0000-0000-000000000391')->>'report_id')::uuid, pg_temp.v('east'),
  'status: with today''s report id');

-- West: a report on West's tomorrow (East's today) is not today's; West's own day is.
reset role;
insert into public.daily_reports (org_id, project_id, author_id, report_type, report_date)
values ('b0000000-0000-0000-0000-000000000391', 'c0000000-0000-0000-0000-000000000392', 'a0000000-0000-0000-0000-000000000391',
        'daily', pg_temp.east_today());
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000391');
select is(pg_temp.today_of('c0000000-0000-0000-0000-000000000392')->>'status', 'none',
  'status: a report on another day of the job''s calendar is not today''s');
insert into t values ('west', public.create_daily_report('c0000000-0000-0000-0000-000000000392', 'daily', pg_temp.west_today()));
select is((pg_temp.today_of('c0000000-0000-0000-0000-000000000392')->>'report_id')::uuid, pg_temp.v('west'),
  'status: Start on West makes today''s report in West''s day');
select public.delete_daily_draft(pg_temp.v('west'), pg_temp.ver(pg_temp.v('west')));
select is(pg_temp.today_of('c0000000-0000-0000-0000-000000000392')->>'status', 'none', 'status: a deleted draft is not today''s report');
select is(pg_temp.today_of('c0000000-0000-0000-0000-000000000392')->'report_id', 'null'::jsonb, 'status: and it has no report id');

-- Schedule days are read like daily_is_scheduled: numbers 0-6 only, once each; no label stays null.
select public.save_daily_setup('c0000000-0000-0000-0000-000000000392', 'daily', '{"schedule_days": [3, 1, "x", 9, 1.5, 3]}',
  (select version from public.daily_setups where project_id = 'c0000000-0000-0000-0000-000000000392' and author_id = auth.uid()));
select is(pg_temp.today_of('c0000000-0000-0000-0000-000000000392')->'schedule_days', '[1, 3]'::jsonb,
  'schedule days: 0-6 only, in order, once each');
select is(pg_temp.today_of('c0000000-0000-0000-0000-000000000392')->'label', 'null'::jsonb, 'label: none set, none invented');
select public.set_daily_start_number('c0000000-0000-0000-0000-000000000392', 'daily', 41);
select is((pg_temp.today_of('c0000000-0000-0000-0000-000000000392')->>'next_number')::int, 41,
  'next number: what the next report on the form will get (a start number honored)');

-- East's report submitted (the submit path itself is 17_dailies): its own number, no "next".
reset role;
insert into public.files (id, org_id, project_id, folder_id, storage_path, original_name, mime, size, scan_status,
                          text_status, upload_complete, created_by)
select 'e0000000-0000-0000-0000-000000000391', 'b0000000-0000-0000-0000-000000000391', 'c0000000-0000-0000-0000-000000000391',
       (select id from public.folders where project_id = 'c0000000-0000-0000-0000-000000000391' order by created_at, id limit 1),
       'probe/today/391.pdf', 'Sample today 391.pdf', 'application/pdf', 10, 'clean', 'none', true,
       'a0000000-0000-0000-0000-000000000391';
update public.daily_reports
   set status = 'submitted', number = 7, pdf_file_id = 'e0000000-0000-0000-0000-000000000391', filename = 'Sample 7.pdf',
       signed_at = now(), signed_by = author_id, content_hash = repeat('a', 64), signed_version = version + 1, submitted_at = now()
 where id = pg_temp.v('east');
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000391');
select results_eq($$ select status, number, next_number from public.my_daily_today()
                     where project_id = 'c0000000-0000-0000-0000-000000000391' $$,
  $$ values ('submitted'::text, 7, null::int) $$,
  'status: submitted, with its own number');

-- Choosing the other form: its own report (none yet today), still one row for the job.
select public.choose_daily_form('c0000000-0000-0000-0000-000000000391', 'daily', '{}');
select results_eq($$ select report_type, label, status, next_number from public.my_daily_today()
                     where project_id = 'c0000000-0000-0000-0000-000000000391' $$,
  $$ values ('daily'::text, 'Work Log'::text, 'none'::text, 1) $$,
  'chosen form: choosing back to the work log follows it, with its own report and number');
select is((select count(*)::int from public.my_daily_today() where project_id = 'c0000000-0000-0000-0000-000000000391'), 1,
  'one row per job, however many forms I have used there');

-- Someone else: their own setups only; my submitted report never shows as theirs.
select pg_temp.login('a0000000-0000-0000-0000-000000000392');
select results_eq($$ select project_id, label, status from public.my_daily_today() $$,
  $$ values ('c0000000-0000-0000-0000-000000000391'::uuid, 'Other Log'::text, 'none'::text),
            ('c0000000-0000-0000-0000-000000000396'::uuid, null::text, 'none'::text) $$,
  'only my own: someone else sees their setups, never mine or my reports');

-- Not a member any more: the job drops off.
reset role;
update public.project_members set status = 'revoked'
 where project_id = 'c0000000-0000-0000-0000-000000000396' and user_id = 'a0000000-0000-0000-0000-000000000392';
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000392');
select results_eq($$ select project_id from public.my_daily_today() $$,
  $$ values ('c0000000-0000-0000-0000-000000000391'::uuid) $$,
  'membership: a job I left is not on my list');

select * from finish();
rollback;
