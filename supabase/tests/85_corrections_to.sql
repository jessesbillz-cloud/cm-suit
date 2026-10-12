begin;
select plan(47);
-- Corrections TO a company on the job (migration 0098): the column, the companies (to pick and to show), a company not
-- on the job refused on create and edit, only the creator or an inspector changes it (as every edit), an edit writes a
-- history line, and the company's people get the item as a to-do while it is theirs to fix (open or reopened).
\ir _helpers.psql

create temp table who (k text primary key, id uuid not null);
create temp table res (k text primary key, id uuid not null);
grant all on who, res to public;
create function pg_temp.u(p_k text) returns uuid language sql stable as $$ select id from who where k = p_k $$;
create function pg_temp.r(p_k text) returns uuid language sql stable as $$ select id from res where k = p_k $$;
-- Read past RLS, whoever is logged in.
create function pg_temp.row_of(p_id uuid) returns public.corrections language sql stable security definer as $$
  select * from public.corrections where id = p_id $$;
create function pg_temp.fix_open(p_id uuid) returns text[] language sql stable security definer as $$
  select coalesce(array_agg(w.k order by w.k), '{}') from public.tasks t join pg_temp.who w on w.id = t.assignee_user_id
   where t.entity_id = p_id and t.kind = 'correction.fix' and t.done_at is null and t.deleted_at is null $$;
create function pg_temp.fix_done(p_id uuid) returns int language sql stable security definer as $$
  select count(*)::int from public.tasks
   where entity_id = p_id and kind = 'correction.fix' and done_at is not null and deleted_at is null $$;
create function pg_temp.fix_title(p_id uuid) returns text language sql stable security definer as $$
  select min(title) from public.tasks
   where entity_id = p_id and kind = 'correction.fix' and done_at is null and deleted_at is null $$;
create function pg_temp.fix_removed(p_id uuid, p_who uuid) returns int language sql stable security definer as $$
  select count(*)::int from public.tasks
   where entity_id = p_id and kind = 'correction.fix' and assignee_user_id = p_who and deleted_at is not null $$;
create function pg_temp.edits(p_id uuid) returns int language sql stable security definer as $$
  select count(*)::int from public.correction_history where correction_id = p_id and action = 'edited' $$;
grant execute on all functions in schema pg_temp to public;

insert into who values
  ('admin', 'a0000000-0000-0000-0000-000000000851'), ('pm', 'a0000000-0000-0000-0000-000000000852'),
  ('insp', 'a0000000-0000-0000-0000-000000000853'), ('s1', 'a0000000-0000-0000-0000-000000000854'),
  ('s2', 'a0000000-0000-0000-0000-000000000855'), ('fm', 'a0000000-0000-0000-0000-000000000856'),
  ('roof', 'a0000000-0000-0000-0000-000000000857'), ('owner', 'a0000000-0000-0000-0000-000000000858'),
  ('expired', 'a0000000-0000-0000-0000-000000000859'), ('bidder', 'a0000000-0000-0000-0000-00000000085a'),
  ('outsider', 'a0000000-0000-0000-0000-00000000085b');
select pg_temp.mk_user(id, 'probe+cnto-' || k || '@example.test', 'Sample ' || k) from who;

insert into public.orgs (id, name, kind, created_by) values
  ('b0000000-0000-0000-0000-000000000851', 'Sample To Builders', 'gc', pg_temp.u('admin')),
  ('b0000000-0000-0000-0000-000000000852', 'Sample NGI', 'sub', pg_temp.u('s1')),
  ('b0000000-0000-0000-0000-000000000853', 'Sample Roofing', 'sub', pg_temp.u('roof')),
  ('b0000000-0000-0000-0000-000000000854', 'Sample Owner', 'owner', pg_temp.u('owner')),
  ('b0000000-0000-0000-0000-000000000855', 'Sample Doors', 'sub', pg_temp.u('bidder')),
  ('b0000000-0000-0000-0000-000000000856', 'Sample Far Away', 'sub', pg_temp.u('outsider'));
insert into public.projects (id, org_id, name, stage, created_by) values
  ('c0000000-0000-0000-0000-000000000851', 'b0000000-0000-0000-0000-000000000851', 'To Job', 'construction', pg_temp.u('admin')),
  ('c0000000-0000-0000-0000-000000000852', 'b0000000-0000-0000-0000-000000000856', 'Far Job', 'construction', pg_temp.u('outsider'));
insert into public.project_members (org_id, project_id, user_id, invite_email, member_org_id, role, status, access_ends_at)
select 'b0000000-0000-0000-0000-000000000851', 'c0000000-0000-0000-0000-000000000851', pg_temp.u(m.k),
       'probe+cnto-' || m.k || '@example.test', m.company, m.role, 'active', m.ends
  from (values
    ('pm', 'b0000000-0000-0000-0000-000000000851'::uuid, 'pm', null::timestamptz),
    ('insp', null, 'inspector', null),
    ('s1', 'b0000000-0000-0000-0000-000000000852', 'sub', null),
    ('s2', 'b0000000-0000-0000-0000-000000000852', 'sub', null),
    ('fm', 'b0000000-0000-0000-0000-000000000852', 'foreman', null),
    ('expired', 'b0000000-0000-0000-0000-000000000852', 'sub', now() - interval '1 day'),
    ('roof', 'b0000000-0000-0000-0000-000000000853', 'sub', null),
    ('owner', 'b0000000-0000-0000-0000-000000000854', 'owner_rep', null),
    ('bidder', 'b0000000-0000-0000-0000-000000000855', 'bidder', null)
  ) m (k, company, role, ends);

-- ---------------------------------------------------------------------------------------------------------------------
-- The column and the functions
-- ---------------------------------------------------------------------------------------------------------------------
select has_column('public', 'corrections', 'company_org_id', 'column: corrections.company_org_id');
select col_is_null('public', 'corrections', 'company_org_id', 'column: optional (an item may go to nobody)');
select hasnt_function('public', 'create_correction', array['uuid', 'text', 'text', 'text', 'text', 'text', 'text[]', 'uuid[]', 'uuid', 'text'],
  'create_correction: the old form is gone (one way to create)');
select ok(not has_function_privilege('anon', 'public.correction_companies(uuid)', 'EXECUTE')
          and not has_function_privilege('authenticated', 'public.correction_fix_tasks(uuid)', 'EXECUTE'),
  'functions: anon cannot list companies, nobody calls the to-do helper');
select ok(not has_function_privilege('anon', 'public.create_correction(uuid, text, text, text, text, text, text[], uuid[], uuid, text, uuid)', 'EXECUTE'),
  'create_correction: closed to anon');

set local role authenticated;

-- ---------------------------------------------------------------------------------------------------------------------
-- The companies: the job's (to pick), to anyone who reads the log
-- ---------------------------------------------------------------------------------------------------------------------
select pg_temp.login(pg_temp.u('owner'));
select results_eq($$ select name, on_job from public.correction_companies('c0000000-0000-0000-0000-000000000851') $$,
  $$ values ('Sample NGI'::text, true), ('Sample Owner', true), ('Sample Roofing', true), ('Sample To Builders', true) $$,
  'companies: the job''s companies, by name (not a bidder''s, not one off the job), to the owner rep');
select pg_temp.login(pg_temp.u('bidder'));
select throws_ok($$ select * from public.correction_companies('c0000000-0000-0000-0000-000000000851') $$, '42501', null,
  'companies: a bidder (no corrections.view) gets nothing');
select pg_temp.login(pg_temp.u('outsider'));
select throws_ok($$ select * from public.correction_companies('c0000000-0000-0000-0000-000000000851') $$, '42501', null,
  'companies: someone off the job gets nothing');

-- ---------------------------------------------------------------------------------------------------------------------
-- Create
-- ---------------------------------------------------------------------------------------------------------------------
select pg_temp.login(pg_temp.u('insp'));
insert into res select 'a', id from public.create_correction('c0000000-0000-0000-0000-000000000851',
  'Submit special inspection report', 'cnto-key-a', p_trade => 'Sample Drywall',
  p_company_org_id => 'b0000000-0000-0000-0000-000000000852');
select is((pg_temp.row_of(pg_temp.r('a'))).company_org_id, 'b0000000-0000-0000-0000-000000000852'::uuid,
  'create: the item goes to the company picked');
select is(pg_temp.fix_open(pg_temp.r('a')), '{fm,s1,s2}'::text[],
  'to-do: each active person of that company gets one (not an ended membership, not another company)');
select is(pg_temp.fix_title(pg_temp.r('a')),
  'CN-001: Submit special inspection report', 'to-do: it reads "CN-001: <title>"');
select is((public.create_correction('c0000000-0000-0000-0000-000000000851', 'Submit special inspection report', 'cnto-key-a',
  p_company_org_id => 'b0000000-0000-0000-0000-000000000852')).id, pg_temp.r('a'), 'create: a repeat returns the same item');
select is(pg_temp.fix_open(pg_temp.r('a')), '{fm,s1,s2}'::text[], 'to-do: a repeat adds no second one');
select throws_ok($$ select public.create_correction('c0000000-0000-0000-0000-000000000851', 'Sample', 'cnto-key-far',
  p_company_org_id => 'b0000000-0000-0000-0000-000000000856') $$, '22023', 'Pick a company on this job.',
  'create: a company not on the job is refused');
select throws_ok($$ select public.create_correction('c0000000-0000-0000-0000-000000000851', 'Sample', 'cnto-key-bid',
  p_company_org_id => 'b0000000-0000-0000-0000-000000000855') $$, '22023', 'Pick a company on this job.',
  'create: a bidder''s company (not on the job yet) is refused');
insert into res select 'none', id from public.create_correction('c0000000-0000-0000-0000-000000000851', 'Sample no one', 'cnto-key-n');
select ok((pg_temp.row_of(pg_temp.r('none'))).company_org_id is null and pg_temp.fix_open(pg_temp.r('none')) = '{}',
  'create: no company is still fine, and nobody gets a to-do');

select pg_temp.login(pg_temp.u('s1'));
select is((select count(*)::int from public.tasks where entity_id = pg_temp.r('a') and kind = 'correction.fix' and done_at is null),
  1, 'to-do: the sub reads his own (Needs you)');
select is((select company_org_id from public.corrections where id = pg_temp.r('a')), 'b0000000-0000-0000-0000-000000000852'::uuid,
  'read: the sub reads who it is to');
select pg_temp.login(pg_temp.u('owner'));
select is((select company_org_id from public.corrections where id = pg_temp.r('a')), 'b0000000-0000-0000-0000-000000000852'::uuid,
  'read: the owner rep reads it too');

-- The creator is not sent his own item: the PM sends one to his own company.
select pg_temp.login(pg_temp.u('pm'));
insert into res select 'own', id from public.create_correction('c0000000-0000-0000-0000-000000000851', 'Sample own crew',
  'cnto-key-own', p_company_org_id => 'b0000000-0000-0000-0000-000000000851');
select is(pg_temp.fix_open(pg_temp.r('own')), '{admin}'::text[], 'to-do: the company''s people, not the person who wrote it');

-- ---------------------------------------------------------------------------------------------------------------------
-- Edit: only the creator or an inspector, a company on the job, a history line
-- ---------------------------------------------------------------------------------------------------------------------
select pg_temp.login(pg_temp.u('pm'));
update public.corrections set company_org_id = 'b0000000-0000-0000-0000-000000000853' where id = pg_temp.r('a');
select is((pg_temp.row_of(pg_temp.r('a'))).company_org_id, 'b0000000-0000-0000-0000-000000000852'::uuid,
  'edit: someone else (not the creator, not an inspector) changes nothing');
select pg_temp.login(pg_temp.u('s1'));
update public.corrections set company_org_id = null where id = pg_temp.r('a');
select is((pg_temp.row_of(pg_temp.r('a'))).company_org_id, 'b0000000-0000-0000-0000-000000000852'::uuid,
  'edit: the sub cannot send it elsewhere');

select pg_temp.login(pg_temp.u('insp'));
select throws_ok($$ update public.corrections set company_org_id = 'b0000000-0000-0000-0000-000000000856' where id = pg_temp.r('a') $$,
  '22023', 'Pick a company on this job.', 'edit: a company not on the job is refused');
select lives_ok($$ update public.corrections set company_org_id = 'b0000000-0000-0000-0000-000000000853'
                    where id = pg_temp.r('a') and version = (pg_temp.row_of(pg_temp.r('a'))).version $$,
  'edit: the creator sends it to another company on the job (with the version)');
select is(pg_temp.edits(pg_temp.r('a')), 1, 'history: the change is an edited line');
select is(pg_temp.fix_open(pg_temp.r('a')), '{roof}'::text[], 'to-do: it moves to the new company''s people');
select is(pg_temp.fix_removed(pg_temp.r('a'), pg_temp.u('s1')), 1,
  'to-do: the old company''s are removed (not marked done)');
select is((select count(*)::int from public.corrections where id = pg_temp.r('a') and version = 1), 0,
  'edit: the version moved on');
update public.corrections set company_org_id = 'b0000000-0000-0000-0000-000000000852' where id = pg_temp.r('a') and version = 1;
select is((pg_temp.row_of(pg_temp.r('a'))).company_org_id, 'b0000000-0000-0000-0000-000000000853'::uuid,
  'edit: a save against an old version changes nothing');

update public.corrections set title = 'Submit the special inspection report' where id = pg_temp.r('a');
select is(pg_temp.fix_title(pg_temp.r('a')), 'CN-001: Submit the special inspection report', 'to-do: follows a new title');
update public.corrections set company_org_id = null where id = pg_temp.r('a');
select is(pg_temp.fix_open(pg_temp.r('a')), '{}'::text[], 'to-do: sent to nobody, nobody has it');
update public.corrections set company_org_id = 'b0000000-0000-0000-0000-000000000852' where id = pg_temp.r('a');
select is(pg_temp.fix_open(pg_temp.r('a')), '{fm,s1,s2}'::text[], 'to-do: back to the company, back to its people');
select is(pg_temp.edits(pg_temp.r('a')), 4, 'history: each edit is a line');

-- ---------------------------------------------------------------------------------------------------------------------
-- The steps: ready or closed ends it, reopened brings it back, undo follows
-- ---------------------------------------------------------------------------------------------------------------------
select pg_temp.login(pg_temp.u('s1'));
select is((public.set_correction_status(pg_temp.r('a'), (pg_temp.row_of(pg_temp.r('a'))).version, 'ready')).status, 'ready',
  'step: the sub marks it ready');
select is(pg_temp.fix_open(pg_temp.r('a')), '{}'::text[], 'to-do: marked ready, it leaves Needs you');
select is(pg_temp.fix_done(pg_temp.r('a')), 3, 'to-do: done, for each of them');
select pg_temp.login(pg_temp.u('insp'));
select is((public.set_correction_status(pg_temp.r('a'), (pg_temp.row_of(pg_temp.r('a'))).version, 'reopened')).status, 'reopened',
  'step: the inspector reopens it');
select is(pg_temp.fix_open(pg_temp.r('a')), '{fm,s1,s2}'::text[], 'to-do: reopened, it is theirs again');
select is((public.set_correction_status(pg_temp.r('a'), (pg_temp.row_of(pg_temp.r('a'))).version, 'signed_off')).status,
  'signed_off', 'step: the inspector signs it off');
select is(pg_temp.fix_open(pg_temp.r('a')), '{}'::text[], 'to-do: closed, it leaves');
select is((public.undo_correction(pg_temp.r('a'), (pg_temp.row_of(pg_temp.r('a'))).version)).status, 'reopened',
  'undo: the sign-off is taken back');
select is(pg_temp.fix_open(pg_temp.r('a')), '{fm,s1,s2}'::text[], 'to-do: back with the status');

insert into res select 'oops', id from public.create_correction('c0000000-0000-0000-0000-000000000851', 'Sample by mistake',
  'cnto-key-oops', p_company_org_id => 'b0000000-0000-0000-0000-000000000853');
select is(pg_temp.fix_open(pg_temp.r('oops')), '{roof}'::text[], 'to-do: a new item to roofing');
select lives_ok($$ select public.undo_correction(pg_temp.r('oops'), 1) $$, 'undo: the create is taken back');
select is(pg_temp.fix_open(pg_temp.r('oops')), '{}'::text[], 'to-do: the removed item takes its to-do along');

-- ---------------------------------------------------------------------------------------------------------------------
-- A company that left the job: its items keep it, still save, and its name still shows
-- ---------------------------------------------------------------------------------------------------------------------
insert into res select 'left', id from public.create_correction('c0000000-0000-0000-0000-000000000851', 'Sample roof',
  'cnto-key-left', p_company_org_id => 'b0000000-0000-0000-0000-000000000853');
reset role;
update public.project_members set status = 'revoked' where user_id = pg_temp.u('roof');
set local role authenticated;
select pg_temp.login(pg_temp.u('insp'));
select lives_ok($$ update public.corrections set title = 'Sample roof edge' where id = pg_temp.r('left') $$,
  'edit: an item whose company left the job still saves');
select results_eq($$ select name, on_job from public.correction_companies('c0000000-0000-0000-0000-000000000851')
                      where name = 'Sample Roofing' $$,
  $$ values ('Sample Roofing'::text, false) $$, 'companies: its name still shows, not to pick');

select * from finish();
rollback;
