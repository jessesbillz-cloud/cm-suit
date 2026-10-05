begin;
select plan(29);
-- Migration 0075 (Oct 4 audit, inspections): joining from the request link claims the joiner's earlier link requests
-- on that job (by the verified address, nobody else's, no other job's), in the same call as the membership; the
-- visitor's tracker carries the postponement, the attendance call and whether the IR is made, never the note to the GC;
-- the IR by the receipt (service role only, a download line); the hub link's "New link" can be undone; MDR's words and
-- colors on the calendar line.
\ir _helpers.psql

create temp table res (k text primary key, j jsonb);
grant all on res to public;
create function pg_temp.h(p text) returns text language sql immutable as $$ select encode(extensions.digest(p, 'sha256'), 'hex') $$;
create function pg_temp.d(p_days int) returns date language sql stable as $$
  select (now() at time zone 'America/Los_Angeles')::date + p_days $$;
create function pg_temp.j(p_k text) returns jsonb language sql stable as $$ select j from res where k = p_k $$;
-- A request by its number on a job, whoever is logged in.
create function pg_temp.rid(p_job uuid, p_n int) returns uuid language sql stable security definer as $$
  select id from public.inspection_requests where project_id = p_job and number = p_n $$;
create function pg_temp.by(p_job uuid, p_n int) returns uuid language sql stable security definer as $$
  select requested_by from public.inspection_requests where project_id = p_job and number = p_n $$;
create function pg_temp.ver(p_id uuid) returns int language sql stable security definer as $$
  select version from public.inspection_requests where id = p_id $$;
-- A link request on a job: the visitor's name and email; Sample Framing; tomorrow.
create function pg_temp.send(p_job uuid, p_token text, p_name text, p_email text, p_time time)
returns jsonb language sql as $$
  select public.link_request_submit(p_project_id => p_job, p_token_hash => pg_temp.h(p_token), p_hub_id => null,
    p_name => p_name, p_company => 'Sample Framing', p_phone => '', p_email => p_email, p_request_date => pg_temp.d(1),
    p_kind => 'ior', p_items => 'Wall framing ' || p_name, p_notice_ack => true, p_start_time => p_time,
    p_duration_kind => 'timed', p_duration_min => 60) $$;
grant execute on function pg_temp.h(text), pg_temp.d(int), pg_temp.j(text), pg_temp.rid(uuid, int), pg_temp.by(uuid, int),
  pg_temp.ver(uuid), pg_temp.send(uuid, text, text, text, time) to public;

select pg_temp.mk_user('a0000000-0000-0000-0000-000000000621', 'probe+if-insp@example.test', 'IF Inspector');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000622', 'probe+if-visitor@example.test', '');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000623', 'probe+if-member@example.test', 'IF Member');

insert into public.orgs (id, name, kind, created_by) values
  ('b0000000-0000-0000-0000-000000000621', 'Sample Inspection Co', 'inspector', 'a0000000-0000-0000-0000-000000000621');
-- J takes requests through its link; K is another job with its own link.
insert into public.projects (id, org_id, name, stage, timezone, created_by) values
  ('c0000000-0000-0000-0000-000000000621', 'b0000000-0000-0000-0000-000000000621', 'Sample Fix Job', 'construction',
   'America/Los_Angeles', 'a0000000-0000-0000-0000-000000000621'),
  ('c0000000-0000-0000-0000-000000000622', 'b0000000-0000-0000-0000-000000000621', 'Sample Fix Other Job', 'construction',
   'America/Los_Angeles', 'a0000000-0000-0000-0000-000000000621');
update public.projects set request_token_hash = pg_temp.h('j-token') where id = 'c0000000-0000-0000-0000-000000000621';
update public.projects set request_token_hash = pg_temp.h('k-token') where id = 'c0000000-0000-0000-0000-000000000622';
insert into public.project_members (org_id, project_id, user_id, invite_email, role, status) values
  ('b0000000-0000-0000-0000-000000000621', 'c0000000-0000-0000-0000-000000000621', 'a0000000-0000-0000-0000-000000000623',
   'probe+if-member@example.test', 'sub', 'active');

-- ---------------------------------------------------------------------------------------------------------------------
-- Before: link requests on J from the visitor (twice, one in capitals), from someone else, and one on K
-- ---------------------------------------------------------------------------------------------------------------------
set local role service_role;
select pg_temp.login_service();
insert into res values ('v1', pg_temp.send('c0000000-0000-0000-0000-000000000621', 'j-token', 'Sample Visitor', 'probe+if-visitor@example.test', '08:00'));
insert into res values ('v2', pg_temp.send('c0000000-0000-0000-0000-000000000621', 'j-token', 'Sample Visitor', 'Probe+IF-Visitor@Example.test', '10:00'));
insert into res values ('o1', pg_temp.send('c0000000-0000-0000-0000-000000000621', 'j-token', 'Sample Other', 'probe+if-other@example.test', '11:00'));
insert into res values ('k1', pg_temp.send('c0000000-0000-0000-0000-000000000622', 'k-token', 'Sample Visitor', 'probe+if-visitor@example.test', '08:00'));
reset role;
select is((select count(*)::int from public.inspection_requests
            where project_id in ('c0000000-0000-0000-0000-000000000621', 'c0000000-0000-0000-0000-000000000622')
              and requested_by is null), 4, 'before: four link requests, nobody behind them');

set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000622');
select is((select count(*)::int from public.inspection_requests), 0, 'before: the visitor (no member yet) reads none of them');

-- ---------------------------------------------------------------------------------------------------------------------
-- Join: the membership and the visitor's own requests on that job, in one call
-- ---------------------------------------------------------------------------------------------------------------------
reset role;
set local role service_role;
select pg_temp.login_service();
select is(public.link_request_join('c0000000-0000-0000-0000-000000000621', pg_temp.h('j-token'), null,
            'probe+if-visitor@example.test', 'Sample Visitor', 'Sample Framing')->>'status', 'added', 'join: added');
reset role;
select results_eq(
  $$ select number, requested_by from public.inspection_requests where project_id = 'c0000000-0000-0000-0000-000000000621' order by number $$,
  $$ values (1, 'a0000000-0000-0000-0000-000000000622'::uuid), (2, 'a0000000-0000-0000-0000-000000000622'::uuid), (3, null::uuid) $$,
  'join: both of the visitor''s requests are theirs (any letter case); the other visitor''s stays nobody''s');
select is(pg_temp.by('c0000000-0000-0000-0000-000000000622', 1), null::uuid, 'join: never a request on another job');
select results_eq(
  $$ select requester_name, requester_email from public.inspection_requests where id = pg_temp.rid('c0000000-0000-0000-0000-000000000621', 1) $$,
  $$ values ('Sample Visitor'::text, 'probe+if-visitor@example.test'::text) $$, 'join: how it came in (the contact) stays on the row');
select ok(exists (select 1 from public.ir_events where request_id = pg_temp.rid('c0000000-0000-0000-0000-000000000621', 1)
                  and action = 'link_join' and actor_id = 'a0000000-0000-0000-0000-000000000622'),
  'join: the request''s history says the requester joined');
select ok(exists (select 1 from public.audit_events where action = 'request_link.claim' and actor_kind = 'public_link'
                  and project_id = 'c0000000-0000-0000-0000-000000000621' and details->>'requests' = '2'),
  'join: the claim is audited');
select is((select role from public.project_members where invite_email = 'probe+if-visitor@example.test'), 'requester',
  'join: a requester, as before');

set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000622');
select is(public.accept_invites(), 1, 'after: accept_invites binds the membership at sign-in');
select results_eq($$ select number from public.inspection_requests order by number $$, $$ values (1), (2) $$,
  'after: the joiner reads exactly their own two requests');
select lives_ok($$ select public.ir_withdraw(pg_temp.rid('c0000000-0000-0000-0000-000000000621', 2),
                                             pg_temp.ver(pg_temp.rid('c0000000-0000-0000-0000-000000000621', 2))) $$,
  'after: and may withdraw one, like any requester');
select throws_ok($$ select public.ir_withdraw(pg_temp.rid('c0000000-0000-0000-0000-000000000621', 3), 1) $$, 'P0002', null,
  'after: never the other visitor''s');

-- A request sent signed out after joining: claimed on the next join call (the address is already on the job).
reset role;
set local role service_role;
select pg_temp.login_service();
insert into res values ('v3', pg_temp.send('c0000000-0000-0000-0000-000000000621', 'j-token', 'Sample Visitor', 'probe+if-visitor@example.test', '13:00'));
select is(public.link_request_join('c0000000-0000-0000-0000-000000000621', pg_temp.h('j-token'), null,
            'probe+if-visitor@example.test', 'Sample Visitor', 'Sample Framing')->>'status', 'member', 'join again: already a member');
reset role;
select is(pg_temp.by('c0000000-0000-0000-0000-000000000621', 4), 'a0000000-0000-0000-0000-000000000622'::uuid,
  'join again: the later request is theirs too');
-- A member already on the job whose address matches nothing claims nothing; a row still needs a contact or a member.
select throws_ok($$ update public.inspection_requests set requester_phone = null, requester_email = null
                     where id = pg_temp.rid('c0000000-0000-0000-0000-000000000621', 3) $$, '23514', null,
  'row: a link request with nobody behind it keeps a way to reach them');
select lives_ok($$ update public.inspection_requests set requester_phone = null, requester_email = null
                    where id = pg_temp.rid('c0000000-0000-0000-0000-000000000621', 1) $$,
  'row: one with a member behind it may lose the typed contact');

-- ---------------------------------------------------------------------------------------------------------------------
-- The visitor's tracker: the postponement, the attendance call, whether the IR is made; never the note to the GC
-- ---------------------------------------------------------------------------------------------------------------------
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000621');
select lives_ok($$ select public.ir_confirm(pg_temp.rid('c0000000-0000-0000-0000-000000000621', 3), 1, 'Gate code 4321') $$,
  'inspector: confirms with a note for the GC');
select lives_ok($$ select public.ir_set_attendance(pg_temp.rid('c0000000-0000-0000-0000-000000000621', 3),
                    pg_temp.ver(pg_temp.rid('c0000000-0000-0000-0000-000000000621', 3)), 'be_present') $$, 'inspector: be present');
reset role;
select is((select title from public.calendar_entries where source_id = pg_temp.rid('c0000000-0000-0000-0000-000000000621', 3)),
  'IR 3 IOR · Sample Framing · Be present with the IOR', 'calendar: MDR''s words for who must be there');
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000621');
select lives_ok($$ select public.ir_postpone(pg_temp.rid('c0000000-0000-0000-0000-000000000621', 3),
                    pg_temp.ver(pg_temp.rid('c0000000-0000-0000-0000-000000000621', 3)), 'weather', 'Rain all day', pg_temp.d(3)) $$,
  'inspector: postpones for weather');
reset role;
set local role service_role;
select pg_temp.login_service();
insert into res values ('st', public.link_request_status('c0000000-0000-0000-0000-000000000621', pg_temp.h(pg_temp.j('o1')->>'receipt')));
select results_eq(
  $$ select pg_temp.j('st')->>'status', pg_temp.j('st')->>'postpone_reason', pg_temp.j('st')->>'postpone_note',
            pg_temp.j('st')->>'postpone_until', pg_temp.j('st')->>'attendance', pg_temp.j('st')->>'has_ir' $$,
  $$ values ('postponed'::text, 'weather'::text, 'Rain all day'::text, pg_temp.d(3)::text, 'be_present'::text, 'false'::text) $$,
  'status: the postponement, the expected day and the attendance call');
select ok(pg_temp.j('st')::text not like '%4321%' and pg_temp.j('st')::text not like '%Sample Other%'
          and pg_temp.j('st')::text not like '%IF Inspector%', 'status: never the note to the GC or a name');
select is(public.link_request_ir_file('c0000000-0000-0000-0000-000000000621', pg_temp.h('not-a-receipt')), null,
  'IR by receipt: a wrong receipt opens nothing');
select throws_ok($$ select public.link_request_ir_file('c0000000-0000-0000-0000-000000000621', pg_temp.h(pg_temp.j('o1')->>'receipt')) $$,
  '22023', 'There is no IR yet.', 'IR by receipt: none before it is made');
reset role;
select ok(not has_function_privilege('authenticated', 'public.link_request_ir_file(uuid, text, text)', 'execute')
          and not has_function_privilege('anon', 'public.link_request_ir_file(uuid, text, text)', 'execute')
          and has_function_privilege('service_role', 'public.link_request_ir_file(uuid, text, text)', 'execute'),
  'IR by receipt: the request-link function only');

-- ---------------------------------------------------------------------------------------------------------------------
-- The hub link: New link, then Undo puts the old one back (its owner, once)
-- ---------------------------------------------------------------------------------------------------------------------
insert into public.project_members (org_id, project_id, user_id, invite_email, role, status)
select 'b0000000-0000-0000-0000-000000000621', 'c0000000-0000-0000-0000-000000000622', 'a0000000-0000-0000-0000-000000000621',
       'probe+if-insp@example.test', 'inspector', 'active'
 where not exists (select 1 from public.project_members where project_id = 'c0000000-0000-0000-0000-000000000622'
                     and user_id = 'a0000000-0000-0000-0000-000000000621');
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000621');
select throws_ok($$ select public.undo_request_hub_rotation() $$, 'P0002', 'Nothing to undo.', 'hub undo: nothing to undo at first');
insert into res select 'hub1', to_jsonb(x) from public.rotate_request_hub() x;
insert into res select 'hub2', to_jsonb(x) from public.rotate_request_hub() x;
select lives_ok($$ select public.undo_request_hub_rotation() $$, 'hub undo: the owner puts the previous link back');
reset role;
select is((select token_hash from public.request_hubs where user_id = 'a0000000-0000-0000-0000-000000000621'),
  pg_temp.h(pg_temp.j('hub1')->>'token'), 'hub undo: the first link works again, the second does not');

select * from finish();
rollback;
