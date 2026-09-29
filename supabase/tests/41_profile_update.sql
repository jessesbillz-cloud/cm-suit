begin;
select plan(8);
-- Migration 0048: a person saves their own profile. The update policy used to read auth.users, which signed-in users
-- may not read, so every save failed ("permission denied for table users"). Now the columns a person may change are
-- granted by name; the email (Auth's, copied at sign-up), the signature file and the certificates are not among them.
\ir _helpers.psql

select pg_temp.mk_user('a0000000-0000-0000-0000-000000000411', 'probe+profile-me@example.test', 'Sample Profile Me');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000412', 'probe+profile-other@example.test', 'Sample Profile Other');

set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000411');

select lives_ok(
  $$update public.profiles set full_name = 'Sample Renamed', company = 'Sample Co', phone = '555-0100', title = 'Sample Title',
      timezone = 'America/Denver', timezone_set_by_user = true
     where user_id = 'a0000000-0000-0000-0000-000000000411'$$,
  'I save my own name, company, phone, title and time zone');
select results_eq(
  $$select full_name, company, timezone, version from public.profiles where user_id = 'a0000000-0000-0000-0000-000000000411'$$,
  $$values ('Sample Renamed'::text, 'Sample Co'::text, 'America/Denver'::text, 2)$$,
  'the save landed and the version moved on');

select throws_ok(
  $$update public.profiles set email = 'probe+profile-new@example.test' where user_id = 'a0000000-0000-0000-0000-000000000411'$$,
  '42501', null, 'my email is not mine to change here (it is Auth''s)');
select throws_ok(
  $$update public.profiles set signature_path = 'someone-else/signature.png' where user_id = 'a0000000-0000-0000-0000-000000000411'$$,
  '42501', null, 'the signature file is not set by a profile save');
select throws_ok(
  $$update public.profiles set cert_numbers = '{"x": "1"}' where user_id = 'a0000000-0000-0000-0000-000000000411'$$,
  '42501', null, 'certificates are not set by a profile save');
select throws_ok(
  $$update public.profiles set user_id = 'a0000000-0000-0000-0000-000000000412' where user_id = 'a0000000-0000-0000-0000-000000000411'$$,
  '42501', null, 'the row cannot move to another person');

update public.profiles set full_name = 'Sample Hijack' where user_id = 'a0000000-0000-0000-0000-000000000412';
reset role;
select is((select full_name from public.profiles where user_id = 'a0000000-0000-0000-0000-000000000412'), 'Sample Profile Other',
  'someone else''s profile is untouched');

select policies_are('public', 'profiles', array['profile: own read', 'profile: own update'], 'profiles keep exactly their two policies');

select * from finish();
rollback;
