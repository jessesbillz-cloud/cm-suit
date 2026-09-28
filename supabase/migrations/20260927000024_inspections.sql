-- 0024 Inspection scheduling and IRs (SPEC §13.2; MDR process notes §2).
-- A request is not a booking: the requester asks for a day and a time, the inspector owns his day. Every step is a
-- small, redoable RPC that runs as the caller (SECURITY DEFINER, identity from auth.uid()); nothing writes the table
-- directly. The IR number comes from next_number(project, 'ir') when the request is submitted (there are no drafts),
-- so it is the one number an IR ever has. Every change lands in ir_events (who, what, when) from a trigger, each line
-- mirrors into calendar_entries for the GC team and inspectors, and requesters see other people's requests only
-- through ir_calendar(), which returns times, types and colors for those rows and nothing else.

-- ---------------------------------------------------------------------------
-- Capabilities (data, SPEC §5.2). ir.request and ir.decide exist since 0001.
-- ---------------------------------------------------------------------------
insert into public.role_permissions (role, capability, requires_aal2) values
  ('project_admin', 'ir.gc_approve', false), ('pm', 'ir.gc_approve', false), ('superintendent', 'ir.gc_approve', false),
  ('project_admin', 'ir.view_all', false), ('pm', 'ir.view_all', false), ('pe', 'ir.view_all', false),
  ('superintendent', 'ir.view_all', false), ('inspector', 'ir.view_all', false), ('owner_rep', 'ir.view_all', false)
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Special inspection kinds: a small data table, generic kinds only.
-- ---------------------------------------------------------------------------
create table public.ir_special_kinds (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null unique check (length(btrim(name)) between 1 and 100),
  sort int not null default 0,
  active boolean not null default true
);
alter table public.ir_special_kinds enable row level security;
revoke all on public.ir_special_kinds from anon, authenticated;
grant select on public.ir_special_kinds to authenticated;
create policy "ir_special_kinds: signed-in read" on public.ir_special_kinds for select to authenticated
  using (auth.uid() is not null);

insert into public.ir_special_kinds (name, sort) values
  ('Concrete', 10), ('Reinforcing steel', 20), ('Post-tensioning', 30), ('Structural steel', 40), ('Welding', 50),
  ('High-strength bolting', 60), ('Masonry', 70), ('Soils and compaction', 80), ('Deep foundations', 90),
  ('Post-installed anchors', 100), ('Shotcrete', 110), ('Structural wood', 120), ('Cold-formed steel', 130),
  ('Sprayed fire-resistive materials', 140), ('Smoke control', 150)
on conflict (name) do nothing;

-- ---------------------------------------------------------------------------
-- Settings (projects.settings; the zod schema and defaults live in src/lib/settings.ts). A missing key is off.
-- ---------------------------------------------------------------------------
create or replace function public.ir_setting(p_project_id uuid, p_key text)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select coalesce((select (p.settings -> p_key) = 'true'::jsonb from public.projects p where p.id = p_project_id), false);
$$;
revoke execute on function public.ir_setting(uuid, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- inspection_requests
-- ---------------------------------------------------------------------------
create table public.inspection_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  version int not null default 1,
  deleted_at timestamptz,
  org_id uuid not null,
  project_id uuid not null,
  -- The one IR number: next_number(project, 'ir') at submit.
  number int not null check (number > 0),
  requested_by uuid not null references auth.users(id),
  company text not null check (length(btrim(company)) between 1 and 200),
  -- The day asked for, in the project's time zone; no time = "Flexible".
  request_date date not null,
  start_time time check (start_time is null or (extract(second from start_time) = 0 and extract(minute from start_time) in (0, 30))),
  duration_kind text not null default 'timed' check (duration_kind in ('timed', 'all_day', 'periodic')),
  duration_min int check (duration_min between 5 and 720),
  kind text not null check (kind in ('ior', 'special', 'ofs')),
  special_kind_id uuid references public.ir_special_kinds(id),
  items text not null check (length(btrim(items)) between 1 and 4000),
  attachment_ids uuid[] not null default '{}' check (cardinality(attachment_ids) <= 20),
  notice_ack_at timestamptz not null,
  status text not null check (status in ('gc_review', 'returned', 'pending', 'confirmed', 'postponed', 'complete', 'withdrawn')),
  gc_by uuid references auth.users(id),
  gc_at timestamptz,
  gc_note text check (gc_note is null or length(gc_note) <= 1000),
  owner_id uuid references auth.users(id),
  helper_id uuid references auth.users(id),
  confirm_note text check (confirm_note is null or length(confirm_note) <= 1000),
  attendance text check (attendance in ('be_present', 'alone')),
  result text check (result in ('approved', 'not_approved')),
  result_note text check (result_note is null or length(result_note) <= 4000),
  result_photo_ids uuid[] not null default '{}' check (cardinality(result_photo_ids) <= 20),
  result_at timestamptz,
  result_by uuid references auth.users(id),
  helper_report text check (helper_report in ('passed', 'issues')),
  helper_note text check (helper_note is null or length(helper_note) <= 1000),
  helper_at timestamptz,
  postpone_reason text check (postpone_reason in ('not_ready', 'weather', 'gc_requested', 'other')),
  postpone_note text check (postpone_note is null or length(postpone_note) <= 1000),
  postpone_until date,
  postponed_at timestamptz,
  -- A postponement counts as an extra request.
  postpone_count int not null default 0 check (postpone_count >= 0),
  ir_file_id uuid references public.files(id),
  content_hash text,
  signed_at timestamptz,
  signed_by uuid references auth.users(id),
  -- Signed content changed after the PDF was made: Update PDF before it goes out (SPEC §8.2).
  pdf_stale boolean not null default false,
  -- The stored PDF carries the POSTPONED stamp.
  pdf_postponed boolean not null default false,
  results_sent_at timestamptz,
  -- One line a daily report can copy (the dailies module links it later).
  summary text,
  foreign key (project_id, org_id) references public.projects (id, org_id),
  unique (project_id, number),
  check ((duration_kind = 'timed') = (duration_min is not null)),
  check ((kind = 'special') = (special_kind_id is not null)),
  check (helper_id is null or helper_id is distinct from owner_id),
  check (status <> 'complete' or ir_file_id is not null),
  check (ir_file_id is null or (signed_at is not null and content_hash is not null))
);
alter table public.inspection_requests enable row level security;
create index inspection_requests_day on public.inspection_requests (project_id, request_date);
create index inspection_requests_requester on public.inspection_requests (requested_by);
insert into public.owner_lookup (entity_type, table_name, owner_column)
  values ('inspection_request', 'inspection_requests', 'requested_by') on conflict do nothing;

revoke all on public.inspection_requests from anon, authenticated;
grant select on public.inspection_requests to authenticated;
-- Full rows: the requester, the GC team and inspectors. Everyone else only through ir_calendar (anonymized).
create policy "inspection_requests: requester or team reads" on public.inspection_requests for select to authenticated
  using (deleted_at is null
         and ((requested_by = auth.uid() and public.is_member(project_id))
              or public.has_capability(project_id, 'ir.view_all')
              or public.has_capability(project_id, 'ir.decide')));
-- No insert/update/delete policies: every write is an RPC below.

-- ---------------------------------------------------------------------------
-- ir_events: every change, who and when. Written only by the trigger below.
-- ---------------------------------------------------------------------------
create table public.ir_events (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  org_id uuid not null,
  project_id uuid not null,
  request_id uuid not null references public.inspection_requests(id),
  actor_id uuid references auth.users(id),
  action text not null,
  changes jsonb not null default '{}'::jsonb
);
alter table public.ir_events enable row level security;
create index ir_events_request on public.ir_events (request_id, id);
revoke all on public.ir_events from anon, authenticated;
revoke all on sequence public.ir_events_id_seq from anon, authenticated;
grant select on public.ir_events to authenticated;
create policy "ir_events: readable with the request" on public.ir_events for select to authenticated
  using (exists (select 1 from public.inspection_requests r where r.id = ir_events.request_id));
create trigger audit_immutable before update or delete on public.ir_events
  for each row execute function public.tg_audit_immutable();

-- ---------------------------------------------------------------------------
-- ir_blocks: time the inspector blocks, optionally every week. Shown to requesters as "Blocked" only.
-- ---------------------------------------------------------------------------
create table public.ir_blocks (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id),
  version int not null default 1,
  deleted_at timestamptz,
  org_id uuid not null,
  project_id uuid not null,
  block_date date not null,
  start_time time,
  end_time time,
  repeat_weekly boolean not null default false,
  repeat_until date,
  foreign key (project_id, org_id) references public.projects (id, org_id),
  check ((start_time is null) = (end_time is null)),
  check (end_time is null or end_time > start_time),
  check (repeat_until is null or (repeat_weekly and repeat_until >= block_date))
);
alter table public.ir_blocks enable row level security;
create trigger touch before update on public.ir_blocks for each row execute function public.tg_touch_row();
create trigger no_delete before delete on public.ir_blocks for each row execute function public.tg_block_delete();
create trigger audit_row after insert or update on public.ir_blocks for each row execute function public.tg_audit_row();
create index ir_blocks_project on public.ir_blocks (project_id, block_date);
revoke all on public.ir_blocks from anon, authenticated;
grant select on public.ir_blocks to authenticated;
grant insert (org_id, project_id, block_date, start_time, end_time, repeat_weekly, repeat_until, created_by)
  on public.ir_blocks to authenticated;
grant update (block_date, start_time, end_time, repeat_weekly, repeat_until, deleted_at) on public.ir_blocks to authenticated;
-- Removed blocks stay readable to inspectors so Undo can bring them back; the data layer filters them out.
create policy "ir_blocks: inspectors read" on public.ir_blocks for select to authenticated
  using (public.has_capability(project_id, 'ir.decide'));
create policy "ir_blocks: inspectors add" on public.ir_blocks for insert to authenticated
  with check (created_by = auth.uid() and deleted_at is null and public.has_capability(project_id, 'ir.decide'));
create policy "ir_blocks: inspectors edit" on public.ir_blocks for update to authenticated
  using (public.has_capability(project_id, 'ir.decide'))
  with check (public.has_capability(project_id, 'ir.decide'));

-- ---------------------------------------------------------------------------
-- Small internal helpers (not user-callable).
-- ---------------------------------------------------------------------------
-- The lib/status key for a request (src/features/inspections/model.ts requestChip mirrors this).
create or replace function public.ir_status_key(p_status text, p_result text, p_helper uuid)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case
    when p_status = 'postponed' then 'postponed'
    when p_status = 'returned' then 'blocked'
    when p_status = 'withdrawn' then 'cancelled'
    when p_result = 'approved' then 'approved'
    when p_result = 'not_approved' then 'not_approved'
    when p_status = 'confirmed' and p_helper is not null then 'assigned'
    when p_status in ('confirmed', 'complete') then 'confirmed'
    else 'pending'
  end;
$$;

create or replace function public.ir_type_label(p_kind text, p_special text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case p_kind when 'ior' then 'IOR' when 'ofs' then 'OFS' else 'Special: ' || coalesce(p_special, 'other') end;
$$;

-- "Oct 2" or "Oct 2, 9:30 AM" for board lines.
create or replace function public.ir_when_label(p_date date, p_time time)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select to_char(p_date, 'Mon FMDD') || coalesce(', ' || to_char(p_time, 'FMHH12:MI AM'), '');
$$;

-- Does this member hold ir.decide on the job right now?
create or replace function public.ir_member_decides(p_project_id uuid, p_member uuid)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.project_members pm
    join public.role_permissions rp on rp.role = pm.role and rp.capability = 'ir.decide'
    where pm.project_id = p_project_id and pm.user_id = p_member and pm.status = 'active'
      and (pm.access_ends_at is null or pm.access_ends_at > now()));
$$;

-- The caller may act as the owning inspector: holds ir.decide, and the request has no owner, is theirs, or its owner
-- has left the job.
create or replace function public.ir_owner_ok(p_project_id uuid, p_owner uuid)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select public.has_capability(p_project_id, 'ir.decide')
     and (p_owner is null or p_owner = auth.uid() or not public.ir_member_decides(p_project_id, p_owner));
$$;

-- The request, locked, if the caller may see it in full; version-checked when a version is given.
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
     or not ((r.requested_by = auth.uid() and public.is_member(r.project_id))
             or public.has_capability(r.project_id, 'ir.view_all') or public.has_capability(r.project_id, 'ir.decide')) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if p_version is not null and r.version <> p_version then
    raise exception 'version_conflict: expected %, found %', p_version, r.version using errcode = '40001';
  end if;
  return r;
end;
$$;

-- Board lines: to the owning inspector (or every inspector on the job), and to the requester.
create or replace function public.ir_tell_inspector(p_request public.inspection_requests, p_kind text, p_summary text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_request.owner_id is not null and public.ir_member_decides(p_request.project_id, p_request.owner_id) then
    perform public.post_activity(p_request.project_id, p_kind, p_summary, 'inspection_request', p_request.id, null,
                                 array[p_request.owner_id]);
  else
    perform public.post_activity(p_request.project_id, p_kind, p_summary, 'inspection_request', p_request.id, 'ir.decide');
  end if;
end;
$$;

create or replace function public.ir_tell_requester(p_request public.inspection_requests, p_kind text, p_summary text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_request.requested_by is distinct from auth.uid() then
    perform public.post_activity(p_request.project_id, p_kind, p_summary, 'inspection_request', p_request.id, null,
                                 array[p_request.requested_by]);
  end if;
end;
$$;

-- A new request's first status: the GC step when the job has it on and the requester is not a GC approver.
create or replace function public.ir_first_status(p_project_id uuid)
returns text
language sql
stable
set search_path = public, pg_temp
as $$
  select case when public.ir_setting(p_project_id, 'ir_gc_approval') and not public.has_capability(p_project_id, 'ir.gc_approve')
              then 'gc_review' else 'pending' end;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.ir_status_key(text, text, uuid)', 'public.ir_type_label(text, text)', 'public.ir_when_label(date, time)',
    'public.ir_member_decides(uuid, uuid)', 'public.ir_owner_ok(uuid, uuid)', 'public.ir_for_update(uuid, integer)',
    'public.ir_tell_inspector(public.inspection_requests, text, text)',
    'public.ir_tell_requester(public.inspection_requests, text, text)', 'public.ir_first_status(uuid)']
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Triggers: stale PDF + summary (before), history and calendar (after).
-- ---------------------------------------------------------------------------
create or replace function public.tg_ir_before()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare v_special text;
begin
  -- An inspector who takes over a request they were helping on stops being its helper.
  if new.helper_id is not null and new.helper_id = new.owner_id then new.helper_id := null; end if;
  if tg_op = 'UPDATE' and old.ir_file_id is not null and new.ir_file_id is not distinct from old.ir_file_id
     and (new.request_date, new.start_time, new.duration_kind, new.duration_min, new.kind, new.special_kind_id,
          new.company, new.items, new.result, new.result_note, new.result_photo_ids)
         is distinct from
         (old.request_date, old.start_time, old.duration_kind, old.duration_min, old.kind, old.special_kind_id,
          old.company, old.items, old.result, old.result_note, old.result_photo_ids) then
    new.pdf_stale := true;
  end if;
  if new.result is null then
    new.summary := null;
  else
    select name into v_special from public.ir_special_kinds where id = new.special_kind_id;
    new.summary := left('IR ' || new.number || ' ' || public.ir_type_label(new.kind, v_special) || ': '
      || case new.result when 'approved' then 'Approved' else 'Not approved' end || '. '
      || btrim(new.items) || coalesce('. ' || nullif(btrim(new.result_note), ''), ''), 1000);
  end if;
  return new;
end;
$$;
revoke execute on function public.tg_ir_before() from public, anon, authenticated;

create or replace function public.tg_ir_history()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_new jsonb := to_jsonb(new); v_old jsonb; v_changes jsonb := '{}'::jsonb; k text;
begin
  if tg_op = 'UPDATE' then
    v_old := to_jsonb(old);
    for k in select jsonb_object_keys(v_new) loop
      if k not in ('updated_at', 'version', 'summary', 'pdf_stale') and (v_new -> k) is distinct from (v_old -> k) then
        v_changes := v_changes || jsonb_build_object(k, jsonb_build_array(v_old -> k, v_new -> k));
      end if;
    end loop;
    if v_changes = '{}'::jsonb then return null; end if;
  end if;
  -- The actor is the caller; the service-only steps (the PDF on file, the send) name the inspector they ran for.
  insert into public.ir_events (org_id, project_id, request_id, actor_id, action, changes)
  values (new.org_id, new.project_id, new.id, coalesce(auth.uid(), nullif(current_setting('app.ir_actor', true), '')::uuid),
          coalesce(nullif(current_setting('app.ir_action', true), ''), case when tg_op = 'INSERT' then 'submit' else 'update' end),
          v_changes);
  return null;
end;
$$;
revoke execute on function public.tg_ir_history() from public, anon, authenticated;

-- One calendar line per request (SPEC §7.6), read by ir.view_all; a withdrawn request has none. The attendance call
-- rides in the title, so the GC team sees it on their calendar.
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
      || case new.attendance when 'be_present' then ' · Be present' when 'alone' then ' · I''ve got this' else '' end,
    v_start, v_end, v_all_day, public.ir_status_key(new.status, new.result, new.helper_id), 'ir.view_all');
  return null;
end;
$$;
revoke execute on function public.tg_ir_calendar() from public, anon, authenticated;

create trigger touch before update on public.inspection_requests for each row execute function public.tg_touch_row();
create trigger ir_before before insert or update on public.inspection_requests for each row execute function public.tg_ir_before();
create trigger no_delete before delete on public.inspection_requests for each row execute function public.tg_block_delete();
create trigger audit_row after insert or update on public.inspection_requests for each row execute function public.tg_audit_row();
create trigger ir_history after insert or update on public.inspection_requests for each row execute function public.tg_ir_history();
create trigger ir_calendar after insert or update of status, request_date, start_time, duration_kind, duration_min, kind,
  special_kind_id, company, result, helper_id, attendance, deleted_at on public.inspection_requests
  for each row execute function public.tg_ir_calendar();

-- ---------------------------------------------------------------------------
-- Folders: request attachments ("Inspection requests": requesters write, only the GC team and inspectors read the
-- whole folder) and the IR PDFs (Reports / "Inspection reports"). Made on first use, with their access lists.
-- ---------------------------------------------------------------------------
create or replace function public.ir_folder(p_project_id uuid, p_which text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_org uuid; v_parent uuid; v_name text; v_kind text; f public.folders;
begin
  if p_which = 'attachments' then
    if not (public.has_capability(p_project_id, 'ir.request') or public.has_capability(p_project_id, 'ir.decide')) then
      raise exception 'forbidden' using errcode = '42501';
    end if;
    v_name := 'Inspection requests'; v_kind := 'general';
  elsif p_which = 'reports' then
    if not public.has_capability(p_project_id, 'ir.decide') then raise exception 'forbidden' using errcode = '42501'; end if;
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

-- The attachments folder, if made. Request files and result photos must live there, so a request can never carry
-- (and so hand out through authorize_ir_file) a file from any other folder, e.g. a pricing-only one.
create or replace function public.ir_attach_folder_id(p_project_id uuid)
returns uuid
language sql
stable
set search_path = public, pg_temp
as $$
  select id from public.folders
   where project_id = p_project_id and parent_id is null and name = 'Inspection requests' and deleted_at is null;
$$;
revoke execute on function public.ir_attach_folder_id(uuid) from public, anon, authenticated;
grant execute on function public.ir_attach_folder_id(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Requester side
-- ---------------------------------------------------------------------------
-- What the request form prefills: the GC, the inspector(s), the job's settings, the special kinds, the companies
-- (most-used first), my company and today in the job's zone.
create or replace function public.ir_form_context(p_project_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare p public.projects;
begin
  if not public.has_capability(p_project_id, 'ir.request') then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into p from public.projects where id = p_project_id;
  return jsonb_build_object(
    'gc', (select o.name from public.orgs o where o.id = p.org_id),
    'inspectors', coalesce((
      select jsonb_agg(distinct coalesce(nullif(pr.full_name, ''), split_part(pm.invite_email, '@', 1)))
        from public.project_members pm
        join public.role_permissions rp on rp.role = pm.role and rp.capability = 'ir.decide'
        left join public.profiles pr on pr.user_id = pm.user_id
       where pm.project_id = p_project_id and pm.status = 'active'
         and (pm.access_ends_at is null or pm.access_ends_at > now())), '[]'::jsonb),
    'gc_step', public.ir_setting(p_project_id, 'ir_gc_approval'),
    'ofs', public.ir_setting(p_project_id, 'ir_ofs_allowed'),
    'kinds', coalesce((select jsonb_agg(jsonb_build_object('id', k.id, 'name', k.name) order by k.sort, k.name)
                         from public.ir_special_kinds k where k.active), '[]'::jsonb),
    'companies', coalesce((
      select jsonb_agg(c.name order by c.uses desc, c.name)
        from (select x.name, sum(x.uses) as uses
                from (select r.company as name, count(*) as uses from public.inspection_requests r
                       where r.project_id = p_project_id and r.status <> 'withdrawn' group by r.company
                      union all
                      select o.name, 0 from public.project_members pm join public.orgs o on o.id = pm.member_org_id
                       where pm.project_id = p_project_id and pm.status = 'active' and not public.role_is_walled(pm.role)) x
               group by x.name
               order by 2 desc, 1
               limit 200) c), '[]'::jsonb),
    'my_company', (select coalesce(o.name, nullif(pr.company, '')) from public.project_members pm
                     left join public.orgs o on o.id = pm.member_org_id
                     left join public.profiles pr on pr.user_id = pm.user_id
                    where pm.project_id = p_project_id and pm.user_id = auth.uid() and pm.status = 'active'
                    order by pm.created_at limit 1),
    'today', to_char(now() at time zone p.timezone, 'YYYY-MM-DD'));
end;
$$;

-- Submit: the database numbers the request. A repeat of the same request within 10 minutes returns the first one.
create or replace function public.ir_submit(
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
  p_attachment_ids uuid[] default '{}'
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
    kind, special_kind_id, items, attachment_ids, notice_ack_at, status)
  values (
    p.org_id, p_project_id, public.next_number(p_project_id, 'ir'), v_uid, v_uid, v_company, p_request_date, p_start_time,
    v_duration, case when v_duration = 'timed' then p_duration_min end, p_kind,
    case when p_kind = 'special' then p_special_kind_id end, v_items, coalesce(p_attachment_ids, '{}'::uuid[]), now(),
    public.ir_first_status(p_project_id))
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

-- The job's inspection calendar for a date range (at most 9 weeks). Full rows for my own requests, the GC team and
-- inspectors; for everyone else's only the day, time, length, type and status color. Blocked time is included.
create or replace function public.ir_calendar(p_project_id uuid, p_from date, p_to date)
returns table (
  id uuid,
  number int,
  version int,
  full_detail boolean,
  mine boolean,
  is_block boolean,
  request_date date,
  start_time time,
  duration_kind text,
  duration_min int,
  kind text,
  special_kind text,
  status text,
  status_key text,
  result text,
  attendance text,
  company text,
  items text,
  owner_id uuid,
  helper_id uuid,
  postpone_reason text,
  postpone_until date
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
    select case when f.is_full then r.id end, case when f.is_full then r.number end, case when f.is_full then r.version end,
           f.is_full, r.requested_by = auth.uid(), false,
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
      cross join lateral (select v_team or r.requested_by = auth.uid() as is_full) f
     where r.project_id = p_project_id and r.deleted_at is null and r.status <> 'withdrawn'
       and r.request_date between p_from and p_to
       and (f.is_full or r.status not in ('returned', 'gc_review'))
    union all
    select case when v_decide then b.id end, null::int, case when v_decide then b.version end, v_decide, false, true,
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

-- Move my own request (or, as its inspector, any request). A requester's move sends a confirmed or postponed request
-- back to pending and tells the inspector; an inspector's move keeps it on (a postponed one becomes confirmed).
create or replace function public.ir_move(
  p_request_id uuid,
  p_version int,
  p_request_date date,
  p_start_time time default null,
  p_duration_kind text default 'timed',
  p_duration_min int default null
)
returns public.inspection_requests
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare r public.inspection_requests; v_inspector boolean; v_status text; v_was text; v_tz text;
        v_duration text := coalesce(p_duration_kind, 'timed');
begin
  r := public.ir_for_update(p_request_id, p_version);
  v_inspector := public.ir_owner_ok(r.project_id, r.owner_id);
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
    v_status := case when r.status = 'postponed' then 'confirmed' else r.status end;
  elsif r.status in ('gc_review', 'returned') then
    v_status := public.ir_first_status(r.project_id);
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

-- Withdraw my own request (and Undo). Once the inspector has a result, it stays.
create or replace function public.ir_withdraw(p_request_id uuid, p_version int)
returns public.inspection_requests
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare r public.inspection_requests; v_was text;
begin
  r := public.ir_for_update(p_request_id, p_version);
  if r.requested_by is distinct from auth.uid() then raise exception 'forbidden' using errcode = '42501'; end if;
  if r.status in ('withdrawn', 'complete') or r.result is not null then
    raise exception 'This inspection can''t be withdrawn.' using errcode = '22023';
  end if;
  v_was := r.status;
  perform set_config('app.ir_action', 'withdraw', true);
  update public.inspection_requests set status = 'withdrawn' where id = r.id returning * into r;
  if v_was in ('pending', 'confirmed', 'postponed') then
    perform public.ir_tell_inspector(r, 'ir.withdrawn', 'IR ' || r.number || ' withdrawn');
  end if;
  return r;
end;
$$;

create or replace function public.ir_restore(p_request_id uuid, p_version int)
returns public.inspection_requests
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare r public.inspection_requests;
begin
  r := public.ir_for_update(p_request_id, p_version);
  if r.requested_by is distinct from auth.uid() or not public.has_capability(r.project_id, 'ir.request') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if r.status <> 'withdrawn' then raise exception 'This inspection is not withdrawn.' using errcode = '22023'; end if;
  perform set_config('app.ir_action', 'restore', true);
  update public.inspection_requests set status = public.ir_first_status(r.project_id) where id = r.id returning * into r;
  if r.status = 'pending' then
    perform public.ir_tell_inspector(r, 'ir.requested', 'IR ' || r.number || ' requested again');
  end if;
  return r;
end;
$$;

-- GC approval step (only when the job has it on): approve, or return with a reason.
create or replace function public.ir_gc_decide(p_request_id uuid, p_version int, p_approve boolean, p_note text default null)
returns public.inspection_requests
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare r public.inspection_requests; v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  r := public.ir_for_update(p_request_id, p_version);
  if not public.has_capability(r.project_id, 'ir.gc_approve') then raise exception 'forbidden' using errcode = '42501'; end if;
  if not (r.status in ('gc_review', 'returned') or (r.status = 'pending' and r.gc_at is not null)) then
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

-- ---------------------------------------------------------------------------
-- Inspector side (ir.decide). Each step is small, silent unless noted, and can be redone.
-- The first inspector to act on a request owns it; only the owner decides, generates and sends.
-- ---------------------------------------------------------------------------
-- The owning inspector (the caller) after this step: kept if still on the job, else the caller takes it.
create or replace function public.ir_decider(p_request_id uuid, p_version int)
returns public.inspection_requests
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare r public.inspection_requests;
begin
  r := public.ir_for_update(p_request_id, p_version);
  if not public.ir_owner_ok(r.project_id, r.owner_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  if r.status in ('withdrawn', 'gc_review', 'returned') then
    raise exception 'This request is not with the inspector.' using errcode = '22023';
  end if;
  return r;
end;
$$;
revoke execute on function public.ir_decider(uuid, integer) from public, anon, authenticated;

-- Confirm (optional note the GC sees). From pending or postponed; again on a confirmed one to change the note.
create or replace function public.ir_confirm(p_request_id uuid, p_version int, p_note text default null)
returns public.inspection_requests
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare r public.inspection_requests;
begin
  r := public.ir_decider(p_request_id, p_version);
  perform set_config('app.ir_action', 'confirm', true);
  update public.inspection_requests
     set status = case when ir_file_id is not null then 'complete' else 'confirmed' end,
         owner_id = auth.uid(), confirm_note = nullif(btrim(coalesce(p_note, '')), ''),
         postpone_reason = null, postpone_note = null, postpone_until = null, postponed_at = null
   where id = r.id
   returning * into r;
  return r;
end;
$$;

-- Undo a confirm.
create or replace function public.ir_unconfirm(p_request_id uuid, p_version int)
returns public.inspection_requests
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare r public.inspection_requests;
begin
  r := public.ir_decider(p_request_id, p_version);
  if r.status <> 'confirmed' then raise exception 'Only a confirmed request can go back to pending.' using errcode = '22023'; end if;
  perform set_config('app.ir_action', 'unconfirm', true);
  update public.inspection_requests set status = 'pending' where id = r.id returning * into r;
  return r;
end;
$$;

-- Attendance: 'be_present' (be there with the inspector) or 'alone' ("I've got this"); null clears it.
create or replace function public.ir_set_attendance(p_request_id uuid, p_version int, p_attendance text default null)
returns public.inspection_requests
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare r public.inspection_requests;
begin
  r := public.ir_decider(p_request_id, p_version);
  if p_attendance is not null and p_attendance not in ('be_present', 'alone') then
    raise exception 'Unknown attendance.' using errcode = '22023';
  end if;
  perform set_config('app.ir_action', 'attendance', true);
  update public.inspection_requests set attendance = p_attendance, owner_id = auth.uid() where id = r.id returning * into r;
  return r;
end;
$$;

-- Approved / Not approved, with a note and photos. Changeable; null clears it. A pending request becomes confirmed.
create or replace function public.ir_set_result(
  p_request_id uuid, p_version int, p_result text default null, p_note text default null, p_photo_ids uuid[] default '{}'
)
returns public.inspection_requests
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare r public.inspection_requests; fid uuid;
begin
  r := public.ir_decider(p_request_id, p_version);
  if r.status = 'postponed' then raise exception 'Confirm it again first.' using errcode = '22023'; end if;
  if p_result is not null and p_result not in ('approved', 'not_approved') then
    raise exception 'Unknown result.' using errcode = '22023';
  end if;
  foreach fid in array coalesce(p_photo_ids, '{}'::uuid[]) loop
    if not (fid = any (r.result_photo_ids)
            or exists (select 1 from public.files f where f.id = fid and f.project_id = r.project_id
                       and f.created_by = auth.uid() and f.deleted_at is null
                       and f.folder_id = public.ir_attach_folder_id(r.project_id))) then
      raise exception 'A photo is missing. Add it again.' using errcode = '22023';
    end if;
  end loop;
  perform set_config('app.ir_action', 'result', true);
  update public.inspection_requests
     set result = p_result, result_note = nullif(btrim(coalesce(p_note, '')), ''),
         result_photo_ids = coalesce(p_photo_ids, '{}'::uuid[]),
         result_at = case when p_result is distinct from result then now() else result_at end,
         result_by = case when p_result is distinct from result then auth.uid() else result_by end,
         status = case when status = 'pending' then 'confirmed' else status end,
         owner_id = auth.uid()
   where id = r.id
   returning * into r;
  return r;
end;
$$;

-- Postpone is not cancel: the request keeps its date with a postponed chip, its slot is free, it counts as an extra
-- request, and the requester gets a board line. An existing PDF is re-rendered with the stamp by ir-pdf.
create or replace function public.ir_postpone(
  p_request_id uuid, p_version int, p_reason text, p_note text default null, p_until date default null
)
returns public.inspection_requests
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare r public.inspection_requests; v_note text := nullif(btrim(coalesce(p_note, '')), ''); v_new boolean;
begin
  r := public.ir_decider(p_request_id, p_version);
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

-- Co-inspectors. The owner assigns a helper (another inspector on the job) or clears it; a helper may step off.
create or replace function public.ir_assign_helper(p_request_id uuid, p_version int, p_helper_id uuid default null)
returns public.inspection_requests
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare r public.inspection_requests;
begin
  r := public.ir_for_update(p_request_id, p_version);
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

-- Claim: take an unowned request, or help on one that has no helper yet.
create or replace function public.ir_claim(p_request_id uuid, p_version int)
returns public.inspection_requests
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare r public.inspection_requests;
begin
  r := public.ir_for_update(p_request_id, p_version);
  if not public.has_capability(r.project_id, 'ir.decide') then raise exception 'forbidden' using errcode = '42501'; end if;
  if r.status in ('withdrawn', 'gc_review', 'returned') then
    raise exception 'This request is not with the inspector.' using errcode = '22023';
  end if;
  if public.ir_owner_ok(r.project_id, r.owner_id) then
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

-- The helper's report to the owner: 'passed' or 'issues', with a note. Only the owner generates and sends.
create or replace function public.ir_helper_report(p_request_id uuid, p_version int, p_report text default null, p_note text default null)
returns public.inspection_requests
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare r public.inspection_requests;
begin
  r := public.ir_for_update(p_request_id, p_version);
  if r.helper_id is distinct from auth.uid() or not public.has_capability(r.project_id, 'ir.decide') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_report is not null and p_report not in ('passed', 'issues') then raise exception 'Unknown report.' using errcode = '22023'; end if;
  perform set_config('app.ir_action', 'helper_report', true);
  update public.inspection_requests
     set helper_report = p_report, helper_note = nullif(btrim(coalesce(p_note, '')), ''), helper_at = now()
   where id = r.id
   returning * into r;
  if p_report is not null then
    perform public.ir_tell_inspector(r, 'ir.helper_report',
      'IR ' || r.number || ' helper: ' || case p_report when 'passed' then 'Passed' else 'Issues' end);
  end if;
  return r;
end;
$$;

-- ---------------------------------------------------------------------------
-- The IR PDF (SPEC §6.9): ir-pdf computes the content hash, ir_sign stamps it as the caller, the function renders and
-- stores the PDF, and ir_attach_pdf records it. One way to complete an IR.
-- ---------------------------------------------------------------------------
create or replace function public.ir_sign(p_request_id uuid, p_version int, p_content_hash text)
returns public.inspection_requests
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare r public.inspection_requests;
begin
  r := public.ir_decider(p_request_id, p_version);
  if r.result is null then raise exception 'Record the result first.' using errcode = '22023'; end if;
  if r.status = 'postponed' then raise exception 'Confirm it again first.' using errcode = '22023'; end if;
  if p_content_hash is null or p_content_hash !~ '^[0-9a-f]{64}$' then raise exception 'bad content hash' using errcode = '22023'; end if;
  perform set_config('app.ir_action', 'sign', true);
  update public.inspection_requests
     set content_hash = p_content_hash, signed_at = now(), signed_by = auth.uid(), owner_id = auth.uid()
   where id = r.id
   returning * into r;
  perform public.audit('ir.sign', 'inspection_request', r.id, r.project_id, r.org_id,
                       jsonb_build_object('number', r.number, 'result', r.result), p_content_hash);
  return r;
end;
$$;

-- Records the PDF ir-pdf rendered and stored. Service role only: the IR on file is always one the server made from the
-- signed content, never an upload. ir-pdf reaches it only after requireCapability and ir_sign() as the caller; the
-- history names the signer.
create or replace function public.ir_attach_pdf(p_request_id uuid, p_file_id uuid, p_content_hash text, p_postponed boolean)
returns public.inspection_requests
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare r public.inspection_requests; v_action text;
begin
  if not public.is_service_role() then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into r from public.inspection_requests where id = p_request_id and deleted_at is null for update;
  if r.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if r.signed_by is null or r.content_hash is distinct from p_content_hash then
    raise exception 'The IR changed while signing. Try again.' using errcode = '40001';
  end if;
  if not exists (select 1 from public.files f where f.id = p_file_id and f.project_id = r.project_id and f.created_by = r.signed_by
                 and f.deleted_at is null and f.mime = 'application/pdf' and f.scan_status = 'clean') then
    raise exception 'The PDF is missing.' using errcode = '22023';
  end if;
  v_action := case when r.ir_file_id is null then 'pdf' when coalesce(p_postponed, false) <> r.pdf_postponed then 'pdf_stamp'
                   else 'pdf_update' end;
  perform set_config('app.ir_action', v_action, true);
  perform set_config('app.ir_actor', r.signed_by::text, true);
  update public.inspection_requests
     set ir_file_id = p_file_id, pdf_stale = false, pdf_postponed = coalesce(p_postponed, false),
         status = case when status = 'postponed' then 'postponed' else 'complete' end
   where id = r.id
   returning * into r;
  return r;
end;
$$;

-- Delete PDF & start over: the PDF (every version) goes, the signature with it; the result stays.
create or replace function public.ir_delete_pdf(p_request_id uuid, p_version int)
returns public.inspection_requests
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare r public.inspection_requests;
begin
  r := public.ir_decider(p_request_id, p_version);
  if r.ir_file_id is null then raise exception 'There is no PDF.' using errcode = '22023'; end if;
  update public.files set deleted_at = now()
   where deleted_at is null and version_group_id = (select version_group_id from public.files where id = r.ir_file_id);
  perform set_config('app.ir_action', 'pdf_delete', true);
  update public.inspection_requests
     set ir_file_id = null, content_hash = null, signed_at = null, signed_by = null, pdf_stale = false, pdf_postponed = false,
         status = case when status = 'complete' then 'confirmed' else status end
   where id = r.id
   returning * into r;
  perform public.audit('ir.pdf_delete', 'inspection_request', r.id, r.project_id, r.org_id, jsonb_build_object('number', r.number));
  return r;
end;
$$;

-- Downloads for a request's own files (its IR PDF, attachments and result photos) by anyone who may see the request in
-- full, e.g. the requester's "View IR". The scan rules of authorize_download still hold. Logged like every download.
create or replace function public.authorize_ir_file(p_request_id uuid, p_file_id uuid)
returns table (storage_path text, original_name text, mime text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare r public.inspection_requests; f public.files; hdrs jsonb;
begin
  select * into r from public.inspection_requests where id = p_request_id and deleted_at is null;
  if r.id is null
     or not ((r.requested_by = auth.uid() and public.is_member(r.project_id))
             or public.has_capability(r.project_id, 'ir.view_all') or public.has_capability(r.project_id, 'ir.decide')) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if not (p_file_id = r.ir_file_id or p_file_id = any (r.attachment_ids) or p_file_id = any (r.result_photo_ids)) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into f from public.files where id = p_file_id and project_id = r.project_id and deleted_at is null;
  if f.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  -- The IR PDF is server-made (ir_attach_pdf); anything else must be a request file in the attachments folder.
  if f.id is distinct from r.ir_file_id and f.folder_id is distinct from public.ir_attach_folder_id(r.project_id) then
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

-- Send results: who the picker offers (active members, never bidders), with the requester and the job team checked.
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
             and (pm.user_id = r.requested_by
                  or exists (select 1 from public.role_permissions rp where rp.role = pm.role and rp.capability = 'ir.view_all'))
      from public.project_members pm
      left join public.profiles pr on pr.user_id = pm.user_id
      left join public.orgs o on o.id = pm.member_org_id
     where pm.project_id = r.project_id and pm.status = 'active' and pm.user_id is not null
       and (pm.access_ends_at is null or pm.access_ends_at > now()) and not public.role_is_walled(pm.role)
     order by 6 desc, 3;
end;
$$;

-- Recorded by ir-send once the results email went out: the send time, the audit line (bound to the signed content),
-- and a board line for each member who got it. Service role only, so "results sent" always means an email went: ir-send
-- reaches it only after requireCapability, the owner check and the send.
create or replace function public.ir_mark_sent(p_request_id uuid, p_transmittal_id uuid, p_recipient_ids uuid[] default '{}')
returns public.inspection_requests
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare r public.inspection_requests;
begin
  if not public.is_service_role() then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into r from public.inspection_requests where id = p_request_id and deleted_at is null for update;
  if r.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if r.ir_file_id is null or r.pdf_stale or r.status <> 'complete' then
    raise exception 'Generate the IR first.' using errcode = '22023';
  end if;
  perform set_config('app.ir_action', 'send', true);
  perform set_config('app.ir_actor', r.owner_id::text, true);
  update public.inspection_requests set results_sent_at = now() where id = r.id returning * into r;
  perform public.audit('ir.send', 'inspection_request', r.id, r.project_id, r.org_id,
                       jsonb_build_object('transmittal_id', p_transmittal_id, 'recipients', cardinality(p_recipient_ids),
                                          'by', r.owner_id),
                       r.content_hash, 'system');
  if cardinality(p_recipient_ids) > 0 then
    perform public.post_activity(r.project_id, 'ir.results', 'IR ' || r.number || ' results: '
      || case r.result when 'approved' then 'Approved' else 'Not approved' end, 'inspection_request', r.id, null, p_recipient_ids);
  end if;
  return r;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants: the RPCs people call. Everything else above is internal.
-- ---------------------------------------------------------------------------
do $$
declare f text;
begin
  foreach f in array array[
    'public.ir_folder(uuid, text)', 'public.ir_form_context(uuid)',
    'public.ir_submit(uuid, text, date, text, text, boolean, time without time zone, text, integer, uuid, uuid[])',
    'public.ir_calendar(uuid, date, date)',
    'public.ir_move(uuid, integer, date, time without time zone, text, integer)',
    'public.ir_withdraw(uuid, integer)', 'public.ir_restore(uuid, integer)', 'public.ir_gc_decide(uuid, integer, boolean, text)',
    'public.ir_confirm(uuid, integer, text)', 'public.ir_unconfirm(uuid, integer)', 'public.ir_set_attendance(uuid, integer, text)',
    'public.ir_set_result(uuid, integer, text, text, uuid[])', 'public.ir_postpone(uuid, integer, text, text, date)',
    'public.ir_assign_helper(uuid, integer, uuid)', 'public.ir_claim(uuid, integer)',
    'public.ir_helper_report(uuid, integer, text, text)', 'public.ir_sign(uuid, integer, text)',
    'public.ir_delete_pdf(uuid, integer)', 'public.authorize_ir_file(uuid, uuid)', 'public.ir_recipients(uuid)']
  loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
  -- Only the edge functions (service role) record the PDF and the send.
  foreach f in array array['public.ir_attach_pdf(uuid, uuid, text, boolean)', 'public.ir_mark_sent(uuid, uuid, uuid[])'] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
