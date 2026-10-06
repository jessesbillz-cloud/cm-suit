begin;
select plan(92);
-- Permits (migration 0052): the 'ahj' role and the capability matrix as data, the module and the rail, new permits
-- (the official only; numbers typed and unique per job; p_key repeats), stage moves in order (no skipping to complete,
-- rejected only from submitted, the review loop, cancel from anywhere, issue dates, a repeat is a no-op, versions),
-- Undo, the expiry on the calendar, review cycles and comments (numbers from the database, answers by the design
-- team only, close and reopen), who sees what (subs, bidders and viewers nothing; the caseload across jobs only where
-- I may read), the tracker's days on the job's clock from fixed times (visits added up, undone moves ignored, rejected,
-- cancelled, complete), and linking inspection requests to a permit on the same job.
\ir _helpers.psql

-- A moment on the job's clock: today's date in Los Angeles plus p_days, at p_time there.
create function pg_temp.la(p_days int, p_time time) returns timestamptz language sql stable as $$
  select (((now() at time zone 'America/Los_Angeles')::date + p_days) + p_time) at time zone 'America/Los_Angeles' $$;
grant execute on function pg_temp.la(int, time) to public;

create temp table ids (k text primary key, v uuid);
grant all on ids to public;
create function pg_temp.rid(p_k text) returns uuid language sql stable as $$ select v from ids where k = p_k $$;
create function pg_temp.ver(p_k text) returns int language sql volatile security definer as $$
  select p.version from public.permits p where p.id = (select v from ids where k = p_k) $$;
create function pg_temp.stage(p_k text) returns text language sql volatile security definer as $$
  select p.stage from public.permits p where p.id = (select v from ids where k = p_k) $$;
-- Moves a permit as the logged-in person, with its current version (volatile: each call sees the last move).
create function pg_temp.mv(p_k text, p_stage text) returns text language sql as $$
  select (public.permit_move(pg_temp.rid(p_k), pg_temp.ver(p_k), p_stage)).stage $$;
create function pg_temp.cver(p_k text) returns int language sql volatile security definer as $$
  select c.version from public.permit_comments c where c.id = (select v from ids where k = p_k) $$;
create function pg_temp.rver(p_k text) returns int language sql volatile security definer as $$
  select v.version from public.permit_reviews v where v.id = (select x.v from ids x where x.k = p_k) $$;
-- What a person sees of the permits tables and functions on a job (logs them in).
create function pg_temp.seen(p_uid uuid, p_project uuid) returns int language plpgsql as $$
begin
  perform pg_temp.login(p_uid);
  return (select count(*) from public.permits where project_id = p_project)
       + (select count(*) from public.permit_list(p_project))
       + (select count(*) from public.permit_progress(p_project))
       + (select count(*) from public.permit_reviews where project_id = p_project)
       + (select count(*) from public.permit_comments where project_id = p_project)
       + (select count(*) from public.permit_stage_events where project_id = p_project);
end $$;
grant execute on all functions in schema pg_temp to public;

select pg_temp.mk_user('a0000000-0000-0000-0000-000000000451', 'probe+pt-admin@example.test', 'Ada Admin');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000452', 'probe+pt-ahj@example.test', 'Dana Deputy');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000453', 'probe+pt-ahj2@example.test', 'Drew Deputy');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000454', 'probe+pt-pm@example.test', 'Pat Manager');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000455', 'probe+pt-arch@example.test', 'Ann Architect');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000456', 'probe+pt-sub@example.test', 'Sam Sub');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000457', 'probe+pt-bidder@example.test', 'Bo Bidder');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000458', 'probe+pt-viewer@example.test', 'Vi Viewer');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000459', 'probe+pt-insp@example.test', 'Ivy Inspector');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000450', 'probe+pt-out@example.test', 'Oz Outsider');

insert into public.orgs (id, name, kind, created_by) values
  ('b0000000-0000-0000-0000-000000000451', 'Sample Permit Builders', 'gc', 'a0000000-0000-0000-0000-000000000451');
-- P1 and P2 are being built (permits on); the official is on both. P3: the PM's, not the official's. P4 is bidding.
insert into public.projects (id, org_id, name, stage, timezone, created_by) values
  ('c0000000-0000-0000-0000-000000000451', 'b0000000-0000-0000-0000-000000000451', 'Permit Job 1', 'construction',
   'America/Los_Angeles', 'a0000000-0000-0000-0000-000000000451'),
  ('c0000000-0000-0000-0000-000000000452', 'b0000000-0000-0000-0000-000000000451', 'Permit Job 2', 'construction',
   'America/Los_Angeles', 'a0000000-0000-0000-0000-000000000451'),
  ('c0000000-0000-0000-0000-000000000453', 'b0000000-0000-0000-0000-000000000451', 'Permit Job 3', 'construction',
   'America/Los_Angeles', 'a0000000-0000-0000-0000-000000000451'),
  ('c0000000-0000-0000-0000-000000000454', 'b0000000-0000-0000-0000-000000000451', 'Permit Job 4', 'bidding',
   'America/Los_Angeles', 'a0000000-0000-0000-0000-000000000451');
insert into public.project_members (org_id, project_id, user_id, invite_email, role, status)
select 'b0000000-0000-0000-0000-000000000451', p, u, e, r, 'active'
  from (values
    ('c0000000-0000-0000-0000-000000000451'::uuid, 'a0000000-0000-0000-0000-000000000452'::uuid, 'probe+pt-ahj@example.test', 'ahj'),
    ('c0000000-0000-0000-0000-000000000451', 'a0000000-0000-0000-0000-000000000453', 'probe+pt-ahj2@example.test', 'ahj'),
    ('c0000000-0000-0000-0000-000000000451', 'a0000000-0000-0000-0000-000000000454', 'probe+pt-pm@example.test', 'pm'),
    ('c0000000-0000-0000-0000-000000000451', 'a0000000-0000-0000-0000-000000000455', 'probe+pt-arch@example.test', 'architect'),
    ('c0000000-0000-0000-0000-000000000451', 'a0000000-0000-0000-0000-000000000456', 'probe+pt-sub@example.test', 'sub'),
    ('c0000000-0000-0000-0000-000000000451', 'a0000000-0000-0000-0000-000000000457', 'probe+pt-bidder@example.test', 'bidder'),
    ('c0000000-0000-0000-0000-000000000451', 'a0000000-0000-0000-0000-000000000458', 'probe+pt-viewer@example.test', 'viewer'),
    ('c0000000-0000-0000-0000-000000000451', 'a0000000-0000-0000-0000-000000000459', 'probe+pt-insp@example.test', 'inspector'),
    ('c0000000-0000-0000-0000-000000000452', 'a0000000-0000-0000-0000-000000000452', 'probe+pt-ahj@example.test', 'ahj'),
    ('c0000000-0000-0000-0000-000000000453', 'a0000000-0000-0000-0000-000000000454', 'probe+pt-pm@example.test', 'pm'),
    ('c0000000-0000-0000-0000-000000000454', 'a0000000-0000-0000-0000-000000000452', 'probe+pt-ahj@example.test', 'ahj')) v(p, u, e, r);
-- A permit on the PM's other job (P3), where the official is not.
insert into public.permits (id, org_id, project_id, created_by, primary_number, title) values
  ('e0000000-0000-0000-0000-0000000004c3', 'b0000000-0000-0000-0000-000000000451', 'c0000000-0000-0000-0000-000000000453',
   'a0000000-0000-0000-0000-000000000451', '25-0200', 'Not the official''s');
insert into ids values ('P3', 'e0000000-0000-0000-0000-0000000004c3');

-- ---------------------------------------------------------------------------------------------------------------
-- Shape, the role, the matrix, the module
-- ---------------------------------------------------------------------------------------------------------------
select ok((select bool_and(relrowsecurity) from pg_class
            where oid in ('public.permits'::regclass, 'public.permit_stage_events'::regclass,
                          'public.permit_reviews'::regclass, 'public.permit_comments'::regclass)), 'RLS is on all four tables');
select ok(not exists (select 1 from unnest(array['permits', 'permit_stage_events', 'permit_reviews', 'permit_comments']) t
                       where has_table_privilege('anon', 'public.' || t, 'SELECT')
                          or has_table_privilege('authenticated', 'public.' || t, 'INSERT')
                          or has_table_privilege('authenticated', 'public.' || t, 'UPDATE')
                          or has_table_privilege('authenticated', 'public.' || t, 'DELETE')
                          or not has_table_privilege('authenticated', 'public.' || t, 'SELECT')),
  'anon reads nothing; signed in: read only, writes go through the RPCs');
select is((select description from public.roles where name = 'ahj'), 'Fire marshal', 'the role ahj, as data (0087: Jesse''s word)');
select is((select recommended_tools from public.roles where name = 'ahj'), '{board,calendar,permits,inspections,revs,files}'::text[],
  'its recommended rail (Revs from 0056)');
select is((select array_agg(role order by role) from public.role_permissions where capability = 'permits.read'),
  '{ahj,architect,inspector,inspector_admin,owner_rep,pe,pm,project_admin,superintendent}'::text[], 'matrix: permits.read');
select is((select array_agg(role order by role) from public.role_permissions where capability = 'permits.manage'),
  '{ahj}'::text[], 'matrix: permits.manage is the official''s alone');
select is((select array_agg(role order by role) from public.role_permissions where capability = 'permits.respond'),
  '{architect,inspector_admin,pe,pm,project_admin}'::text[],
  'matrix: permits.respond is the design team''s (and inspector_admin follows the project admin, 0044)');
select is((select array_agg(capability order by capability) from public.role_permissions where role = 'ahj'),
  '{calendar.read,comments.write,files.read_project,ir.ofs_decide,ir.ofs_view,members.view,permits.manage,permits.read,revs.manage,revs.read,safety.read,schedule.read,transmittals.send}'::text[],
  'matrix: the official''s whole list (revs from 0056, safety from 0060, schedule from 0062; OFS requests only, 0061)');
select ok('permits' = any (public.job_rail_tools()), 'Permits is a job tool on the rail');
select ok((select 'permits' = any (modules) from public.projects where id = 'c0000000-0000-0000-0000-000000000451')
          and (select not 'permits' = any (modules) from public.projects where id = 'c0000000-0000-0000-0000-000000000454'),
  'module: on for a job being built, off for one still bidding');
select is_empty($$ select f from unnest(array[
    'public.permit_create(uuid, text, text, text, text[], uuid, text, text, uuid)',
    'public.permit_update(uuid, integer, text, text, text, text[], uuid, date, date, integer, text)',
    'public.permit_move(uuid, integer, text, text)', 'public.permit_undo_move(uuid, integer)',
    'public.permit_review_open(uuid, text, date, uuid)', 'public.permit_review_close(uuid, integer, text, date)',
    'public.permit_comment_add(uuid, text, text, text, text, uuid)', 'public.permit_comment_respond(uuid, integer, text)',
    'public.permit_comment_close(uuid, integer, boolean)', 'public.set_request_permit(uuid, integer, uuid)',
    'public.permit_list(uuid)', 'public.my_permits()', 'public.permit_progress(uuid, uuid)', 'public.permit_people(uuid)',
    'public.permit_detail(uuid)']) f
   where has_function_privilege('anon', f, 'EXECUTE') or not has_function_privilege('authenticated', f, 'EXECUTE') $$,
  'grants: every user-facing permit function is for signed-in people, never anon');
select ok(not has_function_privilege('authenticated', 'public.permit_lock(uuid, integer)', 'EXECUTE')
          and not has_function_privilege('authenticated', 'public.permit_tell(public.permits, text, text, uuid[])', 'EXECUTE'),
  'grants: the internal helpers are not');

-- ---------------------------------------------------------------------------------------------------------------
-- New permits: the official only
-- ---------------------------------------------------------------------------------------------------------------
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000452');
select lives_ok($$ insert into ids select 'A', (public.permit_create('c0000000-0000-0000-0000-000000000451', ' 24-0001 ',
  'Building - new construction', 'building', array['25-0002', '24-0001', ' ', '25-0002 '], null, '', 'draft',
  'e0000000-0000-0000-0000-0000000004a1')).id $$, 'the official makes a permit');
select is((select array[primary_number, array_to_string(agency_numbers, ','), stage, kind] from public.permits
            where id = pg_temp.rid('A')), array['24-0001', '25-0002', 'draft', 'building'],
  'numbers typed and tidied (no blanks, no repeats, not the primary again); a draft');
select is((public.permit_create('c0000000-0000-0000-0000-000000000451', '24-0001', 'Building - new construction', 'building',
           '{}', null, '', 'draft', 'e0000000-0000-0000-0000-0000000004a1')).id, pg_temp.rid('A'),
  'the same key again returns the same permit');
select throws_ok($$ select public.permit_create('c0000000-0000-0000-0000-000000000451', '24-0001', 'Again', 'building') $$,
  '22023', 'Permit 24-0001 is already on this job.', 'one permit per number on a job');
select throws_ok($$ select public.permit_create('c0000000-0000-0000-0000-000000000451', '24-0009', 'Fire alarm', 'building',
  '{}', 'a0000000-0000-0000-0000-000000000454') $$, '22023', 'Pick someone on this job who handles permits.',
  'only someone who handles permits can be assigned');
select lives_ok($$ insert into ids select 'B', (public.permit_create('c0000000-0000-0000-0000-000000000451', '24-0002',
  'Site utilities', 'site_utility', '{}', 'a0000000-0000-0000-0000-000000000453')).id $$,
  'another official can be assigned');
select throws_ok($$ select public.permit_create('c0000000-0000-0000-0000-000000000454', '24-0003', 'Bidding job', 'building') $$,
  '22023', 'Permits are off for this job.', 'not on a job with Permits off');
select is((select count(*)::int from public.permit_stage_events where permit_id = pg_temp.rid('A')), 1,
  'a new permit has its first stage in the history');
select lives_ok($$ insert into ids select 'P2', (public.permit_create('c0000000-0000-0000-0000-000000000452', '25-0100',
  'Building - second job', 'building')).id $$, 'the official makes one on their other job');

select pg_temp.login('a0000000-0000-0000-0000-000000000454');
select throws_ok($$ select public.permit_create('c0000000-0000-0000-0000-000000000451', '24-0005', 'PM try', 'building') $$,
  '42501', null, 'a PM can''t make one');
select pg_temp.login('a0000000-0000-0000-0000-000000000456');
select throws_ok($$ select public.permit_create('c0000000-0000-0000-0000-000000000451', '24-0006', 'Sub try', 'building') $$,
  '42501', null, 'a sub can''t either');

-- ---------------------------------------------------------------------------------------------------------------
-- Stage moves, in order
-- ---------------------------------------------------------------------------------------------------------------
select pg_temp.login('a0000000-0000-0000-0000-000000000452');
select is(pg_temp.mv('A', 'submitted'), 'submitted', 'draft -> submitted');
select throws_ok($$ select pg_temp.mv('A', 'complete') $$, '22023', 'It can''t go from Submitted to Complete.',
  'nothing skips to complete');
select throws_ok($$ select pg_temp.mv('A', 'in_review') $$, '22023', null, 'no skipping ahead');
select is(pg_temp.mv('A', 'rejected'), 'rejected', 'submitted -> rejected');
select is(pg_temp.mv('A', 'submitted'), 'submitted', 'rejected -> submitted again (resubmitted)');
select is(array[pg_temp.mv('A', 'accepted'), pg_temp.mv('A', 'in_review'), pg_temp.mv('A', 'comments_out'),
                pg_temp.mv('A', 'backcheck'), pg_temp.mv('A', 'in_review')],
  array['accepted', 'in_review', 'comments_out', 'backcheck', 'in_review'], 'through review, and the backcheck loops back');
select throws_ok($$ select pg_temp.mv('A', 'rejected') $$, '22023', null, 'rejected only from submitted');
select is(pg_temp.mv('A', 'issued'), 'issued', 'in review -> issued');
select is((select array[issued_on, expires_on] from public.permits where id = pg_temp.rid('A')),
  array[(now() at time zone 'America/Los_Angeles')::date, ((now() at time zone 'America/Los_Angeles')::date + interval '12 months')::date],
  'issued today on the job''s clock; expires 12 months on');
select ok(exists (select 1 from public.calendar_entries
                   where source_type = 'permit' and source_id = pg_temp.rid('A') and kind = 'milestones' and all_day
                     and read_capability = 'permits.read' and title = 'Permit 24-0001 expires: Building - new construction'),
  'the expiry is a milestone on the calendar for permit readers');
select is((public.permit_move(pg_temp.rid('A'), 1, 'issued')).version, pg_temp.ver('A'), 'the same move again is a no-op');
select throws_ok($$ select public.permit_move(pg_temp.rid('A'), 1, 'inspected') $$, '40001', null, 'a stale version is refused');
select pg_temp.login('a0000000-0000-0000-0000-000000000454');
select throws_ok($$ select pg_temp.mv('A', 'inspected') $$, '42501', null, 'a PM can''t move it');
select pg_temp.login('a0000000-0000-0000-0000-000000000453');
select throws_ok($$ select public.permit_undo_move(pg_temp.rid('A'), pg_temp.ver('A')) $$, '22023',
  'That move can''t be undone now.', 'Undo: only my own last move');
select pg_temp.login('a0000000-0000-0000-0000-000000000452');
select is((select array[stage, coalesce(issued_on::text, 'none'), coalesce(expires_on::text, 'none')]
             from public.permit_undo_move(pg_temp.rid('A'), pg_temp.ver('A'))),
  array['in_review', 'none', 'none'], 'Undo: back to review, the issue dates put back');
select ok(not exists (select 1 from public.calendar_entries where source_type = 'permit' and source_id = pg_temp.rid('A')),
  'and the expiry leaves the calendar');
select is((select count(*)::int from public.permit_stage_events where permit_id = pg_temp.rid('A') and undone_at is not null), 1,
  'the undone move stays in the history, marked');
select throws_ok($$ update public.permit_stage_events set note = 'x' where permit_id = pg_temp.rid('A') $$, '42501', null,
  'nobody edits the history directly');
select is(pg_temp.mv('B', 'cancelled'), 'cancelled', 'cancel from anywhere (a draft)');
select throws_ok($$ select pg_temp.mv('B', 'submitted') $$, '22023', null, 'a cancelled permit goes nowhere');

-- ---------------------------------------------------------------------------------------------------------------
-- Reviews and comments
-- ---------------------------------------------------------------------------------------------------------------
select lives_ok($$ insert into ids select 'R1', (public.permit_review_open(pg_temp.rid('A'))).id $$, 'the official opens a review');
select is((select array[cycle::text, kind] from public.permit_reviews where id = pg_temp.rid('R1')), array['1', 'initial'],
  'cycle 1, the initial review');
select throws_ok($$ select public.permit_review_open(pg_temp.rid('A')) $$, '22023', 'Close the open review first.',
  'one open review at a time');
select lives_ok($$ insert into ids values
  ('C1', (public.permit_comment_add(pg_temp.rid('R1'), 'Show the fire sprinkler riser room rating.', 'A2.01', '4', 'CFC 903.3')).id),
  ('C2', (public.permit_comment_add(pg_temp.rid('R1'), 'Add the knox box location.', 'FP-1')).id) $$, 'two comments');
select is((select array_agg(number order by number) from public.permit_comments where permit_id = pg_temp.rid('A')),
  '{1,2}'::int[], 'numbered by the database, per permit');
select pg_temp.login('a0000000-0000-0000-0000-000000000454');
select throws_ok($$ select public.permit_comment_add(pg_temp.rid('R1'), 'PM comment') $$, '42501', null,
  'only the official comments');
select pg_temp.login('a0000000-0000-0000-0000-000000000455');
select ok(exists (select 1 from public.activity a join public.activity_recipients ar on ar.activity_id = a.id
                   where a.entity_id = pg_temp.rid('A') and a.kind = 'permit.comment'
                     and ar.user_id = 'a0000000-0000-0000-0000-000000000455'),
  'board: a new comment goes to the design team');
select is((public.permit_comment_respond(pg_temp.rid('C1'), pg_temp.cver('C1'), 'Rating added on A2.01.')).responded_by,
  'a0000000-0000-0000-0000-000000000455'::uuid, 'the architect answers');
select pg_temp.login('a0000000-0000-0000-0000-000000000452');
select ok(exists (select 1 from public.activity a join public.activity_recipients ar on ar.activity_id = a.id
                   where a.entity_id = pg_temp.rid('A') and a.kind = 'permit.response'
                     and ar.user_id = 'a0000000-0000-0000-0000-000000000452'),
  'board: the answer goes back to the official');
select throws_ok($$ select public.permit_comment_respond(pg_temp.rid('C2'), pg_temp.cver('C2'), 'Official try') $$, '42501', null,
  'the official doesn''t answer their own comments');
select pg_temp.login('a0000000-0000-0000-0000-000000000456');
select throws_ok($$ select public.permit_comment_respond(pg_temp.rid('C2'), 1, 'Sub try') $$, 'P0002', null,
  'a sub can''t even find it');
select pg_temp.login('a0000000-0000-0000-0000-000000000452');
select is((select array[outcome, returned_on::text] from public.permit_review_close(pg_temp.rid('R1'), pg_temp.rver('R1'), 'revise_resubmit')),
  array['revise_resubmit', ((now() at time zone 'America/Los_Angeles')::date)::text], 'closed: revise and resubmit, returned today');
select throws_ok($$ select public.permit_comment_add(pg_temp.rid('R1'), 'Late comment') $$, '22023', 'This review is closed.',
  'no comments on a closed review');
select lives_ok($$ insert into ids select 'R2', (public.permit_review_open(pg_temp.rid('A'))).id $$, 'the backcheck review');
select is((select array[cycle::text, kind, review_no::text, backcheck::text] from public.permit_reviews where id = pg_temp.rid('R2')),
  array['2', 'initial', '1', '1'], 'cycle 2: the initial review''s backcheck 1 (0061)');
select is((public.permit_comment_add(pg_temp.rid('R2'), 'Rated door hardware schedule.', 'A8.10')).number, 3,
  'comment numbers run on across cycles');
select is((select array[status, closed_cycle::text] from public.permit_comment_close(pg_temp.rid('C1'), pg_temp.cver('C1'))),
  array['closed', '2'], 'the official closes a comment, in the latest cycle');
select is((select array[status, coalesce(closed_cycle::text, 'none')]
             from public.permit_comment_close(pg_temp.rid('C1'), pg_temp.cver('C1'), false)),
  array['open', 'none'], 'and opens it again (Undo)');

-- ---------------------------------------------------------------------------------------------------------------
-- Who sees what
-- ---------------------------------------------------------------------------------------------------------------
select is(pg_temp.seen('a0000000-0000-0000-0000-000000000456', 'c0000000-0000-0000-0000-000000000451'), 0, 'a sub sees nothing');
select is(pg_temp.seen('a0000000-0000-0000-0000-000000000457', 'c0000000-0000-0000-0000-000000000451'), 0, 'a bidder sees nothing');
select is(pg_temp.seen('a0000000-0000-0000-0000-000000000458', 'c0000000-0000-0000-0000-000000000451'), 0, 'a viewer sees nothing');
select is(pg_temp.seen('a0000000-0000-0000-0000-000000000450', 'c0000000-0000-0000-0000-000000000451'), 0,
  'someone off the job sees nothing');
select pg_temp.login('a0000000-0000-0000-0000-000000000456');
select throws_ok($$ select public.permit_detail(pg_temp.rid('A')) $$, 'P0002', null, 'a sub can''t open one');
select pg_temp.login('a0000000-0000-0000-0000-000000000459');
select set_eq($$ select id from public.permit_list('c0000000-0000-0000-0000-000000000451') $$,
  $$ values (pg_temp.rid('A')), (pg_temp.rid('B')) $$, 'the inspector reads the job''s log');
select pg_temp.login('a0000000-0000-0000-0000-000000000452');
select set_eq($$ select id from public.my_permits() $$, $$ values (pg_temp.rid('A')), (pg_temp.rid('B')), (pg_temp.rid('P2')) $$,
  'the official''s caseload: both of their jobs, never a job they are not on');
select pg_temp.login('a0000000-0000-0000-0000-000000000454');
select set_eq($$ select id from public.my_permits() $$, $$ values (pg_temp.rid('A')), (pg_temp.rid('B')), (pg_temp.rid('P3')) $$,
  'the PM''s: theirs');
select is((select array_agg(name order by name) from public.permit_people('c0000000-0000-0000-0000-000000000451')),
  '{"Dana Deputy","Drew Deputy"}'::text[], 'who can be assigned: the officials on the job');
select is((select d -> 'can' from public.permit_detail(pg_temp.rid('A')) d),
  '{"link": false, "manage": false, "respond": true}'::jsonb, 'the PM may answer, not manage');
select is((select jsonb_array_length(d -> 'moves') from public.permit_detail(pg_temp.rid('A')) d), 0, 'and has no moves');
select pg_temp.login('a0000000-0000-0000-0000-000000000452');
select is((select d -> 'moves' from public.permit_detail(pg_temp.rid('A')) d), '["comments_out", "issued", "cancelled"]'::jsonb,
  'the official''s moves, the usual next one first');
select is((select jsonb_array_length(d -> 'reviews') from public.permit_detail(pg_temp.rid('A')) d), 2, 'both review cycles');

-- ---------------------------------------------------------------------------------------------------------------
-- The tracker: days at each stage from fixed times, on the job's clock
-- ---------------------------------------------------------------------------------------------------------------
reset role;
insert into public.permits (id, org_id, project_id, created_by, primary_number, title, stage, stage_since) values
  ('e0000000-0000-0000-0000-0000000004b1', 'b0000000-0000-0000-0000-000000000451', 'c0000000-0000-0000-0000-000000000451',
   'a0000000-0000-0000-0000-000000000452', '30-0001', 'X in review', 'in_review', pg_temp.la(-5, '22:00')),
  ('e0000000-0000-0000-0000-0000000004b2', 'b0000000-0000-0000-0000-000000000451', 'c0000000-0000-0000-0000-000000000451',
   'a0000000-0000-0000-0000-000000000452', '30-0002', 'Y review loop', 'comments_out', pg_temp.la(-13, '10:00')),
  ('e0000000-0000-0000-0000-0000000004b3', 'b0000000-0000-0000-0000-000000000451', 'c0000000-0000-0000-0000-000000000451',
   'a0000000-0000-0000-0000-000000000452', '30-0003', 'Z rejected', 'rejected', pg_temp.la(-1, '09:00')),
  ('e0000000-0000-0000-0000-0000000004b4', 'b0000000-0000-0000-0000-000000000451', 'c0000000-0000-0000-0000-000000000451',
   'a0000000-0000-0000-0000-000000000452', '30-0004', 'W cancelled', 'cancelled', pg_temp.la(-1, '09:00')),
  ('e0000000-0000-0000-0000-0000000004b5', 'b0000000-0000-0000-0000-000000000451', 'c0000000-0000-0000-0000-000000000451',
   'a0000000-0000-0000-0000-000000000452', '30-0005', 'V complete', 'complete', pg_temp.la(-1, '09:00'));
insert into public.permit_stage_events (permit_id, project_id, org_id, stage, at, actor, undone_at, undone_by)
select p::uuid, 'c0000000-0000-0000-0000-000000000451', 'b0000000-0000-0000-0000-000000000451', s, at,
       'a0000000-0000-0000-0000-000000000452', u, case when u is not null then 'a0000000-0000-0000-0000-000000000452'::uuid end
  from (values
    -- X: 23 hours as a draft, three calendar days submitted, 38 hours accepted (two days on the calendar, one apart),
    -- in review since five days ago; a later move to comments out was undone.
    ('e0000000-0000-0000-0000-0000000004b1', 'draft', pg_temp.la(-10, '09:00'), null::timestamptz),
    ('e0000000-0000-0000-0000-0000000004b1', 'submitted', pg_temp.la(-9, '08:00'), null),
    ('e0000000-0000-0000-0000-0000000004b1', 'accepted', pg_temp.la(-6, '08:00'), null),
    ('e0000000-0000-0000-0000-0000000004b1', 'in_review', pg_temp.la(-5, '22:00'), null),
    ('e0000000-0000-0000-0000-0000000004b1', 'comments_out', pg_temp.la(-1, '09:00'), now()),
    -- Y: in review 2 days, comments out 3, backcheck 1, in review again 25 hours (1 day), comments out since 13 days.
    ('e0000000-0000-0000-0000-0000000004b2', 'in_review', pg_temp.la(-20, '09:00'), null),
    ('e0000000-0000-0000-0000-0000000004b2', 'comments_out', pg_temp.la(-18, '09:00'), null),
    ('e0000000-0000-0000-0000-0000000004b2', 'backcheck', pg_temp.la(-15, '09:00'), null),
    ('e0000000-0000-0000-0000-0000000004b2', 'in_review', pg_temp.la(-14, '09:00'), null),
    ('e0000000-0000-0000-0000-0000000004b2', 'comments_out', pg_temp.la(-13, '10:00'), null),
    -- Z: submitted, then rejected. W: a draft, submitted, cancelled. V: issued and on to complete.
    ('e0000000-0000-0000-0000-0000000004b3', 'submitted', pg_temp.la(-3, '09:00'), null),
    ('e0000000-0000-0000-0000-0000000004b3', 'rejected', pg_temp.la(-1, '09:00'), null),
    ('e0000000-0000-0000-0000-0000000004b4', 'draft', pg_temp.la(-3, '09:00'), null),
    ('e0000000-0000-0000-0000-0000000004b4', 'submitted', pg_temp.la(-2, '09:00'), null),
    ('e0000000-0000-0000-0000-0000000004b4', 'cancelled', pg_temp.la(-1, '09:00'), null),
    ('e0000000-0000-0000-0000-0000000004b5', 'issued', pg_temp.la(-30, '09:00'), null),
    ('e0000000-0000-0000-0000-0000000004b5', 'inspections', pg_temp.la(-20, '09:00'), null),
    ('e0000000-0000-0000-0000-0000000004b5', 'approved', pg_temp.la(-3, '09:00'), null),
    ('e0000000-0000-0000-0000-0000000004b5', 'complete', pg_temp.la(-1, '09:00'), null)
  ) v(p, s, at, u);
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000454');

create function pg_temp.track(p_permit uuid, p_what text) returns text language sql as $$
  select string_agg(case p_what when 'state' then x.state when 'stage' then x.stage
                                else coalesce(x.days::text, '-') end, ',' order by x.position)
    from public.permit_progress('c0000000-0000-0000-0000-000000000451', p_permit) x $$;
grant execute on function pg_temp.track(uuid, text) to public;

select is(pg_temp.track('e0000000-0000-0000-0000-0000000004b1', 'state'),
  'done,done,done,current,next,next,next,next,next,next', 'X: done up to review, which has it now');
select is(pg_temp.track('e0000000-0000-0000-0000-0000000004b1', 'days'), '0,3,1,5,-,-,-,-,-,-',
  'X: under a day = 0, calendar days on the job''s clock, the current stage counts to now; the undone move never counts');
select is(pg_temp.track('e0000000-0000-0000-0000-0000000004b2', 'state'),
  'done,done,done,done,current,next,next,next,next,next', 'Y: comments out now; never-visited earlier stages are done');
select is(pg_temp.track('e0000000-0000-0000-0000-0000000004b2', 'days'), '-,-,-,3,16,1,-,-,-,-',
  'Y: a review loop adds the visits up (review 2 + 1, comments out 3 + 13; the backcheck it was at shows too)');
select is(pg_temp.track('e0000000-0000-0000-0000-0000000004b3', 'stage') || ' / ' || pg_temp.track('e0000000-0000-0000-0000-0000000004b3', 'state'),
  'draft,submitted,rejected,in_review,comments_out,backcheck,issued,inspected,approved,complete / done,done,failed,next,next,next,next,next,next,next',
  'Z: rejected sits where accepted does, failed');
select is(pg_temp.track('e0000000-0000-0000-0000-0000000004b4', 'stage') || ' / ' || pg_temp.track('e0000000-0000-0000-0000-0000000004b4', 'state')
          || ' / ' || pg_temp.track('e0000000-0000-0000-0000-0000000004b4', 'days'),
  'draft,cancelled,accepted,in_review,comments_out,backcheck,issued,inspected,approved,complete / done,failed,next,next,next,next,next,next,next,next / 1,-,-,-,-,-,-,-,-,-',
  'W: cancelled where it stopped, no time on the mark');
select is(pg_temp.track('e0000000-0000-0000-0000-0000000004b5', 'state') || ' / ' || pg_temp.track('e0000000-0000-0000-0000-0000000004b5', 'days'),
  'done,done,done,done,done,done,done,done,done,done / -,-,-,-,-,-,27,-,2,-',
  'V: complete is done everywhere, no time at the end; its move to the old Inspections stage counts as Issued (0061)');
select is((select count(distinct permit_id)::int from public.permit_progress('c0000000-0000-0000-0000-000000000451')), 7,
  'the job''s tracker: every permit I may read, ten places each');
select pg_temp.login('a0000000-0000-0000-0000-000000000456');
select is_empty($$ select * from public.permit_progress('c0000000-0000-0000-0000-000000000451') $$, 'a sub gets no tracker');

-- ---------------------------------------------------------------------------------------------------------------
-- Inspection requests name their permit
-- ---------------------------------------------------------------------------------------------------------------
reset role;
insert into public.inspection_requests (id, org_id, project_id, number, requested_by, company, request_date, duration_kind,
                                        kind, items, notice_ack_at, status)
values ('d0000000-0000-0000-0000-000000000451', 'b0000000-0000-0000-0000-000000000451', 'c0000000-0000-0000-0000-000000000451',
        1, 'a0000000-0000-0000-0000-000000000456', 'Sample Fire Co', current_date, 'all_day', 'ofs', 'Sprinkler hydro, level 2',
        now(), 'pending');
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000456');
select throws_ok($$ select public.set_request_permit('d0000000-0000-0000-0000-000000000451', null, pg_temp.rid('A')) $$, '42501', null,
  'the requester who can''t read permits can''t name one');
select pg_temp.login('a0000000-0000-0000-0000-000000000454');
select throws_ok($$ select public.set_request_permit('d0000000-0000-0000-0000-000000000451', null, pg_temp.rid('A')) $$, '42501', null,
  'nor can a PM who neither asked for it nor decides it');
select pg_temp.login('a0000000-0000-0000-0000-000000000452');
select throws_ok($$ select public.set_request_permit('d0000000-0000-0000-0000-000000000451', null, pg_temp.rid('A')) $$, 'P0002', null,
  'the official does not see an OFS request that has not been sent to OFS');
reset role;
update public.inspection_requests set ofs_sent_at = now(), ofs_sent_by = 'a0000000-0000-0000-0000-000000000459'
 where id = 'd0000000-0000-0000-0000-000000000451';
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000452');
select throws_ok($$ select public.set_request_permit('d0000000-0000-0000-0000-000000000451', null, pg_temp.rid('P2')) $$, 'P0002', null,
  'a permit of another job is refused');
select is((public.set_request_permit('d0000000-0000-0000-0000-000000000451', null, pg_temp.rid('A'))).permit_id, pg_temp.rid('A'),
  'the official links it');
select is((select d -> 'inspections' -> 0 ->> 'items' from public.permit_detail(pg_temp.rid('A')) d), 'Sprinkler hydro, level 2',
  'the permit lists its inspection');
reset role;
select throws_ok($$ update public.inspection_requests set permit_id = 'e0000000-0000-0000-0000-0000000004b1',
                     project_id = 'c0000000-0000-0000-0000-000000000452' where id = 'd0000000-0000-0000-0000-000000000451' $$,
  '23503', null, 'the database keeps a request and its permit on the same job');

-- ---------------------------------------------------------------------------------------------------------------
-- anon
-- ---------------------------------------------------------------------------------------------------------------
set local role anon;
select throws_ok($$ select * from public.permits $$, '42501', null, 'anon: no permits');
select throws_ok($$ select * from public.my_permits() $$, '42501', null, 'anon: no caseload');
reset role;

select * from finish();
rollback;
