begin;
select plan(30);
-- Migration 0041, company forms for dailies (SPEC §8.3, §13.1): a person's form on a job is the setup they chose last
-- (choose_daily_form; a first choice makes the setup from the given settings, a later one never overwrites it); the
-- VIS form's report is a daily report like any other (today's copy, standing note, its own number sequence that
-- continues an earlier one); settings.locked is bounded; photos carry an optional description; IR results go on the
-- chosen form's report and move with a new choice.
\ir _helpers.psql

select pg_temp.mk_user('a0000000-0000-0000-0000-000000000341', 'probe+vis-insp@example.test', 'Sample Inspector');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000342', 'probe+vis-sub@example.test', 'Sample Sub');
insert into public.orgs (id, name, kind, created_by, settings)
values ('b0000000-0000-0000-0000-000000000341', 'Sample Inspection Co', 'inspector', 'a0000000-0000-0000-0000-000000000341',
        '{"report_generator": "vis_daily"}');
insert into public.projects (id, org_id, name, number, timezone, stage, created_by)
values ('c0000000-0000-0000-0000-000000000341', 'b0000000-0000-0000-0000-000000000341', 'Sample School Wing', 'S-400',
        'America/Los_Angeles', 'construction', 'a0000000-0000-0000-0000-000000000341');
insert into public.project_members (org_id, project_id, user_id, invite_email, role, status)
select 'b0000000-0000-0000-0000-000000000341', 'c0000000-0000-0000-0000-000000000341', u, e, r, 'active'
  from (values ('a0000000-0000-0000-0000-000000000341'::uuid, 'probe+vis-insp@example.test', 'inspector'),
               ('a0000000-0000-0000-0000-000000000342'::uuid, 'probe+vis-sub@example.test', 'sub')) v(u, e, r);

create temp table t (k text primary key, v uuid);
grant all on t to public;
create function pg_temp.v(p_k text) returns uuid language sql stable as $$ select v from t where k = p_k $$;
grant execute on function pg_temp.v(text) to public;
-- My chosen form on the job.
create function pg_temp.chosen() returns text language sql stable as $$
  select report_type from public.daily_setups
   where project_id = 'c0000000-0000-0000-0000-000000000341' and author_id = auth.uid()
   order by chosen_at desc, created_at desc limit 1 $$;
grant execute on function pg_temp.chosen() to public;
create function pg_temp.entries(p_type text) returns jsonb language sql as $$
  select coalesce((select content->'inspections' from public.daily_reports
                    where project_id = 'c0000000-0000-0000-0000-000000000341' and report_type = p_type
                      and author_id = 'a0000000-0000-0000-0000-000000000341' and report_date = '2026-09-01'), 'null'::jsonb) $$;

set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000341');

-- ---------------------------------------------------------------------------------------------------------------
-- Choosing a form.
-- ---------------------------------------------------------------------------------------------------------------
select isnt(public.ensure_todays_draft('c0000000-0000-0000-0000-000000000341', 'daily',
  '{"label": "Work Log", "schedule_days": [0,1,2,3,4,5,6]}'), null, 'work log: first used, its setup is made');
select is(pg_temp.chosen(), 'daily', 'choose: a newly made setup is the chosen one');
select is((public.choose_daily_form('c0000000-0000-0000-0000-000000000341', 'vis_daily',
  '{"label": "Daily Report", "schedule_days": [0,1,2,3,4,5,6], "filename_pattern": "DR_{#}_{Project_}_{YYYY-MM-DD}",
    "standing_note": "Sample standing IOR statement", "locked": {"project_name": "Sample School Wing", "ior": "Sample Inspector"}}'
  )).report_type, 'vis_daily', 'choose: the VIS form''s setup is made from the given settings');
select is(pg_temp.chosen(), 'vis_daily', 'choose: it is now the chosen form');
select is((select count(*)::int from public.daily_setups where author_id = auth.uid()), 2, 'choose: the work log setup is kept');
select is((public.choose_daily_form('c0000000-0000-0000-0000-000000000341', 'daily', '{"label": "Replaced"}')).settings->>'label',
  'Work Log', 'choose back: the existing setup is chosen, never overwritten');
select is(pg_temp.chosen(), 'daily', 'choose back: the work log is chosen');
select is((public.choose_daily_form('c0000000-0000-0000-0000-000000000341', 'vis_daily', '{}')).settings->'locked'->>'ior',
  'Sample Inspector', 'choose again: the VIS setup comes back as it was');
select throws_ok($$ select public.choose_daily_form('c0000000-0000-0000-0000-000000000341', 'VIS Daily!', '{}') $$, '22023', null,
  'choose: a bad form id is refused');

select pg_temp.login('a0000000-0000-0000-0000-000000000342');
select throws_ok($$ select public.choose_daily_form('c0000000-0000-0000-0000-000000000341', 'vis_daily', '{}') $$, '42501', null,
  'choose: someone who does not write dailies is refused');
select pg_temp.login('a0000000-0000-0000-0000-000000000341');

-- ---------------------------------------------------------------------------------------------------------------
-- Job values (settings.locked) are bounded.
-- ---------------------------------------------------------------------------------------------------------------
select throws_ok($$ select public.save_daily_setup('c0000000-0000-0000-0000-000000000341', 'vis_daily',
  '{"locked": {"Bad Key": "x"}}', (select version from public.daily_setups where author_id = auth.uid() and report_type = 'vis_daily')) $$,
  '23514', null, 'locked: a bad key is refused');
select throws_ok($$ select public.save_daily_setup('c0000000-0000-0000-0000-000000000341', 'vis_daily',
  '{"locked": {"ior": 5}}', (select version from public.daily_setups where author_id = auth.uid() and report_type = 'vis_daily')) $$,
  '23514', null, 'locked: a value that is not text is refused');
select throws_ok($$ select public.save_daily_setup('c0000000-0000-0000-0000-000000000341', 'vis_daily',
  jsonb_build_object('locked', jsonb_build_object('ior', repeat('x', 1001))),
  (select version from public.daily_setups where author_id = auth.uid() and report_type = 'vis_daily')) $$,
  '23514', null, 'locked: a value over 1000 characters is refused');
select is((public.save_daily_setup('c0000000-0000-0000-0000-000000000341', 'vis_daily',
  (select settings from public.daily_setups where author_id = auth.uid() and report_type = 'vis_daily')
    || '{"locked": {"project_name": "Sample School Wing", "ior": "Sample Inspector", "architect": "Sample Architects"}}',
  (select version from public.daily_setups where author_id = auth.uid() and report_type = 'vis_daily'))).settings->'locked'->>'architect',
  'Sample Architects', 'locked: good job values save');

-- ---------------------------------------------------------------------------------------------------------------
-- The VIS form's report: today's copy, the standing note, its own numbers.
-- ---------------------------------------------------------------------------------------------------------------
insert into t values ('v_today', public.ensure_todays_draft('c0000000-0000-0000-0000-000000000341', 'vis_daily', null));
select results_eq($$ select report_type, content->>'standing_note', header->>'label' from public.daily_reports where id = pg_temp.v('v_today') $$,
  $$ values ('vis_daily'::text, 'Sample standing IOR statement'::text, 'Daily Report'::text) $$,
  'report: today''s VIS copy, the standing note filled');
select is((public.save_daily_content(pg_temp.v('v_today'), 1,
  '{"standing_note": "Sample standing IOR statement", "fields": {"contractor_activity": "Sample framing", "ior_notes": "Sample notes"}}'
  )).content->'fields'->>'contractor_activity', 'Sample framing', 'report: the day''s form values save');
select is(public.set_daily_start_number('c0000000-0000-0000-0000-000000000341', 'vis_daily', 233), 233,
  'numbers: the VIS sequence continues an earlier one');
select is(public.peek_author_number('c0000000-0000-0000-0000-000000000341', 'dailies:vis_daily'), 233, 'numbers: will be #233');
select is(public.peek_author_number('c0000000-0000-0000-0000-000000000341', 'dailies:daily'), 1, 'numbers: the work log keeps its own');

-- Photos: an optional description, kept when a save leaves it out.
insert into t values ('v_photos', public.daily_photo_folder('c0000000-0000-0000-0000-000000000341'));
insert into t select 'v_file', (public.register_file(pg_temp.v('v_photos'), 'Sample tag.jpg', 'image/jpeg', 100)).id;
insert into t select 'v_photo', (public.add_daily_photo(pg_temp.v('v_today'), pg_temp.v('v_file'), null, '', now())).id;
select is((public.save_daily_photo(pg_temp.v('v_photo'), 1, 'Sample tag', 'Product: Sample anchor')).description,
  'Product: Sample anchor', 'photo: the description saves');
select is((public.save_daily_photo(pg_temp.v('v_photo'), 2, 'Sample tag, level 2')).description, 'Product: Sample anchor',
  'photo: a caption save leaves the description');
select throws_ok($$ select public.save_daily_photo(pg_temp.v('v_photo'), 3, 'x', repeat('d', 4001)) $$, '22023', null,
  'photo: a description over 4000 characters is refused');
select throws_ok($$ select public.save_daily_photo(pg_temp.v('v_photo'), 1, 'x', 'y') $$, '40001', null,
  'photo: an old version is a conflict');

select is((public.begin_daily_submit(pg_temp.v('v_today'), 2, repeat('a', 64),
  (select string_agg(id::text || ':' || version, ',' order by id) from public.daily_report_photos where report_id = pg_temp.v('v_today'))
  )).number, 233, 'submit: the first VIS report is #233');

-- ---------------------------------------------------------------------------------------------------------------
-- IR results go on the chosen form's report, and move with a new choice.
-- ---------------------------------------------------------------------------------------------------------------
select isnt(public.create_daily_report('c0000000-0000-0000-0000-000000000341', 'daily', '2026-09-01'), null,
  'ir: a work-log report exists that day too');
reset role;
insert into public.files (id, org_id, project_id, folder_id, storage_path, original_name, mime, scan_status, upload_complete, created_by)
select 'e0000000-0000-0000-0000-000000000341', 'b0000000-0000-0000-0000-000000000341', 'c0000000-0000-0000-0000-000000000341', f.id,
       'project/probe/e0000000-0000-0000-0000-000000000341', 'IR 1.pdf', 'application/pdf', 'clean', true,
       'a0000000-0000-0000-0000-000000000341'
  from public.folders f where f.project_id = 'c0000000-0000-0000-0000-000000000341' limit 1;
insert into public.inspection_requests (id, org_id, project_id, number, requested_by, company, request_date, duration_kind,
                                        kind, items, notice_ack_at, status, owner_id, result, result_note)
values ('d0000000-0000-0000-0000-000000000341', 'b0000000-0000-0000-0000-000000000341', 'c0000000-0000-0000-0000-000000000341',
        1, 'a0000000-0000-0000-0000-000000000342', 'Sample Framing', '2026-09-01', 'all_day', 'ior', 'Shear walls, level 2',
        now(), 'confirmed', 'a0000000-0000-0000-0000-000000000341', 'approved', 'No issues');
update public.inspection_requests set ir_file_id = 'e0000000-0000-0000-0000-000000000341', signed_at = now(),
  content_hash = 'h1', status = 'complete' where id = 'd0000000-0000-0000-0000-000000000341';
select is(jsonb_array_length(pg_temp.entries('vis_daily')), 1, 'ir: the entry is on the chosen (VIS) form''s report');
select is(jsonb_array_length(pg_temp.entries('daily')), 0, 'ir: not on the work-log report the same day');

set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000341');
select public.choose_daily_form('c0000000-0000-0000-0000-000000000341', 'daily', '{}');
reset role;
update public.inspection_requests set result_note = 'No issues, rechecked', content_hash = 'h2'
 where id = 'd0000000-0000-0000-0000-000000000341';
update public.inspection_requests set ir_file_id = null, status = 'confirmed' where id = 'd0000000-0000-0000-0000-000000000341';
update public.inspection_requests set ir_file_id = 'e0000000-0000-0000-0000-000000000341', status = 'complete'
 where id = 'd0000000-0000-0000-0000-000000000341';
select is(jsonb_array_length(pg_temp.entries('daily')), 1, 'ir: after choosing the work log, regenerating puts it there');
select is(jsonb_array_length(pg_temp.entries('vis_daily')), 0, 'ir: and takes it off the other form''s report');

select ok(not has_function_privilege('anon', 'public.choose_daily_form(uuid, text, jsonb)', 'EXECUTE'), 'grants: anon cannot choose');

select * from finish();
rollback;
