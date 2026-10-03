-- 0061 OFS requests, Revs and Permits to OSFM's meaning, for Monday with Brock (CSU designated campus fire marshal, OFS):
-- the cut-and-dried fixes of the Oct 3 permits check (scratch research permits-check §3.1).
--   1. Readiness checklist on every OFS request (this job's Procore "OSFM Inspection Request" opens with it): previous
--      required inspections complete, trade contractor inspection complete, GC inspection complete, IOR inspection
--      complete, special inspection complete; each Yes or N/A, all five required before an OFS request is made (member
--      form, the revs request, the request link and its revs request). Stored on the request (readiness, checked by
--      ir_readiness_ok); the map's facts carry it so the IR map prints it in the title box under the legend.
--   2. An OFS request from a Revs list carries the list's permit (inspection_requests.permit_id); the existing ones are
--      linked the same way. The permit's inspections show the OFS IR number; the map's facts carry the permit number.
--   3. Stages: OSFM keeps a permit Issued (PI) through construction; Inspected (IS) means every required inspection passed.
--      Our extra stage 'inspections' becomes 'inspected' (the key renamed, the permits in it back to 'issued', where
--      OSFM has them). A move to Inspected is refused while a required inspection is open: a wall x item of a Revs list
--      on the permit that isn't passed or N/A, or a request on the permit still waiting for its result. Old moves to
--      'inspections' stay in the history as they were and read as Issued.
--   4. Expiry: 12 months from issue OR from the last inspection on the permit, whichever is later. Each inspection result
--      on a permit moves expires_on later (never earlier: an extension typed by the official stands); the calendar
--      milestone moves with it.
--   5. Reviews under one permit: deferred items (fire alarm, sprinkler, ERRCS), addenda and change orders are reviews of
--      the permit, never permits of their own. Permit kinds: building, structure, site / utility, other (the old kinds
--      become 'other' with a line in the notes). A review has a number per permit and its backchecks (BC 1, 2, ...); each
--      row is still one cycle. Several reviews may be open at once, one open cycle per review. Deferred reviews open
--      once the permit is issued (G26 p. 7). Existing reviews are numbered from their history.
-- Nothing is dropped but three CHECKs (stage and the two kinds: now function-based, so the next change is a function,
-- not a constraint swap) and the one-open-review-per-permit index (replaced by one open cycle per review). The submit
-- functions that take the checklist are new signatures; the old ones are retired (renamed, closed to everyone), as 0054
-- retired permit_record_stamped_set.

-- =====================================================================================================================
-- 1. The readiness checklist
-- =====================================================================================================================
-- The five answers: exactly these keys, each "yes" or "na".
create or replace function public.ir_readiness_ok(p_readiness jsonb)
returns boolean
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare k text;
begin
  if p_readiness is null or jsonb_typeof(p_readiness) <> 'object' then return false; end if;
  if (select array_agg(x order by x) from jsonb_object_keys(p_readiness) x) is distinct from '{gc,ior,previous,special,trade}'::text[] then
    return false;
  end if;
  for k in select jsonb_object_keys(p_readiness) loop
    if (p_readiness -> k) not in ('"yes"'::jsonb, '"na"'::jsonb) then return false; end if;
  end loop;
  return true;
end;
$$;

alter table public.inspection_requests
  add column readiness jsonb constraint inspection_requests_readiness_check
    check (readiness is null or public.ir_readiness_ok(readiness));

-- What a new request stores: the checklist on an OFS request (required, all five), nothing on the others.
create or replace function public.ir_readiness_for(p_kind text, p_readiness jsonb)
returns jsonb
language plpgsql
immutable
set search_path = public, pg_temp
as $$
begin
  if p_kind is distinct from 'ofs' then return null; end if;
  if p_readiness is null or not public.ir_readiness_ok(p_readiness) then
    raise exception 'Answer the checklist.' using errcode = '22023';
  end if;
  return p_readiness;
end;
$$;

-- The permit an OFS request of these walls carries: their list's, while that permit is live.
create or replace function public.ir_ofs_permit(p_list_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select l.permit_id from public.rev_lists l join public.permits p on p.id = l.permit_id and p.deleted_at is null
   where l.id = p_list_id;
$$;

-- ---------------------------------------------------------------------------------------------------------------------
-- The submit functions with the checklist (new signatures; the old ones retired below)
-- ---------------------------------------------------------------------------------------------------------------------
alter function public.ir_submit(uuid, text, date, text, text, boolean, time, text, integer, uuid, uuid[])
  rename to ir_submit_retired_0061;
alter function public.ir_submit_ofs(uuid, text, date, boolean, uuid[], uuid[], uuid, time, text, integer, uuid[])
  rename to ir_submit_ofs_retired_0061;
alter function public.link_request_make(uuid, text, uuid, text, text, text, text, date, text, text, boolean, time, text,
                                        integer, uuid, uuid[], uuid[], uuid[], uuid)
  rename to link_request_make_retired_0061;
alter function public.link_request_submit(uuid, text, uuid, text, text, text, text, date, text, text, boolean, time, text,
                                          integer, uuid, uuid[])
  rename to link_request_submit_retired_0061;
alter function public.link_request_submit_ofs(uuid, text, uuid, text, text, text, text, date, boolean, uuid[], uuid[], uuid,
                                              time, text, integer, uuid[])
  rename to link_request_submit_ofs_retired_0061;
revoke execute on function
  public.ir_submit_retired_0061(uuid, text, date, text, text, boolean, time, text, integer, uuid, uuid[]),
  public.ir_submit_ofs_retired_0061(uuid, text, date, boolean, uuid[], uuid[], uuid, time, text, integer, uuid[]),
  public.link_request_make_retired_0061(uuid, text, uuid, text, text, text, text, date, text, text, boolean, time, text,
                                        integer, uuid, uuid[], uuid[], uuid[], uuid),
  public.link_request_submit_retired_0061(uuid, text, uuid, text, text, text, text, date, text, text, boolean, time, text,
                                          integer, uuid, uuid[]),
  public.link_request_submit_ofs_retired_0061(uuid, text, uuid, text, text, text, text, date, boolean, uuid[], uuid[], uuid,
                                              time, text, integer, uuid[])
from public, anon, authenticated, service_role;

-- 0024's member request, plus the checklist on an OFS one (the last check, so the earlier refusals read as they did).
create function public.ir_submit(
  p_project_id uuid,
  p_company text,
  p_request_date date,
  p_kind text,
  p_items text,
  p_notice_ack boolean,
  p_start_time time default null,
  p_duration_kind text default 'timed',
  p_duration_min int default null,
  p_special_kind_id uuid default null,
  p_attachment_ids uuid[] default '{}',
  p_readiness jsonb default null
)
returns public.inspection_requests
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_company text := btrim(coalesce(p_company, ''));
  v_items text := btrim(coalesce(p_items, ''));
  v_duration text := coalesce(p_duration_kind, 'timed');
  v_ready jsonb;
  p public.projects;
  r public.inspection_requests;
  fid uuid;
begin
  if v_uid is null or not public.has_capability(p_project_id, 'ir.request') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_notice_ack is not true then raise exception 'Check the notice box first.' using errcode = '22023'; end if;
  if length(v_company) not between 1 and 200 then raise exception 'Pick the company.' using errcode = '22023'; end if;
  if length(v_items) not between 1 and 4000 then raise exception 'Add what to inspect.' using errcode = '22023'; end if;
  select * into p from public.projects where id = p_project_id;
  if p_request_date is null or p_request_date < (now() at time zone p.timezone)::date then
    raise exception 'Pick today or a later day.' using errcode = '22023';
  end if;
  if p_kind = 'ofs' and not public.ir_setting(p_project_id, 'ir_ofs_allowed') then
    raise exception 'OFS is off for this job.' using errcode = '22023';
  end if;
  if p_kind = 'special' and not exists (select 1 from public.ir_special_kinds where id = p_special_kind_id and active) then
    raise exception 'Pick the special inspection.' using errcode = '22023';
  end if;
  foreach fid in array coalesce(p_attachment_ids, '{}'::uuid[]) loop
    if not exists (select 1 from public.files f where f.id = fid and f.project_id = p_project_id
                   and f.created_by = v_uid and f.deleted_at is null
                   and f.folder_id = public.ir_attach_folder_id(p_project_id)) then
      raise exception 'An attachment is missing. Add it again.' using errcode = '22023';
    end if;
  end loop;
  v_ready := public.ir_readiness_for(p_kind, p_readiness);

  perform pg_advisory_xact_lock(hashtext('ir_submit:' || v_uid::text || ':' || p_project_id::text));
  select * into r from public.inspection_requests x
   where x.project_id = p_project_id and x.requested_by = v_uid and x.request_date = p_request_date
     and x.start_time is not distinct from p_start_time and x.kind = p_kind and x.items = v_items
     and x.status <> 'withdrawn' and x.created_at > now() - interval '10 minutes'
   order by x.created_at desc limit 1;
  if r.id is not null then return r; end if;

  perform set_config('app.ir_action', 'submit', true);
  insert into public.inspection_requests (
    org_id, project_id, number, requested_by, created_by, company, request_date, start_time, duration_kind, duration_min,
    kind, special_kind_id, items, attachment_ids, notice_ack_at, status, readiness)
  values (
    p.org_id, p_project_id, public.next_number(p_project_id, 'ir'), v_uid, v_uid, v_company, p_request_date, p_start_time,
    v_duration, case when v_duration = 'timed' then p_duration_min end, p_kind,
    case when p_kind = 'special' then p_special_kind_id end, v_items, coalesce(p_attachment_ids, '{}'::uuid[]), now(),
    public.ir_first_status(p_project_id), v_ready)
  returning * into r;

  if r.status = 'gc_review' then
    perform public.post_activity(p_project_id, 'ir.gc_review',
      'IR ' || r.number || ' to review · ' || r.company || ' · ' || public.ir_when_label(r.request_date, r.start_time),
      'inspection_request', r.id, 'ir.gc_approve');
  else
    perform public.post_activity(p_project_id, 'ir.requested',
      'IR ' || r.number || ' requested · ' || r.company || ' · ' || public.ir_when_label(r.request_date, r.start_time),
      'inspection_request', r.id, 'ir.view_all');
  end if;
  return r;
end;
$$;

-- 0057's revs request, plus the checklist and the list's permit.
create function public.ir_submit_ofs(
  p_project_id uuid,
  p_company text,
  p_request_date date,
  p_notice_ack boolean,
  p_area_ids uuid[],
  p_item_ids uuid[],
  p_sheet_file_id uuid default null,
  p_start_time time default null,
  p_duration_kind text default 'timed',
  p_duration_min int default null,
  p_attachment_ids uuid[] default '{}',
  p_readiness jsonb default null
)
returns public.inspection_requests
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_company text := btrim(coalesce(p_company, ''));
  v_duration text := coalesce(p_duration_kind, 'timed');
  v_text text;
  v_list uuid;
  v_ready jsonb;
  p public.projects;
  r public.inspection_requests;
  fid uuid;
begin
  if v_uid is null or not public.has_capability(p_project_id, 'ir.request') or not public.has_capability(p_project_id, 'revs.read') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into p from public.projects where id = p_project_id and deleted_at is null;
  if p.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not public.ir_setting(p.id, 'ir_ofs_allowed') then raise exception 'OFS is off for this job.' using errcode = '22023'; end if;
  if p_notice_ack is not true then raise exception 'Check the notice box first.' using errcode = '22023'; end if;
  if length(v_company) not between 1 and 200 then raise exception 'Pick the company.' using errcode = '22023'; end if;
  if p_request_date is null or p_request_date < (now() at time zone p.timezone)::date then
    raise exception 'Pick today or a later day.' using errcode = '22023';
  end if;
  if p_start_time is not null and (extract(second from p_start_time) <> 0 or extract(minute from p_start_time) not in (0, 30)) then
    raise exception 'Pick a time on the half hour.' using errcode = '22023';
  end if;
  if v_duration not in ('timed', 'all_day', 'periodic')
     or (v_duration = 'timed' and (p_duration_min is null or p_duration_min not between 5 and 720)) then
    raise exception 'Pick how long it takes.' using errcode = '22023';
  end if;
  foreach fid in array coalesce(p_attachment_ids, '{}'::uuid[]) loop
    if not exists (select 1 from public.files f where f.id = fid and f.project_id = p.id
                   and f.created_by = v_uid and f.deleted_at is null and f.folder_id = public.ir_attach_folder_id(p.id)) then
      raise exception 'An attachment is missing. Add it again.' using errcode = '22023';
    end if;
  end loop;
  v_list := public.ir_ofs_list(p.id, p_area_ids, p_item_ids);
  perform public.rev_sheet_check(p.id, p_sheet_file_id);
  v_ready := public.ir_readiness_for('ofs', p_readiness);

  perform pg_advisory_xact_lock(hashtext('ir_submit:' || v_uid::text || ':' || p.id::text));
  v_text := public.ir_ofs_open_text(p.id, p_area_ids, p_item_ids);

  -- The same request again within 10 minutes is the first one (ir_submit's rule).
  select * into r from public.inspection_requests x
   where x.project_id = p.id and x.requested_by = v_uid and x.request_date = p_request_date
     and x.start_time is not distinct from p_start_time and x.kind = 'ofs' and x.items = v_text
     and x.status <> 'withdrawn' and x.created_at > now() - interval '10 minutes'
   order by x.created_at desc limit 1;
  if r.id is not null then return r; end if;

  perform set_config('app.ir_action', 'submit', true);
  insert into public.inspection_requests (
    org_id, project_id, number, requested_by, created_by, company, request_date, start_time, duration_kind, duration_min,
    kind, items, attachment_ids, notice_ack_at, status, readiness, permit_id)
  values (
    p.org_id, p.id, public.next_number(p.id, 'ir'), v_uid, v_uid, v_company, p_request_date, p_start_time, v_duration,
    case when v_duration = 'timed' then p_duration_min end, 'ofs', v_text, coalesce(p_attachment_ids, '{}'::uuid[]), now(),
    public.ir_first_status(p.id), v_ready, public.ir_ofs_permit(v_list))
  returning * into r;

  perform public.ir_ofs_make(r, p_area_ids, p_item_ids, p_sheet_file_id);

  if r.status = 'gc_review' then
    perform public.post_activity(p.id, 'ir.gc_review',
      left('IR ' || r.number || ' (OFS ' || r.ofs_number || ') to review · ' || r.company || ' · '
           || public.ir_when_label(r.request_date, r.start_time), 500),
      'inspection_request', r.id, 'ir.gc_approve');
  else
    perform public.post_activity(p.id, 'ir.requested',
      left('IR ' || r.number || ' (OFS ' || r.ofs_number || ') requested · ' || r.company || ' · '
           || public.ir_when_label(r.request_date, r.start_time), 500),
      'inspection_request', r.id, 'ir.view_all');
  end if;
  return r;
end;
$$;

-- 0057's one body for the link's requests, plus the checklist on an OFS one and, with walls, the list's permit.
create function public.link_request_make(
  p_project_id uuid, p_token_hash text, p_hub_id uuid, p_name text, p_company text, p_phone text, p_email text,
  p_request_date date, p_kind text, p_items text, p_notice_ack boolean, p_start_time time, p_duration_kind text,
  p_duration_min int, p_special_kind_id uuid, p_attachment_ids uuid[], p_area_ids uuid[], p_item_ids uuid[],
  p_sheet_file_id uuid, p_readiness jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  pr public.projects;
  v_walls boolean := p_area_ids is not null or p_item_ids is not null;
  v_name text := public.delivery_clean(p_name, 120);
  v_company text := public.delivery_clean(p_company, 120);
  v_phone text := nullif(public.delivery_clean(p_phone, 30), '');
  v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_items text := btrim(coalesce(p_items, ''));
  v_duration text := coalesce(p_duration_kind, 'timed');
  v_files uuid[] := coalesce(p_attachment_ids, '{}'::uuid[]);
  v_permit uuid;
  v_ready jsonb;
  v_today date;
  v_token text;
  v_who text;
  v_ir text;
  r public.inspection_requests;
  fid uuid;
begin
  if not public.is_service_role() then raise exception 'forbidden' using errcode = '42501'; end if;
  pr := public.request_link_job(p_project_id, p_token_hash, p_hub_id);
  if pr.id is null then return null; end if;

  if p_notice_ack is not true then raise exception 'Check the notice box first.' using errcode = '22023'; end if;
  if v_name = '' then raise exception 'Enter your name.' using errcode = '22023'; end if;
  if v_company = '' then raise exception 'Enter your company.' using errcode = '22023'; end if;
  if v_phone is null and v_email is null then raise exception 'Add a phone or an email.' using errcode = '22023'; end if;
  if v_phone is not null and (v_phone !~ '^\+?[0-9 ().-]{7,30}$' or length(regexp_replace(v_phone, '\D', '', 'g')) not between 7 and 15) then
    raise exception 'Check the phone number.' using errcode = '22023';
  end if;
  if v_email is not null and (length(v_email) > 320 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') then
    raise exception 'Check the email.' using errcode = '22023';
  end if;
  if not v_walls and length(v_items) not between 1 and 4000 then raise exception 'Add what to inspect.' using errcode = '22023'; end if;
  v_today := (now() at time zone pr.timezone)::date;
  if p_request_date is null or p_request_date < v_today or p_request_date > v_today + 365 then
    raise exception 'Pick today or a later day.' using errcode = '22023';
  end if;
  if p_start_time is not null and (extract(second from p_start_time) <> 0 or extract(minute from p_start_time) not in (0, 30)) then
    raise exception 'Pick a time on the half hour.' using errcode = '22023';
  end if;
  if v_duration not in ('timed', 'all_day', 'periodic')
     or (v_duration = 'timed' and (p_duration_min is null or p_duration_min not between 5 and 720)) then
    raise exception 'Pick how long it takes.' using errcode = '22023';
  end if;
  if p_kind is null or p_kind not in ('ior', 'special', 'ofs') or (v_walls and p_kind <> 'ofs') then
    raise exception 'Pick the type.' using errcode = '22023';
  end if;
  if p_kind = 'ofs' and not public.ir_setting(pr.id, 'ir_ofs_allowed') then
    raise exception 'OFS is off for this job.' using errcode = '22023';
  end if;
  if p_kind = 'special' and not exists (select 1 from public.ir_special_kinds where id = p_special_kind_id and active) then
    raise exception 'Pick the special inspection.' using errcode = '22023';
  end if;
  if cardinality(v_files) > 3 or cardinality(v_files) <> (select count(distinct x) from unnest(v_files) x) then
    raise exception 'Up to 3 photos or PDFs.' using errcode = '22023';
  end if;
  if v_walls then
    v_permit := public.ir_ofs_permit(public.ir_ofs_list(pr.id, p_area_ids, p_item_ids));
    if p_sheet_file_id is not null and not public.rev_walls_sheet_ok(pr.id, p_area_ids, p_sheet_file_id) then
      raise exception 'Pick a sheet of these walls.' using errcode = '22023';
    end if;
  end if;
  v_ready := public.ir_readiness_for(p_kind, p_readiness);

  -- One visitor at a time per name and job, so the repeat check and the insert agree.
  perform pg_advisory_xact_lock(hashtext('link_request_submit:' || pr.id::text || ':' || lower(v_name)));
  if v_walls then v_items := public.ir_ofs_open_text(pr.id, p_area_ids, p_item_ids); end if;
  select * into r from public.inspection_requests x
   where x.project_id = pr.id and x.requested_by is null and lower(x.requester_name) = lower(v_name)
     and x.company = v_company and x.request_date = p_request_date and x.start_time is not distinct from p_start_time
     and x.kind = p_kind and x.items = v_items and x.status <> 'withdrawn' and x.created_at > now() - interval '10 minutes'
   order by x.created_at desc limit 1;

  if r.id is null then
    -- Files the link registered for this job (no uploader), stored, not on any request yet.
    foreach fid in array v_files loop
      if not exists (select 1 from public.files f
                      where f.id = fid and f.project_id = pr.id and f.created_by is null and f.deleted_at is null
                        and not f.upload_complete and f.created_at > now() - interval '1 hour'
                        and f.folder_id = public.ir_attach_folder_id(pr.id)
                        and exists (select 1 from storage.objects o where o.bucket_id = 'files' and o.name = f.storage_path))
         or exists (select 1 from public.inspection_requests x where fid = any (x.attachment_ids)) then
        raise exception 'An attachment is missing. Add it again.' using errcode = '22023';
      end if;
    end loop;

    perform set_config('app.ir_action', 'submit', true);
    insert into public.inspection_requests (
      org_id, project_id, number, requested_by, created_by, company, requester_name, requester_phone, requester_email,
      request_date, start_time, duration_kind, duration_min, kind, special_kind_id, items, attachment_ids, notice_ack_at, status,
      readiness, permit_id)
    values (
      pr.org_id, pr.id, public.next_number(pr.id, 'ir'), null, null, v_company, v_name, v_phone, v_email,
      p_request_date, p_start_time, v_duration, case when v_duration = 'timed' then p_duration_min end, p_kind,
      case when p_kind = 'special' then p_special_kind_id end, v_items, v_files, now(), public.ir_first_status(pr.id),
      v_ready, v_permit)
    returning * into r;
    if v_walls then perform public.ir_ofs_make(r, p_area_ids, p_item_ids, p_sheet_file_id); end if;

    -- The files are finished: usable as any finished upload is (the skip-scan switch), and queued for the scan.
    update public.files set upload_complete = true where id = any (v_files);
    foreach fid in array v_files loop
      perform public.enqueue_job('scan_file', jsonb_build_object('file_id', fid), pr.id, 'scan_file:' || fid::text);
    end loop;

    v_who := v_name || ' (' || v_company || ')';
    v_ir := 'IR ' || r.number || case when v_walls then ' (OFS ' || r.ofs_number || ')' else '' end;
    if r.status = 'gc_review' then
      perform public.post_activity(pr.id, 'ir.gc_review',
        left(v_ir || ' to review · ' || v_who || ' · ' || public.ir_when_label(r.request_date, r.start_time), 500),
        'inspection_request', r.id, 'ir.gc_approve');
    else
      perform public.post_activity(pr.id, 'ir.requested',
        left(v_ir || ' requested · ' || v_who || ' · ' || public.ir_when_label(r.request_date, r.start_time), 500),
        'inspection_request', r.id, 'ir.view_all');
    end if;
    perform public.audit('request_link.submit', 'inspection_request', r.id, pr.id, pr.org_id,
      jsonb_build_object('via', case when p_hub_id is null then 'link' else 'hub' end, 'number', r.number,
                         'name', v_name, 'company', v_company, 'files', cardinality(v_files))
      || case when v_walls
              then jsonb_build_object('ofs_number', r.ofs_number,
                                      'cells', (select count(*) from public.ir_rev_items c where c.request_id = r.id))
              else '{}'::jsonb end,
      null, 'public_link');
  else
    -- A repeat: the same request answers. Files sent again with it are not needed.
    update public.files set deleted_at = now()
     where id = any (v_files) and created_by is null and project_id = pr.id and not (id = any (r.attachment_ids));
  end if;

  v_token := public.request_link_token();
  insert into public.ir_link_receipts (token_hash, request_id) values (encode(extensions.digest(v_token, 'sha256'), 'hex'), r.id);
  return public.link_request_answer(r.id) || jsonb_build_object('receipt', v_token);
end;
$$;

-- 0055's request from the link (the shared body without walls), plus the checklist on an OFS one.
create function public.link_request_submit(
  p_project_id uuid,
  p_token_hash text,
  p_hub_id uuid,
  p_name text,
  p_company text,
  p_phone text,
  p_email text,
  p_request_date date,
  p_kind text,
  p_items text,
  p_notice_ack boolean,
  p_start_time time default null,
  p_duration_kind text default 'timed',
  p_duration_min int default null,
  p_special_kind_id uuid default null,
  p_attachment_ids uuid[] default '{}',
  p_readiness jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_service_role() then raise exception 'forbidden' using errcode = '42501'; end if;
  return public.link_request_make(p_project_id, p_token_hash, p_hub_id, p_name, p_company, p_phone, p_email, p_request_date,
    p_kind, p_items, p_notice_ack, p_start_time, p_duration_kind, p_duration_min, p_special_kind_id, p_attachment_ids,
    null, null, null, p_readiness);
end;
$$;

-- 0057's revs request from the link, plus the checklist.
create function public.link_request_submit_ofs(
  p_project_id uuid,
  p_token_hash text,
  p_hub_id uuid,
  p_name text,
  p_company text,
  p_phone text,
  p_email text,
  p_request_date date,
  p_notice_ack boolean,
  p_area_ids uuid[],
  p_item_ids uuid[],
  p_sheet_file_id uuid default null,
  p_start_time time default null,
  p_duration_kind text default 'timed',
  p_duration_min int default null,
  p_attachment_ids uuid[] default '{}',
  p_readiness jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_service_role() then raise exception 'forbidden' using errcode = '42501'; end if;
  return public.link_request_make(p_project_id, p_token_hash, p_hub_id, p_name, p_company, p_phone, p_email, p_request_date,
    'ofs', null, p_notice_ack, p_start_time, p_duration_kind, p_duration_min, null, p_attachment_ids,
    coalesce(p_area_ids, '{}'::uuid[]), coalesce(p_item_ids, '{}'::uuid[]), p_sheet_file_id, p_readiness);
end;
$$;

-- =====================================================================================================================
-- 2. The map's facts carry the checklist and the permit number; the map is out of date when they change
-- =====================================================================================================================
-- 0057's facts, plus readiness and the permit's number (a live permit on the request).
create or replace function public.ir_map_facts(p_request_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'request_id', q.id,
    'project_id', q.project_id,
    'number', q.number,
    'ofs_number', q.ofs_number,
    'phase', (select l.phase from public.ir_rev_items c join public.rev_areas a on a.id = c.area_id
                join public.rev_lists l on l.id = a.list_id where c.request_id = q.id limit 1),
    'request_date', q.request_date,
    'what', public.ir_map_what(q.id),
    'sheet_file_id', m.sheet_file_id,
    'page', m.page,
    'strokes', m.strokes,
    'legend', coalesce((select jsonb_agg(jsonb_build_object('color', x.color, 'name', x.name) order by x.color)
                          from (select distinct c.color, btrim(i.name) as name
                                  from public.ir_rev_items c join public.rev_items i on i.id = c.item_id
                                 where c.request_id = q.id) x), '[]'::jsonb),
    'result', q.result,
    'signed_at', q.signed_at,
    'signer_name', case when q.signed_by is not null then public.rfi_person_name(q.signed_by) end,
    'version', m.version,
    'map_file_id', m.map_file_id,
    'stale', m.stale,
    'readiness', q.readiness,
    'permit_number', (select p.primary_number from public.permits p where p.id = q.permit_id and p.deleted_at is null))
    from public.inspection_requests q
    join public.ir_maps m on m.request_id = q.id
   where q.id = p_request_id;
$$;

-- 0057's visitor map: the new facts stay with the PDF (the function's projection drops them too).
create or replace function public.link_request_map_view(p_request_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select (x.f - '{request_id,project_id,signed_at,signer_name,map_file_id,readiness,permit_number}'::text[])
         || jsonb_build_object(
              'signed', (x.f ->> 'signed_at') is not null,
              'has_map', (x.f ->> 'map_file_id') is not null,
              'can_edit', (x.f ->> 'signed_at') is null
                          and (select q.status <> 'withdrawn' from public.inspection_requests q where q.id = p_request_id)
                          and public.link_request_map_editor(p_request_id),
              'sheets', public.link_request_map_sheets(p_request_id))
    from (select public.ir_map_facts(p_request_id) as f) x
   where x.f is not null;
$$;

create trigger ir_map_stale_permit after update of permit_id, readiness on public.inspection_requests
  for each row
  when ((old.permit_id, old.readiness) is distinct from (new.permit_id, new.readiness))
  execute function public.tg_ir_map_stale();

-- The OFS requests made from a list with a permit before today carry it too.
do $$
begin
  perform set_config('app.ir_action', 'permit', true);
  update public.inspection_requests q
     set permit_id = x.permit_id
    from (select distinct on (c.request_id) c.request_id, public.ir_ofs_permit(a.list_id) as permit_id
            from public.ir_rev_items c join public.rev_areas a on a.id = c.area_id
           order by c.request_id, a.list_id) x
   where q.id = x.request_id and q.permit_id is null and x.permit_id is not null and q.deleted_at is null;
end $$;

-- =====================================================================================================================
-- 3. Stages: Inspected (IS) in place of our "Inspections"
-- =====================================================================================================================
create or replace function public.permit_stage_ok(p_stage text)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select coalesce(p_stage in ('draft', 'submitted', 'accepted', 'rejected', 'in_review', 'comments_out', 'backcheck', 'issued',
                              'inspected', 'approved', 'complete', 'cancelled'), false);
$$;

-- Place on the tracker (1..10). A move to the retired 'inspections' stage (before 0061) sits where Issued does.
create or replace function public.permit_stage_pos(p_stage text)
returns int
language sql
immutable
set search_path = public, pg_temp
as $$
  select case p_stage
    when 'draft' then 1 when 'submitted' then 2 when 'accepted' then 3 when 'rejected' then 3 when 'in_review' then 4
    when 'comments_out' then 5 when 'backcheck' then 6 when 'issued' then 7 when 'inspections' then 7 when 'inspected' then 8
    when 'approved' then 9 when 'complete' then 10 end;
$$;

create or replace function public.permit_stage_label(p_stage text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case p_stage
    when 'draft' then 'Draft' when 'submitted' then 'Submitted' when 'accepted' then 'Accepted'
    when 'rejected' then 'Rejected' when 'in_review' then 'In review' when 'comments_out' then 'Comments out'
    when 'backcheck' then 'Backcheck' when 'issued' then 'Issued' when 'inspections' then 'Issued'
    when 'inspected' then 'Inspected' when 'approved' then 'Approved' when 'complete' then 'Complete'
    when 'cancelled' then 'Cancelled' else p_stage end;
$$;

-- Same as 0052, with Issued -> Inspected -> Approved (Inspected may go back to Issued).
create or replace function public.permit_next_stages(p_stage text)
returns text[]
language sql
immutable
set search_path = public, pg_temp
as $$
  select case p_stage
    when 'draft' then '{submitted,cancelled}'::text[]
    when 'submitted' then '{accepted,rejected,cancelled}'
    when 'rejected' then '{submitted,cancelled}'
    when 'accepted' then '{in_review,cancelled}'
    when 'in_review' then '{comments_out,issued,cancelled}'
    when 'comments_out' then '{backcheck,cancelled}'
    when 'backcheck' then '{in_review,comments_out,issued,cancelled}'
    when 'issued' then '{inspected,cancelled}'
    when 'inspected' then '{approved,issued,cancelled}'
    when 'approved' then '{complete,cancelled}'
    else '{}' end;
$$;

-- Stamping revises the set once it is issued and building.
create or replace function public.permit_stamp_mode(p_stage text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case when p_stage in ('issued', 'inspected', 'approved') then 'revise'
              when 'issued' = any (public.permit_next_stages(p_stage)) then 'issue' end;
$$;

-- The permits in "Inspections" are Issued in OSFM's terms: back there, since their latest issue.
alter table public.permits drop constraint permits_stage_check;
update public.permits p
   set stage = 'issued',
       stage_since = coalesce((select max(e.at) from public.permit_stage_events e
                                where e.permit_id = p.id and e.stage = 'issued' and e.undone_at is null), p.stage_since)
 where p.stage = 'inspections';
alter table public.permits add constraint permits_stage_check check (public.permit_stage_ok(stage));

-- The expiry milestone while issued or inspected.
create or replace function public.tg_permit_calendar()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_tz text;
begin
  if new.expires_on is not null and new.deleted_at is null and new.stage in ('issued', 'inspected') then
    select timezone into v_tz from public.projects where id = new.project_id;
    perform public.calendar_mirror('permit', new.id, new.project_id, 'milestones',
      left(public.permit_label(new.primary_number) || ' expires: ' || new.title, 300),
      new.expires_on::timestamp at time zone v_tz, null, true, 'pending', 'permits.read', null);
  else
    perform public.calendar_unmirror('permit', new.id);
  end if;
  return null;
end;
$$;

-- The required inspections still open on a permit: each wall x item of a live Revs list on it that isn't passed or N/A
-- (asked for, failed or never asked), and each request on it still waiting for its result (not withdrawn) that has no
-- walls (a revs request counts by its walls).
create or replace function public.permit_open_inspections(p_permit_id uuid)
returns int
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with p as (select id, project_id from public.permits where id = p_permit_id and deleted_at is null)
  select coalesce((select count(*)::int
                     from p
                     cross join lateral public.rev_status_rows(p.project_id) s
                     join public.rev_areas a on a.id = s.area_id
                     join public.rev_lists l on l.id = a.list_id and l.deleted_at is null and l.permit_id = p.id
                    where s.status not in ('passed', 'na')), 0)
       + coalesce((select count(*)::int
                     from p
                     join public.inspection_requests q on q.permit_id = p.id
                    where q.deleted_at is null and q.result is null and q.status <> 'withdrawn'
                      and not exists (select 1 from public.ir_rev_items c where c.request_id = q.id)), 0);
$$;

-- 0052's move, plus: Inspected only once every required inspection passed.
create or replace function public.permit_move(p_permit_id uuid, p_version int, p_stage text, p_note text default null)
returns public.permits
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare r public.permits; v_note text := nullif(btrim(coalesce(p_note, '')), ''); v_prior jsonb; v_issued date; v_open int;
begin
  r := public.permit_lock(p_permit_id, null);
  if not public.has_capability(r.project_id, 'permits.manage') then raise exception 'forbidden' using errcode = '42501'; end if;
  if r.stage = p_stage then return r; end if;
  if p_version is not null and r.version <> p_version then
    raise exception 'version_conflict: expected %, found %', p_version, r.version using errcode = '40001';
  end if;
  if p_stage is null or not (p_stage = any (public.permit_next_stages(r.stage))) then
    raise exception 'It can''t go from % to %.', public.permit_stage_label(r.stage), public.permit_stage_label(p_stage)
      using errcode = '22023';
  end if;
  if length(coalesce(v_note, '')) > 1000 then raise exception 'Keep the note to 1000 characters.' using errcode = '22023'; end if;
  if p_stage = 'inspected' then
    v_open := public.permit_open_inspections(r.id);
    if v_open > 0 then
      raise exception '% not passed yet.', case when v_open = 1 then '1 inspection' else v_open || ' inspections' end
        using errcode = '22023';
    end if;
  end if;
  v_prior := jsonb_build_object('issued_on', r.issued_on, 'expires_on', r.expires_on);
  v_issued := case when p_stage = 'issued' then coalesce(r.issued_on, public.permit_today(r.project_id)) else r.issued_on end;
  update public.permits
     set stage = p_stage, stage_since = now(), issued_on = v_issued,
         expires_on = case when p_stage = 'issued' then coalesce(r.expires_on, (v_issued + interval '12 months')::date)
                           else r.expires_on end
   where id = r.id
   returning * into r;
  insert into public.permit_stage_events (permit_id, project_id, org_id, stage, at, actor, note, prior)
  values (r.id, r.project_id, r.org_id, r.stage, r.stage_since, auth.uid(), v_note, v_prior);
  perform public.audit('permit.move', 'permit', r.id, r.project_id, r.org_id,
                       jsonb_build_object('number', r.primary_number, 'stage', r.stage, 'note', v_note));
  perform public.post_activity(r.project_id, 'permit.stage',
    left(public.permit_label(r.primary_number) || ' ' || lower(public.permit_stage_label(r.stage)) || ': ' || r.title, 500),
    'permit', r.id, 'permits.read');
  return r;
end;
$$;

-- 0054's tracker: the ten places with Inspected; a move to the retired 'inspections' stage counts as time at Issued.
create or replace function public.permit_progress(p_project_id uuid default null, p_permit_id uuid default null)
returns table (
  permit_id uuid, "position" int, stage text, state text, entered_at timestamptz, left_at timestamptz, days int
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with seen as (
    select p.id, p.stage, j.timezone as tz
      from public.permits p
      join public.projects j on j.id = p.project_id
     where p.deleted_at is null
       and p.project_id in (select pm.project_id from public.project_members pm
                             where pm.user_id = auth.uid() and pm.status = 'active')
       and (p_project_id is null or p.project_id = p_project_id)
       and (p_permit_id is null or p.id = p_permit_id)
       and public.has_capability(p.project_id, 'permits.read')
  ),
  ev as (
    select e.permit_id, case e.stage when 'inspections' then 'issued' else e.stage end as stage, e.at, s.tz,
           lead(e.at) over (partition by e.permit_id order by e.at, e.id) as left_at,
           row_number() over (partition by e.permit_id order by e.at desc, e.id desc) as back
      from public.permit_stage_events e
      join seen s on s.id = e.permit_id
     where e.undone_at is null
  ),
  per_stage as (
    select v.permit_id, v.stage, min(v.at) as entered,
           case when bool_or(v.left_at is null) then null else max(v.left_at) end as left_at,
           sum(case when coalesce(v.left_at, now()) - v.at < interval '1 day' then 0
                    else greatest(1, (coalesce(v.left_at, now()) at time zone v.tz)::date - (v.at at time zone v.tz)::date)
               end)::int as days
      from ev v
     group by v.permit_id, v.stage
  ),
  cur as (
    select s.id, s.stage,
           case when s.stage = 'complete' then 11
                when s.stage = 'cancelled'
                  then coalesce(public.permit_stage_pos((select x.stage from ev x where x.permit_id = s.id and x.back = 2)), 1)
                else public.permit_stage_pos(s.stage) end as pos
      from seen s
  ),
  places as (
    select c.id, b.pos::int as pos,
           case when c.stage = 'cancelled' and b.pos = c.pos then 'cancelled'
                when b.pos = 3 and c.stage = 'rejected' then 'rejected'
                else b.stage end as stage,
           case when c.stage in ('cancelled', 'rejected') and b.pos = c.pos then 'failed'
                when b.pos < c.pos then 'done'
                when b.pos = c.pos then 'current'
                else 'next' end as state
      from cur c
      cross join unnest('{draft,submitted,accepted,in_review,comments_out,backcheck,issued,inspected,approved,complete}'::text[])
        with ordinality as b (stage, pos)
  )
  select pl.id, pl.pos, pl.stage, pl.state,
         case when pl.stage in ('complete', 'cancelled') then null else ps.entered end,
         case when pl.stage in ('complete', 'cancelled') then null else ps.left_at end,
         case when pl.stage in ('complete', 'cancelled') then null else ps.days end
    from places pl
    left join per_stage ps on ps.permit_id = pl.id and ps.stage = pl.stage
   order by pl.id, pl.pos;
$$;

-- =====================================================================================================================
-- 4. Expiry: 12 months from issue or from the last inspection, whichever is later
-- =====================================================================================================================
-- An issued (or inspected) permit expires 12 months after its issue or its last inspection (a result recorded on a
-- request on it), whichever is later, on the job's clock. Never earlier than it is now: a date the official typed (an
-- extension) stands.
create or replace function public.permit_expiry_touch(p_permit_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare r public.permits; v_last date; v_due date;
begin
  select * into r from public.permits where id = p_permit_id and deleted_at is null;
  if r.id is null or r.issued_on is null or r.stage not in ('issued', 'inspected') then return; end if;
  select max((q.result_at at time zone j.timezone)::date) into v_last
    from public.inspection_requests q join public.projects j on j.id = q.project_id
   where q.permit_id = r.id and q.deleted_at is null and q.result is not null and q.result_at is not null;
  v_due := greatest(coalesce(r.expires_on, (r.issued_on + interval '12 months')::date),
                    (v_last + interval '12 months')::date);
  if v_due is distinct from r.expires_on then
    update public.permits set expires_on = v_due where id = r.id;
  end if;
end;
$$;

create or replace function public.tg_ir_permit_expiry()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.permit_expiry_touch(new.permit_id);
  return null;
end;
$$;
create trigger ir_permit_expiry after update of result, result_at, permit_id on public.inspection_requests
  for each row
  when (new.permit_id is not null and new.result is not null
        and (old.result, old.result_at, old.permit_id) is distinct from (new.result, new.result_at, new.permit_id))
  execute function public.tg_ir_permit_expiry();

-- The permits issued now, by their inspections so far.
select public.permit_expiry_touch(p.id) from public.permits p where p.stage in ('issued', 'inspected') and p.deleted_at is null;

-- =====================================================================================================================
-- 5. Reviews under one permit
-- =====================================================================================================================
create or replace function public.permit_kind_ok(p_kind text)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select coalesce(p_kind in ('building', 'structure', 'site_utility', 'other'), false);
$$;

-- What a review is. 'deferred' (before 0061, no system named) stays readable; new ones name the system.
create or replace function public.permit_review_kind_ok(p_kind text)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select coalesce(p_kind in ('initial', 'deferred_fire_alarm', 'deferred_sprinkler', 'deferred_errcs', 'addendum', 'change_order',
                             'deferred'), false);
$$;

-- "review 2" or "review 2 BC 1", for board lines.
create or replace function public.permit_review_label(p_review_no int, p_backcheck int)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select 'review ' || p_review_no || case when coalesce(p_backcheck, 0) > 0 then ' BC ' || p_backcheck else '' end;
$$;

-- Permits that were deferred items, addenda or change orders stay as they are, as 'other', with a line in the notes.
alter table public.permits drop constraint permits_kind_check;
update public.permits
   set notes = left(btrim(case when btrim(notes) = '' then '' else notes || E'\n' end
                          || 'Was its own permit kind: ' || case kind
                               when 'deferred_fire_alarm' then 'Fire alarm (deferred)'
                               when 'deferred_sprinkler' then 'Fire sprinkler (deferred)'
                               when 'deferred_errcs' then 'Radio coverage (deferred)'
                               when 'addendum' then 'Addendum' else 'Change order' end || '.'), 4000),
       kind = 'other'
 where kind in ('deferred_fire_alarm', 'deferred_sprinkler', 'deferred_errcs', 'addendum', 'change_order');
alter table public.permits add constraint permits_kind_check check (public.permit_kind_ok(kind));

-- 0052's field check with the kinds above.
create or replace function public.permit_check(p_primary text, p_numbers text[], p_title text, p_kind text, p_notes text)
returns void
language plpgsql
immutable
set search_path = public, pg_temp
as $$
begin
  if length(btrim(coalesce(p_primary, ''))) = 0 then raise exception 'Add the permit number.' using errcode = '22023'; end if;
  if length(btrim(p_primary)) > 60 then raise exception 'Keep the number to 60 characters.' using errcode = '22023'; end if;
  if not public.permit_numbers_ok(public.permit_clean_numbers(p_primary, p_numbers)) then
    raise exception 'Up to 10 other numbers, 60 characters each.' using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_title, ''))) = 0 then raise exception 'Add what it covers.' using errcode = '22023'; end if;
  if length(btrim(p_title)) > 200 then raise exception 'Keep the title to 200 characters.' using errcode = '22023'; end if;
  if not public.permit_kind_ok(p_kind) then raise exception 'Unknown kind.' using errcode = '22023'; end if;
  if length(coalesce(p_notes, '')) > 4000 then raise exception 'Keep the notes to 4000 characters.' using errcode = '22023'; end if;
end;
$$;

-- A review's number on its permit and its backcheck (0 = the submittal, then BC 1, 2 ...). Each row stays one cycle
-- (cycle, 1, 2, ... across the permit). The rows so far: a run of backchecks belongs to the review before it; a
-- backcheck row takes its review's kind.
alter table public.permit_reviews drop constraint permit_reviews_kind_check;
alter table public.permit_reviews add column review_no int, add column backcheck int not null default 0;
with ordered as (
  select v.id, v.permit_id, v.cycle, v.kind,
         greatest(1, sum(case when v.kind = 'backcheck' then 0 else 1 end) over (partition by v.permit_id order by v.cycle)) as grp
    from public.permit_reviews v
),
numbered as (
  select o.id, o.grp, o.kind,
         (row_number() over (partition by o.permit_id, o.grp order by o.cycle) - 1)::int as bc,
         first_value(o.kind) over (partition by o.permit_id, o.grp order by o.cycle) as first_kind
    from ordered o
)
update public.permit_reviews v
   set review_no = n.grp, backcheck = n.bc,
       kind = case when v.kind <> 'backcheck' then v.kind when n.first_kind = 'backcheck' then 'initial' else n.first_kind end
  from numbered n
 where n.id = v.id;
alter table public.permit_reviews
  alter column review_no set not null,
  add constraint permit_reviews_review_no_check check (review_no > 0),
  add constraint permit_reviews_backcheck_check check (backcheck >= 0),
  add constraint permit_reviews_kind_check check (public.permit_review_kind_ok(kind)),
  add constraint permit_reviews_permit_id_review_no_backcheck_key unique (permit_id, review_no, backcheck);
-- Several reviews open at once; one open cycle per review.
drop index public.permit_reviews_open;
create unique index permit_reviews_open_cycle on public.permit_reviews (permit_id, review_no) where outcome is null;

-- next_number's counters for the numbers given above: reviews per permit, backchecks per review.
insert into public.project_counters (project_id, kind, next_value)
select project_id, 'permit_review_no:' || permit_id::text, max(review_no) + 1 from public.permit_reviews group by project_id, permit_id
on conflict (project_id, kind) do update set next_value = greatest(public.project_counters.next_value, excluded.next_value);
insert into public.project_counters (project_id, kind, next_value)
select project_id, 'permit_bc:' || permit_id::text || ':' || review_no, max(backcheck) + 1
  from public.permit_reviews group by project_id, permit_id, review_no
on conflict (project_id, kind) do update set next_value = greatest(public.project_counters.next_value, excluded.next_value);

-- The next backcheck of a review (its kind; a number from next_number), received today on the job's clock unless a day
-- is given. Refused while that review has a cycle open. The caller locked the permit and checked the official.
create or replace function public.permit_review_next(r public.permits, p_review_no int, p_received_on date, p_key uuid)
returns public.permit_reviews
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v public.permit_reviews; v_kind text;
begin
  if exists (select 1 from public.permit_reviews where permit_id = r.id and review_no = p_review_no and outcome is null) then
    raise exception 'Close the open review first.' using errcode = '22023';
  end if;
  select kind into v_kind from public.permit_reviews where permit_id = r.id and review_no = p_review_no order by backcheck limit 1;
  if v_kind is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  insert into public.permit_reviews (permit_id, project_id, org_id, cycle, review_no, backcheck, kind, received_on, created_by,
                                     request_key)
  values (r.id, r.project_id, r.org_id, public.next_number(r.project_id, 'permit_review:' || r.id::text), p_review_no,
          public.next_number(r.project_id, 'permit_bc:' || r.id::text || ':' || p_review_no), v_kind,
          coalesce(p_received_on, public.permit_today(r.project_id)), auth.uid(), p_key)
  returning * into v;
  perform public.audit('permit.review_open', 'permit_review', v.id, r.project_id, r.org_id,
                       jsonb_build_object('permit_id', r.id, 'cycle', v.cycle, 'review', v.review_no, 'backcheck', v.backcheck,
                                          'kind', v.kind));
  return v;
end;
$$;

-- A new review (the official): its kind (initial, a deferred item, an addendum, a change order), numbered per permit.
-- No kind (or 'backcheck', the screens before 0061): the next backcheck of the latest review, or the initial review on
-- a permit with none. Deferred items open once the permit is issued (G26 p. 7). Several reviews may be open at once.
create or replace function public.permit_review_open(
  p_permit_id uuid,
  p_kind text default null,
  p_received_on date default null,
  p_key uuid default null
)
returns public.permit_reviews
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare r public.permits; v public.permit_reviews; v_latest int; v_kind text;
begin
  r := public.permit_lock(p_permit_id, null);
  if not public.has_capability(r.project_id, 'permits.manage') then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_key is not null then
    select * into v from public.permit_reviews where created_by = auth.uid() and request_key = p_key;
    if v.id is not null then return v; end if;
  end if;
  if r.stage in ('complete', 'cancelled') then raise exception 'This permit is closed.' using errcode = '22023'; end if;
  if p_kind is null or p_kind = 'backcheck' then
    select review_no into v_latest from public.permit_reviews where permit_id = r.id order by cycle desc limit 1;
    if v_latest is not null then return public.permit_review_next(r, v_latest, p_received_on, p_key); end if;
  end if;
  v_kind := coalesce(nullif(p_kind, 'backcheck'), 'initial');
  if not public.permit_review_kind_ok(v_kind) or v_kind = 'deferred' then
    raise exception 'Unknown review kind.' using errcode = '22023';
  end if;
  if v_kind like 'deferred\_%' and r.stage not in ('issued', 'inspected', 'approved') then
    raise exception 'Deferred items open once the permit is issued.' using errcode = '22023';
  end if;
  insert into public.permit_reviews (permit_id, project_id, org_id, cycle, review_no, backcheck, kind, received_on, created_by,
                                     request_key)
  values (r.id, r.project_id, r.org_id, public.next_number(r.project_id, 'permit_review:' || r.id::text),
          public.next_number(r.project_id, 'permit_review_no:' || r.id::text), 0, v_kind,
          coalesce(p_received_on, public.permit_today(r.project_id)), auth.uid(), p_key)
  returning * into v;
  perform public.audit('permit.review_open', 'permit_review', v.id, r.project_id, r.org_id,
                       jsonb_build_object('permit_id', r.id, 'cycle', v.cycle, 'review', v.review_no, 'backcheck', 0,
                                          'kind', v.kind));
  return v;
end;
$$;

-- The next backcheck of the review this cycle belongs to (the official): once none of its cycles is open.
create or replace function public.permit_review_backcheck(p_review_id uuid, p_received_on date default null, p_key uuid default null)
returns public.permit_reviews
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v public.permit_reviews; r public.permits;
begin
  select * into v from public.permit_reviews where id = p_review_id;
  if v.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  r := public.permit_lock(v.permit_id, null);
  if not public.has_capability(r.project_id, 'permits.manage') then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_key is not null then
    select * into v from public.permit_reviews where created_by = auth.uid() and request_key = p_key;
    if v.id is not null then return v; end if;
    select * into v from public.permit_reviews where id = p_review_id;
  end if;
  if r.stage in ('complete', 'cancelled') then raise exception 'This permit is closed.' using errcode = '22023'; end if;
  return public.permit_review_next(r, v.review_no, p_received_on, p_key);
end;
$$;

-- 0052's close, with one open cycle per review: opening a cycle again (the Undo) waits for its review's open one.
create or replace function public.permit_review_close(
  p_review_id uuid,
  p_version int,
  p_outcome text,
  p_returned_on date default null
)
returns public.permit_reviews
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v public.permit_reviews; r public.permits; v_open int;
begin
  select * into v from public.permit_reviews where id = p_review_id for update;
  if v.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  r := public.permit_lock(v.permit_id, null);
  if not public.has_capability(r.project_id, 'permits.manage') then raise exception 'forbidden' using errcode = '42501'; end if;
  if v.outcome is not distinct from p_outcome then return v; end if;
  if p_version is not null and v.version <> p_version then
    raise exception 'version_conflict: expected %, found %', p_version, v.version using errcode = '40001';
  end if;
  if p_outcome is null then
    if exists (select 1 from public.permit_reviews x
                where x.permit_id = v.permit_id and x.review_no = v.review_no and x.outcome is null) then
      raise exception 'Close the open review first.' using errcode = '22023';
    end if;
    update public.permit_reviews set outcome = null, returned_on = null where id = v.id returning * into v;
    perform public.audit('permit.review_reopen', 'permit_review', v.id, r.project_id, r.org_id,
                         jsonb_build_object('permit_id', r.id, 'cycle', v.cycle, 'review', v.review_no, 'backcheck', v.backcheck));
    return v;
  end if;
  if p_outcome not in ('approved', 'approved_as_noted', 'revise_resubmit', 'rejected') then
    raise exception 'Unknown outcome.' using errcode = '22023';
  end if;
  if coalesce(p_returned_on, public.permit_today(r.project_id)) < v.received_on then
    raise exception 'It can''t come back before it was received.' using errcode = '22023';
  end if;
  update public.permit_reviews
     set outcome = p_outcome, returned_on = coalesce(p_returned_on, public.permit_today(r.project_id))
   where id = v.id
   returning * into v;
  perform public.audit('permit.review_close', 'permit_review', v.id, r.project_id, r.org_id,
                       jsonb_build_object('permit_id', r.id, 'cycle', v.cycle, 'review', v.review_no, 'backcheck', v.backcheck,
                                          'outcome', v.outcome));
  select count(*)::int into v_open from public.permit_comments where review_id = v.id and status = 'open';
  perform public.post_activity(r.project_id, 'permit.review',
    left(public.permit_label(r.primary_number) || ' ' || public.permit_review_label(v.review_no, v.backcheck) || ': '
         || case v.outcome when 'approved' then 'approved' when 'approved_as_noted' then 'approved as noted'
                           when 'revise_resubmit' then 'revise and resubmit' else 'rejected' end
         || case when v_open > 0 then ' (' || v_open || ' open comment' || case when v_open > 1 then 's' else '' end || ')'
                 else '' end, 500),
    'permit', r.id, 'permits.read');
  return v;
end;
$$;

-- =====================================================================================================================
-- One permit in full (0052): plus the open required inspections (what holds Inspected), each inspection's OFS IR
-- number, open reviews first, and the old 'inspections' moves read as Issued.
-- =====================================================================================================================
create or replace function public.permit_detail(p_permit_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare r public.permits; j public.projects; v_manage boolean; v_respond boolean; v_link boolean; v_full boolean;
begin
  select * into r from public.permits where id = p_permit_id and deleted_at is null;
  if r.id is null or not public.has_capability(r.project_id, 'permits.read') then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  select * into j from public.projects where id = r.project_id;
  v_manage := public.has_capability(r.project_id, 'permits.manage');
  v_respond := public.has_capability(r.project_id, 'permits.respond');
  v_full := public.has_capability(r.project_id, 'ir.view_all') or public.has_capability(r.project_id, 'ir.decide');
  v_link := v_manage or public.has_capability(r.project_id, 'ir.decide');
  return jsonb_build_object(
    'permit', to_jsonb(r),
    'project_name', j.name,
    'timezone', j.timezone,
    'assigned_name', case when r.assigned_to is not null then public.rfi_person_name(r.assigned_to) end,
    'created_by_name', public.rfi_person_name(r.created_by),
    'can', jsonb_build_object('manage', v_manage, 'respond', v_respond, 'link', v_link),
    'moves', to_jsonb(case when v_manage then public.permit_next_stages(r.stage) else '{}'::text[] end),
    'open_inspections', public.permit_open_inspections(r.id),
    'steps', coalesce((select jsonb_agg(to_jsonb(x) order by x.position) from public.permit_progress(r.project_id, r.id) x),
                      '[]'::jsonb),
    'reviews', coalesce((
      select jsonb_agg(to_jsonb(v) || jsonb_build_object('comments', coalesce((
               select jsonb_agg(to_jsonb(c) || jsonb_build_object(
                        'responded_by_name', case when c.responded_by is not null then public.rfi_person_name(c.responded_by) end)
                      order by c.number)
                 from public.permit_comments c where c.review_id = v.id), '[]'::jsonb))
             order by (v.outcome is null) desc, v.cycle desc)
        from public.permit_reviews v where v.permit_id = r.id), '[]'::jsonb),
    'events', coalesce((
      select jsonb_agg(jsonb_build_object('stage', case e.stage when 'inspections' then 'issued' else e.stage end, 'at', e.at,
                                          'by_name', case when e.actor is not null then public.rfi_person_name(e.actor) end,
                                          'note', e.note, 'undone', e.undone_at is not null) order by e.at, e.id)
        from public.permit_stage_events e where e.permit_id = r.id), '[]'::jsonb),
    'inspections', coalesce((
      select jsonb_agg(jsonb_build_object('id', q.id, 'number', q.number, 'ofs_number', q.ofs_number, 'kind', q.kind,
                                          'special_kind', k.name, 'request_date', q.request_date, 'start_time', q.start_time,
                                          'items', q.items, 'status_key', public.ir_status_key(q.status, q.result, q.helper_id),
                                          'version', q.version)
                       order by q.request_date desc, q.number desc)
        from public.inspection_requests q
        left join public.ir_special_kinds k on k.id = q.special_kind_id
       where q.permit_id = r.id and q.deleted_at is null and (v_full or q.requested_by = auth.uid())), '[]'::jsonb),
    'linkable', case when v_link then coalesce((
      select jsonb_agg(jsonb_build_object('id', q.id, 'number', q.number, 'ofs_number', q.ofs_number, 'kind', q.kind,
                                          'special_kind', k.name, 'request_date', q.request_date, 'items', q.items,
                                          'version', q.version)
                       order by q.request_date desc, q.number desc)
        from (select * from public.inspection_requests x
               where x.project_id = r.project_id and x.permit_id is null and x.deleted_at is null
                 and x.status <> 'withdrawn' and (v_full or x.requested_by = auth.uid())
               order by x.request_date desc, x.number desc limit 50) q
        left join public.ir_special_kinds k on k.id = q.special_kind_id), '[]'::jsonb) else '[]'::jsonb end);
end;
$$;

-- =====================================================================================================================
-- Grants: the RPCs people call; the link's are the service role's; everything else is internal.
-- =====================================================================================================================
do $$
declare f text;
begin
  foreach f in array array[
    'public.ir_submit(uuid, text, date, text, text, boolean, time without time zone, text, integer, uuid, uuid[], jsonb)',
    'public.ir_submit_ofs(uuid, text, date, boolean, uuid[], uuid[], uuid, time without time zone, text, integer, uuid[], jsonb)',
    'public.permit_review_backcheck(uuid, date, uuid)']
  loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
  foreach f in array array[
    'public.link_request_submit(uuid, text, uuid, text, text, text, text, date, text, text, boolean, time without time zone, text, integer, uuid, uuid[], jsonb)',
    'public.link_request_submit_ofs(uuid, text, uuid, text, text, text, text, date, boolean, uuid[], uuid[], uuid, time without time zone, text, integer, uuid[], jsonb)']
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
  -- Internal, but the CHECKs call some of them on writes the service role may make.
  foreach f in array array[
    'public.ir_readiness_ok(jsonb)', 'public.ir_readiness_for(text, jsonb)', 'public.ir_ofs_permit(uuid)',
    'public.permit_stage_ok(text)', 'public.permit_kind_ok(text)', 'public.permit_review_kind_ok(text)',
    'public.permit_review_label(integer, integer)', 'public.permit_open_inspections(uuid)', 'public.permit_expiry_touch(uuid)',
    'public.permit_review_next(public.permits, integer, date, uuid)']
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
  execute 'revoke execute on function public.link_request_make(uuid, text, uuid, text, text, text, text, date, text, text, boolean, '
          || 'time without time zone, text, integer, uuid, uuid[], uuid[], uuid[], uuid, jsonb) from public, anon, authenticated';
  execute 'revoke execute on function public.tg_ir_permit_expiry() from public, anon, authenticated';
end $$;
