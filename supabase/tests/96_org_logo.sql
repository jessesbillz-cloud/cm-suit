begin;
select plan(46);
-- Migration 0110 (Jesse, Oct 4: "a place to upload the company logo / letterhead / address so every generated document
-- comes out on it"). A company's admins set its letterhead (version check, safe to repeat, audited) and its logo (at most
-- 1 MB, PNG or JPEG). The job's manager picks the job's brand among the job's companies (audited). Anyone on the job
-- reads the brand of the companies on it, nobody else does.
\ir _helpers.psql

create function pg_temp.audits(p_action text, p_entity uuid) returns int language sql volatile security definer as $$
  select count(*)::int from public.audit_events where action = p_action and entity_id = p_entity $$;
create function pg_temp.brand_col() returns uuid language sql volatile security definer as $$
  select brand_org_id from public.projects where id = 'c0000000-0000-0000-0000-000000000961' $$;
grant execute on all functions in schema pg_temp to public;

-- Ada runs the GC (and the fire office, which is not on the job yet), Sam is a sub on the job for his company, Vic views
-- the job, Otto is on no job and runs his own company.
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000961', 'probe+brand-ada@example.test', 'Ada Admin');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000962', 'probe+brand-sam@example.test', 'Sam Sub');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000963', 'probe+brand-vic@example.test', 'Vic Viewer');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000964', 'probe+brand-otto@example.test', 'Otto Outside');

insert into public.orgs (id, name, kind, created_by) values
  ('b0000000-0000-0000-0000-000000000961', 'Sample Brand Builders', 'gc', 'a0000000-0000-0000-0000-000000000961'),
  ('b0000000-0000-0000-0000-000000000962', 'Sample Sub Co', 'sub', 'a0000000-0000-0000-0000-000000000962'),
  ('b0000000-0000-0000-0000-000000000963', 'Sample Fire Office', 'owner', 'a0000000-0000-0000-0000-000000000961'),
  ('b0000000-0000-0000-0000-000000000964', 'Sample Outside Co', 'other', 'a0000000-0000-0000-0000-000000000964');
insert into public.projects (id, org_id, name, stage, created_by) values
  ('c0000000-0000-0000-0000-000000000961', 'b0000000-0000-0000-0000-000000000961', 'Brand Job', 'construction',
   'a0000000-0000-0000-0000-000000000961');
insert into public.project_members (org_id, project_id, user_id, invite_email, member_org_id, role, status, created_by) values
  ('b0000000-0000-0000-0000-000000000961', 'c0000000-0000-0000-0000-000000000961', 'a0000000-0000-0000-0000-000000000962',
   'probe+brand-sam@example.test', 'b0000000-0000-0000-0000-000000000962', 'sub', 'active', 'a0000000-0000-0000-0000-000000000961'),
  ('b0000000-0000-0000-0000-000000000961', 'c0000000-0000-0000-0000-000000000961', 'a0000000-0000-0000-0000-000000000963',
   'probe+brand-vic@example.test', null, 'viewer', 'active', 'a0000000-0000-0000-0000-000000000961');

-- ---------------------------------------------------------------------------------------------------------------------
-- The shape
-- ---------------------------------------------------------------------------------------------------------------------
select results_eq($$ select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'org-logos' $$,
  $$ values (false, 1048576::bigint, array['image/png', 'image/jpeg']) $$, 'org-logos: private, 1 MB, PNG or JPEG');
select ok(not has_table_privilege('authenticated', 'public.org_letterheads', 'INSERT')
          and not has_table_privilege('authenticated', 'public.org_letterheads', 'UPDATE')
          and not has_table_privilege('authenticated', 'public.org_letterheads', 'DELETE'),
  'letterhead: people write it only through set_org_letterhead');
select ok(not has_column_privilege('authenticated', 'public.projects', 'brand_org_id', 'UPDATE')
          and not has_column_privilege('authenticated', 'public.projects', 'brand_org_id', 'INSERT'),
  'brand: people set it only through set_job_brand');

set local role authenticated;

-- ---------------------------------------------------------------------------------------------------------------------
-- Who may set the letterhead
-- ---------------------------------------------------------------------------------------------------------------------
select pg_temp.login('a0000000-0000-0000-0000-000000000962');
select throws_ok($$ select public.set_org_letterhead('b0000000-0000-0000-0000-000000000961', 0, 'X', null, null, null) $$,
  '42501', null, 'letterhead: a sub on the job cannot set the GC''s');
select pg_temp.login('a0000000-0000-0000-0000-000000000963');
select throws_ok($$ select public.set_org_letterhead('b0000000-0000-0000-0000-000000000961', 0, 'X', null, null, null) $$,
  '42501', null, 'letterhead: a viewer cannot');

select pg_temp.login('a0000000-0000-0000-0000-000000000961');
select is((public.set_org_letterhead('b0000000-0000-0000-0000-000000000961', 0, '  Sample Brand Builders, Inc. ',
          '100 Sample Way, Sample City', '', null)).version, 1, 'letterhead: the company''s admin sets it');
select results_eq($$ select print_name, address, phone, website from public.org_letterheads
                     where org_id = 'b0000000-0000-0000-0000-000000000961' $$,
  $$ values ('Sample Brand Builders, Inc.'::text, '100 Sample Way, Sample City'::text, null::text, null::text) $$,
  'letterhead: trimmed, blanks are none');
select is(pg_temp.audits('org.letterhead', 'b0000000-0000-0000-0000-000000000961'), 1, 'letterhead: audited');
select is((public.set_org_letterhead('b0000000-0000-0000-0000-000000000961', 0, 'Sample Brand Builders, Inc.',
          '100 Sample Way, Sample City', null, null)).version, 1, 'letterhead: the same values again are the row as it is');
select is(pg_temp.audits('org.letterhead', 'b0000000-0000-0000-0000-000000000961'), 1, 'letterhead: a retry is not a change');
select throws_ok($$ select public.set_org_letterhead('b0000000-0000-0000-0000-000000000961', 0, 'Other', null, null, null) $$,
  '40001', null, 'letterhead: a change on an old version is refused');
select is((public.set_org_letterhead('b0000000-0000-0000-0000-000000000961', 1, 'Sample Brand Builders, Inc.',
          '100 Sample Way, Sample City', '(555) 010-0100', 'example.test')).version, 2, 'letterhead: changed on the version seen');
select throws_ok($$ select public.set_org_letterhead('b0000000-0000-0000-0000-000000000961', 2, repeat('x', 121), null, null, null) $$,
  '23514', null, 'letterhead: the name is short');
select throws_ok($$ select public.set_org_letterhead('b0000000-0000-0000-0000-000000000961', 2, 'Two' || chr(10) || 'lines', null, null, null) $$,
  '23514', null, 'letterhead: one line each');
select throws_ok($$ select public.set_org_letterhead('b0000000-0000-0000-0000-000000000961', 2, null, null, repeat('5', 41), null) $$,
  '23514', null, 'letterhead: the phone is short');
select lives_ok($$ select public.set_org_letterhead('b0000000-0000-0000-0000-000000000963', 0, 'Sample Fire Office',
                  '1 Sample Campus Way', null, null) $$, 'letterhead: the fire office''s admin sets its own');
select throws_ok($$ insert into public.org_letterheads (org_id, print_name) values ('b0000000-0000-0000-0000-000000000964', 'X') $$,
  '42501', null, 'letterhead: no direct writes');

-- ---------------------------------------------------------------------------------------------------------------------
-- The logo: size and type
-- ---------------------------------------------------------------------------------------------------------------------
insert into storage.objects (bucket_id, name, metadata) values
  ('org-logos', 'org/b0000000-0000-0000-0000-000000000963/logo', '{"size": 2000000, "mimetype": "image/png"}');
select throws_ok($$ select public.set_org_logo('b0000000-0000-0000-0000-000000000963', 'org/b0000000-0000-0000-0000-000000000963/logo') $$,
  '22023', 'The logo is over 1 MB.', 'logo: at most 1 MB');
update storage.objects set metadata = '{"size": 5000, "mimetype": "image/svg+xml"}'
 where bucket_id = 'org-logos' and name = 'org/b0000000-0000-0000-0000-000000000963/logo';
select throws_ok($$ select public.set_org_logo('b0000000-0000-0000-0000-000000000963', 'org/b0000000-0000-0000-0000-000000000963/logo') $$,
  '22023', 'PNG or JPEG only.', 'logo: never an SVG');
update storage.objects set metadata = '{"size": 5000, "mimetype": "image/png"}'
 where bucket_id = 'org-logos' and name = 'org/b0000000-0000-0000-0000-000000000963/logo';
select is((public.set_org_logo('b0000000-0000-0000-0000-000000000963', 'org/b0000000-0000-0000-0000-000000000963/logo')).logo_path,
  'org/b0000000-0000-0000-0000-000000000963/logo', 'logo: a small PNG is set');
select is(pg_temp.audits('org.logo', 'b0000000-0000-0000-0000-000000000963'), 1, 'logo: audited');

-- ---------------------------------------------------------------------------------------------------------------------
-- Who reads, before the job shows the fire office
-- ---------------------------------------------------------------------------------------------------------------------
select pg_temp.login('a0000000-0000-0000-0000-000000000963');
select is((select count(*)::int from public.org_letterheads where org_id = 'b0000000-0000-0000-0000-000000000961'), 1,
  'read: a viewer on the job reads the job company''s letterhead');
select is((select count(*)::int from public.org_letterheads where org_id = 'b0000000-0000-0000-0000-000000000963'), 0,
  'read: not a company that is not on the job');
select is((select count(*)::int from storage.objects where bucket_id = 'org-logos'), 0, 'read: nor its logo');
select results_eq($$ select name, print_name, phone from public.job_brand('c0000000-0000-0000-0000-000000000961') $$,
  $$ values ('Sample Brand Builders'::text, 'Sample Brand Builders, Inc.'::text, '(555) 010-0100'::text) $$,
  'job_brand: the job''s own company by default');
select throws_ok($$ select * from public.job_brand_choices('c0000000-0000-0000-0000-000000000961') $$, '42501', null,
  'choices: only the job''s manager');
select throws_ok($$ select public.set_job_brand('c0000000-0000-0000-0000-000000000961', 'b0000000-0000-0000-0000-000000000963') $$,
  '42501', null, 'brand: a viewer cannot pick it');

select pg_temp.login('a0000000-0000-0000-0000-000000000964');
select is((select count(*)::int from public.job_brand('c0000000-0000-0000-0000-000000000961')), 0, 'job_brand: nothing off the job');
select is((select count(*)::int from public.org_letterheads), 0, 'read: someone on no job reads no letterhead');

select pg_temp.login('a0000000-0000-0000-0000-000000000962');
select is((select count(*)::int from public.org_letterheads where org_id = 'b0000000-0000-0000-0000-000000000961'), 1,
  'read: a sub on the job reads it too');

-- ---------------------------------------------------------------------------------------------------------------------
-- The manager picks the brand
-- ---------------------------------------------------------------------------------------------------------------------
select pg_temp.login('a0000000-0000-0000-0000-000000000961');
select results_eq($$ select name from public.job_brand_choices('c0000000-0000-0000-0000-000000000961') $$,
  $$ values ('Sample Brand Builders'::text), ('Sample Fire Office'::text), ('Sample Sub Co'::text) $$,
  'choices: the job''s company first, then members'' companies and the companies I run, never others');
select throws_ok($$ select public.set_job_brand('c0000000-0000-0000-0000-000000000961', 'b0000000-0000-0000-0000-000000000964') $$,
  '22023', 'Pick one of the job''s companies.', 'brand: not a company off the job');
select throws_ok($$ update public.projects set brand_org_id = 'b0000000-0000-0000-0000-000000000963'
                    where id = 'c0000000-0000-0000-0000-000000000961' $$, '42501', null, 'brand: no direct write');
select is(public.set_job_brand('c0000000-0000-0000-0000-000000000961', 'b0000000-0000-0000-0000-000000000963'),
  'b0000000-0000-0000-0000-000000000963'::uuid, 'brand: the manager picks the fire office');
select is(pg_temp.audits('project.brand', 'c0000000-0000-0000-0000-000000000961'), 1, 'brand: audited');
select is(public.set_job_brand('c0000000-0000-0000-0000-000000000961', 'b0000000-0000-0000-0000-000000000963'),
  'b0000000-0000-0000-0000-000000000963'::uuid, 'brand: picking it again is safe');
select is(pg_temp.audits('project.brand', 'c0000000-0000-0000-0000-000000000961'), 1, 'brand: and not a change');

-- ---------------------------------------------------------------------------------------------------------------------
-- Who reads, once the job shows the fire office
-- ---------------------------------------------------------------------------------------------------------------------
select pg_temp.login('a0000000-0000-0000-0000-000000000963');
select results_eq($$ select name, logo_path, print_name, address from public.job_brand('c0000000-0000-0000-0000-000000000961') $$,
  $$ values ('Sample Fire Office'::text, 'org/b0000000-0000-0000-0000-000000000963/logo'::text, 'Sample Fire Office'::text,
             '1 Sample Campus Way'::text) $$,
  'job_brand: the fire office, its logo and letterhead');
select is((select count(*)::int from public.org_letterheads where org_id = 'b0000000-0000-0000-0000-000000000963'), 1,
  'read: the viewer reads the brand''s letterhead');
select is((select count(*)::int from storage.objects where bucket_id = 'org-logos'
             and name = 'org/b0000000-0000-0000-0000-000000000963/logo'), 1, 'read: and its logo');
select pg_temp.login('a0000000-0000-0000-0000-000000000964');
select is((select count(*)::int from storage.objects where bucket_id = 'org-logos'), 0, 'read: still nothing off the job');

-- Back to the job's own company: the column clears.
select pg_temp.login('a0000000-0000-0000-0000-000000000961');
select is(public.set_job_brand('c0000000-0000-0000-0000-000000000961', 'b0000000-0000-0000-0000-000000000961'),
  'b0000000-0000-0000-0000-000000000961'::uuid, 'brand: back to the job''s company');
select is(pg_temp.brand_col(), null::uuid, 'brand: stored as none');

-- ---------------------------------------------------------------------------------------------------------------------
-- The server key reads the brand for the PDFs, and writes none of it
-- ---------------------------------------------------------------------------------------------------------------------
reset role;
set local role service_role;
select pg_temp.login_service();
select is((select count(*)::int from public.org_letterheads), 2, 'server: reads the letterheads');
select lives_ok($$ select brand_org_id, org_id from public.projects where id = 'c0000000-0000-0000-0000-000000000961' $$,
  'server: reads the job''s brand');
select throws_ok($$ update public.org_letterheads set phone = null where org_id = 'b0000000-0000-0000-0000-000000000961' $$,
  '42501', null, 'server: no writes to the letterhead');

select * from finish();
rollback;
