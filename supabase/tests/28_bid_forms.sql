begin;
select plan(39);
-- Required bid forms (migration 0034): open_bid_forms picks the templates that apply (prevailing wage, DSA, job type,
-- company), is safe to repeat and never brings a removed form back; the Bid forms folder is bids.manage only; RLS walls
-- (bidder, sub, PM, another job); saves carry a version check; the attached file must be one the person can open in
-- the same job; a due day is a calendar line until the form is done.
\ir _helpers.psql

select pg_temp.mk_user('a0000000-0000-0000-0000-000000000341', 'probe+bf-admin@example.test', 'BF Admin');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000342', 'probe+bf-estimator@example.test', 'BF Estimator');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000343', 'probe+bf-bidder@example.test', 'BF Bidder');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000344', 'probe+bf-sub@example.test', 'BF Sub');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000345', 'probe+bf-pm@example.test', 'BF PM');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000346', 'probe+bf-other@example.test', 'BF Other');

insert into public.orgs (id, name, kind, created_by) values
  ('b0000000-0000-0000-0000-000000000341', 'BF Builders', 'gc', 'a0000000-0000-0000-0000-000000000341'),
  ('b0000000-0000-0000-0000-000000000342', 'BF Other Co', 'gc', 'a0000000-0000-0000-0000-000000000346');

-- P: a prevailing-wage public job. Q: a private tenant improvement. D: a prevailing-wage DSA school. O: another company's.
insert into public.projects (id, org_id, name, stage, prevailing_wage, is_dsa, job_type, created_by) values
  ('c0000000-0000-0000-0000-000000000341', 'b0000000-0000-0000-0000-000000000341', 'BF Public', 'bidding', true, false, 'Public works', 'a0000000-0000-0000-0000-000000000341'),
  ('c0000000-0000-0000-0000-000000000342', 'b0000000-0000-0000-0000-000000000341', 'BF Private', 'bidding', false, false, 'tenant improvement', 'a0000000-0000-0000-0000-000000000341'),
  ('c0000000-0000-0000-0000-000000000343', 'b0000000-0000-0000-0000-000000000341', 'BF School', 'bidding', true, true, null, 'a0000000-0000-0000-0000-000000000341'),
  ('c0000000-0000-0000-0000-000000000344', 'b0000000-0000-0000-0000-000000000342', 'BF Other Job', 'bidding', true, false, null, 'a0000000-0000-0000-0000-000000000346');

insert into public.project_members (org_id, project_id, user_id, invite_email, role, status)
select 'b0000000-0000-0000-0000-000000000341', m.project_id, m.user_id, u.email, m.role, 'active'
  from (values
    ('c0000000-0000-0000-0000-000000000341'::uuid, 'a0000000-0000-0000-0000-000000000342'::uuid, 'estimator'),
    ('c0000000-0000-0000-0000-000000000342'::uuid, 'a0000000-0000-0000-0000-000000000342'::uuid, 'estimator'),
    ('c0000000-0000-0000-0000-000000000343'::uuid, 'a0000000-0000-0000-0000-000000000342'::uuid, 'estimator'),
    ('c0000000-0000-0000-0000-000000000341'::uuid, 'a0000000-0000-0000-0000-000000000343'::uuid, 'bidder'),
    ('c0000000-0000-0000-0000-000000000341'::uuid, 'a0000000-0000-0000-0000-000000000344'::uuid, 'sub'),
    ('c0000000-0000-0000-0000-000000000341'::uuid, 'a0000000-0000-0000-0000-000000000345'::uuid, 'pm')) as m (project_id, user_id, role)
  join auth.users u on u.id = m.user_id;

-- A company's own template for its tenant improvement jobs, and another company's template (never on BF jobs).
insert into public.bid_form_templates (org_id, name, reference, timing, if_job_types, sort) values
  ('b0000000-0000-0000-0000-000000000341', 'Owner questionnaire', 'Owner''s RFP', 'with_bid', '{Tenant Improvement}', 95),
  ('b0000000-0000-0000-0000-000000000342', 'Other co form', '', 'with_bid', null, 5);

-- Files: another company's plan sheet, and a pricing-only "Bids received" file on P uploaded by the admin.
insert into public.files (id, org_id, project_id, folder_id, storage_path, original_name, created_by)
select f.id, f.org_id, f.project_id, (select id from public.folders where project_id = f.project_id and kind = f.kind limit 1),
       'probe/bf/' || f.id::text, f.name, f.created_by
  from (values
    ('f0000000-0000-0000-0000-000000000341'::uuid, 'b0000000-0000-0000-0000-000000000342'::uuid, 'c0000000-0000-0000-0000-000000000344'::uuid,
     'plans', 'Sample other plans.pdf', 'a0000000-0000-0000-0000-000000000346'::uuid),
    ('f0000000-0000-0000-0000-000000000342'::uuid, 'b0000000-0000-0000-0000-000000000341'::uuid, 'c0000000-0000-0000-0000-000000000341'::uuid,
     'bids_received', 'Sample sub bid.pdf', 'a0000000-0000-0000-0000-000000000341'::uuid)) as f (id, org_id, project_id, kind, name, created_by);

-- Saves as the logged-in person (invoker, so RLS applies): rows changed.
create function pg_temp.bf_set(p_id uuid, p_version int, p_status text)
returns int
language plpgsql
as $$
declare n int;
begin
  update public.bid_form_items set status = p_status where id = p_id and version = p_version;
  get diagnostics n = row_count;
  return n;
end;
$$;
grant execute on function pg_temp.bf_set(uuid, int, text) to public;

create function pg_temp.bf_item(p_project uuid, p_name text)
returns uuid
language sql
security definer
as $$ select id from public.bid_form_items where project_id = p_project and name = p_name $$;
grant execute on function pg_temp.bf_item(uuid, text) to public;

create function pg_temp.bf_names(p_project uuid)
returns text[]
language sql
security definer
as $$ select array_agg(name order by sort, name) from public.bid_form_items where project_id = p_project and deleted_at is null $$;
grant execute on function pg_temp.bf_names(uuid) to public;

-- ---------------------------------------------------------------------------------------------------------------
-- Seeding picks the forms that apply
-- ---------------------------------------------------------------------------------------------------------------
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000342');
select lives_ok($$ select public.open_bid_forms('c0000000-0000-0000-0000-000000000341') $$, 'estimator opens the forms of a public job');
select is(pg_temp.bf_names('c0000000-0000-0000-0000-000000000341'),
  array['Bid form', 'Bid bond', 'Subcontractor list', 'Noncollusion declaration', 'DIR registration', 'CSLB license',
        'Iran Contracting Act', 'Addenda acknowledged', 'Payment bond', 'Performance bond', 'Workers'' comp certification',
        'Insurance certificates', 'Contract'],
  'prevailing-wage public job: the public-works forms, no DSA forms, no other company''s');
select lives_ok($$ select public.open_bid_forms('c0000000-0000-0000-0000-000000000342') $$, 'estimator opens the forms of a private job');
select is(pg_temp.bf_names('c0000000-0000-0000-0000-000000000342'),
  array['Bid form', 'CSLB license', 'Addenda acknowledged', 'Owner questionnaire', 'Insurance certificates', 'Contract'],
  'private job: no bonds, sub list or DIR; the company''s own form for its job type (case ignored)');
select lives_ok($$ select public.open_bid_forms('c0000000-0000-0000-0000-000000000343') $$, 'estimator opens the forms of a DSA job');
select is(cardinality(pg_temp.bf_names('c0000000-0000-0000-0000-000000000343')), 15, 'DSA public job: all 15 default forms');
select ok('Prequalification' = any (pg_temp.bf_names('c0000000-0000-0000-0000-000000000343'))
          and 'Background check certificate' = any (pg_temp.bf_names('c0000000-0000-0000-0000-000000000343'))
          and not ('Prequalification' = any (pg_temp.bf_names('c0000000-0000-0000-0000-000000000341'))),
  'the school forms come with DSA only');

select is(public.open_bid_forms('c0000000-0000-0000-0000-000000000341'),
  (select id from public.folders where project_id = 'c0000000-0000-0000-0000-000000000341' and kind = 'bid_forms'),
  'repeat: the same folder');
select is(cardinality(pg_temp.bf_names('c0000000-0000-0000-0000-000000000341')), 13, 'repeat: no duplicate forms');

-- A removed form stays removed.
update public.bid_form_items set deleted_at = now()
 where id = pg_temp.bf_item('c0000000-0000-0000-0000-000000000341', 'Iran Contracting Act');
select public.open_bid_forms('c0000000-0000-0000-0000-000000000341');
select is(cardinality(pg_temp.bf_names('c0000000-0000-0000-0000-000000000341')), 12, 'a removed form does not come back');

-- Prevailing wage turned on later: the next open adds the public-works forms.
reset role;
update public.projects set prevailing_wage = true where id = 'c0000000-0000-0000-0000-000000000342';
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000342');
select public.open_bid_forms('c0000000-0000-0000-0000-000000000342');
select is(cardinality(pg_temp.bf_names('c0000000-0000-0000-0000-000000000342')), 14, 'prevailing wage on: its forms are added');

-- ---------------------------------------------------------------------------------------------------------------
-- The Bid forms folder
-- ---------------------------------------------------------------------------------------------------------------
reset role;
select results_eq(
  $$ select f.name, fa.capability, fa.can_read, fa.can_write from public.folders f
       join public.folder_access fa on fa.folder_id = f.id
      where f.project_id = 'c0000000-0000-0000-0000-000000000341' and f.kind = 'bid_forms' $$,
  $$ values ('Bid forms'::text, 'bids.manage'::text, true, true) $$,
  'one Bid forms folder, read and write with bids.manage only');
select ok(pg_temp.can_write_as('a0000000-0000-0000-0000-000000000342',
  (select id from public.folders where project_id = 'c0000000-0000-0000-0000-000000000341' and kind = 'bid_forms')),
  'the estimator uploads into it');
select ok(not pg_temp.can_read_as('a0000000-0000-0000-0000-000000000345',
  (select id from public.folders where project_id = 'c0000000-0000-0000-0000-000000000341' and kind = 'bid_forms')),
  'the PM (files.manage) cannot open it');
select ok(not pg_temp.can_read_as('a0000000-0000-0000-0000-000000000343',
  (select id from public.folders where project_id = 'c0000000-0000-0000-0000-000000000341' and kind = 'bid_forms')),
  'a bidder cannot open it');
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000346');
select throws_ok(
  $$ insert into public.folders (org_id, project_id, name, created_by)
     values ('b0000000-0000-0000-0000-000000000342', 'c0000000-0000-0000-0000-000000000344', 'Bid forms', 'a0000000-0000-0000-0000-000000000346') $$,
  '23505', 'That name is used by the system. Pick another.', 'nobody takes the Bid forms name first');

-- ---------------------------------------------------------------------------------------------------------------
-- Walls
-- ---------------------------------------------------------------------------------------------------------------
select pg_temp.login('a0000000-0000-0000-0000-000000000343');
select is((select count(*)::int from public.bid_form_items where project_id = 'c0000000-0000-0000-0000-000000000341'), 0,
  'bidder: sees no forms');
select throws_ok($$ select public.open_bid_forms('c0000000-0000-0000-0000-000000000341') $$, '42501', null, 'bidder: cannot open them');
select throws_ok(
  $$ insert into public.bid_form_items (org_id, project_id, name, timing, created_by)
     values ('b0000000-0000-0000-0000-000000000341', 'c0000000-0000-0000-0000-000000000341', 'Probe', 'with_bid', 'a0000000-0000-0000-0000-000000000343') $$,
  '42501', null, 'bidder: cannot add one');
select is(pg_temp.bf_set(pg_temp.bf_item('c0000000-0000-0000-0000-000000000341', 'Bid bond'), 1, 'done'), 0, 'bidder: cannot change one');
select pg_temp.login('a0000000-0000-0000-0000-000000000344');
select is((select count(*)::int from public.bid_form_items where project_id = 'c0000000-0000-0000-0000-000000000341'), 0,
  'sub: sees no forms');
select pg_temp.login('a0000000-0000-0000-0000-000000000345');
select is((select count(*)::int from public.bid_form_items where project_id = 'c0000000-0000-0000-0000-000000000341'), 0,
  'PM without bids.manage: sees no forms');
select pg_temp.login('a0000000-0000-0000-0000-000000000346');
select public.open_bid_forms('c0000000-0000-0000-0000-000000000344');
select is((select count(*)::int from public.bid_form_items where project_id = 'c0000000-0000-0000-0000-000000000341'), 0,
  'another company''s admin: sees none of this job''s forms');
select is((select count(*)::int from public.bid_form_items where project_id = 'c0000000-0000-0000-0000-000000000344'
                                                              and name = 'Other co form'), 1,
  'their own company''s template is on their job');
select pg_temp.login('a0000000-0000-0000-0000-000000000342');
select is((select count(*)::int from public.bid_form_items where project_id = 'c0000000-0000-0000-0000-000000000344'), 0,
  'estimator: sees none of the other job''s forms');

select pg_temp.login('a0000000-0000-0000-0000-000000000343');
select is((select count(*)::int from public.bid_form_templates where org_id is null), 15, 'templates: every signed-in person reads the defaults');
select pg_temp.login('a0000000-0000-0000-0000-000000000346');
select is((select count(*)::int from public.bid_form_templates where name = 'Owner questionnaire'), 0,
  'templates: another company''s own ones stay hidden');
select throws_ok($$ insert into public.bid_form_templates (name, timing) values ('Probe', 'with_bid') $$, '42501', null,
  'templates: people cannot write them');

-- ---------------------------------------------------------------------------------------------------------------
-- Saves carry a version check
-- ---------------------------------------------------------------------------------------------------------------
select pg_temp.login('a0000000-0000-0000-0000-000000000342');
select is(pg_temp.bf_set(pg_temp.bf_item('c0000000-0000-0000-0000-000000000341', 'Bid bond'), 1, 'done'), 1, 'status: saved at the current version');
select is((select version from public.bid_form_items where id = pg_temp.bf_item('c0000000-0000-0000-0000-000000000341', 'Bid bond')), 2,
  'status: the version moved on');
select is(pg_temp.bf_set(pg_temp.bf_item('c0000000-0000-0000-0000-000000000341', 'Bid bond'), 1, 'to_do'), 0, 'status: a stale save changes nothing');
select is((select status from public.bid_form_items where id = pg_temp.bf_item('c0000000-0000-0000-0000-000000000341', 'Bid bond')), 'done',
  'status: still done');

-- A job's own extra form; template ones come only from open_bid_forms.
select lives_ok(
  $$ insert into public.bid_form_items (org_id, project_id, name, timing, created_by)
     values ('b0000000-0000-0000-0000-000000000341', 'c0000000-0000-0000-0000-000000000341', 'Sample site visit form', 'with_bid',
             'a0000000-0000-0000-0000-000000000342') $$,
  'estimator adds a form for this job');
select throws_ok(
  $$ insert into public.bid_form_items (org_id, project_id, template_id, name, timing, created_by)
     values ('b0000000-0000-0000-0000-000000000341', 'c0000000-0000-0000-0000-000000000341',
             (select id from public.bid_form_templates where name = 'Bid bond' and org_id is null), 'Bid bond', 'with_bid',
             'a0000000-0000-0000-0000-000000000342') $$,
  '42501', null, 'nobody adds a template form by hand');

-- ---------------------------------------------------------------------------------------------------------------
-- The attached file
-- ---------------------------------------------------------------------------------------------------------------
create temp table bf_upload as
select id from public.register_file(
  (select id from public.folders where project_id = 'c0000000-0000-0000-0000-000000000341' and kind = 'bid_forms'),
  'Sample bid bond.pdf', 'application/pdf', 1000);
select lives_ok(
  $$ update public.bid_form_items set file_id = (select id from bf_upload)
      where id = pg_temp.bf_item('c0000000-0000-0000-0000-000000000341', 'Bid bond') $$,
  'file: my upload in the Bid forms folder');
select throws_ok(
  $$ update public.bid_form_items set file_id = 'f0000000-0000-0000-0000-000000000341'
      where id = pg_temp.bf_item('c0000000-0000-0000-0000-000000000341', 'Bid form') $$,
  '42501', null, 'file: not one from another job');
select throws_ok(
  $$ update public.bid_form_items set file_id = 'f0000000-0000-0000-0000-000000000342'
      where id = pg_temp.bf_item('c0000000-0000-0000-0000-000000000341', 'Bid form') $$,
  '42501', null, 'file: not one I cannot open (a pricing-only sub bid without two-step login)');

-- ---------------------------------------------------------------------------------------------------------------
-- Calendar: a due day is a "my due" line for bids managers until the form is done
-- ---------------------------------------------------------------------------------------------------------------
update public.bid_form_items set due_on = '2026-10-15'
 where id = pg_temp.bf_item('c0000000-0000-0000-0000-000000000341', 'Payment bond');
reset role;
select results_eq(
  $$ select kind, read_capability, all_day, title, status from public.calendar_entries
      where source_type = 'bid_form_item' and source_id = pg_temp.bf_item('c0000000-0000-0000-0000-000000000341', 'Payment bond') $$,
  $$ values ('my_due'::text, 'bids.manage'::text, true, 'Payment bond'::text, 'pending'::text) $$,
  'calendar: an open form with a due day is a my-due line for bids managers');
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000342');
update public.bid_form_items set status = 'done'
 where id = pg_temp.bf_item('c0000000-0000-0000-0000-000000000341', 'Payment bond');
reset role;
select is((select count(*)::int from public.calendar_entries where source_type = 'bid_form_item'
            and source_id = pg_temp.bf_item('c0000000-0000-0000-0000-000000000341', 'Payment bond')), 0,
  'calendar: done, the line goes');

select * from finish();
rollback;
