begin;
select plan(6);
-- Migration 0037: the testing switch that lets a finished upload through without a virus scan. OFF by default: a
-- finished upload stays pending until a scan. ON: it is usable at once and marked as never scanned.
\ir _helpers.psql

select pg_temp.mk_user('a0000000-0000-0000-0000-000000000311', 'probe+ss-pm@example.test', 'SS PM');
insert into public.orgs (id, name, kind, created_by)
values ('b0000000-0000-0000-0000-000000000311', 'SS Builders', 'gc', 'a0000000-0000-0000-0000-000000000311');
insert into public.projects (id, org_id, name, stage, created_by)
values ('c0000000-0000-0000-0000-000000000311', 'b0000000-0000-0000-0000-000000000311', 'SS Job', 'construction',
        'a0000000-0000-0000-0000-000000000311');
create temp table ids (k text primary key, id uuid);
grant all on ids to authenticated;
insert into ids select 'plans', id from public.folders
 where project_id = 'c0000000-0000-0000-0000-000000000311' and kind = 'plans';

select is(
  (select enabled from public.security_switches where key = 'testing_skip_virus_scan'), false,
  'the scan switch is off by default');

set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000311');
insert into ids select 'f1', id from public.register_file((select id from ids where k = 'plans'), 'one.pdf', 'application/pdf', 100);
update public.files set upload_complete = true where id = (select id from ids where k = 'f1');
select results_eq(
  $$ select scan_status, scan_skipped_at is null from public.files where id = (select id from ids where k = 'f1') $$,
  $$ values ('pending'::text, true) $$,
  'switch off: a finished upload waits for the scan');
select throws_ok($$ select public.tg_files_skip_scan() $$, '42501', null, 'the trigger function is not callable by people');

reset role;
update public.security_switches set enabled = true where key = 'testing_skip_virus_scan';
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000311');
insert into ids select 'f2', id from public.register_file((select id from ids where k = 'plans'), 'two.pdf', 'application/pdf', 100);
select is((select scan_status from public.files where id = (select id from ids where k = 'f2')), 'pending',
  'switch on: still pending while uploading');
update public.files set upload_complete = true where id = (select id from ids where k = 'f2');
select results_eq(
  $$ select scan_status, scan_skipped_at is not null from public.files where id = (select id from ids where k = 'f2') $$,
  $$ values ('clean'::text, true) $$,
  'switch on: a finished upload is usable at once and marked as never scanned');
select is((select scan_status from public.files where id = (select id from ids where k = 'f1')), 'pending',
  'switch on: an upload finished earlier is not touched');

select * from finish();
rollback;
