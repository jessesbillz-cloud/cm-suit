begin;
select plan(62);
-- SPEC §6.4 #4 / §13.2 (migration 0046): the job's request link and the inspector's hub. Tokens are stored only as
-- sha256; rotating kills the old one at once (undo for 15 minutes); the link RPCs are service-role only and answer
-- only what the pages show; a visit records a requester invite (0055) on that job only and never changes an existing member (a
-- revoked or ended one is refused); the hub lists only its owner's active jobs with the link on where they decide.
\ir _helpers.psql

create temp table tok (k text primary key, v text not null, at timestamptz, id uuid);
grant all on tok to public;
-- sha256 of a saved token, as the edge function sends it.
create function pg_temp.h(p_k text) returns text language sql stable as $$
  select encode(extensions.digest(v, 'sha256'), 'hex') from tok where k = p_k $$;
grant execute on function pg_temp.h(text) to public;

select pg_temp.mk_user('a0000000-0000-0000-0000-000000000401', 'probe+rl-insp@example.test', 'RL Inspector');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000402', 'probe+rl-gc@example.test', 'RL GC Admin');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000403', 'probe+rl-sub@example.test', 'RL Sub');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000404', 'probe+rl-pm@example.test', 'RL PM');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000405', 'probe+rl-revoked@example.test', 'RL Revoked');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000406', 'probe+rl-visitor@example.test', '');

insert into public.orgs (id, name, kind, created_by) values
  ('b0000000-0000-0000-0000-000000000401', 'Sample Inspection Co', 'inspector', 'a0000000-0000-0000-0000-000000000401'),
  ('b0000000-0000-0000-0000-000000000402', 'Sample GC', 'gc', 'a0000000-0000-0000-0000-000000000402');
-- J1: the inspector's own job (creator -> inspector_admin, 0044). J2-J5: a GC's jobs (creator -> project_admin).
-- Under construction, so Inspections is on (0021); J4 is archived.
insert into public.projects (id, org_id, name, stage, created_by) values
  ('c0000000-0000-0000-0000-000000000401', 'b0000000-0000-0000-0000-000000000401', 'Sample Inspector Job', 'construction', 'a0000000-0000-0000-0000-000000000401'),
  ('c0000000-0000-0000-0000-000000000402', 'b0000000-0000-0000-0000-000000000402', 'Sample GC Job', 'construction', 'a0000000-0000-0000-0000-000000000402'),
  ('c0000000-0000-0000-0000-000000000403', 'b0000000-0000-0000-0000-000000000402', 'Sample Quiet Job', 'construction', 'a0000000-0000-0000-0000-000000000402'),
  ('c0000000-0000-0000-0000-000000000404', 'b0000000-0000-0000-0000-000000000402', 'Sample Old Job', 'archived', 'a0000000-0000-0000-0000-000000000402'),
  ('c0000000-0000-0000-0000-000000000405', 'b0000000-0000-0000-0000-000000000402', 'Sample Other Job', 'construction', 'a0000000-0000-0000-0000-000000000402');
-- Links on J4 (archived) and J5 (the inspector isn't on it); J3's stays off.
update public.projects set modules = '{inspections}', request_token_hash = repeat('4', 64) where id = 'c0000000-0000-0000-0000-000000000404';
update public.projects set request_token_hash = repeat('5', 64) where id = 'c0000000-0000-0000-0000-000000000405';

insert into public.project_members (org_id, project_id, user_id, invite_email, role, status, access_ends_at)
select o, p, u, e, r, s, x
  from (values
    ('b0000000-0000-0000-0000-000000000401'::uuid, 'c0000000-0000-0000-0000-000000000401'::uuid, 'a0000000-0000-0000-0000-000000000403'::uuid, 'probe+rl-sub@example.test', 'sub', 'active', null::timestamptz),
    ('b0000000-0000-0000-0000-000000000401', 'c0000000-0000-0000-0000-000000000401', 'a0000000-0000-0000-0000-000000000404', 'probe+rl-pm@example.test', 'pm', 'active', null),
    ('b0000000-0000-0000-0000-000000000401', 'c0000000-0000-0000-0000-000000000401', 'a0000000-0000-0000-0000-000000000405', 'probe+rl-revoked@example.test', 'sub', 'revoked', null),
    ('b0000000-0000-0000-0000-000000000401', 'c0000000-0000-0000-0000-000000000401', null, 'probe+rl-invited@example.test', 'viewer', 'invited', null),
    ('b0000000-0000-0000-0000-000000000401', 'c0000000-0000-0000-0000-000000000401', null, 'probe+rl-ended@example.test', 'sub', 'active', now() - interval '1 day'),
    ('b0000000-0000-0000-0000-000000000402', 'c0000000-0000-0000-0000-000000000402', 'a0000000-0000-0000-0000-000000000401', 'probe+rl-insp@example.test', 'inspector', 'active', null),
    ('b0000000-0000-0000-0000-000000000402', 'c0000000-0000-0000-0000-000000000403', 'a0000000-0000-0000-0000-000000000401', 'probe+rl-insp@example.test', 'inspector', 'active', null),
    ('b0000000-0000-0000-0000-000000000402', 'c0000000-0000-0000-0000-000000000404', 'a0000000-0000-0000-0000-000000000401', 'probe+rl-insp@example.test', 'inspector', 'active', null)
  ) v (o, p, u, e, r, s, x);

-- ---------------------------------------------------------------------------------------------------------------------
-- The job's link: members.manage makes it; only the hash is kept; the link RPCs are not for people
-- ---------------------------------------------------------------------------------------------------------------------
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000403');
select throws_ok($$ select public.rotate_request_link('c0000000-0000-0000-0000-000000000401') $$, '42501', null,
  'link: a sub cannot make it');
select throws_ok($$ select public.request_link_state('c0000000-0000-0000-0000-000000000401') $$, '42501', null,
  'link: a sub cannot see its state');
select pg_temp.login('a0000000-0000-0000-0000-000000000401');
insert into tok select 'one', token, made_at from public.rotate_request_link('c0000000-0000-0000-0000-000000000401');
select ok((select v ~ '^[A-Za-z0-9_-]{43}$' from tok where k = 'one'), 'link: the inspector who runs the job makes it (43 url-safe characters)');
select results_eq($$ select active, since from public.request_link_state('c0000000-0000-0000-0000-000000000401') $$,
  $$ select true, at from tok where k = 'one' $$, 'link: state is on, since the moment it was made');
select pg_temp.login('a0000000-0000-0000-0000-000000000402');
insert into tok select 'gc', token, made_at from public.rotate_request_link('c0000000-0000-0000-0000-000000000402');
select is((select active from public.request_link_state('c0000000-0000-0000-0000-000000000402')), true,
  'link: a GC project admin makes it on their job');
select throws_ok($$ select public.link_request_open('c0000000-0000-0000-0000-000000000401', 'x', null) $$, '42501', null,
  'link RPCs: open is not callable by people');
select throws_ok($$ select public.link_request_join('c0000000-0000-0000-0000-000000000401', 'x', null, 'a@example.test', 'A', 'B') $$,
  '42501', null, 'link RPCs: join is not callable by people');
select throws_ok($$ select public.link_request_hub('00000000-0000-0000-0000-000000000000', 'x') $$, '42501', null,
  'link RPCs: hub is not callable by people');
reset role;
select is((select request_token_hash from public.projects where id = 'c0000000-0000-0000-0000-000000000401'), pg_temp.h('one'),
  'link: only the sha256 is stored');
select ok(not exists (select 1 from public.audit_events where details::text like '%' || (select v from tok where k = 'one') || '%')
          and not exists (select 1 from public.request_link_log where new_hash = (select v from tok where k = 'one')),
  'link: the raw token is kept nowhere');

set local role service_role;
select pg_temp.login_service();
select results_eq($$ select k from jsonb_object_keys(public.link_request_open('c0000000-0000-0000-0000-000000000401', pg_temp.h('one'))) k $$,
  $$ values ('project_name'::text) $$, 'open: the job name only');
select is(public.link_request_open('c0000000-0000-0000-0000-000000000401', pg_temp.h('one'))->>'project_name', 'Sample Inspector Job',
  'open: the link opens its job');
select is(public.link_request_open('c0000000-0000-0000-0000-000000000401', repeat('0', 64)), null, 'open: a wrong token opens nothing');
select is(public.link_request_open('c0000000-0000-0000-0000-000000000402', pg_temp.h('one')), null, 'open: a job''s token opens only that job');
select is(public.link_request_open('c0000000-0000-0000-0000-000000000404', repeat('4', 64)), null, 'open: an archived job takes no requests');

-- ---------------------------------------------------------------------------------------------------------------------
-- Rotation kills the old link at once; Undo (the same person, 15 minutes) brings it back
-- ---------------------------------------------------------------------------------------------------------------------
reset role;
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000401');
insert into tok select 'two', token, made_at from public.rotate_request_link('c0000000-0000-0000-0000-000000000401');
reset role;
set local role service_role;
select pg_temp.login_service();
select ok(public.link_request_open('c0000000-0000-0000-0000-000000000401', pg_temp.h('one')) is null
          and public.link_request_open('c0000000-0000-0000-0000-000000000401', pg_temp.h('two')) is not null,
  'rotate: the old link dies at once, the new one works');
reset role;
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000401');
select is((select since from public.request_link_state('c0000000-0000-0000-0000-000000000401')), (select at from tok where k = 'two'),
  'rotate: state follows the new link');
select pg_temp.login('a0000000-0000-0000-0000-000000000402');
select throws_ok($$ select public.undo_request_link_rotation('c0000000-0000-0000-0000-000000000401') $$, '42501', null,
  'undo: not for someone without members.manage on the job');
select pg_temp.login('a0000000-0000-0000-0000-000000000401');
select lives_ok($$ select public.undo_request_link_rotation('c0000000-0000-0000-0000-000000000401') $$, 'undo: the person who rotated');
select is((select since from public.request_link_state('c0000000-0000-0000-0000-000000000401')), (select at from tok where k = 'one'),
  'undo: state follows the link that works again');
reset role;
select is((select request_token_hash from public.projects where id = 'c0000000-0000-0000-0000-000000000401'), pg_temp.h('one'),
  'undo: the old link is back');

-- ---------------------------------------------------------------------------------------------------------------------
-- Joining: a requester invite (0055) for the proved address, on that job only; an existing member is never changed
-- ---------------------------------------------------------------------------------------------------------------------
set local role service_role;
select pg_temp.login_service();
create temp table joined as
  select public.link_request_join('c0000000-0000-0000-0000-000000000401', pg_temp.h('one'), null,
    ' Probe+RL-Visitor@Example.test ', '  Sample   Visitor ', 'Sample Framing') as r;
grant select on joined to public;
select results_eq($$ select k from joined, jsonb_object_keys(r) k order by 1 $$, $$ values ('project_name'::text), ('status') $$,
  'join: the job name and a status only');
select is((select r->>'status' from joined), 'added', 'join: a new address is added');
reset role;
select results_eq(
  $$ select project_id, role, status, user_id is null, member_org_id is null from public.project_members
      where invite_email = 'probe+rl-visitor@example.test' $$,
  $$ values ('c0000000-0000-0000-0000-000000000401'::uuid, 'requester'::text, 'invited'::text, true, true) $$,
  'join: one invite, role requester, on that job only, waiting for its own sign-in');
select ok(exists (select 1 from public.activity where project_id = 'c0000000-0000-0000-0000-000000000401' and kind = 'member.joined'
                  and audience_capability = 'members.manage' and summary = 'Sample Visitor (Sample Framing) joined from the request link'),
  'join: a board line for whoever manages people');
select ok(exists (select 1 from public.audit_events where action = 'request_link.join' and actor_kind = 'public_link'
                  and project_id = 'c0000000-0000-0000-0000-000000000401' and details->>'via' = 'link'),
  'join: audited as the public link');

set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000406');
select is(public.accept_invites(), 1, 'join: accept_invites binds it at sign-in');
select ok(public.has_capability('c0000000-0000-0000-0000-000000000401', 'ir.request'), 'join: the visitor can request inspections');
select ok(not public.is_member('c0000000-0000-0000-0000-000000000402'), 'join: and is on no other job');

reset role;
set local role service_role;
select pg_temp.login_service();
select is(public.link_request_join('c0000000-0000-0000-0000-000000000401', pg_temp.h('one'), null, 'probe+rl-visitor@example.test',
            'Sample Visitor', 'Sample Framing')->>'status', 'member', 'join: a second visit changes nothing');
select is(public.link_request_join('c0000000-0000-0000-0000-000000000401', pg_temp.h('one'), null, 'probe+rl-pm@example.test',
            'Sample PM', 'Sample Framing')->>'status', 'member', 'join: an existing member goes straight in');
select is(public.link_request_join('c0000000-0000-0000-0000-000000000401', pg_temp.h('one'), null, 'probe+rl-invited@example.test',
            'Sample Invitee', 'Sample Owner Co')->>'status', 'member', 'join: a pending invite stands');
select throws_ok($$ select public.link_request_join('c0000000-0000-0000-0000-000000000401', pg_temp.h('one'), null,
                     'probe+rl-revoked@example.test', 'Sample Revoked', 'Sample Framing') $$, '42501', null,
  'join: a revoked member cannot come back through the link');
select throws_ok($$ select public.link_request_join('c0000000-0000-0000-0000-000000000401', pg_temp.h('one'), null,
                     'probe+rl-ended@example.test', 'Sample Ended', 'Sample Framing') $$, '42501', null,
  'join: nor can one whose access ended');
select throws_ok($$ select public.link_request_join('c0000000-0000-0000-0000-000000000401', pg_temp.h('one'), null,
                     'not-an-email', 'Sample Person', 'Sample Framing') $$, '22023', null, 'join: a malformed address is refused');
select throws_ok($$ select public.link_request_join('c0000000-0000-0000-0000-000000000401', pg_temp.h('one'), null,
                     'probe+rl-noname@example.test', '   ', 'Sample Framing') $$, '22023', null, 'join: a name is required');
select is(public.link_request_join('c0000000-0000-0000-0000-000000000401', repeat('0', 64), null, 'probe+rl-stranger@example.test',
            'Sample Stranger', 'Sample Framing'), null, 'join: a wrong token records nothing');
reset role;
select results_eq(
  $$ select invite_email, role, status from public.project_members
      where project_id = 'c0000000-0000-0000-0000-000000000401'
        and invite_email in ('probe+rl-visitor@example.test', 'probe+rl-pm@example.test', 'probe+rl-invited@example.test',
                             'probe+rl-revoked@example.test', 'probe+rl-ended@example.test')
      order by 1 $$,
  $$ values ('probe+rl-ended@example.test'::text, 'sub'::text, 'active'::text), ('probe+rl-invited@example.test', 'viewer', 'invited'),
            ('probe+rl-pm@example.test', 'pm', 'active'), ('probe+rl-revoked@example.test', 'sub', 'revoked'),
            ('probe+rl-visitor@example.test', 'requester', 'active') $$,
  'join: every existing row is exactly as it was (no downgrade, no second row, a revoke sticks)');
select ok(not exists (select 1 from public.project_members
                       where invite_email in ('probe+rl-stranger@example.test', 'probe+rl-noname@example.test')),
  'join: refused visits leave no rows');

-- ---------------------------------------------------------------------------------------------------------------------
-- The hub: people who decide inspections; it lists only its owner's active jobs with the link on
-- ---------------------------------------------------------------------------------------------------------------------
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000403');
select throws_ok($$ select public.rotate_request_hub() $$, '42501', null, 'hub: a sub (no ir.decide anywhere) cannot have one');
select is((select decides from public.request_hub_state()), false, 'hub state: a sub does not decide');
select pg_temp.login('a0000000-0000-0000-0000-000000000401');
insert into tok select 'hub1', token, made_at, hub_id from public.rotate_request_hub();
select ok((select v ~ '^[A-Za-z0-9_-]{43}$' from tok where k = 'hub1'), 'hub: the inspector makes one (43 url-safe characters)');
select results_eq($$ select decides, hub_id, made_at, jobs from public.request_hub_state() $$,
  $$ select true, id, at, 2 from tok where k = 'hub1' $$, 'hub state: decides, the hub, when it was made, two jobs listed');
reset role;
select is((select token_hash from public.request_hubs where user_id = 'a0000000-0000-0000-0000-000000000401'), pg_temp.h('hub1'),
  'hub: only the sha256 is stored');

set local role service_role;
select pg_temp.login_service();
create temp table hub as select public.link_request_hub((select id from tok where k = 'hub1'), pg_temp.h('hub1')) as b;
grant select on hub to public;
select results_eq($$ select e->>'name' from hub, jsonb_array_elements(b->'jobs') e $$,
  $$ values ('Sample GC Job'::text), ('Sample Inspector Job') $$,
  'hub: the owner''s active jobs with the link on where they decide (not the quiet, archived or other job)');
select results_eq($$ select distinct k from hub, jsonb_array_elements(b->'jobs') e, jsonb_object_keys(e) k order by 1 $$,
  $$ values ('name'::text), ('project_id') $$, 'hub: job names and ids only');
select results_eq($$ select k from hub, jsonb_object_keys(b) k $$, $$ values ('jobs'::text) $$, 'hub: nothing about its owner');
select is(public.link_request_hub((select id from tok where k = 'hub1'), repeat('0', 64)), null, 'hub: a wrong token opens nothing');
select is(public.link_request_hub('00000000-0000-0000-0000-000000000000', pg_temp.h('hub1')), null,
  'hub: the token works only with its own hub');
select is(public.link_request_open('c0000000-0000-0000-0000-000000000402', pg_temp.h('hub1'), (select id from tok where k = 'hub1'))->>'project_name',
  'Sample GC Job', 'hub: opens a listed job''s request page');
select ok(public.link_request_open('c0000000-0000-0000-0000-000000000405', pg_temp.h('hub1'), (select id from tok where k = 'hub1')) is null
          and public.link_request_open('c0000000-0000-0000-0000-000000000403', pg_temp.h('hub1'), (select id from tok where k = 'hub1')) is null
          and public.link_request_open('c0000000-0000-0000-0000-000000000404', pg_temp.h('hub1'), (select id from tok where k = 'hub1')) is null,
  'hub: never a job the owner is not on, whose link is off, or that is archived');
select is(public.link_request_open('c0000000-0000-0000-0000-000000000401', pg_temp.h('hub1')), null, 'hub: its token is not a job token');
select is(public.link_request_join('c0000000-0000-0000-0000-000000000402', pg_temp.h('hub1'), (select id from tok where k = 'hub1'),
            'probe+rl-hubvisitor@example.test', 'Sample Hub Visitor', 'Sample Electric')->>'status', 'added', 'hub: a visitor joins a listed job');
reset role;
select results_eq(
  $$ select project_id, role, invited_by from public.project_members where invite_email = 'probe+rl-hubvisitor@example.test' $$,
  $$ values ('c0000000-0000-0000-0000-000000000402'::uuid, 'requester'::text, 'a0000000-0000-0000-0000-000000000401'::uuid) $$,
  'hub: the invite is a requester on that job, invited by the hub''s owner');

set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000401');
insert into tok select 'hub2', token, made_at, hub_id from public.rotate_request_hub();
select is((select id from tok where k = 'hub2'), (select id from tok where k = 'hub1'), 'hub: New link keeps the hub, changes the token');
reset role;
set local role service_role;
select pg_temp.login_service();
select ok(public.link_request_hub((select id from tok where k = 'hub2'), pg_temp.h('hub1')) is null
          and public.link_request_hub((select id from tok where k = 'hub2'), pg_temp.h('hub2')) is not null,
  'hub: the old token dies at once');
reset role;
update public.project_members set status = 'revoked', revoked_at = now()
 where project_id = 'c0000000-0000-0000-0000-000000000402' and user_id = 'a0000000-0000-0000-0000-000000000401';
set local role service_role;
select pg_temp.login_service();
select results_eq($$ select e->>'name' from jsonb_array_elements(public.link_request_hub((select id from tok where k = 'hub2'), pg_temp.h('hub2'))->'jobs') e $$,
  $$ values ('Sample Inspector Job'::text) $$, 'hub: a job its owner left drops off at once');
select is(public.link_request_open('c0000000-0000-0000-0000-000000000402', pg_temp.h('hub2'), (select id from tok where k = 'hub2')), null,
  'hub: and that job''s request page closes to the hub');

-- ---------------------------------------------------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------------------------------------------------
reset role;
select ok(not has_function_privilege('authenticated', 'public.link_request_open(uuid, text, uuid)', 'execute')
          and not has_function_privilege('authenticated', 'public.link_request_join(uuid, text, uuid, text, text, text)', 'execute')
          and not has_function_privilege('authenticated', 'public.link_request_hub(uuid, text)', 'execute')
          and has_function_privilege('service_role', 'public.link_request_open(uuid, text, uuid)', 'execute'),
  'grants: the link RPCs are service-role only');
select ok(not has_function_privilege('authenticated', 'public.request_link_job(uuid, text, uuid)', 'execute')
          and not has_function_privilege('authenticated', 'public.request_hub_list(uuid)', 'execute')
          and not has_function_privilege('authenticated', 'public.request_hub_owner(uuid, text)', 'execute')
          and not has_function_privilege('authenticated', 'public.request_hub_decides(uuid)', 'execute')
          and not has_function_privilege('authenticated', 'public.request_link_on(uuid)', 'execute')
          and not has_function_privilege('authenticated', 'public.request_link_token()', 'execute'),
  'grants: the helpers are internal');
select ok(not has_table_privilege('authenticated', 'public.request_hubs', 'select,insert,update,delete')
          and not has_table_privilege('authenticated', 'public.request_link_log', 'select,insert,update,delete')
          and not has_table_privilege('anon', 'public.request_hubs', 'select')
          and not has_table_privilege('anon', 'public.request_link_log', 'select'),
  'grants: the hub and the link log are closed to people (the functions read them)');
select is_empty(
  $$ select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and (p.proname like 'request\_%' or p.proname like 'link\_request\_%' or p.proname in ('rotate_request_link', 'undo_request_link_rotation', 'rotate_request_hub'))
        and has_function_privilege('anon', p.oid, 'execute') $$,
  'grants: nothing here is callable by anon');

select * from finish();
rollback;
