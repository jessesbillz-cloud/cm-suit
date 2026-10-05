begin;
select plan(54);
-- Migration 0076: an invited bidder reads the job's Plans and Specs (and the folders under them without their own
-- access list) and an issued addendum's files, through folder_can_read and the download gate; never another folder,
-- another job, a draft addendum's file, another bidder's bid, or anything once access has ended. Draft addenda are
-- discarded with Undo; packages (nothing sent or received) and subs are removed with Undo.
\ir _helpers.psql

select pg_temp.mk_user('a0000000-0000-0000-0000-000000000761', 'probe+bd-admin@example.test', 'BD Admin');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000762', 'probe+bd-est@example.test', 'BD Estimator');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000763', 'probe+bd-bidder-a@example.test', 'BD Bidder A');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000764', 'probe+bd-bidder-b@example.test', 'BD Bidder B');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000765', 'probe+bd-bidder-x@example.test', 'BD Bidder X');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000766', 'probe+bd-pm@example.test', 'BD PM');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000767', 'probe+bd-expired@example.test', 'BD Expired');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000768', 'probe+bd-other-admin@example.test', 'BD Other Admin');

insert into public.orgs (id, name, kind, created_by) values
  ('b0000000-0000-0000-0000-000000000761', 'BD Builders', 'gc', 'a0000000-0000-0000-0000-000000000761'),
  ('b0000000-0000-0000-0000-000000000762', 'BD Other Co', 'gc', 'a0000000-0000-0000-0000-000000000768');
-- P: sealed, bids due tomorrow. O: another company's job.
insert into public.projects (id, org_id, name, stage, bid_due_at, bid_sealed, created_by) values
  ('c0000000-0000-0000-0000-000000000761', 'b0000000-0000-0000-0000-000000000761', 'BD Job', 'bidding', now() + interval '1 day', true,
   'a0000000-0000-0000-0000-000000000761'),
  ('c0000000-0000-0000-0000-000000000762', 'b0000000-0000-0000-0000-000000000762', 'BD Other Job', 'bidding', now() + interval '1 day', false,
   'a0000000-0000-0000-0000-000000000768');

insert into public.project_members (org_id, project_id, user_id, invite_email, role, status, access_ends_at)
select p.org_id, m.project_id, m.user_id, u.email, m.role, 'active', m.ends
  from (values
    ('c0000000-0000-0000-0000-000000000761'::uuid, 'a0000000-0000-0000-0000-000000000762'::uuid, 'estimator', null::timestamptz),
    ('c0000000-0000-0000-0000-000000000761', 'a0000000-0000-0000-0000-000000000763', 'bidder', null),
    ('c0000000-0000-0000-0000-000000000761', 'a0000000-0000-0000-0000-000000000764', 'bidder', null),
    ('c0000000-0000-0000-0000-000000000761', 'a0000000-0000-0000-0000-000000000766', 'pm', null),
    ('c0000000-0000-0000-0000-000000000761', 'a0000000-0000-0000-0000-000000000767', 'bidder', now() - interval '1 minute'),
    ('c0000000-0000-0000-0000-000000000762', 'a0000000-0000-0000-0000-000000000765', 'bidder', null)) as m (project_id, user_id, role, ends)
  join auth.users u on u.id = m.user_id
  join public.projects p on p.id = m.project_id;

create temp table ids (k text primary key, v uuid not null);
grant all on ids to public;
create function pg_temp.v(p_k text) returns uuid language sql stable as $$ select v from pg_temp.ids where k = p_k $$;
grant execute on function pg_temp.v(text) to public;

insert into ids
select f.kind || case when f.project_id = 'c0000000-0000-0000-0000-000000000762' then '_o' else '' end, f.id
  from public.folders f
 where f.project_id in ('c0000000-0000-0000-0000-000000000761', 'c0000000-0000-0000-0000-000000000762')
   and f.parent_id is null and f.kind in ('plans', 'specs', 'reports', 'bids_received');

-- Under Plans: an ordinary folder (inherits the job's rules) and a closed one with its own access list.
insert into public.folders (id, org_id, project_id, parent_id, name, created_by) values
  ('d0000000-0000-0000-0000-000000000761', 'b0000000-0000-0000-0000-000000000761', 'c0000000-0000-0000-0000-000000000761',
   pg_temp.v('plans'), 'Architectural', 'a0000000-0000-0000-0000-000000000761'),
  ('d0000000-0000-0000-0000-000000000762', 'b0000000-0000-0000-0000-000000000761', 'c0000000-0000-0000-0000-000000000761',
   pg_temp.v('plans'), 'Owner only', 'a0000000-0000-0000-0000-000000000761');
insert into public.folder_access (folder_id, capability, can_read, can_write) values
  ('d0000000-0000-0000-0000-000000000762', 'files.manage', true, true);

-- Files (as postgres): one in each folder, all scanned clean.
insert into public.files (id, org_id, project_id, folder_id, storage_path, original_name, mime, scan_status, upload_complete, created_by)
select f.id, p.org_id, p.id, f.folder, 'probe/bd/' || f.id::text, f.name, 'application/pdf', 'clean', true, 'a0000000-0000-0000-0000-000000000761'
  from (values
    ('e0000000-0000-0000-0000-000000000761'::uuid, 'c0000000-0000-0000-0000-000000000761'::uuid, pg_temp.v('plans'), 'Sample A-101.pdf'),
    ('e0000000-0000-0000-0000-000000000762', 'c0000000-0000-0000-0000-000000000761', pg_temp.v('specs'), 'Sample spec book.pdf'),
    ('e0000000-0000-0000-0000-000000000763', 'c0000000-0000-0000-0000-000000000761', 'd0000000-0000-0000-0000-000000000761'::uuid, 'Sample A-201.pdf'),
    ('e0000000-0000-0000-0000-000000000764', 'c0000000-0000-0000-0000-000000000761', 'd0000000-0000-0000-0000-000000000762'::uuid, 'Sample owner budget.pdf'),
    ('e0000000-0000-0000-0000-000000000765', 'c0000000-0000-0000-0000-000000000761', pg_temp.v('reports'), 'Sample report.pdf'),
    ('e0000000-0000-0000-0000-000000000766', 'c0000000-0000-0000-0000-000000000762', pg_temp.v('plans_o'), 'Sample other plans.pdf')
  ) as f (id, project, folder, name)
  join public.projects p on p.id = f.project;

-- One package; both bidders on it.
insert into public.bid_packages (id, org_id, project_id, code, name, created_by) values
  ('ab000000-0000-0000-0000-000000000761', 'b0000000-0000-0000-0000-000000000761', 'c0000000-0000-0000-0000-000000000761', '09A', 'Drywall',
   'a0000000-0000-0000-0000-000000000762');
insert into public.member_scopes (project_member_id, scope_type, scope_id)
select pm.id, 'bid_package', 'ab000000-0000-0000-0000-000000000761' from public.project_members pm
 where pm.project_id = 'c0000000-0000-0000-0000-000000000761' and pm.role = 'bidder';
insert into public.bid_invites (org_id, project_id, package_id, member_id, created_by)
select pm.org_id, pm.project_id, 'ab000000-0000-0000-0000-000000000761', pm.id, 'a0000000-0000-0000-0000-000000000762'
  from public.project_members pm
 where pm.project_id = 'c0000000-0000-0000-0000-000000000761' and pm.role = 'bidder' and pm.access_ends_at is null;

-- Download as the logged-in person: the file's name, or the refusal's code.
create function pg_temp.dl(p_file uuid) returns text language plpgsql as $$
begin
  return (select original_name from public.authorize_download(p_file, 'original'));
exception when others then
  return 'refused:' || sqlstate;
end $$;
grant execute on function pg_temp.dl(uuid) to public;
-- Files the logged-in person can list, by name.
create function pg_temp.seen() returns text[] language sql as $$
  select coalesce(array_agg(original_name order by original_name), '{}') from public.files
   where project_id in ('c0000000-0000-0000-0000-000000000761', 'c0000000-0000-0000-0000-000000000762') $$;
grant execute on function pg_temp.seen() to public;

set local role authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- Plans and Specs for a bidder
-- ---------------------------------------------------------------------------------------------------------------
select ok(pg_temp.can_read_as('a0000000-0000-0000-0000-000000000763', pg_temp.v('plans')), 'bidder reads Plans');
select ok(pg_temp.can_read_as('a0000000-0000-0000-0000-000000000763', pg_temp.v('specs')), 'bidder reads Specs');
select ok(pg_temp.can_read_as('a0000000-0000-0000-0000-000000000763', 'd0000000-0000-0000-0000-000000000761'),
  'bidder reads a folder under Plans');
select ok(not pg_temp.can_read_as('a0000000-0000-0000-0000-000000000763', 'd0000000-0000-0000-0000-000000000762'),
  'a folder under Plans with its own access list stays closed to the bidder');
select ok(not pg_temp.can_read_as('a0000000-0000-0000-0000-000000000763', pg_temp.v('reports')), 'bidder cannot read Reports');
select ok(not pg_temp.can_read_as('a0000000-0000-0000-0000-000000000763', pg_temp.v('bids_received')), 'bidder cannot read Bids received');
select ok(not pg_temp.can_read_as('a0000000-0000-0000-0000-000000000763', pg_temp.v('plans_o')), 'bidder cannot read another job''s Plans');
select ok(not pg_temp.can_read_as('a0000000-0000-0000-0000-000000000765', pg_temp.v('plans')),
  'another job''s bidder cannot read this job''s Plans');
select ok(not pg_temp.can_write_as('a0000000-0000-0000-0000-000000000763', pg_temp.v('plans')), 'bidder cannot write in Plans');
select ok(not pg_temp.can_read_as('a0000000-0000-0000-0000-000000000767', pg_temp.v('plans')),
  'a bidder whose access ended reads nothing');

select pg_temp.login('a0000000-0000-0000-0000-000000000763');
select is(pg_temp.seen(), array['Sample A-101.pdf', 'Sample A-201.pdf', 'Sample spec book.pdf'],
  'bidder lists exactly the plans and specs');
select is(pg_temp.dl('e0000000-0000-0000-0000-000000000761'), 'Sample A-101.pdf', 'bidder downloads a plan sheet');
select is(pg_temp.dl('e0000000-0000-0000-0000-000000000762'), 'Sample spec book.pdf', 'bidder downloads the spec book');
select is(pg_temp.dl('e0000000-0000-0000-0000-000000000764'), 'refused:42501', 'bidder cannot download from the closed folder');
select is(pg_temp.dl('e0000000-0000-0000-0000-000000000765'), 'refused:42501', 'bidder cannot download a report');
select is(pg_temp.dl('e0000000-0000-0000-0000-000000000766'), 'refused:42501', 'bidder cannot download another job''s plans');
select is_empty($$ select id from public.folders where id = pg_temp.v('reports') $$, 'bidder does not see the Reports folder');

select pg_temp.login('a0000000-0000-0000-0000-000000000766');
select ok('Sample report.pdf' = any (pg_temp.seen()), 'pm still reads the job''s files as before');

-- ---------------------------------------------------------------------------------------------------------------
-- Sealed bids stay sealed: bidder A never sees bidder B's bid
-- ---------------------------------------------------------------------------------------------------------------
select pg_temp.login('a0000000-0000-0000-0000-000000000764');
insert into ids select 'bidB', id from public.register_file(pg_temp.v('bids_received'), 'Sample bid B.pdf', 'application/pdf', 10);
select lives_ok($$ select public.submit_bid('ab000000-0000-0000-0000-000000000761', pg_temp.v('bidB')) $$, 'bidder B submits a bid');
select pg_temp.login('a0000000-0000-0000-0000-000000000763');
select is_empty($$ select id from public.files where id = pg_temp.v('bidB') $$, 'bidder A cannot see bidder B''s bid file');
select is(pg_temp.dl(pg_temp.v('bidB')), 'refused:42501', 'bidder A cannot download bidder B''s bid');
select is_empty($$ select id from public.bid_submissions $$, 'bidder A sees no submission of bidder B');
select pg_temp.login('a0000000-0000-0000-0000-000000000762');
select is_empty($$ select id from public.files where id = pg_temp.v('bidB') $$, 'estimator cannot see a bid while sealed');

-- ---------------------------------------------------------------------------------------------------------------
-- Addendum files: the job's Addenda folder (bids.manage); a bidder reads a file once an issued addendum carries it
-- ---------------------------------------------------------------------------------------------------------------
select pg_temp.login('a0000000-0000-0000-0000-000000000762');
insert into ids select 'addenda', public.open_addenda_folder('c0000000-0000-0000-0000-000000000761');
select is(public.open_addenda_folder('c0000000-0000-0000-0000-000000000761'), pg_temp.v('addenda'), 'open_addenda_folder: the same folder again');
select is((select name from public.folders where id = pg_temp.v('addenda')), 'Addenda', 'the folder is named Addenda');
insert into ids select 'fDraft', id from public.register_file(pg_temp.v('addenda'), 'Sample draft sketch.pdf', 'application/pdf', 10);
insert into ids select 'fIssued', id from public.register_file(pg_temp.v('addenda'), 'Sample SK-1.pdf', 'application/pdf', 10);
insert into ids select 'aDraft', id from public.create_addendum('c0000000-0000-0000-0000-000000000761', 'Draft', '', array[pg_temp.v('fDraft')]);
insert into ids select 'aIssued', id from public.create_addendum('c0000000-0000-0000-0000-000000000761', 'Issued', '', array[pg_temp.v('fIssued')]);
select lives_ok($$ select public.issue_addendum(pg_temp.v('aIssued'), 'sha256:probe') $$, 'estimator issues one addendum');
reset role;
update public.files set scan_status = 'clean', upload_complete = true where id in (pg_temp.v('fDraft'), pg_temp.v('fIssued'));
set local role authenticated;

select pg_temp.login('a0000000-0000-0000-0000-000000000766');
select throws_ok($$ select public.open_addenda_folder('c0000000-0000-0000-0000-000000000761') $$, '42501', 'forbidden', 'a pm cannot open the Addenda folder');
select ok(not pg_temp.can_read_as('a0000000-0000-0000-0000-000000000766', pg_temp.v('addenda')), 'pm cannot read the Addenda folder');
select ok(not pg_temp.can_read_as('a0000000-0000-0000-0000-000000000763', pg_temp.v('addenda')), 'bidder cannot browse the Addenda folder');

select pg_temp.login('a0000000-0000-0000-0000-000000000763');
select is(pg_temp.dl(pg_temp.v('fIssued')), 'Sample SK-1.pdf', 'bidder downloads an issued addendum''s file');
select ok('Sample SK-1.pdf' = any (pg_temp.seen()), 'bidder sees an issued addendum''s file');
select is(pg_temp.dl(pg_temp.v('fDraft')), 'refused:42501', 'bidder cannot download a draft addendum''s file');
select ok(not ('Sample draft sketch.pdf' = any (pg_temp.seen())), 'bidder does not see a draft addendum''s file');
select pg_temp.login('a0000000-0000-0000-0000-000000000765');
select is(pg_temp.dl(pg_temp.v('fIssued')), 'refused:42501', 'another job''s bidder cannot download the addendum''s file');
select pg_temp.login('a0000000-0000-0000-0000-000000000767');
select is(pg_temp.dl(pg_temp.v('fIssued')), 'refused:42501', 'a bidder whose access ended cannot download it');
select pg_temp.login('a0000000-0000-0000-0000-000000000766');
select is(pg_temp.dl(pg_temp.v('fIssued')), 'refused:42501', 'a pm (no bids.manage) cannot download it either');

-- A file outside the Addenda folder never opens through an addendum (a report attached to an issued one).
select pg_temp.login('a0000000-0000-0000-0000-000000000762');
insert into ids select 'aReport', id from public.create_addendum('c0000000-0000-0000-0000-000000000761', 'Report', '', '{}');
select is((public.add_addendum_file(pg_temp.v('aReport'), 'e0000000-0000-0000-0000-000000000765')).file_ids,
  array['e0000000-0000-0000-0000-000000000765'::uuid], 'add_addendum_file: estimator attaches a report to a draft');
select is(cardinality((public.add_addendum_file(pg_temp.v('aReport'), 'e0000000-0000-0000-0000-000000000765')).file_ids), 1,
  'add_addendum_file: attaching it again changes nothing');
select lives_ok($$ select public.issue_addendum(pg_temp.v('aReport'), 'sha256:probe2') $$, 'and issues it');
select throws_ok($$ select public.add_addendum_file(pg_temp.v('aReport'), pg_temp.v('fDraft')) $$, '42501', 'An issued addendum stays.',
  'add_addendum_file: an issued addendum takes no more files');
select pg_temp.login('a0000000-0000-0000-0000-000000000763');
select is(pg_temp.dl('e0000000-0000-0000-0000-000000000765'), 'refused:42501',
  'bidder still cannot download a report, even on an issued addendum');

-- ---------------------------------------------------------------------------------------------------------------
-- Discard a draft addendum, Undo
-- ---------------------------------------------------------------------------------------------------------------
select pg_temp.login('a0000000-0000-0000-0000-000000000762');
select throws_ok($$ select public.set_addendum_discarded(pg_temp.v('aIssued'), 2, true) $$, '42501', 'An issued addendum stays.',
  'an issued addendum cannot be discarded');
select throws_ok($$ select public.set_addendum_discarded(pg_temp.v('aDraft'), 99, true) $$, '40001', 'version_conflict',
  'discard carries a version check');
select is(public.set_addendum_discarded(pg_temp.v('aDraft'), 1, true), 2, 'estimator discards the draft');
select is_empty($$ select id from public.addenda where id = pg_temp.v('aDraft') $$, 'a discarded draft leaves the list');
select is(public.set_addendum_discarded(pg_temp.v('aDraft'), 2, false), 3, 'Undo brings the draft back');
select pg_temp.login('a0000000-0000-0000-0000-000000000763');
select throws_ok($$ select public.set_addendum_discarded(pg_temp.v('aDraft'), 3, true) $$, '42501', 'forbidden', 'a bidder cannot discard');

-- ---------------------------------------------------------------------------------------------------------------
-- Remove a package or a sub, Undo
-- ---------------------------------------------------------------------------------------------------------------
select pg_temp.login('a0000000-0000-0000-0000-000000000762');
select throws_ok($$ select public.set_bid_package_removed('ab000000-0000-0000-0000-000000000761', 1, true) $$, '22023',
  'This package has invites or bids.', 'a package with invites or bids stays');
insert into public.bid_packages (id, org_id, project_id, code, name, created_by) values
  ('ab000000-0000-0000-0000-000000000762', 'b0000000-0000-0000-0000-000000000761', 'c0000000-0000-0000-0000-000000000761', '03A', 'Concrete',
   'a0000000-0000-0000-0000-000000000762');
select is(public.set_bid_package_removed('ab000000-0000-0000-0000-000000000762', 1, true), 2, 'an unused package is removed');
select lives_ok($$ insert into public.bid_packages (org_id, project_id, code, name, created_by) values ('b0000000-0000-0000-0000-000000000761',
  'c0000000-0000-0000-0000-000000000761', '03A', 'Concrete again', 'a0000000-0000-0000-0000-000000000762') $$,
  'a removed package''s code is free again');
select throws_ok($$ select public.set_bid_package_removed('ab000000-0000-0000-0000-000000000762', 2, false) $$, '23505', null,
  'Undo after the code was taken is refused');

with s as (insert into public.subs (org_id, company, created_by)
  values ('b0000000-0000-0000-0000-000000000761', 'Sample Probe Drywall', 'a0000000-0000-0000-0000-000000000762') returning id)
insert into ids select 'sub', id from s;
select is(public.set_sub_removed(pg_temp.v('sub'), 1, true), 2, 'estimator removes a sub');
select is_empty($$ select id from public.subs where id = pg_temp.v('sub') $$, 'a removed sub leaves the directory');
select pg_temp.login('a0000000-0000-0000-0000-000000000763');
select throws_ok($$ select public.set_sub_removed(pg_temp.v('sub'), 2, false) $$, '42501', 'forbidden',
  'a bidder cannot bring a sub back');

select * from finish();
rollback;
