begin;
select plan(11);
-- Migration 0039: "View as" for testers. OFF by default; a tester takes any role on every job they're on, and "Me"
-- (null) puts the real roles back. Nobody else can use it.
\ir _helpers.psql

select pg_temp.mk_user('a0000000-0000-0000-0000-000000000331', 'probe+va-tester@example.test', 'VA Tester');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000332', 'probe+va-other@example.test', 'VA Other');
insert into public.orgs (id, name, kind, created_by)
values ('b0000000-0000-0000-0000-000000000331', 'VA Builders', 'gc', 'a0000000-0000-0000-0000-000000000332');
insert into public.projects (id, org_id, name, stage, created_by) values
  ('c0000000-0000-0000-0000-000000000331', 'b0000000-0000-0000-0000-000000000331', 'VA Job 1', 'construction',
   'a0000000-0000-0000-0000-000000000332'),
  ('c0000000-0000-0000-0000-000000000332', 'b0000000-0000-0000-0000-000000000331', 'VA Job 2', 'bidding',
   'a0000000-0000-0000-0000-000000000332');
insert into public.project_members (org_id, project_id, user_id, invite_email, role, status) values
  ('b0000000-0000-0000-0000-000000000331', 'c0000000-0000-0000-0000-000000000331', 'a0000000-0000-0000-0000-000000000331',
   'probe+va-tester@example.test', 'project_admin', 'active'),
  ('b0000000-0000-0000-0000-000000000331', 'c0000000-0000-0000-0000-000000000332', 'a0000000-0000-0000-0000-000000000331',
   'probe+va-tester@example.test', 'pm', 'active');
insert into public.testing_superusers (user_id) values ('a0000000-0000-0000-0000-000000000331');

set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000331');
select is(public.testing_view_as_state(), null, 'switch off: nothing in the top bar');
select throws_ok($$ select public.testing_view_as('architect') $$, '42501', null, 'switch off: refused');
select throws_ok($$ select count(*) from public.testing_superusers $$, '42501', null, 'people cannot read the tester list');

reset role;
update public.security_switches set enabled = true where key = 'testing_view_as';
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000332');
select is(public.testing_view_as_state(), null, 'switch on: not a tester, nothing in the top bar');
select throws_ok($$ select public.testing_view_as('architect') $$, '42501', null, 'switch on: a non-tester is refused');

select pg_temp.login('a0000000-0000-0000-0000-000000000331');
select is(public.testing_view_as_state() -> 'viewing', 'null'::jsonb, 'tester: viewing as myself');
select throws_ok($$ select public.testing_view_as('emperor') $$, '22023', null, 'tester: only real roles');
select is(public.testing_view_as('architect') ->> 'viewing', 'architect', 'tester: viewing as the architect');
select results_eq(
  $$ select public.has_capability('c0000000-0000-0000-0000-000000000331', 'rfi.answer'),
            public.has_capability('c0000000-0000-0000-0000-000000000331', 'members.manage') $$,
  $$ values (true, false) $$,
  'as the architect: the architect''s capabilities, not the admin''s');
select is(public.testing_view_as(null) -> 'viewing', 'null'::jsonb, 'tester: back to myself');
select results_eq(
  $$ select project_id, role from public.project_members where user_id = auth.uid() order by 1 $$,
  $$ values ('c0000000-0000-0000-0000-000000000331'::uuid, 'project_admin'::text),
            ('c0000000-0000-0000-0000-000000000332'::uuid, 'pm'::text) $$,
  'back to myself: every job has its real role again');

select * from finish();
rollback;
