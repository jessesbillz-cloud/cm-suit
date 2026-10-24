begin;
select plan(34);
-- Migration 0119 (Jesse, Oct 23: "click what inspections we need to achieve, and save it. Then there should be some
-- kind of lock on it so not everyone can edit it"). A room's card is locked by its save. While locked, every Setup
-- change is refused (the card's set, the old save, one item for one wall), the same save again is safe, and only a
-- manager (revs.manage) unlocks it (audited). A signed-off or asked-for cell is never flipped by Setup. The lock never
-- blocks a request or a sign-off. Undo of a save is its saver's. "Locked by" reads the locker's name.
\ir _helpers.psql

create temp table ids (k text primary key, v uuid);
grant all on ids to public;
create temp table saved (k text primary key, v jsonb);
grant all on saved to public;
create function pg_temp.rid(p_k text) returns uuid language sql stable as $$ select v from ids where k = p_k $$;
create function pg_temp.st(p_area text, p_item text) returns text language sql volatile as $$
  select s.status from public.rev_status('c0000000-0000-0000-0000-000000001191') s
   where s.area_id = pg_temp.rid(p_area) and s.item_id = pg_temp.rid(p_item) $$;
create function pg_temp.ver() returns int language sql volatile security definer as $$
  select version from public.rev_rooms where id = pg_temp.rid('R') $$;
create function pg_temp.locked() returns text language sql volatile security definer as $$
  select coalesce(card_locked_by::text, 'open') from public.rev_rooms where id = pg_temp.rid('R') $$;
create function pg_temp.cell(p_area text, p_item text, p_needed boolean) returns jsonb language sql stable as $$
  select jsonb_build_object('area_id', pg_temp.rid(p_area), 'item_id', pg_temp.rid(p_item), 'needed', p_needed) $$;
create function pg_temp.audits(p_action text) returns int language sql volatile security definer as $$
  select count(*)::int from public.audit_events where action = p_action $$;
grant execute on all functions in schema pg_temp to public;

select pg_temp.mk_user('a0000000-0000-0000-0000-000000001191', 'probe+cl-admin@example.test', 'Ada Admin');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000001192', 'probe+cl-insp@example.test', 'Ivy Inspector');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000001193', 'probe+cl-pm@example.test', 'Pat Manager');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000001194', 'probe+cl-insp2@example.test', 'Ian Inspector');

insert into public.orgs (id, name, kind, created_by) values
  ('b0000000-0000-0000-0000-000000001191', 'Sample Lock Builders', 'gc', 'a0000000-0000-0000-0000-000000001191');
insert into public.projects (id, org_id, name, stage, timezone, created_by, settings) values
  ('c0000000-0000-0000-0000-000000001191', 'b0000000-0000-0000-0000-000000001191', 'Lock Job', 'construction',
   'America/Los_Angeles', 'a0000000-0000-0000-0000-000000001191', '{"ir_ofs_allowed": true}');
insert into public.project_members (org_id, project_id, user_id, invite_email, role, status)
select 'b0000000-0000-0000-0000-000000001191', 'c0000000-0000-0000-0000-000000001191', u::uuid, e, r, 'active'
  from (values ('a0000000-0000-0000-0000-000000001192', 'probe+cl-insp@example.test', 'inspector'),
               ('a0000000-0000-0000-0000-000000001193', 'probe+cl-pm@example.test', 'pm'),
               ('a0000000-0000-0000-0000-000000001194', 'probe+cl-insp2@example.test', 'inspector')) v(u, e, r);

-- TOW (one item), HOW (two), walls A and B in room 101, C in the exterior only. B's TOW signed off before the app, A's
-- HOW Stuff asked for.
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000001192');
insert into ids select 'L', (public.rev_list_create('c0000000-0000-0000-0000-000000001191', 'Sample Rated Walls', null, null,
  '[{"number": 0, "name": "TOW", "items": [{"name": "TOW One"}]},
    {"number": 1, "name": "HOW", "items": [{"name": "HOW Stuff"}, {"name": "HOW Spray"}]}]')).id;
insert into ids select case i.name when 'TOW One' then 'tow' when 'HOW Stuff' then 'stuff' else 'spray' end, i.id
  from public.rev_items i join public.revs v on v.id = i.rev_id where v.list_id = pg_temp.rid('L');
insert into ids select a.name, a.id from public.rev_areas_add(pg_temp.rid('L'), 'Level 01', array['A', 'B', 'C'], null) a;
select is(public.rev_rooms_load(pg_temp.rid('L'), jsonb_build_array(
    jsonb_build_object('level', 'Level 01', 'number', '101', 'name', 'MPOE', 'walls', jsonb_build_array(
      jsonb_build_object('area_id', pg_temp.rid('A')), jsonb_build_object('area_id', pg_temp.rid('B')))),
    jsonb_build_object('level', 'Level 01', 'number', 'EXT', 'name', 'Exterior', 'kind', 'exterior', 'walls', jsonb_build_array(
      jsonb_build_object('area_id', pg_temp.rid('C')))))) -> 'rooms', '2'::jsonb, 'two rooms');
insert into ids select case number when '101' then 'R' else 'X' end, id from public.rev_rooms where list_id = pg_temp.rid('L');
select is((select count(*)::int from public.rev_signoff_set(pg_temp.rid('B'), array[pg_temp.rid('tow')], 41, null, null)), 1,
  'B''s TOW signed off before the app');
select ok((public.ir_submit_ofs('c0000000-0000-0000-0000-000000001191', 'Sample Co', current_date + 3, true,
  array[pg_temp.rid('A')], array[pg_temp.rid('stuff')], null, '08:00', 'timed', 60,
  p_special_required => false, p_inspector_ack => true)).id is not null, 'A''s HOW Stuff asked for');
select is(pg_temp.locked(), 'open', 'a card never set up is open');

-- ---------------------------------------------------------------------------------------------------------------
-- Saved, locked
-- ---------------------------------------------------------------------------------------------------------------
select throws_ok($$ select public.rev_card_set(pg_temp.rid('R'), 99, '[]') $$, '40001', null, 'a stale room version is refused');
select throws_ok($$ select public.rev_card_set(pg_temp.rid('R'), pg_temp.ver(), jsonb_build_array(pg_temp.cell('C', 'tow', false))) $$,
  '22023', 'Pick the boxes of this card again.', 'a wall not in the room is refused');
select throws_ok($$ select public.rev_card_set(pg_temp.rid('R'), pg_temp.ver(),
  jsonb_build_array(pg_temp.cell('A', 'tow', false), pg_temp.cell('A', 'tow', true))) $$,
  '22023', 'Pick the boxes of this card again.', 'a box twice is refused');
-- A's TOW and spray not needed, and Setup asked to drop the signed-off and the asked-for boxes too.
insert into saved select 'first', public.rev_card_set(pg_temp.rid('R'), pg_temp.ver(), jsonb_build_array(
  pg_temp.cell('A', 'tow', false), pg_temp.cell('A', 'spray', false), pg_temp.cell('B', 'tow', false), pg_temp.cell('A', 'stuff', false)));
select is((select jsonb_array_length(v -> 'cells') from saved where k = 'first'), 2, 'two boxes changed');
select is(array[pg_temp.st('A', 'tow'), pg_temp.st('A', 'spray'), pg_temp.st('B', 'spray')], array['na', 'na', 'open'],
  'A''s TOW and spray are not needed, B''s spray still is');
select is(array[pg_temp.st('B', 'tow'), pg_temp.st('A', 'stuff')], array['passed', 'requested'],
  'the signed-off and the asked-for boxes are never flipped by Setup');
select is(pg_temp.locked(), 'a0000000-0000-0000-0000-000000001192', 'the save locked the card, by whom');
select ok((select card_at is not null and card_locked_at is not null from public.rev_rooms where id = pg_temp.rid('R')), '... and when');

select is((select jsonb_array_length(public.rev_card_set(pg_temp.rid('R'), pg_temp.ver() - 1, jsonb_build_array(
  pg_temp.cell('A', 'tow', false), pg_temp.cell('A', 'spray', false))) -> 'cells')), 0, 'the same save again is safe (nothing changes)');
select throws_ok($$ select public.rev_card_set(pg_temp.rid('R'), pg_temp.ver(), jsonb_build_array(pg_temp.cell('B', 'spray', false))) $$,
  '55000', 'This card is locked. Unlock it to edit.', 'a change on a locked card is refused');
select throws_ok($$ select public.rev_card_save(pg_temp.rid('R'), pg_temp.ver(), array[pg_temp.rid('A'), pg_temp.rid('B')], '{}') $$,
  '55000', 'This card is locked. Unlock it to edit.', '... and through 0101''s save');
select throws_ok($$ select public.rev_card_item(pg_temp.rid('B'), pg_temp.rid('spray'), false) $$,
  '55000', 'The room''s card is locked. Unlock it to edit.', '... and one item for one wall of the room');
select is(public.rev_card_item(pg_temp.rid('C'), pg_temp.rid('spray'), false) ->> 'changed', 'true',
  'a wall in no locked room still switches');

-- The lock never blocks a request or a sign-off.
select ok((public.ir_submit_ofs('c0000000-0000-0000-0000-000000001191', 'Sample Co', current_date + 4, true,
  array[pg_temp.rid('B')], array[pg_temp.rid('spray')], null, '09:00', 'timed', 60,
  p_special_required => false, p_inspector_ack => true)).id is not null, 'a request on a locked card');
select is((select count(*)::int from public.rev_signoff_set(pg_temp.rid('A'), array[pg_temp.rid('spray')], 42, null, null)), 1,
  'a sign-off on a locked card');

-- ---------------------------------------------------------------------------------------------------------------
-- Who unlocks
-- ---------------------------------------------------------------------------------------------------------------
select pg_temp.login('a0000000-0000-0000-0000-000000001193');
select throws_ok($$ select public.rev_card_lock(pg_temp.rid('R'), null, false) $$, '42501', 'forbidden', 'a reader can''t unlock');
select is((select name from public.rev_card_lockers('c0000000-0000-0000-0000-000000001191')), 'Ivy Inspector',
  'a reader sees who locked it');
reset role;
set local role anon;
select throws_ok($$ select public.rev_card_lockers('c0000000-0000-0000-0000-000000001191') $$, '42501', null, 'anon can''t');
reset role;
select ok(not has_function_privilege('authenticated', 'public.rev_card_open(timestamptz)', 'EXECUTE')
          and not has_function_privilege('authenticated', 'public.rev_card_needed(uuid, uuid)', 'EXECUTE'),
  'the lock helpers are internal');
set local role authenticated;

-- Another manager can't undo Ivy's save, but unlocks.
select pg_temp.login('a0000000-0000-0000-0000-000000001194');
select throws_ok($$ select public.rev_card_undo(pg_temp.rid('R'), pg_temp.ver(), (select v from saved where k = 'first')) $$,
  '55000', 'This card is locked. Unlock it to edit.', 'another manager can''t undo the save');
select is((public.rev_card_lock(pg_temp.rid('R'), pg_temp.ver(), false)).card_locked_at, null, 'a manager unlocks');
select is(pg_temp.audits('rev.card_unlock'), 1, '... audited');
select lives_ok($$ select public.rev_card_lock(pg_temp.rid('R'), 1, false) $$, 'unlock again is safe');
select is(pg_temp.audits('rev.card_unlock'), 1, '... and not audited twice');
insert into saved select 'ian', public.rev_card_set(pg_temp.rid('R'), pg_temp.ver(), jsonb_build_array(pg_temp.cell('A', 'tow', true)));
select is(jsonb_array_length((select v from saved where k = 'ian') -> 'cells'), 1, 'unlocked: A''s TOW needed again');
select is(array[pg_temp.st('A', 'tow'), pg_temp.locked()], array['open', 'a0000000-0000-0000-0000-000000001194'],
  '... and locked again by its saver');
select lives_ok($$ select public.rev_card_undo(pg_temp.rid('R'), pg_temp.ver(), (select v from saved where k = 'ian')) $$,
  'its saver undoes it');
select is(array[pg_temp.st('A', 'tow'), pg_temp.locked()], array['na', 'open'], '... the box back, the card open as before the save');

-- Locked again (Cancel after an unlock), audited.
select is((public.rev_card_lock(pg_temp.rid('R'), pg_temp.ver(), true)).card_locked_by, 'a0000000-0000-0000-0000-000000001194'::uuid,
  'locked again');
select is(pg_temp.audits('rev.card_lock'), 1, '... audited');

select * from finish();
rollback;
