-- Inspections, Oct 4 audit fixes (SPEC §13.2, §6.4 #4).
--   * "Sign in to see all your requests" now keeps its word: joining from the request link makes the job's link requests
--     sent from the verified address the joiner's own (requested_by), in the same transaction as the membership. Only
--     that job, only requests with nobody behind them, only an exact match of the address the email code proved. The
--     visitor's typed contact stays on the row (it is how the request came in), so the row check allows a member
--     behind a link request. The receipt's map stays drawable for the visitor until a result (a link request, not "no
--     member").
--   * The visitor's tracker (link_request_answer): the postponement (reason, note to the requester, expected date) while
--     postponed, the attendance call, and whether the IR is made. Never the inspector's note to the GC, never a name.
--   * The IR by the receipt (link_request_ir_file): the same gate as the status link, scan rules, a download line.
--   * The hub link's "New link" can be undone for 15 minutes by its owner, like the job link (the previous hash kept).
--   * Words and colors as MDR: attendance reads "Be present with the IOR" / "I've got this alone" on the calendar line,
--     a confirmed request with a helper is confirmed (green), not blue.

-- =====================================================================================================================
-- 1. Joining claims the joiner's earlier link requests
-- =====================================================================================================================
alter table public.inspection_requests drop constraint inspection_requests_requester_kind;
-- A link request names the visitor and how to reach them, once they join, the member stands behind it as well.
alter table public.inspection_requests add constraint inspection_requests_requester_kind check (
  requested_by is not null
  or (requester_name is not null and (requester_phone is not null or requester_email is not null))
);

-- 0055's join, plus: the job's link requests sent from this address become the joiner's (also when the address is
-- already on the job: a request sent signed out after joining). The person is the auth user with the verified address
-- (the function passes the session's address, never the body's).
create or replace function public.link_request_join(
  p_project_id uuid, p_token_hash text, p_hub_id uuid, p_email text, p_name text, p_company text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  pr public.projects;
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_name text := public.delivery_clean(p_name, 120);
  v_company text := public.delivery_clean(p_company, 120);
  v_rows int;
  v_usable boolean;
  v_people uuid[];
  v_claimed int := 0;
  m public.project_members;
begin
  if not public.is_service_role() then raise exception 'forbidden' using errcode = '42501'; end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(v_email) > 320 then
    raise exception 'Enter a valid email.' using errcode = '22023';
  end if;
  if v_name = '' then raise exception 'Enter your name.' using errcode = '22023'; end if;
  if v_company = '' then raise exception 'Enter your company.' using errcode = '22023'; end if;
  pr := public.request_link_job(p_project_id, p_token_hash, p_hub_id);
  if pr.id is null then return null; end if;

  -- One visitor at a time per address and job, so the check and the insert agree.
  perform pg_advisory_xact_lock(hashtext('request_link_join:' || pr.id::text || ':' || v_email));
  select count(*), coalesce(bool_or(pm.status in ('invited', 'active') and (pm.access_ends_at is null or pm.access_ends_at > now())), false)
    into v_rows, v_usable
    from public.project_members pm
   where pm.project_id = pr.id
     and (pm.invite_email = v_email
          or pm.user_id in (select u.id from auth.users u where lower(u.email) = v_email));
  if v_rows > 0 and not v_usable then
    raise exception 'Your access to this job has ended. Ask the inspector.' using errcode = '42501';
  end if;
  if v_rows = 0 then
    insert into public.project_members (org_id, project_id, invite_email, role, status, invited_by)
    values (pr.org_id, pr.id, v_email, 'requester', 'invited', public.request_hub_owner(p_hub_id, p_token_hash))
    on conflict (project_id, invite_email, role) do nothing
    returning * into m;
  end if;

  -- The earlier requests from this address on this job, now the joiner's. Exactly one person has the address.
  select array_agg(u.id) into v_people from auth.users u where lower(u.email) = v_email;
  if cardinality(v_people) = 1 then
    perform set_config('app.ir_action', 'link_join', true);
    perform set_config('app.ir_actor', v_people[1]::text, true);
    update public.inspection_requests
       set requested_by = v_people[1]
     where project_id = pr.id and requested_by is null and requester_email = v_email and deleted_at is null;
    get diagnostics v_claimed = row_count;
    perform set_config('app.ir_actor', '', true);
    if v_claimed > 0 then
      perform public.audit('request_link.claim', 'project', pr.id, pr.id, pr.org_id, jsonb_build_object('requests', v_claimed),
        null, 'public_link');
    end if;
  end if;

  -- Invited through People at the same moment, or already on the job: theirs stands.
  if m.id is null then return jsonb_build_object('project_name', pr.name, 'status', 'member'); end if;
  perform public.audit('request_link.join', 'project_member', m.id, pr.id, pr.org_id,
    jsonb_build_object('via', case when p_hub_id is null then 'link' else 'hub' end, 'name', v_name, 'company', v_company),
    null, 'public_link');
  perform public.post_activity(pr.id, 'member.joined', left(v_name || ' (' || v_company || ') joined from the request link', 500),
    'project_member', m.id, 'members.manage');
  return jsonb_build_object('project_name', pr.name, 'status', 'added');
end;
$$;

-- 0057's rule by what the request is (sent through the link), not by whether a member stands behind it: the visitor
-- keeps drawing through the receipt after joining, until the inspector records a result.
create or replace function public.link_request_map_editor(p_request_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((select q.requester_name is not null and q.result is null
                          and not exists (select 1 from public.ir_rev_items c where c.request_id = q.id and c.result is not null)
                     from public.inspection_requests q where q.id = p_request_id and q.deleted_at is null), false);
$$;

-- =====================================================================================================================
-- 2. The visitor's tracker, and the IR by the receipt
-- =====================================================================================================================
-- 0061's answer, plus the postponement while postponed (the reason, the note the inspector wrote for the requester, the
-- expected date), the attendance call (whether the requester must be there with the inspector) and whether the IR is
-- made. Not the inspector's note to the GC, not the helper's report, not who did what.
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
    'ofs_sent', r.ofs_sent_at is not null,
    'postpone_reason', case when r.status = 'postponed' then r.postpone_reason end,
    'postpone_note', case when r.status = 'postponed' then r.postpone_note end,
    'postpone_until', case when r.status = 'postponed' then r.postpone_until end,
    'attendance', r.attendance,
    'has_ir', r.ir_file_id is not null)
    from public.inspection_requests r
    join public.projects p on p.id = r.project_id
    left join public.ir_special_kinds k on k.id = r.special_kind_id
   where r.id = p_request_id;
$$;

-- The request's IR PDF by its receipt (the status link's gate): scan rules, a download line with the visitor's address.
-- Null when the receipt opens nothing.
create or replace function public.link_request_ir_file(p_project_id uuid, p_receipt_hash text, p_ip text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_id uuid; q public.inspection_requests; f public.files;
begin
  if not public.is_service_role() then raise exception 'forbidden' using errcode = '42501'; end if;
  v_id := public.link_request_receipt(p_project_id, p_receipt_hash);
  if v_id is null then return null; end if;
  select * into q from public.inspection_requests where id = v_id;
  select * into f from public.files where id = q.ir_file_id and project_id = q.project_id and deleted_at is null;
  if f.id is null then raise exception 'There is no IR yet.' using errcode = '22023'; end if;
  if f.scan_status = 'infected' then raise exception 'This file is blocked.' using errcode = '42501'; end if;
  if f.scan_status = 'pending' then raise exception 'The IR is still being checked. Try again in a minute.' using errcode = '22023'; end if;
  insert into public.downloads (file_id, project_id, user_id, ip, variant)
  values (f.id, f.project_id, null, nullif(btrim(coalesce(p_ip, '')), '')::inet, 'original');
  perform public.audit('download', 'file', f.id, f.project_id, f.org_id,
    jsonb_build_object('variant', 'original', 'name', f.original_name, 'request_id', v_id, 'via', 'link', 'what', 'ir'),
    f.sha256, 'public_link');
  return jsonb_build_object('storage_path', f.storage_path, 'original_name', f.original_name, 'mime', f.mime);
end;
$$;

-- =====================================================================================================================
-- 3. The hub link: "New link" can be undone (15 minutes, its owner), like the job link
-- =====================================================================================================================
alter table public.request_hubs
  add column prev_token_hash text check (prev_token_hash is null or prev_token_hash ~ '^[0-9a-f]{64}$'),
  add column prev_rotated_at timestamptz;

-- 0046's rotate, keeping the link it replaces (only its hash) for the undo.
create or replace function public.rotate_request_hub()
returns table (hub_id uuid, token text, made_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_uid uuid := auth.uid(); v_token text; v_hash text; v_at timestamptz := clock_timestamp(); v_replaced boolean;
        h public.request_hubs;
begin
  if v_uid is null or not public.request_hub_decides(v_uid) then raise exception 'forbidden' using errcode = '42501'; end if;
  v_token := public.request_link_token();
  v_hash := encode(extensions.digest(v_token, 'sha256'), 'hex');
  v_replaced := exists (select 1 from public.request_hubs x where x.user_id = v_uid);
  insert into public.request_hubs (user_id, token_hash, created_at, rotated_at)
  values (v_uid, v_hash, v_at, v_at)
  on conflict (user_id) do update
    set prev_token_hash = request_hubs.token_hash, prev_rotated_at = request_hubs.rotated_at,
        token_hash = excluded.token_hash, rotated_at = excluded.rotated_at
  returning * into h;
  perform public.audit('request_hub.rotate', 'request_hub', h.id, null, null, jsonb_build_object('replaced', v_replaced));
  return query select h.id, v_token, v_at;
end;
$$;

-- Puts my previous hub link back, within 15 minutes of replacing it. A first link has nothing to go back to.
create or replace function public.undo_request_hub_rotation()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_uid uuid := auth.uid(); h public.request_hubs;
begin
  if v_uid is null then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into h from public.request_hubs where user_id = v_uid for update;
  if h.id is null or h.prev_token_hash is null or h.rotated_at <= now() - interval '15 minutes' then
    raise exception 'Nothing to undo.' using errcode = 'P0002';
  end if;
  update public.request_hubs
     set token_hash = h.prev_token_hash, rotated_at = h.prev_rotated_at, prev_token_hash = null, prev_rotated_at = null
   where id = h.id;
  perform public.audit('request_hub.undo', 'request_hub', h.id, null, null, '{}'::jsonb);
end;
$$;

-- =====================================================================================================================
-- 4. MDR's words and colors
-- =====================================================================================================================
-- A confirmed request with a helper is confirmed (MDR's palette has no blue), the chip says "Helper".
create or replace function public.ir_status_key(p_status text, p_result text, p_helper uuid)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case
    when p_status = 'postponed' then 'postponed'
    when p_status = 'gc_review' then 'gc_review'
    when p_status = 'returned' then 'blocked'
    when p_status = 'withdrawn' then 'cancelled'
    when p_result = 'approved' then 'approved'
    when p_result = 'not_approved' then 'not_approved'
    when p_status in ('confirmed', 'complete') then 'confirmed'
    else 'pending'
  end;
$$;

-- 0024's calendar line, with MDR's attendance words (who must be there).
create or replace function public.tg_ir_calendar()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_tz text; v_special text; v_start timestamptz; v_end timestamptz; v_all_day boolean;
begin
  if new.status = 'withdrawn' or new.deleted_at is not null then
    perform public.calendar_unmirror('inspection_request', new.id);
    return null;
  end if;
  select timezone into v_tz from public.projects where id = new.project_id;
  select name into v_special from public.ir_special_kinds where id = new.special_kind_id;
  v_all_day := new.start_time is null or new.duration_kind = 'all_day';
  v_start := (new.request_date + case when v_all_day then time '00:00' else new.start_time end) at time zone v_tz;
  v_end := case when not v_all_day and new.duration_kind = 'timed' then v_start + make_interval(mins => new.duration_min) end;
  perform public.calendar_mirror(
    'inspection_request', new.id, new.project_id,
    case when new.kind = 'special' then 'special_inspections' else 'inspections' end,
    'IR ' || new.number || ' ' || public.ir_type_label(new.kind, v_special) || ' · ' || new.company
      || case new.attendance when 'be_present' then ' · Be present with the IOR' when 'alone' then ' · I''ve got this alone' else '' end,
    v_start, v_end, v_all_day, public.ir_status_key(new.status, new.result, new.helper_id), 'ir.view_all');
  return null;
end;
$$;

-- The lines already on the calendar, in the same words and colors.
update public.calendar_entries set title = left(title || ' with the IOR', 300)
 where source_type = 'inspection_request' and title like '% · Be present';
update public.calendar_entries set title = left(title || ' alone', 300)
 where source_type = 'inspection_request' and title like '% · I''ve got this';
update public.calendar_entries set status = 'confirmed'
 where source_type = 'inspection_request' and status = 'assigned';

-- =====================================================================================================================
-- Grants (SPEC §6.2): the link function is service-role only, the undo is the hub owner's (authenticated), the rest
-- keep what they had (create or replace keeps grants).
-- =====================================================================================================================
revoke execute on function public.link_request_ir_file(uuid, text, text) from public, anon, authenticated;
grant execute on function public.link_request_ir_file(uuid, text, text) to service_role;
revoke execute on function public.undo_request_hub_rotation() from public, anon;
grant execute on function public.undo_request_hub_rotation() to authenticated, service_role;
