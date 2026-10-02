begin;
select plan(107);
-- SPEC §13.2 inspection scheduling and IRs (migration 0024): numbers at submit only, the anonymized calendar, only
-- ir.decide decides, requesters move/withdraw their own, postpone keeps the date, the calendar mirror and its audience,
-- the GC step follows the job setting, the IR PDF steps and request-scoped downloads, blocks, co-inspectors.
\ir _helpers.psql

-- ---------------------------------------------------------------------------------------------------------------
-- Seed: a GC job with an admin (creator), two subs from two companies, two inspectors, a super, an architect and an
-- owner rep. Days are relative to "today" in the job's zone.
-- ---------------------------------------------------------------------------------------------------------------
create temp table ids (k text primary key, v uuid);
grant all on ids to public;
create function pg_temp.rid(p_k text) returns uuid language sql stable as $$ select v from ids where k = p_k $$;
create function pg_temp.d(p_days int) returns date language sql stable as $$
  select (now() at time zone 'America/Los_Angeles')::date + p_days $$;
-- Current version of a request, whoever is logged in (tests pass it to the RPCs' version checks).
create function pg_temp.ver(p_k text) returns int language sql stable security definer as $$
  select r.version from public.inspection_requests r where r.id = (select v from ids where k = p_k) $$;
create function pg_temp.col(p_k text, p_col text) returns text language plpgsql stable security definer as $$
declare v text;
begin
  execute format('select %I::text from public.inspection_requests where id = $1', p_col) into v using (select ids.v from ids where k = p_k);
  return v;
end $$;
-- ir_submit with every argument in one fixed order (the RPC's optional ones are named).
create function pg_temp.submit(p uuid, co text, d date, t time, dk text, dm int, k text, sk uuid, items text, att uuid[], ack boolean)
returns public.inspection_requests language sql as $$
  select public.ir_submit(p_project_id => p, p_company => co, p_request_date => d, p_kind => k, p_items => items,
    p_notice_ack => ack, p_start_time => t, p_duration_kind => dk, p_duration_min => dm, p_special_kind_id => sk,
    p_attachment_ids => att) $$;
grant execute on function pg_temp.rid(text), pg_temp.d(int), pg_temp.ver(text), pg_temp.col(text, text),
  pg_temp.submit(uuid, text, date, time, text, int, text, uuid, text, uuid[], boolean) to public;

select pg_temp.mk_user('a0000000-0000-0000-0000-000000000181', 'probe+ir-admin@example.test', 'IR Admin');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000182', 'probe+ir-sub@example.test', 'IR Sub');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000183', 'probe+ir-sub2@example.test', 'IR Sub Two');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000184', 'probe+ir-insp@example.test', 'IR Inspector');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000185', 'probe+ir-insp2@example.test', 'IR Helper');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000186', 'probe+ir-super@example.test', 'IR Super');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000187', 'probe+ir-arch@example.test', 'IR Architect');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000188', 'probe+ir-owner@example.test', 'IR Owner Rep');

insert into public.orgs (id, name, kind, created_by) values
  ('b0000000-0000-0000-0000-000000000181', 'Sample Builders', 'gc', 'a0000000-0000-0000-0000-000000000181'),
  ('b0000000-0000-0000-0000-000000000182', 'Sample Concrete Co', 'sub', 'a0000000-0000-0000-0000-000000000182'),
  ('b0000000-0000-0000-0000-000000000183', 'Sample Steel Co', 'sub', 'a0000000-0000-0000-0000-000000000183');
insert into public.projects (id, org_id, name, stage, timezone, created_by)
values ('c0000000-0000-0000-0000-000000000181', 'b0000000-0000-0000-0000-000000000181', 'IR Job', 'construction',
        'America/Los_Angeles', 'a0000000-0000-0000-0000-000000000181');
insert into public.project_members (org_id, project_id, user_id, invite_email, member_org_id, role, status)
select 'b0000000-0000-0000-0000-000000000181', 'c0000000-0000-0000-0000-000000000181', u, e, o, r, 'active'
  from (values
    ('a0000000-0000-0000-0000-000000000182'::uuid, 'probe+ir-sub@example.test', 'b0000000-0000-0000-0000-000000000182'::uuid, 'sub'),
    ('a0000000-0000-0000-0000-000000000183', 'probe+ir-sub2@example.test', 'b0000000-0000-0000-0000-000000000183', 'sub'),
    ('a0000000-0000-0000-0000-000000000184', 'probe+ir-insp@example.test', null, 'inspector'),
    ('a0000000-0000-0000-0000-000000000185', 'probe+ir-insp2@example.test', null, 'inspector'),
    ('a0000000-0000-0000-0000-000000000186', 'probe+ir-super@example.test', 'b0000000-0000-0000-0000-000000000181', 'superintendent'),
    ('a0000000-0000-0000-0000-000000000187', 'probe+ir-arch@example.test', null, 'architect'),
    ('a0000000-0000-0000-0000-000000000188', 'probe+ir-owner@example.test', null, 'owner_rep')) v(u, e, o, r);

-- Capability rows added by 0024.
select results_eq($$ select role from public.role_permissions where capability = 'ir.gc_approve' order by 1 $$,
  $$ values ('inspector_admin'::text), ('pm'), ('project_admin'), ('superintendent') $$,
  'ir.gc_approve: project_admin, pm, superintendent (and the inspector who runs the job, 0044)');
select results_eq($$ select role from public.role_permissions where capability = 'ir.view_all' order by 1 $$,
  $$ values ('ahj'::text), ('inspector'), ('inspector_admin'), ('owner_rep'), ('pe'), ('pm'), ('project_admin'), ('superintendent') $$,
  'ir.view_all: the GC team, inspectors, the owner rep (and the fire / building official, 0052)');

set local role authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- Submit: the database numbers requests at submit; a repeat returns the first; failures burn no number.
-- ---------------------------------------------------------------------------------------------------------------
select pg_temp.login('a0000000-0000-0000-0000-000000000182');
select lives_ok($$ insert into ids select 'A', (pg_temp.submit('c0000000-0000-0000-0000-000000000181', 'Sample Concrete Co',
  pg_temp.d(1), '09:00', 'timed', 60, 'ior', null, 'Footing rebar, grid A', '{}', true)).id $$, 'sub: submits a request');
select is(pg_temp.col('A', 'number'), '1', 'submit: IR number 1 assigned by the database');
select is(pg_temp.col('A', 'status'), 'pending', 'GC step off: a new request goes straight to pending');
select is((pg_temp.submit('c0000000-0000-0000-0000-000000000181', 'Sample Concrete Co', pg_temp.d(1), '09:00', 'timed', 60,
  'ior', null, 'Footing rebar, grid A', '{}', true)).id, pg_temp.rid('A'), 'submit: the same request again returns the first one');
select throws_ok($$ select pg_temp.submit('c0000000-0000-0000-0000-000000000181', 'Sample Concrete Co', pg_temp.d(1), '10:00',
  'timed', 60, 'ior', null, 'Slab edge', '{}', false) $$, '22023', 'Check the notice box first.', 'submit: the notice must be acknowledged');
select throws_ok($$ select pg_temp.submit('c0000000-0000-0000-0000-000000000181', 'Sample Concrete Co', pg_temp.d(1), '10:00',
  'timed', 60, 'ofs', null, 'Slab edge', '{}', true) $$, '22023', 'OFS is off for this job.', 'submit: OFS only where the job allows it');
select throws_ok($$ select pg_temp.submit('c0000000-0000-0000-0000-000000000181', 'Sample Concrete Co', pg_temp.d(-1), '10:00',
  'timed', 60, 'ior', null, 'Slab edge', '{}', true) $$, '22023', 'Pick today or a later day.', 'submit: not a past day');
select throws_ok($$ select pg_temp.submit('c0000000-0000-0000-0000-000000000181', 'Sample Concrete Co', pg_temp.d(1), '10:15',
  'timed', 60, 'ior', null, 'Slab edge', '{}', true) $$, '23514', null, 'submit: time is Flexible or a half-hour slot');
select throws_ok($$ select pg_temp.submit('c0000000-0000-0000-0000-000000000181', 'Sample Concrete Co', pg_temp.d(1), '10:00',
  'timed', 60, 'ior', null, 'Slab edge', array['e0000000-0000-0000-0000-000000000189'::uuid], true) $$,
  '22023', 'An attachment is missing. Add it again.', 'submit: attachments must be my own files on this job');
select throws_ok($$ insert into public.inspection_requests (org_id, project_id, number, requested_by, company, request_date, kind,
  items, notice_ack_at, status) values ('b0000000-0000-0000-0000-000000000181', 'c0000000-0000-0000-0000-000000000181', 99,
  auth.uid(), 'x', current_date, 'ior', 'x', now(), 'confirmed') $$, '42501', null, 'nobody inserts requests directly');

select pg_temp.login('a0000000-0000-0000-0000-000000000183');
select lives_ok($$ insert into ids select 'B', (pg_temp.submit('c0000000-0000-0000-0000-000000000181', 'Sample Steel Co',
  pg_temp.d(1), '10:00', 'timed', 30, 'ior', null, 'Embed plates, level 2', '{}', true)).id $$, 'sub 2: submits a request');
select is(pg_temp.col('B', 'number'), '2', 'submit: the next request gets the next number (failed submits burned none)');

select pg_temp.login('a0000000-0000-0000-0000-000000000187');
select throws_ok($$ select pg_temp.submit('c0000000-0000-0000-0000-000000000181', 'x', pg_temp.d(1), null, 'all_day', null,
  'ior', null, 'x', '{}', true) $$, '42501', null, 'architect (no ir.request): cannot request');

reset role;
select throws_ok($$ insert into public.inspection_requests (org_id, project_id, number, requested_by, company, request_date, kind,
  items, notice_ack_at, status, duration_kind, duration_min) select org_id, project_id, number, requested_by, company, request_date, kind, items, notice_ack_at,
  status, duration_kind, duration_min from public.inspection_requests where id = pg_temp.rid('A') $$, '23505', null, 'IR numbers are unique per job');
set local role authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- The requester's calendar: full detail for my own, times and types for everyone else's.
-- ---------------------------------------------------------------------------------------------------------------
select pg_temp.login('a0000000-0000-0000-0000-000000000182');
select results_eq($$ select id, number, company from public.ir_calendar('c0000000-0000-0000-0000-000000000181', pg_temp.d(0), pg_temp.d(7)) where mine $$,
  $$ values (pg_temp.rid('A'), 1, 'Sample Concrete Co'::text) $$, 'sub: own request in full');
select results_eq($$ select id, number, company, items, full_detail from public.ir_calendar('c0000000-0000-0000-0000-000000000181', pg_temp.d(0), pg_temp.d(7)) where not mine $$,
  $$ values (null::uuid, null::int, null::text, null::text, false) $$, 'sub: someone else''s request has no id, number, company or items');
select results_eq($$ select start_time, duration_min, kind, status_key from public.ir_calendar('c0000000-0000-0000-0000-000000000181', pg_temp.d(0), pg_temp.d(7)) where not mine $$,
  $$ values ('10:00'::time, 30, 'ior'::text, 'pending'::text) $$, 'sub: someone else''s request shows its time, length, type and color');
select is_empty($$ select id from public.inspection_requests where id = pg_temp.rid('B') $$, 'sub: cannot read someone else''s request row');
select is_empty($$ select id from public.ir_events where request_id = pg_temp.rid('B') $$, 'sub: cannot read someone else''s history');

select pg_temp.login('a0000000-0000-0000-0000-000000000187');
select throws_ok($$ select * from public.ir_calendar('c0000000-0000-0000-0000-000000000181', pg_temp.d(0), pg_temp.d(7)) $$,
  '42501', null, 'architect: no inspection calendar');

select pg_temp.login('a0000000-0000-0000-0000-000000000184');
select is((select count(*)::int from public.ir_calendar('c0000000-0000-0000-0000-000000000181', pg_temp.d(0), pg_temp.d(7))
            where full_detail and company is not null), 2, 'inspector: every request in full');

-- ---------------------------------------------------------------------------------------------------------------
-- Only ir.decide confirms and records results.
-- ---------------------------------------------------------------------------------------------------------------
select pg_temp.login('a0000000-0000-0000-0000-000000000182');
select throws_ok($$ select public.ir_confirm(pg_temp.rid('A'), pg_temp.ver('A'), null) $$, '42501', null, 'sub: cannot confirm');
select throws_ok($$ select public.ir_set_result(pg_temp.rid('A'), pg_temp.ver('A'), 'approved', null, '{}') $$, '42501', null,
  'sub: cannot record a result');
select pg_temp.login('a0000000-0000-0000-0000-000000000186');
select throws_ok($$ select public.ir_confirm(pg_temp.rid('A'), pg_temp.ver('A'), null) $$, '42501', null,
  'super (ir.view_all, no ir.decide): cannot confirm');
select pg_temp.login('a0000000-0000-0000-0000-000000000184');
select lives_ok($$ select public.ir_confirm(pg_temp.rid('A'), pg_temp.ver('A'), 'Bring the approved rebar shop drawings') $$,
  'inspector: confirms');
select results_eq($$ select status, owner_id::text, confirm_note from public.inspection_requests where id = pg_temp.rid('A') $$,
  $$ values ('confirmed'::text, 'a0000000-0000-0000-0000-000000000184'::text, 'Bring the approved rebar shop drawings'::text) $$,
  'confirm: confirmed, owned by the inspector, note kept for the GC');

-- ---------------------------------------------------------------------------------------------------------------
-- Calendar mirror: one line per request for ir.view_all.
-- ---------------------------------------------------------------------------------------------------------------
reset role;
select results_eq($$ select kind, read_capability, status, title, starts_at, ends_at from public.calendar_entries
                      where source_type = 'inspection_request' and source_id = pg_temp.rid('A') $$,
  $$ values ('inspections'::text, 'ir.view_all'::text, 'confirmed'::text, 'IR 1 IOR · Sample Concrete Co'::text,
             (pg_temp.d(1) + time '09:00') at time zone 'America/Los_Angeles',
             (pg_temp.d(1) + time '10:00') at time zone 'America/Los_Angeles') $$,
  'mirror: kind, audience, status, title and times in the job''s zone');
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000182');
select is_empty($$ select id from public.calendar_entries where source_type = 'inspection_request' $$,
  'mirror: a sub (no ir.view_all) sees no request lines');
select pg_temp.login('a0000000-0000-0000-0000-000000000188');
select is((select count(*)::int from public.calendar_entries where source_type = 'inspection_request'), 2,
  'mirror: the owner rep (ir.view_all) sees every request line');

-- ---------------------------------------------------------------------------------------------------------------
-- Requesters move and withdraw their own only; a moved confirmed request goes back to pending.
-- ---------------------------------------------------------------------------------------------------------------
select pg_temp.login('a0000000-0000-0000-0000-000000000183');
select throws_ok($$ select public.ir_move(pg_temp.rid('A'), pg_temp.ver('A'), pg_temp.d(2), '09:00', 'timed', 60) $$,
  'P0002', null, 'sub 2: cannot move someone else''s request');
select throws_ok($$ select public.ir_withdraw(pg_temp.rid('A'), pg_temp.ver('A')) $$, 'P0002', null,
  'sub 2: cannot withdraw someone else''s request');
select pg_temp.login('a0000000-0000-0000-0000-000000000182');
select throws_ok($$ select public.ir_move(pg_temp.rid('A'), pg_temp.ver('A') - 1, pg_temp.d(2), '09:00', 'timed', 60) $$,
  '40001', null, 'move: a stale version is refused');
select lives_ok($$ select public.ir_move(pg_temp.rid('A'), pg_temp.ver('A'), pg_temp.d(2), '13:30', 'timed', 90) $$, 'sub: moves own');
select results_eq($$ select status, request_date, start_time from public.inspection_requests where id = pg_temp.rid('A') $$,
  $$ values ('pending'::text, pg_temp.d(2), '13:30'::time) $$, 'move: a confirmed request goes back to pending');
select results_eq($$ select action from public.ir_events where request_id = pg_temp.rid('A') order by id $$,
  $$ values ('submit'::text), ('confirm'), ('move') $$, 'history: every change, in order');
select pg_temp.login('a0000000-0000-0000-0000-000000000184');
select ok(exists (select 1 from public.activity where kind = 'ir.moved' and entity_id = pg_temp.rid('A')),
  'move: the inspector gets a board line');
select throws_ok($$ select public.ir_withdraw(pg_temp.rid('A'), pg_temp.ver('A')) $$, '42501', null,
  'inspector: cannot withdraw a request');

select pg_temp.login('a0000000-0000-0000-0000-000000000182');
select lives_ok($$ insert into ids select 'C', (pg_temp.submit('c0000000-0000-0000-0000-000000000181', 'Sample Concrete Co',
  pg_temp.d(3), null, 'all_day', null, 'ior', null, 'Grout, masonry wall 3', '{}', true)).id $$, 'sub: a third request');
select is(pg_temp.col('C', 'number'), '3', 'numbers stay in order');
select lives_ok($$ select public.ir_withdraw(pg_temp.rid('C'), pg_temp.ver('C')) $$, 'sub: withdraws own');
reset role;
select is_empty($$ select id from public.calendar_entries where source_id = pg_temp.rid('C') $$, 'withdraw: the calendar line goes');
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000182');
select lives_ok($$ select public.ir_restore(pg_temp.rid('C'), pg_temp.ver('C')) $$, 'sub: Undo brings it back');
reset role;
select results_eq($$ select c.all_day, r.status from public.calendar_entries c join public.inspection_requests r on r.id = c.source_id
                      where c.source_id = pg_temp.rid('C') $$,
  $$ values (true, 'pending'::text) $$, 'restore: pending again, back on the calendar (Flexible = all day)');
set local role authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- Postpone is not cancel.
-- ---------------------------------------------------------------------------------------------------------------
select pg_temp.login('a0000000-0000-0000-0000-000000000182');
select throws_ok($$ select public.ir_postpone(pg_temp.rid('A'), pg_temp.ver('A'), 'weather', null, null) $$, '42501', null,
  'sub: cannot postpone');
select pg_temp.login('a0000000-0000-0000-0000-000000000184');
select throws_ok($$ select public.ir_postpone(pg_temp.rid('A'), pg_temp.ver('A'), 'other', null, null) $$, '22023', 'Add a note.',
  'postpone: Other needs a note');
select lives_ok($$ select public.ir_postpone(pg_temp.rid('A'), pg_temp.ver('A'), 'weather', 'Rain', pg_temp.d(4)) $$,
  'inspector: postpones');
select results_eq($$ select status, request_date, postpone_reason, postpone_until, postpone_count from public.inspection_requests
                      where id = pg_temp.rid('A') $$,
  $$ values ('postponed'::text, pg_temp.d(2), 'weather'::text, pg_temp.d(4), 1) $$,
  'postpone: stays on its date, reason and expected date kept, counts as an extra request');
select lives_ok($$ select public.ir_postpone(pg_temp.rid('A'), pg_temp.ver('A'), 'weather', 'Still raining', pg_temp.d(5)) $$,
  'postpone: can be changed');
select is(pg_temp.col('A', 'postpone_count'), '1', 'postpone: changing it does not count twice');
select pg_temp.login('a0000000-0000-0000-0000-000000000183');
select results_eq($$ select status_key from public.ir_calendar('c0000000-0000-0000-0000-000000000181', pg_temp.d(2), pg_temp.d(2)) where not is_block $$,
  $$ values ('postponed'::text) $$, 'postpone: others still see it on its day, marked postponed (its slot is free)');
select pg_temp.login('a0000000-0000-0000-0000-000000000182');
select ok(exists (select 1 from public.activity where kind = 'ir.postponed' and entity_id = pg_temp.rid('A')
                  and summary like 'IR 1 postponed: Weather · expected %'), 'postpone: the requester gets a board line');
select pg_temp.login('a0000000-0000-0000-0000-000000000184');
select lives_ok($$ select public.ir_confirm(pg_temp.rid('A'), pg_temp.ver('A'), null) $$, 'inspector: confirms it again');
select results_eq($$ select status, postpone_reason, postpone_count from public.inspection_requests where id = pg_temp.rid('A') $$,
  $$ values ('confirmed'::text, null::text, 1) $$, 're-confirm: postponed chip gone, the count stays');

-- ---------------------------------------------------------------------------------------------------------------
-- Co-inspectors: a helper reports, only the owner decides.
-- ---------------------------------------------------------------------------------------------------------------
select pg_temp.login('a0000000-0000-0000-0000-000000000185');
select lives_ok($$ select public.ir_claim(pg_temp.rid('A'), pg_temp.ver('A')) $$, 'second inspector: claims to help');
select is(pg_temp.col('A', 'helper_id'), 'a0000000-0000-0000-0000-000000000185', 'claim: the helper is set, the owner stays');
select throws_ok($$ select public.ir_set_result(pg_temp.rid('A'), pg_temp.ver('A'), 'approved', null, '{}') $$, '42501', null,
  'helper: cannot record the result');
select lives_ok($$ select public.ir_helper_report(pg_temp.rid('A'), pg_temp.ver('A'), 'passed', 'Looked good') $$,
  'helper: reports passed');
reset role;
select results_eq($$ select status from public.calendar_entries where source_id = pg_temp.rid('A') $$,
  $$ values ('assigned'::text) $$, 'mirror: a confirmed request with a helper is blue (assigned)');
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000184');
select lives_ok($$ select public.ir_set_attendance(pg_temp.rid('A'), pg_temp.ver('A'), 'be_present') $$, 'inspector: attendance call');
reset role;
select is((select title from public.calendar_entries where source_id = pg_temp.rid('A')), 'IR 1 IOR · Sample Concrete Co · Be present',
  'mirror: the attendance call shows on the GC''s calendar');
set local role authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- Result, the IR PDF, stale content and request-scoped downloads.
-- ---------------------------------------------------------------------------------------------------------------
select pg_temp.login('a0000000-0000-0000-0000-000000000184');
select lives_ok($$ select public.ir_set_result(pg_temp.rid('A'), pg_temp.ver('A'), 'approved', 'No issues', '{}') $$,
  'inspector: records Approved');
select ok(pg_temp.col('A', 'summary') like 'IR 1 IOR: Approved. Footing rebar, grid A. No issues', 'result: a summary a daily can copy');
select throws_ok($$ select public.ir_sign(pg_temp.rid('A'), pg_temp.ver('A'), 'nothex') $$, '22023', null, 'sign: needs a real hash');
select lives_ok($$ select public.ir_sign(pg_temp.rid('A'), pg_temp.ver('A'), repeat('a', 64)) $$, 'inspector: signs');
select lives_ok($$ insert into ids values ('reports', public.ir_folder('c0000000-0000-0000-0000-000000000181', 'reports')) $$,
  'reports folder: made on first use');
reset role;
insert into public.files (id, org_id, project_id, folder_id, storage_path, original_name, mime, created_by, scan_status, upload_complete)
values ('e0000000-0000-0000-0000-000000000181', 'b0000000-0000-0000-0000-000000000181', 'c0000000-0000-0000-0000-000000000181',
        pg_temp.rid('reports'), public.file_storage_path('c0000000-0000-0000-0000-000000000181', pg_temp.rid('reports'),
        'e0000000-0000-0000-0000-000000000181', 'IR 1.pdf'), 'IR 1.pdf', 'application/pdf',
        'a0000000-0000-0000-0000-000000000184', 'clean', true);
select ok((select parent_id = (select id from public.folders where project_id = 'c0000000-0000-0000-0000-000000000181'
                                and kind = 'reports' and parent_id is null)
             from public.folders where id = pg_temp.rid('reports')), 'reports folder: Reports / Inspection reports');
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000184');
select throws_ok($$ select public.ir_attach_pdf(pg_temp.rid('A'), 'e0000000-0000-0000-0000-000000000181', repeat('a', 64), false) $$,
  '42501', null, 'attach: not callable by people (only ir-pdf records a server-made PDF)');
reset role;
set local role service_role;
select pg_temp.login_service();
select throws_ok($$ select public.ir_attach_pdf(pg_temp.rid('A'), 'e0000000-0000-0000-0000-000000000181', repeat('b', 64), false) $$,
  '40001', null, 'attach: the hash must be the signed one');
select lives_ok($$ select public.ir_attach_pdf(pg_temp.rid('A'), 'e0000000-0000-0000-0000-000000000181', repeat('a', 64), false) $$,
  'ir-pdf (service): records the PDF');
select results_eq($$ select status, pdf_stale from public.inspection_requests where id = pg_temp.rid('A') $$,
  $$ values ('complete'::text, false) $$, 'attach: the request is complete');
select is((select actor_id::text from public.ir_events where request_id = pg_temp.rid('A') and action = 'pdf'),
  'a0000000-0000-0000-0000-000000000184', 'history: the IR is recorded under the inspector who signed it');
reset role;
set local role authenticated;

select pg_temp.login('a0000000-0000-0000-0000-000000000182');
select results_eq($$ select original_name from public.authorize_ir_file(pg_temp.rid('A'), 'e0000000-0000-0000-0000-000000000181') $$,
  $$ values ('IR 1.pdf'::text) $$, 'requester: View IR works on their own request');
select pg_temp.login('a0000000-0000-0000-0000-000000000183');
select throws_ok($$ select * from public.authorize_ir_file(pg_temp.rid('A'), 'e0000000-0000-0000-0000-000000000181') $$,
  'P0002', null, 'another sub: cannot download that IR');
reset role;
select is((select count(*)::int from public.downloads where file_id = 'e0000000-0000-0000-0000-000000000181'), 1,
  'View IR is logged as a download');
set local role authenticated;

select pg_temp.login('a0000000-0000-0000-0000-000000000184');
select throws_ok($$ select public.ir_move(pg_temp.rid('A'), pg_temp.ver('A'), pg_temp.d(3), '09:00', 'timed', 60) $$, '22023', null,
  'a complete IR cannot be moved');
select lives_ok($$ select public.ir_set_result(pg_temp.rid('A'), pg_temp.ver('A'), 'approved', 'No issues. Cover OK.', '{}') $$,
  'inspector: changes the note after the PDF');
select is(pg_temp.col('A', 'pdf_stale'), 'true', 'stale: signed content changed after the PDF');
select throws_ok($$ select public.ir_mark_sent(pg_temp.rid('A'), null, '{}') $$, '42501', null,
  'send: only ir-send records a send');
reset role;
set local role service_role;
select pg_temp.login_service();
select throws_ok($$ select public.ir_mark_sent(pg_temp.rid('A'), null, '{}') $$, '22023', 'Generate the IR first.',
  'send: a stale PDF is never sent');
reset role;
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000184');
select lives_ok($$ select public.ir_delete_pdf(pg_temp.rid('A'), pg_temp.ver('A')) $$, 'inspector: Delete PDF & start over');
select results_eq($$ select status, ir_file_id, signed_at from public.inspection_requests where id = pg_temp.rid('A') $$,
  $$ values ('confirmed'::text, null::uuid, null::timestamptz) $$, 'delete PDF: back to confirmed, unsigned, result kept');

-- ---------------------------------------------------------------------------------------------------------------
-- The GC step follows the job setting.
-- ---------------------------------------------------------------------------------------------------------------
reset role;
update public.projects set settings = settings || '{"ir_gc_approval": true}' where id = 'c0000000-0000-0000-0000-000000000181';
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000182');
select lives_ok($$ insert into ids select 'D', (pg_temp.submit('c0000000-0000-0000-0000-000000000181', 'Sample Concrete Co',
  pg_temp.d(4), '08:00', 'timed', 60, 'ior', null, 'Underground plumbing', '{}', true)).id $$, 'GC step on: sub submits');
select is(pg_temp.col('D', 'status'), 'gc_review', 'GC step on: a sub''s request waits for the GC');
select pg_temp.login('a0000000-0000-0000-0000-000000000183');
select is_empty($$ select 1 from public.ir_calendar('c0000000-0000-0000-0000-000000000181', pg_temp.d(4), pg_temp.d(4)) $$,
  'GC step on: others do not see a request the GC has not passed');
select pg_temp.login('a0000000-0000-0000-0000-000000000184');
select throws_ok($$ select public.ir_confirm(pg_temp.rid('D'), pg_temp.ver('D'), null) $$, '22023', null,
  'GC step on: the inspector cannot confirm before the GC');
select pg_temp.login('a0000000-0000-0000-0000-000000000186');
select throws_ok($$ select public.ir_gc_decide(pg_temp.rid('D'), pg_temp.ver('D'), false, '  ') $$, '22023', 'Add a reason.',
  'GC: returning needs a reason');
select lives_ok($$ select public.ir_gc_decide(pg_temp.rid('D'), pg_temp.ver('D'), false, 'Wrong day') $$, 'GC: returns it');
select pg_temp.login('a0000000-0000-0000-0000-000000000182');
select lives_ok($$ select public.ir_move(pg_temp.rid('D'), pg_temp.ver('D'), pg_temp.d(5), '08:00', 'timed', 60) $$,
  'sub: moves it (resubmits)');
select is(pg_temp.col('D', 'status'), 'gc_review', 'resubmitted: waits for the GC again');
select pg_temp.login('a0000000-0000-0000-0000-000000000186');
select lives_ok($$ select public.ir_gc_decide(pg_temp.rid('D'), pg_temp.ver('D'), true, null) $$, 'GC: approves');
select is(pg_temp.col('D', 'status'), 'pending', 'approved: now with the inspector');
select lives_ok($$ insert into ids select 'E', (pg_temp.submit('c0000000-0000-0000-0000-000000000181', 'Sample Builders',
  pg_temp.d(4), null, 'periodic', null, 'ior', null, 'Site walk', '{}', true)).id $$, 'super submits');
select is(pg_temp.col('E', 'status'), 'pending', 'GC step on: a GC approver''s own request skips it');
reset role;
update public.projects set settings = settings || '{"ir_gc_approval": false}' where id = 'c0000000-0000-0000-0000-000000000181';
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000182');
select is((pg_temp.submit('c0000000-0000-0000-0000-000000000181', 'Sample Concrete Co', pg_temp.d(6), '07:00', 'timed', 30,
  'special', (select id from public.ir_special_kinds where name = 'Concrete'), 'Slab pour, area B', '{}', true)).status,
  'pending', 'GC step off again: straight to pending');
reset role;
select is((select c.kind from public.calendar_entries c join public.inspection_requests r on r.id = c.source_id
            where r.items = 'Slab pour, area B'), 'special_inspections', 'mirror: a special inspection is its own calendar kind');
set local role authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- Attachments: only from the inspection folder (requesters write it, can't read others'); scan rules still hold.
-- ---------------------------------------------------------------------------------------------------------------
select pg_temp.login('a0000000-0000-0000-0000-000000000182');
select lives_ok($$ insert into ids values ('attach', public.ir_folder('c0000000-0000-0000-0000-000000000181', 'attachments')) $$,
  'attachments folder: made on first use by a requester');
reset role;
insert into public.files (id, org_id, project_id, folder_id, storage_path, original_name, mime, created_by, upload_complete)
select v.id, 'b0000000-0000-0000-0000-000000000181', 'c0000000-0000-0000-0000-000000000181', v.folder,
       public.file_storage_path('c0000000-0000-0000-0000-000000000181', v.folder, v.id, v.name), v.name, 'image/jpeg',
       'a0000000-0000-0000-0000-000000000182', true
  from (values
    ('e0000000-0000-0000-0000-000000000182'::uuid, pg_temp.rid('attach'), 'rebar.jpg'),
    ('e0000000-0000-0000-0000-000000000183'::uuid, (select id from public.folders where project_id = 'c0000000-0000-0000-0000-000000000181'
                                                     and kind = 'photos'), 'other.jpg')) v(id, folder, name);
select ok(pg_temp.can_write_as('a0000000-0000-0000-0000-000000000182', pg_temp.rid('attach')),
  'attachments folder: a requester can upload into it');
select ok(not pg_temp.can_read_as('a0000000-0000-0000-0000-000000000182', pg_temp.rid('attach')),
  'attachments folder: a requester cannot read everyone''s files in it');
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000182');
select throws_ok($$ select pg_temp.submit('c0000000-0000-0000-0000-000000000181', 'Sample Concrete Co', pg_temp.d(7), '10:00',
  'timed', 30, 'ior', null, 'Stair rebar', array['e0000000-0000-0000-0000-000000000183'::uuid], true) $$,
  '22023', 'An attachment is missing. Add it again.', 'submit: a file from another folder cannot ride on a request');
select lives_ok($$ insert into ids select 'G', (pg_temp.submit('c0000000-0000-0000-0000-000000000181', 'Sample Concrete Co',
  pg_temp.d(7), '10:00', 'timed', 30, 'ior', null, 'Stair rebar', array['e0000000-0000-0000-0000-000000000182'::uuid], true)).id $$,
  'submit: with a photo from the inspection folder');
select results_eq($$ select original_name from public.authorize_ir_file(pg_temp.rid('G'), 'e0000000-0000-0000-0000-000000000182') $$,
  $$ values ('rebar.jpg'::text) $$, 'requester: downloads their own attachment');
select pg_temp.login('a0000000-0000-0000-0000-000000000184');
select throws_ok($$ select * from public.authorize_ir_file(pg_temp.rid('G'), 'e0000000-0000-0000-0000-000000000182') $$,
  '42501', 'scan_pending', 'inspector: waits for the virus scan like every download');

-- ---------------------------------------------------------------------------------------------------------------
-- Blocked time: inspectors add it; requesters see "Blocked" only.
-- ---------------------------------------------------------------------------------------------------------------
select pg_temp.login('a0000000-0000-0000-0000-000000000184');
select lives_ok($$ insert into public.ir_blocks (org_id, project_id, block_date, start_time, end_time, repeat_weekly, created_by)
  values ('b0000000-0000-0000-0000-000000000181', 'c0000000-0000-0000-0000-000000000181', pg_temp.d(1), '12:00', '13:00', true,
          auth.uid()) $$, 'inspector: blocks time every week');
select pg_temp.login('a0000000-0000-0000-0000-000000000182');
select results_eq($$ select id, request_date, duration_min, status_key from public.ir_calendar('c0000000-0000-0000-0000-000000000181',
                      pg_temp.d(0), pg_temp.d(14)) where is_block order by request_date $$,
  $$ values (null::uuid, pg_temp.d(1), 60, 'blocked'::text), (null, pg_temp.d(8), 60, 'blocked') $$,
  'sub: blocked time repeats weekly, without its id');
select throws_ok($$ insert into public.ir_blocks (org_id, project_id, block_date, created_by)
  values ('b0000000-0000-0000-0000-000000000181', 'c0000000-0000-0000-0000-000000000181', pg_temp.d(1), auth.uid()) $$,
  '42501', null, 'sub: cannot block time');

select * from finish();
rollback;
