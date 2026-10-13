begin;
select plan(56);
-- Migration 0102 (Jesse, Oct 12: "send him out with an iPad: go take a picture of all our walls the way they are right
-- now. And on the inspection request ... attach a photo, or add a comment, a note: what's going on with this wall").
-- Photos and one-line notes of a wall, a room, or a wall on a request, stored in the app's own folder (Wall photos,
-- hidden from Files). Who may add (readers of the cards who add files or ask for or decide inspections), who reads
-- (inside people and managers the walls' photos, a request's photos go with the request, everyone their own), who
-- removes (the one who added it or a manager, Undo brings it back), a decided request's photos locked, the file of a
-- live photo never deleted on its own, a request's photos opening through the request, anon nowhere.
\ir _helpers.psql

create temp table ids (k text primary key, v uuid);
grant all on ids to public;
create function pg_temp.rid(p_k text) returns uuid language sql stable as $$ select v from ids where k = p_k $$;
create function pg_temp.add_file(p_k text, p_folder uuid, p_name text, p_by uuid) returns void
language plpgsql volatile security definer as $$
declare v uuid;
begin
  insert into public.files (org_id, project_id, folder_id, storage_path, original_name, mime, created_by, scan_status, upload_complete)
  select fo.org_id, fo.project_id, p_folder, 'test/wallphotos/' || p_k, p_name, 'image/jpeg', p_by, 'clean', true
    from public.folders fo where fo.id = p_folder
  returning id into strict v;
  insert into ids values (p_k, v);
end $$;
create function pg_temp.access(p_id uuid) returns text[] language sql volatile security definer as $$
  select array_agg(capability || ':' || can_read || ':' || can_write order by capability) from public.folder_access where folder_id = p_id $$;
create function pg_temp.ver(p_k text) returns int language sql volatile security definer as $$
  select version from public.rev_photos where id = pg_temp.rid(p_k) $$;
create function pg_temp.live(p_k text) returns boolean language sql volatile security definer as $$
  select deleted_at is null from public.rev_photos where id = pg_temp.rid(p_k) $$;
-- What the logged-in person sees in a list: each row's file key (or note:<note>), newest first.
create function pg_temp.seen(p_area text, p_room text, p_request text) returns text[] language sql volatile as $$
  select coalesce(array_agg(coalesce((select k from ids where v = l.file_id), 'note:' || l.note) order by l.created_at desc, l.id desc), '{}')
    from public.rev_photos_list('c0000000-0000-0000-0000-000000000891', pg_temp.rid(p_area), pg_temp.rid(p_room), pg_temp.rid(p_request)) l $$;
create function pg_temp.row_of(p_area text, p_file text) returns text language sql volatile as $$
  select concat_ws(' ', l.by_name, 'ir=' || l.ir_number, 'mine=' || l.mine, 'remove=' || l.can_remove, 'locked=' || l.locked,
                   'via=' || l.via_request, 'note=' || l.note)
    from public.rev_photos_list('c0000000-0000-0000-0000-000000000891', pg_temp.rid(p_area), null, null) l
   where l.file_id = pg_temp.rid(p_file) $$;
create function pg_temp.audits() returns int language sql volatile security definer as $$
  select count(*)::int from public.audit_events where entity_type = 'rev_photos' $$;
grant execute on all functions in schema pg_temp to public;

select pg_temp.mk_user('a0000000-0000-0000-0000-000000000891', 'probe+wp-admin@example.test', 'Ada Admin');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000892', 'probe+wp-insp@example.test', 'Ivy Inspector');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000893', 'probe+wp-ahj@example.test', 'Dana Deputy');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000894', 'probe+wp-pm@example.test', 'Pat Manager');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000895', 'probe+wp-sub@example.test', 'Sam Sub');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000896', 'probe+wp-sub2@example.test', 'Sue Second');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000897', 'probe+wp-arch@example.test', 'Art Architect');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000898', 'probe+wp-other@example.test', 'Otto Other');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000899', 'probe+wp-none@example.test', 'Nina Nobody');

insert into public.orgs (id, name, kind, created_by) values
  ('b0000000-0000-0000-0000-000000000891', 'Sample Photo Builders', 'gc', 'a0000000-0000-0000-0000-000000000891');
insert into public.projects (id, org_id, name, stage, timezone, created_by, settings) values
  ('c0000000-0000-0000-0000-000000000891', 'b0000000-0000-0000-0000-000000000891', 'Photo Job', 'construction',
   'America/Los_Angeles', 'a0000000-0000-0000-0000-000000000891', '{"ir_ofs_allowed": true}'),
  ('c0000000-0000-0000-0000-000000000892', 'b0000000-0000-0000-0000-000000000891', 'Other Photo Job', 'construction',
   'America/Los_Angeles', 'a0000000-0000-0000-0000-000000000891', '{"ir_ofs_allowed": true}');
insert into public.project_members (org_id, project_id, user_id, invite_email, role, status)
select 'b0000000-0000-0000-0000-000000000891', p::uuid, u::uuid, e, r, 'active'
  from (values ('c0000000-0000-0000-0000-000000000891', 'a0000000-0000-0000-0000-000000000892', 'probe+wp-insp@example.test', 'inspector'),
               ('c0000000-0000-0000-0000-000000000891', 'a0000000-0000-0000-0000-000000000893', 'probe+wp-ahj@example.test', 'ahj'),
               ('c0000000-0000-0000-0000-000000000891', 'a0000000-0000-0000-0000-000000000894', 'probe+wp-pm@example.test', 'pm'),
               ('c0000000-0000-0000-0000-000000000891', 'a0000000-0000-0000-0000-000000000895', 'probe+wp-sub@example.test', 'sub'),
               ('c0000000-0000-0000-0000-000000000891', 'a0000000-0000-0000-0000-000000000896', 'probe+wp-sub2@example.test', 'sub'),
               ('c0000000-0000-0000-0000-000000000891', 'a0000000-0000-0000-0000-000000000897', 'probe+wp-arch@example.test', 'architect'),
               ('c0000000-0000-0000-0000-000000000892', 'a0000000-0000-0000-0000-000000000898', 'probe+wp-other@example.test', 'inspector'))
       v(p, u, e, r);

-- The inspector's list (TOW, one item), three walls on Level 01, room 110 with North and East.
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000892');
insert into ids select 'L', (public.rev_list_create('c0000000-0000-0000-0000-000000000891', 'Sample Rated Walls', null, null,
  '[{"number": 0, "name": "TOW", "items": [{"name": "TOW One"}]}]')).id;
insert into ids select 'i1', i.id from public.rev_items i join public.revs v on v.id = i.rev_id where v.list_id = pg_temp.rid('L');
insert into ids select case a.name when 'North' then 'w1' when 'East' then 'w2' else 'w3' end, a.id
  from public.rev_areas_add(pg_temp.rid('L'), 'Level 01', array['North', 'East', 'South'], null) a;
select public.rev_rooms_load(pg_temp.rid('L'), jsonb_build_array(jsonb_build_object('level', 'Level 01', 'number', '110',
  'name', 'Corridor', 'walls', jsonb_build_array(jsonb_build_object('area_id', pg_temp.rid('w1')), jsonb_build_object('area_id', pg_temp.rid('w2'))))));
reset role;
insert into ids select 'room', id from public.rev_rooms where list_id = pg_temp.rid('L') and number = '110';
set local role authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- The folder
-- ---------------------------------------------------------------------------------------------------------------
select pg_temp.login('a0000000-0000-0000-0000-000000000897');
select throws_ok($$ select public.rev_photos_folder('c0000000-0000-0000-0000-000000000891') $$, '42501', 'forbidden',
  'the architect (reads the cards, adds nothing) can''t make the folder');
select pg_temp.login('a0000000-0000-0000-0000-000000000894');
insert into ids select 'F', public.rev_photos_folder('c0000000-0000-0000-0000-000000000891');
select is(public.rev_photos_folder('c0000000-0000-0000-0000-000000000891'), pg_temp.rid('F'), 'the PM makes Wall photos once');
select is(pg_temp.access(pg_temp.rid('F')),
  array['files.manage:true:true', 'files.read_records:true:false', 'files.write_project:false:true', 'ir.decide:false:true',
        'ir.ofs_decide:false:true', 'ir.request:false:true', 'revs.manage:true:true'],
  'its own list: inside people read, managers read and add, the others who may add photos add only');
select ok(public.folder_by_app('general', null, 'Wall photos') and public.folder_name_reserved('c0000000-0000-0000-0000-000000000891', null, 'Wall photos'),
  'only the app fills it and its name is the server''s');
reset role;
select ok(public.files_hidden_root(pg_temp.rid('F')), 'Files doesn''t show it');
set local role authenticated;
select is(array[pg_temp.can_write_as('a0000000-0000-0000-0000-000000000895', pg_temp.rid('F')),
                pg_temp.can_read_as('a0000000-0000-0000-0000-000000000895', pg_temp.rid('F')),
                pg_temp.can_read_as('a0000000-0000-0000-0000-000000000897', pg_temp.rid('F'))],
  array[true, false, true], 'a sub adds to it but doesn''t read it, the architect reads it');

reset role;
select pg_temp.add_file('p1', pg_temp.rid('F'), 'IMG_0001.jpg', 'a0000000-0000-0000-0000-000000000894');
select pg_temp.add_file('p2', pg_temp.rid('F'), 'IMG_0002.jpg', 'a0000000-0000-0000-0000-000000000894');
select pg_temp.add_file('s1', pg_temp.rid('F'), 'IMG_1001.jpg', 'a0000000-0000-0000-0000-000000000895');
select pg_temp.add_file('s2', pg_temp.rid('F'), 'IMG_1002.jpg', 'a0000000-0000-0000-0000-000000000895');
select pg_temp.add_file('n1', pg_temp.rid('F'), 'IMG_2001.jpg', 'a0000000-0000-0000-0000-000000000892');
insert into ids select 'att', public.ir_attach_folder_id('c0000000-0000-0000-0000-000000000891');
insert into public.folders (id, org_id, project_id, name, created_by) values
  ('d0000000-0000-0000-0000-000000000891', 'b0000000-0000-0000-0000-000000000891', 'c0000000-0000-0000-0000-000000000891',
   'Sample Loose', 'a0000000-0000-0000-0000-000000000891');
select pg_temp.add_file('x1', 'd0000000-0000-0000-0000-000000000891', 'IMG_9001.jpg', 'a0000000-0000-0000-0000-000000000895');
set local role authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- Adding to a wall or a room
-- ---------------------------------------------------------------------------------------------------------------
select pg_temp.login('a0000000-0000-0000-0000-000000000894');
insert into ids select 'P1', (public.rev_photo_add('c0000000-0000-0000-0000-000000000891', pg_temp.rid('w1'), pg_temp.rid('room'), null,
  pg_temp.rid('p1'), '  Drywall   back off  ')).id;
select is((select note from public.rev_photos where id = pg_temp.rid('P1')), 'Drywall back off', 'the PM adds a photo of North with a note, tidied');
select is((public.rev_photo_add('c0000000-0000-0000-0000-000000000891', pg_temp.rid('w1'), pg_temp.rid('room'), null,
  pg_temp.rid('p1'), 'Drywall back off')).id, pg_temp.rid('P1'), 'the same photo again answers its row');
select throws_ok($$ select public.rev_photo_add('c0000000-0000-0000-0000-000000000891', pg_temp.rid('w2'), null, null, pg_temp.rid('p1'), null) $$,
  '22023', 'That photo is already on a wall.', 'one photo is on one wall');
select throws_ok($$ select public.rev_photo_add('c0000000-0000-0000-0000-000000000891', pg_temp.rid('w3'), pg_temp.rid('room'), null, pg_temp.rid('p2'), null) $$,
  '22023', 'That wall is not in this room.', 'a wall of another room is refused');
insert into ids select 'P2', (public.rev_photo_add('c0000000-0000-0000-0000-000000000891', null, pg_temp.rid('room'), null, pg_temp.rid('p2'), null)).id;
select ok(pg_temp.live('P2'), 'a photo of the whole room');
select throws_ok($$ select public.rev_photo_add('c0000000-0000-0000-0000-000000000891', pg_temp.rid('w1'), null, null, null, '  ') $$,
  '22023', 'Add a photo or a note.', 'nothing to add is refused');
select throws_ok($$ select public.rev_photo_add('c0000000-0000-0000-0000-000000000891', pg_temp.rid('w1'), null, null, null, repeat('x', 201)) $$,
  '22023', 'Keep the note to one line (200 characters).', 'a note is one line');

select pg_temp.login('a0000000-0000-0000-0000-000000000895');
select throws_ok($$ select public.rev_photo_add('c0000000-0000-0000-0000-000000000891', pg_temp.rid('w2'), null, null, pg_temp.rid('p2'), null) $$,
  '22023', 'Take or pick the photo again.', 'the sub can''t put someone else''s file on a wall');
select throws_ok($$ select public.rev_photo_add('c0000000-0000-0000-0000-000000000891', pg_temp.rid('w2'), null, null, pg_temp.rid('x1'), null) $$,
  '22023', 'Take or pick the photo again.', '... nor a file outside Wall photos');
insert into ids select 'S1', (public.rev_photo_add('c0000000-0000-0000-0000-000000000891', pg_temp.rid('w2'), null, null, pg_temp.rid('s1'), null)).id;
insert into ids select 'N1', (public.rev_photo_add('c0000000-0000-0000-0000-000000000891', pg_temp.rid('w2'), null, null, null, 'Not done yet')).id;
select is((public.rev_photo_add('c0000000-0000-0000-0000-000000000891', pg_temp.rid('w2'), null, null, null, 'Not done yet')).id,
  pg_temp.rid('N1'), 'the sub adds a photo and a note to East, the same note again answers its row');

select pg_temp.login('a0000000-0000-0000-0000-000000000897');
select throws_ok($$ select public.rev_photo_add('c0000000-0000-0000-0000-000000000891', pg_temp.rid('w1'), null, null, null, 'probe') $$,
  '42501', 'forbidden', 'the architect can''t add');
select pg_temp.login('a0000000-0000-0000-0000-000000000898');
select throws_ok($$ select public.rev_photo_add('c0000000-0000-0000-0000-000000000891', pg_temp.rid('w1'), null, null, null, 'probe') $$,
  '42501', 'forbidden', 'another job''s inspector can''t');
select pg_temp.login('a0000000-0000-0000-0000-000000000899');
select throws_ok($$ select public.rev_photo_add('c0000000-0000-0000-0000-000000000891', pg_temp.rid('w1'), null, null, null, 'probe') $$,
  '42501', 'forbidden', 'nor a stranger');
select is((select count(*)::int from public.rev_photos), 0, '... who reads none of them');

-- ---------------------------------------------------------------------------------------------------------------
-- Who reads
-- ---------------------------------------------------------------------------------------------------------------
select pg_temp.login('a0000000-0000-0000-0000-000000000894');
select is(pg_temp.seen('w2', null, null), array['note:Not done yet', 's1'], 'the PM reads the sub''s photo and note of East');
select is(pg_temp.seen(null, 'room', null), array['note:Not done yet', 's1', 'p2', 'p1'], 'the room shows its own and its walls'' photos, newest first');
select is(pg_temp.row_of('w1', 'p1'), 'Pat Manager mine=true remove=true locked=false via=false note=Drywall back off',
  'each with who, mine, may remove, the note');
select pg_temp.login('a0000000-0000-0000-0000-000000000897');
select is(pg_temp.seen(null, 'room', null), array['note:Not done yet', 's1', 'p2', 'p1'], 'the architect (inside) reads them');
select pg_temp.login('a0000000-0000-0000-0000-000000000896');
select is(pg_temp.seen(null, 'room', null), '{}'::text[], 'another sub (outside) reads none of them');
select is((select count(*)::int from public.rev_photos), 0, '... nor in the table');
select pg_temp.login('a0000000-0000-0000-0000-000000000895');
select is(pg_temp.seen(null, 'room', null), array['note:Not done yet', 's1'], 'the sub reads his own only');

-- ---------------------------------------------------------------------------------------------------------------
-- On a request
-- ---------------------------------------------------------------------------------------------------------------
insert into ids select 'R', (public.ir_submit_ofs('c0000000-0000-0000-0000-000000000891', 'Sample Co', current_date + 3, true,
  array[pg_temp.rid('w1')], array[pg_temp.rid('i1')], null, '08:00', 'timed', 60, p_special_required => false)).id;
insert into ids select 'RS', (public.rev_photo_add('c0000000-0000-0000-0000-000000000891', pg_temp.rid('w1'), null, pg_temp.rid('R'),
  pg_temp.rid('s2'), 'Ready')).id;
select ok(pg_temp.live('RS'), 'the sub attaches a photo and a note to North on his request');
select throws_ok($$ select public.rev_photo_add('c0000000-0000-0000-0000-000000000891', pg_temp.rid('w2'), null, pg_temp.rid('R'), null, 'probe') $$,
  '22023', 'That wall is not on this request.', 'only a wall on the request');
select is(public.rev_photo_may_add('c0000000-0000-0000-0000-000000000891', pg_temp.rid('R')), true, 'he may add on it');
select pg_temp.login('a0000000-0000-0000-0000-000000000896');
select throws_ok($$ select public.rev_photo_add('c0000000-0000-0000-0000-000000000891', pg_temp.rid('w1'), null, pg_temp.rid('R'), null, 'probe') $$,
  'P0002', 'not_found', 'another sub doesn''t find his request');
select pg_temp.login('a0000000-0000-0000-0000-000000000894');
select throws_ok($$ select public.rev_photo_add('c0000000-0000-0000-0000-000000000891', pg_temp.rid('w1'), null, pg_temp.rid('R'), null, 'probe') $$,
  '42501', 'This request takes no more photos from you.', 'the PM reads the request but neither asked for nor decides it');
select is(pg_temp.seen(null, null, 'R'), array['s2'], 'the PM reads the request''s photo');
select pg_temp.login('a0000000-0000-0000-0000-000000000892');
insert into ids select 'RI', (public.rev_photo_add('c0000000-0000-0000-0000-000000000891', pg_temp.rid('w1'), null, pg_temp.rid('R'),
  pg_temp.rid('n1'), 'Gap at the head')).id;
select is(pg_temp.seen('w1', null, null), array['n1', 's2', 'p1'], 'the inspector adds his; the wall shows the request''s photos too');
select pg_temp.login('a0000000-0000-0000-0000-000000000897');
select is(pg_temp.seen('w1', null, null), array['p1'], 'the architect doesn''t read the request, so not its photos');
select pg_temp.login('a0000000-0000-0000-0000-000000000893');
select is(pg_temp.seen(null, null, 'R'), '{}'::text[], 'the fire marshal reads them once it is with OFS, not before');
reset role;
update public.inspection_requests set ofs_sent_at = now(), ofs_sent_by = 'a0000000-0000-0000-0000-000000000892' where id = pg_temp.rid('R');
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000893');
insert into ids select 'RA', (public.rev_photo_add('c0000000-0000-0000-0000-000000000891', pg_temp.rid('w1'), null, pg_temp.rid('R'),
  null, 'Drywall back off, see again')).id;
select is(pg_temp.seen(null, null, 'R'), array['note:Drywall back off, see again', 'n1', 's2'], 'with OFS he reads them and adds his note');

select pg_temp.login('a0000000-0000-0000-0000-000000000895');
select is(pg_temp.row_of('w1', 'n1'), 'Ivy Inspector ir=' || (select number from public.inspection_requests where id = pg_temp.rid('R'))
  || ' mine=false remove=false locked=false via=true note=Gap at the head',
  'the sub sees the inspector''s photo on his request: it opens through the request');
select is((select original_name from public.authorize_ir_file(pg_temp.rid('R'), pg_temp.rid('n1'))), 'IMG_2001.jpg',
  '... and the request''s gate hands it out');
select throws_ok($$ select public.authorize_ir_file(pg_temp.rid('R'), pg_temp.rid('p1')) $$, '42501', 'forbidden',
  'a wall photo not on the request doesn''t open through it');

-- ---------------------------------------------------------------------------------------------------------------
-- Remove and Undo
-- ---------------------------------------------------------------------------------------------------------------
select throws_ok($$ select public.rev_photo_remove(pg_temp.rid('P1'), 1) $$, 'P0002', 'not_found', 'the sub doesn''t find the PM''s photo');
select pg_temp.login('a0000000-0000-0000-0000-000000000897');
select throws_ok($$ select public.rev_photo_remove(pg_temp.rid('P1'), 1) $$, '42501', 'forbidden', 'the architect reads it but can''t remove it');
select pg_temp.login('a0000000-0000-0000-0000-000000000894');
select throws_ok($$ select public.rev_photo_remove(pg_temp.rid('N1'), 9) $$, '40001', null, 'removing is version-checked');
select is((public.rev_photo_remove(pg_temp.rid('N1'), pg_temp.ver('N1'))).deleted_at is not null, true, 'a manager removes the sub''s note');
select is((public.rev_photo_remove(pg_temp.rid('N1'), 1)).id, pg_temp.rid('N1'), '... again answers it');
select is((public.rev_photo_restore(pg_temp.rid('N1'))).deleted_at, null, 'Undo brings it back');
select is(pg_temp.audits(), 9, 'each add and each change is audited');
select pg_temp.login('a0000000-0000-0000-0000-000000000894');
select throws_ok($$ update public.files set deleted_at = now() where id = pg_temp.rid('p1') $$, '42501',
  'This photo is on a wall. Remove it there.', 'the file of a live photo isn''t deleted on its own');

-- ---------------------------------------------------------------------------------------------------------------
-- A decided request's photos are its record
-- ---------------------------------------------------------------------------------------------------------------
reset role;
update public.inspection_requests set result = 'not_approved', result_at = now(), result_by = 'a0000000-0000-0000-0000-000000000893'
 where id = pg_temp.rid('R');
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000895');
select throws_ok($$ select public.rev_photo_remove(pg_temp.rid('RS'), pg_temp.ver('RS')) $$, '42501',
  'The request is decided: its photos are part of its record.', 'decided: the sub can''t remove his photo');
select throws_ok($$ select public.rev_photo_add('c0000000-0000-0000-0000-000000000891', pg_temp.rid('w1'), null, pg_temp.rid('R'), null, 'late') $$,
  '42501', 'This request takes no more photos from you.', '... nor add to it');
select is(array[public.rev_photo_may_add('c0000000-0000-0000-0000-000000000891', pg_temp.rid('R')),
                public.rev_photo_may_add('c0000000-0000-0000-0000-000000000891', null)], array[false, true],
  'he may add to the walls, not to the decided request');
select is(pg_temp.row_of('w1', 's2'), 'Sam Sub ir=' || (select number from public.inspection_requests where id = pg_temp.rid('R'))
  || ' mine=true remove=false locked=true via=false note=Ready', 'the list says it is locked');
select pg_temp.login('a0000000-0000-0000-0000-000000000892');
select throws_ok($$ select public.rev_photo_remove(pg_temp.rid('RI'), pg_temp.ver('RI')) $$, '42501',
  'The request is decided: its photos are part of its record.', '... nor can a manager');
select ok((public.rev_photo_add('c0000000-0000-0000-0000-000000000891', pg_temp.rid('w1'), null, pg_temp.rid('R'), null, 'Fixed, ask again')).id
  is not null, 'the inspector still adds to it');

-- ---------------------------------------------------------------------------------------------------------------
-- Anonymous
-- ---------------------------------------------------------------------------------------------------------------
reset role;
set local role anon;
select throws_ok($$ select public.rev_photo_add('00000000-0000-0000-0000-000000000000', null, null, null, null, 'x') $$, '42501', null,
  'anon can''t add');
select throws_ok($$ select * from public.rev_photos $$, '42501', null, 'anon can''t read the table');

select * from finish();
rollback;
