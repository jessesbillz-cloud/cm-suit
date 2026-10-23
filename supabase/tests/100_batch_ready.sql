begin;
select plan(39);
-- Migration 0114 (Jesse, Oct 23: speed and zero wasted taps). A batch sent from the basket (0113) takes each approval
-- step in one tap: ir_batch_step calls the single button's own function (ir_ofs_check gc or ready, ir_send_ofs) for
-- each request of the batch waiting on the caller at that step, with its version, all or nothing. Requests not waiting
-- on him are left alone and reported, so the same tap again is safe. A role without the step's right is refused.
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
create function pg_temp.keys(p jsonb) returns text[] language sql stable as $$
  select coalesce(array_agg((select k from ids where v = (case jsonb_typeof(e) when 'string' then e #>> '{}' else e ->> 'id' end)::uuid) order by 1), '{}')
    from jsonb_array_elements(p) e $$;
create function pg_temp.batch() returns uuid language sql stable as $$ select pg_temp.rid('batch') $$;
create function pg_temp.audits() returns int language sql volatile security definer as $$
  select count(*)::int from public.audit_events where action = 'ir.batch_step' and project_id = 'c0000000-0000-0000-0000-000000001141' $$;
grant execute on all functions in schema pg_temp to public;

select pg_temp.mk_user('a0000000-0000-0000-0000-000000001141', 'probe+br-admin@example.test', 'Ada Admin');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000001142', 'probe+br-insp@example.test', 'Ivy Inspector');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000001143', 'probe+br-ahj@example.test', 'Dana Deputy');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000001144', 'probe+br-sub@example.test', 'Chris Installer');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000001146', 'probe+br-pm@example.test', 'Pat Manager');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000001147', 'probe+br-pe@example.test', 'Kyle Engineer');

insert into public.orgs (id, name, kind, created_by) values
  ('b0000000-0000-0000-0000-000000001141', 'Sample Batch Builders', 'gc', 'a0000000-0000-0000-0000-000000001141');
insert into public.projects (id, org_id, name, stage, timezone, created_by, settings) values
  ('c0000000-0000-0000-0000-000000001141', 'b0000000-0000-0000-0000-000000001141', 'Batch Job', 'construction',
   'America/Los_Angeles', 'a0000000-0000-0000-0000-000000001141', '{"ir_ofs_allowed": true}');
insert into public.project_members (org_id, project_id, user_id, invite_email, role, status)
select 'b0000000-0000-0000-0000-000000001141', 'c0000000-0000-0000-0000-000000001141', u::uuid, e, r, 'active'
  from (values ('a0000000-0000-0000-0000-000000001142', 'probe+br-insp@example.test', 'inspector'),
               ('a0000000-0000-0000-0000-000000001143', 'probe+br-ahj@example.test', 'ahj'),
               ('a0000000-0000-0000-0000-000000001144', 'probe+br-sub@example.test', 'sub'),
               ('a0000000-0000-0000-0000-000000001146', 'probe+br-pm@example.test', 'pm'),
               ('a0000000-0000-0000-0000-000000001147', 'probe+br-pe@example.test', 'pe')) v(u, e, r);
update public.profiles set company = case user_id when 'a0000000-0000-0000-0000-000000001144' then 'Sample Firestop Co'
                                                  else 'Sample Batch Builders' end
 where user_id in ('a0000000-0000-0000-0000-000000001144', 'a0000000-0000-0000-0000-000000001147');
insert into public.folders (id, org_id, project_id, name, created_by) values
  ('d0000000-0000-0000-0000-000000001141', 'b0000000-0000-0000-0000-000000001141', 'c0000000-0000-0000-0000-000000001141',
   'Sample Plans', 'a0000000-0000-0000-0000-000000001141');
insert into public.files (id, org_id, project_id, folder_id, storage_path, original_name, mime, created_by, scan_status) values
  ('e0000000-0000-0000-0000-000000001141', 'b0000000-0000-0000-0000-000000001141', 'c0000000-0000-0000-0000-000000001141',
   'd0000000-0000-0000-0000-000000001141', 'test/batch/l01.pdf', 'Sample L01.pdf', 'application/pdf',
   'a0000000-0000-0000-0000-000000001141', 'clean');
update public.files set upload_complete = true where id = 'e0000000-0000-0000-0000-000000001141';
insert into public.project_duties (org_id, project_id, duty, company, person_id, set_by) values
  ('b0000000-0000-0000-0000-000000001141', 'c0000000-0000-0000-0000-000000001141', 'ofs_requests', 'Sample Batch Builders',
   'a0000000-0000-0000-0000-000000001147', 'a0000000-0000-0000-0000-000000001141');

-- The inspector's list (TOW, HOW stuff and spray), walls A, B, C on Level 01's sheet.
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000001142');
insert into ids select 'L', (public.rev_list_create('c0000000-0000-0000-0000-000000001141', 'Sample Rated Walls', 'PH III', null,
  '[{"number": 0, "name": "TOW", "items": [{"name": "Top of wall"}]},
    {"number": 1, "name": "HOW", "items": [{"name": "HOW Stuff"}, {"name": "HOW Spray"}]}]')).id;
insert into ids select case i.name when 'Top of wall' then 'tow' when 'HOW Stuff' then 'stuff' else 'spray' end, i.id
  from public.rev_items i join public.revs v on v.id = i.rev_id where v.list_id = pg_temp.rid('L');
insert into ids select a.name, a.id
  from public.rev_areas_add(pg_temp.rid('L'), 'Level 01', array['A', 'B', 'C'], 'e0000000-0000-0000-0000-000000001141') a;

-- The installer sends a basket of three walls: three requests (top of wall on A and B, stuff on A, spray on C).
select pg_temp.login('a0000000-0000-0000-0000-000000001144');
select public.rev_basket_add('c0000000-0000-0000-0000-000000001141', array[pg_temp.rid('A'), pg_temp.rid('B')], array[pg_temp.rid('tow')]);
select public.rev_basket_add('c0000000-0000-0000-0000-000000001141', array[pg_temp.rid('A')], array[pg_temp.rid('stuff')]);
select public.rev_basket_add('c0000000-0000-0000-0000-000000001141', array[pg_temp.rid('C')], array[pg_temp.rid('spray')]);
create temp table sent (v jsonb);
grant all on sent to public;
insert into sent select public.rev_basket_send('c0000000-0000-0000-0000-000000001141',
  (public.rev_basket_get('c0000000-0000-0000-0000-000000001141') ->> 'version')::int,
  'Sample Firestop Co', current_date + 3, '09:00', 'timed', 60, true, false);
insert into ids select 'batch', (v ->> 'batch_id')::uuid from sent;
insert into ids select 'R' || k, (r ->> 'id')::uuid
  from sent, jsonb_array_elements(v -> 'requests') with ordinality x (r, k);
select is((select array_agg(distinct status) from public.inspection_requests where project_id = 'c0000000-0000-0000-0000-000000001141'),
  array['gc_review'], 'three requests, each with the GC');

-- ---------------------------------------------------------------------------------------------------------------------
-- Who may
-- ---------------------------------------------------------------------------------------------------------------------
reset role;
set local role anon;
select throws_ok($$ select public.ir_batch_step(pg_temp.batch(), 'gc', '{}') $$, '42501', null, 'anon can''t call it');
reset role;
select ok(not has_function_privilege('authenticated', 'public.ir_batch_waits(public.inspection_requests, text)', 'EXECUTE')
          and not has_function_privilege('authenticated', 'public.ir_batch_json(uuid)', 'EXECUTE')
          and has_function_privilege('authenticated', 'public.ir_batch_step(uuid, text, jsonb)', 'EXECUTE')
          and has_function_privilege('authenticated', 'public.ir_batches_waiting(uuid)', 'EXECUTE'),
  'the helpers are internal, the calls are not');
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000001144');
select is((public.ir_batch_get(pg_temp.batch())) -> 'size', '3'::jsonb, 'the installer reads his batch of 3');
select is((public.ir_batch_get(pg_temp.batch())) ->> 'items', 'Level 01 · Top of wall & HOW Stuff & HOW Spray', 'one line: levels and items');
select is((public.ir_batch_get(pg_temp.batch())) -> 'step', 'null'::jsonb, 'nothing waits on him');
select throws_ok($$ select public.ir_batch_step(pg_temp.batch(), 'gc', pg_temp.vers(array['R1', 'R2', 'R3'])) $$, '42501', 'forbidden',
  'a role without the GC step is refused');
select is(public.ir_batches_waiting('c0000000-0000-0000-0000-000000001141'), '[]'::jsonb, 'and has no batch waiting');
select pg_temp.login('a0000000-0000-0000-0000-000000001143');
select throws_ok($$ select public.ir_batch_get(pg_temp.batch()) $$, 'P0002', 'not_found', 'the fire marshal reads none of it yet');

-- ---------------------------------------------------------------------------------------------------------------------
-- The GC Readies one by hand. The inspector and the duty holder act only on it.
-- ---------------------------------------------------------------------------------------------------------------------
select pg_temp.login('a0000000-0000-0000-0000-000000001146');
select lives_ok($$ select public.ir_ofs_check(pg_temp.rid('R1'), pg_temp.ver('R1'), 'gc', true) $$, 'the GC checks R1 Ready by hand');
select is((select jsonb_array_length(j) from public.ir_batches_waiting('c0000000-0000-0000-0000-000000001141') j), 1, 'the GC has the batch waiting');
select is((public.ir_batches_waiting('c0000000-0000-0000-0000-000000001141')) -> 0 ->> 'step', 'gc', 'at the GC step');
select is((select count(*)::int from jsonb_array_elements(public.ir_batch_get(pg_temp.batch()) -> 'requests') r where (r ->> 'waits')::boolean),
  2, 'two of its three wait on him');

select pg_temp.login('a0000000-0000-0000-0000-000000001142');
select is((public.ir_batch_get(pg_temp.batch())) ->> 'step', 'send', 'the inspector''s step is Send to OFS');
select is(pg_temp.keys((select jsonb_agg(r) from jsonb_array_elements(public.ir_batch_get(pg_temp.batch()) -> 'requests') r
                        where (r ->> 'waits')::boolean)), array['R1'], 'only R1 waits on him');
select is(pg_temp.keys((public.ir_batch_step(pg_temp.batch(), 'ready', pg_temp.vers(array['R1']))) -> 'done'), array['R1'],
  'Ready all checks R1 alone');
select is(array[(pg_temp.req('R2')).status, (pg_temp.req('R3')).status], array['gc_review', 'gc_review'],
  'the two with the GC are left alone');

select pg_temp.login('a0000000-0000-0000-0000-000000001147');
create temp table step (v jsonb);
grant all on step to public;
insert into step select public.ir_batch_step(pg_temp.batch(), 'send', pg_temp.vers(array['R1', 'R2', 'R3']));
select is(pg_temp.keys((select v from step) -> 'done'), array['R1'], 'the duty holder''s Send all sends what the inspector checked');
select is(pg_temp.keys((select v from step) -> 'skipped'), array['R2', 'R3'], 'and reports the rest skipped');
select isnt((pg_temp.req('R1')).ofs_sent_at, null, 'R1 is with OFS');

-- ---------------------------------------------------------------------------------------------------------------------
-- The GC's Ready all: the version check refuses all, then all at once, then the same tap again is safe
-- ---------------------------------------------------------------------------------------------------------------------
select pg_temp.login('a0000000-0000-0000-0000-000000001146');
select throws_ok($$ select public.ir_batch_step(pg_temp.batch(), 'gc',
  jsonb_build_object(pg_temp.rid('R2'), pg_temp.ver('R2'), pg_temp.rid('R3'), pg_temp.ver('R3') + 5)) $$,
  '40001', null, 'one stale version refuses the batch');
select is(array[(pg_temp.req('R2')).status, (pg_temp.req('R3')).status], array['gc_review', 'gc_review'], 'nothing changed');
select throws_ok($$ select public.ir_batch_step(pg_temp.batch(), 'gc', pg_temp.vers(array['R2'])) $$,
  '40001', null, 'a request waiting on him that the screen did not show refuses the batch');
select throws_ok($$ select public.ir_batch_step(pg_temp.batch(), 'approve', pg_temp.vers(array['R2'])) $$,
  '22023', 'Unknown step.', 'only the GC, Ready and Send steps');
delete from step;
insert into step select public.ir_batch_step(pg_temp.batch(), 'gc', pg_temp.vers(array['R1', 'R2', 'R3']));
select is(pg_temp.keys((select v from step) -> 'done'), array['R2', 'R3'], 'Ready all: the two waiting on the GC');
select is(array[(pg_temp.req('R2')).status, (pg_temp.req('R3')).status], array['pending', 'pending'], 'both with the inspector now');
select isnt((pg_temp.req('R2')).gc_by, null, 'each with the GC''s Ready, as one tap of the single button');
select is((public.ir_batch_step(pg_temp.batch(), 'gc', (select jsonb_object_agg(r ->> 'id', (r ->> 'version')::int - 1)
                                                         from jsonb_array_elements((select v from step) -> 'done') r))) -> 'done',
  '[]'::jsonb, 'the same tap again (the old versions) does nothing');
select is(public.ir_batches_waiting('c0000000-0000-0000-0000-000000001141'), '[]'::jsonb, 'nothing waits on the GC now');

-- ---------------------------------------------------------------------------------------------------------------------
-- The inspector's Send all; the fire marshal reads them and has no batch step
-- ---------------------------------------------------------------------------------------------------------------------
select pg_temp.login('a0000000-0000-0000-0000-000000001142');
select is(pg_temp.keys((public.ir_batch_step(pg_temp.batch(), 'send', pg_temp.vers(array['R1', 'R2', 'R3']))) -> 'done'),
  array['R2', 'R3'], 'Send all to OFS sends the other two');
select is((select count(*)::int from public.inspection_requests where project_id = 'c0000000-0000-0000-0000-000000001141'
             and ofs_sent_at is not null and status = 'pending'), 3, 'all three are with the fire marshal');
select pg_temp.login('a0000000-0000-0000-0000-000000001143');
select is((public.ir_batch_get(pg_temp.batch())) -> 'size', '3'::jsonb, 'the fire marshal reads the batch of 3');
select is((public.ir_batch_get(pg_temp.batch())) -> 'step', 'null'::jsonb, 'with no step of his');
select throws_ok($$ select public.ir_batch_step(pg_temp.batch(), 'send', pg_temp.vers(array['R1'])) $$, '42501', 'forbidden',
  'nor sends');
reset role;
select is(pg_temp.audits(), 4, 'each batch tap that did something is audited');

-- ---------------------------------------------------------------------------------------------------------------------
-- A copy from My Daily Reports (0112) is never acted on: skipped and reported, the rest of the batch goes on
-- ---------------------------------------------------------------------------------------------------------------------
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000001144');
select public.rev_basket_add('c0000000-0000-0000-0000-000000001141', array[pg_temp.rid('B'), pg_temp.rid('C')], array[pg_temp.rid('stuff')]);
select public.rev_basket_add('c0000000-0000-0000-0000-000000001141', array[pg_temp.rid('A'), pg_temp.rid('B')], array[pg_temp.rid('spray')]);
delete from sent;
insert into sent select public.rev_basket_send('c0000000-0000-0000-0000-000000001141',
  (public.rev_basket_get('c0000000-0000-0000-0000-000000001141') ->> 'version')::int,
  'Sample Firestop Co', current_date + 3, '09:00', 'timed', 60, true, false);
delete from ids where k = 'batch';
insert into ids select 'batch', (v ->> 'batch_id')::uuid from sent;
insert into ids select 'Q' || k, (r ->> 'id')::uuid
  from sent, jsonb_array_elements(v -> 'requests') with ordinality x (r, k);
reset role;
-- Made a copy as only the import may (it can't be in a basket otherwise).
select set_config('app.mdr_import', 'on', true);
update public.inspection_requests set mdr_id = gen_random_uuid() where id = pg_temp.rid('Q2');
select set_config('app.mdr_import', '', true);
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000001146');
select is(pg_temp.keys((select jsonb_agg(r) from jsonb_array_elements(public.ir_batch_get(pg_temp.batch()) -> 'requests') r
                        where (r ->> 'waits')::boolean)), array['Q1'], 'the copy does not wait on the GC');
delete from step;
insert into step select public.ir_batch_step(pg_temp.batch(), 'gc', pg_temp.vers(array['Q1', 'Q2']));
select is(pg_temp.keys((select v from step) -> 'done'), array['Q1'], 'Ready all readies the suite''s own request');
select is(pg_temp.keys((select v from step) -> 'skipped'), array['Q2'], 'and reports the copy skipped');
select is((pg_temp.req('Q2')).status, 'gc_review', 'the copy is untouched');

select * from finish();
rollback;
