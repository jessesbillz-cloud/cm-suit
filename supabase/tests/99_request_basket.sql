begin;
select plan(58);
-- Migration 0113 (Jesse, Oct 23: "walk up to the wall ... click the button - and that gets added to the inspection
-- request ... and there should be a way to do top of wall for the entire room"). The request being built is one per
-- person and job, on the server, for whoever files OFS requests. Add skips what is asked for, passed or not
-- applicable, the whole room too. Send files one OFS request per item and sheet page through ir_submit_ofs, as one
-- batch, with the OFS numbers in order, and empties the basket. A wall added on the spot is usable at once and waits
-- for a manager's check. Each request cell keeps the wall's tag, rating, UL and sheet.
\ir _helpers.psql

create temp table ids (k text primary key, v uuid);
grant all on ids to public;
create function pg_temp.rid(p_k text) returns uuid language sql stable as $$ select v from ids where k = p_k $$;
create function pg_temp.basket() returns jsonb language sql volatile as $$
  select public.rev_basket_get('c0000000-0000-0000-0000-000000001131') $$;
create function pg_temp.cells(p jsonb) returns text[] language sql stable as $$
  select coalesce(array_agg(x order by x), '{}')
    from (select (select k from ids where v = (e ->> 'area_id')::uuid) || '.' || (select k from ids where v = (e ->> 'item_id')::uuid) as x
            from jsonb_array_elements(p -> 'cells') e) y $$;
create function pg_temp.st(p_cell text) returns text language sql volatile security definer as $$
  select s.status from public.rev_status_rows('c0000000-0000-0000-0000-000000001131') s
   where s.area_id = pg_temp.rid(split_part(p_cell, '.', 1)) and s.item_id = pg_temp.rid(split_part(p_cell, '.', 2)) $$;
create function pg_temp.tasks_for(p_uid uuid, p_area uuid, p_open boolean) returns int language sql volatile security definer as $$
  select count(*)::int from public.tasks t
   where t.assignee_user_id = p_uid and t.entity_id = p_area and t.kind = 'revs.wall_check' and (t.done_at is null) = p_open $$;
create function pg_temp.area(p_k text) returns public.rev_areas language sql volatile security definer as $$
  select * from public.rev_areas where id = pg_temp.rid(p_k) $$;
create function pg_temp.reqs() returns int language sql volatile security definer as $$
  select count(*)::int from public.inspection_requests where project_id = 'c0000000-0000-0000-0000-000000001131' $$;
create function pg_temp.audits(p_action text) returns int language sql volatile security definer as $$
  select count(*)::int from public.audit_events where action = p_action and project_id = 'c0000000-0000-0000-0000-000000001131' $$;
grant execute on all functions in schema pg_temp to public;

select pg_temp.mk_user('a0000000-0000-0000-0000-000000001131', 'probe+bk-admin@example.test', 'Ada Admin');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000001132', 'probe+bk-insp@example.test', 'Ivy Inspector');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000001133', 'probe+bk-ahj@example.test', 'Dana Deputy');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000001134', 'probe+bk-sub@example.test', 'Chris Installer');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000001135', 'probe+bk-sub2@example.test', 'Otto Other');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000001136', 'probe+bk-pm@example.test', 'Pat Manager');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000001137', 'probe+bk-pe@example.test', 'Kyle Engineer');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000001138', 'probe+bk-super@example.test', 'Sue Super');

insert into public.orgs (id, name, kind, created_by) values
  ('b0000000-0000-0000-0000-000000001131', 'Sample Basket Builders', 'gc', 'a0000000-0000-0000-0000-000000001131');
insert into public.projects (id, org_id, name, stage, timezone, created_by, settings) values
  ('c0000000-0000-0000-0000-000000001131', 'b0000000-0000-0000-0000-000000001131', 'Basket Job', 'construction',
   'America/Los_Angeles', 'a0000000-0000-0000-0000-000000001131', '{"ir_ofs_allowed": true}');
insert into public.project_members (org_id, project_id, user_id, invite_email, role, status)
select 'b0000000-0000-0000-0000-000000001131', 'c0000000-0000-0000-0000-000000001131', u::uuid, e, r, 'active'
  from (values ('a0000000-0000-0000-0000-000000001132', 'probe+bk-insp@example.test', 'inspector'),
               ('a0000000-0000-0000-0000-000000001133', 'probe+bk-ahj@example.test', 'ahj'),
               ('a0000000-0000-0000-0000-000000001134', 'probe+bk-sub@example.test', 'sub'),
               ('a0000000-0000-0000-0000-000000001135', 'probe+bk-sub2@example.test', 'sub'),
               ('a0000000-0000-0000-0000-000000001136', 'probe+bk-pm@example.test', 'pm'),
               ('a0000000-0000-0000-0000-000000001137', 'probe+bk-pe@example.test', 'pe'),
               ('a0000000-0000-0000-0000-000000001138', 'probe+bk-super@example.test', 'superintendent')) v(u, e, r);
update public.profiles set company = case user_id
    when 'a0000000-0000-0000-0000-000000001134' then 'Sample Firestop Co'
    when 'a0000000-0000-0000-0000-000000001135' then 'Sample Other Co'
    else 'Sample Basket Builders' end
 where user_id in ('a0000000-0000-0000-0000-000000001134', 'a0000000-0000-0000-0000-000000001135',
                   'a0000000-0000-0000-0000-000000001137', 'a0000000-0000-0000-0000-000000001138');
insert into public.folders (id, org_id, project_id, name, created_by) values
  ('d0000000-0000-0000-0000-000000001131', 'b0000000-0000-0000-0000-000000001131', 'c0000000-0000-0000-0000-000000001131',
   'Sample Plans', 'a0000000-0000-0000-0000-000000001131');
insert into public.files (id, org_id, project_id, folder_id, storage_path, original_name, mime, created_by, scan_status) values
  ('e0000000-0000-0000-0000-000000001131', 'b0000000-0000-0000-0000-000000001131', 'c0000000-0000-0000-0000-000000001131',
   'd0000000-0000-0000-0000-000000001131', 'test/basket/l01.pdf', 'Sample L01.pdf', 'application/pdf',
   'a0000000-0000-0000-0000-000000001131', 'clean');
update public.files set upload_complete = true where id = 'e0000000-0000-0000-0000-000000001131';

-- The inspector's list: TOW (top of wall), HOW (stuff, spray). Walls A, B, C in room 101 and D, on Level 01's sheet.
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000001132');
insert into ids select 'L', (public.rev_list_create('c0000000-0000-0000-0000-000000001131', 'Sample Rated Walls', 'PH III', null,
  '[{"number": 0, "name": "TOW", "items": [{"name": "Top of wall"}]},
    {"number": 1, "name": "HOW", "items": [{"name": "HOW Stuff"}, {"name": "HOW Spray"}]}]')).id;
insert into ids select case i.name when 'Top of wall' then 'tow' when 'HOW Stuff' then 'stuff' else 'spray' end, i.id
  from public.rev_items i join public.revs v on v.id = i.rev_id where v.list_id = pg_temp.rid('L');
insert into ids select a.name, a.id
  from public.rev_areas_add(pg_temp.rid('L'), 'Level 01', array['A', 'B', 'C', 'D'], 'e0000000-0000-0000-0000-000000001131') a;
select is(public.rev_rooms_load(pg_temp.rid('L'), jsonb_build_array(
    jsonb_build_object('level', 'Level 01', 'number', '101', 'name', 'MPOE', 'walls', jsonb_build_array(
      jsonb_build_object('area_id', pg_temp.rid('A')), jsonb_build_object('area_id', pg_temp.rid('B')),
      jsonb_build_object('area_id', pg_temp.rid('C')))))) -> 'rooms', '1'::jsonb, 'room 101 with walls A, B, C');
insert into ids select 'R101', id from public.rev_rooms where list_id = pg_temp.rid('L') and number = '101';
select lives_ok($$ select public.rev_area_details_save(pg_temp.rid('A'), null, 'F6a', '1 HR', 'UL U419', null, 'A201', null) $$,
  'wall A has its tag, rating, UL and sheet');
reset role;
-- C x spray not applicable, B x stuff signed off before the app, the job's OFS duty holder the GC's engineer.
insert into public.rev_marks (org_id, project_id, created_by, area_id, item_id)
values ('b0000000-0000-0000-0000-000000001131', 'c0000000-0000-0000-0000-000000001131', 'a0000000-0000-0000-0000-000000001132',
        pg_temp.rid('C'), pg_temp.rid('spray'));
insert into public.rev_signoffs (org_id, project_id, created_by, area_id, item_id, ofs_number)
values ('b0000000-0000-0000-0000-000000001131', 'c0000000-0000-0000-0000-000000001131', 'a0000000-0000-0000-0000-000000001132',
        pg_temp.rid('B'), pg_temp.rid('stuff'), 41);
insert into public.project_duties (org_id, project_id, duty, company, person_id, set_by) values
  ('b0000000-0000-0000-0000-000000001131', 'c0000000-0000-0000-0000-000000001131', 'ofs_requests', 'Sample Basket Builders',
   'a0000000-0000-0000-0000-000000001137', 'a0000000-0000-0000-0000-000000001131');
set local role authenticated;
-- Another sub asks for A x stuff.
select pg_temp.login('a0000000-0000-0000-0000-000000001135');
select lives_ok($$ select public.ir_submit_ofs('c0000000-0000-0000-0000-000000001131', 'Sample Other Co', current_date + 3, true,
  array[pg_temp.rid('A')], array[pg_temp.rid('stuff')], null, '08:00', 'timed', 60, '{}', false) $$, 'A x stuff is asked for');

-- ---------------------------------------------------------------------------------------------------------------------
-- Who may
-- ---------------------------------------------------------------------------------------------------------------------
reset role;
set local role anon;
select throws_ok($$ select public.rev_basket_get('c0000000-0000-0000-0000-000000001131') $$, '42501', null, 'anon can''t call it');
reset role;
select ok(not has_function_privilege('authenticated', 'public.rev_basket_groups(uuid, uuid)', 'EXECUTE')
          and not has_function_privilege('authenticated', 'public.rev_basket_mine(uuid, boolean)', 'EXECUTE')
          and has_function_privilege('authenticated', 'public.rev_basket_send(uuid, integer, text, date, time without time zone, text, integer, boolean, boolean, boolean, integer[])', 'EXECUTE'),
  'the helpers are internal, the calls are not');
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000001136');
select throws_ok($$ select pg_temp.basket() $$, '42501', 'forbidden', 'the PM (no ir.request) has no basket');
select throws_ok($$ select public.rev_basket_add('c0000000-0000-0000-0000-000000001131', array[pg_temp.rid('A')], array[pg_temp.rid('tow')]) $$,
  '42501', 'forbidden', 'nor adds to one');

-- ---------------------------------------------------------------------------------------------------------------------
-- Add, the whole room, take out
-- ---------------------------------------------------------------------------------------------------------------------
select pg_temp.login('a0000000-0000-0000-0000-000000001134');
select is(pg_temp.basket() -> 'version', '0'::jsonb, 'the installer starts with none');
select is((public.rev_basket_add('c0000000-0000-0000-0000-000000001131', array[pg_temp.rid('A'), pg_temp.rid('B')], array[pg_temp.rid('tow')])) -> 'added',
  '2'::jsonb, 'top of wall on A and B');
select is((public.rev_basket_add('c0000000-0000-0000-0000-000000001131', array[pg_temp.rid('A'), pg_temp.rid('B')], array[pg_temp.rid('tow')])) -> 'added',
  '0'::jsonb, 'the same tap again adds nothing');
select is((public.rev_basket_add('c0000000-0000-0000-0000-000000001131', null, array[pg_temp.rid('stuff'), pg_temp.rid('spray')],
                                 pg_temp.rid('R101'))) -> 'added',
  '3'::jsonb, 'the whole room: A spray, B spray, C stuff (A stuff asked for, B stuff passed, C spray N/A are skipped)');
select is(pg_temp.cells(pg_temp.basket()), array['A.spray', 'A.tow', 'B.spray', 'B.tow', 'C.stuff'], 'five cells in it');
select is((public.rev_basket_remove('c0000000-0000-0000-0000-000000001131', array[pg_temp.rid('B')], array[pg_temp.rid('tow')])) -> 'removed',
  '1'::jsonb, 'B top of wall taken out');
select is(pg_temp.cells(pg_temp.basket()), array['A.spray', 'A.tow', 'B.spray', 'C.stuff'], 'four left');
select is(jsonb_array_length(pg_temp.basket() -> 'groups'), 3, 'three requests: top of wall, stuff, spray');
select is((pg_temp.basket() -> 'groups' -> 2 -> 'area_ids'), jsonb_build_array(pg_temp.rid('A'), pg_temp.rid('B')),
  'spray: one request for A and B, on the same sheet');
select is(pg_temp.basket() -> 'may_number', 'false'::jsonb, 'the installer does not type OFS numbers');

-- ---------------------------------------------------------------------------------------------------------------------
-- Reading it: the owner, the duty holder of the same company, nobody else
-- ---------------------------------------------------------------------------------------------------------------------
select is((select count(*)::int from public.rev_basket_cells), 5, 'the installer reads his basket''s rows (one taken out stays)');
select pg_temp.login('a0000000-0000-0000-0000-000000001135');
select is((select count(*)::int from public.rev_baskets), 0, 'another sub reads none');
select pg_temp.login('a0000000-0000-0000-0000-000000001137');
select is((select count(*)::int from public.rev_baskets), 0, 'the duty holder does not read another company''s');
select pg_temp.login('a0000000-0000-0000-0000-000000001138');
select lives_ok($$ select public.rev_basket_add('c0000000-0000-0000-0000-000000001131', array[pg_temp.rid('D')], array[pg_temp.rid('tow')]) $$,
  'the superintendent starts one');
select pg_temp.login('a0000000-0000-0000-0000-000000001137');
select is((select count(*)::int from public.rev_basket_cells), 1, 'the duty holder reads his own company''s');

-- ---------------------------------------------------------------------------------------------------------------------
-- Send
-- ---------------------------------------------------------------------------------------------------------------------
select pg_temp.login('a0000000-0000-0000-0000-000000001134');
create temp table sent (v jsonb);
grant all on sent to public;
select throws_ok($$ select public.rev_basket_send('c0000000-0000-0000-0000-000000001131', 1, 'Sample Firestop Co', current_date + 2, '09:00',
  'timed', 60, true, false) $$, '40001', null, 'a basket changed since the review is refused');
select throws_ok($$ select public.rev_basket_send('c0000000-0000-0000-0000-000000001131', (pg_temp.basket() ->> 'version')::int,
  'Sample Firestop Co', current_date + 2, '09:00', 'timed', 60, true, false, false, array[300, 301, 302]) $$, '42501', 'forbidden',
  'the installer types no OFS numbers');
create temp table want (n jsonb);
grant all on want to public;
insert into want select jsonb_agg(g -> 'ofs_number') from jsonb_array_elements(pg_temp.basket() -> 'groups') g;
insert into sent select public.rev_basket_send('c0000000-0000-0000-0000-000000001131', (pg_temp.basket() ->> 'version')::int,
  'Sample Firestop Co', current_date + 2, '09:00', 'timed', 60, true, false);
select is(jsonb_array_length((select v from sent) -> 'requests'), 3, 'three OFS requests filed');
select is((select jsonb_agg(r -> 'ofs_number' order by (r ->> 'ofs_number')::int) from jsonb_array_elements((select v from sent) -> 'requests') r),
  (select n from want), 'with the OFS numbers the review showed, in order');
select is((select max((r ->> 'ofs_number')::int) - min((r ->> 'ofs_number')::int) from jsonb_array_elements((select v from sent) -> 'requests') r),
  2, 'consecutive');
select is((select array_agg(distinct q.status) from public.inspection_requests q
            where q.id in (select (r ->> 'id')::uuid from jsonb_array_elements((select v from sent) -> 'requests') r)),
  array['gc_review'], 'each with the GC, as any request of the installer');
select is((select count(distinct c.batch_id)::int from public.rev_basket_cells c where c.batch_id is not null), 1, 'one batch');
select is(pg_temp.cells(pg_temp.basket()), '{}'::text[], 'the basket is empty after');
select is(pg_temp.st('A.tow'), 'requested', 'A top of wall is asked for now');
select is((public.rev_basket_send('c0000000-0000-0000-0000-000000001131', (pg_temp.basket() ->> 'version')::int - 1,
  'Sample Firestop Co', current_date + 2, '09:00', 'timed', 60, true, false)) -> 'batch_id', (select v -> 'batch_id' from sent),
  'the same Send again answers the same batch');
select is(pg_temp.reqs(), 4, 'and files nothing more');
select is((select count(*)::int from public.ir_batches((select array_agg((r ->> 'id')::uuid) from jsonb_array_elements((select v from sent) -> 'requests') r))
            where size = 3), 3, 'ir_batches: each of the three is in a batch of 3');
select is(pg_temp.audits('rev.basket_send'), 1, 'the send is audited');

-- The wall's facts on the request.
select is((select q.items from public.inspection_requests q
            where q.id in (select (r ->> 'id')::uuid from jsonb_array_elements((select v from sent) -> 'requests') r) and q.items like '%Spray%'),
  'Level 01 · HOW Spray · A (F6a · 1 HR · UL U419 · A201), B', 'the request names the wall''s tag, rating, UL and sheet');
reset role;
select is((select c.wall_facts from public.ir_rev_items c join public.inspection_requests q on q.id = c.request_id
            where c.area_id = pg_temp.rid('A') and c.item_id = pg_temp.rid('spray')), 'F6a · 1 HR · UL U419 · A201',
  'the cell keeps them as they were');
select is((select c.wall_facts from public.ir_rev_items c where c.area_id = pg_temp.rid('B') and c.item_id = pg_temp.rid('spray')),
  'UL —', 'a wall with no UL says so');
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000001133');
select is((select count(*)::int from public.ir_batches((select array_agg((r ->> 'id')::uuid) from jsonb_array_elements((select v from sent) -> 'requests') r))),
  0, 'the fire marshal does not see them before they are sent to OFS');

-- The inspector types the number of his own.
select pg_temp.login('a0000000-0000-0000-0000-000000001132');
select lives_ok($$ select public.rev_basket_add('c0000000-0000-0000-0000-000000001131', array[pg_temp.rid('C')], array[pg_temp.rid('tow')]) $$,
  'the inspector adds C top of wall');
select is((((public.rev_basket_send('c0000000-0000-0000-0000-000000001131', (pg_temp.basket() ->> 'version')::int, 'Sample Basket Builders',
  current_date + 2, null, 'timed', 60, true, false, true, array[500])) -> 'requests' -> 0) ->> 'ofs_number')::int, 500,
  'and sends it as OFS 500');

-- ---------------------------------------------------------------------------------------------------------------------
-- A wall added on the spot
-- ---------------------------------------------------------------------------------------------------------------------
select pg_temp.login('a0000000-0000-0000-0000-000000001136');
select throws_ok($$ select public.rev_field_wall_add(pg_temp.rid('L'), 'Level 03', null, '0302', 'Classroom', 'north', null, null, null) $$,
  '42501', 'forbidden', 'the PM does not add walls');
select pg_temp.login('a0000000-0000-0000-0000-000000001134');
insert into ids select 'N', (public.rev_field_wall_add(pg_temp.rid('L'), 'Level 03', null, '0302', 'Classroom', 'north', null, 'F6a', null) ->> 'area_id')::uuid;
select is(array[(pg_temp.area('N')).name, (pg_temp.area('N')).rating, (pg_temp.area('N')).ul_design, (pg_temp.area('N')).sheet_ref],
  array['0302 Classroom north wall', '1 HR', 'UL U419', 'A201'], 'the north wall of new room 0302, its tag bringing rating, UL and sheet');
select is((pg_temp.area('N')).field_by, 'a0000000-0000-0000-0000-000000001134'::uuid, 'marked as added by the installer');
select is((select field_by from public.rev_rooms where list_id = pg_temp.rid('L') and number = '0302'),
  'a0000000-0000-0000-0000-000000001134'::uuid, 'and the room with it');
select is((public.rev_field_wall_add(pg_temp.rid('L'), 'Level 03', null, '0302', null, 'north', null, null, null) ->> 'area_id')::uuid,
  pg_temp.rid('N'), 'the same wall again is that wall');
select is((public.rev_basket_add('c0000000-0000-0000-0000-000000001131', array[pg_temp.rid('N')], array[pg_temp.rid('tow')])) -> 'added',
  '1'::jsonb, 'usable at once: top of wall into the basket');
select is(array[pg_temp.tasks_for('a0000000-0000-0000-0000-000000001132', pg_temp.rid('N'), true),
                 pg_temp.tasks_for('a0000000-0000-0000-0000-000000001133', pg_temp.rid('N'), true),
                 pg_temp.tasks_for('a0000000-0000-0000-0000-000000001134', pg_temp.rid('N'), true)],
  array[1, 1, 0], 'each manager has a line to check it, the installer none');
select throws_ok($$ select public.rev_field_confirm(pg_temp.rid('N')) $$, '42501', 'forbidden', 'the installer does not check it');
select pg_temp.login('a0000000-0000-0000-0000-000000001132');
select isnt((public.rev_field_confirm(pg_temp.rid('N'))).field_checked_at, null, 'the inspector checks it');
select is(array[pg_temp.tasks_for('a0000000-0000-0000-0000-000000001132', pg_temp.rid('N'), true),
                 pg_temp.tasks_for('a0000000-0000-0000-0000-000000001133', pg_temp.rid('N'), true)],
  array[0, 0], 'and every manager''s line closes');
select isnt((select field_checked_at from public.rev_rooms where list_id = pg_temp.rid('L') and number = '0302'), null,
  'the room is checked with it');

-- Another, removed by the inspector (Undo puts it back, still to check), and one edited by him (checked).
select pg_temp.login('a0000000-0000-0000-0000-000000001134');
insert into ids select 'S', (public.rev_field_wall_add(pg_temp.rid('L'), 'Level 03', null, '0302', null, 'south', null, null, null) ->> 'area_id')::uuid;
insert into ids select 'E', (public.rev_field_wall_add(pg_temp.rid('L'), 'Level 03', null, '0302', null, 'east', null, null, '2 HR') ->> 'area_id')::uuid;
select pg_temp.login('a0000000-0000-0000-0000-000000001132');
select lives_ok($$ select public.rev_remove('area', pg_temp.rid('S'), (pg_temp.area('S')).version) $$, 'the inspector removes the south wall');
select is(pg_temp.tasks_for('a0000000-0000-0000-0000-000000001133', pg_temp.rid('S'), true), 0, 'its lines close');
select lives_ok($$ select public.rev_area_details_save(pg_temp.rid('E'), null, 'F6b', '2 HR', null, null, null, null) $$,
  'the inspector edits the east wall');
select isnt((pg_temp.area('E')).field_checked_at, null, 'which checks it');

-- A room's card carries over: room 101's card leaves spray off.
select lives_ok($$ select public.rev_card_save(pg_temp.rid('R101'), (select version from public.rev_rooms where id = pg_temp.rid('R101')),
  array[pg_temp.rid('A'), pg_temp.rid('B'), pg_temp.rid('C')], array[pg_temp.rid('tow'), pg_temp.rid('stuff')]) $$, 'room 101''s card set up');
select pg_temp.login('a0000000-0000-0000-0000-000000001134');
insert into ids select 'X', (public.rev_field_wall_add(pg_temp.rid('L'), null, pg_temp.rid('R101'), null, null, 'other', 'Enclosure', null, null) ->> 'area_id')::uuid;
select is(array[pg_temp.st('X.tow'), pg_temp.st('X.spray')], array['open', 'na'], 'a wall added to room 101 needs what its card needs');

select * from finish();
rollback;
