begin;
select plan(65);
-- Migration 0112 (Jesse, Oct 23: "You actually have to use it and review the data of what did happen."). Once a day
-- MDR's requests for a linked job are copied in, one way. Copies are safe to repeat, adopt the requests typed in by hand
-- by number, keep MDR's numbers (MDR reuses some), push the job's own counter past them, and are view only. Files wait
-- in a queue no person can read. Only the database owner runs the import.
\ir _helpers.psql

select pg_temp.mk_user('a0000000-0000-0000-0000-000000000981', 'probe+mdr-admin@example.test', 'Ada Admin');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000982', 'probe+mdr-insp@example.test', 'Ivy Inspector');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000983', 'probe+mdr-sub@example.test', 'Sam Sub');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000984', 'probe+mdr-ahj@example.test', 'Dana Deputy');

insert into public.orgs (id, name, kind, created_by) values
  ('b0000000-0000-0000-0000-000000000981', 'Sample Mirror Builders', 'gc', 'a0000000-0000-0000-0000-000000000981');
insert into public.projects (id, org_id, name, stage, timezone, created_by, settings) values
  ('c0000000-0000-0000-0000-000000000981', 'b0000000-0000-0000-0000-000000000981', 'Mirror Job', 'construction',
   'America/Los_Angeles', 'a0000000-0000-0000-0000-000000000981', '{"ir_ofs_allowed": true}');
insert into public.project_members (org_id, project_id, user_id, invite_email, role, status)
select 'b0000000-0000-0000-0000-000000000981', 'c0000000-0000-0000-0000-000000000981', u::uuid, e, r, 'active'
  from (values ('a0000000-0000-0000-0000-000000000982', 'probe+mdr-insp@example.test', 'inspector'),
               ('a0000000-0000-0000-0000-000000000983', 'probe+mdr-sub@example.test', 'sub'),
               ('a0000000-0000-0000-0000-000000000984', 'probe+mdr-ahj@example.test', 'ahj')) v(u, e, r);

-- Typed in by hand before the mirror: IR 309. The suite's own demo request IR 397, hidden. The counter after it.
insert into public.inspection_requests (id, org_id, project_id, number, requested_by, company, request_date, start_time,
  duration_kind, duration_min, kind, items, notice_ack_at, status) values
  ('10000000-0000-0000-0000-000000000981', 'b0000000-0000-0000-0000-000000000981', 'c0000000-0000-0000-0000-000000000981',
   309, 'a0000000-0000-0000-0000-000000000983', 'Sample Framing', '2026-09-02', '08:00', 'timed', 60, 'ior',
   'Typed by hand', now(), 'confirmed'),
  ('10000000-0000-0000-0000-000000000982', 'b0000000-0000-0000-0000-000000000981', 'c0000000-0000-0000-0000-000000000981',
   397, 'a0000000-0000-0000-0000-000000000983', 'Sample Demo', '2026-10-20', null, 'all_day', null, 'ior',
   'Demo', now(), 'pending');
update public.inspection_requests set deleted_at = now() where id = '10000000-0000-0000-0000-000000000982';
insert into public.project_counters (project_id, kind, next_value) values ('c0000000-0000-0000-0000-000000000981', 'ir', 398)
on conflict (project_id, kind) do update set next_value = 398;

insert into public.mdr_job_links (mdr_job_id, project_id, adopt_from, adopt_to) values
  ('f0000000-0000-0000-0000-000000000981', 'c0000000-0000-0000-0000-000000000981', 309, 396);

-- Synthetic MDR rows, as the MDR SELECT hands them over.
create temp table mdr (doc jsonb);
grant all on mdr to public;
insert into mdr values ($j$[
 {"id":"20000000-0000-0000-0000-000000000981","job_id":"f0000000-0000-0000-0000-000000000981","ir_number":309,
  "inspection_types":["Regular"],"inspection_date":"2026-09-02","requested_date":"2026-09-01","inspection_time":"08:00:00",
  "duration":60,"flexible_display":"","status":"approved","approval_status":"approved","approved_at":"2026-09-02T17:00:00+00",
  "inspector_notes":"OK to cover","notes":"Shower pan test; level 1","requester_company":null,"subcontractor":"Sample Plumbing",
  "file_urls":[],"ir_pdf_url":null,"created_at":"2026-09-01T16:00:00+00","updated_at":"2026-09-02T18:00:00+00"},
 {"id":"20000000-0000-0000-0000-000000000982","job_id":"f0000000-0000-0000-0000-000000000981","ir_number":397,
  "inspection_types":["OFS"],"inspection_date":"2026-10-21","inspection_time":"09:00:00","duration":120,
  "flexible_display":"","status":"scheduled","notes":"OFS 0097 - 1st layer","subcontractor":"Sample Drywall",
  "file_urls":[],"created_at":"2026-10-20T16:00:00+00","updated_at":"2026-10-20T18:00:00+00"},
 {"id":"20000000-0000-0000-0000-000000000983","job_id":"f0000000-0000-0000-0000-000000000981","ir_number":344,
  "inspection_types":["Special","Concrete"],"special_type":"Concrete","inspection_date":"2026-09-21",
  "inspection_time":"06:00:00","duration":240,"flexible_display":"","status":"approved","notes":"Slab pour",
  "subcontractor":"Sample Concrete","attendance":"solo",
  "file_urls":["https://mdr.example.test/storage/v1/object/public/a/one.pdf","https://mdr.example.test/storage/v1/object/public/a/two.jpg"],
  "ir_pdf_url":"https://mdr.example.test/storage/v1/object/public/a/IR_344.pdf",
  "created_at":"2026-09-20T16:00:00+00","updated_at":"2026-09-21T18:00:00+00"},
 {"id":"20000000-0000-0000-0000-000000000984","job_id":"f0000000-0000-0000-0000-000000000981","ir_number":344,
  "inspection_types":["Regular"],"inspection_date":"2026-09-21","inspection_time":"09:30:00","duration":60,
  "flexible_display":"","status":"pending","notes":"Second request on the same number","subcontractor":"Sample Drywall",
  "requester_name":"Rita Requester","requester_email":"Rita@Example.Test",
  "file_urls":[],"created_at":"2026-09-21T16:00:00+00","updated_at":"2026-09-21T19:00:00+00"},
 {"id":"20000000-0000-0000-0000-000000000985","job_id":"f0000000-0000-0000-0000-000000000981","ir_number":null,
  "inspection_types":["Regular"],"inspection_date":"2026-04-02","status":"approved","notes":"Before numbers",
  "file_urls":[],"updated_at":"2026-09-22T18:00:00+00"},
 {"id":"20000000-0000-0000-0000-000000000986","job_id":"f0000000-0000-0000-0000-000000000981","ir_number":350,
  "inspection_types":["Regular"],"inspection_date":"2026-09-23","status":"deleted","deleted_at":"2026-09-23T18:00:00+00",
  "notes":"Gone","file_urls":[],"updated_at":"2026-09-23T18:00:00+00"},
 {"id":"20000000-0000-0000-0000-000000000987","job_id":"f0000000-0000-0000-0000-000000000981","ir_number":351,
  "inspection_types":["Regular"],"inspection_date":"2026-09-24","status":"mystery","notes":"Odd",
  "file_urls":[],"updated_at":"2026-09-24T18:00:00+00"},
 {"id":"20000000-0000-0000-0000-000000000988","job_id":"f0000000-0000-0000-0000-000000000981","ir_number":354,
  "inspection_types":["Regular"],"inspection_date":"0026-09-25","requested_date":"2026-09-25","inspection_time":"10:35:00",
  "duration":60,"flexible_display":"","status":"postponed","postpone_reason":"Not ready","expected_date":"2026-09-30",
  "notes":"Duct test; L-2 shaft","file_urls":[],"updated_at":"2026-09-25T18:00:00+00"},
 {"id":"20000000-0000-0000-0000-000000000989","job_id":"f0000000-0000-0000-0000-000000000981","ir_number":428,
  "inspection_types":["Regular"],"inspection_date":"2026-10-23","inspection_time":"07:00:00","duration":60,
  "flexible_display":"","status":"cancelled","notes":"Cancelled one","file_urls":[],"updated_at":"2026-10-23T18:00:00+00"}
]$j$);

create function pg_temp.ir(p_mdr text) returns public.inspection_requests language sql stable security definer as $$
  select * from public.inspection_requests where mdr_id = ('20000000-0000-0000-0000-000000000' || p_mdr)::uuid $$;
grant execute on all functions in schema pg_temp to public;

-- ---------------------------------------------------------------------------------------------------------------
-- Only the owner runs it
-- ---------------------------------------------------------------------------------------------------------------
select ok(not has_function_privilege('authenticated', 'public.mdr_import_requests(jsonb)', 'execute')
          and not has_function_privilege('anon', 'public.mdr_import_requests(jsonb)', 'execute')
          and not has_function_privilege('service_role', 'public.mdr_import_requests(jsonb)', 'execute'),
  'the import runs for nobody but the database owner');
select ok(not has_function_privilege('authenticated', 'public.mdr_sync_begin()', 'execute')
          and not has_function_privilege('authenticated', 'public.mdr_sync_end()', 'execute')
          and not has_function_privilege('anon', 'public.mdr_sync_end()', 'execute')
          and not has_function_privilege('authenticated', 'public.mdr_files_status()', 'execute'),
  'nor the run steps')
;
select ok(not has_function_privilege('authenticated', 'public.mdr_file_claim(int)', 'execute')
          and has_function_privilege('service_role', 'public.mdr_file_claim(int)', 'execute'),
  'the file steps are the server''s');

-- ---------------------------------------------------------------------------------------------------------------
-- The mapping, one MDR value at a time
-- ---------------------------------------------------------------------------------------------------------------
select is((select array_agg(public.mdr_ir_status(s, false) order by o) from unnest(array['approved', 'not_approved', 'scheduled',
            'pending', 'postponed', 'cancelled', 'gc_review', 'returned', 'deleted', 'mystery', null]) with ordinality t(s, o)),
  array['confirmed', 'confirmed', 'confirmed', 'pending', 'postponed', 'withdrawn', 'gc_review', 'returned', null, null, null],
  'MDR status to the suite''s, before the IR PDF is copied');
select is((select array_agg(public.mdr_ir_status(s, true) order by o) from unnest(array['approved', 'not_approved', 'scheduled'])
            with ordinality t(s, o)),
  array['complete', 'complete', 'confirmed'], 'a decided request with its IR PDF is complete');
select is((select array_agg(public.mdr_ir_result(s) order by o) from unnest(array['approved', 'not_approved', 'scheduled', 'pending'])
            with ordinality t(s, o)),
  array['approved', 'not_approved', null, null], 'the result');
select is(array[public.mdr_ir_kind(array['OFS'], null), public.mdr_ir_kind(array['Special', 'Welding'], 'Welding'),
                public.mdr_ir_kind(array['Regular', 'Periodic'], null), public.mdr_ir_kind(array['Regular'], '')],
  array['ofs', 'special', 'ior', 'ior'], 'the kind from MDR''s types');
select is(array[public.mdr_ir_postpone_reason('Not ready'), public.mdr_ir_postpone_reason('GC requested'),
                public.mdr_ir_postpone_reason('Rain'), public.mdr_ir_postpone_reason('Crane down'), public.mdr_ir_postpone_reason('')],
  array['not_ready', 'gc_requested', 'weather', 'other', null], 'why it was postponed');
select is(array[public.mdr_sane_date('2026-09-25'), public.mdr_sane_date('0026-09-25'), public.mdr_sane_date(null)],
  array['2026-09-25'::date, null, null], 'a year-0026 date is no date');
select is(array[public.mdr_fix_year('0226-09-22', '2026-09-20T16:00:00+00'), public.mdr_fix_year('0226-02-29', '2026-02-20T16:00:00+00')],
  array['2026-09-22'::date, null], 'both dates wrong: the month and day in the year it was made, if that day exists');

-- ---------------------------------------------------------------------------------------------------------------
-- The run
-- ---------------------------------------------------------------------------------------------------------------
select matches(public.mdr_sync_begin()->>'mdr_sql',
  'job_id = ''f0000000-0000-0000-0000-000000000981''::uuid and updated_at > ''-infinity''::timestamptz',
  'the first run reads every row of the linked job');
select ok(position(';' in public.mdr_sync_begin()->>'mdr_sql') = 0, 'the MDR SELECT has no semicolon');

create temp table r1 as select public.mdr_import_requests((select doc from mdr)) as res;
select is((select res->'counts' from r1),
  '{"adopted": 1, "inserted": 5, "skipped": 2}'::jsonb, 'adopted 1, inserted 5, skipped 2');
select is((select jsonb_array_length(res->'errors') from r1), 1, 'one row refused');
select matches((select res->'errors'->0->>'error' from r1), 'unknown MDR status mystery', 'it says why');
select is((select array_agg(x->>'why' order by x->>'why') from r1, jsonb_array_elements(res->'skipped') x),
  array['deleted in MDR', 'no IR number'], 'skipped: never copied and deleted, and no IR number');

create temp table e1 as select public.mdr_sync_end() as res;
select is((select (res->'jobs'->0->>'cursor')::timestamptz from e1), '2026-09-24T18:00:00+00'::timestamptz - interval '1 microsecond',
  'the cursor stops just before the refused row');
select is((select (res->'jobs'->0->>'stopped_at_error')::boolean from e1), true, 'and says so');
select matches((select res->>'files_kick' from e1), '^not asked', 'no pg_net here: the files call is reported, not hidden');

-- Run again: nothing new.
select public.mdr_sync_begin();
create temp table r2 as select public.mdr_import_requests((select doc from mdr)) as res;
select is((select res->'counts' from r2), '{"skipped": 2, "unchanged": 6}'::jsonb, 'a repeat changes nothing');
select is((select count(*)::int from public.inspection_requests where project_id = 'c0000000-0000-0000-0000-000000000981'),
  7, 'and makes no duplicates');
select public.mdr_sync_end();

-- The round trip as the scheduled task runs it: the SELECT from mdr_sync_begin, run on a stand-in for MDR's table, makes
-- the import calls, and each call runs as written.
create temp table mdr_ir (id uuid, job_id uuid, ir_number int, ir_title text, inspection_types text[], special_type text,
  inspection_date date, requested_date date, inspection_time time, duration int, flexible_display text, status text,
  approval_status text, approved_at timestamptz, approved_by text, inspector_notes text, notes text, requester_name text,
  requester_company text, requester_email text, subcontractor text, sub_trade text, gc text, location_detail text,
  attendance text, file_urls text[], ir_pdf_url text, postpone_reason text, postpone_note text, expected_date date,
  postpone_count int, cancel_reason text, deleted_at timestamptz, created_at timestamptz, updated_at timestamptz);
insert into mdr_ir select * from jsonb_populate_recordset(null::mdr_ir, (select doc from mdr));
create function pg_temp.batches(q text) returns table (batch bigint, n bigint, last_at timestamptz, suite_sql text)
  language plpgsql as $$ begin return query execute replace(q, 'public.inspection_requests', 'pg_temp.mdr_ir'); end $$;
create function pg_temp.run(q text) returns jsonb language plpgsql as $$ declare v jsonb; begin execute q into v; return v; end $$;
create temp table rt as select * from pg_temp.batches(public.mdr_sync_begin()->>'mdr_sql');
select is((select array_agg(n) from rt), array[4::bigint], 'one batch: the 4 rows changed since the cursor');
select ok((select position(';' in suite_sql) = 0 and suite_sql like 'select public.mdr_import_requests(%' from rt),
  'the import call has no semicolon, though a row''s text does');
select is((select pg_temp.run(suite_sql)->'counts' from rt), '{"unchanged": 3}'::jsonb, 'and runs as written');
select public.mdr_sync_end();

-- ---------------------------------------------------------------------------------------------------------------
-- What landed
-- ---------------------------------------------------------------------------------------------------------------
select is((pg_temp.ir('981')).id, '10000000-0000-0000-0000-000000000981'::uuid, 'IR 309 typed by hand is adopted');
select is((select count(*)::int from public.inspection_requests where project_id = 'c0000000-0000-0000-0000-000000000981'
           and number = 309), 1, 'not copied twice');
select is(row((pg_temp.ir('981')).status, (pg_temp.ir('981')).result, (pg_temp.ir('981')).result_note,
              (pg_temp.ir('981')).company)::text,
  row('confirmed', 'approved', 'OK to cover', 'Sample Plumbing')::text, 'approved, its note, the company');
select is((pg_temp.ir('981')).items, 'Shower pan test; level 1', 'the request text keeps its semicolon');

select is((pg_temp.ir('982')).number, 397, 'MDR''s IR 397 lands beside the hidden demo 397');
select is((select deleted_at is not null from public.inspection_requests where id = '10000000-0000-0000-0000-000000000982'),
  true, 'the demo stays hidden');
select is(row((pg_temp.ir('982')).kind, (pg_temp.ir('982')).status, (pg_temp.ir('982')).ofs_sent_at is not null,
              (pg_temp.ir('982')).ofs_number is null, (pg_temp.ir('982')).ofs_attest_at is null)::text,
  row('ofs', 'confirmed', true, true, true)::text, 'a scheduled OFS request: with OFS, no suite OFS number, no statement');
select matches((select title from public.calendar_entries where source_type = 'ofs_request'
                 and source_id = (pg_temp.ir('982')).id), '^IR 397 Confirmed', 'its OFS calendar line');

select is((select count(*)::int from public.inspection_requests where project_id = 'c0000000-0000-0000-0000-000000000981'
           and number = 344 and mdr_id is not null), 2, 'two MDR requests on one number both land');
select is(row((pg_temp.ir('983')).kind, (select name from public.ir_special_kinds where id = (pg_temp.ir('983')).special_kind_id),
              (pg_temp.ir('983')).attendance)::text,
  row('special', 'Concrete', 'alone')::text, 'special type and attendance');
select is(row((pg_temp.ir('984')).requester_name, (pg_temp.ir('984')).requester_email, (pg_temp.ir('984')).requested_by)::text,
  row('Rita Requester', 'rita@example.test', null::uuid)::text, 'requester name and address, no account');

select is(row((pg_temp.ir('988')).request_date, (pg_temp.ir('988')).start_time, (pg_temp.ir('988')).status,
              (pg_temp.ir('988')).postpone_reason, (pg_temp.ir('988')).postpone_until)::text,
  row('2026-09-25'::date, '10:30'::time, 'postponed', 'not_ready', '2026-09-30'::date)::text,
  'a year-0026 date falls back, 10:35 becomes 10:30, postponed as not ready');
select is((pg_temp.ir('989')).status, 'withdrawn', 'cancelled is withdrawn');
select is((select count(*)::int from public.calendar_entries where source_type = 'inspection_request'
           and source_id = (pg_temp.ir('983')).id and deleted_at is null), 1, 'a copy is on the job calendar');
select is((select action from public.ir_events where request_id = (pg_temp.ir('983')).id order by id limit 1), 'mdr',
  'its history says it came from MDR');

-- ---------------------------------------------------------------------------------------------------------------
-- Numbers
-- ---------------------------------------------------------------------------------------------------------------
select is((select next_value from public.project_counters where project_id = 'c0000000-0000-0000-0000-000000000981'
           and kind = 'ir'), 429, 'the job''s counter jumps past the highest mirrored number');
set local role service_role;
select pg_temp.login_service();
select is(public.next_number('c0000000-0000-0000-0000-000000000981', 'ir'), 429, 'the next suite request is IR 429');
reset role;
select throws_ok($$ insert into public.inspection_requests (org_id, project_id, number, requested_by, company, request_date,
    duration_kind, kind, items, notice_ack_at, status)
  values ('b0000000-0000-0000-0000-000000000981', 'c0000000-0000-0000-0000-000000000981', 397,
          'a0000000-0000-0000-0000-000000000983', 'X', '2026-10-30', 'all_day', 'ior', 'x', now(), 'pending') $$,
  '23505', null, 'the suite''s own numbers stay unique, hidden ones too');

-- ---------------------------------------------------------------------------------------------------------------
-- View only
-- ---------------------------------------------------------------------------------------------------------------
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000982');
select is((select count(*)::int from public.inspection_requests where mdr_id is not null), 6, 'the inspector reads the copies');
select is((select array_agg(from_mdr order by from_mdr) from public.calendar_inspections('c0000000-0000-0000-0000-000000000981',
             '2026-09-21', '2026-09-21')), array[true, true], 'the day list marks both copies as from MDR');
select throws_ok(format('select public.ir_move(%L, %s, %L)', (pg_temp.ir('984')).id, (pg_temp.ir('984')).version, '2026-12-01'),
  '42501', 'This request comes from MDR. It is view only.', 'it can''t be moved');
select throws_ok(format('select public.ir_confirm(%L, %s)', (pg_temp.ir('984')).id, (pg_temp.ir('984')).version),
  '42501', null, 'or confirmed');
select throws_ok(format('select public.ir_postpone(%L, %s, %L, null, null)', (pg_temp.ir('984')).id,
                        (pg_temp.ir('984')).version, 'weather'),
  '42501', null, 'or postponed');
select throws_ok(format('select public.ir_set_result(%L, %s, %L, null, null)', (pg_temp.ir('982')).id,
                        (pg_temp.ir('982')).version, 'approved'),
  '42501', null, 'or decided');
select throws_ok(format('select public.ir_assign_helper(%L, %s, null)', (pg_temp.ir('983')).id, (pg_temp.ir('983')).version),
  '42501', null, 'or handed to a helper');
select pg_temp.login('a0000000-0000-0000-0000-000000000984');
select throws_ok(format('select public.ir_confirm(%L, %s)', (pg_temp.ir('982')).id, (pg_temp.ir('982')).version),
  '42501', null, 'the fire marshal can''t confirm a copied OFS request either');
reset role;
select throws_ok(format('update public.inspection_requests set items = %L where id = %L', 'changed', (pg_temp.ir('984')).id),
  '42501', 'This request comes from MDR. It is view only.', 'no write path at all, not even the owner''s');
select throws_ok(format('insert into public.ir_maps (org_id, project_id, request_id) values (%L, %L, %L)',
                        'b0000000-0000-0000-0000-000000000981', 'c0000000-0000-0000-0000-000000000981', (pg_temp.ir('982')).id),
  '42501', null, 'no map on a copy');
select lives_ok(format('update public.inspection_requests set requested_by = %L where id = %L',
                       'a0000000-0000-0000-0000-000000000983', (pg_temp.ir('984')).id),
  'the requester proving their email still claims it');
select is((pg_temp.ir('984')).requested_by, 'a0000000-0000-0000-0000-000000000983'::uuid, 'claimed');

-- ---------------------------------------------------------------------------------------------------------------
-- Files
-- ---------------------------------------------------------------------------------------------------------------
select is((select count(*)::int from public.mdr_file_queue where request_id = (pg_temp.ir('983')).id), 3,
  'two attachments and the IR PDF wait, once each');
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000981');
select throws_ok('select * from public.mdr_file_queue', '42501', null, 'a person can''t read the queue');
select throws_ok('select * from public.mdr_job_links', '42501', null, 'or the links');
set local role anon;
select throws_ok('select * from public.mdr_file_queue', '42501', null, 'nor can anon');
set local role service_role;
select pg_temp.login_service();
select throws_ok('select * from public.mdr_file_queue', '42501', null, 'the server reaches it only through its steps');

create temp table claimed as select * from public.mdr_file_claim(10);
select is((select count(*)::int from claimed), 3, 'the server takes what waits');
select is((select f.name from claimed c join public.folders f on f.id = c.folder_id where c.role = 'ir_pdf'),
  'Inspection reports', 'the IR PDF goes where IR PDFs live');
select is((select f.name from claimed c join public.folders f on f.id = c.folder_id where c.role = 'attachment' limit 1),
  'Inspection requests', 'attachments go in the request files');
insert into public.files (id, org_id, project_id, folder_id, storage_path, original_name, mime, size, sha256, scan_status,
                          upload_complete)
select 'e0000000-0000-0000-0000-000000000981', 'b0000000-0000-0000-0000-000000000981', 'c0000000-0000-0000-0000-000000000981',
       c.folder_id, 'project/x/y/z/IR_344.pdf', 'IR_344.pdf', 'application/pdf', 100, repeat('b', 64), 'clean', true
  from claimed c where c.role = 'ir_pdf';
select lives_ok($$ select public.mdr_file_done((select id from claimed where role = 'ir_pdf'),
                                              'e0000000-0000-0000-0000-000000000981') $$, 'the copied IR PDF is linked');
select is(row((pg_temp.ir('983')).ir_file_id, (pg_temp.ir('983')).status, (pg_temp.ir('983')).content_hash)::text,
  row('e0000000-0000-0000-0000-000000000981'::uuid, 'complete', repeat('b', 64))::text, 'and the approved request is complete');
select lives_ok($$ select public.mdr_file_failed((select id from claimed where role = 'attachment' limit 1), 'Not MDR', true) $$,
  'a link to anywhere else is refused');

select * from finish();
rollback;
