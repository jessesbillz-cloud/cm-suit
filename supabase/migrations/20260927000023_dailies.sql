-- 0023 Daily reports (SPEC §13.1): the built-in work-log template, for anyone who writes dailies.
--   * daily_setups: one row per person per job per report type. The settings object is parsed by ONE zod schema
--     (supabase/functions/_shared/dailies.ts) where its defaults live; SQL only reads what it needs (schedule days,
--     standing note, label, submit-by time) and never invents a default of its own.
--   * daily_reports: keyed by (job, author, report date, report type), so a super, a foreman and an inspector each file
--     their own daily on the same job and day. Numbers come from next_author_number at the first signing, never from the
--     browser; a deleted draft keeps its row (the server-side flag), is never re-made by ensure_todays_draft and never
--     uses a number. A report is submitted only with its stored PDF (a check constraint, not a promise).
--   * daily_report_photos: photos linked to a report (and optionally a work-log row), kept apart from the content so a
--     finished upload never trips the editor's version check.
--   * Submitting is two-step: begin_daily_submit (as the author, after the signing re-confirmation) numbers the report
--     and records the content hash; the submit-daily edge function renders and stores the PDF; finish_daily_submit
--     (service role only) marks it submitted with that file. A failed upload leaves the report unsubmitted.
--   * Inspections (IR results) have a reserved place in the content (content.inspections, by ref); the IR module fills it.

-- ---------------------------------------------------------------------------
-- Capabilities (data, SPEC §5.2): who writes dailies. dailies.read_all (0001) reads the job's submitted reports.
-- ---------------------------------------------------------------------------
insert into public.role_permissions (role, capability, requires_aal2) values
  ('project_admin', 'dailies.write', false), ('pm', 'dailies.write', false), ('pe', 'dailies.write', false),
  ('superintendent', 'dailies.write', false), ('foreman', 'dailies.write', false), ('inspector', 'dailies.write', false),
  ('special_inspector', 'dailies.write', false)
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.daily_setups (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  version int not null default 1,
  org_id uuid not null,
  project_id uuid not null,
  author_id uuid not null references auth.users(id),
  report_type text not null check (report_type ~ '^[a-z0-9_]{1,40}$'),
  settings jsonb not null default '{}'::jsonb check (jsonb_typeof(settings) = 'object' and octet_length(settings::text) <= 32000),
  foreign key (project_id, org_id) references public.projects (id, org_id),
  unique (project_id, author_id, report_type)
);
alter table public.daily_setups enable row level security;
create trigger touch before update on public.daily_setups for each row execute function public.tg_touch_row();

create table public.daily_reports (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  version int not null default 1,
  deleted_at timestamptz,
  org_id uuid not null,
  project_id uuid not null,
  author_id uuid not null references auth.users(id),
  report_type text not null check (report_type ~ '^[a-z0-9_]{1,40}$'),
  report_date date not null,
  status text not null default 'draft' check (status in ('draft', 'submitted')),
  number int check (number is null or number >= 1),
  -- Job info locked in when the report is made (project name/number/address, author, label, zone).
  header jsonb not null default '{}'::jsonb check (jsonb_typeof(header) = 'object'),
  content jsonb not null default '{}'::jsonb check (jsonb_typeof(content) = 'object' and octet_length(content::text) <= 1000000),
  -- Between begin_daily_submit and finish_daily_submit: the hash being signed and when.
  sign_pending_hash text,
  sign_pending_at timestamptz,
  signed_at timestamptz,
  signed_by uuid references auth.users(id),
  content_hash text,
  -- The row version right after the last submit: a later save makes version > signed_version (needs resubmitting).
  signed_version int,
  submitted_at timestamptz,
  pdf_file_id uuid references public.files(id),
  filename text check (filename is null or length(filename) between 1 and 400),
  foreign key (project_id, org_id) references public.projects (id, org_id),
  unique (project_id, author_id, report_type, report_date),
  -- Never submitted without its number, its signature and its stored PDF.
  check (status = 'draft' or (number is not null and pdf_file_id is not null and filename is not null
                               and signed_at is not null and content_hash is not null and signed_version is not null))
);
alter table public.daily_reports enable row level security;
create trigger touch before update on public.daily_reports for each row execute function public.tg_touch_row();
create trigger no_delete before delete on public.daily_reports for each row execute function public.tg_block_delete();
create unique index daily_reports_number on public.daily_reports (project_id, author_id, report_type, number) where number is not null;
create index daily_reports_project_date on public.daily_reports (project_id, report_date desc) where deleted_at is null;
insert into public.owner_lookup (entity_type, table_name, owner_column) values ('daily_report', 'daily_reports', 'author_id')
on conflict do nothing;

create table public.daily_report_photos (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  version int not null default 1,
  deleted_at timestamptz,
  org_id uuid not null,
  project_id uuid not null,
  report_id uuid not null references public.daily_reports(id),
  file_id uuid not null references public.files(id),
  -- The work-log row the photo was taken from (content.work[].key), or null for the report itself.
  row_key text check (row_key is null or length(row_key) between 1 and 64),
  caption text not null default '' check (length(caption) <= 500),
  taken_at timestamptz,
  foreign key (project_id, org_id) references public.projects (id, org_id),
  unique (report_id, file_id)
);
alter table public.daily_report_photos enable row level security;
create trigger touch before update on public.daily_report_photos for each row execute function public.tg_touch_row();
create trigger no_delete before delete on public.daily_report_photos for each row execute function public.tg_block_delete();
create index daily_report_photos_report on public.daily_report_photos (report_id);

-- Each author's subfolders: Reports/<author> (submitted PDFs) and Photos/<author> (report photos). Internal.
create table public.daily_author_folders (
  project_id uuid not null references public.projects(id),
  author_id uuid not null references auth.users(id),
  kind text not null check (kind in ('reports', 'photos')),
  folder_id uuid not null references public.folders(id),
  primary key (project_id, author_id, kind)
);
alter table public.daily_author_folders enable row level security;

revoke all on public.daily_setups, public.daily_reports, public.daily_report_photos, public.daily_author_folders
  from anon, authenticated;
grant select on public.daily_setups, public.daily_reports, public.daily_report_photos to authenticated;

-- ---------------------------------------------------------------------------
-- Row-level security. Writes happen only through the RPCs below.
-- ---------------------------------------------------------------------------
create policy "daily_setups: own" on public.daily_setups for select to authenticated
  using (author_id = auth.uid() and public.is_member(project_id));

-- Authors read their own reports; dailies.read_all reads the job's submitted ones. Nobody else.
create policy "daily_reports: author or read_all" on public.daily_reports for select to authenticated
  using (deleted_at is null and (
    (author_id = auth.uid() and public.is_member(project_id))
    or (status = 'submitted' and public.has_capability(project_id, 'dailies.read_all'))));

-- The author also sees removed photo rows (a removal after submit means the report needs resubmitting).
create policy "daily_report_photos: with the report" on public.daily_report_photos for select to authenticated
  using (exists (
    select 1 from public.daily_reports r
    where r.id = daily_report_photos.report_id and r.deleted_at is null
      and ((r.author_id = auth.uid() and public.is_member(r.project_id))
           or (daily_report_photos.deleted_at is null and r.status = 'submitted'
               and public.has_capability(r.project_id, 'dailies.read_all')))));

-- ---------------------------------------------------------------------------
-- Internal helpers (not callable by people; SECURITY DEFINER RPCs call them as the owner)
-- ---------------------------------------------------------------------------

-- The calendar date of an instant in a zone: "today" for a job is computed in the JOB's zone (SPEC §8.8).
create or replace function public.daily_local_date(p_tz text, p_at timestamptz)
returns date
language sql
stable
set search_path = public, pg_temp
as $$
  select (p_at at time zone p_tz)::date;
$$;

-- Is this day one of the setup's schedule days (0 = Sunday .. 6 = Saturday)? A missing list means no scheduled days.
create or replace function public.daily_is_scheduled(p_settings jsonb, p_day date)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select case when jsonb_typeof(p_settings->'schedule_days') = 'array' then exists (
    select 1 from jsonb_array_elements(p_settings->'schedule_days') d
    where jsonb_typeof(d) = 'number' and (d #>> '{}')::numeric = extract(dow from p_day)
  ) else false end;
$$;

-- Carryover from the previous report: work-log rows marked carry come back with hours reset (photos are linked per
-- report, so they never carry); note sections listed in carry_sections come back, and the flags stay on.
create or replace function public.daily_carryover(p_prev jsonb)
returns jsonb
language sql
immutable
set search_path = public, pg_temp
as $$
  with src as (
    select case when jsonb_typeof(p_prev->'work') = 'array' then p_prev->'work' else '[]'::jsonb end as work,
           case when jsonb_typeof(p_prev->'notes') = 'object' then p_prev->'notes' else '{}'::jsonb end as notes,
           case when jsonb_typeof(p_prev->'carry_sections') = 'array' then p_prev->'carry_sections' else '[]'::jsonb end as carry
  )
  select jsonb_build_object(
    'work', coalesce((select jsonb_agg(w || '{"hours": null}'::jsonb order by ord)
                      from src, jsonb_array_elements(src.work) with ordinality as t (w, ord)
                      where jsonb_typeof(w) = 'object' and w->>'carry' = 'true'), '[]'::jsonb),
    'notes', coalesce((select jsonb_object_agg(e.key, e.value)
                       from src, jsonb_each(src.notes) e
                       where e.key in (select jsonb_array_elements_text(src.carry))), '{}'::jsonb),
    'carry_sections', (select carry from src),
    'inspections', '[]'::jsonb)
  from src;
$$;

-- Makes one report for the setup's author and day: job info locked in, standing note filled, carryover applied.
create or replace function public.daily_make_report(p_setup public.daily_setups, p_day date)
returns uuid
language plpgsql
set search_path = public, pg_temp
as $$
declare pr public.projects; prof public.profiles; comp text; prev jsonb; new_id uuid;
begin
  select * into pr from public.projects where id = p_setup.project_id and deleted_at is null;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  select * into prof from public.profiles where user_id = p_setup.author_id;
  select coalesce(nullif(o.name, ''), prof.company, '') into comp
    from public.project_members pm left join public.orgs o on o.id = pm.member_org_id
   where pm.project_id = pr.id and pm.user_id = p_setup.author_id and pm.status = 'active'
   order by pm.created_at limit 1;
  select r.content into prev from public.daily_reports r
   where r.project_id = pr.id and r.author_id = p_setup.author_id and r.report_type = p_setup.report_type
     and r.report_date < p_day and r.deleted_at is null
   order by r.report_date desc limit 1;

  insert into public.daily_reports (org_id, project_id, author_id, report_type, report_date, header, content, created_by)
  values (pr.org_id, pr.id, p_setup.author_id, p_setup.report_type, p_day,
          jsonb_strip_nulls(jsonb_build_object(
            'project_name', pr.name, 'project_number', pr.number, 'project_address', pr.address,
            'author_name', coalesce(nullif(btrim(prof.full_name), ''), split_part(prof.email, '@', 1)),
            'author_company', comp, 'label', nullif(btrim(p_setup.settings->>'label'), ''), 'timezone', pr.timezone)),
          public.daily_carryover(prev)
            || jsonb_build_object('standing_note', coalesce(p_setup.settings->>'standing_note', '')),
          p_setup.author_id)
  on conflict (project_id, author_id, report_type, report_date) do nothing
  returning id into new_id;
  if new_id is null then  -- made a moment ago by another call: safe to repeat
    select id into new_id from public.daily_reports
     where project_id = pr.id and author_id = p_setup.author_id and report_type = p_setup.report_type and report_date = p_day;
    return new_id;
  end if;
  perform public.audit('daily.create', 'daily_report', new_id, pr.id, pr.org_id, jsonb_build_object('report_date', p_day));
  return new_id;
end;
$$;

-- Today's working copy at a given instant (ensure_todays_draft passes now(); tests pass a Pacific evening).
-- No setup yet: it is made from p_settings_if_new (the client's zod defaults), so defaults live in one place.
create or replace function public.daily_ensure_at(p_project_id uuid, p_report_type text, p_settings_if_new jsonb, p_at timestamptz)
returns uuid
language plpgsql
set search_path = public, pg_temp
as $$
declare s public.daily_setups; tz text; d date; r public.daily_reports;
begin
  if not public.has_capability(p_project_id, 'dailies.write') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_report_type is null or p_report_type !~ '^[a-z0-9_]{1,40}$' then
    raise exception 'bad report type' using errcode = '22023';
  end if;
  select * into s from public.daily_setups
   where project_id = p_project_id and author_id = auth.uid() and report_type = p_report_type;
  if not found then
    if p_settings_if_new is null or jsonb_typeof(p_settings_if_new) <> 'object' then
      raise exception 'setup_required' using errcode = 'P0002';
    end if;
    insert into public.daily_setups (org_id, project_id, author_id, report_type, settings, created_by)
    select p.org_id, p.id, auth.uid(), p_report_type, p_settings_if_new, auth.uid() from public.projects p where p.id = p_project_id
    on conflict (project_id, author_id, report_type) do nothing;
    select * into s from public.daily_setups
     where project_id = p_project_id and author_id = auth.uid() and report_type = p_report_type;
  end if;
  select timezone into tz from public.projects where id = p_project_id;
  d := public.daily_local_date(tz, p_at);
  select * into r from public.daily_reports
   where project_id = p_project_id and author_id = auth.uid() and report_type = p_report_type and report_date = d;
  if found then
    -- A deleted draft stays deleted: it is never made again on its own.
    return case when r.deleted_at is null then r.id end;
  end if;
  if not public.daily_is_scheduled(s.settings, d) then return null; end if;
  return public.daily_make_report(s, d);
end;
$$;

-- The author's subfolder under Reports or Photos, made on first use. Reports: the author and dailies.read_all read,
-- only the server writes (storeGeneratedPdf). Photos: the author writes; the job reads it like the Photos folder.
create or replace function public.daily_author_folder(p_project_id uuid, p_author uuid, p_kind text)
returns uuid
language plpgsql
set search_path = public, pg_temp
as $$
declare fid uuid; parent public.folders; base_name text; candidate text; n int := 1;
begin
  perform pg_advisory_xact_lock(hashtextextended('daily_folder:' || p_project_id || ':' || p_author || ':' || p_kind, 0));
  select d.folder_id into fid from public.daily_author_folders d
    join public.folders f on f.id = d.folder_id and f.deleted_at is null
   where d.project_id = p_project_id and d.author_id = p_author and d.kind = p_kind;
  if fid is not null then return fid; end if;

  select * into parent from public.folders
   where project_id = p_project_id and parent_id is null and kind = p_kind and deleted_at is null
   order by created_at limit 1;
  if not found then raise exception 'The job has no % folder', p_kind using errcode = 'P0002'; end if;

  select coalesce(nullif(btrim(p.full_name), ''), split_part(p.email, '@', 1), 'Author') into base_name
    from public.profiles p where p.user_id = p_author;
  base_name := left(coalesce(base_name, 'Author'), 180);
  candidate := base_name;
  while exists (select 1 from public.folders where project_id = p_project_id and parent_id = parent.id and name = candidate) loop
    n := n + 1;
    candidate := base_name || ' (' || n || ')';
  end loop;

  insert into public.folders (org_id, project_id, parent_id, name, kind, created_by)
  values (parent.org_id, p_project_id, parent.id, candidate, p_kind, p_author)
  returning id into fid;
  insert into public.folder_access (folder_id, user_id, can_read, can_write, created_by)
  values (fid, p_author, true, p_kind = 'photos', p_author);
  insert into public.folder_access (folder_id, capability, can_read, can_write, created_by)
  values (fid, 'dailies.read_all', true, false, p_author);
  if p_kind = 'photos' then
    insert into public.folder_access (folder_id, capability, can_read, can_write, created_by) values
      (fid, 'files.read_project', true, false, p_author),
      (fid, 'files.manage', true, true, p_author);
  end if;
  insert into public.daily_author_folders (project_id, author_id, kind, folder_id)
  values (p_project_id, p_author, p_kind, fid)
  on conflict (project_id, author_id, kind) do update set folder_id = excluded.folder_id;
  return fid;
end;
$$;

-- The report row for its author (for update), or an error: missing / not yours = not_found, no dailies.write = forbidden.
create or replace function public.daily_own_report(p_report_id uuid)
returns public.daily_reports
language plpgsql
set search_path = public, pg_temp
as $$
declare r public.daily_reports;
begin
  select * into r from public.daily_reports where id = p_report_id and deleted_at is null for update;
  if not found or r.author_id is distinct from auth.uid() then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if not public.has_capability(r.project_id, 'dailies.write') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return r;
end;
$$;

-- ---------------------------------------------------------------------------
-- Setup
-- ---------------------------------------------------------------------------
create or replace function public.save_daily_setup(p_project_id uuid, p_report_type text, p_settings jsonb, p_version int default null)
returns public.daily_setups
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare s public.daily_setups;
begin
  if not public.has_capability(p_project_id, 'dailies.write') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_report_type is null or p_report_type !~ '^[a-z0-9_]{1,40}$' then
    raise exception 'bad report type' using errcode = '22023';
  end if;
  if p_settings is null or jsonb_typeof(p_settings) <> 'object' then
    raise exception 'settings must be an object' using errcode = '22023';
  end if;
  if p_version is null then
    insert into public.daily_setups (org_id, project_id, author_id, report_type, settings, created_by)
    select p.org_id, p.id, auth.uid(), p_report_type, p_settings, auth.uid() from public.projects p where p.id = p_project_id
    on conflict (project_id, author_id, report_type) do nothing
    returning * into s;
    if not found then raise exception 'version_conflict' using errcode = '40001'; end if;
  else
    update public.daily_setups set settings = p_settings
     where project_id = p_project_id and author_id = auth.uid() and report_type = p_report_type and version = p_version
    returning * into s;
    if not found then raise exception 'version_conflict' using errcode = '40001'; end if;
  end if;
  return s;
end;
$$;

-- The start number continues an existing sequence (project_members.start_numbers, honored by next_author_number).
-- It can't go back to or below a number already used.
create or replace function public.set_daily_start_number(p_project_id uuid, p_report_type text, p_start int)
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_kind text := 'dailies:' || p_report_type;
begin
  if not public.has_capability(p_project_id, 'dailies.write') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_report_type is null or p_report_type !~ '^[a-z0-9_]{1,40}$' then
    raise exception 'bad report type' using errcode = '22023';
  end if;
  if p_start is null or p_start < 1 or p_start > 1000000 then
    raise exception 'Start number must be 1 or more' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('author_counter:' || p_project_id || ':' || auth.uid() || ':' || v_kind, 0));
  if exists (select 1 from public.daily_reports
             where project_id = p_project_id and author_id = auth.uid() and report_type = p_report_type and number >= p_start) then
    raise exception 'That number is already used' using errcode = '22023';
  end if;
  update public.project_members set start_numbers = start_numbers || jsonb_build_object(v_kind, p_start)
   where project_id = p_project_id and user_id = auth.uid() and status = 'active';
  insert into public.author_counters (project_id, author_id, kind, next_value)
  values (p_project_id, auth.uid(), v_kind, p_start)
  on conflict (project_id, author_id, kind) do update set next_value = excluded.next_value;
  return p_start;
end;
$$;

-- ---------------------------------------------------------------------------
-- Reports
-- ---------------------------------------------------------------------------
-- Today's working copy (in the JOB's zone) on scheduled days. Safe to call repeatedly; null when today isn't scheduled
-- or today's draft was deleted.
create or replace function public.ensure_todays_draft(p_project_id uuid, p_report_type text, p_settings_if_new jsonb default null)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  return public.daily_ensure_at(p_project_id, p_report_type, p_settings_if_new, now());
end;
$$;

-- "Past date" (and Start on a day that isn't scheduled): the report for that day, made or brought back. Not the future.
create or replace function public.create_daily_report(p_project_id uuid, p_report_type text, p_report_date date)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare s public.daily_setups; r public.daily_reports; tz text;
begin
  if not public.has_capability(p_project_id, 'dailies.write') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into s from public.daily_setups
   where project_id = p_project_id and author_id = auth.uid() and report_type = p_report_type;
  if not found then raise exception 'setup_required' using errcode = 'P0002'; end if;
  select timezone into tz from public.projects where id = p_project_id;
  if p_report_date is null or p_report_date > public.daily_local_date(tz, now()) or p_report_date < date '2000-01-01' then
    raise exception 'Pick today or an earlier day' using errcode = '22023';
  end if;
  select * into r from public.daily_reports
   where project_id = p_project_id and author_id = auth.uid() and report_type = p_report_type and report_date = p_report_date
   for update;
  if found then
    if r.deleted_at is not null then
      update public.daily_reports set deleted_at = null where id = r.id;
      perform public.audit('daily.restore', 'daily_report', r.id, r.project_id, r.org_id, '{}'::jsonb);
    end if;
    return r.id;
  end if;
  return public.daily_make_report(s, p_report_date);
end;
$$;

-- Autosave: the whole content object with a version check. Allowed after submit (the report then needs resubmitting).
create or replace function public.save_daily_content(p_report_id uuid, p_version int, p_content jsonb)
returns public.daily_reports
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare r public.daily_reports;
begin
  r := public.daily_own_report(p_report_id);
  if p_content is null or jsonb_typeof(p_content) <> 'object' then
    raise exception 'content must be an object' using errcode = '22023';
  end if;
  if r.version <> p_version then raise exception 'version_conflict' using errcode = '40001'; end if;
  update public.daily_reports set content = p_content where id = r.id returning * into r;
  return r;
end;
$$;

-- Delete a draft that was never signed. The row stays (deleted_at): it is not made again and never uses a number.
create or replace function public.delete_daily_draft(p_report_id uuid, p_version int)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare r public.daily_reports;
begin
  r := public.daily_own_report(p_report_id);
  if r.version <> p_version then raise exception 'version_conflict' using errcode = '40001'; end if;
  if r.status <> 'draft' or r.number is not null then
    raise exception 'A signed report cannot be deleted' using errcode = '22023';
  end if;
  update public.daily_reports set deleted_at = now() where id = r.id;
  perform public.audit('daily.delete', 'daily_report', r.id, r.project_id, r.org_id, jsonb_build_object('report_date', r.report_date));
end;
$$;

-- ---------------------------------------------------------------------------
-- Photos (SPEC §7.7): uploaded by the author into Photos/<author> (data/upload.ts), then linked here.
-- ---------------------------------------------------------------------------
create or replace function public.daily_photo_folder(p_project_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.has_capability(p_project_id, 'dailies.write') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return public.daily_author_folder(p_project_id, auth.uid(), 'photos');
end;
$$;

create or replace function public.add_daily_photo(p_report_id uuid, p_file_id uuid, p_row_key text, p_caption text, p_taken_at timestamptz)
returns public.daily_report_photos
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare r public.daily_reports; f public.files; ph public.daily_report_photos;
begin
  r := public.daily_own_report(p_report_id);
  select * into f from public.files
   where id = p_file_id and deleted_at is null and project_id = r.project_id and created_by = auth.uid();
  if not found then raise exception 'file not found or not yours' using errcode = 'P0002'; end if;
  if f.mime not like 'image/%' then raise exception 'Only photos can go on a report' using errcode = '22023'; end if;
  if (select count(*) from public.daily_report_photos where report_id = r.id and deleted_at is null and file_id <> f.id) >= 40 then
    raise exception 'A report holds up to 40 photos' using errcode = '22023';
  end if;
  insert into public.daily_report_photos (org_id, project_id, report_id, file_id, row_key, caption, taken_at, created_by)
  values (r.org_id, r.project_id, r.id, f.id, nullif(left(btrim(coalesce(p_row_key, '')), 64), ''),
          left(coalesce(p_caption, ''), 500), coalesce(p_taken_at, now()), auth.uid())
  on conflict (report_id, file_id) do update set deleted_at = null
    where daily_report_photos.deleted_at is not null
  returning * into ph;
  if ph.id is null then  -- already linked: safe to repeat
    select * into ph from public.daily_report_photos where report_id = r.id and file_id = f.id;
  end if;
  return ph;
end;
$$;

create or replace function public.save_daily_photo(p_photo_id uuid, p_version int, p_caption text)
returns public.daily_report_photos
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare ph public.daily_report_photos;
begin
  select * into ph from public.daily_report_photos where id = p_photo_id and deleted_at is null;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  perform public.daily_own_report(ph.report_id);
  update public.daily_report_photos set caption = left(coalesce(p_caption, ''), 500)
   where id = ph.id and version = p_version
  returning * into ph;
  if not found then raise exception 'version_conflict' using errcode = '40001'; end if;
  return ph;
end;
$$;

create or replace function public.remove_daily_photo(p_photo_id uuid, p_version int)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare ph public.daily_report_photos;
begin
  select * into ph from public.daily_report_photos where id = p_photo_id and deleted_at is null;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  perform public.daily_own_report(ph.report_id);
  update public.daily_report_photos set deleted_at = now() where id = ph.id and version = p_version;
  if not found then raise exception 'version_conflict' using errcode = '40001'; end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Submit (SPEC §6.9): begin as the author, store the PDF, finish as the server.
-- ---------------------------------------------------------------------------
-- The author's Reports/<author> folder (made on first submit); the edge function stores the PDF there.
create or replace function public.daily_reports_folder(p_project_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.has_capability(p_project_id, 'dailies.write') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return public.daily_author_folder(p_project_id, auth.uid(), 'reports');
end;
$$;

-- Numbers the report (first signing only; a resubmit keeps its number) and records the hash being signed. The version
-- and the photo list (id:version, by id) must be what the server hashed, or nothing happens.
create or replace function public.begin_daily_submit(p_report_id uuid, p_version int, p_content_hash text, p_photos_stamp text)
returns public.daily_reports
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare r public.daily_reports; stamp text; n int;
begin
  r := public.daily_own_report(p_report_id);
  if r.version <> p_version then raise exception 'version_conflict' using errcode = '40001'; end if;
  if p_content_hash is null or p_content_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'bad content hash' using errcode = '22023';
  end if;
  select coalesce(string_agg(ph.id::text || ':' || ph.version, ',' order by ph.id), '') into stamp
    from public.daily_report_photos ph where ph.report_id = r.id and ph.deleted_at is null;
  if stamp <> coalesce(p_photos_stamp, '') then
    raise exception 'version_conflict: photos changed' using errcode = '40001';
  end if;
  n := coalesce(r.number, public.next_author_number(r.project_id, 'dailies:' || r.report_type));
  update public.daily_reports set number = n, sign_pending_hash = p_content_hash, sign_pending_at = now()
   where id = r.id returning * into r;
  perform public.audit('daily.sign', 'daily_report', r.id, r.project_id, r.org_id,
    jsonb_build_object('number', n, 'report_date', r.report_date, 'report_type', r.report_type), p_content_hash);
  return r;
end;
$$;

-- Service role only (submit-daily, after storeGeneratedPdf): the report becomes submitted with its stored PDF.
create or replace function public.finish_daily_submit(p_report_id uuid, p_version int, p_content_hash text, p_file_id uuid, p_filename text)
returns public.daily_reports
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare r public.daily_reports; f public.files; resubmit boolean; label text;
begin
  if not public.is_service_role() then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into r from public.daily_reports where id = p_report_id and deleted_at is null for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if r.version <> p_version or r.sign_pending_hash is distinct from p_content_hash then
    raise exception 'version_conflict' using errcode = '40001';
  end if;
  select * into f from public.files where id = p_file_id and deleted_at is null;
  if not found or f.project_id <> r.project_id or f.created_by <> r.author_id or f.mime <> 'application/pdf'
     or not f.upload_complete
     or f.folder_id is distinct from (select folder_id from public.daily_author_folders
                                      where project_id = r.project_id and author_id = r.author_id and kind = 'reports') then
    raise exception 'That PDF is not this report''s stored PDF' using errcode = '22023';
  end if;
  resubmit := r.status = 'submitted';
  update public.daily_reports set
    status = 'submitted', signed_at = sign_pending_at, signed_by = author_id, content_hash = p_content_hash,
    pdf_file_id = f.id, filename = coalesce(filename, left(p_filename, 400)), submitted_at = coalesce(submitted_at, now()),
    signed_version = version + 1, sign_pending_hash = null, sign_pending_at = null
  where id = r.id
  returning * into r;
  label := coalesce(nullif(r.header->>'label', ''), 'Daily report');
  -- The board line (what post_activity writes), with the author as the actor.
  insert into public.activity (org_id, project_id, kind, entity_type, entity_id, summary, actor_user_id, audience_capability, created_by)
  values (r.org_id, r.project_id, case when resubmit then 'daily.resubmitted' else 'daily.submitted' end, 'daily_report', r.id,
          left(format('%s %s %s #%s for %s', coalesce(nullif(r.header->>'author_name', ''), 'Someone'),
                      case when resubmit then 'updated' else 'submitted' end, label, r.number,
                      to_char(r.report_date, 'Mon FMDD')), 500),
          r.author_id, 'dailies.read_all', r.author_id);
  perform public.audit(case when resubmit then 'daily.resubmit' else 'daily.submit' end, 'daily_report', r.id, r.project_id,
    r.org_id, jsonb_build_object('number', r.number, 'file_id', f.id, 'author', r.author_id), p_content_hash, 'system');
  return r;
end;
$$;

-- ---------------------------------------------------------------------------
-- Calendar: a draft is a "my due" line for its author at the submit-by time (project zone); gone once submitted.
-- ---------------------------------------------------------------------------
create or replace function public.tg_daily_report_calendar()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare tz text; due text; starts timestamptz;
begin
  if new.deleted_at is not null or new.status = 'submitted' then
    perform public.calendar_unmirror('daily_report', new.id);
    return null;
  end if;
  select timezone into tz from public.projects where id = new.project_id;
  select s.settings->>'submit_by' into due from public.daily_setups s
   where s.project_id = new.project_id and s.author_id = new.author_id and s.report_type = new.report_type;
  if due ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
    starts := (new.report_date + due::time) at time zone tz;
  else
    starts := new.report_date::timestamp at time zone tz;
  end if;
  perform public.calendar_mirror('daily_report', new.id, new.project_id, 'my_due',
    coalesce(nullif(new.header->>'label', ''), 'Daily report'), starts, null,
    not coalesce(due ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$', false), 'pending', 'dailies.write', new.author_id);
  return null;
end;
$$;
create trigger daily_calendar after insert or update of status, deleted_at on public.daily_reports
  for each row execute function public.tg_daily_report_calendar();

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke execute on function public.daily_local_date(text, timestamptz) from public, anon, authenticated;
revoke execute on function public.daily_is_scheduled(jsonb, date) from public, anon, authenticated;
revoke execute on function public.daily_carryover(jsonb) from public, anon, authenticated;
revoke execute on function public.daily_make_report(public.daily_setups, date) from public, anon, authenticated;
revoke execute on function public.daily_ensure_at(uuid, text, jsonb, timestamptz) from public, anon, authenticated;
revoke execute on function public.daily_author_folder(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.daily_own_report(uuid) from public, anon, authenticated;
revoke execute on function public.tg_daily_report_calendar() from public, anon, authenticated;
revoke execute on function public.finish_daily_submit(uuid, int, text, uuid, text) from public, anon, authenticated;
grant execute on function public.finish_daily_submit(uuid, int, text, uuid, text) to service_role;

revoke execute on function public.save_daily_setup(uuid, text, jsonb, int) from public, anon;
revoke execute on function public.set_daily_start_number(uuid, text, int) from public, anon;
revoke execute on function public.ensure_todays_draft(uuid, text, jsonb) from public, anon;
revoke execute on function public.create_daily_report(uuid, text, date) from public, anon;
revoke execute on function public.save_daily_content(uuid, int, jsonb) from public, anon;
revoke execute on function public.delete_daily_draft(uuid, int) from public, anon;
revoke execute on function public.daily_photo_folder(uuid) from public, anon;
revoke execute on function public.add_daily_photo(uuid, uuid, text, text, timestamptz) from public, anon;
revoke execute on function public.save_daily_photo(uuid, int, text) from public, anon;
revoke execute on function public.remove_daily_photo(uuid, int) from public, anon;
revoke execute on function public.daily_reports_folder(uuid) from public, anon;
revoke execute on function public.begin_daily_submit(uuid, int, text, text) from public, anon;
grant execute on function public.save_daily_setup(uuid, text, jsonb, int) to authenticated, service_role;
grant execute on function public.set_daily_start_number(uuid, text, int) to authenticated, service_role;
grant execute on function public.ensure_todays_draft(uuid, text, jsonb) to authenticated, service_role;
grant execute on function public.create_daily_report(uuid, text, date) to authenticated, service_role;
grant execute on function public.save_daily_content(uuid, int, jsonb) to authenticated, service_role;
grant execute on function public.delete_daily_draft(uuid, int) to authenticated, service_role;
grant execute on function public.daily_photo_folder(uuid) to authenticated, service_role;
grant execute on function public.add_daily_photo(uuid, uuid, text, text, timestamptz) to authenticated, service_role;
grant execute on function public.save_daily_photo(uuid, int, text) to authenticated, service_role;
grant execute on function public.remove_daily_photo(uuid, int) to authenticated, service_role;
grant execute on function public.daily_reports_folder(uuid) to authenticated, service_role;
grant execute on function public.begin_daily_submit(uuid, int, text, text) to authenticated, service_role;
