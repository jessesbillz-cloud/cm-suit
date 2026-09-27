begin;
select plan(62);
-- SPEC §13.4 corrections log (migration 0026): capabilities, CN numbering (DB-owned, unique, safe to repeat), RLS by
-- corrections.view, mark ready (GC or sub, note, up to 6 photos), ONLY corrections.close sets Corrected / Signed off /
-- Reopened (RPC and table guard), history rows, board lines and inspector tasks, undo, edits.
\ir _helpers.psql

-- ---------------------------------------------------------------------------------------------------------------
-- Seed: one job with a member per role, a second inspector, and another company's job.
-- ---------------------------------------------------------------------------------------------------------------
create temp table who (role text primary key, uid uuid not null);
grant select on who to public;
insert into who (role, uid) values
  ('project_admin',     'a0000000-0000-0000-0000-000000000201'),
  ('estimator',         'a0000000-0000-0000-0000-000000000202'),
  ('pm',                'a0000000-0000-0000-0000-000000000203'),
  ('pe',                'a0000000-0000-0000-0000-000000000204'),
  ('superintendent',    'a0000000-0000-0000-0000-000000000205'),
  ('foreman',           'a0000000-0000-0000-0000-000000000206'),
  ('inspector',         'a0000000-0000-0000-0000-000000000207'),
  ('special_inspector', 'a0000000-0000-0000-0000-000000000208'),
  ('bidder',            'a0000000-0000-0000-0000-000000000209'),
  ('sub',               'a0000000-0000-0000-0000-000000000210'),
  ('architect',         'a0000000-0000-0000-0000-000000000211'),
  ('owner_rep',         'a0000000-0000-0000-0000-000000000212'),
  ('viewer',            'a0000000-0000-0000-0000-000000000213');

select pg_temp.mk_user(uid, 'probe+cn-' || role || '@example.test', 'CN ' || role) from who;
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000214', 'probe+cn-inspector2@example.test', 'CN inspector 2');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000215', 'probe+cn-outsider@example.test', 'CN outsider');

insert into public.orgs (id, name, kind, created_by) values
  ('b0000000-0000-0000-0000-000000000201', 'CN Builders', 'gc', 'a0000000-0000-0000-0000-000000000201'),
  ('b0000000-0000-0000-0000-000000000202', 'CN Other Co', 'gc', 'a0000000-0000-0000-0000-000000000215');
insert into public.projects (id, org_id, name, stage, created_by) values
  ('c0000000-0000-0000-0000-000000000201', 'b0000000-0000-0000-0000-000000000201', 'CN Job', 'construction',
   'a0000000-0000-0000-0000-000000000201'),
  ('c0000000-0000-0000-0000-000000000202', 'b0000000-0000-0000-0000-000000000202', 'CN Other Job', 'construction',
   'a0000000-0000-0000-0000-000000000215');
insert into public.project_members (org_id, project_id, user_id, invite_email, role, status)
select 'b0000000-0000-0000-0000-000000000201', 'c0000000-0000-0000-0000-000000000201', u.id, u.email, m.role, 'active'
  from (select uid, role from who where role <> 'project_admin'
        union all select 'a0000000-0000-0000-0000-000000000214'::uuid, 'inspector') m
  join auth.users u on u.id = m.uid;

-- matrix_is(cap, roles): the set of roles on the job for which has_capability() is true.
create function pg_temp.cn_matrix_is(p_cap text, p_roles text[])
returns text
language sql
as $$
  select results_eq(
    format('select w.role from pg_temp.who w where pg_temp.cap_as(w.uid, %L::uuid, %L) order by 1',
           'c0000000-0000-0000-0000-000000000201', p_cap),
    format('select r from unnest(%L::text[]) as r order by 1', p_roles),
    format('%s: %s', p_cap, array_to_string(p_roles, ', ')));
$$;
grant execute on function pg_temp.cn_matrix_is(text, text[]) to public;

set local role authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- Capabilities (Jesse reviews this matrix).
-- ---------------------------------------------------------------------------------------------------------------
select pg_temp.cn_matrix_is('corrections.view',
  '{project_admin,pm,pe,superintendent,foreman,inspector,special_inspector,sub,architect,owner_rep,viewer}');
select pg_temp.cn_matrix_is('corrections.create', '{project_admin,pm,pe,superintendent,inspector}');
select pg_temp.cn_matrix_is('corrections.mark_ready', '{project_admin,pm,pe,superintendent,foreman,sub}');
select pg_temp.cn_matrix_is('corrections.close', '{inspector}');

-- ---------------------------------------------------------------------------------------------------------------
-- The photo folder: made on first use, subs write, viewers read, bidders nothing.
-- ---------------------------------------------------------------------------------------------------------------
select pg_temp.login('a0000000-0000-0000-0000-000000000210');
select isnt(public.correction_photo_folder('c0000000-0000-0000-0000-000000000201'), null, 'photo folder: a sub gets it');
select is(public.correction_photo_folder('c0000000-0000-0000-0000-000000000201'),
  (select id from public.folders where project_id = 'c0000000-0000-0000-0000-000000000201' and name = 'Corrections'),
  'photo folder: a repeat returns the same folder');
select ok(pg_temp.can_write_as('a0000000-0000-0000-0000-000000000210',
  (select id from public.folders where project_id = 'c0000000-0000-0000-0000-000000000201' and name = 'Corrections')),
  'photo folder: a sub can upload into it');
select ok(pg_temp.can_read_as('a0000000-0000-0000-0000-000000000213',
            (select id from public.folders where project_id = 'c0000000-0000-0000-0000-000000000201' and name = 'Corrections'))
          and not pg_temp.can_write_as('a0000000-0000-0000-0000-000000000213',
            (select id from public.folders where project_id = 'c0000000-0000-0000-0000-000000000201' and name = 'Corrections')),
  'photo folder: a viewer reads, cannot upload');
reset role;
select ok(not pg_temp.can_read_as('a0000000-0000-0000-0000-000000000209',
  (select id from public.folders where project_id = 'c0000000-0000-0000-0000-000000000201' and name = 'Corrections')),
  'photo folder: a bidder cannot read it');
set local role authenticated;
select throws_ok($$ select public.correction_photo_folder('c0000000-0000-0000-0000-000000000201') $$, '42501', null,
  'photo folder: a bidder cannot get it');

-- Seven photos the sub uploaded, and a file on the other company's job.
reset role;
insert into public.files (id, org_id, project_id, folder_id, storage_path, original_name, mime, created_by, upload_complete)
select ('e0000000-0000-0000-0000-00000000020' || i)::uuid, 'b0000000-0000-0000-0000-000000000201',
       'c0000000-0000-0000-0000-000000000201',
       (select id from public.folders where project_id = 'c0000000-0000-0000-0000-000000000201' and name = 'Corrections'),
       'test/cn/photo-' || i, 'photo-' || i || '.jpg', 'image/jpeg', 'a0000000-0000-0000-0000-000000000210', true
  from generate_series(1, 7) i;
insert into public.files (id, org_id, project_id, folder_id, storage_path, original_name, mime, created_by, upload_complete)
values ('e0000000-0000-0000-0000-000000000299', 'b0000000-0000-0000-0000-000000000202', 'c0000000-0000-0000-0000-000000000202',
        (select id from public.folders where project_id = 'c0000000-0000-0000-0000-000000000202' and name = 'Photos'),
        'test/cn/other', 'other.jpg', 'image/jpeg', 'a0000000-0000-0000-0000-000000000215', true);
set local role authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- Numbering: CN numbers come from the database, unique per job, and a repeated create returns the same item.
-- ---------------------------------------------------------------------------------------------------------------
select pg_temp.login('a0000000-0000-0000-0000-000000000207');
select is((public.create_correction('c0000000-0000-0000-0000-000000000201', 'Sample firestop gap at duct', 'req-key-0001',
          p_trade => 'Sample Drywall', p_location => 'Level 2 corridor')).number, 1, 'create: the first item is number 1');
select is((public.create_correction('c0000000-0000-0000-0000-000000000201', 'Sample firestop gap at duct', 'req-key-0001')).id,
  (select id from public.corrections where project_id = 'c0000000-0000-0000-0000-000000000201' and number = 1),
  'create: the same request again returns the same item');
select is((public.create_correction('c0000000-0000-0000-0000-000000000201', 'Sample missing hanger', 'req-key-0002',
          p_spec_tags => array[' 07 84 00 ', '07 84 00', ''])).number, 2, 'create: a new request takes the next number (no gap)');
select is((select spec_tags from public.corrections where project_id = 'c0000000-0000-0000-0000-000000000201' and number = 2),
  '{"07 84 00"}'::text[], 'create: spec tags are trimmed, blanks and repeats dropped');
select results_eq($$ select action, to_status from public.correction_history
                      where correction_id = (select id from public.corrections
                                              where project_id = 'c0000000-0000-0000-0000-000000000201' and number = 1) $$,
  $$ values ('created'::text, 'open'::text) $$, 'history: the create is recorded once');

reset role;
select results_eq($$ select public.correction_label(x) from unnest(array[1, 42, 1000]) x $$,
  $$ values ('CN-001'::text), ('CN-042'::text), ('CN-1000'::text) $$, 'label: CN-001 style, never truncated');
select throws_ok($$ insert into public.corrections (org_id, project_id, number, title, created_by, request_key)
  values ('b0000000-0000-0000-0000-000000000201', 'c0000000-0000-0000-0000-000000000201', 1, 'Duplicate',
          'a0000000-0000-0000-0000-000000000207', 'dup-key-0001') $$, '23505', null, 'numbering: a CN number is unique per job');
set local role authenticated;

select pg_temp.login('a0000000-0000-0000-0000-000000000210');
select isnt_empty($$ select id from public.activity where kind = 'correction.opened' $$,
  'board: a sub (the people who fix) sees the new item line');
select throws_ok($$ select public.create_correction('c0000000-0000-0000-0000-000000000201', 'Sub item', 'req-key-sub1') $$,
  '42501', null, 'create: a sub cannot open a correction');

select pg_temp.login('a0000000-0000-0000-0000-000000000203');
select is((public.create_correction('c0000000-0000-0000-0000-000000000201', 'Sample GC punch item', 'req-key-pm01')).number, 3,
  'create: the PM (GC) can open one');

-- ---------------------------------------------------------------------------------------------------------------
-- RLS: read by corrections.view.
-- ---------------------------------------------------------------------------------------------------------------
select pg_temp.login('a0000000-0000-0000-0000-000000000209');
select is_empty($$ select id from public.corrections $$, 'read: a bidder sees no corrections');
select is_empty($$ select id from public.correction_history $$, 'read: a bidder sees no history');
select pg_temp.login('a0000000-0000-0000-0000-000000000213');
select results_eq($$ select number from public.corrections order by number $$, $$ values (1), (2), (3) $$,
  'read: a viewer sees the log');
select pg_temp.login('a0000000-0000-0000-0000-000000000215');
select is_empty($$ select id from public.corrections $$, 'read: another company''s admin sees nothing');

-- ---------------------------------------------------------------------------------------------------------------
-- Only corrections.close sets Corrected / Signed off / Reopened.
-- ---------------------------------------------------------------------------------------------------------------
select pg_temp.login('a0000000-0000-0000-0000-000000000210');
select throws_ok($$ update public.corrections set status = 'signed_off' where number = 1 $$, '42501', null,
  'close rule: a sub cannot write the status column');
select throws_ok($$ select public.set_correction_status(id, version, 'signed_off') from public.corrections where number = 1 $$,
  '42501', null, 'close rule: a sub cannot sign off');
select throws_ok($$ select public.set_correction_status(id, version, 'corrected') from public.corrections where number = 1 $$,
  '42501', null, 'close rule: a sub cannot mark corrected');
select throws_ok($$ select public.set_correction_status(id, version, 'reopened') from public.corrections where number = 1 $$,
  '42501', null, 'close rule: a sub cannot reopen');
select pg_temp.login('a0000000-0000-0000-0000-000000000203');
select throws_ok($$ select public.set_correction_status(id, version, 'corrected') from public.corrections where number = 1 $$,
  '42501', null, 'close rule: the PM cannot mark corrected');
-- The table guard holds even for a writer with full table rights (a future RPC or function that forgets the check).
select pg_temp.login('a0000000-0000-0000-0000-000000000210');
reset role;
select throws_ok($$ update public.corrections set status = 'corrected', closed_at = now()
                    where project_id = 'c0000000-0000-0000-0000-000000000201' and number = 1 $$,
  '42501', null, 'close rule: the table guard refuses the status without corrections.close');
set local role authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- Mark ready: GC or sub, a note, up to 6 photos. A line and a task for each inspector.
-- ---------------------------------------------------------------------------------------------------------------
select throws_ok($$ select public.set_correction_status(id, version, 'ready', 'Too many',
    array['e0000000-0000-0000-0000-000000000201', 'e0000000-0000-0000-0000-000000000202', 'e0000000-0000-0000-0000-000000000203',
          'e0000000-0000-0000-0000-000000000204', 'e0000000-0000-0000-0000-000000000205', 'e0000000-0000-0000-0000-000000000206',
          'e0000000-0000-0000-0000-000000000207']::uuid[]) from public.corrections where number = 1 $$,
  '22023', 'Up to 6 photos.', 'mark ready: at most 6 photos');
select lives_ok($$ select public.set_correction_status(id, version, 'ready', 'Sealed per sample detail',
    array['e0000000-0000-0000-0000-000000000201', 'e0000000-0000-0000-0000-000000000202']::uuid[])
    from public.corrections where number = 1 $$, 'mark ready: a sub marks it ready with a note and 2 photos');
select is((select status from public.corrections where number = 1), 'ready', 'mark ready: the status is ready');
select results_eq($$ select action, from_status, to_status, note, cardinality(photo_ids) from public.correction_history
                      where action = 'ready' and correction_id = (select id from public.corrections where number = 1) $$,
  $$ values ('ready'::text, 'open'::text, 'ready'::text, 'Sealed per sample detail'::text, 2) $$,
  'history: the ready step with its note and photos');
select throws_ok($$ select public.set_correction_status(id, version, 'ready') from public.corrections where number = 1 $$,
  '22023', null, 'mark ready: not twice');
select throws_ok($$ select public.set_correction_status(id, version, 'ready', '',
    array['e0000000-0000-0000-0000-000000000299']::uuid[]) from public.corrections where number = 3 $$,
  '22023', null, 'mark ready: a photo from another job is refused');

select pg_temp.login('a0000000-0000-0000-0000-000000000206');
select lives_ok($$ select public.set_correction_status(id, version, 'ready') from public.corrections where number = 2 $$,
  'mark ready: a foreman (GC) marks one ready');

select pg_temp.login('a0000000-0000-0000-0000-000000000207');
select isnt_empty($$ select id from public.activity where kind = 'correction.ready' $$, 'board: the inspector sees the ready line');
select results_eq($$ select title from public.tasks where kind = 'correction.reinspect' and entity_id =
                      (select id from public.corrections where number = 1) $$,
  $$ values ('Re-inspect CN-001: Sample firestop gap at duct'::text) $$, 'task: the inspector has a re-inspect task');
select throws_ok($$ select public.set_correction_status(id, version, 'ready') from public.corrections where number = 3 $$,
  '42501', null, 'mark ready: the inspector does not mark ready');
reset role;
select results_eq($$ select assignee_user_id from public.tasks where kind = 'correction.reinspect' and done_at is null
                      and entity_id = (select id from public.corrections
                                        where project_id = 'c0000000-0000-0000-0000-000000000201' and number = 1) order by 1 $$,
  $$ values ('a0000000-0000-0000-0000-000000000207'::uuid), ('a0000000-0000-0000-0000-000000000214'::uuid) $$,
  'task: every inspector on the job gets one');
set local role authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- The inspector decides. Version checked. Tasks close; the creator and the marker hear about it.
-- ---------------------------------------------------------------------------------------------------------------
select throws_ok($$ select public.set_correction_status(id, version - 1, 'signed_off') from public.corrections where number = 1 $$,
  '40001', null, 'decide: a stale version is refused');
select lives_ok($$ select public.set_correction_status(id, version, 'signed_off', 'Verified in the field')
                   from public.corrections where number = 1 $$, 'decide: the inspector signs off');
select ok((select status = 'signed_off' and closed_at is not null from public.corrections where number = 1),
  'decide: signed off, with a date closed');
reset role;
select is_empty($$ select id from public.tasks where kind = 'correction.reinspect' and done_at is null and deleted_at is null
                   and entity_id = (select id from public.corrections
                                     where project_id = 'c0000000-0000-0000-0000-000000000201' and number = 1) $$,
  'decide: the re-inspect tasks are done');
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000210');
select isnt_empty($$ select id from public.activity where kind = 'correction.signed_off' $$,
  'board: the sub who marked it ready sees the sign-off');

select pg_temp.login('a0000000-0000-0000-0000-000000000207');
select lives_ok($$ select public.set_correction_status(id, version, 'reopened', 'Gap at the top track')
                   from public.corrections where number = 1 $$, 'decide: the inspector reopens a signed-off item');
select ok((select status = 'reopened' and closed_at is null from public.corrections where number = 1),
  'decide: reopened clears the date closed');

-- ---------------------------------------------------------------------------------------------------------------
-- Undo: your own latest step only, once.
-- ---------------------------------------------------------------------------------------------------------------
select pg_temp.login('a0000000-0000-0000-0000-000000000210');
select throws_ok($$ select public.undo_correction(id, version) from public.corrections where number = 1 $$,
  '22023', 'Nothing to undo.', 'undo: not someone else''s step');
select pg_temp.login('a0000000-0000-0000-0000-000000000207');
select lives_ok($$ select public.undo_correction(id, version) from public.corrections where number = 1 $$,
  'undo: the inspector undoes the reopen');
select ok((select status = 'signed_off' and closed_at is not null from public.corrections where number = 1),
  'undo: back to signed off with its date closed');
select throws_ok($$ select public.undo_correction(id, version) from public.corrections where number = 1 $$,
  '22023', 'Nothing to undo.', 'undo: only once');
select pg_temp.login('a0000000-0000-0000-0000-000000000206');
select lives_ok($$ select public.undo_correction(id, version) from public.corrections where number = 2 $$,
  'undo: the foreman undoes marking ready');
reset role;
select ok((select status = 'open' from public.corrections where project_id = 'c0000000-0000-0000-0000-000000000201' and number = 2)
          and not exists (select 1 from public.tasks where kind = 'correction.reinspect' and done_at is null and deleted_at is null
                          and entity_id = (select id from public.corrections
                                            where project_id = 'c0000000-0000-0000-0000-000000000201' and number = 2)),
  'undo: back to open, and the inspectors'' tasks are withdrawn');
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000203');
select lives_ok($$ select public.undo_correction(id, version) from public.corrections where number = 3 $$,
  'undo: the PM undoes creating an item');
select pg_temp.login('a0000000-0000-0000-0000-000000000213');
select results_eq($$ select number from public.corrections order by number $$, $$ values (1), (2) $$,
  'undo: the undone item is gone from the log');

-- ---------------------------------------------------------------------------------------------------------------
-- History and edits.
-- ---------------------------------------------------------------------------------------------------------------
select pg_temp.login('a0000000-0000-0000-0000-000000000207');
select results_eq($$ select action from public.correction_history
                      where correction_id = (select id from public.corrections where number = 1) order by seq $$,
  $$ values ('created'::text), ('ready'::text), ('signed_off'::text), ('reopened'::text), ('undone'::text) $$,
  'history: every step of CN-001, in order');
select throws_ok($$ update public.correction_history set note = 'changed' $$, '42501', null, 'history: nobody rewrites it');
select lives_ok($$ update public.corrections set title = 'Sample firestop gap at duct, grid B' where number = 1 $$,
  'edit: the creator (inspector) edits the title');
select pg_temp.login('a0000000-0000-0000-0000-000000000210');
select is_empty($$ update public.corrections set title = 'Changed by sub' where number = 1 returning id $$,
  'edit: a sub cannot edit an item');
select pg_temp.login('a0000000-0000-0000-0000-000000000203');
select is_empty($$ update public.corrections set title = 'Changed by PM' where number = 1 returning id $$,
  'edit: the PM cannot edit the inspector''s item');
select results_eq($$ select action from public.correction_history
                      where correction_id = (select id from public.corrections where number = 1) order by seq desc limit 1 $$,
  $$ values ('edited'::text) $$, 'history: the edit is recorded');

select * from finish();
rollback;
