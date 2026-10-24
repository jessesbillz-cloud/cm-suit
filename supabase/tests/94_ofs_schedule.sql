begin;
select plan(45);
-- Migration 0108, OFS scheduling (Jesse, Oct 22): the fire marshal confirms the asked time or picks another time, the
-- requester (or the designated person, or the inspector) accepts a picked time, each answer is recorded with who and
-- when, in the request's history and on the board, and his schedule and calendar feed hold only OFS requests sent to
-- OFS on his jobs.
\ir _helpers.psql

create temp table ids (k text primary key, v uuid);
grant all on ids to public;
create function pg_temp.rid(p_k text) returns uuid language sql stable as $$ select v from ids where k = p_k $$;
create function pg_temp.req(p_k text) returns public.inspection_requests language sql stable security definer as $$
  select * from public.inspection_requests where id = (select v from ids where k = p_k) $$;
create function pg_temp.ver(p_k text) returns int language sql stable security definer as $$
  select version from public.inspection_requests where id = (select v from ids where k = p_k) $$;
create function pg_temp.d(p_n int) returns date language sql stable as $$
  select (now() at time zone 'America/Los_Angeles')::date + p_n $$;
create function pg_temp.ask(p_job uuid, p_kind text, p_items text, p_time time) returns uuid language sql volatile as $$
  select (public.ir_submit(p_job, 'Sample Firestop Co', pg_temp.d(3), p_kind, p_items, true, p_time, 'timed', 60, null, '{}',
                           case when p_kind = 'ofs' then false end)).id $$;
-- The keys of what ofs_schedule answers the caller over the next two weeks, with each one's state.
create function pg_temp.sched() returns text[] language sql stable as $$
  select coalesce(array_agg(i.k || ':' || s.state || case when s.needs_time then ':needs_time' else '' end order by i.k), '{}')
    from public.ofs_schedule(null, pg_temp.d(0), pg_temp.d(14)) s join ids i on i.v = s.id $$;
create function pg_temp.lines_to(p_uid uuid, p_kind text, p_k text) returns int language sql stable security definer as $$
  select count(*)::int from public.activity a join public.activity_recipients ar on ar.activity_id = a.id
   where a.entity_id = pg_temp.rid(p_k) and a.kind = p_kind and ar.user_id = p_uid $$;
create function pg_temp.open_tasks(p_k text) returns uuid[] language sql stable security definer as $$
  select coalesce(array_agg(t.assignee_user_id order by t.assignee_user_id), '{}') from public.tasks t
   where t.entity_id = pg_temp.rid(p_k) and t.kind = 'ir.ofs_time' and t.done_at is null $$;
create function pg_temp.events(p_k text) returns text[] language sql stable security definer as $$
  select coalesce(array_agg(e.action || '@' || coalesce(e.actor_id::text, '') order by e.created_at, e.id), '{}')
    from public.ir_events e where e.request_id = pg_temp.rid(p_k) and e.action in ('confirm', 'ofs_propose', 'ofs_accept', 'move') $$;
create function pg_temp.ofs_lines() returns text[] language sql stable security definer as $$
  select coalesce(array_agg(i.k order by i.k), '{}') from public.calendar_entries ce join ids i on i.v = ce.source_id
   where ce.source_type = 'ofs_request' and ce.deleted_at is null $$;
-- The feed of the person behind a token, as the public endpoint reads it (OFS lines only).
create function pg_temp.feed(p_hash text) returns text[] language plpgsql as $$
declare v text[];
begin
  perform pg_temp.login_service();
  select coalesce(array_agg(i.k order by i.k), '{}') into v
    from public.calendar_feed_lines(p_hash) f join public.calendar_entries ce on ce.id = f.id
    join ids i on i.v = ce.source_id where ce.source_type = 'ofs_request';
  return v;
end $$;
create function pg_temp.summary(p_k text, p_kind text) returns text language sql stable security definer as $$
  select a.summary from public.activity a where a.entity_id = pg_temp.rid(p_k) and a.kind = p_kind order by a.created_at limit 1 $$;
create function pg_temp.state(p_k text) returns text language sql stable security definer as $$
  select public.ir_ofs_sched_state(r.status, r.result, r.ofs_sched) from public.inspection_requests r where r.id = pg_temp.rid(p_k) $$;
grant execute on all functions in schema pg_temp to public;

select pg_temp.mk_user('a0000000-0000-0000-0000-000000000941', 'probe+os-admin@example.test', 'Ada Admin');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000942', 'probe+os-pm@example.test', 'Pia PM');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000943', 'probe+os-ior@example.test', 'Ivo Inspector');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000944', 'probe+os-ahj@example.test', 'Dana Deputy');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000945', 'probe+os-sub@example.test', 'Sam Sub');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000946', 'probe+os-ahj2@example.test', 'Otto Other Marshal');

insert into public.orgs (id, name, kind, created_by) values
  ('b0000000-0000-0000-0000-000000000941', 'Sample Sched Builders', 'gc', 'a0000000-0000-0000-0000-000000000941');
-- Job 1 has the calendar on, job 2 only Inspections (the feed still carries its OFS lines).
insert into public.projects (id, org_id, name, stage, timezone, settings, modules, address, created_by) values
  ('c0000000-0000-0000-0000-000000000941', 'b0000000-0000-0000-0000-000000000941', 'Sample Sched Job', 'construction',
   'America/Los_Angeles', '{"ir_ofs_allowed": true}', '{files,calendar,inspections}', '1 Sample Way',
   'a0000000-0000-0000-0000-000000000941'),
  ('c0000000-0000-0000-0000-000000000942', 'b0000000-0000-0000-0000-000000000941', 'Sample Sched Campus', 'construction',
   'America/Los_Angeles', '{"ir_ofs_allowed": true}', '{files,inspections}', null, 'a0000000-0000-0000-0000-000000000941');
insert into public.project_members (org_id, project_id, user_id, invite_email, member_org_id, role, status)
select 'b0000000-0000-0000-0000-000000000941', j::uuid, u::uuid, e, o::uuid, r, 'active'
  from (values
    ('c0000000-0000-0000-0000-000000000941', 'a0000000-0000-0000-0000-000000000942', 'probe+os-pm@example.test', 'b0000000-0000-0000-0000-000000000941', 'pm'),
    ('c0000000-0000-0000-0000-000000000941', 'a0000000-0000-0000-0000-000000000943', 'probe+os-ior@example.test', null, 'inspector'),
    ('c0000000-0000-0000-0000-000000000941', 'a0000000-0000-0000-0000-000000000944', 'probe+os-ahj@example.test', null, 'ahj'),
    ('c0000000-0000-0000-0000-000000000941', 'a0000000-0000-0000-0000-000000000945', 'probe+os-sub@example.test', null, 'sub'),
    ('c0000000-0000-0000-0000-000000000942', 'a0000000-0000-0000-0000-000000000943', 'probe+os-ior@example.test', null, 'inspector'),
    ('c0000000-0000-0000-0000-000000000942', 'a0000000-0000-0000-0000-000000000944', 'probe+os-ahj@example.test', null, 'ahj'),
    ('c0000000-0000-0000-0000-000000000942', 'a0000000-0000-0000-0000-000000000946', 'probe+os-ahj2@example.test', null, 'ahj'))
    v(j, u, e, o, r);
insert into public.calendar_feed_tokens (user_id, token_hash) values
  ('a0000000-0000-0000-0000-000000000944', encode(sha256('sample-ahj'::bytea), 'hex')), ('a0000000-0000-0000-0000-000000000945', encode(sha256('sample-sub'::bytea), 'hex'));

set local role authenticated;
-- The GC's PM is the job's designated person.
select pg_temp.login('a0000000-0000-0000-0000-000000000942');
select public.duty_set_person('c0000000-0000-0000-0000-000000000941', 'ofs_requests', 'a0000000-0000-0000-0000-000000000942', null);
-- The sub asks: A at 8:00, B Flexible, C stays with the inspector, D is an IOR request.
select pg_temp.login('a0000000-0000-0000-0000-000000000945');
insert into ids values ('A', pg_temp.ask('c0000000-0000-0000-0000-000000000941', 'ofs', 'Sample room 214 walls', '08:00')),
                       ('B', pg_temp.ask('c0000000-0000-0000-0000-000000000941', 'ofs', 'Sample room 215 walls', null)),
                       ('C', pg_temp.ask('c0000000-0000-0000-0000-000000000941', 'ofs', 'Sample room 216 walls', '09:00')),
                       ('D', pg_temp.ask('c0000000-0000-0000-0000-000000000941', 'ior', 'Sample footing', '10:00'));
-- The GC checks Ready, the inspector sends A and B. E is the inspector's own on job 2 (straight to OFS).
select pg_temp.login('a0000000-0000-0000-0000-000000000942');
select public.ir_ofs_check(pg_temp.rid(k), pg_temp.ver(k), 'gc', true) from unnest(array['A', 'B', 'C']) k;
select pg_temp.login('a0000000-0000-0000-0000-000000000943');
select public.ir_send_ofs(pg_temp.rid(k), pg_temp.ver(k)) from unnest(array['A', 'B']) k;
insert into ids select 'E', (public.ir_submit('c0000000-0000-0000-0000-000000000942', 'Sample Sprinkler Co', pg_temp.d(5), 'ofs',
  'Sample hydro test', true, '07:30', 'timed', 60, null, '{}', false, true)).id;

-- ---------------------------------------------------------------------------------------------------------------------
-- The schedule: only OFS requests sent to OFS, on the jobs where he decides them
-- ---------------------------------------------------------------------------------------------------------------------
select pg_temp.login('a0000000-0000-0000-0000-000000000944');
select is(pg_temp.sched(), '{A:asked,B:asked:needs_time,E:asked}'::text[],
  'the fire marshal''s schedule: every job of his, only OFS requests sent to OFS, the Flexible one needs a time');
select is((select array_agg(s.place) from public.ofs_schedule('c0000000-0000-0000-0000-000000000941', pg_temp.d(0), pg_temp.d(14)) s
            where s.id = pg_temp.rid('A')), '{"Sample room 214 walls"}'::text[], 'one job, with the short line of where');
select is((select s.requester from public.ofs_schedule(null, pg_temp.d(0), pg_temp.d(14)) s where s.id = pg_temp.rid('A')),
  'Sam Sub', 'the requester by name');
select throws_ok($$ select * from public.ofs_schedule(null, pg_temp.d(0), pg_temp.d(90)) $$, '22023', 'Pick a shorter range.',
  'a range of at most 62 days');
select pg_temp.login('a0000000-0000-0000-0000-000000000946');
select is(pg_temp.sched(), '{E:asked}'::text[], 'another fire marshal sees only his own job''s');
select pg_temp.login('a0000000-0000-0000-0000-000000000945');
select is(pg_temp.sched(), '{}'::text[], 'a sub has no schedule');
select pg_temp.login('a0000000-0000-0000-0000-000000000943');
select is(pg_temp.sched(), '{}'::text[], 'nor the inspector (he does not decide OFS requests)');

-- ---------------------------------------------------------------------------------------------------------------------
-- Only the fire marshal confirms and picks another time
-- ---------------------------------------------------------------------------------------------------------------------
select pg_temp.login('a0000000-0000-0000-0000-000000000945');
select throws_ok($$ select public.ir_ofs_propose(pg_temp.rid('B'), pg_temp.ver('B'), pg_temp.d(4), '13:00') $$, '42501', null,
  'the requester can''t pick the time');
select throws_ok($$ select public.ir_confirm(pg_temp.rid('A'), pg_temp.ver('A')) $$, '42501', null, 'nor confirm');
select pg_temp.login('a0000000-0000-0000-0000-000000000943');
select throws_ok($$ select public.ir_ofs_propose(pg_temp.rid('B'), pg_temp.ver('B'), pg_temp.d(4), '13:00') $$, '42501', null,
  'nor the inspector, once it is with OFS');
select pg_temp.login('a0000000-0000-0000-0000-000000000944');
select throws_ok($$ select public.ir_ofs_propose(pg_temp.rid('C'), pg_temp.ver('C'), pg_temp.d(4), '13:00') $$, 'P0002', null,
  'the fire marshal never reaches a request not sent to OFS');
select throws_ok($$ select public.ir_ofs_propose(pg_temp.rid('B'), pg_temp.ver('B'), pg_temp.d(-1), '13:00') $$, '22023',
  'Pick today or a later day.', 'not a past day');
select throws_ok($$ select public.ir_ofs_propose(pg_temp.rid('B'), pg_temp.ver('B'), pg_temp.d(4), '13:15') $$, '22023',
  'Pick a time on the hour or half hour.', 'on the hour or half hour');
select throws_ok($$ select public.ir_ofs_propose(pg_temp.rid('A'), pg_temp.ver('A'), pg_temp.d(3), '08:00') $$, '22023',
  'That is the asked time. Confirm it instead.', 'the asked time is confirmed, not proposed');

-- Confirm: recorded, told to the requester, the designated person and the sender.
select public.ir_confirm(pg_temp.rid('A'), pg_temp.ver('A'));
select is(array[(pg_temp.req('A')).status, (pg_temp.req('A')).ofs_sched, ((pg_temp.req('A')).ofs_sched_by = auth.uid())::text,
                ((pg_temp.req('A')).ofs_sched_at is not null)::text],
  '{confirmed,confirmed,true,true}'::text[], 'Confirm records the fire marshal''s answer, who and when');
select is(array[pg_temp.lines_to('a0000000-0000-0000-0000-000000000945', 'ir.ofs_confirmed', 'A'),
                pg_temp.lines_to('a0000000-0000-0000-0000-000000000942', 'ir.ofs_confirmed', 'A'),
                pg_temp.lines_to('a0000000-0000-0000-0000-000000000943', 'ir.ofs_confirmed', 'A'),
                pg_temp.lines_to('a0000000-0000-0000-0000-000000000944', 'ir.ofs_confirmed', 'A')],
  '{0,0,0,0}'::int[], 'no board line for a confirm (0116): his schedule and the calendar show it');
select is(pg_temp.summary('A', 'ir.ofs_confirmed'), null, 'none of any kind');

-- Pick another time on B: it moves, waits on the requester, with a Needs you task.
select public.ir_ofs_propose(pg_temp.rid('B'), pg_temp.ver('B'), pg_temp.d(4), '13:00', 'Sample: mornings are full');
select is(array[(pg_temp.req('B')).status, (pg_temp.req('B')).ofs_sched, (pg_temp.req('B')).request_date::text,
                (pg_temp.req('B')).start_time::text, (pg_temp.req('B')).ofs_sched_note],
  array['pending', 'proposed', pg_temp.d(4)::text, '13:00:00', 'Sample: mornings are full'],
  'Pick another time moves it, waiting on the requester, with his note');
select is(pg_temp.sched(), '{A:confirmed,B:proposed,E:asked}'::text[], 'the schedule shows each state');
select is(pg_temp.open_tasks('B'), '{a0000000-0000-0000-0000-000000000942}'::uuid[],
  'Needs you: one task, the designated person''s (0116)');
select is(pg_temp.lines_to('a0000000-0000-0000-0000-000000000945', 'ir.ofs_proposed', 'B'), 0, 'and no board line (0116)');

-- ---------------------------------------------------------------------------------------------------------------------
-- Accept: the requester (or the designated person, or the inspector), never the fire marshal
-- ---------------------------------------------------------------------------------------------------------------------
select throws_ok($$ select public.ir_ofs_accept(pg_temp.rid('B'), pg_temp.ver('B')) $$, '42501', null,
  'the fire marshal does not accept his own time');
select pg_temp.login('a0000000-0000-0000-0000-000000000945');
select throws_ok($$ select public.ir_ofs_accept(pg_temp.rid('B'), pg_temp.ver('B') - 1) $$, '40001', null, 'with the version check');
select public.ir_ofs_accept(pg_temp.rid('B'), pg_temp.ver('B'));
select is(array[(pg_temp.req('B')).status, (pg_temp.req('B')).ofs_sched, ((pg_temp.req('B')).ofs_sched_by = auth.uid())::text],
  '{confirmed,accepted,true}'::text[], 'Accept confirms it at that time, recorded as the requester''s');
select is(pg_temp.open_tasks('B'), '{}'::uuid[], 'the Needs you tasks are done');
select is(pg_temp.lines_to('a0000000-0000-0000-0000-000000000944', 'ir.ofs_accepted', 'B'), 0, 'no board line: his schedule shows it (0116)');
select throws_ok($$ select public.ir_ofs_accept(pg_temp.rid('B'), pg_temp.ver('B')) $$, '22023', 'There is no new time to accept.',
  'nothing left to accept');

-- The designated person accepts too.
select pg_temp.login('a0000000-0000-0000-0000-000000000944');
select public.ir_ofs_propose(pg_temp.rid('B'), pg_temp.ver('B'), pg_temp.d(5), '10:30');
select pg_temp.login('a0000000-0000-0000-0000-000000000942');
select is((public.ir_ofs_accept(pg_temp.rid('B'), pg_temp.ver('B'))).ofs_sched, 'accepted', 'the designated person accepts');

-- Ask again: the requester's Move clears the proposal and its tasks, back to Asked.
select pg_temp.login('a0000000-0000-0000-0000-000000000944');
select public.ir_ofs_propose(pg_temp.rid('A'), pg_temp.ver('A'), pg_temp.d(6), '14:00');
select is(cardinality(pg_temp.open_tasks('A')), 1, 'a new time on a confirmed one asks again');
select pg_temp.login('a0000000-0000-0000-0000-000000000945');
select public.ir_move(pg_temp.rid('A'), pg_temp.ver('A'), pg_temp.d(7), '08:00', 'timed', 60);
select is(array[(pg_temp.req('A')).status, coalesce((pg_temp.req('A')).ofs_sched, 'none'),
                pg_temp.state('A')],
  '{pending,none,asked}'::text[], 'ask again: the requester''s Move clears the proposal')
;
select is(pg_temp.open_tasks('A'), '{}'::uuid[], 'and its tasks');
select is(pg_temp.lines_to('a0000000-0000-0000-0000-000000000944', 'ir.moved', 'A'), 0, 'the new ask is on his schedule, no line (0116)');

-- The history: every answer with who gave it.
reset role;
select is(pg_temp.events('A'), array['confirm@a0000000-0000-0000-0000-000000000944', 'ofs_propose@a0000000-0000-0000-0000-000000000944',
                                     'move@a0000000-0000-0000-0000-000000000945'],
  'the request''s history: confirm, the new time, the ask again, each with who');
select is(pg_temp.events('B'), array['ofs_propose@a0000000-0000-0000-0000-000000000944', 'ofs_accept@a0000000-0000-0000-0000-000000000945',
                                     'ofs_propose@a0000000-0000-0000-0000-000000000944', 'ofs_accept@a0000000-0000-0000-0000-000000000942'],
  'and B''s, accepted by the requester, then the designated person');
select ok(exists (select 1 from public.audit_events l where l.entity_id = pg_temp.rid('B') and l.action = 'update'
                  and l.actor_user_id = 'a0000000-0000-0000-0000-000000000945'),
  'the audit log has each change with who made it');

-- ---------------------------------------------------------------------------------------------------------------------
-- The calendar: one OFS line per request sent to OFS, for whoever reads OFS requests
-- ---------------------------------------------------------------------------------------------------------------------
select is(pg_temp.ofs_lines(), '{A,B,E}'::text[], 'OFS lines: the requests sent to OFS, nothing still on its way, no IOR');
select is((select array[ce.read_capability, ce.status, ce.location, (ce.title like 'OFS IR #____ Confirmed · Sample Firestop Co · %')::text]
             from public.calendar_entries ce where ce.source_type = 'ofs_request' and ce.source_id = pg_temp.rid('B')),
  '{ir.ofs_view,confirmed,"1 Sample Way",true}'::text[], 'the line: who reads it, its state and color, the job''s address');
select ok((select ce.starts_at = ((pg_temp.d(5) + time '10:30') at time zone 'America/Los_Angeles')
             from public.calendar_entries ce where ce.source_type = 'ofs_request' and ce.source_id = pg_temp.rid('B')),
  'at the time it is now set for');
select is(pg_temp.feed(encode(sha256('sample-ahj'::bytea), 'hex')), '{A,B,E}'::text[],
  'his subscribed feed carries them, job 2''s too with its calendar tool off');
select is(pg_temp.feed(encode(sha256('sample-sub'::bytea), 'hex')), '{}'::text[], 'a sub''s feed has no OFS lines');
reset role;
-- The second fire marshal is gone from job 2: his feed drops it on the next fetch.
insert into public.calendar_feed_tokens (user_id, token_hash) values ('a0000000-0000-0000-0000-000000000946', encode(sha256('sample-ahj2'::bytea), 'hex'));
select is(pg_temp.feed(encode(sha256('sample-ahj2'::bytea), 'hex')), '{E}'::text[], 'the other fire marshal''s feed: his job only');
reset role;
update public.project_members set status = 'revoked' where user_id = 'a0000000-0000-0000-0000-000000000946';
select is(pg_temp.feed(encode(sha256('sample-ahj2'::bytea), 'hex')), '{}'::text[], 'and nothing once he is off the job');
reset role;

-- Withdrawn: the line goes.
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000945');
select public.ir_withdraw(pg_temp.rid('A'), pg_temp.ver('A'));
select is(pg_temp.ofs_lines(), '{B,E}'::text[], 'a withdrawn request leaves the calendar');

-- The designated person's start page: each inspection's schedule state.
select pg_temp.login('a0000000-0000-0000-0000-000000000942');
select is((select r -> 'sched' ->> 'state' from jsonb_array_elements(public.ofs_desk('c0000000-0000-0000-0000-000000000941') -> 'rows') r
            where (r ->> 'id')::uuid = pg_temp.rid('B')), 'confirmed', 'the start page says where its time stands');

-- Grants
reset role;
select ok(not has_function_privilege('anon', 'public.ofs_schedule(uuid, date, date)', 'execute')
          and not has_function_privilege('anon', 'public.ir_ofs_propose(uuid, integer, date, time without time zone, text)', 'execute')
          and not has_function_privilege('anon', 'public.ir_ofs_accept(uuid, integer)', 'execute')
          and not has_function_privilege('authenticated', 'public.ir_ofs_calendar_sync(uuid)', 'execute'),
  'nobody outside reaches them, and the helpers are the database''s own');

select * from finish();
rollback;
