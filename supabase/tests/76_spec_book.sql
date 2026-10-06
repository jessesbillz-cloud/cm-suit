begin;
select plan(21);
-- The spec book (migration 0088): one upload, split into sections for everyone who may read it. Deny by default, the
-- browser's page text (who may send it, 50 pages a call, done once every page is in), the sections found from SECTION
-- headers (title on the same line or the next), from the page footers when there are no headers, none at all when
-- there are neither, a repeat finding the same rows, and who reads them.
\ir _helpers.psql

select pg_temp.mk_user('a0000000-0000-0000-0000-000000000761', 'probe+sb-admin@example.test', 'Ada Admin');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000762', 'probe+sb-super@example.test', 'Sol Super');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000763', 'probe+sb-viewer@example.test', 'Vic Viewer');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000764', 'probe+sb-out@example.test', 'Oz Outsider');

insert into public.orgs (id, name, kind, created_by) values
  ('b0000000-0000-0000-0000-000000000761', 'Sample Spec Builders', 'gc', 'a0000000-0000-0000-0000-000000000761'),
  ('b0000000-0000-0000-0000-000000000762', 'Sample Other Builders', 'gc', 'a0000000-0000-0000-0000-000000000764');
insert into public.projects (id, org_id, name, stage, timezone, created_by) values
  ('c0000000-0000-0000-0000-000000000761', 'b0000000-0000-0000-0000-000000000761', 'Spec Job J', 'construction',
   'America/Los_Angeles', 'a0000000-0000-0000-0000-000000000761'),
  ('c0000000-0000-0000-0000-000000000762', 'b0000000-0000-0000-0000-000000000762', 'Other Job X', 'construction',
   'America/Los_Angeles', 'a0000000-0000-0000-0000-000000000764');
insert into public.project_members (org_id, project_id, user_id, invite_email, role, status)
select 'b0000000-0000-0000-0000-000000000761', 'c0000000-0000-0000-0000-000000000761', u.id, u.email, m.role, 'active'
  from (values ('a0000000-0000-0000-0000-000000000762'::uuid, 'superintendent'),
               ('a0000000-0000-0000-0000-000000000763'::uuid, 'viewer')) m (uid, role)
  join auth.users u on u.id = m.uid;

-- Three books in J's Specs folder (all added by the admin): A read by the browser, F and N read by the server.
insert into public.files (id, org_id, project_id, folder_id, storage_path, original_name, mime, created_by, scan_status,
                          upload_complete, text_status, page_count)
select v.id, 'b0000000-0000-0000-0000-000000000761', 'c0000000-0000-0000-0000-000000000761',
       (select id from public.folders where project_id = 'c0000000-0000-0000-0000-000000000761' and kind = 'specs' limit 1),
       v.path, v.name, 'application/pdf', 'a0000000-0000-0000-0000-000000000761', 'clean', true, 'pending', null
  from (values ('e0000000-0000-0000-0000-000000000761'::uuid, 'test/sb/a.pdf', 'Sample Manual A.pdf'),
               ('e0000000-0000-0000-0000-000000000762'::uuid, 'test/sb/f.pdf', 'Sample Manual F.pdf'),
               ('e0000000-0000-0000-0000-000000000763'::uuid, 'test/sb/n.pdf', 'Sample Manual N.pdf')) v (id, path, name);

-- ---------------------------------------------------------------------------------------------------------------------
-- Deny by default
-- ---------------------------------------------------------------------------------------------------------------------
select ok((select relrowsecurity from pg_class where oid = 'public.spec_sections'::regclass), 'spec_sections: RLS on');
select ok(not has_table_privilege('anon', 'public.spec_sections', 'select')
          and not has_table_privilege('authenticated', 'public.spec_sections', 'insert')
          and not has_table_privilege('authenticated', 'public.spec_sections', 'update'),
  'spec_sections: anon reads nothing, people write nothing');
select ok(not has_function_privilege('anon', 'public.spec_book_pages_save(uuid, integer, jsonb)', 'execute')
          and not has_function_privilege('anon', 'public.spec_books(uuid)', 'execute')
          and not has_function_privilege('authenticated', 'public.spec_sections_find(uuid)', 'execute'),
  'anon calls nothing, the finder is internal');

-- ---------------------------------------------------------------------------------------------------------------------
-- The browser sends book A's text: SECTION headers
-- ---------------------------------------------------------------------------------------------------------------------
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000764');
select throws_ok($$ select public.spec_book_pages_save('e0000000-0000-0000-0000-000000000761', 4, '[]') $$, 'P0002', null,
  'someone off the job: the book is not there');
select pg_temp.login('a0000000-0000-0000-0000-000000000763');
select throws_ok($$ select public.spec_book_pages_save('e0000000-0000-0000-0000-000000000761', 4, '[]') $$, '42501', null,
  'a viewer may not send a book''s text');
select pg_temp.login('a0000000-0000-0000-0000-000000000761');
select throws_ok($$ select public.spec_book_pages_save('e0000000-0000-0000-0000-000000000761', 4,
                          (select jsonb_agg(jsonb_build_object('page', 1, 'text', '')) from generate_series(1, 51))) $$,
  '22023', null, 'at most 50 pages a call');
select is(public.spec_book_pages_save('e0000000-0000-0000-0000-000000000761', 4, jsonb_build_array(
    jsonb_build_object('page', 1, 'text', E'SAMPLE PROJECT 100\nSECTION 09 21 16\n\nGYPSUM BOARD ASSEMBLIES\nPART 1 - GENERAL\n1.1 SUMMARY\n\nSAMPLE PROJECT 100        09 21 16 - 1'),
    jsonb_build_object('page', 2, 'text', E'PART 2 - PRODUCTS\nSee Section 09 29 00.\n\n09 21 16 - 2'))), null::int,
  'half the pages in: not done yet');
select is((select text_status from public.files where id = 'e0000000-0000-0000-0000-000000000761'), 'pending',
  'the text is not done until every page is in');
select is(public.spec_book_pages_save('e0000000-0000-0000-0000-000000000761', 4, jsonb_build_array(
    jsonb_build_object('page', 3, 'text', E'SECTION 092900 - GYPSUM BOARD\nPART 1 - GENERAL\nEND OF SECTION 09 29 00'),
    jsonb_build_object('page', 4, 'text', E'  SECTION 10 28 00\nPART 1 - GENERAL\nCoordinate with Section 06 10 00.'),
    jsonb_build_object('page', 99, 'text', 'past the last page'))), 3,
  'the last pages in: the text is done and three sections are found');
select results_eq($$ select section, title, first_page, last_page, found_by from public.spec_sections
                      where file_id = 'e0000000-0000-0000-0000-000000000761' order by first_page $$,
  $$ values ('09 21 16'::text, 'Gypsum Board Assemblies'::text, 1, 2, 'header'::text),
            ('09 29 00', 'Gypsum Board', 3, 3, 'header'),
            ('10 28 00', 'Toilet, Bath, and Laundry Accessories', 4, 4, 'header') $$,
  'headers: the title on the next line or the same one, in the library''s words; none found takes the library''s');
select is((select count(*)::int from public.file_pages where file_id = 'e0000000-0000-0000-0000-000000000761'), 4,
  'a page past the count is not kept');
select is(public.spec_book_pages_save('e0000000-0000-0000-0000-000000000761', 4, '[{"page": 1, "text": "changed"}]'), 3,
  'a book whose text is done answers its sections and is not written again');
select is((select text from public.file_pages where file_id = 'e0000000-0000-0000-0000-000000000761' and page_no = 1) like 'SAMPLE PROJECT%',
  true, 'its page text is unchanged');

-- ---------------------------------------------------------------------------------------------------------------------
-- Book F: no headers, the footers say where each section is. Book N: neither.
-- ---------------------------------------------------------------------------------------------------------------------
reset role;
insert into public.file_pages (file_id, project_id, page_no, text) values
  ('e0000000-0000-0000-0000-000000000762', 'c0000000-0000-0000-0000-000000000761', 1, E'DIVISION 09 - FINISHES'),
  ('e0000000-0000-0000-0000-000000000762', 'c0000000-0000-0000-0000-000000000761', 2,
   E'PART 1 - GENERAL\nWork included.\n\nACOUSTICAL PANEL CEILINGS          09 51 13 - 1'),
  ('e0000000-0000-0000-0000-000000000762', 'c0000000-0000-0000-0000-000000000761', 3,
   E'PART 3 - EXECUTION\n\nACOUSTICAL PANEL CEILINGS          09 51 13 - 2'),
  ('e0000000-0000-0000-0000-000000000762', 'c0000000-0000-0000-0000-000000000761', 4,
   E'PART 1 - GENERAL\n\n095113-9 is not here\n09 65 13 - 1        SAMPLE SCHOOL'),
  ('e0000000-0000-0000-0000-000000000762', 'c0000000-0000-0000-0000-000000000761', 5,
   E'PART 2 - PRODUCTS\n\n09 65 13 - Page 2 of 2        SAMPLE SCHOOL'),
  ('e0000000-0000-0000-0000-000000000762', 'c0000000-0000-0000-0000-000000000761', 6,
   E'PART 1 - GENERAL\n\n09 91 23 - 1        SAMPLE SCHOOL'),
  ('e0000000-0000-0000-0000-000000000763', 'c0000000-0000-0000-0000-000000000761', 1, E'PROJECT MANUAL\nTable of contents'),
  ('e0000000-0000-0000-0000-000000000763', 'c0000000-0000-0000-0000-000000000761', 2, E'General conditions\nPage 2');
update public.files set text_status = 'done', page_count = 6 where id = 'e0000000-0000-0000-0000-000000000762';
update public.files set text_status = 'done', page_count = 2 where id = 'e0000000-0000-0000-0000-000000000763';

select results_eq($$ select section, title, first_page, last_page, found_by from public.spec_sections
                      where file_id = 'e0000000-0000-0000-0000-000000000762' order by first_page $$,
  $$ values ('09 51 13'::text, 'Acoustical Panel Ceilings'::text, 2, 3, 'footer'::text),
            ('09 65 13', 'Resilient Base and Accessories', 4, 5, 'footer'),
            ('09 91 23', 'Interior Painting', 6, 6, 'footer') $$,
  'footers: a section starts where its number first shows, and a name on every footer is not a title');
select is_empty($$ select 1 from public.spec_sections where file_id = 'e0000000-0000-0000-0000-000000000763' $$,
  'neither headers nor footers: no sections');

select is(public.spec_sections_find('e0000000-0000-0000-0000-000000000762'), 3, 'found again: the same three');
select is((select count(*)::int from public.spec_sections where file_id = 'e0000000-0000-0000-0000-000000000762'), 3,
  'a repeat adds no rows');

update public.file_pages set text = E'SECTION 09 51 00 - CEILINGS\nPART 1'
 where file_id = 'e0000000-0000-0000-0000-000000000762' and page_no = 2;
select is((select string_agg(section || ':' || first_page, ',' order by first_page) from public.spec_sections
            where file_id = 'e0000000-0000-0000-0000-000000000762' and not replaced),
  '09 51 00:2,09 51 13:3,09 65 13:4,09 91 23:6', 'new page text on a done book finds the sections again');

-- ---------------------------------------------------------------------------------------------------------------------
-- Who reads them
-- ---------------------------------------------------------------------------------------------------------------------
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000762');
select results_eq($$ select file_name, text_ready, can_send, jsonb_array_length(sections)
                      from public.spec_books('c0000000-0000-0000-0000-000000000761') $$,
  $$ values ('Sample Manual A.pdf'::text, true, false, 3), ('Sample Manual F.pdf', true, false, 4),
            ('Sample Manual N.pdf', true, false, 0) $$,
  'a member reads every book with its sections (no need to send what is read)');
select is((select sections->0 from public.spec_books('c0000000-0000-0000-0000-000000000761') limit 1),
  '{"section": "09 21 16", "title": "Gypsum Board Assemblies", "first_page": 1, "last_page": 2}'::jsonb,
  'a section: number, title, first and last page');
select pg_temp.login('a0000000-0000-0000-0000-000000000764');
select ok(not exists (select 1 from public.spec_books('c0000000-0000-0000-0000-000000000761'))
          and not exists (select 1 from public.spec_sections),
  'someone off the job reads no book and no section');

select * from finish();
rollback;
