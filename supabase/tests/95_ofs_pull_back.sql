begin;
select plan(51);
-- Migration 0109 (Jesse, Oct 22: "The fire marshal shouldn't have to be responsible for taking things off the
-- inspection request that weren't ready or failed. That should be the contractor"). On an OFS request the requester,
-- the job's OFS duty holder or the GC step takes walls x items off ("Not ready") until a result is recorded, also once
-- it is with OFS. The cell is open again on the card, the request's line, legend and map lose it for everyone, the fire
-- marshal gets one board line, it is audited, and Undo puts it back. Everything off withdraws the request. The fire
-- marshal, the inspector and another sub cannot. Pass all writes the same sign-offs as passing them one by one.
-- Back from OFS lists each failed item still to be inspected again, for the requester too.
\ir _helpers.psql

create temp table ids (k text primary key, v uuid);
grant all on ids to public;
create function pg_temp.rid(p_k text) returns uuid language sql stable as $$ select v from ids where k = p_k $$;
create function pg_temp.req(p_k text) returns public.inspection_requests language sql stable security definer as $$
  select * from public.inspection_requests where id = (select v from ids where k = p_k) $$;
create function pg_temp.ver(p_k text) returns int language sql stable security definer as $$
  select version from public.inspection_requests where id = (select v from ids where k = p_k) $$;
create function pg_temp.cells(variadic p text[]) returns jsonb language sql stable as $$
  select jsonb_agg(jsonb_build_object('area_id', pg_temp.rid(split_part(x, '.', 1)), 'item_id', pg_temp.rid(split_part(x, '.', 2))))
    from unnest(p) x $$;
create function pg_temp.st(p_cell text) returns text language sql volatile as $$
  select s.status from public.rev_status('c0000000-0000-0000-0000-000000000951') s
   where s.area_id = pg_temp.rid(split_part(p_cell, '.', 1)) and s.item_id = pg_temp.rid(split_part(p_cell, '.', 2)) $$;
create function pg_temp.live(p_k text) returns int language sql volatile security definer as $$
  select count(*)::int from public.ir_rev_items where request_id = pg_temp.rid(p_k) and pulled_at is null $$;
create function pg_temp.all_cells(p_k text) returns int language sql volatile security definer as $$
  select count(*)::int from public.ir_rev_items where request_id = pg_temp.rid(p_k) $$;
create function pg_temp.strokes(p_k text) returns int language sql volatile security definer as $$
  select jsonb_array_length(strokes) from public.ir_maps where request_id = pg_temp.rid(p_k) $$;
create function pg_temp.audits(p_action text, p_k text) returns int language sql volatile security definer as $$
  select count(*)::int from public.audit_events where action = p_action and entity_id = pg_temp.rid(p_k) $$;
create function pg_temp.lines_to(p_uid uuid, p_kind text) returns text[] language sql volatile security definer as $$
  select coalesce(array_agg(a.summary order by a.created_at, a.summary), '{}')
    from public.activity a
   where a.kind = p_kind and a.project_id = 'c0000000-0000-0000-0000-000000000951'
     and (exists (select 1 from public.activity_recipients r where r.activity_id = a.id and r.user_id = p_uid)
          or (a.audience_capability is not null and exists (
                select 1 from public.project_members pm join public.role_permissions rp on rp.role = pm.role
                 where pm.project_id = a.project_id and pm.user_id = p_uid and rp.capability = a.audience_capability))) $$;
create function pg_temp.status_of(p_k text) returns text[] language sql volatile as $$
  select array_agg(s.status || ':' || (s.request_id = pg_temp.rid(p_k))::text || ':' || (s.ofs_number is not null)::text
                   order by s.area_id, s.item_id)
    from public.rev_status('c0000000-0000-0000-0000-000000000951') s
   where s.request_id = pg_temp.rid(p_k) $$;
grant execute on all functions in schema pg_temp to public;

select pg_temp.mk_user('a0000000-0000-0000-0000-000000000951', 'probe+pb-admin@example.test', 'Ada Admin');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000952', 'probe+pb-insp@example.test', 'Ivy Inspector');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000953', 'probe+pb-ahj@example.test', 'Dana Deputy');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000954', 'probe+pb-sub@example.test', 'Sam Sub');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000955', 'probe+pb-sub2@example.test', 'Otto Other');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000956', 'probe+pb-pm@example.test', 'Pat Manager');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000957', 'probe+pb-pe@example.test', 'Penny Engineer');

insert into public.orgs (id, name, kind, created_by) values
  ('b0000000-0000-0000-0000-000000000951', 'Sample Pull Builders', 'gc', 'a0000000-0000-0000-0000-000000000951');
insert into public.projects (id, org_id, name, stage, timezone, created_by, settings) values
  ('c0000000-0000-0000-0000-000000000951', 'b0000000-0000-0000-0000-000000000951', 'Pull Job', 'construction',
   'America/Los_Angeles', 'a0000000-0000-0000-0000-000000000951', '{"ir_ofs_allowed": true}');
insert into public.project_members (org_id, project_id, user_id, invite_email, role, status)
select 'b0000000-0000-0000-0000-000000000951', 'c0000000-0000-0000-0000-000000000951', u::uuid, e, r, 'active'
  from (values ('a0000000-0000-0000-0000-000000000952', 'probe+pb-insp@example.test', 'inspector'),
               ('a0000000-0000-0000-0000-000000000953', 'probe+pb-ahj@example.test', 'ahj'),
               ('a0000000-0000-0000-0000-000000000954', 'probe+pb-sub@example.test', 'sub'),
               ('a0000000-0000-0000-0000-000000000955', 'probe+pb-sub2@example.test', 'sub'),
               ('a0000000-0000-0000-0000-000000000956', 'probe+pb-pm@example.test', 'pm'),
               ('a0000000-0000-0000-0000-000000000957', 'probe+pb-pe@example.test', 'pe')) v(u, e, r);
insert into public.folders (id, org_id, project_id, name, created_by) values
  ('d0000000-0000-0000-0000-000000000951', 'b0000000-0000-0000-0000-000000000951', 'c0000000-0000-0000-0000-000000000951',
   'Sample Plans', 'a0000000-0000-0000-0000-000000000951');
insert into public.files (id, org_id, project_id, folder_id, storage_path, original_name, mime, created_by, scan_status) values
  ('e0000000-0000-0000-0000-000000000951', 'b0000000-0000-0000-0000-000000000951', 'c0000000-0000-0000-0000-000000000951',
   'd0000000-0000-0000-0000-000000000951', 'test/pull/l01.pdf', 'Sample L01.pdf', 'application/pdf',
   'a0000000-0000-0000-0000-000000000951', 'clean');
update public.files set upload_complete = true where id = 'e0000000-0000-0000-0000-000000000951';

-- The inspector's list (TOW: one item, HOW: one), walls A, B, C on Level 01 (A and B drawn on the sheet), room 101.
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000952');
insert into ids select 'L', (public.rev_list_create('c0000000-0000-0000-0000-000000000951', 'Sample Rated Walls', 'PH III', null,
  '[{"number": 0, "name": "TOW", "items": [{"name": "TOW One"}]}, {"number": 1, "name": "HOW", "items": [{"name": "HOW Stuff"}]}]')).id;
insert into ids select case i.name when 'TOW One' then 'tow' else 'how' end, i.id
  from public.rev_items i join public.revs v on v.id = i.rev_id where v.list_id = pg_temp.rid('L');
insert into ids select a.name, a.id
  from public.rev_areas_add(pg_temp.rid('L'), 'Level 01', array['A', 'B', 'C'], 'e0000000-0000-0000-0000-000000000951') a;
select is(public.rev_rooms_load(pg_temp.rid('L'), jsonb_build_array(
    jsonb_build_object('level', 'Level 01', 'number', '101', 'name', 'MPOE', 'walls', jsonb_build_array(
      jsonb_build_object('area_id', pg_temp.rid('A')), jsonb_build_object('area_id', pg_temp.rid('B')),
      jsonb_build_object('area_id', pg_temp.rid('C')))))) -> 'rooms', '1'::jsonb, 'room 101 with its three walls');
reset role;
update public.rev_areas set geom = '[[0.1, 0.1], [0.3, 0.1]]', sheet_page = 1 where id = pg_temp.rid('A');
update public.rev_areas set geom = '[[0.5, 0.5], [0.5, 0.8]]', sheet_page = 1 where id = pg_temp.rid('B');
-- The project engineer holds the job's OFS requests duty.
insert into public.project_duties (org_id, project_id, duty, company, person_id, set_by) values
  ('b0000000-0000-0000-0000-000000000951', 'c0000000-0000-0000-0000-000000000951', 'ofs_requests', 'Sample Pull Builders',
   'a0000000-0000-0000-0000-000000000957', 'a0000000-0000-0000-0000-000000000951');

-- The sub's request: A, B, C x TOW, HOW (TOW is color 1, HOW color 2). Its map: each wall's strokes as the app draws
-- them (two colors side by side) and one stroke by hand.
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000954');
insert into ids select 'Q', (public.ir_submit_ofs('c0000000-0000-0000-0000-000000000951', 'Sample Firestop Co', current_date + 3, true,
  array[pg_temp.rid('A'), pg_temp.rid('B'), pg_temp.rid('C')], array[pg_temp.rid('tow'), pg_temp.rid('how')], null, '08:00',
  'timed', 60, '{}', false)).id;
select is(array[(pg_temp.req('Q')).status, (pg_temp.req('Q')).items], array['gc_review', 'Level 01 · TOW One & HOW Stuff · A, B, C'],
  'the request: with the GC, three walls and two items');
reset role;
update public.ir_maps set strokes = '[
  {"c": 1, "w": 0.004, "p": [[0.1, 0.098], [0.3, 0.098]]}, {"c": 2, "w": 0.004, "p": [[0.1, 0.102], [0.3, 0.102]]},
  {"c": 1, "w": 0.004, "p": [[0.502, 0.5], [0.502, 0.8]]}, {"c": 2, "w": 0.004, "p": [[0.498, 0.8], [0.498, 0.5]]},
  {"c": 1, "w": 0.004, "p": [[0.8, 0.8], [0.9, 0.9]]}]', sheet_file_id = 'e0000000-0000-0000-0000-000000000951', page = 1
 where request_id = pg_temp.rid('Q');
set local role authenticated;

-- ---------------------------------------------------------------------------------------------------------------------
-- Who may
-- ---------------------------------------------------------------------------------------------------------------------
select pg_temp.login('a0000000-0000-0000-0000-000000000952');
select throws_ok($$ select public.ir_rev_pull_back(pg_temp.rid('Q'), pg_temp.ver('Q'), pg_temp.cells('C.tow')) $$, '42501', 'forbidden',
  'the inspector does not take walls off');
select pg_temp.login('a0000000-0000-0000-0000-000000000955');
select throws_ok($$ select public.ir_rev_pull_back(pg_temp.rid('Q'), pg_temp.ver('Q'), pg_temp.cells('C.tow')) $$, 'P0002', 'not_found',
  'another sub does not find it');
select pg_temp.login('a0000000-0000-0000-0000-000000000953');
select throws_ok($$ select public.ir_rev_pull_back(pg_temp.rid('Q'), pg_temp.ver('Q'), pg_temp.cells('C.tow')) $$, 'P0002', 'not_found',
  'the fire marshal does not find it before it is sent');
reset role;
set local role anon;
select throws_ok($$ select public.ir_rev_pull_back('00000000-0000-0000-0000-000000000000', 1, '[]') $$, '42501', null,
  'anon can''t call it');
reset role;
select ok(not has_function_privilege('authenticated', 'public.ir_map_drop_walls(uuid, jsonb)', 'EXECUTE')
          and not has_function_privilege('authenticated', 'public.ir_may_pull_back(uuid, text, uuid)', 'EXECUTE')
          and not has_function_privilege('authenticated', 'public.ir_pull_cells(uuid, jsonb, boolean)', 'EXECUTE')
          and has_function_privilege('authenticated', 'public.ir_rev_put_back(uuid, integer, jsonb)', 'EXECUTE'),
  'the helpers are internal, the two calls are not');
set local role authenticated;

-- ---------------------------------------------------------------------------------------------------------------------
-- The requester takes wall B off while it is with the GC, and Undo puts it back
-- ---------------------------------------------------------------------------------------------------------------------
select pg_temp.login('a0000000-0000-0000-0000-000000000954');
select throws_ok($$ select public.ir_rev_pull_back(pg_temp.rid('Q'), pg_temp.ver('Q'), '[{"area_id": "x"}]') $$, '22023',
  'Pick the walls to take off.', 'a malformed pick is refused');
select throws_ok($$ select public.ir_rev_pull_back(pg_temp.rid('Q'), pg_temp.ver('Q') - 1, pg_temp.cells('B.tow')) $$, '40001', null,
  'a stale version is refused');
select is((public.ir_rev_pull_back(pg_temp.rid('Q'), pg_temp.ver('Q'), pg_temp.cells('B.tow', 'B.how'))).items,
  'Level 01 · TOW One & HOW Stuff · A, C', 'B off: the request''s line follows');
select is(array[pg_temp.st('B.tow'), pg_temp.st('B.how'), pg_temp.st('A.tow')], array['open', 'open', 'requested'],
  'B is open again on the card, A still asked for');
select is(array[pg_temp.live('Q'), pg_temp.all_cells('Q')], array[4, 6], 'the rows stay, marked taken off');
select is(pg_temp.strokes('Q'), 3, 'the map loses B''s two strokes, keeps A''s and the hand-drawn one');
select is((select (public.ir_map_context(pg_temp.rid('Q'))) ->> 'what'), 'Level 01 TOW One & HOW Stuff', 'the map''s title is the same');
select is(pg_temp.audits('ir.rev_pull_back', 'Q'), 1, 'audited');
select throws_ok($$ select public.ir_rev_pull_back(pg_temp.rid('Q'), pg_temp.ver('Q'), pg_temp.cells('B.tow')) $$, '22023',
  'Those walls are not on this request.', 'B is not on it any more');
select is(array[(r).status, (r).items] , array['gc_review', 'Level 01 · TOW One & HOW Stuff · A, B, C'],
  'Undo: B back, the line as it was')
  from (select public.ir_rev_put_back(pg_temp.rid('Q'), pg_temp.ver('Q'), pg_temp.cells('B.tow', 'B.how')) as r) x;
select is(array[pg_temp.live('Q'), pg_temp.strokes('Q')], array[6, 5], '... its cells and its strokes too');
select is(pg_temp.st('B.how'), 'requested', '... and it is asked for again on the card');

-- The GC passes it on, the inspector sends it to OFS.
select pg_temp.login('a0000000-0000-0000-0000-000000000956');
select is((public.ir_ofs_check(pg_temp.rid('Q'), pg_temp.ver('Q'), 'gc', true)).status, 'pending', 'the GC passes it on');
select pg_temp.login('a0000000-0000-0000-0000-000000000952');
select ok((public.ir_send_ofs(pg_temp.rid('Q'), pg_temp.ver('Q'))).ofs_sent_at is not null, 'with OFS');

-- ---------------------------------------------------------------------------------------------------------------------
-- With OFS: the requester takes C's HOW off, the project engineer (duty holder) and the GC may too, the fire marshal may not
-- ---------------------------------------------------------------------------------------------------------------------
select pg_temp.login('a0000000-0000-0000-0000-000000000953');
select throws_ok($$ select public.ir_rev_pull_back(pg_temp.rid('Q'), pg_temp.ver('Q'), pg_temp.cells('C.tow')) $$, '42501', 'forbidden',
  'the fire marshal reads it now, and still takes nothing off');
select pg_temp.login('a0000000-0000-0000-0000-000000000954');
select is((public.ir_rev_pull_back(pg_temp.rid('Q'), pg_temp.ver('Q'), pg_temp.cells('C.how'))).status, 'pending',
  'the requester takes C''s HOW off once it is with OFS');
select pg_temp.login('a0000000-0000-0000-0000-000000000957');
select is((public.ir_rev_pull_back(pg_temp.rid('Q'), pg_temp.ver('Q'), pg_temp.cells('C.tow'))).status, 'pending',
  'the duty holder takes C''s TOW off');
select is(pg_temp.live('Q'), 4, 'four cells left: A and B');
select is(pg_temp.st('C.tow'), 'open', 'C is open again');
reset role;
select is(pg_temp.lines_to('a0000000-0000-0000-0000-000000000953', 'ir.pulled_back'),
  array['OFS #' || lpad((pg_temp.req('Q')).ofs_number::text, 4, '0') || ': 1 item taken off by Sam Sub',
        'OFS #' || lpad((pg_temp.req('Q')).ofs_number::text, 4, '0') || ': 1 wall taken off by Penny Engineer'],
  'the fire marshal gets one board line each time');
select is(pg_temp.lines_to('a0000000-0000-0000-0000-000000000954', 'ir.pulled_back'),
  array['OFS #' || lpad((pg_temp.req('Q')).ofs_number::text, 4, '0') || ': 1 wall taken off by Penny Engineer'],
  'the requester hears when someone else took one off');
select is(pg_temp.lines_to('a0000000-0000-0000-0000-000000000952', 'ir.pulled_back'), '{}'::text[],
  'the inspector does not: it is with OFS');
set local role authenticated;

-- The fire marshal records what is left: every live cell, and only those.
select pg_temp.login('a0000000-0000-0000-0000-000000000953');
select throws_ok($$ select public.ir_rev_results(pg_temp.rid('Q'), pg_temp.ver('Q'), jsonb_build_array(
    jsonb_build_object('area_id', pg_temp.rid('A'), 'item_id', pg_temp.rid('tow'), 'result', 'passed'),
    jsonb_build_object('area_id', pg_temp.rid('A'), 'item_id', pg_temp.rid('how'), 'result', 'passed'),
    jsonb_build_object('area_id', pg_temp.rid('B'), 'item_id', pg_temp.rid('tow'), 'result', 'passed'),
    jsonb_build_object('area_id', pg_temp.rid('B'), 'item_id', pg_temp.rid('how'), 'result', 'passed'),
    jsonb_build_object('area_id', pg_temp.rid('C'), 'item_id', pg_temp.rid('tow'), 'result', 'passed'))) $$,
  '22023', 'Record every wall.', 'a wall taken off can''t be recorded');
select is((public.ir_rev_results(pg_temp.rid('Q'), pg_temp.ver('Q'), jsonb_build_array(
    jsonb_build_object('area_id', pg_temp.rid('A'), 'item_id', pg_temp.rid('tow'), 'result', 'passed'),
    jsonb_build_object('area_id', pg_temp.rid('A'), 'item_id', pg_temp.rid('how'), 'result', 'failed', 'note', 'Sample gap'),
    jsonb_build_object('area_id', pg_temp.rid('B'), 'item_id', pg_temp.rid('tow'), 'result', 'passed'),
    jsonb_build_object('area_id', pg_temp.rid('B'), 'item_id', pg_temp.rid('how'), 'result', 'passed')))).result,
  'not_approved', 'one failure: Not approved, as before');
select is(array[pg_temp.st('A.tow'), pg_temp.st('A.how'), pg_temp.st('B.how'), pg_temp.st('C.tow')],
  array['passed', 'failed', 'passed', 'open'], 'passed are signed off, the failed one waits, C never was asked');

-- Not after results.
select pg_temp.login('a0000000-0000-0000-0000-000000000954');
select throws_ok($$ select public.ir_rev_pull_back(pg_temp.rid('Q'), pg_temp.ver('Q'), pg_temp.cells('A.how')) $$, '22023',
  'The results are in. Nothing can come off now.', 'the requester can''t take anything off once results are in');
select throws_ok($$ select public.ir_rev_put_back(pg_temp.rid('Q'), pg_temp.ver('Q'), pg_temp.cells('C.tow')) $$, '22023',
  'The results are in. Nothing can go back on now.', 'nor put one back');

-- Back from OFS: the failed item itself, for the requester (his own request) and the designated person.
select is((select array_agg(x ->> 'title') from jsonb_array_elements(public.ofs_desk('c0000000-0000-0000-0000-000000000951') -> 'rows') x
            where x ->> 'state' = 'failed'), array['101 MPOE · A · HOW Stuff: Sample gap'],
  'the requester''s start page: the failed item under Back from OFS');
select is((public.ofs_desk('c0000000-0000-0000-0000-000000000951') ->> 'designated')::boolean, false, '... and no boxes for him');
select pg_temp.login('a0000000-0000-0000-0000-000000000957');
select is((select array_agg(x ->> 'state' order by x ->> 'state') from jsonb_array_elements(public.ofs_desk('c0000000-0000-0000-0000-000000000951') -> 'rows') x),
  array['failed'], 'the designated person: the failed item, not the request that failed it');
select pg_temp.login('a0000000-0000-0000-0000-000000000955');
select is(public.ofs_desk('c0000000-0000-0000-0000-000000000951'), null, 'another sub with no OFS request: no start page');

-- ---------------------------------------------------------------------------------------------------------------------
-- Everything off: withdrawn, Request again refused, Undo brings it back as it was
-- ---------------------------------------------------------------------------------------------------------------------
select pg_temp.login('a0000000-0000-0000-0000-000000000954');
insert into ids select 'R', (public.ir_submit_ofs('c0000000-0000-0000-0000-000000000951', 'Sample Firestop Co', current_date + 4, true,
  array[pg_temp.rid('C')], array[pg_temp.rid('tow'), pg_temp.rid('how')], null, '09:00', 'timed', 60, '{}', false)).id;
select is(pg_temp.st('C.tow'), 'requested', 'C asked for again');
select is((public.ir_rev_pull_back(pg_temp.rid('R'), pg_temp.ver('R'), pg_temp.cells('C.tow', 'C.how'))).status, 'withdrawn',
  'all of it off: withdrawn');
select is(pg_temp.st('C.tow'), 'open', 'C is open again');
select throws_ok($$ select public.ir_restore(pg_temp.rid('R'), pg_temp.ver('R')) $$, '22023', 'Its walls were taken off. Request them again.',
  'Request again is refused: nothing is left on it');
select is((public.ir_rev_put_back(pg_temp.rid('R'), pg_temp.ver('R'), pg_temp.cells('C.tow', 'C.how'))).status, 'gc_review',
  'Undo: back with the GC, where it was');
select is(array[pg_temp.live('R'), pg_temp.audits('ir.rev_put_back', 'R')], array[2, 1], 'its cells back, audited');

-- A cell asked for on another request since can't be put back.
select is((public.ir_rev_pull_back(pg_temp.rid('R'), pg_temp.ver('R'), pg_temp.cells('C.how'))).items,
  'Level 01 · TOW One · C', 'C''s HOW off again');
insert into ids select 'S', (public.ir_submit_ofs('c0000000-0000-0000-0000-000000000951', 'Sample Firestop Co', current_date + 5, true,
  array[pg_temp.rid('C')], array[pg_temp.rid('how')], null, '10:00', 'timed', 60, '{}', false)).id;
select throws_ok($$ select public.ir_rev_put_back(pg_temp.rid('R'), pg_temp.ver('R'), pg_temp.cells('C.how')) $$, '22023',
  'That wall is on IR ' || (pg_temp.req('S')).number || ' now.', 'Undo is refused once the wall is on another request');

-- ---------------------------------------------------------------------------------------------------------------------
-- Pass all writes the same sign-offs as passing one by one
-- ---------------------------------------------------------------------------------------------------------------------
-- C's TOW on R and C's HOW on S, both with OFS: R by Pass all, S failed first and then flipped to Pass.
reset role;
update public.inspection_requests set status = 'pending', ofs_sent_at = now(), ofs_sent_by = 'a0000000-0000-0000-0000-000000000952'
 where id in (pg_temp.rid('R'), pg_temp.rid('S'));
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000953');
select is((public.ir_rev_results(pg_temp.rid('R'), pg_temp.ver('R'), jsonb_build_array(
    jsonb_build_object('area_id', pg_temp.rid('C'), 'item_id', pg_temp.rid('tow'), 'result', 'passed')))).result,
  'approved', 'Pass all on R');
select is((public.ir_rev_results(pg_temp.rid('S'), pg_temp.ver('S'), jsonb_build_array(
    jsonb_build_object('area_id', pg_temp.rid('C'), 'item_id', pg_temp.rid('how'), 'result', 'failed', 'note', 'Sample gap')))).result,
  'not_approved', 'S: Fail first');
select is((public.ir_rev_results(pg_temp.rid('S'), pg_temp.ver('S'), jsonb_build_array(
    jsonb_build_object('area_id', pg_temp.rid('C'), 'item_id', pg_temp.rid('how'), 'result', 'passed')))).result,
  'approved', '... then that one flipped to Pass');
select is(array[pg_temp.status_of('R'), pg_temp.status_of('S')], array[array['passed:true:true'], array['passed:true:true']],
  'both signed off the same way: passed, by their request, with its OFS number');
select pg_temp.login('a0000000-0000-0000-0000-000000000954');
select throws_ok($$ select public.ir_submit_ofs('c0000000-0000-0000-0000-000000000951', 'Sample Firestop Co', current_date + 6, true,
    array[pg_temp.rid('C')], array[pg_temp.rid('tow'), pg_temp.rid('how')], null, '08:00', 'timed', 60, '{}', false) $$,
  '22023', 'Already passed.', 'neither can be asked for again');

select * from finish();
rollback;
