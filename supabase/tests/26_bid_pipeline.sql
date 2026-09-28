begin;
select plan(15);
-- The bids pipeline across jobs (migration 0032): only my jobs, only where I hold bids.manage, only the bid stages,
-- counts that match the coverage board (current bids, live packages), sealed jobs still counts only, no money columns.
\ir _helpers.psql

select pg_temp.mk_user('a0000000-0000-0000-0000-000000000261', 'probe+pipe-admin@example.test', 'Pipe Admin');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000262', 'probe+pipe-bidder@example.test', 'Pipe Bidder');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000263', 'probe+pipe-sub@example.test', 'Pipe Sub');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000264', 'probe+pipe-other@example.test', 'Pipe Other');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000265', 'probe+pipe-pm@example.test', 'Pipe PM');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000266', 'probe+pipe-estimator@example.test', 'Pipe Estimator');

insert into public.orgs (id, name, kind, created_by) values
  ('b0000000-0000-0000-0000-000000000261', 'Pipe Builders', 'gc', 'a0000000-0000-0000-0000-000000000261'),
  ('b0000000-0000-0000-0000-000000000262', 'Other Builders', 'gc', 'a0000000-0000-0000-0000-000000000264');

-- The admin makes every Pipe job (and so is its project_admin); the other company's admin makes theirs.
insert into public.projects (id, org_id, name, stage, bid_due_at, bid_sealed, created_by) values
  ('c0000000-0000-0000-0000-000000000261', 'b0000000-0000-0000-0000-000000000261', 'Pipe Bidding', 'bidding', now() + interval '3 days', false, 'a0000000-0000-0000-0000-000000000261'),
  ('c0000000-0000-0000-0000-000000000262', 'b0000000-0000-0000-0000-000000000261', 'Pipe Prospect', 'prospect', null, false, 'a0000000-0000-0000-0000-000000000261'),
  ('c0000000-0000-0000-0000-000000000263', 'b0000000-0000-0000-0000-000000000261', 'Pipe Awarded', 'awarded', null, false, 'a0000000-0000-0000-0000-000000000261'),
  ('c0000000-0000-0000-0000-000000000264', 'b0000000-0000-0000-0000-000000000261', 'Pipe Building', 'construction', null, false, 'a0000000-0000-0000-0000-000000000261'),
  ('c0000000-0000-0000-0000-000000000265', 'b0000000-0000-0000-0000-000000000261', 'Pipe Sealed', 'bidding', now() + interval '2 days', true, 'a0000000-0000-0000-0000-000000000261'),
  ('c0000000-0000-0000-0000-000000000266', 'b0000000-0000-0000-0000-000000000261', 'Pipe Lost', 'lost', null, false, 'a0000000-0000-0000-0000-000000000261'),
  ('c0000000-0000-0000-0000-000000000267', 'b0000000-0000-0000-0000-000000000262', 'Other Bid', 'bidding', null, false, 'a0000000-0000-0000-0000-000000000264');

insert into public.project_members (id, org_id, project_id, user_id, invite_email, role, status, created_by) values
  ('e1000000-0000-0000-0000-000000000262', 'b0000000-0000-0000-0000-000000000261', 'c0000000-0000-0000-0000-000000000261', 'a0000000-0000-0000-0000-000000000262', 'probe+pipe-bidder@example.test', 'bidder', 'active', 'a0000000-0000-0000-0000-000000000261'),
  ('e1000000-0000-0000-0000-000000000268', 'b0000000-0000-0000-0000-000000000261', 'c0000000-0000-0000-0000-000000000261', null, 'probe+pipe-bidder2@example.test', 'bidder', 'invited', 'a0000000-0000-0000-0000-000000000261'),
  ('e1000000-0000-0000-0000-000000000263', 'b0000000-0000-0000-0000-000000000261', 'c0000000-0000-0000-0000-000000000261', 'a0000000-0000-0000-0000-000000000263', 'probe+pipe-sub@example.test', 'sub', 'active', 'a0000000-0000-0000-0000-000000000261'),
  ('e1000000-0000-0000-0000-000000000265', 'b0000000-0000-0000-0000-000000000261', 'c0000000-0000-0000-0000-000000000261', 'a0000000-0000-0000-0000-000000000265', 'probe+pipe-pm@example.test', 'pm', 'active', 'a0000000-0000-0000-0000-000000000261'),
  ('e1000000-0000-0000-0000-000000000266', 'b0000000-0000-0000-0000-000000000261', 'c0000000-0000-0000-0000-000000000261', 'a0000000-0000-0000-0000-000000000266', 'probe+pipe-estimator@example.test', 'estimator', 'active', 'a0000000-0000-0000-0000-000000000261');

-- Pipe Bidding: two live packages and one deleted. Pipe Sealed: one package.
insert into public.bid_packages (id, org_id, project_id, code, name, deleted_at, created_by) values
  ('d0000000-0000-0000-0000-000000000261', 'b0000000-0000-0000-0000-000000000261', 'c0000000-0000-0000-0000-000000000261', '03A', 'Concrete', null, 'a0000000-0000-0000-0000-000000000261'),
  ('d0000000-0000-0000-0000-000000000262', 'b0000000-0000-0000-0000-000000000261', 'c0000000-0000-0000-0000-000000000261', '09A', 'Drywall', null, 'a0000000-0000-0000-0000-000000000261'),
  ('d0000000-0000-0000-0000-000000000263', 'b0000000-0000-0000-0000-000000000261', 'c0000000-0000-0000-0000-000000000261', '22A', 'Plumbing', now(), 'a0000000-0000-0000-0000-000000000261'),
  ('d0000000-0000-0000-0000-000000000265', 'b0000000-0000-0000-0000-000000000261', 'c0000000-0000-0000-0000-000000000265', '03A', 'Concrete', null, 'a0000000-0000-0000-0000-000000000261');

-- Invites: two on 03A, one on 09A, one on the deleted package (not counted).
insert into public.bid_invites (org_id, project_id, package_id, member_id, status) values
  ('b0000000-0000-0000-0000-000000000261', 'c0000000-0000-0000-0000-000000000261', 'd0000000-0000-0000-0000-000000000261', 'e1000000-0000-0000-0000-000000000262', 'submitted'),
  ('b0000000-0000-0000-0000-000000000261', 'c0000000-0000-0000-0000-000000000261', 'd0000000-0000-0000-0000-000000000261', 'e1000000-0000-0000-0000-000000000268', 'sent'),
  ('b0000000-0000-0000-0000-000000000261', 'c0000000-0000-0000-0000-000000000261', 'd0000000-0000-0000-0000-000000000262', 'e1000000-0000-0000-0000-000000000262', 'intends'),
  ('b0000000-0000-0000-0000-000000000261', 'c0000000-0000-0000-0000-000000000261', 'd0000000-0000-0000-0000-000000000263', 'e1000000-0000-0000-0000-000000000262', 'sent');

insert into public.files (id, org_id, project_id, folder_id, storage_path, original_name, created_by)
select f.id, 'b0000000-0000-0000-0000-000000000261', f.project_id,
       (select id from public.folders where project_id = f.project_id and kind = 'plans' limit 1),
       'probe/pipe/' || f.id::text, 'Sample bid.pdf', 'a0000000-0000-0000-0000-000000000261'
from (values ('f0000000-0000-0000-0000-000000000261'::uuid, 'c0000000-0000-0000-0000-000000000261'::uuid),
             ('f0000000-0000-0000-0000-000000000262'::uuid, 'c0000000-0000-0000-0000-000000000261'::uuid),
             ('f0000000-0000-0000-0000-000000000263'::uuid, 'c0000000-0000-0000-0000-000000000261'::uuid),
             ('f0000000-0000-0000-0000-000000000264'::uuid, 'c0000000-0000-0000-0000-000000000261'::uuid),
             ('f0000000-0000-0000-0000-000000000265'::uuid, 'c0000000-0000-0000-0000-000000000265'::uuid)) as f (id, project_id);

-- 03A: the bidder's second version (the first is superseded) and an office bid = two bids. 09A: none. The deleted
-- package's bid does not count. Pipe Sealed: one office bid.
insert into public.bid_submissions (id, org_id, project_id, package_id, member_id, received_by, file_id, receipt_number, version_no, created_by) values
  ('5a000000-0000-0000-0000-000000000262', 'b0000000-0000-0000-0000-000000000261', 'c0000000-0000-0000-0000-000000000261', 'd0000000-0000-0000-0000-000000000261', 'e1000000-0000-0000-0000-000000000262', null, 'f0000000-0000-0000-0000-000000000262', 2, 2, 'a0000000-0000-0000-0000-000000000262'),
  ('5a000000-0000-0000-0000-000000000263', 'b0000000-0000-0000-0000-000000000261', 'c0000000-0000-0000-0000-000000000261', 'd0000000-0000-0000-0000-000000000261', null, 'a0000000-0000-0000-0000-000000000261', 'f0000000-0000-0000-0000-000000000263', 3, 1, 'a0000000-0000-0000-0000-000000000261'),
  ('5a000000-0000-0000-0000-000000000264', 'b0000000-0000-0000-0000-000000000261', 'c0000000-0000-0000-0000-000000000261', 'd0000000-0000-0000-0000-000000000263', 'e1000000-0000-0000-0000-000000000262', null, 'f0000000-0000-0000-0000-000000000264', 4, 1, 'a0000000-0000-0000-0000-000000000262'),
  ('5a000000-0000-0000-0000-000000000265', 'b0000000-0000-0000-0000-000000000261', 'c0000000-0000-0000-0000-000000000265', 'd0000000-0000-0000-0000-000000000265', null, 'a0000000-0000-0000-0000-000000000261', 'f0000000-0000-0000-0000-000000000265', 1, 1, 'a0000000-0000-0000-0000-000000000261');
insert into public.bid_submissions (id, org_id, project_id, package_id, member_id, file_id, receipt_number, version_no, superseded_by, created_by) values
  ('5a000000-0000-0000-0000-000000000261', 'b0000000-0000-0000-0000-000000000261', 'c0000000-0000-0000-0000-000000000261', 'd0000000-0000-0000-0000-000000000261', 'e1000000-0000-0000-0000-000000000262', 'f0000000-0000-0000-0000-000000000261', 1, 1, '5a000000-0000-0000-0000-000000000262', 'a0000000-0000-0000-0000-000000000262');

-- Questions: two open, one answered, one open but deleted.
insert into public.bid_questions (org_id, project_id, number, question, status, deleted_at) values
  ('b0000000-0000-0000-0000-000000000261', 'c0000000-0000-0000-0000-000000000261', 1, 'Sample question one?', 'open', null),
  ('b0000000-0000-0000-0000-000000000261', 'c0000000-0000-0000-0000-000000000261', 2, 'Sample question two?', 'open', null),
  ('b0000000-0000-0000-0000-000000000261', 'c0000000-0000-0000-0000-000000000261', 3, 'Sample question three?', 'answered', null),
  ('b0000000-0000-0000-0000-000000000261', 'c0000000-0000-0000-0000-000000000261', 4, 'Sample question four?', 'open', now());

select is(
  (select array_agg(a order by i) from unnest((select proargnames from pg_proc where oid = 'public.bid_pipeline()'::regprocedure)) with ordinality as u (a, i)),
  array['project_id', 'name', 'number', 'org_name', 'stage', 'timezone', 'bid_due_at', 'packages', 'packages_covered',
        'bids_in', 'invited', 'open_questions'],
  'pipeline: counts and dates only, never a money column');
select ok(not has_function_privilege('anon', 'public.bid_pipeline()', 'execute')
          and has_function_privilege('authenticated', 'public.bid_pipeline()', 'execute'),
  'pipeline: signed-in people only');

set local role authenticated;

-- The admin: every Pipe job in a bid stage; not the one under construction, not the other company's job.
select pg_temp.login('a0000000-0000-0000-0000-000000000261');
select results_eq($$ select name from public.bid_pipeline() order by name $$,
  $$ values ('Pipe Awarded'), ('Pipe Bidding'), ('Pipe Lost'), ('Pipe Prospect'), ('Pipe Sealed') $$,
  'pipeline: my jobs in prospect, bidding, awarded or lost; not construction, not someone else''s');
select results_eq($$ select project_id from public.bid_pipeline() limit 2 $$,
  $$ values ('c0000000-0000-0000-0000-000000000265'::uuid), ('c0000000-0000-0000-0000-000000000261'::uuid) $$,
  'pipeline: bid due soonest first');
select results_eq(
  $$ select number, org_name, stage, timezone, packages, packages_covered, bids_in, invited, open_questions
       from public.bid_pipeline() where project_id = 'c0000000-0000-0000-0000-000000000261' $$,
  $$ values (null::text, 'Pipe Builders', 'bidding', 'America/Los_Angeles', 2::bigint, 1::bigint, 2::bigint, 3::bigint, 2::bigint) $$,
  'pipeline: live packages, packages with a current bid, current bids (one per bidder), invites, open questions');
select results_eq(
  $$ select bid_due_at, packages, packages_covered, bids_in, invited, open_questions
       from public.bid_pipeline() where project_id = 'c0000000-0000-0000-0000-000000000262' $$,
  $$ values (null::timestamptz, 0::bigint, 0::bigint, 0::bigint, 0::bigint, 0::bigint) $$,
  'pipeline: a prospect with nothing yet shows zeros and no bid date');
select ok(not public.bids_open('c0000000-0000-0000-0000-000000000265'), 'pipeline: the sealed job is still sealed');
select results_eq(
  $$ select packages, packages_covered, bids_in from public.bid_pipeline() where project_id = 'c0000000-0000-0000-0000-000000000265' $$,
  $$ values (1::bigint, 1::bigint, 1::bigint) $$,
  'pipeline: a sealed job shows counts only');
select is_empty($$ select * from public.bid_submissions where project_id = 'c0000000-0000-0000-0000-000000000265' $$,
  'pipeline: the sealed job''s bids stay unread');

-- An estimator on one job sees that job only.
select pg_temp.login('a0000000-0000-0000-0000-000000000266');
select results_eq($$ select name from public.bid_pipeline() $$, $$ values ('Pipe Bidding') $$,
  'pipeline: an estimator sees only the jobs they run bids on');

-- A bidder, a sub and a pm on the job (no bids.manage) get nothing.
select pg_temp.login('a0000000-0000-0000-0000-000000000262');
select is_empty($$ select * from public.bid_pipeline() $$, 'pipeline: a bidder on the job gets nothing');
select pg_temp.login('a0000000-0000-0000-0000-000000000263');
select is_empty($$ select * from public.bid_pipeline() $$, 'pipeline: a sub on the job gets nothing');
select pg_temp.login('a0000000-0000-0000-0000-000000000265');
select is_empty($$ select * from public.bid_pipeline() $$, 'pipeline: a pm without bids.manage gets nothing');

-- The other company's admin sees only their own job.
select pg_temp.login('a0000000-0000-0000-0000-000000000264');
select results_eq($$ select name from public.bid_pipeline() $$, $$ values ('Other Bid') $$,
  'pipeline: another company sees only its own jobs');

-- Access that has ended hides the job.
reset role;
update public.project_members set access_ends_at = now() - interval '1 minute' where id = 'e1000000-0000-0000-0000-000000000266';
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000266');
select is_empty($$ select * from public.bid_pipeline() $$, 'pipeline: ended access hides the job');

select * from finish();
rollback;
