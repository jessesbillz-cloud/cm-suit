begin;
select plan(32);
-- SPEC §5.3 numbering and §5.4 append-only audit log.
\ir _helpers.psql

select pg_temp.mk_user('a0000000-0000-0000-0000-000000000001', 'probe+project_admin@example.test', 'Admin');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000003', 'probe+pm@example.test', 'PM');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000005', 'probe+superintendent@example.test', 'Super');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000006', 'probe+foreman@example.test', 'Foreman');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000018', 'probe+outsider@example.test', 'Outsider');

insert into public.orgs (id, name, kind, created_by) values
  ('b0000000-0000-0000-0000-00000000000a', 'Org A', 'gc', 'a0000000-0000-0000-0000-000000000001');
insert into public.projects (id, org_id, name, created_by) values
  ('c0000000-0000-0000-0000-00000000000a', 'b0000000-0000-0000-0000-00000000000a', 'Project A', 'a0000000-0000-0000-0000-000000000001'),
  ('c0000000-0000-0000-0000-00000000000b', 'b0000000-0000-0000-0000-00000000000a', 'Project B', 'a0000000-0000-0000-0000-000000000001');
insert into public.project_members (org_id, project_id, user_id, invite_email, role, status, start_numbers, created_by) values
  ('b0000000-0000-0000-0000-00000000000a', 'c0000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-000000000003',
   'probe+pm@example.test', 'pm', 'active', '{}', 'a0000000-0000-0000-0000-000000000001'),
  ('b0000000-0000-0000-0000-00000000000a', 'c0000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-000000000005',
   'probe+superintendent@example.test', 'superintendent', 'active', '{"daily_field": 41}', 'a0000000-0000-0000-0000-000000000001'),
  ('b0000000-0000-0000-0000-00000000000a', 'c0000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-000000000006',
   'probe+foreman@example.test', 'foreman', 'active', '{}', 'a0000000-0000-0000-0000-000000000001');

set local role authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- next_number: sequential, per (project, kind), members only.
-- ---------------------------------------------------------------------------------------------------------------
select pg_temp.login('a0000000-0000-0000-0000-000000000001');
select is(public.next_number('c0000000-0000-0000-0000-00000000000a', 'rfi'), 1, 'next_number: first rfi in A is 1');
select is(public.next_number('c0000000-0000-0000-0000-00000000000a', 'rfi'), 2, 'next_number: second rfi in A is 2');
select is(public.next_number('c0000000-0000-0000-0000-00000000000a', 'submittal'), 1, 'next_number: counters are per kind');
select is(public.next_number('c0000000-0000-0000-0000-00000000000b', 'rfi'), 1, 'next_number: counters are per project');

select pg_temp.login('a0000000-0000-0000-0000-000000000003');
select throws_ok($$ select public.next_number('c0000000-0000-0000-0000-00000000000b', 'rfi') $$,
  '42501', 'not a member', 'next_number: refused for a non-member of the project');

-- Transmittals take their number from next_number and carry unique(project_id, number).
select pg_temp.login('a0000000-0000-0000-0000-000000000001');
select is((public.create_transmittal('c0000000-0000-0000-0000-00000000000a', array['x@example.test'], '{}', '{}', 'S1', 'M1')).number, 1,
  'create_transmittal: first transmittal is #1');
select is((public.create_transmittal('c0000000-0000-0000-0000-00000000000a', array['x@example.test'], '{}', '{}', 'S2', 'M2')).number, 2,
  'create_transmittal: second transmittal is #2');
reset role;
select throws_ok(
  $$ insert into public.transmittals (org_id, project_id, number, from_user, created_by)
     values ('b0000000-0000-0000-0000-00000000000a', 'c0000000-0000-0000-0000-00000000000a', 1,
             'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001') $$,
  '23505', null, 'transmittals: unique (project_id, number) rejects a duplicate number');

-- ---------------------------------------------------------------------------------------------------------------
-- audit_events is append-only for everyone, including the table owner.
-- ---------------------------------------------------------------------------------------------------------------
set local role authenticated;
select throws_ok($$ update public.audit_events set action = 'tampered' where id = (select max(id) from public.audit_events) $$,
  '42501', null, 'audit_events: authenticated cannot update');
select throws_ok($$ delete from public.audit_events where id = (select max(id) from public.audit_events) $$,
  '42501', null, 'audit_events: authenticated cannot delete');
select throws_ok($$ truncate public.audit_events $$, '42501', null, 'audit_events: authenticated cannot truncate');
reset role;
select throws_ok($$ update public.audit_events set action = 'tampered' where id = (select max(id) from public.audit_events) $$,
  '42501', 'audit_events is append-only', 'audit_events: the trigger blocks update even for postgres');
select throws_ok($$ delete from public.audit_events where id = (select max(id) from public.audit_events) $$,
  '42501', 'audit_events is append-only', 'audit_events: the trigger blocks delete even for postgres');
select ok(not has_table_privilege('service_role', 'public.audit_events', 'UPDATE,DELETE,TRUNCATE'),
  'audit_events: service_role holds no update/delete/truncate');
select ok(not has_table_privilege('authenticated', 'public.audit_events', 'INSERT,UPDATE,DELETE,TRUNCATE'),
  'audit_events: authenticated cannot write directly');
select ok(not has_function_privilege('authenticated', 'public.audit(text, text, uuid, uuid, uuid, jsonb, text, text)', 'EXECUTE'),
  'audit(): not executable by authenticated');
set local role authenticated;
select throws_ok($$ select public.audit('forged', 'x', null, 'c0000000-0000-0000-0000-00000000000a') $$,
  '42501', null, 'audit(): calling it as a user is refused');

-- log_view writes a 'view' row for members only.
select pg_temp.login('a0000000-0000-0000-0000-000000000003');
select lives_ok($$ select public.log_view('bid', '99999999-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-00000000000a') $$,
  'log_view: a member can log a view');
reset role;
select isnt_empty(
  $$ select id from public.audit_events
     where action = 'view' and entity_type = 'bid' and entity_id = '99999999-0000-0000-0000-000000000001'
       and actor_user_id = 'a0000000-0000-0000-0000-000000000003' and project_id = 'c0000000-0000-0000-0000-00000000000a' $$,
  'log_view: the view row names the actor, entity and project');
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000018');
select throws_ok($$ select public.log_view('bid', '99999999-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-00000000000a') $$,
  '42501', 'not a member', 'log_view: refused for a non-member');

-- Membership changes are permission changes and are always audited.
select pg_temp.login('a0000000-0000-0000-0000-000000000001');
select lives_ok(
  $$ insert into public.project_members (id, org_id, project_id, invite_email, role, created_by)
     values ('99999999-0000-0000-0000-0000000000aa', 'b0000000-0000-0000-0000-00000000000a', 'c0000000-0000-0000-0000-00000000000a',
             'probe+invitee@example.test', 'viewer', 'a0000000-0000-0000-0000-000000000001') $$,
  'members.manage: admin invites a member');
update public.project_members set status = 'revoked' where id = '99999999-0000-0000-0000-0000000000aa';
reset role;
select isnt_empty(
  $$ select id from public.audit_events where action = 'member.invite' and entity_id = '99999999-0000-0000-0000-0000000000aa'
       and actor_user_id = 'a0000000-0000-0000-0000-000000000001' $$,
  'audit: member.invite row written with the inviting user as actor');
select isnt_empty(
  $$ select id from public.audit_events where action = 'member.revoke' and entity_id = '99999999-0000-0000-0000-0000000000aa' $$,
  'audit: member.revoke row written');

-- ---------------------------------------------------------------------------------------------------------------
-- Per-author numbers (daily reports): peek never consumes, next consumes, start_numbers continues a sequence.
-- ---------------------------------------------------------------------------------------------------------------
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000005');
select is(public.peek_author_number('c0000000-0000-0000-0000-00000000000a', 'daily_field'), 41, 'peek_author_number: honors start_numbers (41)');
select is(public.peek_author_number('c0000000-0000-0000-0000-00000000000a', 'daily_field'), 41,
  'peek_author_number: a draft (or a deleted draft) does not burn a number');
select is(public.next_author_number('c0000000-0000-0000-0000-00000000000a', 'daily_field'), 41, 'next_author_number: first submit gets 41');
select is(public.next_author_number('c0000000-0000-0000-0000-00000000000a', 'daily_field'), 42, 'next_author_number: next submit gets 42');
select is(public.peek_author_number('c0000000-0000-0000-0000-00000000000a', 'daily_field'), 43, 'peek_author_number: now shows 43');
select is(public.next_author_number('c0000000-0000-0000-0000-00000000000a', 'daily_inspector'), 1, 'next_author_number: per report type');
select pg_temp.login('a0000000-0000-0000-0000-000000000006');
select is(public.peek_author_number('c0000000-0000-0000-0000-00000000000a', 'daily_field'), 1, 'peek_author_number: another author starts at 1');
select is(public.next_author_number('c0000000-0000-0000-0000-00000000000a', 'daily_field'), 1, 'next_author_number: per author');
select pg_temp.login('a0000000-0000-0000-0000-000000000018');
select throws_ok($$ select public.next_author_number('c0000000-0000-0000-0000-00000000000a', 'daily_field') $$,
  '42501', 'not a member', 'next_author_number: refused for a non-member');

select * from finish();
rollback;
