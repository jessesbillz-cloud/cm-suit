begin;
select plan(65);
-- Migration 0072, each company sets up its daily form's fields: the setup's shape and limits are checked here as in the
-- one zod schema; only the company's own admin saves it (version-checked against the company row), never by updating
-- orgs.settings directly; the company's own fields get their keys from the database (x_<n>, never given twice); everyone
-- on the job reads the company's forms; a signed report keeps the form it was signed on (written only by
-- finish_daily_submit, never replaced once submitted); carryover works by keys, whatever they are called now.
\ir _helpers.psql

-- Users: the company's admin (made the company and the job), the super, a foreman (on the job, not in the company),
-- an outsider, and another company's admin.
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000601', 'probe+ff-admin@example.test', 'Sample FF Admin');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000602', 'probe+ff-super@example.test', 'Sample FF Super');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000603', 'probe+ff-foreman@example.test', 'Sample FF Foreman');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000604', 'probe+ff-out@example.test', 'Sample FF Outsider');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000605', 'probe+ff-other@example.test', 'Sample FF Other Admin');

insert into public.orgs (id, name, kind, created_by, settings) values
  ('b0000000-0000-0000-0000-000000000601', 'Sample FF Builders', 'gc', 'a0000000-0000-0000-0000-000000000601', '{"ai_bid_reading": true}'),
  ('b0000000-0000-0000-0000-000000000602', 'Sample FF Other Co', 'gc', 'a0000000-0000-0000-0000-000000000605', '{}');
insert into public.projects (id, org_id, name, number, timezone, stage, created_by)
values ('c0000000-0000-0000-0000-000000000601', 'b0000000-0000-0000-0000-000000000601', 'Sample FF Job', 'S-601',
        'America/Los_Angeles', 'construction', 'a0000000-0000-0000-0000-000000000601');
insert into public.project_members (org_id, project_id, user_id, invite_email, role, status)
select 'b0000000-0000-0000-0000-000000000601', 'c0000000-0000-0000-0000-000000000601', u::uuid, e, r, 'active'
  from (values ('a0000000-0000-0000-0000-000000000602', 'probe+ff-super@example.test', 'superintendent'),
               ('a0000000-0000-0000-0000-000000000603', 'probe+ff-foreman@example.test', 'foreman')) v(u, e, r);

create temp table t (k text primary key, v uuid);
grant all on t to public;
create function pg_temp.v(p_k text) returns uuid language sql stable as $$ select v from t where k = p_k $$;
-- A small valid setup, and n fields (or columns) of the company's own.
create function pg_temp.std() returns jsonb language sql immutable as $$
  select '{"seq": 0,
           "fields": [{"key": "conditions", "on": true, "label": null, "long": false},
                      {"key": "notes", "on": true, "label": "Remarks", "long": true}],
           "tables": [{"key": "manpower", "on": true, "label": null,
                       "columns": [{"key": "company", "on": true, "label": null},
                                   {"key": "count", "on": false, "label": "Men"}]}]}'::jsonb $$;
create function pg_temp.own(p_n int) returns jsonb language sql immutable as $$
  select jsonb_agg(jsonb_build_object('key', 'x_' || i, 'on', true, 'label', 'Own ' || i) order by i) from generate_series(1, p_n) i $$;
create function pg_temp.with(p_path text[], p_value jsonb, p_seq int default 0) returns jsonb language sql immutable as $$
  select jsonb_set(jsonb_set(pg_temp.std(), '{seq}', to_jsonb(p_seq)), p_path, p_value) $$;
-- The company's stored setup of the superintendent's daily, and its row version.
create function pg_temp.stored() returns jsonb language sql stable as $$
  select settings->'daily_forms'->'gc_daily' from public.orgs where id = 'b0000000-0000-0000-0000-000000000601' $$;
create function pg_temp.org_version() returns int language sql stable as $$
  select version from public.orgs where id = 'b0000000-0000-0000-0000-000000000601' $$;
grant execute on all functions in schema pg_temp to public;

-- ---------------------------------------------------------------------------------------------------------------------
-- 1. Who may call what
-- ---------------------------------------------------------------------------------------------------------------------
select has_column('public', 'daily_reports', 'form', 'a report has a place for the form it was signed on');
select ok((select bool_and(prosecdef) from pg_proc where oid in ('public.save_daily_form(uuid, text, jsonb, int)'::regprocedure,
            'public.add_daily_form_field(uuid, text, jsonb, int, text, boolean, text)'::regprocedure)),
  'the save functions run as their owner (they check the caller themselves)');
select ok(not has_function_privilege('anon', 'public.save_daily_form(uuid, text, jsonb, int)', 'EXECUTE')
          and not has_function_privilege('anon', 'public.add_daily_form_field(uuid, text, jsonb, int, text, boolean, text)', 'EXECUTE'),
  'anon cannot call the save functions');
select ok(has_function_privilege('authenticated', 'public.save_daily_form(uuid, text, jsonb, int)', 'EXECUTE')
          and has_function_privilege('authenticated', 'public.add_daily_form_field(uuid, text, jsonb, int, text, boolean, text)', 'EXECUTE'),
  'signed-in people can (the functions let only the company''s admin through)');
select ok(not has_function_privilege('authenticated', 'public.daily_form_store(uuid, text, jsonb, int, jsonb)', 'EXECUTE')
          and not has_function_privilege('authenticated', 'public.daily_form_setup_problem(jsonb)', 'EXECUTE'),
  'the helpers are not callable by people');
select ok(not has_function_privilege('authenticated', 'public.finish_daily_submit(uuid, int, text, uuid, text, jsonb)', 'EXECUTE')
          and has_function_privilege('service_role', 'public.finish_daily_submit(uuid, int, text, uuid, text, jsonb)', 'EXECUTE'),
  'finish_daily_submit with the form: the server only');
select ok(not has_function_privilege('service_role', 'public.finish_daily_submit_0023(uuid, int, text, uuid, text)', 'EXECUTE')
          and not has_function_privilege('authenticated', 'public.finish_daily_submit_0023(uuid, int, text, uuid, text)', 'EXECUTE'),
  'the finish_daily_submit without the form is retired: nobody calls it');

-- ---------------------------------------------------------------------------------------------------------------------
-- 2. The setup's shape and limits
-- ---------------------------------------------------------------------------------------------------------------------
select is(public.daily_form_setup_problem(pg_temp.std()), null, 'shape: a setup with ticks, names and order is fine');
select is(public.daily_form_setup_problem('[]'), 'The form setup can''t be read', 'shape: not an object');
select is(public.daily_form_setup_problem(pg_temp.std() - 'seq'), 'The form setup can''t be read', 'shape: no key counter');
select is(public.daily_form_setup_problem(jsonb_set(pg_temp.std(), '{seq}', '1.5')), 'The form setup can''t be read', 'shape: a broken key counter');
select is(public.daily_form_setup_problem(pg_temp.with('{tables,0,columns}', '"x"')), 'Too many columns', 'shape: columns must be a list');
select is(public.daily_form_setup_problem(pg_temp.with('{fields,0,key}', '"Bad Key"')), 'A field of the form setup can''t be read', 'shape: a bad key');
select is(public.daily_form_setup_problem(pg_temp.with('{fields,0,on}', '"yes"')), 'A field of the form setup can''t be read', 'shape: a tick is true or false');
select is(public.daily_form_setup_problem(pg_temp.with('{fields,0,label}', to_jsonb(repeat('n', 41)))), 'A field of the form setup can''t be read',
  'limits: a name over 40 characters');
select is(public.daily_form_setup_problem(pg_temp.with('{fields,0,label}', to_jsonb(repeat('n', 40)))), null, 'limits: a name of 40 characters');
select is(public.daily_form_setup_problem(pg_temp.with('{tables,0,columns,0,label}', '""')), 'A field of the form setup can''t be read', 'limits: an empty name');
select is(public.daily_form_setup_problem(pg_temp.with('{tables,0,label}', '" Crew"')), 'A field of the form setup can''t be read', 'limits: a name starts with a letter, not a space');
select is(public.daily_form_setup_problem(pg_temp.with('{fields,1,key}', '"conditions"')), 'A field is listed twice', 'keys: a field listed twice');
select is(public.daily_form_setup_problem(pg_temp.with('{tables,0,columns,1,key}', '"company"')), 'A field is listed twice', 'keys: a column listed twice');
select is(public.daily_form_setup_problem(pg_temp.with('{tables,0,columns,1,key}', '"notes"')), null, 'keys: a column may share a key with a field (other lists)');
select is(public.daily_form_setup_problem(pg_temp.with('{fields}', pg_temp.std()->'fields' || pg_temp.own(1))),
  'An added field needs a name and a key this form gave out', 'own keys: one the form never gave out (seq 0)');
select is(public.daily_form_setup_problem(pg_temp.with('{fields}', pg_temp.std()->'fields' || pg_temp.own(1), 1)), null, 'own keys: one it gave out');
select is(public.daily_form_setup_problem(pg_temp.with('{fields}', pg_temp.std()->'fields' || '[{"key": "x_1", "on": true, "label": null}]', 1)),
  'An added field needs a name and a key this form gave out', 'own keys: an added field needs its name');
select is(public.daily_form_setup_problem(pg_temp.with('{tables,0,key}', '"x_1"', 5)),
  'An added field needs a name and a key this form gave out', 'own keys: a table is never added');
select is(public.daily_form_setup_problem(pg_temp.with('{fields}', pg_temp.std()->'fields' || pg_temp.own(12), 50)), null, 'limits: 12 added fields');
select is(public.daily_form_setup_problem(pg_temp.with('{fields}', pg_temp.std()->'fields' || pg_temp.own(13), 50)), 'Too many added fields', 'limits: 13 added fields');
select is(public.daily_form_setup_problem(pg_temp.with('{tables,0,columns}', pg_temp.std()->'tables'->0->'columns' || pg_temp.own(3), 50)), null, 'limits: 3 added columns');
select is(public.daily_form_setup_problem(pg_temp.with('{tables,0,columns}', pg_temp.std()->'tables'->0->'columns' || pg_temp.own(4), 50)), 'Too many added fields',
  'limits: 4 added columns');
select is(public.daily_form_setup_problem(pg_temp.with('{fields}', (select jsonb_agg(jsonb_build_object('key', 'f' || i, 'on', true)) from generate_series(1, 41) i))),
  'Too many fields', 'limits: 41 fields');
select is(public.daily_form_setup_problem(pg_temp.with('{tables,0,columns,0,on}', 'false')), 'Keep one column on', 'on: a table left on needs a column on');
select is(public.daily_form_setup_problem(jsonb_set(jsonb_set(pg_temp.with('{fields,0,on}', 'false'), '{fields,1,on}', 'false'), '{tables,0,on}', 'false')),
  'Keep one field or table on', 'on: something stays on');

-- ---------------------------------------------------------------------------------------------------------------------
-- 3. Saving: the company's admin only, version-checked, never around the checks
-- ---------------------------------------------------------------------------------------------------------------------
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000602');
select throws_ok($$ select public.save_daily_form('b0000000-0000-0000-0000-000000000601', 'gc_daily', pg_temp.std(), 1) $$, '42501', null,
  'save: the super (on the job, not the company''s admin) is refused');
select pg_temp.login('a0000000-0000-0000-0000-000000000603');
select throws_ok($$ select public.add_daily_form_field('b0000000-0000-0000-0000-000000000601', 'gc_daily', pg_temp.std(), 1, 'Mine') $$, '42501', null,
  'add: the foreman is refused');
select pg_temp.login('a0000000-0000-0000-0000-000000000605');
select throws_ok($$ select public.save_daily_form('b0000000-0000-0000-0000-000000000601', 'gc_daily', pg_temp.std(), 1) $$, '42501', null,
  'save: another company''s admin is refused');

select pg_temp.login('a0000000-0000-0000-0000-000000000601');
select throws_ok($$ select public.save_daily_form('b0000000-0000-0000-0000-000000000601', 'gc_daily', pg_temp.std(), pg_temp.org_version() + 1) $$,
  '40001', null, 'save: only on the version that was read');
select throws_ok($$ select public.save_daily_form('b0000000-0000-0000-0000-000000000601', 'Bad Form', pg_temp.std(), pg_temp.org_version()) $$,
  '22023', null, 'save: a bad form id');
select throws_ok($$ select public.save_daily_form('b0000000-0000-0000-0000-000000000601', 'gc_daily',
                      pg_temp.with('{fields,0,label}', to_jsonb(repeat('n', 41))), pg_temp.org_version()) $$,
  '22023', 'A field of the form setup can''t be read', 'save: the shape is checked');
select is(public.save_daily_form('b0000000-0000-0000-0000-000000000601', 'gc_daily', pg_temp.std(), pg_temp.org_version()),
  jsonb_build_object('version', pg_temp.org_version() + 1, 'setup', pg_temp.std()),
  'save: the admin saves; the answer is the new row version and the setup as stored');
select is(pg_temp.stored(), pg_temp.std(), 'save: stored under the form''s id');
select is((select settings->>'ai_bid_reading' from public.orgs where id = 'b0000000-0000-0000-0000-000000000601'), 'true',
  'save: the company''s other settings stay');
select throws_ok($$ select public.save_daily_form('b0000000-0000-0000-0000-000000000601', 'gc_daily',
                      pg_temp.with('{fields}', pg_temp.std()->'fields' || pg_temp.own(1), 9), pg_temp.org_version()) $$,
  '22023', 'An added field needs a name and a key this form gave out',
  'save: the key counter is the database''s (a counter sent by the caller is not believed)');

-- The company's own fields: keys from the database, never given twice.
select is(public.add_daily_form_field('b0000000-0000-0000-0000-000000000601', 'gc_daily', pg_temp.std(), pg_temp.org_version(), '  Crew size ')
            ->'setup'->'fields'->2,
  '{"key": "x_1", "on": true, "label": "Crew size", "long": false}'::jsonb, 'add: the first own field is x_1, on, its name trimmed');
select is(public.add_daily_form_field('b0000000-0000-0000-0000-000000000601', 'gc_daily', pg_temp.stored(), pg_temp.org_version(), 'Foreman',
                                       false, 'manpower')->'setup'->'tables'->0->'columns'->2,
  '{"key": "x_2", "on": true, "label": "Foreman"}'::jsonb, 'add: a column of the company''s own gets the next key');
select throws_ok($$ select public.add_daily_form_field('b0000000-0000-0000-0000-000000000601', 'gc_daily', pg_temp.stored(), pg_temp.org_version(),
                      'Lot', false, 'no_such_table') $$, '22023', 'That table is not on the form', 'add: only to a table of the setup');
select throws_ok($$ select public.add_daily_form_field('b0000000-0000-0000-0000-000000000601', 'gc_daily', pg_temp.stored(), pg_temp.org_version(),
                      repeat('n', 41)) $$, '22023', null, 'add: a name over 40 characters');
select is((pg_temp.stored()->>'seq')::int, 2, 'add: a refused add gives no key out');
-- Taken off, then another added: the old key is not given again; putting the old one back (Undo) is fine.
select lives_ok($$ select public.save_daily_form('b0000000-0000-0000-0000-000000000601', 'gc_daily',
                     jsonb_set(pg_temp.stored(), '{fields}', (pg_temp.stored()->'fields') - 2), pg_temp.org_version()) $$,
  'own fields: one is taken off by saving the setup without it');
select is(public.add_daily_form_field('b0000000-0000-0000-0000-000000000601', 'gc_daily', pg_temp.stored(), pg_temp.org_version(), 'Owner comments', true)
            ->'setup'->'fields'->2,
  '{"key": "x_3", "on": true, "label": "Owner comments", "long": true}'::jsonb, 'own fields: the next one is x_3, never x_1 again');
select lives_ok($$ select public.save_daily_form('b0000000-0000-0000-0000-000000000601', 'gc_daily',
                     jsonb_set(pg_temp.stored(), '{fields}', (pg_temp.stored()->'fields') || '[{"key": "x_1", "on": true, "label": "Crew size", "long": false}]'),
                     pg_temp.org_version()) $$,
  'own fields: the one taken off comes back under its own key (Undo)');
select is(public.save_daily_form('b0000000-0000-0000-0000-000000000601', 'foreman_daily',
            '{"fields": [{"key": "notes", "on": true}], "tables": []}', pg_temp.org_version())->'setup'->>'seq', '0',
  'forms: each form has its own setup and key counter');
select is((pg_temp.stored()->>'seq')::int, 3, 'forms: saving one leaves the other as it was');

-- orgs.settings is a column admins may update; the daily forms are not changed that way.
select throws_ok($$ update public.orgs set settings = jsonb_set(settings, '{daily_forms,gc_daily,seq}', '99')
                     where id = 'b0000000-0000-0000-0000-000000000601' $$, '42501', null,
  'direct: an admin cannot write the daily forms around the checks');
select lives_ok($$ update public.orgs set settings = settings || '{"ai_bid_reading": false}'
                    where id = 'b0000000-0000-0000-0000-000000000601' $$,
  'direct: the company''s other settings still save as before');
select is((pg_temp.stored()->>'seq')::int, 3, 'direct: and the daily forms came through untouched');

-- Reading: everyone on the job reads the company's forms; nobody else.
select pg_temp.login('a0000000-0000-0000-0000-000000000603');
select is(pg_temp.stored()->'fields'->1->>'label', 'Remarks', 'read: a foreman on the job (not in the company) reads the company''s form');
select pg_temp.login('a0000000-0000-0000-0000-000000000604');
select is(pg_temp.stored(), null, 'read: an outsider reads nothing');
reset role;
select is((select count(*)::int from public.audit_events where action = 'org.daily_form' and entity_id = 'b0000000-0000-0000-0000-000000000601'),
  7, 'audit: every save of a form is on the log');

-- ---------------------------------------------------------------------------------------------------------------------
-- 4. A signed report keeps the form it was signed on
-- ---------------------------------------------------------------------------------------------------------------------
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000602');
select public.choose_daily_form('c0000000-0000-0000-0000-000000000601', 'gc_daily',
  '{"label": "Daily Report", "submit_by": "17:00", "schedule_days": [1, 2, 3, 4, 5], "filename_pattern": "Daily Report {#}"}');
insert into t select 'r1', public.create_daily_report('c0000000-0000-0000-0000-000000000601', 'gc_daily', '2026-09-28');
insert into t select 'r2', public.create_daily_report('c0000000-0000-0000-0000-000000000601', 'gc_daily', '2026-09-29');
select public.begin_daily_submit(pg_temp.v('r1'), 1, repeat('a', 64), '');
select public.begin_daily_submit(pg_temp.v('r2'), 1, repeat('a', 64), '');
insert into t values ('reports', public.daily_reports_folder('c0000000-0000-0000-0000-000000000601'));
reset role;
insert into public.files (id, org_id, project_id, folder_id, storage_path, original_name, mime, size, scan_status, text_status,
                          upload_complete, created_by)
select ('e0000000-0000-0000-0000-00000000060' || i)::uuid, 'b0000000-0000-0000-0000-000000000601', 'c0000000-0000-0000-0000-000000000601',
       pg_temp.v('reports'), 'probe/ff/' || i || '.pdf', 'Daily Report ' || i || '.pdf', 'application/pdf', 10, 'clean', 'none', true,
       'a0000000-0000-0000-0000-000000000602'
  from generate_series(1, 4) i;

set local role service_role;
select pg_temp.login_service();
select throws_ok($$ select public.finish_daily_submit(pg_temp.v('r1'), 2, repeat('a', 64), 'e0000000-0000-0000-0000-000000000601', 'x.pdf', '[1]') $$,
  '22023', null, 'finish: the form is an object');
select is((public.finish_daily_submit(pg_temp.v('r1'), 2, repeat('a', 64), 'e0000000-0000-0000-0000-000000000601', 'x.pdf',
            '{"daily": [{"key": "notes", "label": "Remarks", "max": 20000, "multiline": true}], "tables": []}')).form->'daily'->0->>'label',
  'Remarks', 'finish: the first signing records the form the report was signed on');
-- Signed before 0072 (or a fixed form): no form recorded.
select is((public.finish_daily_submit(pg_temp.v('r2'), 2, repeat('a', 64), 'e0000000-0000-0000-0000-000000000602', 'y.pdf')).form, null,
  'finish: without a form (the work log, the VIS form) none is recorded');

-- The company changes its form; both reports are updated and resubmitted.
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000602');
select public.save_daily_content(pg_temp.v('r1'), 3, '{"fields": {"notes": "Changed"}}');
select public.begin_daily_submit(pg_temp.v('r1'), 4, repeat('b', 64), '');
select public.begin_daily_submit(pg_temp.v('r2'), 3, repeat('b', 64), '');
set local role service_role;
select pg_temp.login_service();
select is((public.finish_daily_submit(pg_temp.v('r1'), 5, repeat('b', 64), 'e0000000-0000-0000-0000-000000000603', 'x.pdf',
            '{"daily": [{"key": "notes", "label": "Renamed since", "max": 20000, "multiline": true}], "tables": []}')).form->'daily'->0->>'label',
  'Remarks', 'resubmit: a submitted report keeps the form it was signed on, whatever is sent later');
select is((public.finish_daily_submit(pg_temp.v('r2'), 4, repeat('b', 64), 'e0000000-0000-0000-0000-000000000604', 'y.pdf',
            '{"daily": [{"key": "notes", "label": "Notes", "max": 20000, "multiline": true}], "tables": []}')).form->'daily'->0->>'label',
  'Notes', 'resubmit: a report signed before forms could be set up records its form now');
reset role;
select is((select array_agg(status order by report_date) from public.daily_reports where id in (pg_temp.v('r1'), pg_temp.v('r2'))),
  array['submitted', 'submitted'], 'both reports are submitted as before');

-- Carryover works by keys: an own column's cell comes back, a renamed count or hours column is still cleared.
select is(public.daily_carryover(
  '{"tables": {"manpower": [{"key": "m1", "ref": null, "carry": true,
                             "cells": {"company": "Sample Framing", "x_2": "Sample Foreman", "count": "4", "hours": "32"}}]}}'::jsonb) -> 'tables',
  '{"manpower": [{"key": "m1", "ref": null, "carry": true, "cells": {"company": "Sample Framing", "x_2": "Sample Foreman"}}]}'::jsonb,
  'carryover: by key, with the company''s own column');

select * from finish();
rollback;
