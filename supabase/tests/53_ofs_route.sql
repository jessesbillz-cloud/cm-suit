begin;
select plan(142);
-- Migration 0061, the OFS route (SPEC §18.4 P1; Jesse, Oct 3): sub -> GC -> inspector -> OFS, and the two sides kept apart.
--   * The matrix: the fire marshal holds the OFS pair only; the inspector files requests.
--   * Where a new request starts, by who files it and its kind. IOR and special requests start where they always did.
--   * The GC step is always on an OFS request (even with the job's GC step off), until the inspector sends it.
--   * The inspector's steps on an OFS request: send it to OFS (Undo until the deputy acts) or postpone it. Never confirm,
--     record, sign or redraw once it is sent.
--   * The deputy's steps on an OFS request sent to OFS: confirm, postpone, attendance, results, signature, recipients.
--   * No cross-over: the deputy reads and decides nothing of an IOR or special request, nor of an OFS request still on its
--     way (rows, history, cells, maps, files, folders, calendar, board, comments); the inspector decides nothing of an
--     OFS request with OFS; an OFS request has no helper.
--   * Withdraw and restore; the database's own checks; the retired forms of the rules; the grants.
\ir _helpers.psql

create temp table ids (k text primary key, v uuid);
grant all on ids to public;
create function pg_temp.rid(p_k text) returns uuid language sql stable as $$ select v from ids where k = p_k $$;
create function pg_temp.d(p_days int) returns date language sql stable as $$
  select (now() at time zone 'America/Los_Angeles')::date + p_days $$;
-- A request's row and version, read past RLS.
create function pg_temp.req(p_k text) returns public.inspection_requests language sql stable security definer as $$
  select * from public.inspection_requests where id = (select v from ids where k = p_k) $$;
create function pg_temp.ver(p_k text) returns int language sql stable security definer as $$
  select version from public.inspection_requests where id = (select v from ids where k = p_k) $$;
-- The usual form's request on the main job, as the logged-in person.
create function pg_temp.ask(p_kind text, p_items text, p_special boolean default null, p_ack boolean default false,
                            p_job uuid default 'c0000000-0000-0000-0000-000000000541')
returns public.inspection_requests language sql volatile as $$
  select public.ir_submit(p_job, 'Sample Firestop Co', pg_temp.d(3), p_kind, p_items, true, '08:00', 'timed', 60,
    case when p_kind = 'special' then (select id from public.ir_special_kinds where active order by sort, name limit 1) end,
    '{}', p_special, p_ack) $$;
-- What a person reads of a request (logs them in): its row, history lines, cells and map.
create function pg_temp.sees(p_uid uuid, p_k text) returns int[] language plpgsql as $$
begin
  perform pg_temp.login(p_uid);
  return array[(select count(*)::int from public.inspection_requests where id = pg_temp.rid(p_k)),
               (select count(*)::int from public.ir_events where request_id = pg_temp.rid(p_k)),
               (select count(*)::int from public.ir_rev_items where request_id = pg_temp.rid(p_k)),
               (select count(*)::int from public.ir_maps where request_id = pg_temp.rid(p_k))];
end $$;
-- The board lines a person reads about a request (logs them in).
create function pg_temp.lines(p_uid uuid, p_k text) returns text[] language plpgsql as $$
begin
  perform pg_temp.login(p_uid);
  return coalesce((select array_agg(a.kind order by a.created_at, a.kind) from public.activity a where a.entity_id = pg_temp.rid(p_k)),
                  '{}'::text[]);
end $$;
grant execute on all functions in schema pg_temp to public;

select pg_temp.mk_user('a0000000-0000-0000-0000-000000000541', 'probe+rt-admin@example.test', 'Ada Admin');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000542', 'probe+rt-insp@example.test', 'Ivy Inspector');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000543', 'probe+rt-ahj@example.test', 'Dana Deputy');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000544', 'probe+rt-sub@example.test', 'Sam Sub');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000545', 'probe+rt-pm@example.test', 'Pat Manager');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000546', 'probe+rt-insp2@example.test', 'Ira Inspector');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000547', 'probe+rt-ahj2@example.test', 'Drew Deputy');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000548', 'probe+rt-owner@example.test', 'Olive Owner');

insert into public.orgs (id, name, kind, created_by) values
  ('b0000000-0000-0000-0000-000000000541', 'Sample Route Builders', 'gc', 'a0000000-0000-0000-0000-000000000541');
-- J: an OFS job being built, the job's own GC step OFF. K: an OFS job where nobody on the job can do the GC step.
insert into public.projects (id, org_id, name, stage, timezone, created_by, settings) values
  ('c0000000-0000-0000-0000-000000000541', 'b0000000-0000-0000-0000-000000000541', 'Sample Route Job', 'construction',
   'America/Los_Angeles', 'a0000000-0000-0000-0000-000000000541', '{"ir_ofs_allowed": true}'),
  ('c0000000-0000-0000-0000-000000000542', 'b0000000-0000-0000-0000-000000000541', 'Sample No GC Job', 'construction',
   'America/Los_Angeles', 'a0000000-0000-0000-0000-000000000541', '{"ir_ofs_allowed": true}');
insert into public.project_members (org_id, project_id, user_id, invite_email, role, status)
select 'b0000000-0000-0000-0000-000000000541', p::uuid, u::uuid, e, r, 'active'
  from (values
    ('c0000000-0000-0000-0000-000000000541', 'a0000000-0000-0000-0000-000000000542', 'probe+rt-insp@example.test', 'inspector'),
    ('c0000000-0000-0000-0000-000000000541', 'a0000000-0000-0000-0000-000000000543', 'probe+rt-ahj@example.test', 'ahj'),
    ('c0000000-0000-0000-0000-000000000541', 'a0000000-0000-0000-0000-000000000544', 'probe+rt-sub@example.test', 'sub'),
    ('c0000000-0000-0000-0000-000000000541', 'a0000000-0000-0000-0000-000000000545', 'probe+rt-pm@example.test', 'pm'),
    ('c0000000-0000-0000-0000-000000000541', 'a0000000-0000-0000-0000-000000000546', 'probe+rt-insp2@example.test', 'inspector'),
    ('c0000000-0000-0000-0000-000000000541', 'a0000000-0000-0000-0000-000000000547', 'probe+rt-ahj2@example.test', 'ahj'),
    ('c0000000-0000-0000-0000-000000000541', 'a0000000-0000-0000-0000-000000000548', 'probe+rt-owner@example.test', 'owner_rep'),
    ('c0000000-0000-0000-0000-000000000542', 'a0000000-0000-0000-0000-000000000542', 'probe+rt-insp@example.test', 'inspector'),
    ('c0000000-0000-0000-0000-000000000542', 'a0000000-0000-0000-0000-000000000543', 'probe+rt-ahj@example.test', 'ahj'),
    ('c0000000-0000-0000-0000-000000000542', 'a0000000-0000-0000-0000-000000000544', 'probe+rt-sub@example.test', 'sub')) v(p, u, e, r);
-- K's creator (its only GC approver) has left the job.
update public.project_members set status = 'revoked'
 where project_id = 'c0000000-0000-0000-0000-000000000542' and user_id = 'a0000000-0000-0000-0000-000000000541';

-- The request folder with a photo the sub attached, a plan sheet, and the inspector's blocked morning.
insert into ids values ('attach', public.ir_folder_make('c0000000-0000-0000-0000-000000000541', 'attachments'));
insert into public.folders (id, org_id, project_id, name, created_by) values
  ('d0000000-0000-0000-0000-000000000541', 'b0000000-0000-0000-0000-000000000541', 'c0000000-0000-0000-0000-000000000541',
   'Sample Plans', 'a0000000-0000-0000-0000-000000000541');
insert into public.files (id, org_id, project_id, folder_id, storage_path, original_name, mime, created_by, scan_status) values
  ('e0000000-0000-0000-0000-000000000541', 'b0000000-0000-0000-0000-000000000541', 'c0000000-0000-0000-0000-000000000541',
   'd0000000-0000-0000-0000-000000000541', 'test/route/l01.pdf', 'Sample L01.pdf', 'application/pdf',
   'a0000000-0000-0000-0000-000000000541', 'clean'),
  ('e0000000-0000-0000-0000-000000000542', 'b0000000-0000-0000-0000-000000000541', 'c0000000-0000-0000-0000-000000000541',
   pg_temp.rid('attach'), 'test/route/ior.jpg', 'Sample ior.jpg', 'image/jpeg', 'a0000000-0000-0000-0000-000000000544', 'clean'),
  ('e0000000-0000-0000-0000-000000000543', 'b0000000-0000-0000-0000-000000000541', 'c0000000-0000-0000-0000-000000000541',
   pg_temp.rid('attach'), 'test/route/ofs.jpg', 'Sample ofs.jpg', 'image/jpeg', 'a0000000-0000-0000-0000-000000000544', 'clean');
-- Finished uploads (0067: a sheet is a file whose upload finished).
update public.files set upload_complete = true where id::text like 'e0000000-0000-0000-0000-0000000005%' or id::text like 'e0000000-0000-0000-0000-0000000004%';
insert into public.ir_blocks (org_id, project_id, block_date, created_by)
values ('b0000000-0000-0000-0000-000000000541', 'c0000000-0000-0000-0000-000000000541', pg_temp.d(3), 'a0000000-0000-0000-0000-000000000542');

-- The inspector's revs: one list, two walls on the sheet, one item.
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000542');
insert into ids select 'L', (public.rev_list_create('c0000000-0000-0000-0000-000000000541', 'Sample Rated Walls', 'PH III', null,
  '[{"number": 0, "name": "TOW", "items": [{"name": "TOW - Speed Plugs"}]}]')).id;
insert into ids select case a.name when 'Shaftwall A' then 'wA' else 'wB' end, a.id
  from public.rev_areas_add(pg_temp.rid('L'), 'Level 01', array['Shaftwall A', 'Corridor B'], 'e0000000-0000-0000-0000-000000000541') a;
insert into ids select 'tow', i.id from public.rev_items i where i.name = 'TOW - Speed Plugs';
reset role;

-- ---------------------------------------------------------------------------------------------------------------------
-- The matrix
-- ---------------------------------------------------------------------------------------------------------------------
select is((select array_agg(capability order by capability) from public.role_permissions where role = 'ahj' and capability like 'ir.%'),
  '{ir.ofs_decide,ir.ofs_view}'::text[], 'matrix: the fire marshal holds the OFS pair, and no other inspection right');
select is(array[(select array_agg(role order by role) from public.role_permissions where capability = 'ir.ofs_decide'),
                (select array_agg(role order by role) from public.role_permissions where capability = 'ir.ofs_view')],
  array['{ahj}'::text[], '{ahj}'::text[]], 'matrix: the OFS pair is the fire marshal''s alone');
select is((select array_agg(role order by role) from public.role_permissions where capability = 'ir.decide'),
  '{inspector,inspector_admin}'::text[], 'matrix: ir.decide is the inspectors'' alone');
select ok(exists (select 1 from public.role_permissions where role = 'inspector' and capability = 'ir.request'),
  'matrix: the inspector files requests');
select is(array[public.ir_decide_cap('ofs', now()), public.ir_decide_cap('ofs', null), public.ir_decide_cap('ior', null),
                public.ir_decide_cap('special', null), public.ir_decide_cap('ior', now())],
  array['ir.ofs_decide', 'ir.decide', 'ir.decide', 'ir.decide', 'ir.decide'],
  'one rule: an OFS request sent to OFS is the deputy''s; everything else is the inspector''s');

-- ---------------------------------------------------------------------------------------------------------------------
-- Where a request starts
-- ---------------------------------------------------------------------------------------------------------------------
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000544');
insert into ids select 'I', (pg_temp.ask('ior', 'North wall framing')).id;
insert into ids select 'S', (pg_temp.ask('special', 'Epoxy anchors')).id;
select is(array[(pg_temp.req('I')).status, (pg_temp.req('S')).status], array['pending', 'pending'],
  'IOR and special requests start with the inspector, as before (the job''s GC step is off)');
select throws_ok($$ select pg_temp.ask('ofs', 'Sprinkler hydro') $$, '22023', 'Answer the special inspection question.',
  'an OFS request answers the special inspection question');
insert into ids select 'A', (public.ir_submit('c0000000-0000-0000-0000-000000000541', 'Sample Firestop Co', pg_temp.d(3), 'ofs',
  'Sprinkler hydro', true, '08:00', 'timed', 60, null, array['e0000000-0000-0000-0000-000000000543'::uuid], true)).id;
select is(array[(pg_temp.req('A')).status, ((pg_temp.req('A')).ofs_sent_at is null)::text, (pg_temp.req('A')).special_required::text],
  array['gc_review', 'true', 'true'], 'a sub''s OFS request starts with the GC even with the job''s GC step off; not sent');
insert into ids select 'W', (public.ir_submit_ofs('c0000000-0000-0000-0000-000000000541', 'Sample Firestop Co', pg_temp.d(3), true,
  array[pg_temp.rid('wA'), pg_temp.rid('wB')], array[pg_temp.rid('tow')], null, '09:00', 'timed', 60, '{}', false)).id;
select is((pg_temp.req('W')).status, 'gc_review', 'the revs request too');
select is(pg_temp.lines('a0000000-0000-0000-0000-000000000545', 'A'), array['ir.gc_review'], 'board: the GC is told');
select is(pg_temp.lines('a0000000-0000-0000-0000-000000000543', 'A'), '{}'::text[], 'board: the deputy is not');
select pg_temp.login('a0000000-0000-0000-0000-000000000541');
insert into ids select 'G', (pg_temp.ask('ofs', 'Fire pump test', false)).id;
select is(array[(pg_temp.req('G')).status, ((pg_temp.req('G')).ofs_sent_at is null)::text], array['pending', 'true'],
  'a GC approver''s OFS request skips the GC step: with the inspector, not sent');
select pg_temp.login('a0000000-0000-0000-0000-000000000542');
select throws_ok($$ select pg_temp.ask('ofs', 'Damper test', false) $$, '22023', 'Check the inspector''s statement first.',
  'the inspector''s own OFS request needs his one statement');
insert into ids select 'N', (pg_temp.ask('ofs', 'Damper test', false, true)).id;
select is(array[(pg_temp.req('N')).status, ((pg_temp.req('N')).ofs_sent_at is not null)::text,
                ((pg_temp.req('N')).ofs_sent_by = 'a0000000-0000-0000-0000-000000000542')::text, ((pg_temp.req('N')).owner_id is null)::text],
  array['pending', 'true', 'true', 'true'], '... and goes straight to OFS, sent by him');
select is(pg_temp.lines('a0000000-0000-0000-0000-000000000543', 'N'), array['ir.ofs'], 'board: the deputy is told');
select pg_temp.login('a0000000-0000-0000-0000-000000000542');
insert into ids select 'O', (pg_temp.ask('ior', 'The inspector''s own IOR request')).id;
select is(array[(pg_temp.req('O')).status, ((pg_temp.req('O')).ofs_sent_at is null)::text], array['pending', 'true'],
  'the inspector files an IOR request with no statement: his own, never sent anywhere');
select pg_temp.login('a0000000-0000-0000-0000-000000000544');
insert into ids select 'K', (pg_temp.ask('ofs', 'Hydro', false, false, 'c0000000-0000-0000-0000-000000000542')).id;
select is((pg_temp.req('K')).status, 'pending', 'a job with nobody to do the GC step: straight to the inspector, never stuck');
select pg_temp.login('a0000000-0000-0000-0000-000000000543');
select throws_ok($$ select pg_temp.ask('ofs', 'The deputy asks', false) $$, '42501', null, 'the deputy files no requests');

-- ---------------------------------------------------------------------------------------------------------------------
-- The GC step
-- ---------------------------------------------------------------------------------------------------------------------
select pg_temp.login('a0000000-0000-0000-0000-000000000542');
select throws_ok($$ select public.ir_send_ofs(pg_temp.rid('A'), pg_temp.ver('A')) $$, '22023', 'This request is not with the inspector.',
  'the inspector can''t send it before the GC has confirmed');
select throws_ok($$ select public.ir_gc_decide(pg_temp.rid('A'), pg_temp.ver('A'), true) $$, '42501', null,
  'nor do the GC''s step for them');
select pg_temp.login('a0000000-0000-0000-0000-000000000543');
select throws_ok($$ select public.ir_gc_decide(pg_temp.rid('A'), pg_temp.ver('A'), true) $$, 'P0002', null,
  'the deputy can''t find a request that is not with OFS');
select pg_temp.login('a0000000-0000-0000-0000-000000000545');
select is((public.ir_gc_decide(pg_temp.rid('A'), pg_temp.ver('A'), false, 'Not ready: no firestop yet')).status, 'returned',
  'the GC returns it with a reason');
select pg_temp.login('a0000000-0000-0000-0000-000000000544');
select is((public.ir_move(pg_temp.rid('A'), pg_temp.ver('A'), pg_temp.d(4), '08:00', 'timed', 60)).status, 'gc_review',
  'the sub picks a new day: back to the GC');
select pg_temp.login('a0000000-0000-0000-0000-000000000545');
select is((public.ir_gc_decide(pg_temp.rid('A'), pg_temp.ver('A'), true)).status, 'pending', 'the GC confirms: with the inspector');
select public.ir_gc_decide(pg_temp.rid('W'), pg_temp.ver('W'), true);
select ok('ir.requested' = any (pg_temp.lines('a0000000-0000-0000-0000-000000000542', 'A')), 'board: the inspector is told');
select is(pg_temp.lines('a0000000-0000-0000-0000-000000000543', 'A'), '{}'::text[], 'board: still nothing for the deputy');

-- ---------------------------------------------------------------------------------------------------------------------
-- The inspector's step: he routes an OFS request, he never inspects it
-- ---------------------------------------------------------------------------------------------------------------------
select pg_temp.login('a0000000-0000-0000-0000-000000000542');
select throws_ok($$ select public.ir_confirm(pg_temp.rid('A'), pg_temp.ver('A')) $$, '22023', 'Send it to OFS first.',
  'the inspector can''t confirm an OFS request');
select throws_ok($$ select public.ir_set_attendance(pg_temp.rid('A'), pg_temp.ver('A'), 'alone') $$, '22023', 'Send it to OFS first.',
  'nor set attendance');
select throws_ok($$ select public.ir_set_result(pg_temp.rid('A'), pg_temp.ver('A'), 'approved') $$, '22023', 'Send it to OFS first.',
  'nor record its result');
select throws_ok($$ select public.ir_rev_results(pg_temp.rid('W'), pg_temp.ver('W'), '[]') $$, '22023', 'Send it to OFS first.',
  'nor its walls'' results');
select throws_ok($$ select public.ir_sign(pg_temp.rid('A'), pg_temp.ver('A'), repeat('a', 64)) $$, '22023', 'Send it to OFS first.',
  'nor sign it');
select throws_ok($$ select public.ir_claim(pg_temp.rid('A'), pg_temp.ver('A')) $$, '22023', 'An OFS request has no helper.',
  'an OFS request has no helper: no claim');
select throws_ok($$ select public.ir_assign_helper(pg_temp.rid('A'), pg_temp.ver('A'), 'a0000000-0000-0000-0000-000000000546') $$,
  '22023', 'An OFS request has no helper.', '... and no assigned helper');
select throws_ok($$ select public.ir_send_ofs(pg_temp.rid('I'), pg_temp.ver('I')) $$, '22023', 'Only an OFS request goes to OFS.',
  'an IOR request never goes to OFS');
select throws_ok($$ select public.ir_send_ofs(pg_temp.rid('S'), pg_temp.ver('S')) $$, '22023', 'Only an OFS request goes to OFS.',
  'nor a special one');
select is((public.ir_postpone(pg_temp.rid('A'), pg_temp.ver('A'), 'not_ready')).status, 'postponed',
  'the inspector may postpone it before sending (MDR''s postpone, unchanged)');
select is((public.ir_move(pg_temp.rid('A'), pg_temp.ver('A'), pg_temp.d(4), '10:00', 'timed', 60)).status, 'pending',
  'the inspector moves it himself: waiting for his send, never "confirmed"');
select is((public.ir_postpone(pg_temp.rid('A'), pg_temp.ver('A'), 'not_ready')).status, 'postponed', 'postponed again');
select pg_temp.login('a0000000-0000-0000-0000-000000000544');
select is((select array[(r).status, ((r).ofs_sent_at is null)::text] from (select public.ir_move(pg_temp.rid('A'), pg_temp.ver('A'), pg_temp.d(5), '08:00', 'timed', 60) as r) x),
  array['pending', 'true'], 'the sub picks a new day: with the inspector again, still not sent');
select throws_ok($$ select public.ir_send_ofs(pg_temp.rid('A'), pg_temp.ver('A')) $$, '42501', null, 'a sub can''t send it to OFS');
select pg_temp.login('a0000000-0000-0000-0000-000000000545');
select throws_ok($$ select public.ir_send_ofs(pg_temp.rid('A'), pg_temp.ver('A')) $$, '42501', null, 'nor the GC');

-- Before it is sent the deputy reads nothing of it, anywhere.
select is(pg_temp.sees('a0000000-0000-0000-0000-000000000543', 'W'), array[0, 0, 0, 0],
  'not sent: the deputy reads no row, history, cell or map of it');
select throws_ok($$ select public.ir_confirm(pg_temp.rid('A'), pg_temp.ver('A')) $$, 'P0002', null, 'not sent: the deputy can''t confirm it');
select throws_ok($$ select public.ir_map_context(pg_temp.rid('W')) $$, 'P0002', null, 'not sent: no map for the deputy');
select throws_ok($$ select * from public.authorize_ir_file(pg_temp.rid('A'), 'e0000000-0000-0000-0000-000000000543') $$, 'P0002', null,
  'not sent: none of its files');
select ok(not public.comment_target_readable('c0000000-0000-0000-0000-000000000541', 'inspection_request', pg_temp.rid('A')),
  'not sent: no comments on it');
select is((select count(*)::int from public.calendar_inspections('c0000000-0000-0000-0000-000000000541', pg_temp.d(0), pg_temp.d(30))
            where id in (pg_temp.rid('A'), pg_temp.rid('W'))), 0, 'not sent: not on the deputy''s calendar');

-- Send
select pg_temp.login('a0000000-0000-0000-0000-000000000542');
select is((select array[(r).status, ((r).ofs_sent_at is not null)::text, ((r).ofs_sent_by = auth.uid())::text, ((r).owner_id is null)::text] from (select public.ir_send_ofs(pg_temp.rid('A'), pg_temp.ver('A')) as r) x),
  array['pending', 'true', 'true', 'true'], 'the inspector sends it to OFS: sent by him, nobody''s yet');
select is((public.ir_send_ofs(pg_temp.rid('A'), pg_temp.ver('A'))).id, pg_temp.rid('A'), 'sending again changes nothing');
select ok(exists (select 1 from public.ir_events where request_id = pg_temp.rid('A') and action = 'send_ofs'
                     and actor_id = 'a0000000-0000-0000-0000-000000000542'), 'history: the send, by the inspector');
select is(pg_temp.lines('a0000000-0000-0000-0000-000000000543', 'A'), array['ir.ofs'], 'board: the deputy is told now');
select ok(exists (select 1 from public.activity where entity_id = pg_temp.rid('A') and kind = 'ir.ofs'
                     and summary like 'IR % (OFS %) for OFS · Sample Firestop Co · %'), 'board: with both numbers');
select ok('ir.ofs' = any (pg_temp.lines('a0000000-0000-0000-0000-000000000544', 'A')), 'board: the requester is told it went to OFS');

-- Undo of the send
select pg_temp.login('a0000000-0000-0000-0000-000000000546');
select throws_ok($$ select public.ir_unsend_ofs(pg_temp.rid('A'), pg_temp.ver('A')) $$, '42501', null,
  'Undo of the send is the sender''s alone');
select pg_temp.login('a0000000-0000-0000-0000-000000000542');
select is(((public.ir_unsend_ofs(pg_temp.rid('A'), pg_temp.ver('A'))).ofs_sent_at is null), true, 'the sender takes it back');
select is(pg_temp.sees('a0000000-0000-0000-0000-000000000543', 'A'), array[0, 0, 0, 0], '... and the deputy no longer reads it');
select pg_temp.login('a0000000-0000-0000-0000-000000000542');
select public.ir_send_ofs(pg_temp.rid('A'), pg_temp.ver('A'));
select public.ir_send_ofs(pg_temp.rid('W'), pg_temp.ver('W'));

-- ---------------------------------------------------------------------------------------------------------------------
-- With OFS: the inspector is out, the GC can't take it back
-- ---------------------------------------------------------------------------------------------------------------------
select throws_ok($$ select public.ir_confirm(pg_temp.rid('A'), pg_temp.ver('A')) $$, '42501', null, 'sent: the inspector can''t confirm');
select throws_ok($$ select public.ir_postpone(pg_temp.rid('A'), pg_temp.ver('A'), 'weather') $$, '42501', null, 'sent: nor postpone');
select throws_ok($$ select public.ir_set_attendance(pg_temp.rid('A'), pg_temp.ver('A'), 'alone') $$, '42501', null, 'sent: nor set attendance');
select throws_ok($$ select public.ir_set_result(pg_temp.rid('A'), pg_temp.ver('A'), 'approved') $$, '42501', null, 'sent: nor record a result');
select throws_ok($$ select public.ir_rev_results(pg_temp.rid('W'), pg_temp.ver('W'), '[]') $$, '42501', null, 'sent: nor walls'' results');
select throws_ok($$ select public.ir_sign(pg_temp.rid('A'), pg_temp.ver('A'), repeat('a', 64)) $$, '42501', null, 'sent: nor sign');
select throws_ok($$ select public.ir_move(pg_temp.rid('A'), pg_temp.ver('A'), pg_temp.d(6), '08:00', 'timed', 60) $$, '42501', null,
  'sent: nor move it');
select throws_ok($$ select public.ir_map_save(pg_temp.rid('W'), 1, '[]') $$, '42501', null, 'sent: nor redraw its map');
select throws_ok($$ select * from public.ir_recipients(pg_temp.rid('A')) $$, '42501', null, 'sent: nor send its results');
select throws_ok($$ select public.ir_claim(pg_temp.rid('A'), pg_temp.ver('A')) $$, '22023', 'An OFS request has no helper.',
  'sent: still no helper');
select is((pg_temp.sees('a0000000-0000-0000-0000-000000000542', 'W'))[1], 1, 'sent: the inspector still reads it');
select pg_temp.login('a0000000-0000-0000-0000-000000000545');
select throws_ok($$ select public.ir_gc_decide(pg_temp.rid('A'), pg_temp.ver('A'), false, 'Take it back') $$, '22023',
  'The inspector has this one now.', 'sent: the GC can''t take it back');

-- ---------------------------------------------------------------------------------------------------------------------
-- The deputy's steps
-- ---------------------------------------------------------------------------------------------------------------------
select ok((select s[1] = 1 and s[2] > 0 and s[3] = 2 and s[4] = 1 from (select pg_temp.sees('a0000000-0000-0000-0000-000000000543', 'W') as s) x),
  'sent: the deputy reads the row, its history, its cells and its map');
select is((select array_agg(c.kind || ' ' || c.full_detail || ' ' || c.ofs_sent order by c.number)
             from public.calendar_inspections('c0000000-0000-0000-0000-000000000541', pg_temp.d(0), pg_temp.d(30)) c),
  array['ofs true true', 'ofs true true', 'ofs true true'],
  'the deputy''s calendar: the OFS requests sent to OFS in full; no IOR, no special, no unsent, no inspector''s block');
select is((select storage_path from public.authorize_ir_file(pg_temp.rid('A'), 'e0000000-0000-0000-0000-000000000543')),
  'test/route/ofs.jpg', 'the deputy opens the request''s photo through the request');
select ok(public.comment_target_readable('c0000000-0000-0000-0000-000000000541', 'inspection_request', pg_temp.rid('A')),
  'and may comment on it');
select is((select array[(r).status, ((r).owner_id = auth.uid())::text] from (select public.ir_confirm(pg_temp.rid('A'), pg_temp.ver('A')) as r) x),
  array['confirmed', 'true'], 'the deputy confirms: his');
select pg_temp.login('a0000000-0000-0000-0000-000000000542');
select throws_ok($$ select public.ir_unsend_ofs(pg_temp.rid('A'), pg_temp.ver('A')) $$, '22023', 'OFS has this one now.',
  'no Undo of the send once the deputy has acted');
select pg_temp.login('a0000000-0000-0000-0000-000000000547');
select throws_ok($$ select public.ir_set_result(pg_temp.rid('A'), pg_temp.ver('A'), 'approved') $$, '42501', null,
  'another deputy doesn''t decide the first one''s request');
select pg_temp.login('a0000000-0000-0000-0000-000000000543');
select is((public.ir_postpone(pg_temp.rid('A'), pg_temp.ver('A'), 'weather')).status, 'postponed', 'the deputy postpones');
select pg_temp.login('a0000000-0000-0000-0000-000000000544');
select is((select array[(r).status, ((r).ofs_sent_at is not null)::text] from (select public.ir_move(pg_temp.rid('A'), pg_temp.ver('A'), pg_temp.d(7), '08:00', 'timed', 60) as r) x),
  array['pending', 'true'], 'the sub picks a new day: back with the deputy (still with OFS)');
select ok('ir.moved' = any (pg_temp.lines('a0000000-0000-0000-0000-000000000543', 'A')), 'board: the deputy is told of the move');
select ok(not ('ir.moved' = any (pg_temp.lines('a0000000-0000-0000-0000-000000000546', 'A'))), 'board: the inspectors are not');
select pg_temp.login('a0000000-0000-0000-0000-000000000543');
select is((public.ir_set_attendance(pg_temp.rid('A'), pg_temp.ver('A'), 'be_present')).attendance, 'be_present', 'the deputy sets attendance');
select is((select array[(r).result, (r).status] from (select public.ir_set_result(pg_temp.rid('A'), pg_temp.ver('A'), 'approved') as r) x),
  array['approved', 'confirmed'], 'the deputy records the result');
select is(((public.ir_sign(pg_temp.rid('A'), pg_temp.ver('A'), repeat('b', 64))).signed_by = auth.uid()), true, 'the deputy signs');
select isnt_empty($$ select 1 from public.ir_recipients(pg_temp.rid('A')) $$, 'the deputy picks who gets the results');
-- Send results: his own IR (a file he made, in the OFS folder he doesn't browse) goes out; the inspector's IR never does.
reset role;
insert into ids values ('ofs_folder', public.ir_folder_make('c0000000-0000-0000-0000-000000000541', 'ofs_reports')),
                       ('ior_folder', public.ir_folder_make('c0000000-0000-0000-0000-000000000541', 'reports'));
insert into public.files (id, org_id, project_id, folder_id, storage_path, original_name, mime, created_by, scan_status) values
  ('e0000000-0000-0000-0000-000000000544', 'b0000000-0000-0000-0000-000000000541', 'c0000000-0000-0000-0000-000000000541',
   pg_temp.rid('ofs_folder'), 'test/route/ofs-ir.pdf', 'Sample OFS IR.pdf', 'application/pdf', 'a0000000-0000-0000-0000-000000000543', 'clean'),
  ('e0000000-0000-0000-0000-000000000545', 'b0000000-0000-0000-0000-000000000541', 'c0000000-0000-0000-0000-000000000541',
   pg_temp.rid('ior_folder'), 'test/route/ior-ir.pdf', 'Sample IOR IR.pdf', 'application/pdf', 'a0000000-0000-0000-0000-000000000542', 'clean');
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000543');
select ok(not public.folder_can_read(pg_temp.rid('ofs_folder')), 'the deputy doesn''t browse the OFS IR folder (unsent requests'' maps are filed there)');
select lives_ok($$ select public.create_transmittal('c0000000-0000-0000-0000-000000000541', array['probe+rt-sub@example.test'], '{}',
  array['e0000000-0000-0000-0000-000000000544'::uuid], 'IR results', '') $$, 'the deputy sends the IR he made');
select lives_ok($$ insert into public.share_links (created_by, org_id, project_id, target_type, target_id, recipient_email)
  values (auth.uid(), 'b0000000-0000-0000-0000-000000000541', 'c0000000-0000-0000-0000-000000000541', 'file',
          'e0000000-0000-0000-0000-000000000544', 'probe+rt-sub@example.test') $$, '... as a share link');
select throws_ok($$ select public.create_transmittal('c0000000-0000-0000-0000-000000000541', array['probe+rt-sub@example.test'], '{}',
  array['e0000000-0000-0000-0000-000000000545'::uuid], 'IR results', '') $$, null, null, 'the deputy can''t send the inspector''s IR');
select throws_ok($$ insert into public.share_links (created_by, org_id, project_id, target_type, target_id, recipient_email)
  values (auth.uid(), 'b0000000-0000-0000-0000-000000000541', 'c0000000-0000-0000-0000-000000000541', 'file',
          'e0000000-0000-0000-0000-000000000545', 'probe+rt-sub@example.test') $$, '42501', null, '... nor link to it');
select is((select (r).result from (select public.ir_rev_results(pg_temp.rid('W'), pg_temp.ver('W'),
             (select jsonb_agg(jsonb_build_object('area_id', c.area_id, 'item_id', c.item_id, 'result', 'passed'))
                from public.ir_rev_items c where c.request_id = pg_temp.rid('W'))) as r) x), 'approved',
  'the deputy passes each wall');
select is((public.ir_map_context(pg_temp.rid('W')) ->> 'can_edit'), 'true', 'the deputy may draw on its map');
select pg_temp.login('a0000000-0000-0000-0000-000000000548');
select is((pg_temp.sees('a0000000-0000-0000-0000-000000000548', 'A'))[1], 1, 'the owner''s rep (ir.view_all) reads it as before');

-- ---------------------------------------------------------------------------------------------------------------------
-- No cross-over: the deputy has nothing to do with IOR and special requests
-- ---------------------------------------------------------------------------------------------------------------------
reset role;
update public.inspection_requests set attachment_ids = array['e0000000-0000-0000-0000-000000000542'::uuid] where id = pg_temp.rid('I');
set local role authenticated;
select is(pg_temp.sees('a0000000-0000-0000-0000-000000000543', 'I') || pg_temp.sees('a0000000-0000-0000-0000-000000000543', 'S')
          || pg_temp.sees('a0000000-0000-0000-0000-000000000543', 'O'), array[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  'the deputy reads no IOR or special request: no row, no history');
select is((select count(*)::int from public.inspection_requests where kind <> 'ofs' or ofs_sent_at is null), 0,
  'every request the deputy reads is an OFS request sent to OFS');
select throws_ok($$ select public.ir_confirm(pg_temp.rid('I'), pg_temp.ver('I')) $$, 'P0002', null, 'IOR: the deputy can''t confirm');
select throws_ok($$ select public.ir_postpone(pg_temp.rid('I'), pg_temp.ver('I'), 'weather') $$, 'P0002', null, 'IOR: nor postpone');
select throws_ok($$ select public.ir_set_result(pg_temp.rid('I'), pg_temp.ver('I'), 'approved') $$, 'P0002', null, 'IOR: nor record a result');
select throws_ok($$ select public.ir_sign(pg_temp.rid('I'), pg_temp.ver('I'), repeat('a', 64)) $$, 'P0002', null, 'IOR: nor sign');
select throws_ok($$ select public.ir_claim(pg_temp.rid('I'), pg_temp.ver('I')) $$, 'P0002', null, 'IOR: nor claim it');
select throws_ok($$ select public.ir_move(pg_temp.rid('I'), pg_temp.ver('I'), pg_temp.d(6), '08:00', 'timed', 60) $$, 'P0002', null,
  'IOR: nor move it');
select throws_ok($$ select public.ir_gc_decide(pg_temp.rid('I'), pg_temp.ver('I'), true) $$, 'P0002', null, 'IOR: nor the GC''s step');
select throws_ok($$ select * from public.ir_recipients(pg_temp.rid('I')) $$, '42501', null, 'IOR: nor its recipients');
select throws_ok($$ select public.set_request_permit(pg_temp.rid('I'), null, null) $$, 'P0002', null, 'IOR: nor its permit');
select throws_ok($$ select public.ir_confirm(pg_temp.rid('S'), pg_temp.ver('S')) $$, 'P0002', null, 'special: the deputy can''t confirm');
select throws_ok($$ select public.ir_set_result(pg_temp.rid('S'), pg_temp.ver('S'), 'approved') $$, 'P0002', null, 'special: nor record a result');
select throws_ok($$ select * from public.authorize_ir_file(pg_temp.rid('I'), 'e0000000-0000-0000-0000-000000000542') $$, 'P0002', null,
  'IOR: none of its files');
select ok(not public.comment_target_readable('c0000000-0000-0000-0000-000000000541', 'inspection_request', pg_temp.rid('I')),
  'IOR: no comments');
select is(pg_temp.lines('a0000000-0000-0000-0000-000000000543', 'I') || pg_temp.lines('a0000000-0000-0000-0000-000000000543', 'S'),
  '{}'::text[], 'IOR and special: no board lines');
select is((select count(*)::int from public.calendar_entries where source_type = 'inspection_request'), 0,
  'no inspection line of any kind on the deputy''s job calendar');
select is((select count(*)::int from public.ir_blocks), 0, 'none of the inspector''s blocked time');
select is((select count(*)::int from public.files where folder_id = pg_temp.rid('attach')), 0,
  'the deputy doesn''t browse the request folder');
select ok(not public.folder_can_read(pg_temp.rid('attach')) and public.folder_can_write(pg_temp.rid('attach')),
  '... he only adds to it (result photos), as requesters do');
select throws_ok($$ select public.ir_folder('c0000000-0000-0000-0000-000000000541', 'reports') $$, '42501', null,
  'the inspector''s IR folder is not the deputy''s');
select lives_ok($$ insert into ids select 'ofs_reports', public.ir_folder('c0000000-0000-0000-0000-000000000541', 'ofs_reports') $$,
  'OFS IRs and maps have their own folder');
select is(pg_temp.rid('ofs_reports'), pg_temp.rid('ofs_folder'), 'one such folder per job');
select pg_temp.login('a0000000-0000-0000-0000-000000000542');
select throws_ok($$ select public.ir_folder('c0000000-0000-0000-0000-000000000541', 'ofs_reports') $$, '42501', null,
  '... which the inspector doesn''t file into');
select ok(public.folder_can_read(pg_temp.rid('ofs_reports')) and not public.folder_can_write(pg_temp.rid('ofs_reports')),
  '... he reads it');
insert into ids select 'reports', public.ir_folder('c0000000-0000-0000-0000-000000000541', 'reports');
select ok(pg_temp.rid('reports') <> pg_temp.rid('ofs_reports'), 'two folders: the inspector''s IRs and the OFS IRs never share one');
select ok(not pg_temp.can_read_as('a0000000-0000-0000-0000-000000000543', pg_temp.rid('reports')), 'the deputy can''t read the inspector''s IR folder');
-- Both names are the server's (0068): nobody makes an "OFS inspection reports" folder by hand for the IRs to land in.
select pg_temp.login('a0000000-0000-0000-0000-000000000541');
select ok(public.folder_name_reserved('c0000000-0000-0000-0000-000000000541',
            (select parent_id from public.folders where id = pg_temp.rid('ofs_reports')), 'OFS inspection reports')
          and public.folder_name_reserved('c0000000-0000-0000-0000-000000000541',
            (select parent_id from public.folders where id = pg_temp.rid('ofs_reports')), 'Inspection reports'),
  'under Reports, both IR folder names are reserved');
select ok(public.folder_name_reserved('c0000000-0000-0000-0000-000000000541',
            (select parent_id from public.folders where id = pg_temp.rid('ofs_reports')), 'Closeout reports') is not true,
  '... and another name is free');
select throws_ok($$ insert into public.folders (org_id, project_id, parent_id, name, created_by)
                    select f.org_id, f.project_id, f.parent_id, ' OFS inspection reports ', 'a0000000-0000-0000-0000-000000000541'
                      from public.folders f where f.id = pg_temp.rid('ofs_reports') $$,
  '23505', 'That name is used by the system. Pick another.', 'a person cannot make a folder of that name');

-- The inspector's own work is untouched: IOR and special requests run as they did.
select pg_temp.login('a0000000-0000-0000-0000-000000000542');
select is((public.ir_confirm(pg_temp.rid('I'), pg_temp.ver('I'))).status, 'confirmed', 'IOR: the inspector confirms');
select is((public.ir_assign_helper(pg_temp.rid('I'), pg_temp.ver('I'), 'a0000000-0000-0000-0000-000000000546')).helper_id,
  'a0000000-0000-0000-0000-000000000546'::uuid, 'IOR: a helper, as before');
select is((public.ir_set_result(pg_temp.rid('I'), pg_temp.ver('I'), 'approved')).result, 'approved', 'IOR: the result');
select is(((public.ir_sign(pg_temp.rid('I'), pg_temp.ver('I'), repeat('c', 64))).signed_by = auth.uid()), true, 'IOR: the signature');
select is((public.ir_postpone(pg_temp.rid('S'), pg_temp.ver('S'), 'weather')).status, 'postponed', 'special: postponed, as before');
select is((public.ir_confirm(pg_temp.rid('O'), pg_temp.ver('O'))).status, 'confirmed', 'the inspector''s own IOR request: he confirms it');

-- ---------------------------------------------------------------------------------------------------------------------
-- Withdraw and restore
-- ---------------------------------------------------------------------------------------------------------------------
select public.ir_send_ofs(pg_temp.rid('G'), pg_temp.ver('G'));
select pg_temp.login('a0000000-0000-0000-0000-000000000541');
select is((public.ir_withdraw(pg_temp.rid('G'), pg_temp.ver('G'))).status, 'withdrawn', 'the GC withdraws their sent request');
select ok('ir.withdrawn' = any (pg_temp.lines('a0000000-0000-0000-0000-000000000543', 'G')), 'board: the deputy is told');
select pg_temp.login('a0000000-0000-0000-0000-000000000541');
select is((select array[(r).status, ((r).ofs_sent_at is not null)::text] from (select public.ir_restore(pg_temp.rid('G'), pg_temp.ver('G')) as r) x),
  array['pending', 'true'], 'restored: it skipped the GC step, so it is with OFS again');
-- A sub's request that went through the GC starts the route again.
select pg_temp.login('a0000000-0000-0000-0000-000000000544');
insert into ids select 'B', (pg_temp.ask('ofs', 'Alarm acceptance test', false)).id;
select pg_temp.login('a0000000-0000-0000-0000-000000000545');
select public.ir_gc_decide(pg_temp.rid('B'), pg_temp.ver('B'), true);
select pg_temp.login('a0000000-0000-0000-0000-000000000542');
select public.ir_send_ofs(pg_temp.rid('B'), pg_temp.ver('B'));
select pg_temp.login('a0000000-0000-0000-0000-000000000543');
select public.ir_confirm(pg_temp.rid('B'), pg_temp.ver('B'));
select pg_temp.login('a0000000-0000-0000-0000-000000000544');
select public.ir_withdraw(pg_temp.rid('B'), pg_temp.ver('B'));
select is((select array[(r).status, ((r).ofs_sent_at is null)::text, ((r).owner_id is null)::text] from (select public.ir_restore(pg_temp.rid('B'), pg_temp.ver('B')) as r) x),
  array['gc_review', 'true', 'true'], 'a sub''s restored request starts again at the GC: not with OFS, nobody''s');
select is((pg_temp.sees('a0000000-0000-0000-0000-000000000543', 'B'))[1], 0, '... and the deputy no longer reads it');

-- ---------------------------------------------------------------------------------------------------------------------
-- The database's own checks
-- ---------------------------------------------------------------------------------------------------------------------
reset role;
select throws_ok($$ update public.inspection_requests set ofs_sent_at = now(), ofs_sent_by = 'a0000000-0000-0000-0000-000000000542'
                     where id = pg_temp.rid('S') $$, '23514', null, 'only an OFS request can be with OFS');
select throws_ok($$ update public.inspection_requests set ofs_sent_by = null where id = pg_temp.rid('A') $$, '23514', null,
  'a sent request names who sent it');
select throws_ok($$ update public.inspection_requests set helper_id = 'a0000000-0000-0000-0000-000000000546' where id = pg_temp.rid('A') $$,
  '23514', null, 'an OFS request has no helper');
select is((select count(*)::int from public.folder_access a where a.folder_id = pg_temp.rid('ofs_reports') and a.can_write), 0,
  'nobody writes the OFS IR folder by hand: the server files the IRs and maps');

-- ---------------------------------------------------------------------------------------------------------------------
-- The retired forms, and the grants
-- ---------------------------------------------------------------------------------------------------------------------
select is_empty($$ select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname not like '%\_retired\_%'
     and (p.prosrc ~ 'ir_may_see\(\s*[a-z_.]+\s*,\s*[a-z_.]+\s*\)' or p.prosrc ~ 'ir_owner_ok\(\s*[a-z_.]+\s*,\s*[a-z_.]+\s*\)'
          or p.prosrc ~ 'ir_first_status\(\s*[a-z_.]+\s*\)' or p.prosrc ~ 'retired_0061') $$,
  'no function still decides by the old forms of the rules');
select is_empty($$ select polname from pg_policy where pg_get_expr(polqual, polrelid) ~ 'retired' $$, 'nor any policy');
select is_empty($$ select f from unnest(array['public.ir_send_ofs(uuid, integer)', 'public.ir_unsend_ofs(uuid, integer)',
    'public.calendar_inspections(uuid, date, date)', 'public.ir_may_see(uuid, uuid, text, timestamp with time zone)']) f
   where has_function_privilege('anon', f, 'EXECUTE') or not has_function_privilege('authenticated', f, 'EXECUTE') $$,
  'grants: the route''s functions are for signed-in people, never anon');
select is_empty($$ select f from unnest(array['public.ir_decide_cap(text, timestamp with time zone)',
    'public.ir_member_holds(uuid, uuid, text)', 'public.ir_owner_ok(uuid, uuid, text, timestamp with time zone)',
    'public.ir_first_status(uuid, text)', 'public.ir_tell_ofs(uuid)', 'public.ir_decider(uuid, integer, boolean)']) f
   where has_function_privilege('anon', f, 'EXECUTE') or has_function_privilege('authenticated', f, 'EXECUTE') $$,
  'grants: the helpers are internal');
set local role anon;
select throws_ok($$ select public.ir_send_ofs('e0000000-0000-0000-0000-000000000541', 1) $$, '42501', null, 'anon: no sending');
select throws_ok($$ select * from public.inspection_requests $$, '42501', null, 'anon: no requests');
reset role;

select * from finish();
rollback;
