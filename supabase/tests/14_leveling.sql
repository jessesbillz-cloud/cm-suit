begin;
select plan(40);
-- Leveling (migration 0020, SPEC §11.6): the board per package, "current" computed from bid dates and leveling
-- marks, every flag on a synthetic case and absent on a clean package, money only for pricing callers, nothing for
-- a pm or a bidder, nothing on a sealed job before bid time, and the one write with its version check.
\ir _helpers.psql

-- ---------------------------------------------------------------------------------------------------------------
-- Seed. "Level Job": prevailing wage, due tomorrow, not sealed. Packages 03A (clean), 09A (escalation, PW, stale),
-- 22A (no bids), 23A (single bid, mismatch, a duplicate and a backup). "Sealed Job": one bid, sealed until tomorrow.
-- ---------------------------------------------------------------------------------------------------------------
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000051', 'probe+level-admin@example.test', 'Level Admin');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000052', 'probe+level-estimator@example.test', 'Level Estimator');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000053', 'probe+level-pm@example.test', 'Level PM');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000054', 'probe+level-bidder@example.test', 'Paving Person');
update public.profiles set company = 'Sample Paving Co' where user_id = 'a0000000-0000-0000-0000-000000000054';

insert into public.orgs (id, name, kind, created_by) values
  ('b0000000-0000-0000-0000-000000000051', 'Level Org', 'gc', 'a0000000-0000-0000-0000-000000000051');
-- Both jobs run in UTC so every expected date below is pg_temp.today() +/- days, whatever the server clock's zone.
insert into public.projects (id, org_id, name, stage, timezone, prevailing_wage, bid_due_at, bid_sealed, created_by) values
  ('c0000000-0000-0000-0000-000000000051', 'b0000000-0000-0000-0000-000000000051', 'Level Job', 'bidding', 'UTC', true, now() + interval '1 day', false, 'a0000000-0000-0000-0000-000000000051'),
  ('c0000000-0000-0000-0000-000000000052', 'b0000000-0000-0000-0000-000000000051', 'Sealed Job', 'bidding', 'UTC', false, now() + interval '1 day', true, 'a0000000-0000-0000-0000-000000000051');
insert into public.project_members (org_id, project_id, user_id, invite_email, role, status, created_by) values
  ('b0000000-0000-0000-0000-000000000051', 'c0000000-0000-0000-0000-000000000051', 'a0000000-0000-0000-0000-000000000052', 'probe+level-estimator@example.test', 'estimator', 'active', 'a0000000-0000-0000-0000-000000000051'),
  ('b0000000-0000-0000-0000-000000000051', 'c0000000-0000-0000-0000-000000000051', 'a0000000-0000-0000-0000-000000000053', 'probe+level-pm@example.test', 'pm', 'active', 'a0000000-0000-0000-0000-000000000051'),
  ('b0000000-0000-0000-0000-000000000051', 'c0000000-0000-0000-0000-000000000051', 'a0000000-0000-0000-0000-000000000054', 'probe+level-bidder@example.test', 'bidder', 'active', 'a0000000-0000-0000-0000-000000000051');
insert into public.bid_packages (id, org_id, project_id, code, name, created_by) values
  ('ab000000-0000-0000-0000-000000000051', 'b0000000-0000-0000-0000-000000000051', 'c0000000-0000-0000-0000-000000000051', '03A', 'Concrete', 'a0000000-0000-0000-0000-000000000051'),
  ('ab000000-0000-0000-0000-000000000052', 'b0000000-0000-0000-0000-000000000051', 'c0000000-0000-0000-0000-000000000051', '09A', 'Drywall', 'a0000000-0000-0000-0000-000000000051'),
  ('ab000000-0000-0000-0000-000000000053', 'b0000000-0000-0000-0000-000000000051', 'c0000000-0000-0000-0000-000000000051', '22A', 'Plumbing', 'a0000000-0000-0000-0000-000000000051'),
  ('ab000000-0000-0000-0000-000000000054', 'b0000000-0000-0000-0000-000000000051', 'c0000000-0000-0000-0000-000000000051', '23A', 'HVAC', 'a0000000-0000-0000-0000-000000000051'),
  ('ab000000-0000-0000-0000-000000000055', 'b0000000-0000-0000-0000-000000000051', 'c0000000-0000-0000-0000-000000000052', '03A', 'Concrete', 'a0000000-0000-0000-0000-000000000051');
insert into public.subs (id, org_id, company, created_by) values
  ('5b000000-0000-0000-0000-000000000051', 'b0000000-0000-0000-0000-000000000051', 'Sample Concrete Co', 'a0000000-0000-0000-0000-000000000051'),
  ('5b000000-0000-0000-0000-000000000052', 'b0000000-0000-0000-0000-000000000051', 'Sample Drywall Co', 'a0000000-0000-0000-0000-000000000051'),
  ('5b000000-0000-0000-0000-000000000053', 'b0000000-0000-0000-0000-000000000051', 'Sample Plaster Co', 'a0000000-0000-0000-0000-000000000051'),
  ('5b000000-0000-0000-0000-000000000054', 'b0000000-0000-0000-0000-000000000051', 'Sample Mechanical Co', 'a0000000-0000-0000-0000-000000000051');

create function pg_temp.today() returns date language sql stable as $$ select (now() at time zone 'UTC')::date $$;
grant execute on function pg_temp.today() to public;
create temp table ids (k text primary key, v uuid not null);
grant all on ids to public;
create function pg_temp.id(p_k text) returns uuid language sql stable as $$ select v from pg_temp.ids where k = p_k $$;
grant execute on function pg_temp.id(text) to public;
insert into ids select 'bids', id from public.folders where project_id = 'c0000000-0000-0000-0000-000000000051' and kind = 'bids_received';
insert into ids select 'bidsS', id from public.folders where project_id = 'c0000000-0000-0000-0000-000000000052' and kind = 'bids_received';
insert into ids select 'mBidder', id from public.project_members where user_id = 'a0000000-0000-0000-0000-000000000054';

-- One file per submission (as postgres: the upload path is covered by 06 / 08 / 11).
create function pg_temp.mk_file(p_k text, p_project uuid, p_folder uuid, p_name text) returns void language plpgsql as $$
declare fid uuid := gen_random_uuid();
begin
  insert into public.files (id, org_id, project_id, folder_id, storage_path, original_name, created_by)
  values (fid, 'b0000000-0000-0000-0000-000000000051', p_project, p_folder, 'test/leveling/' || p_k, p_name, 'a0000000-0000-0000-0000-000000000051');
  insert into pg_temp.ids values (p_k, fid);
end $$;
-- A submission with its extraction and pricing. p_who: a sub id (office-recorded) or null for the bidder member.
create function pg_temp.mk_bid(p_k text, p_pkg uuid, p_sub uuid, p_days_ago int, p_amount numeric, p_pw text, p_validity int, p_match text) returns void language plpgsql as $$
declare sid uuid := gen_random_uuid(); xid uuid := gen_random_uuid(); n int;
begin
  perform pg_temp.mk_file('f' || p_k, 'c0000000-0000-0000-0000-000000000051', pg_temp.id('bids'), 'Sample bid ' || p_k || '.pdf');
  select coalesce(max(receipt_number), 0) + 1 into n from public.bid_submissions where project_id = 'c0000000-0000-0000-0000-000000000051';
  insert into public.bid_submissions (id, org_id, project_id, package_id, member_id, sub_id, received_by, file_id, receipt_number, received_at, created_by)
  values (sid, 'b0000000-0000-0000-0000-000000000051', 'c0000000-0000-0000-0000-000000000051', p_pkg,
          case when p_sub is null then pg_temp.id('mBidder') end, p_sub, case when p_sub is not null then 'a0000000-0000-0000-0000-000000000051'::uuid end,
          pg_temp.id('f' || p_k), n, now() - make_interval(days => p_days_ago), 'a0000000-0000-0000-0000-000000000051');
  insert into public.bid_extractions (id, org_id, project_id, submission_id, status, bid_date, document_kind, prevailing_wage, validity_days, exclusions, project_match)
  values (xid, 'b0000000-0000-0000-0000-000000000051', 'c0000000-0000-0000-0000-000000000051', sid, 'confirmed', pg_temp.today() - p_days_ago, 'proposal', p_pw, p_validity,
          array['Sample exclusion ' || p_k], p_match);
  insert into public.bid_extraction_pricing (extraction_id, project_id, base_amount, base_evidence, base_page)
  values (xid, 'c0000000-0000-0000-0000-000000000051', p_amount, 'Total ' || p_amount::text, 2);
  insert into pg_temp.ids values (p_k, sid);
end $$;

-- 03A, clean: two bidders, fresh, PW included, on the right project.
select pg_temp.mk_bid('s1', 'ab000000-0000-0000-0000-000000000051', '5b000000-0000-0000-0000-000000000051', 5, 100000, 'included', 90, 'match');
select pg_temp.mk_bid('s2', 'ab000000-0000-0000-0000-000000000051', null, 4, 110000, 'included', 90, 'match');
-- 09A: Drywall bid 40 days ago at 80,000, then again 2 days ago at 102,960 (+28.7%), PW not stated;
--      Plaster bid 3 days ago, valid 3 days (expired today, before tomorrow's bid time), PW excluded.
select pg_temp.mk_bid('s3', 'ab000000-0000-0000-0000-000000000052', '5b000000-0000-0000-0000-000000000052', 40, 80000, 'included', 90, 'match');
select pg_temp.mk_bid('s4', 'ab000000-0000-0000-0000-000000000052', '5b000000-0000-0000-0000-000000000052', 2, 102960, 'not_stated', 90, 'match');
select pg_temp.mk_bid('s5', 'ab000000-0000-0000-0000-000000000052', '5b000000-0000-0000-0000-000000000053', 3, 95000, 'excluded', 3, 'match');
-- 23A: one Mechanical bid for a different project, plus the same bidder's duplicate and a backup file.
select pg_temp.mk_bid('s6', 'ab000000-0000-0000-0000-000000000054', '5b000000-0000-0000-0000-000000000054', 1, 200000, 'included', 60, 'mismatch');
select pg_temp.mk_bid('s7', 'ab000000-0000-0000-0000-000000000054', '5b000000-0000-0000-0000-000000000054', 1, 200000, 'included', 60, 'mismatch');
select pg_temp.mk_bid('s8', 'ab000000-0000-0000-0000-000000000054', '5b000000-0000-0000-0000-000000000054', 1, 5000, 'included', 60, 'match');
insert into public.bid_leveling (submission_id, project_id, is_duplicate) values (pg_temp.id('s7'), 'c0000000-0000-0000-0000-000000000051', true);
insert into public.bid_leveling (submission_id, project_id, is_backup, flags) values (pg_temp.id('s8'), 'c0000000-0000-0000-0000-000000000051', true, '[{"kind": "note", "detail": "Backup pricing sheet"}]');
-- Sealed Job: one bid.
select pg_temp.mk_file('fS', 'c0000000-0000-0000-0000-000000000052', pg_temp.id('bidsS'), 'Sample sealed bid.pdf');
insert into public.bid_submissions (org_id, project_id, package_id, sub_id, received_by, file_id, receipt_number, created_by)
values ('b0000000-0000-0000-0000-000000000051', 'c0000000-0000-0000-0000-000000000052', 'ab000000-0000-0000-0000-000000000055',
        '5b000000-0000-0000-0000-000000000051', 'a0000000-0000-0000-0000-000000000051', pg_temp.id('fS'), 1, 'a0000000-0000-0000-0000-000000000051');

set local role authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- The board, as the admin at aal2 (bids.manage + bids.view_pricing).
-- ---------------------------------------------------------------------------------------------------------------
select pg_temp.login('a0000000-0000-0000-0000-000000000051', 'aal2');
select is((select count(*)::int from public.bid_leveling_board('c0000000-0000-0000-0000-000000000051')), 8, 'board: one row per submission');
select results_eq(
  $$ select bidder from public.bid_leveling_board('c0000000-0000-0000-0000-000000000051') where submission_id in (pg_temp.id('s1'), pg_temp.id('s2')) order by 1 $$,
  $$ values ('Sample Concrete Co'::text), ('Sample Paving Co') $$, 'board: bidder = sub company, else the member''s company');
select results_eq(
  $$ select k, state, replaced_by = pg_temp.id(r) from (values ('s1', 's1'), ('s2', 's2'), ('s3', 's4'), ('s4', 's4'), ('s5', 's5'), ('s6', 's6'), ('s7', 's6'), ('s8', 's6')) as x (k, r)
     join public.bid_leveling_board('c0000000-0000-0000-0000-000000000051') b on b.submission_id = pg_temp.id(x.k) order by k $$,
  $$ values ('s1', 'current', null::boolean), ('s2', 'current', null), ('s3', 'superseded', true), ('s4', 'current', null), ('s5', 'current', null),
            ('s6', 'current', null), ('s7', 'duplicate', true), ('s8', 'backup', true) $$,
  'board: latest bid per bidder is current, the earlier one superseded, duplicate and backup point at the one that stands');
select results_eq(
  $$ select base_amount, base_evidence, base_page, valid_until = pg_temp.today() from public.bid_leveling_board('c0000000-0000-0000-0000-000000000051') where submission_id = pg_temp.id('s5') $$,
  $$ values (95000::numeric, 'Total 95000'::text, 2, true) $$, 'board: pricing caller gets amount, evidence, page; valid_until = bid date + validity');
select is((select package_code from public.bid_leveling_board('c0000000-0000-0000-0000-000000000051') where submission_id = pg_temp.id('s4')), '09A',
  'board: package code comes along');

-- Flags, admin at aal2: every kind on its case, none on the clean package.
select results_eq(
  $$ select kind, detail, submission_id from public.bid_flags('c0000000-0000-0000-0000-000000000051') where package_id = 'ab000000-0000-0000-0000-000000000052' order by kind, detail $$,
  $$ values ('escalation', '+28.7% since ' || to_char(pg_temp.today() - 40, 'FMMM/FMDD/YYYY'), pg_temp.id('s4')),
            ('pw_not_stated', 'Prevailing wage excluded', pg_temp.id('s5')),
            ('pw_not_stated', 'Prevailing wage not stated', pg_temp.id('s4')),
            ('stale', 'Expired ' || to_char(pg_temp.today(), 'FMMM/FMDD/YYYY'), pg_temp.id('s5')) $$,
  'flags 09A: escalation, PW not stated / excluded, stale');
select results_eq(
  $$ select kind, detail, submission_id from public.bid_flags('c0000000-0000-0000-0000-000000000051') where package_id = 'ab000000-0000-0000-0000-000000000054' order by kind $$,
  $$ values ('mismatch', 'Different project', pg_temp.id('s6')), ('note', 'Backup pricing sheet', pg_temp.id('s8')), ('single_bid', 'One bid', null::uuid) $$,
  'flags 23A: mismatch, the manual flag, single bid (duplicate and backup do not count)');
select results_eq(
  $$ select kind, submission_id from public.bid_flags('c0000000-0000-0000-0000-000000000051') where package_id = 'ab000000-0000-0000-0000-000000000053' $$,
  $$ values ('no_bids', null::uuid) $$, 'flags 22A: no bids');
select is_empty($$ select kind from public.bid_flags('c0000000-0000-0000-0000-000000000051') where package_id = 'ab000000-0000-0000-0000-000000000051' $$,
  'flags 03A: a clean package has no flags');

-- Escalation needs 5% or more: 100,000 -> 104,000 is not flagged.
reset role;
select pg_temp.mk_bid('s9', 'ab000000-0000-0000-0000-000000000051', '5b000000-0000-0000-0000-000000000051', 0, 104000, 'included', 90, 'match');
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000051', 'aal2');
select is((select state from public.bid_leveling_board('c0000000-0000-0000-0000-000000000051') where submission_id = pg_temp.id('s1')), 'superseded', 'board: a newer bid supersedes s1');
select is_empty($$ select kind from public.bid_flags('c0000000-0000-0000-0000-000000000051') where package_id = 'ab000000-0000-0000-0000-000000000051' $$,
  'flags 03A: +4% is not an escalation');

-- ---------------------------------------------------------------------------------------------------------------
-- Money never reaches a non-pricing caller: the estimator at aal1 has bids.manage but not bids.view_pricing.
-- ---------------------------------------------------------------------------------------------------------------
select pg_temp.login('a0000000-0000-0000-0000-000000000052', 'aal1');
select ok(not public.has_capability('c0000000-0000-0000-0000-000000000051', 'bids.view_pricing'), 'estimator at aal1: no bids.view_pricing');
select is((select count(*)::int from public.bid_leveling_board('c0000000-0000-0000-0000-000000000051')), 9, 'estimator at aal1: full board');
select is_empty(
  $$ select submission_id from public.bid_leveling_board('c0000000-0000-0000-0000-000000000051')
     where base_amount is not null or base_evidence is not null or base_page is not null or pw_adder_amount is not null $$,
  'estimator at aal1: every money column is null');
select results_eq(
  $$ select bidder, state, prevailing_wage, exclusions[1] from public.bid_leveling_board('c0000000-0000-0000-0000-000000000051') where submission_id = pg_temp.id('s4') $$,
  $$ values ('Sample Drywall Co'::text, 'current'::text, 'not_stated'::text, 'Sample exclusion s4'::text) $$,
  'estimator at aal1: bidder, state, PW and exclusions still come through');
select is_empty($$ select kind from public.bid_flags('c0000000-0000-0000-0000-000000000051') where kind = 'escalation' $$,
  'estimator at aal1: no escalation flag (money-dependent)');
select results_eq(
  $$ select kind from public.bid_flags('c0000000-0000-0000-0000-000000000051') where package_id = 'ab000000-0000-0000-0000-000000000052' order by kind $$,
  $$ values ('pw_not_stated'::text), ('pw_not_stated'), ('stale') $$, 'estimator at aal1: the other 09A flags stay');
select pg_temp.login('a0000000-0000-0000-0000-000000000052', 'aal2');
select is((select base_amount from public.bid_leveling_board('c0000000-0000-0000-0000-000000000051') where submission_id = pg_temp.id('s4')), 102960::numeric,
  'estimator at aal2: money is back');

-- pm (no bids.manage) and bidder get nothing, even at aal2.
select pg_temp.login('a0000000-0000-0000-0000-000000000053', 'aal2');
select is_empty($$ select submission_id from public.bid_leveling_board('c0000000-0000-0000-0000-000000000051') $$, 'pm: empty board');
select is_empty($$ select kind from public.bid_flags('c0000000-0000-0000-0000-000000000051') $$, 'pm: no flags');
select pg_temp.login('a0000000-0000-0000-0000-000000000054', 'aal2');
select is_empty($$ select submission_id from public.bid_leveling_board('c0000000-0000-0000-0000-000000000051') $$, 'bidder: empty board, own bid included');
select is_empty($$ select kind from public.bid_flags('c0000000-0000-0000-0000-000000000051') $$, 'bidder: no flags');
select throws_ok(format('select public.set_bid_leveling(%L, 0, %L)', pg_temp.id('s2'), '{"comparable": false}'), '42501', 'forbidden',
  'bidder: cannot level, not even its own bid');

-- Sealed job: nothing before bid time, everything after.
select pg_temp.login('a0000000-0000-0000-0000-000000000051', 'aal2');
select is_empty($$ select submission_id from public.bid_leveling_board('c0000000-0000-0000-0000-000000000052') $$, 'sealed: empty board before bid time');
select is_empty($$ select kind from public.bid_flags('c0000000-0000-0000-0000-000000000052') $$, 'sealed: no flags before bid time');
reset role;
select pg_temp.login_service();
update public.projects set bid_due_at = now() - interval '1 minute' where id = 'c0000000-0000-0000-0000-000000000052';
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000051', 'aal2');
select results_eq($$ select bidder, state, bid_date = pg_temp.today() from public.bid_leveling_board('c0000000-0000-0000-0000-000000000052') $$,
  $$ values ('Sample Concrete Co'::text, 'current'::text, true) $$, 'sealed: after bid time the board shows the bid (no extraction: bid_date = received day)');
select results_eq($$ select kind from public.bid_flags('c0000000-0000-0000-0000-000000000052') $$, $$ values ('single_bid'::text) $$, 'sealed: after bid time the flags run');

-- ---------------------------------------------------------------------------------------------------------------
-- set_bid_leveling: insert-or-update with a version check; moves stay within the job; the board follows.
-- ---------------------------------------------------------------------------------------------------------------
select pg_temp.login('a0000000-0000-0000-0000-000000000052', 'aal1');
select is((public.set_bid_leveling(pg_temp.id('s2'), 0, '{"comparable": false, "notes": "Excludes rebar"}')).version, 1, 'level: first write (version 0 = no row yet) makes the row at version 1');
select results_eq($$ select state, notes, leveling_version from public.bid_leveling_board('c0000000-0000-0000-0000-000000000051') where submission_id = pg_temp.id('s2') $$,
  $$ values ('not_comparable'::text, 'Excludes rebar'::text, 1) $$, 'level: the board shows not comparable with the note and version');
select throws_ok(format('select public.set_bid_leveling(%L, 0, %L)', pg_temp.id('s2'), '{"comparable": true}'), '40001', 'conflict',
  'level: writing as if no row existed is a conflict');
select throws_ok(format('select public.set_bid_leveling(%L, 7, %L)', pg_temp.id('s2'), '{"comparable": true}'), '40001', 'conflict',
  'level: a stale version is a conflict');
select is((public.set_bid_leveling(pg_temp.id('s2'), 1, '{"comparable": true, "reassigned_package_id": "ab000000-0000-0000-0000-000000000053"}')).version, 2,
  'level: the right version updates (version 2), moving the bid to 22A');
select results_eq($$ select package_code, state, original_package_id from public.bid_leveling_board('c0000000-0000-0000-0000-000000000051') where submission_id = pg_temp.id('s2') $$,
  $$ values ('22A'::text, 'current'::text, 'ab000000-0000-0000-0000-000000000051'::uuid) $$, 'level: the board shows the bid under 22A, comparable again, original package kept');
select results_eq(
  $$ select package_id, kind from public.bid_flags('c0000000-0000-0000-0000-000000000051') where kind in ('no_bids', 'single_bid') order by 1 $$,
  $$ values ('ab000000-0000-0000-0000-000000000051'::uuid, 'single_bid'::text), ('ab000000-0000-0000-0000-000000000053', 'single_bid'), ('ab000000-0000-0000-0000-000000000054', 'single_bid') $$,
  'level: after the move 22A has one bid and 03A is down to one; no package without bids');
select throws_ok(format('select public.set_bid_leveling(%L, 2, %L)', pg_temp.id('s2'), '{"reassigned_package_id": "ab000000-0000-0000-0000-000000000055"}'), '22023', 'package not on this job',
  'level: a package on another job is refused');
select is((public.set_bid_leveling(pg_temp.id('s2'), 2, '{"reassigned_package_id": null}')).reassigned_package_id, null::uuid, 'level: null moves it back to its own package');
select is((public.set_bid_leveling(pg_temp.id('s2'), 3, '{"reassigned_package_id": "ab000000-0000-0000-0000-000000000051"}')).reassigned_package_id, null::uuid,
  'level: its own package is stored as null');
select throws_ok(format('select public.set_bid_leveling(%L, 4, %L)', pg_temp.id('s2'), '[]'), '22023', 'patch must be an object', 'level: the patch must be an object');
select pg_temp.login('a0000000-0000-0000-0000-000000000053', 'aal2');
select throws_ok(format('select public.set_bid_leveling(%L, 4, %L)', pg_temp.id('s2'), '{"is_backup": true}'), '42501', 'forbidden', 'level: a pm cannot level');
reset role;
select is((select count(*)::int from public.audit_events where action = 'bid.level' and entity_id = pg_temp.id('s2')), 4, 'level: every successful write is audited');

select * from finish();
rollback;
