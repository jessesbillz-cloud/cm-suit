begin;
select plan(9);
-- Migration 0084: the special inspection kinds are My Daily Reports' fifteen, in its order (public/request.html). The
-- 0024 names that MDR does not use stay in the table, inactive (a request already filed keeps its kind). The member
-- form (ir_form_context) lists the fifteen in order, a new request may pick one of them and not a retired one, and the
-- form offers OFS only on a job whose settings allow it (ir_ofs_allowed).
\ir _helpers.psql

create function pg_temp.d(p_days int) returns date language sql stable as $$
  select (now() at time zone 'America/Los_Angeles')::date + p_days $$;
create function pg_temp.kind_id(p_name text) returns uuid language sql stable security definer as $$
  select id from public.ir_special_kinds where name = p_name $$;
create function pg_temp.ask(p_job uuid, p_kind_name text) returns public.inspection_requests language sql volatile as $$
  select public.ir_submit(p_job, 'Sample Steel Co', pg_temp.d(3), 'special', 'Sample beam welds', true, '08:00', 'timed', 60,
    pg_temp.kind_id(p_kind_name), '{}', null, false) $$;
grant execute on all functions in schema pg_temp to public;

select pg_temp.mk_user('a0000000-0000-0000-0000-000000000721', 'probe+mk-admin@example.test', 'Ada Admin');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000722', 'probe+mk-insp@example.test', 'Ivy Inspector');
insert into public.orgs (id, name, kind, created_by) values
  ('b0000000-0000-0000-0000-000000000721', 'Sample Kinds Builders', 'gc', 'a0000000-0000-0000-0000-000000000721');
insert into public.projects (id, org_id, name, stage, timezone, created_by, settings) values
  ('c0000000-0000-0000-0000-000000000721', 'b0000000-0000-0000-0000-000000000721', 'Sample OFS Job', 'construction',
   'America/Los_Angeles', 'a0000000-0000-0000-0000-000000000721', '{"ir_ofs_allowed": true}'),
  ('c0000000-0000-0000-0000-000000000722', 'b0000000-0000-0000-0000-000000000721', 'Sample Plain Job', 'construction',
   'America/Los_Angeles', 'a0000000-0000-0000-0000-000000000721', '{}');
insert into public.project_members (org_id, project_id, user_id, invite_email, role, status) values
  ('b0000000-0000-0000-0000-000000000721', 'c0000000-0000-0000-0000-000000000721', 'a0000000-0000-0000-0000-000000000722',
   'probe+mk-insp@example.test', 'inspector', 'active'),
  ('b0000000-0000-0000-0000-000000000721', 'c0000000-0000-0000-0000-000000000722', 'a0000000-0000-0000-0000-000000000722',
   'probe+mk-insp@example.test', 'inspector', 'active');

-- The table, as the database holds it.
select is(
  (select array_agg(name order by sort, name) from public.ir_special_kinds where active),
  array['Welding', 'Bolting', 'Concrete', 'Masonry', 'Grout', 'Epoxy', 'Soils', 'Material ID', 'Material ID CWI', 'UT/MP',
        'Pull Test', 'Post Inst. Anchor', 'Fireproofing', 'Shotcrete', 'Rebar ID'],
  'the active kinds are MDR''s fifteen, in MDR''s order');
select is(
  (select array_agg(name order by name) from public.ir_special_kinds where not active),
  array['Cold-formed steel', 'Deep foundations', 'High-strength bolting', 'Post-installed anchors', 'Post-tensioning',
        'Reinforcing steel', 'Smoke control', 'Soils and compaction', 'Sprayed fire-resistive materials', 'Structural steel',
        'Structural wood'],
  'the invented 0024 kinds are kept, inactive (never deleted)');

-- The member form, as the inspector.
select pg_temp.login('a0000000-0000-0000-0000-000000000722');
select is(
  (select array_agg(k ->> 'name' order by n)
     from jsonb_array_elements(public.ir_form_context('c0000000-0000-0000-0000-000000000721') -> 'kinds')
          with ordinality as x(k, n)),
  array['Welding', 'Bolting', 'Concrete', 'Masonry', 'Grout', 'Epoxy', 'Soils', 'Material ID', 'Material ID CWI', 'UT/MP',
        'Pull Test', 'Post Inst. Anchor', 'Fireproofing', 'Shotcrete', 'Rebar ID'],
  'the request form lists MDR''s kinds in order');
select is((public.ir_form_context('c0000000-0000-0000-0000-000000000721') ->> 'ofs')::boolean, true,
  'an OFS job offers OFS on the form');
select is((public.ir_form_context('c0000000-0000-0000-0000-000000000722') ->> 'ofs')::boolean, false,
  'a job without ir_ofs_allowed offers IOR and Special only');

-- A new request takes an active kind, never a retired one.
select is((pg_temp.ask('c0000000-0000-0000-0000-000000000721', 'Bolting')).special_kind_id, pg_temp.kind_id('Bolting'),
  'a special request picks Bolting');
select is((pg_temp.ask('c0000000-0000-0000-0000-000000000722', 'Post Inst. Anchor')).special_kind_id,
  pg_temp.kind_id('Post Inst. Anchor'), 'a special request picks Post Inst. Anchor');
select throws_ok($$ select pg_temp.ask('c0000000-0000-0000-0000-000000000721', 'Reinforcing steel') $$, '22023', null,
  'a retired kind is refused');

-- Signed-in people read the list, nobody writes it.
select ok(not has_table_privilege('authenticated', 'public.ir_special_kinds', 'insert, update, delete'),
  'nobody signed in changes the kinds');

select * from finish();
rollback;
