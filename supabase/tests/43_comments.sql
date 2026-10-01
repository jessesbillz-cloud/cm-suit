begin;
select plan(68);
-- Comments (migration 0050): one gate (comment_target_readable) through each item's own read gate, which the item's
-- SELECT policy uses too; comments.write for everyone but bidders and viewers; add (repeat-safe) and edit (author only,
-- version-checked, the original kept); permanent (no delete for anyone); board lines for the item's people; anon nothing.
\ir _helpers.psql

create temp table ids (k text primary key, v uuid);
grant all on ids to public;
create function pg_temp.rid(p_k text) returns uuid language sql stable as $$ select v from ids where k = p_k $$;
-- How many comments on an item this person sees through the table (RLS). Leaves them logged in.
create function pg_temp.sees(p_uid uuid, p_k text) returns int language plpgsql as $$
declare n int;
begin
  perform pg_temp.login(p_uid);
  select count(*)::int into n from public.comments where entity_id = (select v from ids where k = p_k);
  return n;
end $$;
create function pg_temp.lines(p_k text, p_kind text) returns int language sql stable security definer as $$
  select count(*)::int from public.activity where entity_id = (select v from ids where k = p_k) and kind = p_kind $$;
create function pg_temp.edits(p_k text) returns int language sql stable security definer as $$
  select count(*)::int from public.comment_edits where comment_id = (select v from ids where k = p_k) $$;
grant execute on function pg_temp.rid(text), pg_temp.sees(uuid, text), pg_temp.lines(text, text), pg_temp.edits(text)
  to public;

-- ---------------------------------------------------------------------------------------------------------------
-- Seed: a GC job; the admin (its creator), a PE, two subs from two companies, a viewer, a bidder; an outsider.
-- ---------------------------------------------------------------------------------------------------------------
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000431', 'probe+cm-admin@example.test', 'Ada Admin');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000432', 'probe+cm-pe@example.test', 'Pat Engineer');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000433', 'probe+cm-sub@example.test', 'Sam Sub');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000434', 'probe+cm-sub2@example.test', 'Sue Sub');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000435', 'probe+cm-viewer@example.test', 'Vic Viewer');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000436', 'probe+cm-bidder@example.test', 'Bo Bidder');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000437', 'probe+cm-other@example.test', 'Oz Other');

insert into public.orgs (id, name, kind, created_by) values
  ('b0000000-0000-0000-0000-000000000431', 'Sample Builders', 'gc', 'a0000000-0000-0000-0000-000000000431'),
  ('b0000000-0000-0000-0000-000000000432', 'Sample Concrete Co', 'sub', 'a0000000-0000-0000-0000-000000000433');
insert into public.projects (id, org_id, name, stage, timezone, created_by) values
  ('c0000000-0000-0000-0000-000000000431', 'b0000000-0000-0000-0000-000000000431', 'Comment Job', 'construction',
   'America/Los_Angeles', 'a0000000-0000-0000-0000-000000000431');
insert into public.project_members (org_id, project_id, user_id, invite_email, member_org_id, role, status)
select 'b0000000-0000-0000-0000-000000000431', 'c0000000-0000-0000-0000-000000000431', u, e, o, r, 'active'
  from (values
    ('a0000000-0000-0000-0000-000000000432'::uuid, 'probe+cm-pe@example.test', 'b0000000-0000-0000-0000-000000000431'::uuid, 'pe'),
    ('a0000000-0000-0000-0000-000000000433', 'probe+cm-sub@example.test', 'b0000000-0000-0000-0000-000000000432', 'sub'),
    ('a0000000-0000-0000-0000-000000000434', 'probe+cm-sub2@example.test', null, 'sub'),
    ('a0000000-0000-0000-0000-000000000435', 'probe+cm-viewer@example.test', null, 'viewer'),
    ('a0000000-0000-0000-0000-000000000436', 'probe+cm-bidder@example.test', null, 'bidder')) v(u, e, o, r);

-- Items (as postgres): Sam's RFI draft, Sam's daily draft, a correction, a bid document bidders may read.
with r as (insert into public.rfis (org_id, project_id, created_by, title, question)
           values ('b0000000-0000-0000-0000-000000000431', 'c0000000-0000-0000-0000-000000000431',
                   'a0000000-0000-0000-0000-000000000433', 'Sample beam pocket depth', 'Sample question?') returning id)
insert into ids select 'R', id from r;
with d as (insert into public.daily_reports (org_id, project_id, author_id, report_type, report_date)
           values ('b0000000-0000-0000-0000-000000000431', 'c0000000-0000-0000-0000-000000000431',
                   'a0000000-0000-0000-0000-000000000433', 'general', date '2026-09-30') returning id)
insert into ids select 'D', id from d;
with c as (insert into public.corrections (org_id, project_id, created_by, number, title, request_key)
           values ('b0000000-0000-0000-0000-000000000431', 'c0000000-0000-0000-0000-000000000431',
                   'a0000000-0000-0000-0000-000000000431', 1, 'Sample missing firestop', 'sample-key-0001') returning id)
insert into ids select 'C', id from c;
insert into public.folders (id, org_id, project_id, parent_id, name, created_by) values
  ('d0000000-0000-0000-0000-000000000431', 'b0000000-0000-0000-0000-000000000431', 'c0000000-0000-0000-0000-000000000431',
   null, 'Sample bid documents', 'a0000000-0000-0000-0000-000000000431');
insert into public.folder_access (folder_id, capability, can_read, can_write) values
  ('d0000000-0000-0000-0000-000000000431', 'bids.submit', true, false),
  ('d0000000-0000-0000-0000-000000000431', 'files.read_project', true, false);
insert into public.files (id, org_id, project_id, folder_id, storage_path, original_name, created_by, scan_status)
values ('e0000000-0000-0000-0000-000000000431', 'b0000000-0000-0000-0000-000000000431', 'c0000000-0000-0000-0000-000000000431',
        'd0000000-0000-0000-0000-000000000431',
        public.file_storage_path('c0000000-0000-0000-0000-000000000431', 'd0000000-0000-0000-0000-000000000431',
                                 'e0000000-0000-0000-0000-000000000431', 'Sample Bid Set.pdf'),
        'Sample Bid Set.pdf', 'a0000000-0000-0000-0000-000000000431', 'clean');
insert into ids values ('F', 'e0000000-0000-0000-0000-000000000431');

-- ---------------------------------------------------------------------------------------------------------------
-- The shape: one gate per item, the matrix, no writes but the RPCs
-- ---------------------------------------------------------------------------------------------------------------
select set_eq(
  $$ select tablename::text from pg_policies
      where schemaname = 'public' and cmd = 'SELECT'
        and ((tablename = 'rfis' and qual like '%rfi_may_see(%')
          or (tablename = 'inspection_requests' and qual like '%ir_may_see(%')
          or (tablename = 'files' and qual like '%file_may_see(%')
          or (tablename = 'daily_reports' and qual like '%daily_may_see(%')
          or (tablename = 'corrections' and qual like '%correction_may_see(%')
          or (tablename = 'deliveries' and qual like '%delivery_may_see(%')) $$,
  $$ values ('rfis'), ('inspection_requests'), ('files'), ('daily_reports'), ('corrections'), ('deliveries') $$,
  'gates: each item''s SELECT policy calls the same gate comment_target_readable asks');
select is((select count(*)::int from pg_policies where schemaname = 'public' and cmd in ('SELECT', 'ALL')
            and tablename in ('rfis', 'inspection_requests', 'files', 'daily_reports', 'corrections', 'deliveries')), 6,
  'gates: one read policy per item table, so nothing else widens it');
select set_eq($$ select role from public.role_permissions where capability = 'comments.write' $$,
  $$ select name from public.roles where name not in ('bidder', 'viewer') $$,
  'matrix: comments.write for every role but bidder and viewer');
select ok(not has_table_privilege('authenticated', 'public.comments', 'INSERT,UPDATE,DELETE,TRUNCATE'),
  'grants: signed-in users only read comments');
select ok(not has_table_privilege('authenticated', 'public.comment_edits', 'INSERT,UPDATE,DELETE,TRUNCATE'),
  'grants: signed-in users only read earlier texts');
select ok(not has_table_privilege('service_role', 'public.comments', 'DELETE,TRUNCATE')
          and not has_table_privilege('service_role', 'public.comment_edits', 'UPDATE,DELETE,TRUNCATE'),
  'grants: not even the service role deletes');

set local role authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- An RFI draft: Sam (originator) and the PE read and write; Sue (another sub) does not see it at all
-- ---------------------------------------------------------------------------------------------------------------
select pg_temp.login('a0000000-0000-0000-0000-000000000433');
select ok(public.comment_target_readable('c0000000-0000-0000-0000-000000000431', 'rfi', pg_temp.rid('R')),
  'gate: the originator may read his RFI');
select lives_ok($$ insert into ids select 'K1', id from public.add_comment('c0000000-0000-0000-0000-000000000431', 'rfi',
  pg_temp.rid('R'), '  Sample: the pocket is 6 in. deep.  ', '10000000-0000-0000-0000-000000000431') $$,
  'add: the originator comments');
select is((select id from public.add_comment('c0000000-0000-0000-0000-000000000431', 'rfi', pg_temp.rid('R'),
  'Sample: the pocket is 6 in. deep.', '10000000-0000-0000-0000-000000000431')), pg_temp.rid('K1'),
  'add: the same key again returns the same comment');
select is((select body from public.comments where id = pg_temp.rid('K1')), 'Sample: the pocket is 6 in. deep.',
  'add: stored trimmed');
select throws_ok($$ select public.add_comment('c0000000-0000-0000-0000-000000000431', 'rfi', pg_temp.rid('R'), '   ') $$,
  '22023', 'Write a comment.', 'add: an empty comment is refused');
select throws_ok($$ select public.add_comment('c0000000-0000-0000-0000-000000000431', 'rfi', pg_temp.rid('R'), repeat('x', 4001)) $$,
  '22023', 'Keep a comment to 4000 characters.', 'add: at most 4000 characters');
select is(pg_temp.lines('R', 'comment.added'), 1, 'board: one line for the comment');
select is(pg_temp.sees('a0000000-0000-0000-0000-000000000433', 'R'), 1, 'read: the originator sees it');
select is((select count(*)::int from public.activity where entity_id = pg_temp.rid('R')), 0,
  'board: never a line to the writer himself');

select pg_temp.login('a0000000-0000-0000-0000-000000000432');
select is(pg_temp.sees('a0000000-0000-0000-0000-000000000432', 'R'), 1, 'read: the PE (may issue RFIs) sees it');
select is((select summary from public.activity where entity_id = pg_temp.rid('R') and kind = 'comment.added'),
  'New comment on RFI: Sample beam pocket depth', 'board: the PE sees "New comment" on the RFI');
select is((public.comment_list('c0000000-0000-0000-0000-000000000431', 'rfi', pg_temp.rid('R')) -> 'comments' -> 0)
           - 'id' - 'created_at' - 'author_id',
  '{"body": "Sample: the pocket is 6 in. deep.", "version": 1, "edited_at": null, "author_name": "Sam Sub",
    "author_company": "Sample Concrete Co", "mine": false, "earlier": []}'::jsonb,
  'list: the text, who wrote it and for which company');
select is((public.comment_list('c0000000-0000-0000-0000-000000000431', 'rfi', pg_temp.rid('R')) ->> 'can_write'), 'true',
  'list: the PE may write');
select lives_ok($$ insert into ids select 'K2', id from public.add_comment('c0000000-0000-0000-0000-000000000431', 'rfi',
  pg_temp.rid('R'), 'Sample: confirmed on site.') $$, 'add: the PE answers');
select is((select array_agg(e ->> 'body' order by o)
             from jsonb_array_elements(public.comment_list('c0000000-0000-0000-0000-000000000431', 'rfi', pg_temp.rid('R')) -> 'comments')
                  with ordinality as t (e, o)),
  array['Sample: the pocket is 6 in. deep.', 'Sample: confirmed on site.'], 'list: oldest first');

select pg_temp.login('a0000000-0000-0000-0000-000000000433');
select is((select count(*)::int from public.activity a join public.activity_recipients ar on ar.activity_id = a.id
            where a.entity_id = pg_temp.rid('R') and a.kind = 'comment.added'
              and ar.user_id = 'a0000000-0000-0000-0000-000000000433'), 1,
  'board: the PE''s comment reaches the originator');

select pg_temp.login('a0000000-0000-0000-0000-000000000434');
select ok(not public.comment_target_readable('c0000000-0000-0000-0000-000000000431', 'rfi', pg_temp.rid('R')),
  'gate: another sub may not read the RFI');
select is(pg_temp.sees('a0000000-0000-0000-0000-000000000434', 'R'), 0, 'read: another sub sees no comment on it');
select throws_ok($$ select public.comment_list('c0000000-0000-0000-0000-000000000431', 'rfi', pg_temp.rid('R')) $$,
  'P0002', null, 'list: refused for another sub');
select throws_ok($$ select public.add_comment('c0000000-0000-0000-0000-000000000431', 'rfi', pg_temp.rid('R'), 'Sample') $$,
  'P0002', null, 'add: refused for another sub');
select is((select count(*)::int from public.activity where entity_id = pg_temp.rid('R')), 0,
  'board: another sub sees no line about it');

-- ---------------------------------------------------------------------------------------------------------------
-- Edits keep the original
-- ---------------------------------------------------------------------------------------------------------------
select pg_temp.login('a0000000-0000-0000-0000-000000000433');
select is((select version from public.edit_comment(pg_temp.rid('K1'), 1, 'Sample: the pocket is 8 in. deep.')), 2,
  'edit: the author changes his text');
select is((select body from public.comments where id = pg_temp.rid('K1')), 'Sample: the pocket is 8 in. deep.',
  'edit: the comment shows the latest text');
select ok((select edited_at is not null from public.comments where id = pg_temp.rid('K1')), 'edit: marked edited');
select is((select array_agg(body) from public.comment_edits where comment_id = pg_temp.rid('K1')),
  array['Sample: the pocket is 6 in. deep.'], 'edit: the original stays readable');
select is((public.comment_list('c0000000-0000-0000-0000-000000000431', 'rfi', pg_temp.rid('R')) -> 'comments' -> 0 -> 'earlier'
           -> 0 ->> 'body'), 'Sample: the pocket is 6 in. deep.', 'list: the earlier text comes with the comment');
select is((public.comment_list('c0000000-0000-0000-0000-000000000431', 'rfi', pg_temp.rid('R')) -> 'comments' -> 0 ->> 'mine'),
  'true', 'list: my own comment says so');
select throws_ok($$ select public.edit_comment(pg_temp.rid('K1'), 1, 'Sample: something else') $$, '40001', null,
  'edit: a stale version is refused');
select is((select version from public.edit_comment(pg_temp.rid('K1'), 1, 'Sample: the pocket is 8 in. deep.')), 2,
  'edit: repeating the same edit changes nothing');
select is(pg_temp.edits('K1'), 1, 'edit: and keeps one earlier text');
select is((select version from public.edit_comment(pg_temp.rid('K1'), 2, 'Sample: 8 in. deep, per the shop drawing.')), 3,
  'edit: a second edit');
select is((select array_agg(body order by version) from public.comment_edits where comment_id = pg_temp.rid('K1')),
  array['Sample: the pocket is 6 in. deep.', 'Sample: the pocket is 8 in. deep.'], 'edit: every earlier text is kept');
select is(pg_temp.lines('R', 'comment.edited'), 2, 'board: each edit is a line');
select throws_ok($$ update public.comments set body = 'Sample: gone' where id = pg_temp.rid('K1') $$, '42501', null,
  'edit: not by a direct update');

select pg_temp.login('a0000000-0000-0000-0000-000000000432');
select throws_ok($$ select public.edit_comment(pg_temp.rid('K1'), 3, 'Sample: the PE rewrites it') $$, '42501', null,
  'edit: only the author');
select is((select count(*)::int from public.comment_edits where comment_id = pg_temp.rid('K1')), 2,
  'edit: the PE reads the earlier texts');
select pg_temp.login('a0000000-0000-0000-0000-000000000434');
select is((select count(*)::int from public.comment_edits), 0, 'edit: another sub reads no earlier text');

-- ---------------------------------------------------------------------------------------------------------------
-- Nobody deletes: the author, the admin, the service role, the database owner
-- ---------------------------------------------------------------------------------------------------------------
select pg_temp.login('a0000000-0000-0000-0000-000000000433');
select throws_ok($$ delete from public.comments where id = pg_temp.rid('K1') $$, '42501', null, 'delete: not the author');
select throws_ok($$ delete from public.comment_edits $$, '42501', null, 'delete: not an earlier text');
select pg_temp.login('a0000000-0000-0000-0000-000000000431');
select throws_ok($$ delete from public.comments where id = pg_temp.rid('K2') $$, '42501', null, 'delete: not the project admin');
select throws_ok($$ insert into public.comments (org_id, project_id, entity_type, entity_id, author_id, body)
  values ('b0000000-0000-0000-0000-000000000431', 'c0000000-0000-0000-0000-000000000431', 'rfi', pg_temp.rid('R'),
          'a0000000-0000-0000-0000-000000000431', 'Sample') $$, '42501', null, 'add: not by a direct insert');
reset role;
set local role service_role;
select pg_temp.login_service();
select throws_ok($$ delete from public.comments where id = pg_temp.rid('K1') $$, '42501', null, 'delete: not the service role');
reset role;
select throws_ok($$ delete from public.comments where id = pg_temp.rid('K1') $$, '42501', 'comments are a permanent record',
  'delete: not even the database owner');
select throws_ok($$ update public.comment_edits set body = 'Sample: rewritten history' $$, '42501',
  'comments are a permanent record', 'history: earlier texts never change');
update public.comments set body = 'Sample: fixed by support' where id = pg_temp.rid('K2');
select is(pg_temp.edits('K2'), 1, 'history: even an owner''s change keeps the original');
select throws_ok($$ update public.comments set entity_id = pg_temp.rid('D') where id = pg_temp.rid('K2') $$, '42501', null,
  'history: a comment never moves to another item');

-- ---------------------------------------------------------------------------------------------------------------
-- Other items: a daily draft (only its author), a correction (the viewer reads, cannot write), a bid document (the
-- bidder reads, cannot write; the uploader gets the line)
-- ---------------------------------------------------------------------------------------------------------------
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000433');
select lives_ok($$ select public.add_comment('c0000000-0000-0000-0000-000000000431', 'daily_report', pg_temp.rid('D'),
  'Sample: crane down at 2 pm.') $$, 'daily: the author comments on his draft');
select is(pg_temp.lines('D', 'comment.added'), 0, 'daily: a draft has nobody else to tell');
select is(pg_temp.sees('a0000000-0000-0000-0000-000000000432', 'D'), 0, 'daily: the PE (reads submitted ones) sees nothing on a draft');

select pg_temp.login('a0000000-0000-0000-0000-000000000435');
select ok(public.comment_target_readable('c0000000-0000-0000-0000-000000000431', 'correction', pg_temp.rid('C')),
  'correction: the viewer may read it');
select is((public.comment_list('c0000000-0000-0000-0000-000000000431', 'correction', pg_temp.rid('C')) ->> 'can_write'), 'false',
  'correction: the viewer gets no box');
select throws_ok($$ select public.add_comment('c0000000-0000-0000-0000-000000000431', 'correction', pg_temp.rid('C'), 'Sample') $$,
  '42501', null, 'correction: the viewer cannot comment');

select pg_temp.login('a0000000-0000-0000-0000-000000000436');
select ok(public.comment_target_readable('c0000000-0000-0000-0000-000000000431', 'file', pg_temp.rid('F')),
  'file: the bidder may read the bid document');
select throws_ok($$ select public.add_comment('c0000000-0000-0000-0000-000000000431', 'file', pg_temp.rid('F'), 'Sample') $$,
  '42501', null, 'file: the bidder cannot comment (other bidders would read it)');

select pg_temp.login('a0000000-0000-0000-0000-000000000432');
select lives_ok($$ select public.add_comment('c0000000-0000-0000-0000-000000000431', 'file', pg_temp.rid('F'),
  'Sample: sheet 3 is missing.') $$, 'file: the PE comments');
select is(pg_temp.lines('F', 'comment.added'), 1, 'file: the uploader gets the line');

-- ---------------------------------------------------------------------------------------------------------------
-- Unknown types, the wrong job, outsiders, anon
-- ---------------------------------------------------------------------------------------------------------------
select ok(not public.comment_target_readable('c0000000-0000-0000-0000-000000000431', 'submittal', pg_temp.rid('R')),
  'gate: an unknown type is refused');
select throws_ok($$ select public.add_comment('c0000000-0000-0000-0000-000000000431', 'bid_question', pg_temp.rid('R'), 'Sample') $$,
  'P0002', null, 'add: refused on a type that takes no comments');
select pg_temp.login('a0000000-0000-0000-0000-000000000437');
select is(pg_temp.sees('a0000000-0000-0000-0000-000000000437', 'R'), 0, 'outsider: reads nothing');
select throws_ok($$ select public.add_comment('c0000000-0000-0000-0000-000000000431', 'file', pg_temp.rid('F'), 'Sample') $$,
  'P0002', null, 'outsider: cannot comment');

reset role;
set local role anon;
select throws_ok($$ select count(*) from public.comments $$, '42501', null, 'anon: cannot read comments');
select throws_ok($$ select public.add_comment('c0000000-0000-0000-0000-000000000431', 'file',
  'e0000000-0000-0000-0000-000000000431', 'Sample') $$, '42501', null, 'anon: cannot comment');

select * from finish();
rollback;
