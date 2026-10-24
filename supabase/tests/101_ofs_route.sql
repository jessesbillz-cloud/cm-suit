begin;
select plan(47);
-- Migration 0116 (Jesse, Oct 23):
--   * The route is a job setting (Settings > Job). Default: the contractor checks, the inspector sends. Options: no
--     contractor check (ir_ofs_gc_off), the duty holder sends after the inspector's Ready (ir_ofs_duty_sends).
--   * Fewer notifications: an OFS request posts board lines only when filed or passed on (to the one whose turn it is),
--     sent to OFS, returned and its results. A batch posts one line per step. Needs you lists a batch only for the
--     one whose turn it is.
--   * A PE does the contractor step (ir.gc_approve), nothing about money.
\ir _helpers.psql

create temp table ids (k text primary key, v uuid);
grant all on ids to public;
create function pg_temp.rid(p_k text) returns uuid language sql stable as $$ select v from ids where k = p_k $$;
create function pg_temp.ver(p_k text) returns int language sql volatile security definer as $$
  select version from public.inspection_requests where id = pg_temp.rid(p_k) $$;
create function pg_temp.req(p_k text) returns public.inspection_requests language sql volatile security definer as $$
  select * from public.inspection_requests where id = pg_temp.rid(p_k) $$;
create function pg_temp.vers(p_keys text[]) returns jsonb language sql volatile as $$
  select jsonb_object_agg(pg_temp.rid(k)::text, pg_temp.ver(k)) from unnest(p_keys) k $$;
create function pg_temp.ask(p_items text) returns public.inspection_requests language sql volatile as $$
  select public.ir_submit('c0000000-0000-0000-0000-000000001161', 'Sample Firestop Co',
    (now() at time zone 'America/Los_Angeles')::date + 3, 'ofs', p_items, true, '08:00', 'timed', 60, null, '{}', false) $$;
create function pg_temp.w() returns text language sql stable security definer as $$
  select public.ir_when_label((now() at time zone 'America/Los_Angeles')::date + 3, '08:00') $$;
create function pg_temp.route(p jsonb) returns void language sql volatile security definer as $$
  update public.projects set settings = (settings - 'ir_ofs_gc_off' - 'ir_ofs_duty_sends') || p
   where id = 'c0000000-0000-0000-0000-000000001161' $$;
-- The board lines posted since the last call: "kind|summary|audience|recipients", in a stable order.
create temp table seen (id uuid primary key);
grant all on seen to public;
create function pg_temp.new_lines() returns text[] language plpgsql volatile security definer as $$
declare v text[];
begin
  select coalesce(array_agg(x.l order by x.l), '{}') into v from (
    select a.kind || '|' || a.summary || '|' || coalesce(a.audience_capability, '') || '|'
           || coalesce((select string_agg(p.full_name, ',' order by p.full_name) from public.activity_recipients ar
                         join public.profiles p on p.user_id = ar.user_id where ar.activity_id = a.id), '') as l
      from public.activity a
     where a.project_id = 'c0000000-0000-0000-0000-000000001161' and a.id not in (select id from seen)) x;
  insert into seen select a.id from public.activity a where a.project_id = 'c0000000-0000-0000-0000-000000001161'
  on conflict do nothing;
  return v;
end $$;
grant execute on all functions in schema pg_temp to public;

select pg_temp.mk_user('a0000000-0000-0000-0000-000000001161', 'probe+rt-admin@example.test', 'Ada Admin');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000001162', 'probe+rt-insp@example.test', 'Ivy Inspector');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000001163', 'probe+rt-ahj@example.test', 'Dana Deputy');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000001164', 'probe+rt-sub@example.test', 'Sam Sub');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000001165', 'probe+rt-pm@example.test', 'Pat Manager');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000001166', 'probe+rt-pe@example.test', 'Kyle Engineer');

insert into public.orgs (id, name, kind, created_by) values
  ('b0000000-0000-0000-0000-000000001161', 'Sample Route Builders', 'gc', 'a0000000-0000-0000-0000-000000001161');
insert into public.projects (id, org_id, name, stage, timezone, created_by, settings) values
  ('c0000000-0000-0000-0000-000000001161', 'b0000000-0000-0000-0000-000000001161', 'Route Job', 'construction',
   'America/Los_Angeles', 'a0000000-0000-0000-0000-000000001161', '{"ir_ofs_allowed": true}');
insert into public.project_members (org_id, project_id, user_id, invite_email, role, status)
select 'b0000000-0000-0000-0000-000000001161', 'c0000000-0000-0000-0000-000000001161', u::uuid, e, r, 'active'
  from (values ('a0000000-0000-0000-0000-000000001162', 'probe+rt-insp@example.test', 'inspector'),
               ('a0000000-0000-0000-0000-000000001163', 'probe+rt-ahj@example.test', 'ahj'),
               ('a0000000-0000-0000-0000-000000001164', 'probe+rt-sub@example.test', 'sub'),
               ('a0000000-0000-0000-0000-000000001165', 'probe+rt-pm@example.test', 'pm'),
               ('a0000000-0000-0000-0000-000000001166', 'probe+rt-pe@example.test', 'pe')) v(u, e, r);
update public.profiles set company = case user_id when 'a0000000-0000-0000-0000-000000001164' then 'Sample Firestop Co'
                                                  else 'Sample Route Builders' end
 where user_id in ('a0000000-0000-0000-0000-000000001164', 'a0000000-0000-0000-0000-000000001166');
insert into public.folders (id, org_id, project_id, name, created_by) values
  ('d0000000-0000-0000-0000-000000001161', 'b0000000-0000-0000-0000-000000001161', 'c0000000-0000-0000-0000-000000001161',
   'Sample Plans', 'a0000000-0000-0000-0000-000000001161');
insert into public.files (id, org_id, project_id, folder_id, storage_path, original_name, mime, created_by, scan_status) values
  ('e0000000-0000-0000-0000-000000001161', 'b0000000-0000-0000-0000-000000001161', 'c0000000-0000-0000-0000-000000001161',
   'd0000000-0000-0000-0000-000000001161', 'test/route/l01.pdf', 'Sample L01.pdf', 'application/pdf',
   'a0000000-0000-0000-0000-000000001161', 'clean');
update public.files set upload_complete = true where id = 'e0000000-0000-0000-0000-000000001161';

-- ---------------------------------------------------------------------------------------------------------------------
-- The PE's rights: the contractor step, nothing about money
-- ---------------------------------------------------------------------------------------------------------------------
select results_eq($$ select capability from public.role_permissions where role = 'pe' and capability like 'ir.%' order by 1 $$,
  $$ values ('ir.gc_approve'::text), ('ir.request'), ('ir.view_all') $$, 'a PE files, reads and does the contractor step');
select is_empty($$ select capability from public.role_permissions where role = 'pe' and capability like any (array['bids.%', '%pricing%']) $$,
  'and holds nothing about bids or pricing');
select ok(not has_function_privilege('authenticated', 'public.ir_ofs_turn(public.inspection_requests, boolean)', 'EXECUTE')
          and not has_function_privilege('authenticated', 'public.ir_ofs_step(public.inspection_requests, boolean)', 'EXECUTE')
          and not has_function_privilege('authenticated', 'public.ir_ofs_route(uuid)', 'EXECUTE')
          and not has_function_privilege('authenticated', 'public.ir_ofs_board(uuid[], text, text, uuid[], text)', 'EXECUTE')
          and not has_function_privilege('anon', 'public.ir_board_keeps(uuid, text)', 'EXECUTE'),
  'the route helpers are internal');

-- ---------------------------------------------------------------------------------------------------------------------
-- Default route: the contractor checks, the inspector sends. Nobody holds the duty yet.
-- ---------------------------------------------------------------------------------------------------------------------
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000001164');
insert into ids select 'A', (pg_temp.ask('Sample firestop at grid 3')).id;
select is((pg_temp.req('A')).status, 'gc_review', 'the sub''s request starts with the contractor');
select is((select c -> 'route' from public.ir_ofs_chain(pg_temp.rid('A')) c), '{"gc": true, "sender": "inspector"}'::jsonb,
  'the chain carries the route: the contractor checks, the inspector sends');
select is((select c ->> 'step' from public.ir_ofs_chain(pg_temp.rid('A')) c), 'gc', 'and where it is on it');
select is(pg_temp.new_lines(),
  array['ir.ofs_filed|OFS #0001 filed · Sample Firestop Co · ' || pg_temp.w() || '||Ada Admin,Kyle Engineer,Pat Manager'],
  'one board line, to the ones whose turn it is (every GC approver while nobody holds the duty)');

-- The PE does the contractor step.
select pg_temp.login('a0000000-0000-0000-0000-000000001166');
select is((public.ir_ofs_check(pg_temp.rid('A'), pg_temp.ver('A'), 'gc', true)).status, 'pending', 'the PE checks it: on to the inspector');
select is(pg_temp.new_lines(),
  array['ir.ofs_filed|OFS #0001 checked · Sample Firestop Co · ' || pg_temp.w() || '||Ivy Inspector'],
  'one line, to the inspector only');
select is((public.ir_ofs_check(pg_temp.rid('A'), pg_temp.ver('A'), 'gc', false)).status, 'gc_review', 'Undo');
select is(pg_temp.new_lines(), '{}'::text[], 'an Undo posts nothing');
select is((public.ir_ofs_check(pg_temp.rid('A'), pg_temp.ver('A'), 'gc', true)).status, 'pending', 'checked again');
select pg_temp.new_lines();

-- The duty: Kyle (a PE of the GC) holds it from here.
reset role;
insert into public.project_duties (org_id, project_id, duty, company, person_id, set_by) values
  ('b0000000-0000-0000-0000-000000001161', 'c0000000-0000-0000-0000-000000001161', 'ofs_requests', 'Sample Route Builders',
   'a0000000-0000-0000-0000-000000001166', 'a0000000-0000-0000-0000-000000001161');
set local role authenticated;

-- Only the inspector sends: Kyle may not, and Ready is not a step on this route.
select throws_ok($$ select public.ir_send_ofs(pg_temp.rid('A'), pg_temp.ver('A')) $$, '22023',
  'On this job the inspector sends it to OFS.', 'the duty holder does not send on the default route');
select pg_temp.login('a0000000-0000-0000-0000-000000001162');
select throws_ok($$ select public.ir_ofs_check(pg_temp.rid('A'), pg_temp.ver('A'), 'ready', true) $$, '22023',
  'On this job the inspector sends it to OFS.', 'his Send is his Ready');
select is((public.ir_postpone(pg_temp.rid('A'), pg_temp.ver('A'), 'not_ready')).status, 'postponed', 'the inspector postpones it');
select is(pg_temp.new_lines(), '{}'::text[], 'no board line for a postponement (0116)');
select isnt((public.ir_send_ofs(pg_temp.rid('A'), pg_temp.ver('A'))).ofs_sent_at, null, 'the inspector sends it');
select is(pg_temp.new_lines(),
  array['ir.ofs_sent|OFS #0001 sent to OFS · Sample Firestop Co · ' || pg_temp.w() || '|ir.ofs_decide|Sam Sub'],
  'one line: the fire marshal (his capability) and the requester');
select pg_temp.login('a0000000-0000-0000-0000-000000001163');
select is((public.ir_confirm(pg_temp.rid('A'), pg_temp.ver('A'))).status, 'confirmed', 'the fire marshal confirms');
select is(pg_temp.new_lines(), '{}'::text[], 'no board line for a confirm');

-- With a duty holder, the contractor step is his turn alone.
select pg_temp.login('a0000000-0000-0000-0000-000000001164');
insert into ids select 'B', (pg_temp.ask('Sample damper test')).id;
select is(pg_temp.new_lines(),
  array['ir.ofs_filed|OFS #0002 filed · Sample Firestop Co · ' || pg_temp.w() || '||Kyle Engineer'],
  'filed: to the duty holder only');

-- ---------------------------------------------------------------------------------------------------------------------
-- The duty holder sends after the inspector's Ready
-- ---------------------------------------------------------------------------------------------------------------------
reset role;
select pg_temp.route('{"ir_ofs_duty_sends": true}');
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000001166');
select is((select c -> 'route' from public.ir_ofs_chain(pg_temp.rid('B')) c), '{"gc": true, "sender": "duty"}'::jsonb,
  'the route says the duty holder sends');
select is((public.ir_ofs_check(pg_temp.rid('B'), pg_temp.ver('B'), 'gc', true)).status, 'pending', 'Kyle checks it');
select is(pg_temp.new_lines(), array['ir.ofs_filed|OFS #0002 checked · Sample Firestop Co · ' || pg_temp.w() || '||Ivy Inspector'],
  'to the inspector');
select throws_ok($$ select public.ir_send_ofs(pg_temp.rid('B'), pg_temp.ver('B')) $$, '22023', 'The inspector checks it first.',
  'Kyle sends what the inspector has checked');
select pg_temp.login('a0000000-0000-0000-0000-000000001162');
select throws_ok($$ select public.ir_send_ofs(pg_temp.rid('B'), pg_temp.ver('B')) $$, '22023',
  'On this job the contractor''s OFS person sends it to OFS.', 'the inspector does not send on this route');
select isnt((public.ir_ofs_check(pg_temp.rid('B'), pg_temp.ver('B'), 'ready', true)).ofs_ready_at, null, 'the inspector marks it Ready');
select is(pg_temp.new_lines(), array['ir.ofs_filed|OFS #0002 ready to send · Sample Firestop Co · ' || pg_temp.w() || '||Kyle Engineer'],
  'one line, to the duty holder');
select pg_temp.login('a0000000-0000-0000-0000-000000001166');
select isnt((public.ir_send_ofs(pg_temp.rid('B'), pg_temp.ver('B'))).ofs_sent_at, null, 'Kyle sends it');
select is(pg_temp.new_lines(), array['ir.ofs_sent|OFS #0002 sent to OFS · Sample Firestop Co · ' || pg_temp.w() || '|ir.ofs_decide|Sam Sub'],
  'one line for the fire marshal and the requester');
reset role;
update public.project_duties set person_id = null where project_id = 'c0000000-0000-0000-0000-000000001161';
select is(public.ir_ofs_route('c0000000-0000-0000-0000-000000001161') ->> 'sender', 'inspector',
  'nobody picked: the inspector sends');
update public.project_duties set person_id = 'a0000000-0000-0000-0000-000000001166'
 where project_id = 'c0000000-0000-0000-0000-000000001161';

-- ---------------------------------------------------------------------------------------------------------------------
-- No contractor check: straight to the inspector
-- ---------------------------------------------------------------------------------------------------------------------
select pg_temp.route('{"ir_ofs_gc_off": true}');
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000001164');
insert into ids select 'C', (pg_temp.ask('Sample door test')).id;
select is((pg_temp.req('C')).status, 'pending', 'the sub''s request goes straight to the inspector');
select is((select c -> 'route' from public.ir_ofs_chain(pg_temp.rid('C')) c), '{"gc": false, "sender": "inspector"}'::jsonb,
  'the route has no contractor check');
select is(pg_temp.new_lines(), array['ir.ofs_filed|OFS #0003 filed · Sample Firestop Co · ' || pg_temp.w() || '||Ivy Inspector'],
  'filed: to the inspector');

-- A PE's own request with the check on: his filing is his check.
reset role;
select pg_temp.route('{}');
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000001166');
insert into ids select 'D', (pg_temp.ask('Sample shaft wall')).id;
select is(array[(pg_temp.req('D')).status, ((pg_temp.req('D')).gc_by = auth.uid())::text], array['pending', 'true'],
  'a PE''s request starts with the inspector, checked by him');
select pg_temp.new_lines();

-- ---------------------------------------------------------------------------------------------------------------------
-- A batch: one line per step, Needs you for the one whose turn it is
-- ---------------------------------------------------------------------------------------------------------------------
select pg_temp.login('a0000000-0000-0000-0000-000000001162');
insert into ids select 'L', (public.rev_list_create('c0000000-0000-0000-0000-000000001161', 'Sample Rated Walls', 'PH III', null,
  '[{"number": 0, "name": "TOW", "items": [{"name": "Top of wall"}]},
    {"number": 1, "name": "HOW", "items": [{"name": "HOW Stuff"}, {"name": "HOW Spray"}]}]')).id;
insert into ids select case i.name when 'Top of wall' then 'tow' when 'HOW Stuff' then 'stuff' else 'spray' end, i.id
  from public.rev_items i join public.revs v on v.id = i.rev_id where v.list_id = pg_temp.rid('L');
insert into ids select a.name, a.id
  from public.rev_areas_add(pg_temp.rid('L'), 'Level 01', array['WA', 'WB', 'WC'], 'e0000000-0000-0000-0000-000000001161') a;
select pg_temp.login('a0000000-0000-0000-0000-000000001164');
select public.rev_basket_add('c0000000-0000-0000-0000-000000001161', array[pg_temp.rid('WA'), pg_temp.rid('WB')], array[pg_temp.rid('tow')]);
select public.rev_basket_add('c0000000-0000-0000-0000-000000001161', array[pg_temp.rid('WA')], array[pg_temp.rid('stuff')]);
select public.rev_basket_add('c0000000-0000-0000-0000-000000001161', array[pg_temp.rid('WC')], array[pg_temp.rid('spray')]);
create temp table sent (v jsonb);
grant all on sent to public;
insert into sent select public.rev_basket_send('c0000000-0000-0000-0000-000000001161',
  (public.rev_basket_get('c0000000-0000-0000-0000-000000001161') ->> 'version')::int,
  'Sample Firestop Co', current_date + 3, '09:00', 'timed', 60, true, false);
insert into ids select 'batch', (v ->> 'batch_id')::uuid from sent;
insert into ids select 'R' || k, (r ->> 'id')::uuid from sent, jsonb_array_elements(v -> 'requests') with ordinality x (r, k);
select is(pg_temp.new_lines(), array['ir.ofs_filed|Batch of 3 filed · Level 01 · Top of wall & HOW Stuff & HOW Spray||Kyle Engineer'],
  'three requests filed: one line, to the duty holder');
select pg_temp.login('a0000000-0000-0000-0000-000000001165');
select is(public.ir_batches_waiting('c0000000-0000-0000-0000-000000001161'), '[]'::jsonb,
  'the PM may check them but it is not his turn: not in his Needs you');
select pg_temp.login('a0000000-0000-0000-0000-000000001162');
select is(public.ir_batches_waiting('c0000000-0000-0000-0000-000000001161'), '[]'::jsonb, 'nor the inspector''s yet');
select pg_temp.login('a0000000-0000-0000-0000-000000001166');
select is((select array[jsonb_array_length(j)::text, j -> 0 ->> 'step', j -> 0 -> 'route' ->> 'sender']
             from public.ir_batches_waiting('c0000000-0000-0000-0000-000000001161') j), array['1', 'gc', 'inspector'],
  'one Needs you line for the batch, the duty holder''s, with the route');
select is(jsonb_array_length(public.ir_batch_step(pg_temp.rid('batch'), 'gc', pg_temp.vers(array['R1', 'R2', 'R3'])) -> 'done'), 3,
  'Ready all');
select is(public.ir_batches_waiting('c0000000-0000-0000-0000-000000001161'), '[]'::jsonb, 'done: gone from his Needs you');
select is(pg_temp.new_lines(), array['ir.ofs_filed|Batch of 3 checked · Level 01 · Top of wall & HOW Stuff & HOW Spray||Ivy Inspector'],
  'one line for the step, to the inspector');
select pg_temp.login('a0000000-0000-0000-0000-000000001162');
select is((select array[jsonb_array_length(j)::text, j -> 0 ->> 'step'] from public.ir_batches_waiting('c0000000-0000-0000-0000-000000001161') j),
  array['1', 'send'], 'the inspector has the one line now');
select is(jsonb_array_length(public.ir_batch_step(pg_temp.rid('batch'), 'send', pg_temp.vers(array['R1', 'R2', 'R3'])) -> 'done'), 3,
  'Send all to OFS');
select is(pg_temp.new_lines(),
  array['ir.ofs_sent|Batch of 3 sent to OFS · Level 01 · Top of wall & HOW Stuff & HOW Spray|ir.ofs_decide|Sam Sub'],
  'one line for the fire marshal and the requester');

-- ---------------------------------------------------------------------------------------------------------------------
-- Other requests keep their lines, and nothing here sends email
-- ---------------------------------------------------------------------------------------------------------------------
select pg_temp.login('a0000000-0000-0000-0000-000000001164');
select public.ir_submit('c0000000-0000-0000-0000-000000001161', 'Sample Firestop Co',
  (now() at time zone 'America/Los_Angeles')::date + 3, 'ior', 'Sample IOR visit', true, '08:00', 'timed', 60, null, '{}', null);
select is((select array_agg(split_part(l, '|', 1)) from unnest(pg_temp.new_lines()) l), array['ir.requested'],
  'an inspector''s (IOR) request still posts its line');
reset role;
select is_empty($$ select 1 from public.email_outbound where project_id = 'c0000000-0000-0000-0000-000000001161'
                  union all select 1 from queue.jobs_index where project_id = 'c0000000-0000-0000-0000-000000001161' and kind = 'send_email' $$,
  'no email, queued or sent');

select * from finish();
rollback;
