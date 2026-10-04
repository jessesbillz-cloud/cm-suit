begin;
select plan(42);
-- SPEC §5.2 capability matrix, cross-project isolation, access_ends_at, revocation, and the bidder wall.
\ir _helpers.psql

-- ---------------------------------------------------------------------------------------------------------------
-- Seed (as postgres): org A / project A with one member per role, org B / project B with its own admin.
-- ---------------------------------------------------------------------------------------------------------------
create temp table who (role text primary key, uid uuid not null);
grant select on who to public;
insert into who (role, uid) values
  ('project_admin',     'a0000000-0000-0000-0000-000000000001'),
  ('estimator',         'a0000000-0000-0000-0000-000000000002'),
  ('pm',                'a0000000-0000-0000-0000-000000000003'),
  ('pe',                'a0000000-0000-0000-0000-000000000004'),
  ('superintendent',    'a0000000-0000-0000-0000-000000000005'),
  ('foreman',           'a0000000-0000-0000-0000-000000000006'),
  ('inspector',         'a0000000-0000-0000-0000-000000000007'),
  ('special_inspector', 'a0000000-0000-0000-0000-000000000008'),
  ('bidder',            'a0000000-0000-0000-0000-000000000009'),
  ('sub',               'a0000000-0000-0000-0000-000000000010'),
  ('architect',         'a0000000-0000-0000-0000-000000000011'),
  ('owner_rep',         'a0000000-0000-0000-0000-000000000012'),
  ('viewer',            'a0000000-0000-0000-0000-000000000013');

select pg_temp.mk_user(uid, 'probe+' || role || '@example.test', 'Test ' || role) from who;
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000014', 'probe+bidder2@example.test', 'Test bidder2');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000015', 'probe+admin-b@example.test', 'Test admin B');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000016', 'probe+expired@example.test', 'Test expired');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000017', 'probe+revoked@example.test', 'Test revoked');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000018', 'probe+outsider@example.test', 'Test outsider');

insert into public.orgs (id, name, kind, created_by) values
  ('b0000000-0000-0000-0000-00000000000a', 'Org A', 'gc', 'a0000000-0000-0000-0000-000000000001'),
  ('b0000000-0000-0000-0000-00000000000b', 'Org B', 'gc', 'a0000000-0000-0000-0000-000000000015');
-- The creator becomes project_admin (tg_project_created) and default folders appear (tg_project_default_folders).
insert into public.projects (id, org_id, name, created_by) values
  ('c0000000-0000-0000-0000-00000000000a', 'b0000000-0000-0000-0000-00000000000a', 'Project A', 'a0000000-0000-0000-0000-000000000001'),
  ('c0000000-0000-0000-0000-00000000000b', 'b0000000-0000-0000-0000-00000000000b', 'Project B', 'a0000000-0000-0000-0000-000000000015');

insert into public.project_members (org_id, project_id, user_id, invite_email, role, status, access_ends_at, created_by)
select 'b0000000-0000-0000-0000-00000000000a', 'c0000000-0000-0000-0000-00000000000a', u.id, u.email, m.role, m.status, m.ends,
       'a0000000-0000-0000-0000-000000000001'
from (values
  ('a0000000-0000-0000-0000-000000000002'::uuid, 'estimator', 'active', null::timestamptz),
  ('a0000000-0000-0000-0000-000000000003', 'pm', 'active', null),
  ('a0000000-0000-0000-0000-000000000004', 'pe', 'active', null),
  ('a0000000-0000-0000-0000-000000000005', 'superintendent', 'active', null),
  ('a0000000-0000-0000-0000-000000000006', 'foreman', 'active', null),
  ('a0000000-0000-0000-0000-000000000007', 'inspector', 'active', null),
  ('a0000000-0000-0000-0000-000000000008', 'special_inspector', 'active', null),
  ('a0000000-0000-0000-0000-000000000009', 'bidder', 'active', null),
  ('a0000000-0000-0000-0000-000000000010', 'sub', 'active', null),
  ('a0000000-0000-0000-0000-000000000011', 'architect', 'active', null),
  ('a0000000-0000-0000-0000-000000000012', 'owner_rep', 'active', null),
  ('a0000000-0000-0000-0000-000000000013', 'viewer', 'active', null),
  ('a0000000-0000-0000-0000-000000000014', 'bidder', 'active', null),
  ('a0000000-0000-0000-0000-000000000016', 'pm', 'active', now() - interval '1 minute'),
  ('a0000000-0000-0000-0000-000000000017', 'pm', 'revoked', null)
) as m (uid, role, status, ends)
join auth.users u on u.id = m.uid;

-- Rows in project B that nobody from A may see.
insert into public.folders (id, org_id, project_id, name, created_by) values
  ('d0000000-0000-0000-0000-0000000000b1', 'b0000000-0000-0000-0000-00000000000b', 'c0000000-0000-0000-0000-00000000000b', 'B only', 'a0000000-0000-0000-0000-000000000015');
insert into public.files (id, org_id, project_id, folder_id, storage_path, original_name, created_by, scan_status)
values ('e0000000-0000-0000-0000-0000000000b1', 'b0000000-0000-0000-0000-00000000000b', 'c0000000-0000-0000-0000-00000000000b',
        'd0000000-0000-0000-0000-0000000000b1',
        public.file_storage_path('c0000000-0000-0000-0000-00000000000b', 'd0000000-0000-0000-0000-0000000000b1', 'e0000000-0000-0000-0000-0000000000b1', 'b.pdf'),
        'b.pdf', 'a0000000-0000-0000-0000-000000000015', 'clean');
insert into public.activity (id, org_id, project_id, kind, summary, audience_capability) values
  ('f0000000-0000-0000-0000-0000000000b1', 'b0000000-0000-0000-0000-00000000000b', 'c0000000-0000-0000-0000-00000000000b', 'note', 'B news', 'files.read_project'),
  ('f0000000-0000-0000-0000-0000000000a1', 'b0000000-0000-0000-0000-00000000000a', 'c0000000-0000-0000-0000-00000000000a', 'note', 'A news', 'files.read_project'),
  ('f0000000-0000-0000-0000-0000000000a2', 'b0000000-0000-0000-0000-00000000000a', 'c0000000-0000-0000-0000-00000000000a', 'note', 'For bidder 2 only', null);
insert into public.activity_recipients (activity_id, user_id) values
  ('f0000000-0000-0000-0000-0000000000a2', 'a0000000-0000-0000-0000-000000000014');

-- matrix_is(cap, aal, roles): the set of project-A roles for which has_capability() is true equals `roles`.
create function pg_temp.matrix_is(p_cap text, p_aal text, p_roles text[])
returns text
language sql
as $$
  select results_eq(
    format('select w.role from pg_temp.who w where pg_temp.cap_as(w.uid, %L::uuid, %L, %L) order by 1',
           'c0000000-0000-0000-0000-00000000000a', p_cap, p_aal),
    format('select r from unnest(%L::text[]) as r order by 1', p_roles),
    format('%s (%s): %s', p_cap, p_aal, coalesce(nullif(array_to_string(p_roles, ', '), ''), 'nobody')));
$$;
grant execute on function pg_temp.matrix_is(text, text, text[]) to public;

set local role authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- Matrix (SPEC §5.2 table). Pricing capabilities need aal2.
-- ---------------------------------------------------------------------------------------------------------------
select pg_temp.matrix_is('bids.view_pricing', 'aal1', '{}');
select pg_temp.matrix_is('bids.view_pricing', 'aal2', '{project_admin,estimator}');
select pg_temp.matrix_is('bids.view_ai_findings', 'aal1', '{}');
select pg_temp.matrix_is('bids.view_ai_findings', 'aal2', '{project_admin,estimator}');
select pg_temp.matrix_is('bids.manage', 'aal1', '{project_admin,estimator}');
select pg_temp.matrix_is('bids.submit', 'aal1', '{bidder}');
select pg_temp.matrix_is('dailies.read_all', 'aal1', '{project_admin,pm,pe,superintendent,inspector,owner_rep}');
select pg_temp.matrix_is('ir.request', 'aal1', '{sub,superintendent,foreman,pe,project_admin,inspector}');
select pg_temp.matrix_is('ir.decide', 'aal1', '{inspector}');
select pg_temp.matrix_is('deliveries.manage', 'aal1', '{superintendent,pm,project_admin}');
select pg_temp.matrix_is('corrections.close', 'aal1', '{inspector}');
select pg_temp.matrix_is('rfi.create_draft', 'aal1', '{sub,superintendent,foreman,pe,pm,project_admin}');
select pg_temp.matrix_is('rfi.sign_issue', 'aal1', '{pm,pe,project_admin}');
select pg_temp.matrix_is('rfi.answer', 'aal1', '{architect}');
select pg_temp.matrix_is('rfi.view_internal_research', 'aal1', '{project_admin,pm,pe,estimator}');
select pg_temp.matrix_is('members.manage', 'aal1', '{project_admin}');

select is_empty(
  $$ select distinct capability from public.role_permissions
     where pg_temp.cap_as('a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-00000000000b', capability, 'aal2') $$,
  'project A admin holds no capability in project B'
);
select is_empty(
  $$ select distinct capability from public.role_permissions
     where pg_temp.cap_as('a0000000-0000-0000-0000-000000000018', 'c0000000-0000-0000-0000-00000000000a', capability, 'aal2') $$,
  'a signed-in non-member holds no capability in project A'
);

-- ---------------------------------------------------------------------------------------------------------------
-- Cross-project isolation: a project-A member sees nothing of project B.
-- ---------------------------------------------------------------------------------------------------------------
select pg_temp.login('a0000000-0000-0000-0000-000000000003');
select is_empty($$ select id from public.projects where id = 'c0000000-0000-0000-0000-00000000000b' $$, 'A member: no project B row');
select is_empty($$ select id from public.project_members where project_id = 'c0000000-0000-0000-0000-00000000000b' $$, 'A member: no project B members');
select is_empty($$ select id from public.folders where project_id = 'c0000000-0000-0000-0000-00000000000b' $$, 'A member: no project B folders');
select is_empty($$ select id from public.files where project_id = 'c0000000-0000-0000-0000-00000000000b' $$, 'A member: no project B files');
select is_empty($$ select id from public.activity where project_id = 'c0000000-0000-0000-0000-00000000000b' $$, 'A member: no project B activity');
select results_eq($$ select project_id from public.my_projects() $$, $$ values ('c0000000-0000-0000-0000-00000000000a'::uuid) $$,
  'A member: my_projects() lists only project A');
select isnt_empty($$ select id from public.projects where id = 'c0000000-0000-0000-0000-00000000000a' $$, 'A member: sees project A (control)');
select isnt_empty($$ select id from public.activity where id = 'f0000000-0000-0000-0000-0000000000a1' $$, 'A member: sees project A activity (control)');

select pg_temp.login('a0000000-0000-0000-0000-000000000001');
select is_empty($$ select id from public.projects where id = 'c0000000-0000-0000-0000-00000000000b' $$, 'org A owner: no project B row');
select is_empty($$ select id from public.project_members where project_id = 'c0000000-0000-0000-0000-00000000000b' $$, 'org A owner: no project B members');

-- ---------------------------------------------------------------------------------------------------------------
-- access_ends_at in the past, and revocation, end access immediately.
-- ---------------------------------------------------------------------------------------------------------------
select ok(not pg_temp.cap_as('a0000000-0000-0000-0000-000000000016', 'c0000000-0000-0000-0000-00000000000a', 'dailies.read_all'),
  'access_ends_at passed: has_capability is false');
select is_empty($$ select * from public.my_projects() $$, 'access_ends_at passed: my_projects() is empty');
select is_empty($$ select id from public.projects $$, 'access_ends_at passed: no project rows visible');
select ok(not pg_temp.cap_as('a0000000-0000-0000-0000-000000000017', 'c0000000-0000-0000-0000-00000000000a', 'dailies.read_all'),
  'revoked: has_capability is false');
select is_empty($$ select * from public.my_projects() $$, 'revoked: my_projects() is empty');

-- ---------------------------------------------------------------------------------------------------------------
-- Bidder wall: bidders never see each other; bids.manage sees both; members.view alone sees neither.
-- ---------------------------------------------------------------------------------------------------------------
select pg_temp.login('a0000000-0000-0000-0000-000000000009');
select results_eq($$ select user_id from public.project_members $$, $$ values ('a0000000-0000-0000-0000-000000000009'::uuid) $$,
  'bidder 1: project_members returns only its own row');
select results_eq($$ select user_id from public.people_display('c0000000-0000-0000-0000-00000000000a') $$,
  $$ values ('a0000000-0000-0000-0000-000000000009'::uuid) $$, 'bidder 1: people_display lists only itself');
select ok(not exists (select 1 from public.people_display('c0000000-0000-0000-0000-00000000000a')
                      where user_id = 'a0000000-0000-0000-0000-000000000014'), 'bidder 1: people_display does not include bidder 2');
select is_empty($$ select id from public.activity where id = 'f0000000-0000-0000-0000-0000000000a2' $$,
  'bidder 1: cannot see activity addressed to bidder 2');
select is_empty($$ select user_id from public.profiles where user_id = 'a0000000-0000-0000-0000-000000000014' $$,
  'bidder 1: cannot read bidder 2 profile');

select pg_temp.login('a0000000-0000-0000-0000-000000000002');
select results_eq($$ select user_id from public.project_members where role = 'bidder' order by 1 $$,
  $$ values ('a0000000-0000-0000-0000-000000000009'::uuid), ('a0000000-0000-0000-0000-000000000014'::uuid) $$,
  'estimator (bids.manage): project_members shows both bidders');
select results_eq($$ select user_id from public.people_display('c0000000-0000-0000-0000-00000000000a') where role = 'bidder' order by 1 $$,
  $$ values ('a0000000-0000-0000-0000-000000000009'::uuid), ('a0000000-0000-0000-0000-000000000014'::uuid) $$,
  'estimator (bids.manage): people_display shows both bidders');

select pg_temp.login('a0000000-0000-0000-0000-000000000003');
select is_empty($$ select id from public.project_members where role = 'bidder' $$, 'pm (members.view, no bids.manage): no bidder rows');
select is_empty($$ select member_id from public.people_display('c0000000-0000-0000-0000-00000000000a') where role = 'bidder' $$,
  'pm (members.view, no bids.manage): people_display hides bidders');

select * from finish();
rollback;
