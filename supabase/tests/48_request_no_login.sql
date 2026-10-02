begin;
select plan(84);
-- Migration 0055: inspection requests from the request link with no login, and the Requester role. The link
-- functions are service-role only, check the token themselves and answer null alike for a wrong token and a job that
-- does not exist; a request is numbered by the database like a member's, carries the visitor's contact and goes
-- through the GC step and board lines like a member's; the outsider's day is the anonymized calendar; the private
-- status link answers the tracker and the result line only; a link visitor who signs in is a requester (ir.request,
-- comments.write), and link-made subs that no person changed become requesters.
\ir _helpers.psql

create temp table res (k text primary key, j jsonb);
grant all on res to public;
create function pg_temp.h(p text) returns text language sql immutable as $$ select encode(extensions.digest(p, 'sha256'), 'hex') $$;
create function pg_temp.d(p_days int) returns date language sql stable as $$
  select (now() at time zone 'America/Los_Angeles')::date + p_days $$;
create function pg_temp.j(p_k text) returns jsonb language sql stable as $$ select j from res where k = p_k $$;
create function pg_temp.rid(p_k text) returns uuid language sql stable security definer as $$
  select r.id from public.inspection_requests r
   where r.project_id = 'c0000000-0000-0000-0000-000000000481' and r.number = ((select j from res where k = p_k)->>'number')::int $$;
-- The job's Plans folder, whoever is logged in.
create function pg_temp.plans() returns uuid language sql stable security definer as $$
  select id from public.folders where project_id = 'c0000000-0000-0000-0000-000000000481' and kind = 'plans' limit 1 $$;
create function pg_temp.ver(p_id uuid) returns int language sql stable security definer as $$
  select version from public.inspection_requests where id = p_id $$;
-- link_request_submit with every argument named; the visitor's company is always Sample Framing here.
create function pg_temp.send(p_job uuid, p_hash text, p_name text, p_phone text, p_email text, p_day date, p_time time,
                             p_kind text, p_items text, p_ack boolean, p_files uuid[] default '{}', p_special uuid default null)
returns jsonb language sql as $$
  select public.link_request_submit(p_project_id => p_job, p_token_hash => p_hash, p_hub_id => null, p_name => p_name,
    p_company => 'Sample Framing', p_phone => p_phone, p_email => p_email, p_request_date => p_day, p_kind => p_kind,
    p_items => p_items, p_notice_ack => p_ack, p_start_time => p_time, p_duration_kind => 'timed', p_duration_min => 60,
    p_special_kind_id => p_special, p_attachment_ids => p_files) $$;
grant execute on function pg_temp.h(text), pg_temp.d(int), pg_temp.j(text), pg_temp.rid(text), pg_temp.plans(), pg_temp.ver(uuid),
  pg_temp.send(uuid, text, text, text, text, date, time, text, text, boolean, uuid[], uuid) to public;

select pg_temp.mk_user('a0000000-0000-0000-0000-000000000481', 'probe+nl-insp@example.test', 'NL Inspector');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000482', 'probe+nl-admin@example.test', 'NL Admin');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000483', 'probe+nl-sub@example.test', 'NL Direct Sub');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000484', 'probe+nl-linked@example.test', 'NL Link Sub');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000485', 'probe+nl-changed@example.test', 'NL Changed Sub');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000486', 'probe+nl-joiner@example.test', '');

insert into public.orgs (id, name, kind, created_by) values
  ('b0000000-0000-0000-0000-000000000481', 'Sample GC Co', 'gc', 'a0000000-0000-0000-0000-000000000482');
-- J takes requests through its link; K is another job with its own link. Both under construction (Inspections on).
insert into public.projects (id, org_id, name, stage, timezone, created_by) values
  ('c0000000-0000-0000-0000-000000000481', 'b0000000-0000-0000-0000-000000000481', 'Sample Link Job', 'construction',
   'America/Los_Angeles', 'a0000000-0000-0000-0000-000000000482'),
  ('c0000000-0000-0000-0000-000000000482', 'b0000000-0000-0000-0000-000000000481', 'Sample Other Job', 'construction',
   'America/Los_Angeles', 'a0000000-0000-0000-0000-000000000482');
update public.projects set request_token_hash = pg_temp.h('job-token') where id = 'c0000000-0000-0000-0000-000000000481';
update public.projects set request_token_hash = pg_temp.h('other-token') where id = 'c0000000-0000-0000-0000-000000000482';

insert into public.project_members (org_id, project_id, user_id, invite_email, role, status)
values
  ('b0000000-0000-0000-0000-000000000481', 'c0000000-0000-0000-0000-000000000481', 'a0000000-0000-0000-0000-000000000481',
   'probe+nl-insp@example.test', 'inspector', 'active'),
  ('b0000000-0000-0000-0000-000000000481', 'c0000000-0000-0000-0000-000000000481', 'a0000000-0000-0000-0000-000000000483',
   'probe+nl-sub@example.test', 'sub', 'active');
-- Two subs the request link made before 0055 (its join line, then the sign-in); a person later changed the second.
insert into public.project_members (org_id, project_id, invite_email, role, status)
values
  ('b0000000-0000-0000-0000-000000000481', 'c0000000-0000-0000-0000-000000000481', 'probe+nl-linked@example.test', 'sub', 'invited'),
  ('b0000000-0000-0000-0000-000000000481', 'c0000000-0000-0000-0000-000000000481', 'probe+nl-changed@example.test', 'sub', 'invited');
select public.audit('request_link.join', 'project_member', pm.id, pm.project_id, pm.org_id, '{"via":"link"}'::jsonb, null, 'public_link')
  from public.project_members pm where pm.invite_email in ('probe+nl-linked@example.test', 'probe+nl-changed@example.test');
update public.project_members pm set user_id = u.id, status = 'active'
  from auth.users u where u.email = pm.invite_email and pm.invite_email in ('probe+nl-linked@example.test', 'probe+nl-changed@example.test');
update public.project_members set member_org_id = 'b0000000-0000-0000-0000-000000000481'
 where invite_email = 'probe+nl-changed@example.test';

-- ---------------------------------------------------------------------------------------------------------------------
-- The role, as data
-- ---------------------------------------------------------------------------------------------------------------------
select results_eq($$ select description, recommended_tools from public.roles where name = 'requester' $$,
  $$ values ('Requester'::text, '{inspections}'::text[]) $$, 'role: Requester, with Inspections on its rail');
select results_eq($$ select capability from public.role_permissions where role = 'requester' order by 1 $$,
  $$ values ('comments.write'::text), ('ir.request') $$, 'role: requests and comments on its own requests, nothing else');

-- ---------------------------------------------------------------------------------------------------------------------
-- Link-made subs become requesters; a sub a person invited or changed stays a sub
-- ---------------------------------------------------------------------------------------------------------------------
select is(public.requester_backfill(), 1, 'backfill: the one untouched link-made sub moves');
select results_eq(
  $$ select invite_email, role from public.project_members
      where project_id = 'c0000000-0000-0000-0000-000000000481' and invite_email like 'probe+nl-%' order by 1 $$,
  $$ values ('probe+nl-admin@example.test'::text, 'project_admin'::text), ('probe+nl-changed@example.test', 'sub'),
            ('probe+nl-insp@example.test', 'inspector'),
            ('probe+nl-linked@example.test', 'requester'), ('probe+nl-sub@example.test', 'sub') $$,
  'backfill: the link-made sub is a requester; the directly invited and the changed one stay subs');
select is(public.requester_backfill(), 0, 'backfill: safe to run again');
select ok(exists (select 1 from public.audit_events where action = 'request_link.requester' and details->>'to' = 'requester'),
  'backfill: each move is audited');

set local role authenticated;
select ok(pg_temp.cap_as('a0000000-0000-0000-0000-000000000484', 'c0000000-0000-0000-0000-000000000481', 'ir.request'),
  'requester: may request inspections');
select ok(not pg_temp.cap_as('a0000000-0000-0000-0000-000000000484', 'c0000000-0000-0000-0000-000000000481', 'files.read_project')
          and not pg_temp.cap_as('a0000000-0000-0000-0000-000000000484', 'c0000000-0000-0000-0000-000000000481', 'members.view')
          and not pg_temp.cap_as('a0000000-0000-0000-0000-000000000484', 'c0000000-0000-0000-0000-000000000481', 'rfi.create_draft')
          and not pg_temp.cap_as('a0000000-0000-0000-0000-000000000484', 'c0000000-0000-0000-0000-000000000481', 'corrections.view')
          and not pg_temp.cap_as('a0000000-0000-0000-0000-000000000484', 'c0000000-0000-0000-0000-000000000481', 'deliveries.view')
          and not pg_temp.cap_as('a0000000-0000-0000-0000-000000000484', 'c0000000-0000-0000-0000-000000000481', 'calendar.read'),
  'requester: no files, people, RFIs, corrections, deliveries or calendar');
select ok(not pg_temp.can_read_as('a0000000-0000-0000-0000-000000000484', pg_temp.plans())
          and pg_temp.can_read_as('a0000000-0000-0000-0000-000000000483', pg_temp.plans()),
  'requester: the plans are closed (a sub still reads them)');
select pg_temp.login('a0000000-0000-0000-0000-000000000484');
select is((select count(*)::int from public.project_members where project_id = 'c0000000-0000-0000-0000-000000000481'), 1,
  'requester: sees no one on the people list but themselves');
select lives_ok($$ select public.ir_form_context('c0000000-0000-0000-0000-000000000481') $$, 'requester: opens the request form');
select pg_temp.login('a0000000-0000-0000-0000-000000000483');
select ok((select count(*) from public.project_members where project_id = 'c0000000-0000-0000-0000-000000000481') > 1,
  'sub: still sees the people list');

-- ---------------------------------------------------------------------------------------------------------------------
-- Joining from the link now makes a requester
-- ---------------------------------------------------------------------------------------------------------------------
reset role;
set local role service_role;
select pg_temp.login_service();
select is(public.link_request_join('c0000000-0000-0000-0000-000000000481', pg_temp.h('job-token'), null,
            'probe+nl-joiner@example.test', 'Sample Joiner', 'Sample Electric')->>'status', 'added', 'join: a new address is added');
reset role;
select is((select role from public.project_members where invite_email = 'probe+nl-joiner@example.test'), 'requester',
  'join: as a requester, never a sub');

-- ---------------------------------------------------------------------------------------------------------------------
-- The outsider's day: time, length, type and color only
-- ---------------------------------------------------------------------------------------------------------------------
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000483');
select public.ir_submit(p_project_id => 'c0000000-0000-0000-0000-000000000481', p_company => 'Sample Concrete Co',
  p_request_date => pg_temp.d(1), p_kind => 'ior', p_items => 'Secret items', p_notice_ack => true, p_start_time => '08:00',
  p_duration_kind => 'timed', p_duration_min => 60);
reset role;
update public.projects set settings = settings || '{"ir_gc_approval": true}'::jsonb where id = 'c0000000-0000-0000-0000-000000000481';
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000483');
select public.ir_submit(p_project_id => 'c0000000-0000-0000-0000-000000000481', p_company => 'Sample Concrete Co',
  p_request_date => pg_temp.d(1), p_kind => 'ior', p_items => 'Waiting on the GC', p_notice_ack => true, p_start_time => '11:00',
  p_duration_kind => 'timed', p_duration_min => 30);
select pg_temp.login('a0000000-0000-0000-0000-000000000481');
insert into public.ir_blocks (org_id, project_id, block_date, start_time, end_time, created_by)
values ('b0000000-0000-0000-0000-000000000481', 'c0000000-0000-0000-0000-000000000481', pg_temp.d(1), '13:00', '14:00',
        'a0000000-0000-0000-0000-000000000481');
reset role;
update public.projects set settings = settings || '{"ir_gc_approval": false}'::jsonb where id = 'c0000000-0000-0000-0000-000000000481';

set local role service_role;
select pg_temp.login_service();
insert into res values ('cal', public.link_request_calendar('c0000000-0000-0000-0000-000000000481', pg_temp.h('job-token'), null, pg_temp.d(1)));
select results_eq($$ select k from jsonb_object_keys(pg_temp.j('cal')) k order by 1 $$,
  $$ values ('day'::text), ('kinds'), ('ofs'), ('rows'), ('today') $$, 'calendar: the day, the form''s choices and the rows');
select results_eq($$ select distinct k from jsonb_array_elements(pg_temp.j('cal')->'rows') e, jsonb_object_keys(e) k order by 1 $$,
  $$ values ('duration_kind'::text), ('duration_min'), ('kind'), ('start_time'), ('status_key') $$,
  'calendar: each row is time, length, type and color only');
select results_eq($$ select e->>'start_time', e->>'kind', e->>'status_key' from jsonb_array_elements(pg_temp.j('cal')->'rows') e $$,
  $$ values ('08:00:00'::text, 'ior'::text, 'pending'::text), ('13:00:00', 'block', 'blocked') $$,
  'calendar: the member''s request and the blocked time; a request still with the GC is not shown');
select ok(pg_temp.j('cal')::text not like '%Secret items%' and pg_temp.j('cal')::text not like '%Sample Concrete Co%'
          and pg_temp.j('cal')::text not like '%NL %', 'calendar: no company, items or names');
select is(public.link_request_calendar('c0000000-0000-0000-0000-000000000481', pg_temp.h('job-token'))->>'day', pg_temp.d(0)::text,
  'calendar: no day asked is the job''s today');
select is(public.link_request_calendar('c0000000-0000-0000-0000-000000000481', pg_temp.h('other-token'), null, pg_temp.d(1)), null,
  'calendar: another job''s token opens nothing');
select is(public.link_request_calendar('c0000000-0000-0000-0000-0000000004ff', pg_temp.h('job-token'), null, pg_temp.d(1)), null,
  'calendar: a job that does not exist answers the same null');
select throws_ok($$ select public.link_request_calendar('c0000000-0000-0000-0000-000000000481', pg_temp.h('job-token'), null, pg_temp.d(-1)) $$,
  '22023', 'Pick today or a later day.', 'calendar: never a past day');

-- ---------------------------------------------------------------------------------------------------------------------
-- Submit: the next number, the contact, the GC step, the board lines
-- ---------------------------------------------------------------------------------------------------------------------
insert into res values ('s1', pg_temp.send('c0000000-0000-0000-0000-000000000481', pg_temp.h('job-token'), '  Sample   Visitor ',
  '(555) 010-2030', ' Visitor@Example.test ', pg_temp.d(2), '10:00', 'ior', 'North wall framing', true));
select is(pg_temp.j('s1')->>'number', '3', 'submit: the next number from the job''s one numbering');
select results_eq($$ select k from jsonb_object_keys(pg_temp.j('s1')) k order by 1 $$,
  $$ values ('duration_kind'::text), ('duration_min'), ('gc_step'), ('kind'), ('number'), ('project_name'), ('receipt'),
            ('request_date'), ('result'), ('result_note'), ('special_kind'), ('start_time'), ('status') $$,
  'submit: the receipt facts and the receipt token');
select is(pg_temp.j('s1')->>'status', 'pending', 'submit: GC step off, straight to the inspector');
select ok((pg_temp.j('s1')->>'receipt') ~ '^[A-Za-z0-9_-]{43}$', 'submit: a 43-character receipt token');
reset role;
select results_eq(
  $$ select requested_by is null, created_by is null, requester_name, requester_phone, requester_email, company, status, kind
       from public.inspection_requests where id = pg_temp.rid('s1') $$,
  $$ values (true, true, 'Sample Visitor'::text, '(555) 010-2030'::text, 'visitor@example.test'::text, 'Sample Framing'::text,
             'pending'::text, 'ior'::text) $$,
  'submit: no member behind it; the visitor''s name, phone, email and company on the row');
select ok(exists (select 1 from public.ir_link_receipts where token_hash = pg_temp.h(pg_temp.j('s1')->>'receipt')
                  and request_id = pg_temp.rid('s1')), 'submit: only the receipt''s sha256 is kept');
select ok(not exists (select 1 from public.audit_events where details::text like '%' || (pg_temp.j('s1')->>'receipt') || '%')
          and not exists (select 1 from public.ir_events where changes::text like '%' || (pg_temp.j('s1')->>'receipt') || '%'),
  'submit: the raw receipt token is kept nowhere');
select ok(exists (select 1 from public.activity where entity_id = pg_temp.rid('s1') and kind = 'ir.requested'
                  and audience_capability = 'ir.view_all' and actor_user_id is null
                  and summary like 'IR 3 requested · Sample Visitor (Sample Framing) · %'),
  'submit: the board line to the inspectors and the GC team names the visitor');
select results_eq($$ select action, actor_id is null from public.ir_events where request_id = pg_temp.rid('s1') $$,
  $$ values ('submit'::text, true) $$, 'submit: history has the submit, with no member as its actor');
select ok(exists (select 1 from public.calendar_entries where source_type = 'inspection_request' and source_id = pg_temp.rid('s1')),
  'submit: on the job calendar like any request');
select ok(exists (select 1 from public.audit_events where action = 'request_link.submit' and actor_kind = 'public_link'
                  and entity_id = pg_temp.rid('s1') and details->>'name' = 'Sample Visitor'), 'submit: audited as the public link');

set local role service_role;
select pg_temp.login_service();
insert into res values ('s1again', pg_temp.send('c0000000-0000-0000-0000-000000000481', pg_temp.h('job-token'), 'Sample Visitor',
  '(555) 010-2030', 'visitor@example.test', pg_temp.d(2), '10:00', 'ior', 'North wall framing', true));
select is(pg_temp.j('s1again')->>'number', '3', 'repeat: the same request answers (no second number)');
select ok(public.link_request_status('c0000000-0000-0000-0000-000000000481', pg_temp.h(pg_temp.j('s1')->>'receipt')) is not null
          and public.link_request_status('c0000000-0000-0000-0000-000000000481', pg_temp.h(pg_temp.j('s1again')->>'receipt')) is not null,
  'repeat: both answers'' status links work');
reset role;
select is((select count(*)::int from public.inspection_requests where requester_name = 'Sample Visitor'), 1, 'repeat: one request');

update public.projects set settings = settings || '{"ir_gc_approval": true}'::jsonb where id = 'c0000000-0000-0000-0000-000000000481';
set local role service_role;
select pg_temp.login_service();
insert into res values ('gc', pg_temp.send('c0000000-0000-0000-0000-000000000481', pg_temp.h('job-token'), 'Sample Foreman',
  null, 'foreman@example.test', pg_temp.d(3), null, 'ior', 'Shear wall nailing', true));
select results_eq($$ select pg_temp.j('gc')->>'status', pg_temp.j('gc')->>'gc_step' $$, $$ values ('gc_review'::text, 'true'::text) $$,
  'GC step on: the visitor''s request goes to the GC first');
reset role;
select ok(exists (select 1 from public.activity where entity_id = pg_temp.rid('gc') and kind = 'ir.gc_review'
                  and audience_capability = 'ir.gc_approve' and summary like 'IR 4 to review · Sample Foreman (Sample Framing) · %'),
  'GC step on: the board line goes to the GC approvers');
update public.projects set settings = settings || '{"ir_gc_approval": false}'::jsonb where id = 'c0000000-0000-0000-0000-000000000481';

set local role service_role;
select pg_temp.login_service();
select throws_ok($$ select pg_temp.send('c0000000-0000-0000-0000-000000000481', pg_temp.h('job-token'), 'Sample A', '5550102030', null,
  pg_temp.d(2), '10:00', 'ior', 'Items', false) $$, '22023', 'Check the notice box first.', 'submit: the notice box is required');
select throws_ok($$ select pg_temp.send('c0000000-0000-0000-0000-000000000481', pg_temp.h('job-token'), 'Sample A', ' ', '',
  pg_temp.d(2), '10:00', 'ior', 'Items', true) $$, '22023', 'Add a phone or an email.', 'submit: a phone or an email is required');
select throws_ok($$ select pg_temp.send('c0000000-0000-0000-0000-000000000481', pg_temp.h('job-token'), 'Sample A', null, 'not-an-email',
  pg_temp.d(2), '10:00', 'ior', 'Items', true) $$, '22023', 'Check the email.', 'submit: a malformed email is refused');
select throws_ok($$ select pg_temp.send('c0000000-0000-0000-0000-000000000481', pg_temp.h('job-token'), 'Sample A', 'call me', null,
  pg_temp.d(2), '10:00', 'ior', 'Items', true) $$, '22023', 'Check the phone number.', 'submit: a malformed phone is refused');
select throws_ok($$ select pg_temp.send('c0000000-0000-0000-0000-000000000481', pg_temp.h('job-token'), 'Sample A', '5550102030', null,
  pg_temp.d(-1), '10:00', 'ior', 'Items', true) $$, '22023', 'Pick today or a later day.', 'submit: never a past day');
select throws_ok($$ select pg_temp.send('c0000000-0000-0000-0000-000000000481', pg_temp.h('job-token'), 'Sample A', '5550102030', null,
  pg_temp.d(2), '10:00', 'ofs', 'Items', true) $$, '22023', 'OFS is off for this job.', 'submit: OFS only where the job allows it');
select throws_ok($$ select pg_temp.send('c0000000-0000-0000-0000-000000000481', pg_temp.h('job-token'), 'Sample A', '5550102030', null,
  pg_temp.d(2), '10:00', 'special', 'Items', true) $$, '22023', 'Pick the special inspection.', 'submit: a special names its kind');
select is(pg_temp.send('c0000000-0000-0000-0000-000000000481', pg_temp.h('other-token'), 'Sample B', '5550102030', null,
  pg_temp.d(2), '10:00', 'ior', 'Items', true), null, 'submit: a wrong token answers null');
select is(pg_temp.send('c0000000-0000-0000-0000-0000000004ff', pg_temp.h('job-token'), 'Sample B', '5550102030', null,
  pg_temp.d(2), '10:00', 'ior', 'Items', true), null, 'submit: a job that does not exist answers the same null');
reset role;
select is((select count(*)::int from public.inspection_requests where requester_name in ('Sample A', 'Sample B')), 0,
  'submit: refused visits leave no request');
select is((select next_value from public.project_counters where project_id = 'c0000000-0000-0000-0000-000000000481' and kind = 'ir'), 5,
  'submit: refusals burn no number');

-- ---------------------------------------------------------------------------------------------------------------------
-- Photos and PDFs: registered in the job's request folder with no uploader, attached only once stored
-- ---------------------------------------------------------------------------------------------------------------------
set local role service_role;
select pg_temp.login_service();
insert into res values ('files', public.link_request_files('c0000000-0000-0000-0000-000000000481', pg_temp.h('job-token'), null,
  jsonb_build_array(jsonb_build_object('name', 'wall/../photo.jpg', 'mime', 'image/jpeg', 'size', 2048, 'sha256', repeat('a', 64)))));
reset role;
select results_eq(
  $$ select f.folder_id = public.ir_attach_folder_id('c0000000-0000-0000-0000-000000000481'), f.created_by is null, f.scan_status,
            f.upload_complete, f.original_name, f.storage_path = (pg_temp.j('files')->'files'->0->>'storage_path')
       from public.files f where f.id = (pg_temp.j('files')->'files'->0->>'id')::uuid $$,
  $$ values (true, true, 'pending'::text, false, 'wall_.._photo.jpg'::text, true) $$,
  'files: in the request folder, no uploader, pending, at the path the database gave, no slashes in the name');
set local role service_role;
select pg_temp.login_service();
select throws_ok($$ select public.link_request_files('c0000000-0000-0000-0000-000000000481', pg_temp.h('job-token'), null,
  '[{"name":"x.svg","mime":"image/svg+xml","size":10,"sha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}]') $$,
  '22023', 'Photos or PDFs only.', 'files: photos or PDFs only');
select throws_ok($$ select public.link_request_files('c0000000-0000-0000-0000-000000000481', pg_temp.h('job-token'), null,
  jsonb_build_array(jsonb_build_object('name', 'big.pdf', 'mime', 'application/pdf', 'size', 10485761, 'sha256', repeat('b', 64)))) $$,
  '22023', 'Files must be 10 MB or less.', 'files: 10 MB each at most');
select throws_ok($$ select public.link_request_files('c0000000-0000-0000-0000-000000000481', pg_temp.h('job-token'), null,
  (select jsonb_agg(jsonb_build_object('name', 'p' || g || '.jpg', 'mime', 'image/jpeg', 'size', 10, 'sha256', repeat('c', 64)))
     from generate_series(1, 4) g)) $$, '22023', 'Up to 3 photos or PDFs.', 'files: 3 at most');
select is(public.link_request_files('c0000000-0000-0000-0000-000000000481', pg_temp.h('other-token'), null,
  jsonb_build_array(jsonb_build_object('name', 'p.jpg', 'mime', 'image/jpeg', 'size', 10, 'sha256', repeat('c', 64)))), null,
  'files: a wrong token registers nothing');
select throws_ok($$ select pg_temp.send('c0000000-0000-0000-0000-000000000481', pg_temp.h('job-token'), 'Sample Photographer',
  '5550102031', null, pg_temp.d(2), '14:00', 'ior', 'Anchor bolts', true, array[(pg_temp.j('files')->'files'->0->>'id')::uuid]) $$,
  '22023', 'An attachment is missing. Add it again.', 'files: not attached before its bytes are stored');
reset role;
insert into storage.objects (bucket_id, name) values ('files', pg_temp.j('files')->'files'->0->>'storage_path');
set local role service_role;
select pg_temp.login_service();
insert into res values ('photo', pg_temp.send('c0000000-0000-0000-0000-000000000481', pg_temp.h('job-token'), 'Sample Photographer',
  '5550102031', null, pg_temp.d(2), '14:00', 'ior', 'Anchor bolts', true, array[(pg_temp.j('files')->'files'->0->>'id')::uuid]));
reset role;
select results_eq(
  $$ select r.attachment_ids = array[(pg_temp.j('files')->'files'->0->>'id')::uuid], f.upload_complete, f.scan_status
       from public.inspection_requests r join public.files f on f.id = r.attachment_ids[1] where r.id = pg_temp.rid('photo') $$,
  $$ values (true, true, 'pending'::text) $$, 'files: attached, finished, waiting for the scan (switch off)');
select ok(exists (select 1 from queue.jobs_index where kind = 'scan_file'
                  and idempotency_key = 'scan_file:' || (pg_temp.j('files')->'files'->0->>'id')), 'files: queued for the virus scan');
set local role service_role;
select pg_temp.login_service();
select throws_ok($$ select pg_temp.send('c0000000-0000-0000-0000-000000000481', pg_temp.h('job-token'), 'Sample Other Visitor',
  '5550102032', null, pg_temp.d(2), '15:00', 'ior', 'Hold downs', true, array[(pg_temp.j('files')->'files'->0->>'id')::uuid]) $$,
  '22023', 'An attachment is missing. Add it again.', 'files: one file is on one request only');

-- ---------------------------------------------------------------------------------------------------------------------
-- The private status link: the tracker's facts and the result line, nothing else
-- ---------------------------------------------------------------------------------------------------------------------
insert into res values ('st', public.link_request_status('c0000000-0000-0000-0000-000000000481', pg_temp.h(pg_temp.j('s1')->>'receipt')));
select results_eq($$ select k from jsonb_object_keys(pg_temp.j('st')) k order by 1 $$,
  $$ values ('duration_kind'::text), ('duration_min'), ('gc_step'), ('kind'), ('number'), ('project_name'), ('request_date'),
            ('result'), ('result_note'), ('special_kind'), ('start_time'), ('status') $$,
  'status: the tracker''s facts and the result line only');
select ok(pg_temp.j('st')::text not like '%555%' and pg_temp.j('st')::text not like '%visitor@%'
          and pg_temp.j('st')::text not like '%Sample Visitor%' and pg_temp.j('st')::text not like '%North wall%',
  'status: not the contact, the name or the items');
select is(public.link_request_status('c0000000-0000-0000-0000-000000000481', pg_temp.h('not-a-receipt')), null,
  'status: a wrong receipt answers null');
select is(public.link_request_status('c0000000-0000-0000-0000-000000000482', pg_temp.h(pg_temp.j('s1')->>'receipt')), null,
  'status: a receipt opens its own job only');

-- ---------------------------------------------------------------------------------------------------------------------
-- The inspector works it like any request; the visitor's contact is on it; others see it anonymized
-- ---------------------------------------------------------------------------------------------------------------------
reset role;
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000481');
select results_eq($$ select requester_name, requester_phone, requester_email from public.inspection_requests where id = pg_temp.rid('s1') $$,
  $$ values ('Sample Visitor'::text, '(555) 010-2030'::text, 'visitor@example.test'::text) $$,
  'inspector: reads the visitor''s name, phone and email');
select results_eq($$ select full_detail, mine, company from public.ir_calendar('c0000000-0000-0000-0000-000000000481', pg_temp.d(2), pg_temp.d(2))
                      where number = 3 $$,
  $$ values (true, false, 'Sample Framing'::text) $$, 'inspector: the calendar row in full; "mine" is false, never null');
select lives_ok($$ select public.ir_confirm(pg_temp.rid('s1'), pg_temp.ver(pg_temp.rid('s1')), 'Gate code 1234') $$,
  'inspector: confirms a link request');
select lives_ok($$ select public.ir_set_result(pg_temp.rid('s1'), pg_temp.ver(pg_temp.rid('s1')), 'approved', 'Nailing per plan') $$,
  'inspector: records the result');
select is((select count(*)::int from public.ir_recipients(pg_temp.rid('s1')) where preselect is null), 0,
  'inspector: Send results preselection is never null');
reset role;
set local role service_role;
select pg_temp.login_service();
insert into res values ('st2', public.link_request_status('c0000000-0000-0000-0000-000000000481', pg_temp.h(pg_temp.j('s1')->>'receipt')));
select results_eq($$ select pg_temp.j('st2')->>'status', pg_temp.j('st2')->>'result', pg_temp.j('st2')->>'result_note' $$,
  $$ values ('confirmed'::text, 'approved'::text, 'Nailing per plan'::text) $$, 'status: the inspector''s result line');
select ok(pg_temp.j('st2')::text not like '%1234%', 'status: never the inspector''s note to the GC');
reset role;
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000481');
select lives_ok($$ select public.ir_postpone(pg_temp.rid('photo'), pg_temp.ver(pg_temp.rid('photo')), 'weather') $$,
  'inspector: postpones a link request');
reset role;
select ok(not exists (select 1 from public.activity where entity_id = pg_temp.rid('photo') and kind = 'ir.postponed'),
  'postpone: no board line for a requester who is not a member');

set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000483');
select results_eq($$ select full_detail, mine, company, items, number from public.ir_calendar('c0000000-0000-0000-0000-000000000481', pg_temp.d(2), pg_temp.d(2))
                      where start_time = '10:00' $$,
  $$ values (false, false, null::text, null::text, null::int) $$, 'a sub: another visitor''s request is anonymized; "mine" is false');
select is_empty($$ select 1 from public.inspection_requests where id = pg_temp.rid('s1') $$, 'a sub: cannot read the visitor''s row');
select pg_temp.login('a0000000-0000-0000-0000-000000000484');
select is((select count(*)::int from public.ir_calendar('c0000000-0000-0000-0000-000000000481', pg_temp.d(1), pg_temp.d(2))
            where not full_detail and not is_block), 3, 'requester: the job''s request week, anonymized');
select throws_ok($$ select public.link_request_submit('c0000000-0000-0000-0000-000000000481', pg_temp.h('job-token'), null, 'X', 'Y',
  '5550102030', null, pg_temp.d(2), 'ior', 'Items', true) $$, '42501', null, 'link functions: not callable by people');
select throws_ok($$ select public.link_request_calendar('c0000000-0000-0000-0000-000000000481', pg_temp.h('job-token')) $$,
  '42501', null, 'link calendar: not callable by people');

-- ---------------------------------------------------------------------------------------------------------------------
-- Rate-limit counters: the submit limit per IP (10 an hour) stops the 11th
-- ---------------------------------------------------------------------------------------------------------------------
reset role;
set local role service_role;
select pg_temp.login_service();
select is((select count(*)::int from generate_series(1, 10) g
            where public.consume_rate_limit('request-link:submit-ip:203.0.113.7', 10, 10.0 / 3600, 1)), 10,
  'rate limit: 10 submits from one address');
select is(public.consume_rate_limit('request-link:submit-ip:203.0.113.7', 10, 10.0 / 3600, 1), false, 'rate limit: the 11th waits');
select is(public.consume_rate_limit('request-link:submit-token:' || left(pg_temp.h('job-token'), 32), 60, 60.0 / 3600, 1), true,
  'rate limit: the token''s own counter is separate');

-- ---------------------------------------------------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------------------------------------------------
reset role;
select ok(not has_function_privilege('authenticated', 'public.link_request_calendar(uuid, text, uuid, date)', 'execute')
          and not has_function_privilege('authenticated', 'public.link_request_files(uuid, text, uuid, jsonb)', 'execute')
          and not has_function_privilege('authenticated', 'public.link_request_status(uuid, text)', 'execute')
          and not has_function_privilege('authenticated',
            'public.link_request_submit(uuid, text, uuid, text, text, text, text, date, text, text, boolean, time, text, integer, uuid, uuid[])', 'execute')
          and has_function_privilege('service_role', 'public.link_request_status(uuid, text)', 'execute')
          and has_function_privilege('service_role',
            'public.link_request_submit(uuid, text, uuid, text, text, text, text, date, text, text, boolean, time, text, integer, uuid, uuid[])', 'execute'),
  'grants: the link functions are service-role only');
select ok(not has_function_privilege('authenticated', 'public.ir_folder_make(uuid, text)', 'execute')
          and not has_function_privilege('authenticated', 'public.ir_calendar_rows(uuid, date, date, uuid, boolean, boolean)', 'execute')
          and not has_function_privilege('authenticated', 'public.link_request_answer(uuid)', 'execute')
          and not has_function_privilege('authenticated', 'public.requester_backfill()', 'execute'),
  'grants: the helpers are internal');
select ok((select relrowsecurity from pg_class where oid = 'public.ir_link_receipts'::regclass)
          and not has_table_privilege('authenticated', 'public.ir_link_receipts', 'select,insert,update,delete')
          and not has_table_privilege('anon', 'public.ir_link_receipts', 'select,insert,update,delete'),
  'grants: the receipts are closed to people (RLS on, no grants)');
select ok(not has_table_privilege('anon', 'public.inspection_requests', 'select,insert,update,delete'),
  'grants: anon has no direct access to requests');
select is_empty(
  $$ select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and (p.proname like 'link\_request\_%' or p.proname in ('ir_folder_make', 'ir_calendar_rows', 'requester_backfill'))
        and has_function_privilege('anon', p.oid, 'execute') $$,
  'grants: nothing here is callable by anon');

select * from finish();
rollback;
