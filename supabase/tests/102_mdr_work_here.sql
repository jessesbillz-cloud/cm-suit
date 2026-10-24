begin;
select plan(43);
-- Migration 0117 (Jesse, Oct 23: "can't do anything - it gives me a view like the GC"). Whoever decides inspections on
-- the job turns a copy from MDR into the suite's own request (ir_work_here): data, files and number kept, the MDR id
-- kept apart, audited. The import never touches it again. A number the job's own requests already carry is refused,
-- never renumbered. The requests adopted by number go back to the suite's own (mdr_back_to_own). Owner-only reverse.
\ir _helpers.psql

select pg_temp.mk_user('a0000000-0000-0000-0000-000000001021', 'probe+wh-admin@example.test', 'Ada Admin');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000001022', 'probe+wh-insp@example.test', 'Ivy Inspector');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000001023', 'probe+wh-sub@example.test', 'Sam Sub');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000001024', 'probe+wh-pm@example.test', 'Pat Manager');

insert into public.orgs (id, name, kind, created_by) values
  ('b0000000-0000-0000-0000-000000001021', 'Sample Work Here Builders', 'gc', 'a0000000-0000-0000-0000-000000001021');
insert into public.projects (id, org_id, name, stage, timezone, created_by, settings) values
  ('c0000000-0000-0000-0000-000000001021', 'b0000000-0000-0000-0000-000000001021', 'Work Here Job', 'construction',
   'America/Los_Angeles', 'a0000000-0000-0000-0000-000000001021', '{"ir_ofs_allowed": true}');
insert into public.project_members (org_id, project_id, user_id, invite_email, role, status)
select 'b0000000-0000-0000-0000-000000001021', 'c0000000-0000-0000-0000-000000001021', u::uuid, e, r, 'active'
  from (values ('a0000000-0000-0000-0000-000000001022', 'probe+wh-insp@example.test', 'inspector'),
               ('a0000000-0000-0000-0000-000000001023', 'probe+wh-sub@example.test', 'sub'),
               ('a0000000-0000-0000-0000-000000001024', 'probe+wh-pm@example.test', 'pm')) v(u, e, r);

-- Typed in by hand before the mirror: IR 309 (in the adopt range) and IR 500 (outside it, the suite's own).
insert into public.inspection_requests (id, org_id, project_id, number, requested_by, company, request_date, start_time,
  duration_kind, duration_min, kind, items, notice_ack_at, status) values
  ('10000000-0000-0000-0000-000000001021', 'b0000000-0000-0000-0000-000000001021', 'c0000000-0000-0000-0000-000000001021',
   309, 'a0000000-0000-0000-0000-000000001023', 'Sample Framing', '2026-09-02', '08:00', 'timed', 60, 'ior',
   'Typed by hand', now(), 'pending'),
  ('10000000-0000-0000-0000-000000001022', 'b0000000-0000-0000-0000-000000001021', 'c0000000-0000-0000-0000-000000001021',
   500, 'a0000000-0000-0000-0000-000000001023', 'Sample Framing', '2026-10-20', null, 'all_day', null, 'ior',
   'Own one', now(), 'pending');
insert into public.mdr_job_links (mdr_job_id, project_id, adopt_from, adopt_to) values
  ('f0000000-0000-0000-0000-000000001021', 'c0000000-0000-0000-0000-000000001021', 309, 396);

create temp table mdr (doc jsonb);
grant all on mdr to public;
insert into mdr values ($j$[
 {"id":"20000000-0000-0000-0000-000000001021","job_id":"f0000000-0000-0000-0000-000000001021","ir_number":309,
  "inspection_types":["Regular"],"inspection_date":"2026-09-02","inspection_time":"08:00:00","duration":60,
  "flexible_display":"","status":"scheduled","notes":"Shower pan test","subcontractor":"Sample Plumbing",
  "file_urls":[],"created_at":"2026-09-01T16:00:00+00","updated_at":"2026-09-02T18:00:00+00"},
 {"id":"20000000-0000-0000-0000-000000001022","job_id":"f0000000-0000-0000-0000-000000001021","ir_number":344,
  "inspection_types":["Regular"],"inspection_date":"2026-09-21","inspection_time":"09:00:00","duration":60,
  "flexible_display":"","status":"scheduled","notes":"First on 344","subcontractor":"Sample Drywall",
  "file_urls":[],"created_at":"2026-09-20T16:00:00+00","updated_at":"2026-09-21T18:00:00+00"},
 {"id":"20000000-0000-0000-0000-000000001023","job_id":"f0000000-0000-0000-0000-000000001021","ir_number":344,
  "inspection_types":["Regular"],"inspection_date":"2026-09-21","inspection_time":"10:00:00","duration":60,
  "flexible_display":"","status":"pending","notes":"Second on 344","subcontractor":"Sample Drywall",
  "file_urls":[],"created_at":"2026-09-20T16:00:00+00","updated_at":"2026-09-21T19:00:00+00"},
 {"id":"20000000-0000-0000-0000-000000001024","job_id":"f0000000-0000-0000-0000-000000001021","ir_number":345,
  "inspection_types":["OFS"],"inspection_date":"2026-09-22","inspection_time":"09:00:00","duration":120,
  "flexible_display":"","status":"scheduled","notes":"OFS one, no requester","subcontractor":"Sample Drywall",
  "file_urls":["https://mdr.example.test/storage/v1/object/public/a/one.jpg"],
  "ir_pdf_url":"https://mdr.example.test/storage/v1/object/public/a/IR_345.pdf",
  "created_at":"2026-09-21T16:00:00+00","updated_at":"2026-09-22T18:00:00+00"},
 {"id":"20000000-0000-0000-0000-000000001025","job_id":"f0000000-0000-0000-0000-000000001021","ir_number":500,
  "inspection_types":["Regular"],"inspection_date":"2026-10-21","inspection_time":"07:00:00","duration":60,
  "flexible_display":"","status":"scheduled","notes":"MDR on the suite's 500","subcontractor":"Sample Steel",
  "file_urls":[],"ir_pdf_url":"https://mdr.example.test/storage/v1/object/public/a/IR_500.pdf","created_at":"2026-10-20T16:00:00+00","updated_at":"2026-10-21T18:00:00+00"},
 {"id":"20000000-0000-0000-0000-000000001026","job_id":"f0000000-0000-0000-0000-000000001021","ir_number":346,
  "inspection_types":["Regular"],"inspection_date":"2026-09-23","inspection_time":"07:00:00","duration":60,
  "flexible_display":"","status":"approved","notes":"With its PDF","subcontractor":"Sample Steel","file_urls":[],
  "ir_pdf_url":"https://mdr.example.test/storage/v1/object/public/a/IR_346.pdf",
  "created_at":"2026-09-22T16:00:00+00","updated_at":"2026-09-23T18:00:00+00"}
]$j$);

create function pg_temp.ir(p_mdr text) returns public.inspection_requests language sql stable security definer as $$
  select * from public.inspection_requests
   where coalesce(mdr_id, mdr_source_id) = ('20000000-0000-0000-0000-00000000' || p_mdr)::uuid $$;
grant execute on all functions in schema pg_temp to public;

select is((public.mdr_import_requests((select doc from mdr)))->'counts', '{"adopted": 1, "inserted": 5}'::jsonb,
  'the import adopts IR 309 and copies five');

-- ---------------------------------------------------------------------------------------------------------------
-- Who runs what
-- ---------------------------------------------------------------------------------------------------------------
select ok(has_function_privilege('authenticated', 'public.ir_work_here(uuid, int)', 'execute')
          and not has_function_privilege('anon', 'public.ir_work_here(uuid, int)', 'execute'),
  'Work it here is a signed-in step');
select ok(not has_function_privilege('authenticated', 'public.mdr_back_to_own()', 'execute')
          and not has_function_privilege('service_role', 'public.mdr_back_to_own()', 'execute')
          and not has_function_privilege('authenticated', 'public.mdr_undo_work_here(uuid)', 'execute')
          and not has_function_privilege('service_role', 'public.mdr_undo_work_here(uuid)', 'execute')
          and not has_function_privilege('authenticated', 'public.mdr_detach_row(uuid, uuid)', 'execute'),
  'the back-to-own, the reverse and the shared step are the database owner''s');

-- ---------------------------------------------------------------------------------------------------------------
-- The adopted ones go back to the suite's own
-- ---------------------------------------------------------------------------------------------------------------
select is(public.mdr_back_to_own(), '{"back_to_own": 1, "number_taken": []}'::jsonb, 'IR 309, adopted, is back');
select is(row((pg_temp.ir('1021')).id, (pg_temp.ir('1021')).mdr_id, (pg_temp.ir('1021')).mdr_source_id,
              (pg_temp.ir('1021')).mdr_detached_at is not null, (pg_temp.ir('1021')).mdr_detached_by)::text,
  row('10000000-0000-0000-0000-000000001021'::uuid, null::uuid, '20000000-0000-0000-0000-000000001021'::uuid, true,
      null::uuid)::text,
  'the same row, no MDR copy, linked by its MDR id, when, by the migration');
select is(public.mdr_back_to_own(), '{"back_to_own": 0, "number_taken": []}'::jsonb, 'safe to run again');
select is((select count(*)::int from public.inspection_requests where mdr_id is not null
            and project_id = 'c0000000-0000-0000-0000-000000001021'), 5, 'the copies made as copies stay copies');
select is((select action from public.ir_events where request_id = '10000000-0000-0000-0000-000000001021' order by id desc limit 1),
  'mdr_work_here', 'in its history');

-- ---------------------------------------------------------------------------------------------------------------
-- Work it here
-- ---------------------------------------------------------------------------------------------------------------
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000001022');
select lives_ok(format('select public.ir_confirm(%L, %s)', (pg_temp.ir('1021')).id, (pg_temp.ir('1021')).version),
  'the inspector confirms IR 309 again');
select lives_ok(format('select public.ir_set_result(%L, %s, %L, %L, null)', (pg_temp.ir('1021')).id,
                       (pg_temp.ir('1021')).version, 'approved', 'OK to cover'),
  'and passes it');

select pg_temp.login('a0000000-0000-0000-0000-000000001024');
select throws_ok(format('select public.ir_work_here(%L, %s)', (pg_temp.ir('1022')).id, (pg_temp.ir('1022')).version),
  '42501', 'forbidden', 'a reader who does not decide inspections can''t');
select pg_temp.login('a0000000-0000-0000-0000-000000001023');
select throws_ok(format('select public.ir_work_here(%L, %s)', (pg_temp.ir('1022')).id, (pg_temp.ir('1022')).version),
  'P0002', null, 'a sub doesn''t even see it');
set local role anon;
select throws_ok(format('select public.ir_work_here(%L, 1)', '10000000-0000-0000-0000-000000001022'),
  '42501', null, 'nor anon');

set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000001022');
select throws_ok(format('select public.ir_work_here(%L, %s)', (pg_temp.ir('1024')).id, (pg_temp.ir('1024')).version + 7),
  '40001', null, 'the version check');
select is((select row(w.mdr_id, w.mdr_source_id, w.mdr_detached_by, w.number)::text
             from public.ir_work_here((pg_temp.ir('1024')).id, (pg_temp.ir('1024')).version) w),
  row(null::uuid, '20000000-0000-0000-0000-000000001024'::uuid, 'a0000000-0000-0000-0000-000000001022'::uuid, 345)::text,
  'the OFS copy with no suite requester and no sender is the suite''s own now, same number, who did it');
select is((select w.version from public.ir_work_here((pg_temp.ir('1024')).id, 1) w), (pg_temp.ir('1024')).version,
  'the same tap again answers the row, changing nothing');
select is((select from_mdr from public.calendar_inspections('c0000000-0000-0000-0000-000000001021', '2026-09-22', '2026-09-22')
            where id = (pg_temp.ir('1024')).id), false, 'the calendar no longer marks it from MDR');

select throws_ok(format('select public.ir_work_here(%L, 1)', '10000000-0000-0000-0000-000000001022'),
  '22023', 'This request is already the suite''s own.', 'a request filed in the suite is refused');
select throws_ok(format('select public.ir_work_here(%L, %s)', (pg_temp.ir('1025')).id, (pg_temp.ir('1025')).version),
  '23505', 'IR 500 is already one of this job''s own requests, so this copy stays view only.',
  'a copy on a number the job''s own requests carry is refused, not renumbered');

select lives_ok(format('select public.ir_work_here(%L, %s)', (pg_temp.ir('1022')).id, (pg_temp.ir('1022')).version),
  'the first of two copies on IR 344 is worked here');
select throws_ok(format('select public.ir_work_here(%L, %s)', (pg_temp.ir('1023')).id, (pg_temp.ir('1023')).version),
  '23505', null, 'the second on the same number is refused');

select lives_ok(format('select public.ir_set_result(%L, %s, %L, %L, null)', (pg_temp.ir('1022')).id,
                       (pg_temp.ir('1022')).version, 'approved', 'No issues'),
  'a request worked here is passed like any');
select lives_ok(format('select public.ir_work_here(%L, %s)', (pg_temp.ir('1026')).id, (pg_temp.ir('1026')).version),
  'IR 346, with MDR''s IR PDF still waiting, is worked here');
reset role;
select is((select array_agg(role || ':' || status order by role) from public.mdr_file_queue where request_id = (pg_temp.ir('1024')).id),
  array['attachment:queued', 'ir_pdf:refused'], 'its attachments still come, MDR''s IR PDF does not');
select is((select ir_file_id from public.inspection_requests where id = (pg_temp.ir('1026')).id), null,
  'and no MDR IR stands in for the suite''s');
select is((select count(*)::int from public.ir_events where request_id = (pg_temp.ir('1024')).id and action = 'mdr_work_here'
            and actor_id = 'a0000000-0000-0000-0000-000000001022'), 1, 'audited with who');

-- ---------------------------------------------------------------------------------------------------------------
-- The import leaves it alone
-- ---------------------------------------------------------------------------------------------------------------
update mdr set doc = (select jsonb_agg(jsonb_set(jsonb_set(e, '{updated_at}', '"2026-10-22T18:00:00+00"'), '{notes}', '"MDR changed it"'))
                        from jsonb_array_elements(doc) e);
create temp table r2 as select public.mdr_import_requests((select doc from mdr)) as res;
select is((select res->'counts' from r2), '{"skipped": 4, "updated": 2}'::jsonb, 'four worked here are skipped, two copies updated');
select is((select array_agg(x->>'why' order by x->>'ir_number') from r2, jsonb_array_elements(res->'skipped') x),
  array['worked in the suite', 'worked in the suite', 'worked in the suite', 'worked in the suite'], 'and listed why');
select is(array[(pg_temp.ir('1021')).items, (pg_temp.ir('1022')).items, (pg_temp.ir('1023')).items],
  array['Shower pan test', 'First on 344', 'MDR changed it'], 'the suite''s stay as they were, the copy follows MDR');
select is(row((pg_temp.ir('1022')).result, (pg_temp.ir('1022')).mdr_id)::text, row('approved', null::uuid)::text,
  'its result stands and it is no copy again');

-- A new MDR request on IR 309 is copied, never adopted onto the one worked here.
create temp table r3 as select public.mdr_import_requests(jsonb_build_array(
  '{"id":"20000000-0000-0000-0000-000000001027","job_id":"f0000000-0000-0000-0000-000000001021","ir_number":309,"inspection_types":["Regular"],"inspection_date":"2026-09-02","inspection_time":"08:00:00","duration":60,"flexible_display":"","status":"pending","notes":"Another on 309","file_urls":[],"updated_at":"2026-10-22T19:00:00+00"}'::jsonb)) as res;
select is((select res->'counts' from r3), '{"inserted": 1}'::jsonb, 'a new MDR request on 309 is a new copy');
select is((select items from public.inspection_requests where id = '10000000-0000-0000-0000-000000001021'), 'Shower pan test',
  'the request worked here keeps its own');

-- The file copy already under way when it is worked here: MDR's IR PDF is not linked.
set local role service_role;
select pg_temp.login_service();
create temp table claimed as select * from public.mdr_file_claim(10);
select is((select count(*)::int from claimed where role = 'ir_pdf' and request_id = (pg_temp.ir('1025')).id), 1,
  'IR 500''s copy has its IR PDF taken to be copied');
reset role;
-- IR 500 freed (the suite's own renumbered by the owner), so its copy can be worked here.
update public.inspection_requests set number = 501 where id = '10000000-0000-0000-0000-000000001022';
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000001022');
select lives_ok(format('select public.ir_work_here(%L, %s)', (pg_temp.ir('1025')).id, (pg_temp.ir('1025')).version),
  'once the number is free, the copy on it is worked here');
set local role service_role;
select pg_temp.login_service();
select lives_ok($$ select public.mdr_file_done(c.id, 'e0000000-0000-0000-0000-000000001021')
                     from claimed c where c.role = 'ir_pdf' and c.request_id = (pg_temp.ir('1025')).id $$,
  'the copy finishing meanwhile is answered');
reset role;
select is(row((pg_temp.ir('1025')).ir_file_id,
              (select status from public.mdr_file_queue where request_id = (pg_temp.ir('1025')).id and role = 'ir_pdf'))::text,
  row(null::uuid, 'refused')::text, 'not linked, and refused');

-- ---------------------------------------------------------------------------------------------------------------
-- The reverse (owner only)
-- ---------------------------------------------------------------------------------------------------------------
select is(public.mdr_undo_work_here((pg_temp.ir('1024')).id), 'a copy again', 'the lead makes it a copy again');
select is(row((pg_temp.ir('1024')).mdr_id, (pg_temp.ir('1024')).mdr_source_id, (pg_temp.ir('1024')).mdr_detached_at)::text,
  row('20000000-0000-0000-0000-000000001024'::uuid, null::uuid, null::timestamptz)::text, 'linked as before');
select is(public.mdr_undo_work_here((pg_temp.ir('1024')).id), 'unchanged: not worked here', 'safe to repeat');
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000001022');
select throws_ok(format('select public.ir_move(%L, %s, %L)', (pg_temp.ir('1024')).id, (pg_temp.ir('1024')).version, '2026-12-01'),
  '42501', 'This request comes from MDR. It is view only.', 'view only again');
reset role;

-- ---------------------------------------------------------------------------------------------------------------
-- The table keeps it straight
-- ---------------------------------------------------------------------------------------------------------------
select throws_ok(format('update public.inspection_requests set items = %L where id = %L', 'x', (pg_temp.ir('1023')).id),
  '42501', null, 'no other change gets through on a copy');
select set_config('app.mdr_detach', 'on', true);
select throws_ok(format('update public.inspection_requests set mdr_source_id = mdr_id, mdr_id = null, mdr_detached_at = now(), items = %L where id = %L',
                        'sneaked', (pg_temp.ir('1023')).id),
  '42501', null, 'the detach lets nothing else change with it');
select set_config('app.mdr_detach', '', true);
select throws_ok(format('update public.inspection_requests set mdr_detached_at = null where id = %L', '10000000-0000-0000-0000-000000001021'),
  '23514', null, 'worked here always says when');

select * from finish();
rollback;
