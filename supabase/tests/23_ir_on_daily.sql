begin;
select plan(9);
-- Migration 0029: an IR's result goes on the owning inspector's daily for the inspection date, once; a regenerated
-- IR updates that entry; a deleted PDF takes it off; a moved date moves it; a deleted report stays deleted; an
-- inspector without a daily setup on the job gets nothing.
\ir _helpers.psql

select pg_temp.mk_user('a0000000-0000-0000-0000-000000000231', 'probe+ird-insp@example.test', 'IR Inspector');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000232', 'probe+ird-sub@example.test', 'IR Sub');
insert into public.orgs (id, name, kind, created_by)
values ('b0000000-0000-0000-0000-000000000231', 'IRD Inspections', 'inspector', 'a0000000-0000-0000-0000-000000000231');
insert into public.projects (id, org_id, name, stage, created_by, timezone)
values ('c0000000-0000-0000-0000-000000000231', 'b0000000-0000-0000-0000-000000000231', 'IRD Job', 'construction',
        'a0000000-0000-0000-0000-000000000231', 'America/Los_Angeles');
insert into public.daily_setups (org_id, project_id, author_id, report_type, settings, created_by)
values ('b0000000-0000-0000-0000-000000000231', 'c0000000-0000-0000-0000-000000000231',
        'a0000000-0000-0000-0000-000000000231', 'daily', '{"standing_note": "Sample note"}',
        'a0000000-0000-0000-0000-000000000231');

-- Two server-made PDFs to point at (the IR's first render and its regeneration).
insert into public.files (id, org_id, project_id, folder_id, storage_path, original_name, mime, scan_status, upload_complete, created_by)
select v.id, 'b0000000-0000-0000-0000-000000000231', 'c0000000-0000-0000-0000-000000000231', f.id,
       'project/probe/' || v.id, 'IR 1.pdf', 'application/pdf', 'clean', true, 'a0000000-0000-0000-0000-000000000231'
  from (values ('e0000000-0000-0000-0000-000000000231'::uuid), ('e0000000-0000-0000-0000-000000000232'::uuid)) v(id)
  cross join lateral (select id from public.folders where project_id = 'c0000000-0000-0000-0000-000000000231' limit 1) f;

insert into public.inspection_requests (id, org_id, project_id, number, requested_by, company, request_date, duration_kind,
                                        kind, items, notice_ack_at, status, owner_id, result, result_note)
values ('d0000000-0000-0000-0000-000000000231', 'b0000000-0000-0000-0000-000000000231', 'c0000000-0000-0000-0000-000000000231',
        1, 'a0000000-0000-0000-0000-000000000232', 'Sample Framing', '2026-10-06', 'all_day', 'ior', 'Shear walls, level 2',
        now(), 'confirmed', 'a0000000-0000-0000-0000-000000000231', 'approved', 'No issues');

create function pg_temp.entries(p_day date) returns jsonb language sql as $$
  select coalesce((select content->'inspections' from public.daily_reports
                    where project_id = 'c0000000-0000-0000-0000-000000000231'
                      and author_id = 'a0000000-0000-0000-0000-000000000231' and report_date = p_day), 'null'::jsonb)
$$;

-- Generate: the report for the inspection date is made and gets one entry.
update public.inspection_requests set ir_file_id = 'e0000000-0000-0000-0000-000000000231', signed_at = now(),
  content_hash = 'h1', status = 'complete' where id = 'd0000000-0000-0000-0000-000000000231';
select is(jsonb_array_length(pg_temp.entries('2026-10-06')), 1, 'generate: one entry on the inspection date''s report');
select ok(pg_temp.entries('2026-10-06')->0->>'text' like 'IR 1 %Approved. Shear walls, level 2. No issues',
  'generate: the entry is the IR summary');
select is((select content->>'standing_note' from public.daily_reports where project_id = 'c0000000-0000-0000-0000-000000000231'
           and report_date = '2026-10-06'), 'Sample note', 'generate: a missing report is made the usual way (setup filled)');

-- Regenerate after a change: still one entry, updated.
update public.inspection_requests set result = 'not_approved', result_note = 'Missing nails',
  ir_file_id = 'e0000000-0000-0000-0000-000000000232', content_hash = 'h2' where id = 'd0000000-0000-0000-0000-000000000231';
select is(jsonb_array_length(pg_temp.entries('2026-10-06')), 1, 'regenerate: still one entry');
select ok(pg_temp.entries('2026-10-06')->0->>'text' like '%Not approved%Missing nails', 'regenerate: the entry is updated');

-- A moved date moves the entry.
update public.inspection_requests set request_date = '2026-10-07', ir_file_id = 'e0000000-0000-0000-0000-000000000231'
 where id = 'd0000000-0000-0000-0000-000000000231';
select is(jsonb_array_length(pg_temp.entries('2026-10-06')), 0, 'moved: off the old date''s report');
select is(jsonb_array_length(pg_temp.entries('2026-10-07')), 1, 'moved: on the new date''s report');

-- Delete PDF & start over: the entry comes off.
update public.inspection_requests set ir_file_id = null, status = 'confirmed' where id = 'd0000000-0000-0000-0000-000000000231';
select is(jsonb_array_length(pg_temp.entries('2026-10-07')), 0, 'delete pdf: the entry comes off');

-- A deleted report stays deleted.
update public.daily_reports set deleted_at = now()
 where project_id = 'c0000000-0000-0000-0000-000000000231' and report_date = '2026-10-07';
update public.inspection_requests set ir_file_id = 'e0000000-0000-0000-0000-000000000232', status = 'complete'
 where id = 'd0000000-0000-0000-0000-000000000231';
select is(jsonb_array_length(pg_temp.entries('2026-10-07')), 0, 'a deleted report is not written to or brought back');

select * from finish();
rollback;
