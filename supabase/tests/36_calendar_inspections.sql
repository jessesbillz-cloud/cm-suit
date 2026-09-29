begin;
select plan(19);
-- Migration 0042: the calendar's inspections. calendar_inspections() is ir_calendar() plus attachments, postponement
-- count and requester for the rows I may read in full, and no rows (not an error) where I may not see inspections;
-- "waiting on the GC" is its own status key on the calendar.
\ir _helpers.psql

create temp table ids (k text primary key, v uuid);
grant all on ids to public;
create function pg_temp.rid(p_k text) returns uuid language sql stable as $$ select v from ids where k = p_k $$;
create function pg_temp.d(p_days int) returns date language sql stable as $$
  select (now() at time zone 'America/Los_Angeles')::date + p_days $$;
create function pg_temp.ver(p_k text) returns int language sql stable security definer as $$
  select r.version from public.inspection_requests r where r.id = (select v from ids where k = p_k) $$;
create function pg_temp.submit(p uuid, co text, d date, t time, items text)
returns public.inspection_requests language sql as $$
  select public.ir_submit(p_project_id => p, p_company => co, p_request_date => d, p_kind => 'ior', p_items => items,
    p_notice_ack => true, p_start_time => t, p_duration_kind => 'timed', p_duration_min => 60) $$;
grant execute on function pg_temp.rid(text), pg_temp.d(int), pg_temp.ver(text), pg_temp.submit(uuid, text, date, time, text)
  to public;

-- A GC job with its admin, two subs, an inspector and an architect; a second job for someone who isn't on the first.
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000431', 'probe+cal-admin@example.test', 'Cal Admin');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000432', 'probe+cal-sub@example.test', 'Cal Sub');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000433', 'probe+cal-sub2@example.test', 'Cal Sub Two');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000434', 'probe+cal-insp@example.test', 'Cal Inspector');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000435', 'probe+cal-arch@example.test', 'Cal Architect');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000436', 'probe+cal-other@example.test', 'Cal Outsider');

insert into public.orgs (id, name, kind, created_by) values
  ('b0000000-0000-0000-0000-000000000431', 'Sample Builders', 'gc', 'a0000000-0000-0000-0000-000000000431');
insert into public.projects (id, org_id, name, stage, timezone, created_by) values
  ('c0000000-0000-0000-0000-000000000431', 'b0000000-0000-0000-0000-000000000431', 'Cal Job', 'construction',
   'America/Los_Angeles', 'a0000000-0000-0000-0000-000000000431'),
  ('c0000000-0000-0000-0000-000000000432', 'b0000000-0000-0000-0000-000000000431', 'Cal Other Job', 'construction',
   'America/Los_Angeles', 'a0000000-0000-0000-0000-000000000431');
insert into public.project_members (org_id, project_id, user_id, invite_email, role, status)
select 'b0000000-0000-0000-0000-000000000431', p, u, e, r, 'active'
  from (values
    ('c0000000-0000-0000-0000-000000000431'::uuid, 'a0000000-0000-0000-0000-000000000432'::uuid, 'probe+cal-sub@example.test', 'sub'),
    ('c0000000-0000-0000-0000-000000000431', 'a0000000-0000-0000-0000-000000000433', 'probe+cal-sub2@example.test', 'sub'),
    ('c0000000-0000-0000-0000-000000000431', 'a0000000-0000-0000-0000-000000000434', 'probe+cal-insp@example.test', 'inspector'),
    ('c0000000-0000-0000-0000-000000000431', 'a0000000-0000-0000-0000-000000000435', 'probe+cal-arch@example.test', 'architect'),
    ('c0000000-0000-0000-0000-000000000432', 'a0000000-0000-0000-0000-000000000436', 'probe+cal-other@example.test', 'sub')) v(p, u, e, r);

select ok(not (select prosecdef from pg_proc where oid = 'public.calendar_inspections(uuid, date, date)'::regprocedure),
  'calendar_inspections runs as the caller (RLS decides the extra columns)');
select ok(not has_function_privilege('anon', 'public.calendar_inspections(uuid, date, date)', 'EXECUTE'),
  'anon cannot call calendar_inspections');

-- Two requests from two companies; one has a file, the other gets postponed; the inspector blocks an hour.
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000432');
insert into ids select 'A', (pg_temp.submit('c0000000-0000-0000-0000-000000000431', 'Sample Concrete Co', pg_temp.d(1), '09:00', 'Footings')).id;
select pg_temp.login('a0000000-0000-0000-0000-000000000433');
insert into ids select 'B', (pg_temp.submit('c0000000-0000-0000-0000-000000000431', 'Sample Steel Co', pg_temp.d(1), '10:00', 'Embeds')).id;
reset role;
update public.inspection_requests set attachment_ids = '{e0000000-0000-0000-0000-000000000431}' where id = pg_temp.rid('A');
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000434');
select lives_ok($$ select public.ir_postpone(pg_temp.rid('B'), pg_temp.ver('B'), 'weather', null, pg_temp.d(3)) $$,
  'inspector: postpones B');
select lives_ok($$ insert into public.ir_blocks (org_id, project_id, block_date, start_time, end_time, created_by)
  values ('b0000000-0000-0000-0000-000000000431', 'c0000000-0000-0000-0000-000000000431', pg_temp.d(2), '12:00', '13:00',
          auth.uid()) $$, 'inspector: blocks an hour');

-- A requester: their own request in full with its file and their name; someone else's without them.
select pg_temp.login('a0000000-0000-0000-0000-000000000432');
select results_eq($$ select full_detail, company, attachment_ids, postpone_count from public.calendar_inspections(
                      'c0000000-0000-0000-0000-000000000431', pg_temp.d(0), pg_temp.d(7)) where mine $$,
  $$ values (true, 'Sample Concrete Co'::text, '{e0000000-0000-0000-0000-000000000431}'::uuid[], 0) $$,
  'sub: own request in full, with its attachments');
select results_eq($$ select id, full_detail, company, attachment_ids, postpone_count, status_key
                      from public.calendar_inspections('c0000000-0000-0000-0000-000000000431', pg_temp.d(0), pg_temp.d(7))
                     where not mine and not is_block $$,
  $$ values (null::uuid, false, null::text, '{}'::uuid[], 0, 'postponed'::text) $$,
  'sub: someone else''s request shows only its color, no company, files or count');
select results_eq($$ select id, request_date, attachment_ids from public.calendar_inspections('c0000000-0000-0000-0000-000000000431',
                      pg_temp.d(0), pg_temp.d(7)) where is_block $$,
  $$ values (null::uuid, pg_temp.d(2), '{}'::uuid[]) $$, 'sub: blocked time, without its id');
select results_eq($$ select count(*)::int from public.calendar_inspections('c0000000-0000-0000-0000-000000000431', pg_temp.d(0), pg_temp.d(7)) $$,
  $$ select count(*)::int from public.ir_calendar('c0000000-0000-0000-0000-000000000431', pg_temp.d(0), pg_temp.d(7)) $$,
  'sub: the same lines as ir_calendar');

-- The inspector: every request in full, the postponement counted, the block with its id (to remove it).
select pg_temp.login('a0000000-0000-0000-0000-000000000434');
select results_eq($$ select number, company, attachment_ids, postpone_count, status_key from public.calendar_inspections(
                      'c0000000-0000-0000-0000-000000000431', pg_temp.d(0), pg_temp.d(7)) where not is_block order by number $$,
  $$ values (1, 'Sample Concrete Co'::text, '{e0000000-0000-0000-0000-000000000431}'::uuid[], 0, 'pending'::text),
            (2, 'Sample Steel Co', '{}', 1, 'postponed') $$,
  'inspector: every request in full, with its attachments and postponements');
select ok((select id is not null from public.calendar_inspections('c0000000-0000-0000-0000-000000000431', pg_temp.d(0), pg_temp.d(7))
            where is_block), 'inspector: the block carries its id');

-- No inspections for me on a job: no rows, no error.
select pg_temp.login('a0000000-0000-0000-0000-000000000435');
select throws_ok($$ select * from public.ir_calendar('c0000000-0000-0000-0000-000000000431', pg_temp.d(0), pg_temp.d(7)) $$,
  '42501', null, 'architect: ir_calendar refuses');
select is_empty($$ select * from public.calendar_inspections('c0000000-0000-0000-0000-000000000431', pg_temp.d(0), pg_temp.d(7)) $$,
  'architect: calendar_inspections answers with nothing');
select pg_temp.login('a0000000-0000-0000-0000-000000000436');
select is_empty($$ select * from public.calendar_inspections('c0000000-0000-0000-0000-000000000431', pg_temp.d(0), pg_temp.d(7)) $$,
  'not on the job: nothing');

-- Waiting on the GC: its own key, on the requester's calendar and on the calendar line.
reset role;
select is(public.ir_status_key('gc_review', null, null), 'gc_review', 'ir_status_key: waiting on the GC is gc_review');
update public.projects set settings = settings || '{"ir_gc_approval": true}' where id = 'c0000000-0000-0000-0000-000000000431';
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000432');
insert into ids select 'D', (pg_temp.submit('c0000000-0000-0000-0000-000000000431', 'Sample Concrete Co', pg_temp.d(4), '08:00', 'Plumbing')).id;
select results_eq($$ select status, status_key from public.calendar_inspections('c0000000-0000-0000-0000-000000000431',
                      pg_temp.d(4), pg_temp.d(4)) where id = pg_temp.rid('D') $$,
  $$ values ('gc_review'::text, 'gc_review'::text) $$, 'sub: a request waiting on the GC has the gc_review key');
reset role;
select is((select status from public.calendar_entries where source_type = 'inspection_request' and source_id = pg_temp.rid('D')),
  'gc_review', 'mirror: the calendar line of a request waiting on the GC is gc_review');
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000431');
select lives_ok($$ select public.ir_gc_decide(pg_temp.rid('D'), pg_temp.ver('D'), true, null) $$, 'GC: passes it on');
reset role;
select is((select status from public.calendar_entries where source_type = 'inspection_request' and source_id = pg_temp.rid('D')),
  'pending', 'mirror: once the GC passes it on, the line is pending (with the inspector)');
select is_empty($$ select ce.id from public.calendar_entries ce join public.inspection_requests r on r.id = ce.source_id
                    where ce.source_type = 'inspection_request' and r.status = 'gc_review' and ce.status <> 'gc_review' $$,
  'no request waiting on the GC has a line that says otherwise');

select * from finish();
rollback;
