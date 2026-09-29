begin;
select plan(58);
-- Migration 0043, hours, timesheets and invoices (SPEC §15): only a report's author sets its hours (version-checked,
-- audited, a current report stays current); contract hours, billing and invoices are private to their owner (another
-- member, the job's admin and anon read nothing and write nothing); invoice numbers come from the owner's counter,
-- unique, one invoice per month, never burned by asking again; a signed timesheet needs a fresh sign-in; the Hours
-- tool is on for inspector companies' jobs and on the inspectors' rail.
\ir _helpers.psql

select pg_temp.mk_user('a0000000-0000-0000-0000-000000000371', 'probe+hours-insp@example.test', 'Sample Inspector');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000372', 'probe+hours-admin@example.test', 'Sample Admin');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000373', 'probe+hours-sub@example.test', 'Sample Sub');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000374', 'probe+hours-out@example.test', 'Sample Outsider');

insert into public.orgs (id, name, kind, created_by) values
  ('b0000000-0000-0000-0000-000000000371', 'Sample Hours Inspection Co', 'inspector', 'a0000000-0000-0000-0000-000000000372'),
  ('b0000000-0000-0000-0000-000000000372', 'Sample Hours Builders', 'gc', 'a0000000-0000-0000-0000-000000000372');
insert into public.projects (id, org_id, name, number, timezone, stage, created_by) values
  ('c0000000-0000-0000-0000-000000000371', 'b0000000-0000-0000-0000-000000000371', 'Sample Hours Wing', 'S-371',
   'America/Los_Angeles', 'construction', 'a0000000-0000-0000-0000-000000000372'),
  ('c0000000-0000-0000-0000-000000000372', 'b0000000-0000-0000-0000-000000000372', 'Sample Hours Gym', 'S-372',
   'America/Los_Angeles', 'construction', 'a0000000-0000-0000-0000-000000000372');
-- The admin made both jobs, so they are its project admin already.
insert into public.project_members (org_id, project_id, user_id, invite_email, role, status)
select o, p, u, e, r, 'active'
  from (values
    ('b0000000-0000-0000-0000-000000000371'::uuid, 'c0000000-0000-0000-0000-000000000371'::uuid,
     'a0000000-0000-0000-0000-000000000371'::uuid, 'probe+hours-insp@example.test', 'inspector'),
    ('b0000000-0000-0000-0000-000000000371', 'c0000000-0000-0000-0000-000000000371',
     'a0000000-0000-0000-0000-000000000373', 'probe+hours-sub@example.test', 'sub'),
    ('b0000000-0000-0000-0000-000000000372', 'c0000000-0000-0000-0000-000000000372',
     'a0000000-0000-0000-0000-000000000371', 'probe+hours-insp@example.test', 'inspector')) v(o, p, u, e, r);

-- Submitted reports by the inspector (the submit path itself is 17_dailies): Sep 1 and 2 on the wing, Sep 3 on the
-- gym, Aug 31 on the wing; a draft on Sep 4; and one by the admin on Sep 1.
insert into public.files (id, org_id, project_id, folder_id, storage_path, original_name, mime, size, scan_status,
                          text_status, upload_complete, created_by)
select ('e0000000-0000-0000-0000-00000000037' || n)::uuid, o, p,
       (select id from public.folders where project_id = p order by created_at, id limit 1),
       'probe/hours/37' || n || '.pdf', 'Sample report ' || n || '.pdf', 'application/pdf', 10, 'clean', 'none', true,
       'a0000000-0000-0000-0000-000000000371'
  from (values ('1', 'b0000000-0000-0000-0000-000000000371'::uuid, 'c0000000-0000-0000-0000-000000000371'::uuid),
               ('2', 'b0000000-0000-0000-0000-000000000372', 'c0000000-0000-0000-0000-000000000372')) v(n, o, p);
insert into public.daily_reports (id, org_id, project_id, author_id, report_type, report_date, status, number,
                                  pdf_file_id, filename, signed_at, signed_by, content_hash, signed_version, submitted_at)
select d::uuid, o, p, a, 'daily', day::date, 'submitted', num, f::uuid, 'Sample ' || num || '.pdf', now(), a,
       repeat('a', 64), 1, now()
  from (values
    ('d0000000-0000-0000-0000-000000000371', 'b0000000-0000-0000-0000-000000000371'::uuid,
     'c0000000-0000-0000-0000-000000000371'::uuid, 'a0000000-0000-0000-0000-000000000371'::uuid, '2026-09-01', 1,
     'e0000000-0000-0000-0000-000000000371'),
    ('d0000000-0000-0000-0000-000000000372', 'b0000000-0000-0000-0000-000000000371', 'c0000000-0000-0000-0000-000000000371',
     'a0000000-0000-0000-0000-000000000371', '2026-09-02', 2, 'e0000000-0000-0000-0000-000000000371'),
    ('d0000000-0000-0000-0000-000000000373', 'b0000000-0000-0000-0000-000000000372', 'c0000000-0000-0000-0000-000000000372',
     'a0000000-0000-0000-0000-000000000371', '2026-09-03', 1, 'e0000000-0000-0000-0000-000000000372'),
    ('d0000000-0000-0000-0000-000000000374', 'b0000000-0000-0000-0000-000000000371', 'c0000000-0000-0000-0000-000000000371',
     'a0000000-0000-0000-0000-000000000371', '2026-08-31', 3, 'e0000000-0000-0000-0000-000000000371'),
    ('d0000000-0000-0000-0000-000000000376', 'b0000000-0000-0000-0000-000000000371', 'c0000000-0000-0000-0000-000000000371',
     'a0000000-0000-0000-0000-000000000372', '2026-09-01', 1, 'e0000000-0000-0000-0000-000000000371')) v(d, o, p, a, day, num, f);
insert into public.daily_reports (id, org_id, project_id, author_id, report_type, report_date)
values ('d0000000-0000-0000-0000-000000000375', 'b0000000-0000-0000-0000-000000000371', 'c0000000-0000-0000-0000-000000000371',
        'a0000000-0000-0000-0000-000000000371', 'daily', '2026-09-04');
-- The VIS form's DSA # on the inspector's setup for the wing.
insert into public.daily_setups (org_id, project_id, author_id, report_type, settings, created_by)
values ('b0000000-0000-0000-0000-000000000371', 'c0000000-0000-0000-0000-000000000371', 'a0000000-0000-0000-0000-000000000371',
        'vis_daily', '{"locked": {"dsa_app": "04-000371"}}', 'a0000000-0000-0000-0000-000000000371');

create function pg_temp.ver(p_id uuid) returns int language sql as $$ select version from public.daily_reports where id = p_id $$;
grant execute on function pg_temp.ver(uuid) to public;

-- ---------------------------------------------------------------------------------------------------------------
-- The module and the rail
-- ---------------------------------------------------------------------------------------------------------------
select ok((select 'hours' = any (modules) from public.projects where id = 'c0000000-0000-0000-0000-000000000371'),
  'module: an inspector company''s new job has Hours');
select ok((select not ('hours' = any (modules)) from public.projects where id = 'c0000000-0000-0000-0000-000000000372'),
  'module: a GC''s job does not (Settings turns it on)');
select is((select recommended_tools[cardinality(recommended_tools)] from public.roles where name = 'inspector'), 'hours',
  'rail: Hours is recommended to inspectors (appended)');
select is((select recommended_tools[cardinality(recommended_tools)] from public.roles where name = 'special_inspector'), 'hours',
  'rail: and to special inspectors');
select is((select recommended_tools[cardinality(recommended_tools)] from public.roles where name = 'project_admin'), 'hours',
  'rail: and to project admins (an inspector company''s job is made by its inspector; off where the job has no Hours)');
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000371');
select ok((select 'hours' = any (tools) from public.my_recommended_tools('c0000000-0000-0000-0000-000000000371')),
  'rail: the inspector gets Hours on the inspector company''s job');
select ok((select not ('hours' = any (tools)) from public.my_recommended_tools('c0000000-0000-0000-0000-000000000372')),
  'rail: not where the job has it off');

-- ---------------------------------------------------------------------------------------------------------------
-- Hours on a report: the author only
-- ---------------------------------------------------------------------------------------------------------------
select is((public.set_daily_hours('d0000000-0000-0000-0000-000000000371', 1, 8)).hours, 8.0::numeric(4,1),
  'hours: the author sets 8');
select ok((select version = signed_version from public.daily_reports where id = 'd0000000-0000-0000-0000-000000000371'),
  'hours: a current report stays current (not "Changed")');
select throws_ok($$ select public.set_daily_hours('d0000000-0000-0000-0000-000000000371', 1, 6) $$, '40001', null,
  'hours: a stale version is refused');
select throws_ok($$ select public.set_daily_hours('d0000000-0000-0000-0000-000000000371', pg_temp.ver('d0000000-0000-0000-0000-000000000371'), 25) $$,
  '22023', null, 'hours: more than 24 is refused');
select throws_ok($$ select public.set_daily_hours('d0000000-0000-0000-0000-000000000371', pg_temp.ver('d0000000-0000-0000-0000-000000000371'), 7.25) $$,
  '22023', null, 'hours: tenths only');
select throws_ok($$ select public.set_daily_hours('d0000000-0000-0000-0000-000000000375', pg_temp.ver('d0000000-0000-0000-0000-000000000375'), 8) $$,
  '22023', null, 'hours: a draft is refused (submit first)');
select lives_ok($$ select public.set_daily_hours('d0000000-0000-0000-0000-000000000372', 1, 6.5) $$, 'hours: 6.5 on Sep 2');
select lives_ok($$ select public.set_daily_hours('d0000000-0000-0000-0000-000000000373', 1, 4) $$, 'hours: 4 on the gym');
select lives_ok($$ select public.set_daily_hours('d0000000-0000-0000-0000-000000000374', 1, 8) $$, 'hours: 8 on Aug 31');
select is((public.set_daily_hours('d0000000-0000-0000-0000-000000000374', pg_temp.ver('d0000000-0000-0000-0000-000000000374'), null)).hours,
  null::numeric(4,1), 'hours: null clears them');
reset role;
select ok(exists (select 1 from public.audit_events where action = 'daily.hours'
                    and entity_id = 'd0000000-0000-0000-0000-000000000371' and details ->> 'hours' = '8'),
  'hours: audited');
-- A report changed since it was signed stays changed after its hours are set.
update public.daily_reports set content = '{"x": 1}' where id = 'd0000000-0000-0000-0000-000000000372';
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000371');
select ok((select version <> signed_version
             from public.set_daily_hours('d0000000-0000-0000-0000-000000000372', pg_temp.ver('d0000000-0000-0000-0000-000000000372'), 6.5)),
  'hours: a changed report stays changed');

select pg_temp.login('a0000000-0000-0000-0000-000000000372');
select throws_ok($$ select public.set_daily_hours('d0000000-0000-0000-0000-000000000371', pg_temp.ver('d0000000-0000-0000-0000-000000000371'), 2) $$,
  'P0002', null, 'hours: the job''s admin cannot set someone else''s');
select pg_temp.login('a0000000-0000-0000-0000-000000000373');
select throws_ok($$ select public.set_daily_hours('d0000000-0000-0000-0000-000000000371', pg_temp.ver('d0000000-0000-0000-0000-000000000371'), 2) $$,
  'P0002', null, 'hours: another member cannot either');
select throws_ok($$ update public.daily_reports set hours = 2 where id = 'd0000000-0000-0000-0000-000000000371' $$, '42501', null,
  'hours: no direct writes');

-- ---------------------------------------------------------------------------------------------------------------
-- Contract hours: mine only
-- ---------------------------------------------------------------------------------------------------------------
select pg_temp.login('a0000000-0000-0000-0000-000000000371');
select is((public.save_hours_budget('c0000000-0000-0000-0000-000000000371', 4000, 300, '2026-08-31')).contract_hours,
  4000.0::numeric(8,1), 'budget: the inspector sets contract hours with a baseline');
select throws_ok($$ select public.save_hours_budget('c0000000-0000-0000-0000-000000000371', 4000, 300, '2026-08-31') $$, '40001', null,
  'budget: a second first save is a conflict, never a second row');
select throws_ok($$ select public.save_hours_budget('c0000000-0000-0000-0000-000000000371', 4000, 300, null,
  (select version from public.job_hours_budgets where user_id = auth.uid())) $$, '22023', null,
  'budget: a baseline needs the day it runs through');
select is((public.save_hours_budget('c0000000-0000-0000-0000-000000000371', 4200, 300, '2026-08-31',
  (select version from public.job_hours_budgets where user_id = auth.uid()))).contract_hours, 4200.0::numeric(8,1),
  'budget: edited with its version');
select pg_temp.login('a0000000-0000-0000-0000-000000000372');
select is_empty($$ select * from public.job_hours_budgets $$, 'budget: the job''s admin reads nothing');
select pg_temp.login('a0000000-0000-0000-0000-000000000373');
select is_empty($$ select * from public.job_hours_budgets $$, 'budget: another member reads nothing');
select throws_ok($$ insert into public.job_hours_budgets (org_id, project_id, user_id, contract_hours)
  values ('b0000000-0000-0000-0000-000000000371', 'c0000000-0000-0000-0000-000000000371', auth.uid(), 1) $$, '42501', null,
  'budget: no direct writes');
select pg_temp.login('a0000000-0000-0000-0000-000000000374');
select throws_ok($$ select public.save_hours_budget('c0000000-0000-0000-0000-000000000371', 10, 0, null) $$, '42501', null,
  'budget: not on the job, refused');

-- ---------------------------------------------------------------------------------------------------------------
-- Billing: mine only
-- ---------------------------------------------------------------------------------------------------------------
select pg_temp.login('a0000000-0000-0000-0000-000000000371');
select throws_ok($$ select public.create_invoice('2026-09-01') $$, '22023', null, 'invoice: billing comes first');
select is((public.save_billing_profile('Sample Inspection Services', '1 Sample Way', 'Sample Inspection Co', 'Net 30', 90, 41)).rate,
  90.00::numeric(8,2), 'billing: my profile with my rate');
select throws_ok($$ select public.save_billing_profile('x', '', '', '', 90.123, 41, 1) $$, '22023', null, 'billing: cents only');
select is((public.set_job_rate('c0000000-0000-0000-0000-000000000372', 75)).rate, 75.00::numeric(8,2), 'billing: the gym''s own rate');
select pg_temp.login('a0000000-0000-0000-0000-000000000374');
select throws_ok($$ select public.set_job_rate('c0000000-0000-0000-0000-000000000371', 1) $$, '42501', null,
  'billing: no job rate on a job I am not on');
select pg_temp.login('a0000000-0000-0000-0000-000000000372');
select is_empty($$ select user_id from public.billing_profiles union all select user_id from public.billing_job_rates $$,
  'billing: the job''s admin reads no profile and no rate');
select throws_ok($$ insert into public.billing_profiles (user_id) values (auth.uid()) $$, '42501', null, 'billing: no direct writes');

-- ---------------------------------------------------------------------------------------------------------------
-- Invoices: numbered by the database, one per month, mine only
-- ---------------------------------------------------------------------------------------------------------------
select pg_temp.login('a0000000-0000-0000-0000-000000000371');
select is((public.create_invoice('2026-09-01')).number, 41, 'invoice: numbered from my counter');
select results_eq($$ select total_hours, total_amount from public.invoices where user_id = auth.uid() and period = '2026-09-01' $$,
  $$ values (18.5::numeric(8,1), 1605.00::numeric(12,2)) $$,
  'invoice: Sep hours at my rates (wing 14.5 h x 90 + gym 4 h x 75); the draft, Aug and the admin''s report left out');
select is((select l ->> 'dsa' from public.invoices i, jsonb_array_elements(i.lines) l
            where i.user_id = auth.uid() and l ->> 'job' = 'Sample Hours Wing'), '04-000371',
  'invoice: the job''s DSA # comes from my setup');
select is((public.create_invoice('2026-09-01')).number, 41, 'invoice: asking again answers the same invoice');
select is((select next_invoice_number from public.billing_profiles where user_id = auth.uid()), 42,
  'invoice: the counter moved once');
select throws_ok($$ select public.create_invoice('2026-07-01') $$, '22023', null, 'invoice: a month without hours is refused');
select throws_ok($$ select public.create_invoice('2026-09-15') $$, '22023', null, 'invoice: a month is its first day');
select is((select next_invoice_number from public.billing_profiles where user_id = auth.uid()), 42,
  'invoice: a refusal burns no number');
select throws_ok($$ select public.save_billing_profile('x', '', '', '', 90, 41, (select version from public.billing_profiles where user_id = auth.uid())) $$,
  '22023', null, 'invoice: the counter never goes back to a used number');
reset role;
select throws_ok($$ insert into public.invoices (user_id, number, period, issued_on, from_name, from_address, bill_to, terms,
                                                 lines, total_hours, total_amount)
  values ('a0000000-0000-0000-0000-000000000371', 41, '2026-10-01', '2026-10-01', 'x', '', '', '', '[{}]', 0, 0) $$,
  '23505', null, 'invoice: a number is unique per person');
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000371');
select is((public.set_invoice_status((select id from public.invoices where user_id = auth.uid()), 1, 'sent')).status, 'sent',
  'invoice: marked Sent by hand');
select throws_ok($$ select public.refresh_invoice((select id from public.invoices where user_id = auth.uid()),
  (select version from public.invoices where user_id = auth.uid())) $$, '22023', null, 'invoice: only a draft is priced again');
select is((public.set_invoice_status((select id from public.invoices where user_id = auth.uid()),
  (select version from public.invoices where user_id = auth.uid()), 'draft')).sent_at, null, 'invoice: back to Draft (undo)');
select lives_ok($$ select public.set_daily_hours('d0000000-0000-0000-0000-000000000373', pg_temp.ver('d0000000-0000-0000-0000-000000000373'), 8) $$,
  'invoice: the gym day becomes 8 h');
select is((public.refresh_invoice((select id from public.invoices where user_id = auth.uid()),
  (select version from public.invoices where user_id = auth.uid()))).total_amount, 1905.00::numeric(12,2),
  'invoice: a draft is priced again from today''s hours');
select pg_temp.login('a0000000-0000-0000-0000-000000000372');
select is_empty($$ select * from public.invoices $$, 'invoice: the job''s admin reads none');
select throws_ok($$ select public.set_invoice_status((select id from public.invoices limit 1), 1, 'paid') $$, 'P0002', null,
  'invoice: nobody else changes mine');
select pg_temp.login('a0000000-0000-0000-0000-000000000373');
select is_empty($$ select * from public.invoices $$, 'invoice: another member reads none');

-- ---------------------------------------------------------------------------------------------------------------
-- A signed timesheet needs a fresh sign-in; anon reaches nothing
-- ---------------------------------------------------------------------------------------------------------------
select pg_temp.login('a0000000-0000-0000-0000-000000000371');
select isnt(public.sign_timesheet('2026-09-01', 'b0000000-0000-0000-0000-000000000371', repeat('c', 64)), null,
  'timesheet: signed after a fresh sign-in');
select pg_temp.login_stale('a0000000-0000-0000-0000-000000000371');
select throws_ok($$ select public.sign_timesheet('2026-09-01', 'b0000000-0000-0000-0000-000000000371', repeat('c', 64)) $$,
  '42501', null, 'timesheet: an old sign-in must confirm again');
reset role;
select ok(not has_function_privilege('anon', 'public.create_invoice(date)', 'EXECUTE')
          and not has_function_privilege('anon', 'public.set_daily_hours(uuid, int, numeric)', 'EXECUTE')
          and not has_function_privilege('authenticated', 'public.invoice_lines(uuid, date)', 'EXECUTE')
          and not has_table_privilege('anon', 'public.invoices', 'SELECT')
          and not has_table_privilege('anon', 'public.billing_profiles', 'SELECT'),
  'anon: no invoices, no billing, no RPCs; people cannot call the internal pricing');

select * from finish();
rollback;
