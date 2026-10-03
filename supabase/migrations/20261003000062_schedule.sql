-- 0062 Schedule v1: the GC's schedule, imported and shown as a look-ahead (SPEC §12.5, §15; research
-- scratch/research/schedule-integration.md §6). Jesse, Oct 3: "having it talk to the schedule, so: boom, 60 days out —
-- the two-month look-ahead shows restroom finishes starting". The suite is not a scheduling engine: it reads what the
-- scheduler made (P6 XER, MS Project XML, a CSV look-ahead, a PDF or a photo) and keeps each upload as a version.
--   * Capabilities (rows, provisional; Jesse reviews the matrix): schedule.read for every role but the walled ones
--     (bidders) and the requester (requests only, 0055); schedule.manage (upload, review a draft, publish) for the
--     superintendent, pm, pe, project_admin and inspector_admin (the project admin's twin, 0044). Schedule sits right
--     after Calendar in the superintendent's, pm's, pe's and project admin's recommended rails. Not the inspector
--     admin's: its rail is the inspector's (0044) and already has the 8 tools a rail may hold.
--   * Module 'schedule': on for jobs being built (existing ones too), a job tool on the rail (job_rail_tools).
--   * The job's Schedule folder (made on first upload): the original files are the record. schedule.read reads,
--     schedule.manage uploads.
--   * schedule_versions: one per upload. Source kind, the scheduler's data date, the file and its content hash, who
--     uploaded it, status draft -> current -> superseded. One current version per job (a unique index). "Update N"
--     comes from next_number(job, 'schedule_update') when a version is first published. A draft is discarded with Undo.
--   * schedule_activities: the rows of a version. activity_code is the scheduler's Activity ID (P6 task_code, MS Project
--     UID), stable across updates; name, WBS and area text, start / finish, actual start / finish, percent, trade or
--     responsible text, milestone, CSI division text. A draft's rows are edited and removed (Undo) before publishing.
--   * Deny by default: people read through RLS (drafts only by schedule.manage) and write only through the SECURITY
--     DEFINER RPCs below, identity from auth.uid(), version checks on saves. The schedule-import edge function parses
--     the file and lands the draft with schedule_import_draft AS THE CALLER (it needs the service key only to read the
--     file's bytes and to log the AI call).
--   * Calendar: the current version's activities in the next 60 days (the job's clock) are lines on the job's calendar
--     (kind 'lookahead', milestones 'milestones', read by schedule.read). Published and undone versions re-sync at once;
--     schedule_daily() rolls the window each morning (pg_cron).
--   * For others to use: schedule_upcoming(job, days) = the current activities starting within N days (the
--     requirements register, reminders). schedule_daily() also posts one board line per current version once its data
--     date is more than 35 days old: "Schedule update due".

-- =====================================================================================================================
-- Capabilities and rails, as data
-- =====================================================================================================================
insert into public.role_permissions (role, capability, requires_aal2)
select r.name, 'schedule.read', false from public.roles r
 where not public.role_is_walled(r.name) and r.name <> 'requester'
on conflict do nothing;

insert into public.role_permissions (role, capability, requires_aal2) values
  ('superintendent', 'schedule.manage', false), ('pm', 'schedule.manage', false), ('pe', 'schedule.manage', false),
  ('project_admin', 'schedule.manage', false),
  -- inspector_admin is the inspector plus the project admin (0044), so it follows the project admin.
  ('inspector_admin', 'schedule.manage', false)
on conflict do nothing;

-- Right after Calendar.
update public.roles
   set recommended_tools = recommended_tools[1:array_position(recommended_tools, 'calendar')] || '{schedule}'::text[]
                           || recommended_tools[array_position(recommended_tools, 'calendar') + 1:]
 where name in ('superintendent', 'pm', 'pe', 'project_admin')
   and 'calendar' = any (recommended_tools) and not ('schedule' = any (recommended_tools));

-- =====================================================================================================================
-- Module and rail
-- =====================================================================================================================
-- Schedule comes on when a job reaches construction / closeout. Never taken off. Runs as the person saving the job.
create or replace function public.tg_project_schedule_module()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.stage in ('construction', 'closeout') and not ('schedule' = any (new.modules))
     and (tg_op = 'INSERT' or (old.stage is distinct from new.stage and old.stage not in ('construction', 'closeout'))) then
    new.modules := array(select distinct m from unnest(new.modules || '{schedule}'::text[]) m order by m);
  end if;
  return new;
end;
$$;
create trigger schedule_module before insert or update of stage on public.projects
  for each row execute function public.tg_project_schedule_module();

update public.projects
   set modules = array(select distinct m from unnest(modules || '{schedule}'::text[]) m order by m)
 where stage in ('construction', 'closeout') and not ('schedule' = any (modules));

-- Same as 0060 plus Schedule after Safety (lib/layout RAIL_TOOLS mirrors it).
create or replace function public.job_rail_tools()
returns text[]
language sql
immutable
set search_path = public, pg_temp
as $$
  select '{board,files,bids,calendar,dailies,inspections,revs,rfis,permits,deliveries,corrections,safety,schedule,people,hours}'::text[];
$$;

-- =====================================================================================================================
-- The job's Schedule folder: the uploaded files
-- =====================================================================================================================
alter table public.folders drop constraint folders_kind_check;
alter table public.folders add constraint folders_kind_check
  check (kind in ('general', 'plans', 'specs', 'reports', 'bids_received', 'inbound', 'photos', 'transmittals', 'system',
                  'dsa_103', 'ccd', 'ti', 'bid_forms', 'rfis', 'approved_plans', 'permit_uploads', 'stamping', 'safety',
                  'schedule'));

-- Same as 0060 plus "Schedule" at the top of a job.
create or replace function public.folder_name_reserved(p_project_id uuid, p_parent_id uuid, p_name text)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select case
    when p_parent_id is null then btrim(p_name) in ('Bids received', 'Inspection requests', 'Delivery tickets', 'Emailed in',
                                                     'Bid forms', 'RFIs', 'Approved plans', 'Safety', 'Schedule')
    else btrim(p_name) = case (select kind from public.folders where id = p_parent_id and project_id = p_project_id)
                           when 'reports' then 'Inspection reports' when 'photos' then 'Corrections' end
  end;
$$;

-- Made on first use: schedule.read reads the originals, schedule.manage uploads. Internal (the caller checks).
create or replace function public.schedule_folder_make(p_project_id uuid)
returns uuid
language plpgsql
set search_path = public, pg_temp
as $$
declare p public.projects; v_folder uuid; v_deleted timestamptz;
begin
  select * into p from public.projects where id = p_project_id and deleted_at is null;
  if p.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  perform pg_advisory_xact_lock(hashtext('schedule_folder:' || p.id::text));
  select f.id, f.deleted_at into v_folder, v_deleted
    from public.folders f
   where f.project_id = p.id and f.kind = 'schedule'
   order by (f.deleted_at is null) desc, f.created_at
   limit 1;
  if v_folder is null then
    insert into public.folders (org_id, project_id, name, kind, sort, ai_reads, created_by)
    values (p.org_id, p.id, 'Schedule', 'schedule', 76, false, auth.uid())
    on conflict do nothing
    returning id into v_folder;
    if v_folder is null then
      raise exception 'A folder named "Schedule" is in the way. Rename it in Files.' using errcode = '23505';
    end if;
    insert into public.folder_access (folder_id, capability, can_read, can_write, created_by) values
      (v_folder, 'schedule.read', true, false, auth.uid()),
      (v_folder, 'schedule.manage', true, true, auth.uid());
  elsif v_deleted is not null then
    update public.folders set deleted_at = null where id = v_folder;
  end if;
  return v_folder;
end;
$$;

-- The folder an upload goes to (schedule.manage).
create or replace function public.schedule_folder(p_project_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not public.has_capability(p_project_id, 'schedule.manage') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return public.schedule_folder_make(p_project_id);
end;
$$;

-- =====================================================================================================================
-- Tables
-- =====================================================================================================================
-- Short text lists (an import's warnings): up to p_max lines of 1 to 300 characters.
create or replace function public.schedule_lines_ok(p_lines text[], p_max int)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select p_lines is not null and coalesce(array_ndims(p_lines), 1) = 1 and cardinality(p_lines) <= p_max
     and not exists (select 1 from unnest(p_lines) l where l is null or length(btrim(l)) not between 1 and 300);
$$;

create table public.schedule_versions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Who uploaded it.
  created_by uuid not null references auth.users(id),
  version int not null default 1,
  -- A discarded draft (Undo brings it back). Published versions are never discarded.
  deleted_at timestamptz,
  org_id uuid not null,
  project_id uuid not null,
  -- "Update N": from next_number(job, 'schedule_update') when first published; kept by an Undo, so a republish is the
  -- same update.
  number int check (number > 0),
  source_kind text not null check (source_kind in ('pdf', 'photo', 'xer', 'msp_xml', 'csv', 'excel')),
  title text check (title is null or length(btrim(title)) between 1 and 200),
  -- The scheduler's data date (P6 last_recalc_date, MS Project StatusDate), or as the person sets it. Never guessed.
  data_date date,
  -- The original file (the record) and the sha256 of its bytes.
  file_id uuid references public.files(id),
  content_hash text check (content_hash is null or content_hash ~ '^[0-9a-f]{64}$'),
  -- The AI model that read a PDF or a photo.
  model text check (model is null or length(btrim(model)) between 1 and 100),
  -- What the import noticed (rows without dates, duplicate IDs dropped, ...).
  warnings text[] not null default '{}' check (public.schedule_lines_ok(warnings, 20)),
  status text not null default 'draft' check (status in ('draft', 'current', 'superseded')),
  published_at timestamptz,
  published_by uuid references auth.users(id),
  -- The version this one replaced when it was published (an Undo puts it back).
  supersedes_id uuid references public.schedule_versions(id),
  superseded_at timestamptz,
  foreign key (project_id, org_id) references public.projects (id, org_id),
  unique (id, project_id),
  unique (project_id, number),
  check (status = 'draft' or (number is not null and data_date is not null and published_at is not null
                              and published_by is not null and deleted_at is null)),
  check (status <> 'draft' or (published_at is null and published_by is null and supersedes_id is null)),
  check ((status = 'superseded') = (superseded_at is not null))
);
alter table public.schedule_versions enable row level security;
-- One current version per job; one version per uploaded file (a repeat import answers the same draft).
create unique index schedule_versions_current on public.schedule_versions (project_id) where status = 'current';
create unique index schedule_versions_file on public.schedule_versions (file_id) where file_id is not null;
create index schedule_versions_project on public.schedule_versions (project_id, created_at desc);

create table public.schedule_activities (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version int not null default 1,
  -- Taken off a draft (Undo puts it back). Kept, never shown.
  deleted_at timestamptz,
  org_id uuid not null,
  project_id uuid not null,
  version_id uuid not null,
  -- The row's place in the source (file order).
  sort int not null default 0,
  -- The scheduler's Activity ID: stable across monthly updates, so links made later survive them.
  activity_code text check (activity_code is null or length(btrim(activity_code)) between 1 and 60),
  name text not null check (length(btrim(name)) between 1 and 300),
  wbs text check (wbs is null or length(btrim(wbs)) between 1 and 300),
  area text check (area is null or length(btrim(area)) between 1 and 120),
  trade text check (trade is null or length(btrim(trade)) between 1 and 120),
  -- Forecast (or planned) dates, as calendar days of the job.
  start_date date,
  finish_date date,
  actual_start date,
  actual_finish date,
  percent numeric(5, 2) check (percent is null or percent between 0 and 100),
  is_milestone boolean not null default false,
  csi_division text check (csi_division is null or length(btrim(csi_division)) between 1 and 20),
  -- An AI read that isn't sure of this row's dates (bars without date columns, a blurry photo): the person checks it.
  unsure boolean not null default false,
  -- Where it came from: "p3" for a page, "row 12" for a file.
  source_ref text check (source_ref is null or length(btrim(source_ref)) between 1 and 60),
  foreign key (project_id, org_id) references public.projects (id, org_id),
  foreign key (version_id, project_id) references public.schedule_versions (id, project_id),
  check (start_date is null or finish_date is null or finish_date >= start_date),
  check (actual_start is null or actual_finish is null or actual_finish >= actual_start)
);
alter table public.schedule_activities enable row level security;
create unique index schedule_activities_code on public.schedule_activities (version_id, lower(btrim(activity_code)))
  where activity_code is not null and deleted_at is null;
create index schedule_activities_version on public.schedule_activities (version_id, sort);
create index schedule_activities_start on public.schedule_activities (version_id, start_date) where deleted_at is null;

create trigger touch before update on public.schedule_versions for each row execute function public.tg_touch_row();
create trigger touch before update on public.schedule_activities for each row execute function public.tg_touch_row();
create trigger no_delete before delete on public.schedule_versions for each row execute function public.tg_block_delete();
create trigger no_delete before delete on public.schedule_activities for each row execute function public.tg_block_delete();
-- The versions are audited row by row; activities (thousands per import) through their RPCs.
create trigger audit_row after insert or update on public.schedule_versions for each row execute function public.tg_audit_row();
insert into public.owner_lookup (entity_type, table_name) values ('schedule_version', 'schedule_versions') on conflict do nothing;

-- =====================================================================================================================
-- RLS: read only; every write is an RPC below
-- =====================================================================================================================
create policy "schedule_versions: schedule.read; drafts schedule.manage" on public.schedule_versions
  for select to authenticated
  using (public.has_capability(project_id, 'schedule.read')
         and ((status <> 'draft' and deleted_at is null) or public.has_capability(project_id, 'schedule.manage')));
-- A row is seen with its version (that policy decides drafts).
create policy "schedule_activities: with their version" on public.schedule_activities for select to authenticated
  using (public.has_capability(project_id, 'schedule.read')
         and exists (select 1 from public.schedule_versions v where v.id = schedule_activities.version_id));

revoke all on public.schedule_versions, public.schedule_activities from public, anon, authenticated, service_role;
grant select on public.schedule_versions, public.schedule_activities to authenticated, service_role;

-- =====================================================================================================================
-- Internal helpers (not user-callable)
-- =====================================================================================================================
-- The job's today (its time zone).
create or replace function public.schedule_today(p_project_id uuid, p_at timestamptz default now())
returns date
language sql
stable
set search_path = public, pg_temp
as $$
  select (p_at at time zone p.timezone)::date from public.projects p where p.id = p_project_id;
$$;

-- A version, held for the change, if the caller may change the job's schedule.
create or replace function public.schedule_version_lock(p_version_id uuid)
returns public.schedule_versions
language plpgsql
set search_path = public, pg_temp
as $$
declare v public.schedule_versions;
begin
  select * into v from public.schedule_versions where id = p_version_id for update;
  -- A draft is not there for anyone who can't manage the schedule.
  if v.id is null or auth.uid() is null or not public.has_capability(v.project_id, 'schedule.read')
     or ((v.status = 'draft' or v.deleted_at is not null) and not public.has_capability(v.project_id, 'schedule.manage')) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if not public.has_capability(v.project_id, 'schedule.manage') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return v;
end;
$$;

-- A draft, held for the change (schedule.manage): not discarded, not published.
create or replace function public.schedule_draft_lock(p_version_id uuid)
returns public.schedule_versions
language plpgsql
set search_path = public, pg_temp
as $$
declare v public.schedule_versions;
begin
  v := public.schedule_version_lock(p_version_id);
  if v.status <> 'draft' then raise exception 'This schedule is published.' using errcode = '22023'; end if;
  if v.deleted_at is not null then raise exception 'This draft was discarded.' using errcode = '22023'; end if;
  return v;
end;
$$;

-- Empty or blank text is null; otherwise trimmed.
create or replace function public.schedule_text(p text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select nullif(btrim(p), '');
$$;

-- The current version's activities in the calendar's window: started or starting by 60 days from the job's today, not
-- finished before it, not done. Milestones are 'milestones' lines, the rest 'lookahead'; all day, read by
-- schedule.read. Lines of anything else (an older version, outside the window, removed) come off.
create or replace function public.schedule_calendar_sync(p_project_id uuid, p_at timestamptz default now())
returns int
language plpgsql
set search_path = public, pg_temp
as $$
declare v_tz text; v_today date; r record; v_n int := 0;
begin
  select p.timezone into v_tz from public.projects p where p.id = p_project_id;
  if v_tz is null then return 0; end if;
  v_today := (p_at at time zone v_tz)::date;
  for r in
    select ce.source_id from public.calendar_entries ce
     where ce.project_id = p_project_id and ce.source_type = 'schedule_activity'
       and not exists (
         select 1 from public.schedule_activities a
           join public.schedule_versions v on v.id = a.version_id
          where a.id = ce.source_id and v.status = 'current' and a.deleted_at is null and a.start_date is not null
            and a.actual_finish is null and coalesce(a.percent, 0) < 100
            and a.start_date <= v_today + 60 and coalesce(a.finish_date, a.start_date) >= v_today)
  loop
    perform public.calendar_unmirror('schedule_activity', r.source_id);
  end loop;
  for r in
    select a.id, a.name, a.area, a.start_date, a.finish_date, a.is_milestone
      from public.schedule_activities a
      join public.schedule_versions v on v.id = a.version_id
     where v.project_id = p_project_id and v.status = 'current' and a.deleted_at is null and a.start_date is not null
       and a.actual_finish is null and coalesce(a.percent, 0) < 100
       and a.start_date <= v_today + 60 and coalesce(a.finish_date, a.start_date) >= v_today
  loop
    perform public.calendar_mirror('schedule_activity', r.id, p_project_id,
      case when r.is_milestone then 'milestones' else 'lookahead' end, r.name,
      r.start_date::timestamp at time zone v_tz,
      case when r.finish_date > r.start_date then r.finish_date::timestamp at time zone v_tz end,
      true, null, 'schedule.read', null, r.area);
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

-- =====================================================================================================================
-- Writes (schedule.manage)
-- =====================================================================================================================
-- Lands an import as a draft (the schedule-import edge function, as the caller). p_rows: a JSON array of 1 to 5000
-- objects {code, name, wbs, area, trade, start, finish, actual_start, actual_finish, percent, is_milestone,
-- csi_division, unsure, source_ref}; the table checks each value. The file must be in the job's Schedule folder and
-- readable by the caller. A repeat for the same file answers the same draft (a discarded one comes back).
create or replace function public.schedule_import_draft(
  p_project_id uuid,
  p_file_id uuid,
  p_source_kind text,
  p_title text,
  p_data_date date,
  p_content_hash text,
  p_model text,
  p_warnings text[],
  p_rows jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare p public.projects; v_id uuid; v_deleted timestamptz;
begin
  if auth.uid() is null or not public.has_capability(p_project_id, 'schedule.manage') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into p from public.projects where id = p_project_id and deleted_at is null;
  if p.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not exists (select 1 from public.files f
                   join public.folders fo on fo.id = f.folder_id and fo.kind = 'schedule'
                  where f.id = p_file_id and f.project_id = p.id and f.deleted_at is null and f.upload_complete
                    and f.scan_status <> 'infected' and public.file_may_see(f.project_id, f.created_by, f.folder_id)) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  perform pg_advisory_xact_lock(hashtext('schedule_import:' || p_file_id::text));
  select id, deleted_at into v_id, v_deleted from public.schedule_versions where file_id = p_file_id;
  if v_id is not null then
    if v_deleted is not null then update public.schedule_versions set deleted_at = null where id = v_id; end if;
    return v_id;
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) not between 1 and 5000 then
    raise exception 'No activities in this file.' using errcode = '22023';
  end if;
  insert into public.schedule_versions (created_by, org_id, project_id, source_kind, title, data_date, file_id,
                                        content_hash, model, warnings)
  values (auth.uid(), p.org_id, p.id, p_source_kind, left(public.schedule_text(p_title), 200), p_data_date, p_file_id,
          p_content_hash, public.schedule_text(p_model), coalesce(p_warnings, '{}'))
  returning id into v_id;
  insert into public.schedule_activities (org_id, project_id, version_id, sort, activity_code, name, wbs, area, trade,
                                          start_date, finish_date, actual_start, actual_finish, percent, is_milestone,
                                          csi_division, unsure, source_ref)
  select p.org_id, p.id, v_id, r.ord::int, public.schedule_text(r.x ->> 'code'), btrim(r.x ->> 'name'),
         public.schedule_text(r.x ->> 'wbs'), public.schedule_text(r.x ->> 'area'), public.schedule_text(r.x ->> 'trade'),
         (r.x ->> 'start')::date, (r.x ->> 'finish')::date, (r.x ->> 'actual_start')::date, (r.x ->> 'actual_finish')::date,
         (r.x ->> 'percent')::numeric, coalesce((r.x ->> 'is_milestone')::boolean, false),
         public.schedule_text(r.x ->> 'csi_division'), coalesce((r.x ->> 'unsure')::boolean, false),
         public.schedule_text(r.x ->> 'source_ref')
    from jsonb_array_elements(p_rows) with ordinality as r (x, ord);
  perform public.audit('schedule.import', 'schedule_version', v_id, p.id, p.org_id,
    jsonb_build_object('source_kind', p_source_kind, 'rows', jsonb_array_length(p_rows), 'file_id', p_file_id));
  return v_id;
end;
$$;

-- A draft's title and data date, with its version.
create or replace function public.schedule_draft_save(p_version_id uuid, p_version int, p_title text, p_data_date date)
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v public.schedule_versions;
begin
  v := public.schedule_draft_lock(p_version_id);
  if p_version is null or v.version <> p_version then
    raise exception 'version_conflict: expected %, found %', p_version, v.version using errcode = '40001';
  end if;
  update public.schedule_versions set title = left(public.schedule_text(p_title), 200), data_date = p_data_date
   where id = v.id
   returning version into v.version;
  return v.version;
end;
$$;

-- One row of a draft, with its version: the person checked it (unsure clears).
create or replace function public.schedule_activity_save(
  p_activity_id uuid,
  p_version int,
  p_code text,
  p_name text,
  p_wbs text,
  p_area text,
  p_trade text,
  p_start date,
  p_finish date,
  p_is_milestone boolean
)
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare a public.schedule_activities; v_version int;
begin
  select * into a from public.schedule_activities where id = p_activity_id;
  if a.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  perform public.schedule_draft_lock(a.version_id);
  select * into a from public.schedule_activities where id = p_activity_id for update;
  if a.deleted_at is not null then raise exception 'This row was removed.' using errcode = '22023'; end if;
  if p_version is null or a.version <> p_version then
    raise exception 'version_conflict: expected %, found %', p_version, a.version using errcode = '40001';
  end if;
  update public.schedule_activities
     set activity_code = public.schedule_text(p_code), name = btrim(coalesce(p_name, '')), wbs = public.schedule_text(p_wbs),
         area = public.schedule_text(p_area), trade = public.schedule_text(p_trade), start_date = p_start,
         finish_date = p_finish, is_milestone = coalesce(p_is_milestone, false), unsure = false
   where id = a.id
   returning version into v_version;
  return v_version;
end;
$$;

-- Take a row off a draft, or put it back (Undo).
create or replace function public.schedule_activity_remove(p_activity_id uuid, p_removed boolean)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare a public.schedule_activities;
begin
  select * into a from public.schedule_activities where id = p_activity_id;
  if a.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  perform public.schedule_draft_lock(a.version_id);
  update public.schedule_activities
     set deleted_at = case when coalesce(p_removed, true) then coalesce(deleted_at, now()) end
   where id = a.id;
end;
$$;

-- Discard a draft, or bring it back (Undo).
create or replace function public.schedule_discard(p_version_id uuid, p_discarded boolean)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v public.schedule_versions;
begin
  v := public.schedule_version_lock(p_version_id);
  if v.status <> 'draft' then raise exception 'This schedule is published.' using errcode = '22023'; end if;
  update public.schedule_versions
     set deleted_at = case when coalesce(p_discarded, true) then coalesce(deleted_at, now()) end
   where id = v.id;
end;
$$;

-- Publish a draft (with its version): it becomes the job's current schedule and the old one is superseded. Needs the
-- data date (not older than the current one's) and a start date on every row; a row with no finish ends on its start.
-- The calendar follows at once; a board line tells the job.
create or replace function public.schedule_publish(p_version_id uuid, p_version int)
returns table (number int, version int)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare v public.schedule_versions; cur public.schedule_versions; v_rows int; v_missing int;
begin
  v := public.schedule_draft_lock(p_version_id);
  if p_version is null or v.version <> p_version then
    raise exception 'version_conflict: expected %, found %', p_version, v.version using errcode = '40001';
  end if;
  if v.data_date is null then raise exception 'Add the data date.' using errcode = '22023'; end if;
  select count(*), count(*) filter (where a.start_date is null) into v_rows, v_missing
    from public.schedule_activities a where a.version_id = v.id and a.deleted_at is null;
  if v_rows = 0 then raise exception 'No activities to publish.' using errcode = '22023'; end if;
  if v_missing > 0 then
    raise exception '% %', v_missing, case when v_missing = 1 then 'activity needs a start date.' else 'activities need a start date.' end
      using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtext('schedule_publish:' || v.project_id::text));
  select * into cur from public.schedule_versions x where x.project_id = v.project_id and x.status = 'current' for update;
  if cur.id is not null and cur.data_date > v.data_date then
    raise exception 'The current schedule''s data date is later (%).', to_char(cur.data_date, 'Mon FMDD, YYYY')
      using errcode = '22023';
  end if;
  update public.schedule_activities a set finish_date = a.start_date
   where a.version_id = v.id and a.deleted_at is null and a.finish_date is null;
  if cur.id is not null then
    update public.schedule_versions x set status = 'superseded', superseded_at = now() where x.id = cur.id;
  end if;
  update public.schedule_versions x
     set status = 'current', number = coalesce(x.number, public.next_number(x.project_id, 'schedule_update')),
         published_at = now(), published_by = auth.uid(), supersedes_id = cur.id
   where x.id = v.id
   returning * into v;
  perform public.schedule_calendar_sync(v.project_id);
  perform public.post_activity(v.project_id, 'schedule.published',
    'Schedule update ' || v.number || ' published (data date ' || to_char(v.data_date, 'Mon FMDD') || ')',
    'schedule_version', v.id, 'schedule.read');
  perform public.audit('schedule.publish', 'schedule_version', v.id, v.project_id, v.org_id,
    jsonb_build_object('number', v.number, 'rows', v_rows, 'supersedes', cur.id));
  return query select v.number, v.version;
end;
$$;

-- Undo a publish: the one who published it, within 15 minutes, while it is still the current one. It goes back to a
-- draft (keeping its number) and the version it replaced is current again.
create or replace function public.schedule_unpublish(p_version_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v public.schedule_versions;
begin
  v := public.schedule_version_lock(p_version_id);
  if v.status <> 'current' or v.published_by is distinct from auth.uid() or v.published_at <= now() - interval '15 minutes' then
    raise exception 'Too late to undo.' using errcode = '22023';
  end if;
  update public.schedule_versions
     set status = 'draft', published_at = null, published_by = null, supersedes_id = null
   where id = v.id;
  if v.supersedes_id is not null then
    update public.schedule_versions set status = 'current', superseded_at = null
     where id = v.supersedes_id and status = 'superseded';
  end if;
  perform public.schedule_calendar_sync(v.project_id);
  perform public.audit('schedule.unpublish', 'schedule_version', v.id, v.project_id, v.org_id,
    jsonb_build_object('number', v.number));
end;
$$;

-- =====================================================================================================================
-- Reads (schedule.read; drafts to schedule.manage)
-- =====================================================================================================================
-- The job's versions: drafts first (to schedule.manage), then the current one, then the superseded ones, newest first.
create or replace function public.schedule_versions_list(p_project_id uuid)
returns table (
  id uuid, number int, status text, source_kind text, title text, data_date date, file_id uuid, file_name text,
  created_at timestamptz, created_by_name text, published_at timestamptz, published_by_name text, activities int,
  version int
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare v_manage boolean;
begin
  if auth.uid() is null or not public.has_capability(p_project_id, 'schedule.read') then raise exception 'forbidden' using errcode = '42501'; end if;
  v_manage := public.has_capability(p_project_id, 'schedule.manage');
  return query
    select v.id, v.number, v.status, v.source_kind, v.title, v.data_date, v.file_id,
           (select f.original_name from public.files f where f.id = v.file_id),
           v.created_at, public.safety_person_name(v.created_by), v.published_at,
           case when v.published_by is null then null else public.safety_person_name(v.published_by) end,
           (select count(*)::int from public.schedule_activities a where a.version_id = v.id and a.deleted_at is null),
           v.version
      from public.schedule_versions v
     where v.project_id = p_project_id and v.deleted_at is null and (v.status <> 'draft' or v_manage)
     order by case v.status when 'draft' then 0 when 'current' then 1 else 2 end, v.number desc nulls first, v.created_at desc;
end;
$$;

-- One version with what its screen shows: the counts, the file, who did what, and whether I may change it or undo
-- its publish.
create or replace function public.schedule_version(p_version_id uuid)
returns table (
  id uuid, project_id uuid, number int, status text, source_kind text, title text, data_date date, file_id uuid,
  file_name text, model text, warnings text[], created_at timestamptz, created_by_name text, published_at timestamptz,
  published_by_name text, activities int, need_dates int, unsure int, discarded boolean, version int,
  can_manage boolean, can_undo boolean
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare v public.schedule_versions; v_manage boolean;
begin
  select * into v from public.schedule_versions x where x.id = p_version_id;
  if v.id is null or auth.uid() is null or not public.has_capability(v.project_id, 'schedule.read') then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  v_manage := public.has_capability(v.project_id, 'schedule.manage');
  if (v.status = 'draft' or v.deleted_at is not null) and not v_manage then raise exception 'not_found' using errcode = 'P0002'; end if;
  return query
    select v.id, v.project_id, v.number, v.status, v.source_kind, v.title, v.data_date, v.file_id,
           (select f.original_name from public.files f where f.id = v.file_id), v.model, v.warnings, v.created_at,
           public.safety_person_name(v.created_by), v.published_at,
           case when v.published_by is null then null else public.safety_person_name(v.published_by) end,
           (select count(*)::int from public.schedule_activities a where a.version_id = v.id and a.deleted_at is null),
           (select count(*)::int from public.schedule_activities a where a.version_id = v.id and a.deleted_at is null and a.start_date is null),
           (select count(*)::int from public.schedule_activities a where a.version_id = v.id and a.deleted_at is null and a.unsure),
           v.deleted_at is not null, v.version, v_manage,
           v.status = 'current' and v.published_by = auth.uid() and v.published_at > now() - interval '15 minutes';
end;
$$;

-- The job's current activities (schedule.read through RLS), by start. Paged by the caller (PostgREST max rows).
create or replace function public.schedule_current(p_project_id uuid)
returns table (
  id uuid, version_id uuid, activity_code text, name text, wbs text, area text, trade text, start_date date,
  finish_date date, actual_start date, actual_finish date, percent numeric, is_milestone boolean, csi_division text,
  sort int
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select a.id, a.version_id, a.activity_code, a.name, a.wbs, a.area, a.trade, a.start_date, a.finish_date, a.actual_start,
         a.actual_finish, a.percent, a.is_milestone, a.csi_division, a.sort
    from public.schedule_activities a
    join public.schedule_versions v on v.id = a.version_id
   where v.project_id = p_project_id and v.status = 'current' and a.deleted_at is null
   order by a.start_date nulls last, a.sort, a.id;
$$;

-- Where the job's schedule stands: today (the job's clock), the current version, how old its data date is, whether an
-- update is due (data date more than 35 days back), and the drafts waiting (schedule.manage only, else 0).
create or replace function public.schedule_status(p_project_id uuid)
returns table (today date, current_id uuid, number int, data_date date, days_old int, update_due boolean, drafts int)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare v_today date; cur public.schedule_versions;
begin
  if auth.uid() is null or not public.has_capability(p_project_id, 'schedule.read') then raise exception 'forbidden' using errcode = '42501'; end if;
  v_today := public.schedule_today(p_project_id);
  select * into cur from public.schedule_versions x where x.project_id = p_project_id and x.status = 'current';
  return query
    select v_today, cur.id, cur.number, cur.data_date, (v_today - cur.data_date)::int,
           coalesce(v_today - cur.data_date > 35, false),
           case when public.has_capability(p_project_id, 'schedule.manage')
                then (select count(*)::int from public.schedule_versions x
                       where x.project_id = p_project_id and x.status = 'draft' and x.deleted_at is null)
                else 0 end;
end;
$$;

-- For others to build on (the requirements register, reminders): the current activities starting within the next
-- p_days days (0 = today) of the job's clock, not done, by start. Runs as the caller (RLS: schedule.read); the service
-- role sees every job's.
create or replace function public.schedule_upcoming(p_project_id uuid, p_days int)
returns table (
  id uuid, version_id uuid, activity_code text, name text, wbs text, area text, trade text, start_date date,
  finish_date date, is_milestone boolean, csi_division text, days_until int
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select a.id, a.version_id, a.activity_code, a.name, a.wbs, a.area, a.trade, a.start_date, a.finish_date, a.is_milestone,
         a.csi_division, a.start_date - t.today
    from public.schedule_activities a
    join public.schedule_versions v on v.id = a.version_id
    cross join (select public.schedule_today(p_project_id) as today) t
   where v.project_id = p_project_id and v.status = 'current' and a.deleted_at is null
     and a.actual_start is null and a.actual_finish is null
     and a.start_date between t.today and t.today + least(greatest(coalesce(p_days, 0), 0), 366)
   order by a.start_date, a.sort, a.id;
$$;

-- =====================================================================================================================
-- Each morning: roll the calendar's 60-day window, and say when a schedule update is due (pg_cron)
-- =====================================================================================================================
-- p_at: the moment to check as (now, from the schedule). Once per stale version: a newer version ends it.
create or replace function public.schedule_daily(p_at timestamptz default now())
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare r record; v_n int := 0;
begin
  if not public.is_service_role() then raise exception 'forbidden' using errcode = '42501'; end if;
  for r in
    select v.id, v.project_id, v.data_date, (p_at at time zone p.timezone)::date as today
      from public.schedule_versions v
      join public.projects p on p.id = v.project_id
     where v.status = 'current' and p.deleted_at is null and 'schedule' = any (p.modules)
  loop
    perform public.schedule_calendar_sync(r.project_id, p_at);
    continue when r.today - r.data_date <= 35;
    continue when exists (select 1 from public.activity x
                           where x.project_id = r.project_id and x.kind = 'schedule.update_due' and x.entity_id = r.id);
    perform public.post_activity(r.project_id, 'schedule.update_due',
      'Schedule update due (data date ' || to_char(r.data_date, 'Mon FMDD') || ')', 'schedule_due', r.id, 'schedule.read');
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

select cron.schedule('schedule-daily', '13 13 * * *', $$select public.schedule_daily()$$);

-- =====================================================================================================================
-- Grants
-- =====================================================================================================================
do $$
declare f text;
begin
  foreach f in array array[
    'public.schedule_folder(uuid)',
    'public.schedule_import_draft(uuid, uuid, text, text, date, text, text, text[], jsonb)',
    'public.schedule_draft_save(uuid, integer, text, date)',
    'public.schedule_activity_save(uuid, integer, text, text, text, text, text, date, date, boolean)',
    'public.schedule_activity_remove(uuid, boolean)',
    'public.schedule_discard(uuid, boolean)',
    'public.schedule_publish(uuid, integer)',
    'public.schedule_unpublish(uuid)',
    'public.schedule_versions_list(uuid)',
    'public.schedule_version(uuid)',
    'public.schedule_current(uuid)',
    'public.schedule_status(uuid)',
    'public.schedule_upcoming(uuid, integer)',
    -- In schedule_upcoming, which runs as the caller.
    'public.schedule_today(uuid, timestamp with time zone)']
  loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
  foreach f in array array[
    'public.schedule_daily(timestamp with time zone)', 'public.schedule_folder_make(uuid)',
    'public.schedule_lines_ok(text[], integer)',
    'public.schedule_version_lock(uuid)', 'public.schedule_draft_lock(uuid)', 'public.schedule_text(text)',
    'public.schedule_calendar_sync(uuid, timestamp with time zone)']
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
  foreach f in array array['public.tg_project_schedule_module()']
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
  end loop;
end $$;
-- The replaced functions (job_rail_tools, folder_name_reserved) keep the grants they had: create or replace.
