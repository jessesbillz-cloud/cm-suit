begin;
select plan(10);
-- Migration 0036: personal sign-in keys (service-only lookup, allowlist + revocation respected) and the testing switch,
-- OFF by default: with it off, pricing still needs two-step and signing still needs a fresh sign-in.
\ir _helpers.psql

select pg_temp.mk_user('a0000000-0000-0000-0000-000000000301', 'probe+tl-est@example.test', 'TL Estimator');
insert into public.orgs (id, name, kind, created_by)
values ('b0000000-0000-0000-0000-000000000301', 'TL Builders', 'gc', 'a0000000-0000-0000-0000-000000000301');
insert into public.projects (id, org_id, name, stage, created_by)
values ('c0000000-0000-0000-0000-000000000301', 'b0000000-0000-0000-0000-000000000301', 'TL Job', 'bidding',
        'a0000000-0000-0000-0000-000000000301');
insert into public.signin_allowlist (email) values ('probe+tl-est@example.test') on conflict do nothing;
insert into public.signin_keys (email, token_hash, label) values
  ('probe+tl-est@example.test', repeat('a', 64), 'active'),
  ('probe+tl-est@example.test', repeat('b', 64), 'revoked'),
  ('probe+tl-nobody@example.test', repeat('c', 64), 'not on the allowlist');
update public.signin_keys set revoked_at = now() where label = 'revoked';

select is(public.testing_relaxed_login(), false, 'the testing switch is off by default');

set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000301');
select is(public.has_capability('c0000000-0000-0000-0000-000000000301', 'bids.view_pricing'), false,
  'switch off: pricing still needs two-step');
select throws_ok($$ select public.signin_key_email(repeat('a', 64)) $$, '42501', null, 'signin_key_email: not callable by people');
select throws_ok($$ select count(*) from public.signin_keys $$, '42501', null, 'signin_keys: people cannot read it');
select pg_temp.login_stale('a0000000-0000-0000-0000-000000000301');
select throws_like($$ select public.begin_daily_submit(gen_random_uuid(), 1, repeat('a', 64), '') $$, 'reauth_required%',
  'switch off: signing still needs a fresh sign-in');

reset role;
select is(public.signin_key_email(repeat('a', 64)), 'probe+tl-est@example.test', 'an active key on the allowlist signs in');
select is(public.signin_key_email(repeat('b', 64)), null, 'a revoked key does not');
select is(public.signin_key_email(repeat('c', 64)), null, 'a key for an address off the allowlist does not');

update public.security_switches set enabled = true where key = 'testing_relaxed_login';
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000301');
select is(public.has_capability('c0000000-0000-0000-0000-000000000301', 'bids.view_pricing'), true,
  'switch on: pricing without two-step');
select pg_temp.login_stale('a0000000-0000-0000-0000-000000000301');
select throws_ok($$ select public.begin_daily_submit(gen_random_uuid(), 1, repeat('a', 64), '') $$, 'P0002', null,
  'switch on: signing skips the fresh sign-in (gets to the report lookup)');

select * from finish();
rollback;
