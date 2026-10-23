begin;
select plan(48);
-- Migration 0106 (Jesse, Oct 22): fire / life safety RFIs and submittals go to the fire marshal once the design team has
-- answered them, and he records Approved or Not approved. He reads the marked items that reached him and nothing more:
-- no unmarked submittal, no unanswered RFI. Everyone else's access is unchanged. A decision is a record, a later one
-- supersedes it, and who marked it gets a board line.
\ir _helpers.psql

create temp table ids (k text primary key, v uuid);
grant all on ids to public;
create function pg_temp.rid(p_k text) returns uuid language sql stable as $$ select v from ids where k = p_k $$;
-- The keyed files a person reads in the files table (logs them in).
create function pg_temp.files_of(p_uid uuid) returns text[] language plpgsql as $$
begin
  perform pg_temp.login(p_uid);
  return coalesce((select array_agg(i.k order by i.k collate "C") from public.files f join ids i on i.v = f.id), '{}'::text[]);
end $$;
create function pg_temp.rfis_of(p_uid uuid) returns text[] language plpgsql as $$
begin
  perform pg_temp.login(p_uid);
  return coalesce((select array_agg(i.k order by i.k collate "C") from public.rfis r join ids i on i.v = r.id), '{}'::text[]);
end $$;
create function pg_temp.review_of(p_uid uuid) returns text[] language plpgsql as $$
begin
  perform pg_temp.login(p_uid);
  return coalesce((select array_agg(i.k || ':' || coalesce(l.decision, 'waiting') order by i.k collate "C")
                     from public.ofs_review_list('c0000000-0000-0000-0000-000000000931') l
                     join ids i on i.v = coalesce(l.rfi_id, l.file_id)), '{}'::text[]);
end $$;
create function pg_temp.item_of(p_k text) returns uuid language sql stable security definer as $$
  select i.id from public.ofs_items i where i.rfi_id = pg_temp.rid(p_k) or i.file_id = pg_temp.rid(p_k) $$;
create function pg_temp.version_of(p_k text) returns int language sql stable security definer as $$
  select i.version from public.ofs_items i where i.rfi_id = pg_temp.rid(p_k) or i.file_id = pg_temp.rid(p_k) $$;
create function pg_temp.lines_to(p_uid uuid, p_kind text) returns int language sql stable security definer as $$
  select count(*)::int from public.activity a join public.activity_recipients ar on ar.activity_id = a.id
   where a.project_id = 'c0000000-0000-0000-0000-000000000931' and a.kind = p_kind and ar.user_id = p_uid $$;
grant execute on all functions in schema pg_temp to public;

select pg_temp.mk_user('a0000000-0000-0000-0000-000000000931', 'probe+or-admin@example.test', 'Ada Admin');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000932', 'probe+or-pm@example.test', 'Pia PM');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000933', 'probe+or-ior@example.test', 'Ivo Inspector');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000934', 'probe+or-ahj@example.test', 'Dana Deputy');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000935', 'probe+or-sub@example.test', 'Sam Sub');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000936', 'probe+or-out@example.test', 'Otto Outsider');

insert into public.orgs (id, name, kind, created_by) values
  ('b0000000-0000-0000-0000-000000000931', 'Sample Review Builders', 'gc', 'a0000000-0000-0000-0000-000000000931');
insert into public.projects (id, org_id, name, stage, timezone, settings, created_by) values
  ('c0000000-0000-0000-0000-000000000931', 'b0000000-0000-0000-0000-000000000931', 'Sample Review Job', 'construction',
   'America/Los_Angeles', '{"ir_ofs_allowed": true}', 'a0000000-0000-0000-0000-000000000931');
insert into public.project_members (org_id, project_id, user_id, invite_email, role, status)
select 'b0000000-0000-0000-0000-000000000931', 'c0000000-0000-0000-0000-000000000931', u::uuid, e, r, 'active'
  from (values ('a0000000-0000-0000-0000-000000000932', 'probe+or-pm@example.test', 'pm'),
               ('a0000000-0000-0000-0000-000000000933', 'probe+or-ior@example.test', 'inspector'),
               ('a0000000-0000-0000-0000-000000000934', 'probe+or-ahj@example.test', 'ahj'),
               ('a0000000-0000-0000-0000-000000000935', 'probe+or-sub@example.test', 'sub')) v(u, e, r);

-- ---------------------------------------------------------------------------------------------------------------------
-- The matrix and the fire list
-- ---------------------------------------------------------------------------------------------------------------------
select is((select array_agg(role order by role) from public.role_permissions where capability = 'ofs.review'),
  '{ahj}'::text[], 'matrix: ofs.review is the fire marshal''s');
select is((select array_agg(role order by role) from public.role_permissions where capability = 'files.read_submittals'),
  (select array_agg(role order by role) from public.role_permissions where capability = 'files.read_project' and role <> 'ahj'),
  'matrix: files.read_submittals is every Plans reader but the fire marshal');
select is(public.ofs_fire_list('c0000000-0000-0000-0000-000000000931'), '{21,28,078100,078123,078400,078413,078443}'::text[],
  'a job without its own list: the standard one');
update public.projects set settings = settings || '{"ofs_fire_sections": ["28", "0784", "nope", "087100"]}'
 where id = 'c0000000-0000-0000-0000-000000000931';
select ok(public.ofs_fire_list('c0000000-0000-0000-0000-000000000931') = '{0784,087100,28}'::text[]
          and public.ofs_section_is_fire('c0000000-0000-0000-0000-000000000931', '078413')
          and not public.ofs_section_is_fire('c0000000-0000-0000-0000-000000000931', '211313'),
  'the job''s own list (2, 4 or 6 digits, the rest ignored) replaces it');
update public.projects set settings = settings - 'ofs_fire_sections' where id = 'c0000000-0000-0000-0000-000000000931';
select ok(public.ofs_section_of_text('Spec 21 13 13, sheet A-501') = '211313' and public.ofs_section_of_text('092900_04.0') = '092900'
          and public.ofs_section_of_text('RFI 4, 10/12, A-501') is null,
  'a section from text: spaced or not, never part of a longer number');

-- ---------------------------------------------------------------------------------------------------------------------
-- The job: its sections, files and RFIs
-- ---------------------------------------------------------------------------------------------------------------------
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000932');
insert into ids select 's_' || s.kind, s.folder_id from public.files_sections('c0000000-0000-0000-0000-000000000931') s;
reset role;
insert into ids select 'uploaded', fo.id from public.folders fo
 where fo.parent_id = pg_temp.rid('s_rfis') and fo.name = 'Uploaded';
insert into public.files (id, org_id, project_id, folder_id, storage_path, original_name, mime, created_by, scan_status,
                          upload_complete, spec_section)
select v.id::uuid, 'b0000000-0000-0000-0000-000000000931', 'c0000000-0000-0000-0000-000000000931', pg_temp.rid(v.folder),
       'test/ofs/' || v.name, v.name, 'application/pdf', 'a0000000-0000-0000-0000-000000000932', 'clean', true, v.section
  from (values
    ('e0000000-0000-0000-0000-000000000931', 's_plans', 'A101 Sample Plan.pdf', null),
    ('e0000000-0000-0000-0000-000000000932', 's_submittals', '211313_01.0_Sample Sprinkler Shop Drawings_NET.pdf', '211313'),
    ('e0000000-0000-0000-0000-000000000933', 's_submittals', '092900_04.0_Sample Board_NET.pdf', '092900'),
    ('e0000000-0000-0000-0000-000000000934', 'uploaded', 'RFI 020 Sample fire alarm response.pdf', '283100'),
    ('e0000000-0000-0000-0000-000000000935', 'uploaded', 'RFI 021 Sample door response.pdf', '081113')
  ) as v (id, folder, name, section);
insert into ids values
  ('plan', 'e0000000-0000-0000-0000-000000000931'), ('sub_fire', 'e0000000-0000-0000-0000-000000000932'),
  ('sub_board', 'e0000000-0000-0000-0000-000000000933'), ('doc_fire', 'e0000000-0000-0000-0000-000000000934'),
  ('doc_door', 'e0000000-0000-0000-0000-000000000935');
insert into public.rfis (id, org_id, project_id, created_by, number, status, title, question, refs, issued_at, issued_hash,
                         answer, answered_at, answered_by)
select v.id::uuid, 'b0000000-0000-0000-0000-000000000931', 'c0000000-0000-0000-0000-000000000931',
       'a0000000-0000-0000-0000-000000000932', v.n, v.status, v.title, 'Sample question?', v.refs,
       case when v.n is not null then now() end, case when v.n is not null then repeat('a', 64) end,
       case when v.status = 'answered' then 'Sample answer.' end, case when v.status = 'answered' then now() end,
       case when v.status = 'answered' then 'a0000000-0000-0000-0000-000000000932'::uuid end
  from (values
    ('90000000-0000-0000-0000-000000000931', 1, 'answered', 'Sample sprinkler head spacing', 'Spec 21 13 13'),
    ('90000000-0000-0000-0000-000000000932', 2, 'answered', 'Sample board joint', 'Spec 09 29 00'),
    ('90000000-0000-0000-0000-000000000933', 3, 'open', 'Sample alarm device height', 'Spec 28 31 00')
  ) as v (id, n, status, title, refs);
insert into ids values ('rfi_fire', '90000000-0000-0000-0000-000000000931'), ('rfi_board', '90000000-0000-0000-0000-000000000932'),
  ('rfi_open', '90000000-0000-0000-0000-000000000933');

select is((select array_agg(i.k order by i.k) from public.ofs_items o join ids i on i.v = o.rfi_id where o.marked and o.source = 'suggested'),
  '{rfi_fire,rfi_open}'::text[], 'an RFI whose Reference names a fire section is marked on by itself, the others not');

set local role authenticated;
select is(pg_temp.files_of('a0000000-0000-0000-0000-000000000935'), '{doc_door,doc_fire,plan,sub_board,sub_fire}'::text[],
  'sub: Plans, every submittal and RFI document as before');
select is(pg_temp.files_of('a0000000-0000-0000-0000-000000000934'), '{plan}'::text[],
  'fire marshal: nothing marked yet, so Plans only');
select is(pg_temp.rfis_of('a0000000-0000-0000-0000-000000000934'), '{rfi_fire}'::text[],
  'fire marshal: the answered fire RFI, not the other answered one, not the marked one still open');
select is(pg_temp.rfis_of('a0000000-0000-0000-0000-000000000935'), '{rfi_board,rfi_fire}'::text[],
  'sub: every answered RFI, as before');
select pg_temp.login('a0000000-0000-0000-0000-000000000934');
select throws_ok($$ select * from public.authorize_download('e0000000-0000-0000-0000-000000000932') $$, '42501', 'forbidden',
  'fire marshal: no download of an unmarked submittal');

-- ---------------------------------------------------------------------------------------------------------------------
-- Marking
-- ---------------------------------------------------------------------------------------------------------------------
select pg_temp.login('a0000000-0000-0000-0000-000000000932');
select is(public.ofs_suggest(array['e0000000-0000-0000-0000-000000000932', 'e0000000-0000-0000-0000-000000000933',
                                   'e0000000-0000-0000-0000-000000000931']::uuid[]), 1,
  'suggested: the submittal in division 21, not the board, not a plan');
select is((public.ofs_mark(p_on => true, p_file_id => 'e0000000-0000-0000-0000-000000000934', p_version => 0))->>'marked', 'true',
  'the PM marks an RFI document');
select is((public.ofs_mark(p_on => true, p_file_id => 'e0000000-0000-0000-0000-000000000934', p_version => 0))->>'version', '1',
  'marked again: the same answer, nothing new');
select throws_ok($$ select public.ofs_mark(p_on => false, p_file_id => 'e0000000-0000-0000-0000-000000000934', p_version => 7) $$, '40001', null,
  'a stale version is refused');
select is((public.ofs_item_state(null, null, 'e0000000-0000-0000-0000-000000000933'))->>'may_mark', 'true',
  'an unmarked submittal: the PM may mark it');
select throws_ok($$ select public.ofs_mark(p_on => true, p_file_id => 'e0000000-0000-0000-0000-000000000931', p_version => 0) $$, '22023', null,
  'a plan is no RFI or submittal');
select pg_temp.login('a0000000-0000-0000-0000-000000000935');
select throws_ok($$ select public.ofs_mark(p_on => true, p_file_id => 'e0000000-0000-0000-0000-000000000933', p_version => 0) $$, '42501', 'forbidden',
  'the sub marks no one''s submittal');
select is(public.ofs_item_state(null, null, 'e0000000-0000-0000-0000-000000000933'), null,
  'the sub: nothing to show on an unmarked submittal');
select pg_temp.login('a0000000-0000-0000-0000-000000000934');
select throws_ok($$ select public.ofs_mark(p_on => false, p_rfi_id => '90000000-0000-0000-0000-000000000931', p_version => 1) $$, '42501', 'forbidden',
  'the fire marshal marks nothing');
select pg_temp.login('a0000000-0000-0000-0000-000000000933');
select is((public.ofs_mark(p_on => true, p_rfi_id => '90000000-0000-0000-0000-000000000932', p_version => 0))->>'marked', 'true',
  'the inspector (who sends OFS requests) marks an RFI');
select is((public.ofs_mark(p_on => false, p_rfi_id => '90000000-0000-0000-0000-000000000932', p_version => 1))->>'marked', 'false',
  'and clears it (Undo)');

select is(pg_temp.files_of('a0000000-0000-0000-0000-000000000934'), '{doc_fire,plan,sub_fire}'::text[],
  'fire marshal: the marked submittal and RFI document, nothing else');
select is(pg_temp.review_of('a0000000-0000-0000-0000-000000000934'), '{doc_fire:waiting,rfi_fire:waiting,sub_fire:waiting}'::text[],
  'For review: the three that reached him, waiting');
select is((select storage_path from public.authorize_download('e0000000-0000-0000-0000-000000000932')), 'test/ofs/211313_01.0_Sample Sprinkler Shop Drawings_NET.pdf',
  'fire marshal: downloads the marked submittal');
select is((select n from public.my_tool_counts('c0000000-0000-0000-0000-000000000931') where entity_type = 'ofs_item'), 3,
  'the rail counts what waits on him');
select ok((select 'review' = any (tools) and not ('rfis' = any (tools))
             from public.my_readable_tools('c0000000-0000-0000-0000-000000000931')),
  'fire marshal: For review on his rail, his RFIs are there (not the RFI tool)');
select pg_temp.login('a0000000-0000-0000-0000-000000000932');
select ok((select 'rfis' = any (tools) and not ('review' = any (tools))
             from public.my_readable_tools('c0000000-0000-0000-0000-000000000931')),
  'PM: the RFI tool, no For review');
select is(pg_temp.review_of('a0000000-0000-0000-0000-000000000932'), '{}'::text[], 'PM: no review list');

-- ---------------------------------------------------------------------------------------------------------------------
-- Deciding
-- ---------------------------------------------------------------------------------------------------------------------
select pg_temp.login('a0000000-0000-0000-0000-000000000932');
select throws_ok(format('select public.ofs_decide(%L, 1, %L)', pg_temp.item_of('sub_fire'), 'approved', null), '42501', 'forbidden',
  'the PM does not decide');
select pg_temp.login('a0000000-0000-0000-0000-000000000934');
select is((public.ofs_decide(pg_temp.item_of('sub_fire'), pg_temp.version_of('sub_fire'), 'approved', null,
                             'f0000000-0000-0000-0000-000000000931'))->'decision'->>'decision', 'approved',
  'the fire marshal approves the submittal');
select is((public.ofs_decide(pg_temp.item_of('sub_fire'), 1, 'approved', null, 'f0000000-0000-0000-0000-000000000931'))->'decision'->>'decision',
  'approved', 'the same tap again (its key): the same answer');
select is((select count(*)::int from public.ofs_decisions where item_id = pg_temp.item_of('sub_fire')), 1, 'and one decision');
select throws_ok(format('select public.ofs_decide(%L, 0, %L, null, %L)', pg_temp.item_of('doc_fire'), 'approved',
                        'f0000000-0000-0000-0000-000000000932'), '40001', null, 'a stale version is refused');
select is((public.ofs_decide(pg_temp.item_of('rfi_fire'), pg_temp.version_of('rfi_fire'), 'not_approved',
                             '  Sample: heads too far from the wall.  ', 'f0000000-0000-0000-0000-000000000933'))->'decision'->>'comment',
  'Sample: heads too far from the wall.', 'Not approved on the RFI, with his comment');
select is((public.ofs_decide(pg_temp.item_of('sub_fire'), pg_temp.version_of('sub_fire'), 'not_approved', 'Sample second look.',
                             'f0000000-0000-0000-0000-000000000934'))->'history'->0->>'decision', 'approved',
  'a later decision supersedes the earlier one, which stays in the history');
select throws_ok(format('select public.ofs_decide(%L, 1, %L, null, %L)', pg_temp.item_of('rfi_open'), 'approved',
                        'f0000000-0000-0000-0000-000000000935'), 'P0002', null, 'an RFI not answered yet: not his');
select is(pg_temp.review_of('a0000000-0000-0000-0000-000000000934'),
  '{doc_fire:waiting,rfi_fire:not_approved,sub_fire:not_approved}'::text[], 'For review: one waiting, two done');
reset role;
select throws_ok(format('update public.ofs_decisions set comment = %L where item_id = %L', 'x', pg_temp.item_of('sub_fire')),
  '42501', null, 'a decision never changes');
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000932');
select throws_ok(format('select public.ofs_mark(p_on => false, p_file_id => %L, p_version => %s)', 'e0000000-0000-0000-0000-000000000932', pg_temp.version_of('sub_fire')),
  '22023', null, 'once OFS has decided, the mark stays');
select is((public.ofs_item_state(null, null, 'e0000000-0000-0000-0000-000000000932'))->'decision'->>'decision', 'not_approved',
  'the PM sees OFS: Not approved on the submittal');
select is((select count(*)::int from public.ofs_decisions where item_id = pg_temp.item_of('sub_fire')), 2,
  'the PM reads its decisions');
reset role;
select ok(pg_temp.lines_to('a0000000-0000-0000-0000-000000000932', 'ofs.approved') = 1
          and pg_temp.lines_to('a0000000-0000-0000-0000-000000000932', 'ofs.not_approved') = 2,
  'who marked them gets a board line per decision');
set local role authenticated;

-- ---------------------------------------------------------------------------------------------------------------------
-- The designated person's start page
-- ---------------------------------------------------------------------------------------------------------------------
select pg_temp.login('a0000000-0000-0000-0000-000000000933');
select is((select array_agg(x->>'state' order by x->>'state') from jsonb_array_elements(
             public.ofs_desk('c0000000-0000-0000-0000-000000000931')->'rows') x),
  '{not_approved,not_approved,waiting}'::text[], 'the inspector: what waits on OFS and what came back');
select pg_temp.login('a0000000-0000-0000-0000-000000000935');
select is(public.ofs_desk('c0000000-0000-0000-0000-000000000931'), null, 'the sub: no start page');
select pg_temp.login('a0000000-0000-0000-0000-000000000936');
select throws_ok($$ select public.ofs_desk('c0000000-0000-0000-0000-000000000931') $$, 'P0002', null, 'someone not on the job: nothing');
select is(pg_temp.files_of('a0000000-0000-0000-0000-000000000936'), '{}'::text[], 'someone not on the job reads no file');
reset role;

select ok(not has_function_privilege('authenticated', 'public.ofs_item_json(uuid)', 'EXECUTE')
          and not has_function_privilege('authenticated', 'public.ofs_may_mark_file(uuid)', 'EXECUTE')
          and not has_function_privilege('anon', 'public.ofs_decide(uuid, integer, text, text, uuid)', 'EXECUTE'),
  'the helpers stay internal, and nothing for anon');

select * from finish();
rollback;
