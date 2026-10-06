begin;
select plan(43);
-- Migration 0091, the OFS request flow (Jesse, Oct 5):
--   * The sub's attestation is stamped by the database at insert: who, when, the job's wording (or the standard one).
--   * The checks, in order, each recorded with auth.uid(): GC Ready, inspector Ready, Special inspection report. A sub
--     checks none of them, the GC not the inspector's, Undo in order.
--   * Duties: the owner or CM picks the company (default the GC), that company's admin picks the person. Only the duty
--     holder and the inspector send to OFS, the duty holder only once the inspector has checked it.
--   * The OFS number: the next after the job's highest, typed by a sender, unique per job, with the version check.
\ir _helpers.psql

create temp table ids (k text primary key, v uuid);
grant all on ids to public;
create function pg_temp.rid(p_k text) returns uuid language sql stable as $$ select v from ids where k = p_k $$;
create function pg_temp.req(p_k text) returns public.inspection_requests language sql stable security definer as $$
  select * from public.inspection_requests where id = (select v from ids where k = p_k) $$;
create function pg_temp.ver(p_k text) returns int language sql stable security definer as $$
  select version from public.inspection_requests where id = (select v from ids where k = p_k) $$;
create function pg_temp.dver() returns int language sql stable security definer as $$
  select version from public.project_duties where project_id = 'c0000000-0000-0000-0000-000000000791' $$;
create function pg_temp.ask(p_items text, p_special boolean) returns public.inspection_requests language sql volatile as $$
  select public.ir_submit('c0000000-0000-0000-0000-000000000791', 'Sample Firestop Co',
    (now() at time zone 'America/Los_Angeles')::date + 3, 'ofs', p_items, true, '08:00', 'timed', 60, null, '{}', p_special) $$;
grant execute on all functions in schema pg_temp to public;

select pg_temp.mk_user('a0000000-0000-0000-0000-000000000791', 'probe+of-admin@example.test', 'Ada Admin');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000792', 'probe+of-insp@example.test', 'Ivy Inspector');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000793', 'probe+of-sub@example.test', 'Sam Sub');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000794', 'probe+of-pm@example.test', 'Pat Manager');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000795', 'probe+of-owner@example.test', 'Olive Owner');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000796', 'probe+of-ahj@example.test', 'Dana Deputy');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000797', 'probe+of-pm2@example.test', 'Quinn Other');

insert into public.orgs (id, name, kind, created_by) values
  ('b0000000-0000-0000-0000-000000000791', 'Sample Flow Builders', 'gc', 'a0000000-0000-0000-0000-000000000791'),
  ('b0000000-0000-0000-0000-000000000792', 'Sample Firestop Co', 'sub', 'a0000000-0000-0000-0000-000000000793'),
  ('b0000000-0000-0000-0000-000000000793', 'Sample Inspection', 'inspector', 'a0000000-0000-0000-0000-000000000792');
insert into public.projects (id, org_id, name, stage, timezone, created_by, settings) values
  ('c0000000-0000-0000-0000-000000000791', 'b0000000-0000-0000-0000-000000000791', 'Sample Flow Job', 'construction',
   'America/Los_Angeles', 'a0000000-0000-0000-0000-000000000791', '{"ir_ofs_allowed": true}');
insert into public.project_members (org_id, project_id, user_id, invite_email, member_org_id, role, status)
select 'b0000000-0000-0000-0000-000000000791', 'c0000000-0000-0000-0000-000000000791', u::uuid, e, o::uuid, r, 'active'
  from (values
    ('a0000000-0000-0000-0000-000000000792', 'probe+of-insp@example.test', 'b0000000-0000-0000-0000-000000000793', 'inspector'),
    ('a0000000-0000-0000-0000-000000000793', 'probe+of-sub@example.test', 'b0000000-0000-0000-0000-000000000792', 'sub'),
    ('a0000000-0000-0000-0000-000000000794', 'probe+of-pm@example.test', 'b0000000-0000-0000-0000-000000000791', 'pm'),
    ('a0000000-0000-0000-0000-000000000795', 'probe+of-owner@example.test', null, 'owner_rep'),
    ('a0000000-0000-0000-0000-000000000796', 'probe+of-ahj@example.test', null, 'ahj'),
    ('a0000000-0000-0000-0000-000000000797', 'probe+of-pm2@example.test', 'b0000000-0000-0000-0000-000000000792', 'pm')) v(u, e, o, r);

set local role authenticated;

-- ---------------------------------------------------------------------------------------------------------------------
-- The sub's attestation
-- ---------------------------------------------------------------------------------------------------------------------
select pg_temp.login('a0000000-0000-0000-0000-000000000793');
select is(public.ir_ofs_attest_text('c0000000-0000-0000-0000-000000000791'),
  'To the best of my knowledge, the work listed is complete and ready for inspection.', 'the standard wording');
insert into ids select 'A', (pg_temp.ask('Sample hydro test', true)).id;
select is(array[(pg_temp.req('A')).status, ((pg_temp.req('A')).ofs_attest_by = auth.uid())::text,
                ((pg_temp.req('A')).ofs_attest_at is not null)::text, (pg_temp.req('A')).ofs_attest_text],
  array['gc_review', 'true', 'true', 'To the best of my knowledge, the work listed is complete and ready for inspection.'],
  'the sub''s request carries his attestation: him, now, the wording he saw');
reset role;
update public.projects set settings = settings || '{"ir_ofs_attest_text": "Sample VIS wording: complete per approved plans."}'
 where id = 'c0000000-0000-0000-0000-000000000791';
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000793');
insert into ids select 'B', (pg_temp.ask('Sample damper test', false)).id;
select is((pg_temp.req('B')).ofs_attest_text, 'Sample VIS wording: complete per approved plans.', 'the job''s own wording, as typed in settings');
select is((pg_temp.req('A')).ofs_attest_text, 'To the best of my knowledge, the work listed is complete and ready for inspection.',
  'an earlier attestation keeps the words it was made with');

-- ---------------------------------------------------------------------------------------------------------------------
-- Checks: the sub checks none
-- ---------------------------------------------------------------------------------------------------------------------
select throws_ok($$ select public.ir_ofs_check(pg_temp.rid('A'), pg_temp.ver('A'), 'gc', true) $$, '42501', null,
  'a sub can''t check the GC box');
select throws_ok($$ select public.ir_ofs_check(pg_temp.rid('A'), pg_temp.ver('A'), 'ready', true) $$, '42501', null,
  'nor the inspector''s');
select throws_ok($$ select public.ir_ofs_check(pg_temp.rid('A'), pg_temp.ver('A'), 'si', true) $$, '42501', null,
  'nor the special inspection report');
select throws_ok($$ select public.ir_send_ofs(pg_temp.rid('A'), pg_temp.ver('A')) $$, '42501', null, 'nor send it to OFS');
select throws_ok($$ select public.ir_ofs_number_set(pg_temp.rid('A'), pg_temp.ver('A'), 41) $$, '42501', null,
  'nor type its OFS number');

-- The inspector can't check before the GC.
select pg_temp.login('a0000000-0000-0000-0000-000000000792');
select throws_ok($$ select public.ir_ofs_check(pg_temp.rid('A'), pg_temp.ver('A'), 'ready', true) $$, '22023',
  'This request is not with the inspector.', 'the inspector checks after the GC');
select throws_ok($$ select public.ir_ofs_check(pg_temp.rid('A'), pg_temp.ver('A'), 'gc', true) $$, '42501', null,
  'the inspector can''t check the GC box');

-- The GC: Ready, Undo, Ready.
select pg_temp.login('a0000000-0000-0000-0000-000000000794');
select is((select array[(r).status, ((r).gc_by = auth.uid())::text, ((r).gc_at is not null)::text]
             from (select public.ir_ofs_check(pg_temp.rid('A'), pg_temp.ver('A'), 'gc', true) as r) x),
  array['pending', 'true', 'true'], 'GC Ready: on to the inspector, by the GC, now');
select is((public.ir_ofs_check(pg_temp.rid('A'), pg_temp.ver('A'), 'gc', false)).status, 'gc_review', 'Undo: back with the GC');
select is((public.ir_ofs_check(pg_temp.rid('A'), pg_temp.ver('A'), 'gc', true)).status, 'pending', 'Ready again');
select throws_ok($$ select public.ir_ofs_check(pg_temp.rid('A'), pg_temp.ver('A') - 1, 'gc', false) $$, '40001', null,
  'a stale version is refused');
select throws_ok($$ select public.ir_send_ofs(pg_temp.rid('A'), pg_temp.ver('A')) $$, '42501', null,
  'the GC sends nothing while he is not the duty holder');

-- ---------------------------------------------------------------------------------------------------------------------
-- Duties
-- ---------------------------------------------------------------------------------------------------------------------
select is((select d -> 0 ->> 'company' from public.project_duties_view('c0000000-0000-0000-0000-000000000791') d),
  'Sample Flow Builders', 'nobody chose yet: the GC is responsible');
select is((select (d -> 0 ->> 'can_pick')::boolean from public.project_duties_view('c0000000-0000-0000-0000-000000000791') d), true,
  'the GC''s admin picks the person');
select throws_ok($$ select public.duty_set_company('c0000000-0000-0000-0000-000000000791', 'ofs_requests', 'Sample Firestop Co') $$,
  '42501', null, 'the GC does not pick the company');
select pg_temp.login('a0000000-0000-0000-0000-000000000797');
select throws_ok($$ select public.duty_set_person('c0000000-0000-0000-0000-000000000791', 'ofs_requests',
  'a0000000-0000-0000-0000-000000000797', null) $$, '42501', null, 'an admin of another company can''t pick');
select pg_temp.login('a0000000-0000-0000-0000-000000000793');
select throws_ok($$ select public.duty_set_company('c0000000-0000-0000-0000-000000000791', 'ofs_requests', 'Sample Firestop Co') $$,
  '42501', null, 'nor a sub');
select pg_temp.login('a0000000-0000-0000-0000-000000000795');
select is((select d -> 0 ->> 'company' from public.duty_set_company('c0000000-0000-0000-0000-000000000791', 'ofs_requests',
  'sample flow builders') d), 'Sample Flow Builders', 'the owner picks the company (as the job names it)');
select throws_ok($$ select public.duty_set_company('c0000000-0000-0000-0000-000000000791', 'ofs_requests', 'Nobody Co',
  pg_temp.dver()) $$, '22023', 'Pick a company on this job.', 'only a company on the job');
select throws_ok($$ select public.duty_set_person('c0000000-0000-0000-0000-000000000791', 'ofs_requests',
  'a0000000-0000-0000-0000-000000000795', pg_temp.dver()) $$, '42501', null, 'the owner doesn''t pick the person');
select pg_temp.login('a0000000-0000-0000-0000-000000000794');
select throws_ok($$ select public.duty_set_person('c0000000-0000-0000-0000-000000000791', 'ofs_requests',
  'a0000000-0000-0000-0000-000000000793', pg_temp.dver()) $$, '22023', 'Pick someone from Sample Flow Builders.',
  'the person is from the company');
select is((select d -> 0 ->> 'person_name' from public.duty_set_person('c0000000-0000-0000-0000-000000000791', 'ofs_requests',
  'a0000000-0000-0000-0000-000000000794', pg_temp.dver()) d), 'Pat Manager', 'the GC''s admin picks himself');
select pg_temp.login('a0000000-0000-0000-0000-000000000793');
select is((select d -> 0 ->> 'person_name' from public.project_duties_view('c0000000-0000-0000-0000-000000000791') d),
  'Pat Manager', 'everyone on the job sees who holds it');

-- ---------------------------------------------------------------------------------------------------------------------
-- The inspector's checks, then the duty holder sends
-- ---------------------------------------------------------------------------------------------------------------------
select pg_temp.login('a0000000-0000-0000-0000-000000000794');
select throws_ok($$ select public.ir_send_ofs(pg_temp.rid('A'), pg_temp.ver('A')) $$, '22023', 'The inspector checks it first.',
  'the duty holder sends what the inspector has checked');
select pg_temp.login('a0000000-0000-0000-0000-000000000792');
select throws_ok($$ select public.ir_ofs_check(pg_temp.rid('A'), pg_temp.ver('A'), 'si', true) $$, '22023', 'Check Ready first.',
  'Ready comes before the report');
select is((select array[((r).ofs_ready_by = auth.uid())::text, ((r).ofs_ready_at is not null)::text]
             from (select public.ir_ofs_check(pg_temp.rid('A'), pg_temp.ver('A'), 'ready', true) as r) x),
  array['true', 'true'], 'inspector Ready: him, now');
select ok(exists (select 1 from public.ir_events where request_id = pg_temp.rid('A') and action = 'ofs_ready'
                     and actor_id = 'a0000000-0000-0000-0000-000000000792'), 'history: Ready, by the inspector');
select pg_temp.login('a0000000-0000-0000-0000-000000000794');
select throws_ok($$ select public.ir_send_ofs(pg_temp.rid('A'), pg_temp.ver('A')) $$, '22023',
  'The inspector checks the special inspection report first.', 'a special inspection needs its report checked');
select pg_temp.login('a0000000-0000-0000-0000-000000000792');
select is(((public.ir_ofs_check(pg_temp.rid('A'), pg_temp.ver('A'), 'si', true)).ofs_si_by = auth.uid()), true,
  'SI report: checked by the inspector');
select throws_ok($$ select public.ir_ofs_check(pg_temp.rid('A'), pg_temp.ver('A'), 'ready', false) $$, '22023',
  'Undo the special inspection report first.', 'Undo in order');
select throws_ok($$ select public.ir_ofs_check(pg_temp.rid('B'), pg_temp.ver('B'), 'si', true) $$, '22023',
  'This request is not with the inspector.', 'B still waits on the GC');

-- The OFS number
select pg_temp.login('a0000000-0000-0000-0000-000000000794');
select is((select (c ->> 'next_number')::int from public.ir_ofs_chain(pg_temp.rid('A')) c), 3,
  'next: one after the job''s highest');
select is((public.ir_ofs_number_set(pg_temp.rid('A'), pg_temp.ver('A'), 41)).ofs_number, 41, 'the duty holder types it');
select throws_ok($$ select public.ir_ofs_number_set(pg_temp.rid('B'), pg_temp.ver('B'), 41) $$, '22023', 'OFS 41 is taken on this job.',
  'one per job');
select throws_ok($$ select public.ir_ofs_number_set(pg_temp.rid('A'), pg_temp.ver('A') - 1, 42) $$, '40001', null,
  'saved with the version check');
select is(((public.ir_send_ofs(pg_temp.rid('A'), pg_temp.ver('A'))).ofs_sent_by = auth.uid()), true, 'the duty holder sends it');

-- What the fire marshal sees: the chain, no typing by the inspector.
select pg_temp.login('a0000000-0000-0000-0000-000000000796');
select is((select array[c -> 'attest' ->> 'name', c -> 'gc' ->> 'name', c -> 'ready' ->> 'name', c -> 'si' ->> 'name',
                        c -> 'sent' ->> 'name'] from public.ir_ofs_chain(pg_temp.rid('A')) c),
  array['Sam Sub', 'Pat Manager', 'Ivy Inspector', 'Ivy Inspector', 'Pat Manager'], 'the fire marshal reads the whole chain');
select throws_ok($$ select public.ir_ofs_chain(pg_temp.rid('B')) $$, 'P0002', null, 'not one still on its way');

-- A new request takes the next after the typed one.
select pg_temp.login('a0000000-0000-0000-0000-000000000793');
select is((pg_temp.ask('Sample alarm test', false)).ofs_number, 42, 'the next request: one after the typed 41');

select * from finish();
rollback;
