begin;
select plan(65);
-- Walls on the plan (migration 0059): the line's shape (checked by the database), drawing a new wall (the name rules,
-- the repeat, placing a wall of that name not on the plan yet, the sheet and page), placing, moving and taking a wall
-- off the plan with a version check, a line going with its sheet (Setup's sheet change), who may (revs.manage only),
-- the plan sheet for the plan view (whoever reads revs, for a sheet a wall is on; a manager for any PDF they may read;
-- the scan rules; a download line), and a new revs request's map starting at the first wall's page.
\ir _helpers.psql

create temp table ids (k text primary key, v uuid);
grant all on ids to public;
create function pg_temp.rid(p_k text) returns uuid language sql stable as $$ select v from ids where k = p_k $$;
-- A wall as seen past RLS: "level|name|page|line" and its version.
create function pg_temp.wall(p_k text) returns text language sql volatile security definer as $$
  select level || '|' || name || '|' || sheet_page || '|' || coalesce(geom::text, '-') from public.rev_areas where id = pg_temp.rid(p_k) $$;
create function pg_temp.ver(p_k text) returns int language sql volatile security definer as $$
  select version from public.rev_areas where id = pg_temp.rid(p_k) $$;
create function pg_temp.draw(p_level text, p_name text, p_geom jsonb, p_page int default 1,
                             p_sheet uuid default 'e0000000-0000-0000-0000-000000000511')
returns public.rev_areas language sql volatile as $$
  select public.rev_area_draw(pg_temp.rid('L'), p_level, p_name, p_sheet, p_page, p_geom) $$;
create function pg_temp.sheet(p_file uuid) returns text language sql volatile as $$
  select original_name from public.authorize_rev_sheet('c0000000-0000-0000-0000-000000000511', p_file) $$;
create function pg_temp.downloads(p_file uuid, p_user uuid) returns int language sql volatile security definer as $$
  select count(*)::int from public.downloads where file_id = p_file and user_id = p_user $$;
grant execute on all functions in schema pg_temp to public;

select pg_temp.mk_user('a0000000-0000-0000-0000-000000000511', 'probe+rg-admin@example.test', 'Ada Admin');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000512', 'probe+rg-insp@example.test', 'Ivy Inspector');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000513', 'probe+rg-sub@example.test', 'Sam Sub');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000514', 'probe+rg-bidder@example.test', 'Bo Bidder');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000515', 'probe+rg-out@example.test', 'Oz Outsider');

insert into public.orgs (id, name, kind, created_by) values
  ('b0000000-0000-0000-0000-000000000511', 'Sample Plan Builders', 'gc', 'a0000000-0000-0000-0000-000000000511');
insert into public.projects (id, org_id, name, stage, timezone, created_by, settings) values
  ('c0000000-0000-0000-0000-000000000511', 'b0000000-0000-0000-0000-000000000511', 'Plan Job', 'construction',
   'America/Los_Angeles', 'a0000000-0000-0000-0000-000000000511', '{"ir_ofs_allowed": true}'),
  ('c0000000-0000-0000-0000-000000000512', 'b0000000-0000-0000-0000-000000000511', 'Other Job', 'construction',
   'America/Los_Angeles', 'a0000000-0000-0000-0000-000000000511', '{"ir_ofs_allowed": true}');
insert into public.project_members (org_id, project_id, user_id, invite_email, role, status)
select 'b0000000-0000-0000-0000-000000000511', p, u, e, r, 'active'
  from (values
    ('c0000000-0000-0000-0000-000000000511'::uuid, 'a0000000-0000-0000-0000-000000000512'::uuid, 'probe+rg-insp@example.test', 'inspector'),
    ('c0000000-0000-0000-0000-000000000511', 'a0000000-0000-0000-0000-000000000513', 'probe+rg-sub@example.test', 'sub'),
    ('c0000000-0000-0000-0000-000000000511', 'a0000000-0000-0000-0000-000000000514', 'probe+rg-bidder@example.test', 'bidder'))
  v(p, u, e, r);

-- Files: the plan set (a PDF), a second PDF, a photo, an infected PDF, one still being scanned (uploaded by the sub),
-- and a PDF of the other job.
insert into public.folders (id, org_id, project_id, name, created_by) values
  ('d0000000-0000-0000-0000-000000000511', 'b0000000-0000-0000-0000-000000000511', 'c0000000-0000-0000-0000-000000000511',
   'Sample Plans', 'a0000000-0000-0000-0000-000000000511'),
  ('d0000000-0000-0000-0000-000000000512', 'b0000000-0000-0000-0000-000000000511', 'c0000000-0000-0000-0000-000000000512',
   'Sample Plans', 'a0000000-0000-0000-0000-000000000511');
insert into public.files (id, org_id, project_id, folder_id, storage_path, original_name, mime, created_by, scan_status, size)
select ('e0000000-0000-0000-0000-00000000051' || n)::uuid, 'b0000000-0000-0000-0000-000000000511', p, f, 'test/plan/' || n, nm, m, u, s, 1000
  from (values
    ('1', 'c0000000-0000-0000-0000-000000000511'::uuid, 'd0000000-0000-0000-0000-000000000511'::uuid, 'Sample Plan Set.pdf',
     'application/pdf', 'a0000000-0000-0000-0000-000000000512'::uuid, 'clean'),
    ('2', 'c0000000-0000-0000-0000-000000000511', 'd0000000-0000-0000-0000-000000000511', 'Sample A-102.pdf', 'application/pdf',
     'a0000000-0000-0000-0000-000000000512', 'clean'),
    ('3', 'c0000000-0000-0000-0000-000000000511', 'd0000000-0000-0000-0000-000000000511', 'Sample photo.png', 'image/png',
     'a0000000-0000-0000-0000-000000000512', 'clean'),
    ('4', 'c0000000-0000-0000-0000-000000000511', 'd0000000-0000-0000-0000-000000000511', 'Sample bad.pdf', 'application/pdf',
     'a0000000-0000-0000-0000-000000000512', 'infected'),
    ('5', 'c0000000-0000-0000-0000-000000000511', 'd0000000-0000-0000-0000-000000000511', 'Sample pending.pdf', 'application/pdf',
     'a0000000-0000-0000-0000-000000000513', 'pending'),
    ('6', 'c0000000-0000-0000-0000-000000000512', 'd0000000-0000-0000-0000-000000000512', 'Sample other job.pdf', 'application/pdf',
     'a0000000-0000-0000-0000-000000000512', 'clean')) v(n, p, f, nm, m, u, s);

-- ---------------------------------------------------------------------------------------------------------------
-- Shape and grants
-- ---------------------------------------------------------------------------------------------------------------
select is((select array[column_default::text, is_nullable::text] from information_schema.columns
            where table_schema = 'public' and table_name = 'rev_areas' and column_name = 'sheet_page'),
  array['1', 'NO'], 'rev_areas.sheet_page: page 1 unless drawn elsewhere');
select is((select is_nullable::text from information_schema.columns
            where table_schema = 'public' and table_name = 'rev_areas' and column_name = 'geom'),
  'YES', 'rev_areas.geom: none = not on the plan');
select ok(public.rev_geom_ok('[[0.1, 0.2], [0.3, 0.2]]') and public.rev_geom_ok('[[0, 0], [1, 1], [0, 1]]')
          and public.rev_geom_ok((select jsonb_agg(jsonb_build_array(n / 50.0, 0.5)) from generate_series(1, 50) n)),
  'line: 2 to 50 points of the page');
select is_empty($$ select g from unnest(array[
    '{}', '[]', '[[0.1, 0.2]]', '[[0.1, 0.2], [0.1, 0.2]]', '[[0.1, 0.2], [1.2, 0.2]]', '[[0.1, 0.2], [-0.1, 0.2]]',
    '[[0.1, 0.2], [0.3]]', '[[0.1, 0.2], ["0.3", 0.2]]', '[[0.1, 0.2], {"x": 0.3}]', '[[0.1, 0.2], [0.3, 0.2, 0]]']::jsonb[]) g
   where public.rev_geom_ok(g) $$, 'line: every bad shape refused (one point, all one point, off the page, not numbers)');
select ok(not public.rev_geom_ok((select jsonb_agg(jsonb_build_array(n / 51.0, 0.5)) from generate_series(1, 51) n)),
  'line: 50 points at most');
select ok(not has_function_privilege('anon', 'public.rev_area_draw(uuid, text, text, uuid, integer, jsonb)', 'EXECUTE')
          and not has_function_privilege('anon', 'public.rev_area_place(uuid, integer, uuid, integer, jsonb)', 'EXECUTE')
          and not has_function_privilege('anon', 'public.authorize_rev_sheet(uuid, uuid)', 'EXECUTE')
          and has_function_privilege('authenticated', 'public.rev_area_draw(uuid, text, text, uuid, integer, jsonb)', 'EXECUTE')
          and has_function_privilege('authenticated', 'public.rev_area_place(uuid, integer, uuid, integer, jsonb)', 'EXECUTE')
          and has_function_privilege('authenticated', 'public.authorize_rev_sheet(uuid, uuid)', 'EXECUTE'),
  'grants: drawing, placing and the plan sheet are for signed-in people, never anon');
select ok(not has_function_privilege('authenticated', 'public.rev_geom_ok(jsonb)', 'EXECUTE')
          and not has_function_privilege('authenticated', 'public.rev_wall_sheet(uuid, uuid)', 'EXECUTE')
          and not has_function_privilege('authenticated', 'public.rev_geom_check(uuid, uuid, integer, jsonb, uuid)', 'EXECUTE')
          and not has_function_privilege('authenticated', 'public.tg_rev_area_geom()', 'EXECUTE'),
  'grants: the helpers and the trigger are internal');
select ok((select prosecdef and proconfig @> array['search_path=public, pg_temp'] from pg_proc
            where oid = 'public.authorize_rev_sheet(uuid, uuid)'::regprocedure)
          and (select prosecdef and proconfig @> array['search_path=public, pg_temp'] from pg_proc
                where oid = 'public.rev_area_place(uuid, integer, uuid, integer, jsonb)'::regprocedure),
  'security definer with a fixed search_path');

-- ---------------------------------------------------------------------------------------------------------------
-- Drawing walls
-- ---------------------------------------------------------------------------------------------------------------
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000512');
insert into ids select 'L', (public.rev_list_create('c0000000-0000-0000-0000-000000000511', 'Sample Rated Walls', 'PH III', null,
  '[{"number": 0, "name": "TOW", "items": [{"name": "TOW - Speed Plugs"}]}]')).id;
insert into ids select 'i_tow', i.id from public.rev_items i join public.revs v on v.id = i.rev_id where v.list_id = pg_temp.rid('L');
select lives_ok($$ insert into ids select 'n', (pg_temp.draw(' Level 02 ', ' Electrical  0242 north (grid 7) ',
  '[[0.2, 0.3], [0.4, 0.3]]', 3)).id $$, 'the inspector draws a wall on page 3 of the plan set and names it');
select is(pg_temp.wall('n'), 'Level 02|Electrical 0242 north (grid 7)|3|[[0.2, 0.3], [0.4, 0.3]]',
  'the wall: level and name tidied, its page and its line');
select is((select array[sheet_file_id::text, position::text, created_by::text] from public.rev_areas where id = pg_temp.rid('n')),
  array['e0000000-0000-0000-0000-000000000511', '1', 'a0000000-0000-0000-0000-000000000512'], 'on the sheet, in place 1, by me');
select is((pg_temp.draw('level 02', 'electrical 0242 north (grid 7)', '[[0.2, 0.3], [0.4, 0.3]]', 3)).id, pg_temp.rid('n'),
  'the same wall drawn again comes back as it is');
select is(pg_temp.ver('n'), 1, '... unchanged');
select throws_ok($$ select pg_temp.draw('Level 02', 'Electrical 0242 north (grid 7)', '[[0.2, 0.5], [0.4, 0.5]]', 3) $$,
  '22023', 'That wall is already on this level.', 'another line with the same name is refused');
select lives_ok($$ insert into ids select 'e', (pg_temp.draw('Level 02', 'Electrical 0242 east (grid D)',
  '[[0.4, 0.3], [0.4, 0.45], [0.38, 0.47]]', 3)).id $$, 'the next wall, piecemeal around the room, with a corner');
select is((select position from public.rev_areas where id = pg_temp.rid('e')), 2, 'in place 2');
select throws_ok($$ select pg_temp.draw('Level 02', '  ', '[[0.2, 0.3], [0.4, 0.3]]') $$, '22023', 'Name the wall.',
  'a wall needs a name');
select throws_ok($$ select pg_temp.draw('', 'X', '[[0.2, 0.3], [0.4, 0.3]]') $$, '22023', 'Name the level.', 'and a level');
select throws_ok($$ select pg_temp.draw('Level 02', 'X', '[[0.2, 0.3]]') $$, '22023',
  'Draw the wall: 2 to 50 points on the sheet.', 'a line of one point is refused');
select throws_ok($$ select pg_temp.draw('Level 02', 'X', null) $$, '22023', 'Draw the wall: 2 to 50 points on the sheet.',
  'no line is refused');
select throws_ok($$ select pg_temp.draw('Level 02', 'X', '[[0.2, 0.3], [0.4, 0.3]]', 1, null) $$, '22023', 'Pick the sheet first.',
  'no sheet is refused');
select throws_ok($$ select pg_temp.draw('Level 02', 'X', '[[0.2, 0.3], [0.4, 0.3]]', 0) $$, '22023', 'Pick a page of the sheet.',
  'page 0 is refused');
select throws_ok($$ select pg_temp.draw('Level 02', 'X', '[[0.2, 0.3], [0.4, 0.3]]', 1, 'e0000000-0000-0000-0000-000000000513') $$,
  '22023', 'Pick a PDF sheet from this job''s files.', 'a photo is not a sheet');
select throws_ok($$ select pg_temp.draw('Level 02', 'X', '[[0.2, 0.3], [0.4, 0.3]]', 1, 'e0000000-0000-0000-0000-000000000516') $$,
  '22023', 'Pick a PDF sheet from this job''s files.', 'nor another job''s PDF');

-- A wall pasted in Setup (not on the plan) is placed by drawing it under its name.
insert into ids select 'p', id from public.rev_areas_add(pg_temp.rid('L'), 'Level 01', array['Corridor 110 north wall'], null);
select is((pg_temp.draw('Level 01', 'corridor 110 north wall', '[[0.1, 0.5], [0.6, 0.5]]', 1,
  'e0000000-0000-0000-0000-000000000512')).id, pg_temp.rid('p'), 'drawing a wall of that name places it');
select is((select array[sheet_file_id::text, geom::text] from public.rev_areas where id = pg_temp.rid('p')),
  array['e0000000-0000-0000-0000-000000000512', '[[0.1, 0.5], [0.6, 0.5]]'], '... on that sheet, with that line');

-- Only managers draw.
select pg_temp.login('a0000000-0000-0000-0000-000000000513');
select throws_ok($$ select pg_temp.draw('Level 02', 'Sub wall', '[[0.2, 0.3], [0.4, 0.3]]') $$, '42501', null,
  'a sub (revs.read) can''t draw');
select pg_temp.login('a0000000-0000-0000-0000-000000000514');
select throws_ok($$ select pg_temp.draw('Level 02', 'Bidder wall', '[[0.2, 0.3], [0.4, 0.3]]') $$, 'P0002', null,
  'a bidder doesn''t even see the list');
select pg_temp.login('a0000000-0000-0000-0000-000000000515');
select throws_ok($$ select pg_temp.draw('Level 02', 'Out wall', '[[0.2, 0.3], [0.4, 0.3]]') $$, 'P0002', null, 'nor a stranger');
select pg_temp.login('a0000000-0000-0000-0000-000000000513');
select is((select geom::text from public.rev_areas where id = pg_temp.rid('n')), '[[0.2, 0.3], [0.4, 0.3]]',
  'a sub reads the line (revs.read)');

-- ---------------------------------------------------------------------------------------------------------------
-- Placing, moving, taking off
-- ---------------------------------------------------------------------------------------------------------------
select pg_temp.login('a0000000-0000-0000-0000-000000000512');
select is((public.rev_area_place(pg_temp.rid('n'), 1, 'e0000000-0000-0000-0000-000000000511', 3, '[[0.2, 0.31], [0.41, 0.31]]')).version,
  2, 'redrawn: a new version');
select is(pg_temp.wall('n'), 'Level 02|Electrical 0242 north (grid 7)|3|[[0.2, 0.31], [0.41, 0.31]]', 'the new line');
select throws_ok($$ select public.rev_area_place(pg_temp.rid('n'), 1, 'e0000000-0000-0000-0000-000000000511', 3,
  '[[0.2, 0.32], [0.41, 0.32]]') $$, '40001', null, 'an old version is refused');
select is((public.rev_area_place(pg_temp.rid('n'), 1, 'e0000000-0000-0000-0000-000000000511', 3, '[[0.2, 0.31], [0.41, 0.31]]')).version,
  2, 'the same place again comes back as it is');
select is((public.rev_area_place(pg_temp.rid('n'), 2, 'e0000000-0000-0000-0000-000000000511', 3, null)).geom, null::jsonb,
  'a null line takes it off the plan');
select is((select array[sheet_file_id::text, sheet_page::text] from public.rev_areas where id = pg_temp.rid('n')),
  array['e0000000-0000-0000-0000-000000000511', '3'], '... its sheet and page stay for its maps');
select is((public.rev_area_place(pg_temp.rid('n'), 3, 'e0000000-0000-0000-0000-000000000511', 3, '[[0.2, 0.31], [0.41, 0.31]]')).version,
  4, 'Undo puts the line back');
select is(pg_temp.wall('n'), 'Level 02|Electrical 0242 north (grid 7)|3|[[0.2, 0.31], [0.41, 0.31]]', '... as it was');
select is((public.rev_area_place(pg_temp.rid('n'), 4, 'e0000000-0000-0000-0000-000000000512', 1, '[[0.2, 0.31], [0.41, 0.31]]')).sheet_page,
  1, 'moved to another sheet with the same line: the line and the page asked for stand');
select is(pg_temp.wall('n'), 'Level 02|Electrical 0242 north (grid 7)|1|[[0.2, 0.31], [0.41, 0.31]]', '... still on the plan');
select throws_ok($$ select public.rev_area_place(pg_temp.rid('n'), pg_temp.ver('n'), 'e0000000-0000-0000-0000-000000000513', 1,
  '[[0.2, 0.31], [0.41, 0.31]]') $$, '22023', 'Pick a PDF sheet from this job''s files.', 'placing on a photo is refused');
select throws_ok($$ select public.rev_area_place(pg_temp.rid('n'), pg_temp.ver('n'), 'e0000000-0000-0000-0000-000000000511', 2,
  '[[0.2, 0.31]]') $$, '22023', 'Draw the wall: 2 to 50 points on the sheet.', 'a bad line is refused');
select pg_temp.login('a0000000-0000-0000-0000-000000000513');
select throws_ok($$ select public.rev_area_place(pg_temp.rid('n'), pg_temp.ver('n'), 'e0000000-0000-0000-0000-000000000511', 1, null) $$,
  '42501', null, 'a sub can''t place a wall');

-- A line goes with its sheet: Setup moving the wall to another sheet takes it off the plan; a rename keeps it.
select pg_temp.login('a0000000-0000-0000-0000-000000000512');
select lives_ok($$ select public.rev_area_save(pg_temp.rid('e'), 1, 'Level 02', 'Electrical 0242 east wall (grid D)',
  'e0000000-0000-0000-0000-000000000511', null) $$, 'Setup renames a wall');
select is(pg_temp.wall('e'), 'Level 02|Electrical 0242 east wall (grid D)|3|[[0.4, 0.3], [0.4, 0.45], [0.38, 0.47]]',
  '... its line and page stay');
select lives_ok($$ select public.rev_area_save(pg_temp.rid('e'), 2, 'Level 02', 'Electrical 0242 east wall (grid D)',
  'e0000000-0000-0000-0000-000000000512', null) $$, 'Setup gives it another sheet');
select is(pg_temp.wall('e'), 'Level 02|Electrical 0242 east wall (grid D)|1|-', '... off the plan, back to page 1');
select lives_ok($$ select public.rev_area_save(pg_temp.rid('p'), pg_temp.ver('p'), 'Level 01', 'Corridor 110 north wall', null, null) $$,
  'Setup clears a placed wall''s sheet');
select is(pg_temp.wall('p'), 'Level 01|Corridor 110 north wall|1|-', '... off the plan too');
reset role;
select throws_ok($$ update public.rev_areas set sheet_file_id = null, geom = '[[0.1, 0.1], [0.2, 0.2]]' where id = pg_temp.rid('p') $$,
  '23514', null, 'a line is always on a sheet (constraint)');
set local role authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- The plan sheet
-- ---------------------------------------------------------------------------------------------------------------
-- The north wall back on the plan set; no wall is on the second PDF any more.
select pg_temp.login('a0000000-0000-0000-0000-000000000512');
select lives_ok($$ select public.rev_area_place(pg_temp.rid('n'), pg_temp.ver('n'), 'e0000000-0000-0000-0000-000000000511', 3,
  '[[0.2, 0.31], [0.41, 0.31]]') $$, 'the north wall goes back on page 3 of the plan set');
reset role;
update public.rev_areas set sheet_file_id = null where id = pg_temp.rid('e');
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000513');
select is(pg_temp.sheet('e0000000-0000-0000-0000-000000000511'), 'Sample Plan Set.pdf', 'a sub opens a sheet a wall is on');
select is(pg_temp.downloads('e0000000-0000-0000-0000-000000000511', 'a0000000-0000-0000-0000-000000000513'), 1,
  '... logged as a download');
select throws_ok($$ select pg_temp.sheet('e0000000-0000-0000-0000-000000000512') $$, '42501', 'forbidden',
  'not a sheet no wall is on');
select pg_temp.login('a0000000-0000-0000-0000-000000000512');
select is(pg_temp.sheet('e0000000-0000-0000-0000-000000000512'), 'Sample A-102.pdf', 'a manager opens any PDF he may read (a new level''s)');
select throws_ok($$ select pg_temp.sheet('e0000000-0000-0000-0000-000000000513') $$, '42501', 'forbidden', 'a photo is no sheet');
select throws_ok($$ select pg_temp.sheet('e0000000-0000-0000-0000-000000000516') $$, '42501', 'forbidden', 'nor another job''s PDF');
select throws_ok($$ select pg_temp.sheet('e0000000-0000-0000-0000-000000000514') $$, '42501', 'forbidden', 'nor an infected one');
reset role;
update public.rev_areas set sheet_file_id = 'e0000000-0000-0000-0000-000000000515' where id = pg_temp.rid('p');
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000512');
select throws_ok($$ select pg_temp.sheet('e0000000-0000-0000-0000-000000000515') $$, '42501', 'scan_pending',
  'one still being scanned waits for the scan');
select pg_temp.login('a0000000-0000-0000-0000-000000000513');
select is(pg_temp.sheet('e0000000-0000-0000-0000-000000000515'), 'Sample pending.pdf', '... except for its uploader');
select pg_temp.login('a0000000-0000-0000-0000-000000000514');
select throws_ok($$ select pg_temp.sheet('e0000000-0000-0000-0000-000000000511') $$, 'P0002', null, 'a bidder gets nothing');
select pg_temp.login('a0000000-0000-0000-0000-000000000515');
select throws_ok($$ select pg_temp.sheet('e0000000-0000-0000-0000-000000000511') $$, 'P0002', null, 'nor a stranger');

-- ---------------------------------------------------------------------------------------------------------------
-- A new revs request's map starts at the first wall's page
-- ---------------------------------------------------------------------------------------------------------------
select pg_temp.login('a0000000-0000-0000-0000-000000000512');
select lives_ok($$ select public.rev_area_place(pg_temp.rid('e'), pg_temp.ver('e'), 'e0000000-0000-0000-0000-000000000511', 7,
  '[[0.4, 0.3], [0.4, 0.45]]') $$, 'the east wall is drawn on page 7 of the plan set');
select pg_temp.login('a0000000-0000-0000-0000-000000000513');
insert into ids select 'q', (public.ir_submit_ofs('c0000000-0000-0000-0000-000000000511', 'Sample Firestop Co',
  ((now() at time zone 'America/Los_Angeles')::date + 3), true, array[pg_temp.rid('e'), pg_temp.rid('n')], array[pg_temp.rid('i_tow')],
  null, '08:00', 'timed', 60, p_readiness => '{"previous":"yes","trade":"yes","gc":"yes","ior":"yes","special":"na"}')).id;
select is((select array[sheet_file_id::text, page::text] from public.ir_maps where request_id = pg_temp.rid('q')),
  array['e0000000-0000-0000-0000-000000000511', '3'], 'a request''s map starts on the first wall''s sheet at its page');
insert into ids select 'q2', (public.ir_submit_ofs('c0000000-0000-0000-0000-000000000511', 'Sample Other Co',
  ((now() at time zone 'America/Los_Angeles')::date + 4), true, array[pg_temp.rid('e')], array[pg_temp.rid('i_tow')],
  null, '09:00', 'timed', 60, p_readiness => '{"previous":"yes","trade":"yes","gc":"yes","ior":"yes","special":"na"}')).id;
select is((select array[sheet_file_id::text, page::text] from public.ir_maps where request_id = pg_temp.rid('q2')),
  array['e0000000-0000-0000-0000-000000000511', '7'], '... one on the east wall starts on page 7');

select * from finish();
rollback;
