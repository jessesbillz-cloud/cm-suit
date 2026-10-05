begin;
select plan(36);
-- Migration 0082: a wall's details (tag, rating, UL design, fire area, sheet number, what to check) saved by a manager
-- with the version check, and the walls signed off before the app (rev_signoffs): a manager sets them, a whole rev at
-- once, and clears them (the Undo); a non-manager, another job's manager, a stranger and the no-login link cannot; the
-- table reads like rev_marks; rev_status shows such a cell passed with its OFS number and day, unless an in-app request
-- on it is newer (then its result decides: requested, then failed); a new request skips a signed-off cell.
\ir _helpers.psql

create temp table ids (k text primary key, v uuid);
grant all on ids to public;
create function pg_temp.rid(p_k text) returns uuid language sql stable as $$ select v from ids where k = p_k $$;
create function pg_temp.ver(p_table text, p_k text) returns int language plpgsql volatile security definer as $$
declare v int;
begin
  execute format('select version from public.%I where id = $1', p_table) into v using pg_temp.rid(p_k);
  return v;
end $$;
-- A cell's status as the logged-in person sees it: status, IR number, OFS number, day, note.
create function pg_temp.st(p_area text, p_item text) returns text language sql volatile as $$
  select concat_ws(' ', s.status, 'ir=' || s.ir_number, 'ofs=' || s.ofs_number,
                   'on=' || to_char(s.at at time zone 'America/Los_Angeles', 'YYYY-MM-DD'), 'note=' || s.note)
    from public.rev_status('c0000000-0000-0000-0000-000000000821') s
   where s.area_id = pg_temp.rid(p_area) and s.item_id = pg_temp.rid(p_item) $$;
create function pg_temp.live_signoffs() returns int language sql volatile security definer as $$
  select count(*)::int from public.rev_signoffs where deleted_at is null $$;
create function pg_temp.audits(p_action text) returns int language sql volatile security definer as $$
  select count(*)::int from public.audit_events where entity_type = 'rev_signoffs' and action = p_action $$;
grant execute on all functions in schema pg_temp to public;

select pg_temp.mk_user('a0000000-0000-0000-0000-000000000821', 'probe+wd-admin@example.test', 'Ada Admin');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000822', 'probe+wd-insp@example.test', 'Ivy Inspector');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000823', 'probe+wd-ahj@example.test', 'Dana Deputy');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000824', 'probe+wd-pm@example.test', 'Pat Manager');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000825', 'probe+wd-other@example.test', 'Otto Other');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000826', 'probe+wd-none@example.test', 'Nina Nobody');

insert into public.orgs (id, name, kind, created_by) values
  ('b0000000-0000-0000-0000-000000000821', 'Sample Wall Builders', 'gc', 'a0000000-0000-0000-0000-000000000821');
insert into public.projects (id, org_id, name, stage, timezone, created_by, settings) values
  ('c0000000-0000-0000-0000-000000000821', 'b0000000-0000-0000-0000-000000000821', 'Wall Job', 'construction',
   'America/Los_Angeles', 'a0000000-0000-0000-0000-000000000821', '{"ir_ofs_allowed": true}'),
  ('c0000000-0000-0000-0000-000000000822', 'b0000000-0000-0000-0000-000000000821', 'Other Wall Job', 'construction',
   'America/Los_Angeles', 'a0000000-0000-0000-0000-000000000821', '{"ir_ofs_allowed": true}');
insert into public.project_members (org_id, project_id, user_id, invite_email, role, status)
select 'b0000000-0000-0000-0000-000000000821', p::uuid, u::uuid, e, r, 'active'
  from (values ('c0000000-0000-0000-0000-000000000821', 'a0000000-0000-0000-0000-000000000822', 'probe+wd-insp@example.test', 'inspector'),
               ('c0000000-0000-0000-0000-000000000821', 'a0000000-0000-0000-0000-000000000823', 'probe+wd-ahj@example.test', 'ahj'),
               ('c0000000-0000-0000-0000-000000000821', 'a0000000-0000-0000-0000-000000000824', 'probe+wd-pm@example.test', 'pm'),
               ('c0000000-0000-0000-0000-000000000822', 'a0000000-0000-0000-0000-000000000825', 'probe+wd-other@example.test', 'inspector'))
       v(p, u, e, r);

-- The inspector's list: Rev 0 with two items, Rev 1 with one; two walls on Level 01.
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000822');
insert into ids select 'L', (public.rev_list_create('c0000000-0000-0000-0000-000000000821', 'Sample Rated Walls', null, null,
  '[{"number": 0, "name": "TOW", "items": [{"name": "TOW One"}, {"name": "TOW Two"}]},
    {"number": 1, "name": "HOW", "items": [{"name": "HOW One"}]}]')).id;
insert into ids select case i.name when 'TOW One' then 'i1' when 'TOW Two' then 'i2' else 'i3' end, i.id
  from public.rev_items i join public.revs v on v.id = i.rev_id where v.list_id = pg_temp.rid('L');
insert into ids select case a.name when 'North' then 'w1' else 'w2' end, a.id
  from public.rev_areas_add(pg_temp.rid('L'), 'Level 01', array['North', 'East'], null) a;

-- ---------------------------------------------------------------------------------------------------------------
-- A wall's details
-- ---------------------------------------------------------------------------------------------------------------
select is((select array[wall_tag, rating, ul_design, fire_area, sheet_ref, check_note]
             from public.rev_area_details_save(pg_temp.rid('w1'), pg_temp.ver('rev_areas', 'w1'), ' F6a ', '1 HR',
                                               'UL U419', 'Fire Area  2', 'A201A', 'Check   the head of wall')),
  array['F6a', '1 HR', 'UL U419', 'Fire Area 2', 'A201A', 'Check the head of wall'],
  'a manager saves the wall''s details, tidied');
select is((select version from public.rev_area_details_save(pg_temp.rid('w1'), null, 'F6a', '1 HR', 'UL U419', 'Fire Area 2',
                                                             'A201A', 'Check the head of wall')),
  pg_temp.ver('rev_areas', 'w1'), 'the same details again change nothing (no version given: no check)');
select throws_ok($$ select public.rev_area_details_save(pg_temp.rid('w1'), 1, 'F6b', null, null, null, null, null) $$,
  '40001', null, 'a stale version is refused');
select throws_ok($$ select public.rev_area_details_save(pg_temp.rid('w1'), null, repeat('x', 21), null, null, null, null, null) $$,
  '22023', 'Keep the tag to 20 characters.', 'too long says so');
select is((select array[wall_tag, check_note] from public.rev_area_details_save(pg_temp.rid('w1'), pg_temp.ver('rev_areas', 'w1'),
                                                                                'F6a', '1 HR', 'UL U419', 'Fire Area 2', 'A201A', ' ')),
  array['F6a', null], 'an empty field clears it');
select pg_temp.login('a0000000-0000-0000-0000-000000000824');
select throws_ok($$ select public.rev_area_details_save(pg_temp.rid('w1'), null, 'F6b', null, null, null, null, null) $$,
  '42501', 'forbidden', 'a reader (the PM) can''t save details');
select is((select wall_tag from public.rev_areas where id = pg_temp.rid('w1')), 'F6a', '... but reads them');
select pg_temp.login('a0000000-0000-0000-0000-000000000825');
select throws_ok($$ select public.rev_area_details_save(pg_temp.rid('w1'), null, 'F6b', null, null, null, null, null) $$,
  'P0002', 'not_found', 'another job''s manager doesn''t find the wall');

-- ---------------------------------------------------------------------------------------------------------------
-- Signed off before: who may
-- ---------------------------------------------------------------------------------------------------------------
select throws_ok($$ select public.rev_signoff_set(pg_temp.rid('w1'), array[pg_temp.rid('i1')], 41, current_date - 14, null) $$,
  'P0002', 'not_found', 'another job''s manager can''t sign off');
select pg_temp.login('a0000000-0000-0000-0000-000000000826');
select throws_ok($$ select public.rev_signoff_set(pg_temp.rid('w1'), array[pg_temp.rid('i1')], 41, current_date - 14, null) $$,
  'P0002', 'not_found', 'nor a stranger');
select pg_temp.login('a0000000-0000-0000-0000-000000000824');
select throws_ok($$ select public.rev_signoff_set(pg_temp.rid('w1'), array[pg_temp.rid('i1')], 41, current_date - 14, null) $$,
  '42501', 'forbidden', 'nor a reader (the PM)');
select throws_ok($$ select public.rev_signoff_clear(pg_temp.rid('w1'), array[pg_temp.rid('i1')]) $$,
  '42501', 'forbidden', '... nor clear one');
reset role;
set local role anon;
select throws_ok($$ select public.rev_signoff_set('00000000-0000-0000-0000-000000000000', array[]::uuid[], null, null, null) $$,
  '42501', null, 'anon can''t call it');
reset role;
set local role service_role;
select pg_temp.login_service();
select throws_ok($$ select public.rev_signoff_set(pg_temp.rid('w1'), array[pg_temp.rid('i1')], 41, current_date - 14, null) $$,
  'P0002', 'not_found', 'nor the no-login link''s server key (no member behind it)');
reset role;
select is_empty($$ select f from unnest(array['public.rev_text_or_null(text, integer, text)', 'public.rev_signoff_live(uuid, uuid)',
                                              'public.rev_signoff_wall(uuid, uuid[])']) f
                    where has_function_privilege('authenticated', f, 'EXECUTE') or has_function_privilege('anon', f, 'EXECUTE') $$,
  'the helpers are internal');

-- ---------------------------------------------------------------------------------------------------------------
-- Signed off before: set, read, status, clear
-- ---------------------------------------------------------------------------------------------------------------
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000822');
select throws_ok($$ select public.rev_signoff_set(pg_temp.rid('w1'), array[pg_temp.rid('i1')], 41, current_date + 30, null) $$,
  '22023', 'Pick the day it was signed off.', 'not a day ahead');
select throws_ok($$ select public.rev_signoff_set(pg_temp.rid('w1'), array[pg_temp.rid('i1')], 0, null, null) $$,
  '22023', 'Give the OFS IR number, 1 or more.', 'an OFS number is 1 or more');
select throws_ok($$ select public.rev_signoff_set(pg_temp.rid('w1'), array[]::uuid[], 41, null, null) $$,
  '22023', 'Pick 1 to 200 items.', 'at least one item');
select is((select array_agg(ofs_number::text || ' ' || coalesce(note, '-') order by ofs_number)
             from public.rev_signoff_set(pg_temp.rid('w1'), array[pg_temp.rid('i1')], 41, date '2026-09-21', 'Paper  IR')),
  array['41 Paper IR'], 'a manager signs off one item');
select is(pg_temp.st('w1', 'i1'), 'passed ofs=41 on=2026-09-21 note=Paper IR', 'it shows passed, with its OFS number and day, no IR');
select is(pg_temp.st('w1', 'i2'), 'open', 'the other item is still open');
select is((select count(*)::int from public.rev_signoff_set(pg_temp.rid('w2'), array[pg_temp.rid('i1'), pg_temp.rid('i2')], 52, null, null)),
  2, 'a whole rev on a wall at once');
select is(pg_temp.st('w2', 'i2'), 'passed ofs=52', 'no day given: none shown');
select pg_temp.login('a0000000-0000-0000-0000-000000000823');
select is((select count(*)::int from public.rev_signoffs), 3, 'the deputy (revs.read) reads the sign-offs');
select is(pg_temp.st('w1', 'i1'), 'passed ofs=41 on=2026-09-21 note=Paper IR', '... and sees the cell passed');
select pg_temp.login('a0000000-0000-0000-0000-000000000822');
select is((select array_agg(ofs_number order by ofs_number) from public.rev_signoff_clear(pg_temp.rid('w2'), array[pg_temp.rid('i1'), pg_temp.rid('i2')])),
  array[52, 52], 'Undo clears them and answers what it cleared');
select is(pg_temp.st('w2', 'i1'), 'open', '... the cell is open again');
select is((select count(*)::int from public.rev_signoff_clear(pg_temp.rid('w2'), array[pg_temp.rid('i1')])), 0, 'a repeat clears nothing');
select is(array[pg_temp.audits('create'), pg_temp.audits('delete')], array[3, 2], 'each sign-off and each clear is audited');

-- A request doesn't ask again for a signed-off cell.
reset role;
select is((select array_agg(c.item_id) from public.ir_ofs_cells('c0000000-0000-0000-0000-000000000821', array[pg_temp.rid('w1')],
                                                                array[pg_temp.rid('i1'), pg_temp.rid('i2')]) c),
  array[pg_temp.rid('i2')], 'a new request skips the signed-off cell');
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000822');

-- An in-app request newer than the sign-off decides the cell: the wall East's TOW One is asked for in the app today,
-- then a paper sign-off from three weeks ago is entered for it.
insert into ids select 'r', (public.ir_submit_ofs('c0000000-0000-0000-0000-000000000821', 'Sample Co', current_date + 3, true,
  array[pg_temp.rid('w2')], array[pg_temp.rid('i1')], null, '08:00', 'timed', 60, p_special_required => false,
  p_inspector_ack => true)).id;
select is((select count(*)::int from public.rev_signoff_set(pg_temp.rid('w2'), array[pg_temp.rid('i1')], 7, current_date - 21, null)),
  1, 'an old sign-off entered after an app request');
select ok(pg_temp.st('w2', 'i1') like 'requested ir=%', 'the newer in-app request decides it: requested');
reset role;
update public.ir_rev_items set result = 'failed', result_note = 'Sample gap', result_at = now()
 where request_id = pg_temp.rid('r');
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000822');
select ok(pg_temp.st('w2', 'i1') like 'failed ir=% note=Sample gap', '... and its failed result shows failed');
select is((select count(*)::int from public.rev_signoff_set(pg_temp.rid('w2'), array[pg_temp.rid('i1')], 8, null, null)), 1,
  'signed off again now, after the app''s failure');
select is(pg_temp.st('w2', 'i1'), 'passed ofs=8', '... the newer sign-off decides it');
select is(pg_temp.live_signoffs(), 2, 'one live sign-off per wall and item (the second set replaced the first)');

select * from finish();
rollback;
