begin;
select plan(59);
-- SPEC §13.1 daily reports (migration 0023): three authors file for the same job and day without collisions; numbers
-- come from the database at the first signing (start number honored, per author, kept on resubmit) and deleted drafts
-- use none; today's working copy is made in the JOB's zone and is safe to ask for again; carryover; a report is never
-- submitted without its stored PDF; drafts are private, dailies.read_all reads submitted reports only.
\ir _helpers.psql

-- Users: admin (creator), super, foreman, inspector, pm (read_all), sub (no dailies).
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000170', 'probe+dr-admin@example.test', 'Sample Admin');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000171', 'probe+dr-super@example.test', 'Sample Super');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000172', 'probe+dr-foreman@example.test', 'Sample Foreman');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000173', 'probe+dr-inspector@example.test', 'Sample Inspector');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000174', 'probe+dr-pm@example.test', 'Sample PM');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000175', 'probe+dr-sub@example.test', 'Sample Sub');

insert into public.orgs (id, name, kind, created_by)
values ('b0000000-0000-0000-0000-000000000171', 'Sample Builders', 'gc', 'a0000000-0000-0000-0000-000000000170');
insert into public.projects (id, org_id, name, number, timezone, stage, created_by)
values ('c0000000-0000-0000-0000-000000000171', 'b0000000-0000-0000-0000-000000000171', 'Dailies Job', 'S-171',
        'America/Los_Angeles', 'construction', 'a0000000-0000-0000-0000-000000000170');
insert into public.project_members (org_id, project_id, user_id, invite_email, role, status)
select 'b0000000-0000-0000-0000-000000000171', 'c0000000-0000-0000-0000-000000000171', u, e, r, 'active'
  from (values ('a0000000-0000-0000-0000-000000000171'::uuid, 'probe+dr-super@example.test', 'superintendent'),
               ('a0000000-0000-0000-0000-000000000172'::uuid, 'probe+dr-foreman@example.test', 'foreman'),
               ('a0000000-0000-0000-0000-000000000173'::uuid, 'probe+dr-inspector@example.test', 'inspector'),
               ('a0000000-0000-0000-0000-000000000174'::uuid, 'probe+dr-pm@example.test', 'pm'),
               ('a0000000-0000-0000-0000-000000000175'::uuid, 'probe+dr-sub@example.test', 'sub')) v(u, e, r);

-- Ids handed between steps.
create temp table t (k text primary key, v uuid);
grant all on t to public;
create function pg_temp.v(p_k text) returns uuid language sql stable as $$ select v from t where k = p_k $$;
grant execute on function pg_temp.v(text) to public;
-- The photo list begin_daily_submit expects: id:version by id (the edge function sends the same).
create function pg_temp.stamp(p_report uuid) returns text language sql stable as $$
  select coalesce(string_agg(id::text || ':' || version, ',' order by id), '')
    from public.daily_report_photos where report_id = p_report and deleted_at is null $$;
grant execute on function pg_temp.stamp(uuid) to public;

-- Capabilities.
select ok(pg_temp.cap_as('a0000000-0000-0000-0000-000000000172', 'c0000000-0000-0000-0000-000000000171', 'dailies.write'),
  'matrix: a foreman writes dailies');
select ok(not pg_temp.cap_as('a0000000-0000-0000-0000-000000000175', 'c0000000-0000-0000-0000-000000000171', 'dailies.write'),
  'matrix: a sub does not');
select is(public.daily_local_date('America/Los_Angeles', '2026-09-30 03:30:00+00'), '2026-09-29'::date,
  'time: a Pacific evening is still that local day');

set local role authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- Foreman: today's working copy.
-- ---------------------------------------------------------------------------------------------------------------
select pg_temp.login('a0000000-0000-0000-0000-000000000172');
insert into t values ('f_today', public.ensure_todays_draft('c0000000-0000-0000-0000-000000000171', 'daily',
  '{"label": "Foreman Daily", "schedule_days": [0,1,2,3,4,5,6], "submit_by": "16:30", "standing_note": "Sample standing note"}'));
select isnt(pg_temp.v('f_today'), null, 'ensure: makes today''s working copy on a scheduled day');
select is(public.ensure_todays_draft('c0000000-0000-0000-0000-000000000171', 'daily', null), pg_temp.v('f_today'),
  'ensure: asking again returns the same draft');
select is((select count(*)::int from public.daily_reports where author_id = auth.uid()), 1, 'ensure: still one report');
select is((select report_date from public.daily_reports where id = pg_temp.v('f_today')),
  (now() at time zone 'America/Los_Angeles')::date, 'ensure: dated today in the job''s zone');
select results_eq($$ select header->>'project_name', header->>'label', content->>'standing_note'
                      from public.daily_reports where id = pg_temp.v('f_today') $$,
  $$ values ('Dailies Job'::text, 'Foreman Daily'::text, 'Sample standing note'::text) $$,
  'ensure: job info locked in, standing note filled');
select is((select count(*)::int from public.daily_setups where author_id = auth.uid()), 1,
  'ensure: the setup is made from the defaults it was given');
select results_eq($$ select kind, user_id from public.calendar_entries
                      where source_type = 'daily_report' and source_id = pg_temp.v('f_today') $$,
  $$ values ('my_due'::text, 'a0000000-0000-0000-0000-000000000172'::uuid) $$, 'calendar: a draft is a due line for its author');

select throws_ok($$ select public.save_daily_setup('c0000000-0000-0000-0000-000000000171', 'daily', '{}') $$, '40001', null,
  'setup: a second first-save is a conflict, never an overwrite');
select is((public.save_daily_setup('c0000000-0000-0000-0000-000000000171', 'daily',
            (select settings from public.daily_setups where author_id = auth.uid()) || '{"standing_note": "Sample standing note"}',
            (select version from public.daily_setups where author_id = auth.uid()))).version, 2,
  'setup: saved with the version it was read at');
select is(public.set_daily_start_number('c0000000-0000-0000-0000-000000000171', 'daily', 41), 41,
  'start number: continues an earlier sequence');
select is(public.peek_author_number('c0000000-0000-0000-0000-000000000171', 'dailies:daily'), 41,
  'start number: the draft will be #41');

-- A day off the schedule: nothing is made.
select pg_temp.login('a0000000-0000-0000-0000-000000000174');
select is(public.ensure_todays_draft('c0000000-0000-0000-0000-000000000171', 'daily', '{"schedule_days": []}'), null,
  'ensure: nothing on a day that is not scheduled');

-- Super and inspector file for the same job and day.
select pg_temp.login('a0000000-0000-0000-0000-000000000171');
insert into t values ('s_today', public.ensure_todays_draft('c0000000-0000-0000-0000-000000000171', 'daily', '{"schedule_days": [0,1,2,3,4,5,6]}'));
select pg_temp.login('a0000000-0000-0000-0000-000000000173');
insert into t values ('i_today', public.ensure_todays_draft('c0000000-0000-0000-0000-000000000171', 'daily', '{"schedule_days": [0,1,2,3,4,5,6]}'));
reset role;
select is((select count(distinct id)::int from public.daily_reports
            where project_id = 'c0000000-0000-0000-0000-000000000171' and report_date = (now() at time zone 'America/Los_Angeles')::date),
  3, 'three authors, same job and day: three reports, no collision');
set local role authenticated;

-- Super deletes today's draft: it stays deleted and uses no number.
select pg_temp.login('a0000000-0000-0000-0000-000000000171');
select lives_ok($$ select public.delete_daily_draft(pg_temp.v('s_today'), 1) $$, 'delete: the author deletes a draft');
select is(public.ensure_todays_draft('c0000000-0000-0000-0000-000000000171', 'daily', null), null,
  'delete: a deleted draft is not made again');
select is_empty($$ select id from public.daily_reports where id = pg_temp.v('s_today') $$, 'delete: gone from the list');
select is(public.peek_author_number('c0000000-0000-0000-0000-000000000171', 'dailies:daily'), 1, 'delete: no number used');

-- ---------------------------------------------------------------------------------------------------------------
-- Foreman: saves, photos, submit.
-- ---------------------------------------------------------------------------------------------------------------
select pg_temp.login('a0000000-0000-0000-0000-000000000172');
select throws_ok($$ select public.save_daily_content(pg_temp.v('f_today'), 99, '{}') $$, '40001', null,
  'save: an old version is a conflict, never overwritten');
select is((public.save_daily_content(pg_temp.v('f_today'), 1, '{"notes": {"general": "Sample note"}, "work": []}')).version, 2,
  'save: the version moves on');

insert into t values ('f_photos', public.daily_photo_folder('c0000000-0000-0000-0000-000000000171'));
select ok(pg_temp.can_write_as('a0000000-0000-0000-0000-000000000172', pg_temp.v('f_photos')),
  'photos: the author writes Photos/<author>');
insert into t select 'f_file', (public.register_file(pg_temp.v('f_photos'), 'Sample photo.jpg', 'image/jpeg', 100)).id;
select is((public.add_daily_photo(pg_temp.v('f_today'), pg_temp.v('f_file'), 'k1', 'Sample caption', now())).caption,
  'Sample caption', 'photos: linked to the report');
select public.add_daily_photo(pg_temp.v('f_today'), pg_temp.v('f_file'), 'k1', 'Sample caption', now());
select is((select count(*)::int from public.daily_report_photos where report_id = pg_temp.v('f_today')), 1,
  'photos: linking again is safe to repeat');
select pg_temp.login('a0000000-0000-0000-0000-000000000173');
select throws_ok($$ select public.add_daily_photo(pg_temp.v('f_today'), pg_temp.v('f_file'), null, '', now()) $$, 'P0002', null,
  'photos: nobody else adds to someone''s report');

select pg_temp.login('a0000000-0000-0000-0000-000000000172');
select throws_ok($$ select public.begin_daily_submit(pg_temp.v('f_today'), 2, repeat('a', 64), '') $$, '40001', null,
  'begin: the photos must be the ones that were hashed');
select is((public.begin_daily_submit(pg_temp.v('f_today'), 2, repeat('a', 64), pg_temp.stamp(pg_temp.v('f_today')))).number, 41,
  'begin: the first signing numbers the report, from the start number');
insert into t values ('f_reports', public.daily_reports_folder('c0000000-0000-0000-0000-000000000171'));

-- The server stores the PDF (storeGeneratedPdf, as the author, stored clean): simulated.
reset role;
insert into public.files (id, org_id, project_id, folder_id, storage_path, original_name, mime, size, scan_status, text_status,
                          upload_complete, created_by)
values ('e0000000-0000-0000-0000-000000000171', 'b0000000-0000-0000-0000-000000000171', 'c0000000-0000-0000-0000-000000000171',
        pg_temp.v('f_reports'), 'probe/dailies/171.pdf', 'Daily Report 41 Dailies Job 01-01-2026.pdf', 'application/pdf', 10,
        'clean', 'none', true, 'a0000000-0000-0000-0000-000000000172'),
       ('e0000000-0000-0000-0000-000000000172', 'b0000000-0000-0000-0000-000000000171', 'c0000000-0000-0000-0000-000000000171',
        pg_temp.v('f_photos'), 'probe/dailies/172.pdf', 'Wrong folder.pdf', 'application/pdf', 10,
        'clean', 'none', true, 'a0000000-0000-0000-0000-000000000172');
set local role service_role;
select pg_temp.login_service();
select throws_ok($$ select public.finish_daily_submit(pg_temp.v('f_today'), 3, repeat('b', 64), 'e0000000-0000-0000-0000-000000000171', 'x.pdf') $$,
  '40001', null, 'finish: only the hash that was signed');
select throws_ok($$ select public.finish_daily_submit(pg_temp.v('f_today'), 3, repeat('a', 64), 'e0000000-0000-0000-0000-000000000172', 'x.pdf') $$,
  '22023', null, 'finish: only a PDF in the author''s Reports folder');
select is((public.finish_daily_submit(pg_temp.v('f_today'), 3, repeat('a', 64), 'e0000000-0000-0000-0000-000000000171',
                                      'Daily Report 41 Dailies Job 01-01-2026.pdf')).status, 'submitted',
  'finish: submitted with its stored PDF');
reset role;
select results_eq($$ select number, filename, version = signed_version, content_hash from public.daily_reports where id = pg_temp.v('f_today') $$,
  $$ values (41, 'Daily Report 41 Dailies Job 01-01-2026.pdf'::text, true, repeat('a', 64)) $$,
  'finish: number, filename, hash and signed version recorded');
select ok(exists (select 1 from public.activity where entity_id = pg_temp.v('f_today') and kind = 'daily.submitted'
                  and audience_capability = 'dailies.read_all' and actor_user_id = 'a0000000-0000-0000-0000-000000000172'),
  'board: a line for dailies.read_all, by the author');
select is_empty($$ select id from public.calendar_entries where source_type = 'daily_report' and source_id = pg_temp.v('f_today') $$,
  'calendar: the due line goes once submitted');
select is_empty($$ select id from public.calendar_entries where source_type = 'daily_report' and source_id = pg_temp.v('s_today') $$,
  'calendar: a deleted draft has no due line');

set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000172');
select throws_ok($$ select public.finish_daily_submit(pg_temp.v('f_today'), 4, repeat('a', 64), 'e0000000-0000-0000-0000-000000000171', 'x.pdf') $$,
  '42501', null, 'finish: people cannot mark a report submitted');

-- Update & resubmit: keeps the number and the filename.
select is((public.save_daily_content(pg_temp.v('f_today'), 4, '{"notes": {"general": "Changed"}}')).version, 5,
  'after submit: an edit is saved');
select ok((select version > signed_version from public.daily_reports where id = pg_temp.v('f_today')),
  'after submit: the report shows it needs resubmitting');
select is((public.begin_daily_submit(pg_temp.v('f_today'), 5, repeat('c', 64), pg_temp.stamp(pg_temp.v('f_today')))).number, 41,
  'resubmit: keeps its number');
reset role;
insert into public.files (id, org_id, project_id, folder_id, storage_path, original_name, mime, size, scan_status, text_status,
                          upload_complete, created_by)
values ('e0000000-0000-0000-0000-000000000173', 'b0000000-0000-0000-0000-000000000171', 'c0000000-0000-0000-0000-000000000171',
        pg_temp.v('f_reports'), 'probe/dailies/173.pdf', 'Daily Report 41 Dailies Job 01-01-2026.pdf', 'application/pdf', 10,
        'clean', 'none', true, 'a0000000-0000-0000-0000-000000000172');
set local role service_role;
select pg_temp.login_service();
select results_eq($$ select r.filename, r.pdf_file_id from public.finish_daily_submit(pg_temp.v('f_today'), 6, repeat('c', 64),
                      'e0000000-0000-0000-0000-000000000173', 'Other name.pdf') r $$,
  $$ values ('Daily Report 41 Dailies Job 01-01-2026.pdf'::text, 'e0000000-0000-0000-0000-000000000173'::uuid) $$,
  'resubmit: keeps its filename, points at the new PDF');

set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000172');
select throws_ok($$ select public.delete_daily_draft(pg_temp.v('f_today'), 7) $$, '22023', null, 'delete: a signed report stays');
select throws_ok($$ select public.set_daily_start_number('c0000000-0000-0000-0000-000000000171', 'daily', 41) $$, '22023', null,
  'start number: cannot go back to a used number');

-- Carryover: marked crews come back with hours reset; marked sections come back; nothing else.
insert into t values ('f_jan5', public.create_daily_report('c0000000-0000-0000-0000-000000000171', 'daily', '2026-01-05'));
select public.save_daily_content(pg_temp.v('f_jan5'), 1,
  '{"weather": "Clear", "carry_sections": ["safety"],
    "notes": {"general": "Day note", "safety": "Hard hats"},
    "work": [{"key": "k1", "company": "Sample Concrete", "description": "Forms", "headcount": 4, "hours": 32, "carry": true},
             {"key": "k2", "company": "Sample Steel", "headcount": 2, "hours": 8, "carry": false}]}');
insert into t values ('f_jan6', public.create_daily_report('c0000000-0000-0000-0000-000000000171', 'daily', '2026-01-06'));
select results_eq($$ select jsonb_array_length(content->'work'), content->'work'->0->>'company', content->'work'->0->>'headcount',
                            content->'work'->0->>'hours', content->'notes'->>'safety', content->'notes' ? 'general',
                            content->>'weather', content->'carry_sections'
                       from public.daily_reports where id = pg_temp.v('f_jan6') $$,
  $$ values (1, 'Sample Concrete'::text, '4'::text, null::text, 'Hard hats'::text, false, null::text, '["safety"]'::jsonb) $$,
  'carryover: marked crews (hours reset) and marked sections come back');
select throws_ok($$ select public.create_daily_report('c0000000-0000-0000-0000-000000000171', 'daily',
                     (now() at time zone 'America/Los_Angeles')::date + 2) $$, '22023', null, 'past date: not the future');

-- The job's zone: on a Pacific evening, ensure makes that local day's report (not the UTC day's).
reset role;
insert into t values ('f_evening', public.daily_ensure_at('c0000000-0000-0000-0000-000000000171', 'daily', null, '2026-01-08 03:30:00+00'));
select is((select report_date from public.daily_reports where id = pg_temp.v('f_evening')),
  '2026-01-07'::date, 'ensure: a Pacific evening makes that evening''s local day, not the UTC day');
set local role authenticated;

-- Inspector: first signed report is #1 (numbers are per author).
select pg_temp.login('a0000000-0000-0000-0000-000000000173');
select is((public.begin_daily_submit(pg_temp.v('i_today'), 1, repeat('d', 64), '')).number, 1, 'numbers: per author, the inspector''s first is #1');
insert into t values ('i_reports', public.daily_reports_folder('c0000000-0000-0000-0000-000000000171'));
reset role;
insert into public.files (id, org_id, project_id, folder_id, storage_path, original_name, mime, size, scan_status, text_status,
                          upload_complete, created_by)
values ('e0000000-0000-0000-0000-000000000174', 'b0000000-0000-0000-0000-000000000171', 'c0000000-0000-0000-0000-000000000171',
        pg_temp.v('i_reports'), 'probe/dailies/174.pdf', 'Daily Report 1.pdf', 'application/pdf', 10,
        'clean', 'none', true, 'a0000000-0000-0000-0000-000000000173');
set local role service_role;
select pg_temp.login_service();
select public.finish_daily_submit(pg_temp.v('i_today'), 2, repeat('d', 64), 'e0000000-0000-0000-0000-000000000174', 'Daily Report 1.pdf');
set local role authenticated;

-- Super: the deleted draft used no number; Start brings it back.
select pg_temp.login('a0000000-0000-0000-0000-000000000171');
insert into t values ('s_past', public.create_daily_report('c0000000-0000-0000-0000-000000000171', 'daily', '2026-01-05'));
select is((public.begin_daily_submit(pg_temp.v('s_past'), 1, repeat('e', 64), '')).number, 1,
  'numbers: a deleted draft used none; the super''s first signed report is #1');
select is(public.create_daily_report('c0000000-0000-0000-0000-000000000171', 'daily', (now() at time zone 'America/Los_Angeles')::date),
  pg_temp.v('s_today'), 'Start: brings today''s deleted draft back');

-- ---------------------------------------------------------------------------------------------------------------
-- Who reads what.
-- ---------------------------------------------------------------------------------------------------------------
select pg_temp.login('a0000000-0000-0000-0000-000000000174');
select results_eq($$ select author_id, status from public.daily_reports order by author_id $$,
  $$ values ('a0000000-0000-0000-0000-000000000172'::uuid, 'submitted'::text), ('a0000000-0000-0000-0000-000000000173'::uuid, 'submitted'::text) $$,
  'read_all: the job''s submitted reports, no drafts');
select is((select count(*)::int from public.daily_report_photos), 1, 'read_all: photos of submitted reports');
select pg_temp.login('a0000000-0000-0000-0000-000000000175');
select is_empty($$ select id from public.daily_reports $$, 'others: a member without dailies access reads none');
select is_empty($$ select id from public.daily_report_photos $$, 'others: nor their photos');
select throws_ok($$ select public.ensure_todays_draft('c0000000-0000-0000-0000-000000000171', 'daily', '{}') $$, '42501', null,
  'others: cannot start a daily');
select pg_temp.login('a0000000-0000-0000-0000-000000000172');
select is_empty($$ select id from public.daily_reports where author_id <> auth.uid() $$,
  'others: a writer without read_all reads only their own');
select pg_temp.login('a0000000-0000-0000-0000-000000000173');
select is_empty($$ select id from public.daily_reports where status = 'draft' and author_id <> auth.uid()
                  union all select id from public.daily_setups where author_id <> auth.uid() $$,
  'others: nobody reads someone else''s draft or setup');

select ok(pg_temp.can_read_as('a0000000-0000-0000-0000-000000000174', pg_temp.v('f_reports')), 'Reports/<author>: read_all reads it');
select ok(pg_temp.can_read_as('a0000000-0000-0000-0000-000000000172', pg_temp.v('f_reports')), 'Reports/<author>: the author reads it');
select ok(not pg_temp.can_read_as('a0000000-0000-0000-0000-000000000175', pg_temp.v('f_reports')), 'Reports/<author>: others don''t');
select ok(not pg_temp.can_write_as('a0000000-0000-0000-0000-000000000172', pg_temp.v('f_reports')),
  'Reports/<author>: only the server writes it');

select * from finish();
rollback;
