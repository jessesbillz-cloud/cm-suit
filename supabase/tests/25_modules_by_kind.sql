begin;
select plan(2);
-- Migration 0031: an inspector company's new job starts without Bids; a GC's keeps it.
\ir _helpers.psql

select pg_temp.mk_user('a0000000-0000-0000-0000-000000000251', 'probe+mk@example.test', 'MK');
insert into public.orgs (id, name, kind, created_by) values
  ('b0000000-0000-0000-0000-000000000251', 'MK Inspections', 'inspector', 'a0000000-0000-0000-0000-000000000251'),
  ('b0000000-0000-0000-0000-000000000252', 'MK Builders', 'gc', 'a0000000-0000-0000-0000-000000000251');
insert into public.projects (id, org_id, name, stage, created_by) values
  ('c0000000-0000-0000-0000-000000000251', 'b0000000-0000-0000-0000-000000000251', 'MK Job', 'construction', 'a0000000-0000-0000-0000-000000000251'),
  ('c0000000-0000-0000-0000-000000000252', 'b0000000-0000-0000-0000-000000000252', 'MK Bid', 'bidding', 'a0000000-0000-0000-0000-000000000251');
select ok(not ('bids' = any (select unnest(modules) from public.projects where id = 'c0000000-0000-0000-0000-000000000251')),
  'inspector company: a new job has no Bids tool');
select ok('bids' = any (select unnest(modules) from public.projects where id = 'c0000000-0000-0000-0000-000000000252'),
  'GC: a new job keeps Bids');

select * from finish();
rollback;
