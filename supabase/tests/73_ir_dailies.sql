begin;
select plan(16);
-- Migration 0085 (Jesse, Oct 5: "I went to Be present with the IOR and pushed that, and it automatically turned green
-- and confirmed it"): the attendance call sets the attendance and nothing else. A pending request stays pending, its
-- calendar line stays yellow, its history has no status change, and clearing the call leaves it as it was. Confirm is
-- its own step. And daily_day_facts answers each request's company and route, and the requests received that day for
-- another day, read in the job's zone, as the caller may read them.
\ir _helpers.psql

create temp table ids (k text primary key, v uuid);
grant all on ids to public;
create function pg_temp.rid(p_k text) returns uuid language sql stable as $$ select v from ids where k = p_k $$;
create function pg_temp.d(p_days int) returns date language sql stable as $$
  select (now() at time zone 'America/Los_Angeles')::date + p_days $$;
create function pg_temp.req(p_k text) returns public.inspection_requests language sql stable security definer as $$
  select r from public.inspection_requests r where r.id = (select v from ids where k = p_k) $$;
create function pg_temp.line(p_k text) returns text language sql stable security definer as $$
  select status from public.calendar_entries where source_type = 'inspection_request' and source_id = (select v from ids where k = p_k) $$;
create function pg_temp.last_event(p_k text) returns jsonb language sql stable security definer as $$
  select jsonb_build_object('action', e.action, 'changes', e.changes) from public.ir_events e
   where e.request_id = (select v from ids where k = p_k) order by e.id desc limit 1 $$;
create function pg_temp.facts(p_day int) returns jsonb language sql stable as $$
  select public.daily_day_facts('c0000000-0000-0000-0000-000000000731', pg_temp.d(p_day)) $$;
create function pg_temp.submit(co text, d date, t time, items text) returns public.inspection_requests language sql as $$
  select public.ir_submit(p_project_id => 'c0000000-0000-0000-0000-000000000731', p_company => co, p_request_date => d,
    p_kind => 'ior', p_items => items, p_notice_ack => true, p_start_time => t, p_duration_kind => 'timed', p_duration_min => 60) $$;
grant execute on all functions in schema pg_temp to public;

select pg_temp.mk_user('a0000000-0000-0000-0000-000000000731', 'probe+ird-admin@example.test', 'IRD Admin');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000732', 'probe+ird-sub@example.test', 'IRD Sub');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000733', 'probe+ird-insp@example.test', 'IRD Inspector');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000734', 'probe+ird-out@example.test', 'IRD Outsider');
insert into public.orgs (id, name, kind, created_by) values
  ('b0000000-0000-0000-0000-000000000731', 'Sample IRD Builders', 'gc', 'a0000000-0000-0000-0000-000000000731'),
  ('b0000000-0000-0000-0000-000000000732', 'Sample IRD Framing', 'sub', 'a0000000-0000-0000-0000-000000000732');
insert into public.projects (id, org_id, name, stage, timezone, created_by)
values ('c0000000-0000-0000-0000-000000000731', 'b0000000-0000-0000-0000-000000000731', 'IRD Job', 'construction',
        'America/Los_Angeles', 'a0000000-0000-0000-0000-000000000731');
insert into public.project_members (org_id, project_id, user_id, invite_email, member_org_id, role, status)
select 'b0000000-0000-0000-0000-000000000731', 'c0000000-0000-0000-0000-000000000731', u, e, o, r, 'active'
  from (values
    ('a0000000-0000-0000-0000-000000000732'::uuid, 'probe+ird-sub@example.test', 'b0000000-0000-0000-0000-000000000732'::uuid, 'sub'),
    ('a0000000-0000-0000-0000-000000000733', 'probe+ird-insp@example.test', null, 'inspector')) v(u, e, o, r);

set local role authenticated;
-- The sub asks for one inspection tomorrow (A) and one today (B).
select pg_temp.login('a0000000-0000-0000-0000-000000000732');
insert into ids select 'A', (pg_temp.submit('Sample IRD Framing', pg_temp.d(1), '09:00', 'Shear walls, level 2')).id;
insert into ids select 'B', (pg_temp.submit('Sample IRD Framing', pg_temp.d(0), '13:00', 'Hold-downs, grid C')).id;
select is((pg_temp.req('A')).status, 'pending', 'a new request is pending');

-- ---------------------------------------------------------------------------------------------------------------------
-- 1. Attendance sets the attendance only
-- ---------------------------------------------------------------------------------------------------------------------
select pg_temp.login('a0000000-0000-0000-0000-000000000733');
select is((select array[(r).status, (r).attendance] from (select public.ir_set_attendance(pg_temp.rid('A'), (pg_temp.req('A')).version,
  'be_present') as r) x), array['pending', 'be_present'], 'Be present with the IOR on a pending request: still pending');
select is(pg_temp.line('A'), 'pending', 'its calendar line stays pending (yellow)');
select is(pg_temp.last_event('A')->>'action', 'attendance', 'the history says Attendance');
select ok(not (pg_temp.last_event('A')->'changes' ? 'status'), 'and records no status change');
select is((select array[(r).status, coalesce((r).attendance, 'none')] from (select public.ir_set_attendance(pg_temp.rid('A'),
  (pg_temp.req('A')).version) as r) x), array['pending', 'none'], 'clearing the call leaves it pending');
select is((public.ir_set_attendance(pg_temp.rid('A'), (pg_temp.req('A')).version, 'alone')).status, 'pending',
  'I''ve got this alone: still pending');
-- Confirm is its own step, and attendance after it leaves it confirmed.
select is((public.ir_confirm(pg_temp.rid('A'), (pg_temp.req('A')).version)).status, 'confirmed', 'Confirm confirms');
select is((select array[(r).status, (r).attendance] from (select public.ir_set_attendance(pg_temp.rid('A'), (pg_temp.req('A')).version,
  'be_present') as r) x), array['confirmed', 'be_present'], 'attendance on a confirmed request: still confirmed');
select is(pg_temp.line('A'), 'confirmed', 'its calendar line is confirmed (green)');

-- ---------------------------------------------------------------------------------------------------------------------
-- 2. The day's facts: each request's company and route, and the requests received that day for another day
-- ---------------------------------------------------------------------------------------------------------------------
select is(pg_temp.facts(0)->'inspections'->0->>'company', 'Sample IRD Framing', 'facts: a request carries its company');
select is(pg_temp.facts(0)->'inspections'->0->'ofs_sent', 'false'::jsonb, 'facts: and whether it is with OFS');
select is((select jsonb_agg(e->>'number') from jsonb_array_elements(pg_temp.facts(0)->'received') e), '["1"]'::jsonb,
  'facts: today''s received lists the request for tomorrow, not today''s own (that one is on the day)');
select is(pg_temp.facts(0)->'received'->0->>'request_date', pg_temp.d(1)::text, 'facts: with the day it is for');
select is(jsonb_array_length(pg_temp.facts(1)->'received'), 0, 'facts: tomorrow received nothing yet');
-- Someone not on the job.
select pg_temp.login('a0000000-0000-0000-0000-000000000734');
select is(pg_temp.facts(0)->'received', '[]'::jsonb, 'facts: someone off the job learns nothing');
reset role;

select * from finish();
rollback;
