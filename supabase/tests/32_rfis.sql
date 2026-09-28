begin;
select plan(189);
-- RFIs (migration 0038): the module and rail, route settings, the RFIs folder, drafts (p_key repeats, versions),
-- visibility per role (sub originator, inspector reviewer on the route, super reviewer later, PE issuer, architect from
-- 'open', another sub only once answered), draft -> send -> forward -> send back -> send -> forward -> issue (numbers
-- 1 and 2) -> answer -> impact claim inside the window, refused after it -> GC note -> close; void; signing refused
-- without a fresh sign-in; rfi_detail's first open; rfi_waiting's reasons; tasks and board lines on every move; the
-- calendar line; RFI-scoped downloads; the PDF record; the company logo.
\ir _helpers.psql

-- ---------------------------------------------------------------------------------------------------------------
-- Seed: a GC job under construction (and one still bidding), two subs from two companies, an inspector, a super, a PE,
-- an architect, a bidder; and someone from another company.
-- ---------------------------------------------------------------------------------------------------------------
create temp table ids (k text primary key, v uuid);
grant all on ids to public;
create function pg_temp.rid(p_k text) returns uuid language sql stable as $$ select v from ids where k = p_k $$;
create function pg_temp.ver(p_k text) returns int language sql stable security definer as $$
  select r.version from public.rfis r where r.id = (select v from ids where k = p_k) $$;
create function pg_temp.col(p_k text, p_col text) returns text language plpgsql stable security definer as $$
declare v text;
begin
  execute format('select %I::text from public.rfis where id = $1', p_col) into v using (select ids.v from ids where k = p_k);
  return v;
end $$;
-- Does this person see the RFI (RLS)? Leaves them logged in.
create function pg_temp.sees(p_uid uuid, p_k text) returns boolean language plpgsql as $$
begin
  perform pg_temp.login(p_uid);
  return exists (select 1 from public.rfis where id = (select v from ids where k = p_k));
end $$;
create function pg_temp.open_tasks(p_k text, p_uid uuid) returns int language sql stable security definer as $$
  select count(*)::int from public.tasks
   where entity_type = 'rfi' and entity_id = (select v from ids where k = p_k) and assignee_user_id = p_uid
     and done_at is null and deleted_at is null $$;
create function pg_temp.events(p_k text, p_kind text) returns int language sql stable security definer as $$
  select count(*)::int from public.rfi_events where rfi_id = (select v from ids where k = p_k) and kind = p_kind $$;
create function pg_temp.acts(p_k text, p_kind text) returns int language sql stable security definer as $$
  select count(*)::int from public.activity where entity_type = 'rfi' and entity_id = (select v from ids where k = p_k)
     and kind = p_kind $$;
grant execute on function pg_temp.rid(text), pg_temp.ver(text), pg_temp.col(text, text), pg_temp.sees(uuid, text),
  pg_temp.open_tasks(text, uuid), pg_temp.events(text, text), pg_temp.acts(text, text) to public;

select pg_temp.mk_user('a0000000-0000-0000-0000-000000000321', 'probe+rfi-admin@example.test', 'Ada Admin');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000322', 'probe+rfi-sub@example.test', 'Sam Sub');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000323', 'probe+rfi-sub2@example.test', 'Sue Sub');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000324', 'probe+rfi-insp@example.test', 'Ivy Inspector');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000325', 'probe+rfi-super@example.test', 'Stu Super');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000326', 'probe+rfi-pe@example.test', 'Pat Engineer');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000327', 'probe+rfi-arch@example.test', 'Ann Architect');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000328', 'probe+rfi-bidder@example.test', 'Bo Bidder');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000329', 'probe+rfi-other@example.test', 'Oz Other');

insert into public.orgs (id, name, kind, created_by) values
  ('b0000000-0000-0000-0000-000000000321', 'Sample Builders', 'gc', 'a0000000-0000-0000-0000-000000000321'),
  ('b0000000-0000-0000-0000-000000000322', 'Sample Concrete Co', 'sub', 'a0000000-0000-0000-0000-000000000322'),
  ('b0000000-0000-0000-0000-000000000323', 'Sample Steel Co', 'sub', 'a0000000-0000-0000-0000-000000000323'),
  ('b0000000-0000-0000-0000-000000000324', 'Other Builders', 'gc', 'a0000000-0000-0000-0000-000000000329');
insert into public.projects (id, org_id, name, stage, timezone, created_by) values
  ('c0000000-0000-0000-0000-000000000321', 'b0000000-0000-0000-0000-000000000321', 'RFI Job', 'construction',
   'America/Los_Angeles', 'a0000000-0000-0000-0000-000000000321'),
  ('c0000000-0000-0000-0000-000000000322', 'b0000000-0000-0000-0000-000000000321', 'RFI Bid Job', 'bidding',
   'America/Los_Angeles', 'a0000000-0000-0000-0000-000000000321');
insert into public.project_members (org_id, project_id, user_id, invite_email, member_org_id, role, status)
select 'b0000000-0000-0000-0000-000000000321', 'c0000000-0000-0000-0000-000000000321', u, e, o, r, 'active'
  from (values
    ('a0000000-0000-0000-0000-000000000322'::uuid, 'probe+rfi-sub@example.test', 'b0000000-0000-0000-0000-000000000322'::uuid, 'sub'),
    ('a0000000-0000-0000-0000-000000000323', 'probe+rfi-sub2@example.test', 'b0000000-0000-0000-0000-000000000323', 'sub'),
    ('a0000000-0000-0000-0000-000000000324', 'probe+rfi-insp@example.test', null, 'inspector'),
    ('a0000000-0000-0000-0000-000000000325', 'probe+rfi-super@example.test', 'b0000000-0000-0000-0000-000000000321', 'superintendent'),
    ('a0000000-0000-0000-0000-000000000326', 'probe+rfi-pe@example.test', 'b0000000-0000-0000-0000-000000000321', 'pe'),
    ('a0000000-0000-0000-0000-000000000327', 'probe+rfi-arch@example.test', null, 'architect'),
    ('a0000000-0000-0000-0000-000000000328', 'probe+rfi-bidder@example.test', null, 'bidder')) v(u, e, o, r);

-- ---------------------------------------------------------------------------------------------------------------
-- The module, the rail, the logo bucket
-- ---------------------------------------------------------------------------------------------------------------
select ok((select 'rfis' = any (modules) from public.projects where id = 'c0000000-0000-0000-0000-000000000321'),
  'module: a job under construction has RFIs');
select ok((select not ('rfis' = any (modules)) from public.projects where id = 'c0000000-0000-0000-0000-000000000322'),
  'module: a job still bidding does not');
select ok((select column_default like '%inspections,rfis,deliveries%' from information_schema.columns
           where table_schema = 'public' and table_name = 'user_layout' and column_name = 'rail_items'),
  'rail: RFIs come right after Inspections');
select results_eq($$ select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'org-logos' $$,
  $$ values (false, 2097152::bigint, array['image/png', 'image/jpeg']) $$, 'org-logos: private, 2 MB, PNG or JPEG');

set local role authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- Route settings
-- ---------------------------------------------------------------------------------------------------------------
select pg_temp.login('a0000000-0000-0000-0000-000000000322');
select is(public.rfi_settings_for('c0000000-0000-0000-0000-000000000321'),
  '{"answer_days": 7, "impact_days": 7, "version": 0, "route": []}'::jsonb, 'settings: a job without a row has the defaults');
select throws_ok($$ select public.rfi_save_settings('c0000000-0000-0000-0000-000000000321', 0, 7, 7, '[]') $$,
  '42501', null, 'settings: a sub cannot save them');
select pg_temp.login('a0000000-0000-0000-0000-000000000328');
select throws_ok($$ select public.rfi_settings_for('c0000000-0000-0000-0000-000000000321') $$, '42501', null,
  'settings: a bidder cannot read them');

select pg_temp.login('a0000000-0000-0000-0000-000000000326');
select throws_ok($$ select public.rfi_save_settings('c0000000-0000-0000-0000-000000000321', 0, 7, 7,
  '[{"role": "inspector", "user_id": "a0000000-0000-0000-0000-000000000325"}]') $$, '22023',
  'Pick a role or a person for each step.', 'settings: a step is a role or a person, not both');
select throws_ok($$ select public.rfi_save_settings('c0000000-0000-0000-0000-000000000321', 0, 7, 7, '[{"role": "bidder"}]') $$,
  '22023', 'Unknown role.', 'settings: a bidder role cannot review');
select throws_ok($$ select public.rfi_save_settings('c0000000-0000-0000-0000-000000000321', 0, 7, 7,
  '[{"user_id": "a0000000-0000-0000-0000-000000000329"}]') $$, '22023', 'That person is not on this job.',
  'settings: only people on the job');
select throws_ok($$ select public.rfi_save_settings('c0000000-0000-0000-0000-000000000321', 0, 7, 7,
  '[{"role": "inspector"}, {"role": "inspector"}]') $$, '22023', 'Each reviewer once.', 'settings: no repeats');
select throws_ok($$ select public.rfi_save_settings('c0000000-0000-0000-0000-000000000321', 0, 0, 7, '[]') $$,
  '22023', 'Answer due is 1 to 60 days.', 'settings: answer days are bounded');
select throws_ok($$ select public.rfi_save_settings('c0000000-0000-0000-0000-000000000321', 0, 7, 7,
  (select jsonb_agg(jsonb_build_object('role', 'inspector')) from generate_series(1, 11))) $$, '22023',
  'Up to 10 reviewers.', 'settings: at most 10 reviewers');
select is(public.rfi_save_settings('c0000000-0000-0000-0000-000000000321', 0, 7, 7,
  '[{"role": "inspector"}, {"user_id": "a0000000-0000-0000-0000-000000000325"}]'),
  '{"answer_days": 7, "impact_days": 7, "version": 1, "route": [
     {"position": 1, "role": "inspector", "user_id": null, "label": "Inspector"},
     {"position": 2, "role": null, "user_id": "a0000000-0000-0000-0000-000000000325", "label": "Stu Super"}]}'::jsonb,
  'settings: the PE saves the route (a role, then a person)');
select throws_ok($$ select public.rfi_save_settings('c0000000-0000-0000-0000-000000000321', 0, 7, 7, '[]') $$,
  '40001', null, 'settings: a stale version is refused');
select is((public.rfi_save_settings('c0000000-0000-0000-0000-000000000321', 1, 7, 7,
  '[{"role": "inspector"}, {"user_id": "a0000000-0000-0000-0000-000000000325"}]')) ->> 'version', '2',
  'settings: saving again moves the version');

-- ---------------------------------------------------------------------------------------------------------------
-- The RFIs folder
-- ---------------------------------------------------------------------------------------------------------------
select pg_temp.login('a0000000-0000-0000-0000-000000000322');
select lives_ok($$ insert into ids values ('F', public.rfi_folder('c0000000-0000-0000-0000-000000000321')) $$,
  'folder: made on first use');
select is(public.rfi_folder('c0000000-0000-0000-0000-000000000321'), pg_temp.rid('F'), 'folder: the same one again');
select results_eq($$ select capability, can_read, can_write from public.folder_access where folder_id = pg_temp.rid('F') order by 1 $$,
  $$ values ('files.read_project'::text, true, false), ('rfi.answer', true, true), ('rfi.create_draft', true, true),
            ('rfi.sign_issue', true, false) $$, 'folder: read and write by capability');
select pg_temp.login('a0000000-0000-0000-0000-000000000328');
select throws_ok($$ select public.rfi_folder('c0000000-0000-0000-0000-000000000321') $$, '42501', null,
  'folder: a bidder cannot open it');
select pg_temp.login('a0000000-0000-0000-0000-000000000321');
select throws_ok($$ insert into public.folders (org_id, project_id, name, created_by) values
  ('b0000000-0000-0000-0000-000000000321', 'c0000000-0000-0000-0000-000000000322', 'RFIs', auth.uid()) $$,
  '23505', null, 'folder: "RFIs" is a system name');
select lives_ok($$ insert into ids select 'X', (public.register_file((select id from public.folders
  where project_id = 'c0000000-0000-0000-0000-000000000321' and kind = 'plans'), 'Sheet A-501.pdf', 'application/pdf', 10)).id $$,
  'seed: a plan sheet in Plans');

-- ---------------------------------------------------------------------------------------------------------------
-- Drafts
-- ---------------------------------------------------------------------------------------------------------------
select pg_temp.login('a0000000-0000-0000-0000-000000000322');
select lives_ok($$ insert into ids select 'P1', (public.register_file(pg_temp.rid('F'), 'crack.jpg', 'image/jpeg', 100)).id $$,
  'sub: a photo in the RFIs folder');
select lives_ok($$ insert into ids select 'A', (public.rfi_create('c0000000-0000-0000-0000-000000000321', 'Slab edge at grid B',
  'Detail 3/S-201 conflicts with the embed plate. Which governs?', array[pg_temp.rid('P1')], p_needed_by => current_date + 5,
  p_time_impact => true, p_key => 'd0000000-0000-0000-0000-000000000321')).id $$, 'sub: starts a draft');
select results_eq($$ select status, number, step, created_by, photo_ids from public.rfis where id = pg_temp.rid('A') $$,
  $$ values ('draft'::text, null::int, 0, 'a0000000-0000-0000-0000-000000000322'::uuid, array[pg_temp.rid('P1')]) $$,
  'draft: no number, with the originator');
select is((public.rfi_create('c0000000-0000-0000-0000-000000000321', 'Other', 'Other',
  p_key => 'd0000000-0000-0000-0000-000000000321')).id, pg_temp.rid('A'), 'draft: the same key again returns the first one');
select throws_ok($$ select public.rfi_create('c0000000-0000-0000-0000-000000000321', 'T', 'Q', array[pg_temp.rid('X')]) $$,
  '22023', 'A photo is missing. Add it again.', 'draft: only my own photos in the RFIs folder');
select throws_ok($$ select public.rfi_create('c0000000-0000-0000-0000-000000000321', '  ', 'Q') $$,
  '22023', 'Add a title.', 'draft: a title is needed');
select is(pg_temp.events('A', 'created'), 1, 'history: created');
select pg_temp.login('a0000000-0000-0000-0000-000000000327');
select throws_ok($$ select public.rfi_create('c0000000-0000-0000-0000-000000000321', 'T', 'Q') $$, '42501', null,
  'draft: the architect cannot start one');
select pg_temp.login('a0000000-0000-0000-0000-000000000321');
select throws_ok($$ select public.rfi_create('c0000000-0000-0000-0000-000000000322', 'T', 'Q') $$, '22023',
  'RFIs are off for this job.', 'draft: not on a job without the RFIs module');
select throws_ok($$ insert into public.rfis (org_id, project_id, title, question, created_by) values
  ('b0000000-0000-0000-0000-000000000321', 'c0000000-0000-0000-0000-000000000321', 'T', 'Q', auth.uid()) $$,
  '42501', null, 'nobody inserts RFIs directly');

-- Who sees a draft: the originator and the PM / PE side.
select ok(pg_temp.sees('a0000000-0000-0000-0000-000000000322', 'A'), 'draft: the originator sees it');
select ok(pg_temp.sees('a0000000-0000-0000-0000-000000000326', 'A'), 'draft: the PE (sign_issue) sees it');
select ok(not pg_temp.sees('a0000000-0000-0000-0000-000000000324', 'A'), 'draft: the inspector does not');
select ok(not pg_temp.sees('a0000000-0000-0000-0000-000000000327', 'A'), 'draft: the architect does not');
select ok(not pg_temp.sees('a0000000-0000-0000-0000-000000000323', 'A'), 'draft: another sub does not');
select ok(not pg_temp.sees('a0000000-0000-0000-0000-000000000328', 'A'), 'draft: a bidder does not');
select pg_temp.login('a0000000-0000-0000-0000-000000000324');
select throws_ok($$ select public.rfi_detail(pg_temp.rid('A')) $$, 'P0002', null, 'draft: detail is not found for the inspector');

-- Saves carry the version.
select pg_temp.login('a0000000-0000-0000-0000-000000000322');
select lives_ok($$ select public.rfi_update(pg_temp.rid('A'), 1, 'Slab edge at grid B', 'Detail 3/S-201 conflicts with the embed plate at B/4. Which governs?',
  array[pg_temp.rid('P1')], '', 'S-201', current_date + 5, null, true) $$, 'draft: the originator edits');
select is(pg_temp.ver('A'), 2, 'draft: the save moved the version');
select throws_ok($$ select public.rfi_update(pg_temp.rid('A'), 1, 'X', 'Y', '{}', '', '', null, null, null) $$,
  '40001', null, 'draft: a stale version is refused');
select is((public.rfi_update(pg_temp.rid('A'), 2, 'Slab edge at grid B', 'Detail 3/S-201 conflicts with the embed plate at B/4. Which governs?',
  array[pg_temp.rid('P1')], '', 'S-201', current_date + 5, null, true)).version, 2, 'draft: an unchanged save keeps the version');
select pg_temp.login('a0000000-0000-0000-0000-000000000324');
select throws_ok($$ select public.rfi_update(pg_temp.rid('A'), 2, 'X', 'Y', '{}', '', '', null, null, null) $$,
  'P0002', null, 'draft: the inspector cannot edit it');
select pg_temp.login('a0000000-0000-0000-0000-000000000322');
select throws_ok($$ update public.rfis set title = 'Hacked' where id = pg_temp.rid('A') $$, '42501', null,
  'nobody updates RFIs directly');

-- ---------------------------------------------------------------------------------------------------------------
-- Signature 1: Sign & send
-- ---------------------------------------------------------------------------------------------------------------
select pg_temp.login_stale('a0000000-0000-0000-0000-000000000322');
select throws_like($$ select public.rfi_sign_send(pg_temp.rid('A'), 2, repeat('a', 64)) $$, 'reauth_required%',
  'send: refused when the session signed in an hour ago');
select pg_temp.login('a0000000-0000-0000-0000-000000000322');
select throws_ok($$ select public.rfi_sign_send(pg_temp.rid('A'), 2, 'nothex') $$, '22023', 'bad content hash',
  'send: needs a real content hash');
select lives_ok($$ select public.rfi_sign_send(pg_temp.rid('A'), 2, repeat('a', 64)) $$, 'send: the originator signs and sends');
select results_eq($$ select status, step, sent_hash, sent_by, held_opened_at from public.rfis where id = pg_temp.rid('A') $$,
  $$ values ('review'::text, 1, repeat('a', 64), 'a0000000-0000-0000-0000-000000000322'::uuid, null::timestamptz) $$,
  'send: with the first reviewer, signature stamped');
select results_eq($$ select position, role, user_id, label from public.rfi_steps where rfi_id = pg_temp.rid('A') order by 1 $$,
  $$ values (1, 'inspector'::text, null::uuid, 'Inspector'::text), (2, null, 'a0000000-0000-0000-0000-000000000325', 'Stu Super') $$,
  'send: the RFI keeps its own copy of the route');
select is(pg_temp.events('A', 'sent'), 1, 'history: sent');
select is(pg_temp.open_tasks('A', 'a0000000-0000-0000-0000-000000000324'), 1, 'send: the inspector has a task');
select is(pg_temp.acts('A', 'rfi.review'), 1, 'send: a board line to the reviewer');
select throws_ok($$ select public.rfi_sign_send(pg_temp.rid('A'), pg_temp.ver('A'), repeat('a', 64)) $$, '22023',
  'This RFI was already sent.', 'send: only a draft');

-- In review at step 1: the inspector sees it; the super (step 2) not yet; the architect and the other sub not.
select ok(pg_temp.sees('a0000000-0000-0000-0000-000000000324', 'A'), 'review: the inspector (step 1) sees it');
select ok(not pg_temp.sees('a0000000-0000-0000-0000-000000000325', 'A'), 'review: the super (step 2) not yet');
select ok(not pg_temp.sees('a0000000-0000-0000-0000-000000000327', 'A'), 'review: the architect does not');
select ok(not pg_temp.sees('a0000000-0000-0000-0000-000000000323', 'A'), 'review: another sub does not');

-- The first open by the holder is recorded, once, without moving the version.
select pg_temp.login('a0000000-0000-0000-0000-000000000324');
select is((public.rfi_detail(pg_temp.rid('A'))) -> 'is_mine_to_act', 'true'::jsonb, 'detail: it is the inspector''s to act on');
select isnt(pg_temp.col('A', 'held_opened_at'), null, 'detail: the holder''s first open is recorded');
select lives_ok($$ select public.rfi_detail(pg_temp.rid('A')) $$, 'detail: opened again');
select is(pg_temp.events('A', 'opened'), 1, 'detail: the open is in the history once');
select is(pg_temp.ver('A'), 3, 'detail: opening does not move the version');
select is((public.rfi_detail(pg_temp.rid('A'))) -> 'can',
  '{"edit": true, "send": false, "forward": true, "send_back": true, "issue": false, "answer": false, "claim_impact": false,
    "close": false, "void": false, "gc_note": false}'::jsonb, 'detail: what the reviewer may do');
select is((select jsonb_agg(jsonb_build_array(x ->> 'label', x ->> 'state')) from jsonb_array_elements(public.rfi_detail(pg_temp.rid('A')) -> 'route') x),
  '[["Originator", "done"], ["Inspector", "current"], ["Stu Super", "next"], ["Issue (PM / PE)", "next"], ["Architect", "next"],
    ["Answered", "next"]]'::jsonb, 'detail: the whole tracker');
select is((public.rfi_detail(pg_temp.rid('A'))) -> 'route' -> 0 ->> 'done_by_name', 'Sam Sub', 'detail: who sent it');
select results_eq($$ select (d ->> 'holder_label'), (d ->> 'originator_name'), (d ->> 'originator_company'), jsonb_array_length(d -> 'photos')
                    from public.rfi_detail(pg_temp.rid('A')) d $$,
  $$ values ('Inspector'::text, 'Sam Sub'::text, 'Sample Concrete Co'::text, 1) $$, 'detail: holder, originator, company, photos');

-- rfi_waiting: nothing while it's opened and not late; "unopened" once a holder leaves it two days.
select pg_temp.login('a0000000-0000-0000-0000-000000000322');
select is_empty($$ select * from public.rfi_waiting() $$, 'waiting: nothing while the holder has opened it');
reset role;
update public.rfis set held_since = now() - interval '3 days', held_opened_at = null where id = pg_temp.rid('A');
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000322');
select results_eq($$ select id, reason, holder_label, project_name from public.rfi_waiting() $$,
  $$ values (pg_temp.rid('A'), 'unopened'::text, 'Inspector'::text, 'RFI Job'::text) $$,
  'waiting: the originator sees nobody opened it in 3 days');
select pg_temp.login('a0000000-0000-0000-0000-000000000326');
select is((select count(*)::int from public.rfi_waiting()), 1, 'waiting: the PE (may issue) sees it too');
select pg_temp.login('a0000000-0000-0000-0000-000000000324');
select is_empty($$ select * from public.rfi_waiting() $$, 'waiting: not for the one holding it');

-- The inspector edits (once in the history per hold) and sends it on.
select lives_ok($$ select public.rfi_update(pg_temp.rid('A'), pg_temp.ver('A'), 'Slab edge at grid B',
  'Detail 3/S-201 conflicts with the embed plate at B/4 (field verified). Which governs?', array[pg_temp.rid('P1')], '', 'S-201',
  current_date + 5, null, true) $$, 'review: the reviewer edits the text');
select lives_ok($$ select public.rfi_update(pg_temp.rid('A'), pg_temp.ver('A'), 'Slab edge at grid B',
  'Detail 3/S-201 conflicts with the embed plate at B/4 (field verified 9/28). Which governs?', array[pg_temp.rid('P1')], '', 'S-201',
  current_date + 5, null, true) $$, 'review: and again');
select is(pg_temp.events('A', 'edited'), 1, 'history: one "edited" line per person per hold');
select lives_ok($$ select public.rfi_forward(pg_temp.rid('A'), pg_temp.ver('A'), 'Looks right') $$, 'review: the inspector sends it on');
select results_eq($$ select status, step from public.rfis where id = pg_temp.rid('A') $$, $$ values ('review'::text, 2) $$,
  'forward: with the super (step 2)');
select is(pg_temp.open_tasks('A', 'a0000000-0000-0000-0000-000000000324'), 0, 'forward: the inspector''s task is done');
select is(pg_temp.open_tasks('A', 'a0000000-0000-0000-0000-000000000325'), 1, 'forward: the super has a task');
select ok(pg_temp.sees('a0000000-0000-0000-0000-000000000325', 'A'), 'review: the super sees it now');
select ok(pg_temp.sees('a0000000-0000-0000-0000-000000000324', 'A'), 'review: the inspector still does (was on the route)');
select ok(not pg_temp.sees('a0000000-0000-0000-0000-000000000323', 'A'), 'review: another sub still does not');

-- Send back: a note is needed; it is a draft again and needs a new signature.
select pg_temp.login('a0000000-0000-0000-0000-000000000325');
select throws_ok($$ select public.rfi_send_back(pg_temp.rid('A'), pg_temp.ver('A'), '  ') $$, '22023',
  'Add a note for the originator.', 'send back: a note is needed');
select lives_ok($$ select public.rfi_send_back(pg_temp.rid('A'), pg_temp.ver('A'), 'Add the grid line') $$,
  'send back: the super returns it');
select pg_temp.login('a0000000-0000-0000-0000-000000000322');
select results_eq($$ select status, step, sent_hash, sent_at from public.rfis where id = pg_temp.rid('A') $$,
  $$ values ('draft'::text, 0, null::text, null::timestamptz) $$, 'send back: a draft again, the signature cleared');
select is((select note from public.rfi_events where rfi_id = pg_temp.rid('A') and kind = 'returned'), 'Add the grid line',
  'history: returned with the note');
select is(pg_temp.open_tasks('A', 'a0000000-0000-0000-0000-000000000322'), 1, 'send back: the originator has a task');
select is(pg_temp.open_tasks('A', 'a0000000-0000-0000-0000-000000000325'), 0, 'send back: the super''s task is done');
select is(pg_temp.acts('A', 'rfi.returned'), 1, 'send back: a board line to the originator');
select ok(not pg_temp.sees('a0000000-0000-0000-0000-000000000324', 'A'), 'send back: reviewers stop seeing a draft');

-- Sent again: from the first reviewer, the RFI's own route; on to the PM / PE.
select pg_temp.login('a0000000-0000-0000-0000-000000000322');
select lives_ok($$ select public.rfi_sign_send(pg_temp.rid('A'), pg_temp.ver('A'), repeat('c', 64)) $$, 'send: signed and sent again');
select results_eq($$ select status, step, (select count(*)::int from public.rfi_steps where rfi_id = pg_temp.rid('A'))
                      from public.rfis where id = pg_temp.rid('A') $$,
  $$ values ('review'::text, 1, 2) $$, 'send: from the first reviewer again');
select is(pg_temp.open_tasks('A', 'a0000000-0000-0000-0000-000000000322'), 0, 'send: the originator''s task is done');
select pg_temp.login('a0000000-0000-0000-0000-000000000324');
select lives_ok($$ select public.rfi_forward(pg_temp.rid('A'), pg_temp.ver('A')) $$, 'review: inspector sends on');
select pg_temp.login('a0000000-0000-0000-0000-000000000325');
select lives_ok($$ select public.rfi_forward(pg_temp.rid('A'), pg_temp.ver('A')) $$, 'review: super sends on');
select results_eq($$ select status, step from public.rfis where id = pg_temp.rid('A') $$, $$ values ('issue'::text, 3) $$,
  'forward: after the last reviewer it waits to be issued');
select throws_ok($$ select public.rfi_send_back(pg_temp.rid('A'), pg_temp.ver('A'), 'x') $$, '42501', null,
  'issue: the super no longer holds it');
select is(pg_temp.open_tasks('A', 'a0000000-0000-0000-0000-000000000326'), 1, 'forward: the PE has a task');
select is(pg_temp.acts('A', 'rfi.to_issue'), 1, 'forward: a board line to the PM / PE');
select ok(not pg_temp.sees('a0000000-0000-0000-0000-000000000327', 'A'), 'issue: the architect does not see it yet');
select pg_temp.login('a0000000-0000-0000-0000-000000000322');
select is((select holder_label from public.rfi_list('c0000000-0000-0000-0000-000000000321') where id = pg_temp.rid('A')), 'PM / PE',
  'log: who has it');

-- ---------------------------------------------------------------------------------------------------------------
-- Signature 2: Sign & issue (number 1)
-- ---------------------------------------------------------------------------------------------------------------
select pg_temp.login_stale('a0000000-0000-0000-0000-000000000326');
select throws_like($$ select public.rfi_sign_issue(pg_temp.rid('A'), pg_temp.ver('A'), repeat('b', 64)) $$, 'reauth_required%',
  'issue: refused when the session signed in an hour ago');
select pg_temp.login('a0000000-0000-0000-0000-000000000325');
select throws_ok($$ select public.rfi_sign_issue(pg_temp.rid('A'), pg_temp.ver('A'), repeat('b', 64)) $$, '42501', null,
  'issue: the super cannot issue');
select pg_temp.login('a0000000-0000-0000-0000-000000000326');
select lives_ok($$ select public.rfi_sign_issue(pg_temp.rid('A'), pg_temp.ver('A'), repeat('b', 64)) $$, 'issue: the PE signs and issues');
select results_eq($$ select status, number, issued_hash, issued_by, due_at = issued_at + interval '7 days' from public.rfis where id = pg_temp.rid('A') $$,
  $$ values ('open'::text, 1, repeat('b', 64), 'a0000000-0000-0000-0000-000000000326'::uuid, true) $$,
  'issue: number 1 from the database, due in 7 days');
select is(pg_temp.events('A', 'issued'), 1, 'history: issued');
select is(pg_temp.open_tasks('A', 'a0000000-0000-0000-0000-000000000326'), 0, 'issue: the PE''s task is done');
select is(pg_temp.acts('A', 'rfi.asked'), 1, 'issue: a board line to the architect');
select throws_ok($$ select public.rfi_update(pg_temp.rid('A'), pg_temp.ver('A'), 'X', 'Y', '{}', '', '', null, null, null) $$,
  '22023', 'This RFI can''t be edited now.', 'issue: the text is fixed once issued');
reset role;
select is((select count(*)::int from public.tasks t join public.rfis r on r.id = t.entity_id
            where t.entity_id = pg_temp.rid('A') and t.assignee_user_id = 'a0000000-0000-0000-0000-000000000327'
              and t.done_at is null and t.due_at = r.due_at and t.title = 'Answer RFI 001: Slab edge at grid B'),
  1, 'issue: the architect has a task, due with the RFI');
select results_eq($$ select kind, read_capability, all_day, status from public.calendar_entries
                     where source_type = 'rfi' and source_id = pg_temp.rid('A') $$,
  $$ values ('my_due'::text, 'rfi.answer'::text, true, 'pending'::text) $$, 'calendar: the answer due day for the architect');
set local role authenticated;
select ok(pg_temp.sees('a0000000-0000-0000-0000-000000000327', 'A'), 'open: the architect sees it');
select ok(not pg_temp.sees('a0000000-0000-0000-0000-000000000323', 'A'), 'open: another sub still does not');

-- Late: the originator's waiting list says so, before anything unopened.
reset role;
update public.rfis set due_at = now() - interval '1 hour' where id = pg_temp.rid('A');
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000322');
select results_eq($$ select id, reason, holder_label from public.rfi_waiting() $$,
  $$ values (pg_temp.rid('A'), 'late'::text, 'Architect'::text) $$, 'waiting: late');

-- A draft the originator voids burns no number; the next issued RFI (from the other sub) is 2.
select lives_ok($$ insert into ids select 'C', (public.rfi_create('c0000000-0000-0000-0000-000000000321', 'Door hardware', 'Which set?')).id $$,
  'sub: another draft');
select lives_ok($$ select public.rfi_void(pg_temp.rid('C'), pg_temp.ver('C'), null) $$, 'void: the originator voids own draft');
select results_eq($$ select status, number from public.rfis where id = pg_temp.rid('C') $$, $$ values ('void'::text, null::int) $$,
  'void: no number used');
select pg_temp.login('a0000000-0000-0000-0000-000000000323');
select lives_ok($$ insert into ids select 'B', (public.rfi_create('c0000000-0000-0000-0000-000000000321', 'Beam pocket size',
  'Beam pocket at C/2 is 2 in short. OK to shim?')).id $$, 'sub 2: a draft');
select lives_ok($$ select public.rfi_sign_send(pg_temp.rid('B'), pg_temp.ver('B'), repeat('d', 64)) $$, 'sub 2: sends');
select pg_temp.login('a0000000-0000-0000-0000-000000000324');
select lives_ok($$ select public.rfi_forward(pg_temp.rid('B'), pg_temp.ver('B')) $$, 'inspector: sends on');
select pg_temp.login('a0000000-0000-0000-0000-000000000325');
select lives_ok($$ select public.rfi_forward(pg_temp.rid('B'), pg_temp.ver('B')) $$, 'super: sends on');
select pg_temp.login('a0000000-0000-0000-0000-000000000326');
select lives_ok($$ select public.rfi_sign_issue(pg_temp.rid('B'), pg_temp.ver('B'), repeat('e', 64)) $$, 'PE: issues');
select is(pg_temp.col('B', 'number'), '2', 'issue: the next RFI is number 2');

-- ---------------------------------------------------------------------------------------------------------------
-- The architect answers
-- ---------------------------------------------------------------------------------------------------------------
select pg_temp.login('a0000000-0000-0000-0000-000000000322');
select throws_ok($$ select public.rfi_answer(pg_temp.rid('A'), pg_temp.ver('A'), 'x') $$, '42501', null, 'answer: a sub cannot answer');
select pg_temp.login('a0000000-0000-0000-0000-000000000327');
select results_eq($$ select (d ->> 'is_mine_to_act')::boolean, (d -> 'can' ->> 'answer')::boolean from public.rfi_detail(pg_temp.rid('A')) d $$,
  $$ values (true, true) $$, 'detail: the architect''s to answer');
select throws_ok($$ select public.rfi_answer(pg_temp.rid('A'), pg_temp.ver('A'), '  ') $$, '22023', 'Add the answer.',
  'answer: text is needed');
select lives_ok($$ insert into ids select 'AF', (public.register_file(pg_temp.rid('F'), 'SK-1.pdf', 'application/pdf', 100)).id $$,
  'architect: a sketch in the RFIs folder');
select lives_ok($$ select public.rfi_answer(pg_temp.rid('A'), pg_temp.ver('A'), 'The embed governs. See SK-1.', array[pg_temp.rid('AF')]) $$,
  'answer: the architect answers');
select results_eq($$ select status, answered_by, impact_until = answered_at + interval '7 days', answer_file_ids from public.rfis where id = pg_temp.rid('A') $$,
  $$ values ('answered'::text, 'a0000000-0000-0000-0000-000000000327'::uuid, true, array[pg_temp.rid('AF')]) $$,
  'answer: back with the originator, the 7-day impact window starts');
select is(pg_temp.open_tasks('A', 'a0000000-0000-0000-0000-000000000327'), 0, 'answer: the architect''s task is done');
select is(pg_temp.acts('A', 'rfi.answered'), 1, 'answer: a board line');
select ok(pg_temp.sees('a0000000-0000-0000-0000-000000000323', 'A'), 'answered: another sub sees it now');
select pg_temp.login('a0000000-0000-0000-0000-000000000322');
select is((public.rfi_detail(pg_temp.rid('A'))) ->> 'answerer_name', 'Ann Architect', 'detail: who answered');
reset role;
select is((select count(*)::int from public.tasks t join public.rfis r on r.id = t.entity_id
            where t.entity_id = pg_temp.rid('A') and t.assignee_user_id = 'a0000000-0000-0000-0000-000000000322'
              and t.done_at is null and t.due_at = r.impact_until), 1, 'answer: the originator has a task, due with the impact window');
select is_empty($$ select 1 from public.calendar_entries where source_type = 'rfi' and source_id = pg_temp.rid('A') $$,
  'calendar: the due line goes once answered');
select throws_ok($$ update public.rfis set answer = 'Changed' where id = pg_temp.rid('A') $$, '42501', 'The answer never changes.',
  'answer: never changes');
set local role authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- Impact claims: the originator's, within the window, permanent; the GC adds a note
-- ---------------------------------------------------------------------------------------------------------------
select pg_temp.login('a0000000-0000-0000-0000-000000000323');
select throws_ok($$ select public.rfi_claim_impact(pg_temp.rid('A'), true, false, null) $$, '42501', null,
  'impact: only the originator claims');
select pg_temp.login('a0000000-0000-0000-0000-000000000322');
select throws_ok($$ select public.rfi_claim_impact(pg_temp.rid('A'), false, false, null) $$, '22023', 'Pick cost, time or both.',
  'impact: cost, time or both');
select results_eq($$ select (d -> 'can' ->> 'claim_impact')::boolean from public.rfi_detail(pg_temp.rid('A')) d $$,
  $$ values (true) $$, 'detail: the originator may claim while the window is open');
select lives_ok($$ select public.rfi_claim_impact(pg_temp.rid('A'), true, false, 'Crew standby 2 days') $$, 'impact: claimed (cost)');
select results_eq($$ select impact_cost, impact_time, impact_note, impact_claimed_at is not null from public.rfis where id = pg_temp.rid('A') $$,
  $$ values (true, false, 'Crew standby 2 days'::text, true) $$, 'impact: stored');
select lives_ok($$ select public.rfi_claim_impact(pg_temp.rid('A'), true, false, 'Crew standby 2 days') $$,
  'impact: the same claim again is fine');
select throws_ok($$ select public.rfi_claim_impact(pg_temp.rid('A'), true, true, null) $$, '22023', 'Impact is already claimed.',
  'impact: a claim is permanent');
select is(pg_temp.acts('A', 'rfi.impact_claimed'), 1, 'impact: PM / PE are told on the board');
select throws_ok($$ select public.rfi_gc_note(pg_temp.rid('A'), 'We disagree') $$, '42501', null, 'GC note: not the sub''s');
reset role;
select throws_ok($$ update public.rfis set impact_cost = false where id = pg_temp.rid('A') $$, '42501', 'An impact claim is permanent.',
  'impact: nobody can take it back, even in the database');
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000326');
select throws_ok($$ select public.rfi_gc_note(pg_temp.rid('B'), 'x') $$, '22023', 'There is no impact claim.',
  'GC note: only on a claim');
select throws_ok($$ select public.rfi_gc_note(pg_temp.rid('A'), ' ') $$, '22023', 'Add the note.', 'GC note: text is needed');
select lives_ok($$ select public.rfi_gc_note(pg_temp.rid('A'), 'Crew was on other work') $$, 'GC note: the PE adds one');
select results_eq($$ select impact_gc_note, impact_cost from public.rfis where id = pg_temp.rid('A') $$,
  $$ values ('Crew was on other work'::text, true) $$, 'GC note: stored, the claim untouched');
select is(pg_temp.events('A', 'impact_note'), 1, 'history: the GC note');

-- After the window: refused.
select pg_temp.login('a0000000-0000-0000-0000-000000000327');
select lives_ok($$ select public.rfi_answer(pg_temp.rid('B'), pg_temp.ver('B'), 'OK to shim with steel plate.') $$, 'architect: answers RFI 2');
reset role;
update public.rfis set impact_until = now() - interval '1 minute' where id = pg_temp.rid('B');
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000323');
select throws_ok($$ select public.rfi_claim_impact(pg_temp.rid('B'), false, true, null) $$, '22023',
  'The window to claim impact has closed.', 'impact: refused after the window');
select results_eq($$ select (d -> 'can' ->> 'claim_impact')::boolean from public.rfi_detail(pg_temp.rid('B')) d $$,
  $$ values (false) $$, 'detail: no claim button after the window');

-- ---------------------------------------------------------------------------------------------------------------
-- Close and void
-- ---------------------------------------------------------------------------------------------------------------
select throws_ok($$ select public.rfi_close(pg_temp.rid('A'), pg_temp.ver('A')) $$, '42501', null, 'close: not another sub');
select pg_temp.login('a0000000-0000-0000-0000-000000000322');
select lives_ok($$ select public.rfi_close(pg_temp.rid('A'), pg_temp.ver('A')) $$, 'close: the originator closes it');
select results_eq($$ select status, closed_by from public.rfis where id = pg_temp.rid('A') $$,
  $$ values ('closed'::text, 'a0000000-0000-0000-0000-000000000322'::uuid) $$, 'close: closed');
select is(pg_temp.open_tasks('A', 'a0000000-0000-0000-0000-000000000322'), 0, 'close: the originator''s task is done');
select is((select jsonb_agg(x ->> 'state') from jsonb_array_elements(public.rfi_detail(pg_temp.rid('A')) -> 'route') x),
  '["done", "done", "done", "done", "done", "done"]'::jsonb, 'detail: every step done');
select throws_ok($$ select public.rfi_void(pg_temp.rid('A'), pg_temp.ver('A'), 'x') $$, '22023', 'This RFI is already closed.',
  'void: not a closed RFI');
select ok(pg_temp.sees('a0000000-0000-0000-0000-000000000323', 'A'), 'closed: another sub still sees it');
select pg_temp.login('a0000000-0000-0000-0000-000000000326');
select throws_ok($$ select public.rfi_void(pg_temp.rid('B'), pg_temp.ver('B'), null) $$, '22023', 'Add a reason.', 'void: the PE gives a reason');
select lives_ok($$ select public.rfi_void(pg_temp.rid('B'), pg_temp.ver('B'), 'Duplicate of a field fix') $$, 'void: the PE voids RFI 2');
select results_eq($$ select status, number, void_note from public.rfis where id = pg_temp.rid('B') $$,
  $$ values ('void'::text, 2, 'Duplicate of a field fix'::text) $$, 'void: the number stays');
select is(pg_temp.open_tasks('B', 'a0000000-0000-0000-0000-000000000323'), 0, 'void: no task left');

-- ---------------------------------------------------------------------------------------------------------------
-- The log per person
-- ---------------------------------------------------------------------------------------------------------------
select pg_temp.login('a0000000-0000-0000-0000-000000000323');
select results_eq($$ select number, status, holder_label from public.rfi_list('c0000000-0000-0000-0000-000000000321') order by number $$,
  $$ values (1, 'closed'::text, ''::text), (2, 'void', '') $$, 'log: another sub sees the answered one and their own');
select pg_temp.login('a0000000-0000-0000-0000-000000000327');
select results_eq($$ select number from public.rfi_list('c0000000-0000-0000-0000-000000000321') $$, $$ values (1) $$,
  'log: the architect sees what was asked of them, not a void one');
select pg_temp.login('a0000000-0000-0000-0000-000000000326');
select is((select count(*)::int from public.rfi_list('c0000000-0000-0000-0000-000000000321')), 3, 'log: the PE sees all three');
select pg_temp.login('a0000000-0000-0000-0000-000000000328');
select is_empty($$ select * from public.rfi_list('c0000000-0000-0000-0000-000000000321') $$, 'log: a bidder sees none');

-- ---------------------------------------------------------------------------------------------------------------
-- Files: RFI-scoped downloads and the PDF record
-- ---------------------------------------------------------------------------------------------------------------
select pg_temp.login('a0000000-0000-0000-0000-000000000327');
select results_eq($$ select original_name from public.rfi_authorize_file(pg_temp.rid('A'), pg_temp.rid('P1')) $$,
  $$ values ('crack.jpg'::text) $$, 'download: the architect opens the RFI''s photo');
select throws_ok($$ select * from public.rfi_authorize_file(pg_temp.rid('A'), pg_temp.rid('X')) $$, '42501', null,
  'download: only the RFI''s own files');
select pg_temp.login('a0000000-0000-0000-0000-000000000322');
select throws_ok($$ select * from public.rfi_authorize_file(pg_temp.rid('A'), pg_temp.rid('AF')) $$, '42501', 'scan_pending',
  'download: a file not yet scanned opens only for its uploader');
select pg_temp.login('a0000000-0000-0000-0000-000000000328');
select throws_ok($$ select * from public.rfi_authorize_file(pg_temp.rid('A'), pg_temp.rid('P1')) $$, 'P0002', null,
  'download: a bidder cannot');
reset role;
select is((select count(*)::int from public.downloads where file_id = pg_temp.rid('P1')), 1, 'download: logged');
insert into public.files (id, org_id, project_id, folder_id, storage_path, original_name, mime, created_by, scan_status, upload_complete)
values ('e0000000-0000-0000-0000-000000000321', 'b0000000-0000-0000-0000-000000000321', 'c0000000-0000-0000-0000-000000000321',
        pg_temp.rid('F'), public.file_storage_path('c0000000-0000-0000-0000-000000000321', pg_temp.rid('F'),
        'e0000000-0000-0000-0000-000000000321', 'RFI 001 Slab edge at grid B.pdf'), 'RFI 001 Slab edge at grid B.pdf',
        'application/pdf', 'a0000000-0000-0000-0000-000000000326', 'clean', true);
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000326');
select throws_ok($$ select public.rfi_attach_pdf(pg_temp.rid('A'), 'e0000000-0000-0000-0000-000000000321', repeat('f', 64)) $$,
  '42501', null, 'pdf: not callable by people (only the rfis function records a server-made PDF)');
reset role;
set local role service_role;
select pg_temp.login_service();
select throws_ok($$ select public.rfi_attach_pdf(pg_temp.rid('A'), pg_temp.rid('X'), repeat('f', 64)) $$, '22023',
  'The PDF is missing.', 'pdf: only a clean PDF in the RFIs folder');
select lives_ok($$ select public.rfi_attach_pdf(pg_temp.rid('A'), 'e0000000-0000-0000-0000-000000000321', repeat('f', 64)) $$,
  'pdf: the rfis function (service) records it');
reset role;
select results_eq($$ select pdf_file_id, pdf_hash from public.rfis where id = pg_temp.rid('A') $$,
  $$ values ('e0000000-0000-0000-0000-000000000321'::uuid, repeat('f', 64)) $$, 'pdf: recorded');
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000323');
select results_eq($$ select original_name from public.rfi_authorize_file(pg_temp.rid('A'), 'e0000000-0000-0000-0000-000000000321') $$,
  $$ values ('RFI 001 Slab edge at grid B.pdf'::text) $$, 'download: anyone who sees the RFI gets its PDF');

-- ---------------------------------------------------------------------------------------------------------------
-- The company logo
-- ---------------------------------------------------------------------------------------------------------------
select pg_temp.login('a0000000-0000-0000-0000-000000000322');
select throws_ok($$ select public.set_org_logo('b0000000-0000-0000-0000-000000000321', 'org/b0000000-0000-0000-0000-000000000321/logo') $$,
  '42501', null, 'logo: only the company''s admins');
select throws_ok($$ insert into storage.objects (bucket_id, name) values ('org-logos', 'org/b0000000-0000-0000-0000-000000000321/logo') $$,
  '42501', null, 'logo: a sub cannot upload for the GC');
select pg_temp.login('a0000000-0000-0000-0000-000000000329');
select throws_ok($$ select public.set_org_logo('b0000000-0000-0000-0000-000000000321', null) $$, '42501', null,
  'logo: not another company''s admin');
select pg_temp.login('a0000000-0000-0000-0000-000000000321');
select throws_ok($$ select public.set_org_logo('b0000000-0000-0000-0000-000000000321', 'org/b0000000-0000-0000-0000-000000000324/logo') $$,
  '22023', 'That logo is not this company''s.', 'logo: the path is the company''s own');
select throws_ok($$ select public.set_org_logo('b0000000-0000-0000-0000-000000000321', 'org/b0000000-0000-0000-0000-000000000321/logo') $$,
  '22023', 'Upload the logo first.', 'logo: the file must be there');
select lives_ok($$ insert into storage.objects (bucket_id, name) values ('org-logos', 'org/b0000000-0000-0000-0000-000000000321/logo') $$,
  'logo: the admin uploads it');
select throws_ok($$ insert into storage.objects (bucket_id, name) values ('org-logos', 'org/b0000000-0000-0000-0000-000000000321/other.png') $$,
  '42501', null, 'logo: only at the one path');
select is((public.set_org_logo('b0000000-0000-0000-0000-000000000321', 'org/b0000000-0000-0000-0000-000000000321/logo')).logo_path,
  'org/b0000000-0000-0000-0000-000000000321/logo', 'logo: set');
select is((select count(*)::int from storage.objects where bucket_id = 'org-logos'), 1, 'logo: the company''s members read it');
select pg_temp.login('a0000000-0000-0000-0000-000000000322');
select is((select count(*)::int from storage.objects where bucket_id = 'org-logos'), 0, 'logo: other companies do not');
select pg_temp.login('a0000000-0000-0000-0000-000000000321');
select is((public.set_org_logo('b0000000-0000-0000-0000-000000000321', null)).logo_path, null, 'logo: removed');

select * from finish();
rollback;
