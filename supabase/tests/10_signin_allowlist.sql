begin;
select plan(5);
-- Sign-in allowlist (migration 0016): with rows, only listed emails get an account; empty means no limit.
\ir _helpers.psql

select lives_ok($$ select pg_temp.mk_user('a0000000-0000-0000-0000-000000000031', 'probe+open@example.test') $$,
  'allowlist empty: anyone can get an account');

insert into public.signin_allowlist (email) values ('probe+listed@example.test');
select lives_ok($$ select pg_temp.mk_user('a0000000-0000-0000-0000-000000000032', 'Probe+Listed@example.test') $$,
  'allowlist set: a listed email (any case) gets an account');
select throws_ok($$ select pg_temp.mk_user('a0000000-0000-0000-0000-000000000033', 'probe+stranger@example.test') $$,
  '42501', 'This email can''t sign in here.', 'allowlist set: any other email is refused');

set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000032');
select throws_ok($$ select email from public.signin_allowlist $$, '42501', null, 'allowlist: signed-in people cannot read it');
select throws_ok($$ insert into public.signin_allowlist (email) values ('probe+sneak@example.test') $$, '42501', null,
  'allowlist: signed-in people cannot add to it');

select * from finish();
rollback;
