begin;
select plan(25);
-- Migration 0079 (the Oct 4 dailies audit): a removed photo's file leaves the author's Photos folder, and only the
-- author's own upload there, only when no other report shows it; the job's team prefills a new setup's recipients
-- (members whose role reads dailies, never me, never a bidder, only what members.view shows); today's report answers
-- its version on All my jobs; a draft invoice can be deleted with Undo (sent ones can't, nobody else can, a deleted one
-- can't be read or changed, asking for the month again brings it back with its number).
\ir _helpers.psql

select pg_temp.mk_user('a0000000-0000-0000-0000-000000000621', 'probe+da-insp@example.test', 'Sample Audit Inspector');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000622', 'probe+da-pm@example.test', 'Sample Audit PM');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000623', 'probe+da-sub@example.test', 'Sample Audit Sub');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000624', 'probe+da-bidder@example.test', 'Sample Audit Bidder');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000625', 'probe+da-owner@example.test', 'Sample Audit Owner Rep');

insert into public.orgs (id, name, kind, created_by)
values ('b0000000-0000-0000-0000-000000000621', 'Sample Audit Builders', 'gc', 'a0000000-0000-0000-0000-000000000622');
insert into public.projects (id, org_id, name, number, timezone, stage, modules, created_by)
values ('c0000000-0000-0000-0000-000000000621', 'b0000000-0000-0000-0000-000000000621', 'Sample Audit Job', 'S-621',
        'America/Los_Angeles', 'construction', '{files,dailies,hours}', 'a0000000-0000-0000-0000-000000000622');
insert into public.project_members (org_id, project_id, user_id, invite_email, role, status)
select 'b0000000-0000-0000-0000-000000000621', 'c0000000-0000-0000-0000-000000000621', u::uuid, e, r, 'active'
  from (values ('a0000000-0000-0000-0000-000000000621', 'probe+da-insp@example.test', 'inspector'),
               ('a0000000-0000-0000-0000-000000000622', 'probe+da-pm@example.test', 'pm'),
               ('a0000000-0000-0000-0000-000000000623', 'probe+da-sub@example.test', 'sub'),
               ('a0000000-0000-0000-0000-000000000624', 'probe+da-bidder@example.test', 'bidder'),
               ('a0000000-0000-0000-0000-000000000625', 'probe+da-owner@example.test', 'owner_rep')) v(u, e, r)
on conflict do nothing;
-- Someone invited who hasn't signed in yet: not a recipient until they have.
insert into public.project_members (org_id, project_id, invite_email, role, status)
values ('b0000000-0000-0000-0000-000000000621', 'c0000000-0000-0000-0000-000000000621', 'probe+da-invited@example.test', 'pm', 'invited');

create temp table t (k text primary key, v uuid);
grant all on t to public;
create function pg_temp.v(p_k text) returns uuid language sql stable as $$ select v from t where k = p_k $$;
create function pg_temp.photo_ver(p_id uuid) returns int language sql stable as $$
  select version from public.daily_report_photos where id = p_id $$;
create function pg_temp.file_gone(p_id uuid) returns boolean language sql stable security definer as $$
  select deleted_at is not null from public.files where id = p_id $$;
create function pg_temp.inv_ver(p_id uuid) returns int language sql stable security definer as $$
  select version from public.invoices where id = p_id $$;
grant execute on function pg_temp.v(text), pg_temp.photo_ver(uuid), pg_temp.file_gone(uuid), pg_temp.inv_ver(uuid) to public;

-- ---------------------------------------------------------------------------------------------------------------
-- 2. The team for a new setup's recipients
-- ---------------------------------------------------------------------------------------------------------------
select ok(not (select prosecdef from pg_proc where oid = 'public.daily_team_emails(uuid)'::regprocedure),
  'team: runs as the caller (SECURITY INVOKER)');
select ok(not has_function_privilege('anon', 'public.daily_team_emails(uuid)', 'EXECUTE'), 'team: anon cannot call it');
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000621');
select is(public.daily_team_emails('c0000000-0000-0000-0000-000000000621'),
  array['probe+da-owner@example.test', 'probe+da-pm@example.test']::text[],
  'team: the members who read the job''s dailies; not me, not a sub, not a bidder, not someone not signed in yet');
select pg_temp.login('a0000000-0000-0000-0000-000000000623');
select is(public.daily_team_emails('c0000000-0000-0000-0000-000000000621'), '{}'::text[],
  'team: someone who doesn''t write dailies gets nobody');

-- ---------------------------------------------------------------------------------------------------------------
-- 1. A removed photo's file
-- ---------------------------------------------------------------------------------------------------------------
select pg_temp.login('a0000000-0000-0000-0000-000000000621');
insert into t values ('today', public.ensure_todays_draft('c0000000-0000-0000-0000-000000000621', 'daily',
  '{"schedule_days": [0,1,2,3,4,5,6]}'));
insert into t values ('past', public.create_daily_report('c0000000-0000-0000-0000-000000000621', 'daily', '2026-09-01'));
insert into t values ('photos', public.daily_photo_folder('c0000000-0000-0000-0000-000000000621'));
insert into t select 'f1', (public.register_file(pg_temp.v('photos'), 'Sample one.jpg', 'image/jpeg', 100)).id;
insert into t select 'f2', (public.register_file(pg_temp.v('photos'), 'Sample two.jpg', 'image/jpeg', 100)).id;
insert into t select 'p1', (public.add_daily_photo(pg_temp.v('today'), pg_temp.v('f1'), '', '', now())).id;
insert into t select 'p2', (public.add_daily_photo(pg_temp.v('today'), pg_temp.v('f2'), '', '', now())).id;
-- The second photo is on an earlier report too.
insert into t select 'p2b', (public.add_daily_photo(pg_temp.v('past'), pg_temp.v('f2'), '', '', now())).id;

select lives_ok($$ select public.remove_daily_photo(pg_temp.v('p1'), pg_temp.photo_ver(pg_temp.v('p1'))) $$,
  'photo: the author removes a photo');
select ok(pg_temp.file_gone(pg_temp.v('f1')), 'photo: its file leaves Photos/<author> too');
select is_empty($$ select id from public.files where id = pg_temp.v('f1') $$, 'photo: and is no longer listed');
select lives_ok($$ select public.remove_daily_photo(pg_temp.v('p2'), pg_temp.photo_ver(pg_temp.v('p2'))) $$,
  'photo: a photo another report still shows is removed from this one');
select ok(not pg_temp.file_gone(pg_temp.v('f2')), 'photo: its file stays while another report shows it');
select lives_ok($$ select public.remove_daily_photo(pg_temp.v('p2b'), pg_temp.photo_ver(pg_temp.v('p2b'))) $$,
  'photo: removed from the last report that showed it');
select ok(pg_temp.file_gone(pg_temp.v('f2')), 'photo: then its file goes');
select throws_ok($$ select public.remove_daily_photo(pg_temp.v('p1'), 99) $$, 'P0002', null, 'photo: removing twice is not found');

-- A file someone else uploaded stays, even when linked by the author (the server only links my own; simulated).
reset role;
insert into public.files (id, org_id, project_id, folder_id, storage_path, original_name, mime, size, scan_status,
                          text_status, upload_complete, created_by)
values ('e0000000-0000-0000-0000-000000000621', 'b0000000-0000-0000-0000-000000000621', 'c0000000-0000-0000-0000-000000000621',
        pg_temp.v('photos'), 'probe/da/621.jpg', 'Sample other.jpg', 'image/jpeg', 10, 'clean', 'none', true,
        'a0000000-0000-0000-0000-000000000622');
insert into public.daily_report_photos (org_id, project_id, report_id, file_id, created_by)
values ('b0000000-0000-0000-0000-000000000621', 'c0000000-0000-0000-0000-000000000621', pg_temp.v('today'),
        'e0000000-0000-0000-0000-000000000621', 'a0000000-0000-0000-0000-000000000621');
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000621');
select lives_ok($$ select public.remove_daily_photo(p.id, p.version) from public.daily_report_photos p
                    where p.file_id = 'e0000000-0000-0000-0000-000000000621' $$,
  'photo: a photo whose file someone else uploaded is removed from the report');
select ok(not pg_temp.file_gone('e0000000-0000-0000-0000-000000000621'), 'photo: but that file is not mine to remove');

-- ---------------------------------------------------------------------------------------------------------------
-- 3. Today's report with its version
-- ---------------------------------------------------------------------------------------------------------------
select is((select report_version from public.my_daily_today() where project_id = 'c0000000-0000-0000-0000-000000000621'),
  (select version from public.daily_reports where id = pg_temp.v('today')), 'today: the report''s version comes with it');
select ok(not has_function_privilege('authenticated', 'public.my_daily_today_retired_0079()', 'EXECUTE'),
  'today: the old function is retired');

-- ---------------------------------------------------------------------------------------------------------------
-- 4. Deleting a draft invoice
-- ---------------------------------------------------------------------------------------------------------------
reset role;
insert into public.files (id, org_id, project_id, folder_id, storage_path, original_name, mime, size, scan_status,
                          text_status, upload_complete, created_by)
values ('e0000000-0000-0000-0000-000000000622', 'b0000000-0000-0000-0000-000000000621', 'c0000000-0000-0000-0000-000000000621',
        pg_temp.v('photos'), 'probe/da/622.pdf', 'Sample report.pdf', 'application/pdf', 10, 'clean', 'none', true,
        'a0000000-0000-0000-0000-000000000621');
update public.daily_reports
   set status = 'submitted', number = 1, pdf_file_id = 'e0000000-0000-0000-0000-000000000622', filename = 'Sample 1.pdf',
       signed_at = now(), signed_by = author_id, content_hash = repeat('a', 64), signed_version = version + 1, submitted_at = now(),
       hours = 8
 where id = pg_temp.v('past');
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000621');
select public.save_billing_profile('Sample Audit Services', '', 'Sample Audit Builders', 'Net 30', 100, 7);
insert into t select 'inv', (public.create_invoice('2026-09-01')).id;

select pg_temp.login('a0000000-0000-0000-0000-000000000622');
select throws_ok($$ select public.delete_invoice(pg_temp.v('inv'), 1) $$, 'P0002', null, 'invoice: nobody else deletes mine');
select pg_temp.login('a0000000-0000-0000-0000-000000000621');
select throws_ok($$ select public.delete_invoice(pg_temp.v('inv'), 99) $$, '40001', null, 'invoice: delete is version-checked');
select lives_ok($$ select public.delete_invoice(pg_temp.v('inv'), pg_temp.inv_ver(pg_temp.v('inv'))) $$, 'invoice: I delete my draft');
select is_empty($$ select id from public.invoices where id = pg_temp.v('inv') $$, 'invoice: a deleted one is not read');
select throws_ok($$ select public.set_invoice_status(pg_temp.v('inv'), pg_temp.inv_ver(pg_temp.v('inv')), 'sent') $$, 'P0002', null,
  'invoice: a deleted one can''t be marked');
select is((public.restore_invoice(pg_temp.v('inv'))).number, 7, 'invoice: Undo brings it back with its number');
select is((public.restore_invoice(pg_temp.v('inv'))).number, 7, 'invoice: Undo is safe to repeat');
select public.set_invoice_status(pg_temp.v('inv'), pg_temp.inv_ver(pg_temp.v('inv')), 'sent');
select throws_ok($$ select public.delete_invoice(pg_temp.v('inv'), pg_temp.inv_ver(pg_temp.v('inv'))) $$, '22023', null,
  'invoice: a sent invoice can''t be deleted');
select public.set_invoice_status(pg_temp.v('inv'), pg_temp.inv_ver(pg_temp.v('inv')), 'draft');
select public.delete_invoice(pg_temp.v('inv'), pg_temp.inv_ver(pg_temp.v('inv')));
select results_eq($$ select id, number, status from public.create_invoice('2026-09-01') $$,
  $$ values (pg_temp.v('inv'), 7, 'draft'::text) $$, 'invoice: asking for the month again brings the same one back, as a draft');

select * from finish();
rollback;
