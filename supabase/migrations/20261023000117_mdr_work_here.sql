-- 0117 Work an MDR request in the suite, and quick phrases (Jesse, Oct 23, 18:50: on Hunter Hall staging he "can't do
-- anything, it gives me a view like the GC"). The first import made every Hunter Hall request an MDR copy, and 0112
-- makes copies view only. That took in the 87 requests typed into the suite by hand before the mirror (adopted by
-- number), which were the suite's own.
--   1. Work it here: whoever decides inspections on the job (ir.decide) turns a copy into the suite's own request, one
--      tap (ir_work_here). It keeps its data, files and number. mdr_id moves to mdr_source_id, with who and when. The
--      nightly import never changes or copies it again (skipped: worked in the suite). Its number joins the suite's
--      own numbers, which stay unique: a copy whose number one of the job's own requests already carries is refused
--      with the reason, never renumbered (the number is on MDR's paper). Audited (ir_events 'mdr_work_here').
--   2. The adopted requests go back to being the suite's own, the same way (mdr_back_to_own, run once here as data,
--      safe to run again). An adopted request is one the import linked by number: its history has the import's update
--      that set mdr_id where there was none.
--   3. Reversing one (the lead, owner only): mdr_undo_work_here makes it a copy again (runbook mdr-daily-mirror.md).
--   4. Quick phrases: each person's own saved phrases (quick_phrases), read by their owner only, at most 50 live, 40
--      characters of name and 500 of text, for one place or every place. Written only through quick_phrase_add, _edit,
--      _remove, _restore (the Undo) and _order, each safe to repeat. Removed ones are kept (deleted_at). None ship.
-- MDR is never written to. Nothing here holds a job, a person or a phrase.

-- =====================================================================================================================
-- 1. Worked here
-- =====================================================================================================================
alter table public.inspection_requests
  add column mdr_source_id uuid,
  add column mdr_detached_at timestamptz,
  add column mdr_detached_by uuid references auth.users(id);
create unique index inspection_requests_mdr_source on public.inspection_requests (project_id, mdr_source_id)
  where mdr_source_id is not null;
alter table public.inspection_requests add constraint inspection_requests_mdr_detached
  check ((mdr_source_id is null) = (mdr_detached_at is null)
         and (mdr_source_id is null or mdr_id is null)
         and (mdr_detached_by is null or mdr_detached_at is not null));

-- A request worked here from an MDR copy keeps what MDR gave it: maybe no suite requester, and an OFS send with no
-- suite sender.
alter table public.inspection_requests drop constraint inspection_requests_requester_kind;
alter table public.inspection_requests add constraint inspection_requests_requester_kind
  check (requested_by is not null or mdr_id is not null or mdr_source_id is not null
         or (requester_name is not null and (requester_phone is not null or requester_email is not null)));
alter table public.inspection_requests drop constraint inspection_requests_ofs_sent_check;
alter table public.inspection_requests add constraint inspection_requests_ofs_sent_check
  check (((ofs_sent_at is null) = (ofs_sent_by is null)
          or ((mdr_id is not null or mdr_source_id is not null) and ofs_sent_by is null))
         and (ofs_sent_at is null or kind = 'ofs'));

-- View only, as 0112, and one more change it lets through: the copy becoming the suite's own (app.mdr_detach is set
-- only inside ir_work_here and mdr_back_to_own), with nothing else on the row changed.
create or replace function public.tg_ir_mdr_view_only()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare v_keep text[] := array['mdr_id', 'mdr_source_id', 'mdr_detached_at', 'mdr_detached_by', 'version', 'updated_at'];
begin
  if old.mdr_id is null and new.mdr_id is null then return new; end if;
  if coalesce(current_setting('app.mdr_import', true), '') = 'on' then return new; end if;
  if coalesce(current_setting('app.mdr_detach', true), '') = 'on'
     and old.mdr_id is not null and new.mdr_id is null and new.mdr_source_id = old.mdr_id and new.mdr_detached_at is not null
     and (to_jsonb(new) - v_keep) = (to_jsonb(old) - v_keep) then
    return new;
  end if;
  -- The requester proving their email claims their requests (link_request_join): only requested_by, from none.
  if old.mdr_id is not null and old.requested_by is null and new.requested_by is not null
     and (to_jsonb(new) - array['requested_by', 'version', 'updated_at'])
         = (to_jsonb(old) - array['requested_by', 'version', 'updated_at']) then
    return new;
  end if;
  raise exception 'This request comes from MDR. It is view only.' using errcode = '42501';
end;
$$;
revoke execute on function public.tg_ir_mdr_view_only() from public, anon, authenticated;

-- One request: the copy becomes the suite's own. MDR's IR PDF still waiting to be copied is not taken (the suite makes
-- its own now), its attachments still come.
create or replace function public.mdr_detach_row(p_id uuid, p_by uuid)
returns public.inspection_requests
language plpgsql
set search_path = public, pg_temp
as $$
declare r public.inspection_requests;
begin
  perform set_config('app.mdr_detach', 'on', true);
  perform set_config('app.ir_action', 'mdr_work_here', true);
  update public.inspection_requests
     set mdr_source_id = mdr_id, mdr_id = null, mdr_detached_at = now(), mdr_detached_by = p_by
   where id = p_id and mdr_id is not null
  returning * into r;
  perform set_config('app.mdr_detach', '', true);
  perform set_config('app.ir_action', '', true);
  update public.mdr_file_queue
     set status = 'refused', error = 'Worked in the suite.', updated_at = now()
   where request_id = p_id and role = 'ir_pdf' and status = 'queued';
  return r;
end;
$$;
revoke execute on function public.mdr_detach_row(uuid, uuid) from public, anon, authenticated, service_role;

-- Work it here: whoever decides inspections on the job, on a copy they read. The same tap again answers the row.
create or replace function public.ir_work_here(p_request_id uuid, p_version int)
returns public.inspection_requests
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare r public.inspection_requests; v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into r from public.inspection_requests where id = p_request_id and deleted_at is null for update;
  if r.id is null or not public.ir_may_see(r.project_id, r.requested_by, r.kind, r.ofs_sent_at) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if not public.has_capability(r.project_id, 'ir.decide') then raise exception 'forbidden' using errcode = '42501'; end if;
  if r.mdr_id is null and r.mdr_source_id is not null then return r; end if;
  if r.mdr_id is null then raise exception 'This request is already the suite''s own.' using errcode = '22023'; end if;
  if r.version <> p_version then
    raise exception 'version_conflict: expected %, found %', p_version, r.version using errcode = '40001';
  end if;
  if exists (select 1 from public.inspection_requests o
              where o.project_id = r.project_id and o.number = r.number and o.mdr_id is null) then
    raise exception 'IR % is already one of this job''s own requests, so this copy stays view only.', r.number
      using errcode = '23505';
  end if;
  return public.mdr_detach_row(r.id, v_uid);
end;
$$;
revoke execute on function public.ir_work_here(uuid, int) from public, anon;
grant execute on function public.ir_work_here(uuid, int) to authenticated;

-- The requests the import adopted by number (typed in by hand before the mirror) are the suite's own again. A number
-- one of the job's own requests carries by now is left as a copy and listed. Database owner only. Safe to repeat.
create or replace function public.mdr_back_to_own()
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare q record; n int := 0; v_taken int[] := '{}';
begin
  for q in
    select r.id, r.project_id, r.number
      from public.inspection_requests r
      join public.mdr_job_links l on l.project_id = r.project_id
     where r.mdr_id is not null and r.number between coalesce(l.adopt_from, 0) and coalesce(l.adopt_to, -1)
       and exists (select 1 from public.ir_events e
                    where e.request_id = r.id and e.action = 'mdr' and e.changes ? 'mdr_id'
                      and e.changes->'mdr_id'->>0 is null and e.changes->'mdr_id'->>1 is not null)
     order by r.project_id, r.number, r.created_at
       for update of r
  loop
    if exists (select 1 from public.inspection_requests o
                where o.project_id = q.project_id and o.number = q.number and o.mdr_id is null) then
      v_taken := v_taken || q.number;
      continue;
    end if;
    perform public.mdr_detach_row(q.id, null);
    n := n + 1;
  end loop;
  return jsonb_build_object('back_to_own', n, 'number_taken', to_jsonb(v_taken));
end;
$$;
revoke execute on function public.mdr_back_to_own() from public, anon, authenticated, service_role;

-- The reverse of Work it here (the lead, by hand): the request is a copy again, view only, and MDR's next change to it
-- is copied over it. What the suite did to it meanwhile stays until then. Database owner only.
create or replace function public.mdr_undo_work_here(p_request_id uuid)
returns text
language plpgsql
set search_path = public, pg_temp
as $$
declare r public.inspection_requests;
begin
  select * into r from public.inspection_requests where id = p_request_id for update;
  if r.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if r.mdr_source_id is null then return 'unchanged: not worked here'; end if;
  perform set_config('app.mdr_import', 'on', true);
  perform set_config('app.ir_action', 'mdr_copy_again', true);
  update public.inspection_requests
     set mdr_id = mdr_source_id, mdr_source_id = null, mdr_detached_at = null, mdr_detached_by = null
   where id = r.id;
  perform set_config('app.mdr_import', '', true);
  perform set_config('app.ir_action', '', true);
  return 'a copy again';
end;
$$;
revoke execute on function public.mdr_undo_work_here(uuid) from public, anon, authenticated, service_role;

-- The import (0112, copied exactly) with two changes: a request worked here is skipped and listed, and adopting by
-- number never takes a request worked here.
create or replace function public.mdr_import_one(p_link public.mdr_job_links, p_row jsonb)
returns text
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_id uuid := (p_row->>'id')::uuid;
  v_updated timestamptz := (p_row->>'updated_at')::timestamptz;
  v_number int := nullif(p_row->>'ir_number', '')::int;
  v_types text[] := coalesce((select array_agg(t) from jsonb_array_elements_text(
                      case when jsonb_typeof(p_row->'inspection_types') = 'array' then p_row->'inspection_types' else '[]' end) t), '{}');
  v_urls text[] := coalesce((select array_agg(t) from jsonb_array_elements_text(
                      case when jsonb_typeof(p_row->'file_urls') = 'array' then p_row->'file_urls' else '[]' end) t), '{}');
  v_status_in text := lower(btrim(coalesce(p_row->>'status', '')));
  v_deleted boolean := nullif(p_row->>'deleted_at', '') is not null or v_status_in = 'deleted';
  v_kind text; v_special_name text; v_special uuid; v_date date; v_time time; v_dkind text; v_dmin int;
  v_status text; v_result text; v_company text; v_items text; v_email text; v_name text; v_created timestamptz;
  v_sent timestamptz; v_note text; v_loc text; v_att text;
  r public.inspection_requests; v_action text; u text; n int := 0;
begin
  if v_id is null or v_updated is null then raise exception 'MDR row without id or updated_at'; end if;
  -- Worked here (0117): the suite's own now. MDR's changes to it are not copied.
  if exists (select 1 from public.inspection_requests w where w.project_id = p_link.project_id and w.mdr_source_id = v_id) then
    return 'skipped:worked in the suite';
  end if;
  select * into r from public.inspection_requests where project_id = p_link.project_id and mdr_id = v_id;

  if v_deleted then
    if r.id is null then return 'skipped:deleted in MDR'; end if;
    if r.deleted_at is not null and r.mdr_updated_at = v_updated then return 'unchanged'; end if;
    update public.inspection_requests
       set deleted_at = coalesce(r.deleted_at, nullif(p_row->>'deleted_at', '')::timestamptz, now()), mdr_updated_at = v_updated
     where id = r.id;
    return 'hidden';
  end if;
  if v_number is null then return 'skipped:no IR number'; end if;
  if r.id is not null and r.mdr_updated_at = v_updated and r.deleted_at is null then return 'unchanged'; end if;

  -- What it is
  v_kind := public.mdr_ir_kind(v_types, p_row->>'special_type');
  if v_kind = 'special' then
    v_special_name := coalesce(nullif(btrim(p_row->>'special_type'), ''),
      (select t from unnest(v_types) t where lower(btrim(t)) not in ('special', 'periodic', 'as needed', 'regular') limit 1));
    select k.id into v_special from public.ir_special_kinds k
     where lower(k.name) = lower(btrim(v_special_name)) order by k.active desc, k.sort limit 1;
    if v_special is null then raise exception 'unknown special type %', coalesce(v_special_name, '(none)'); end if;
  end if;

  -- When
  v_created := coalesce(nullif(p_row->>'created_at', '')::timestamptz, v_updated);
  v_date := coalesce(public.mdr_sane_date(p_row->>'inspection_date'), public.mdr_sane_date(p_row->>'requested_date'),
                     public.mdr_fix_year(p_row->>'inspection_date', v_created));
  if v_date is null then raise exception 'no usable date'; end if;
  if nullif(p_row->>'inspection_time', '') is not null then
    v_time := (p_row->>'inspection_time')::time;
    v_time := make_time(extract(hour from v_time)::int, case when extract(minute from v_time) >= 30 then 30 else 0 end, 0);
  end if;
  if exists (select 1 from unnest(v_types) t where lower(btrim(t)) = 'periodic') then
    v_dkind := 'periodic';
  elsif lower(coalesce(p_row->>'flexible_display', '')) = 'flexible' or v_time is null then
    v_dkind := 'all_day';
  else
    v_dkind := 'timed';
    v_dmin := least(greatest(coalesce(nullif(p_row->>'duration', '')::int, 60), 5), 720);
  end if;

  -- Who and what
  v_company := left(coalesce(nullif(btrim(p_row->>'requester_company'), ''), nullif(btrim(p_row->>'subcontractor'), ''),
                             nullif(btrim(p_row->>'sub_trade'), ''), nullif(btrim(p_row->>'gc'), ''), 'Not given'), 200);
  v_name := left(nullif(btrim(coalesce(p_row->>'requester_name', '')), ''), 120);
  v_email := lower(btrim(coalesce(p_row->>'requester_email', '')));
  if length(v_email) > 320 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then v_email := null; end if;
  v_loc := nullif(btrim(coalesce(p_row->>'location_detail', '')), '');
  v_items := coalesce(nullif(btrim(coalesce(p_row->>'notes', '')), ''), nullif(btrim(coalesce(p_row->>'ir_title', '')), ''),
                      'IR ' || v_number);
  if v_loc is not null and position(lower(v_loc) in lower(v_items)) = 0 then v_items := v_items || E'\n' || v_loc; end if;
  v_items := left(v_items, 4000);
  v_note := left(nullif(btrim(coalesce(p_row->>'inspector_notes', '')), ''), 4000);
  v_att := case lower(coalesce(p_row->>'attendance', '')) when 'present_required' then 'be_present' when 'solo' then 'alone' end;

  -- A request typed in by hand before the mirror, with this number: adopted, not copied again. Never one worked here.
  if r.id is null and v_number between coalesce(p_link.adopt_from, 0) and coalesce(p_link.adopt_to, -1) then
    select * into r from public.inspection_requests q
     where q.project_id = p_link.project_id and q.mdr_id is null and q.mdr_source_id is null and q.deleted_at is null
       and q.number = v_number
     order by (q.request_date = v_date) desc, (q.start_time is not distinct from v_time) desc, q.created_at
     limit 1 for update;
    v_action := case when r.id is not null then 'adopted' end;
  end if;

  -- Where it stands
  v_result := public.mdr_ir_result(v_status_in);
  v_status := public.mdr_ir_status(v_status_in, r.ir_file_id is not null);
  if v_status is null then raise exception 'unknown MDR status %', coalesce(nullif(v_status_in, ''), '(none)'); end if;
  -- An OFS request MDR scheduled or decided had gone to OFS.
  v_sent := case when v_kind = 'ofs' and v_status_in in ('scheduled', 'approved', 'not_approved', 'postponed', 'confirmed')
                 then coalesce(r.ofs_sent_at, v_created) end;

  perform set_config('app.mdr_import', 'on', true);
  perform set_config('app.ir_action', 'mdr', true);
  if r.id is null then
    insert into public.inspection_requests (
      org_id, project_id, number, mdr_id, mdr_updated_at, created_at, company, request_date, start_time, duration_kind,
      duration_min, kind, special_kind_id, items, notice_ack_at, status, result, result_note, result_at, attendance,
      requester_name, requester_email, postpone_reason, postpone_note, postpone_until, postponed_at, postpone_count,
      ofs_sent_at)
    select p.org_id, p.id, v_number, v_id, v_updated, v_created, v_company, v_date, v_time, v_dkind, v_dmin, v_kind,
           v_special, v_items, v_created, v_status, v_result, v_note,
           case when v_result is not null then coalesce(nullif(p_row->>'approved_at', '')::timestamptz, v_updated) end,
           v_att, v_name, v_email,
           case when v_status = 'postponed' then coalesce(public.mdr_ir_postpone_reason(p_row->>'postpone_reason'), 'other') end,
           case when v_status = 'postponed' then left(nullif(btrim(coalesce(p_row->>'postpone_note', '')), ''), 1000) end,
           case when v_status = 'postponed' then public.mdr_sane_date(p_row->>'expected_date') end,
           case when v_status = 'postponed' then v_updated end,
           greatest(coalesce(nullif(p_row->>'postpone_count', '')::int, case when v_status = 'postponed' then 1 else 0 end), 0),
           v_sent
      from public.projects p where p.id = p_link.project_id
    returning * into r;
    v_action := 'inserted';
  else
    update public.inspection_requests
       set mdr_id = v_id, mdr_updated_at = v_updated, deleted_at = null, company = v_company, request_date = v_date,
           start_time = v_time, duration_kind = v_dkind, duration_min = v_dmin, kind = v_kind, special_kind_id = v_special,
           items = v_items, status = v_status, result = v_result, result_note = v_note,
           result_at = case when v_result is not null
                            then coalesce(nullif(p_row->>'approved_at', '')::timestamptz, r.result_at, v_updated) end,
           attendance = v_att, requester_name = v_name, requester_email = v_email,
           helper_id = case when v_kind = 'ofs' then null else helper_id end,
           postpone_reason = case when v_status = 'postponed'
                                  then coalesce(public.mdr_ir_postpone_reason(p_row->>'postpone_reason'), 'other') end,
           postpone_note = case when v_status = 'postponed'
                                then left(nullif(btrim(coalesce(p_row->>'postpone_note', '')), ''), 1000) end,
           postpone_until = case when v_status = 'postponed' then public.mdr_sane_date(p_row->>'expected_date') end,
           postponed_at = case when v_status = 'postponed' then coalesce(postponed_at, v_updated) end,
           postpone_count = greatest(coalesce(nullif(p_row->>'postpone_count', '')::int, postpone_count), 0),
           ofs_sent_at = v_sent, ofs_sent_by = case when v_sent is null then null else ofs_sent_by end,
           -- A request typed in as OFS that MDR has as another kind keeps none of its OFS steps.
           ofs_attest_by = case when v_kind = 'ofs' then ofs_attest_by end,
           ofs_attest_at = case when v_kind = 'ofs' then ofs_attest_at end,
           ofs_attest_text = case when v_kind = 'ofs' then ofs_attest_text end,
           ofs_ready_by = case when v_kind = 'ofs' then ofs_ready_by end,
           ofs_ready_at = case when v_kind = 'ofs' then ofs_ready_at end,
           special_required = case when v_kind = 'ofs' then special_required end,
           ofs_si_by = case when v_kind = 'ofs' then ofs_si_by end,
           ofs_si_at = case when v_kind = 'ofs' then ofs_si_at end,
           ofs_si_file_id = case when v_kind = 'ofs' then ofs_si_file_id end
     where id = r.id
    returning * into r;
    v_action := coalesce(v_action, 'updated');
    -- MDR's own PDF is MDR's record, never "out of date" here.
    update public.inspection_requests set pdf_stale = false where id = r.id and pdf_stale;
  end if;
  perform set_config('app.mdr_import', '', true);
  perform set_config('app.ir_action', '', true);

  -- Files wait for the mdr-files function: at most 20 attachments a request (the suite's limit), and the IR PDF.
  foreach u in array v_urls loop
    n := n + 1;
    exit when n > 20;
    insert into public.mdr_file_queue (project_id, request_id, role, url)
    values (r.project_id, r.id, 'attachment', u) on conflict (request_id, role, url) do nothing;
  end loop;
  if nullif(btrim(coalesce(p_row->>'ir_pdf_url', '')), '') is not null then
    insert into public.mdr_file_queue (project_id, request_id, role, url)
    values (r.project_id, r.id, 'ir_pdf', btrim(p_row->>'ir_pdf_url')) on conflict (request_id, role, url) do nothing;
  end if;
  return v_action;
end;
$$;
revoke execute on function public.mdr_import_one(public.mdr_job_links, jsonb) from public, anon, authenticated, service_role;

-- A file copied (0112, copied exactly) with one change: MDR's IR PDF arriving for a request worked here meanwhile is
-- not linked (the queue row is refused), so it never stands in for the suite's own IR.
create or replace function public.mdr_file_done(p_id uuid, p_file_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare q public.mdr_file_queue; f public.files; r public.inspection_requests;
begin
  if not public.is_service_role() then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into q from public.mdr_file_queue where id = p_id for update;
  if q.id is null or q.status <> 'working' then raise exception 'not_found' using errcode = 'P0002'; end if;
  select * into r from public.inspection_requests where id = q.request_id for update;
  if q.role = 'ir_pdf' and r.mdr_source_id is not null then
    update public.mdr_file_queue set status = 'refused', error = 'Worked in the suite.', updated_at = now() where id = q.id;
    return;
  end if;
  select * into f from public.files where id = p_file_id and project_id = q.project_id and deleted_at is null;
  if f.id is null or f.sha256 is null then raise exception 'The file is missing.' using errcode = '22023'; end if;
  if f.folder_id is distinct from public.ir_folder_make(q.project_id,
       case when q.role = 'attachment' then 'attachments' when r.kind = 'ofs' then 'ofs_reports' else 'reports' end) then
    raise exception 'The file is in the wrong folder.' using errcode = '22023';
  end if;
  perform set_config('app.mdr_import', 'on', true);
  perform set_config('app.ir_action', 'mdr_file', true);
  if q.role = 'attachment' then
    if not f.upload_complete then update public.files set upload_complete = true where id = f.id; end if;
    perform public.enqueue_job('scan_file', jsonb_build_object('file_id', f.id), q.project_id, 'scan_file:' || f.id::text);
    if not (f.id = any (r.attachment_ids)) and cardinality(r.attachment_ids) < 20 then
      update public.inspection_requests set attachment_ids = attachment_ids || f.id where id = r.id;
    end if;
  else
    update public.inspection_requests
       set ir_file_id = f.id, content_hash = f.sha256, signed_at = coalesce(signed_at, result_at, mdr_updated_at, now()),
           pdf_stale = false,
           status = case when result is not null and status in ('confirmed', 'complete') then 'complete' else status end
     where id = r.id;
  end if;
  perform set_config('app.mdr_import', '', true);
  perform set_config('app.ir_action', '', true);
  update public.mdr_file_queue set status = 'done', file_id = f.id, error = null, done_at = now(), updated_at = now()
   where id = q.id;
end;
$$;
revoke execute on function public.mdr_file_done(uuid, uuid) from public, anon, authenticated;
grant execute on function public.mdr_file_done(uuid, uuid) to service_role;

-- The adopted requests, back to the suite's own (data, once, safe to run again).
select public.mdr_back_to_own();

-- =====================================================================================================================
-- 2. Quick phrases
-- =====================================================================================================================
create table public.quick_phrases (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version int not null default 1,
  deleted_at timestamptz,
  owner_id uuid not null references auth.users(id) on delete cascade,
  -- The add's own key: the same add again is the same phrase.
  add_key uuid not null,
  -- Where it shows: one note box, or every one ('any').
  context text not null check (context in ('any', 'ir_result', 'ofs_decision', 'gc_return', 'correction')),
  label text not null check (length(label) between 1 and 40 and label = btrim(label)),
  body text not null check (length(body) between 1 and 500 and body = btrim(body)),
  sort int not null default 0 check (sort >= 0),
  unique (owner_id, add_key)
);
alter table public.quick_phrases enable row level security;
create trigger touch before update on public.quick_phrases for each row execute function public.tg_touch_row();
create index quick_phrases_owner on public.quick_phrases (owner_id, sort) where deleted_at is null;

revoke all on public.quick_phrases from public, anon, authenticated, service_role;
grant select on public.quick_phrases to authenticated;
create policy "quick_phrases: my own" on public.quick_phrases for select to authenticated
  using (owner_id = auth.uid());

-- The checks every write makes, in the words the screen shows.
create or replace function public.quick_phrase_check(p_label text, p_body text, p_context text)
returns void
language plpgsql
immutable
set search_path = public, pg_temp
as $$
begin
  if length(btrim(coalesce(p_body, ''))) not between 1 and 500 then
    raise exception 'The text is 1 to 500 characters.' using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_label, ''))) not between 1 and 40 then
    raise exception 'The name is 1 to 40 characters.' using errcode = '22023';
  end if;
  if coalesce(p_context, '') not in ('any', 'ir_result', 'ofs_decision', 'gc_return', 'correction') then
    raise exception 'Unknown place for a quick button.' using errcode = '22023';
  end if;
end;
$$;
revoke execute on function public.quick_phrase_check(text, text, text) from public, anon, authenticated, service_role;

-- At most 50 live a person. Counted under a lock per person.
create or replace function public.quick_phrase_room(p_owner uuid)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
begin
  perform pg_advisory_xact_lock(hashtext('quick_phrases:' || p_owner::text));
  if (select count(*) from public.quick_phrases where owner_id = p_owner and deleted_at is null) >= 50 then
    raise exception 'You have 50 quick buttons. Remove one first.' using errcode = '22023';
  end if;
end;
$$;
revoke execute on function public.quick_phrase_room(uuid) from public, anon, authenticated, service_role;

create or replace function public.quick_phrase_add(p_key uuid, p_label text, p_body text, p_context text default 'any')
returns public.quick_phrases
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_uid uuid := auth.uid(); r public.quick_phrases;
begin
  if v_uid is null then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_key is null then raise exception 'A key is needed.' using errcode = '22023'; end if;
  select * into r from public.quick_phrases where owner_id = v_uid and add_key = p_key;
  if r.id is not null then return r; end if;
  perform public.quick_phrase_check(p_label, p_body, p_context);
  perform public.quick_phrase_room(v_uid);
  insert into public.quick_phrases (owner_id, add_key, context, label, body, sort)
  values (v_uid, p_key, p_context, btrim(p_label), btrim(p_body),
          coalesce((select max(sort) + 1 from public.quick_phrases where owner_id = v_uid and deleted_at is null), 0))
  on conflict (owner_id, add_key) do nothing
  returning * into r;
  if r.id is null then select * into r from public.quick_phrases where owner_id = v_uid and add_key = p_key; end if;
  return r;
end;
$$;

create or replace function public.quick_phrase_edit(p_id uuid, p_version int, p_label text, p_body text, p_context text)
returns public.quick_phrases
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_uid uuid := auth.uid(); r public.quick_phrases;
begin
  if v_uid is null then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into r from public.quick_phrases where id = p_id and owner_id = v_uid and deleted_at is null for update;
  if r.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  perform public.quick_phrase_check(p_label, p_body, p_context);
  -- The same save again.
  if (r.label, r.body, r.context) = (btrim(p_label), btrim(p_body), p_context) then return r; end if;
  if r.version <> p_version then
    raise exception 'version_conflict: expected %, found %', p_version, r.version using errcode = '40001';
  end if;
  update public.quick_phrases set label = btrim(p_label), body = btrim(p_body), context = p_context
   where id = r.id returning * into r;
  return r;
end;
$$;

-- Removed (kept, deleted_at). Removed already: answers the row.
create or replace function public.quick_phrase_remove(p_id uuid, p_version int)
returns public.quick_phrases
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_uid uuid := auth.uid(); r public.quick_phrases;
begin
  if v_uid is null then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into r from public.quick_phrases where id = p_id and owner_id = v_uid for update;
  if r.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if r.deleted_at is not null then return r; end if;
  if r.version <> p_version then
    raise exception 'version_conflict: expected %, found %', p_version, r.version using errcode = '40001';
  end if;
  update public.quick_phrases set deleted_at = now() where id = r.id returning * into r;
  return r;
end;
$$;

-- The Undo of a remove: back in its place.
create or replace function public.quick_phrase_restore(p_id uuid)
returns public.quick_phrases
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_uid uuid := auth.uid(); r public.quick_phrases;
begin
  if v_uid is null then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into r from public.quick_phrases where id = p_id and owner_id = v_uid for update;
  if r.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if r.deleted_at is null then return r; end if;
  perform public.quick_phrase_room(v_uid);
  update public.quick_phrases set deleted_at = null where id = r.id returning * into r;
  return r;
end;
$$;

-- My phrases in this order (the ones not named keep theirs, after). Answers them all, in order.
create or replace function public.quick_phrase_order(p_ids uuid[])
returns setof public.quick_phrases
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_ids is null or cardinality(p_ids) = 0 or cardinality(p_ids) > 50
     or (select count(distinct x) from unnest(p_ids) x) <> cardinality(p_ids)
     or exists (select 1 from unnest(p_ids) x
                 where not exists (select 1 from public.quick_phrases q
                                    where q.id = x and q.owner_id = v_uid and q.deleted_at is null)) then
    raise exception 'Those are not your quick buttons.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtext('quick_phrases:' || v_uid::text));
  with wanted as (
    select q.id, row_number() over (
             order by coalesce(array_position(p_ids, q.id), cardinality(p_ids) + 1), q.sort, q.created_at) - 1 as pos
      from public.quick_phrases q
     where q.owner_id = v_uid and q.deleted_at is null)
  update public.quick_phrases q set sort = w.pos
    from wanted w
   where q.id = w.id and q.sort is distinct from w.pos;
  return query select * from public.quick_phrases
                where owner_id = v_uid and deleted_at is null order by sort, created_at;
end;
$$;

revoke execute on function public.quick_phrase_add(uuid, text, text, text), public.quick_phrase_edit(uuid, int, text, text, text),
  public.quick_phrase_remove(uuid, int), public.quick_phrase_restore(uuid), public.quick_phrase_order(uuid[])
  from public, anon;
grant execute on function public.quick_phrase_add(uuid, text, text, text), public.quick_phrase_edit(uuid, int, text, text, text),
  public.quick_phrase_remove(uuid, int), public.quick_phrase_restore(uuid), public.quick_phrase_order(uuid[])
  to authenticated;
