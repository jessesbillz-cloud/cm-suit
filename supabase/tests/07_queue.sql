begin;
select plan(24);
-- SPEC §8.9: enqueue_job is the only way in, is idempotent and capability-checked; worker RPCs are service-role only;
-- after max attempts a job moves to dead_jobs and the project admin gets a task.
\ir _helpers.psql

select pg_temp.mk_user('a0000000-0000-0000-0000-000000000001', 'probe+project_admin@example.test', 'Admin');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000003', 'probe+pm@example.test', 'PM');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000018', 'probe+outsider@example.test', 'Outsider');
insert into public.orgs (id, name, kind, created_by) values
  ('b0000000-0000-0000-0000-00000000000a', 'Org A', 'gc', 'a0000000-0000-0000-0000-000000000001');
insert into public.projects (id, org_id, name, created_by) values
  ('c0000000-0000-0000-0000-00000000000a', 'b0000000-0000-0000-0000-00000000000a', 'Project A', 'a0000000-0000-0000-0000-000000000001');
insert into public.project_members (org_id, project_id, user_id, invite_email, role, status, created_by) values
  ('b0000000-0000-0000-0000-00000000000a', 'c0000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-000000000003',
   'probe+pm@example.test', 'pm', 'active', 'a0000000-0000-0000-0000-000000000001');

-- One read + fail of the render_pdf job, as the worker would do it.
create function pg_temp.read_and_fail()
returns text
language sql
as $$
  select public.worker_fail_job(r.job_id, r.msg_id, 'boom on attempt ' || r.attempts)
  from public.worker_read_jobs(50) r where r.kind = 'render_pdf';
$$;
grant execute on function pg_temp.read_and_fail() to public;
-- Backoff hides a failed message; the test makes it visible again instead of waiting.
create function pg_temp.expire_visibility()
returns void
language sql
as $$
  update pgmq.q_jobs set vt = now() - interval '1 second';
$$;

set local role authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- enqueue_job as a user.
-- ---------------------------------------------------------------------------------------------------------------
select pg_temp.login('a0000000-0000-0000-0000-000000000003');
select is(
  public.enqueue_job('scan_file', '{"file_id": "f1"}', 'c0000000-0000-0000-0000-00000000000a', 'scan:f1'),
  public.enqueue_job('scan_file', '{"file_id": "f1"}', 'c0000000-0000-0000-0000-00000000000a', 'scan:f1'),
  'enqueue_job: the same idempotency key returns the same job id');
-- Without a key the key is derived from kind + project + payload (digest() from pgcrypto).
select is(
  public.enqueue_job('extract_text', '{"file_id": "f1"}', 'c0000000-0000-0000-0000-00000000000a'),
  public.enqueue_job('extract_text', '{"file_id": "f1"}', 'c0000000-0000-0000-0000-00000000000a'),
  'enqueue_job: the same payload without a key returns the same job id');
select isnt(
  public.enqueue_job('scan_file', '{"file_id": "f2"}', 'c0000000-0000-0000-0000-00000000000a', 'scan:f2'),
  public.enqueue_job('scan_file', '{"file_id": "f1"}', 'c0000000-0000-0000-0000-00000000000a', 'scan:f1'),
  'enqueue_job: a different key is a different job');
select throws_ok($$ select public.enqueue_job('r2_copy', '{}', 'c0000000-0000-0000-0000-00000000000a', 'r2:1') $$,
  '42501', 'forbidden', 'enqueue_job: a kind needing project.manage is refused for a plain member');
select throws_ok($$ select public.enqueue_job('nope', '{}', 'c0000000-0000-0000-0000-00000000000a', 'x') $$,
  'P0001', 'unknown job kind nope', 'enqueue_job: unknown kinds are refused');
select pg_temp.login('a0000000-0000-0000-0000-000000000001');
select lives_ok($$ select public.enqueue_job('r2_copy', '{}', 'c0000000-0000-0000-0000-00000000000a', 'r2:1') $$,
  'enqueue_job: project_admin may enqueue a project.manage kind');
select pg_temp.login('a0000000-0000-0000-0000-000000000018');
select throws_ok($$ select public.enqueue_job('scan_file', '{"file_id": "f9"}', 'c0000000-0000-0000-0000-00000000000a', 'scan:f9') $$,
  '42501', 'forbidden', 'enqueue_job: a non-member is refused');

-- ---------------------------------------------------------------------------------------------------------------
-- Worker RPCs are not reachable by signed-in users, even with a forged role GUC.
-- ---------------------------------------------------------------------------------------------------------------
select pg_temp.login('a0000000-0000-0000-0000-000000000001');
select throws_ok($$ select * from public.worker_read_jobs(5) $$, '42501', null, 'worker_read_jobs: forbidden for authenticated');
select throws_ok($$ select public.worker_ack_job(gen_random_uuid(), 1) $$, '42501', null, 'worker_ack_job: forbidden for authenticated');
select throws_ok($$ select public.worker_fail_job(gen_random_uuid(), 1, 'x') $$, '42501', null, 'worker_fail_job: forbidden for authenticated');
select throws_ok($$ select * from public.queue_health() $$, '42501', null, 'queue_health: forbidden for authenticated');
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select throws_ok($$ select * from public.worker_read_jobs(5) $$, '42501', null,
  'worker_read_jobs: still forbidden for the authenticated role with a forged role claim');

-- ---------------------------------------------------------------------------------------------------------------
-- Service role: read -> fail x5 -> dead_jobs + a task for the project admin; read -> ack -> done.
-- ---------------------------------------------------------------------------------------------------------------
select pg_temp.login('a0000000-0000-0000-0000-000000000001');
select public.enqueue_job('render_pdf', '{"doc": "d1"}', 'c0000000-0000-0000-0000-00000000000a', 'render:d1');
select public.enqueue_job('thumbnails', '{"file_id": "f1"}', 'c0000000-0000-0000-0000-00000000000a', 'thumbs:f1');

reset role;
select pg_temp.login_service();
set local role service_role;
select is(pg_temp.read_and_fail(), 'retry', 'worker: attempt 1 fails -> retry');
reset role; select pg_temp.expire_visibility(); set local role service_role;
select is(pg_temp.read_and_fail(), 'retry', 'worker: attempt 2 fails -> retry');
reset role; select pg_temp.expire_visibility(); set local role service_role;
select is(pg_temp.read_and_fail(), 'retry', 'worker: attempt 3 fails -> retry');
reset role; select pg_temp.expire_visibility(); set local role service_role;
select is(pg_temp.read_and_fail(), 'retry', 'worker: attempt 4 fails -> retry');
reset role; select pg_temp.expire_visibility(); set local role service_role;
select is(pg_temp.read_and_fail(), 'dead', 'worker: attempt 5 fails -> dead');
-- The reads above also leased the thumbnails job; make it visible again before the ack path.
reset role; select pg_temp.expire_visibility(); set local role service_role;

select lives_ok(
  $$ select public.worker_ack_job(r.job_id, r.msg_id) from public.worker_read_jobs(50) r where r.kind = 'thumbnails' $$,
  'worker: read + ack of a healthy job');

reset role;
select results_eq(
  $$ select kind, attempts, last_error from public.dead_jobs $$,
  $$ values ('render_pdf'::text, 5, 'boom on attempt 5'::text) $$,
  'dead_jobs: one row with 5 attempts and the last error');
select is((select status from queue.jobs_index where kind = 'render_pdf'), 'dead', 'jobs_index: the failed job is dead');
select is((select status from queue.jobs_index where kind = 'thumbnails'), 'done', 'jobs_index: the acked job is done');
select isnt_empty(
  $$ select id from public.tasks where kind = 'job_failed' and assignee_user_id = 'a0000000-0000-0000-0000-000000000001'
       and project_id = 'c0000000-0000-0000-0000-00000000000a' $$,
  'dead job: the project admin gets a task');
select is_empty(
  $$ select id from public.tasks where kind = 'job_failed' and assignee_user_id = 'a0000000-0000-0000-0000-000000000003' $$,
  'dead job: a member without project.manage gets no task');

-- PostgREST on PG14+ sets only the JSON claims GUC (request.jwt.claims), not request.jwt.claim.role.
-- The worker's real calls look like this; they must be accepted.
select set_config('request.jwt.claim.role', '', true);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;
select lives_ok($$ select * from public.worker_read_jobs(1) $$,
  'service role is recognized from request.jwt.claims alone (as PostgREST sends it)');

select * from finish();
rollback;
