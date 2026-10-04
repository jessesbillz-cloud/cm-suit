begin;
select plan(25);
-- Migration 0044, the inspector who runs the job: inspector_admin holds the inspector's and the project admin's
-- capabilities except bids.*, with the inspector's rail; the creator of a job in an inspector company becomes
-- inspector_admin while every other company kind still makes project_admin; the backfill moves only the creator of an
-- existing inspector-company job (project_admin or inspector, one row per person and job), keeps a tester's viewed role
-- and changes the real role kept aside, and runs again without changing anything.
\ir _helpers.psql

select pg_temp.mk_user('a0000000-0000-0000-0000-000000000381', 'probe+ia-insp@example.test', 'Sample Inspector');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000382', 'probe+ia-gc@example.test', 'Sample Builder');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000383', 'probe+ia-arch@example.test', 'Sample Architect');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000384', 'probe+ia-old-admin@example.test', 'Sample Old Admin');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000385', 'probe+ia-old-insp@example.test', 'Sample Old Inspector');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000386', 'probe+ia-tester@example.test', 'Sample Tester');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000387', 'probe+ia-two@example.test', 'Sample Two Rows');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000388', 'probe+ia-member@example.test', 'Sample Member');

create temp table ids (k text primary key, v uuid not null);
grant all on ids to public;
create function pg_temp.id(p_k text) returns uuid language sql stable as $$ select v from pg_temp.ids where k = p_k $$;
grant execute on function pg_temp.id(text) to public;
-- A job's roles, as "email role" lines in order (read as the table owner).
create function pg_temp.roles_on(p_project uuid) returns text language sql stable as $$
  select string_agg(split_part(invite_email, '@', 1) || ' ' || role, ', ' order by invite_email, role)
    from public.project_members where project_id = p_project
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- The role is data
-- ---------------------------------------------------------------------------------------------------------------
select is((select description from public.roles where name = 'inspector_admin'), 'Inspector who runs the job',
  'role: inspector_admin, described for People and View as');
select set_eq(
  $$ select capability, requires_aal2 from public.role_permissions where role = 'inspector_admin' $$,
  $$ select capability, bool_or(requires_aal2) from public.role_permissions
      where role in ('inspector', 'project_admin') and capability not like 'bids.%' group by capability $$,
  'capabilities: the inspector''s and the project admin''s, bids.* left out, the second factor kept');
select is((select array_agg(capability order by capability) from public.role_permissions where role = 'inspector_admin'),
  '{audit.export,calendar.manage,calendar.read,comments.write,corrections.close,corrections.create,corrections.mark_ready,corrections.view,dailies.read_all,dailies.write,deliveries.manage,deliveries.post,deliveries.view,files.manage,files.read_project,files.write_project,ir.decide,ir.gc_approve,ir.request,ir.view_all,members.manage,members.view,permits.read,permits.respond,project.manage,revs.manage,revs.read,rfi.create_draft,rfi.sign_issue,rfi.view_internal_research,safety.manage,safety.read,safety.run,schedule.manage,schedule.read,transmittals.send}'::text[],
  'capabilities: the list Jesse reviews');
select is_empty($$ select capability from public.role_permissions where role = 'inspector_admin' and capability like 'bids.%' $$,
  'capabilities: no bid management, pricing or findings');
select is((select recommended_tools from public.roles where name = 'inspector_admin'),
  (select recommended_tools from public.roles where name = 'inspector'), 'rail: the inspector''s recommendation');
select is((select recommended_tools from public.roles where name = 'inspector_admin'),
  '{board,calendar,dailies,inspections,revs,corrections,files,hours}'::text[], 'rail: Board first, Hours last');

-- ---------------------------------------------------------------------------------------------------------------
-- New jobs: the creator's role follows the company's kind
-- ---------------------------------------------------------------------------------------------------------------
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000381');
insert into ids values ('io', public.create_org('Sample Inspection Co', 'inspector'));
insert into ids values ('ij', public.create_project(pg_temp.id('io'), 'Sample School Wing', 'construction'));
select pg_temp.login('a0000000-0000-0000-0000-000000000382');
insert into ids values ('go', public.create_org('Sample Builders', 'gc'));
insert into ids values ('gj', public.create_project(pg_temp.id('go'), 'Sample Gym', 'bidding'));
select pg_temp.login('a0000000-0000-0000-0000-000000000383');
insert into ids values ('ao', public.create_org('Sample Design', 'architect'));
insert into ids values ('aj', public.create_project(pg_temp.id('ao'), 'Sample Clinic', 'construction'));

select pg_temp.login('a0000000-0000-0000-0000-000000000381');
select results_eq($$ select role from public.my_projects() where project_id = pg_temp.id('ij') $$,
  $$ values ('inspector_admin'::text) $$, 'inspector company: the creator is inspector_admin');
select is_empty($$ select c from unnest('{ir.decide,corrections.close,dailies.write,members.manage,project.manage,files.manage}'::text[]) c
                   where not public.has_capability(pg_temp.id('ij'), c) $$,
  'inspector company: the creator decides IRs, closes corrections, writes dailies, manages people, the job and files');
select pg_temp.login('a0000000-0000-0000-0000-000000000381', 'aal2');
select is_empty($$ select c from unnest('{bids.manage,bids.view_pricing,bids.view_ai_findings,bids.submit}'::text[]) c
                   where public.has_capability(pg_temp.id('ij'), c) $$,
  'inspector company: no bids.* capability, even with the second factor');
select is((select tools from public.my_recommended_tools(pg_temp.id('ij'))),
  '{board,calendar,dailies,inspections,corrections,files,hours}'::text[], 'inspector company: the inspector''s rail on the new job');

select pg_temp.login('a0000000-0000-0000-0000-000000000382');
select results_eq($$ select role from public.my_projects() where project_id = pg_temp.id('gj') $$,
  $$ values ('project_admin'::text) $$, 'GC: the creator is still project_admin');
select results_eq($$ select public.has_capability(pg_temp.id('gj'), 'bids.manage'), public.has_capability(pg_temp.id('gj'), 'ir.decide') $$,
  $$ values (true, false) $$, 'GC: bids yes, inspector decisions no');
select pg_temp.login('a0000000-0000-0000-0000-000000000383');
select results_eq($$ select role from public.my_projects() where project_id = pg_temp.id('aj') $$,
  $$ values ('project_admin'::text) $$, 'architect company: the creator is still project_admin');

-- ---------------------------------------------------------------------------------------------------------------
-- Existing jobs: the backfill
-- ---------------------------------------------------------------------------------------------------------------
reset role;
insert into public.orgs (id, name, kind, created_by) values
  ('b0000000-0000-0000-0000-000000000381', 'Sample Old Inspection Co', 'inspector', 'a0000000-0000-0000-0000-000000000384'),
  ('b0000000-0000-0000-0000-000000000382', 'Sample Old Builders', 'gc', 'a0000000-0000-0000-0000-000000000382');
insert into public.projects (id, org_id, name, stage, created_by) values
  ('c0000000-0000-0000-0000-000000000381', 'b0000000-0000-0000-0000-000000000381', 'Old Job 1', 'construction', 'a0000000-0000-0000-0000-000000000384'),
  ('c0000000-0000-0000-0000-000000000382', 'b0000000-0000-0000-0000-000000000381', 'Old Job 2', 'construction', 'a0000000-0000-0000-0000-000000000385'),
  ('c0000000-0000-0000-0000-000000000383', 'b0000000-0000-0000-0000-000000000381', 'Old Job 3', 'construction', 'a0000000-0000-0000-0000-000000000386'),
  ('c0000000-0000-0000-0000-000000000384', 'b0000000-0000-0000-0000-000000000381', 'Old Job 4', 'construction', 'a0000000-0000-0000-0000-000000000387'),
  ('c0000000-0000-0000-0000-000000000385', 'b0000000-0000-0000-0000-000000000382', 'Old GC Job 5', 'construction', 'a0000000-0000-0000-0000-000000000385'),
  ('c0000000-0000-0000-0000-000000000386', 'b0000000-0000-0000-0000-000000000382', 'Old GC Job 6', 'construction', 'a0000000-0000-0000-0000-000000000386');
-- Before 0044: 1 made by an admin (project_admin), with another project_admin and an inspector who did not make it;
-- 2 made by an inspector who took the inspector role; 3 made by a tester now viewing as a PM; 4 made by someone who
-- holds both roles; 5 and 6 are a GC's jobs made by the same inspector and tester.
update public.project_members pm set role = v.r
  from (values ('c0000000-0000-0000-0000-000000000381'::uuid, 'project_admin'),
               ('c0000000-0000-0000-0000-000000000382', 'inspector'),
               ('c0000000-0000-0000-0000-000000000383', 'pm'),
               ('c0000000-0000-0000-0000-000000000384', 'project_admin'),
               ('c0000000-0000-0000-0000-000000000385', 'inspector'),
               ('c0000000-0000-0000-0000-000000000386', 'pm')) v(p, r)
 where pm.project_id = v.p;
insert into public.project_members (org_id, project_id, user_id, invite_email, role, status) values
  ('b0000000-0000-0000-0000-000000000381', 'c0000000-0000-0000-0000-000000000381', 'a0000000-0000-0000-0000-000000000388',
   'probe+ia-member@example.test', 'project_admin', 'active'),
  ('b0000000-0000-0000-0000-000000000381', 'c0000000-0000-0000-0000-000000000381', 'a0000000-0000-0000-0000-000000000385',
   'probe+ia-old-insp@example.test', 'inspector', 'active'),
  ('b0000000-0000-0000-0000-000000000381', 'c0000000-0000-0000-0000-000000000384', 'a0000000-0000-0000-0000-000000000387',
   'probe+ia-two@example.test', 'inspector', 'active');
insert into public.testing_role_home (user_id, project_id, real_role) values
  ('a0000000-0000-0000-0000-000000000386', 'c0000000-0000-0000-0000-000000000383', 'project_admin'),
  ('a0000000-0000-0000-0000-000000000386', 'c0000000-0000-0000-0000-000000000386', 'project_admin');

select is(public.inspector_admin_backfill(), 3, 'backfill: three memberships change');
select is(pg_temp.roles_on('c0000000-0000-0000-0000-000000000381'),
  'probe+ia-member project_admin, probe+ia-old-admin inspector_admin, probe+ia-old-insp inspector',
  'backfill: the creator''s project_admin becomes inspector_admin; members who did not make the job keep theirs');
select is(pg_temp.roles_on('c0000000-0000-0000-0000-000000000382'), 'probe+ia-old-insp inspector_admin',
  'backfill: the creator''s inspector becomes inspector_admin');
select is(pg_temp.roles_on('c0000000-0000-0000-0000-000000000384'), 'probe+ia-two inspector, probe+ia-two inspector_admin',
  'backfill: one row per person and job (the project_admin one); the second row is left as it is');
select is(pg_temp.roles_on('c0000000-0000-0000-0000-000000000383'), 'probe+ia-tester pm',
  'backfill: a tester keeps the role they are viewing as');
select results_eq($$ select project_id, real_role from public.testing_role_home
                    where user_id = 'a0000000-0000-0000-0000-000000000386' order by 1 $$,
  $$ values ('c0000000-0000-0000-0000-000000000383'::uuid, 'inspector_admin'::text),
            ('c0000000-0000-0000-0000-000000000386'::uuid, 'project_admin'::text) $$,
  'backfill: the tester''s real role kept aside changes on the inspector company''s job only');
select is(pg_temp.roles_on('c0000000-0000-0000-0000-000000000385') || ' / ' || pg_temp.roles_on('c0000000-0000-0000-0000-000000000386'),
  'probe+ia-old-insp inspector / probe+ia-tester pm', 'backfill: a GC''s jobs are untouched');
select is(public.inspector_admin_backfill(), 0, 'backfill: running it again changes nothing');
select ok(not has_function_privilege('anon', 'public.inspector_admin_backfill()', 'EXECUTE')
          and not has_function_privilege('authenticated', 'public.inspector_admin_backfill()', 'EXECUTE')
          and not has_function_privilege('service_role', 'public.inspector_admin_backfill()', 'EXECUTE'),
  'backfill: nobody but the owner runs it');

-- The tester picks "Me": back as the inspector who runs the job.
update public.security_switches set enabled = true where key = 'testing_view_as';
insert into public.testing_superusers (user_id) values ('a0000000-0000-0000-0000-000000000386');
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000386');
select is(public.testing_view_as(null) -> 'viewing', 'null'::jsonb, 'tester: back to myself');
select results_eq($$ select name, role from public.my_projects() order by name $$,
  $$ values ('Old GC Job 6'::text, 'project_admin'::text), ('Old Job 3', 'inspector_admin') $$,
  'tester: inspector_admin on the inspector company''s job, project_admin on the GC''s');
select ok(public.has_capability('c0000000-0000-0000-0000-000000000383', 'ir.decide')
          and not public.has_capability('c0000000-0000-0000-0000-000000000383', 'bids.manage'),
  'tester: decides IRs there, no bids');

select * from finish();
rollback;
