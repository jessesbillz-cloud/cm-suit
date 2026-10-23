-- 0112 Hunter Hall from My Daily Reports, once a day (Jesse, Oct 23: "You actually have to use it and review the data
-- of what did happen."). MDR keeps running for his jobs. Its inspection requests are copied into the suite one way,
-- read-only, at the end of each day, so the suite's calendar and inspections fill with real work. MDR is never written
-- to. Nothing here holds a job, a person or an address: which MDR job feeds which suite job is a row of data.
--   1. mdr_job_links: the MDR job, the suite job, and the IR numbers of requests typed in by hand before the mirror
--      (adopted by number instead of copied twice). mdr_sync_state: each link's cursor (MDR updated_at) and the run.
--   2. inspection_requests.mdr_id (the MDR row, unique per job) and mdr_updated_at. A mirrored request keeps MDR's IR
--      number. MDR reuses numbers (one IR number on several requests), so the suite's own requests stay unique among
--      themselves (hidden ones too, never reused) and mirrored rows are unique by mdr_id. Each import moves the job's
--      own counter past the highest mirrored number.
--   3. View only: a mirrored request refuses every change except the import's (a trigger on the table, so every ir_*
--      step, the map, the rev results and wall photos refuse it) and claiming it by the requester's email
--      (link_request_join). It is read by the same rules as any request and shows wherever requests show.
--   4. The import: mdr_sync_begin answers the read-only SELECT to run on MDR, whose rows are the import calls
--      (mdr_import_requests, JSON batches of 50, no semicolons in the text), mdr_sync_end moves the cursor. Only the
--      database owner runs them (the scheduled task, through the SQL tool). Safe to repeat.
--   5. Files: MDR's attachment and IR PDF links wait in mdr_file_queue. The mdr-files function (cron) copies each one
--      into private storage (attachments into the request's folder, the IR PDF where IR PDFs live) and links it.
--      pg_cron calls it at 03:15, 03:45 ... 05:45 UTC when anything waits (after the 6 pm Pacific import).
-- Not copied: dailies, deliveries, other jobs, OFS card sign-offs.

-- =====================================================================================================================
-- 1. Which MDR job feeds which suite job, and where each one's copy stands
-- =====================================================================================================================
create table public.mdr_job_links (
  mdr_job_id uuid primary key,
  created_at timestamptz not null default now(),
  project_id uuid not null unique references public.projects(id),
  -- Requests typed into the suite by hand before the mirror, numbered as in MDR: adopted by number, not copied again.
  adopt_from int check (adopt_from is null or adopt_from > 0),
  adopt_to int check (adopt_to is null or adopt_to >= adopt_from),
  active boolean not null default true
);
alter table public.mdr_job_links enable row level security;
revoke all on public.mdr_job_links from public, anon, authenticated, service_role;

create table public.mdr_sync_state (
  mdr_job_id uuid primary key references public.mdr_job_links(mdr_job_id),
  -- The newest MDR updated_at copied. The next run reads rows changed after it.
  cursor_at timestamptz,
  last_run_at timestamptz,
  last_result jsonb,
  -- The run in progress (mdr_sync_begin to mdr_sync_end).
  run_started_at timestamptz,
  run_max_seen timestamptz,
  run_min_error timestamptz,
  run_counts jsonb not null default '{}'::jsonb
);
alter table public.mdr_sync_state enable row level security;
revoke all on public.mdr_sync_state from public, anon, authenticated, service_role;

-- =====================================================================================================================
-- 2. The mirrored request
-- =====================================================================================================================
alter table public.inspection_requests
  add column mdr_id uuid,
  add column mdr_updated_at timestamptz;
create unique index inspection_requests_mdr on public.inspection_requests (project_id, mdr_id) where mdr_id is not null;

-- The suite's own numbers stay unique per job (hidden requests too: a number is never reused). Mirrored rows carry
-- MDR's numbers, which MDR has reused.
alter table public.inspection_requests drop constraint inspection_requests_project_id_number_key;
create unique index inspection_requests_number_own on public.inspection_requests (project_id, number) where mdr_id is null;

-- MDR names no suite person: a mirrored request may have no requester account and no contact, and an OFS request
-- MDR sent has no suite sender.
alter table public.inspection_requests drop constraint inspection_requests_requester_kind;
alter table public.inspection_requests add constraint inspection_requests_requester_kind
  check (requested_by is not null or mdr_id is not null
         or (requester_name is not null and (requester_phone is not null or requester_email is not null)));
alter table public.inspection_requests drop constraint inspection_requests_ofs_sent_check;
alter table public.inspection_requests add constraint inspection_requests_ofs_sent_check
  check (((ofs_sent_at is null) = (ofs_sent_by is null) or (mdr_id is not null and ofs_sent_by is null))
         and (ofs_sent_at is null or kind = 'ofs'));

-- =====================================================================================================================
-- 3. View only
-- =====================================================================================================================
-- Runs first of the row's triggers. app.mdr_import is set only inside the import and the file steps below.
create or replace function public.tg_ir_mdr_view_only()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if old.mdr_id is null and new.mdr_id is null then return new; end if;
  if coalesce(current_setting('app.mdr_import', true), '') = 'on' then return new; end if;
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
create trigger a_mdr_view_only before update on public.inspection_requests
  for each row execute function public.tg_ir_mdr_view_only();

-- The steps that lock a request first say so before anything else.
create or replace function public.ir_for_update(p_request_id uuid, p_version int)
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
  if r.mdr_id is not null then raise exception 'This request comes from MDR. It is view only.' using errcode = '42501'; end if;
  if p_version is not null and r.version <> p_version then
    raise exception 'version_conflict: expected %, found %', p_version, r.version using errcode = '40001';
  end if;
  return r;
end;
$$;

-- The request's map, rev cells and wall photos: none on a mirrored request.
create or replace function public.tg_mdr_request_view_only()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if exists (select 1 from public.inspection_requests q where q.id = new.request_id and q.mdr_id is not null)
     and coalesce(current_setting('app.mdr_import', true), '') <> 'on' then
    raise exception 'This request comes from MDR. It is view only.' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke execute on function public.tg_mdr_request_view_only() from public, anon, authenticated;
create trigger a_mdr_view_only before insert or update on public.ir_maps
  for each row execute function public.tg_mdr_request_view_only();
create trigger a_mdr_view_only before insert or update on public.ir_rev_items
  for each row execute function public.tg_mdr_request_view_only();
create trigger a_mdr_view_only before insert or update on public.rev_photos
  for each row when (new.request_id is not null) execute function public.tg_mdr_request_view_only();

-- No suite OFS number and no filing statement on a copied OFS request (MDR's own numbering is in its text).
create or replace function public.tg_ir_ofs_number()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.kind = 'ofs' and new.ofs_number is null and new.mdr_id is null then
    perform pg_advisory_xact_lock(hashtext('ofs_number:' || new.project_id::text));
    new.ofs_number := public.ir_ofs_next_number(new.project_id);
  end if;
  return new;
end;
$$;

create or replace function public.tg_ir_ofs_stamp()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_uid uuid := auth.uid();
begin
  if tg_op = 'INSERT' then
    if new.kind <> 'ofs' or new.mdr_id is not null then return new; end if;
    if v_uid is not null and public.has_capability(new.project_id, 'ir.decide') then
      -- The inspector's own request: his one statement is his Ready.
      new.ofs_ready_by := v_uid;
      new.ofs_ready_at := now();
    else
      new.ofs_attest_by := new.requested_by;
      new.ofs_attest_at := now();
      new.ofs_attest_text := public.ir_ofs_attest_wording(new.project_id);
      -- Filed by the GC: past the GC step, and the filing is the GC's Ready.
      if v_uid is not null and public.has_capability(new.project_id, 'ir.gc_approve') and new.status = 'pending' then
        new.gc_by := v_uid;
        new.gc_at := now();
      end if;
    end if;
    return new;
  end if;
  -- Back to the GC (returned, or moved by its requester): the inspector checks it again.
  if new.kind = 'ofs' and new.status in ('gc_review', 'returned') and old.status not in ('gc_review', 'returned') then
    new.ofs_ready_by := null;
    new.ofs_ready_at := null;
    new.ofs_si_by := null;
    new.ofs_si_at := null;
    new.ofs_si_file_id := null;
  end if;
  return new;
end;
$$;

-- An OFS line without a suite OFS number reads "IR 12".
create or replace function public.ir_ofs_calendar_sync(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare r public.inspection_requests; pr public.projects; v_state text; v_all_day boolean; v_start timestamptz;
  v_end timestamptz; v_word text;
begin
  select * into r from public.inspection_requests where id = p_request_id;
  if r.id is null or r.kind <> 'ofs' or r.ofs_sent_at is null or r.status = 'withdrawn' or r.deleted_at is not null then
    perform public.calendar_unmirror('ofs_request', p_request_id);
    return;
  end if;
  select * into pr from public.projects where id = r.project_id;
  v_state := public.ir_ofs_sched_state(r.status, r.result, r.ofs_sched);
  v_word := case v_state when 'asked' then 'Asked' when 'confirmed' then 'Confirmed' when 'proposed' then 'New time proposed'
                         when 'postponed' then 'Postponed'
                         else case r.result when 'approved' then 'Approved' when 'not_approved' then 'Not approved' else 'Done' end end;
  v_all_day := r.start_time is null or r.duration_kind = 'all_day';
  v_start := (r.request_date + case when v_all_day then time '00:00' else r.start_time end) at time zone pr.timezone;
  v_end := case when not v_all_day and r.duration_kind = 'timed' then v_start + make_interval(mins => r.duration_min) end;
  perform public.calendar_mirror(
    'ofs_request', r.id, r.project_id, 'inspections',
    case when r.ofs_number is null then 'IR ' || r.number else public.ir_ofs_label(r.ofs_number) end
      || ' ' || v_word || ' · ' || r.company
      || coalesce(' · ' || nullif(public.ir_ofs_place(r.id), ''), ''),
    v_start, v_end, v_all_day, public.ir_status_key(r.status, r.result, null), 'ir.ofs_view', null,
    nullif(btrim(coalesce(pr.address, '')), ''));
end;
$$;

-- The day lists know a copy (no one-tap Confirm on it): calendar_inspections answers from_mdr (a new column, so the
-- old function is retired).
alter function public.calendar_inspections(uuid, date, date) rename to calendar_inspections_retired_0112;
revoke execute on function public.calendar_inspections_retired_0112(uuid, date, date)
  from public, anon, authenticated, service_role;
create function public.calendar_inspections(p_project_id uuid, p_from date, p_to date)
returns table (
  id uuid, number int, version int, full_detail boolean, mine boolean, is_block boolean, request_date date, start_time time,
  duration_kind text, duration_min int, kind text, special_kind text, status text, status_key text, result text,
  attendance text, company text, items text, owner_id uuid, helper_id uuid, postpone_reason text, postpone_until date,
  attachment_ids uuid[], postpone_count int, ofs_sent boolean, from_mdr boolean
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
           coalesce(r.attachment_ids, '{}'::uuid[]), coalesce(r.postpone_count, 0), coalesce(r.ofs_sent_at is not null, false),
           coalesce(r.mdr_id is not null, false)
      from public.ir_calendar(p_project_id, p_from, p_to) c
      -- RLS on inspection_requests: the rows the caller reads in full (ir_calendar's full rows).
      left join public.inspection_requests r on r.id = c.id and not c.is_block
     order by c.request_date, c.start_time nulls first, c.number nulls last;
end;
$$;
revoke execute on function public.calendar_inspections(uuid, date, date) from public, anon;
grant execute on function public.calendar_inspections(uuid, date, date) to authenticated, service_role;

-- =====================================================================================================================
-- 4. The import
-- =====================================================================================================================
-- MDR's status to the suite's. Approved and not approved are 'complete' once their IR PDF is on file. Deleted is
-- handled apart (hidden). Anything else is not known: the row is refused and listed.
create or replace function public.mdr_ir_status(p_status text, p_has_pdf boolean)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case lower(btrim(coalesce(p_status, '')))
    when 'approved' then case when p_has_pdf then 'complete' else 'confirmed' end
    when 'not_approved' then case when p_has_pdf then 'complete' else 'confirmed' end
    when 'scheduled' then 'confirmed'
    when 'confirmed' then 'confirmed'
    when 'pending' then 'pending'
    when 'postponed' then 'postponed'
    when 'cancelled' then 'withdrawn'
    when 'canceled' then 'withdrawn'
    when 'withdrawn' then 'withdrawn'
    when 'gc_review' then 'gc_review'
    when 'pending_gc' then 'gc_review'
    when 'returned' then 'returned'
    when 'gc_returned' then 'returned'
  end;
$$;

create or replace function public.mdr_ir_result(p_status text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case lower(btrim(coalesce(p_status, '')))
    when 'approved' then 'approved' when 'not_approved' then 'not_approved' end;
$$;

create or replace function public.mdr_ir_kind(p_types text[], p_special text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case
    when exists (select 1 from unnest(coalesce(p_types, '{}')) t where lower(btrim(t)) = 'ofs') then 'ofs'
    when exists (select 1 from unnest(coalesce(p_types, '{}')) t where lower(btrim(t)) = 'special')
         or nullif(btrim(coalesce(p_special, '')), '') is not null then 'special'
    else 'ior' end;
$$;

create or replace function public.mdr_ir_postpone_reason(p_reason text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case
    when nullif(btrim(coalesce(p_reason, '')), '') is null then null
    when lower(p_reason) like '%not ready%' then 'not_ready'
    when lower(p_reason) like '%weather%' or lower(p_reason) like '%rain%' then 'weather'
    when lower(p_reason) like '%gc%' then 'gc_requested'
    else 'other' end;
$$;

-- A date MDR typed wrong (year 0026) is not a date: the requested date stands in.
create or replace function public.mdr_sane_date(p_value text)
returns date
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare d date;
begin
  if p_value is null or p_value !~ '^\d{4}-\d{2}-\d{2}' then return null; end if;
  d := left(p_value, 10)::date;
  return case when d between date '2000-01-01' and date '2100-12-31' then d end;
end;
$$;

revoke execute on function public.mdr_ir_status(text, boolean), public.mdr_ir_result(text),
  public.mdr_ir_kind(text[], text), public.mdr_ir_postpone_reason(text), public.mdr_sane_date(text)
  from public, anon, authenticated, service_role;

-- One MDR row into the suite. Answers what happened: inserted, updated, adopted, unchanged, hidden, skipped:<why>.
-- Raises on a row it can't take (the batch lists it and goes on).
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
  v_date := coalesce(public.mdr_sane_date(p_row->>'inspection_date'), public.mdr_sane_date(p_row->>'requested_date'));
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
  v_created := coalesce(nullif(p_row->>'created_at', '')::timestamptz, v_updated);
  v_att := case lower(coalesce(p_row->>'attendance', '')) when 'present_required' then 'be_present' when 'solo' then 'alone' end;

  -- A request typed in by hand before the mirror, with this number: adopted, not copied again.
  if r.id is null and v_number between coalesce(p_link.adopt_from, 0) and coalesce(p_link.adopt_to, -1) then
    select * into r from public.inspection_requests q
     where q.project_id = p_link.project_id and q.mdr_id is null and q.deleted_at is null and q.number = v_number
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
           ofs_sent_at = v_sent, ofs_sent_by = case when v_sent is null then null else ofs_sent_by end
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

-- A batch: a JSON array of MDR rows (the SELECT from mdr_sync_begin makes it). Each row stands alone: a row that
-- can't be taken is listed with why and the rest go on. Answers the counts, the refused rows and the rows skipped.
create or replace function public.mdr_import_requests(p_rows jsonb)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  x jsonb; l public.mdr_job_links; v_action text; v_ts timestamptz;
  v_counts jsonb := '{}'::jsonb; v_errors jsonb := '[]'::jsonb; v_skipped jsonb := '[]'::jsonb; v_shared int[];
  v_projects uuid[] := '{}';
begin
  if jsonb_typeof(p_rows) is distinct from 'array' then raise exception 'Pass a JSON array of MDR rows.'; end if;
  if jsonb_array_length(p_rows) > 200 then raise exception 'At most 200 rows a call.'; end if;
  for x in select e from jsonb_array_elements(p_rows) e loop
    v_ts := null;
    begin
      v_ts := (x->>'updated_at')::timestamptz;
      select * into l from public.mdr_job_links where mdr_job_id = (x->>'job_id')::uuid and active;
      if l.mdr_job_id is null then raise exception 'MDR job % is not linked', coalesce(x->>'job_id', '(none)'); end if;
      v_action := public.mdr_import_one(l, x);
      if v_action like 'skipped:%' then
        v_skipped := v_skipped || jsonb_build_object('mdr_id', x->>'id', 'ir_number', x->'ir_number',
                                                     'why', substr(v_action, 9));
        v_action := 'skipped';
      end if;
      v_counts := jsonb_set(v_counts, array[v_action], to_jsonb(coalesce((v_counts->>v_action)::int, 0) + 1));
      if not (l.project_id = any (v_projects)) then v_projects := v_projects || l.project_id; end if;
      update public.mdr_sync_state
         set run_max_seen = greatest(run_max_seen, v_ts),
             run_counts = jsonb_set(run_counts, array[v_action], to_jsonb(coalesce((run_counts->>v_action)::int, 0) + 1))
       where mdr_job_id = l.mdr_job_id;
    exception when others then
      v_errors := v_errors || jsonb_build_object('mdr_id', x->>'id', 'ir_number', x->'ir_number', 'error', sqlerrm);
      -- The cursor stops before the first refused row, so it is read again next time.
      update public.mdr_sync_state
         set run_min_error = least(coalesce(run_min_error, v_ts), v_ts),
             run_counts = jsonb_set(run_counts, '{errors}', to_jsonb(coalesce((run_counts->>'errors')::int, 0) + 1))
       where mdr_job_id = (select k.mdr_job_id from public.mdr_job_links k where k.mdr_job_id::text = x->>'job_id');
    end;
  end loop;

  -- The job's own counter goes past every mirrored number, and a mirrored number that one of the suite's own live
  -- requests also carries is listed.
  insert into public.project_counters (project_id, kind, next_value)
  select q.project_id, 'ir', max(q.number) + 1 from public.inspection_requests q
   where q.project_id = any (v_projects) and q.mdr_id is not null group by q.project_id
  on conflict (project_id, kind) do update set next_value = greatest(project_counters.next_value, excluded.next_value);
  select array_agg(distinct m.number order by m.number) into v_shared
    from public.inspection_requests m
    join public.inspection_requests o on o.project_id = m.project_id and o.number = m.number and o.mdr_id is null
                                     and o.deleted_at is null
   where m.project_id = any (v_projects) and m.mdr_id is not null and m.deleted_at is null;

  return jsonb_build_object('rows', jsonb_array_length(p_rows), 'counts', v_counts, 'errors', v_errors,
                            'skipped', v_skipped, 'numbers_also_on_suite_requests', coalesce(to_jsonb(v_shared), '[]'::jsonb),
                            'files_waiting', (select count(*) from public.mdr_file_queue where status = 'queued'));
end;
$$;

-- Starts a run: answers the read-only SELECT to run on MDR (rows changed since each link's cursor). Its rows are the
-- import calls, one per batch of 50.
create or replace function public.mdr_sync_begin()
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare v_where text; v_sql text;
begin
  insert into public.mdr_sync_state (mdr_job_id) select mdr_job_id from public.mdr_job_links where active
  on conflict (mdr_job_id) do nothing;
  update public.mdr_sync_state s
     set run_started_at = now(), run_max_seen = null, run_min_error = null, run_counts = '{}'::jsonb
   where s.mdr_job_id in (select mdr_job_id from public.mdr_job_links where active);
  select string_agg(format('(job_id = %L::uuid and updated_at > %L::timestamptz)', l.mdr_job_id,
                           coalesce(s.cursor_at, '-infinity'::timestamptz)), ' or ' order by l.mdr_job_id)
    into v_where
    from public.mdr_job_links l join public.mdr_sync_state s on s.mdr_job_id = l.mdr_job_id
   where l.active;
  if v_where is null then raise exception 'No MDR job is linked (mdr_job_links).'; end if;
  v_sql := 'with r as (select id, job_id, ir_number, ir_title, inspection_types, special_type, inspection_date, '
    || 'requested_date, inspection_time, duration, flexible_display, status, approval_status, approved_at, approved_by, '
    || 'inspector_notes, notes, requester_name, requester_company, requester_email, subcontractor, sub_trade, gc, '
    || 'location_detail, attendance, file_urls, ir_pdf_url, postpone_reason, postpone_note, expected_date, '
    || 'postpone_count, cancel_reason, deleted_at, created_at, updated_at from public.inspection_requests where '
    || v_where || '), n as (select r.*, (row_number() over (order by updated_at, id) - 1) / 50 as batch from r) '
    || 'select batch + 1 as batch, count(*) as rows, max(updated_at) as last_updated_at, '
    || '''select public.mdr_import_requests('' || quote_literal(replace((jsonb_agg(to_jsonb(n) - ''batch'' '
    || 'order by updated_at, id))::text, chr(59), ''\u003b'')) || ''::jsonb)'' as suite_sql '
    || 'from n group by batch order by batch';
  return jsonb_build_object('started_at', now(), 'mdr_sql', v_sql);
end;
$$;

-- Ends a run: each link's cursor moves to the newest row read, or to just before the first refused row. Answers
-- what the run did and asks mdr-files to copy what waits.
create or replace function public.mdr_sync_end()
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare v_out jsonb := '[]'::jsonb; s public.mdr_sync_state; v_cursor timestamptz; v_kick text;
begin
  for s in select * from public.mdr_sync_state where run_started_at is not null for update loop
    v_cursor := case when s.run_min_error is not null then s.run_min_error - interval '1 microsecond' else s.run_max_seen end;
    v_cursor := greatest(s.cursor_at, v_cursor);
    update public.mdr_sync_state
       set cursor_at = coalesce(v_cursor, cursor_at), last_run_at = now(),
           last_result = run_counts || jsonb_build_object('started_at', run_started_at),
           run_started_at = null, run_max_seen = null, run_min_error = null, run_counts = '{}'::jsonb
     where mdr_job_id = s.mdr_job_id;
    v_out := v_out || jsonb_build_object('mdr_job_id', s.mdr_job_id, 'cursor', coalesce(v_cursor, s.cursor_at),
                                         'counts', s.run_counts, 'stopped_at_error', s.run_min_error is not null);
  end loop;
  if v_out = '[]'::jsonb then raise exception 'No run in progress. Run mdr_sync_begin first.'; end if;
  begin
    perform public.mdr_files_kick();
    v_kick := 'asked';
  exception when others then
    v_kick := 'not asked: ' || sqlerrm;
  end;
  return jsonb_build_object('jobs', v_out, 'files_waiting', (select count(*) from public.mdr_file_queue where status = 'queued'),
                            'files_kick', v_kick);
end;
$$;

revoke execute on function public.mdr_import_one(public.mdr_job_links, jsonb), public.mdr_import_requests(jsonb),
  public.mdr_sync_begin(), public.mdr_sync_end()
  from public, anon, authenticated, service_role;

-- =====================================================================================================================
-- 5. Files
-- =====================================================================================================================
create table public.mdr_file_queue (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  project_id uuid not null references public.projects(id),
  request_id uuid not null references public.inspection_requests(id),
  role text not null check (role in ('attachment', 'ir_pdf')),
  url text not null check (length(url) between 10 and 2000),
  status text not null default 'queued' check (status in ('queued', 'working', 'done', 'failed', 'refused')),
  tries int not null default 0 check (tries between 0 and 3),
  error text check (error is null or length(error) <= 1000),
  file_id uuid references public.files(id),
  claimed_at timestamptz,
  done_at timestamptz,
  unique (request_id, role, url)
);
alter table public.mdr_file_queue enable row level security;
revoke all on public.mdr_file_queue from public, anon, authenticated, service_role;
create index mdr_file_queue_waiting on public.mdr_file_queue (created_at) where status in ('queued', 'working');

-- mdr-files takes up to p_limit files to copy (a file left 'working' for 15 minutes counts as a failed try). Each
-- answers its folder: IR PDFs where the suite keeps IR PDFs, attachments in the request files folder.
create or replace function public.mdr_file_claim(p_limit int)
returns table (id uuid, url text, role text, project_id uuid, request_id uuid, number int, folder_id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
begin
  if not public.is_service_role() then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.mdr_file_queue q
     set status = case when q.tries + 1 >= 3 then 'failed' else 'queued' end, tries = q.tries + 1,
         error = 'Stopped before it finished.', updated_at = now()
   where q.status = 'working' and q.claimed_at < now() - interval '15 minutes';
  return query
    with picked as (
      select q.id from public.mdr_file_queue q
       -- A failed try waits 10 minutes, so one outage doesn't spend all three tries in one run.
       where q.status = 'queued' and (q.tries = 0 or q.updated_at < now() - interval '10 minutes')
       order by q.created_at, q.id
       limit least(greatest(coalesce(p_limit, 10), 1), 50)
       for update skip locked)
    update public.mdr_file_queue q
       set status = 'working', claimed_at = now(), updated_at = now()
      from picked, public.inspection_requests r
     where q.id = picked.id and r.id = q.request_id
    returning q.id, q.url, q.role, q.project_id, q.request_id, r.number,
              public.ir_folder_make(q.project_id,
                case when q.role = 'attachment' then 'attachments' when r.kind = 'ofs' then 'ofs_reports' else 'reports' end);
end;
$$;

-- The copy is stored: link it. An attachment joins the request's files (and is scanned like any upload). The IR PDF
-- becomes the request's IR, its hash the content hash, and a decided request is complete.
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

-- A copy failed: tried again on the next run, three tries in all. A link to anywhere but MDR is refused for good.
create or replace function public.mdr_file_failed(p_id uuid, p_error text, p_refused boolean)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_service_role() then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.mdr_file_queue
     set tries = least(tries + 1, 3),
         status = case when coalesce(p_refused, false) then 'refused' when tries + 1 >= 3 then 'failed' else 'queued' end,
         error = left(coalesce(nullif(btrim(p_error), ''), 'Failed.'), 1000), updated_at = now()
   where id = p_id and status = 'working';
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
end;
$$;

revoke execute on function public.mdr_file_claim(int), public.mdr_file_done(uuid, uuid),
  public.mdr_file_failed(uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.mdr_file_claim(int), public.mdr_file_done(uuid, uuid),
  public.mdr_file_failed(uuid, text, boolean) to service_role;

-- Where the copying stands (the morning check).
create or replace function public.mdr_files_status()
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'counts', coalesce((select jsonb_object_agg(status, n) from (select status, count(*) n from public.mdr_file_queue group by status) c), '{}'::jsonb),
    'problems', coalesce((select jsonb_agg(jsonb_build_object('url', q.url, 'ir', r.number, 'status', q.status, 'tries', q.tries,
                                                              'error', q.error) order by q.updated_at desc)
                            from public.mdr_file_queue q join public.inspection_requests r on r.id = q.request_id
                           where q.status in ('failed', 'refused')), '[]'::jsonb));
$$;

-- Asks the mdr-files function to run (pg_net). Needs the Vault secrets project_url, anon_key (the platform key the
-- cron call passes verify_jwt with) and cron_secret (the function's CRON_SECRET). Missing ones refuse.
create or replace function public.mdr_files_kick()
returns bigint
language plpgsql
set search_path = public, pg_temp
as $$
declare v_url text; v_key text; v_secret text; v_id bigint;
begin
  if to_regclass('vault.decrypted_secrets') is null or to_regnamespace('net') is null then
    raise exception 'mdr-files: pg_net and Vault are needed' using errcode = '55000';
  end if;
  execute 'select (select decrypted_secret from vault.decrypted_secrets where name = ''project_url''),
                  (select decrypted_secret from vault.decrypted_secrets where name = ''anon_key''),
                  (select decrypted_secret from vault.decrypted_secrets where name = ''cron_secret'')'
     into v_url, v_key, v_secret;
  if v_url is null or v_key is null or v_secret is null then
    raise exception 'mdr-files: set the Vault secrets project_url, anon_key and cron_secret' using errcode = '55000';
  end if;
  execute 'select net.http_post(url := $1, headers := $2, body := $3, timeout_milliseconds := 150000)'
     into v_id
    using rtrim(v_url, '/') || '/functions/v1/mdr-files',
          jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key, 'x-cron-secret', v_secret),
          '{}'::jsonb;
  return v_id;
end;
$$;

-- The cron step: only when something waits.
create or replace function public.mdr_files_cron()
returns int
language plpgsql
set search_path = public, pg_temp
as $$
declare n int;
begin
  select count(*) into n from public.mdr_file_queue where status = 'queued';
  if n > 0 then perform public.mdr_files_kick(); end if;
  return n;
end;
$$;

revoke execute on function public.mdr_files_status(), public.mdr_files_kick(), public.mdr_files_cron()
  from public, anon, authenticated, service_role;

-- 03:15 to 05:45 UTC every half hour: after the 6 pm Pacific import, summer or winter.
select cron.schedule('mdr-files', '15,45 3-5 * * *', $$select public.mdr_files_cron()$$);
