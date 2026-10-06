begin;
select plan(53);
-- Migration 0083: rooms. A manager loads a list's rooms in one idempotent call (upsert by level and number, images
-- linked by name to the latest finished upload he may read, walls replaced, lines set or kept), links the images again
-- later, renames a room, takes a wall out and puts it back (Undo, the line kept), draws a wall's line, removes and
-- restores a room. Readers read rooms, nobody else does, and nobody but a manager writes. A room's image (or a
-- sign-off's file) is shown to any revs reader as a preview (no download line) or saved as a download, nothing else
-- through that gate. The sign-offs get their OFS IR files by the number in the file name. A wall's history lists the
-- in-app requests and the sign-offs per item, newest first.
\ir _helpers.psql

create temp table ids (k text primary key, v uuid);
grant all on ids to public;
create function pg_temp.rid(p_k text) returns uuid language sql stable as $$ select v from ids where k = p_k $$;
create function pg_temp.room(p_number text) returns public.rev_rooms language sql volatile security definer as $$
  select * from public.rev_rooms where list_id = pg_temp.rid('L') and number = p_number and deleted_at is null $$;
create function pg_temp.live_walls(p_number text) returns text language sql volatile security definer as $$
  select string_agg(k.k || coalesce(':' || w.line::text, ''), ',' order by w.position)
    from public.rev_room_walls w join ids k on k.v = w.area_id
   where w.room_id = (pg_temp.room(p_number)).id and w.deleted_at is null $$;
create function pg_temp.versions() returns int language sql volatile security definer as $$
  select (select coalesce(sum(version), 0) from public.rev_rooms) + (select coalesce(sum(version), 0) from public.rev_room_walls)
         + (select count(*) from public.rev_room_walls) $$;
create function pg_temp.downloads(p_file uuid) returns int language sql volatile security definer as $$
  select count(*)::int from public.downloads where file_id = p_file $$;
create function pg_temp.previews(p_file uuid) returns int language sql volatile security definer as $$
  select count(*)::int from public.audit_events where action = 'file.preview' and entity_id = p_file $$;
create function pg_temp.signoff_file(p_area text, p_item text) returns uuid language sql volatile security definer as $$
  select file_id from public.rev_signoffs where area_id = pg_temp.rid(p_area) and item_id = pg_temp.rid(p_item) and deleted_at is null $$;
create function pg_temp.ofs_of(p_id uuid) returns int language sql volatile security definer as $$
  select ofs_number from public.inspection_requests where id = p_id $$;
grant execute on all functions in schema pg_temp to public;

select pg_temp.mk_user('a0000000-0000-0000-0000-000000000831', 'probe+rr-admin@example.test', 'Ada Admin');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000832', 'probe+rr-insp@example.test', 'Ivy Inspector');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000833', 'probe+rr-pm@example.test', 'Pat Manager');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000834', 'probe+rr-other@example.test', 'Otto Other');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000835', 'probe+rr-none@example.test', 'Nina Nobody');

insert into public.orgs (id, name, kind, created_by) values
  ('b0000000-0000-0000-0000-000000000831', 'Sample Room Builders', 'gc', 'a0000000-0000-0000-0000-000000000831');
insert into public.projects (id, org_id, name, stage, timezone, created_by, settings) values
  ('c0000000-0000-0000-0000-000000000831', 'b0000000-0000-0000-0000-000000000831', 'Room Job', 'construction',
   'America/Los_Angeles', 'a0000000-0000-0000-0000-000000000831', '{"ir_ofs_allowed": true}'),
  ('c0000000-0000-0000-0000-000000000832', 'b0000000-0000-0000-0000-000000000831', 'Other Room Job', 'construction',
   'America/Los_Angeles', 'a0000000-0000-0000-0000-000000000831', '{"ir_ofs_allowed": true}');
insert into public.project_members (org_id, project_id, user_id, invite_email, role, status)
select 'b0000000-0000-0000-0000-000000000831', p::uuid, u::uuid, e, r, 'active'
  from (values ('c0000000-0000-0000-0000-000000000831', 'a0000000-0000-0000-0000-000000000832', 'probe+rr-insp@example.test', 'inspector'),
               ('c0000000-0000-0000-0000-000000000831', 'a0000000-0000-0000-0000-000000000833', 'probe+rr-pm@example.test', 'pm'),
               ('c0000000-0000-0000-0000-000000000832', 'a0000000-0000-0000-0000-000000000834', 'probe+rr-other@example.test', 'inspector'))
       v(p, u, e, r);

-- A folder only files.manage reads (the PM does, the inspector doesn't): the inspector's own room images (an older and
-- a newer "Room 110.png"), the PM's "Room 205.png", the OFS IRs and a sheet no room or sign-off uses.
insert into public.folders (id, org_id, project_id, name, created_by) values
  ('d0000000-0000-0000-0000-000000000831', 'b0000000-0000-0000-0000-000000000831', 'c0000000-0000-0000-0000-000000000831',
   'Sample Files', 'a0000000-0000-0000-0000-000000000831');
insert into public.folder_access (folder_id, capability, can_read, can_write)
values ('d0000000-0000-0000-0000-000000000831', 'files.manage', true, true);
insert into public.files (id, org_id, project_id, folder_id, storage_path, original_name, mime, created_by, scan_status,
                          upload_complete, created_at)
select ('e0000000-0000-0000-0000-00000000083' || n)::uuid, 'b0000000-0000-0000-0000-000000000831', 'c0000000-0000-0000-0000-000000000831',
       'd0000000-0000-0000-0000-000000000831', 'test/rooms/' || n, nm, mime, u::uuid, scan, true, now() - (age || ' days')::interval
  from (values ('1', 'Room 110.png', 'image/png', 'a0000000-0000-0000-0000-000000000832', 'clean', '9'),
               ('2', 'Room 110.png', 'image/png', 'a0000000-0000-0000-0000-000000000832', 'clean', '2'),
               ('3', 'Room 205.png', 'image/png', 'a0000000-0000-0000-0000-000000000833', 'clean', '2'),
               ('4', 'OFS_IR_0041_Attachment.pdf', 'application/pdf', 'a0000000-0000-0000-0000-000000000832', 'clean', '5'),
               ('5', 'Sample_OFS_0041_map.pdf', 'application/pdf', 'a0000000-0000-0000-0000-000000000832', 'clean', '1'),
               ('6', 'OFS_IR_00411.pdf', 'application/pdf', 'a0000000-0000-0000-0000-000000000832', 'clean', '1'),
               ('7', 'OFS_IR_0052.pdf', 'application/pdf', 'a0000000-0000-0000-0000-000000000832', 'infected', '1'),
               ('8', 'Sample Sheet.pdf', 'application/pdf', 'a0000000-0000-0000-0000-000000000832', 'clean', '1')) v(n, nm, mime, u, scan, age);

-- The inspector's list (TOW, two items) with three walls on Level 01, and a second list with one wall.
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000832');
insert into ids select 'L', (public.rev_list_create('c0000000-0000-0000-0000-000000000831', 'Sample Rated Walls', null, null,
  '[{"number": 0, "name": "TOW", "items": [{"name": "TOW One"}, {"name": "TOW Two"}]}]')).id;
insert into ids select case i.name when 'TOW One' then 'i1' else 'i2' end, i.id
  from public.rev_items i join public.revs v on v.id = i.rev_id where v.list_id = pg_temp.rid('L');
insert into ids select case a.name when 'North' then 'w1' when 'East' then 'w2' else 'w3' end, a.id
  from public.rev_areas_add(pg_temp.rid('L'), 'Level 01', array['North', 'East', 'South'], null) a;
insert into ids select 'L2', (public.rev_list_create('c0000000-0000-0000-0000-000000000831', 'Sample Other Walls', null, null,
  '[{"number": 0, "name": "TOW", "items": [{"name": "TOW One"}]}]')).id;
insert into ids select 'y', a.id from public.rev_areas_add(pg_temp.rid('L2'), 'Level 01', array['West'], null) a;

-- The load the tests send (built here so each test reads short).
create temp table loads (k text primary key, v jsonb);
grant all on loads to public;
insert into loads values ('good', jsonb_build_array(
  jsonb_build_object('level', 'Level 01', 'number', '110', 'name', 'Corridor', 'image_name', 'room 110.PNG',
                     'walls', jsonb_build_array(jsonb_build_object('area_id', pg_temp.rid('w1'), 'line', '[[0.1, 0.2], [0.9, 0.2]]'::jsonb),
                                                jsonb_build_object('area_id', pg_temp.rid('w2')))),
  jsonb_build_object('level', 'Level 01', 'number', 'EXT', 'name', 'Exterior', 'kind', 'exterior',
                     'walls', jsonb_build_array(jsonb_build_object('area_id', pg_temp.rid('w3')))),
  jsonb_build_object('level', ' Level 01 ', 'number', '205', 'name', ' Electrical ', 'image_name', 'Room 205.png',
                     'walls', jsonb_build_array(jsonb_build_object('area_id', pg_temp.rid('w2'), 'line', '[[0.5, 0.1], [0.5, 0.8]]'::jsonb)))));

-- ---------------------------------------------------------------------------------------------------------------
-- Who may load
-- ---------------------------------------------------------------------------------------------------------------
select pg_temp.login('a0000000-0000-0000-0000-000000000833');
select throws_ok($$ select public.rev_rooms_load(pg_temp.rid('L'), (select v from loads where k = 'good')) $$,
  '42501', 'forbidden', 'a reader (the PM) can''t load rooms');
select pg_temp.login('a0000000-0000-0000-0000-000000000834');
select throws_ok($$ select public.rev_rooms_load(pg_temp.rid('L'), (select v from loads where k = 'good')) $$,
  'P0002', 'not_found', 'another job''s manager doesn''t find the list');
reset role;
set local role anon;
select throws_ok($$ select public.rev_rooms_load('00000000-0000-0000-0000-000000000000', '[]') $$, '42501', null, 'anon can''t call it');
reset role;

-- ---------------------------------------------------------------------------------------------------------------
-- The load, checked first
-- ---------------------------------------------------------------------------------------------------------------
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000832');
select throws_ok(format($$ select public.rev_rooms_load(%L, %L) $$, pg_temp.rid('L'),
  jsonb_build_array(jsonb_build_object('level', 'Level 01', 'number', '1', 'name', 'A', 'walls', jsonb_build_array(jsonb_build_object('area_id', pg_temp.rid('y')))))),
  '22023', format('Room 1: Wall %s is not a wall of this list.', pg_temp.rid('y')), 'a wall of another list is refused, naming the room');
select throws_ok(format($$ select public.rev_rooms_load(%L, %L) $$, pg_temp.rid('L'),
  jsonb_build_array(jsonb_build_object('level', 'Level 01', 'number', '1', 'name', 'A'),
                    jsonb_build_object('level', 'Level 01', 'number', '2', 'name', 'B', 'walls',
                      jsonb_build_array(jsonb_build_object('area_id', pg_temp.rid('w1'), 'line', '[[0, 0], [0.1, 0], [0.2, 0], [0.3, 0], [0.4, 0], [0.5, 0], [0.6, 0], [0.7, 0], [0.8, 0]]'::jsonb))))),
  '22023', format('Room 2: The line of wall %s is 2 to 8 points [x, y] from 0 to 1.', pg_temp.rid('w1')), 'nine points are too many');
select throws_ok(format($$ select public.rev_rooms_load(%L, %L) $$, pg_temp.rid('L'),
  '[{"level": "Level 01", "number": "1", "name": "A"}, {"level": "level 01", "number": "1", "name": "B"}]'),
  '22023', 'Each room number once per level.', 'a number twice on a level is refused');
select throws_ok(format($$ select public.rev_rooms_load(%L, %L) $$, pg_temp.rid('L'), '[{"level": "Level 01", "number": "1", "name": "A", "kind": "hall"}]'),
  '22023', 'Room 1: The kind is room, exterior or shaft.', 'the kind is one of three');
select is((select count(*)::int from public.rev_rooms), 0, 'a refused load wrote nothing');

-- ---------------------------------------------------------------------------------------------------------------
-- The load
-- ---------------------------------------------------------------------------------------------------------------
select is(public.rev_rooms_load(pg_temp.rid('L'), (select v from loads where k = 'good')),
  '{"rooms": 3, "walls": 4, "linked": 1, "missing": ["Room 205.png"]}'::jsonb,
  'the load answers what it did: the PM''s image isn''t one the inspector may read yet');
select is((pg_temp.room('110')).image_file_id, 'e0000000-0000-0000-0000-000000000832'::uuid,
  'the image is the newest upload of that name, case aside');
select is(array[(pg_temp.room('205')).name, (pg_temp.room('205')).level, (pg_temp.room('EXT')).kind],
  array['Electrical', 'Level 01', 'exterior'], 'names tidied, the kind kept');
select is(pg_temp.live_walls('110'), 'w1:[[0.1, 0.2], [0.9, 0.2]],w2', 'the walls in order, a line where given');
select is((select count(*)::int from public.rev_room_walls where area_id = pg_temp.rid('w2') and deleted_at is null), 2,
  'a shared wall is in both rooms');
select lives_ok($$ select public.rev_rooms_load(pg_temp.rid('L'), (select v from loads where k = 'good')) $$, 'the same load again');
select is(pg_temp.versions(), 3 + 4 + 4, '... changes nothing');
select is(public.rev_rooms_load(pg_temp.rid('L'),
  jsonb_build_array(jsonb_build_object('level', 'Level 01', 'number', '110', 'name', 'Corridor 110', 'image_name', 'Room 110.png',
                                       'walls', jsonb_build_array(jsonb_build_object('area_id', pg_temp.rid('w1')))))) -> 'rooms',
  '1'::jsonb, 'a load of one room');
select is(pg_temp.live_walls('110'), 'w1:[[0.1, 0.2], [0.9, 0.2]]', '... its walls are the ones given, a line left out stays');
select is(pg_temp.live_walls('205'), 'w2:[[0.5, 0.1], [0.5, 0.8]]', '... rooms not named stay as they are');
select is(public.rev_rooms_load(pg_temp.rid('L'),
  jsonb_build_array(jsonb_build_object('level', 'Level 01', 'number', '110', 'name', 'Corridor 110', 'image_name', 'Room 110.png',
                                       'walls', jsonb_build_array(jsonb_build_object('area_id', pg_temp.rid('w1'), 'line', null),
                                                                  jsonb_build_object('area_id', pg_temp.rid('w2')))))) -> 'walls',
  '2'::jsonb, 'a line given as null');
select is(pg_temp.live_walls('110'), 'w1,w2', '... takes the line off')
;
-- ---------------------------------------------------------------------------------------------------------------
-- Who reads
-- ---------------------------------------------------------------------------------------------------------------
select pg_temp.login('a0000000-0000-0000-0000-000000000833');
select is(array[(select count(*)::int from public.rev_rooms), (select count(*)::int from public.rev_room_walls where deleted_at is null)],
  array[3, 4], 'a reader (the PM) reads the rooms and their walls');
select pg_temp.login('a0000000-0000-0000-0000-000000000835');
select is((select count(*)::int from public.rev_rooms), 0, 'a stranger reads none');
reset role;
set local role anon;
select throws_ok($$ select count(*) from public.rev_rooms $$, '42501', null, 'anon has no table rights');
reset role;

-- ---------------------------------------------------------------------------------------------------------------
-- Small edits
-- ---------------------------------------------------------------------------------------------------------------
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000833');
select throws_ok($$ select public.rev_room_save((pg_temp.room('110')).id, null, '111', 'Corridor') $$, '42501', 'forbidden',
  'a reader can''t rename a room');
select throws_ok($$ select public.rev_room_wall_remove((pg_temp.room('110')).id, pg_temp.rid('w1')) $$, '42501', 'forbidden',
  '... nor take a wall out');
select pg_temp.login('a0000000-0000-0000-0000-000000000832');
select is((select array[number, name] from public.rev_room_save((pg_temp.room('110')).id, (pg_temp.room('110')).version, ' 111 ', 'Corridor  111')),
  array['111', 'Corridor 111'], 'a manager renames a room, tidied');
select throws_ok($$ select public.rev_room_save((pg_temp.room('111')).id, 1, '112', 'Corridor') $$, '40001', null, 'a stale version is refused');
select throws_ok($$ select public.rev_room_save((pg_temp.room('111')).id, null, '205', 'Corridor') $$, '22023',
  'That room number is already on this level.', 'another room''s number is refused');
select is((select line from public.rev_room_wall_line((pg_temp.room('111')).id, pg_temp.rid('w1'), null, '[[0.2, 0.3], [0.2, 0.9], [0.6, 0.9]]')),
  '[[0.2, 0.3], [0.2, 0.9], [0.6, 0.9]]'::jsonb, 'a manager draws a wall''s line');
select throws_ok($$ select public.rev_room_wall_line((pg_temp.room('111')).id, pg_temp.rid('w1'), null, '[[0.2, 0.3], [1.2, 0.9]]') $$,
  '22023', 'Draw the wall: 2 to 8 points on the image.', 'a point off the image is refused');
select throws_ok($$ select public.rev_room_wall_line((pg_temp.room('111')).id, pg_temp.rid('w3'), null, '[[0.2, 0.3], [0.2, 0.9]]') $$,
  '22023', 'That wall isn''t in this room.', 'a wall not in the room has no line there');
select is((select deleted_at is not null from public.rev_room_wall_remove((pg_temp.room('111')).id, pg_temp.rid('w1'))), true,
  'a wall taken out of a room');
select is((select line from public.rev_room_wall_add((pg_temp.room('111')).id, pg_temp.rid('w1'))),
  '[[0.2, 0.3], [0.2, 0.9], [0.6, 0.9]]'::jsonb, '... Undo puts it back with its line');
select throws_ok($$ select public.rev_room_wall_add((pg_temp.room('111')).id, pg_temp.rid('y')) $$, '22023',
  'Pick a wall of this room''s list.', 'a wall of another list can''t go in');
select ok(public.rev_remove('room', (pg_temp.room('EXT')).id, null) ->> 'deleted_at' is not null, 'a room removed');
select is(public.rev_restore('room', (select id from public.rev_rooms where number = 'EXT'), null) ->> 'deleted_at', null,
  '... and restored (Undo)');
reset role;
select throws_ok($$ update public.rev_room_walls set room_id = (pg_temp.room('205')).id where area_id = pg_temp.rid('w1') $$,
  '42501', 'A rev record stays where it was made.', 'a room''s wall stays in its room');

-- ---------------------------------------------------------------------------------------------------------------
-- Images again, and the gate
-- ---------------------------------------------------------------------------------------------------------------
insert into public.files (id, org_id, project_id, folder_id, storage_path, original_name, mime, created_by, scan_status, upload_complete)
values ('e0000000-0000-0000-0000-000000000839', 'b0000000-0000-0000-0000-000000000831', 'c0000000-0000-0000-0000-000000000831',
        'd0000000-0000-0000-0000-000000000831', 'test/rooms/9', 'Room 205.png', 'image/png', 'a0000000-0000-0000-0000-000000000832',
        'clean', true);
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000832');
select is(public.rev_rooms_link_images(pg_temp.rid('L')), '{"linked": 1, "missing": []}'::jsonb,
  'the images linked again by name after they are in Files');
select pg_temp.login('a0000000-0000-0000-0000-000000000833');
select is((select original_name from public.authorize_rev_file('c0000000-0000-0000-0000-000000000831', 'e0000000-0000-0000-0000-000000000832', false)),
  'Room 110.png', 'a reader sees a room''s image');
select is(array[pg_temp.downloads('e0000000-0000-0000-0000-000000000832'), pg_temp.previews('e0000000-0000-0000-0000-000000000832')],
  array[0, 1], '... logged as a preview, not a download');
select is((select count(*)::int from public.authorize_rev_file('c0000000-0000-0000-0000-000000000831', 'e0000000-0000-0000-0000-000000000832', true)),
  1, 'Download through the same gate');
select is(pg_temp.downloads('e0000000-0000-0000-0000-000000000832'), 1, '... is a download line');
select throws_ok($$ select * from public.authorize_rev_file('c0000000-0000-0000-0000-000000000831', 'e0000000-0000-0000-0000-000000000838', false) $$,
  '42501', 'forbidden', 'a file no room or sign-off uses doesn''t open through it');
select pg_temp.login('a0000000-0000-0000-0000-000000000835');
select throws_ok($$ select * from public.authorize_rev_file('c0000000-0000-0000-0000-000000000831', 'e0000000-0000-0000-0000-000000000832', false) $$,
  'P0002', 'not_found', 'a stranger doesn''t find it');

-- ---------------------------------------------------------------------------------------------------------------
-- The sign-offs' files, and a wall's history
-- ---------------------------------------------------------------------------------------------------------------
select pg_temp.login('a0000000-0000-0000-0000-000000000832');
select count(*) from public.rev_signoff_set(pg_temp.rid('w1'), array[pg_temp.rid('i1')], 41, date '2026-08-20', 'Paper IR');
select count(*) from public.rev_signoff_set(pg_temp.rid('w2'), array[pg_temp.rid('i1')], 52, null, null);
select count(*) from public.rev_signoff_set(pg_temp.rid('w3'), array[pg_temp.rid('i1')], null, null, null);
select pg_temp.login('a0000000-0000-0000-0000-000000000833');
select throws_ok($$ select public.rev_signoffs_link_files('c0000000-0000-0000-0000-000000000831') $$, '42501', 'forbidden',
  'a reader can''t link the OFS files');
select pg_temp.login('a0000000-0000-0000-0000-000000000832');
select is(public.rev_signoffs_link_files('c0000000-0000-0000-0000-000000000831'), '{"linked": 1, "missing": [52]}'::jsonb,
  'each sign-off gets the file with its OFS number, an infected one is no file');
select is(pg_temp.signoff_file('w1', 'i1'), 'e0000000-0000-0000-0000-000000000834'::uuid,
  '... the Attachment first, never OFS_IR_00411 for 41');
select is(public.rev_signoffs_link_files('c0000000-0000-0000-0000-000000000831') -> 'linked', '0'::jsonb, 'again: nothing changes');
insert into ids select 'r', (public.ir_submit_ofs('c0000000-0000-0000-0000-000000000831', 'Sample Co', current_date + 3, true,
  array[pg_temp.rid('w1')], array[pg_temp.rid('i2')], null, '08:00', 'timed', 60, p_special_required => false,
  p_inspector_ack => true)).id;
select is((select array_agg(concat_ws(' ', h.kind, h.result, 'ofs=' || h.ofs_number, 'open=' || h.can_open)
                            order by (h.item_id = pg_temp.rid('i2')), h.at desc)
             from public.rev_wall_history(pg_temp.rid('w1')) h where h.kind = 'request'),
  array['request requested ofs=' || pg_temp.ofs_of(pg_temp.rid('r')) || ' open=true'],
  'the manager sees the in-app request in the wall''s history, with its OFS number, and may open it');
select pg_temp.login('a0000000-0000-0000-0000-000000000833');
select is((select array_agg(concat_ws(' ', h.kind, h.result, 'ofs=' || h.ofs_number, 'file=' || h.file_name, 'note=' || h.note,
                                      'day=' || h.day) order by (h.item_id = pg_temp.rid('i2')), h.at desc)
             from public.rev_wall_history(pg_temp.rid('w1')) h),
  array['before passed ofs=41 file=OFS_IR_0041_Attachment.pdf note=Paper IR day=2026-08-20',
        'request requested ofs=' || pg_temp.ofs_of(pg_temp.rid('r')) || ' day=' || (current_date + 3)],
  'a reader sees the wall''s history per item: the sign-off with its file, then the in-app request');
select is((select original_name from public.authorize_rev_file('c0000000-0000-0000-0000-000000000831', 'e0000000-0000-0000-0000-000000000834', false)),
  'OFS_IR_0041_Attachment.pdf', 'a sign-off''s file opens for a reader');
select pg_temp.login('a0000000-0000-0000-0000-000000000835');
select throws_ok($$ select * from public.rev_wall_history(pg_temp.rid('w1')) $$, 'P0002', 'not_found', 'a stranger has no history');
reset role;
select is_empty($$ select f from unnest(array['public.rev_room_line_ok(jsonb)', 'public.rev_room_check(text, text, text, text)',
                                              'public.rev_room_image_of(uuid, text)', 'public.rev_room_lock(uuid)',
                                              'public.rev_room_area_check(public.rev_rooms, uuid, text)']) f
                    where has_function_privilege('authenticated', f, 'EXECUTE') or has_function_privilege('anon', f, 'EXECUTE') $$,
  'the helpers are internal');

select * from finish();
rollback;
