begin;
select plan(23);
-- Migration 0049: rfi_progress, the RFI log's route strip. Who sees which RFIs' steps (exactly what rfi_list shows them:
-- a sub never sees the steps of an RFI they can't see), and each step's label, who did it, when it got it, when it
-- moved on and the whole days it sat there on the JOB's clock (under 24 hours = 0, else calendar days in the job's
-- zone; the current step counts to now). Only the current pass after a "Send back" counts. A deleted RFI shows nothing.
\ir _helpers.psql

-- A moment on the job's clock: today's date in Los Angeles plus p_days, at p_time there.
create function pg_temp.la(p_days int, p_time time) returns timestamptz language sql stable as $$
  select (((now() at time zone 'America/Los_Angeles')::date + p_days) + p_time) at time zone 'America/Los_Angeles' $$;
grant execute on function pg_temp.la(int, time) to public;

select pg_temp.mk_user('a0000000-0000-0000-0000-000000000491', 'probe+rp-sub@example.test', 'Sam Sub');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000492', 'probe+rp-sub2@example.test', 'Sue Sub');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000493', 'probe+rp-insp@example.test', 'Ivy Inspector');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000494', 'probe+rp-pe@example.test', 'Pat Engineer');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000495', 'probe+rp-arch@example.test', 'Ann Architect');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000496', 'probe+rp-bidder@example.test', 'Bo Bidder');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000497', 'probe+rp-other@example.test', 'Oz Other');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000498', 'probe+rp-admin@example.test', 'Ada Admin');

insert into public.orgs (id, name, kind, created_by) values
  ('b0000000-0000-0000-0000-000000000491', 'Sample Builders', 'gc', 'a0000000-0000-0000-0000-000000000498');
insert into public.projects (id, org_id, name, stage, timezone, created_by) values
  ('c0000000-0000-0000-0000-000000000491', 'b0000000-0000-0000-0000-000000000491', 'Strip Job', 'construction',
   'America/Los_Angeles', 'a0000000-0000-0000-0000-000000000498');
insert into public.project_members (org_id, project_id, user_id, invite_email, role, status)
select 'b0000000-0000-0000-0000-000000000491', 'c0000000-0000-0000-0000-000000000491', u, e, r, 'active'
  from (values
    ('a0000000-0000-0000-0000-000000000491'::uuid, 'probe+rp-sub@example.test', 'sub'),
    ('a0000000-0000-0000-0000-000000000492', 'probe+rp-sub2@example.test', 'sub'),
    ('a0000000-0000-0000-0000-000000000493', 'probe+rp-insp@example.test', 'inspector'),
    ('a0000000-0000-0000-0000-000000000494', 'probe+rp-pe@example.test', 'pe'),
    ('a0000000-0000-0000-0000-000000000495', 'probe+rp-arch@example.test', 'architect'),
    ('a0000000-0000-0000-0000-000000000496', 'probe+rp-bidder@example.test', 'bidder')) v(u, e, r);
-- The job's route today: one Inspector step.
insert into public.rfi_route_steps (org_id, project_id, position, role) values
  ('b0000000-0000-0000-0000-000000000491', 'c0000000-0000-0000-0000-000000000491', 1, 'inspector');

-- Seven RFIs by Sam Sub, written straight into the tables with known times:
--   A a draft (2 hours old)                        B in review, sent back once and sent again 5 days ago (noon)
--   C open with the architect since 6 days ago     D answered                E closed
--   F voided while the inspector had it            G deleted
insert into public.rfis (id, org_id, project_id, created_by, created_at, number, status, title, question, step,
                         sent_at, sent_hash, issued_at, issued_by, issued_hash, due_at, answer, answered_at, answered_by,
                         impact_until, closed_at, deleted_at)
select id::uuid, 'b0000000-0000-0000-0000-000000000491', 'c0000000-0000-0000-0000-000000000491',
       'a0000000-0000-0000-0000-000000000491', created_at, number, status, 'Probe ' || status, 'Probe question', step,
       sent_at, case when sent_at is not null then repeat('a', 64) end, issued_at,
       case when issued_at is not null then 'a0000000-0000-0000-0000-000000000494'::uuid end,
       case when issued_at is not null then repeat('b', 64) end, due_at, case when answered_at is not null then 'Probe answer' end,
       answered_at, case when answered_at is not null then 'a0000000-0000-0000-0000-000000000495'::uuid end,
       case when answered_at is not null then answered_at + interval '7 days' end, closed_at, deleted_at
  from (values
    ('e0000000-0000-0000-0000-00000000049a', now() - interval '2 hours', null::int, 'draft', 0, null::timestamptz,
     null::timestamptz, null::timestamptz, null::timestamptz, null::timestamptz, null::timestamptz),
    ('e0000000-0000-0000-0000-00000000049b', pg_temp.la(-30, '09:00'), null, 'review', 1, pg_temp.la(-5, '12:00'),
     null, null, null, null, null),
    ('e0000000-0000-0000-0000-00000000049c', pg_temp.la(-10, '22:00'), 1, 'open', 3, pg_temp.la(-9, '09:00'),
     pg_temp.la(-6, '08:00'), pg_temp.la(-1, '08:00'), null, null, null),
    ('e0000000-0000-0000-0000-00000000049d', pg_temp.la(-20, '09:00'), 2, 'answered', 4, pg_temp.la(-20, '10:00'),
     pg_temp.la(-18, '14:00'), pg_temp.la(-11, '14:00'), pg_temp.la(-15, '14:00'), null, null),
    ('e0000000-0000-0000-0000-00000000049e', pg_temp.la(-20, '09:00'), 3, 'closed', 4, pg_temp.la(-20, '10:00'),
     pg_temp.la(-18, '14:00'), pg_temp.la(-11, '14:00'), pg_temp.la(-15, '14:00'), pg_temp.la(-14, '14:00'), null),
    ('e0000000-0000-0000-0000-00000000049f', pg_temp.la(-3, '08:00'), null, 'void', 1, pg_temp.la(-3, '09:00'),
     null, null, null, null, null),
    ('e0000000-0000-0000-0000-000000000490', pg_temp.la(-4, '08:00'), 4, 'open', 3, pg_temp.la(-4, '09:00'),
     pg_temp.la(-3, '09:00'), pg_temp.la(4, '09:00'), null, null, now())
  ) v(id, created_at, number, status, step, sent_at, issued_at, due_at, answered_at, closed_at, deleted_at);

-- Every RFI but the draft has its own copy of the route.
insert into public.rfi_steps (rfi_id, position, role, label)
select id, 1, 'inspector', 'Inspector' from public.rfis
 where project_id = 'c0000000-0000-0000-0000-000000000491' and status <> 'draft';

insert into public.rfi_events (rfi_id, project_id, org_id, at, actor, kind, step, note)
select rfi::uuid, 'c0000000-0000-0000-0000-000000000491', 'b0000000-0000-0000-0000-000000000491', at, actor::uuid, kind, step, note
  from (values
    -- B: the first pass (sent, sent on by the inspector, sent back by the PE), then sent again.
    ('e0000000-0000-0000-0000-00000000049b', pg_temp.la(-28, '09:00'), 'a0000000-0000-0000-0000-000000000491', 'sent', 0, null),
    ('e0000000-0000-0000-0000-00000000049b', pg_temp.la(-27, '09:00'), 'a0000000-0000-0000-0000-000000000493', 'forwarded', 1, null),
    ('e0000000-0000-0000-0000-00000000049b', pg_temp.la(-5, '09:00'), 'a0000000-0000-0000-0000-000000000494', 'returned', 2, 'Probe'),
    ('e0000000-0000-0000-0000-00000000049b', pg_temp.la(-5, '12:00'), 'a0000000-0000-0000-0000-000000000491', 'sent', 0, null),
    -- C: sent 11 hours after it was written (across midnight), 45 hours with the inspector (two calendar days),
    -- 26 hours to issue.
    ('e0000000-0000-0000-0000-00000000049c', pg_temp.la(-9, '09:00'), 'a0000000-0000-0000-0000-000000000491', 'sent', 0, null),
    ('e0000000-0000-0000-0000-00000000049c', pg_temp.la(-7, '06:00'), 'a0000000-0000-0000-0000-000000000493', 'forwarded', 1, null),
    ('e0000000-0000-0000-0000-00000000049c', pg_temp.la(-6, '08:00'), 'a0000000-0000-0000-0000-000000000494', 'issued', 2, null),
    -- D and E: answered after three days with the architect; E was closed.
    ('e0000000-0000-0000-0000-00000000049d', pg_temp.la(-20, '10:00'), 'a0000000-0000-0000-0000-000000000491', 'sent', 0, null),
    ('e0000000-0000-0000-0000-00000000049d', pg_temp.la(-19, '12:00'), 'a0000000-0000-0000-0000-000000000493', 'forwarded', 1, null),
    ('e0000000-0000-0000-0000-00000000049d', pg_temp.la(-18, '14:00'), 'a0000000-0000-0000-0000-000000000494', 'issued', 2, null),
    ('e0000000-0000-0000-0000-00000000049d', pg_temp.la(-15, '14:00'), 'a0000000-0000-0000-0000-000000000495', 'answered', 3, null),
    ('e0000000-0000-0000-0000-00000000049e', pg_temp.la(-20, '10:00'), 'a0000000-0000-0000-0000-000000000491', 'sent', 0, null),
    ('e0000000-0000-0000-0000-00000000049e', pg_temp.la(-19, '12:00'), 'a0000000-0000-0000-0000-000000000493', 'forwarded', 1, null),
    ('e0000000-0000-0000-0000-00000000049e', pg_temp.la(-18, '14:00'), 'a0000000-0000-0000-0000-000000000494', 'issued', 2, null),
    ('e0000000-0000-0000-0000-00000000049e', pg_temp.la(-15, '14:00'), 'a0000000-0000-0000-0000-000000000495', 'answered', 3, null),
    ('e0000000-0000-0000-0000-00000000049e', pg_temp.la(-14, '14:00'), 'a0000000-0000-0000-0000-000000000491', 'closed', 4, null),
    -- F: voided by the PE while the inspector had it.
    ('e0000000-0000-0000-0000-00000000049f', pg_temp.la(-3, '09:00'), 'a0000000-0000-0000-0000-000000000491', 'sent', 0, null),
    ('e0000000-0000-0000-0000-00000000049f', pg_temp.la(-2, '09:00'), 'a0000000-0000-0000-0000-000000000494', 'voided', 1, 'Probe')
  ) v(rfi, at, actor, kind, step, note);

-- ---------------------------------------------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------------------------------------------
select ok(not has_function_privilege('anon', 'public.rfi_progress(uuid)', 'execute'), 'grants: anon cannot call it');
select ok(has_function_privilege('authenticated', 'public.rfi_progress(uuid)', 'execute'), 'grants: signed-in people can');

set local role authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- Who sees which RFIs' steps: exactly the RFIs rfi_list shows them
-- ---------------------------------------------------------------------------------------------------------------
select pg_temp.login('a0000000-0000-0000-0000-000000000491');
select set_eq($$ select distinct rfi_id from public.rfi_progress('c0000000-0000-0000-0000-000000000491') $$,
  $$ values ('e0000000-0000-0000-0000-00000000049a'::uuid), ('e0000000-0000-0000-0000-00000000049b'),
            ('e0000000-0000-0000-0000-00000000049c'), ('e0000000-0000-0000-0000-00000000049d'),
            ('e0000000-0000-0000-0000-00000000049e'), ('e0000000-0000-0000-0000-00000000049f') $$,
  'the originator: all of their own, the draft too; never the deleted one');
select set_eq($$ select distinct rfi_id from public.rfi_progress('c0000000-0000-0000-0000-000000000491') $$,
  $$ select id from public.rfi_list('c0000000-0000-0000-0000-000000000491') $$, 'the originator: the same RFIs as the log');

select pg_temp.login('a0000000-0000-0000-0000-000000000492');
select set_eq($$ select distinct rfi_id from public.rfi_progress('c0000000-0000-0000-0000-000000000491') $$,
  $$ values ('e0000000-0000-0000-0000-00000000049d'::uuid), ('e0000000-0000-0000-0000-00000000049e') $$,
  'another sub: only the answered and closed ones, never the steps of one they cannot see');
select set_eq($$ select distinct rfi_id from public.rfi_progress('c0000000-0000-0000-0000-000000000491') $$,
  $$ select id from public.rfi_list('c0000000-0000-0000-0000-000000000491') $$, 'another sub: the same RFIs as the log');

select pg_temp.login('a0000000-0000-0000-0000-000000000493');
select set_eq($$ select distinct rfi_id from public.rfi_progress('c0000000-0000-0000-0000-000000000491') $$,
  $$ values ('e0000000-0000-0000-0000-00000000049b'::uuid), ('e0000000-0000-0000-0000-00000000049c'),
            ('e0000000-0000-0000-0000-00000000049d'), ('e0000000-0000-0000-0000-00000000049e'),
            ('e0000000-0000-0000-0000-00000000049f') $$,
  'the inspector on the route: every sent one, not the draft');
select set_eq($$ select distinct rfi_id from public.rfi_progress('c0000000-0000-0000-0000-000000000491') $$,
  $$ select id from public.rfi_list('c0000000-0000-0000-0000-000000000491') $$, 'the inspector: the same RFIs as the log');

select pg_temp.login('a0000000-0000-0000-0000-000000000495');
select set_eq($$ select distinct rfi_id from public.rfi_progress('c0000000-0000-0000-0000-000000000491') $$,
  $$ values ('e0000000-0000-0000-0000-00000000049c'::uuid), ('e0000000-0000-0000-0000-00000000049d'),
            ('e0000000-0000-0000-0000-00000000049e') $$,
  'the architect: from open on');
select set_eq($$ select distinct rfi_id from public.rfi_progress('c0000000-0000-0000-0000-000000000491') $$,
  $$ select id from public.rfi_list('c0000000-0000-0000-0000-000000000491') $$, 'the architect: the same RFIs as the log');

select pg_temp.login('a0000000-0000-0000-0000-000000000494');
select set_eq($$ select distinct rfi_id from public.rfi_progress('c0000000-0000-0000-0000-000000000491') $$,
  $$ select id from public.rfi_list('c0000000-0000-0000-0000-000000000491') $$, 'the PE: the same RFIs as the log');
select is((select count(distinct rfi_id)::int from public.rfi_progress('c0000000-0000-0000-0000-000000000491')), 6,
  'the PE: every RFI on the job but the deleted one');

select pg_temp.login('a0000000-0000-0000-0000-000000000496');
select is_empty($$ select 1 from public.rfi_progress('c0000000-0000-0000-0000-000000000491') $$, 'a bidder: nothing');
select pg_temp.login('a0000000-0000-0000-0000-000000000497');
select is_empty($$ select 1 from public.rfi_progress('c0000000-0000-0000-0000-000000000491') $$, 'someone off the job: nothing');

-- ---------------------------------------------------------------------------------------------------------------
-- The steps and how long each sat
-- ---------------------------------------------------------------------------------------------------------------
select pg_temp.login('a0000000-0000-0000-0000-000000000491');
select results_eq(
  $$ select "position", kind, label, person_name, state, entered_at, left_at, days
       from public.rfi_progress('c0000000-0000-0000-0000-000000000491')
      where rfi_id = 'e0000000-0000-0000-0000-00000000049a' order by "position" $$,
  $$ values (0, 'ask'::text, 'Sub'::text, 'Sam Sub'::text, 'current'::text, now() - interval '2 hours', null::timestamptz, 0),
            (1, 'review', 'Inspector', null, 'next', null, null, null),
            (2, 'issue', 'PM / PE', null, 'next', null, null, null),
            (3, 'answer', 'Architect', null, 'next', null, null, null),
            (4, 'answered', 'Answered', null, 'next', null, null, null) $$,
  'a draft: with its originator (their role on the job) since it was written, under a day; the job''s route ahead');

select pg_temp.login('a0000000-0000-0000-0000-000000000494');
select results_eq(
  $$ select "position", kind, label, person_name, state, entered_at, left_at, days
       from public.rfi_progress('c0000000-0000-0000-0000-000000000491')
      where rfi_id = 'e0000000-0000-0000-0000-00000000049b' order by "position" $$,
  $$ values (0, 'ask'::text, 'Sub'::text, 'Sam Sub'::text, 'done'::text, pg_temp.la(-5, '09:00'), pg_temp.la(-5, '12:00'), 0),
            (1, 'review', 'Inspector', null, 'current', pg_temp.la(-5, '12:00'), null, 5),
            (2, 'issue', 'PM / PE', null, 'next', null, null, null),
            (3, 'answer', 'Architect', null, 'next', null, null, null),
            (4, 'answered', 'Answered', null, 'next', null, null, null) $$,
  'sent back and sent again: only this pass counts (from the send back), and the inspector has had it 5 days');

select results_eq(
  $$ select "position", kind, label, person_name, state, entered_at, left_at, days
       from public.rfi_progress('c0000000-0000-0000-0000-000000000491')
      where rfi_id = 'e0000000-0000-0000-0000-00000000049c' order by "position" $$,
  $$ values (0, 'ask'::text, 'Sub'::text, 'Sam Sub'::text, 'done'::text, pg_temp.la(-10, '22:00'), pg_temp.la(-9, '09:00'), 0),
            (1, 'review', 'Inspector', 'Ivy Inspector', 'done', pg_temp.la(-9, '09:00'), pg_temp.la(-7, '06:00'), 2),
            (2, 'issue', 'PE', 'Pat Engineer', 'done', pg_temp.la(-7, '06:00'), pg_temp.la(-6, '08:00'), 1),
            (3, 'answer', 'Architect', null, 'current', pg_temp.la(-6, '08:00'), null, 6),
            (4, 'answered', 'Answered', null, 'next', null, null, null) $$,
  'open: under 24 hours across midnight is 0, 45 hours over two dates is 2, the issuer''s role once issued, 6 days now');
select is((select array_agg(distinct due_at) from public.rfi_progress('c0000000-0000-0000-0000-000000000491')
            where rfi_id = 'e0000000-0000-0000-0000-00000000049c'),
  array[pg_temp.la(-1, '08:00')], 'open: every step carries the RFI''s due date');

select pg_temp.login('a0000000-0000-0000-0000-000000000492');
select results_eq(
  $$ select "position", kind, label, person_name, state, entered_at, left_at, days
       from public.rfi_progress('c0000000-0000-0000-0000-000000000491')
      where rfi_id = 'e0000000-0000-0000-0000-00000000049d' order by "position" $$,
  $$ values (0, 'ask'::text, 'Sub'::text, 'Sam Sub'::text, 'done'::text, pg_temp.la(-20, '09:00'), pg_temp.la(-20, '10:00'), 0),
            (1, 'review', 'Inspector', 'Ivy Inspector', 'done', pg_temp.la(-20, '10:00'), pg_temp.la(-19, '12:00'), 1),
            (2, 'issue', 'PE', 'Pat Engineer', 'done', pg_temp.la(-19, '12:00'), pg_temp.la(-18, '14:00'), 1),
            (3, 'answer', 'Architect', 'Ann Architect', 'done', pg_temp.la(-18, '14:00'), pg_temp.la(-15, '14:00'), 3),
            (4, 'answered', 'Answered', null, 'done', pg_temp.la(-15, '14:00'), null, null) $$,
  'answered: every step done, 3 days with the architect, and the end is reached (no time of its own)');
select results_eq(
  $$ select label, state from public.rfi_progress('c0000000-0000-0000-0000-000000000491')
      where rfi_id = 'e0000000-0000-0000-0000-00000000049e' and kind = 'answered' $$,
  $$ values ('Closed'::text, 'done'::text) $$, 'closed: the end says Closed');

select pg_temp.login('a0000000-0000-0000-0000-000000000494');
select results_eq(
  $$ select state from public.rfi_progress('c0000000-0000-0000-0000-000000000491')
      where rfi_id = 'e0000000-0000-0000-0000-00000000049f' order by "position" $$,
  $$ values ('done'::text), ('next'), ('next'), ('next'), ('next') $$,
  'void: the steps before it stopped are done, and nobody has it now');

-- The job's clock decides the days: the same moments on a job in Tokyo fall on other dates.
reset role;
update public.projects set timezone = 'Asia/Tokyo' where id = 'c0000000-0000-0000-0000-000000000491';
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000494');
select results_eq(
  $$ select "position", days from public.rfi_progress('c0000000-0000-0000-0000-000000000491')
      where rfi_id = 'e0000000-0000-0000-0000-00000000049c' and "position" in (1, 2) order by "position" $$,
  $$ values (1, 1), (2, 2) $$, 'time zone: whole days count on the job''s own calendar');

-- ---------------------------------------------------------------------------------------------------------------
-- Deleting an RFI takes its steps away for everyone
-- ---------------------------------------------------------------------------------------------------------------
reset role;
update public.rfis set deleted_at = now() where id = 'e0000000-0000-0000-0000-00000000049c';
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000495');
select set_eq($$ select distinct rfi_id from public.rfi_progress('c0000000-0000-0000-0000-000000000491') $$,
  $$ values ('e0000000-0000-0000-0000-00000000049d'::uuid), ('e0000000-0000-0000-0000-00000000049e') $$,
  'deleted: gone from the architect''s strip too');

select * from finish();
rollback;
