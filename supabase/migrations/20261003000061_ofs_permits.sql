-- 0061 OFS requests, Revs and Permits to OSFM's meaning, for Monday with Brock (CSU designated campus fire marshal, OFS):
-- the cut-and-dried fixes of the Oct 3 permits check (scratch research permits-check §3.1).
--   1. The OFS route (SPEC §18.4 P1, Jesse, Oct 3): sub -> GC -> inspector -> OFS. The GC step is always on an OFS
--      request; the inspector sends it to OFS (ir_send_ofs) or postpones it; from there it is the deputy's alone
--      (ir.ofs_decide): confirm, results per wall, signature. The deputy reads and decides OFS requests sent to OFS and
--      nothing else; the inspector never confirms, records or signs an OFS inspection. The inspector files requests
--      too: his own OFS request goes straight to OFS on one acknowledgment. One extra question on an OFS request:
--      special inspection required? No per-item readiness boxes: the route is the readiness check. OFS IRs and maps
--      are stored in their own folder.
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
-- not a constraint swap); the one-open-review-per-permit index is retired in place (see section 5). Functions
-- whose signature changes are new; the old ones are retired (renamed, closed to everyone), as 0054 retired
-- permit_record_stamped_set.

-- =====================================================================================================================
-- 1. The OFS route (SPEC §18.4 P1): sub -> GC -> inspector -> OFS. The route is the readiness check.
-- =====================================================================================================================
-- ---------------------------------------------------------------------------------------------------------------------
-- The matrix (rows; provisional until Jesse confirms). The fire marshal held ir.decide and ir.view_all since 0052:
-- every request of every kind. Those two rows become the OFS pair, so he has nothing to do with IOR and special
-- requests (Jesse, Oct 3). Renamed, not removed. The inspector files requests too.
--   ir.ofs_decide  the deputy's steps on an OFS request sent to OFS: confirm, postpone, results, sign, send.
--   ir.ofs_view    reads an OFS request sent to OFS (ir.ofs_decide reads them too).
--   transmittals.send  for the fire marshal: Send results on his own IRs (a file he made or may read, below).
-- ---------------------------------------------------------------------------------------------------------------------
update public.role_permissions set capability = 'ir.ofs_decide' where role = 'ahj' and capability = 'ir.decide';
update public.role_permissions set capability = 'ir.ofs_view' where role = 'ahj' and capability = 'ir.view_all';
insert into public.role_permissions (role, capability, requires_aal2) values
  ('ahj', 'ir.ofs_decide', false), ('ahj', 'ir.ofs_view', false), ('inspector', 'ir.request', false),
  -- The deputy sends the results of his own IRs (Send results, as the inspector does for his).
  ('ahj', 'transmittals.send', false)
on conflict do nothing;

-- ---------------------------------------------------------------------------------------------------------------------
-- The request: when the inspector sent it to OFS (and who), and the one extra question on an OFS request.
-- An OFS request has no helper: helpers are inspectors, and a request with OFS is the deputy's alone.
-- ---------------------------------------------------------------------------------------------------------------------
alter table public.inspection_requests
  add column ofs_sent_at timestamptz,
  add column ofs_sent_by uuid references auth.users(id),
  add column special_required boolean;

-- The OFS requests made before today: one somebody already acted on is with OFS (sent by that person) and nobody's
-- among the deputies; helpers come off.
do $$
begin
  perform set_config('app.ir_action', 'send_ofs', true);
  update public.inspection_requests
     set helper_id = null, helper_report = null, helper_note = null, helper_at = null
   where kind = 'ofs' and helper_id is not null;
  update public.inspection_requests
     set ofs_sent_at = created_at, ofs_sent_by = coalesce(owner_id, result_by, signed_by), owner_id = null
   where kind = 'ofs' and ofs_sent_at is null and coalesce(owner_id, result_by, signed_by) is not null
     and (status in ('confirmed', 'postponed', 'complete') or result is not null);
end $$;

alter table public.inspection_requests
  add constraint inspection_requests_ofs_sent_check
    check ((ofs_sent_at is null) = (ofs_sent_by is null) and (ofs_sent_at is null or kind = 'ofs')),
  add constraint inspection_requests_special_required_check check (special_required is null or kind = 'ofs'),
  add constraint inspection_requests_ofs_no_helper_check check (kind <> 'ofs' or helper_id is null);

-- ---------------------------------------------------------------------------------------------------------------------
-- Who is on a request now. One rule, read by every step below: an OFS request sent to OFS is the deputy's
-- (ir.ofs_decide); every other request, and an OFS one not sent yet, is the inspector's (ir.decide).
-- ---------------------------------------------------------------------------------------------------------------------
create function public.ir_decide_cap(p_kind text, p_ofs_sent_at timestamptz)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case when p_kind = 'ofs' and p_ofs_sent_at is not null then 'ir.ofs_decide' else 'ir.decide' end;
$$;

-- Does this member hold the capability on the job right now? (ir_member_decides, for any capability.)
create function public.ir_member_holds(p_project_id uuid, p_member uuid, p_cap text)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.project_members pm
    join public.role_permissions rp on rp.role = pm.role and rp.capability = p_cap
    where pm.project_id = p_project_id and pm.user_id = p_member and pm.status = 'active'
      and (pm.access_ends_at is null or pm.access_ends_at > now()));
$$;

-- Who reads a request in full: its requester, the GC team and the inspectors (as before), and the deputy once it is an
-- OFS request sent to OFS. He never reads an IOR or special request, or an OFS one still on its way.
create function public.ir_may_see(p_project_id uuid, p_requested_by uuid, p_kind text, p_ofs_sent_at timestamptz)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select coalesce((p_requested_by = auth.uid() and public.is_member(p_project_id))
      or public.has_capability(p_project_id, 'ir.view_all')
      or public.has_capability(p_project_id, 'ir.decide')
      or (p_kind = 'ofs' and p_ofs_sent_at is not null
          and (public.has_capability(p_project_id, 'ir.ofs_view') or public.has_capability(p_project_id, 'ir.ofs_decide'))),
    false);
$$;

alter policy "inspection_requests: requester or team reads" on public.inspection_requests
  using (deleted_at is null and public.ir_may_see(project_id, requested_by, kind, ofs_sent_at));

-- The caller may act as the one who decides this request now: holds its capability (ir_decide_cap), and the request
-- has no owner, is theirs, or its owner no longer holds that capability on the job.
create function public.ir_owner_ok(p_project_id uuid, p_owner uuid, p_kind text, p_ofs_sent_at timestamptz)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select public.has_capability(p_project_id, public.ir_decide_cap(p_kind, p_ofs_sent_at))
     and (p_owner is null or p_owner = auth.uid()
          or not public.ir_member_holds(p_project_id, p_owner, public.ir_decide_cap(p_kind, p_ofs_sent_at)));
$$;

-- A new request's place on the route, by who files it:
--   an inspector or a GC approver: past the GC step (the inspector's own OFS request is sent to OFS at once, below);
--   anyone else: the GC step when the job has it on, and always on an OFS request (while the job has a GC approver).
create function public.ir_first_status(p_project_id uuid, p_kind text)
returns text
language sql
stable
set search_path = public, pg_temp
as $$
  select case
    when public.has_capability(p_project_id, 'ir.decide') or public.has_capability(p_project_id, 'ir.gc_approve') then 'pending'
    when public.ir_setting(p_project_id, 'ir_gc_approval') then 'gc_review'
    when p_kind = 'ofs' and exists (
           select 1 from public.project_members pm
           join public.role_permissions rp on rp.role = pm.role and rp.capability = 'ir.gc_approve'
           where pm.project_id = p_project_id and pm.status = 'active' and pm.user_id is not null
             and (pm.access_ends_at is null or pm.access_ends_at > now())) then 'gc_review'
    else 'pending' end;
$$;

-- 0024: the request, locked, if the caller may see it in full (now the one rule above).
create or replace function public.ir_for_update(p_request_id uuid, p_version integer)
returns public.inspection_requests
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare r public.inspection_requests;
begin
  select * into r from public.inspection_requests where id = p_request_id and deleted_at is null for update;
  if r.id is null
     or not public.ir_may_see(r.project_id, r.requested_by, r.kind, r.ofs_sent_at) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if p_version is not null and r.version <> p_version then
    raise exception 'version_conflict: expected %, found %', p_version, r.version using errcode = '40001';
  end if;
  return r;
end;
$$;

-- 0024: a board line to whoever decides the request now: its owner, or everyone holding its capability.
create or replace function public.ir_tell_inspector(p_request public.inspection_requests, p_kind text, p_summary text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_cap text := public.ir_decide_cap(p_request.kind, p_request.ofs_sent_at);
begin
  if p_request.owner_id is not null and public.ir_member_holds(p_request.project_id, p_request.owner_id, v_cap) then
    perform public.post_activity(p_request.project_id, p_kind, p_summary, 'inspection_request', p_request.id, null,
                                 array[p_request.owner_id]);
  else
    perform public.post_activity(p_request.project_id, p_kind, p_summary, 'inspection_request', p_request.id, v_cap);
  end if;
end;
$$;

-- The deputy's board line when a request reaches OFS.
create function public.ir_tell_ofs(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare r public.inspection_requests;
begin
  select * into r from public.inspection_requests where id = p_request_id;
  perform public.post_activity(r.project_id, 'ir.ofs',
    left('IR ' || r.number || ' (OFS ' || r.ofs_number || ') for OFS · ' || r.company || ' · '
         || public.ir_when_label(r.request_date, r.start_time), 500),
    'inspection_request', r.id, 'ir.ofs_decide');
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------------
-- The submit functions (new signatures; the old ones retired): the special-inspection question on an OFS request, the
-- inspector's one acknowledgment when he files an OFS request himself, and the list's permit on a request with walls.
-- No per-item readiness boxes: every step is on record because the route recorded it.
-- ---------------------------------------------------------------------------------------------------------------------
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

-- 0024's member request.
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
  p_special_required boolean default null,
  p_inspector_ack boolean default false
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
  v_sent boolean;
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
  if p_kind = 'ofs' and p_special_required is null then
    raise exception 'Answer the special inspection question.' using errcode = '22023';
  end if;
  -- The inspector's own OFS request goes straight to OFS, on his one statement.
  v_sent := p_kind = 'ofs' and public.has_capability(p_project_id, 'ir.decide');
  if v_sent and p_inspector_ack is not true then
    raise exception 'Check the inspector''s statement first.' using errcode = '22023';
  end if;

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
    kind, special_kind_id, items, attachment_ids, notice_ack_at, status, special_required, ofs_sent_at, ofs_sent_by)
  values (
    p.org_id, p_project_id, public.next_number(p_project_id, 'ir'), v_uid, v_uid, v_company, p_request_date, p_start_time,
    v_duration, case when v_duration = 'timed' then p_duration_min end, p_kind,
    case when p_kind = 'special' then p_special_kind_id end, v_items, coalesce(p_attachment_ids, '{}'::uuid[]), now(),
    public.ir_first_status(p_project_id, p_kind), case when p_kind = 'ofs' then p_special_required end,
    case when v_sent then now() end, case when v_sent then v_uid end)
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
  if v_sent then perform public.ir_tell_ofs(r.id); end if;
  return r;
end;
$$;

-- 0057's revs request, plus the list's permit.
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
  p_special_required boolean default null,
  p_inspector_ack boolean default false
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
  v_sent boolean;
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
  if p_special_required is null then
    raise exception 'Answer the special inspection question.' using errcode = '22023';
  end if;
  -- The inspector's own OFS request goes straight to OFS, on his one statement.
  v_sent := public.has_capability(p.id, 'ir.decide');
  if v_sent and p_inspector_ack is not true then
    raise exception 'Check the inspector''s statement first.' using errcode = '22023';
  end if;

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
    kind, items, attachment_ids, notice_ack_at, status, special_required, ofs_sent_at, ofs_sent_by, permit_id)
  values (
    p.org_id, p.id, public.next_number(p.id, 'ir'), v_uid, v_uid, v_company, p_request_date, p_start_time, v_duration,
    case when v_duration = 'timed' then p_duration_min end, 'ofs', v_text, coalesce(p_attachment_ids, '{}'::uuid[]), now(),
    public.ir_first_status(p.id, 'ofs'), p_special_required, case when v_sent then now() end,
    case when v_sent then v_uid end, public.ir_ofs_permit(v_list))
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
  if v_sent then perform public.ir_tell_ofs(r.id); end if;
  return r;
end;
$$;

-- 0057's one body for the link's requests. A visitor is nobody on the job: an OFS request takes the GC step.
create function public.link_request_make(
  p_project_id uuid, p_token_hash text, p_hub_id uuid, p_name text, p_company text, p_phone text, p_email text,
  p_request_date date, p_kind text, p_items text, p_notice_ack boolean, p_start_time time, p_duration_kind text,
  p_duration_min int, p_special_kind_id uuid, p_attachment_ids uuid[], p_area_ids uuid[], p_item_ids uuid[],
  p_sheet_file_id uuid, p_special_required boolean
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
  if p_kind = 'ofs' and p_special_required is null then
    raise exception 'Answer the special inspection question.' using errcode = '22023';
  end if;

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
      special_required, permit_id)
    values (
      pr.org_id, pr.id, public.next_number(pr.id, 'ir'), null, null, v_company, v_name, v_phone, v_email,
      p_request_date, p_start_time, v_duration, case when v_duration = 'timed' then p_duration_min end, p_kind,
      case when p_kind = 'special' then p_special_kind_id end, v_items, v_files, now(), public.ir_first_status(pr.id, p_kind),
      case when p_kind = 'ofs' then p_special_required end, v_permit)
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

-- 0055's request from the link (the shared body without walls).
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
  p_special_required boolean default null
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
    null, null, null, p_special_required);
end;
$$;

-- 0057's revs request from the link.
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
  p_special_required boolean default null
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
    coalesce(p_area_ids, '{}'::uuid[]), coalesce(p_item_ids, '{}'::uuid[]), p_sheet_file_id, p_special_required);
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------------
-- The steps
-- ---------------------------------------------------------------------------------------------------------------------

-- 0024: the GC step. Once the inspector has sent it to OFS, the GC no longer takes it back.
create or replace function public.ir_gc_decide(p_request_id uuid, p_version integer, p_approve boolean, p_note text default null::text)
returns public.inspection_requests
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare r public.inspection_requests; v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  r := public.ir_for_update(p_request_id, p_version);
  if not public.has_capability(r.project_id, 'ir.gc_approve') then raise exception 'forbidden' using errcode = '42501'; end if;
  if not (r.status in ('gc_review', 'returned') or (r.status = 'pending' and r.gc_at is not null and r.ofs_sent_at is null)) then
    raise exception 'The inspector has this one now.' using errcode = '22023';
  end if;
  if p_approve is not true and v_note is null then raise exception 'Add a reason.' using errcode = '22023'; end if;
  perform set_config('app.ir_action', case when p_approve then 'gc_approve' else 'gc_return' end, true);
  update public.inspection_requests
     set status = case when p_approve then 'pending' else 'returned' end, gc_by = auth.uid(), gc_at = now(), gc_note = v_note
   where id = r.id
   returning * into r;
  if p_approve then
    perform public.ir_tell_inspector(r, 'ir.requested',
      'IR ' || r.number || ' requested · ' || r.company || ' · ' || public.ir_when_label(r.request_date, r.start_time));
  else
    perform public.ir_tell_requester(r, 'ir.returned', 'IR ' || r.number || ' returned: ' || v_note);
  end if;
  return r;
end;
$$;

-- 0024: the one who decides the request now (the caller) after this step. An OFS request not sent yet takes only the
-- inspector's routing steps (postpone; send is ir_send_ofs): he never confirms, records or signs an OFS inspection.
alter function public.ir_decider(uuid, integer) rename to ir_decider_retired_0061;
create function public.ir_decider(p_request_id uuid, p_version int, p_routing boolean default false)
returns public.inspection_requests
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare r public.inspection_requests;
begin
  r := public.ir_for_update(p_request_id, p_version);
  if not public.ir_owner_ok(r.project_id, r.owner_id, r.kind, r.ofs_sent_at) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if r.status in ('withdrawn', 'gc_review', 'returned') then
    raise exception 'This request is not with the inspector.' using errcode = '22023';
  end if;
  if r.kind = 'ofs' and r.ofs_sent_at is null and p_routing is not true then
    raise exception 'Send it to OFS first.' using errcode = '22023';
  end if;
  return r;
end;
$$;

-- The inspector sends an OFS request to OFS (from pending, or from his own postponement). It is the deputy's from here.
create function public.ir_send_ofs(p_request_id uuid, p_version int)
returns public.inspection_requests
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare r public.inspection_requests;
begin
  r := public.ir_for_update(p_request_id, p_version);
  if not public.has_capability(r.project_id, 'ir.decide') then raise exception 'forbidden' using errcode = '42501'; end if;
  if r.kind <> 'ofs' then raise exception 'Only an OFS request goes to OFS.' using errcode = '22023'; end if;
  if r.ofs_sent_at is not null then return r; end if;
  if not public.ir_owner_ok(r.project_id, r.owner_id, r.kind, r.ofs_sent_at) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if r.status not in ('pending', 'postponed') then
    raise exception 'This request is not with the inspector.' using errcode = '22023';
  end if;
  perform set_config('app.ir_action', 'send_ofs', true);
  update public.inspection_requests
     set ofs_sent_at = now(), ofs_sent_by = auth.uid(), status = 'pending', owner_id = null,
         postpone_reason = null, postpone_note = null, postpone_until = null, postponed_at = null
   where id = r.id
   returning * into r;
  perform public.ir_tell_ofs(r.id);
  perform public.ir_tell_requester(r, 'ir.ofs', 'IR ' || r.number || ' sent to OFS');
  return r;
end;
$$;

-- Undo of the send: the inspector who sent it, until the deputy has acted on it.
create function public.ir_unsend_ofs(p_request_id uuid, p_version int)
returns public.inspection_requests
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare r public.inspection_requests;
begin
  r := public.ir_for_update(p_request_id, p_version);
  if not public.has_capability(r.project_id, 'ir.decide') or r.ofs_sent_by is distinct from auth.uid() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if r.status <> 'pending' or r.owner_id is not null or r.result is not null
     or exists (select 1 from public.ir_rev_items c where c.request_id = r.id and c.result is not null) then
    raise exception 'OFS has this one now.' using errcode = '22023';
  end if;
  perform set_config('app.ir_action', 'unsend_ofs', true);
  update public.inspection_requests set ofs_sent_at = null, ofs_sent_by = null where id = r.id returning * into r;
  return r;
end;
$$;

-- 0024: postpone. The inspector may postpone an OFS request before he sends it; after, only the deputy.
create or replace function public.ir_postpone(p_request_id uuid, p_version integer, p_reason text, p_note text default null::text, p_until date default null::date)
returns public.inspection_requests
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare r public.inspection_requests; v_note text := nullif(btrim(coalesce(p_note, '')), ''); v_new boolean;
begin
  r := public.ir_decider(p_request_id, p_version, true);
  if p_reason is null or p_reason not in ('not_ready', 'weather', 'gc_requested', 'other') then
    raise exception 'Pick a reason.' using errcode = '22023';
  end if;
  if p_reason = 'other' and v_note is null then raise exception 'Add a note.' using errcode = '22023'; end if;
  if p_until is not null and p_until < r.request_date then
    raise exception 'The expected date is before the inspection.' using errcode = '22023';
  end if;
  v_new := r.status <> 'postponed';
  perform set_config('app.ir_action', 'postpone', true);
  update public.inspection_requests
     set status = 'postponed', postpone_reason = p_reason, postpone_note = v_note, postpone_until = p_until,
         postponed_at = case when v_new then now() else postponed_at end,
         postpone_count = postpone_count + case when v_new then 1 else 0 end,
         owner_id = auth.uid()
   where id = r.id
   returning * into r;
  if v_new then
    perform public.ir_tell_requester(r, 'ir.postponed', 'IR ' || r.number || ' postponed: '
      || case p_reason when 'not_ready' then 'Not ready' when 'weather' then 'Weather' when 'gc_requested' then 'GC requested'
                       else v_note end
      || coalesce(' · expected ' || to_char(p_until, 'Mon FMDD'), ''));
  end if;
  return r;
end;
$$;

-- 0024: move. "The inspector" is whoever decides the request now.
create or replace function public.ir_move(p_request_id uuid, p_version integer, p_request_date date, p_start_time time without time zone default null::time without time zone, p_duration_kind text default 'timed'::text, p_duration_min integer default null::integer)
returns public.inspection_requests
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare r public.inspection_requests; v_inspector boolean; v_status text; v_was text; v_tz text;
        v_duration text := coalesce(p_duration_kind, 'timed');
begin
  r := public.ir_for_update(p_request_id, p_version);
  v_inspector := public.ir_owner_ok(r.project_id, r.owner_id, r.kind, r.ofs_sent_at);
  if not v_inspector and r.requested_by is distinct from auth.uid() then raise exception 'forbidden' using errcode = '42501'; end if;
  if r.status in ('withdrawn', 'complete') or r.result is not null then
    raise exception 'This inspection can''t be moved.' using errcode = '22023';
  end if;
  select timezone into v_tz from public.projects where id = r.project_id;
  if p_request_date is null or p_request_date < (now() at time zone v_tz)::date then
    raise exception 'Pick today or a later day.' using errcode = '22023';
  end if;
  v_was := r.status;
  if v_inspector then
    v_status := case when r.status <> 'postponed' then r.status
                     when r.kind = 'ofs' and r.ofs_sent_at is null then 'pending' else 'confirmed' end;
  elsif r.status in ('gc_review', 'returned') then
    v_status := public.ir_first_status(r.project_id, r.kind);
  else
    v_status := 'pending';
  end if;
  perform set_config('app.ir_action', 'move', true);
  update public.inspection_requests
     set request_date = p_request_date, start_time = p_start_time, duration_kind = v_duration,
         duration_min = case when v_duration = 'timed' then p_duration_min end, status = v_status,
         postpone_reason = case when v_status = 'postponed' then postpone_reason end,
         postpone_note = case when v_status = 'postponed' then postpone_note end,
         postpone_until = case when v_status = 'postponed' then postpone_until end,
         postponed_at = case when v_status = 'postponed' then postponed_at end
   where id = r.id
   returning * into r;
  if v_inspector then
    perform public.ir_tell_requester(r, 'ir.moved', 'IR ' || r.number || ' moved to ' || public.ir_when_label(r.request_date, r.start_time));
  elsif v_status = 'gc_review' then
    perform public.post_activity(r.project_id, 'ir.gc_review',
      'IR ' || r.number || ' to review · ' || r.company || ' · ' || public.ir_when_label(r.request_date, r.start_time),
      'inspection_request', r.id, 'ir.gc_approve');
  else
    perform public.ir_tell_inspector(r, 'ir.moved', 'IR ' || r.number || ' moved to ' || public.ir_when_label(r.request_date, r.start_time));
  end if;
  return r;
end;
$$;

-- 0024: a withdrawn request comes back at the start of its route. One that starts at the GC again is no longer with OFS.
create or replace function public.ir_restore(p_request_id uuid, p_version int)
returns public.inspection_requests
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare r public.inspection_requests; v_status text; v_restart boolean;
begin
  r := public.ir_for_update(p_request_id, p_version);
  if r.requested_by is distinct from auth.uid() or not public.has_capability(r.project_id, 'ir.request') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if r.status <> 'withdrawn' then raise exception 'This inspection is not withdrawn.' using errcode = '22023'; end if;
  v_status := public.ir_first_status(r.project_id, r.kind);
  v_restart := r.kind = 'ofs' and v_status = 'gc_review';
  perform set_config('app.ir_action', 'restore', true);
  update public.inspection_requests
     set status = v_status,
         ofs_sent_at = case when v_restart then null else ofs_sent_at end,
         ofs_sent_by = case when v_restart then null else ofs_sent_by end,
         owner_id = case when v_restart then null else owner_id end
   where id = r.id
   returning * into r;
  if r.status = 'pending' then
    perform public.ir_tell_inspector(r, 'ir.requested', 'IR ' || r.number || ' requested again');
  end if;
  return r;
end;
$$;

-- 0024: claim and helpers are the inspectors' own; an OFS request has none.
create or replace function public.ir_claim(p_request_id uuid, p_version integer)
returns public.inspection_requests
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare r public.inspection_requests;
begin
  r := public.ir_for_update(p_request_id, p_version);
  if not public.has_capability(r.project_id, 'ir.decide') then raise exception 'forbidden' using errcode = '42501'; end if;
  if r.kind = 'ofs' then raise exception 'An OFS request has no helper.' using errcode = '22023'; end if;
  if r.status in ('withdrawn', 'gc_review', 'returned') then
    raise exception 'This request is not with the inspector.' using errcode = '22023';
  end if;
  if public.ir_owner_ok(r.project_id, r.owner_id, r.kind, r.ofs_sent_at) then
    if r.owner_id = auth.uid() then return r; end if;
    perform set_config('app.ir_action', 'claim', true);
    update public.inspection_requests set owner_id = auth.uid(),
           helper_id = case when helper_id = auth.uid() then null else helper_id end
     where id = r.id returning * into r;
    return r;
  end if;
  if r.helper_id = auth.uid() then return r; end if;
  if r.helper_id is not null then raise exception 'This one already has a helper.' using errcode = '22023'; end if;
  perform set_config('app.ir_action', 'helper_claim', true);
  update public.inspection_requests set helper_id = auth.uid() where id = r.id returning * into r;
  perform public.ir_tell_inspector(r, 'ir.helper', 'IR ' || r.number || ' has a helper');
  return r;
end;
$$;

create or replace function public.ir_assign_helper(p_request_id uuid, p_version integer, p_helper_id uuid default null::uuid)
returns public.inspection_requests
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare r public.inspection_requests;
begin
  r := public.ir_for_update(p_request_id, p_version);
  if r.kind = 'ofs' then raise exception 'An OFS request has no helper.' using errcode = '22023'; end if;
  if p_helper_id is null and r.helper_id = auth.uid() then
    null; -- the helper steps off
  else
    r := public.ir_decider(p_request_id, p_version);
    if p_helper_id is not null and (p_helper_id = auth.uid() or not public.ir_member_decides(r.project_id, p_helper_id)) then
      raise exception 'Pick another inspector on this job.' using errcode = '22023';
    end if;
  end if;
  perform set_config('app.ir_action', 'helper', true);
  update public.inspection_requests
     set helper_id = p_helper_id,
         owner_id = case when p_helper_id is null and r.helper_id = auth.uid() then owner_id else auth.uid() end,
         helper_report = null, helper_note = null, helper_at = null
   where id = r.id
   returning * into r;
  if p_helper_id is not null then
    perform public.post_activity(r.project_id, 'ir.helper', 'IR ' || r.number || ' assigned to you', 'inspection_request', r.id,
                                 null, array[p_helper_id]);
  end if;
  return r;
end;
$$;

-- 0024: who the results can go to (the one who decides the request sends them).
create or replace function public.ir_recipients(p_request_id uuid)
returns table(member_id uuid, user_id uuid, full_name text, company text, role text, preselect boolean)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare r public.inspection_requests;
begin
  select * into r from public.inspection_requests x where x.id = p_request_id and x.deleted_at is null;
  if r.id is null or not public.ir_owner_ok(r.project_id, r.owner_id, r.kind, r.ofs_sent_at) then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
    select pm.id, pm.user_id, coalesce(nullif(pr.full_name, ''), split_part(pm.invite_email, '@', 1)),
           coalesce(o.name, nullif(pr.company, ''), ''), pm.role,
           pm.user_id is distinct from auth.uid()
             and (coalesce(pm.user_id = r.requested_by, false)
                  or exists (select 1 from public.role_permissions rp where rp.role = pm.role and rp.capability = 'ir.view_all'))
      from public.project_members pm
      left join public.profiles pr on pr.user_id = pm.user_id
      left join public.orgs o on o.id = pm.member_org_id
     where pm.project_id = r.project_id and pm.status = 'active' and pm.user_id is not null
       and (pm.access_ends_at is null or pm.access_ends_at > now()) and not public.role_is_walled(pm.role)
     order by 6 desc, 3;
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------------
-- What each side reads
-- ---------------------------------------------------------------------------------------------------------------------
-- 0055: the inspection calendar. The deputy's is the OFS requests sent to OFS, in full: nothing of any other kind, and
-- no inspector's blocked time.
create or replace function public.ir_calendar(p_project_id uuid, p_from date, p_to date)
returns table (
  id uuid, number int, version int, full_detail boolean, mine boolean, is_block boolean, request_date date, start_time time,
  duration_kind text, duration_min int, kind text, special_kind text, status text, status_key text, result text,
  attendance text, company text, items text, owner_id uuid, helper_id uuid, postpone_reason text, postpone_until date
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare v_request boolean; v_team boolean; v_decide boolean; v_ofs boolean;
begin
  v_request := public.has_capability(p_project_id, 'ir.request');
  v_decide := public.has_capability(p_project_id, 'ir.decide');
  v_team := v_decide or public.has_capability(p_project_id, 'ir.view_all');
  v_ofs := public.has_capability(p_project_id, 'ir.ofs_view') or public.has_capability(p_project_id, 'ir.ofs_decide');
  if not (v_request or v_team or v_ofs) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 62 then
    raise exception 'Pick a shorter range.' using errcode = '22023';
  end if;
  if not (v_request or v_team) then
    return query
      select r.id, r.number, r.version, true, coalesce(r.requested_by = auth.uid(), false), false,
             r.request_date, r.start_time, r.duration_kind, r.duration_min, r.kind, null::text, r.status,
             public.ir_status_key(r.status, r.result, r.helper_id), r.result, r.attendance, r.company, r.items,
             r.owner_id, r.helper_id, r.postpone_reason, r.postpone_until
        from public.inspection_requests r
       where r.project_id = p_project_id and r.deleted_at is null and r.status <> 'withdrawn'
         and r.kind = 'ofs' and r.ofs_sent_at is not null and r.request_date between p_from and p_to
       order by r.request_date, r.start_time nulls first;
    return;
  end if;
  return query
    select c.* from public.ir_calendar_rows(p_project_id, p_from, p_to, auth.uid(), v_team, v_decide) c
     order by c.request_date, c.start_time nulls first;
end;
$$;

-- 0042: the calendar's rows with what the day list shows, plus whether an OFS request is with OFS (a new column, so the
-- old function is retired).
alter function public.calendar_inspections(uuid, date, date) rename to calendar_inspections_retired_0061;
create function public.calendar_inspections(p_project_id uuid, p_from date, p_to date)
returns table (
  id uuid, number int, version int, full_detail boolean, mine boolean, is_block boolean, request_date date, start_time time,
  duration_kind text, duration_min int, kind text, special_kind text, status text, status_key text, result text,
  attendance text, company text, items text, owner_id uuid, helper_id uuid, postpone_reason text, postpone_until date,
  attachment_ids uuid[], postpone_count int, ofs_sent boolean
)
language plpgsql
stable
set search_path = public, pg_temp
as $$
#variable_conflict use_column
begin
  -- The same test ir_calendar() makes, answered with no rows instead of an error.
  if not (public.has_capability(p_project_id, 'ir.request') or public.has_capability(p_project_id, 'ir.view_all')
          or public.has_capability(p_project_id, 'ir.decide') or public.has_capability(p_project_id, 'ir.ofs_view')
          or public.has_capability(p_project_id, 'ir.ofs_decide')) then
    return;
  end if;
  return query
    select c.id, c.number, c.version, c.full_detail, c.mine, c.is_block, c.request_date, c.start_time, c.duration_kind,
           c.duration_min, c.kind, c.special_kind, c.status, c.status_key, c.result, c.attendance, c.company, c.items,
           c.owner_id, c.helper_id, c.postpone_reason, c.postpone_until,
           coalesce(r.attachment_ids, '{}'::uuid[]), coalesce(r.postpone_count, 0), coalesce(r.ofs_sent_at is not null, false)
      from public.ir_calendar(p_project_id, p_from, p_to) c
      -- RLS on inspection_requests: the rows the caller reads in full (ir_calendar's full rows).
      left join public.inspection_requests r on r.id = c.id and not c.is_block
     order by c.request_date, c.start_time nulls first, c.number nulls last;
end;
$$;

-- 0056: who draws on a request's map: whoever decides it now, or its requester until there is a result.
create or replace function public.ir_map_editor(p_request_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((select public.has_capability(q.project_id, public.ir_decide_cap(q.kind, q.ofs_sent_at))
                          or (q.requested_by = auth.uid() and public.is_member(q.project_id) and q.result is null
                              and not exists (select 1 from public.ir_rev_items c
                                               where c.request_id = q.id and c.result is not null))
                     from public.inspection_requests q where q.id = p_request_id and q.deleted_at is null), false);
$$;

create or replace function public.ir_map_context(p_request_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare q public.inspection_requests; v jsonb;
begin
  select * into q from public.inspection_requests where id = p_request_id and deleted_at is null;
  if q.id is null or not public.ir_may_see(q.project_id, q.requested_by, q.kind, q.ofs_sent_at) then raise exception 'not_found' using errcode = 'P0002'; end if;
  v := public.ir_map_facts(q.id);
  if v is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  return v || jsonb_build_object('can_edit', q.signed_at is null and q.status <> 'withdrawn' and public.ir_map_editor(q.id));
end;
$$;

create or replace function public.ir_map_save(p_request_id uuid, p_version integer, p_strokes jsonb, p_sheet_file_id uuid default null::uuid, p_page integer default null::integer)
returns public.ir_maps
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare q public.inspection_requests; m public.ir_maps;
begin
  select * into q from public.inspection_requests where id = p_request_id and deleted_at is null for update;
  if q.id is null or not public.ir_may_see(q.project_id, q.requested_by, q.kind, q.ofs_sent_at) then raise exception 'not_found' using errcode = 'P0002'; end if;
  select * into m from public.ir_maps where request_id = q.id for update;
  if m.request_id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not public.ir_map_editor(q.id) then raise exception 'forbidden' using errcode = '42501'; end if;
  return public.ir_map_write(q, m, p_version, p_strokes, p_sheet_file_id, p_page, false);
end;
$$;

-- 0056: a request's files, for who may see the request.
create or replace function public.authorize_ir_file(p_request_id uuid, p_file_id uuid)
returns table(storage_path text, original_name text, mime text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare r public.inspection_requests; m public.ir_maps; f public.files; hdrs jsonb; v_server boolean; v_listed boolean;
begin
  select * into r from public.inspection_requests where id = p_request_id and deleted_at is null;
  if r.id is null or not public.ir_may_see(r.project_id, r.requested_by, r.kind, r.ofs_sent_at) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  select * into m from public.ir_maps where request_id = r.id;
  select * into f from public.files where id = p_file_id and project_id = r.project_id and deleted_at is null;
  -- The IR PDF and the map are server-made; the sheet was checked when it was picked.
  v_server := coalesce(p_file_id = r.ir_file_id, false) or coalesce(p_file_id = m.map_file_id, false)
              or coalesce(p_file_id = m.sheet_file_id, false);
  v_listed := coalesce(p_file_id = any (r.attachment_ids), false) or coalesce(p_file_id = any (r.result_photo_ids), false)
              or coalesce(f.created_by = auth.uid(), false);
  if not (v_server or v_listed) then raise exception 'forbidden' using errcode = '42501'; end if;
  if f.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  -- Anything else must be a request file in the attachments folder.
  if not v_server and f.folder_id is distinct from public.ir_attach_folder_id(r.project_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if f.scan_status = 'infected' then raise exception 'infected' using errcode = '42501'; end if;
  if f.scan_status = 'pending' and f.created_by is distinct from auth.uid() then
    raise exception 'scan_pending' using errcode = '42501';
  end if;
  hdrs := nullif(current_setting('request.headers', true), '')::jsonb;
  insert into public.downloads (file_id, project_id, user_id, ip, variant)
  values (f.id, f.project_id, auth.uid(), nullif(split_part(coalesce(hdrs->>'x-forwarded-for', ''), ',', 1), '')::inet, 'original');
  perform public.audit('download', 'file', f.id, f.project_id, f.org_id,
                       jsonb_build_object('variant', 'original', 'name', f.original_name, 'request_id', r.id), f.sha256);
  return query select f.storage_path, f.original_name, f.mime;
end;
$$;

-- 0050: comments on a request, for who may see it; the line goes to whoever decides it now.
create or replace function public.comment_target_readable(p_project_id uuid, p_entity_type text, p_entity_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if p_project_id is null or p_entity_id is null or auth.uid() is null or not public.is_member(p_project_id) then
    return false;
  end if;
  return coalesce(case p_entity_type
    when 'rfi' then exists (
      select 1 from public.rfis r where r.id = p_entity_id and r.project_id = p_project_id and r.deleted_at is null
         and public.rfi_may_see(r.id, r.project_id, r.created_by, r.status, r.step))
    when 'inspection_request' then exists (
      select 1 from public.inspection_requests i where i.id = p_entity_id and i.project_id = p_project_id
         and i.deleted_at is null and public.ir_may_see(i.project_id, i.requested_by, i.kind, i.ofs_sent_at))
    when 'file' then exists (
      select 1 from public.files f where f.id = p_entity_id and f.project_id = p_project_id and f.deleted_at is null
         and public.file_may_see(f.project_id, f.created_by, f.folder_id))
    when 'daily_report' then exists (
      select 1 from public.daily_reports d where d.id = p_entity_id and d.project_id = p_project_id
         and d.deleted_at is null and public.daily_may_see(d.project_id, d.author_id, d.status))
    when 'correction' then exists (
      select 1 from public.corrections c where c.id = p_entity_id and c.project_id = p_project_id
         and c.deleted_at is null and public.correction_may_see(c.project_id))
    when 'delivery' then exists (
      select 1 from public.deliveries d where d.id = p_entity_id and d.project_id = p_project_id
         and public.delivery_may_see(d.project_id))
    else false
  end, false);
end;
$$;

create or replace function public.comment_tell(p_project_id uuid, p_entity_type text, p_entity_id uuid, p_kind text, p_what text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_label text; v_cap text; v_people uuid[] := '{}'::uuid[]; v_writers uuid[];
begin
  case p_entity_type
    when 'rfi' then
      select public.rfi_label(r.number) || ': ' || r.title, 'rfi.sign_issue', array[r.created_by] || public.rfi_holder_ids(r.id)
        into v_label, v_cap, v_people from public.rfis r where r.id = p_entity_id;
    when 'inspection_request' then
      select 'IR ' || i.number, public.ir_decide_cap(i.kind, i.ofs_sent_at), array[i.requested_by]
        into v_label, v_cap, v_people from public.inspection_requests i where i.id = p_entity_id;
    when 'file' then
      select f.original_name, null, array[f.created_by]
        into v_label, v_cap, v_people from public.files f where f.id = p_entity_id;
    when 'daily_report' then
      select 'Daily report' || coalesce(' #' || d.number, ''),
             case when d.status = 'submitted' then 'dailies.read_all' end, array[d.author_id]
        into v_label, v_cap, v_people from public.daily_reports d where d.id = p_entity_id;
    when 'correction' then
      select public.correction_label(c.number) || ': ' || c.title, 'corrections.mark_ready', array[c.created_by]
        into v_label, v_cap, v_people from public.corrections c where c.id = p_entity_id;
    when 'delivery' then
      select 'Delivery #' || d.number, 'deliveries.manage', array[d.created_by]
        into v_label, v_cap, v_people from public.deliveries d where d.id = p_entity_id;
    else
      raise exception 'not_found' using errcode = 'P0002';
  end case;
  v_writers := public.rfi_users_with_cap(p_project_id, 'comments.write');
  v_people := array(
    select distinct x from unnest(coalesce(v_people, '{}'::uuid[])
                                  || array(select c.author_id from public.comments c
                                            where c.project_id = p_project_id and c.entity_type = p_entity_type
                                              and c.entity_id = p_entity_id)) as t (x)
     where x is not null and x is distinct from auth.uid() and x = any (v_writers));
  if v_cap is null and cardinality(v_people) = 0 then return; end if;
  perform public.post_activity(p_project_id, p_kind, left(p_what || ' on ' || coalesce(v_label, 'an item'), 500),
    p_entity_type, p_entity_id, v_cap, case when cardinality(v_people) > 0 then v_people end);
end;
$$;

-- 0052: the permit on a request: the official, whoever decides the request now, or its requester.
create or replace function public.set_request_permit(p_request_id uuid, p_version integer, p_permit_id uuid)
returns public.inspection_requests
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare q public.inspection_requests; r public.permits;
begin
  q := public.ir_for_update(p_request_id, null);
  if not (public.has_capability(q.project_id, 'permits.manage') or public.has_capability(q.project_id, public.ir_decide_cap(q.kind, q.ofs_sent_at))
          or q.requested_by = auth.uid())
     or not public.has_capability(q.project_id, 'permits.read') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if q.permit_id is not distinct from p_permit_id then return q; end if;
  if p_version is not null and q.version <> p_version then
    raise exception 'version_conflict: expected %, found %', p_version, q.version using errcode = '40001';
  end if;
  if p_permit_id is not null then
    select * into r from public.permits where id = p_permit_id and deleted_at is null;
    if r.id is null or r.project_id <> q.project_id then raise exception 'not_found' using errcode = 'P0002'; end if;
  end if;
  perform set_config('app.ir_action', 'permit', true);
  update public.inspection_requests set permit_id = p_permit_id where id = q.id returning * into q;
  return q;
end;
$$;

-- 0055: the visitor's receipt, plus whether the request is with OFS (the tracker's OFS step).
create or replace function public.link_request_answer(p_request_id uuid)
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'project_name', p.name,
    'number', r.number,
    'request_date', r.request_date,
    'start_time', r.start_time,
    'duration_kind', r.duration_kind,
    'duration_min', r.duration_min,
    'kind', r.kind,
    'special_kind', k.name,
    'status', r.status,
    'result', r.result,
    'result_note', r.result_note,
    'gc_step', public.ir_setting(p.id, 'ir_gc_approval') or r.gc_at is not null,
    'ofs_sent', r.ofs_sent_at is not null)
    from public.inspection_requests r
    join public.projects p on p.id = r.project_id
    left join public.ir_special_kinds k on k.id = r.special_kind_id
   where r.id = p_request_id;
$$;

-- ---------------------------------------------------------------------------------------------------------------------
-- Folders. OFS IRs and their maps get their own folder ("OFS inspection reports"), apart from the inspector's IRs. The
-- deputy adds result photos to the request folder (write only, as requesters do) and reads a request's files only
-- through the request (authorize_ir_file): he browses neither folder of the inspector's.
-- ---------------------------------------------------------------------------------------------------------------------
create or replace function public.ir_folder(p_project_id uuid, p_which text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_which = 'attachments' then
    if not (public.has_capability(p_project_id, 'ir.request') or public.has_capability(p_project_id, 'ir.decide')
            or public.has_capability(p_project_id, 'ir.ofs_decide')) then
      raise exception 'forbidden' using errcode = '42501';
    end if;
  elsif p_which = 'reports' then
    if not public.has_capability(p_project_id, 'ir.decide') then raise exception 'forbidden' using errcode = '42501'; end if;
  elsif p_which = 'ofs_reports' then
    if not public.has_capability(p_project_id, 'ir.ofs_decide') then raise exception 'forbidden' using errcode = '42501'; end if;
  else
    raise exception 'unknown folder %', p_which using errcode = '22023';
  end if;
  return public.ir_folder_make(p_project_id, p_which);
end;
$$;

create or replace function public.ir_folder_make(p_project_id uuid, p_which text)
returns uuid
language plpgsql
set search_path = public, pg_temp
as $$
declare v_org uuid; v_parent uuid; v_name text; v_kind text; f public.folders;
begin
  if p_which = 'attachments' then
    v_name := 'Inspection requests'; v_kind := 'general';
  elsif p_which = 'reports' then
    v_name := 'Inspection reports'; v_kind := 'reports';
  elsif p_which = 'ofs_reports' then
    v_name := 'OFS inspection reports'; v_kind := 'reports';
  else
    raise exception 'unknown folder %', p_which using errcode = '22023';
  end if;
  select org_id into v_org from public.projects where id = p_project_id;
  perform pg_advisory_xact_lock(hashtext('ir_folder:' || p_project_id::text || ':' || p_which));
  if p_which in ('reports', 'ofs_reports') then
    select id into v_parent from public.folders
     where project_id = p_project_id and parent_id is null and kind = 'reports' and deleted_at is null
     order by created_at limit 1;
    if v_parent is null then
      insert into public.folders (org_id, project_id, name, kind, created_by)
      values (v_org, p_project_id, 'Reports', 'reports', auth.uid())
      on conflict (project_id, parent_id, name) do update set deleted_at = null
      returning id into v_parent;
    end if;
  end if;
  select * into f from public.folders where project_id = p_project_id and parent_id is not distinct from v_parent and name = v_name;
  if f.id is not null then
    if f.deleted_at is not null then update public.folders set deleted_at = null where id = f.id; end if;
    return f.id;
  end if;
  insert into public.folders (org_id, project_id, parent_id, name, kind, created_by)
  values (v_org, p_project_id, v_parent, v_name, v_kind, auth.uid()) returning * into f;
  if p_which = 'ofs_reports' then
    insert into public.folder_access (folder_id, capability, can_read, can_write, created_by) values
      (f.id, 'ir.view_all', true, false, auth.uid()),
      (f.id, 'ir.decide', true, false, auth.uid());
    return f.id;
  end if;
  insert into public.folder_access (folder_id, capability, can_read, can_write, created_by) values
    (f.id, 'ir.view_all', true, false, auth.uid()),
    (f.id, 'ir.decide', true, true, auth.uid());
  if p_which = 'attachments' then
    insert into public.folder_access (folder_id, capability, can_read, can_write, created_by) values
      (f.id, 'ir.request', false, true, auth.uid()),
      (f.id, 'ir.ofs_decide', false, true, auth.uid());
  end if;
  return f.id;
end;
$$;

-- The request folders made before today take the deputy's result photos too.
insert into public.folder_access (folder_id, capability, can_read, can_write)
select f.id, 'ir.ofs_decide', false, true
  from public.folders f
 where f.parent_id is null and f.name = 'Inspection requests'
   and exists (select 1 from public.folder_access a where a.folder_id = f.id and a.capability = 'ir.request')
   and not exists (select 1 from public.folder_access a where a.folder_id = f.id and a.capability = 'ir.ofs_decide');

-- ---------------------------------------------------------------------------------------------------------------------
-- Send results. A transmittal carries files the sender may see: a readable folder (as before) or a file they made
-- (the IR they signed). The deputy signs OFS IRs but doesn't browse their folder, so "readable folder" alone left him
-- unable to send his own results.
-- ---------------------------------------------------------------------------------------------------------------------
create or replace function public.create_transmittal(p_project_id uuid, p_to_emails text[], p_to_members uuid[], p_file_ids uuid[], p_subject text, p_message text)
returns public.transmittals
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare t public.transmittals; oid uuid; fid uuid;
begin
  if not public.has_capability(p_project_id, 'transmittals.send') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  foreach fid in array p_file_ids loop
    if not exists (select 1 from public.files f where f.id = fid and f.project_id = p_project_id and f.deleted_at is null and f.scan_status = 'clean' and public.file_may_see(f.project_id, f.created_by, f.folder_id)) then
      raise exception 'file % is not sendable (missing, not clean, or not readable)', fid;
    end if;
  end loop;
  select org_id into oid from public.projects where id = p_project_id;
  insert into public.transmittals (org_id, project_id, number, from_user, to_emails, to_members, file_ids, subject, message, created_by)
  values (oid, p_project_id, public.next_number(p_project_id, 'transmittal'), auth.uid(),
          coalesce((select array_agg(lower(e)) from unnest(p_to_emails) e), '{}'::text[]), p_to_members, p_file_ids, p_subject, p_message, auth.uid())
  returning * into t;
  return t;
end;
$$;

alter policy "share_links: senders create" on public.share_links
  with check (created_by = auth.uid() and public.has_capability(project_id, 'transmittals.send')
    and ((target_type = 'file' and exists (
            select 1 from public.files f
             where f.id = share_links.target_id and f.project_id = share_links.project_id
               and public.file_may_see(f.project_id, f.created_by, f.folder_id)))
         or (target_type = 'folder' and exists (
            select 1 from public.folders fo where fo.id = share_links.target_id and fo.project_id = share_links.project_id)
             and public.folder_can_read(target_id))));

-- ---------------------------------------------------------------------------------------------------------------------
-- The old forms of the rules above are retired, so nothing can decide by them again.
-- ---------------------------------------------------------------------------------------------------------------------
alter function public.ir_may_see(uuid, uuid) rename to ir_may_see_retired_0061;
alter function public.ir_owner_ok(uuid, uuid) rename to ir_owner_ok_retired_0061;
alter function public.ir_first_status(uuid) rename to ir_first_status_retired_0061;
revoke execute on function
  public.ir_may_see_retired_0061(uuid, uuid), public.ir_owner_ok_retired_0061(uuid, uuid),
  public.ir_first_status_retired_0061(uuid), public.ir_decider_retired_0061(uuid, integer),
  public.calendar_inspections_retired_0061(uuid, date, date)
from public, anon, authenticated, service_role;

-- =====================================================================================================================
-- 2. The map's facts carry the permit number; the map is out of date when the permit changes
-- =====================================================================================================================
-- 0057's facts, plus the permit's number (a live permit on the request).

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
    'permit_number', (select p.primary_number from public.permits p where p.id = q.permit_id and p.deleted_at is null))
    from public.inspection_requests q
    join public.ir_maps m on m.request_id = q.id
   where q.id = p_request_id;
$$;

-- 0057's visitor map: the permit number stays with the PDF (the function's projection drops it too).
create or replace function public.link_request_map_view(p_request_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select (x.f - '{request_id,project_id,signed_at,signer_name,map_file_id,permit_number}'::text[])
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

create trigger ir_map_stale_permit after update of permit_id on public.inspection_requests
  for each row
  when (old.permit_id is distinct from new.permit_id)
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
-- Several reviews open at once; one open cycle per review. 0052's index (one open review per permit) can't be dropped
-- here (the hosted tool refuses to remove an index), so it is retired in place: the column it reads is renamed and filled, which
-- leaves that index empty for good, and "outcome" is a new column with the same values and checks. Every function reads
-- the column by name, so they all read the new one.
alter table public.permit_reviews
  drop constraint permit_reviews_outcome_check,
  drop constraint permit_reviews_check;
alter table public.permit_reviews rename column outcome to outcome_retired_0061;
alter index public.permit_reviews_open rename to permit_reviews_open_retired_0061;
alter table public.permit_reviews add column outcome text;
update public.permit_reviews set outcome = outcome_retired_0061;
update public.permit_reviews set outcome_retired_0061 = 'retired';
alter table public.permit_reviews
  alter column outcome_retired_0061 set default 'retired',
  alter column outcome_retired_0061 set not null,
  add constraint permit_reviews_outcome_check
    check (outcome in ('approved', 'approved_as_noted', 'revise_resubmit', 'rejected')),
  add constraint permit_reviews_check check ((outcome is null) = (returned_on is null));
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
declare r public.permits; j public.projects; v_manage boolean; v_respond boolean; v_link boolean;
begin
  select * into r from public.permits where id = p_permit_id and deleted_at is null;
  if r.id is null or not public.has_capability(r.project_id, 'permits.read') then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  select * into j from public.projects where id = r.project_id;
  v_manage := public.has_capability(r.project_id, 'permits.manage');
  v_respond := public.has_capability(r.project_id, 'permits.respond');
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
       where q.permit_id = r.id and q.deleted_at is null
         and public.ir_may_see(q.project_id, q.requested_by, q.kind, q.ofs_sent_at)), '[]'::jsonb),
    'linkable', case when v_link then coalesce((
      select jsonb_agg(jsonb_build_object('id', q.id, 'number', q.number, 'ofs_number', q.ofs_number, 'kind', q.kind,
                                          'special_kind', k.name, 'request_date', q.request_date, 'items', q.items,
                                          'version', q.version)
                       order by q.request_date desc, q.number desc)
        from (select * from public.inspection_requests x
               where x.project_id = r.project_id and x.permit_id is null and x.deleted_at is null
                 and x.status <> 'withdrawn' and public.ir_may_see(x.project_id, x.requested_by, x.kind, x.ofs_sent_at)
               order by x.request_date desc, x.number desc limit 50) q
        left join public.ir_special_kinds k on k.id = q.special_kind_id), '[]'::jsonb) else '[]'::jsonb end);
end;
$$;

-- =====================================================================================================================
-- Two fixes on the old stage (found while building the screens)
-- =====================================================================================================================
-- 0052's Undo of a move puts the permit back at its previous event's stage: an old move to "Inspections" reads as Issued
-- (the stage check refuses the old word).
create or replace function public.permit_undo_move(p_permit_id uuid, p_version integer)
returns public.permits
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare r public.permits; e public.permit_stage_events; prev public.permit_stage_events;
begin
  r := public.permit_lock(p_permit_id, p_version);
  if not public.has_capability(r.project_id, 'permits.manage') then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into e from public.permit_stage_events
   where permit_id = r.id and undone_at is null order by at desc, id desc limit 1;
  select * into prev from public.permit_stage_events
   where permit_id = r.id and undone_at is null and id <> e.id order by at desc, id desc limit 1;
  if e.id is null or prev.id is null or e.stage <> r.stage or e.actor is distinct from auth.uid()
     or e.at < now() - interval '15 minutes'
     or exists (select 1 from public.permit_approved_sets s where s.permit_id = r.id and s.created_at >= e.at) then
    raise exception 'That move can''t be undone now.' using errcode = '22023';
  end if;
  update public.permit_stage_events set undone_at = now(), undone_by = auth.uid() where id = e.id;
  update public.permits
     set stage = case prev.stage when 'inspections' then 'issued' else prev.stage end, stage_since = prev.at,
         issued_on = case when e.prior ? 'issued_on' then (e.prior ->> 'issued_on')::date else r.issued_on end,
         expires_on = case when e.prior ? 'expires_on' then (e.prior ->> 'expires_on')::date else r.expires_on end
   where id = r.id
   returning * into r;
  perform public.audit('permit.undo_move', 'permit', r.id, r.project_id, r.org_id,
                       jsonb_build_object('number', r.primary_number, 'stage', r.stage, 'undone', e.stage));
  perform public.post_activity(r.project_id, 'permit.stage',
    left(public.permit_label(r.primary_number) || ' back to ' || lower(public.permit_stage_label(r.stage)) || ': '
         || r.title, 500), 'permit', r.id, 'permits.read');
  return r;
end;
$$;

-- 0052's new permit: the old stage is unknown here too (it answered with the table's check, not in words).
create or replace function public.permit_create(p_project_id uuid, p_primary_number text, p_title text, p_kind text default 'building'::text, p_agency_numbers text[] default '{}'::text[], p_assigned_to uuid default null::uuid, p_notes text default ''::text, p_stage text default 'draft'::text, p_key uuid default null::uuid)
returns public.permits
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_uid uuid := auth.uid(); p public.projects; r public.permits; v_stage text := coalesce(p_stage, 'draft');
begin
  if v_uid is null or not public.has_capability(p_project_id, 'permits.manage') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into p from public.projects where id = p_project_id and deleted_at is null;
  if p.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not ('permits' = any (p.modules)) then raise exception 'Permits are off for this job.' using errcode = '22023'; end if;
  if p_key is not null then
    perform pg_advisory_xact_lock(hashtext('permit_create:' || v_uid::text || ':' || p_key::text));
    select * into r from public.permits where created_by = v_uid and request_key = p_key;
    if r.id is not null then return r; end if;
  end if;
  perform public.permit_check(p_primary_number, p_agency_numbers, p_title, p_kind, p_notes);
  if not public.permit_stage_ok(v_stage) or v_stage = 'rejected' then
    raise exception 'Unknown stage.' using errcode = '22023';
  end if;
  if not public.permit_official_ok(p.id, p_assigned_to) then
    raise exception 'Pick someone on this job who handles permits.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtext('permit_number:' || p.id::text));
  perform public.permit_number_free(p.id, p_primary_number, null);
  insert into public.permits (org_id, project_id, primary_number, agency_numbers, title, kind, stage, stage_since,
                              assigned_to, notes, created_by, request_key)
  values (p.org_id, p.id, btrim(p_primary_number), public.permit_clean_numbers(p_primary_number, p_agency_numbers),
          btrim(p_title), p_kind, v_stage, now(), p_assigned_to, btrim(coalesce(p_notes, '')), v_uid, p_key)
  returning * into r;
  insert into public.permit_stage_events (permit_id, project_id, org_id, stage, at, actor)
  values (r.id, r.project_id, r.org_id, r.stage, r.stage_since, v_uid);
  perform public.post_activity(r.project_id, 'permit.created',
    left('New ' || public.permit_label(r.primary_number) || ': ' || r.title, 500), 'permit', r.id, 'permits.read');
  return r;
end;
$$;

-- =====================================================================================================================
-- Grants: the RPCs people call; the link's are the service role's; everything else is internal.
-- =====================================================================================================================
do $$
declare f text;
begin
  foreach f in array array[
    'public.ir_submit(uuid, text, date, text, text, boolean, time without time zone, text, integer, uuid, uuid[], boolean, boolean)',
    'public.ir_submit_ofs(uuid, text, date, boolean, uuid[], uuid[], uuid, time without time zone, text, integer, uuid[], boolean, boolean)',
    'public.ir_send_ofs(uuid, integer)', 'public.ir_unsend_ofs(uuid, integer)',
    'public.calendar_inspections(uuid, date, date)',
    'public.ir_may_see(uuid, uuid, text, timestamp with time zone)',
    'public.permit_review_backcheck(uuid, date, uuid)']
  loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
  foreach f in array array[
    'public.link_request_submit(uuid, text, uuid, text, text, text, text, date, text, text, boolean, time without time zone, text, integer, uuid, uuid[], boolean)',
    'public.link_request_submit_ofs(uuid, text, uuid, text, text, text, text, date, boolean, uuid[], uuid[], uuid, time without time zone, text, integer, uuid[], boolean)']
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
  -- Internal, but the CHECKs call some of them on writes the service role may make.
  foreach f in array array[
    'public.ir_decide_cap(text, timestamp with time zone)', 'public.ir_member_holds(uuid, uuid, text)',
    'public.ir_owner_ok(uuid, uuid, text, timestamp with time zone)', 'public.ir_first_status(uuid, text)',
    'public.ir_tell_ofs(uuid)', 'public.ir_decider(uuid, integer, boolean)', 'public.ir_ofs_permit(uuid)',
    'public.permit_stage_ok(text)', 'public.permit_kind_ok(text)', 'public.permit_review_kind_ok(text)',
    'public.permit_review_label(integer, integer)', 'public.permit_open_inspections(uuid)', 'public.permit_expiry_touch(uuid)',
    'public.permit_review_next(public.permits, integer, date, uuid)']
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
  execute 'revoke execute on function public.link_request_make(uuid, text, uuid, text, text, text, text, date, text, text, boolean, '
          || 'time without time zone, text, integer, uuid, uuid[], uuid[], uuid[], uuid, boolean) from public, anon, authenticated';
  execute 'revoke execute on function public.tg_ir_permit_expiry() from public, anon, authenticated';
end $$;
