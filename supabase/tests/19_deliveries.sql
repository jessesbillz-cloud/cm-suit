begin;
select plan(65);
-- SPEC §13.3 deliveries (migration 0025): capabilities and RLS, DB-owned receipt numbers, overlap -> Standby,
-- version-checked and audited edits, delete needs a typed name and can be undone, the calendar mirror, the job's
-- company list, and the delivery link (SPEC §6.4 #3): board fields only, rotation locks out the old link, undo.
\ir _helpers.psql

-- A week out, in a zone without daylight saving, so the expected instants never depend on the run date.
create function pg_temp.day() returns date language sql stable as $$ select current_date + 7 $$;
create function pg_temp.at(p_time text) returns timestamptz language sql stable as $$
  select (pg_temp.day() + p_time::time) at time zone 'America/Phoenix' $$;
create temp table ids (k text primary key, id uuid not null);
create temp table tok (k text primary key, v text not null);
grant execute on function pg_temp.day() to public;
grant execute on function pg_temp.at(text) to public;
grant all on ids, tok to public;

select pg_temp.mk_user('a0000000-0000-0000-0000-000000000190', 'probe+del-admin@example.test', 'Del Admin');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000191', 'probe+del-super@example.test', 'Del Super');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000192', 'probe+del-foreman@example.test', 'Del Foreman');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000193', 'probe+del-sub@example.test', 'Del Sub');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000194', 'probe+del-inspector@example.test', 'Del Inspector');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000195', 'probe+del-bidder@example.test', 'Del Bidder');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000196', 'probe+del-outsider@example.test', 'Del Outsider');

insert into public.orgs (id, name, kind, created_by) values
  ('b0000000-0000-0000-0000-000000000191', 'Sample GC', 'gc', 'a0000000-0000-0000-0000-000000000190'),
  ('b0000000-0000-0000-0000-000000000192', 'Sample Steel Co', 'sub', 'a0000000-0000-0000-0000-000000000193');
-- Under construction: the field tools (deliveries) are on (0021).
insert into public.projects (id, org_id, name, stage, timezone, created_by)
values ('c0000000-0000-0000-0000-000000000191', 'b0000000-0000-0000-0000-000000000191', 'Sample Delivery Job', 'construction',
        'America/Phoenix', 'a0000000-0000-0000-0000-000000000190');
insert into public.project_members (org_id, project_id, user_id, invite_email, member_org_id, role, status)
select 'b0000000-0000-0000-0000-000000000191', 'c0000000-0000-0000-0000-000000000191', u, e, o, r, 'active'
  from (values ('a0000000-0000-0000-0000-000000000191'::uuid, 'probe+del-super@example.test', 'b0000000-0000-0000-0000-000000000191'::uuid, 'superintendent'),
               ('a0000000-0000-0000-0000-000000000192', 'probe+del-foreman@example.test', 'b0000000-0000-0000-0000-000000000191', 'foreman'),
               ('a0000000-0000-0000-0000-000000000193', 'probe+del-sub@example.test', 'b0000000-0000-0000-0000-000000000192', 'sub'),
               ('a0000000-0000-0000-0000-000000000194', 'probe+del-inspector@example.test', null, 'inspector'),
               ('a0000000-0000-0000-0000-000000000195', 'probe+del-bidder@example.test', null, 'bidder')) v(u, e, o, r);

-- ---------------------------------------------------------------------------------------------------------------
-- Capabilities (data)
-- ---------------------------------------------------------------------------------------------------------------
select results_eq($$ select role from public.role_permissions where capability = 'deliveries.view' order by 1 $$,
  $$ values ('architect'::text), ('estimator'), ('foreman'), ('inspector'), ('inspector_admin'), ('owner_rep'), ('pe'), ('pm'), ('project_admin'),
            ('special_inspector'), ('sub'), ('superintendent'), ('viewer') $$,
  'deliveries.view: every role but bidder');
select results_eq($$ select role from public.role_permissions where capability = 'deliveries.post' order by 1 $$,
  $$ values ('foreman'::text), ('inspector_admin'), ('pe'), ('pm'), ('project_admin'), ('sub'), ('superintendent') $$,
  'deliveries.post: project admin, PM, PE, super, foreman, sub (and the inspector who runs the job, 0044)');

set local role authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- Posting (foreman), overlap -> Standby, numbers
-- ---------------------------------------------------------------------------------------------------------------
select pg_temp.login('a0000000-0000-0000-0000-000000000192');
insert into ids select 'a', public.post_delivery('c0000000-0000-0000-0000-000000000191', 'Sample Concrete Co', pg_temp.day(), 60, 'Slab pour', '07:00');
insert into ids select 'b', public.post_delivery('c0000000-0000-0000-0000-000000000191', 'Sample Concrete Co', pg_temp.day(), 60, 'Pump truck', '07:30');
insert into ids select 'c', public.post_delivery('c0000000-0000-0000-0000-000000000191', 'Sample Steel Co', pg_temp.day(), 60, 'Joists', '08:30');
insert into ids select 'd', public.post_delivery('c0000000-0000-0000-0000-000000000191', 'Sample Lumber', pg_temp.day(), 30, 'Blocking');

select results_eq($$ select d.number, d.standby from public.deliveries d join ids on ids.id = d.id order by ids.k $$,
  $$ values (1, false), (2, true), (3, false), (4, false) $$,
  'post: numbers 1-4 from the database; 7:30 over 7:00-8:00 is Standby; 8:30 touching 7:30-8:30 is not; TBD never is');
select is((select starts_at from public.deliveries where id = (select id from ids where k = 'a')), pg_temp.at('07:00'),
  'post: 7:00 is stored as the UTC instant of 7:00 on the job''s clock');
select is((select posted_name from public.deliveries where id = (select id from ids where k = 'a')), 'Del Foreman',
  'post: the receipt carries the member''s name');
select is(public.post_delivery('c0000000-0000-0000-0000-000000000191', 'Sample Concrete Co', pg_temp.day(), 60, 'Slab pour', '07:00'),
  (select id from ids where k = 'a'), 'post: the same post again (double tap) returns the first one');
select is((select count(*)::int from public.deliveries), 4, 'post: the repeat made no second delivery');
select throws_ok($$ select public.post_delivery('c0000000-0000-0000-0000-000000000191', ' ', pg_temp.day(), 60, 'x', '07:00') $$,
  '22023', null, 'post: company is required');
select throws_ok($$ insert into public.deliveries (org_id, project_id, number, company_id, delivery_date, description, posted_name)
  select org_id, project_id, 99, company_id, delivery_date, 'x', 'x' from public.deliveries limit 1 $$,
  '42501', null, 'direct insert: denied (RPCs only)');
select throws_ok($$ update public.deliveries set description = 'hacked' $$, '42501', null, 'direct update: denied (RPCs only)');

select pg_temp.login('a0000000-0000-0000-0000-000000000194');
select throws_ok($$ select public.post_delivery('c0000000-0000-0000-0000-000000000191', 'X', pg_temp.day(), 60, 'x', '07:00') $$,
  '42501', null, 'inspector (view only): cannot post');
select is((select count(*)::int from public.deliveries), 4, 'inspector: sees the board');

-- ---------------------------------------------------------------------------------------------------------------
-- RLS by capability
-- ---------------------------------------------------------------------------------------------------------------
select pg_temp.login('a0000000-0000-0000-0000-000000000195');
select is_empty($$ select id from public.deliveries $$, 'bidder: no deliveries');
select is_empty($$ select id from public.calendar_entries where source_type = 'delivery' $$, 'bidder: no delivery calendar lines');
select throws_ok($$ select * from public.delivery_company_options('c0000000-0000-0000-0000-000000000191') $$, '42501', null,
  'bidder: no company list');
select pg_temp.login('a0000000-0000-0000-0000-000000000196');
select is_empty($$ select id from public.deliveries $$, 'non-member: no deliveries');
select pg_temp.login('a0000000-0000-0000-0000-000000000193');
select is((select count(*)::int from public.deliveries), 4, 'sub: sees the board');
select is((select count(*)::int from public.calendar_entries where source_type = 'delivery'), 4, 'sub: sees the delivery calendar lines');
select results_eq($$ select name, uses from public.delivery_company_options('c0000000-0000-0000-0000-000000000191') $$,
  $$ values ('Sample Concrete Co'::text, 2), ('Sample Lumber', 1), ('Sample Steel Co', 1), ('Sample GC', 0) $$,
  'company list: most-used first, then the member companies not used yet');

-- ---------------------------------------------------------------------------------------------------------------
-- Calendar mirror
-- ---------------------------------------------------------------------------------------------------------------
select results_eq($$ select kind, title, starts_at, ends_at, all_day, status, read_capability from public.calendar_entries
                     where source_type = 'delivery' and source_id = (select id from ids where k = 'a') $$,
  $$ select 'deliveries'::text, 'Sample Concrete Co: Slab pour'::text, pg_temp.at('07:00'), pg_temp.at('08:00'), false,
            'confirmed'::text, 'deliveries.view'::text $$,
  'mirror: kind deliveries, "{company}: {description}", start/end, confirmed, read by deliveries.view');
select is((select status from public.calendar_entries where source_type = 'delivery' and source_id = (select id from ids where k = 'b')),
  'pending', 'mirror: a Standby delivery is pending');
select results_eq($$ select starts_at, ends_at, all_day from public.calendar_entries
                     where source_type = 'delivery' and source_id = (select id from ids where k = 'd') $$,
  $$ select pg_temp.at('00:00'), null::timestamptz, true $$, 'mirror: time TBD is an all-day line');

-- ---------------------------------------------------------------------------------------------------------------
-- Edits: version check, poster or deliveries.manage, audited, Standby recomputed when the time moves
-- ---------------------------------------------------------------------------------------------------------------
select throws_ok($$ select public.update_delivery((select id from ids where k = 'a'), 1, 'Sample Concrete Co', pg_temp.day(), 60, 'x', '07:00') $$,
  '42501', null, 'edit: a sub cannot edit the foreman''s delivery');
select pg_temp.login('a0000000-0000-0000-0000-000000000192');
select throws_ok($$ select public.update_delivery((select id from ids where k = 'a'), 99, 'Sample Concrete Co', pg_temp.day(), 60, 'x', '07:00') $$,
  '40001', null, 'edit: a stale version is refused');
select is(public.update_delivery((select id from ids where k = 'a'), 1, 'Sample Concrete Co', pg_temp.day(), 60, 'Slab pour, area B', '07:00'),
  2, 'edit: the poster edits; the version goes up');
select is(public.update_delivery((select id from ids where k = 'a'), 2, 'Sample Concrete Co', pg_temp.day(), 60, 'Slab pour, area B', '07:00'),
  2, 'edit: saving the same values changes nothing');
select pg_temp.login('a0000000-0000-0000-0000-000000000191');
select lives_ok($$ select public.update_delivery((select id from ids where k = 'b'), 1, 'Sample Concrete Co', pg_temp.day(), 60, 'Pump truck', '09:45') $$,
  'edit: deliveries.manage edits anyone''s');
select is((select standby from public.deliveries where id = (select id from ids where k = 'b')), false,
  'edit: moved to a free time, Standby clears');
select is((select status from public.calendar_entries where source_type = 'delivery' and source_id = (select id from ids where k = 'b')),
  'confirmed', 'edit: the calendar line follows');
select pg_temp.login('a0000000-0000-0000-0000-000000000192');
select lives_ok($$ select public.update_delivery((select id from ids where k = 'd'), 1, 'Sample Lumber', pg_temp.day(), 30, 'Blocking', '07:15') $$,
  'edit: TBD given a time');
select is((select standby from public.deliveries where id = (select id from ids where k = 'd')), true,
  'edit: moved onto 7:00-8:00, it becomes Standby');

-- ---------------------------------------------------------------------------------------------------------------
-- Delete needs a name, is audited, comes off the calendar; Undo brings both back
-- ---------------------------------------------------------------------------------------------------------------
select throws_ok($$ select public.delete_delivery((select id from ids where k = 'c'), 1, '  ') $$, '22023', null,
  'delete: a typed name is required');
select lives_ok($$ select public.delete_delivery((select id from ids where k = 'c'), 1, 'Sample Foreman') $$, 'delete: with a name');
select is((select deleted_name from public.deliveries where id = (select id from ids where k = 'c')), 'Sample Foreman',
  'delete: the typed name is kept');
select is_empty($$ select id from public.calendar_entries where source_type = 'delivery' and source_id = (select id from ids where k = 'c') $$,
  'delete: the calendar line comes off');
select lives_ok($$ select public.restore_delivery((select id from ids where k = 'c')) $$, 'undo: restore');
select isnt_empty($$ select id from public.calendar_entries where source_type = 'delivery' and source_id = (select id from ids where k = 'c') $$,
  'undo: the calendar line is back');
select results_eq($$ select action, actor_name from public.delivery_history((select id from ids where k = 'c')) $$,
  $$ values ('delivery.create'::text, 'Del Foreman'::text), ('delivery.delete', 'Del Foreman'), ('delivery.restore', 'Del Foreman') $$,
  'history: create, delete, restore with who');
select ok((select details->'changes' ? 'description' from public.delivery_history((select id from ids where k = 'a'))
           where action = 'delivery.update'), 'history: the edit records what changed');

-- ---------------------------------------------------------------------------------------------------------------
-- Delivery tickets folder
-- ---------------------------------------------------------------------------------------------------------------
insert into ids select 'folder', public.delivery_folder('c0000000-0000-0000-0000-000000000191');
select is(public.delivery_folder('c0000000-0000-0000-0000-000000000191'), (select id from ids where k = 'folder'),
  'folder: made once, then reused');
select ok(public.folder_can_write((select id from ids where k = 'folder')), 'folder: posters can upload tickets');
select pg_temp.login('a0000000-0000-0000-0000-000000000194');
select ok(public.folder_can_read((select id from ids where k = 'folder')) and not public.folder_can_write((select id from ids where k = 'folder')),
  'folder: viewers read, cannot upload');

-- ---------------------------------------------------------------------------------------------------------------
-- The delivery link
-- ---------------------------------------------------------------------------------------------------------------
select pg_temp.login('a0000000-0000-0000-0000-000000000193');
select throws_ok($$ select public.rotate_delivery_link('c0000000-0000-0000-0000-000000000191') $$, '42501', null,
  'link: a sub cannot make the link');
select pg_temp.login('a0000000-0000-0000-0000-000000000191');
insert into tok select 'one', public.rotate_delivery_link('c0000000-0000-0000-0000-000000000191');
select ok((select v ~ '^[A-Za-z0-9_-]{43}$' from tok where k = 'one'), 'link: the raw token is 43 url-safe characters');
select is((select active from public.delivery_link_state('c0000000-0000-0000-0000-000000000191')), true, 'link: state shows it on');
select throws_ok($$ select public.link_delivery_board('c0000000-0000-0000-0000-000000000191', 'x', current_date, current_date) $$,
  '42501', null, 'link: the link RPCs are not callable by people');
reset role;
select is((select delivery_token_hash from public.projects where id = 'c0000000-0000-0000-0000-000000000191'),
  (select encode(extensions.digest(v, 'sha256'), 'hex') from tok where k = 'one'), 'link: only the sha256 is stored');

set local role service_role;
select pg_temp.login_service();
create temp table board as
  select public.link_delivery_board('c0000000-0000-0000-0000-000000000191',
    (select encode(extensions.digest(v, 'sha256'), 'hex') from tok where k = 'one'), current_date, current_date + 20) as b;
select results_eq($$ select distinct k from board, jsonb_array_elements(b->'deliveries') e, jsonb_object_keys(e) k order by 1 $$,
  $$ values ('company'::text), ('delivery_date'), ('description'), ('duration_min'), ('number'), ('standby'), ('starts_at') $$,
  'link board: board fields only');
select ok((select b::text !~ '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}' and b::text !~ '@' and b::text !~ 'Del Foreman' from board),
  'link board: no ids, no emails, no poster names');
select is((select jsonb_array_length(b->'deliveries') from board), 4, 'link board: the live deliveries in range');
select is(public.link_delivery_board('c0000000-0000-0000-0000-000000000191', repeat('0', 64), current_date, current_date + 20), null,
  'link board: a wrong token opens nothing');

create temp table receipt as
  select public.link_post_delivery('c0000000-0000-0000-0000-000000000191',
    (select encode(extensions.digest(v, 'sha256'), 'hex') from tok where k = 'one'),
    'Sample Driver', 'Sample Crane Rental', pg_temp.day(), 30, 'Crane mats', '07:00') as r;
select results_eq($$ select (r->>'number')::int, (r->>'standby')::boolean, r->>'posted_name' from receipt $$,
  $$ values (5, true, 'Sample Driver'::text) $$, 'link post: next number, overlap is Standby, typed name on the receipt');
select results_eq($$ select k from receipt, jsonb_object_keys(r) k order by 1 $$,
  $$ values ('company'::text), ('delivery_date'), ('description'), ('duration_min'), ('id'), ('number'), ('posted_at'),
            ('posted_name'), ('standby'), ('starts_at') $$, 'link receipt: board fields plus its id, name and time');
select ok((select via_link and created_by is null from public.deliveries where id = (select (r->>'id')::uuid from receipt)),
  'link post: marked as posted by the link');
select ok(exists (select 1 from public.activity where kind = 'delivery.posted' and entity_id = (select (r->>'id')::uuid from receipt)
                  and audience_capability = 'deliveries.manage'), 'link post: a board line for deliveries.manage');
select is(public.link_delivery_receipt('c0000000-0000-0000-0000-000000000191',
    (select encode(extensions.digest(v, 'sha256'), 'hex') from tok where k = 'one'), (select id from ids where k = 'a')), null,
  'link receipt: a member''s delivery is not readable by the link');

reset role;
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000193');
select ok(exists (select 1 from public.delivery_company_options('c0000000-0000-0000-0000-000000000191') where name = 'Sample Crane Rental'),
  'company list: "Other" on the link added the name for everyone');

-- Rotating locks out the old link; Undo lets it back in.
select pg_temp.login('a0000000-0000-0000-0000-000000000191');
insert into tok select 'two', public.rotate_delivery_link('c0000000-0000-0000-0000-000000000191');
reset role;
set local role service_role;
select pg_temp.login_service();
select ok(public.link_delivery_board('c0000000-0000-0000-0000-000000000191', (select encode(extensions.digest(v, 'sha256'), 'hex') from tok where k = 'one'),
            current_date, current_date) is null
          and public.link_delivery_board('c0000000-0000-0000-0000-000000000191', (select encode(extensions.digest(v, 'sha256'), 'hex') from tok where k = 'two'),
            current_date, current_date) is not null,
  'rotate: the old link is locked out, the new one works');
reset role;
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000191');
select lives_ok($$ select public.undo_delivery_link_rotation('c0000000-0000-0000-0000-000000000191') $$, 'rotate: undo');
reset role;
select is((select delivery_token_hash from public.projects where id = 'c0000000-0000-0000-0000-000000000191'),
  (select encode(extensions.digest(v, 'sha256'), 'hex') from tok where k = 'one'), 'rotate: undo puts the old link back');

-- ---------------------------------------------------------------------------------------------------------------
-- Monthly review; numbers are unique per job
-- ---------------------------------------------------------------------------------------------------------------
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000191');
select lives_ok($$ select public.review_delivery_month('c0000000-0000-0000-0000-000000000191', pg_temp.day(), 'Del Super', 'Sample GC') $$,
  'review: "I reviewed this month"');
select lives_ok($$ select public.review_delivery_month('c0000000-0000-0000-0000-000000000191', pg_temp.day(), 'Del Super', 'Sample GC') $$,
  'review: safe to repeat');
select results_eq($$ select month, name, company from public.delivery_reviews $$,
  $$ select date_trunc('month', pg_temp.day())::date, 'Del Super'::text, 'Sample GC'::text $$, 'review: one row per person per month');
select pg_temp.login('a0000000-0000-0000-0000-000000000193');
select throws_ok($$ select public.review_delivery_month('c0000000-0000-0000-0000-000000000191', pg_temp.day(), 'x', '') $$,
  '42501', null, 'review: deliveries.manage only');
reset role;
select throws_ok($$ insert into public.deliveries (org_id, project_id, number, company_id, delivery_date, description, posted_name, created_by)
  select org_id, project_id, 1, company_id, delivery_date, 'dup', 'dup', created_by from public.deliveries where number = 2 $$,
  '23505', null, 'numbers: unique per job');

select * from finish();
rollback;
