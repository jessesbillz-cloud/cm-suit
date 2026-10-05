begin;
select plan(35);
-- Migration 0070, dailies for any company and trade: a role's default form is data (roles.daily_form; my_daily_form runs
-- as the caller and answers only my own role on the job); carryover brings back a form's carried table rows with their
-- numbers cleared and nothing else of the tables (a report without tables carries exactly as before); the superintendent's
-- daily is a daily like any other (its own setup, numbering kind and the "my due" reminder at submit-by in the job's
-- zone, on All my jobs); daily_day_facts runs as the caller and answers that day's sign-ins by company and trade (a person
-- once; removed lines, other days and other jobs left out), closed meetings, deliveries and inspection requests, each
-- only as far as the caller may read them.
\ir _helpers.psql

-- Users: the super, the foreman, the inspector, an outsider, the admin who made the jobs.
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000561', 'probe+gcd-super@example.test', 'Sample GC Super');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000562', 'probe+gcd-foreman@example.test', 'Sample GC Foreman');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000563', 'probe+gcd-insp@example.test', 'Sample GC Inspector');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000564', 'probe+gcd-out@example.test', 'Sample GC Outsider');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000565', 'probe+gcd-admin@example.test', 'Sample GC Admin');

insert into public.orgs (id, name, kind, created_by)
values ('b0000000-0000-0000-0000-000000000561', 'Sample GC Builders', 'gc', 'a0000000-0000-0000-0000-000000000565');
-- J: the job. K: another job of the same company (its facts never show on J).
insert into public.projects (id, org_id, name, number, timezone, stage, created_by) values
  ('c0000000-0000-0000-0000-000000000561', 'b0000000-0000-0000-0000-000000000561', 'Sample GC Job J', 'S-561',
   'America/Los_Angeles', 'construction', 'a0000000-0000-0000-0000-000000000565'),
  ('c0000000-0000-0000-0000-000000000562', 'b0000000-0000-0000-0000-000000000561', 'Sample GC Job K', 'S-562',
   'America/Los_Angeles', 'construction', 'a0000000-0000-0000-0000-000000000565');
insert into public.project_members (org_id, project_id, user_id, invite_email, role, status)
select 'b0000000-0000-0000-0000-000000000561', 'c0000000-0000-0000-0000-000000000561', u::uuid, e, r, 'active'
  from (values ('a0000000-0000-0000-0000-000000000561', 'probe+gcd-super@example.test', 'superintendent'),
               ('a0000000-0000-0000-0000-000000000562', 'probe+gcd-foreman@example.test', 'foreman'),
               ('a0000000-0000-0000-0000-000000000563', 'probe+gcd-insp@example.test', 'inspector')) v(u, e, r);

create temp table t (k text primary key, v uuid);
grant all on t to public;
create function pg_temp.v(p_k text) returns uuid language sql stable as $$ select v from t where k = p_k $$;
-- The facts of job J on Sep 29 as the logged-in caller.
create function pg_temp.facts() returns jsonb language sql stable as $$
  select public.daily_day_facts('c0000000-0000-0000-0000-000000000561', '2026-09-29') $$;
create function pg_temp.crew(p_company text) returns int language sql stable as $$
  select (e->>'count')::int from jsonb_array_elements(pg_temp.facts()->'signins') e where lower(e->>'company') = p_company $$;
grant execute on all functions in schema pg_temp to public;

-- ---------------------------------------------------------------------------------------------------------------------
-- 1. The role's default form, as data
-- ---------------------------------------------------------------------------------------------------------------------
select has_column('public', 'roles', 'daily_form', 'roles carry a default daily form');
select is((select daily_form from public.roles where name = 'superintendent'), 'gc_daily', 'the super writes the GC daily');
select is((select daily_form from public.roles where name = 'foreman'), 'foreman_daily', 'the foreman writes the foreman daily');
select is((select daily_form from public.roles where name = 'inspector'), null, 'the inspector keeps the company form');
select ok(not (select prosecdef from pg_proc where oid = 'public.my_daily_form(uuid)'::regprocedure),
  'my_daily_form runs as the caller');
select ok(not has_function_privilege('anon', 'public.my_daily_form(uuid)', 'EXECUTE'), 'anon cannot call my_daily_form');

set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000561');
select is(public.my_daily_form('c0000000-0000-0000-0000-000000000561'), 'gc_daily', 'my_daily_form: the super');
select is(public.my_daily_form('c0000000-0000-0000-0000-000000000562'), null, 'my_daily_form: not on that job');
select pg_temp.login('a0000000-0000-0000-0000-000000000562');
select is(public.my_daily_form('c0000000-0000-0000-0000-000000000561'), 'foreman_daily', 'my_daily_form: the foreman');
select pg_temp.login('a0000000-0000-0000-0000-000000000563');
select is(public.my_daily_form('c0000000-0000-0000-0000-000000000561'), null, 'my_daily_form: the inspector has none');
select pg_temp.login('a0000000-0000-0000-0000-000000000564');
select is(public.my_daily_form('c0000000-0000-0000-0000-000000000561'), null, 'my_daily_form: an outsider has none');
reset role;

-- ---------------------------------------------------------------------------------------------------------------------
-- 2. Carryover of a form's tables
-- ---------------------------------------------------------------------------------------------------------------------
select ok(not (public.daily_carryover('{"work": [], "notes": {"general": "x"}, "carry_sections": ["general"]}') ? 'tables'),
  'carryover: a report without tables carries as before (no tables key)');
select is(public.daily_carryover(
  '{"tables": {"manpower": [{"key": "m1", "ref": "crew:sample framing|framer", "carry": true,
                             "cells": {"company": "Sample Framing", "trade": "Framer", "count": "4", "hours": "32"}},
                            {"key": "m2", "ref": null, "carry": false, "cells": {"company": "Once Only", "count": "1"}}],
               "deliveries": [{"key": "d1", "ref": "delivery:x", "carry": false, "cells": {"company": "Sample Concrete Co"}}]},
    "fields": {"notes": "today only"}, "pulled": ["delivery:x", "crew:sample framing|framer"]}'::jsonb) -> 'tables',
  '{"manpower": [{"key": "m1", "ref": "crew:sample framing|framer", "carry": true,
                  "cells": {"company": "Sample Framing", "trade": "Framer"}}]}'::jsonb,
  'carryover: carried rows come back with count and hours cleared; other rows and tables stay behind');
select ok(not (public.daily_carryover('{"tables": {"crew": [{"key": "c1", "carry": true, "cells": {}}]}, "pulled": ["x"], "fields": {"a": "b"}}')
               ?| array['pulled', 'fields']),
  'carryover: what was filled in (pulled) and the day''s fields never carry');

-- ---------------------------------------------------------------------------------------------------------------------
-- 3. The superintendent's daily is a daily like any other
-- ---------------------------------------------------------------------------------------------------------------------
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000561');
select is((public.choose_daily_form('c0000000-0000-0000-0000-000000000561', 'gc_daily',
            '{"label": "Daily Report", "submit_by": "17:00", "schedule_days": [1, 2, 3, 4, 5],
              "filename_pattern": "Daily Report {#} {Project} {MM-DD-YYYY}"}')).report_type,
  'gc_daily', 'gc daily: chosen in Setup like any form');
insert into t select 'r28', public.create_daily_report('c0000000-0000-0000-0000-000000000561', 'gc_daily', '2026-09-28');
select lives_ok($$ select public.save_daily_content(pg_temp.v('r28'), 1,
  '{"fields": {"conditions": "Clear", "high": "78"},
    "tables": {"manpower": [{"key": "m1", "ref": "crew:sample framing|framer", "carry": true,
                             "cells": {"company": "Sample Framing", "trade": "Framer", "count": "4", "hours": "32"}}],
               "visitors": [{"key": "v1", "cells": {"name": "Sample Owner Rep"}}]},
    "pulled": ["crew:sample framing|framer"]}') $$, 'gc daily: the day''s fields and tables save');
insert into t select 'r29', public.create_daily_report('c0000000-0000-0000-0000-000000000561', 'gc_daily', '2026-09-29');
select is((select content->'tables' from public.daily_reports where id = pg_temp.v('r29')),
  '{"manpower": [{"key": "m1", "ref": "crew:sample framing|framer", "carry": true,
                  "cells": {"company": "Sample Framing", "trade": "Framer"}}]}'::jsonb,
  'gc daily: the next day starts with yesterday''s manpower, counts and hours cleared');
select ok(not ((select content from public.daily_reports where id = pg_temp.v('r29')) ?| array['pulled', 'fields']),
  'gc daily: the next day starts with nothing filled in yet');
select is((select number from public.daily_reports where id = pg_temp.v('r29')), null, 'gc daily: a draft has no number yet');
select is(public.peek_author_number('c0000000-0000-0000-0000-000000000561', 'dailies:gc_daily'), 1,
  'gc daily: its own numbering, from 1');
select is((select report_type from public.my_daily_today() where project_id = 'c0000000-0000-0000-0000-000000000561'),
  'gc_daily', 'gc daily: on All my jobs as today''s form');
reset role;
select results_eq(
  $$ select kind, user_id, starts_at from public.calendar_entries where source_type = 'daily_report' and source_id = pg_temp.v('r29') $$,
  $$ values ('my_due'::text, 'a0000000-0000-0000-0000-000000000561'::uuid,
             timestamptz '2026-09-29 17:00:00 America/Los_Angeles') $$,
  'gc daily: the reminder is the "my due" line at submit-by, in the job''s time zone');

-- ---------------------------------------------------------------------------------------------------------------------
-- 4. What the job knows that day (Sep 29 on J)
-- ---------------------------------------------------------------------------------------------------------------------
-- Meetings: M1 a closed tailgate that day; M2 an open meeting that day; M3 the day before; M4 on job K that day.
insert into public.safety_meetings (id, created_by, org_id, project_id, number, kind, held_on, title, leader_id, status, closed_at, closed_by)
select m::uuid, 'a0000000-0000-0000-0000-000000000561', 'b0000000-0000-0000-0000-000000000561', p::uuid, n, k, d::date, ttl,
       'a0000000-0000-0000-0000-000000000561', st, case when st = 'closed' then now() end,
       case when st = 'closed' then 'a0000000-0000-0000-0000-000000000561'::uuid end
  from (values ('f0000000-0000-0000-0000-000000000561', 'c0000000-0000-0000-0000-000000000561', 1, 'tailgate', '2026-09-29', 'Heat illness prevention', 'closed'),
               ('f0000000-0000-0000-0000-000000000562', 'c0000000-0000-0000-0000-000000000561', 2, 'meeting', '2026-09-29', 'Foremen meeting', 'open'),
               ('f0000000-0000-0000-0000-000000000563', 'c0000000-0000-0000-0000-000000000561', 3, 'tailgate', '2026-09-28', 'Ladders', 'closed'),
               ('f0000000-0000-0000-0000-000000000564', 'c0000000-0000-0000-0000-000000000562', 1, 'tailgate', '2026-09-29', 'Ladders', 'closed'))
       v(m, p, n, k, d, ttl, st);
insert into public.safety_signins (org_id, project_id, meeting_id, name, company, trade, via, removed_at, removed_by)
select 'b0000000-0000-0000-0000-000000000561', p::uuid, m::uuid, nm, co, tr, 'link',
       case when gone then now() end, case when gone then 'a0000000-0000-0000-0000-000000000561'::uuid end
  from (values
    ('c0000000-0000-0000-0000-000000000561', 'f0000000-0000-0000-0000-000000000561', 'Ann Sample', 'Sample Framing', 'Framer', false),
    ('c0000000-0000-0000-0000-000000000561', 'f0000000-0000-0000-0000-000000000561', 'Bob Sample', ' Sample Framing ', 'Framer', false),
    ('c0000000-0000-0000-0000-000000000561', 'f0000000-0000-0000-0000-000000000561', 'Cy Sample', 'SAMPLE FRAMING', 'framer', false),
    ('c0000000-0000-0000-0000-000000000561', 'f0000000-0000-0000-0000-000000000561', 'Di Sample', 'Sample Electric', 'Electrician', false),
    ('c0000000-0000-0000-0000-000000000561', 'f0000000-0000-0000-0000-000000000561', 'Ed Sample', 'Sample Electric', 'Electrician', true),
    -- Ann again at the second meeting (counted once), and a plumber who came only to that one.
    ('c0000000-0000-0000-0000-000000000561', 'f0000000-0000-0000-0000-000000000562', 'ann sample', 'Sample Framing', 'Framer', false),
    ('c0000000-0000-0000-0000-000000000561', 'f0000000-0000-0000-0000-000000000562', 'Flo Sample', 'Sample Plumbing', 'Plumber', false),
    ('c0000000-0000-0000-0000-000000000561', 'f0000000-0000-0000-0000-000000000563', 'Gus Sample', 'Sample Framing', 'Framer', false),
    ('c0000000-0000-0000-0000-000000000562', 'f0000000-0000-0000-0000-000000000564', 'Hal Sample', 'Sample Framing', 'Framer', false))
  v(p, m, nm, co, tr, gone);

-- Deliveries: two that day (07:00 and TBD), one deleted that day, one the day before, one on K.
insert into public.delivery_companies (id, org_id, project_id, name) values
  ('e1000000-0000-0000-0000-000000000561', 'b0000000-0000-0000-0000-000000000561', 'c0000000-0000-0000-0000-000000000561', 'Sample Concrete Co'),
  ('e1000000-0000-0000-0000-000000000562', 'b0000000-0000-0000-0000-000000000561', 'c0000000-0000-0000-0000-000000000561', 'Sample Lumber'),
  ('e1000000-0000-0000-0000-000000000563', 'b0000000-0000-0000-0000-000000000561', 'c0000000-0000-0000-0000-000000000562', 'Sample Lumber');
insert into public.deliveries (org_id, project_id, number, company_id, delivery_date, starts_at, description, posted_name,
                               created_by, deleted_at, deleted_name)
select 'b0000000-0000-0000-0000-000000000561', p::uuid, n, c::uuid, d::date, s::timestamptz, ds, 'Sample GC Super',
       'a0000000-0000-0000-0000-000000000561', del::timestamptz, case when del is not null then 'Sample GC Super' end
  from (values ('c0000000-0000-0000-0000-000000000561', 1, 'e1000000-0000-0000-0000-000000000562', '2026-09-29', null, 'Blocking', null),
               ('c0000000-0000-0000-0000-000000000561', 2, 'e1000000-0000-0000-0000-000000000561', '2026-09-29',
                '2026-09-29 07:00 America/Los_Angeles', 'Slab pour', null),
               ('c0000000-0000-0000-0000-000000000561', 3, 'e1000000-0000-0000-0000-000000000561', '2026-09-29', null, 'Cancelled pour',
                '2026-09-29 06:00 America/Los_Angeles'),
               ('c0000000-0000-0000-0000-000000000561', 4, 'e1000000-0000-0000-0000-000000000562', '2026-09-28', null, 'Studs', null),
               ('c0000000-0000-0000-0000-000000000562', 1, 'e1000000-0000-0000-0000-000000000563', '2026-09-29', null, 'Studs', null))
       v(p, n, c, d, s, ds, del);

-- Inspection requests: an IOR at 8:00 and a concrete special with no time that day; a withdrawn one; one the day after.
insert into public.inspection_requests (org_id, project_id, number, requested_by, company, request_date, start_time,
                                        duration_kind, duration_min, kind, special_kind_id, items, notice_ack_at, status)
select 'b0000000-0000-0000-0000-000000000561', 'c0000000-0000-0000-0000-000000000561', n, 'a0000000-0000-0000-0000-000000000561',
       'Sample Framing', d::date, tm::time, case when tm is null then 'all_day' else 'timed' end,
       case when tm is not null then 60 end, k,
       case when k = 'special' then (select id from public.ir_special_kinds where name = 'Concrete') end, it, now(), st
  from (values (1, '2026-09-29', '08:00', 'ior', 'Shear walls, level 2', 'confirmed'),
               (2, '2026-09-29', null, 'special', 'Footings', 'pending'),
               (3, '2026-09-29', '09:00', 'ior', 'Withdrawn one', 'withdrawn'),
               (4, '2026-09-30', '08:00', 'ior', 'Next day', 'pending')) v(n, d, tm, k, it, st);

select ok(not (select prosecdef from pg_proc where oid = 'public.daily_day_facts(uuid, date)'::regprocedure),
  'facts: runs as the caller (each table''s own read rules answer)');
select ok(not has_function_privilege('anon', 'public.daily_day_facts(uuid, date)', 'EXECUTE'), 'facts: anon cannot call it');

set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000561');
select is(jsonb_array_length(pg_temp.facts()->'signins'), 3, 'facts: sign-ins by company and trade (framing, electric, plumbing)');
select is(pg_temp.crew('sample framing'), 3, 'facts: spelled three ways, one company; a person at two meetings counts once');
select is(pg_temp.crew('sample electric'), 1, 'facts: a removed line is not counted');
select is((select sum((e->>'count')::int)::int from jsonb_array_elements(pg_temp.facts()->'signins') e), 5,
  'facts: other days and other jobs stay out');
select is(pg_temp.facts()->'meetings',
  '[{"id": "f0000000-0000-0000-0000-000000000561", "kind": "tailgate", "number": 1, "title": "Heat illness prevention", "signed": 4}]'::jsonb,
  'facts: that day''s closed meetings only, with how many signed in');
select is(jsonb_array_length(pg_temp.facts()->'deliveries'), 2, 'facts: that day''s deliveries (not deleted, not other days or jobs)');
select is(pg_temp.facts()->'deliveries'->0->>'company', 'Sample Concrete Co', 'facts: deliveries by time, TBD last');
select is(pg_temp.facts()->'deliveries'->1->>'starts_at', null, 'facts: a delivery with no time says so');
select is((select jsonb_agg(jsonb_build_object('kind', e->>'kind', 'special', e->>'special', 'start_time', e->>'start_time',
                                                'status', e->>'status'))
             from jsonb_array_elements(pg_temp.facts()->'inspections') e),
  '[{"kind": "ior", "special": null, "start_time": "08:00", "status": "confirmed"},
    {"kind": "special", "special": "Concrete", "start_time": null, "status": "pending"}]'::jsonb,
  'facts: that day''s inspection requests (not withdrawn), by time, with type and status');
-- The foreman reads safety and deliveries but not everyone's inspection requests.
select pg_temp.login('a0000000-0000-0000-0000-000000000562');
select is(array[jsonb_array_length(pg_temp.facts()->'signins'), jsonb_array_length(pg_temp.facts()->'deliveries'),
                jsonb_array_length(pg_temp.facts()->'inspections')], array[3, 2, 0],
  'facts: the foreman sees only what the foreman may read (no one else''s inspection requests)');
select pg_temp.login('a0000000-0000-0000-0000-000000000564');
select is(pg_temp.facts(), '{"signins": [], "meetings": [], "deliveries": [], "inspections": []}'::jsonb,
  'facts: an outsider learns nothing');
reset role;

select * from finish();
rollback;
