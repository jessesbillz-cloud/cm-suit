begin;
select plan(151);
-- Revs (migration 0056): the matrix and the module as data, the setup RPCs (a list from pasted JSON, revs, items, walls,
-- N/A marks, remove and restore), who reads what (RLS: revs.read, removed rows for revs.manage only; anon nothing), the
-- status precedence (na > passed > requested > failed > open), the revs request (1 to 3 items, walls from one list,
-- passed and N/A cells skipped, colors by item order, the OFS IR number, the map row, the repeat, the board line and the
-- calendar), the map (stroke shapes, colors, versions, who draws, refused once signed, the service-only attach), the
-- results per cell, and a request's files (its map and its sheet; the fixed null check).
\ir _helpers.psql

create temp table ids (k text primary key, v uuid);
grant all on ids to public;
create temp table js (k text primary key, v jsonb);
grant all on js to public;
create function pg_temp.rid(p_k text) returns uuid language sql stable as $$ select v from ids where k = p_k $$;
create function pg_temp.j(p_k text) returns jsonb language sql stable as $$ select v from js where k = p_k $$;
-- A row's version (ir_maps by its request), read past RLS.
create function pg_temp.ver(p_table text, p_k text) returns int language plpgsql volatile security definer as $$
declare v int;
begin
  execute format('select version from public.%I where %I = $1', p_table, case when p_table = 'ir_maps' then 'request_id' else 'id' end)
     into v using pg_temp.rid(p_k);
  return v;
end $$;
-- A cell's status as the logged-in person sees it.
create function pg_temp.st(p_area text, p_item text) returns text language sql volatile as $$
  select s.status || coalesce(':' || s.ir_number, '') || coalesce('/' || s.ofs_number, '') || coalesce(' ' || s.note, '')
    from public.rev_status('c0000000-0000-0000-0000-000000000491') s
   where s.area_id = pg_temp.rid(p_area) and s.item_id = pg_temp.rid(p_item) $$;
-- What a person sees of the rev tables on the main job (logs them in).
create function pg_temp.seen(p_uid uuid) returns int language plpgsql as $$
begin
  perform pg_temp.login(p_uid);
  return (select count(*) from public.rev_lists) + (select count(*) from public.revs) + (select count(*) from public.rev_items)
       + (select count(*) from public.rev_areas) + (select count(*) from public.rev_marks);
end $$;
-- The OFS request of the main job, as the logged-in person (wall and item keys).
create function pg_temp.ofs(p_areas text[], p_items text[], p_sheet uuid default null)
returns public.inspection_requests language sql volatile as $$
  select public.ir_submit_ofs('c0000000-0000-0000-0000-000000000491', 'Sample Firestop Co',
    ((now() at time zone 'America/Los_Angeles')::date + 3), true,
    array(select pg_temp.rid(a) from unnest(p_areas) a), array(select pg_temp.rid(i) from unnest(p_items) i), p_sheet,
    '08:00', 'timed', 60, p_special_required => false) $$;
-- The route to OFS (0061): the GC approves, the inspector sends it. Leaves the inspector logged in.
create function pg_temp.to_ofs(p_k text) returns void language plpgsql as $$
begin
  perform pg_temp.login('a0000000-0000-0000-0000-000000000497');
  perform public.ir_gc_decide(pg_temp.rid(p_k), pg_temp.ver('inspection_requests', p_k), true);
  perform pg_temp.login('a0000000-0000-0000-0000-000000000492');
  perform public.ir_send_ofs(pg_temp.rid(p_k), pg_temp.ver('inspection_requests', p_k));
end $$;
grant execute on all functions in schema pg_temp to public;

select pg_temp.mk_user('a0000000-0000-0000-0000-000000000491', 'probe+rv-admin@example.test', 'Ada Admin');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000492', 'probe+rv-insp@example.test', 'Ivy Inspector');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000493', 'probe+rv-ahj@example.test', 'Dana Deputy');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000494', 'probe+rv-sub@example.test', 'Sam Sub');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000495', 'probe+rv-req@example.test', 'Rae Requester');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000496', 'probe+rv-bidder@example.test', 'Bo Bidder');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000497', 'probe+rv-pm@example.test', 'Pat Manager');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000498', 'probe+rv-out@example.test', 'Oz Outsider');

insert into public.orgs (id, name, kind, created_by) values
  ('b0000000-0000-0000-0000-000000000491', 'Sample Revs Builders', 'gc', 'a0000000-0000-0000-0000-000000000491');
-- J1: an OFS job being built (Revs on). J3: being built, no OFS (Revs off until OFS goes on). J4: no OFS (stays off).
insert into public.projects (id, org_id, name, stage, timezone, created_by, settings) values
  ('c0000000-0000-0000-0000-000000000491', 'b0000000-0000-0000-0000-000000000491', 'Revs Job 1', 'construction',
   'America/Los_Angeles', 'a0000000-0000-0000-0000-000000000491', '{"ir_ofs_allowed": true}'),
  ('c0000000-0000-0000-0000-000000000493', 'b0000000-0000-0000-0000-000000000491', 'Revs Job 3', 'construction',
   'America/Los_Angeles', 'a0000000-0000-0000-0000-000000000491', '{}'),
  ('c0000000-0000-0000-0000-000000000494', 'b0000000-0000-0000-0000-000000000491', 'Revs Job 4', 'construction',
   'America/Los_Angeles', 'a0000000-0000-0000-0000-000000000491', '{}');
insert into public.project_members (org_id, project_id, user_id, invite_email, role, status)
select 'b0000000-0000-0000-0000-000000000491', p, u, e, r, 'active'
  from (values
    ('c0000000-0000-0000-0000-000000000491'::uuid, 'a0000000-0000-0000-0000-000000000492'::uuid, 'probe+rv-insp@example.test', 'inspector'),
    ('c0000000-0000-0000-0000-000000000491', 'a0000000-0000-0000-0000-000000000493', 'probe+rv-ahj@example.test', 'ahj'),
    ('c0000000-0000-0000-0000-000000000491', 'a0000000-0000-0000-0000-000000000494', 'probe+rv-sub@example.test', 'sub'),
    ('c0000000-0000-0000-0000-000000000491', 'a0000000-0000-0000-0000-000000000495', 'probe+rv-req@example.test', 'requester'),
    ('c0000000-0000-0000-0000-000000000491', 'a0000000-0000-0000-0000-000000000496', 'probe+rv-bidder@example.test', 'bidder'),
    ('c0000000-0000-0000-0000-000000000491', 'a0000000-0000-0000-0000-000000000497', 'probe+rv-pm@example.test', 'pm'),
    ('c0000000-0000-0000-0000-000000000494', 'a0000000-0000-0000-0000-000000000492', 'probe+rv-insp@example.test', 'inspector')) v(p, u, e, r);

-- Files: a plan sheet (PDF) and a photo on J1, a PDF on J3, the server-made map; request-folder uploads by the sub and
-- the requester.
insert into public.folders (id, org_id, project_id, name, created_by) values
  ('d0000000-0000-0000-0000-000000000491', 'b0000000-0000-0000-0000-000000000491', 'c0000000-0000-0000-0000-000000000491',
   'Sample Plans', 'a0000000-0000-0000-0000-000000000491'),
  ('d0000000-0000-0000-0000-000000000493', 'b0000000-0000-0000-0000-000000000491', 'c0000000-0000-0000-0000-000000000493',
   'Sample Plans', 'a0000000-0000-0000-0000-000000000491');
insert into ids values ('attach', public.ir_folder_make('c0000000-0000-0000-0000-000000000491', 'attachments'));
insert into public.files (id, org_id, project_id, folder_id, storage_path, original_name, mime, created_by, scan_status) values
  ('e0000000-0000-0000-0000-000000000491', 'b0000000-0000-0000-0000-000000000491', 'c0000000-0000-0000-0000-000000000491',
   'd0000000-0000-0000-0000-000000000491', 'test/revs/sheet.pdf', 'Sample A-201.pdf', 'application/pdf',
   'a0000000-0000-0000-0000-000000000492', 'clean'),
  ('e0000000-0000-0000-0000-000000000492', 'b0000000-0000-0000-0000-000000000491', 'c0000000-0000-0000-0000-000000000491',
   'd0000000-0000-0000-0000-000000000491', 'test/revs/photo.png', 'Sample photo.png', 'image/png',
   'a0000000-0000-0000-0000-000000000492', 'clean'),
  ('e0000000-0000-0000-0000-000000000493', 'b0000000-0000-0000-0000-000000000491', 'c0000000-0000-0000-0000-000000000493',
   'd0000000-0000-0000-0000-000000000493', 'test/revs/other.pdf', 'Sample other.pdf', 'application/pdf',
   'a0000000-0000-0000-0000-000000000492', 'clean'),
  ('e0000000-0000-0000-0000-000000000494', 'b0000000-0000-0000-0000-000000000491', 'c0000000-0000-0000-0000-000000000491',
   'd0000000-0000-0000-0000-000000000491', 'test/revs/map.pdf', 'Sample map.pdf', 'application/pdf',
   'a0000000-0000-0000-0000-000000000492', 'clean'),
  ('e0000000-0000-0000-0000-000000000495', 'b0000000-0000-0000-0000-000000000491', 'c0000000-0000-0000-0000-000000000491',
   pg_temp.rid('attach'), 'test/revs/sub.jpg', 'Sample sub.jpg', 'image/jpeg', 'a0000000-0000-0000-0000-000000000494', 'clean'),
  ('e0000000-0000-0000-0000-000000000496', 'b0000000-0000-0000-0000-000000000491', 'c0000000-0000-0000-0000-000000000491',
   pg_temp.rid('attach'), 'test/revs/req.jpg', 'Sample req.jpg', 'image/jpeg', 'a0000000-0000-0000-0000-000000000495', 'pending');
insert into public.permits (id, org_id, project_id, created_by, primary_number, title) values
  ('e0000000-0000-0000-0000-0000000004a1', 'b0000000-0000-0000-0000-000000000491', 'c0000000-0000-0000-0000-000000000491',
   'a0000000-0000-0000-0000-000000000491', '26-0491', 'Sample building permit'),
  ('e0000000-0000-0000-0000-0000000004a3', 'b0000000-0000-0000-0000-000000000491', 'c0000000-0000-0000-0000-000000000493',
   'a0000000-0000-0000-0000-000000000491', '26-0493', 'Another job''s permit');

insert into js values
  ('legend', '[
     {"number": 0, "name": "TOW", "items": [{"name": "TOW - Speed Plugs", "company": "Sample Firestop Co"}]},
     {"number": 1, "name": "HOW - Cavity", "items": [{"name": "HOW Cavity Stuff", "company": "Sample Firestop Co"},
        {"name": " HOW  Cavity Spray ", "company": " "}, {"name": "HOW Beam Pockets", "company": null}]},
     {"number": 3, "name": "Drywall", "items": [{"name": "First Side - First Layer", "company": "Sample Drywall Co"},
        {"name": "Second Side - First Layer"}]}]'),
  ('other', '[{"number": 0, "name": "Other", "items": [{"name": "Other Item"}]}]'),
  ('dup', '[{"number": 1, "name": "A", "items": []}, {"number": 1, "name": "B"}]'),
  ('noname', '[{"number": 2, "items": []}]'),
  ('ok2', '[{"c": 1, "w": 0.01, "p": [[0.1, 0.1], [0.2, 0.2]]}, {"c": 2, "w": 0.02, "p": [[0.5, 0.5], [0.6, 0.5], [0.7, 0.5]]}]'),
  ('c3', '[{"c": 3, "w": 0.01, "p": [[0.1, 0.1], [0.2, 0.2]]}]'),
  ('c1', '[{"c": 1, "w": 0.01, "p": [[0.3, 0.3], [0.4, 0.4]]}]');

-- ---------------------------------------------------------------------------------------------------------------
-- Shape, the matrix, the module
-- ---------------------------------------------------------------------------------------------------------------
select ok((select bool_and(relrowsecurity) from pg_class
            where oid in ('public.rev_lists'::regclass, 'public.revs'::regclass, 'public.rev_items'::regclass,
                          'public.rev_areas'::regclass, 'public.rev_marks'::regclass, 'public.ir_rev_items'::regclass,
                          'public.ir_maps'::regclass)), 'RLS is on all seven tables');
select ok(not exists (select 1 from unnest(array['rev_lists', 'revs', 'rev_items', 'rev_areas', 'rev_marks', 'ir_rev_items', 'ir_maps']) t
                       where has_table_privilege('anon', 'public.' || t, 'SELECT')
                          or has_table_privilege('authenticated', 'public.' || t, 'INSERT')
                          or has_table_privilege('authenticated', 'public.' || t, 'UPDATE')
                          or has_table_privilege('authenticated', 'public.' || t, 'DELETE')
                          or has_table_privilege('service_role', 'public.' || t, 'DELETE')
                          or not has_table_privilege('authenticated', 'public.' || t, 'SELECT')),
  'anon reads nothing; signed in: read only, writes go through the RPCs; nobody deletes');
select is((select array_agg(role order by role) from public.role_permissions where capability = 'revs.manage'),
  '{ahj,inspector,inspector_admin}'::text[], 'matrix: revs.manage is provisional for the official and the inspectors');
select set_eq($$ select role from public.role_permissions where capability = 'revs.read' $$,
  $$ select name from public.roles where not public.role_is_walled(name) $$, 'matrix: revs.read for every role but the walled');
select ok(not exists (select 1 from public.role_permissions where role = 'bidder' and capability like 'revs.%'),
  'matrix: bidders get nothing (the bidder wall)');
select is((select recommended_tools from public.roles where name = 'inspector'),
  '{board,calendar,dailies,inspections,revs,corrections,files,hours}'::text[], 'rail: Revs right after Inspections');
select ok('revs' = any (public.job_rail_tools()), 'Revs is a job tool on the rail');
select ok((select 'revs' = any (modules) from public.projects where id = 'c0000000-0000-0000-0000-000000000491')
          and (select not 'revs' = any (modules) from public.projects where id = 'c0000000-0000-0000-0000-000000000493'),
  'module: on for an OFS job being built, off for a job without OFS');
update public.projects set settings = '{"ir_ofs_allowed": true}' where id = 'c0000000-0000-0000-0000-000000000493';
select ok((select 'revs' = any (modules) from public.projects where id = 'c0000000-0000-0000-0000-000000000493'),
  'module: switching OFS on for a job being built turns Revs on');
select is_empty($$ select f from unnest(array[
    'public.rev_status(uuid)', 'public.rev_list_create(uuid, text, text, uuid, jsonb)',
    'public.rev_list_save(uuid, integer, text, text, uuid)', 'public.rev_save(uuid, uuid, integer, integer, text)',
    'public.rev_item_save(uuid, uuid, integer, text, text, integer)', 'public.rev_areas_add(uuid, text, text[], uuid)',
    'public.rev_area_save(uuid, integer, text, text, uuid, integer)', 'public.rev_remove(text, uuid, integer)',
    'public.rev_restore(text, uuid, integer)', 'public.rev_mark_na(uuid, uuid, boolean)',
    'public.ir_submit_ofs(uuid, text, date, boolean, uuid[], uuid[], uuid, time without time zone, text, integer, uuid[], boolean, boolean)',
    'public.ir_map_context(uuid)', 'public.ir_map_save(uuid, integer, jsonb, uuid, integer)',
    'public.ir_rev_results(uuid, integer, jsonb)']) f
   where has_function_privilege('anon', f, 'EXECUTE') or not has_function_privilege('authenticated', f, 'EXECUTE') $$,
  'grants: every user-facing revs function is for signed-in people, never anon');
select ok(not has_function_privilege('authenticated', 'public.ir_map_attach(uuid, uuid, text, boolean)', 'EXECUTE')
          and has_function_privilege('service_role', 'public.ir_map_attach(uuid, uuid, text, boolean)', 'EXECUTE')
          and not has_function_privilege('authenticated', 'public.ir_ofs_cells(uuid, uuid[], uuid[])', 'EXECUTE')
          and not has_function_privilege('authenticated', 'public.rev_list_lock(uuid, integer)', 'EXECUTE'),
  'grants: the map record is the service role''s; the helpers are internal');
select ok(has_function_privilege('service_role', 'public.ir_folder_make(uuid, text)', 'EXECUTE')
          and not has_function_privilege('authenticated', 'public.ir_folder_make(uuid, text)', 'EXECUTE'),
  'grants: ir-map may make the reports folder with the service key; people still can''t');

-- Strokes: the shape, checked by the database.
select ok(public.ir_map_strokes_ok(pg_temp.j('ok2')) and public.ir_map_strokes_ok('[]'), 'strokes: a good map, and an empty one');
select ok(public.ir_map_strokes_ok((select jsonb_agg(pg_temp.j('c1') -> 0) from generate_series(1, 300)))
          and not public.ir_map_strokes_ok((select jsonb_agg(pg_temp.j('c1') -> 0) from generate_series(1, 301))),
  'strokes: 300 at most');
select ok(public.ir_map_strokes_ok(jsonb_build_array(jsonb_build_object('c', 1, 'w', 0.002,
            'p', (select jsonb_agg(jsonb_build_array(0, 1)) from generate_series(1, 2000)))))
          and not public.ir_map_strokes_ok(jsonb_build_array(jsonb_build_object('c', 1, 'w', 0.05,
            'p', (select jsonb_agg(jsonb_build_array(0, 1)) from generate_series(1, 2001))))),
  'strokes: 2 to 2000 points each');
select is_empty($$ select s from unnest(array[
    '{}', '[1]', '[{"c": 4, "w": 0.01, "p": [[0, 0], [1, 1]]}]', '[{"c": "1", "w": 0.01, "p": [[0, 0], [1, 1]]}]',
    '[{"c": 1, "w": 0.1, "p": [[0, 0], [1, 1]]}]', '[{"c": 1, "w": 0.001, "p": [[0, 0], [1, 1]]}]',
    '[{"c": 1, "w": 0.01, "p": [[0, 0]]}]', '[{"c": 1, "w": 0.01, "p": [[0, 0], [1.2, 0.5]]}]',
    '[{"c": 1, "w": 0.01, "p": [[0, 0], [-0.1, 0.5]]}]', '[{"c": 1, "w": 0.01, "p": [[0, 0], [0.5]]}]',
    '[{"c": 1, "w": 0.01, "p": [[0, 0], ["0.5", 0.5]]}]', '[{"c": 1, "w": 0.01, "p": [[0, 0], [0.5, 0.5]], "x": 1}]',
    '[{"c": 1, "p": [[0, 0], [0.5, 0.5]]}]', '[{"c": 1, "w": 0.01, "p": {"a": 1}}]']::jsonb[]) s
   where public.ir_map_strokes_ok(s) $$, 'strokes: every bad shape refused (colors, widths, points, extra keys)');

-- ---------------------------------------------------------------------------------------------------------------
-- Setup: a list from the pasted legend
-- ---------------------------------------------------------------------------------------------------------------
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000492');
select lives_ok($$ insert into ids select 'L', (public.rev_list_create('c0000000-0000-0000-0000-000000000491',
  ' Sample  Rated Walls ', 'PH III', null, pg_temp.j('legend'))).id $$, 'the inspector makes a list from the legend');
select is((select array[name, phase, position::text] from public.rev_lists where id = pg_temp.rid('L')),
  array['Sample Rated Walls', 'PH III', '1'], 'the list: name tidied, phase, first place');
select is((select array_agg(v.number || ' ' || v.name order by v.number) from public.revs v where v.list_id = pg_temp.rid('L')),
  array['0 TOW', '1 HOW - Cavity', '3 Drywall'], 'its revs');
select is((select array_agg(i.name || '|' || coalesce(i.company, '-') || '|' || i.position order by v.number, i.position)
             from public.rev_items i join public.revs v on v.id = i.rev_id where v.list_id = pg_temp.rid('L')),
  array['TOW - Speed Plugs|Sample Firestop Co|1', 'HOW Cavity Stuff|Sample Firestop Co|1', 'HOW Cavity Spray|-|2',
        'HOW Beam Pockets|-|3', 'First Side - First Layer|Sample Drywall Co|1', 'Second Side - First Layer|-|2'],
  'its items in order, names tidied, a blank company is none');
select is((public.rev_list_create('c0000000-0000-0000-0000-000000000491', 'sample rated walls', 'PH III', null, pg_temp.j('legend'))).id,
  pg_temp.rid('L'), 'the same list again within 10 minutes is the same list');
select throws_ok($$ select public.rev_list_create('c0000000-0000-0000-0000-000000000491', 'X', null, null, pg_temp.j('dup')) $$,
  '22023', 'Each rev number once.', 'a legend with a number twice is refused');
select throws_ok($$ select public.rev_list_create('c0000000-0000-0000-0000-000000000491', 'X', null, null, pg_temp.j('noname')) $$,
  '22023', 'Name the rev.', 'a rev needs a name');
select throws_ok($$ select public.rev_list_create('c0000000-0000-0000-0000-000000000494', 'X', null, null, '[]') $$,
  '22023', 'Revs are off for this job.', 'not on a job with Revs off');
insert into ids select k, i.id from (values ('i_tow', 'TOW - Speed Plugs'), ('i_stuff', 'HOW Cavity Stuff'),
  ('i_spray', 'HOW Cavity Spray'), ('i_beam', 'HOW Beam Pockets'), ('i_dw1', 'First Side - First Layer')) v(k, n)
  join public.rev_items i on i.name = v.n;
insert into ids select 'r' || number, id from public.revs where list_id = pg_temp.rid('L');

select pg_temp.login('a0000000-0000-0000-0000-000000000493');
select throws_ok($$ select public.rev_list_create('c0000000-0000-0000-0000-000000000491', 'Sample Rated Walls', null, null, '[]') $$,
  '22023', 'That list is already on this job.', 'someone else''s list of that name is refused');
select lives_ok($$ insert into ids select 'L2', (public.rev_list_create('c0000000-0000-0000-0000-000000000491',
  'Sample Other Walls', null, 'e0000000-0000-0000-0000-0000000004a1', pg_temp.j('other'))).id $$,
  'the official makes a second list, on the job''s permit');
insert into ids select 'i_other', i.id from public.rev_items i where i.name = 'Other Item';

select pg_temp.login('a0000000-0000-0000-0000-000000000497');
select throws_ok($$ select public.rev_list_create('c0000000-0000-0000-0000-000000000491', 'PM', null, null, '[]') $$,
  '42501', null, 'a PM can''t make one');
select pg_temp.login('a0000000-0000-0000-0000-000000000494');
select throws_ok($$ select public.rev_list_create('c0000000-0000-0000-0000-000000000491', 'Sub', null, null, '[]') $$,
  '42501', null, 'a sub can''t either');
select pg_temp.login('a0000000-0000-0000-0000-000000000498');
select throws_ok($$ select public.rev_list_create('c0000000-0000-0000-0000-000000000491', 'Out', null, null, '[]') $$,
  '42501', null, 'nor a stranger');

-- Revs, items, list fields
select pg_temp.login('a0000000-0000-0000-0000-000000000492');
select lives_ok($$ insert into ids select 'r2', (public.rev_save(pg_temp.rid('L'), null, null, 2, 'CJ')).id $$, 'a new rev');
select is((public.rev_save(pg_temp.rid('L'), null, null, 2, 'cj')).id, pg_temp.rid('r2'), 'the same rev again is the same rev');
select throws_ok($$ select public.rev_save(pg_temp.rid('L'), null, null, 1, 'Something else') $$,
  '22023', 'Rev 1 is already on this list.', 'one rev per number on a list');
select throws_ok($$ select public.rev_save(pg_temp.rid('L'), pg_temp.rid('r2'), 99, 2, 'CJ - Control joints') $$,
  '40001', null, 'a stale version is refused');
select is((public.rev_save(pg_temp.rid('L'), pg_temp.rid('r2'), pg_temp.ver('revs', 'r2'), 2, 'CJ - Control joints')).name,
  'CJ - Control joints', 'renamed with its version');
select lives_ok($$ insert into ids select 'i_cj', (public.rev_item_save(pg_temp.rid('r2'), null, null, 'CJ Stuffing',
  'Sample Firestop Co', null)).id $$, 'a new item');
select is((select position from public.rev_items where id = pg_temp.rid('i_cj')), 1, 'at the end of its rev');
select is((public.rev_item_save(pg_temp.rid('r2'), pg_temp.rid('i_cj'), pg_temp.ver('rev_items', 'i_cj'), 'CJ Stuffing', '', 5)).company,
  null, 'edited: no company, a new place');
select is((public.rev_list_save(pg_temp.rid('L'), pg_temp.ver('rev_lists', 'L'), 'Sample Rated Walls', 'PH III',
  'e0000000-0000-0000-0000-0000000004a1')).permit_id, 'e0000000-0000-0000-0000-0000000004a1'::uuid, 'the list names its permit');
select throws_ok($$ select public.rev_list_save(pg_temp.rid('L'), pg_temp.ver('rev_lists', 'L'), 'Sample Rated Walls', 'PH III',
  'e0000000-0000-0000-0000-0000000004a3') $$, '22023', 'Pick a permit of this job.', 'never another job''s permit');
select throws_ok($$ select public.rev_list_save(pg_temp.rid('L'), pg_temp.ver('rev_lists', 'L'), 'Sample Other Walls', null, null) $$,
  '22023', 'That list is already on this job.', 'list names are once per job');

-- Walls
select lives_ok($$ insert into ids select case a.name when 'Shaftwall at Stair 2 (C-D / 3-4)' then 'w_shaft' else 'w_corr' end, a.id
  from public.rev_areas_add(pg_temp.rid('L'), 'Level 01', array['Shaftwall at Stair 2 (C-D / 3-4)', 'Corridor 110 north wall',
       ' shaftwall at stair 2 (c-d / 3-4) '], 'e0000000-0000-0000-0000-000000000491') a $$,
  'walls on Level 01, each once, on the plan sheet');
select lives_ok($$ insert into ids select case a.name when 'Elevator 1 shaft (B / 2-3)' then 'w_elev' when 'Corridor 210 north wall' then 'w_c210'
  else 'w_e205' end, a.id
  from public.rev_areas_add(pg_temp.rid('L'), 'Level 02', array['Elevator 1 shaft (B / 2-3)', 'Corridor 210 north wall',
       'Electrical 205 east wall'], null) a $$, 'walls on Level 02, no sheet yet');
select is((select array_agg(level || '|' || name || '|' || position || '|' || coalesce(sheet_file_id::text, '-') order by position)
             from public.rev_areas where list_id = pg_temp.rid('L')),
  array['Level 01|Shaftwall at Stair 2 (C-D / 3-4)|1|e0000000-0000-0000-0000-000000000491',
        'Level 01|Corridor 110 north wall|2|e0000000-0000-0000-0000-000000000491',
        'Level 02|Elevator 1 shaft (B / 2-3)|3|-', 'Level 02|Corridor 210 north wall|4|-', 'Level 02|Electrical 205 east wall|5|-'],
  'five walls, in order');
select is((select count(*)::int from public.rev_areas_add(pg_temp.rid('L'), 'level 01', array['Corridor 110 north wall'], null) a
            where a.id = pg_temp.rid('w_corr')), 1, 'adding a wall that is there returns it');
select throws_ok($$ select public.rev_areas_add(pg_temp.rid('L'), 'Level 03', array['X'], 'e0000000-0000-0000-0000-000000000492') $$,
  '22023', 'Pick a PDF sheet from this job''s files.', 'a sheet is a PDF');
select throws_ok($$ select public.rev_areas_add(pg_temp.rid('L'), 'Level 03', array['X'], 'e0000000-0000-0000-0000-000000000493') $$,
  '22023', 'Pick a PDF sheet from this job''s files.', 'of this job');
select throws_ok($$ select public.rev_area_save(pg_temp.rid('w_c210'), pg_temp.ver('rev_areas', 'w_c210'), 'Level 02',
  'Elevator 1 shaft (B / 2-3)', null, null) $$, '22023', 'That wall is already on this level.', 'one wall per name on a level');
select is((public.rev_area_save(pg_temp.rid('w_c210'), pg_temp.ver('rev_areas', 'w_c210'), 'Level 02', 'Corridor 210 north wall',
  'e0000000-0000-0000-0000-000000000491', null)).sheet_file_id, 'e0000000-0000-0000-0000-000000000491'::uuid, 'a wall gets its sheet');
select lives_ok($$ insert into ids select 'w_other', a.id from public.rev_areas_add(pg_temp.rid('L2'), 'Level 01', array['Other wall'], null) a $$,
  'a wall on the second list');

-- N/A marks
select lives_ok($$ insert into ids select 'na', (public.rev_mark_na(pg_temp.rid('w_corr'), pg_temp.rid('i_tow'), true)).id $$,
  'a wall that needs no TOW item: N/A');
select is((public.rev_mark_na(pg_temp.rid('w_corr'), pg_temp.rid('i_tow'), true)).id, pg_temp.rid('na'), 'N/A again: the same mark');
select ok((public.rev_mark_na(pg_temp.rid('w_corr'), pg_temp.rid('i_tow'), false)).deleted_at is not null, 'N/A off');
select is((select array[(m).id::text, coalesce((m).deleted_at::text, 'live')]
             from (select public.rev_mark_na(pg_temp.rid('w_corr'), pg_temp.rid('i_tow'), true) as m) x),
  array[pg_temp.rid('na')::text, 'live'], 'N/A on again: the same mark, back');
select throws_ok($$ select public.rev_mark_na(pg_temp.rid('w_corr'), pg_temp.rid('i_other'), true) $$,
  '22023', 'Pick an item of this wall''s list.', 'only an item of the wall''s list');
select pg_temp.login('a0000000-0000-0000-0000-000000000494');
select throws_ok($$ select public.rev_mark_na(pg_temp.rid('w_shaft'), pg_temp.rid('i_tow'), true) $$, '42501', null,
  'a sub can''t mark N/A');

-- ---------------------------------------------------------------------------------------------------------------
-- Who reads what
-- ---------------------------------------------------------------------------------------------------------------
select is(pg_temp.seen('a0000000-0000-0000-0000-000000000494'), 2 + 5 + 8 + 6 + 1, 'a sub reads the lists, revs, items, walls, marks');
select is(pg_temp.seen('a0000000-0000-0000-0000-000000000495'), 2 + 5 + 8 + 6 + 1, 'so does a requester (to pick walls)');
select is(pg_temp.seen('a0000000-0000-0000-0000-000000000496'), 0, 'a bidder reads nothing');
select is(pg_temp.seen('a0000000-0000-0000-0000-000000000498'), 0, 'a stranger reads nothing');
select ok(pg_temp.cap_as('a0000000-0000-0000-0000-000000000494', 'c0000000-0000-0000-0000-000000000491', 'revs.read')
          and not pg_temp.cap_as('a0000000-0000-0000-0000-000000000494', 'c0000000-0000-0000-0000-000000000491', 'revs.manage')
          and pg_temp.cap_as('a0000000-0000-0000-0000-000000000495', 'c0000000-0000-0000-0000-000000000491', 'revs.read')
          and pg_temp.cap_as('a0000000-0000-0000-0000-000000000493', 'c0000000-0000-0000-0000-000000000491', 'revs.manage'),
  'a sub and a requester read revs; the official manages them');
select throws_ok($$ insert into public.rev_lists (org_id, project_id, created_by, name)
  values ('b0000000-0000-0000-0000-000000000491', 'c0000000-0000-0000-0000-000000000491', auth.uid(), 'Direct') $$,
  '42501', null, 'nobody writes the tables directly');
reset role;
select throws_ok($$ update public.rev_items set rev_id = pg_temp.rid('r0') where id = pg_temp.rid('i_cj') $$, '42501',
  'A rev record stays where it was made.', 'an item stays under its rev, even for the system');
set local role anon;
select throws_ok($$ select count(*) from public.rev_lists $$, '42501', null, 'anon: no access at all');
reset role;
set local role authenticated;

-- Remove and restore (Undo)
select pg_temp.login('a0000000-0000-0000-0000-000000000492');
select ok((public.rev_remove('rev', pg_temp.rid('r3'), pg_temp.ver('revs', 'r3')) ->> 'deleted_at') is not null, 'remove a rev');
select is((public.rev_remove('rev', pg_temp.rid('r3'), 1) ->> 'id')::uuid, pg_temp.rid('r3'), 'removing it again is a no-op');
select is((select count(*)::int from public.revs where id = pg_temp.rid('r3')), 1, 'the manager still reads it (for Undo)');
select is((select count(*)::int from public.rev_status('c0000000-0000-0000-0000-000000000491')), 5 * 5 + 1,
  'its items leave the status');
select pg_temp.login('a0000000-0000-0000-0000-000000000494');
select is((select count(*)::int from public.revs where id = pg_temp.rid('r3')), 0, 'a sub doesn''t see a removed rev');
select throws_ok($$ select public.rev_restore('rev', pg_temp.rid('r3'), pg_temp.ver('revs', 'r3')) $$, '42501', null,
  'a sub can''t restore');
select pg_temp.login('a0000000-0000-0000-0000-000000000492');
select ok((public.rev_restore('rev', pg_temp.rid('r3'), pg_temp.ver('revs', 'r3')) ->> 'deleted_at') is null, 'restore it (Undo)');
select is((select count(*)::int from public.rev_status('c0000000-0000-0000-0000-000000000491')), 5 * 7 + 1,
  'the status: every wall x item of each list (5 x 7 and 1 x 1)');
select throws_ok($$ select public.rev_remove('thing', pg_temp.rid('r3'), 1) $$, '22023', 'Unknown kind.', 'only list, rev, item, wall');
select ok((public.rev_remove('list', pg_temp.rid('L2'), pg_temp.ver('rev_lists', 'L2')) ->> 'deleted_at') is not null, 'remove a list');
select lives_ok($$ select public.rev_list_create('c0000000-0000-0000-0000-000000000491', 'Sample Other Walls', null, null, '[]') $$,
  'its name is free again');
select throws_ok($$ select public.rev_restore('list', pg_temp.rid('L2'), pg_temp.ver('rev_lists', 'L2')) $$,
  '22023', 'That name or number is in use now.', 'a restore that would repeat a name is refused');

-- ---------------------------------------------------------------------------------------------------------------
-- Status before any request
-- ---------------------------------------------------------------------------------------------------------------
select pg_temp.login('a0000000-0000-0000-0000-000000000494');
select is(array[pg_temp.st('w_corr', 'i_tow'), pg_temp.st('w_shaft', 'i_tow')], array['na', 'open'], 'status: N/A and open');
select pg_temp.login('a0000000-0000-0000-0000-000000000498');
select throws_ok($$ select * from public.rev_status('c0000000-0000-0000-0000-000000000491') $$, '42501', null,
  'status: not for a stranger');
select pg_temp.login('a0000000-0000-0000-0000-000000000496');
select throws_ok($$ select * from public.rev_status('c0000000-0000-0000-0000-000000000491') $$, '42501', null,
  'status: not for a bidder');

-- ---------------------------------------------------------------------------------------------------------------
-- The revs request
-- ---------------------------------------------------------------------------------------------------------------
select pg_temp.login('a0000000-0000-0000-0000-000000000494');
select lives_ok($$ insert into ids select 'A', (pg_temp.ofs(array['w_shaft', 'w_corr', 'w_elev'], array['i_spray', 'i_stuff'])).id $$,
  'the sub asks for two items on three walls');
select is((select array[kind, number::text, ofs_number::text, status, items] from public.inspection_requests where id = pg_temp.rid('A')),
  array['ofs', '1', '1', 'gc_review', 'Level 01, Level 02 · HOW Cavity Stuff & HOW Cavity Spray · Shaftwall at Stair 2 (C-D / 3-4), Corridor 110 north wall, Elevator 1 shaft (B / 2-3)'],
  'an OFS request: numbered by the database (IR and OFS IR), what to inspect composed; it starts with the GC (0061)');
select is((select array_agg(c.color || ' ' || i.name order by c.color, i.name) from (select distinct color, item_id from public.ir_rev_items
            where request_id = pg_temp.rid('A')) c join public.rev_items i on i.id = c.item_id),
  array['1 HOW Cavity Stuff', '2 HOW Cavity Spray'], 'one color per item, by item order (not the order picked)');
select is((select count(*)::int from public.ir_rev_items where request_id = pg_temp.rid('A')), 6, 'a cell per wall and item');
select is((select array[sheet_file_id::text, page::text, strokes::text, stale::text] from public.ir_maps where request_id = pg_temp.rid('A')),
  array['e0000000-0000-0000-0000-000000000491', '1', '[]', 'true'], 'its map starts on the first wall''s sheet');
select is((pg_temp.ofs(array['w_shaft', 'w_corr', 'w_elev'], array['i_stuff', 'i_spray'])).id, pg_temp.rid('A'),
  'the same request again within 10 minutes is the first one');
select pg_temp.login('a0000000-0000-0000-0000-000000000497');
select ok(exists (select 1 from public.activity where entity_id = pg_temp.rid('A') and kind = 'ir.gc_review'
                   and summary like 'IR 1 (OFS 1) to review · Sample Firestop Co · %'), 'board: to the GC, with the OFS number');
select ok(exists (select 1 from public.calendar_entries where source_type = 'inspection_request' and source_id = pg_temp.rid('A')
                   and kind = 'inspections'), 'calendar: on the inspection calendar like any request');
select pg_temp.login('a0000000-0000-0000-0000-000000000494');
select lives_ok($$ insert into ids select 'B', (pg_temp.ofs(array['w_corr', 'w_elev'], array['i_tow'])).id $$,
  'TOW on two walls, one of them N/A');
select is((select array[ofs_number::text, items] from public.inspection_requests where id = pg_temp.rid('B')),
  array['2', 'Level 02 · TOW - Speed Plugs · Elevator 1 shaft (B / 2-3)'], 'the N/A wall is skipped');
select is((select sheet_file_id from public.ir_maps where request_id = pg_temp.rid('B')), null::uuid,
  'no sheet on its walls: the map waits for one');
select throws_ok($$ select pg_temp.ofs(array['w_shaft'], array['i_tow', 'i_stuff', 'i_spray', 'i_beam']) $$,
  '22023', 'Pick 1 to 3 items.', 'three items at most');
select throws_ok($$ select pg_temp.ofs(array['w_shaft', 'w_other'], array['i_tow']) $$,
  '22023', 'Pick the walls and items from one list.', 'walls from one list');
select throws_ok($$ select pg_temp.ofs(array['w_corr'], array['i_tow']) $$, '22023', 'Already passed.',
  'nothing left to inspect (N/A) is refused');
select throws_ok($$ select pg_temp.ofs(array['w_shaft'], array['i_tow'], 'e0000000-0000-0000-0000-000000000492') $$,
  '22023', 'Pick a PDF sheet from this job''s files.', 'the sheet is a PDF of the job');
select pg_temp.login('a0000000-0000-0000-0000-000000000496');
select throws_ok($$ select pg_temp.ofs(array['w_shaft'], array['i_tow']) $$, '42501', null, 'a bidder can''t ask');
select pg_temp.login('a0000000-0000-0000-0000-000000000491');
select throws_ok($$ select public.ir_submit_ofs('c0000000-0000-0000-0000-000000000494', 'Sample Co',
  ((now() at time zone 'America/Los_Angeles')::date + 3), true, array[pg_temp.rid('w_shaft')], array[pg_temp.rid('i_tow')]) $$,
  '22023', 'OFS is off for this job.', 'not where OFS is off');
select pg_temp.login('a0000000-0000-0000-0000-000000000495');
select lives_ok($$ insert into ids select 'C', (pg_temp.ofs(array['w_shaft'], array['i_stuff'])).id $$,
  'the requester asks for a wall the sub''s request has too');
select pg_temp.login('a0000000-0000-0000-0000-000000000494');
select is(array[pg_temp.st('w_shaft', 'i_stuff'), pg_temp.st('w_elev', 'i_tow')], array['requested:3/3', 'requested:2/2'],
  'status: requested, with the IR and OFS IR numbers (the latest request)');
select is((public.ir_submit('c0000000-0000-0000-0000-000000000491', 'Sample Co', ((now() at time zone 'America/Los_Angeles')::date + 4),
  'ofs', 'An OFS request from the usual form', true, p_duration_kind => 'all_day',
  p_special_required => false)).ofs_number, 4,
  'every OFS request gets the next OFS IR number');
select is((public.ir_submit('c0000000-0000-0000-0000-000000000491', 'Sample Co', ((now() at time zone 'America/Los_Angeles')::date + 4),
  'ior', 'An IOR request', true, p_duration_kind => 'all_day')).ofs_number, null::int, 'other kinds get none');
reset role;
select throws_ok($$ update public.inspection_requests set ofs_number = 1 where id = pg_temp.rid('B') $$, '23505', null,
  'one OFS IR number per job');
set local role authenticated;

-- What each person sees of the cells and maps
select pg_temp.login('a0000000-0000-0000-0000-000000000494');
select is((select count(*)::int from public.ir_rev_items) * 10 + (select count(*)::int from public.ir_maps), 7 * 10 + 2,
  'the sub reads the cells and maps of their own requests');
select pg_temp.login('a0000000-0000-0000-0000-000000000495');
select is((select count(*)::int from public.ir_rev_items) * 10 + (select count(*)::int from public.ir_maps), 1 * 10 + 1,
  'the requester only theirs');
select pg_temp.login('a0000000-0000-0000-0000-000000000497');
select is((select count(*)::int from public.ir_rev_items) * 10 + (select count(*)::int from public.ir_maps), 8 * 10 + 3,
  'the PM reads them all (ir.view_all)');

-- ---------------------------------------------------------------------------------------------------------------
-- The map
-- ---------------------------------------------------------------------------------------------------------------
select pg_temp.login('a0000000-0000-0000-0000-000000000494');
select is((select array[(c ->> 'number'), (c ->> 'ofs_number'), (c ->> 'phase'), (c ->> 'what'), (c -> 'legend')::text,
                        (c ->> 'can_edit'), (c ->> 'stale')]
             from public.ir_map_context(pg_temp.rid('A')) c),
  array['1', '1', 'PH III', 'Level 01, Level 02 HOW Cavity Stuff & HOW Cavity Spray',
        '[{"name": "HOW Cavity Stuff", "color": 1}, {"name": "HOW Cavity Spray", "color": 2}]', 'true', 'true'],
  'the map''s title parts and legend; the requester may draw');
select is((public.ir_map_save(pg_temp.rid('A'), 1, pg_temp.j('ok2'))).version, 2, 'the requester draws: the version moves');
select throws_ok($$ select public.ir_map_save(pg_temp.rid('A'), 1, pg_temp.j('ok2')) $$, '40001', null, 'a stale version is refused');
select throws_ok($$ select public.ir_map_save(pg_temp.rid('A'), 2, '[{"c": 1, "w": 0.01, "p": [[0, 0], [1.5, 0]]}]') $$,
  '22023', 'Those marks can''t be saved.', 'a point off the page is refused');
select throws_ok($$ select public.ir_map_save(pg_temp.rid('A'), 2, '[{"c": 1, "w": 0.01, "p": [[0, 0]]}]') $$,
  '22023', 'Those marks can''t be saved.', 'a one-point stroke is refused');
select throws_ok($$ select public.ir_map_save(pg_temp.rid('A'), 2, pg_temp.j('c3')) $$,
  '22023', 'Use the request''s colors.', 'a third color on a two-item request is refused');
select throws_ok($$ select public.ir_map_save(pg_temp.rid('A'), 2, pg_temp.j('ok2'), 'e0000000-0000-0000-0000-000000000492') $$,
  '22023', 'Pick a PDF sheet from this job''s files.', 'the sheet stays a PDF');
select throws_ok($$ select public.ir_map_save(pg_temp.rid('B'), 1, pg_temp.j('c1')) $$, '22023', 'Pick the sheet first.',
  'no marks before a sheet');
select is((select array[(m).version::text, (m).sheet_file_id::text]
             from (select public.ir_map_save(pg_temp.rid('B'), 1, pg_temp.j('c1'), 'e0000000-0000-0000-0000-000000000491', 2) as m) x),
  array['2', 'e0000000-0000-0000-0000-000000000491'], 'a sheet and its page picked, then marks');
select pg_temp.login('a0000000-0000-0000-0000-000000000497');
select throws_ok($$ select public.ir_map_save(pg_temp.rid('A'), 2, pg_temp.j('c1')) $$, '42501', null,
  'the PM reads the map but doesn''t draw');
select pg_temp.login('a0000000-0000-0000-0000-000000000495');
select throws_ok($$ select public.ir_map_context(pg_temp.rid('A')) $$, 'P0002', null, 'another requester can''t find it');
select pg_temp.login('a0000000-0000-0000-0000-000000000498');
select throws_ok($$ select public.ir_map_context(pg_temp.rid('A')) $$, 'P0002', null, 'nor a stranger');
select pg_temp.login('a0000000-0000-0000-0000-000000000492');
select is((public.ir_map_save(pg_temp.rid('A'), 2, pg_temp.j('c1'))).version, 3, 'the inspector may redraw it');
select throws_ok($$ select public.ir_map_attach(pg_temp.rid('A'), 'e0000000-0000-0000-0000-000000000494', repeat('a', 64), false) $$,
  '42501', null, 'the map record is not for people');
reset role;
set local role service_role;
select pg_temp.login_service();
select is((select array[(m).map_file_id::text, (m).stale::text, (m).signed::text, (m).version::text]
             from (select public.ir_map_attach(pg_temp.rid('A'), 'e0000000-0000-0000-0000-000000000494', repeat('a', 64), false) as m) x),
  array['e0000000-0000-0000-0000-000000000494', 'false', 'false', '3'], 'the service role records the rendered map');
select throws_ok($$ select public.ir_map_attach(pg_temp.rid('A'), 'e0000000-0000-0000-0000-000000000494', repeat('a', 64), true) $$,
  '40001', null, 'a signed map only on a signed, approved IR');
select throws_ok($$ select public.ir_map_attach(pg_temp.rid('A'), 'e0000000-0000-0000-0000-000000000492', repeat('a', 64), false) $$,
  '22023', 'The map PDF is missing.', 'the map is a clean PDF of the job');
reset role;
set local role authenticated;

-- A request's files: its map and its sheet; the null check
select pg_temp.login('a0000000-0000-0000-0000-000000000494');
select is((select storage_path from public.authorize_ir_file(pg_temp.rid('A'), 'e0000000-0000-0000-0000-000000000494')),
  'test/revs/map.pdf', 'the requester downloads the map through the request');
select is((select storage_path from public.authorize_ir_file(pg_temp.rid('A'), 'e0000000-0000-0000-0000-000000000491')),
  'test/revs/sheet.pdf', 'and its sheet');
select throws_ok($$ select * from public.authorize_ir_file(pg_temp.rid('A'), 'e0000000-0000-0000-0000-000000000492') $$,
  '42501', null, 'not another file of the job');
select pg_temp.login('a0000000-0000-0000-0000-000000000495');
select throws_ok($$ select * from public.authorize_ir_file(pg_temp.rid('C'), 'e0000000-0000-0000-0000-000000000495') $$,
  '42501', null, 'fixed: someone else''s upload in the request folder no longer answers through my request (no IR PDF yet)');
select is((select storage_path from public.authorize_ir_file(pg_temp.rid('C'), 'e0000000-0000-0000-0000-000000000496')),
  'test/revs/req.jpg', 'my own upload there still does (a photo being added)');

-- ---------------------------------------------------------------------------------------------------------------
-- Results per wall and item
-- ---------------------------------------------------------------------------------------------------------------
reset role;
insert into js select 'resA', jsonb_agg(jsonb_build_object('area_id', c.area_id, 'item_id', c.item_id,
    'result', case when c.area_id = pg_temp.rid('w_corr') and c.item_id = pg_temp.rid('i_spray') then 'failed' else 'passed' end,
    'note', case when c.area_id = pg_temp.rid('w_corr') and c.item_id = pg_temp.rid('i_spray') then 'Gaps at the deflection track' end))
  from public.ir_rev_items c where c.request_id = pg_temp.rid('A');
insert into js select 'resA_nonote', jsonb_agg(case when (e ->> 'result') = 'failed' then e - 'note' else e end) from jsonb_array_elements(pg_temp.j('resA')) e;
insert into js select 'resA_short', pg_temp.j('resA') - 0;
insert into js select 'resA_bad', jsonb_set(pg_temp.j('resA'), '{0,result}', '"maybe"');
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000494');
select throws_ok($$ select public.ir_rev_results(pg_temp.rid('A'), pg_temp.ver('inspection_requests', 'A'), pg_temp.j('resA')) $$,
  '42501', null, 'the sub can''t record results');
select pg_temp.to_ofs('A');
select throws_ok($$ select public.ir_rev_results(pg_temp.rid('A'), pg_temp.ver('inspection_requests', 'A'), pg_temp.j('resA')) $$,
  '42501', null, 'nor the inspector: an OFS inspection is the deputy''s');
select pg_temp.login('a0000000-0000-0000-0000-000000000493');
select throws_ok($$ select public.ir_rev_results(pg_temp.rid('A'), pg_temp.ver('inspection_requests', 'A'), pg_temp.j('resA_nonote')) $$,
  '22023', 'Write why it failed.', 'a failed item says why');
select throws_ok($$ select public.ir_rev_results(pg_temp.rid('A'), pg_temp.ver('inspection_requests', 'A'), pg_temp.j('resA_short')) $$,
  '22023', 'Record every wall.', 'every cell, once');
select throws_ok($$ select public.ir_rev_results(pg_temp.rid('A'), pg_temp.ver('inspection_requests', 'A'), pg_temp.j('resA_bad')) $$,
  '22023', 'Unknown result.', 'passed or failed only');
select throws_ok($$ select public.ir_rev_results(pg_temp.rid('A'), 99, pg_temp.j('resA')) $$, '40001', null,
  'a stale request version is refused');
select is((select array[(r).result, (r).result_note, (r).status, ((r).owner_id = auth.uid())::text]
             from (select public.ir_rev_results(pg_temp.rid('A'), pg_temp.ver('inspection_requests', 'A'), pg_temp.j('resA')) as r) x),
  array['not_approved', 'Corridor 110 north wall · HOW Cavity Spray: Gaps at the deflection track', 'confirmed', 'true'],
  'one failed: not approved, its reason on the request; the deputy owns it');
select is((select array_agg(result order by result) from public.ir_rev_items where request_id = pg_temp.rid('A')),
  array['failed', 'passed', 'passed', 'passed', 'passed', 'passed'], 'each cell keeps its own result');
select ok((select stale from public.ir_maps where request_id = pg_temp.rid('A')), 'a result marks the map PDF stale');
select pg_temp.login('a0000000-0000-0000-0000-000000000494');
select throws_ok($$ select public.ir_map_save(pg_temp.rid('A'), pg_temp.ver('ir_maps', 'A'), pg_temp.j('ok2')) $$, '42501', null,
  'the requester can''t redraw once there is a result');
select is(array[pg_temp.st('w_shaft', 'i_stuff'), pg_temp.st('w_corr', 'i_spray'), pg_temp.st('w_elev', 'i_tow'),
                pg_temp.st('w_corr', 'i_tow'), pg_temp.st('w_elev', 'i_dw1')],
  array['passed:1/1', 'failed:1/1 Gaps at the deflection track', 'requested:2/2', 'na', 'open'],
  'status: passed beats requested (the requester''s request is still open), failed says why, requested, N/A, open');
select lives_ok($$ insert into ids select 'D', (pg_temp.ofs(array['w_corr', 'w_elev'], array['i_stuff', 'i_spray'])).id $$,
  'asked again for those walls and items');
select is((select array[i.name, c.color::text, a.name]
             from public.ir_rev_items c join public.rev_items i on i.id = c.item_id join public.rev_areas a on a.id = c.area_id
            where c.request_id = pg_temp.rid('D')),
  array['HOW Cavity Spray', '1', 'Corridor 110 north wall'], 'only the failed cell is on it, in the first color');
select is((select items from public.inspection_requests where id = pg_temp.rid('D')),
  'Level 01 · HOW Cavity Spray · Corridor 110 north wall', 'and only it is named');
select is(pg_temp.st('w_corr', 'i_spray'), 'requested:6/5', 'status: requested again beats the earlier fail');
select throws_ok($$ select pg_temp.ofs(array['w_shaft', 'w_elev'], array['i_stuff']) $$, '22023', 'Already passed.',
  'passed cells are never asked again');
select pg_temp.to_ofs('D');
select pg_temp.login('a0000000-0000-0000-0000-000000000493');
insert into js select 'resD', jsonb_agg(jsonb_build_object('area_id', c.area_id, 'item_id', c.item_id, 'result', 'passed'))
  from public.ir_rev_items c where c.request_id = pg_temp.rid('D');
select is((select array[(r).result, coalesce((r).result_note, '-')]
             from (select public.ir_rev_results(pg_temp.rid('D'), pg_temp.ver('inspection_requests', 'D'), pg_temp.j('resD')) as r) x),
  array['approved', '-'], 'every cell passed: approved');
select is((public.ir_rev_results(pg_temp.rid('D'), pg_temp.ver('inspection_requests', 'D'), null)).result, null::text,
  'null clears the results (Undo)');
select is((select count(*)::int from public.ir_rev_items where request_id = pg_temp.rid('D') and result is not null), 0,
  'the cells too');
select is((public.ir_rev_results(pg_temp.rid('D'), pg_temp.ver('inspection_requests', 'D'), pg_temp.j('resD'))).result, 'approved',
  'recorded again');
select lives_ok($$ select public.ir_sign(pg_temp.rid('D'), pg_temp.ver('inspection_requests', 'D'), repeat('b', 64)) $$,
  'the deputy signs the approved IR');
select throws_ok($$ select public.ir_map_save(pg_temp.rid('D'), pg_temp.ver('ir_maps', 'D'), pg_temp.j('c1')) $$, '22023',
  'This IR is signed.', 'a signed IR''s map is final');
select is((select (c ->> 'can_edit') || ' ' || (c ->> 'signer_name') from public.ir_map_context(pg_temp.rid('D')) c),
  'false Dana Deputy', 'the context says so, with the signer');
reset role;
set local role service_role;
select pg_temp.login_service();
select ok((public.ir_map_attach(pg_temp.rid('D'), 'e0000000-0000-0000-0000-000000000494', repeat('c', 64), true)).signed,
  'a signed, approved IR''s map carries the signature');
reset role;
set local role authenticated;

select pg_temp.login('a0000000-0000-0000-0000-000000000492');
select lives_ok($$ select public.rev_mark_na(pg_temp.rid('w_shaft'), pg_temp.rid('i_stuff'), true) $$, 'N/A on a passed cell');
select pg_temp.login('a0000000-0000-0000-0000-000000000494');
select is(array[pg_temp.st('w_shaft', 'i_stuff'), pg_temp.st('w_corr', 'i_spray')], array['na', 'passed:6/5'],
  'status: N/A beats passed; the asked-again cell passed');

select * from finish();
rollback;
