-- 0055 Inspection requests from the QR / link with no login; a signed-in visitor is a Requester (Jesse, Oct 2: "a
-- requester, that's it ... we shouldn't have login be the barrier to entry because I want the subs in the field to be
-- able to do this"). Closes review High 2 (Oct 2): a link visitor was a full `sub` (plans, people, RFIs, ...).
--   * No-login requests (the default on /r/<job>?t=<token>): the public request-link function (service role, after its
--     rate limits) calls the link_request_* functions below, which check the link's token hash themselves and answer
--     null for a bad or dead token and for a job that does not exist alike:
--       - link_request_calendar: the job's request day for an outsider, exactly what ir_calendar gives someone who
--         is not on the team (time, length, type, status color; never a company, items, number or name), plus the
--         form's choices (special kinds, OFS when the job allows it) and the job's today.
--       - link_request_files: registers up to 3 photos / PDFs (checked by their bytes in the function, <= 10 MB each)
--         in the job's "Inspection requests" folder, the member path's folder, with no uploader; the function stores
--         the bytes at the path the database gives. Scanned like any upload (the staging skip-scan switch applies).
--       - link_request_submit: the request, numbered by next_number(job, 'ir') like a member's, with no member behind
--         it (requested_by null) and the visitor's name, phone and email on the row (company is the request's own
--         company column); the GC step and the board lines to the GC team / inspector exactly as for a member request,
--         with the visitor's name in the line. A repeat within 10 minutes answers the same request. A private receipt
--         token comes back once; only its sha256 is kept (ir_link_receipts).
--       - link_request_status: by that receipt alone: the tracker's facts and the inspector's result line.
--   * Role requester ("Requester"): ir.request (the form, the job's request week, its own requests) and comments.write
--     (talk with the inspector on its own requests; comment_target_readable lets a requester reach nothing else: no
--     files, people, RFIs, corrections, deliveries or calendar capability). Rail: Inspections. The email-code join on
--     the request page now makes a requester, never a sub (link_request_join, 0054's version with the L8 fix kept).
--   * Memberships the link made as `sub` that no person changed since become `requester` (requester_backfill, run once
--     here; owner only, safe to run again). A sub invited by a person is never touched.
--   * A request with no member behind it is handled everywhere a requester is named: no board line to a missing
--     requester (ir_tell_requester), "mine" and the Send results preselection are never null (ir_calendar,
--     ir_recipients).
--   * ONE schema change is not an add: requested_by may now be empty (a visitor's request). Postgres has no other way
--     to let a column hold null than `alter column ... drop not null`; nothing is deleted by it.

-- =====================================================================================================================
-- The role, its capabilities and its rail, as data
-- =====================================================================================================================
insert into public.roles (name, description, recommended_tools)
values ('requester', 'Requester', '{inspections}')
on conflict (name) do nothing;

insert into public.role_permissions (role, capability, requires_aal2) values
  ('requester', 'ir.request', false),
  ('requester', 'comments.write', false)
on conflict do nothing;

-- =====================================================================================================================
-- A request with no member behind it
-- =====================================================================================================================
alter table public.inspection_requests alter column requested_by drop not null;

alter table public.inspection_requests
  add column requester_name text check (requester_name is null or length(btrim(requester_name)) between 1 and 120),
  add column requester_phone text check (requester_phone is null or requester_phone ~ '^\+?[0-9 ().-]{7,30}$'),
  add column requester_email text check (requester_email is null or (requester_email = lower(requester_email)
                                          and length(requester_email) <= 320 and requester_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'));

-- A member's request names the member; a link request names the visitor and how to reach them.
alter table public.inspection_requests add constraint inspection_requests_requester_kind check (
  (requested_by is not null and requester_name is null and requester_phone is null and requester_email is null)
  or (requested_by is null and requester_name is not null and (requester_phone is not null or requester_email is not null))
);

-- The private status link of a link request: only the sha256 of its token. More than one per request when a visitor
-- sent the same request twice (each answer carries its own working link). Functions only.
create table public.ir_link_receipts (
  token_hash text primary key check (token_hash ~ '^[0-9a-f]{64}$'),
  request_id uuid not null references public.inspection_requests(id),
  created_at timestamptz not null default now()
);
alter table public.ir_link_receipts enable row level security;
create index ir_link_receipts_request on public.ir_link_receipts (request_id);
-- No policy: nobody reaches it through the API; the link functions below read and write it.
revoke all on public.ir_link_receipts from public, anon, authenticated, service_role;

-- =====================================================================================================================
-- Shared pieces: one implementation each, used by the member RPCs and the link
-- =====================================================================================================================
-- The inspection folders, made on first use with their access lists (0024's ir_folder body, without the caller check).
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
  else
    raise exception 'unknown folder %', p_which using errcode = '22023';
  end if;
  select org_id into v_org from public.projects where id = p_project_id;
  perform pg_advisory_xact_lock(hashtext('ir_folder:' || p_project_id::text || ':' || p_which));
  if p_which = 'reports' then
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
  insert into public.folder_access (folder_id, capability, can_read, can_write, created_by) values
    (f.id, 'ir.view_all', true, false, auth.uid()),
    (f.id, 'ir.decide', true, true, auth.uid());
  if p_which = 'attachments' then
    insert into public.folder_access (folder_id, capability, can_read, can_write, created_by)
    values (f.id, 'ir.request', false, true, auth.uid());
  end if;
  return f.id;
end;
$$;

-- Same as 0024: the caller's capability, then the one maker above.
create or replace function public.ir_folder(p_project_id uuid, p_which text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_which = 'attachments' then
    if not (public.has_capability(p_project_id, 'ir.request') or public.has_capability(p_project_id, 'ir.decide')) then
      raise exception 'forbidden' using errcode = '42501';
    end if;
  elsif p_which = 'reports' then
    if not public.has_capability(p_project_id, 'ir.decide') then raise exception 'forbidden' using errcode = '42501'; end if;
  else
    raise exception 'unknown folder %', p_which using errcode = '22023';
  end if;
  return public.ir_folder_make(p_project_id, p_which);
end;
$$;

-- The job's inspection calendar rows for a viewer (0024's ir_calendar body). Full rows for the viewer's own requests
-- and for the team; for everyone else only the day, time, length, type and status color. p_viewer null = an outsider
-- (the public link). "mine" and "full" are never null, also for a request with no member behind it.
create or replace function public.ir_calendar_rows(
  p_project_id uuid, p_from date, p_to date, p_viewer uuid, p_team boolean, p_decide boolean
)
returns table (
  id uuid, number int, version int, full_detail boolean, mine boolean, is_block boolean, request_date date, start_time time,
  duration_kind text, duration_min int, kind text, special_kind text, status text, status_key text, result text,
  attendance text, company text, items text, owner_id uuid, helper_id uuid, postpone_reason text, postpone_until date
)
language plpgsql
stable
set search_path = public, pg_temp
as $$
#variable_conflict use_column
begin
  return query
    select case when f.is_full then r.id end, case when f.is_full then r.number end, case when f.is_full then r.version end,
           f.is_full, coalesce(r.requested_by = p_viewer, false), false,
           r.request_date, r.start_time, r.duration_kind, r.duration_min, r.kind,
           case when f.is_full then k.name end,
           case when f.is_full then r.status when r.status in ('complete', 'confirmed') then 'confirmed' else r.status end,
           public.ir_status_key(r.status, r.result, r.helper_id),
           case when f.is_full then r.result end, case when f.is_full then r.attendance end,
           case when f.is_full then r.company end, case when f.is_full then r.items end,
           case when f.is_full then r.owner_id end, case when f.is_full then r.helper_id end,
           case when f.is_full then r.postpone_reason end, case when f.is_full then r.postpone_until end
      from public.inspection_requests r
      left join public.ir_special_kinds k on k.id = r.special_kind_id
      cross join lateral (select coalesce(p_team or r.requested_by = p_viewer, false) as is_full) f
     where r.project_id = p_project_id and r.deleted_at is null and r.status <> 'withdrawn'
       and r.request_date between p_from and p_to
       and (f.is_full or r.status not in ('returned', 'gc_review'))
    union all
    select case when p_decide then b.id end, null::int, case when p_decide then b.version end, coalesce(p_decide, false), false, true,
           d.day, b.start_time, case when b.start_time is null then 'all_day' else 'timed' end,
           case when b.start_time is null then null::int else (extract(epoch from b.end_time - b.start_time) / 60)::int end,
           'block', null::text, 'blocked', 'blocked', null::text, null::text, null::text, null::text, null::uuid,
           null::uuid, null::text, null::date
      from public.ir_blocks b
      cross join lateral (
        select g::date as day
          from generate_series(b.block_date::timestamp,
                               (case when b.repeat_weekly then least(coalesce(b.repeat_until, p_to), p_to) else b.block_date end)::timestamp,
                               interval '7 days') g) d
     where b.project_id = p_project_id and b.deleted_at is null and d.day between p_from and p_to
     order by 7, 8 nulls first;
end;
$$;

-- Same as 0024 (who may ask, the range), the rows from the one implementation above.
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
declare v_team boolean; v_decide boolean;
begin
  if not (public.has_capability(p_project_id, 'ir.request') or public.has_capability(p_project_id, 'ir.view_all')
          or public.has_capability(p_project_id, 'ir.decide')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 62 then
    raise exception 'Pick a shorter range.' using errcode = '22023';
  end if;
  v_team := public.has_capability(p_project_id, 'ir.view_all') or public.has_capability(p_project_id, 'ir.decide');
  v_decide := public.has_capability(p_project_id, 'ir.decide');
  return query
    select c.* from public.ir_calendar_rows(p_project_id, p_from, p_to, auth.uid(), v_team, v_decide) c
     order by c.request_date, c.start_time nulls first;
end;
$$;

-- Same as 0024, but a request with no member behind it (a link request) gets no board line: its visitor follows it on
-- the private status link.
create or replace function public.ir_tell_requester(p_request public.inspection_requests, p_kind text, p_summary text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_request.requested_by is not null and p_request.requested_by is distinct from auth.uid() then
    perform public.post_activity(p_request.project_id, p_kind, p_summary, 'inspection_request', p_request.id, null,
                                 array[p_request.requested_by]);
  end if;
end;
$$;

-- Same as 0024, but the preselection is never null (a link request has no requester among the members).
create or replace function public.ir_recipients(p_request_id uuid)
returns table (member_id uuid, user_id uuid, full_name text, company text, role text, preselect boolean)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare r public.inspection_requests;
begin
  select * into r from public.inspection_requests x where x.id = p_request_id and x.deleted_at is null;
  if r.id is null or not public.ir_owner_ok(r.project_id, r.owner_id) then raise exception 'forbidden' using errcode = '42501'; end if;
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

-- =====================================================================================================================
-- The link's SQL surface for requests (service role only). Each answers null when the credential does not open the job.
-- =====================================================================================================================
-- What the visitor sees of their own request: the tracker's facts and the inspector's result line. Nothing about other
-- people (no inspector, no notes to the GC, no attendance), and not the contact they typed.
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
    'gc_step', public.ir_setting(p.id, 'ir_gc_approval') or r.gc_at is not null)
    from public.inspection_requests r
    join public.projects p on p.id = r.project_id
    left join public.ir_special_kinds k on k.id = r.special_kind_id
   where r.id = p_request_id;
$$;

-- The request day for an outsider (no day = the job's today) and the form's choices.
create or replace function public.link_request_calendar(p_project_id uuid, p_token_hash text, p_hub_id uuid default null,
                                                        p_day date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare pr public.projects; v_today date; v_day date;
begin
  if not public.is_service_role() then raise exception 'forbidden' using errcode = '42501'; end if;
  pr := public.request_link_job(p_project_id, p_token_hash, p_hub_id);
  if pr.id is null then return null; end if;
  v_today := (now() at time zone pr.timezone)::date;
  v_day := coalesce(p_day, v_today);
  if v_day < v_today or v_day > v_today + 365 then raise exception 'Pick today or a later day.' using errcode = '22023'; end if;
  return jsonb_build_object(
    'today', v_today,
    'day', v_day,
    'ofs', public.ir_setting(pr.id, 'ir_ofs_allowed'),
    'kinds', coalesce((select jsonb_agg(jsonb_build_object('id', k.id, 'name', k.name) order by k.sort, k.name)
                         from public.ir_special_kinds k where k.active), '[]'::jsonb),
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object('start_time', c.start_time, 'duration_kind', c.duration_kind,
                                          'duration_min', c.duration_min, 'kind', c.kind, 'status_key', c.status_key)
                       order by c.start_time nulls first, c.kind)
        from public.ir_calendar_rows(pr.id, v_day, v_day, null, false, false) c), '[]'::jsonb));
end;
$$;

-- Registers a visitor's files (1 to 3) in the job's request folder, with no uploader; answers each one's id and the
-- storage path the function stores its bytes at. The function checked the bytes (type by content, size) first.
create or replace function public.link_request_files(p_project_id uuid, p_token_hash text, p_hub_id uuid, p_files jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare pr public.projects; v_folder uuid; f jsonb; v_id uuid; v_name text; v_out jsonb := '[]'::jsonb;
begin
  if not public.is_service_role() then raise exception 'forbidden' using errcode = '42501'; end if;
  pr := public.request_link_job(p_project_id, p_token_hash, p_hub_id);
  if pr.id is null then return null; end if;
  if jsonb_typeof(p_files) is distinct from 'array' or jsonb_array_length(p_files) not between 1 and 3 then
    raise exception 'Up to 3 photos or PDFs.' using errcode = '22023';
  end if;
  v_folder := public.ir_folder_make(pr.id, 'attachments');
  for f in select * from jsonb_array_elements(p_files) loop
    v_name := public.delivery_clean(regexp_replace(f->>'name', '[[:cntrl:]/\\]', '_', 'g'), 120);
    if v_name = '' then raise exception 'A file has no name.' using errcode = '22023'; end if;
    if coalesce(f->>'mime', '') not in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf') then
      raise exception 'Photos or PDFs only.' using errcode = '22023';
    end if;
    if coalesce((f->>'size')::bigint, 0) not between 1 and 10485760 then
      raise exception 'Files must be 10 MB or less.' using errcode = '22023';
    end if;
    if coalesce(f->>'sha256', '') !~ '^[0-9a-f]{64}$' then raise exception 'bad file hash' using errcode = '22023'; end if;
    v_id := gen_random_uuid();
    insert into public.files (id, org_id, project_id, folder_id, storage_path, original_name, mime, size, sha256, created_by)
    values (v_id, pr.org_id, pr.id, v_folder, public.file_storage_path(pr.id, v_folder, v_id, v_name), v_name, f->>'mime',
            (f->>'size')::bigint, f->>'sha256', null);
    v_out := v_out || jsonb_build_array(jsonb_build_object('id', v_id,
               'storage_path', public.file_storage_path(pr.id, v_folder, v_id, v_name)));
  end loop;
  return jsonb_build_object('files', v_out);
end;
$$;

-- The request. Every check the member path makes (ir_submit), plus the visitor's contact. The database numbers it.
create or replace function public.link_request_submit(
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
  p_attachment_ids uuid[] default '{}'
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  pr public.projects;
  v_name text := public.delivery_clean(p_name, 120);
  v_company text := public.delivery_clean(p_company, 120);
  v_phone text := nullif(public.delivery_clean(p_phone, 30), '');
  v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_items text := btrim(coalesce(p_items, ''));
  v_duration text := coalesce(p_duration_kind, 'timed');
  v_files uuid[] := coalesce(p_attachment_ids, '{}'::uuid[]);
  v_today date;
  v_token text;
  v_who text;
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
  if length(v_items) not between 1 and 4000 then raise exception 'Add what to inspect.' using errcode = '22023'; end if;
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
  if p_kind is null or p_kind not in ('ior', 'special', 'ofs') then raise exception 'Pick the type.' using errcode = '22023'; end if;
  if p_kind = 'ofs' and not public.ir_setting(pr.id, 'ir_ofs_allowed') then
    raise exception 'OFS is off for this job.' using errcode = '22023';
  end if;
  if p_kind = 'special' and not exists (select 1 from public.ir_special_kinds where id = p_special_kind_id and active) then
    raise exception 'Pick the special inspection.' using errcode = '22023';
  end if;
  if cardinality(v_files) > 3 or cardinality(v_files) <> (select count(distinct x) from unnest(v_files) x) then
    raise exception 'Up to 3 photos or PDFs.' using errcode = '22023';
  end if;

  -- One visitor at a time per name and job, so the repeat check and the insert agree.
  perform pg_advisory_xact_lock(hashtext('link_request_submit:' || pr.id::text || ':' || lower(v_name)));
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
      request_date, start_time, duration_kind, duration_min, kind, special_kind_id, items, attachment_ids, notice_ack_at, status)
    values (
      pr.org_id, pr.id, public.next_number(pr.id, 'ir'), null, null, v_company, v_name, v_phone, v_email,
      p_request_date, p_start_time, v_duration, case when v_duration = 'timed' then p_duration_min end, p_kind,
      case when p_kind = 'special' then p_special_kind_id end, v_items, v_files, now(), public.ir_first_status(pr.id))
    returning * into r;

    -- The files are finished: usable as any finished upload is (the skip-scan switch), and queued for the scan.
    update public.files set upload_complete = true where id = any (v_files);
    foreach fid in array v_files loop
      perform public.enqueue_job('scan_file', jsonb_build_object('file_id', fid), pr.id, 'scan_file:' || fid::text);
    end loop;

    v_who := v_name || ' (' || v_company || ')';
    if r.status = 'gc_review' then
      perform public.post_activity(pr.id, 'ir.gc_review',
        left('IR ' || r.number || ' to review · ' || v_who || ' · ' || public.ir_when_label(r.request_date, r.start_time), 500),
        'inspection_request', r.id, 'ir.gc_approve');
    else
      perform public.post_activity(pr.id, 'ir.requested',
        left('IR ' || r.number || ' requested · ' || v_who || ' · ' || public.ir_when_label(r.request_date, r.start_time), 500),
        'inspection_request', r.id, 'ir.view_all');
    end if;
    perform public.audit('request_link.submit', 'inspection_request', r.id, pr.id, pr.org_id,
      jsonb_build_object('via', case when p_hub_id is null then 'link' else 'hub' end, 'number', r.number,
                         'name', v_name, 'company', v_company, 'files', cardinality(v_files)),
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

-- The private status link: by the receipt alone (a new request link or QR sheet does not end it).
create or replace function public.link_request_status(p_project_id uuid, p_receipt_hash text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare r public.inspection_requests;
begin
  if not public.is_service_role() then raise exception 'forbidden' using errcode = '42501'; end if;
  select x.* into r
    from public.ir_link_receipts k
    join public.inspection_requests x on x.id = k.request_id
    join public.projects p on p.id = x.project_id and p.deleted_at is null
   where k.token_hash = p_receipt_hash and x.project_id = p_project_id and x.deleted_at is null;
  if r.id is null then return null; end if;
  return public.link_request_answer(r.id);
end;
$$;

-- =====================================================================================================================
-- Joining from the link makes a requester (0054's version, L8 fix kept; only the role differs)
-- =====================================================================================================================
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
  if v_rows > 0 then
    return jsonb_build_object('project_name', pr.name, 'status', 'member');
  end if;

  insert into public.project_members (org_id, project_id, invite_email, role, status, invited_by)
  values (pr.org_id, pr.id, v_email, 'requester', 'invited', public.request_hub_owner(p_hub_id, p_token_hash))
  on conflict (project_id, invite_email, role) do nothing
  returning * into m;
  -- Invited through People at the same moment: theirs stands.
  if m.id is null then return jsonb_build_object('project_name', pr.name, 'status', 'member'); end if;
  perform public.audit('request_link.join', 'project_member', m.id, pr.id, pr.org_id,
    jsonb_build_object('via', case when p_hub_id is null then 'link' else 'hub' end, 'name', v_name, 'company', v_company),
    null, 'public_link');
  perform public.post_activity(pr.id, 'member.joined', left(v_name || ' (' || v_company || ') joined from the request link', 500),
    'project_member', m.id, 'members.manage');
  return jsonb_build_object('project_name', pr.name, 'status', 'added');
end;
$$;

-- =====================================================================================================================
-- Link-made subs become requesters. Returns the number of memberships moved.
-- =====================================================================================================================
-- Moved: a sub row the link made (its own request_link.join line), still invited or active, with no end date, whose
-- only membership lines are its invite and its sign-in (so no person changed it), and not a tester's viewed role
-- (0039). Everyone else stays as they are; a sub a person invited never has a request_link.join line.
create or replace function public.requester_backfill()
returns int
language plpgsql
set search_path = public, pg_temp
as $$
declare n int;
begin
  with moved as (
    update public.project_members pm
       set role = 'requester'
     where pm.role = 'sub'
       and pm.status in ('invited', 'active')
       and pm.access_ends_at is null
       and exists (select 1 from public.audit_events a
                    where a.action = 'request_link.join' and a.entity_type = 'project_member' and a.entity_id = pm.id)
       and not exists (select 1 from public.audit_events a
                        where a.entity_type = 'project_member' and a.entity_id = pm.id and a.action like 'member.%'
                          and a.action not in ('member.invite', 'member.accept'))
       and not exists (select 1 from public.testing_role_home h where h.project_id = pm.project_id and h.user_id = pm.user_id)
       and not exists (select 1 from public.project_members other
                        where other.project_id = pm.project_id and other.invite_email = pm.invite_email
                          and other.role = 'requester')
    returning pm.id, pm.project_id, pm.org_id
  )
  select count(public.audit('request_link.requester', 'project_member', m.id, m.project_id, m.org_id,
                            jsonb_build_object('from', 'sub', 'to', 'requester'), null, 'system'))
    into n
    from moved m;
  return n;
end;
$$;

select public.requester_backfill();

-- =====================================================================================================================
-- Grants (SPEC §6.2): nothing for public/anon; the link functions are service-role only; the rest is internal.
-- =====================================================================================================================
revoke execute on function
  public.ir_folder_make(uuid, text),
  public.ir_calendar_rows(uuid, date, date, uuid, boolean, boolean),
  public.link_request_answer(uuid),
  public.requester_backfill(),
  public.link_request_calendar(uuid, text, uuid, date),
  public.link_request_files(uuid, text, uuid, jsonb),
  public.link_request_submit(uuid, text, uuid, text, text, text, text, date, text, text, boolean, time, text, int, uuid, uuid[]),
  public.link_request_status(uuid, text)
from public, anon, authenticated;

grant execute on function
  public.link_request_calendar(uuid, text, uuid, date),
  public.link_request_files(uuid, text, uuid, jsonb),
  public.link_request_submit(uuid, text, uuid, text, text, text, text, date, text, text, boolean, time, text, int, uuid, uuid[]),
  public.link_request_status(uuid, text)
to service_role;
