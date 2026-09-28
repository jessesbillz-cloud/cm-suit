begin;
select plan(22);
-- SPEC §6.4 #7 calendar feed (migration 0022): a per-person secret link. rotate_calendar_feed() returns the raw token
-- once and keeps only its sha256; a new link replaces the old. calendar_feed_lines() (service role only) returns what
-- that person may see: the line's read capability on an active membership at aal1, personal lines only for their
-- person, nothing deleted, the last 30 and next 90 days. Unknown hash: nothing.
\ir _helpers.psql

select pg_temp.mk_user('a0000000-0000-0000-0000-000000000161', 'probe+feed-pm@example.test', 'Feed PM');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000162', 'probe+feed-sub@example.test', 'Feed Sub');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000163', 'probe+feed-est@example.test', 'Feed Estimator');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000164', 'probe+feed-other@example.test', 'Feed Other Job');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000165', 'probe+feed-revoked@example.test', 'Feed Revoked');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000166', 'probe+feed-admin@example.test', 'Feed Admin');

insert into public.orgs (id, name, kind, created_by)
values ('b0000000-0000-0000-0000-000000000161', 'Feed Builders', 'gc', 'a0000000-0000-0000-0000-000000000166');
insert into public.projects (id, org_id, name, stage, created_by) values
  ('c0000000-0000-0000-0000-000000000161', 'b0000000-0000-0000-0000-000000000161', 'Feed Job', 'construction',
   'a0000000-0000-0000-0000-000000000166'),
  ('c0000000-0000-0000-0000-000000000162', 'b0000000-0000-0000-0000-000000000161', 'Feed Job Two', 'construction',
   'a0000000-0000-0000-0000-000000000166');
insert into public.project_members (org_id, project_id, user_id, invite_email, role, status)
select 'b0000000-0000-0000-0000-000000000161', p, u, e, r, s
  from (values ('c0000000-0000-0000-0000-000000000161'::uuid, 'a0000000-0000-0000-0000-000000000161'::uuid, 'probe+feed-pm@example.test', 'pm', 'active'),
               ('c0000000-0000-0000-0000-000000000161', 'a0000000-0000-0000-0000-000000000162', 'probe+feed-sub@example.test', 'sub', 'active'),
               ('c0000000-0000-0000-0000-000000000161', 'a0000000-0000-0000-0000-000000000163', 'probe+feed-est@example.test', 'estimator', 'active'),
               ('c0000000-0000-0000-0000-000000000161', 'a0000000-0000-0000-0000-000000000165', 'probe+feed-revoked@example.test', 'pm', 'revoked'),
               ('c0000000-0000-0000-0000-000000000162', 'a0000000-0000-0000-0000-000000000164', 'probe+feed-other@example.test', 'pm', 'active')
       ) v(p, u, e, r, s)
on conflict do nothing;

-- Lines: two in the window for everyone, one only for the sub, one needing a two-step session, one deleted, one too
-- old, one too far out, one on the other job.
insert into public.calendar_entries (org_id, project_id, kind, title, starts_at, ends_at, all_day, created_by, deleted_at)
select 'b0000000-0000-0000-0000-000000000161', p, k, t, s, e, a, 'a0000000-0000-0000-0000-000000000161', d
  from (values ('c0000000-0000-0000-0000-000000000161'::uuid, 'pours', 'Slab pour', now() + interval '2 days', now() + interval '2 days 3 hours', false, null::timestamptz),
               ('c0000000-0000-0000-0000-000000000161', 'milestones', 'Recent line', now() - interval '10 days', null, true, null),
               ('c0000000-0000-0000-0000-000000000161', 'meetings', 'Deleted line', now() + interval '1 day', null, false, now()),
               ('c0000000-0000-0000-0000-000000000161', 'meetings', 'Old line', now() - interval '40 days', null, false, null),
               ('c0000000-0000-0000-0000-000000000161', 'meetings', 'Far line', now() + interval '100 days', null, false, null),
               ('c0000000-0000-0000-0000-000000000162', 'meetings', 'Other job line', now() + interval '1 day', null, false, null)
       ) v(p, k, t, s, e, a, d);
select public.calendar_mirror('probe_source', 'd0000000-0000-0000-0000-000000000161', 'c0000000-0000-0000-0000-000000000161',
  'my_due', 'Sub due item', now() + interval '3 days', p_visible_to => 'a0000000-0000-0000-0000-000000000162');
select public.calendar_mirror('probe_source', 'd0000000-0000-0000-0000-000000000162', 'c0000000-0000-0000-0000-000000000161',
  'meetings', 'Two-step only', now() + interval '1 day', null, false, null, 'bids.view_pricing');

create temp table tok (who text, n int, token text);
grant all on tok to public;
-- The feed's titles for someone's n-th token, in order.
create function pg_temp.feed_titles(p_who text, p_n int)
returns text[]
language sql
as $$
  select coalesce(array_agg(f.title order by f.starts_at, f.title), '{}')
  from public.calendar_feed_lines(
    encode(extensions.digest((select token from tok where who = p_who and n = p_n), 'sha256'), 'hex')) f;
$$;
grant execute on function pg_temp.feed_titles(text, int) to public;

-- ---------------------------------------------------------------------------------------------------------------
-- Signed-in people make and rotate their own link.
-- ---------------------------------------------------------------------------------------------------------------
set local role authenticated;

select pg_temp.login('a0000000-0000-0000-0000-000000000161');
insert into tok select 'pm', 1, public.rotate_calendar_feed();
select ok((select token ~ '^[A-Za-z0-9_-]{43}$' from tok where who = 'pm' and n = 1), 'rotate: returns a 43-character url-safe token');
select is((select count(*)::int from public.calendar_feed_tokens), 1, 'own row: a person sees that their link exists');
select throws_ok($$ select token_hash from public.calendar_feed_tokens $$, '42501', null, 'own row: the hash is never readable');
select throws_ok($$ select * from public.calendar_feed_lines('x') $$, '42501', null,
  'calendar_feed_lines: not callable by signed-in people');

select pg_temp.login('a0000000-0000-0000-0000-000000000162');
insert into tok select 'sub', 1, public.rotate_calendar_feed();
select is((select count(*)::int from public.calendar_feed_tokens), 1, 'own row: nobody sees someone else''s link');
select pg_temp.login('a0000000-0000-0000-0000-000000000163');
insert into tok select 'est', 1, public.rotate_calendar_feed();
select pg_temp.login('a0000000-0000-0000-0000-000000000164');
insert into tok select 'other', 1, public.rotate_calendar_feed();
select pg_temp.login('a0000000-0000-0000-0000-000000000165');
insert into tok select 'revoked', 1, public.rotate_calendar_feed();

select pg_temp.login('a0000000-0000-0000-0000-000000000161');
insert into tok select 'pm', 2, public.rotate_calendar_feed();
select isnt((select token from tok where who = 'pm' and n = 2), (select token from tok where who = 'pm' and n = 1),
  'rotate again: a new token');

select pg_temp.login(null);
select throws_ok($$ select public.rotate_calendar_feed() $$, '42501', null, 'rotate: refused without a signed-in person');

reset role;

select is((select token_hash from public.calendar_feed_tokens where user_id = 'a0000000-0000-0000-0000-000000000161'),
  encode(extensions.digest((select token from tok where who = 'pm' and n = 2), 'sha256'), 'hex'),
  'rotate again: only the new token''s sha256 is stored');
select is((select count(*)::int from public.calendar_feed_tokens where user_id = 'a0000000-0000-0000-0000-000000000161'), 1,
  'rotate again: one row per person (the hash was replaced)');
select ok(not has_function_privilege('anon', 'public.rotate_calendar_feed()', 'EXECUTE'), 'rotate: not callable by anon');
select ok(not has_function_privilege('anon', 'public.calendar_feed_lines(text)', 'EXECUTE'), 'calendar_feed_lines: not callable by anon');
select ok(not has_function_privilege('authenticated', 'public.calendar_feed_lines(text)', 'EXECUTE'),
  'calendar_feed_lines: no EXECUTE for authenticated');

-- ---------------------------------------------------------------------------------------------------------------
-- The feed (service role).
-- ---------------------------------------------------------------------------------------------------------------
set local role service_role;
select pg_temp.login_service();

select is(pg_temp.feed_titles('pm', 2), '{Recent line,Slab pour}'::text[],
  'feed: pm gets the job''s lines in the window; nothing deleted, too old or too far out, no one else''s personal line');
select is(pg_temp.feed_titles('pm', 1), '{}'::text[], 'feed: the old link stops working after a new one');
select is(pg_temp.feed_titles('sub', 1), '{Recent line,Slab pour,Sub due item}'::text[], 'feed: a sub also gets their own due item');
select is(pg_temp.feed_titles('est', 1), '{Recent line,Slab pour}'::text[],
  'feed: a line that needs a two-step session never goes to a feed');
select is(pg_temp.feed_titles('revoked', 1), '{}'::text[], 'feed: a revoked member gets nothing');
select is(pg_temp.feed_titles('other', 1), '{Other job line}'::text[], 'feed: only jobs the person is on');
select is_empty($$ select * from public.calendar_feed_lines(repeat('0', 64)) $$, 'feed: an unknown hash gets nothing');

reset role;
update public.projects set modules = '{files}' where id = 'c0000000-0000-0000-0000-000000000162';
set local role service_role;
select pg_temp.login_service();
select is(pg_temp.feed_titles('other', 1), '{}'::text[], 'feed: a job with the calendar off shows nothing');

reset role;
select isnt((select last_used_at from public.calendar_feed_tokens where user_id = 'a0000000-0000-0000-0000-000000000162'), null,
  'feed: a read marks the link used');

-- Contrast: in the app, the estimator sees the two-step line once signed in with two steps.
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000163', 'aal2');
select ok(exists (select 1 from public.calendar_entries where title = 'Two-step only'), 'app: the two-step line shows at aal2');
reset role;

select * from finish();
rollback;
