begin;
select plan(29);
-- Migration 0105 (Jesse, Oct 12: "determine the section and then put it somewhere in the title, hidden if we had to"):
-- files.spec_section, 6 digits or null, set only through file_spec_section_set (version-checked) and
-- file_spec_sections_fill (fills files with none, skips the rest), by someone who may see the file and add to it.
-- Audited. Read with the file. Nobody writes it straight.
\ir _helpers.psql

create temp table ids (k text primary key, v uuid);
grant all on ids to public;
create temp table got (k text primary key, n int);
grant all on got to public;
create function pg_temp.rid(p_k text) returns uuid language sql stable as $$ select v from ids where k = p_k $$;
create function pg_temp.section_of(p_k text) returns text language sql stable security definer as $$
  select spec_section from public.files where id = (select v from ids where k = p_k) $$;
create function pg_temp.version_of(p_k text) returns int language sql stable security definer as $$
  select version from public.files where id = (select v from ids where k = p_k) $$;
create function pg_temp.audits_of(p_k text) returns int language sql stable security definer as $$
  select count(*)::int from public.audit_events where action = 'file.spec_section' and entity_id = (select v from ids where k = p_k) $$;
create function pg_temp.fill(p_uid uuid, p_k text, p_section text) returns int language plpgsql as $$
begin
  perform pg_temp.login(p_uid);
  return public.file_spec_sections_fill(jsonb_build_array(jsonb_build_object('file_id', pg_temp.rid(p_k), 'section', p_section)));
end $$;
grant execute on all functions in schema pg_temp to public;

select pg_temp.mk_user('a0000000-0000-0000-0000-000000000921', 'probe+ss-admin@example.test', 'Ada Admin');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000922', 'probe+ss-pm@example.test', 'Pia PM');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000923', 'probe+ss-viewer@example.test', 'Vic Viewer');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000924', 'probe+ss-out@example.test', 'Otto Outsider');

insert into public.orgs (id, name, kind, created_by) values
  ('b0000000-0000-0000-0000-000000000921', 'Sample Section Builders', 'gc', 'a0000000-0000-0000-0000-000000000921');
insert into public.projects (id, org_id, name, stage, timezone, created_by) values
  ('c0000000-0000-0000-0000-000000000921', 'b0000000-0000-0000-0000-000000000921', 'Sample Section Job', 'construction',
   'America/Los_Angeles', 'a0000000-0000-0000-0000-000000000921');
insert into public.project_members (org_id, project_id, user_id, invite_email, role, status)
select 'b0000000-0000-0000-0000-000000000921', 'c0000000-0000-0000-0000-000000000921', u::uuid, e, r, 'active'
  from (values ('a0000000-0000-0000-0000-000000000922', 'probe+ss-pm@example.test', 'pm'),
               ('a0000000-0000-0000-0000-000000000923', 'probe+ss-viewer@example.test', 'viewer')) v(u, e, r);

set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000922');
insert into ids select 's_' || s.kind, s.folder_id from public.files_sections('c0000000-0000-0000-0000-000000000921') s;
reset role;
insert into public.files (id, org_id, project_id, folder_id, storage_path, original_name, mime, created_by, scan_status, upload_complete)
select v.id::uuid, 'b0000000-0000-0000-0000-000000000921', 'c0000000-0000-0000-0000-000000000921', pg_temp.rid('s_submittals'),
       'test/sect/' || v.name, v.name, 'application/pdf', 'a0000000-0000-0000-0000-000000000922', 'clean', v.done
  from (values
    ('e0000000-0000-0000-0000-000000000921', 'Shop drawings.pdf', true),
    ('e0000000-0000-0000-0000-000000000922', '092900_Sample board.pdf', true),
    ('e0000000-0000-0000-0000-000000000923', 'Sample unfinished.pdf', false)
  ) as v (id, name, done);
insert into ids values
  ('shop', 'e0000000-0000-0000-0000-000000000921'), ('named', 'e0000000-0000-0000-0000-000000000922'),
  ('unfinished', 'e0000000-0000-0000-0000-000000000923');

-- The column.
select throws_ok($$ update public.files set spec_section = '09 29 00' where id = 'e0000000-0000-0000-0000-000000000921' $$,
  '23514', null, 'the column takes 6 digits only');
select throws_ok($$ update public.files set spec_section = '992900' where id = 'e0000000-0000-0000-0000-000000000921' $$,
  '23514', null, 'Divisions 00 to 49 only');
select ok(exists (select 1 from pg_indexes where schemaname = 'public' and tablename = 'files' and indexname = 'files_spec_section'),
  'indexed per job');

set local role authenticated;

-- Nobody writes it straight.
select pg_temp.login('a0000000-0000-0000-0000-000000000922');
select throws_ok($$ update public.files set spec_section = '092900' where id = 'e0000000-0000-0000-0000-000000000921' $$,
  '42501', null, 'the uploader can not write the column straight');
select throws_ok($$ insert into public.files (org_id, project_id, folder_id, storage_path, original_name, mime, created_by, spec_section)
  values ('b0000000-0000-0000-0000-000000000921', 'c0000000-0000-0000-0000-000000000921',
          (select v from ids where k = 's_submittals'), 'test/sect/direct.pdf', 'Direct.pdf', 'application/pdf',
          'a0000000-0000-0000-0000-000000000922', '092900') $$,
  '42501', null, 'an insert that carries a section is refused');

-- Fill: the files with none, by the uploader, once.
insert into got values ('named_before', pg_temp.version_of('named'));
select is(pg_temp.fill('a0000000-0000-0000-0000-000000000922', 'named', '092900'), 1, 'fill: the uploader sets it');
select is(pg_temp.fill('a0000000-0000-0000-0000-000000000922', 'named', '092900'), 0, 'fill: safe to repeat');
select is(pg_temp.fill('a0000000-0000-0000-0000-000000000922', 'named', '055000'), 0, 'fill: never overwrites');
select is(pg_temp.section_of('named'), '092900', 'fill: stored');
select is(pg_temp.version_of('named'), (select n from got where k = 'named_before'), 'fill: the version Delete and Move read still holds');
select is(pg_temp.fill('a0000000-0000-0000-0000-000000000922', 'unfinished', '092900'), 0, 'fill: not an unfinished upload');
select is(pg_temp.fill('a0000000-0000-0000-0000-000000000923', 'shop', '092900'), 0, 'fill: a reader who can not add here is skipped');
select is(pg_temp.fill('a0000000-0000-0000-0000-000000000924', 'shop', '092900'), 0, 'fill: someone not on the job is skipped');
select is(pg_temp.section_of('shop'), null, 'fill: the skipped file has none');
select pg_temp.login('a0000000-0000-0000-0000-000000000922');
select throws_ok($$ select public.file_spec_sections_fill('[{"file_id": "e0000000-0000-0000-0000-000000000921", "section": "09 29 00"}]') $$,
  '22023', null, 'fill: an item is a file and 6 digits');
select throws_ok($$ select public.file_spec_sections_fill((select jsonb_agg(jsonb_build_object('file_id', gen_random_uuid(), 'section', '092900'))
                                                             from generate_series(1, 501))) $$,
  '22023', null, 'fill: at most 500 a call');

-- Set: version-checked, safe to repeat, can clear.
select pg_temp.login('a0000000-0000-0000-0000-000000000922');
select throws_ok(format('select public.file_spec_section_set(%L, %s, %L)', pg_temp.rid('shop'), pg_temp.version_of('shop') + 1, '092900'),
  '40001', null, 'set: a stale version is refused');
insert into got values ('before', pg_temp.version_of('shop'));
insert into got select 'set', public.file_spec_section_set(pg_temp.rid('shop'), pg_temp.version_of('shop'), '092900');
select is((select n from got where k = 'set'), pg_temp.version_of('shop'), 'set: answers the version');
select ok((select n from got where k = 'set') = (select n from got where k = 'before') and pg_temp.section_of('shop') = '092900',
  'set: stored, and the section alone is not a new version');
select is(public.file_spec_section_set(pg_temp.rid('shop'), 1, '092900'), pg_temp.version_of('shop'),
  'set: the same section again answers its version');
select throws_ok(format('select public.file_spec_section_set(%L, %s, %L)', pg_temp.rid('shop'), pg_temp.version_of('shop'), '12345'),
  '22023', null, 'set: 6 digits only');
select pg_temp.login('a0000000-0000-0000-0000-000000000923');
select is((select spec_section from public.files where id = 'e0000000-0000-0000-0000-000000000921'), '092900',
  'read with the file (the viewer reads Submittals)');
select throws_ok(format('select public.file_spec_section_set(%L, %s, null)', pg_temp.rid('shop'), pg_temp.version_of('shop')),
  '42501', null, 'set: a reader who can not add here is refused');
select pg_temp.login('a0000000-0000-0000-0000-000000000924');
select throws_ok(format('select public.file_spec_section_set(%L, %s, null)', pg_temp.rid('shop'), pg_temp.version_of('shop')),
  'P0002', null, 'set: not there for someone not on the job');
select pg_temp.login('a0000000-0000-0000-0000-000000000922');
select lives_ok(format('select public.file_spec_section_set(%L, %s, null)', pg_temp.rid('shop'), pg_temp.version_of('shop')),
  'set: clears');
select is(pg_temp.section_of('shop'), null, 'set: cleared');
reset role;

select is(pg_temp.audits_of('shop') + pg_temp.audits_of('named'), 3, 'every change is audited');
select ok(has_function_privilege('authenticated', 'public.file_spec_section_set(uuid, int, text)', 'EXECUTE')
          and has_function_privilege('authenticated', 'public.file_spec_sections_fill(jsonb)', 'EXECUTE')
          and not has_function_privilege('anon', 'public.file_spec_sections_fill(jsonb)', 'EXECUTE'),
  'the two writes are for signed-in people only');
select ok(not has_function_privilege('authenticated', 'public.file_spec_section_may(uuid)', 'EXECUTE'),
  'file_spec_section_may stays internal');

select * from finish();
rollback;
