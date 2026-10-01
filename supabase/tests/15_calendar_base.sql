begin;
select plan(19);
-- SPEC §7.6 calendar base (migration 0021): one table of lines, each seen by holders of its read capability. People
-- with calendar.manage add their own lines; modules mirror theirs through calendar_mirror (not user-callable).
-- A job's bid time is a milestone line. A job being built gets the field tools.
\ir _helpers.psql

select pg_temp.mk_user('a0000000-0000-0000-0000-000000000151', 'probe+cal-pm@example.test', 'Cal PM');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000152', 'probe+cal-sub@example.test', 'Cal Sub');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000153', 'probe+cal-bidder@example.test', 'Cal Bidder');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000154', 'probe+cal-est@example.test', 'Cal Estimator');

insert into public.orgs (id, name, kind, created_by)
values ('b0000000-0000-0000-0000-000000000151', 'Cal Builders', 'gc', 'a0000000-0000-0000-0000-000000000154');
insert into public.projects (id, org_id, name, stage, bid_due_at, created_by)
values ('c0000000-0000-0000-0000-000000000151', 'b0000000-0000-0000-0000-000000000151', 'Cal Job', 'bidding',
        '2026-10-01 21:00:00+00', 'a0000000-0000-0000-0000-000000000154');
insert into public.project_members (org_id, project_id, user_id, invite_email, role, status)
select 'b0000000-0000-0000-0000-000000000151', 'c0000000-0000-0000-0000-000000000151', u, e, r, 'active'
  from (values ('a0000000-0000-0000-0000-000000000151'::uuid, 'probe+cal-pm@example.test', 'pm'),
               ('a0000000-0000-0000-0000-000000000152'::uuid, 'probe+cal-sub@example.test', 'sub'),
               ('a0000000-0000-0000-0000-000000000153'::uuid, 'probe+cal-bidder@example.test', 'bidder'),
               ('a0000000-0000-0000-0000-000000000154'::uuid, 'probe+cal-est@example.test', 'estimator')) v(u, e, r)
on conflict do nothing;

-- Bid time mirrored on insert.
select results_eq($$ select kind, title, starts_at from public.calendar_entries
                      where source_type = 'project_bid_due' and source_id = 'c0000000-0000-0000-0000-000000000151' $$,
  $$ values ('milestones'::text, 'Bids due'::text, '2026-10-01 21:00:00+00'::timestamptz) $$,
  'bid due: a job with a bid time has a milestone line');

-- A module line only estimators see, and a personal line.
select isnt(public.calendar_mirror('probe_source', 'd0000000-0000-0000-0000-000000000151', 'c0000000-0000-0000-0000-000000000151',
  'meetings', 'Estimators only', '2026-10-02 16:00:00+00', null, false, 'pending', 'bids.manage'), null,
  'calendar_mirror: returns the line id');
select is(public.calendar_mirror('probe_source', 'd0000000-0000-0000-0000-000000000151', 'c0000000-0000-0000-0000-000000000151',
  'meetings', 'Estimators only', '2026-10-02 16:00:00+00', null, false, 'pending', 'bids.manage'),
  (select id from public.calendar_entries where source_type = 'probe_source' and source_id = 'd0000000-0000-0000-0000-000000000151'),
  'calendar_mirror: a repeat keeps the same line');
select public.calendar_mirror('probe_source', 'd0000000-0000-0000-0000-000000000152', 'c0000000-0000-0000-0000-000000000151',
  'my_due', 'Sub due item', '2026-10-03 16:00:00+00', p_visible_to => 'a0000000-0000-0000-0000-000000000152');

set local role authenticated;

-- PM: adds and edits a line.
select pg_temp.login('a0000000-0000-0000-0000-000000000151');
select lives_ok($$ insert into public.calendar_entries (id, org_id, project_id, kind, title, starts_at, created_by)
  values ('e0000000-0000-0000-0000-000000000151', 'b0000000-0000-0000-0000-000000000151', 'c0000000-0000-0000-0000-000000000151',
          'pours', 'Slab pour', '2026-10-05 14:00:00+00', auth.uid()) $$, 'manual: calendar.manage adds a line');
select lives_ok($$ update public.calendar_entries set title = 'Slab pour, area B' where id = 'e0000000-0000-0000-0000-000000000151' $$,
  'manual: calendar.manage edits a line');
select is((select title from public.calendar_entries where id = 'e0000000-0000-0000-0000-000000000151'), 'Slab pour, area B',
  'manual: the edit is saved');
select throws_ok($$ insert into public.calendar_entries (org_id, project_id, kind, title, starts_at, created_by, status)
  values ('b0000000-0000-0000-0000-000000000151', 'c0000000-0000-0000-0000-000000000151', 'pours', 'x', now(), auth.uid(), 'confirmed') $$,
  '42501', null, 'manual: a status cannot be set by hand');
select is_empty($$ update public.calendar_entries set title = 'hacked'
  where source_type = 'probe_source' returning id $$, 'mirrored lines cannot be edited by people');
select throws_ok($$ select public.calendar_mirror('probe_source', gen_random_uuid(), 'c0000000-0000-0000-0000-000000000151',
  'meetings', 'x', now()) $$, '42501', null, 'calendar_mirror: not callable by people');
select throws_ok($$ select public.calendar_unmirror('probe_source', 'd0000000-0000-0000-0000-000000000151') $$,
  '42501', null, 'calendar_unmirror: not callable by people');
select results_eq($$ select title from public.calendar_entries where project_id = 'c0000000-0000-0000-0000-000000000151' order by starts_at $$,
  $$ values ('Bids due'::text), ('Slab pour, area B'::text) $$, 'pm: sees job lines, not estimator-only or someone else''s personal line');

-- Sub: reads, can't add.
select pg_temp.login('a0000000-0000-0000-0000-000000000152');
select results_eq($$ select title from public.calendar_entries where project_id = 'c0000000-0000-0000-0000-000000000151' order by starts_at $$,
  $$ values ('Bids due'::text), ('Sub due item'::text), ('Slab pour, area B'::text) $$, 'sub: sees job lines plus their own due item');
select throws_ok($$ insert into public.calendar_entries (org_id, project_id, kind, title, starts_at, created_by)
  values ('b0000000-0000-0000-0000-000000000151', 'c0000000-0000-0000-0000-000000000151', 'pours', 'x', now(), auth.uid()) $$,
  '42501', null, 'sub: cannot add lines');

-- Bidder: nothing.
select pg_temp.login('a0000000-0000-0000-0000-000000000153');
select is_empty($$ select id from public.calendar_entries $$, 'bidder: no calendar');

-- Estimator: sees the estimator-only line.
select pg_temp.login('a0000000-0000-0000-0000-000000000154');
select ok(exists (select 1 from public.calendar_entries where title = 'Estimators only'), 'module audience: estimator sees its line');

reset role;

-- Bid time cleared: the line goes.
update public.projects set bid_due_at = null where id = 'c0000000-0000-0000-0000-000000000151';
select is_empty($$ select id from public.calendar_entries where source_type = 'project_bid_due'
                   and source_id = 'c0000000-0000-0000-0000-000000000151' $$, 'bid due: cleared bid time removes the line');

-- Field tools.
update public.projects set modules = '{bids,files,calendar}', stage = 'construction' where id = 'c0000000-0000-0000-0000-000000000151';
select is((select modules from public.projects where id = 'c0000000-0000-0000-0000-000000000151'),
  '{bids,calendar,corrections,dailies,deliveries,files,inspections,permits,rfis}'::text[], 'field tools: a job moved to construction gets them');
insert into public.projects (id, org_id, name, stage, created_by)
values ('c0000000-0000-0000-0000-000000000152', 'b0000000-0000-0000-0000-000000000151', 'Cal Job Two', 'construction',
        'a0000000-0000-0000-0000-000000000154');
select ok((select modules @> '{dailies,inspections,deliveries,corrections}' from public.projects
           where id = 'c0000000-0000-0000-0000-000000000152'), 'field tools: a new job under construction has them');
-- Since 0040 the rail is the role's recommendation (roles.recommended_tools) unless someone pins their own.
select ok((select recommended_tools @> '{dailies,inspections}' from public.roles where name = 'inspector'),
  'rail: the field tools are recommended to the field roles');

select * from finish();
rollback;
