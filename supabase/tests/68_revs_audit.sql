begin;
select plan(34);
-- Migration 0080 (Oct 4 audit): a sheet in use stays on file (a live wall's sheet, a request's map), Setup's Up / Down
-- as one save (rev_move), a backcheck taken back (permit_review_withdraw) and opened again with the same number, and
-- the plan sheet's download through Revs' own gate: a fire marshal who may not read the plans folder still gets the
-- sheet a wall is on (authorize_rev_sheet, logged as a download), never the folder's other files.
\ir _helpers.psql

create temp table ids (k text primary key, v uuid);
grant all on ids to public;
create function pg_temp.rid(p_k text) returns uuid language sql stable as $$ select v from ids where k = p_k $$;
-- Read past RLS: a row's version and place, a review row.
create function pg_temp.ver(p_table text, p_k text) returns int language plpgsql volatile security definer as $$
declare v int;
begin
  execute format('select version from public.%I where id = $1', p_table) into v using pg_temp.rid(p_k);
  return v;
end $$;
create function pg_temp.order_of(p_table text, p_keys text[]) returns text language plpgsql volatile security definer as $$
declare v text;
begin
  execute format('select string_agg(k.k, '','' order by t.position, t.name) from public.%I t join ids k on k.v = t.id
                   where k.k = any ($1)', p_table) into v using p_keys;
  return v;
end $$;
create function pg_temp.rv(p_k text) returns public.permit_reviews language sql volatile security definer as $$
  select * from public.permit_reviews where id = pg_temp.rid(p_k) $$;
create function pg_temp.downloads(p_file uuid, p_user uuid) returns int language sql volatile security definer as $$
  select count(*)::int from public.downloads where file_id = p_file and user_id = p_user $$;
grant execute on all functions in schema pg_temp to public;

select pg_temp.mk_user('a0000000-0000-0000-0000-000000000801', 'probe+ra-admin@example.test', 'Ada Admin');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000802', 'probe+ra-insp@example.test', 'Ivy Inspector');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000803', 'probe+ra-ahj@example.test', 'Dana Deputy');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000804', 'probe+ra-pm@example.test', 'Pat Manager');

insert into public.orgs (id, name, kind, created_by) values
  ('b0000000-0000-0000-0000-000000000801', 'Sample Audit Builders', 'gc', 'a0000000-0000-0000-0000-000000000801');
insert into public.projects (id, org_id, name, stage, timezone, created_by, settings) values
  ('c0000000-0000-0000-0000-000000000801', 'b0000000-0000-0000-0000-000000000801', 'Audit Job', 'construction',
   'America/Los_Angeles', 'a0000000-0000-0000-0000-000000000801', '{"ir_ofs_allowed": true}');
insert into public.project_members (org_id, project_id, user_id, invite_email, role, status)
select 'b0000000-0000-0000-0000-000000000801', 'c0000000-0000-0000-0000-000000000801', u::uuid, e, r, 'active'
  from (values ('a0000000-0000-0000-0000-000000000802', 'probe+ra-insp@example.test', 'inspector'),
               ('a0000000-0000-0000-0000-000000000803', 'probe+ra-ahj@example.test', 'ahj'),
               ('a0000000-0000-0000-0000-000000000804', 'probe+ra-pm@example.test', 'pm')) v(u, e, r);
-- A plans folder only files.manage reads (the PM does; the deputy and the inspector don't), with the wall's sheet, a
-- second PDF, and an upload the inspector never finished.
insert into public.folders (id, org_id, project_id, name, created_by) values
  ('d0000000-0000-0000-0000-000000000801', 'b0000000-0000-0000-0000-000000000801', 'c0000000-0000-0000-0000-000000000801',
   'Sample Plans', 'a0000000-0000-0000-0000-000000000801');
insert into public.folder_access (folder_id, capability, can_read, can_write)
values ('d0000000-0000-0000-0000-000000000801', 'files.manage', true, true);
insert into public.files (id, org_id, project_id, folder_id, storage_path, original_name, mime, created_by, scan_status, upload_complete)
select ('e0000000-0000-0000-0000-00000000080' || n)::uuid, 'b0000000-0000-0000-0000-000000000801', 'c0000000-0000-0000-0000-000000000801',
       'd0000000-0000-0000-0000-000000000801', 'test/audit/' || n, nm, 'application/pdf', u::uuid, 'clean', done
  from (values ('1', 'Sample L01.pdf', 'a0000000-0000-0000-0000-000000000804', true),
               ('2', 'Sample L02.pdf', 'a0000000-0000-0000-0000-000000000804', true),
               ('3', 'Sample half.pdf', 'a0000000-0000-0000-0000-000000000802', false)) v(n, nm, u, done);

-- The inspector's list (two items in TOW) and three walls on Level 01, the first on sheet 1.
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000802');
insert into ids select 'L', (public.rev_list_create('c0000000-0000-0000-0000-000000000801', 'Sample Rated Walls', null, null,
  '[{"number": 0, "name": "TOW", "items": [{"name": "TOW One"}, {"name": "TOW Two"}, {"name": "TOW Three"}]}]')).id;
insert into ids select case i.name when 'TOW One' then 'i1' when 'TOW Two' then 'i2' else 'i3' end, i.id
  from public.rev_items i join public.revs v on v.id = i.rev_id where v.list_id = pg_temp.rid('L');
select count(*) from public.rev_areas_add(pg_temp.rid('L'), 'Level 01', array['North', 'East', 'South'], null);
insert into ids select 'w' || o, a.id
  from unnest(array['North', 'East', 'South']) with ordinality as t (nm, o)
  join public.rev_areas a on a.name = t.nm and a.list_id = pg_temp.rid('L');
reset role;
update public.rev_areas set sheet_file_id = 'e0000000-0000-0000-0000-000000000801' where id = pg_temp.rid('w1');

-- ---------------------------------------------------------------------------------------------------------------
-- The plan sheet's download: Revs' gate, not the folder's
-- ---------------------------------------------------------------------------------------------------------------
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000803');
select throws_ok($$ select public.authorize_download('e0000000-0000-0000-0000-000000000801') $$, '42501', 'forbidden',
  'the deputy may not read the plans folder');
select is((select original_name from public.authorize_rev_sheet('c0000000-0000-0000-0000-000000000801',
                                                                'e0000000-0000-0000-0000-000000000801')),
  'Sample L01.pdf', '... but gets the sheet a wall is on through Revs (the plan''s download)');
select is(pg_temp.downloads('e0000000-0000-0000-0000-000000000801', 'a0000000-0000-0000-0000-000000000803'), 1,
  'that download is logged');
select pg_temp.login('a0000000-0000-0000-0000-000000000804');
select throws_ok($$ select public.authorize_rev_sheet('c0000000-0000-0000-0000-000000000801', 'e0000000-0000-0000-0000-000000000802') $$,
  '42501', 'forbidden', 'a reader gets no PDF that no wall is on');

-- ---------------------------------------------------------------------------------------------------------------
-- A sheet in use stays on file (the rule is a trigger: whoever removes the file, Files' Delete or the server)
-- ---------------------------------------------------------------------------------------------------------------
reset role;
select throws_ok($$ update public.files set deleted_at = now() where id = 'e0000000-0000-0000-0000-000000000801' $$, '22023',
  'A wall in Revs is on this sheet. Give the wall another sheet first.', 'a wall''s sheet can''t be removed, in words');
select lives_ok($$ update public.files set deleted_at = now() where id = 'e0000000-0000-0000-0000-000000000802' $$,
  'a PDF no wall is on can be removed');
update public.files set deleted_at = null where id = 'e0000000-0000-0000-0000-000000000802';
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000802');
select lives_ok($$ select public.remove_unfinished_upload('e0000000-0000-0000-0000-000000000803') $$,
  'an upload that never finished stays removable');
reset role;
select is((select count(*)::int from public.files where id = 'e0000000-0000-0000-0000-000000000803' and deleted_at is not null), 1,
  '... and is gone');
update public.rev_areas set sheet_file_id = null where id = pg_temp.rid('w1');
select lives_ok($$ update public.files set deleted_at = now() where id = 'e0000000-0000-0000-0000-000000000801' $$,
  'once no wall is on it, the sheet can be removed');
update public.files set deleted_at = null where id = 'e0000000-0000-0000-0000-000000000801';
update public.rev_areas set sheet_file_id = 'e0000000-0000-0000-0000-000000000801' where id = pg_temp.rid('w2');
update public.rev_areas set deleted_at = now() where id = pg_temp.rid('w2');
select lives_ok($$ update public.files set deleted_at = now() where id = 'e0000000-0000-0000-0000-000000000801' $$,
  'a removed wall keeps nothing');
update public.files set deleted_at = null where id = 'e0000000-0000-0000-0000-000000000801';
update public.rev_areas set deleted_at = null where id = pg_temp.rid('w2');
insert into ids select 'r', (public.ir_submit_ofs('c0000000-0000-0000-0000-000000000801', 'Sample Co', current_date + 3, true,
  array[pg_temp.rid('w3')], array[pg_temp.rid('i1')], null, '08:00', 'timed', 60, p_special_required => false,
  p_inspector_ack => true)).id
  from (select pg_temp.login('a0000000-0000-0000-0000-000000000802')) x;
update public.ir_maps set sheet_file_id = 'e0000000-0000-0000-0000-000000000802' where request_id = pg_temp.rid('r');
select throws_ok($$ update public.files set deleted_at = now() where id = 'e0000000-0000-0000-0000-000000000802' $$, '22023',
  'An inspection map is on this sheet.', 'nor a request map''s sheet');
select ok(not has_function_privilege('authenticated', 'public.tg_files_keep_rev_sheet()', 'EXECUTE'),
  'the keep rule is internal');

-- ---------------------------------------------------------------------------------------------------------------
-- Up / Down in one save
-- ---------------------------------------------------------------------------------------------------------------
select is(pg_temp.order_of('rev_items', array['i1', 'i2', 'i3']), 'i1,i2,i3', 'items start in their order');
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000802');
select is((public.rev_move('item', pg_temp.rid('i3'), pg_temp.ver('rev_items', 'i3'), -1)->>'id')::uuid, pg_temp.rid('i3'),
  'an item moves up and comes back');
select is(pg_temp.order_of('rev_items', array['i1', 'i2', 'i3']), 'i1,i3,i2', '... swapped with the one above, at once');
select is((select array_agg(position order by position) from public.rev_items where rev_id = (select rev_id from public.rev_items where id = pg_temp.rid('i1'))),
  array[1, 2, 3], '... the rev numbered 1..n, no two in one place');
select throws_ok($$ select public.rev_move('item', pg_temp.rid('i3'), 1, 1) $$, '40001', null, 'an old version is refused');
select lives_ok($$ select public.rev_move('item', pg_temp.rid('i1'), pg_temp.ver('rev_items', 'i1'), -1) $$,
  'the top one up is nothing');
select is(pg_temp.order_of('rev_items', array['i1', 'i2', 'i3']), 'i1,i3,i2', '... the order stays');
select lives_ok($$ select public.rev_move('item', pg_temp.rid('i3'), pg_temp.ver('rev_items', 'i3'), 1) $$,
  'Undo is the same move the other way');
select is(pg_temp.order_of('rev_items', array['i1', 'i2', 'i3']), 'i1,i2,i3', '... back as it was');
select lives_ok($$ select public.rev_move('area', pg_temp.rid('w1'), pg_temp.ver('rev_areas', 'w1'), 1) $$, 'a wall moves down');
select is(pg_temp.order_of('rev_areas', array['w1', 'w2', 'w3']), 'w2,w1,w3', '... on its level');
select throws_ok($$ select public.rev_move('list', pg_temp.rid('L'), 1, 1) $$, '22023', 'Unknown kind.', 'items and walls only');
select pg_temp.login('a0000000-0000-0000-0000-000000000804');
select throws_ok($$ select public.rev_move('area', pg_temp.rid('w1'), null, 1) $$, '42501', null, 'a PM doesn''t manage revs');
reset role;
select ok(not has_function_privilege('anon', 'public.rev_move(text, uuid, integer, integer)', 'EXECUTE'), 'never anon');

-- ---------------------------------------------------------------------------------------------------------------
-- A backcheck taken back
-- ---------------------------------------------------------------------------------------------------------------
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000803');
insert into ids select 'P', (public.permit_create('c0000000-0000-0000-0000-000000000801', '24-0801', 'Sample building',
  'building', '{}', null, '', 'in_review')).id;
insert into ids select 'R1', (public.permit_review_open(pg_temp.rid('P'), 'initial')).id;
select public.permit_review_close(pg_temp.rid('R1'), (pg_temp.rv('R1')).version, 'revise_resubmit');
insert into ids select 'BC', (public.permit_review_backcheck(pg_temp.rid('R1'), null, 'f0000000-0000-0000-0000-000000000801')).id;
select is((pg_temp.rv('BC')).backcheck, 1, 'Backcheck opens BC 1');
select pg_temp.login('a0000000-0000-0000-0000-000000000804');
select throws_ok($$ select public.permit_review_withdraw(pg_temp.rid('BC'), null) $$, '42501', null, 'only the official takes it back');
select pg_temp.login('a0000000-0000-0000-0000-000000000803');
select throws_ok($$ select public.permit_review_withdraw(pg_temp.rid('R1'), null) $$, '22023',
  'Only an open backcheck can be taken back.', 'never the first submittal or a closed cycle');
select ok((public.permit_review_withdraw(pg_temp.rid('BC'), (pg_temp.rv('BC')).version)).withdrawn_at is not null,
  'the official takes the backcheck back (Undo)');
select is(jsonb_array_length(public.permit_detail(pg_temp.rid('P'))->'reviews'), 1, '... it no longer shows on the permit');
select throws_ok($$ select public.permit_comment_add(pg_temp.rid('BC'), 'Sample') $$, '22023', 'This backcheck was taken back.',
  '... and takes no comments');
select is((public.permit_review_backcheck(pg_temp.rid('R1'), null, 'f0000000-0000-0000-0000-000000000802')).id, pg_temp.rid('BC'),
  'Backcheck again opens that same cycle');
select is(array[(pg_temp.rv('BC')).backcheck::text, ((pg_temp.rv('BC')).withdrawn_at is null)::text], array['1', 'true'],
  '... as BC 1 again: numbers never skip');

select * from finish();
rollback;
