begin;
select plan(77);
-- Migration 0061, the permit side: the one extra question on every OFS request (special inspection required?; member
-- form, revs request, the link's two), an OFS request from a Revs list carrying the list's permit, the map's facts (the
-- permit number), the stage Inspected (IS) in place of "Inspections" and what holds it, the expiry by the last
-- inspection, and reviews under one permit (new kinds, review numbers and backchecks, several open at once, one open
-- cycle per review). The route itself (sub -> GC -> inspector -> OFS) is 53_ofs_route.sql.
\ir _helpers.psql

create temp table ids (k text primary key, v uuid);
grant all on ids to public;
create temp table res (k text primary key, j jsonb);
grant all on res to public;
create function pg_temp.rid(p_k text) returns uuid language sql stable as $$ select v from ids where k = p_k $$;
create function pg_temp.j(p_k text) returns jsonb language sql stable as $$ select j from res where k = p_k $$;
create function pg_temp.h(p text) returns text language sql immutable as $$ select encode(extensions.digest(p, 'sha256'), 'hex') $$;
create function pg_temp.d(p_days int) returns date language sql stable as $$
  select (now() at time zone 'America/Los_Angeles')::date + p_days $$;
-- Read past RLS: a request's row, a permit's row, a review's version.
create function pg_temp.req(p_id uuid) returns public.inspection_requests language sql stable security definer as $$
  select * from public.inspection_requests where id = p_id $$;
create function pg_temp.pmt(p_id uuid) returns public.permits language sql stable security definer as $$
  select * from public.permits where id = p_id $$;
create function pg_temp.rev(p_id uuid) returns public.permit_reviews language sql stable security definer as $$
  select * from public.permit_reviews where id = p_id $$;
-- The request a link answer is (by its number on the main job).
create function pg_temp.linkreq(p_k text) returns uuid language sql stable security definer as $$
  select r.id from public.inspection_requests r
   where r.project_id = 'c0000000-0000-0000-0000-000000000531' and r.number = ((select j from res where k = p_k)->>'number')::int $$;
-- The member's revs request on the main job (wall and item keys), as the logged-in person.
create function pg_temp.ofs(p_areas text[], p_items text[], p_special boolean) returns public.inspection_requests language sql volatile as $$
  select public.ir_submit_ofs('c0000000-0000-0000-0000-000000000531', 'Sample Firestop Co', pg_temp.d(3), true,
    array(select pg_temp.rid(a) from unnest(p_areas) a), array(select pg_temp.rid(i) from unnest(p_items) i), null,
    '08:00', 'timed', 60, p_special_required => p_special) $$;
-- The link's revs request (service role).
create function pg_temp.lofs(p_name text, p_areas text[], p_items text[], p_special boolean) returns jsonb language sql volatile as $$
  select public.link_request_submit_ofs(p_project_id => 'c0000000-0000-0000-0000-000000000531', p_token_hash => pg_temp.h('job-token'),
    p_hub_id => null, p_name => p_name, p_company => 'Sample Firestop Co', p_phone => '5550105300', p_email => null,
    p_request_date => pg_temp.d(3), p_notice_ack => true, p_area_ids => array(select pg_temp.rid(a) from unnest(p_areas) a),
    p_item_ids => array(select pg_temp.rid(i) from unnest(p_items) i), p_start_time => '09:00', p_duration_kind => 'timed',
    p_duration_min => 60, p_special_required => p_special) $$;
-- The route to OFS: the GC (the PM) approves, the inspector sends it.
create function pg_temp.to_ofs(p_request uuid) returns void language plpgsql as $$
begin
  perform pg_temp.login('a0000000-0000-0000-0000-000000000535');
  perform public.ir_gc_decide(p_request, (pg_temp.req(p_request)).version, true);
  perform pg_temp.login('a0000000-0000-0000-0000-000000000532');
  perform public.ir_send_ofs(p_request, (pg_temp.req(p_request)).version);
end $$;
-- Every cell of a request passed (the inspector's results).
create function pg_temp.pass_all(p_request uuid) returns jsonb language sql stable security definer as $$
  select jsonb_agg(jsonb_build_object('area_id', area_id, 'item_id', item_id, 'result', 'passed')) from public.ir_rev_items
   where request_id = p_request $$;
-- The required inspections still open on a permit (an internal helper), read past the grants.
create function pg_temp.open(p_permit uuid) returns int language sql stable security definer as $$
  select public.permit_open_inspections(p_permit) $$;
grant execute on all functions in schema pg_temp to public;

select pg_temp.mk_user('a0000000-0000-0000-0000-000000000531', 'probe+op-admin@example.test', 'Ada Admin');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000532', 'probe+op-insp@example.test', 'Ivy Inspector');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000533', 'probe+op-ahj@example.test', 'Dana Deputy');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000534', 'probe+op-sub@example.test', 'Sam Sub');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000535', 'probe+op-pm@example.test', 'Pat Manager');

insert into public.orgs (id, name, kind, created_by) values
  ('b0000000-0000-0000-0000-000000000531', 'Sample OFS Builders', 'gc', 'a0000000-0000-0000-0000-000000000531');
-- J: an OFS job being built (Revs and Permits on) with its request link.
insert into public.projects (id, org_id, name, stage, timezone, created_by, settings) values
  ('c0000000-0000-0000-0000-000000000531', 'b0000000-0000-0000-0000-000000000531', 'Sample OFS Job', 'construction',
   'America/Los_Angeles', 'a0000000-0000-0000-0000-000000000531', '{"ir_ofs_allowed": true}');
update public.projects set request_token_hash = pg_temp.h('job-token') where id = 'c0000000-0000-0000-0000-000000000531';
insert into public.project_members (org_id, project_id, user_id, invite_email, role, status)
select 'b0000000-0000-0000-0000-000000000531', 'c0000000-0000-0000-0000-000000000531', u::uuid, e, r, 'active'
  from (values ('a0000000-0000-0000-0000-000000000532', 'probe+op-insp@example.test', 'inspector'),
               ('a0000000-0000-0000-0000-000000000533', 'probe+op-ahj@example.test', 'ahj'),
               ('a0000000-0000-0000-0000-000000000534', 'probe+op-sub@example.test', 'sub'),
               ('a0000000-0000-0000-0000-000000000535', 'probe+op-pm@example.test', 'pm')) v(u, e, r);
insert into public.folders (id, org_id, project_id, name, created_by) values
  ('d0000000-0000-0000-0000-000000000531', 'b0000000-0000-0000-0000-000000000531', 'c0000000-0000-0000-0000-000000000531',
   'Sample Plans', 'a0000000-0000-0000-0000-000000000531');
insert into public.files (id, org_id, project_id, folder_id, storage_path, original_name, mime, created_by, scan_status) values
  ('e0000000-0000-0000-0000-000000000531', 'b0000000-0000-0000-0000-000000000531', 'c0000000-0000-0000-0000-000000000531',
   'd0000000-0000-0000-0000-000000000531', 'test/ofs-permits/l01.pdf', 'Sample L01.pdf', 'application/pdf',
   'a0000000-0000-0000-0000-000000000531', 'clean');

-- The deputy's permits: P issued today (24-0001), Q a draft (24-0002).
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000533');
insert into ids select 'P', (public.permit_create('c0000000-0000-0000-0000-000000000531', '24-0001', 'Building - new construction',
  'building', '{}', null, '', 'in_review')).id;
select public.permit_move(pg_temp.rid('P'), null, 'issued');
insert into ids select 'Q', (public.permit_create('c0000000-0000-0000-0000-000000000531', '24-0002', 'Site utilities and fire water',
  'site_utility')).id;
-- The inspector's revs: list L on permit P (TOW; HOW stuff and spray), walls A and B; list L2 with no permit, wall O.
select pg_temp.login('a0000000-0000-0000-0000-000000000532');
insert into ids select 'L', (public.rev_list_create('c0000000-0000-0000-0000-000000000531', 'Sample Rated Walls', 'PH III',
  pg_temp.rid('P'), '[{"number": 0, "name": "TOW", "items": [{"name": "TOW - Speed Plugs"}]},
    {"number": 1, "name": "HOW - Cavity", "items": [{"name": "HOW Cavity Stuff"}, {"name": "HOW Cavity Spray"}]}]')).id;
insert into ids select 'L2', (public.rev_list_create('c0000000-0000-0000-0000-000000000531', 'Sample Other Walls', null, null,
  '[{"number": 0, "name": "Other", "items": [{"name": "Other Item"}]}]')).id;
insert into ids select case a.name when 'Shaftwall A' then 'wA' else 'wB' end, a.id
  from public.rev_areas_add(pg_temp.rid('L'), 'Level 01', array['Shaftwall A', 'Corridor B'], 'e0000000-0000-0000-0000-000000000531') a;
insert into ids select 'wO', a.id from public.rev_areas_add(pg_temp.rid('L2'), 'Level 01', array['Other wall'], null) a;
insert into ids select k, i.id from (values ('tow', 'TOW - Speed Plugs'), ('stuff', 'HOW Cavity Stuff'),
  ('spray', 'HOW Cavity Spray'), ('other', 'Other Item')) v(k, n) join public.rev_items i on i.name = v.n;

-- ---------------------------------------------------------------------------------------------------------------------
-- 1. The one extra question on an OFS request; the request carries its list's permit
-- ---------------------------------------------------------------------------------------------------------------------
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000534');
select throws_ok($$ select pg_temp.ofs(array['wA', 'wB'], array['tow'], null) $$, '22023', 'Answer the special inspection question.',
  'revs request: refused without the special inspection answer');
select throws_ok($$ select pg_temp.ofs(array['wA'], array['tow', 'other'], false) $$, '22023',
  'Pick the walls and items from one list.', 'the earlier refusals still read as they did');
select lives_ok($$ insert into ids select 'M1', (pg_temp.ofs(array['wA', 'wB'], array['tow'], false)).id $$,
  'revs request: made with the answer');
select is((pg_temp.req(pg_temp.rid('M1'))).special_required, false, 'the answer is stored with the request');
select is((pg_temp.req(pg_temp.rid('M1'))).permit_id, pg_temp.rid('P'), 'the request carries its list''s permit');
select lives_ok($$ insert into ids select 'M2', (pg_temp.ofs(array['wO'], array['other'], true)).id $$,
  'a request on a list with no permit');
select is(array[(pg_temp.req(pg_temp.rid('M2'))).permit_id is null, (pg_temp.req(pg_temp.rid('M2'))).special_required],
  array[true, true], '... carries none; special inspection required: yes');
select throws_ok($$ select public.ir_submit('c0000000-0000-0000-0000-000000000531', 'Sample Co', pg_temp.d(4), 'ofs',
  'An OFS request from the usual form', true, p_duration_kind => 'all_day') $$, '22023', 'Answer the special inspection question.',
  'the usual form: an OFS request needs the answer too');
select is((public.ir_submit('c0000000-0000-0000-0000-000000000531', 'Sample Co', pg_temp.d(4), 'ofs', 'An OFS request',
  true, p_duration_kind => 'all_day', p_special_required => true)).special_required, true, '... and stores it');
select is((public.ir_submit('c0000000-0000-0000-0000-000000000531', 'Sample Co', pg_temp.d(4), 'ior', 'An IOR request',
  true, p_duration_kind => 'all_day', p_special_required => true)).special_required, null::boolean,
  'other kinds carry no answer');
reset role;
select throws_ok($$ update public.inspection_requests set special_required = true
                     where project_id = 'c0000000-0000-0000-0000-000000000531' and kind = 'ior' $$,
  '23514', null, 'the database keeps the answer to OFS requests');
select is_empty($$ select 1 from information_schema.columns
                    where table_schema = 'public' and table_name = 'inspection_requests' and column_name = 'readiness' $$,
  'no per-item readiness checklist on a request (the route is the readiness check)');

-- The link
set local role service_role;
select pg_temp.login_service();
select throws_ok($$ select pg_temp.lofs('Sample Visitor', array['wA'], array['stuff', 'spray'], null) $$, '22023',
  'Answer the special inspection question.', 'link revs request: refused without the answer');
insert into res values ('V1', pg_temp.lofs('Sample Visitor', array['wA'], array['stuff', 'spray'], true));
reset role;
insert into ids values ('V1', pg_temp.linkreq('V1'));
select is(array[to_jsonb((pg_temp.req(pg_temp.rid('V1'))).special_required), to_jsonb((pg_temp.req(pg_temp.rid('V1'))).permit_id)],
  array['true'::jsonb, to_jsonb(pg_temp.rid('P'))], 'link revs request: the answer and the list''s permit');
set local role service_role;
select pg_temp.login_service();
select throws_ok($$ select public.link_request_submit('c0000000-0000-0000-0000-000000000531', pg_temp.h('job-token'), null,
  'Sample Typed', 'Sample Fire Co', '5550105301', null, pg_temp.d(3), 'ofs', 'Hydro test', true, '10:00', 'timed', 60) $$,
  '22023', 'Answer the special inspection question.', 'link typed OFS request: refused without it');
select ok((public.link_request_submit('c0000000-0000-0000-0000-000000000531', pg_temp.h('job-token'), null,
  'Sample Typed', 'Sample Fire Co', '5550105301', null, pg_temp.d(3), 'ofs', 'Hydro test', true, '10:00', 'timed', 60,
  p_special_required => false)) ? 'receipt', '... and made with it');
select ok((public.link_request_submit('c0000000-0000-0000-0000-000000000531', pg_temp.h('job-token'), null,
  'Sample Typed', 'Sample Framing', '5550105301', null, pg_temp.d(3), 'ior', 'Hold downs', true, '10:00', 'timed', 60)) ? 'receipt',
  'link IOR request: no question');

-- ---------------------------------------------------------------------------------------------------------------------
-- 2. The map's facts: the permit number (never to the link visitor)
-- ---------------------------------------------------------------------------------------------------------------------
reset role;
select is(array[public.ir_map_facts(pg_temp.rid('M1')) ->> 'permit_number', (public.ir_map_facts(pg_temp.rid('M1')) ? 'readiness')::text],
  array['24-0001', 'false'], 'map facts: the permit number, no checklist');
select is(public.ir_map_facts(pg_temp.rid('M2')) -> 'permit_number', 'null'::jsonb, 'map facts: no permit, no number');
select ok(not (public.link_request_map_view(pg_temp.rid('V1')) ?| array['readiness', 'permit_number']),
  'the link visitor''s map view leaves it out');
update public.ir_maps set stale = false where request_id = pg_temp.rid('M1');
set local role authenticated;
-- The deputy works on requests sent to OFS: the GC approves and the inspector sends M1 and the visitor's.
select pg_temp.to_ofs(pg_temp.rid('M1'));
select pg_temp.to_ofs(pg_temp.rid('V1'));
select pg_temp.login('a0000000-0000-0000-0000-000000000533');
select is((public.set_request_permit(pg_temp.rid('M1'), null, null)).permit_id, null::uuid, 'the deputy takes it off the permit');
select ok((select stale from public.ir_maps where request_id = pg_temp.rid('M1')), '... and the map PDF is out of date');
select is((public.set_request_permit(pg_temp.rid('M1'), null, pg_temp.rid('P'))).permit_id, pg_temp.rid('P'), 'and puts it back');
select is((select d -> 'inspections' -> 0 ->> 'ofs_number' from public.permit_detail(pg_temp.rid('P')) d)::int,
  (pg_temp.req(pg_temp.rid('V1'))).ofs_number, 'the permit lists its OFS requests with their OFS IR numbers');

-- ---------------------------------------------------------------------------------------------------------------------
-- 3. Stages: Inspected (IS)
-- ---------------------------------------------------------------------------------------------------------------------
reset role;
select is(array[public.permit_stage_ok('inspected'), public.permit_stage_ok('inspections'), public.permit_stage_ok(null)],
  array[true, false, false], 'stages: Inspected in, the old Inspections out');
select throws_ok($$ update public.permits set stage = 'inspections' where id = pg_temp.rid('P') $$, '23514', null,
  'the database refuses the old stage');
select is(array[array_to_string(public.permit_next_stages('issued'), ','), array_to_string(public.permit_next_stages('inspected'), ',')],
  array['inspected,cancelled', 'approved,issued,cancelled'], 'Issued -> Inspected -> Approved; Inspected may go back to Issued');
select is(array[public.permit_stage_label('inspected'), public.permit_stage_label('inspections'),
                public.permit_stamp_mode('inspected')], array['Inspected', 'Issued', 'revise'],
  'Inspected; an old Inspections move reads as Issued; stamping revises once inspected');
select is(pg_temp.open(pg_temp.rid('P')), 6, 'open on P: every wall x item of its list (2 walls x 3 items)');
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000533');
select throws_ok($$ select public.permit_move(pg_temp.rid('P'), null, 'inspected') $$, '22023', '6 inspections not passed yet.',
  'Inspected waits for every required inspection');
select pg_temp.login('a0000000-0000-0000-0000-000000000532');
select public.rev_mark_na(pg_temp.rid('wB'), pg_temp.rid('stuff'), true);
select public.rev_mark_na(pg_temp.rid('wB'), pg_temp.rid('spray'), true);
select is(pg_temp.open(pg_temp.rid('P')), 4, 'N/A walls don''t count');

-- ---------------------------------------------------------------------------------------------------------------------
-- 4. Expiry by the last inspection (results recorded on requests on the permit)
-- ---------------------------------------------------------------------------------------------------------------------
select pg_temp.login('a0000000-0000-0000-0000-000000000533');
select lives_ok($$ select public.permit_update(pg_temp.rid('P'), (pg_temp.pmt(pg_temp.rid('P'))).version, '24-0001',
  'Building - new construction', 'building', '{}', null, pg_temp.d(-300), (pg_temp.d(-300) + interval '12 months')::date, 0, '') $$,
  'the deputy types the real issue day, 300 days ago');
select pg_temp.login('a0000000-0000-0000-0000-000000000533');
select lives_ok($$ select public.ir_rev_results(pg_temp.rid('M1'), (pg_temp.req(pg_temp.rid('M1'))).version, pg_temp.pass_all(pg_temp.rid('M1'))) $$,
  'the deputy passes the TOW walls');
select is((pg_temp.pmt(pg_temp.rid('P'))).expires_on, (pg_temp.d(0) + interval '12 months')::date,
  'expiry: 12 months from the last inspection, later than 12 months from issue');
select ok(exists (select 1 from public.calendar_entries where source_type = 'permit' and source_id = pg_temp.rid('P')
                     and (starts_at at time zone 'America/Los_Angeles')::date = (pg_temp.d(0) + interval '12 months')::date),
  'the calendar milestone moves with it');
select is(pg_temp.open(pg_temp.rid('P')), 2, 'two cells left (the visitor''s request)');
select pg_temp.login('a0000000-0000-0000-0000-000000000533');
select lives_ok($$ select public.permit_update(pg_temp.rid('P'), (pg_temp.pmt(pg_temp.rid('P'))).version, '24-0001',
  'Building - new construction', 'building', '{}', null, pg_temp.d(-300), '2030-06-01', 1, '') $$, 'an extension typed in');
select pg_temp.login('a0000000-0000-0000-0000-000000000533');
select lives_ok($$ select public.ir_rev_results(pg_temp.rid('V1'), (pg_temp.req(pg_temp.rid('V1'))).version, pg_temp.pass_all(pg_temp.rid('V1'))) $$,
  'the visitor''s walls pass');
select is((pg_temp.pmt(pg_temp.rid('P'))).expires_on, '2030-06-01'::date, 'expiry never moves earlier than a typed date');
select is(pg_temp.open(pg_temp.rid('P')), 0, 'every cell of P''s list passed or N/A');

-- A typed request on the permit still waiting for its result holds Inspected too.
select pg_temp.login('a0000000-0000-0000-0000-000000000534');
insert into ids select 'T1', (public.ir_submit('c0000000-0000-0000-0000-000000000531', 'Sample Fire Co', pg_temp.d(5), 'ofs',
  'Sprinkler hydro', true, p_duration_kind => 'all_day', p_special_required => false)).id;
select pg_temp.to_ofs(pg_temp.rid('T1'));
select pg_temp.login('a0000000-0000-0000-0000-000000000533');
select public.set_request_permit(pg_temp.rid('T1'), null, pg_temp.rid('P'));
select is(pg_temp.open(pg_temp.rid('P')), 1, 'a linked request with no result is open');
select throws_ok($$ select public.permit_move(pg_temp.rid('P'), null, 'inspected') $$, '22023', '1 inspection not passed yet.',
  '... and holds Inspected');
select pg_temp.login('a0000000-0000-0000-0000-000000000534');
select public.ir_withdraw(pg_temp.rid('T1'), (pg_temp.req(pg_temp.rid('T1'))).version);
select pg_temp.login('a0000000-0000-0000-0000-000000000533');
select is((public.permit_move(pg_temp.rid('P'), null, 'inspected')).stage, 'inspected', 'withdrawn: P is Inspected');
select is((select string_agg(x.stage || ':' || x.state, ',' order by x.position) from public.permit_progress(null, pg_temp.rid('P')) x),
  'draft:done,submitted:done,accepted:done,in_review:done,comments_out:done,backcheck:done,issued:done,inspected:current,approved:next,complete:next',
  'the tracker: Inspected at place 8');
select is((select d -> 'moves' from public.permit_detail(pg_temp.rid('P')) d), '["approved", "issued", "cancelled"]'::jsonb,
  'from Inspected: Approved next');
select is((select (d ->> 'open_inspections')::int from public.permit_detail(pg_temp.rid('P')) d), 0,
  'the permit tells how many required inspections are open');

-- An old move to Inspections (before 0061) reads as Issued.
reset role;
insert into ids values ('R', 'e0000000-0000-0000-0000-0000000005a1');
insert into public.permits (id, org_id, project_id, created_by, primary_number, title, stage, stage_since, issued_on, expires_on)
values (pg_temp.rid('R'), 'b0000000-0000-0000-0000-000000000531', 'c0000000-0000-0000-0000-000000000531',
        'a0000000-0000-0000-0000-000000000533', '23-0410', 'Old permit', 'issued', now() - interval '30 days', pg_temp.d(-30),
        (pg_temp.d(-30) + interval '12 months')::date);
insert into public.permit_stage_events (permit_id, project_id, org_id, stage, at, actor) values
  (pg_temp.rid('R'), 'c0000000-0000-0000-0000-000000000531', 'b0000000-0000-0000-0000-000000000531', 'issued',
   now() - interval '30 days', 'a0000000-0000-0000-0000-000000000533'),
  (pg_temp.rid('R'), 'c0000000-0000-0000-0000-000000000531', 'b0000000-0000-0000-0000-000000000531', 'inspections',
   now() - interval '20 days', 'a0000000-0000-0000-0000-000000000533');
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000533');
select is((select array[x.state, x.days::text] from public.permit_progress(null, pg_temp.rid('R')) x where x.position = 7),
  array['current', '30'], 'old Inspections time adds to Issued');
select is((select jsonb_agg(e ->> 'stage') from public.permit_detail(pg_temp.rid('R')) d, jsonb_array_elements(d -> 'events') e),
  '["issued", "issued"]'::jsonb, 'and the history says Issued');

-- ---------------------------------------------------------------------------------------------------------------------
-- 5. Permit kinds; reviews under one permit
-- ---------------------------------------------------------------------------------------------------------------------
select throws_ok($$ select public.permit_create('c0000000-0000-0000-0000-000000000531', '24-0009', 'Fire sprinkler (deferred)',
  'deferred_sprinkler') $$, '22023', 'Unknown kind.', 'a deferred item is not a permit kind any more');
select is((public.permit_create('c0000000-0000-0000-0000-000000000531', '24-0010', 'Parking structure', 'structure')).kind,
  'structure', 'kinds: building, structure, site / utility, other');
reset role;
select throws_ok($$ update public.permits set kind = 'addendum' where id = pg_temp.rid('Q') $$, '23514', null,
  'the database refuses the old kinds');
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000533');
select throws_ok($$ select public.permit_review_open(pg_temp.rid('Q'), 'deferred_fire_alarm') $$, '22023',
  'Deferred items open once the permit is issued.', 'deferred items wait for the permit''s issue (G26 p. 7)');
select throws_ok($$ select public.permit_review_open(pg_temp.rid('Q'), 'deferred') $$, '22023', 'Unknown review kind.',
  'the old unnamed deferred kind is not offered');
select lives_ok($$ insert into ids select 'QR1', (public.permit_review_open(pg_temp.rid('Q'), null, null, 'f0000000-0000-0000-0000-000000000531')).id $$,
  'the first review, no kind named: the initial review');
select is((public.permit_review_open(pg_temp.rid('Q'), null, null, 'f0000000-0000-0000-0000-000000000531')).id, pg_temp.rid('QR1'),
  'the same key again is the same review');
select is((select array[cycle, review_no, backcheck] from public.permit_reviews where id = pg_temp.rid('QR1')), array[1, 1, 0],
  'cycle 1, review 1, no backcheck');
select lives_ok($$ insert into ids select 'QR2', (public.permit_review_open(pg_temp.rid('Q'), 'addendum')).id $$,
  'an addendum review opens while the initial one is open');
select is((select array[cycle::text, review_no::text, backcheck::text, kind] from public.permit_reviews where id = pg_temp.rid('QR2')),
  array['2', '2', '0', 'addendum'], 'cycle 2, review 2, an addendum');
select throws_ok($$ select public.permit_review_open(pg_temp.rid('Q')) $$, '22023', 'Close the open review first.',
  'no kind named: the latest review''s backcheck, which waits for its open cycle');
select is((public.permit_review_close(pg_temp.rid('QR1'), (pg_temp.rev(pg_temp.rid('QR1'))).version, 'revise_resubmit')).outcome,
  'revise_resubmit', 'the initial review comes back: revise and resubmit');
select ok(exists (select 1 from public.activity where entity_id = pg_temp.rid('Q') and kind = 'permit.review'
                     and summary = 'Permit 24-0002 review 1: revise and resubmit'), 'board: "review 1: revise and resubmit"');
select lives_ok($$ insert into ids select 'QR3', (public.permit_review_backcheck(pg_temp.rid('QR1'))).id $$,
  'the initial review''s backcheck');
select is((select array[cycle::text, review_no::text, backcheck::text, kind] from public.permit_reviews where id = pg_temp.rid('QR3')),
  array['3', '1', '1', 'initial'], 'cycle 3: review 1, BC 1, its review''s kind');
select throws_ok($$ select public.permit_review_backcheck(pg_temp.rid('QR1')) $$, '22023', 'Close the open review first.',
  'one open cycle per review');
select throws_ok($$ select public.permit_review_close(pg_temp.rid('QR1'), (pg_temp.rev(pg_temp.rid('QR1'))).version, null) $$, '22023',
  'Close the open review first.', 'Undo of a close waits for its review''s open cycle');
select is((select jsonb_agg((e ->> 'cycle')::int) from public.permit_detail(pg_temp.rid('Q')) d, jsonb_array_elements(d -> 'reviews') e),
  '[3, 2, 1]'::jsonb, 'the permit shows open reviews first, newest first');
select lives_ok($$ insert into ids select 'PR1', (public.permit_review_open(pg_temp.rid('P'), 'deferred_sprinkler')).id $$,
  'an inspected permit takes a deferred sprinkler review');
select is((select array[review_no::text, kind] from public.permit_reviews where id = pg_temp.rid('PR1')), array['1', 'deferred_sprinkler'],
  'review 1 of P');
select pg_temp.login('a0000000-0000-0000-0000-000000000535');
select throws_ok($$ select public.permit_review_backcheck(pg_temp.rid('QR2')) $$, '42501', null, 'a PM can''t open a backcheck');
reset role;
select throws_ok($$ insert into public.permit_reviews (permit_id, project_id, org_id, cycle, review_no, backcheck, kind, received_on, created_by)
  values (pg_temp.rid('Q'), 'c0000000-0000-0000-0000-000000000531', 'b0000000-0000-0000-0000-000000000531', 9, 2, 1, 'addendum',
          current_date, 'a0000000-0000-0000-0000-000000000533') $$, '23505', null,
  'the database keeps one open cycle per review');
select throws_ok($$ insert into public.permit_reviews (permit_id, project_id, org_id, cycle, review_no, backcheck, kind, received_on, created_by)
  values (pg_temp.rid('Q'), 'c0000000-0000-0000-0000-000000000531', 'b0000000-0000-0000-0000-000000000531', 9, 5, 0, 'backcheck',
          current_date, 'a0000000-0000-0000-0000-000000000533') $$, '23514', null,
  '"backcheck" is a number on a review now, not a kind');

-- ---------------------------------------------------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------------------------------------------------
select is_empty($$ select f from unnest(array[
    'public.ir_submit(uuid, text, date, text, text, boolean, time without time zone, text, integer, uuid, uuid[], boolean, boolean)',
    'public.ir_submit_ofs(uuid, text, date, boolean, uuid[], uuid[], uuid, time without time zone, text, integer, uuid[], boolean, boolean)',
    'public.permit_review_backcheck(uuid, date, uuid)']) f
   where has_function_privilege('anon', f, 'EXECUTE') or not has_function_privilege('authenticated', f, 'EXECUTE') $$,
  'grants: the new member functions are for signed-in people, never anon');
select is_empty($$ select f from unnest(array[
    'public.link_request_submit(uuid, text, uuid, text, text, text, text, date, text, text, boolean, time without time zone, text, integer, uuid, uuid[], boolean)',
    'public.link_request_submit_ofs(uuid, text, uuid, text, text, text, text, date, boolean, uuid[], uuid[], uuid, time without time zone, text, integer, uuid[], boolean)']) f
   where has_function_privilege('anon', f, 'EXECUTE') or has_function_privilege('authenticated', f, 'EXECUTE')
      or not has_function_privilege('service_role', f, 'EXECUTE') $$,
  'grants: the link''s are the service role''s only');
select is_empty($$ select f from unnest(array[
    'public.ir_ofs_permit(uuid)',
    'public.permit_stage_ok(text)', 'public.permit_kind_ok(text)', 'public.permit_review_kind_ok(text)',
    'public.permit_review_label(integer, integer)', 'public.permit_open_inspections(uuid)', 'public.permit_expiry_touch(uuid)',
    'public.permit_review_next(public.permits, integer, date, uuid)', 'public.tg_ir_permit_expiry()',
    'public.link_request_make(uuid, text, uuid, text, text, text, text, date, text, text, boolean, time without time zone, text, integer, uuid, uuid[], uuid[], uuid[], uuid, boolean)']) f
   where has_function_privilege('anon', f, 'EXECUTE') or has_function_privilege('authenticated', f, 'EXECUTE') $$,
  'grants: the helpers are internal');
select is_empty($$ select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname like '%\_retired\_0061'
     and (has_function_privilege('anon', p.oid, 'EXECUTE') or has_function_privilege('authenticated', p.oid, 'EXECUTE')
          or has_function_privilege('service_role', p.oid, 'EXECUTE')) $$,
  'the retired functions are closed to everyone');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname like '%\_retired\_0061'), 10, 'and kept, not dropped');
set local role anon;
select throws_ok($$ select public.permit_review_backcheck('e0000000-0000-0000-0000-000000000531') $$, '42501', null,
  'anon: no backchecks');
reset role;

select * from finish();
rollback;
