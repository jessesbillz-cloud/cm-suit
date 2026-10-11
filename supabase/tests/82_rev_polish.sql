begin;
select plan(14);
-- Migration 0095 (Jesse, Oct 10: "I need to be able to go in there and make the changes"). A sign-off made before the
-- app is changed from the room page: a changed OFS number (or none) drops the old number's IR, the same number keeps
-- it, and the new number's IR is linked by rev_file_link (0094's rule). Who may, and anon, as before.
\ir _helpers.psql

create temp table ids (k text primary key, v uuid);
grant all on ids to public;
create function pg_temp.rid(p_k text) returns uuid language sql stable as $$ select v from ids where k = p_k $$;
create function pg_temp.so(p_wall text) returns public.rev_signoffs language sql volatile security definer as $$
  select * from public.rev_signoffs where area_id = pg_temp.rid(p_wall) and item_id = pg_temp.rid('i1') and deleted_at is null $$;
create function pg_temp.add_file(p_k text, p_folder uuid, p_name text, p_age int)
returns void language plpgsql volatile security definer as $$
begin
  insert into public.files (org_id, project_id, folder_id, storage_path, original_name, mime, created_by, scan_status,
                            upload_complete, created_at)
  select fo.org_id, fo.project_id, p_folder, 'test/revpolish/' || p_k, p_name, 'application/pdf',
         'a0000000-0000-0000-0000-000000000952', 'clean', true, now() - make_interval(hours => p_age)
    from public.folders fo where fo.id = p_folder
  returning id into strict p_folder;
  insert into ids values (p_k, p_folder);
end $$;
grant execute on all functions in schema pg_temp to public;

select pg_temp.mk_user('a0000000-0000-0000-0000-000000000951', 'probe+rp-admin@example.test', 'Ada Admin');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000952', 'probe+rp-insp@example.test', 'Ivy Inspector');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000953', 'probe+rp-pm@example.test', 'Pat Manager');

insert into public.orgs (id, name, kind, created_by) values
  ('b0000000-0000-0000-0000-000000000951', 'Sample Polish Builders', 'gc', 'a0000000-0000-0000-0000-000000000951');
insert into public.projects (id, org_id, name, stage, timezone, created_by, settings) values
  ('c0000000-0000-0000-0000-000000000951', 'b0000000-0000-0000-0000-000000000951', 'Sample Polish Job', 'construction',
   'America/Los_Angeles', 'a0000000-0000-0000-0000-000000000951', '{"ir_ofs_allowed": true}');
insert into public.project_members (org_id, project_id, user_id, invite_email, role, status)
select 'b0000000-0000-0000-0000-000000000951', 'c0000000-0000-0000-0000-000000000951', u::uuid, e, r, 'active'
  from (values ('a0000000-0000-0000-0000-000000000952', 'probe+rp-insp@example.test', 'inspector'),
               ('a0000000-0000-0000-0000-000000000953', 'probe+rp-pm@example.test', 'pm')) v(u, e, r);

-- The inspector's list (TOW, one item), two walls, the OFS history folder and two OFS IRs in it.
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000952');
insert into ids select 'L', (public.rev_list_create('c0000000-0000-0000-0000-000000000951', 'Sample Rated Walls', null, null,
  '[{"number": 0, "name": "TOW", "items": [{"name": "TOW One"}]}]')).id;
insert into ids select 'i1', i.id from public.rev_items i join public.revs v on v.id = i.rev_id where v.list_id = pg_temp.rid('L');
insert into ids select 'w' || a.name, a.id from public.rev_areas_add(pg_temp.rid('L'), 'Level 01', array['A', 'B'], null) a;
insert into ids select 'hist', public.rev_files_folder('c0000000-0000-0000-0000-000000000951', 'history');
reset role;
select pg_temp.add_file('h41', pg_temp.rid('hist'), 'OFS_IR_0041_Attachment.pdf', 2);
select pg_temp.add_file('h52', pg_temp.rid('hist'), 'OFS_IR_0052_Attachment.pdf', 1);

set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000952');
select count(*) from public.rev_signoff_set(pg_temp.rid('wA'), array[pg_temp.rid('i1')], 41, date '2026-09-21', null);
select count(*) from public.rev_signoff_set(pg_temp.rid('wB'), array[pg_temp.rid('i1')], 41, date '2026-09-21', null);
select is(public.rev_file_link(pg_temp.rid('h41')), '{"rooms": 0, "signoffs": 2}'::jsonb, 'OFS 0041''s IR goes to both sign-offs');

-- The same number keeps its IR, whatever else changes.
select is((select file_id from public.rev_signoff_set(pg_temp.rid('wA'), array[pg_temp.rid('i1')], 41, date '2026-09-22', 'Sample note')),
  pg_temp.rid('h41'), 'a new day and a note keep the IR of the same number');
select is(array[(pg_temp.so('wA')).signed_on::text, (pg_temp.so('wA')).note], array['2026-09-22', 'Sample note'], '... and are saved');

-- A changed number drops the old number's IR.
select is((select file_id from public.rev_signoff_set(pg_temp.rid('wA'), array[pg_temp.rid('i1')], 52, date '2026-09-22', null)),
  null::uuid, 'changed to 0052: 0041''s IR is no longer its file');
select is((pg_temp.so('wB')).file_id, pg_temp.rid('h41'), '... the other wall''s 0041 keeps it');
select is(public.rev_file_link(pg_temp.rid('h52')), '{"rooms": 0, "signoffs": 1}'::jsonb, '0052''s IR is linked to it at once');
select is((pg_temp.so('wA')).file_id, pg_temp.rid('h52'), '... and shows');
select is((select file_id from public.rev_signoff_set(pg_temp.rid('wA'), array[pg_temp.rid('i1')], null, date '2026-09-22', null)),
  null::uuid, 'no number: no IR');
select is((select file_id from public.rev_signoff_set(pg_temp.rid('wA'), array[pg_temp.rid('i1')], 41, date '2026-09-21', null)),
  null::uuid, 'back to 0041 (the Undo): nothing until it is linked again');
select is(public.rev_file_link(pg_temp.rid('h41')), '{"rooms": 0, "signoffs": 2}'::jsonb, '... which puts 0041''s IR back');
select is((select count(*)::int from public.rev_signoffs where area_id = pg_temp.rid('wA')), 1, 'one row all along, changed in place');

-- Who may, as before.
select pg_temp.login('a0000000-0000-0000-0000-000000000953');
select throws_ok($$ select public.rev_signoff_set(pg_temp.rid('wA'), array[pg_temp.rid('i1')], 52, null, null) $$, '42501', 'forbidden',
  'a reader (the PM) changes nothing');
select is((pg_temp.so('wA')).ofs_number, 41, '... it stays 0041');
reset role;
set local role anon;
select throws_ok($$ select public.rev_signoff_set('00000000-0000-0000-0000-000000000000', array[]::uuid[], null, null, null) $$,
  '42501', null, 'anon can''t call it');
reset role;

select * from finish();
rollback;
