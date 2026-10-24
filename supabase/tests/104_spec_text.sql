begin;
select plan(30);
-- The spec book as text (migration 0118): deny by default, a Specs PDF queued when it lands, the server reading its
-- pages and parsing its sections (safe to repeat, again only when a section's pages change), a scan with no text, and
-- who reads a section's text (whoever may read the book's file, its folder's access list included).
\ir _helpers.psql

select pg_temp.mk_user('a0000000-0000-0000-0000-000000001041', 'probe+st-admin@example.test', 'Ada Admin');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000001042', 'probe+st-super@example.test', 'Sol Super');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000001043', 'probe+st-out@example.test', 'Oz Outsider');

insert into public.orgs (id, name, kind, created_by) values
  ('b0000000-0000-0000-0000-000000001041', 'Sample Text Builders', 'gc', 'a0000000-0000-0000-0000-000000001041');
insert into public.projects (id, org_id, name, stage, timezone, created_by) values
  ('c0000000-0000-0000-0000-000000001041', 'b0000000-0000-0000-0000-000000001041', 'Text Job T', 'construction',
   'America/Los_Angeles', 'a0000000-0000-0000-0000-000000001041');
insert into public.project_members (org_id, project_id, user_id, invite_email, role, status)
select 'b0000000-0000-0000-0000-000000001041', 'c0000000-0000-0000-0000-000000001041', u.id, u.email, 'superintendent', 'active'
  from auth.users u where u.id = 'a0000000-0000-0000-0000-000000001042';

create temp table ids as
select (select id from public.folders where project_id = 'c0000000-0000-0000-0000-000000001041' and kind = 'specs' limit 1) as specs,
       (select id from public.folders where project_id = 'c0000000-0000-0000-0000-000000001041' and kind = 'plans' limit 1) as plans;
grant select on ids to public;

-- ---------------------------------------------------------------------------------------------------------------------
-- Deny by default
-- ---------------------------------------------------------------------------------------------------------------------
select ok((select relrowsecurity from pg_class where oid = 'public.spec_section_texts'::regclass)
          and (select relrowsecurity from pg_class where oid = 'public.spec_text_queue'::regclass), 'both tables: RLS on');
select ok(not has_table_privilege('anon', 'public.spec_section_texts', 'select')
          and not has_table_privilege('authenticated', 'public.spec_section_texts', 'insert')
          and not has_table_privilege('authenticated', 'public.spec_section_texts', 'update')
          and not has_table_privilege('service_role', 'public.spec_section_texts', 'insert'),
  'section texts: anon reads nothing, nobody writes them straight');
select ok(not has_table_privilege('authenticated', 'public.spec_text_queue', 'select')
          and not has_table_privilege('service_role', 'public.spec_text_queue', 'select'),
  'the queue: nobody reads it straight');
select ok(not has_function_privilege('authenticated', 'public.spec_text_claim()', 'execute')
          and not has_function_privilege('authenticated', 'public.spec_text_save(uuid, jsonb)', 'execute')
          and not has_function_privilege('authenticated', 'public.spec_text_todo(uuid, integer, integer)', 'execute')
          and has_function_privilege('service_role', 'public.spec_text_claim()', 'execute')
          and not has_function_privilege('service_role', 'public.spec_text_enqueue_project(uuid)', 'execute')
          and not has_function_privilege('anon', 'public.spec_section_read(uuid, integer)', 'execute')
          and has_function_privilege('authenticated', 'public.spec_section_read(uuid, integer)', 'execute'),
  'the steps are the server''s, the one-time call the owner''s, people read sections only');

-- ---------------------------------------------------------------------------------------------------------------------
-- Queued when it lands
-- ---------------------------------------------------------------------------------------------------------------------
insert into public.files (id, org_id, project_id, folder_id, storage_path, original_name, mime, created_by, scan_status,
                          upload_complete)
select v.id, 'b0000000-0000-0000-0000-000000001041', 'c0000000-0000-0000-0000-000000001041', v.folder, v.path, v.name,
       'application/pdf', 'a0000000-0000-0000-0000-000000001041', v.scan, true
  from ids, lateral (values
    ('e0000000-0000-0000-0000-000000001041'::uuid, ids.specs, 'test/st/v1.pdf', 'Sample Volume 1.pdf', 'clean'),
    ('e0000000-0000-0000-0000-000000001042'::uuid, ids.specs, 'test/st/scan.pdf', 'Sample Scan.pdf', 'pending'),
    ('e0000000-0000-0000-0000-000000001043'::uuid, ids.plans, 'test/st/plan.pdf', 'Sample Plans.pdf', 'clean')) v (id, folder, path, name, scan);

select results_eq($$ select file_id, status, next_page from public.spec_text_queue order by file_id $$,
  $$ values ('e0000000-0000-0000-0000-000000001041'::uuid, 'queued'::text, 1) $$,
  'a clean Specs PDF is queued, a plan and an unscanned book are not');
update public.files set scan_status = 'clean' where id = 'e0000000-0000-0000-0000-000000001042';
select is((select status from public.spec_text_queue where file_id = 'e0000000-0000-0000-0000-000000001042'), 'queued',
  'its scan coming back clean queues the book');

-- ---------------------------------------------------------------------------------------------------------------------
-- The server reads book 1: three pages, two sections
-- ---------------------------------------------------------------------------------------------------------------------
set local role service_role;
select pg_temp.login_service();
select is((select file_id from public.spec_text_claim()), 'e0000000-0000-0000-0000-000000001041'::uuid,
  'the oldest waiting book is claimed');
select is((select file_id from public.spec_text_claim()), 'e0000000-0000-0000-0000-000000001042'::uuid,
  'the next claim hands out the next book, never the one being read');
select is(public.spec_text_pages_put('e0000000-0000-0000-0000-000000001041', 3, jsonb_build_array(
    jsonb_build_object('page', 1, 'text', E'SAMPLE SCHOOL\nSECTION 09 29 00\nGYPSUM BOARD\nPART 1 - GENERAL\n1.01 SUMMARY\nA. Section includes board.\n09 29 00 - 1'),
    jsonb_build_object('page', 2, 'text', E'SAMPLE SCHOOL\nPART 2 - PRODUCTS\n2.01 BOARD\nA. Type X.\nEND OF SECTION\n09 29 00 - 2')), 3),
  'more', 'two of three pages in: more to read');
reset role;
select is((select next_page || ':' || status from public.spec_text_queue where file_id = 'e0000000-0000-0000-0000-000000001041'),
  '3:queued', 'the queue remembers the next page and hands the book out again');
select is((select text_status from public.files where id = 'e0000000-0000-0000-0000-000000001041'), 'pending', 'not done yet');
set local role service_role;
select pg_temp.login_service();
select is(public.spec_text_pages_put('e0000000-0000-0000-0000-000000001041', 3, jsonb_build_array(
    jsonb_build_object('page', 3, 'text', E'SAMPLE SCHOOL\nSECTION 10 28 00\nTOILET ACCESSORIES\nPART 1 - GENERAL\n10 28 00 - 1')), 4),
  'done', 'the last page in: the text is done');
select results_eq($$ select section, first_page, last_page from public.spec_sections
                      where file_id = 'e0000000-0000-0000-0000-000000001041' and not replaced order by first_page $$,
  $$ values ('09 29 00'::text, 1, 2), ('10 28 00', 3, 3) $$, 'the sections are found from the server''s text');
select is((public.spec_text_running('e0000000-0000-0000-0000-000000001041')->'lines'->>'SAMPLE SCHOOL')::int, 3,
  'a line at the top of every page is a running head');

select is((select count(*)::int from public.spec_text_todo('e0000000-0000-0000-0000-000000001041', 1, 20)), 2,
  'both sections wait to be parsed');
select is((select jsonb_array_length(pages) from public.spec_text_todo('e0000000-0000-0000-0000-000000001041', 1, 20)
            where section = '09 29 00'), 2, 'a section comes with its own pages');
select is(public.spec_text_save('e0000000-0000-0000-0000-000000001041', (
    select jsonb_agg(jsonb_build_object('spec_section_id', t.spec_section_id, 'source_hash', t.source_hash, 'parser', 1,
                                        'status', 'done', 'body', jsonb_build_array(jsonb_build_object('k', 'part', 'n', '1', 't', 'GENERAL'))))
      from public.spec_text_todo('e0000000-0000-0000-0000-000000001041', 1, 20) t)), 2, 'both saved');
select is((select count(*)::int from public.spec_text_todo('e0000000-0000-0000-0000-000000001041', 1, 20)), 0,
  'nothing left: a repeat parses nothing');
select is((select count(*)::int from public.spec_text_todo('e0000000-0000-0000-0000-000000001041', 2, 20)), 2,
  'a new parser parses them again');
select is(public.spec_text_save('e0000000-0000-0000-0000-000000001042', (
    select jsonb_agg(jsonb_build_object('spec_section_id', t.spec_section_id, 'source_hash', t.source_hash, 'parser', 2,
                                        'status', 'done', 'body', '[]'::jsonb))
      from public.spec_text_todo('e0000000-0000-0000-0000-000000001041', 2, 20) t)), 0,
  'another book''s sections are not saved under this one');
select lives_ok($$ select public.spec_text_end('e0000000-0000-0000-0000-000000001041', 'done', null) $$, 'the run ends');

-- A changed page: only its section is parsed again.
reset role;
update public.file_pages set text = text || E'\nB. Level 4 finish.'
 where file_id = 'e0000000-0000-0000-0000-000000001041' and page_no = 2;
set local role service_role;
select pg_temp.login_service();
select results_eq($$ select section from public.spec_text_todo('e0000000-0000-0000-0000-000000001041', 1, 20) $$,
  $$ values ('09 29 00'::text) $$, 'a changed page: its section waits again, the other does not');

-- The scan: no page has any text.
select is(public.spec_text_pages_put('e0000000-0000-0000-0000-000000001042', 2,
    '[{"page": 1, "text": "  "}, {"page": 2, "text": ""}]'::jsonb, 3), 'none', 'no text on any page');
reset role;
select is((select f.text_status || ':' || q.status from public.files f join public.spec_text_queue q on q.file_id = f.id
            where f.id = 'e0000000-0000-0000-0000-000000001042'), 'none:done', 'the scan is marked none and leaves the queue');

-- ---------------------------------------------------------------------------------------------------------------------
-- Who reads it
-- ---------------------------------------------------------------------------------------------------------------------
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000001042');
select is((select status || ':' || (body->0->>'k') from public.spec_section_read('e0000000-0000-0000-0000-000000001041', 1)),
  'done:part', 'a member who reads Specs reads the section''s text');
select is((select count(*)::int from public.spec_section_texts), 2, 'and the rows');
select pg_temp.login('a0000000-0000-0000-0000-000000001043');
select ok(not exists (select 1 from public.spec_section_read('e0000000-0000-0000-0000-000000001041', 1))
          and not exists (select 1 from public.spec_section_texts), 'someone off the job reads nothing');

-- Specs' own access list: only the admin. The super reads no text, the same as the file.
reset role;
insert into public.folder_access (folder_id, user_id, can_read) select specs, 'a0000000-0000-0000-0000-000000001041', true from ids;
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000001042');
select ok(not exists (select 1 from public.spec_section_texts)
          and not exists (select 1 from public.spec_section_read('e0000000-0000-0000-0000-000000001041', 1)),
  'a folder the member may not read: no text either');
select pg_temp.login('a0000000-0000-0000-0000-000000001041');
select is((select status from public.spec_section_read('e0000000-0000-0000-0000-000000001041', 3)), 'done',
  'the one on the list reads it');

reset role;
select set_config('request.jwt.claims', '', true), set_config('request.jwt.claim.role', '', true);
select is(public.spec_text_enqueue_project('c0000000-0000-0000-0000-000000001041'), 2,
  'the one-time call queues every spec book on the job');

select * from finish();
rollback;
