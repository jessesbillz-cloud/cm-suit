begin;
select plan(9);
-- Bids the office receives (migration 0017): recorded by bids.manage from its own upload in "Bids received", one
-- submission per file, no bidder member, walled off from bidders, linked to a directory sub later.
\ir _helpers.psql

select pg_temp.mk_user('a0000000-0000-0000-0000-000000000041', 'probe+office-admin@example.test', 'Office Admin');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000042', 'probe+office-pm@example.test', 'Office PM');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000043', 'probe+office-bidder@example.test', 'Office Bidder');
insert into public.orgs (id, name, kind, created_by) values
  ('b0000000-0000-0000-0000-000000000041', 'Office Org', 'gc', 'a0000000-0000-0000-0000-000000000041');
insert into public.projects (id, org_id, name, stage, created_by) values
  ('c0000000-0000-0000-0000-000000000041', 'b0000000-0000-0000-0000-000000000041', 'Office Job', 'bidding', 'a0000000-0000-0000-0000-000000000041');
insert into public.project_members (org_id, project_id, user_id, invite_email, role, status, created_by) values
  ('b0000000-0000-0000-0000-000000000041', 'c0000000-0000-0000-0000-000000000041', 'a0000000-0000-0000-0000-000000000042', 'probe+office-pm@example.test', 'pm', 'active', 'a0000000-0000-0000-0000-000000000041'),
  ('b0000000-0000-0000-0000-000000000041', 'c0000000-0000-0000-0000-000000000041', 'a0000000-0000-0000-0000-000000000043', 'probe+office-bidder@example.test', 'bidder', 'active', 'a0000000-0000-0000-0000-000000000041');
insert into public.bid_packages (id, org_id, project_id, code, name, created_by) values
  ('ab000000-0000-0000-0000-000000000041', 'b0000000-0000-0000-0000-000000000041', 'c0000000-0000-0000-0000-000000000041', '09A', 'Drywall', 'a0000000-0000-0000-0000-000000000041');
insert into public.subs (id, org_id, company, created_by) values
  ('5b000000-0000-0000-0000-000000000041', 'b0000000-0000-0000-0000-000000000041', 'Sample Drywall Co', 'a0000000-0000-0000-0000-000000000041');

create temp table ids (k text primary key, v uuid not null);
grant all on ids to public;
create function pg_temp.id(p_k text) returns uuid language sql stable as $$ select v from pg_temp.ids where k = p_k $$;
grant execute on function pg_temp.id(text) to public;
insert into ids select 'bids', id from public.folders where project_id = 'c0000000-0000-0000-0000-000000000041' and kind = 'bids_received';
insert into ids select 'general', id from public.folders where project_id = 'c0000000-0000-0000-0000-000000000041' and kind = 'plans' limit 1;

set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000041', 'aal2');
insert into ids select 'f1', (public.register_file(pg_temp.id('bids'), 'Sample drywall bid.pdf', 'application/pdf', 1000)).id;
insert into ids select 'f2', (public.register_file(pg_temp.id('general'), 'Not a bid.pdf', 'application/pdf', 1000)).id;

insert into ids select 's1', submission_id from public.record_received_bid(pg_temp.id('f1'), 'ab000000-0000-0000-0000-000000000041');
select isnt(pg_temp.id('s1'), null, 'office: the job admin records a received bid');
select is((select submission_id from public.record_received_bid(pg_temp.id('f1'), 'ab000000-0000-0000-0000-000000000041')), pg_temp.id('s1'),
  'office: recording the same file again returns the same submission');
select results_eq($$ select member_id is null, received_by, receipt_number from public.bid_submissions where id = pg_temp.id('s1') $$,
  $$ values (true, 'a0000000-0000-0000-0000-000000000041'::uuid, 1) $$, 'office: no bidder member, recorded by the admin, receipt 1');
select throws_ok($$ select * from public.record_received_bid(pg_temp.id('f2'), 'ab000000-0000-0000-0000-000000000041') $$,
  '22023', null, 'office: a file outside Bids received is refused');
select lives_ok($$ select public.set_submission_sub(pg_temp.id('s1'), '5b000000-0000-0000-0000-000000000041') $$,
  'office: the admin links the bid to a directory sub');
select is((select sub_id from public.bid_submissions where id = pg_temp.id('s1')), '5b000000-0000-0000-0000-000000000041'::uuid,
  'office: the sub is linked');

select pg_temp.login('a0000000-0000-0000-0000-000000000042', 'aal2');
select throws_ok($$ select * from public.record_received_bid(pg_temp.id('f1'), 'ab000000-0000-0000-0000-000000000041') $$,
  '42501', null, 'office: a pm (no bids.manage) cannot record bids');
select throws_ok($$ select public.set_submission_sub(pg_temp.id('s1'), null) $$, '42501', null, 'office: a pm cannot relink a bid');

select pg_temp.login('a0000000-0000-0000-0000-000000000043');
select is_empty($$ select id from public.bid_submissions where id = pg_temp.id('s1') $$, 'office: a bidder never sees an office-recorded bid');

select * from finish();
rollback;
