begin;
select plan(7);
-- Office intake (migration 0019): the coverage board's "submitted" and "late" count current submissions per bidder,
-- whether the bidder uploaded on their page or the office recorded the file: a member, a linked sub, or an unlinked
-- office bid each count once; a superseded version does not.
\ir _helpers.psql

select pg_temp.mk_user('a0000000-0000-0000-0000-000000000051', 'probe+intake-admin@example.test', 'Intake Admin');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000052', 'probe+intake-pm@example.test', 'Intake PM');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000053', 'probe+intake-bidder@example.test', 'Intake Bidder');
insert into public.orgs (id, name, kind, created_by) values
  ('b0000000-0000-0000-0000-000000000051', 'Intake Org', 'gc', 'a0000000-0000-0000-0000-000000000051');
insert into public.projects (id, org_id, name, stage, created_by) values
  ('c0000000-0000-0000-0000-000000000051', 'b0000000-0000-0000-0000-000000000051', 'Intake Job', 'bidding', 'a0000000-0000-0000-0000-000000000051');
insert into public.project_members (org_id, project_id, user_id, invite_email, role, status, created_by) values
  ('b0000000-0000-0000-0000-000000000051', 'c0000000-0000-0000-0000-000000000051', 'a0000000-0000-0000-0000-000000000052', 'probe+intake-pm@example.test', 'pm', 'active', 'a0000000-0000-0000-0000-000000000051'),
  ('b0000000-0000-0000-0000-000000000051', 'c0000000-0000-0000-0000-000000000051', 'a0000000-0000-0000-0000-000000000053', 'probe+intake-bidder@example.test', 'bidder', 'active', 'a0000000-0000-0000-0000-000000000051');
insert into public.bid_packages (id, org_id, project_id, code, name, created_by) values
  ('ab000000-0000-0000-0000-000000000051', 'b0000000-0000-0000-0000-000000000051', 'c0000000-0000-0000-0000-000000000051', '09A', 'Drywall', 'a0000000-0000-0000-0000-000000000051'),
  ('ab000000-0000-0000-0000-000000000052', 'b0000000-0000-0000-0000-000000000051', 'c0000000-0000-0000-0000-000000000051', '03A', 'Concrete', 'a0000000-0000-0000-0000-000000000051');
insert into public.subs (id, org_id, company, created_by) values
  ('5b000000-0000-0000-0000-000000000051', 'b0000000-0000-0000-0000-000000000051', 'Sample Drywall Co', 'a0000000-0000-0000-0000-000000000051');

create temp table ids (k text primary key, v uuid not null);
grant all on ids to public;
create function pg_temp.id(p_k text) returns uuid language sql stable as $$ select v from pg_temp.ids where k = p_k $$;
grant execute on function pg_temp.id(text) to public;
insert into ids select 'bids', id from public.folders where project_id = 'c0000000-0000-0000-0000-000000000051' and kind = 'bids_received';
insert into ids select 'mB', id from public.project_members where project_id = 'c0000000-0000-0000-0000-000000000051' and user_id = 'a0000000-0000-0000-0000-000000000053';
insert into public.member_scopes (project_member_id, scope_type, scope_id) values (pg_temp.id('mB'), 'bid_package', 'ab000000-0000-0000-0000-000000000051');
insert into public.bid_invites (org_id, project_id, package_id, member_id, created_by) values
  ('b0000000-0000-0000-0000-000000000051', 'c0000000-0000-0000-0000-000000000051', 'ab000000-0000-0000-0000-000000000051', pg_temp.id('mB'), 'a0000000-0000-0000-0000-000000000051');

set local role authenticated;

-- Nothing received yet: the invite alone does not count as submitted.
select pg_temp.login('a0000000-0000-0000-0000-000000000051', 'aal2');
select results_eq($$ select invited, submitted, late from public.bid_coverage('c0000000-0000-0000-0000-000000000051') where code = '09A' $$,
  $$ values (1::bigint, 0::bigint, 0::bigint) $$, 'coverage: an invite that has not submitted counts as invited only');

-- The bidder submits on their page.
select pg_temp.login('a0000000-0000-0000-0000-000000000053');
insert into ids select 'fB', id from public.register_file(pg_temp.id('bids'), 'bidder-bid.pdf', 'application/pdf', 100);
insert into ids select 'sB', id from public.submit_bid('ab000000-0000-0000-0000-000000000051', pg_temp.id('fB'));

-- The office records three files: one unlinked, two from the same sub (the second supersedes the first).
select pg_temp.login('a0000000-0000-0000-0000-000000000051', 'aal2');
insert into ids select 'f1', (public.register_file(pg_temp.id('bids'), '09_Sample Unknown.pdf', 'application/pdf', 100)).id;
insert into ids select 'f2', (public.register_file(pg_temp.id('bids'), '09_Sample Drywall.pdf', 'application/pdf', 100)).id;
insert into ids select 'f3', (public.register_file(pg_temp.id('bids'), '09_Sample Drywall rev.pdf', 'application/pdf', 100)).id;
insert into ids select 's1', submission_id from public.record_received_bid(pg_temp.id('f1'), 'ab000000-0000-0000-0000-000000000051');
insert into ids select 's2', submission_id from public.record_received_bid(pg_temp.id('f2'), 'ab000000-0000-0000-0000-000000000051', '5b000000-0000-0000-0000-000000000051');
insert into ids select 's3', submission_id from public.record_received_bid(pg_temp.id('f3'), 'ab000000-0000-0000-0000-000000000051', '5b000000-0000-0000-0000-000000000051');
select is((select superseded_by from public.bid_submissions where id = pg_temp.id('s2')), pg_temp.id('s3'),
  'intake: the same sub''s second file supersedes its first');
select results_eq($$ select invited, submitted, late from public.bid_coverage('c0000000-0000-0000-0000-000000000051') where code = '09A' $$,
  $$ values (1::bigint, 3::bigint, 0::bigint) $$, 'coverage: the member, the sub (once) and the unlinked bid = 3 submitted');
select is((select submitted from public.bid_coverage('c0000000-0000-0000-0000-000000000051') where code = '03A'), 0::bigint,
  'coverage: the other package has nothing');

-- Linking the unlinked bid to the same sub after reading it merges the two bidders.
select lives_ok($$ select public.set_submission_sub(pg_temp.id('s1'), '5b000000-0000-0000-0000-000000000051') $$, 'intake: link the read bid to its sub');
select is((select submitted from public.bid_coverage('c0000000-0000-0000-0000-000000000051') where code = '09A'), 2::bigint,
  'coverage: once linked, the sub counts once across its files');

-- A bid recorded after bid time is late.
reset role;
update public.projects set bid_due_at = now() - interval '1 day' where id = 'c0000000-0000-0000-0000-000000000051';
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000051', 'aal2');
insert into ids select 'f4', (public.register_file(pg_temp.id('bids'), '09_Sample Late.pdf', 'application/pdf', 100)).id;
insert into ids select 's4', submission_id from public.record_received_bid(pg_temp.id('f4'), 'ab000000-0000-0000-0000-000000000051');
select results_eq($$ select submitted, late from public.bid_coverage('c0000000-0000-0000-0000-000000000051') where code = '09A' $$,
  $$ values (3::bigint, 1::bigint) $$, 'coverage: an office bid recorded after bid time counts as late');

select * from finish();
rollback;
