begin;
select plan(128);
-- Requirements, each sub's own lines (migration 0073): the matrix and the rail as data (provisional), whose line it is
-- (the company of a membership on the job; picked by a manager; nothing links by itself), who reads (a company's own
-- kept lines and nothing else: no other company's lines, no drafts, no removed lines, no counts of them, no spec
-- reader), what its people may write (their evidence on their own line, with the version; nothing else), the
-- Requirements folder (they add without reading), and the reminder (their own line's task; the board line stays the
-- managers'; a line moved to another company takes its tasks along).
\ir _helpers.psql

create temp table who (k text primary key, id uuid not null);
create temp table res (k text primary key, j jsonb);
grant all on who, res to public;
create function pg_temp.u(p_k text) returns uuid language sql stable as $$ select id from who where k = p_k $$;
create function pg_temp.j(p_k text) returns jsonb language sql stable as $$ select j from res where k = p_k $$;
create function pg_temp.rid(p_k text) returns uuid language sql stable as $$ select (j->>'id')::uuid from res where k = p_k $$;
-- Read past RLS, whoever is logged in.
create function pg_temp.row_of(p_id uuid) returns public.requirements language sql stable security definer as $$
  select * from public.requirements where id = p_id $$;
create function pg_temp.ver(p_k text) returns int language sql stable security definer as $$
  select version from public.requirements where id = (select (j->>'id')::uuid from res where k = p_k) $$;
create function pg_temp.open_tasks(p_id uuid, p_who uuid default null) returns int language sql stable security definer as $$
  select count(*)::int from public.tasks
   where entity_id = p_id and kind = 'requirements.due' and done_at is null and deleted_at is null
     and (p_who is null or assignee_user_id = p_who) $$;
-- The rows a person reads straight from the table on a job (logs them in).
create function pg_temp.seen(p_k text, p_project uuid default 'c0000000-0000-0000-0000-000000000611') returns text[]
language plpgsql as $$
begin
  perform pg_temp.login(pg_temp.u(p_k));
  return coalesce((select array_agg(title order by title) from public.requirements where project_id = p_project), '{}');
end $$;
-- The list function's titles for a person (logs them in).
create function pg_temp.listed(p_k text, p_project uuid default 'c0000000-0000-0000-0000-000000000611') returns text[]
language plpgsql as $$
begin
  perform pg_temp.login(pg_temp.u(p_k));
  return coalesce((select array_agg(title order by title) from public.requirements_list(p_project)), '{}');
end $$;
-- One requirement_save as the logged-in user (a new one when p_id is null).
create function pg_temp.save(p_id uuid, p_version int, p_title text, p_company uuid, p_trigger date default null,
                             p_who text default '', p_project uuid default 'c0000000-0000-0000-0000-000000000611')
returns jsonb language sql as $$
  select to_jsonb(s) from public.requirement_save(p_project, p_id, p_version, null, 'warranty', p_title, '', '07 54 23', '',
    '', p_who, 'yes', null, null, '', '', p_trigger, p_company) s $$;
grant execute on all functions in schema pg_temp to public;

insert into who values
  ('admin', 'a0000000-0000-0000-0000-000000000611'), ('pe', 'a0000000-0000-0000-0000-000000000612'),
  ('super', 'a0000000-0000-0000-0000-000000000613'), ('a1', 'a0000000-0000-0000-0000-000000000614'),
  ('a2', 'a0000000-0000-0000-0000-000000000615'), ('b1', 'a0000000-0000-0000-0000-000000000616'),
  ('nocompany', 'a0000000-0000-0000-0000-000000000617'), ('foreman', 'a0000000-0000-0000-0000-000000000618'),
  ('requester', 'a0000000-0000-0000-0000-000000000619'), ('viewer', 'a0000000-0000-0000-0000-00000000061a'),
  ('two', 'a0000000-0000-0000-0000-00000000061b'), ('other', 'a0000000-0000-0000-0000-00000000061c'),
  ('expired', 'a0000000-0000-0000-0000-00000000061d'), ('revoked', 'a0000000-0000-0000-0000-00000000061e'),
  ('bidder', 'a0000000-0000-0000-0000-00000000061f');
select pg_temp.mk_user(id, 'probe+rqo-' || k || '@example.test', 'Sample ' || k) from who;

-- G builds job J; O builds job X. Alpha and Beta are subs on J (Alpha on X too); Gamma's only person on J is revoked;
-- Delta's is a bidder; Epsilon is on no job.
insert into public.orgs (id, name, kind, created_by) values
  ('b0000000-0000-0000-0000-000000000611', 'Sample Own Builders', 'gc', pg_temp.u('admin')),
  ('b0000000-0000-0000-0000-000000000612', 'Sample Other Builders', 'gc', pg_temp.u('other')),
  ('b0000000-0000-0000-0000-000000000613', 'Sample Alpha Drywall', 'sub', pg_temp.u('a1')),
  ('b0000000-0000-0000-0000-000000000614', 'Sample Beta Roofing', 'sub', pg_temp.u('b1')),
  ('b0000000-0000-0000-0000-000000000615', 'Sample Gamma Glazing', 'sub', pg_temp.u('revoked')),
  ('b0000000-0000-0000-0000-000000000616', 'Sample Delta Doors', 'sub', pg_temp.u('bidder')),
  ('b0000000-0000-0000-0000-000000000617', 'Sample Epsilon Electric', 'sub', pg_temp.u('other'));
insert into public.projects (id, org_id, name, stage, timezone, created_by) values
  ('c0000000-0000-0000-0000-000000000611', 'b0000000-0000-0000-0000-000000000611', 'Own Lines Job J', 'construction',
   'America/Los_Angeles', pg_temp.u('admin')),
  ('c0000000-0000-0000-0000-000000000612', 'b0000000-0000-0000-0000-000000000612', 'Other Job X', 'construction',
   'America/Los_Angeles', pg_temp.u('other'));
insert into public.project_members (org_id, project_id, user_id, invite_email, member_org_id, role, status, access_ends_at)
select p.org_id, p.id, pg_temp.u(m.k), 'probe+rqo-' || m.k || '@example.test', m.company, m.role, m.status, m.ends
  from (values
    ('c0000000-0000-0000-0000-000000000611'::uuid, 'pe', null::uuid, 'pe', 'active', null::timestamptz),
    ('c0000000-0000-0000-0000-000000000611', 'super', null, 'superintendent', 'active', null),
    ('c0000000-0000-0000-0000-000000000611', 'a1', 'b0000000-0000-0000-0000-000000000613', 'sub', 'active', null),
    ('c0000000-0000-0000-0000-000000000611', 'a2', 'b0000000-0000-0000-0000-000000000613', 'sub', 'active', null),
    ('c0000000-0000-0000-0000-000000000611', 'b1', 'b0000000-0000-0000-0000-000000000614', 'sub', 'active', null),
    ('c0000000-0000-0000-0000-000000000611', 'nocompany', null, 'sub', 'active', null),
    ('c0000000-0000-0000-0000-000000000611', 'foreman', 'b0000000-0000-0000-0000-000000000613', 'foreman', 'active', null),
    ('c0000000-0000-0000-0000-000000000611', 'requester', 'b0000000-0000-0000-0000-000000000613', 'requester', 'active', null),
    ('c0000000-0000-0000-0000-000000000611', 'viewer', 'b0000000-0000-0000-0000-000000000613', 'viewer', 'active', null),
    -- Two memberships: Beta's sub, and a viewer for Alpha. Only the sub's company counts.
    ('c0000000-0000-0000-0000-000000000611', 'two', 'b0000000-0000-0000-0000-000000000614', 'sub', 'active', null),
    ('c0000000-0000-0000-0000-000000000611', 'two', 'b0000000-0000-0000-0000-000000000613', 'viewer', 'active', null),
    ('c0000000-0000-0000-0000-000000000611', 'expired', 'b0000000-0000-0000-0000-000000000613', 'sub', 'active', now() - interval '1 day'),
    ('c0000000-0000-0000-0000-000000000611', 'revoked', 'b0000000-0000-0000-0000-000000000615', 'sub', 'revoked', null),
    ('c0000000-0000-0000-0000-000000000611', 'bidder', 'b0000000-0000-0000-0000-000000000616', 'bidder', 'active', null),
    ('c0000000-0000-0000-0000-000000000612', 'a2', 'b0000000-0000-0000-0000-000000000613', 'sub', 'active', null)
  ) m (project, k, company, role, status, ends)
  join public.projects p on p.id = m.project;

-- ---------------------------------------------------------------------------------------------------------------------
-- The matrix and the rail, as data (provisional)
-- ---------------------------------------------------------------------------------------------------------------------
select is((select array_agg(role order by role) from public.role_permissions where capability = 'requirements.read_own'),
  '{foreman,sub}'::text[], 'matrix: the sub''s office and the foreman read their own company''s lines (not the requester, the bidder or the viewer)');
select ok(not exists (select 1 from public.role_permissions where capability = 'requirements.read_own' and requires_aal2),
  'matrix: no second factor needed');
select is((select array_agg(role order by role) from public.role_permissions where capability = 'requirements.read'),
  '{architect,inspector,inspector_admin,owner_rep,pe,pm,project_admin,safety,special_inspector,superintendent}'::text[],
  'matrix: who reads the whole register is as 0069 left it');
select is((select array_agg(role order by role) from public.role_permissions where capability = 'requirements.manage'),
  '{inspector_admin,pe,pm,project_admin}'::text[], 'matrix: who manages is as 0069 left it');
select results_eq($$ select name, recommended_tools from public.roles where name in ('foreman', 'sub') order by name $$,
  $$ values ('foreman'::text, '{board,calendar,dailies,safety,inspections,deliveries}'::text[]),
            ('sub', '{board,calendar,inspections,rfis,requirements,files}') $$,
  'rail: Requirements before Files for the sub; the foreman''s rail is as it was (under More)');

-- ---------------------------------------------------------------------------------------------------------------------
-- Deny by default
-- ---------------------------------------------------------------------------------------------------------------------
select col_is_fk('public', 'requirements', 'company_org_id', 'the line''s company is a real company');
select ok(has_column_privilege('authenticated', 'public.requirements', 'company_org_id', 'SELECT')
          and not has_column_privilege('authenticated', 'public.requirements', 'request_key', 'SELECT')
          and not has_table_privilege('authenticated', 'public.requirements', 'INSERT')
          and not has_table_privilege('authenticated', 'public.requirements', 'UPDATE')
          and not has_table_privilege('service_role', 'public.requirements', 'INSERT')
          and not has_table_privilege('service_role', 'public.requirements', 'UPDATE')
          and not has_table_privilege('anon', 'public.requirements', 'SELECT'),
  'table: the company is readable; still no writes but the RPCs, nothing for anon, the save key never handed out');
select ok(not has_function_privilege('anon', 'public.requirement_companies(uuid)', 'EXECUTE')
          and not has_function_privilege('anon', 'public.requirement_evidence_own(uuid, integer, text, uuid)', 'EXECUTE')
          and not has_function_privilege('anon', 'public.requirements_folder_own(uuid)', 'EXECUTE')
          and not has_function_privilege('anon', 'public.requirement_mine(uuid, uuid)', 'EXECUTE')
          and not has_function_privilege('anon', 'public.requirements_list(uuid)', 'EXECUTE')
          and has_function_privilege('authenticated', 'public.requirement_companies(uuid)', 'EXECUTE')
          and has_function_privilege('authenticated', 'public.requirement_evidence_own(uuid, integer, text, uuid)', 'EXECUTE')
          and has_function_privilege('authenticated', 'public.requirements_folder_own(uuid)', 'EXECUTE')
          and has_function_privilege('authenticated', 'public.requirement_mine(uuid, uuid)', 'EXECUTE')
          and has_function_privilege('authenticated', 'public.requirements_list(uuid)', 'EXECUTE'),
  'functions: the new RPCs for people, never anon');
select ok(not has_function_privilege('authenticated', 'public.requirement_own_tasks(uuid, date)', 'EXECUTE')
          and not has_function_privilege('authenticated', 'public.requirement_own_tasks_done(uuid)', 'EXECUTE')
          and not has_function_privilege('authenticated', 'public.requirement_member_companies(uuid)', 'EXECUTE')
          and not has_function_privilege('authenticated', 'public.requirements_folder_make(uuid)', 'EXECUTE')
          and not has_function_privilege('authenticated', 'public.requirements_check(timestamp with time zone)', 'EXECUTE'),
  'functions: the helpers and the reminder are not for people');
select ok(not has_function_privilege('authenticated', 'public.requirements_list_retired_0073(uuid)', 'EXECUTE')
          and not has_function_privilege('service_role', 'public.requirements_list_retired_0073(uuid)', 'EXECUTE')
          and not has_function_privilege('authenticated', 'public.requirement_save_retired_0073(uuid, uuid, integer, uuid, text, text, text, text, text, text, text, text, integer, integer, text, text, date)', 'EXECUTE')
          and not has_function_privilege('service_role', 'public.requirement_save_retired_0073(uuid, uuid, integer, uuid, text, text, text, text, text, text, text, text, integer, integer, text, text, date)', 'EXECUTE'),
  'functions: the old forms of the list and the save are retired (nobody calls them)');
select ok((select prosecdef from pg_proc where oid = 'public.requirement_evidence_own(uuid, integer, text, uuid)'::regprocedure)
          and (select prosecdef from pg_proc where oid = 'public.requirement_mine(uuid, uuid)'::regprocedure)
          and not (select prosecdef from pg_proc where oid = 'public.requirements_list(uuid)'::regprocedure)
          and not (select prosecdef from pg_proc where oid = 'public.requirements_spec_sections(uuid)'::regprocedure),
  'functions: the reads still run as the caller (RLS decides)');
select ok((select qual like '%requirement_mine(project_id, company_org_id)%' and qual like '%has_capability%'
                  and qual !~* '(''sub''|''foreman''|pm\.role)'
             from pg_policies where schemaname = 'public' and tablename = 'requirements'),
  'policy: capabilities and the membership''s company, never a role name');
select is((select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'requirements'), 1,
  'policy: one read rule, no write rule');

-- ---------------------------------------------------------------------------------------------------------------------
-- The companies on the job, and picking one (requirements.manage)
-- ---------------------------------------------------------------------------------------------------------------------
set local role authenticated;
select pg_temp.login(pg_temp.u('pe'));
select results_eq($$ select name from public.requirement_companies('c0000000-0000-0000-0000-000000000611') $$,
  $$ values ('Sample Alpha Drywall'::text), ('Sample Beta Roofing'), ('Sample Own Builders') $$,
  'companies: the companies of the job''s members, by name (not a revoked member''s, a bidder''s, or one not on the job)');
select throws_ok($$ select * from public.requirement_companies('c0000000-0000-0000-0000-000000000612') $$, '42501', 'forbidden',
  'companies: not another company''s job');
select pg_temp.login(pg_temp.u('super'));
select throws_ok($$ select * from public.requirement_companies('c0000000-0000-0000-0000-000000000611') $$, '42501', 'forbidden',
  'companies: a reader does not list them');
select pg_temp.login(pg_temp.u('a1'));
select throws_ok($$ select * from public.requirement_companies('c0000000-0000-0000-0000-000000000611') $$, '42501', 'forbidden',
  'companies: a sub does not list them');

select pg_temp.login(pg_temp.u('pe'));
insert into res values ('alpha', pg_temp.save(null, null, 'Alpha warranty letter', 'b0000000-0000-0000-0000-000000000613', '2027-03-01', 'the drywall sub'));
select results_eq($$ select company_org_id, responsible from pg_temp.row_of(pg_temp.rid('alpha')) $$,
  $$ values ('b0000000-0000-0000-0000-000000000613'::uuid, 'Sample Alpha Drywall'::text) $$,
  'pick: the line carries the company, and the company''s name is the words');
insert into res values ('beta', pg_temp.save(null, null, 'Beta roofing warranty', 'b0000000-0000-0000-0000-000000000614', '2027-03-01'));
insert into res values ('owner', pg_temp.save(null, null, 'Owner notice', null, '2027-03-01', 'Owner'));
select results_eq($$ select company_org_id, responsible from pg_temp.row_of(pg_temp.rid('owner')) $$,
  $$ values (null::uuid, 'Owner'::text) $$, 'pick: no company, the words stay as typed');
-- Words that name a company link nothing by themselves.
insert into res values ('words', pg_temp.save(null, null, 'Alpha in words only', null, '2027-03-01', 'Sample Alpha Drywall'));
select is((pg_temp.row_of(pg_temp.rid('words'))).company_org_id, null, 'pick: matching words alone link nothing (a person picks)');
select throws_ok($$ select pg_temp.save(null, null, 'Sample', 'b0000000-0000-0000-0000-000000000617') $$, '22023',
  'Pick a company on this job.', 'pick: not a company that is not on the job');
select throws_ok($$ select pg_temp.save(null, null, 'Sample', 'b0000000-0000-0000-0000-000000000615') $$, '22023',
  'Pick a company on this job.', 'pick: not the company of a revoked member');
select throws_ok($$ select pg_temp.save(null, null, 'Sample', 'b0000000-0000-0000-0000-000000000616') $$, '22023',
  'Pick a company on this job.', 'pick: not a bidder''s company');
select throws_ok($$ select pg_temp.save(null, null, 'Sample', 'b0000000-0000-0000-0000-000000000613', null, '',
                                         'c0000000-0000-0000-0000-000000000612') $$, '42501', 'forbidden',
  'pick: not on another company''s job');
-- The 17-argument call of 0069 still works (the company is optional).
select lives_ok($$ select public.requirement_save('c0000000-0000-0000-0000-000000000611', null, null, null, 'notice', 'Sample old call',
  '', '', '', '', 'GC', 'yes', null, null, '', '', '2027-03-01') $$, 'save: a call without the company still saves');
insert into res select 'old', jsonb_build_object('id', id) from public.requirements where title = 'Sample old call';
-- A draft from the spec book, given to Alpha before it is kept.
insert into res select 'd', to_jsonb(d) from public.requirements_add_drafts('c0000000-0000-0000-0000-000000000611', 'model-x', null, $$[
    {"kind": "attic_stock", "title": "Alpha draft stock", "spec_section": "09 29 00", "responsible": "Sample Alpha Drywall",
     "required": "yes", "quote": "Furnish extra gypsum board equal to one percent of the amount installed."}]$$::jsonb) d;
insert into res select 'draft', jsonb_build_object('id', id) from public.requirements where title = 'Alpha draft stock';
select is((pg_temp.row_of(pg_temp.rid('draft'))).company_org_id, null, 'drafts: the AI''s words link nothing');
select is((select version from public.requirement_save('c0000000-0000-0000-0000-000000000611', pg_temp.rid('draft'), 1, null,
  'attic_stock', 'Alpha draft stock', '', '09 29 00', '', '', '', 'yes', null, null, '', '', '2027-03-01',
  'b0000000-0000-0000-0000-000000000613')), 2, 'drafts: a manager picks the company on a draft');
-- A removed line of Alpha's.
insert into res values ('gone', pg_temp.save(null, null, 'Alpha removed line', 'b0000000-0000-0000-0000-000000000613', '2027-03-01'));
select ok(public.requirement_remove(pg_temp.rid('gone'), true) > 0, 'a removed line');
-- X's own line for Alpha (Alpha is on X through a2).
select pg_temp.login(pg_temp.u('other'));
insert into res values ('x', pg_temp.save(null, null, 'Alpha line on X', 'b0000000-0000-0000-0000-000000000613', '2027-03-01', '',
  'c0000000-0000-0000-0000-000000000612'));

select pg_temp.login(pg_temp.u('a1'));
select throws_ok($$ select pg_temp.save(null, null, 'Sample', 'b0000000-0000-0000-0000-000000000613') $$, '42501', 'forbidden',
  'save: a sub adds nothing');
select throws_ok(format('select pg_temp.save(%L, 1, %L, %L)', pg_temp.rid('beta'), 'Mine now', 'b0000000-0000-0000-0000-000000000613'),
  '42501', 'forbidden', 'save: a sub cannot take another company''s line');
select throws_ok(format('select pg_temp.save(%L, 1, %L, %L)', pg_temp.rid('alpha'), 'Renamed', 'b0000000-0000-0000-0000-000000000613'),
  '42501', 'forbidden', 'save: a sub does not change his own line either');

-- ---------------------------------------------------------------------------------------------------------------------
-- Who reads: a company its own kept lines, nothing else
-- ---------------------------------------------------------------------------------------------------------------------
select is(pg_temp.seen('a1'), '{"Alpha warranty letter"}'::text[],
  'read: Alpha''s sub reads Alpha''s kept line: not Beta''s, the owner''s, the one that only says Alpha in words, the draft or the removed one');
select is(pg_temp.seen('a2'), '{"Alpha warranty letter"}'::text[], 'read: so does his colleague');
select is(pg_temp.seen('b1'), '{"Beta roofing warranty"}'::text[], 'read: Beta''s sub reads Beta''s line only');
select is(pg_temp.seen('nocompany'), '{}'::text[], 'read: a sub whose membership has no company reads nothing');
select is(pg_temp.seen('requester'), '{}'::text[], 'read: Alpha''s requester reads nothing (no capability)');
select is(pg_temp.seen('viewer'), '{}'::text[], 'read: Alpha''s viewer reads nothing (no capability)');
select is(pg_temp.seen('two'), '{"Beta roofing warranty"}'::text[],
  'read: Beta''s sub who is also a viewer for Alpha reads Beta''s line only (the company of the membership that holds the capability)');
select is(pg_temp.seen('expired'), '{}'::text[], 'read: nothing once access has ended');
select is(pg_temp.seen('revoked'), '{}'::text[], 'read: nothing for a revoked member');
select is(pg_temp.seen('bidder'), '{}'::text[], 'read: nothing for a bidder');
select is(pg_temp.seen('other'), '{}'::text[], 'read: nobody off the job');
select is(pg_temp.seen('a1', 'c0000000-0000-0000-0000-000000000612'), '{}'::text[],
  'read: Alpha''s line on another job is not read by Alpha''s person who is not on that job');
select is(pg_temp.seen('a2', 'c0000000-0000-0000-0000-000000000612'), '{"Alpha line on X"}'::text[], 'read: it is by the one who is');
select is(cardinality(pg_temp.seen('super')), 5, 'read: a reader reads every kept line, as before');
select is(cardinality(pg_temp.seen('pe')), 6, 'read: a manager reads the draft too, as before');
select is(pg_temp.seen('foreman'), pg_temp.seen('a1'), 'read: Alpha''s foreman reads Alpha''s lines and no other company''s');
select pg_temp.login(pg_temp.u('a1'));
select is((select count(*)::int from public.requirements where draft or company_org_id is distinct from 'b0000000-0000-0000-0000-000000000613'),
  0, 'read: no draft and no other company''s row, however the table is asked');
select is((select count(*)::int from public.requirements where source_quote <> ''), 0, 'read: no quote of a line that is not his');
select ok(public.requirement_mine('c0000000-0000-0000-0000-000000000611', 'b0000000-0000-0000-0000-000000000613')
          and not public.requirement_mine('c0000000-0000-0000-0000-000000000611', 'b0000000-0000-0000-0000-000000000614')
          and not public.requirement_mine('c0000000-0000-0000-0000-000000000611', null)
          and not public.requirement_mine('c0000000-0000-0000-0000-000000000612', 'b0000000-0000-0000-0000-000000000613'),
  'mine: his company on his job; not another company, no company, or a job he is not on');

-- Kept: the draft becomes his.
select pg_temp.login(pg_temp.u('pe'));
select is((select version from public.requirement_keep(pg_temp.rid('draft'), 2, true)), 3, 'the manager keeps Alpha''s draft');
select is(pg_temp.seen('a1'), '{"Alpha draft stock","Alpha warranty letter"}'::text[], 'read: a kept line of his company shows');

-- The list function and the counts follow.
select is(pg_temp.listed('a1'), '{"Alpha draft stock","Alpha warranty letter"}'::text[], 'list: his company''s lines only');
select results_eq($$ select distinct mine, draft, company_org_id from public.requirements_list('c0000000-0000-0000-0000-000000000611') $$,
  $$ values (true, false, 'b0000000-0000-0000-0000-000000000613'::uuid) $$, 'list: each marked his, none a draft');
select is((select count(*)::int from public.requirements_list('c0000000-0000-0000-0000-000000000611')), 2,
  'counts: his count holds no other company''s line');
select is(pg_temp.listed('a1', 'c0000000-0000-0000-0000-000000000612'), '{}'::text[], 'list: nothing of a job he is not on');
select is(pg_temp.listed('b1'), '{"Beta roofing warranty"}'::text[], 'list: Beta''s only for Beta');
select is(pg_temp.listed('nocompany'), '{}'::text[], 'list: nothing without a company');
select is(pg_temp.listed('requester'), '{}'::text[], 'list: nothing for the requester');
select is(cardinality(pg_temp.listed('super')), 6, 'list: a reader''s list is whole');
select results_eq($$ select title from public.requirements_list('c0000000-0000-0000-0000-000000000611') where mine order by 1 $$,
  $$ select null::text where false $$, 'list: nothing is "his" for a reader with no company capability');
select pg_temp.login(pg_temp.u('foreman'));
select results_eq($$ select title from public.requirements_list('c0000000-0000-0000-0000-000000000611') where mine order by 1 $$,
  $$ values ('Alpha draft stock'::text), ('Alpha warranty letter') $$, 'list: the foreman reads all; his company''s are marked his');

-- ---------------------------------------------------------------------------------------------------------------------
-- The spec reader and the manager's writes are not theirs
-- ---------------------------------------------------------------------------------------------------------------------
reset role;
insert into public.files (id, org_id, project_id, folder_id, storage_path, original_name, mime, created_by, scan_status,
                          upload_complete, text_status, page_count) values
  ('e0000000-0000-0000-0000-000000000615', 'b0000000-0000-0000-0000-000000000611', 'c0000000-0000-0000-0000-000000000611',
   (select id from public.folders where project_id = 'c0000000-0000-0000-0000-000000000611' and kind = 'specs' limit 1),
   'test/rqo/specs.pdf', 'Sample Spec Book.pdf', 'application/pdf', pg_temp.u('admin'), 'clean', true, 'done', 1);
insert into public.file_pages (file_id, project_id, page_no, text) values
  ('e0000000-0000-0000-0000-000000000615', 'c0000000-0000-0000-0000-000000000611', 1,
   E'SECTION 09 29 00 - GYPSUM BOARD\nPART 1 - GENERAL');
set local role authenticated;
select pg_temp.login(pg_temp.u('pe'));
select is((select count(*)::int from public.requirements_spec_sections('c0000000-0000-0000-0000-000000000611')), 1,
  'spec reader: a manager gets the book''s sections');
select pg_temp.login(pg_temp.u('a1'));
select is_empty($$ select 1 from public.requirements_spec_sections('c0000000-0000-0000-0000-000000000611') $$,
  'spec reader: nothing for a sub');
select throws_ok($$ select public.requirements_add_drafts('c0000000-0000-0000-0000-000000000611', 'model-x', null, '[]'::jsonb) $$,
  '42501', 'forbidden', 'spec reader: a sub adds no drafts');
select pg_temp.login(pg_temp.u('super'));
select is_empty($$ select 1 from public.requirements_spec_sections('c0000000-0000-0000-0000-000000000611') $$,
  'spec reader: managers only (the form is theirs)');

select pg_temp.login(pg_temp.u('a1'));
select throws_ok(format('select public.requirement_set_status(%L, %s, %L)', pg_temp.rid('alpha'), pg_temp.ver('alpha'), 'done'),
  'P0002', 'not_found', 'status: a sub does not set it, not even on his own line');
select throws_ok(format('select public.requirement_set_status(%L, %s, %L)', pg_temp.rid('beta'), pg_temp.ver('beta'), 'done'),
  'P0002', 'not_found', 'status: nor on another company''s');
select throws_ok(format('select public.requirement_keep(%L, %s, false)', pg_temp.rid('draft'), pg_temp.ver('draft')),
  'P0002', 'not_found', 'keep: not his');
select throws_ok(format('select public.requirement_remove(%L, true)', pg_temp.rid('alpha')), 'P0002', 'not_found', 'remove: not his');
select throws_ok(format('select public.requirement_evidence(%L, %s, %L, null)', pg_temp.rid('alpha'), pg_temp.ver('alpha'), 'x'),
  'P0002', 'not_found', 'evidence: the manager''s write is not his');
select throws_ok($$ select public.requirements_folder('c0000000-0000-0000-0000-000000000611') $$, '42501', 'forbidden',
  'folder: the manager''s folder call is not his');
select pg_temp.login(pg_temp.u('foreman'));
select throws_ok(format('select public.requirement_set_status(%L, %s, %L)', pg_temp.rid('alpha'), pg_temp.ver('alpha'), 'done'),
  'P0002', 'not_found', 'status: nor does Alpha''s foreman');

-- ---------------------------------------------------------------------------------------------------------------------
-- The Requirements folder: a company's own people add, never read
-- ---------------------------------------------------------------------------------------------------------------------
select pg_temp.login(pg_temp.u('super'));
select throws_ok($$ select public.requirements_folder_own('c0000000-0000-0000-0000-000000000611') $$, '42501', 'forbidden',
  'folder: not without the capability (a reader)');
select pg_temp.login(pg_temp.u('requester'));
select throws_ok($$ select public.requirements_folder_own('c0000000-0000-0000-0000-000000000611') $$, '42501', 'forbidden',
  'folder: not the requester');
select pg_temp.login(pg_temp.u('a1'));
select throws_ok($$ select public.requirements_folder_own('c0000000-0000-0000-0000-000000000612') $$, '42501', 'forbidden',
  'folder: not on a job he is not on');
insert into res values ('folder', to_jsonb(public.requirements_folder_own('c0000000-0000-0000-0000-000000000611')));
select pg_temp.login(pg_temp.u('pe'));
select is(to_jsonb(public.requirements_folder('c0000000-0000-0000-0000-000000000611')), pg_temp.j('folder'),
  'folder: the same one folder the managers use');
reset role;
select results_eq($$ select capability, can_read, can_write from public.folder_access
                     where folder_id = (pg_temp.j('folder')#>>'{}')::uuid order by capability $$,
  $$ values ('requirements.manage'::text, true, true), ('requirements.read', true, false), ('requirements.read_own', false, true) $$,
  'folder: readers read, managers write, a company''s own people write without reading');
select ok(pg_temp.can_write_as(pg_temp.u('a1'), (pg_temp.j('folder')#>>'{}')::uuid)
          and not pg_temp.can_read_as(pg_temp.u('a1'), (pg_temp.j('folder')#>>'{}')::uuid)
          and not pg_temp.can_write_as(pg_temp.u('requester'), (pg_temp.j('folder')#>>'{}')::uuid)
          and not pg_temp.can_write_as(pg_temp.u('super'), (pg_temp.j('folder')#>>'{}')::uuid)
          and pg_temp.can_read_as(pg_temp.u('super'), (pg_temp.j('folder')#>>'{}')::uuid),
  'folder: a sub adds and does not read; the requester neither; a reader reads, as before');
-- Uploaded files (the rows the uploader makes): a1's letter, a2's photo, the PE's report, and a file on X.
insert into public.files (id, org_id, project_id, folder_id, storage_path, original_name, mime, created_by, scan_status, upload_complete) values
  ('e0000000-0000-0000-0000-000000000611', 'b0000000-0000-0000-0000-000000000611', 'c0000000-0000-0000-0000-000000000611',
   (pg_temp.j('folder')#>>'{}')::uuid, 'test/rqo/letter.pdf', 'Sample warranty letter.pdf', 'application/pdf', pg_temp.u('a1'), 'clean', true),
  ('e0000000-0000-0000-0000-000000000612', 'b0000000-0000-0000-0000-000000000611', 'c0000000-0000-0000-0000-000000000611',
   (pg_temp.j('folder')#>>'{}')::uuid, 'test/rqo/report.pdf', 'Sample GC report.pdf', 'application/pdf', pg_temp.u('pe'), 'clean', true),
  ('e0000000-0000-0000-0000-000000000613', 'b0000000-0000-0000-0000-000000000612', 'c0000000-0000-0000-0000-000000000612',
   (select id from public.folders where project_id = 'c0000000-0000-0000-0000-000000000612' and kind = 'specs' limit 1),
   'test/rqo/x.pdf', 'Other job file.pdf', 'application/pdf', pg_temp.u('other'), 'clean', true),
  ('e0000000-0000-0000-0000-000000000614', 'b0000000-0000-0000-0000-000000000611', 'c0000000-0000-0000-0000-000000000611',
   (pg_temp.j('folder')#>>'{}')::uuid, 'test/rqo/photo.jpg', 'Sample stock photo.jpg', 'image/jpeg', pg_temp.u('a2'), 'clean', true);
set local role authenticated;
select pg_temp.login(pg_temp.u('a1'));
select results_eq($$ select original_name from public.files where folder_id = (pg_temp.j('folder')#>>'{}')::uuid $$,
  $$ values ('Sample warranty letter.pdf'::text) $$, 'folder: he sees the file he added, not the others in it');

-- ---------------------------------------------------------------------------------------------------------------------
-- Evidence on their own line
-- ---------------------------------------------------------------------------------------------------------------------
select throws_ok(format('select public.requirement_evidence_own(%L, 9, %L, null)', pg_temp.rid('alpha'), 'x'), '40001', null,
  'evidence: carries the version');
select throws_ok(format('select public.requirement_evidence_own(%L, %s, %L, %L)', pg_temp.rid('alpha'), pg_temp.ver('alpha'), 'x',
  'e0000000-0000-0000-0000-000000000613'), '22023', 'Pick a file of this job.', 'evidence: not a file of another job');
select throws_ok(format('select public.requirement_evidence_own(%L, %s, %L, %L)', pg_temp.rid('alpha'), pg_temp.ver('alpha'), 'x',
  'e0000000-0000-0000-0000-000000000612'), '22023', 'Pick a file of this job.', 'evidence: not a file he may not see (the folder rule holds)');
select is((select version from public.requirement_evidence_own(pg_temp.rid('alpha'), 1, '  Here is the warranty letter. ',
  'e0000000-0000-0000-0000-000000000611')), 2, 'evidence: a note and his letter on his own line');
select results_eq($$ select evidence_note, evidence_file_name, status from public.requirements_list('c0000000-0000-0000-0000-000000000611')
                     where id = pg_temp.rid('alpha') $$,
  $$ values ('Here is the warranty letter.'::text, 'Sample warranty letter.pdf'::text, 'open'::text) $$,
  'evidence: shown on his list; the status is still the managers''');
select throws_ok(format('select public.requirement_evidence_own(%L, %s, %L, null)', pg_temp.rid('beta'), pg_temp.ver('beta'), 'x'),
  'P0002', 'not_found', 'evidence: not on another company''s line');
select throws_ok(format('select public.requirement_evidence_own(%L, %s, %L, null)', pg_temp.rid('owner'), pg_temp.ver('owner'), 'x'),
  'P0002', 'not_found', 'evidence: not on a line with no company');
select throws_ok(format('select public.requirement_evidence_own(%L, %s, %L, null)', pg_temp.rid('words'), pg_temp.ver('words'), 'x'),
  'P0002', 'not_found', 'evidence: not on a line that only names his company in words');
select throws_ok(format('select public.requirement_evidence_own(%L, %s, %L, null)', pg_temp.rid('gone'), pg_temp.ver('gone'), 'x'),
  'P0002', 'not_found', 'evidence: not on a removed line');
select throws_ok(format('select public.requirement_evidence_own(%L, %s, %L, null)', pg_temp.rid('x'), pg_temp.ver('x'), 'x'),
  'P0002', 'not_found', 'evidence: not on his company''s line on a job he is not on');
select pg_temp.login(pg_temp.u('b1'));
select throws_ok(format('select public.requirement_evidence_own(%L, %s, %L, null)', pg_temp.rid('alpha'), pg_temp.ver('alpha'), 'x'),
  'P0002', 'not_found', 'evidence: Beta''s sub does not find Alpha''s line');
select pg_temp.login(pg_temp.u('requester'));
select throws_ok(format('select public.requirement_evidence_own(%L, %s, %L, null)', pg_temp.rid('alpha'), pg_temp.ver('alpha'), 'x'),
  'P0002', 'not_found', 'evidence: not Alpha''s requester');
select pg_temp.login(pg_temp.u('pe'));
select throws_ok(format('select public.requirement_evidence_own(%L, %s, %L, null)', pg_temp.rid('alpha'), pg_temp.ver('alpha'), 'x'),
  'P0002', 'not_found', 'evidence: a manager uses the manager''s write, not this one');
-- A colleague: the note is the line's; the file stays with the one who added it.
select pg_temp.login(pg_temp.u('a2'));
select results_eq($$ select evidence_file_id, evidence_file_name from public.requirements_list('c0000000-0000-0000-0000-000000000611')
                     where id = pg_temp.rid('alpha') $$,
  $$ values ('e0000000-0000-0000-0000-000000000611'::uuid, null::text) $$,
  'evidence: a colleague sees that a file is on the line, not the file (he did not add it and does not read the folder)');
select throws_ok(format('select public.requirement_evidence_own(%L, 2, %L, null)', pg_temp.rid('alpha'), 'x'), '22023',
  'Someone else added that file.', 'evidence: a colleague does not take the file off');
select throws_ok(format('select public.requirement_evidence_own(%L, 2, %L, %L)', pg_temp.rid('alpha'), 'x',
  'e0000000-0000-0000-0000-000000000614'), '22023', 'Someone else added that file.', 'evidence: nor replace it with his own');
select is((select version from public.requirement_evidence_own(pg_temp.rid('alpha'), 2, 'Letter is attached; original in the mail.',
  'e0000000-0000-0000-0000-000000000611')), 3, 'evidence: he changes the note and leaves the file');
select is((select version from public.requirement_evidence_own(pg_temp.rid('draft'), 3, '', 'e0000000-0000-0000-0000-000000000614')),
  4, 'evidence: his own photo on another line of his company (once it is kept)');
select is((select version from public.requirement_evidence_own(pg_temp.rid('draft'), 4, '', null)), 5, 'evidence: he takes his own file off');
-- The manager's file on Alpha's line stays the manager's.
select pg_temp.login(pg_temp.u('pe'));
select is((select version from public.requirement_evidence(pg_temp.rid('draft'), 5, 'GC report on file.',
  'e0000000-0000-0000-0000-000000000612')), 6, 'the manager attaches a report to Alpha''s line');
select pg_temp.login(pg_temp.u('a1'));
select throws_ok(format('select public.requirement_evidence_own(%L, 6, %L, %L)', pg_temp.rid('draft'), 'x',
  'e0000000-0000-0000-0000-000000000611'), '22023', 'Someone else added that file.', 'evidence: a sub does not replace the manager''s file');
select pg_temp.login(pg_temp.u('foreman'));
select is((select version from public.requirement_evidence_own(pg_temp.rid('draft'), 6, 'Stock is in the custodian''s room.',
  'e0000000-0000-0000-0000-000000000612')), 7, 'evidence: Alpha''s foreman adds a note on Alpha''s line (the file untouched)');
select throws_ok(format('select public.requirement_evidence_own(%L, %s, %L, null)', pg_temp.rid('beta'), pg_temp.ver('beta'), 'x'),
  'P0002', 'not_found', 'evidence: the foreman reads Beta''s line but does not write on it');
-- The managers hear of it once; the subs never see the board line.
reset role;
select results_eq($$ select summary, audience_capability, count(*)::int from public.activity
                      where kind = 'requirements.evidence' and entity_id = pg_temp.rid('alpha') group by 1, 2 $$,
  $$ values ('Evidence added: Alpha warranty letter — Sample Alpha Drywall'::text, 'requirements.manage'::text, 2) $$,
  'evidence: a board line for the managers, one per person an hour at most (a1 and a2 each added)');
set local role authenticated;
select pg_temp.login(pg_temp.u('a1'));
select is((select count(*)::int from public.activity where project_id = 'c0000000-0000-0000-0000-000000000611'), 0,
  'board: the sub sees none of the managers'' lines');
select pg_temp.login(pg_temp.u('pe'));
select is((select count(*)::int from public.activity where kind = 'requirements.evidence'), 4,
  'board: the managers do (two lines, two people each)');

-- ---------------------------------------------------------------------------------------------------------------------
-- The reminder: the line's own company's people get its task; the board line stays the managers'
-- ---------------------------------------------------------------------------------------------------------------------
-- Fresh lines, checked at Monday Oct 5, 2026, 8:00 on the job (15:00 UTC). J's managers: the admin and the PE.
reset role;
update public.requirements set deleted_at = now(), deleted_by = pg_temp.u('admin') where deleted_at is null;
set local role authenticated;
select pg_temp.login(pg_temp.u('pe'));
insert into res values ('ra', pg_temp.save(null, null, 'Alpha letter due', 'b0000000-0000-0000-0000-000000000613', '2026-10-09'));
insert into res values ('rb', pg_temp.save(null, null, 'Beta letter due', 'b0000000-0000-0000-0000-000000000614', '2026-10-08'));
insert into res values ('rn', pg_temp.save(null, null, 'Owner letter due', null, '2026-10-07', 'Owner'));
insert into res values ('rfar', pg_temp.save(null, null, 'Alpha letter later', 'b0000000-0000-0000-0000-000000000613', '2027-06-01'));
reset role;
select pg_temp.login_service();
select is(public.requirements_check('2026-10-05 15:00+00'), 3, 'reminder: the three lines due this week');
select is(public.requirements_check('2026-10-05 16:00+00'), 0, 'reminder: once per due date');
select results_eq(
  $$ select (select k from who where id = t.assignee_user_id), count(*)::int from public.tasks t
      where t.project_id = 'c0000000-0000-0000-0000-000000000611' and t.kind = 'requirements.due' and t.done_at is null
      group by 1 order by 1 $$,
  $$ values ('a1'::text, 1), ('a2', 1), ('admin', 3), ('b1', 1), ('foreman', 1), ('pe', 3), ('two', 1) $$,
  'reminder: the managers get every line as before; each company''s own people get their own line only (not the sub with no company, the requester, the viewer, or the one whose access ended)');
select is(pg_temp.open_tasks(pg_temp.rid('ra'), pg_temp.u('b1')) + pg_temp.open_tasks(pg_temp.rid('rn'), pg_temp.u('a1'))
          + pg_temp.open_tasks(pg_temp.rid('rb'), pg_temp.u('foreman')), 0, 'reminder: nobody gets another company''s line or the owner''s');
select ok(not exists (select 1 from public.activity where project_id = 'c0000000-0000-0000-0000-000000000611'
                       and kind = 'requirements.due' and audience_capability is distinct from 'requirements.manage')
          and not exists (select 1 from public.activity_recipients ar join public.activity a on a.id = ar.activity_id
                           where a.kind = 'requirements.due'),
  'reminder: the board lines are for the managers only, addressed to nobody else');
set local role authenticated;
select pg_temp.login(pg_temp.u('a1'));
select results_eq($$ select title, entity_id from public.tasks where kind = 'requirements.due' $$,
  $$ values ('Get the warranty: Alpha letter due — due Oct 9'::text, pg_temp.rid('ra')) $$, 'reminder: the sub''s task is his own line');
select results_eq($$ select entity_type, n from public.my_tool_counts('c0000000-0000-0000-0000-000000000611') order by 1 $$,
  $$ values ('requirement'::text, 1) $$, 'counts: his badge counts his own line only');
select is((select count(*)::int from public.activity where kind = 'requirements.due'), 0, 'reminder: he sees no board line of it');

-- Moved to another company: the old company's tasks are done, the new company's people get theirs, the managers keep theirs.
select pg_temp.login(pg_temp.u('pe'));
select is(pg_temp.save(pg_temp.rid('rb'), 1, 'Beta letter due', 'b0000000-0000-0000-0000-000000000613', '2026-10-08')->>'version', '2',
  'the manager moves Beta''s line to Alpha');
select is(pg_temp.open_tasks(pg_temp.rid('rb'), pg_temp.u('b1')) + pg_temp.open_tasks(pg_temp.rid('rb'), pg_temp.u('two')), 0,
  'moved: Beta''s people no longer have its task');
select is(pg_temp.open_tasks(pg_temp.rid('rb'), pg_temp.u('a1')) + pg_temp.open_tasks(pg_temp.rid('rb'), pg_temp.u('a2'))
          + pg_temp.open_tasks(pg_temp.rid('rb'), pg_temp.u('foreman')), 3, 'moved: Alpha''s people have it now (it was already reminded)');
select is(pg_temp.open_tasks(pg_temp.rid('rb'), pg_temp.u('pe')) + pg_temp.open_tasks(pg_temp.rid('rb'), pg_temp.u('admin')), 2,
  'moved: the managers'' tasks are untouched');
select is(pg_temp.seen('b1'), '{}'::text[], 'moved: Beta''s sub no longer reads it');
select pg_temp.login(pg_temp.u('pe'));
select is(pg_temp.save(pg_temp.rid('rb'), 2, 'Beta letter due', null, '2026-10-08', 'Owner')->>'version', '3', 'the manager takes the company off');
select is(pg_temp.open_tasks(pg_temp.rid('rb')), 2, 'unlinked: only the managers'' tasks are left');
select is(pg_temp.save(pg_temp.rid('rfar'), 1, 'Alpha letter later', 'b0000000-0000-0000-0000-000000000614', '2027-06-01')->>'version', '2',
  'a line not yet reminded moves to Beta');
select is(pg_temp.open_tasks(pg_temp.rid('rfar')), 0, 'moved: no task before its reminder');

-- Done by the manager: everyone's task for the line is done; the next line's reminder is not doubled.
select ok((select status from public.requirement_set_status(pg_temp.rid('ra'), 1, 'done')) = 'done', 'the manager marks Alpha''s line done');
select is(pg_temp.open_tasks(pg_temp.rid('ra')), 0, 'done: the sub''s task is done with the managers''');
select ok((select status from public.requirement_set_status(pg_temp.rid('ra'), 2, 'open')) = 'open', 'Undo');
reset role;
select pg_temp.login_service();
select is(public.requirements_check('2026-10-05 18:00+00'), 1, 'reminder: after the Undo the next check reminds again');
select is(pg_temp.open_tasks(pg_temp.rid('ra')), 5, 'reminder: one open task each (two managers, Alpha''s three), none doubled');

select * from finish();
rollback;
