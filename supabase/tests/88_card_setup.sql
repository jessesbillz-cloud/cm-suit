begin;
select plan(35);
-- Migration 0101 (Jesse, Oct 12: pick what a room's walls need, "everything else should just go away"). A room's card:
-- only a manager (revs.manage) sets it up, a reader, another job's manager and anon cannot. Saved, a wall left off
-- leaves the room (it stays in its other room), every item not picked on the kept walls is set up as not applicable
-- (set_up, apart from a hand N/A), and a cell with a sign-off, a request or a failure is never changed. Undo puts it all
-- back, a later save with an item picked again makes it applicable again. One item on or off for one wall. A card's
-- N/A gives way to a sign-off made later. Each save is audited.
\ir _helpers.psql

create temp table ids (k text primary key, v uuid);
grant all on ids to public;
create function pg_temp.rid(p_k text) returns uuid language sql stable as $$ select v from ids where k = p_k $$;
create function pg_temp.st(p_area text, p_item text) returns text language sql volatile as $$
  select s.status from public.rev_status('c0000000-0000-0000-0000-000000000881') s
   where s.area_id = pg_temp.rid(p_area) and s.item_id = pg_temp.rid(p_item) $$;
create function pg_temp.room_ver() returns int language sql volatile security definer as $$
  select version from public.rev_rooms where id = pg_temp.rid('R') $$;
create function pg_temp.in_room(p_room text) returns text language sql volatile security definer as $$
  select string_agg(a.name, ',' order by a.name) from public.rev_room_walls w join public.rev_areas a on a.id = w.area_id
   where w.room_id = pg_temp.rid(p_room) and w.deleted_at is null $$;
create function pg_temp.card_marks() returns int language sql volatile security definer as $$
  select count(*)::int from public.rev_marks where deleted_at is null and set_up $$;
create function pg_temp.hand_marks() returns int language sql volatile security definer as $$
  select count(*)::int from public.rev_marks where deleted_at is null and not set_up $$;
create function pg_temp.history() returns text language sql volatile security definer as $$
  select (select count(*) from public.rev_signoffs where deleted_at is null) || ' signoffs, '
      || (select string_agg(coalesce(result, 'asked'), ',' order by result nulls first) from public.ir_rev_items) $$;
create function pg_temp.audits(p_action text) returns int language sql volatile security definer as $$
  select count(*)::int from public.audit_events where action = p_action $$;
grant execute on all functions in schema pg_temp to public;

select pg_temp.mk_user('a0000000-0000-0000-0000-000000000881', 'probe+cs-admin@example.test', 'Ada Admin');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000882', 'probe+cs-insp@example.test', 'Ivy Inspector');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000883', 'probe+cs-pm@example.test', 'Pat Manager');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000884', 'probe+cs-other@example.test', 'Otto Other');

insert into public.orgs (id, name, kind, created_by) values
  ('b0000000-0000-0000-0000-000000000881', 'Sample Card Builders', 'gc', 'a0000000-0000-0000-0000-000000000881');
insert into public.projects (id, org_id, name, stage, timezone, created_by, settings) values
  ('c0000000-0000-0000-0000-000000000881', 'b0000000-0000-0000-0000-000000000881', 'Card Job', 'construction',
   'America/Los_Angeles', 'a0000000-0000-0000-0000-000000000881', '{"ir_ofs_allowed": true}'),
  ('c0000000-0000-0000-0000-000000000882', 'b0000000-0000-0000-0000-000000000881', 'Other Card Job', 'construction',
   'America/Los_Angeles', 'a0000000-0000-0000-0000-000000000881', '{"ir_ofs_allowed": true}');
insert into public.project_members (org_id, project_id, user_id, invite_email, role, status)
select 'b0000000-0000-0000-0000-000000000881', p::uuid, u::uuid, e, r, 'active'
  from (values ('c0000000-0000-0000-0000-000000000881', 'a0000000-0000-0000-0000-000000000882', 'probe+cs-insp@example.test', 'inspector'),
               ('c0000000-0000-0000-0000-000000000881', 'a0000000-0000-0000-0000-000000000883', 'probe+cs-pm@example.test', 'pm'),
               ('c0000000-0000-0000-0000-000000000882', 'a0000000-0000-0000-0000-000000000884', 'probe+cs-other@example.test', 'inspector'))
       v(p, u, e, r);

-- The inspector's list (TOW: one item, HOW: two, Framing: one), walls A, B, C on Level 01, room 101 with all three and
-- the exterior with C.
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000882');
insert into ids select 'L', (public.rev_list_create('c0000000-0000-0000-0000-000000000881', 'Sample Rated Walls', null, null,
  '[{"number": 0, "name": "TOW", "items": [{"name": "TOW One"}]},
    {"number": 1, "name": "HOW", "items": [{"name": "HOW Stuff"}, {"name": "HOW Spray"}]},
    {"number": 2, "name": "Framing", "items": [{"name": "Framing"}]}]')).id;
insert into ids select case i.name when 'TOW One' then 'tow' when 'HOW Stuff' then 'stuff' when 'HOW Spray' then 'spray' else 'frame' end, i.id
  from public.rev_items i join public.revs v on v.id = i.rev_id where v.list_id = pg_temp.rid('L');
insert into ids select a.name, a.id from public.rev_areas_add(pg_temp.rid('L'), 'Level 01', array['A', 'B', 'C'], null) a;
select is(public.rev_rooms_load(pg_temp.rid('L'), jsonb_build_array(
    jsonb_build_object('level', 'Level 01', 'number', '101', 'name', 'MPOE', 'walls', jsonb_build_array(
      jsonb_build_object('area_id', pg_temp.rid('A')), jsonb_build_object('area_id', pg_temp.rid('B')),
      jsonb_build_object('area_id', pg_temp.rid('C')))),
    jsonb_build_object('level', 'Level 01', 'number', 'EXT', 'name', 'Exterior', 'kind', 'exterior', 'walls', jsonb_build_array(
      jsonb_build_object('area_id', pg_temp.rid('C')))))) -> 'rooms', '2'::jsonb, 'two rooms');
insert into ids select case number when '101' then 'R' else 'X' end, id from public.rev_rooms where list_id = pg_temp.rid('L');

-- History: B's TOW signed off before the app, A asked for HOW Stuff and Framing (Framing failed), a hand N/A on A's
-- spray.
select is((select count(*)::int from public.rev_signoff_set(pg_temp.rid('B'), array[pg_temp.rid('tow')], 41, null, null)), 1,
  'B''s TOW signed off before the app');
insert into ids select 'q', (public.ir_submit_ofs('c0000000-0000-0000-0000-000000000881', 'Sample Co', current_date + 3, true,
  array[pg_temp.rid('A')], array[pg_temp.rid('stuff'), pg_temp.rid('frame')], null, '08:00', 'timed', 60,
  p_special_required => false, p_inspector_ack => true)).id;
reset role;
update public.ir_rev_items set result = 'failed', result_note = 'Sample gap', result_at = now()
 where request_id = pg_temp.rid('q') and item_id = pg_temp.rid('frame');
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000882');
select ok((public.rev_mark_na(pg_temp.rid('A'), pg_temp.rid('spray'), true)).id is not null, 'a hand N/A on A''s spray');
select is(pg_temp.history(), '1 signoffs, asked,failed', 'the history before');

-- ---------------------------------------------------------------------------------------------------------------
-- Who may
-- ---------------------------------------------------------------------------------------------------------------
select pg_temp.login('a0000000-0000-0000-0000-000000000883');
select throws_ok($$ select public.rev_card_save(pg_temp.rid('R'), null, array[pg_temp.rid('A')], '{}') $$, '42501', 'forbidden',
  'a reader (the PM) can''t set up a card');
select throws_ok($$ select public.rev_card_item(pg_temp.rid('A'), pg_temp.rid('tow'), false) $$, '42501', 'forbidden',
  '... nor switch an item');
select pg_temp.login('a0000000-0000-0000-0000-000000000884');
select throws_ok($$ select public.rev_card_save(pg_temp.rid('R'), null, array[pg_temp.rid('A')], '{}') $$, 'P0002', 'not_found',
  'another job''s manager doesn''t find the room');
reset role;
set local role anon;
select throws_ok($$ select public.rev_card_save('00000000-0000-0000-0000-000000000000', null, '{}', '{}') $$, '42501', null,
  'anon can''t call it');
reset role;
select ok(not has_function_privilege('authenticated', 'public.rev_card_cell(uuid, uuid, boolean, boolean)', 'EXECUTE')
          and not has_function_privilege('authenticated', 'public.rev_card_kept(uuid, uuid)', 'EXECUTE'),
  'the cell helpers are internal');

-- ---------------------------------------------------------------------------------------------------------------
-- The save
-- ---------------------------------------------------------------------------------------------------------------
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000882');
select throws_ok($$ select public.rev_card_save(pg_temp.rid('R'), 99, array[pg_temp.rid('A')], '{}') $$, '40001', null,
  'a stale room version is refused');
select throws_ok($$ select public.rev_card_save(pg_temp.rid('R'), null, array[pg_temp.rid('A'), pg_temp.rid('A')], '{}') $$, '22023',
  'Pick the walls of this room again.', 'a wall twice is refused');
-- MPOE: A and B (C is tracked with the exterior), HOW Spray only.
create temp table saved (v jsonb);
grant all on saved to public;
insert into saved select public.rev_card_save(pg_temp.rid('R'), pg_temp.room_ver(), array[pg_temp.rid('A'), pg_temp.rid('B')],
  array[pg_temp.rid('spray')]);
select is((select v -> 'walls' from saved), jsonb_build_array(jsonb_build_object('area_id', pg_temp.rid('C'), 'on', false)),
  'C left the card');
select is(pg_temp.in_room('R') || ' / ' || pg_temp.in_room('X'), 'A,B / C', '... it is out of the MPOE, still in the exterior');
select is((select jsonb_array_length(v -> 'cells') from saved), 3, 'three cells set up as not applicable');
select is(pg_temp.card_marks(), 3, '... as card marks');
select is(array[pg_temp.st('A', 'tow'), pg_temp.st('B', 'stuff'), pg_temp.st('B', 'frame')], array['na', 'na', 'na'],
  'A''s TOW, B''s stuff and B''s framing: not applicable');
select is(array[pg_temp.st('A', 'stuff'), pg_temp.st('A', 'frame'), pg_temp.st('B', 'tow')], array['requested', 'failed', 'passed'],
  'the requested, the failed and the signed-off cells are untouched and show');
select is(pg_temp.history(), '1 signoffs, asked,failed', '... the sign-off and the requests as they were');
select is(array[pg_temp.st('A', 'spray'), pg_temp.st('B', 'spray')], array['na', 'open'],
  'the picked spray: the hand N/A stays, B needs it');
select is(array[pg_temp.st('C', 'tow'), pg_temp.st('C', 'frame')], array['open', 'open'], 'C (off the card) is not touched');
select ok((select card_at is not null and card_by = 'a0000000-0000-0000-0000-000000000882' from public.rev_rooms where id = pg_temp.rid('R')),
  'the card is set up, by whom');
select is(pg_temp.audits('rev.card_set'), 1, 'the save is audited');

-- ---------------------------------------------------------------------------------------------------------------
-- Undo, then picked again
-- ---------------------------------------------------------------------------------------------------------------
select lives_ok($$ select public.rev_card_undo(pg_temp.rid('R'), pg_temp.room_ver(), (select v from saved)) $$, 'Undo');
select is(pg_temp.in_room('R'), 'A,B,C', '... C is back in the room');
select is(array[pg_temp.card_marks(), pg_temp.hand_marks()], array[0, 1], '... the card''s marks are gone, the hand N/A stays');
select ok((select card_at is null from public.rev_rooms where id = pg_temp.rid('R')), '... the card is not set up again');
select lives_ok($$ select public.rev_card_save(pg_temp.rid('R'), pg_temp.room_ver(), array[pg_temp.rid('A'), pg_temp.rid('B')],
  array[pg_temp.rid('spray')]) $$, 'saved again');
select is((public.rev_card_save(pg_temp.rid('R'), pg_temp.room_ver(), array[pg_temp.rid('A'), pg_temp.rid('B')],
  array[pg_temp.rid('spray'), pg_temp.rid('stuff')]) -> 'cells'),
  jsonb_build_array(jsonb_build_object('area_id', pg_temp.rid('B'), 'item_id', pg_temp.rid('stuff'), 'na', false)),
  'stuff tapped back on: B needs it again');
select is(array[pg_temp.st('B', 'stuff'), pg_temp.st('B', 'frame')], array['open', 'na'], '... the rest stays not applicable');

-- ---------------------------------------------------------------------------------------------------------------
-- One item for one wall
-- ---------------------------------------------------------------------------------------------------------------
select is(public.rev_card_item(pg_temp.rid('B'), pg_temp.rid('frame'), true) ->> 'changed', 'true', 'B''s framing switched on');
select is(pg_temp.st('B', 'frame'), 'open', '... it needs it');
select throws_ok($$ select public.rev_card_item(pg_temp.rid('B'), pg_temp.rid('tow'), false) $$, '22023',
  'This item has a sign-off or a request.', 'a signed-off item can''t be switched');
select is(public.rev_card_item(pg_temp.rid('A'), pg_temp.rid('spray'), true) ->> 'changed', 'true',
  'on clears a hand N/A too');

-- A card's N/A gives way to a sign-off made later.
select is((select count(*)::int from public.rev_signoff_set(pg_temp.rid('A'), array[pg_temp.rid('tow')], 7, null, null)), 1,
  'A''s TOW (set up as not applicable) is signed off after all');
select is(pg_temp.st('A', 'tow'), 'passed', '... and shows passed');

select * from finish();
rollback;
