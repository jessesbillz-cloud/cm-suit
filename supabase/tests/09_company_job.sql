begin;
select plan(28);
-- SPEC §5.1: a person starts a company and a job from the app. create_org / create_project run with the caller's
-- rights (RLS is the gate), make the caller owner / project_admin, and a repeat returns the first row. People edit
-- only a job's and a company's own fields. Sealed bids: the seal and bid time are locked once a bid is in.
\ir _helpers.psql

select pg_temp.mk_user('a0000000-0000-0000-0000-000000000021', 'probe+founder@example.test', 'Founder');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000022', 'probe+outsider@example.test', 'Outsider');
update public.profiles set timezone = 'America/New_York' where user_id = 'a0000000-0000-0000-0000-000000000021';

create temp table ids (k text primary key, v uuid not null);
grant all on ids to public;
create function pg_temp.id(p_k text) returns uuid language sql stable as $$ select v from pg_temp.ids where k = p_k $$;
grant execute on function pg_temp.id(text) to public;

set local role authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- create_org
-- ---------------------------------------------------------------------------------------------------------------
select pg_temp.login_service();
select throws_ok($$ select public.create_org('Nobody Co', 'gc') $$, '42501', null, 'create_org: refused without a signed-in person');

select pg_temp.login('a0000000-0000-0000-0000-000000000021');
insert into ids values ('org', public.create_org('  Founder Builders ', 'gc'));
select isnt(pg_temp.id('org'), null, 'create_org: returns the new company id');
select is(public.create_org('founder builders', 'gc'), pg_temp.id('org'), 'create_org: a repeat returns the same company');
select results_eq($$ select name, kind, org_role from public.my_orgs() $$,
  $$ values ('Founder Builders'::text, 'gc'::text, 'owner'::text) $$, 'create_org: the creator is the owner (my_orgs), name trimmed');
select throws_ok($$ select public.create_org('Odd Co', 'wizard') $$, '23514', null, 'create_org: an unknown kind is refused');

-- ---------------------------------------------------------------------------------------------------------------
-- create_project
-- ---------------------------------------------------------------------------------------------------------------
insert into ids values ('job', public.create_project(pg_temp.id('org'), 'Job One', 'bidding', 'J-1', '1 Sample St',
  now() + interval '7 days', true, 'Sample type'));
select isnt(pg_temp.id('job'), null, 'create_project: returns the new job id');
select is(public.create_project(pg_temp.id('org'), 'job one', 'bidding', p_number => ' J-1 '), pg_temp.id('job'),
  'create_project: a repeat (same name and number) returns the same job');
select isnt(public.create_project(pg_temp.id('org'), 'Job One', 'bidding', p_number => 'J-2'), pg_temp.id('job'),
  'create_project: a different number is a different job');
select results_eq($$ select name, number, role, stage from public.my_projects() where project_id = pg_temp.id('job') $$,
  $$ values ('Job One'::text, 'J-1'::text, 'project_admin'::text, 'bidding'::text) $$, 'create_project: the creator is project_admin');
select results_eq($$ select timezone, modules, prevailing_wage, job_type, address from public.projects where id = pg_temp.id('job') $$,
  $$ values ('America/New_York'::text, '{bids,files,calendar}'::text[], true, 'Sample type'::text, '1 Sample St'::text) $$,
  'create_project: time zone from the creator, every module on, fields stored');
select ok(exists (select 1 from public.folders where project_id = pg_temp.id('job')), 'create_project: default folders exist');
select throws_ok($$ select public.create_project(pg_temp.id('org'), 'Bad Stage', 'dreaming') $$,
  '23514', null, 'create_project: an unknown stage is refused');

-- Someone outside the company.
select pg_temp.login('a0000000-0000-0000-0000-000000000022');
select throws_ok($$ select public.create_project(pg_temp.id('org'), 'Sneaky Job', 'bidding') $$,
  '42501', null, 'create_project: refused in a company I do not belong to');
select is_empty($$ select org_id from public.my_orgs() $$, 'my_orgs: an outsider has no companies');
select is_empty($$ select id from public.orgs where id = pg_temp.id('org') $$, 'orgs: an outsider cannot read the company');

-- ---------------------------------------------------------------------------------------------------------------
-- Editing: own fields only
-- ---------------------------------------------------------------------------------------------------------------
select pg_temp.login('a0000000-0000-0000-0000-000000000021');
select lives_ok($$ update public.projects set name = 'Job One Renamed', stage = 'construction', modules = '{files}'
                   where id = pg_temp.id('job') $$, 'projects: the project_admin edits name, stage and modules');
select throws_ok($$ update public.projects set org_id = gen_random_uuid() where id = pg_temp.id('job') $$,
  '42501', null, 'projects: org_id cannot be changed by a person');
select throws_ok($$ update public.projects set inbound_address = 'x@example.test' where id = pg_temp.id('job') $$,
  '42501', null, 'projects: inbound_address cannot be set by a person');
select throws_ok($$ update public.projects set created_by = 'a0000000-0000-0000-0000-000000000022' where id = pg_temp.id('job') $$,
  '42501', null, 'projects: created_by cannot be changed');
select throws_ok($$ insert into public.projects (org_id, name, stage, created_by, inbound_address)
                   values (pg_temp.id('org'), 'Direct', 'bidding', auth.uid(), 'y@example.test') $$,
  '42501', null, 'projects: a person cannot insert an inbound_address');
select lives_ok($$ update public.orgs set name = 'Founder Builders Inc', kind = 'sub' where id = pg_temp.id('org') $$,
  'orgs: the owner edits name and kind');
select throws_ok($$ update public.orgs set intake_address = 'z@example.test' where id = pg_temp.id('org') $$,
  '42501', null, 'orgs: intake_address cannot be set by a person');

select pg_temp.login('a0000000-0000-0000-0000-000000000022');
update public.projects set name = 'Hijacked' where id = pg_temp.id('job');
update public.orgs set name = 'Hijacked' where id = pg_temp.id('org');
reset role;
select results_eq($$ select p.name, o.name from public.projects p join public.orgs o on o.id = p.org_id where p.id = pg_temp.id('job') $$,
  $$ values ('Job One Renamed'::text, 'Founder Builders Inc'::text) $$, 'an outsider''s updates change nothing');

-- ---------------------------------------------------------------------------------------------------------------
-- Sealed bids: once a bid is in, the seal stays and bid time cannot move earlier (people only).
-- ---------------------------------------------------------------------------------------------------------------
insert into public.projects (id, org_id, name, stage, bid_due_at, bid_sealed, created_by) values
  ('c0000000-0000-0000-0000-000000000021', pg_temp.id('org'), 'Sealed Job', 'bidding', now() + interval '1 day', true, 'a0000000-0000-0000-0000-000000000021'),
  ('c0000000-0000-0000-0000-000000000022', pg_temp.id('org'), 'Sealed Empty', 'bidding', now() + interval '1 day', true, 'a0000000-0000-0000-0000-000000000021');
insert into public.bid_packages (id, org_id, project_id, code, name, created_by) values
  ('ab000000-0000-0000-0000-000000000021', pg_temp.id('org'), 'c0000000-0000-0000-0000-000000000021', '23A', 'HVAC', 'a0000000-0000-0000-0000-000000000021');
with m as (
  insert into public.project_members (org_id, project_id, user_id, invite_email, role, status, created_by)
  values (pg_temp.id('org'), 'c0000000-0000-0000-0000-000000000021', 'a0000000-0000-0000-0000-000000000022',
          'probe+outsider@example.test', 'bidder', 'active', 'a0000000-0000-0000-0000-000000000021')
  returning id
) insert into ids select 'bidder', id from m;
with f as (
  insert into public.files (org_id, project_id, folder_id, storage_path, original_name, created_by)
  select pg_temp.id('org'), 'c0000000-0000-0000-0000-000000000021', fo.id, 'probe/sealed/bid.pdf', 'bid.pdf', 'a0000000-0000-0000-0000-000000000022'
  from public.folders fo where fo.project_id = 'c0000000-0000-0000-0000-000000000021' and fo.kind = 'bids_received'
  returning id
) insert into ids select 'bidfile', id from f;
insert into public.bid_submissions (org_id, project_id, package_id, member_id, file_id, receipt_number, created_by)
values (pg_temp.id('org'), 'c0000000-0000-0000-0000-000000000021', 'ab000000-0000-0000-0000-000000000021', pg_temp.id('bidder'),
        pg_temp.id('bidfile'), 1, 'a0000000-0000-0000-0000-000000000022');
set local role authenticated;

select pg_temp.login('a0000000-0000-0000-0000-000000000021');
select throws_ok($$ update public.projects set bid_sealed = false where id = 'c0000000-0000-0000-0000-000000000021' $$,
  '42501', null, 'sealed: the seal cannot be lifted once a bid is in');
select throws_ok($$ update public.projects set bid_due_at = now() - interval '1 minute' where id = 'c0000000-0000-0000-0000-000000000021' $$,
  '42501', null, 'sealed: bid time cannot move earlier once a bid is in');
select lives_ok($$ update public.projects set bid_due_at = now() + interval '2 days' where id = 'c0000000-0000-0000-0000-000000000021' $$,
  'sealed: bid time can move later');
select lives_ok($$ update public.projects set bid_sealed = false where id = 'c0000000-0000-0000-0000-000000000022' $$,
  'sealed: with no bids in, the seal can be turned off');
select lives_ok($$ update public.projects set name = 'Sealed Job Renamed' where id = 'c0000000-0000-0000-0000-000000000021' $$,
  'sealed: other fields stay editable');

select * from finish();
rollback;
