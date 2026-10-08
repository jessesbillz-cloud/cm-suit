begin;
select plan(65);
-- Migration 0094 (Jesse, Oct 7: Files must not become "a black hole of just dumping documents in"). Room pictures and
-- the OFS IRs from before the app are added from Revs into the app's own folders (Room pictures, Reports / OFS history:
-- made on first use, names the server's, a lock in Files, only revs.manage adds) and linked at once, one file at a time,
-- by 0083's rules: a picture to the rooms whose image name it carries, an IR to the sign-offs whose number it carries. A
-- room's picture is added or replaced on its own page (Undo puts the old one back). Walls find their plan sheet by
-- the number in the file name: the newest live, finished, clean PDF in Plans, never a wall already on another live
-- sheet, and a plan finishing in Plans links the walls waiting for it. Who may, each again changes nothing, near misses.
\ir _helpers.psql

create temp table ids (k text primary key, v uuid);
grant all on ids to public;
create function pg_temp.rid(p_k text) returns uuid language sql stable as $$ select v from ids where k = p_k $$;
create function pg_temp.sheet(p_wall text) returns uuid language sql volatile security definer as $$
  select sheet_file_id from public.rev_areas where id = pg_temp.rid(p_wall) $$;
create function pg_temp.room(p_number text) returns public.rev_rooms language sql volatile security definer as $$
  select * from public.rev_rooms where list_id = pg_temp.rid('L') and number = p_number and deleted_at is null $$;
create function pg_temp.signoff_files() returns text language sql volatile security definer as $$
  select string_agg(k.k || '=' || coalesce(f.k, '-'), ',' order by k.k)
    from public.rev_signoffs s join ids k on k.v = s.area_id left join ids f on f.v = s.file_id
   where s.deleted_at is null $$;
create function pg_temp.versions() returns int language sql volatile security definer as $$
  select (select coalesce(sum(version), 0) from public.rev_rooms) + (select coalesce(sum(version), 0) from public.rev_signoffs)
         + (select coalesce(sum(version), 0) from public.rev_areas)::int $$;
create function pg_temp.folder(p_id uuid) returns public.folders language sql volatile security definer as $$
  select * from public.folders where id = p_id $$;
create function pg_temp.access(p_id uuid) returns text[] language sql volatile security definer as $$
  select array_agg(capability || ':' || can_read || ':' || can_write order by capability) from public.folder_access where folder_id = p_id $$;
create function pg_temp.add_file(p_k text, p_folder uuid, p_name text, p_mime text, p_by uuid, p_scan text, p_age int)
returns void language plpgsql volatile security definer as $$
begin
  insert into public.files (org_id, project_id, folder_id, storage_path, original_name, mime, created_by, scan_status,
                            upload_complete, created_at)
  select fo.org_id, fo.project_id, p_folder, 'test/revfiles/' || p_k, p_name, p_mime, p_by, p_scan, true,
         now() - make_interval(hours => p_age)
    from public.folders fo where fo.id = p_folder
  returning id into strict p_folder;
  insert into ids values (p_k, p_folder);
end $$;
grant execute on all functions in schema pg_temp to public;

select pg_temp.mk_user('a0000000-0000-0000-0000-000000000941', 'probe+rf-admin@example.test', 'Ada Admin');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000942', 'probe+rf-insp@example.test', 'Ivy Inspector');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000943', 'probe+rf-pm@example.test', 'Pat Manager');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000944', 'probe+rf-other@example.test', 'Otto Other');

insert into public.orgs (id, name, kind, created_by) values
  ('b0000000-0000-0000-0000-000000000941', 'Sample File Builders', 'gc', 'a0000000-0000-0000-0000-000000000941');
insert into public.projects (id, org_id, name, stage, timezone, created_by, settings) values
  ('c0000000-0000-0000-0000-000000000941', 'b0000000-0000-0000-0000-000000000941', 'Sample File Job', 'construction',
   'America/Los_Angeles', 'a0000000-0000-0000-0000-000000000941', '{"ir_ofs_allowed": true}'),
  ('c0000000-0000-0000-0000-000000000942', 'b0000000-0000-0000-0000-000000000941', 'Sample Other File Job', 'construction',
   'America/Los_Angeles', 'a0000000-0000-0000-0000-000000000941', '{"ir_ofs_allowed": true}');
insert into public.project_members (org_id, project_id, user_id, invite_email, role, status)
select 'b0000000-0000-0000-0000-000000000941', p::uuid, u::uuid, e, r, 'active'
  from (values ('c0000000-0000-0000-0000-000000000941', 'a0000000-0000-0000-0000-000000000942', 'probe+rf-insp@example.test', 'inspector'),
               ('c0000000-0000-0000-0000-000000000941', 'a0000000-0000-0000-0000-000000000943', 'probe+rf-pm@example.test', 'pm'),
               ('c0000000-0000-0000-0000-000000000942', 'a0000000-0000-0000-0000-000000000944', 'probe+rf-other@example.test', 'inspector'))
       v(p, u, e, r);

insert into ids select 'plans', id from public.folders
 where project_id = 'c0000000-0000-0000-0000-000000000941' and kind = 'plans' and parent_id is null;
insert into ids select 'plans2', id from public.folders
 where project_id = 'c0000000-0000-0000-0000-000000000942' and kind = 'plans' and parent_id is null;
insert into public.folders (id, org_id, project_id, parent_id, name, created_by) values
  ('d0000000-0000-0000-0000-000000000941', 'b0000000-0000-0000-0000-000000000941', 'c0000000-0000-0000-0000-000000000941',
   pg_temp.rid('plans'), 'Sample Architectural', 'a0000000-0000-0000-0000-000000000941'),
  ('d0000000-0000-0000-0000-000000000942', 'b0000000-0000-0000-0000-000000000941', 'c0000000-0000-0000-0000-000000000941',
   null, 'Sample Loose', 'a0000000-0000-0000-0000-000000000941');
insert into ids values ('arch', 'd0000000-0000-0000-0000-000000000941'), ('loose', 'd0000000-0000-0000-0000-000000000942');

-- The sheets (hours old in the last argument). A201A twice (the newer wins), a near miss each way, one still being
-- scanned, one in a folder under Plans, one outside Plans, an infected and a replaced one (both newest, both skipped).
select pg_temp.add_file('p1', pg_temp.rid('plans'), 'A201A Floor Plan Level 01 Area A.pdf', 'application/pdf', 'a0000000-0000-0000-0000-000000000942', 'clean', 50);
select pg_temp.add_file('p2', pg_temp.rid('plans'), 'a201a_Floor Plan rev 2.pdf', 'application/pdf', 'a0000000-0000-0000-0000-000000000942', 'clean', 40);
select pg_temp.add_file('p3', pg_temp.rid('plans'), 'A201AB Enlarged.pdf', 'application/pdf', 'a0000000-0000-0000-0000-000000000942', 'clean', 1);
select pg_temp.add_file('p4', pg_temp.rid('plans'), 'A201-Key Plan.pdf', 'application/pdf', 'a0000000-0000-0000-0000-000000000942', 'clean', 30);
select pg_temp.add_file('p5', pg_temp.rid('plans'), 'A202B.pdf', 'application/pdf', 'a0000000-0000-0000-0000-000000000942', 'pending', 30);
select pg_temp.add_file('p6', pg_temp.rid('arch'), 'A202A Floor Plan Level 02 Area A.pdf', 'application/pdf', 'a0000000-0000-0000-0000-000000000942', 'too_large_to_scan', 30);
select pg_temp.add_file('p7', pg_temp.rid('loose'), 'A201A Floor Plan Level 01 Area A.pdf', 'application/pdf', 'a0000000-0000-0000-0000-000000000942', 'clean', 1);
select pg_temp.add_file('p8', pg_temp.rid('plans'), 'A201A infected.pdf', 'application/pdf', 'a0000000-0000-0000-0000-000000000942', 'infected', 1);
select pg_temp.add_file('p9', pg_temp.rid('plans'), 'A201A replaced.pdf', 'application/pdf', 'a0000000-0000-0000-0000-000000000942', 'clean', 1);
update public.files set superseded_by = pg_temp.rid('p1') where id = pg_temp.rid('p9');
select pg_temp.add_file('p10', pg_temp.rid('plans'), 'A203A Floor Plan.pdf', 'application/pdf', 'a0000000-0000-0000-0000-000000000942', 'clean', 30);
select pg_temp.add_file('p11', pg_temp.rid('plans'), 'Sample Other Sheet.pdf', 'application/pdf', 'a0000000-0000-0000-0000-000000000942', 'clean', 60);
select pg_temp.add_file('p12', pg_temp.rid('plans'), 'A203B Gone.pdf', 'application/pdf', 'a0000000-0000-0000-0000-000000000942', 'clean', 60);
select pg_temp.add_file('p13', pg_temp.rid('plans'), 'A203B.Floor Plan.pdf', 'application/pdf', 'a0000000-0000-0000-0000-000000000942', 'clean', 30);
select pg_temp.add_file('q1', pg_temp.rid('plans2'), 'A201A Other Job.pdf', 'application/pdf', 'a0000000-0000-0000-0000-000000000944', 'clean', 1);

-- The inspector's list (TOW, two items) with its walls on Level 01, and a picture and an IR from the other job.
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000942');
insert into ids select 'L', (public.rev_list_create('c0000000-0000-0000-0000-000000000941', 'Sample Rated Walls', null, null,
  '[{"number": 0, "name": "TOW", "items": [{"name": "TOW One"}, {"name": "TOW Two"}]}]')).id;
insert into ids select case i.name when 'TOW One' then 'i1' else 'i2' end, i.id
  from public.rev_items i join public.revs v on v.id = i.rev_id where v.list_id = pg_temp.rid('L');
insert into ids select 'w' || a.name, a.id
  from public.rev_areas_add(pg_temp.rid('L'), 'Level 01', array['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'], null) a;
reset role;
-- Sheet numbers (wall G has none), wall E on another live sheet, wall F on a sheet that was removed since.
update public.rev_areas set sheet_ref = r from (values ('wA', 'A201A'), ('wB', ' a201a '), ('wC', 'A201'), ('wD', 'A202B'),
  ('wE', 'A203A'), ('wF', 'A203B'), ('wH', 'A202A')) v(k, r) where id = pg_temp.rid(v.k);
-- (A sheet in use can't be removed, 0080: the old one went before the wall pointed at it, as after a restore.)
update public.files set deleted_at = now() where id = pg_temp.rid('p12');
update public.rev_areas set sheet_file_id = pg_temp.rid('p11') where id = pg_temp.rid('wE');
update public.rev_areas set sheet_file_id = pg_temp.rid('p12') where id = pg_temp.rid('wF');

-- ---------------------------------------------------------------------------------------------------------------
-- The app's folders
-- ---------------------------------------------------------------------------------------------------------------
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000943');
select throws_ok($$ select public.rev_files_folder('c0000000-0000-0000-0000-000000000941', 'pictures') $$, '42501', 'forbidden',
  'a reader (the PM) gets no folder to add to');
select pg_temp.login('a0000000-0000-0000-0000-000000000944');
select throws_ok($$ select public.rev_files_folder('c0000000-0000-0000-0000-000000000941', 'pictures') $$, '42501', 'forbidden',
  '... nor another job''s manager');
select pg_temp.login('a0000000-0000-0000-0000-000000000942');
select throws_ok($$ select public.rev_files_folder('c0000000-0000-0000-0000-000000000941', 'photos') $$, '22023',
  'The folder is pictures or history.', 'only the two folders');
insert into ids select 'pics', public.rev_files_folder('c0000000-0000-0000-0000-000000000941', 'pictures');
insert into ids select 'hist', public.rev_files_folder('c0000000-0000-0000-0000-000000000941', 'history');
select is(public.rev_files_folder('c0000000-0000-0000-0000-000000000941', 'pictures'), pg_temp.rid('pics'), 'the same folder again');
select is(array[(pg_temp.folder(pg_temp.rid('pics'))).name, (pg_temp.folder(pg_temp.rid('pics'))).kind,
                coalesce((pg_temp.folder(pg_temp.rid('pics'))).parent_id::text, 'top')],
  array['Room pictures', 'general', 'top'], 'Room pictures is at the top of the job');
select is(array[(pg_temp.folder(pg_temp.rid('hist'))).name, (pg_temp.folder(pg_temp.rid('hist'))).kind,
                (pg_temp.folder((pg_temp.folder(pg_temp.rid('hist'))).parent_id)).name],
  array['OFS history', 'reports', 'Reports'], 'OFS history is under Reports');
select is(pg_temp.access(pg_temp.rid('pics')),
  array['files.manage:true:false', 'revs.manage:true:true'], 'its own access list: revs.manage adds, files.manage reads');
select is(array[public.folder_can_write(pg_temp.rid('pics')), public.folder_can_write(pg_temp.rid('hist'))], array[true, true],
  'the manager may add to both');
select pg_temp.login('a0000000-0000-0000-0000-000000000943');
select is(array[public.folder_can_read(pg_temp.rid('pics')), public.folder_can_write(pg_temp.rid('pics')),
                public.folder_can_read(pg_temp.rid('hist')), public.folder_can_write(pg_temp.rid('hist'))],
  array[true, false, true, false], 'files.manage reads them and adds nothing');
select is((select array_agg(m.app_only::text || ':' || m.file_count order by f.name) from public.folder_marks('c0000000-0000-0000-0000-000000000941') m
            join public.folders f on f.id = m.folder_id where f.id in (pg_temp.rid('pics'), pg_temp.rid('hist'))),
  array['true:0', 'true:0'], 'both are the app''s folders, counted, so Files hides them while empty');
select is((select m.app_only from public.folder_marks('c0000000-0000-0000-0000-000000000941') m where m.folder_id = pg_temp.rid('loose')),
  false, 'a folder people made stays theirs');
select throws_ok($$ insert into public.folders (org_id, project_id, name, created_by) values ('b0000000-0000-0000-0000-000000000941',
  'c0000000-0000-0000-0000-000000000941', 'Room pictures', 'a0000000-0000-0000-0000-000000000943') $$, '23505',
  'That name is used by the system. Pick another.', 'nobody makes a folder named Room pictures');
select throws_ok(format($$ insert into public.folders (org_id, project_id, parent_id, name, created_by) values ('b0000000-0000-0000-0000-000000000941',
  'c0000000-0000-0000-0000-000000000941', %L, 'OFS history', 'a0000000-0000-0000-0000-000000000943') $$,
  (pg_temp.folder(pg_temp.rid('hist'))).parent_id), '23505', 'That name is used by the system. Pick another.',
  '... nor OFS history under Reports');
select is(public.folder_name_reserved('c0000000-0000-0000-0000-000000000941', null, 'Requirements')
          and public.folder_name_reserved('c0000000-0000-0000-0000-000000000941', (pg_temp.folder(pg_temp.rid('hist'))).parent_id, 'Corrections'),
  true, 'the earlier names stay reserved');
reset role;
set local role anon;
select throws_ok($$ select public.rev_files_folder('c0000000-0000-0000-0000-000000000941', 'pictures') $$, '42501', null, 'anon can''t call it');
reset role;

-- ---------------------------------------------------------------------------------------------------------------
-- A picture or an IR added: linked at once
-- ---------------------------------------------------------------------------------------------------------------
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000942');
select lives_ok($$ select public.rev_rooms_load(pg_temp.rid('L'), jsonb_build_array(
  jsonb_build_object('level', 'Level 01', 'number', '0242', 'name', 'Electrical', 'image_name', '0242 Electrical.png'),
  jsonb_build_object('level', 'Level 01', 'number', '0244', 'name', 'IDF', 'image_name', '0244 IDF.png'))) $$, 'two rooms, no pictures yet');
select lives_ok($$ select public.rev_signoff_set(pg_temp.rid('wA'), array[pg_temp.rid('i1')], 41, '2026-09-21', null) $$, 'wall A signed off as OFS 0041');
select lives_ok($$ select public.rev_signoff_set(pg_temp.rid('wB'), array[pg_temp.rid('i1')], 41, '2026-09-21', null) $$, '... wall B too');
select lives_ok($$ select public.rev_signoff_set(pg_temp.rid('wC'), array[pg_temp.rid('i2')], 52, '2026-09-28', null) $$, '... wall C as 0052');
reset role;
select pg_temp.add_file('r1', pg_temp.rid('pics'), '0242 electrical.PNG', 'image/png', 'a0000000-0000-0000-0000-000000000942', 'pending', 0);
select pg_temp.add_file('r2', pg_temp.rid('pics'), '0244 IDF.png', 'image/png', 'a0000000-0000-0000-0000-000000000942', 'clean', 5);
select pg_temp.add_file('r3', pg_temp.rid('pics'), '0244 IDF.png', 'image/png', 'a0000000-0000-0000-0000-000000000942', 'clean', 1);
select pg_temp.add_file('r4', pg_temp.rid('pics'), 'Sample Stray.png', 'image/png', 'a0000000-0000-0000-0000-000000000942', 'clean', 1);
select pg_temp.add_file('h1', pg_temp.rid('hist'), 'OFS_IR_0041_Attachment.pdf', 'application/pdf', 'a0000000-0000-0000-0000-000000000942', 'clean', 1);
select pg_temp.add_file('h2', pg_temp.rid('hist'), 'OFS_IR_00411.pdf', 'application/pdf', 'a0000000-0000-0000-0000-000000000942', 'clean', 0);
select pg_temp.add_file('h3', pg_temp.rid('hist'), 'Sample_OFS_0052_map.pdf', 'application/pdf', 'a0000000-0000-0000-0000-000000000942', 'clean', 1);
select pg_temp.add_file('h4', pg_temp.rid('hist'), 'OFS_IR_0041.pdf', 'application/pdf', 'a0000000-0000-0000-0000-000000000942', 'clean', 0);
select pg_temp.add_file('h5', pg_temp.rid('hist'), 'OFS_IR_0052.pdf', 'application/pdf', 'a0000000-0000-0000-0000-000000000942', 'infected', 0);
select pg_temp.add_file('x1', pg_temp.rid('plans2'), '0242 Electrical.png', 'image/png', 'a0000000-0000-0000-0000-000000000944', 'clean', 0);

set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000943');
select throws_ok($$ select public.rev_file_link(pg_temp.rid('r1')) $$, '42501', 'forbidden', 'a reader (the PM) links nothing');
select pg_temp.login('a0000000-0000-0000-0000-000000000944');
select throws_ok($$ select public.rev_file_link(pg_temp.rid('r1')) $$, 'P0002', 'not_found', 'another job''s manager doesn''t find the file');
select pg_temp.login('a0000000-0000-0000-0000-000000000942');
select throws_ok($$ select public.rev_file_link(pg_temp.rid('x1')) $$, 'P0002', 'not_found', '... nor this manager the other job''s');
select is(public.rev_file_link(pg_temp.rid('r1')), '{"rooms": 1, "signoffs": 0}'::jsonb,
  'a picture (still being scanned) goes to the room of its name, case aside');
select is((pg_temp.room('0242')).image_file_id, pg_temp.rid('r1'), '... the room shows it');
select is(public.rev_file_link(pg_temp.rid('r2')), '{"rooms": 0, "signoffs": 0}'::jsonb, 'an older picture of a name is not the room''s');
select is(public.rev_file_link(pg_temp.rid('r3')), '{"rooms": 1, "signoffs": 0}'::jsonb, '... the newest is');
select is(public.rev_file_link(pg_temp.rid('r4')), '{"rooms": 0, "signoffs": 0}'::jsonb, 'a picture no room names: not matched');
select is(public.rev_file_link(pg_temp.rid('h1')), '{"rooms": 0, "signoffs": 0}'::jsonb,
  'OFS_IR_0041_Attachment is not 0041''s file while a newer OFS_IR_0041 name exists')
;
select is(public.rev_file_link(pg_temp.rid('h4')), '{"rooms": 0, "signoffs": 2}'::jsonb,
  'the newest name starting OFS_IR goes to both 0041 sign-offs');
select is(public.rev_file_link(pg_temp.rid('h2')), '{"rooms": 0, "signoffs": 0}'::jsonb, 'OFS_IR_00411 is not 0041');
select is(public.rev_file_link(pg_temp.rid('h3')), '{"rooms": 0, "signoffs": 1}'::jsonb, '_OFS_0052_ goes to 0052');
select is(public.rev_file_link(pg_temp.rid('h5')), '{"rooms": 0, "signoffs": 0}'::jsonb, 'an infected file links nothing');
select is(pg_temp.signoff_files(), 'wA=h4,wB=h4,wC=h3', 'each sign-off shows its IR');
create temp table v0 as select pg_temp.versions() as v;
grant all on v0 to public;
select is(array[public.rev_file_link(pg_temp.rid('h4')), public.rev_file_link(pg_temp.rid('r1'))],
  array['{"rooms": 0, "signoffs": 2}', '{"rooms": 1, "signoffs": 0}']::jsonb[], 'linking the same files again answers the same');
select is(pg_temp.versions(), (select v from v0), '... and changes nothing');
select is(public.rev_signoffs_link_files('c0000000-0000-0000-0000-000000000941'), '{"linked": 0, "missing": []}'::jsonb,
  'Link files agrees with what was linked one by one');
select is((public.rev_rooms_link_images(pg_temp.rid('L')) -> 'linked'), '0'::jsonb, '... for the rooms too');
reset role;
set local role anon;
select throws_ok($$ select public.rev_file_link('00000000-0000-0000-0000-000000000000') $$, '42501', null, 'anon can''t call it');
reset role;

-- ---------------------------------------------------------------------------------------------------------------
-- A room's picture from its page
-- ---------------------------------------------------------------------------------------------------------------
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000943');
select throws_ok($$ select public.rev_room_image_set((pg_temp.room('0244')).id, null, pg_temp.rid('r4'), null) $$, '42501', 'forbidden',
  'a reader can''t change a room''s picture');
select pg_temp.login('a0000000-0000-0000-0000-000000000942');
select throws_ok($$ select public.rev_room_image_set((pg_temp.room('0244')).id, null, pg_temp.rid('h3'), null) $$, '22023',
  'Pick a picture of this job.', 'a PDF is not a picture');
select throws_ok($$ select public.rev_room_image_set((pg_temp.room('0244')).id, null, pg_temp.rid('x1'), null) $$, '22023',
  'Pick a picture of this job.', '... nor another job''s picture');
select throws_ok($$ select public.rev_room_image_set((pg_temp.room('0244')).id, 1, pg_temp.rid('r4'), null) $$, '40001', null,
  'a stale version is refused');
select is((select array[image_file_id::text, image_name] from public.rev_room_image_set((pg_temp.room('0244')).id, (pg_temp.room('0244')).version,
  pg_temp.rid('r4'), 'ignored')), array[pg_temp.rid('r4')::text, 'Sample Stray.png'], 'a manager replaces the picture, the name follows the file');
select is((public.rev_rooms_link_images(pg_temp.rid('L')) -> 'linked'), '0'::jsonb, 'Link files keeps the new picture');
select is((select version from public.rev_room_image_set((pg_temp.room('0244')).id, null, pg_temp.rid('r4'), null)),
  (pg_temp.room('0244')).version, 'the same picture again changes nothing');
select is((select array[image_file_id::text, image_name] from public.rev_room_image_set((pg_temp.room('0244')).id, null, pg_temp.rid('r3'), null)),
  array[pg_temp.rid('r3')::text, '0244 IDF.png'], 'Undo puts the old picture back');
select is((select array[coalesce(image_file_id::text, 'none'), image_name] from public.rev_room_image_set((pg_temp.room('0242')).id, null, null, ' 0242 Electrical.png '))
  , array['none', '0242 Electrical.png'], 'Undo of a first picture takes it off and puts the old name back');
reset role;
set local role anon;
select throws_ok($$ select public.rev_room_image_set('00000000-0000-0000-0000-000000000000', null, null, null) $$, '42501', null, 'anon can''t call it');
reset role;

-- ---------------------------------------------------------------------------------------------------------------
-- Walls find their sheet by number
-- ---------------------------------------------------------------------------------------------------------------
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000943');
select throws_ok($$ select public.rev_walls_link_sheets('c0000000-0000-0000-0000-000000000941') $$, '42501', 'forbidden',
  'a reader links no sheets');
select pg_temp.login('a0000000-0000-0000-0000-000000000944');
select throws_ok($$ select public.rev_walls_link_sheets('c0000000-0000-0000-0000-000000000941') $$, '42501', 'forbidden',
  '... nor another job''s manager');
select pg_temp.login('a0000000-0000-0000-0000-000000000942');
select is(public.rev_walls_link_sheets('c0000000-0000-0000-0000-000000000941'), '{"linked": 5, "missing": ["A202B"]}'::jsonb,
  'five walls linked, A202B still being scanned');
select is(array[pg_temp.sheet('wA'), pg_temp.sheet('wB')], array[pg_temp.rid('p2'), pg_temp.rid('p2')],
  'A201A: the newest in Plans, case and spaces aside (never A201AB, an infected, a replaced or one outside Plans)');
select is(pg_temp.sheet('wC'), pg_temp.rid('p4'), 'A201 gets "A201-Key Plan", never an A201A sheet');
select is(pg_temp.sheet('wH'), pg_temp.rid('p6'), 'a sheet in a folder under Plans counts (its scan done)');
select is(pg_temp.sheet('wE'), pg_temp.rid('p11'), 'a wall on another live sheet is left alone');
select is(pg_temp.sheet('wF'), pg_temp.rid('p13'), 'a wall whose sheet was removed gets its number''s sheet');
select is(array[pg_temp.sheet('wD'), pg_temp.sheet('wG')], array[null, null]::uuid[], 'no sheet yet for D, none for a wall without a number');
create temp table v1 as select pg_temp.versions() as v;
grant all on v1 to public;
select is(public.rev_walls_link_sheets('c0000000-0000-0000-0000-000000000941'), '{"linked": 0, "missing": ["A202B"]}'::jsonb,
  'again: nothing new');
select is(pg_temp.versions(), (select v from v1), '... nothing changed');
reset role;

-- A plan finishing in Plans links the walls waiting for it, and nothing else.
update public.files set scan_status = 'clean' where id = pg_temp.rid('p5');
select is(pg_temp.sheet('wD'), pg_temp.rid('p5'), 'A202B''s scan finished: wall D has it');
insert into public.files (org_id, project_id, folder_id, storage_path, original_name, mime, created_by, upload_complete)
select fo.org_id, fo.project_id, fo.id, 'test/revfiles/p14', 'A201A Floor Plan rev 3.pdf', 'application/pdf',
       'a0000000-0000-0000-0000-000000000942', false
  from public.folders fo where fo.id = pg_temp.rid('plans');
insert into ids select 'p14', id from public.files where storage_path = 'test/revfiles/p14';
update public.files set upload_complete = true, scan_status = 'clean' where id = pg_temp.rid('p14');
select is(pg_temp.sheet('wA'), pg_temp.rid('p2'), 'a newer A201A leaves walls already on a live sheet alone');
select pg_temp.add_file('p15', pg_temp.rid('loose'), 'A209A.pdf', 'application/pdf', 'a0000000-0000-0000-0000-000000000942', 'pending', 0);
update public.rev_areas set sheet_ref = 'A209A' where id = pg_temp.rid('wG');
update public.files set scan_status = 'clean' where id = pg_temp.rid('p15');
select is(pg_temp.sheet('wG'), null::uuid, 'a PDF finishing outside Plans links nothing');

set local role anon;
select throws_ok($$ select public.rev_walls_link_sheets('c0000000-0000-0000-0000-000000000941') $$, '42501', null, 'anon can''t call it');
reset role;
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000942');
select throws_ok($$ select public.rev_walls_sheets_fill('c0000000-0000-0000-0000-000000000941', null, false) $$, '42501', null,
  'the inner step is not callable');
select throws_ok($$ select public.rev_sheet_file_of('c0000000-0000-0000-0000-000000000941', 'A201A', false) $$, '42501', null,
  '... nor the sheet finder');
reset role;

select * from finish();
rollback;
