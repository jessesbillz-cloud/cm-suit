begin;
select plan(73);
-- SPEC §11.3-§11.5 / §11.8: the bidder wall on every bid table, the sealed-bid hold, pricing only at aal2, receipts,
-- revisions and late bids, anonymized answers, addenda and acknowledgments, and the "Bids received" upload path.
\ir _helpers.psql

-- ---------------------------------------------------------------------------------------------------------------
-- Seed (as postgres). Project A: sealed, due tomorrow. Packages P1 (23A) and P2 (09A).
--   bidder A: scopes P1 + P2.  bidder B: scope P1 only.  Project B (other org): bidder C on P3.
-- ---------------------------------------------------------------------------------------------------------------
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000001', 'probe+project_admin@example.test', 'Admin');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000002', 'probe+estimator@example.test', 'Estimator');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000003', 'probe+pm@example.test', 'PM');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000009', 'probe+bidder@example.test', 'Bidder A');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000014', 'probe+bidder2@example.test', 'Bidder B');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000015', 'probe+admin-b@example.test', 'Admin B');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000019', 'probe+bidder3@example.test', 'Bidder C');

insert into public.orgs (id, name, kind, created_by) values
  ('b0000000-0000-0000-0000-00000000000a', 'Org A', 'gc', 'a0000000-0000-0000-0000-000000000001'),
  ('b0000000-0000-0000-0000-00000000000b', 'Org B', 'gc', 'a0000000-0000-0000-0000-000000000015');
insert into public.projects (id, org_id, name, bid_due_at, bid_sealed, created_by) values
  ('c0000000-0000-0000-0000-00000000000a', 'b0000000-0000-0000-0000-00000000000a', 'Project A', now() + interval '1 day', true, 'a0000000-0000-0000-0000-000000000001'),
  ('c0000000-0000-0000-0000-00000000000b', 'b0000000-0000-0000-0000-00000000000b', 'Project B', now() + interval '1 day', false, 'a0000000-0000-0000-0000-000000000015');

insert into public.project_members (org_id, project_id, user_id, invite_email, role, status, created_by)
select m.org, m.proj, u.id, u.email, m.role, 'active', m.by
from (values
  ('a0000000-0000-0000-0000-000000000002'::uuid, 'estimator', 'b0000000-0000-0000-0000-00000000000a'::uuid, 'c0000000-0000-0000-0000-00000000000a'::uuid, 'a0000000-0000-0000-0000-000000000001'::uuid),
  ('a0000000-0000-0000-0000-000000000003', 'pm',     'b0000000-0000-0000-0000-00000000000a', 'c0000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-000000000001'),
  ('a0000000-0000-0000-0000-000000000009', 'bidder', 'b0000000-0000-0000-0000-00000000000a', 'c0000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-000000000001'),
  ('a0000000-0000-0000-0000-000000000014', 'bidder', 'b0000000-0000-0000-0000-00000000000a', 'c0000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-000000000001'),
  ('a0000000-0000-0000-0000-000000000019', 'bidder', 'b0000000-0000-0000-0000-00000000000b', 'c0000000-0000-0000-0000-00000000000b', 'a0000000-0000-0000-0000-000000000015')
) as m (uid, role, org, proj, by)
join auth.users u on u.id = m.uid;

insert into public.bid_packages (id, org_id, project_id, code, name, created_by) values
  ('ab000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-00000000000a', 'c0000000-0000-0000-0000-00000000000a', '23A', 'HVAC', 'a0000000-0000-0000-0000-000000000002'),
  ('ab000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-00000000000a', 'c0000000-0000-0000-0000-00000000000a', '09A', 'Drywall', 'a0000000-0000-0000-0000-000000000002'),
  ('ab000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-00000000000b', 'c0000000-0000-0000-0000-00000000000b', '23A', 'HVAC', 'a0000000-0000-0000-0000-000000000015');

-- Named ids used below (members, invites, files, submissions, questions, addendum).
create temp table ids (k text primary key, v uuid not null);
grant all on ids to public;
create function pg_temp.id(p_k text) returns uuid language sql stable as $$ select v from pg_temp.ids where k = p_k $$;
grant execute on function pg_temp.id(text) to public;

insert into ids
select 'm' || right(pm.user_id::text, 2), pm.id from public.project_members pm
 where pm.user_id in ('a0000000-0000-0000-0000-000000000009', 'a0000000-0000-0000-0000-000000000014', 'a0000000-0000-0000-0000-000000000019');
-- mA = m09, mB = m14, mC = m19
insert into ids select 'bids', id from public.folders where project_id = 'c0000000-0000-0000-0000-00000000000a' and kind = 'bids_received';
insert into ids select 'bidsB', id from public.folders where project_id = 'c0000000-0000-0000-0000-00000000000b' and kind = 'bids_received';

insert into public.member_scopes (project_member_id, scope_type, scope_id) values
  (pg_temp.id('m09'), 'bid_package', 'ab000000-0000-0000-0000-000000000001'),
  (pg_temp.id('m09'), 'bid_package', 'ab000000-0000-0000-0000-000000000002'),
  (pg_temp.id('m14'), 'bid_package', 'ab000000-0000-0000-0000-000000000001'),
  (pg_temp.id('m19'), 'bid_package', 'ab000000-0000-0000-0000-000000000003');

-- Invites (the invite-bidders function writes these with the service role): iA1, iA2, iB1, iC3.
with ins as (
  insert into public.bid_invites (org_id, project_id, package_id, member_id, created_by)
  select pk.org_id, pk.project_id, pk.id, pg_temp.id(x.m), 'a0000000-0000-0000-0000-000000000002'
  from (values ('m09', 'ab000000-0000-0000-0000-000000000001'::uuid), ('m09', 'ab000000-0000-0000-0000-000000000002'),
               ('m14', 'ab000000-0000-0000-0000-000000000001'), ('m19', 'ab000000-0000-0000-0000-000000000003')) as x (m, pkg)
  join public.bid_packages pk on pk.id = x.pkg
  returning id, package_id, member_id
)
insert into ids
select case when ins.member_id = pg_temp.id('m09') and ins.package_id = 'ab000000-0000-0000-0000-000000000001' then 'iA1'
            when ins.member_id = pg_temp.id('m09') then 'iA2'
            when ins.member_id = pg_temp.id('m14') then 'iB1' else 'iC3' end, ins.id
from ins;

set local role authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- "Bids received": a bidder may write (through register_file), a pm may not.
-- ---------------------------------------------------------------------------------------------------------------
select ok(pg_temp.can_write_as('a0000000-0000-0000-0000-000000000009', pg_temp.id('bids')), 'folder_can_write(Bids received): bidder true');
select ok(not pg_temp.can_write_as('a0000000-0000-0000-0000-000000000003', pg_temp.id('bids')), 'folder_can_write(Bids received): pm false');

-- ---------------------------------------------------------------------------------------------------------------
-- Submissions: bidder A, then bidder B, then bidder A revises. Receipts come from the database.
-- ---------------------------------------------------------------------------------------------------------------
select pg_temp.login('a0000000-0000-0000-0000-000000000009');
insert into ids select 'fA1', id from public.register_file(pg_temp.id('bids'), 'a-bid.pdf', 'application/pdf', 100);
select ok(pg_temp.id('fA1') is not null, 'register_file: bidder A registers a file in Bids received');
select is((select created_by from public.files where id = pg_temp.id('fA1')), 'a0000000-0000-0000-0000-000000000009'::uuid,
  'register_file: the file belongs to bidder A (created_by from auth.uid())');
insert into ids select 'sA1', id from public.submit_bid('ab000000-0000-0000-0000-000000000001', pg_temp.id('fA1'));
select results_eq($$ select receipt_number, is_late, version_no, superseded_by is null from public.bid_submissions where id = pg_temp.id('sA1') $$,
  $$ values (1, false, 1, true) $$, 'submit_bid: first bid gets receipt 1, on time, version 1');
select is((public.set_bid_intent(pg_temp.id('iA2'), 'intends')).status, 'intends', 'set_bid_intent: bidder A marks its own P2 invite');
insert into ids select 'qA1', id from public.ask_bid_question('c0000000-0000-0000-0000-00000000000a', 'ab000000-0000-0000-0000-000000000001', 'Is PW required?');
insert into ids select 'qA2', id from public.ask_bid_question('c0000000-0000-0000-0000-00000000000a', 'ab000000-0000-0000-0000-000000000002', 'Level 5 finish at lobby?');

select pg_temp.login('a0000000-0000-0000-0000-000000000014');
insert into ids select 'fB1', id from public.register_file(pg_temp.id('bids'), 'b-bid.pdf', 'application/pdf', 100);
insert into ids select 'sB1', id from public.submit_bid('ab000000-0000-0000-0000-000000000001', pg_temp.id('fB1'));
insert into ids select 'qB', id from public.ask_bid_question('c0000000-0000-0000-0000-00000000000a', 'ab000000-0000-0000-0000-000000000001', 'Duct liner required?');
select throws_ok(format('select public.submit_bid(%L, %L)', 'ab000000-0000-0000-0000-000000000001', pg_temp.id('fA1')),
  'P0002', 'file not found or not yours', 'submit_bid: bidder B cannot submit bidder A''s file');
select throws_ok(format('select public.set_bid_intent(%L, %L)', pg_temp.id('iA1'), 'declined'),
  '42501', 'forbidden', 'set_bid_intent: bidder B cannot set bidder A''s intent');
select throws_ok($$ select public.submit_bid('ab000000-0000-0000-0000-000000000002', null) $$,
  '42501', 'forbidden', 'submit_bid: bidder B cannot bid a package outside its scope');

select pg_temp.login('a0000000-0000-0000-0000-000000000009');
insert into ids select 'fA2', id from public.register_file(pg_temp.id('bids'), 'a-bid-rev1.pdf', 'application/pdf', 100);
insert into ids select 'sA2', id from public.submit_bid('ab000000-0000-0000-0000-000000000001', pg_temp.id('fA2'));
select results_eq($$ select version_no, is_late from public.bid_submissions where id = pg_temp.id('sA2') $$,
  $$ values (2, false) $$, 'resubmission: version_no 2, on time');
select is((select superseded_by from public.bid_submissions where id = pg_temp.id('sA1')), pg_temp.id('sA2'),
  'resubmission: the first version is superseded by the second (kept, not deleted)');
select is((select status from public.bid_invites where id = pg_temp.id('iA1')), 'submitted', 'resubmission: invite status stays submitted');

-- Project B's receipts are numbered separately.
select pg_temp.login('a0000000-0000-0000-0000-000000000019');
insert into ids select 'fC', id from public.register_file(pg_temp.id('bidsB'), 'c-bid.pdf', 'application/pdf', 100);
insert into ids select 'sC', id from public.submit_bid('ab000000-0000-0000-0000-000000000003', pg_temp.id('fC'));

reset role;
select results_eq(
  $$ select s.receipt_number from public.bid_submissions s
     join (values ('sA1', 1), ('sB1', 2), ('sA2', 3)) as o (k, n) on s.id = pg_temp.id(o.k) order by o.n $$,
  $$ values (1), (2), (3) $$, 'receipts: sequential per project in submission order (A, B, A rev)');
select is((select receipt_number from public.bid_submissions where id = pg_temp.id('sC')), 1, 'receipts: project B starts its own sequence at 1');
select is((select count(*)::int from public.bid_submissions where received_at = now() and id in (pg_temp.id('sA1'), pg_temp.id('sB1'), pg_temp.id('sA2'))), 3,
  'receipts: received_at is the server clock');
select ok(not exists (select 1 from pg_proc p, unnest(p.proargtypes::oid[]) t
                      where p.oid = 'public.submit_bid(uuid, uuid)'::regprocedure and t in ('timestamptz'::regtype, 'timestamp'::regtype)),
  'receipts: submit_bid takes no client-supplied time');
set local role authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- The bidder wall: A and B never see each other's rows.
-- ---------------------------------------------------------------------------------------------------------------
select pg_temp.login('a0000000-0000-0000-0000-000000000014');
select results_eq($$ select user_id from public.project_members where project_id = 'c0000000-0000-0000-0000-00000000000a' $$,
  $$ values ('a0000000-0000-0000-0000-000000000014'::uuid) $$, 'bidder B: project_members = own row only');
select results_eq($$ select id from public.bid_invites $$, $$ select pg_temp.id('iB1') $$, 'bidder B: bid_invites = own invite only');
select results_eq($$ select id from public.bid_submissions $$, $$ select pg_temp.id('sB1') $$, 'bidder B: bid_submissions = own only');
select results_eq($$ select id from public.bid_questions $$, $$ select pg_temp.id('qB') $$, 'bidder B: bid_questions = own only');
select results_eq($$ select id from public.files where folder_id = pg_temp.id('bids') $$, $$ select pg_temp.id('fB1') $$,
  'bidder B: Bids received shows only own file');
select is_empty($$ select id from public.files where id in (pg_temp.id('fA1'), pg_temp.id('fA2')) $$, 'bidder B: bidder A''s files are invisible');
select ok(not exists (select 1 from public.people_display('c0000000-0000-0000-0000-00000000000a') where user_id = 'a0000000-0000-0000-0000-000000000009'),
  'bidder B: people_display has no bidder A');
select is_empty($$ select id from public.bid_packages where id = 'ab000000-0000-0000-0000-000000000002' $$, 'bidder B: package outside its scope is hidden');
select is(jsonb_array_length(public.bidder_page('c0000000-0000-0000-0000-00000000000a')->'packages'), 1, 'bidder B: bidder_page lists only its package');
select results_eq(
  $$ select (s->>'id')::uuid from jsonb_array_elements(public.bidder_page('c0000000-0000-0000-0000-00000000000a')->'packages'->0->'submissions') s $$,
  $$ select pg_temp.id('sB1') $$, 'bidder B: bidder_page shows only its own submission');
select is_empty($$ select 1 from jsonb_array_elements(public.bidder_page('c0000000-0000-0000-0000-00000000000a')->'my_questions') q
                   where (q->>'id')::uuid <> pg_temp.id('qB') $$, 'bidder B: bidder_page my_questions = own only');

select pg_temp.login('a0000000-0000-0000-0000-000000000009');
select is_empty($$ select id from public.project_members where user_id = 'a0000000-0000-0000-0000-000000000014' $$, 'bidder A: no project_members row for bidder B');
select is_empty($$ select id from public.bid_invites where member_id = pg_temp.id('m14') $$, 'bidder A: no bid_invites of bidder B');
select is_empty($$ select id from public.bid_submissions where member_id = pg_temp.id('m14') $$, 'bidder A: no bid_submissions of bidder B');
select is_empty($$ select id from public.bid_questions where member_id = pg_temp.id('m14') $$, 'bidder A: no bid_questions of bidder B');
select is_empty($$ select id from public.files where id = pg_temp.id('fB1') $$, 'bidder A: bidder B''s file in Bids received is invisible');
select ok(not exists (select 1 from public.people_display('c0000000-0000-0000-0000-00000000000a') where user_id = 'a0000000-0000-0000-0000-000000000014'),
  'bidder A: people_display has no bidder B');
select results_eq($$ select id from public.bid_submissions order by version_no $$, $$ values (pg_temp.id('sA1')), (pg_temp.id('sA2')) $$,
  'bidder A: sees both of its own versions while sealed');
select is_empty($$ select id from public.bid_submissions where project_id = 'c0000000-0000-0000-0000-00000000000b' $$, 'bidder A: nothing from project B');

-- ---------------------------------------------------------------------------------------------------------------
-- Managers: bids.manage sees every invite and question; the pm sees none.
-- ---------------------------------------------------------------------------------------------------------------
select pg_temp.login('a0000000-0000-0000-0000-000000000002');
select results_eq($$ select id from public.bid_invites order by id $$,
  $$ select v from pg_temp.ids where k in ('iA1', 'iA2', 'iB1') order by v $$, 'estimator: sees all project A invites (not project B)');
select results_eq($$ select id from public.bid_questions order by number $$,
  $$ values (pg_temp.id('qA1')), (pg_temp.id('qA2')), (pg_temp.id('qB')) $$, 'estimator: sees all questions');
select is((select intends::int from public.bid_coverage('c0000000-0000-0000-0000-00000000000a') where code = '09A'), 1, 'coverage: P2 shows one intends');
select pg_temp.login('a0000000-0000-0000-0000-000000000003', 'aal2');
select is_empty($$ select id from public.bid_invites $$, 'pm: no bid_invites');
select is_empty($$ select id from public.bid_questions $$, 'pm: no bid_questions');
select is_empty($$ select id from public.bid_submissions $$, 'pm: no bid_submissions');

-- ---------------------------------------------------------------------------------------------------------------
-- Sealed: while bid_sealed and bid_due_at is in the future, the project side opens nothing (aal2 included).
-- ---------------------------------------------------------------------------------------------------------------
reset role;
insert into public.bid_extractions (id, org_id, project_id, submission_id, bidder_name)
values ('ac000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-00000000000a', 'c0000000-0000-0000-0000-00000000000a', pg_temp.id('sA2'), 'Bidder A'),
       ('ac000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-00000000000a', 'c0000000-0000-0000-0000-00000000000a', pg_temp.id('sB1'), 'Bidder B');
insert into public.bid_extraction_pricing (extraction_id, project_id, base_amount)
values ('ac000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-00000000000a', 100000),
       ('ac000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-00000000000a', 95000);
set local role authenticated;

select pg_temp.login('a0000000-0000-0000-0000-000000000002');
select is_empty($$ select id from public.bid_submissions $$, 'sealed: estimator (aal1) sees 0 submissions');
select pg_temp.login('a0000000-0000-0000-0000-000000000002', 'aal2');
select is_empty($$ select id from public.bid_submissions $$, 'sealed: estimator (aal2) sees 0 submissions');
select is_empty($$ select id from public.bid_extractions $$, 'sealed: estimator (aal2) sees 0 extractions');
select is_empty($$ select extraction_id from public.bid_extraction_pricing $$, 'sealed: estimator (aal2) sees 0 pricing rows');
select pg_temp.login('a0000000-0000-0000-0000-000000000001', 'aal2');
select is_empty($$ select id from public.bid_submissions $$, 'sealed: project_admin (aal2) sees 0 submissions');

-- Bid time passes (a system write: no signed-in person, so the seal guard does not apply).
reset role;
select pg_temp.login_service();
update public.projects set bid_due_at = now() - interval '1 minute' where id = 'c0000000-0000-0000-0000-00000000000a';
set local role authenticated;

select pg_temp.login('a0000000-0000-0000-0000-000000000002');
select is((select count(*)::int from public.bid_submissions), 3, 'opened: estimator (aal1) sees all 3 submissions');
select pg_temp.login('a0000000-0000-0000-0000-000000000002', 'aal2');
select is((select count(*)::int from public.bid_extractions), 2, 'opened: estimator (aal2) sees the extractions');

-- ---------------------------------------------------------------------------------------------------------------
-- Pricing: bid_extraction_pricing only with bids.view_pricing at aal2.
-- ---------------------------------------------------------------------------------------------------------------
select pg_temp.login('a0000000-0000-0000-0000-000000000002');
select is_empty($$ select extraction_id from public.bid_extraction_pricing $$, 'pricing: estimator at aal1 sees 0 rows');
select is_empty($$ select id from public.bid_extractions $$, 'findings: estimator at aal1 sees 0 extractions');
select pg_temp.login('a0000000-0000-0000-0000-000000000002', 'aal2');
select results_eq($$ select base_amount from public.bid_extraction_pricing order by base_amount $$, $$ values (95000.00::numeric(14,2)), (100000.00) $$,
  'pricing: estimator at aal2 sees the rows');
select pg_temp.login('a0000000-0000-0000-0000-000000000003', 'aal2');
select is_empty($$ select extraction_id from public.bid_extraction_pricing $$, 'pricing: pm (aal2, no bids.view_pricing) sees 0 rows');
select pg_temp.login('a0000000-0000-0000-0000-000000000009', 'aal2');
select is_empty($$ select extraction_id from public.bid_extraction_pricing $$, 'pricing: bidder (aal2) sees 0 rows, even for its own bid');
select is_empty($$ select id from public.bid_extractions $$, 'findings: bidder never sees AI output about its own bid');

-- ---------------------------------------------------------------------------------------------------------------
-- Received bid files: invisible to pm and estimator at aal1, visible to estimator at aal2.
-- ---------------------------------------------------------------------------------------------------------------
select pg_temp.login('a0000000-0000-0000-0000-000000000003', 'aal2');
select is_empty($$ select id from public.files where id = pg_temp.id('fA1') $$, 'bid file: pm cannot see it');
select pg_temp.login('a0000000-0000-0000-0000-000000000002');
select is_empty($$ select id from public.files where id = pg_temp.id('fA1') $$, 'bid file: estimator at aal1 cannot see it');
select pg_temp.login('a0000000-0000-0000-0000-000000000002', 'aal2');
select results_eq($$ select id from public.files where folder_id = pg_temp.id('bids') order by id $$,
  $$ select v from pg_temp.ids where k in ('fA1', 'fB1', 'fA2') order by v $$, 'bid file: estimator at aal2 sees every received file');

-- ---------------------------------------------------------------------------------------------------------------
-- Late: a bid after bid_due_at is accepted and flagged.
-- ---------------------------------------------------------------------------------------------------------------
select pg_temp.login('a0000000-0000-0000-0000-000000000014');
insert into ids select 'fB2', id from public.register_file(pg_temp.id('bids'), 'b-bid-late.pdf', 'application/pdf', 100);
insert into ids select 'sB2', id from public.submit_bid('ab000000-0000-0000-0000-000000000001', pg_temp.id('fB2'));
select results_eq($$ select receipt_number, is_late, version_no from public.bid_submissions where id = pg_temp.id('sB2') $$,
  $$ values (4, true, 2) $$, 'late: accepted with the next receipt, flagged late, version 2');
select is((select status from public.bid_invites where id = pg_temp.id('iB1')), 'late', 'late: invite status is late');

-- ---------------------------------------------------------------------------------------------------------------
-- Answers: anonymized (no asker column); package-only answers stay within that package's bidders.
-- ---------------------------------------------------------------------------------------------------------------
select is_empty($$ select column_name from information_schema.columns
                   where table_schema = 'public' and table_name = 'published_answers'
                     and column_name in ('member_id', 'asker_id', 'asked_by', 'user_id', 'question_id', 'bidder_id', 'sub_id') $$,
  'published_answers has no asker column');
select pg_temp.login('a0000000-0000-0000-0000-000000000002');
select is((public.answer_bid_question(pg_temp.id('qA1'), 'Is prevailing wage required?', 'Yes.')).package_id, null::uuid,
  'answer: job-wide answer has no package');
select is((public.answer_bid_question(pg_temp.id('qA2'), 'Finish level at the lobby?', 'Level 5.', true)).package_id,
  'ab000000-0000-0000-0000-000000000002'::uuid, 'answer: package-only answer is tied to P2');
select pg_temp.login('a0000000-0000-0000-0000-000000000014');
select results_eq($$ select question_text from public.published_answers $$, $$ values ('Is prevailing wage required?'::text) $$,
  'bidder B (no P2 scope): sees the job-wide answer only');
select results_eq($$ select a->>'question_text' from jsonb_array_elements(public.bidder_page('c0000000-0000-0000-0000-00000000000a')->'answers') a $$,
  $$ values ('Is prevailing wage required?'::text) $$, 'bidder B: bidder_page answers exclude the P2-only answer');
select pg_temp.login('a0000000-0000-0000-0000-000000000009');
select is((select count(*)::int from public.published_answers), 2, 'bidder A (P2 scope): sees both answers');

-- ---------------------------------------------------------------------------------------------------------------
-- Addenda: no acknowledgment before issue; issue creates one task per bidder; acknowledging completes it.
-- ---------------------------------------------------------------------------------------------------------------
select pg_temp.login('a0000000-0000-0000-0000-000000000002');
insert into ids select 'add', id from public.create_addendum('c0000000-0000-0000-0000-00000000000a', 'Addendum 1', 'Revised duct routing.');
select pg_temp.login('a0000000-0000-0000-0000-000000000009');
select is_empty($$ select id from public.addenda $$, 'addendum: draft invisible to bidders');
select throws_ok(format('select public.acknowledge_addendum(%L)', pg_temp.id('add')), 'P0002', 'not_found',
  'addendum: bidder cannot acknowledge before issue');
select pg_temp.login('a0000000-0000-0000-0000-000000000002');
select is((public.issue_addendum(pg_temp.id('add'), 'sha256:test')).content_hash, 'sha256:test', 'addendum: issued with its content hash');
reset role;
select results_eq($$ select assignee_user_id from public.tasks where kind = 'addendum_ack' and entity_id = pg_temp.id('add') order by 1 $$,
  $$ values ('a0000000-0000-0000-0000-000000000009'::uuid), ('a0000000-0000-0000-0000-000000000014'::uuid) $$,
  'addendum: issue creates exactly one task per project A bidder');
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000009');
select lives_ok(format('select public.acknowledge_addendum(%L)', pg_temp.id('add')), 'addendum: bidder A acknowledges in one call');
reset role;
select results_eq($$ select assignee_user_id, done_at is not null from public.tasks where kind = 'addendum_ack' and entity_id = pg_temp.id('add') order by 1 $$,
  $$ values ('a0000000-0000-0000-0000-000000000009'::uuid, true), ('a0000000-0000-0000-0000-000000000014'::uuid, false) $$,
  'addendum: bidder A''s task is done, bidder B''s is still open');
select results_eq($$ select member_id from public.addendum_acks where addendum_id = pg_temp.id('add') $$, $$ select pg_temp.id('m09') $$,
  'addendum: one acknowledgment row, for bidder A');
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000014');
select is_empty($$ select member_id from public.addendum_acks $$, 'addendum: bidder B cannot see bidder A''s acknowledgment');

select * from finish();
rollback;
