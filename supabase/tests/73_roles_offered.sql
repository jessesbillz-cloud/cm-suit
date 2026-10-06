begin;
select plan(16);
-- Migration 0087: the roles people pick from are Jesse's six, in his words and order (roles.invitable, roles.sort,
-- roles.description). Inspector covers the special inspector, who stays a role but is not offered. No role is
-- deleted and the matrix does not change, so a member holding another role keeps it and what it may do. The testing
-- "View as" lists the same six. my_capabilities answers, in one call, what has_capability answers one at a time.
\ir _helpers.psql

select pg_temp.mk_user('a0000000-0000-0000-0000-000000000731', 'probe+ro-admin@example.test', 'Ro Admin');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000732', 'probe+ro-arch@example.test', 'Ro Architect');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000733', 'probe+ro-out@example.test', 'Ro Outsider');
insert into public.orgs (id, name, kind, created_by)
values ('b0000000-0000-0000-0000-000000000731', 'Sample Roles Builders', 'gc', 'a0000000-0000-0000-0000-000000000731');
insert into public.projects (id, org_id, name, stage, created_by) values
  ('c0000000-0000-0000-0000-000000000731', 'b0000000-0000-0000-0000-000000000731', 'Sample Roles Job', 'construction',
   'a0000000-0000-0000-0000-000000000731');
-- The creator is on the job as its admin (the projects trigger).
insert into public.project_members (org_id, project_id, user_id, invite_email, role, status) values
  ('b0000000-0000-0000-0000-000000000731', 'c0000000-0000-0000-0000-000000000731', 'a0000000-0000-0000-0000-000000000732',
   'probe+ro-arch@example.test', 'architect', 'active');

-- Every capability in the matrix, read before acting as a member.
create temp table every_cap as select distinct capability as cap from public.role_permissions;
grant select on every_cap to public;

-- The offered list.
select results_eq(
  $$ select name, description from public.roles where invitable order by sort, description $$,
  $$ values ('pm', 'Project manager'), ('pe', 'Project engineer'), ('superintendent', 'Superintendent'),
            ('inspector', 'Inspector'), ('ahj', 'Fire marshal'), ('owner_rep', 'Owner / CM') $$,
  'People offers exactly the six roles, in plain words and in order');
select ok(exists (select 1 from public.roles where name = 'special_inspector' and not invitable),
  'the special inspector stays a role but is not offered (Inspector covers it)');
select is_empty(
  $$ select capability from public.role_permissions where role = 'special_inspector'
     except select capability from public.role_permissions where role = 'inspector' $$,
  'the inspector holds everything the special inspector holds');
select is((select count(*)::int from public.roles
            where name in ('project_admin', 'inspector_admin', 'estimator', 'foreman', 'sub', 'architect', 'viewer',
                           'safety', 'bidder', 'requester')),
  10, 'no role is deleted');
select col_not_null('public', 'roles', 'sort', 'every role has a place in the order');

-- A member holding a role no longer offered keeps it and what it may do.
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000732');
select ok(public.has_capability('c0000000-0000-0000-0000-000000000731', 'rfi.answer'),
  'an architect already on the job still answers RFIs');

-- my_capabilities: the same answers as has_capability, in one call.
select is(public.my_capabilities('c0000000-0000-0000-0000-000000000731'),
  (select array_agg(cap order by cap) from every_cap where public.has_capability('c0000000-0000-0000-0000-000000000731', cap)),
  'my_capabilities matches has_capability (architect)');
select pg_temp.login('a0000000-0000-0000-0000-000000000731');
select is(public.my_capabilities('c0000000-0000-0000-0000-000000000731'),
  (select array_agg(cap order by cap) from every_cap where public.has_capability('c0000000-0000-0000-0000-000000000731', cap)),
  'my_capabilities matches has_capability (project admin, one-step sign-in)');
select ok(not ('bids.view_pricing' = any (public.my_capabilities('c0000000-0000-0000-0000-000000000731'))),
  'a two-step capability is left out until the two-step sign-in');
select pg_temp.login('a0000000-0000-0000-0000-000000000731', 'aal2');
select ok('bids.view_pricing' = any (public.my_capabilities('c0000000-0000-0000-0000-000000000731')),
  'and is there after it');
select pg_temp.login('a0000000-0000-0000-0000-000000000733');
select is(public.my_capabilities('c0000000-0000-0000-0000-000000000731'), '{}'::text[], 'not on the job: nothing');
reset role;
select ok(not has_function_privilege('anon', 'public.my_capabilities(uuid)', 'EXECUTE'), 'anon cannot call my_capabilities');

-- Access ended: nothing.
update public.project_members set access_ends_at = now() - interval '1 day'
 where user_id = 'a0000000-0000-0000-0000-000000000732';
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000732');
select is(public.my_capabilities('c0000000-0000-0000-0000-000000000731'), '{}'::text[], 'access ended: nothing');

-- "View as" offers the same six, in order.
reset role;
update public.security_switches set enabled = true where key = 'testing_view_as';
insert into public.testing_superusers (user_id) values ('a0000000-0000-0000-0000-000000000731');
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000731');
select is(public.testing_view_as_state() -> 'roles',
  '[{"name": "pm", "label": "Project manager"}, {"name": "pe", "label": "Project engineer"},
    {"name": "superintendent", "label": "Superintendent"}, {"name": "inspector", "label": "Inspector"},
    {"name": "ahj", "label": "Fire marshal"}, {"name": "owner_rep", "label": "Owner / CM"}]'::jsonb,
  'View as lists the six');
-- Viewing as a role that is not offered (taken before 0087): it shows too, so the picker can show it.
select is(public.testing_view_as('architect') ->> 'viewing', 'architect', 'any real role can still be viewed as');
select ok((public.testing_view_as_state() -> 'roles') @> '[{"name": "architect"}]'::jsonb,
  'the role being viewed as is listed while it is on');

select * from finish();
rollback;
