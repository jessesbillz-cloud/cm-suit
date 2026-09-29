begin;
select plan(30);
-- The rail by position (migration 0040): recommendations are data on roles, my_recommended_tools answers per job as the
-- caller (the role's list, minus the job's switched-off tools; two roles merge; nothing for a job I'm not on), pins are
-- null by default and kept as saved (the app shows them instead), and my_tool_counts counts what needs the caller only.
\ir _helpers.psql

select pg_temp.mk_user('a0000000-0000-0000-0000-000000000341', 'probe+rail-admin@example.test', 'Rail Admin');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000342', 'probe+rail-insp@example.test', 'Rail Inspector');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000343', 'probe+rail-sub@example.test', 'Rail Sub');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000344', 'probe+rail-pe@example.test', 'Rail PE');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000345', 'probe+rail-other@example.test', 'Rail Other');

insert into public.orgs (id, name, kind, created_by) values
  ('b0000000-0000-0000-0000-000000000341', 'Sample Rail Builders', 'gc', 'a0000000-0000-0000-0000-000000000341');
-- J and K are being built, so they have every field tool (0021, 0038).
insert into public.projects (id, org_id, name, stage, timezone, created_by) values
  ('c0000000-0000-0000-0000-000000000341', 'b0000000-0000-0000-0000-000000000341', 'Rail Job J', 'construction',
   'America/Los_Angeles', 'a0000000-0000-0000-0000-000000000341'),
  ('c0000000-0000-0000-0000-000000000342', 'b0000000-0000-0000-0000-000000000341', 'Rail Job K', 'construction',
   'America/Los_Angeles', 'a0000000-0000-0000-0000-000000000341');
insert into public.project_members (org_id, project_id, user_id, invite_email, role, status)
select 'b0000000-0000-0000-0000-000000000341', p, u, e, r, 'active'
  from (values
    ('c0000000-0000-0000-0000-000000000341'::uuid, 'a0000000-0000-0000-0000-000000000342'::uuid, 'probe+rail-insp@example.test', 'inspector'),
    ('c0000000-0000-0000-0000-000000000342', 'a0000000-0000-0000-0000-000000000342', 'probe+rail-insp@example.test', 'inspector'),
    ('c0000000-0000-0000-0000-000000000341', 'a0000000-0000-0000-0000-000000000343', 'probe+rail-sub@example.test', 'sub'),
    ('c0000000-0000-0000-0000-000000000341', 'a0000000-0000-0000-0000-000000000344', 'probe+rail-pe@example.test', 'pe'),
    ('c0000000-0000-0000-0000-000000000341', 'a0000000-0000-0000-0000-000000000344', 'probe+rail-pe@example.test', 'estimator')) v(p, u, e, r);

create temp table ids (k text primary key, v uuid);
grant all on ids to public;

-- ---------------------------------------------------------------------------------------------------------------
-- Recommendations are data
-- ---------------------------------------------------------------------------------------------------------------
select has_column('public', 'roles', 'recommended_tools', 'roles carry a recommended rail');
select col_not_null('public', 'roles', 'recommended_tools', 'the recommended rail is never null');
select is_empty($$ select name from public.roles
                    where cardinality(recommended_tools) not between 1 and 6
                       or cardinality(recommended_tools) <> (select count(distinct t) from unnest(recommended_tools) t) $$,
  'every role has a lean rail: 1 to 6 tools, none twice');
select is_empty($$ select name from public.roles
                    where not recommended_tools <@ '{board,files,bids,calendar,dailies,inspections,rfis,deliveries,corrections,people}' $$,
  'recommendations name only rail tools');
select is_empty($$ select name from public.roles where 'board' = any (recommended_tools) and recommended_tools[1] <> 'board' $$,
  'Board comes first wherever it is recommended');
select is((select recommended_tools from public.roles where name = 'inspector'),
  '{board,calendar,dailies,inspections,corrections,files}'::text[], 'the inspector''s starting rail');
select ok(not has_function_privilege('anon', 'public.my_recommended_tools(uuid)', 'EXECUTE')
          and not has_function_privilege('anon', 'public.my_tool_counts(uuid)', 'EXECUTE'), 'anon calls neither function');
select ok(not (select prosecdef from pg_proc where oid = 'public.my_recommended_tools(uuid)'::regprocedure)
          and not (select prosecdef from pg_proc where oid = 'public.my_tool_counts(uuid)'::regprocedure),
  'both run as the caller (no SECURITY DEFINER)');

-- ---------------------------------------------------------------------------------------------------------------
-- my_recommended_tools: the role's list, minus the job's switched-off tools, as the caller
-- ---------------------------------------------------------------------------------------------------------------
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000342');
select is((select tools from public.my_recommended_tools('c0000000-0000-0000-0000-000000000341')),
  '{board,calendar,dailies,inspections,corrections,files}'::text[], 'inspector on a job being built: the whole list, in order');
select is((select count(*)::int from public.my_recommended_tools()), 2, 'null = every job of mine');

reset role;
update public.projects set modules = '{files}' where id = 'c0000000-0000-0000-0000-000000000342';
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000342');
select is((select tools from public.my_recommended_tools('c0000000-0000-0000-0000-000000000342')),
  '{board,files}'::text[], 'a job with its tools switched off: only what it has (Board always)');

reset role;
update public.roles set recommended_tools = '{board,deliveries,people}' where name = 'inspector';
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000342');
select is((select tools from public.my_recommended_tools('c0000000-0000-0000-0000-000000000341')),
  '{board,deliveries,people}'::text[], 'changing the data changes the rail (no role names in code)');
reset role;
update public.roles set recommended_tools = '{board,calendar,dailies,inspections,corrections,files}' where name = 'inspector';
set local role authenticated;

select pg_temp.login('a0000000-0000-0000-0000-000000000344');
select is((select tools from public.my_recommended_tools('c0000000-0000-0000-0000-000000000341')),
  '{board,bids,calendar,files,rfis,inspections}'::text[], 'two roles on one job: the lists merge, earliest place first');

select pg_temp.login('a0000000-0000-0000-0000-000000000345');
select is_empty($$ select * from public.my_recommended_tools('c0000000-0000-0000-0000-000000000341') $$,
  'not on the job: nothing');
select is_empty($$ select * from public.my_recommended_tools() $$, 'no jobs: nothing');

-- ---------------------------------------------------------------------------------------------------------------
-- Pins: null = the recommendation; a saved list stays as saved; back to null = recommended again
-- ---------------------------------------------------------------------------------------------------------------
select pg_temp.login('a0000000-0000-0000-0000-000000000342');
insert into public.user_layout (user_id) values ('a0000000-0000-0000-0000-000000000342');
select is((select rail_items from public.user_layout where user_id = auth.uid()), null::text[],
  'a new layout has no pins: the rail is the recommendation');
update public.user_layout set rail_items = '{files,board}' where user_id = auth.uid();
select is((select rail_items from public.user_layout where user_id = auth.uid()), '{files,board}'::text[],
  'pins win: my list is kept as I saved it');
select is((select tools from public.my_recommended_tools('c0000000-0000-0000-0000-000000000341')),
  '{board,calendar,dailies,inspections,corrections,files}'::text[], 'pins leave the recommendation alone (for "Use recommended")');
update public.user_layout set rail_items = null where user_id = auth.uid();
select is((select rail_items from public.user_layout where user_id = auth.uid()), null::text[], '"Use recommended" puts it back to null');
reset role;
update public.user_layout set rail_items = '{board}' where user_id = 'a0000000-0000-0000-0000-000000000342';
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000343');
select is_empty($$ select * from public.user_layout where user_id <> auth.uid() $$, 'nobody reads someone else''s pins');

-- ---------------------------------------------------------------------------------------------------------------
-- my_tool_counts: my open tasks per record type (each record once) plus the RFIs I'm waiting on, for me only
-- ---------------------------------------------------------------------------------------------------------------
select pg_temp.login('a0000000-0000-0000-0000-000000000344');
insert into ids values ('ir1', gen_random_uuid()), ('ir2', gen_random_uuid()), ('dr', gen_random_uuid()), ('cn', gen_random_uuid());
select public.create_task('c0000000-0000-0000-0000-000000000341', 'a0000000-0000-0000-0000-000000000342', 'ir.decide', 'Decide IR 1',
  'inspection_request', (select v from ids where k = 'ir1'));
select public.create_task('c0000000-0000-0000-0000-000000000341', 'a0000000-0000-0000-0000-000000000342', 'ir.sign', 'Sign IR 1',
  'inspection_request', (select v from ids where k = 'ir1'));
select public.create_task('c0000000-0000-0000-0000-000000000341', 'a0000000-0000-0000-0000-000000000342', 'ir.decide', 'Decide IR 2',
  'inspection_request', (select v from ids where k = 'ir2'));
select public.create_task('c0000000-0000-0000-0000-000000000341', 'a0000000-0000-0000-0000-000000000342', 'daily.sign', 'Sign today',
  'daily_report', (select v from ids where k = 'dr'));
select public.create_task('c0000000-0000-0000-0000-000000000341', 'a0000000-0000-0000-0000-000000000342', 'note', 'Walk level 2');
select public.create_task('c0000000-0000-0000-0000-000000000341', 'a0000000-0000-0000-0000-000000000342', 'note', 'Done already');
reset role;
update public.tasks set done_at = now() where title = 'Done already';
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000342');
select public.create_task('c0000000-0000-0000-0000-000000000342', 'a0000000-0000-0000-0000-000000000342', 'cn.close', 'Close CN 4',
  'correction', (select v from ids where k = 'cn'));

select results_eq($$ select entity_type, n from public.my_tool_counts('c0000000-0000-0000-0000-000000000341') $$,
  $$ values (null::text, 1), ('daily_report', 1), ('inspection_request', 2) $$,
  'counts: my open tasks on this job by record type, each record once, done ones left out');
select results_eq($$ select entity_type, n from public.my_tool_counts() $$,
  $$ values (null::text, 1), ('correction', 1), ('daily_report', 1), ('inspection_request', 2) $$,
  'counts: null = all my jobs');
select is((select coalesce(sum(n), 0)::int from public.my_tool_counts('c0000000-0000-0000-0000-000000000342')), 1,
  'counts: another job counts only its own');

select pg_temp.login('a0000000-0000-0000-0000-000000000343');
select is_empty($$ select * from public.my_tool_counts() $$, 'counts are per caller: someone else''s tasks are not mine');

-- An RFI I sent that the PE has sat on unopened for 3 days: it needs me (rfi_waiting); the PE holds it as a task.
select lives_ok($$ insert into ids select 'rfi', (public.rfi_create('c0000000-0000-0000-0000-000000000341', 'Sample rail RFI', 'Which?')).id $$,
  'sub: an RFI draft');
select lives_ok($$ select public.rfi_sign_send((select v from ids where k = 'rfi'), 1, repeat('a', 64)) $$, 'sub: sends it (no route: to issue)');
reset role;
update public.rfis set held_since = now() - interval '3 days', held_opened_at = null where id = (select v from ids where k = 'rfi');
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000343');
select results_eq($$ select entity_type, n from public.my_tool_counts('c0000000-0000-0000-0000-000000000341') $$,
  $$ values ('rfi'::text, 1) $$, 'counts: an RFI I''m waiting on counts under rfi');
select pg_temp.login('a0000000-0000-0000-0000-000000000344');
select results_eq($$ select entity_type, n from public.my_tool_counts('c0000000-0000-0000-0000-000000000341') $$,
  $$ values ('rfi'::text, 1) $$, 'counts: the one holding it has it once, as a task');
select pg_temp.login('a0000000-0000-0000-0000-000000000345');
select is_empty($$ select * from public.my_tool_counts('c0000000-0000-0000-0000-000000000341') $$,
  'counts: nothing on a job I''m not on');
select is_empty($$ select * from public.my_tool_counts() $$, 'counts: nothing at all for someone with no jobs');

select * from finish();
rollback;
