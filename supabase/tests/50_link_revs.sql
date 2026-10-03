begin;
select plan(73);
-- Migration 0057: revs from the request link with no login. The link's walls (status only: open, requested, passed,
-- N/A; failed shows as open; no numbers, notes or names), the revs request from the link (0055's visitor rules and
-- ir_submit_ofs' cell rules), and a request's map by its private receipt: read, draw (ir_map_save's rules, until a
-- result), the facts for its PDF, and its sheet and PDF as logged downloads. Service role only; a wrong receipt opens
-- nothing and no receipt reaches another request's map.
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
-- The request a submit answer is (by its number on the main job), read past RLS.
create function pg_temp.req(p_k text) returns uuid language sql stable security definer as $$
  select r.id from public.inspection_requests r
   where r.project_id = 'c0000000-0000-0000-0000-000000000501' and r.number = ((select j from res where k = p_k)->>'number')::int $$;
create function pg_temp.mapver(p_request uuid) returns int language sql stable security definer as $$
  select version from public.ir_maps where request_id = p_request $$;
create function pg_temp.rver(p_request uuid) returns int language sql stable security definer as $$
  select version from public.inspection_requests where id = p_request $$;
-- The receipt hash of a submit answer.
create function pg_temp.rh(p_k text) returns text language sql stable as $$ select pg_temp.h(pg_temp.j(p_k)->>'receipt') $$;
-- A wall x item's status as the link shows it.
create function pg_temp.lst(p_area text, p_item text) returns text language sql stable as $$
  select e->>'status'
    from jsonb_array_elements(public.link_request_revs('c0000000-0000-0000-0000-000000000501', pg_temp.h('job-token'))->'status') e
   where (e->>'area_id')::uuid = pg_temp.rid(p_area) and (e->>'item_id')::uuid = pg_temp.rid(p_item) $$;
-- link_request_submit_ofs with every argument named; walls and items by key.
create function pg_temp.ofs(p_job uuid, p_hash text, p_name text, p_areas text[], p_items text[], p_sheet uuid default null,
                            p_phone text default '5550105000', p_email text default null)
returns jsonb language sql as $$
  select public.link_request_submit_ofs(p_project_id => p_job, p_token_hash => p_hash, p_hub_id => null, p_name => p_name,
    p_company => 'Sample Firestop Co', p_phone => p_phone, p_email => p_email, p_request_date => pg_temp.d(3),
    p_notice_ack => true, p_area_ids => array(select pg_temp.rid(a) from unnest(p_areas) a),
    p_item_ids => array(select pg_temp.rid(i) from unnest(p_items) i), p_sheet_file_id => p_sheet, p_start_time => '09:00',
    p_duration_kind => 'timed', p_duration_min => 60, p_readiness => '{"previous":"yes","trade":"yes","gc":"yes","ior":"yes","special":"na"}') $$;
grant execute on all functions in schema pg_temp to public;

select pg_temp.mk_user('a0000000-0000-0000-0000-000000000501', 'probe+lr-insp@example.test', 'Ivy Inspector');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000502', 'probe+lr-sub@example.test', 'Sam Sub');

insert into public.orgs (id, name, kind, created_by) values
  ('b0000000-0000-0000-0000-000000000501', 'Sample Link Revs GC', 'gc', 'a0000000-0000-0000-0000-000000000501');
-- J: an OFS job being built with its request link. K: another job with its own link, no OFS.
insert into public.projects (id, org_id, name, stage, timezone, created_by, settings) values
  ('c0000000-0000-0000-0000-000000000501', 'b0000000-0000-0000-0000-000000000501', 'Sample Link Revs Job', 'construction',
   'America/Los_Angeles', 'a0000000-0000-0000-0000-000000000501', '{"ir_ofs_allowed": true}'),
  ('c0000000-0000-0000-0000-000000000502', 'b0000000-0000-0000-0000-000000000501', 'Sample Other Job', 'construction',
   'America/Los_Angeles', 'a0000000-0000-0000-0000-000000000501', '{}');
update public.projects set request_token_hash = pg_temp.h('job-token') where id = 'c0000000-0000-0000-0000-000000000501';
update public.projects set request_token_hash = pg_temp.h('other-token') where id = 'c0000000-0000-0000-0000-000000000502';
insert into public.project_members (org_id, project_id, user_id, invite_email, role, status) values
  ('b0000000-0000-0000-0000-000000000501', 'c0000000-0000-0000-0000-000000000501', 'a0000000-0000-0000-0000-000000000501',
   'probe+lr-insp@example.test', 'inspector', 'active'),
  ('b0000000-0000-0000-0000-000000000501', 'c0000000-0000-0000-0000-000000000501', 'a0000000-0000-0000-0000-000000000502',
   'probe+lr-sub@example.test', 'sub', 'active');

-- Two plan sheets (Level 01, Level 02), a photo, another job's PDF, and a map PDF the server made.
insert into public.folders (id, org_id, project_id, name, created_by) values
  ('d0000000-0000-0000-0000-000000000501', 'b0000000-0000-0000-0000-000000000501', 'c0000000-0000-0000-0000-000000000501',
   'Sample Plans', 'a0000000-0000-0000-0000-000000000501'),
  ('d0000000-0000-0000-0000-000000000502', 'b0000000-0000-0000-0000-000000000501', 'c0000000-0000-0000-0000-000000000502',
   'Sample Plans', 'a0000000-0000-0000-0000-000000000501');
insert into public.files (id, org_id, project_id, folder_id, storage_path, original_name, mime, created_by, scan_status) values
  ('e0000000-0000-0000-0000-000000000501', 'b0000000-0000-0000-0000-000000000501', 'c0000000-0000-0000-0000-000000000501',
   'd0000000-0000-0000-0000-000000000501', 'test/link-revs/l01.pdf', 'Sample L01.pdf', 'application/pdf',
   'a0000000-0000-0000-0000-000000000501', 'clean'),
  ('e0000000-0000-0000-0000-000000000502', 'b0000000-0000-0000-0000-000000000501', 'c0000000-0000-0000-0000-000000000501',
   'd0000000-0000-0000-0000-000000000501', 'test/link-revs/l02.pdf', 'Sample L02.pdf', 'application/pdf',
   'a0000000-0000-0000-0000-000000000501', 'clean'),
  ('e0000000-0000-0000-0000-000000000503', 'b0000000-0000-0000-0000-000000000501', 'c0000000-0000-0000-0000-000000000501',
   'd0000000-0000-0000-0000-000000000501', 'test/link-revs/photo.png', 'Sample photo.png', 'image/png',
   'a0000000-0000-0000-0000-000000000501', 'clean'),
  ('e0000000-0000-0000-0000-000000000504', 'b0000000-0000-0000-0000-000000000501', 'c0000000-0000-0000-0000-000000000502',
   'd0000000-0000-0000-0000-000000000502', 'test/link-revs/other.pdf', 'Sample other.pdf', 'application/pdf',
   'a0000000-0000-0000-0000-000000000501', 'clean'),
  ('e0000000-0000-0000-0000-000000000506', 'b0000000-0000-0000-0000-000000000501', 'c0000000-0000-0000-0000-000000000501',
   'd0000000-0000-0000-0000-000000000501', 'test/link-revs/map.pdf', 'Sample map.pdf', 'application/pdf',
   'a0000000-0000-0000-0000-000000000501', 'clean');

-- The inspector sets up the job's revs: list L (TOW; HOW cavity stuff and spray), three walls, one N/A; list L2.
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000501');
insert into ids select 'L', (public.rev_list_create('c0000000-0000-0000-0000-000000000501', 'Sample Rated Walls', 'PH III', null,
  '[{"number": 0, "name": "TOW", "items": [{"name": "TOW - Speed Plugs", "company": "Sample Firestop Co"}]},
    {"number": 1, "name": "HOW - Cavity", "items": [{"name": "HOW Cavity Stuff", "company": "Sample Firestop Co"},
       {"name": "HOW Cavity Spray"}]}]')).id;
insert into ids select 'L2', (public.rev_list_create('c0000000-0000-0000-0000-000000000501', 'Sample Other Walls', null, null,
  '[{"number": 0, "name": "Other", "items": [{"name": "Other Item"}]}]')).id;
insert into ids select case a.name when 'Shaftwall A' then 'wA' else 'wB' end, a.id
  from public.rev_areas_add(pg_temp.rid('L'), 'Level 01', array['Shaftwall A', 'Corridor B'], 'e0000000-0000-0000-0000-000000000501') a;
insert into ids select 'wC', a.id
  from public.rev_areas_add(pg_temp.rid('L'), 'Level 02', array['Elevator C'], 'e0000000-0000-0000-0000-000000000502') a;
insert into ids select 'wO', a.id from public.rev_areas_add(pg_temp.rid('L2'), 'Level 01', array['Other wall'], null) a;
insert into ids select k, i.id from (values ('tow', 'TOW - Speed Plugs'), ('stuff', 'HOW Cavity Stuff'),
  ('spray', 'HOW Cavity Spray'), ('other', 'Other Item')) v(k, n) join public.rev_items i on i.name = v.n;
select public.rev_mark_na(pg_temp.rid('wB'), pg_temp.rid('tow'), true);
reset role;

-- ---------------------------------------------------------------------------------------------------------------------
-- Grants: service role only; the shared bodies internal; a link cell may have no member behind it
-- ---------------------------------------------------------------------------------------------------------------------
select is_empty($$ select f from unnest(array[
    'public.link_request_revs(uuid, text, uuid)',
    'public.link_request_submit_ofs(uuid, text, uuid, text, text, text, text, date, boolean, uuid[], uuid[], uuid, time without time zone, text, integer, uuid[], jsonb)',
    'public.link_request_map(uuid, text)', 'public.link_request_map_save(uuid, text, integer, jsonb, uuid, integer)',
    'public.link_request_map_facts(uuid, text)', 'public.link_request_map_file(uuid, text, text, text)']) f
   where has_function_privilege('anon', f, 'EXECUTE') or has_function_privilege('authenticated', f, 'EXECUTE')
      or not has_function_privilege('service_role', f, 'EXECUTE') $$,
  'grants: the link''s new functions are for the service role only');
select is_empty($$ select f from unnest(array[
    'public.ir_ofs_open_text(uuid, uuid[], uuid[])', 'public.ir_ofs_make(public.inspection_requests, uuid[], uuid[], uuid)',
    'public.rev_walls_sheet_ok(uuid, uuid[], uuid)', 'public.rev_status_rows(uuid)', 'public.ir_map_facts(uuid)',
    'public.ir_map_write(public.inspection_requests, public.ir_maps, integer, jsonb, uuid, integer, boolean)',
    'public.link_request_receipt(uuid, text)', 'public.link_request_map_editor(uuid)', 'public.link_request_map_sheets(uuid)',
    'public.link_request_map_view(uuid)',
    'public.link_request_make(uuid, text, uuid, text, text, text, text, date, text, text, boolean, time without time zone, text, integer, uuid, uuid[], uuid[], uuid[], uuid, jsonb)']) f
   where has_function_privilege('anon', f, 'EXECUTE') or has_function_privilege('authenticated', f, 'EXECUTE') $$,
  'grants: the shared bodies are internal');
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000502');
select throws_ok($$ select public.link_request_revs('c0000000-0000-0000-0000-000000000501', pg_temp.h('job-token')) $$,
  '42501', null, 'a signed-in member can''t call the link''s walls');
select throws_ok($$ select public.link_request_map('c0000000-0000-0000-0000-000000000501', pg_temp.h('x')) $$,
  '42501', null, 'nor a map by receipt');
reset role;
set local role anon;
select throws_ok($$ select public.link_request_map_save('c0000000-0000-0000-0000-000000000501', 'x', 1, '[]') $$,
  '42501', null, 'anon can''t draw');
select throws_ok($$ select public.link_request_submit_ofs('c0000000-0000-0000-0000-000000000501', 'x', null, 'X', 'Y', '5550100000',
  null, current_date, true, '{}', '{}') $$, '42501', null, 'anon can''t submit');
reset role;
select is((select is_nullable from information_schema.columns
            where table_schema = 'public' and table_name = 'ir_rev_items' and column_name = 'created_by'), 'YES',
  'a cell asked for through the link has no member behind it');

-- ---------------------------------------------------------------------------------------------------------------------
-- The link's walls: status only
-- ---------------------------------------------------------------------------------------------------------------------
set local role service_role;
select pg_temp.login_service();
insert into res values ('revs', public.link_request_revs('c0000000-0000-0000-0000-000000000501', pg_temp.h('job-token')));
select results_eq($$ select k from jsonb_object_keys(pg_temp.j('revs')) k order by 1 $$,
  $$ values ('areas'::text), ('items'), ('lists'), ('revs'), ('status') $$, 'revs: lists, revs, items, walls and status');
select is(array[jsonb_array_length(pg_temp.j('revs')->'lists'), jsonb_array_length(pg_temp.j('revs')->'revs'),
                jsonb_array_length(pg_temp.j('revs')->'items'), jsonb_array_length(pg_temp.j('revs')->'areas'),
                jsonb_array_length(pg_temp.j('revs')->'status')], array[2, 3, 4, 4, 3 * 3 + 1],
  'revs: both lists, every live rev, item and wall, a status per wall x item');
select results_eq($$ select distinct k from jsonb_array_elements(pg_temp.j('revs')->'status') e, jsonb_object_keys(e) k order by 1 $$,
  $$ values ('area_id'::text), ('item_id'), ('status') $$, 'revs: a status row is the wall, the item and the status only');
select results_eq($$ select distinct k from jsonb_array_elements(pg_temp.j('revs')->'areas') e, jsonb_object_keys(e) k order by 1 $$,
  $$ values ('id'::text), ('level'), ('list_id'), ('name'), ('position'), ('sheet_file_id') $$, 'revs: a wall''s fields');
select is(array[pg_temp.lst('wB', 'tow'), pg_temp.lst('wA', 'tow')], array['na', 'open'], 'revs: N/A and open');
select is(public.link_request_revs('c0000000-0000-0000-0000-000000000501', pg_temp.h('other-token')), null,
  'revs: another job''s token opens nothing');
select is(public.link_request_revs('c0000000-0000-0000-0000-0000000005ff', pg_temp.h('job-token')), null,
  'revs: a job that does not exist answers the same null');
select is(public.link_request_revs('c0000000-0000-0000-0000-000000000502', pg_temp.h('other-token'))::text,
  '{"revs": [], "areas": [], "items": [], "lists": [], "status": []}', 'revs: nothing on a job without OFS');

-- ---------------------------------------------------------------------------------------------------------------------
-- The revs request from the link
-- ---------------------------------------------------------------------------------------------------------------------
insert into res values ('s1', pg_temp.ofs('c0000000-0000-0000-0000-000000000501', pg_temp.h('job-token'), 'Sample Visitor',
  array['wA', 'wB', 'wC'], array['stuff', 'tow']));
select results_eq($$ select k from jsonb_object_keys(pg_temp.j('s1')) k order by 1 $$,
  $$ values ('duration_kind'::text), ('duration_min'), ('gc_step'), ('kind'), ('number'), ('project_name'), ('receipt'),
            ('request_date'), ('result'), ('result_note'), ('special_kind'), ('start_time'), ('status') $$,
  'submit: the same receipt as any link request');
select is(array[pg_temp.j('s1')->>'number', pg_temp.j('s1')->>'kind', pg_temp.j('s1')->>'status'], array['1', 'ofs', 'pending'],
  'submit: an OFS request, numbered by the database');
reset role;
insert into ids values ('S1', pg_temp.req('s1'));
select is((select array[(requested_by is null)::text, requester_name, requester_phone, company, ofs_number::text, items]
             from public.inspection_requests where id = pg_temp.rid('S1')),
  array['true', 'Sample Visitor', '5550105000', 'Sample Firestop Co', '1',
        'Level 01, Level 02 · TOW - Speed Plugs & HOW Cavity Stuff · Shaftwall A, Corridor B, Elevator C'],
  'submit: the visitor''s contact; the OFS IR number; what to inspect composed by the database');
select is((select array_agg(a.name || ' ' || i.name || ' ' || c.color || ' ' || (c.created_by is null)::text
                            order by a.position, c.color)
             from public.ir_rev_items c join public.rev_areas a on a.id = c.area_id join public.rev_items i on i.id = c.item_id
            where c.request_id = pg_temp.rid('S1')),
  array['Shaftwall A TOW - Speed Plugs 1 true', 'Shaftwall A HOW Cavity Stuff 2 true', 'Corridor B HOW Cavity Stuff 2 true',
        'Elevator C TOW - Speed Plugs 1 true', 'Elevator C HOW Cavity Stuff 2 true'],
  'submit: a cell per wall x item, the N/A one skipped, colors by item order, no member behind them');
select is((select array[sheet_file_id::text, version::text, (updated_by is null)::text] from public.ir_maps where request_id = pg_temp.rid('S1')),
  array['e0000000-0000-0000-0000-000000000501', '1', 'true'], 'submit: the map starts on the first wall''s sheet');
select ok(exists (select 1 from public.activity where entity_id = pg_temp.rid('S1') and kind = 'ir.requested'
                  and summary like 'IR 1 (OFS 1) requested · Sample Visitor (Sample Firestop Co) · %'),
  'submit: the board line names the OFS number and the visitor');
select ok(exists (select 1 from public.audit_events where action = 'request_link.submit' and entity_id = pg_temp.rid('S1')
                  and actor_kind = 'public_link' and details->>'cells' = '5' and details->>'ofs_number' = '1'),
  'submit: audited as the public link, with its cells');
select ok(exists (select 1 from public.ir_link_receipts where token_hash = pg_temp.rh('s1') and request_id = pg_temp.rid('S1')),
  'submit: only the receipt''s sha256 is kept');

set local role service_role;
select pg_temp.login_service();
select is(pg_temp.ofs('c0000000-0000-0000-0000-000000000501', pg_temp.h('job-token'), 'sample visitor',
  array['wC', 'wA', 'wB'], array['tow', 'stuff'])->>'number', '1', 'repeat: the same request answers (no second number)');
select throws_ok($$ select pg_temp.ofs('c0000000-0000-0000-0000-000000000501', pg_temp.h('job-token'), 'Sample Other',
  array['wA'], array['tow', 'stuff', 'spray', 'other']) $$, '22023', 'Pick 1 to 3 items.', 'submit: three items at most');
select throws_ok($$ select pg_temp.ofs('c0000000-0000-0000-0000-000000000501', pg_temp.h('job-token'), 'Sample Other',
  array['wA', 'wO'], array['tow']) $$, '22023', 'Pick the walls and items from one list.', 'submit: walls of one list');
select throws_ok($$ select pg_temp.ofs('c0000000-0000-0000-0000-000000000501', pg_temp.h('job-token'), 'Sample Other',
  array['wB'], array['tow']) $$, '22023', 'Already passed.', 'submit: nothing left to inspect (N/A) is refused');
select throws_ok($$ select pg_temp.ofs('c0000000-0000-0000-0000-000000000501', pg_temp.h('job-token'), 'Sample Other',
  array['wA'], array['spray'], 'e0000000-0000-0000-0000-000000000502') $$, '22023', 'Pick a sheet of these walls.',
  'submit: the sheet is one of the picked walls''');
select throws_ok($$ select pg_temp.ofs('c0000000-0000-0000-0000-000000000501', pg_temp.h('job-token'), 'Sample Other',
  array['wA'], array['spray'], null, '', '') $$, '22023', 'Add a phone or an email.', 'submit: the visitor''s contact rules');
select throws_ok($$ select pg_temp.ofs('c0000000-0000-0000-0000-000000000502', pg_temp.h('other-token'), 'Sample Other',
  array['wA'], array['spray']) $$, '22023', 'OFS is off for this job.', 'submit: OFS only where the job allows it');
select is(pg_temp.ofs('c0000000-0000-0000-0000-000000000501', pg_temp.h('other-token'), 'Sample Other', array['wA'], array['spray']),
  null, 'submit: a wrong token answers null');
insert into res values ('s2', pg_temp.ofs('c0000000-0000-0000-0000-000000000501', pg_temp.h('job-token'), 'Sample Second',
  array['wC'], array['spray'], 'e0000000-0000-0000-0000-000000000502'));
-- A plain request from the link (0055) has no map.
insert into res values ('plain', public.link_request_submit('c0000000-0000-0000-0000-000000000501', pg_temp.h('job-token'), null,
  'Sample Plain', 'Sample Framing', '5550105001', null, pg_temp.d(3), 'ior', 'Hold downs', true, '10:00', 'timed', 60));
reset role;
insert into ids values ('S2', pg_temp.req('s2'));
select is((select sheet_file_id from public.ir_maps where request_id = pg_temp.rid('S2')), 'e0000000-0000-0000-0000-000000000502'::uuid,
  'submit: a sheet of the picked wall is the map''s');
select is((select count(*)::int from public.inspection_requests where requester_name = 'Sample Other'), 0,
  'submit: refused visits leave no request');
set local role service_role;
select pg_temp.login_service();
select is(array[pg_temp.lst('wA', 'tow'), pg_temp.lst('wB', 'tow'), pg_temp.lst('wC', 'spray')], array['requested', 'na', 'requested'],
  'revs: the link''s requests show as requested');

-- ---------------------------------------------------------------------------------------------------------------------
-- The map by the receipt
-- ---------------------------------------------------------------------------------------------------------------------
insert into res values ('m1', public.link_request_map('c0000000-0000-0000-0000-000000000501', pg_temp.rh('s1')));
select results_eq($$ select k from jsonb_object_keys(pg_temp.j('m1')->'map') k order by 1 $$,
  $$ values ('can_edit'::text), ('has_map'), ('legend'), ('number'), ('ofs_number'), ('page'), ('phase'), ('request_date'),
            ('result'), ('sheet_file_id'), ('sheets'), ('signed'), ('stale'), ('strokes'), ('version'), ('what') $$,
  'map: the title parts, legend, sheet, strokes and state; never the signer, the ids or the PDF''s file');
select is(array[pg_temp.j('m1')->'map'->>'what', pg_temp.j('m1')->'map'->>'phase', (pg_temp.j('m1')->'map'->'legend')::text,
                pg_temp.j('m1')->'map'->>'can_edit', pg_temp.j('m1')->'map'->>'signed', pg_temp.j('m1')->'map'->>'has_map'],
  array['Level 01, Level 02 TOW - Speed Plugs & HOW Cavity Stuff', 'PH III',
        '[{"name": "TOW - Speed Plugs", "color": 1}, {"name": "HOW Cavity Stuff", "color": 2}]', 'true', 'false', 'false'],
  'map: what, phase and legend as the member''s map; the visitor may draw');
select is((pg_temp.j('m1')->'map'->'sheets')::text,
  '[{"label": "Level 01", "file_id": "e0000000-0000-0000-0000-000000000501"}, {"label": "Level 02", "file_id": "e0000000-0000-0000-0000-000000000502"}]',
  'map: the request''s walls'' sheets, by level');
select is(public.link_request_map('c0000000-0000-0000-0000-000000000501', pg_temp.h('not-a-receipt')), null,
  'map: a wrong receipt answers null');
select is(public.link_request_map('c0000000-0000-0000-0000-000000000502', pg_temp.rh('s1')), null,
  'map: a receipt opens its own job only');
select is(public.link_request_map('c0000000-0000-0000-0000-000000000501', pg_temp.rh('plain'))::text, '{"map": null}',
  'map: a request without walls has none');

-- Drawing
select is(public.link_request_map_save('c0000000-0000-0000-0000-000000000501', pg_temp.rh('s1'), 1,
  '[{"c": 1, "w": 0.01, "p": [[0.1, 0.1], [0.2, 0.2]]}, {"c": 2, "w": 0.02, "p": [[0.5, 0.5], [0.6, 0.5]]}]')->'map'->>'version', '2',
  'draw: the visitor saves strokes; the version moves');
reset role;
select is((select array[jsonb_array_length(strokes)::text, (updated_by is null)::text, stale::text] from public.ir_maps
            where request_id = pg_temp.rid('S1')), array['2', 'true', 'true'], 'draw: saved with no member behind it');
set local role service_role;
select pg_temp.login_service();
select throws_ok($$ select public.link_request_map_save('c0000000-0000-0000-0000-000000000501', pg_temp.rh('s1'), 1, '[]') $$,
  '40001', null, 'draw: a stale version is refused');
select throws_ok($$ select public.link_request_map_save('c0000000-0000-0000-0000-000000000501', pg_temp.rh('s1'), 2,
  '[{"c": 1, "w": 0.01, "p": [[0, 0], [1.5, 0]]}]') $$, '22023', 'Those marks can''t be saved.', 'draw: a point off the page');
select throws_ok($$ select public.link_request_map_save('c0000000-0000-0000-0000-000000000501', pg_temp.rh('s1'), 2,
  '[{"c": 3, "w": 0.01, "p": [[0, 0], [0.5, 0]]}]') $$, '22023', 'Use the request''s colors.', 'draw: a third color on two items');
select throws_ok($$ select public.link_request_map_save('c0000000-0000-0000-0000-000000000501', pg_temp.rh('s1'), 2, '[]',
  'e0000000-0000-0000-0000-000000000504') $$, '22023', 'Pick a sheet of these walls.', 'draw: never another job''s file');
select throws_ok($$ select public.link_request_map_save('c0000000-0000-0000-0000-000000000501', pg_temp.rh('s1'), 2, '[]',
  'e0000000-0000-0000-0000-000000000503') $$, '22023', 'Pick a sheet of these walls.', 'draw: nor a file that is not a wall''s sheet');
select is(public.link_request_map_save('c0000000-0000-0000-0000-000000000501', pg_temp.rh('s1'), 2, '[]',
  'e0000000-0000-0000-0000-000000000502', 1)->'map'->>'sheet_file_id', 'e0000000-0000-0000-0000-000000000502',
  'draw: switches to another wall''s sheet');
select is(public.link_request_map_save('c0000000-0000-0000-0000-000000000501', pg_temp.h('not-a-receipt'), 3, '[]'), null,
  'draw: a wrong receipt draws nothing');
select is(public.link_request_map_save('c0000000-0000-0000-0000-000000000501', pg_temp.rh('s2'), 1,
  '[{"c": 1, "w": 0.01, "p": [[0.3, 0.3], [0.4, 0.4]]}]')->'map'->>'version', '2', 'draw: the second visitor draws their own map');
select is(array[pg_temp.mapver(pg_temp.rid('S1')), pg_temp.mapver(pg_temp.rid('S2'))], array[3, 2],
  'draw: a receipt reaches its own request''s map only');
select throws_ok($$ select public.link_request_map_save('c0000000-0000-0000-0000-000000000501', pg_temp.rh('plain'), 1, '[]') $$,
  '22023', 'This request has no map.', 'draw: not on a request without walls');

-- The facts for the PDF (never sent to the visitor)
select results_eq($$ select k from jsonb_object_keys(public.link_request_map_facts('c0000000-0000-0000-0000-000000000501',
                       pg_temp.rh('s1'))) k where k in ('request_id', 'project_id', 'signer_name', 'map_file_id', 'strokes') order by 1 $$,
  $$ values ('map_file_id'::text), ('project_id'), ('request_id'), ('signer_name'), ('strokes') $$,
  'facts: what the PDF needs, as ir_map_context has it');
select is(public.link_request_map_facts('c0000000-0000-0000-0000-000000000501', pg_temp.h('not-a-receipt')), null,
  'facts: a wrong receipt answers null');

-- The sheet and the map PDF: logged downloads
select is(public.link_request_map_file('c0000000-0000-0000-0000-000000000501', pg_temp.rh('s1'), 'sheet', '203.0.113.9')->>'storage_path',
  'test/link-revs/l02.pdf', 'files: the map''s sheet');
reset role;
select ok(exists (select 1 from public.downloads where file_id = 'e0000000-0000-0000-0000-000000000502' and user_id is null
                  and ip = '203.0.113.9'::inet)
          and exists (select 1 from public.audit_events where action = 'download' and entity_id = 'e0000000-0000-0000-0000-000000000502'
                      and actor_kind = 'public_link' and details->>'via' = 'link'),
  'files: a download line with the visitor''s address, and an audit line');
set local role service_role;
select pg_temp.login_service();
select throws_ok($$ select public.link_request_map_file('c0000000-0000-0000-0000-000000000501', pg_temp.rh('s1'), 'map') $$,
  '22023', 'Make the map first.', 'files: no map PDF before it is made');
select is((public.ir_map_attach(pg_temp.rid('S1'), 'e0000000-0000-0000-0000-000000000506', repeat('a', 64), false)).map_file_id,
  'e0000000-0000-0000-0000-000000000506'::uuid, 'the server records the map it made');
select is(public.link_request_map_file('c0000000-0000-0000-0000-000000000501', pg_temp.rh('s1'), 'map')->>'storage_path',
  'test/link-revs/map.pdf', 'files: then the map PDF');
select is(public.link_request_map('c0000000-0000-0000-0000-000000000501', pg_temp.rh('s1'))->'map'->>'has_map', 'true',
  'map: the PDF is made');
select is(public.link_request_map_file('c0000000-0000-0000-0000-000000000501', pg_temp.h('not-a-receipt'), 'sheet'), null,
  'files: a wrong receipt opens nothing');
select throws_ok($$ select public.link_request_map_file('c0000000-0000-0000-0000-000000000501', pg_temp.rh('s1'), 'photo') $$,
  '22023', 'Unknown file.', 'files: the sheet or the map only');
reset role;
update public.files set scan_status = 'pending' where id = 'e0000000-0000-0000-0000-000000000502';
set local role service_role;
select pg_temp.login_service();
select throws_ok($$ select public.link_request_map_file('c0000000-0000-0000-0000-000000000501', pg_temp.rh('s1'), 'sheet') $$,
  '22023', 'The sheet is still being scanned. Try again in a minute.', 'files: not before the scan');
reset role;
update public.files set scan_status = 'infected' where id = 'e0000000-0000-0000-0000-000000000502';
set local role service_role;
select pg_temp.login_service();
select throws_ok($$ select public.link_request_map_file('c0000000-0000-0000-0000-000000000501', pg_temp.rh('s1'), 'sheet') $$,
  '42501', 'This file is blocked.', 'files: never an infected file');
reset role;
update public.files set scan_status = 'clean' where id = 'e0000000-0000-0000-0000-000000000502';

-- ---------------------------------------------------------------------------------------------------------------------
-- The inspector works it; once there is a result the visitor's map is final; failed shows as open on the link
-- ---------------------------------------------------------------------------------------------------------------------
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000501');
select is((public.ir_map_context(pg_temp.rid('S1')) ->> 'can_edit'), 'true', 'inspector: reads and may draw the visitor''s map');
select pg_temp.login('a0000000-0000-0000-0000-000000000502');
insert into ids select 'M', (public.ir_submit_ofs('c0000000-0000-0000-0000-000000000501', 'Sample Firestop Co', pg_temp.d(4), true,
  array[pg_temp.rid('wA')], array[pg_temp.rid('spray')], null, '08:00', 'timed', 60, p_readiness => '{"previous":"yes","trade":"yes","gc":"yes","ior":"yes","special":"na"}')).id;
select is((select sheet_file_id from public.ir_maps where request_id = pg_temp.rid('M')), 'e0000000-0000-0000-0000-000000000501'::uuid,
  'member: ir_submit_ofs still makes its cells and map (first wall''s sheet)');
select pg_temp.login('a0000000-0000-0000-0000-000000000501');
reset role;
insert into res select 'resS1', jsonb_agg(jsonb_build_object('area_id', c.area_id, 'item_id', c.item_id, 'result', 'passed'))
  from public.ir_rev_items c where c.request_id = pg_temp.rid('S1');
insert into res select 'resM', jsonb_agg(jsonb_build_object('area_id', c.area_id, 'item_id', c.item_id, 'result', 'failed',
  'note', 'Gaps at the deflection track')) from public.ir_rev_items c where c.request_id = pg_temp.rid('M');
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000501');
select lives_ok($$ select public.ir_rev_results(pg_temp.rid('S1'), pg_temp.rver(pg_temp.rid('S1')), pg_temp.j('resS1')) $$,
  'inspector: every cell of the visitor''s request passed');
select lives_ok($$ select public.ir_rev_results(pg_temp.rid('M'), pg_temp.rver(pg_temp.rid('M')), pg_temp.j('resM')) $$,
  'inspector: the member''s request failed, with why');
reset role;
set local role service_role;
select pg_temp.login_service();
select is(public.link_request_map('c0000000-0000-0000-0000-000000000501', pg_temp.rh('s1'))->'map'->>'can_edit', 'false',
  'map: with a result the visitor no longer draws');
select throws_ok($$ select public.link_request_map_save('c0000000-0000-0000-0000-000000000501', pg_temp.rh('s1'),
  pg_temp.mapver(pg_temp.rid('S1')), '[]') $$, '42501', 'The map is final.', 'draw: refused after a result');
insert into res values ('revs2', public.link_request_revs('c0000000-0000-0000-0000-000000000501', pg_temp.h('job-token')));
select is(array[pg_temp.lst('wA', 'tow'), pg_temp.lst('wA', 'spray'), pg_temp.lst('wC', 'spray')], array['passed', 'open', 'requested'],
  'revs: passed; failed shows as open; requested');
select ok(pg_temp.j('revs2')::text not like '%Gaps%' and pg_temp.j('revs2')::text not like '%Ivy%'
          and pg_temp.j('revs2')::text not like '%Sam Sub%' and pg_temp.j('revs2')::text not like '%Sample Visitor%'
          and pg_temp.j('revs2')::text not like '%5550105000%',
  'revs: never a failure note, a person''s name or a contact');
select is_empty($$ select 1 from jsonb_array_elements(pg_temp.j('revs2')->'status') e where e ? 'note' or e ? 'ir_number' or e ? 'request_id' $$,
  'revs: status rows carry no request, number or note');

select * from finish();
rollback;
