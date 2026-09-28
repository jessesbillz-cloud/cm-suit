begin;
select plan(7);
-- Migration 0035: a company invite by email binds on that person's first sign-in (accept_invites), like job invites.
\ir _helpers.psql

select pg_temp.mk_user('a0000000-0000-0000-0000-000000000291', 'probe+oi-owner@example.test', 'OI Owner');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000292', 'probe+oi-admin@example.test', 'OI Admin');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000293', 'probe+oi-out@example.test', 'OI Outsider');
insert into public.orgs (id, name, kind, created_by)
values ('b0000000-0000-0000-0000-000000000291', 'OI Builders', 'gc', 'a0000000-0000-0000-0000-000000000291');
insert into public.org_members (org_id, user_id, org_role, created_by)
values ('b0000000-0000-0000-0000-000000000291', 'a0000000-0000-0000-0000-000000000292', 'admin', 'a0000000-0000-0000-0000-000000000291');

set local role authenticated;

select pg_temp.login('a0000000-0000-0000-0000-000000000291');
select lives_ok($$ insert into public.org_invites (org_id, invite_email, org_role, created_by)
  values ('b0000000-0000-0000-0000-000000000291', 'probe+oi-new@example.test', 'owner', auth.uid()) $$,
  'owner invites a future owner by email');

select pg_temp.login('a0000000-0000-0000-0000-000000000292');
select throws_ok($$ insert into public.org_invites (org_id, invite_email, org_role, created_by)
  values ('b0000000-0000-0000-0000-000000000291', 'probe+oi-x@example.test', 'owner', auth.uid()) $$,
  '42501', null, 'an admin cannot hand out ownership');
select lives_ok($$ insert into public.org_invites (org_id, invite_email, org_role, created_by)
  values ('b0000000-0000-0000-0000-000000000291', 'probe+oi-y@example.test', 'member', auth.uid()) $$,
  'an admin invites a member');

select pg_temp.login('a0000000-0000-0000-0000-000000000293');
select throws_ok($$ insert into public.org_invites (org_id, invite_email, org_role, created_by)
  values ('b0000000-0000-0000-0000-000000000291', 'probe+oi-z@example.test', 'member', auth.uid()) $$,
  '42501', null, 'an outsider cannot invite');
select is_empty($$ select id from public.org_invites $$, 'an outsider sees no invites');

-- The invited person signs in for the first time.
reset role;
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000294', 'probe+oi-new@example.test', 'OI New');
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000294');
select is(public.accept_invites(), 1, 'accept_invites binds the company invite');
select results_eq($$ select org_role from public.org_members where user_id = auth.uid() $$,
  $$ values ('owner'::text) $$, 'the new person is an owner of the company');

select * from finish();
rollback;
