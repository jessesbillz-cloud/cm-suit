-- 0052 Permits for the authority having jurisdiction (Jesse, Sep 30 / Oct 1: "a permit section and a permit log ...
-- intake ... a bunch of different stages that permitting is going through ... If you are an authority having
-- jurisdiction, then you would have access to the permitting features"). Version 1, beside the agency's own system of
-- record (OSFM: GOVmotus and ProjectDox): the official's working log, review cycles, comments and linked inspections.
-- The agency's numbers are typed in, never computed.
--   * Role 'ahj' ("Fire / building official") as data, with its recommended rail. Capabilities (rows; Jesse approves
--     the matrix before this is applied): permits.read, permits.manage (the official only), permits.respond (the
--     design team, and inspector_admin as the project admin's twin), plus what the official needs on the job:
--     ir.view_all, ir.decide, files.read_project, calendar.read, members.view.
--   * Module 'permits': on for construction / closeout jobs (existing ones too), like RFIs (0038); a tool under a
--     job's name on the rail (job_rail_tools).
--   * permits: one per agency permit (primary number, other numbers, what it covers, kind), its stage (OSFM's names,
--     in order: draft, submitted, accepted or rejected, in_review, comments_out, backcheck, issued, inspections,
--     approved, complete; cancelled from anywhere), who handles it, issued / expires (12 months from issue,
--     editable) and extensions (0 to 2).
--   * permit_stage_events: every move, written only by the move RPCs. Days at each stage come from these
--     (permit_progress, the job's clock, like rfi_progress 0049). An Undo marks the move undone (it never deletes).
--   * permit_reviews: review cycles (1, 2, ... from next_number), at most one open at a time. permit_comments: the
--     official's comments on a cycle (sheet, detail, code reference), numbered per permit by next_number, answered by
--     the design team, closed by the official.
--   * inspection_requests.permit_id: an inspection request may name the permit it is for (same job, enforced by a
--     foreign key on (permit_id, project_id)); set with set_request_permit.
--   * Deny by default: people read through RLS (permits.read) and write only through the SECURITY DEFINER RPCs
--     below (identity from auth.uid()). Board lines: stage moves to the project team (permits.read), each new comment
--     to the design team (permits.respond), each answer back to the official. An issued permit's expiry date is a
--     milestone on the calendar for permits.read.

-- ---------------------------------------------------------------------------------------------------------------------
-- The role and its capabilities, as data
-- ---------------------------------------------------------------------------------------------------------------------
insert into public.roles (name, description, recommended_tools)
values ('ahj', 'Fire / building official', '{board,calendar,permits,inspections,files}');

insert into public.role_permissions (role, capability, requires_aal2) values
  -- Who sees the job's permits.
  ('ahj', 'permits.read', false), ('project_admin', 'permits.read', false), ('pm', 'permits.read', false),
  ('pe', 'permits.read', false), ('superintendent', 'permits.read', false), ('inspector', 'permits.read', false),
  ('inspector_admin', 'permits.read', false), ('owner_rep', 'permits.read', false), ('architect', 'permits.read', false),
  -- The official: new permits, stage moves, reviews, comments, closing them, linking inspections.
  ('ahj', 'permits.manage', false),
  -- The design team answers comments. inspector_admin is the inspector plus the project admin (0044), so it follows
  -- the project admin here.
  ('architect', 'permits.respond', false), ('pm', 'permits.respond', false), ('pe', 'permits.respond', false),
  ('project_admin', 'permits.respond', false), ('inspector_admin', 'permits.respond', false),
  -- What the official needs on the job: its inspections (and deciding them), its files, its calendar, its people.
  ('ahj', 'ir.view_all', false), ('ahj', 'ir.decide', false), ('ahj', 'files.read_project', false),
  ('ahj', 'calendar.read', false), ('ahj', 'members.view', false)
on conflict do nothing;

-- ---------------------------------------------------------------------------------------------------------------------
-- Module and rail
-- ---------------------------------------------------------------------------------------------------------------------
create or replace function public.tg_project_field_modules()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.stage in ('construction', 'closeout')
     and (tg_op = 'INSERT' or old.stage is distinct from new.stage and old.stage not in ('construction', 'closeout')) then
    new.modules := array(select distinct m from unnest(new.modules
      || '{files,calendar,dailies,inspections,rfis,deliveries,corrections,permits}'::text[]) m order by m);
  end if;
  return new;
end;
$$;
revoke execute on function public.tg_project_field_modules() from public, anon, authenticated;

update public.projects
   set modules = array(select distinct m from unnest(modules || '{permits}'::text[]) m order by m)
 where stage in ('construction', 'closeout') and not ('permits' = any (modules));

-- Same as 0051 plus Permits after RFIs (lib/jobs JOB_TOOLS mirrors it).
create or replace function public.job_rail_tools()
returns text[]
language sql
immutable
set search_path = public, pg_temp
as $$
  select '{files,bids,dailies,inspections,rfis,permits,deliveries,corrections,people,hours}'::text[];
$$;

-- ---------------------------------------------------------------------------------------------------------------------
-- Stages: the one place their order, their words (board lines) and the allowed moves live in the database
-- ---------------------------------------------------------------------------------------------------------------------
-- Place on the tracker (1..10); rejected sits where accepted does; cancelled has none.
create or replace function public.permit_stage_pos(p_stage text)
returns int
language sql
immutable
set search_path = public, pg_temp
as $$
  select case p_stage
    when 'draft' then 1 when 'submitted' then 2 when 'accepted' then 3 when 'rejected' then 3 when 'in_review' then 4
    when 'comments_out' then 5 when 'backcheck' then 6 when 'issued' then 7 when 'inspections' then 8
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
    when 'backcheck' then 'Backcheck' when 'issued' then 'Issued' when 'inspections' then 'Inspections'
    when 'approved' then 'Approved' when 'complete' then 'Complete' when 'cancelled' then 'Cancelled' else p_stage end;
$$;

-- Where a permit may go next, the usual next stage first (the app's primary button). Cancel from anywhere but the end;
-- rejected only from submitted (and back to submitted when resubmitted); a backcheck goes back to review or out with
-- comments, or straight to issue; nothing skips to complete.
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
    when 'issued' then '{inspections,cancelled}'
    when 'inspections' then '{approved,cancelled}'
    when 'approved' then '{complete,cancelled}'
    else '{}' end;
$$;

-- Other agency numbers: up to 10, each 1 to 60 characters, no blanks.
create or replace function public.permit_numbers_ok(p_numbers text[])
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select p_numbers is not null and coalesce(array_ndims(p_numbers), 1) = 1 and cardinality(p_numbers) <= 10
     and not exists (select 1 from unnest(p_numbers) n where n is null or length(btrim(n)) not between 1 and 60);
$$;

-- "Permit 24-0001", for board lines and the calendar.
create or replace function public.permit_label(p_number text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select 'Permit ' || btrim(p_number);
$$;

-- ---------------------------------------------------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------------------------------------------------
create table public.permits (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id),
  version int not null default 1,
  deleted_at timestamptz,
  org_id uuid not null,
  project_id uuid not null,
  -- The agency's numbers, typed (e.g. "24-0001"); the primary one sorts the log.
  primary_number text not null check (length(btrim(primary_number)) between 1 and 60),
  agency_numbers text[] not null default '{}' check (public.permit_numbers_ok(agency_numbers)),
  title text not null check (length(btrim(title)) between 1 and 200),
  kind text not null default 'building'
    check (kind in ('building', 'deferred_fire_alarm', 'deferred_sprinkler', 'deferred_errcs', 'addendum', 'change_order',
                    'other')),
  stage text not null default 'draft'
    check (stage in ('draft', 'submitted', 'accepted', 'rejected', 'in_review', 'comments_out', 'backcheck', 'issued',
                     'inspections', 'approved', 'complete', 'cancelled')),
  stage_since timestamptz not null default now(),
  -- The official who handles it (an active member holding permits.manage when set).
  assigned_to uuid references auth.users(id),
  issued_on date,
  expires_on date,
  extensions int not null default 0 check (extensions between 0 and 2),
  notes text not null default '' check (length(notes) <= 4000),
  -- permit_create's p_key: a repeat returns the same row.
  request_key uuid,
  foreign key (project_id, org_id) references public.projects (id, org_id),
  unique (id, project_id),
  unique (created_by, request_key),
  check (expires_on is null or issued_on is null or expires_on >= issued_on)
);
alter table public.permits enable row level security;
-- One permit per number on a job (the database owns duplicates).
create unique index permits_number on public.permits (project_id, lower(btrim(primary_number))) where deleted_at is null;
create index permits_project on public.permits (project_id) where deleted_at is null;
insert into public.owner_lookup (entity_type, table_name, owner_column) values ('permit', 'permits', 'created_by')
on conflict do nothing;

create table public.permit_stage_events (
  id bigint generated always as identity primary key,
  permit_id uuid not null references public.permits(id),
  project_id uuid not null,
  org_id uuid not null,
  stage text not null,
  at timestamptz not null default now(),
  actor uuid references auth.users(id),
  note text check (note is null or length(note) <= 1000),
  -- The issue dates before this move, so an Undo puts them back.
  prior jsonb not null default '{}'::jsonb,
  undone_at timestamptz,
  undone_by uuid references auth.users(id),
  check ((undone_at is null) = (undone_by is null))
);
alter table public.permit_stage_events enable row level security;
create index permit_stage_events_permit on public.permit_stage_events (permit_id, id);

create table public.permit_reviews (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id),
  version int not null default 1,
  permit_id uuid not null references public.permits(id),
  project_id uuid not null,
  org_id uuid not null,
  -- next_number(project, 'permit_review:<permit>'): 1, 2, ...
  cycle int not null check (cycle > 0),
  kind text not null check (kind in ('initial', 'backcheck', 'deferred', 'addendum', 'change_order')),
  received_on date not null,
  returned_on date,
  outcome text check (outcome in ('approved', 'approved_as_noted', 'revise_resubmit', 'rejected')),
  request_key uuid,
  unique (permit_id, cycle),
  unique (created_by, request_key),
  check ((outcome is null) = (returned_on is null)),
  check (returned_on is null or returned_on >= received_on)
);
alter table public.permit_reviews enable row level security;
-- One open review at a time.
create unique index permit_reviews_open on public.permit_reviews (permit_id) where outcome is null;

create table public.permit_comments (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id),
  version int not null default 1,
  permit_id uuid not null references public.permits(id),
  project_id uuid not null,
  org_id uuid not null,
  review_id uuid not null references public.permit_reviews(id),
  -- next_number(project, 'permit_comment:<permit>'): one sequence per permit, across its cycles.
  number int not null check (number > 0),
  sheet text not null default '' check (length(sheet) <= 40),
  detail text not null default '' check (length(detail) <= 40),
  code_ref text not null default '' check (length(code_ref) <= 80),
  body text not null check (length(btrim(body)) between 1 and 4000),
  response text check (response is null or length(btrim(response)) between 1 and 4000),
  responded_by uuid references auth.users(id),
  responded_at timestamptz,
  status text not null default 'open' check (status in ('open', 'closed')),
  closed_cycle int,
  closed_by uuid references auth.users(id),
  closed_at timestamptz,
  request_key uuid,
  unique (permit_id, number),
  unique (created_by, request_key),
  check ((response is null) = (responded_at is null)),
  check ((status = 'closed') = (closed_at is not null))
);
alter table public.permit_comments enable row level security;
create index permit_comments_review on public.permit_comments (review_id, number);

-- An inspection request may name its permit, on the same job.
alter table public.inspection_requests add column permit_id uuid;
alter table public.inspection_requests add constraint inspection_requests_permit_id_project_id_fkey
  foreign key (permit_id, project_id) references public.permits (id, project_id);
create index inspection_requests_permit on public.inspection_requests (permit_id) where permit_id is not null;

-- ---------------------------------------------------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------------------------------------------------
create or replace function public.tg_permit_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.project_id <> old.project_id or new.org_id <> old.org_id or new.created_by <> old.created_by then
    raise exception 'A permit stays on its job.' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke execute on function public.tg_permit_guard() from public, anon, authenticated;

-- A move is history: only its Undo mark may be set, once; it is never deleted.
create or replace function public.tg_permit_event_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' or old.undone_at is not null
     or (to_jsonb(new) - array['undone_at', 'undone_by']) is distinct from (to_jsonb(old) - array['undone_at', 'undone_by']) then
    raise exception 'A stage move is history.' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke execute on function public.tg_permit_event_guard() from public, anon, authenticated;

-- An issued permit's expiry is a milestone on the job's calendar for everyone who reads permits; otherwise none.
create or replace function public.tg_permit_calendar()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_tz text;
begin
  if new.expires_on is not null and new.deleted_at is null and new.stage in ('issued', 'inspections') then
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
revoke execute on function public.tg_permit_calendar() from public, anon, authenticated;

create trigger touch before update on public.permits for each row execute function public.tg_touch_row();
create trigger permit_guard before update on public.permits for each row execute function public.tg_permit_guard();
create trigger no_delete before delete on public.permits for each row execute function public.tg_block_delete();
create trigger audit_row after insert or update on public.permits for each row execute function public.tg_audit_row();
create trigger permit_calendar after insert or update of expires_on, stage, deleted_at, title, primary_number
  on public.permits for each row execute function public.tg_permit_calendar();

create trigger event_guard before update or delete on public.permit_stage_events
  for each row execute function public.tg_permit_event_guard();

create trigger touch before update on public.permit_reviews for each row execute function public.tg_touch_row();
create trigger no_delete before delete on public.permit_reviews for each row execute function public.tg_block_delete();

create trigger touch before update on public.permit_comments for each row execute function public.tg_touch_row();
create trigger no_delete before delete on public.permit_comments for each row execute function public.tg_block_delete();

-- ---------------------------------------------------------------------------------------------------------------------
-- RLS: read only, for permits.read; every write is an RPC below
-- ---------------------------------------------------------------------------------------------------------------------
create policy "permits: permits.read" on public.permits for select to authenticated
  using (deleted_at is null and public.has_capability(project_id, 'permits.read'));
create policy "permit_stage_events: with the permit" on public.permit_stage_events for select to authenticated
  using (public.has_capability(project_id, 'permits.read')
         and exists (select 1 from public.permits p where p.id = permit_stage_events.permit_id));
create policy "permit_reviews: with the permit" on public.permit_reviews for select to authenticated
  using (public.has_capability(project_id, 'permits.read')
         and exists (select 1 from public.permits p where p.id = permit_reviews.permit_id));
create policy "permit_comments: with the permit" on public.permit_comments for select to authenticated
  using (public.has_capability(project_id, 'permits.read')
         and exists (select 1 from public.permits p where p.id = permit_comments.permit_id));

revoke all on public.permits, public.permit_stage_events, public.permit_reviews, public.permit_comments
  from anon, authenticated;
grant select on public.permits, public.permit_stage_events, public.permit_reviews, public.permit_comments to authenticated;
grant select, insert, update on public.permits, public.permit_stage_events, public.permit_reviews, public.permit_comments
  to service_role;
revoke all on sequence public.permit_stage_events_id_seq from anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------------
-- Internal helpers (not user-callable)
-- ---------------------------------------------------------------------------------------------------------------------
-- Today on the job's clock.
create or replace function public.permit_today(p_project_id uuid)
returns date
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select (now() at time zone coalesce((select timezone from public.projects where id = p_project_id), 'UTC'))::date;
$$;

-- The permit, locked, if the caller may read it; version-checked when a version is given.
create or replace function public.permit_lock(p_permit_id uuid, p_version int)
returns public.permits
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare r public.permits;
begin
  select * into r from public.permits where id = p_permit_id and deleted_at is null for update;
  if r.id is null or not public.has_capability(r.project_id, 'permits.read') then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if p_version is not null and r.version <> p_version then
    raise exception 'version_conflict: expected %, found %', p_version, r.version using errcode = '40001';
  end if;
  return r;
end;
$$;

-- An active member of the job holding permits.manage (who may be assigned a permit).
create or replace function public.permit_official_ok(p_project_id uuid, p_person uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p_person is null or p_person = any (public.rfi_users_with_cap(p_project_id, 'permits.manage'));
$$;

-- The typed fields, checked and tidied: the other numbers trimmed, without blanks, repeats or the primary number.
create or replace function public.permit_clean_numbers(p_primary text, p_numbers text[])
returns text[]
language sql
immutable
set search_path = public, pg_temp
as $$
  select coalesce(array_agg(n order by o), '{}'::text[])
    from (select btrim(x) as n, min(o) as o
            from unnest(coalesce(p_numbers, '{}'::text[])) with ordinality as t (x, o)
           where x is not null and btrim(x) <> '' and lower(btrim(x)) <> lower(btrim(coalesce(p_primary, '')))
           group by btrim(x)) s;
$$;

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
  if p_kind is null or p_kind not in ('building', 'deferred_fire_alarm', 'deferred_sprinkler', 'deferred_errcs', 'addendum',
                                      'change_order', 'other') then
    raise exception 'Unknown kind.' using errcode = '22023';
  end if;
  if length(coalesce(p_notes, '')) > 4000 then raise exception 'Keep the notes to 4000 characters.' using errcode = '22023'; end if;
end;
$$;

-- "Permit 24-0001 is already on this job."
create or replace function public.permit_number_free(p_project_id uuid, p_number text, p_except uuid)
returns void
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if exists (select 1 from public.permits p
              where p.project_id = p_project_id and p.deleted_at is null and p.id is distinct from p_except
                and lower(btrim(p.primary_number)) = lower(btrim(p_number))) then
    -- 22023, not 23505, so the app shows these words (the unique index still stands behind it).
    raise exception '% is already on this job.', public.permit_label(p_number) using errcode = '22023';
  end if;
end;
$$;

-- A board line for some people, skipping the caller and anyone off the job (rfi_tell's rule).
create or replace function public.permit_tell(p_permit public.permits, p_kind text, p_summary text, p_people uuid[])
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_to uuid[];
begin
  v_to := array(select distinct x from unnest(coalesce(p_people, '{}'::uuid[])) x
                 where x is not null and x is distinct from auth.uid() and public.rfi_active_member(p_permit.project_id, x));
  if cardinality(v_to) > 0 then
    perform public.post_activity(p_permit.project_id, p_kind, left(p_summary, 500), 'permit', p_permit.id, null, v_to);
  end if;
end;
$$;

-- The official on it: the assigned one while they handle permits on the job, else everyone who does.
create or replace function public.permit_officials(p_project_id uuid, p_assigned_to uuid)
returns uuid[]
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case when p_assigned_to is not null and p_assigned_to = any (public.rfi_users_with_cap(p_project_id, 'permits.manage'))
              then array[p_assigned_to]
              else public.rfi_users_with_cap(p_project_id, 'permits.manage') end;
$$;

-- The latest review cycle of a permit (0 before the first).
create or replace function public.permit_cycle(p_permit_id uuid)
returns int
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(max(cycle), 0) from public.permit_reviews where permit_id = p_permit_id;
$$;

-- ---------------------------------------------------------------------------------------------------------------------
-- Permits: new, edit, move, undo
-- ---------------------------------------------------------------------------------------------------------------------
create or replace function public.permit_create(
  p_project_id uuid,
  p_primary_number text,
  p_title text,
  p_kind text default 'building',
  p_agency_numbers text[] default '{}',
  p_assigned_to uuid default null,
  p_notes text default '',
  p_stage text default 'draft',
  p_key uuid default null
)
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
  if public.permit_stage_pos(v_stage) is null or v_stage = 'rejected' then
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

-- The official edits the typed fields: the whole content each time. An unchanged save returns the row as is.
create or replace function public.permit_update(
  p_permit_id uuid,
  p_version int,
  p_primary_number text,
  p_title text,
  p_kind text,
  p_agency_numbers text[],
  p_assigned_to uuid,
  p_issued_on date,
  p_expires_on date,
  p_extensions int,
  p_notes text
)
returns public.permits
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare r public.permits; v_numbers text[];
begin
  r := public.permit_lock(p_permit_id, p_version);
  if not public.has_capability(r.project_id, 'permits.manage') then raise exception 'forbidden' using errcode = '42501'; end if;
  perform public.permit_check(p_primary_number, p_agency_numbers, p_title, p_kind, p_notes);
  if p_extensions is null or p_extensions not between 0 and 2 then
    raise exception 'Up to two extensions.' using errcode = '22023';
  end if;
  if p_expires_on is not null and p_issued_on is not null and p_expires_on < p_issued_on then
    raise exception 'It can''t expire before it was issued.' using errcode = '22023';
  end if;
  if p_assigned_to is distinct from r.assigned_to and not public.permit_official_ok(r.project_id, p_assigned_to) then
    raise exception 'Pick someone on this job who handles permits.' using errcode = '22023';
  end if;
  v_numbers := public.permit_clean_numbers(p_primary_number, p_agency_numbers);
  if (btrim(p_primary_number), v_numbers, btrim(p_title), p_kind, p_assigned_to, p_issued_on, p_expires_on, p_extensions,
      btrim(coalesce(p_notes, '')))
     is not distinct from
     (r.primary_number, r.agency_numbers, r.title, r.kind, r.assigned_to, r.issued_on, r.expires_on, r.extensions, r.notes) then
    return r;
  end if;
  if lower(btrim(p_primary_number)) <> lower(r.primary_number) then
    perform pg_advisory_xact_lock(hashtext('permit_number:' || r.project_id::text));
    perform public.permit_number_free(r.project_id, p_primary_number, r.id);
  end if;
  update public.permits
     set primary_number = btrim(p_primary_number), agency_numbers = v_numbers, title = btrim(p_title), kind = p_kind,
         assigned_to = p_assigned_to, issued_on = p_issued_on, expires_on = p_expires_on, extensions = p_extensions,
         notes = btrim(coalesce(p_notes, ''))
   where id = r.id
   returning * into r;
  return r;
end;
$$;

-- The official moves it to a next stage (permit_next_stages). The same move again is a no-op. Issuing sets the issue
-- day (today on the job's clock) and the expiry (12 months on) when they are empty.
create or replace function public.permit_move(p_permit_id uuid, p_version int, p_stage text, p_note text default null)
returns public.permits
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare r public.permits; v_note text := nullif(btrim(coalesce(p_note, '')), ''); v_prior jsonb; v_issued date;
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

-- Undo: the caller's own last move, within 15 minutes, back to where it was (the move stays in the history, marked
-- undone, and the earlier stage's time runs on as if it never left).
create or replace function public.permit_undo_move(p_permit_id uuid, p_version int)
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
     or e.at < now() - interval '15 minutes' then
    raise exception 'That move can''t be undone now.' using errcode = '22023';
  end if;
  update public.permit_stage_events set undone_at = now(), undone_by = auth.uid() where id = e.id;
  update public.permits
     set stage = prev.stage, stage_since = prev.at,
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

-- ---------------------------------------------------------------------------------------------------------------------
-- Reviews and comments
-- ---------------------------------------------------------------------------------------------------------------------
-- A new review cycle (the official). The first is the initial review, later ones backchecks unless another kind is
-- named; received today on the job's clock unless a day is given.
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
declare r public.permits; v public.permit_reviews; v_kind text;
begin
  r := public.permit_lock(p_permit_id, null);
  if not public.has_capability(r.project_id, 'permits.manage') then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_key is not null then
    select * into v from public.permit_reviews where created_by = auth.uid() and request_key = p_key;
    if v.id is not null then return v; end if;
  end if;
  if r.stage in ('complete', 'cancelled') then raise exception 'This permit is closed.' using errcode = '22023'; end if;
  if exists (select 1 from public.permit_reviews where permit_id = r.id and outcome is null) then
    raise exception 'Close the open review first.' using errcode = '22023';
  end if;
  v_kind := coalesce(p_kind, case when public.permit_cycle(r.id) = 0 then 'initial' else 'backcheck' end);
  if v_kind not in ('initial', 'backcheck', 'deferred', 'addendum', 'change_order') then
    raise exception 'Unknown review kind.' using errcode = '22023';
  end if;
  insert into public.permit_reviews (permit_id, project_id, org_id, cycle, kind, received_on, created_by, request_key)
  values (r.id, r.project_id, r.org_id, public.next_number(r.project_id, 'permit_review:' || r.id::text), v_kind,
          coalesce(p_received_on, public.permit_today(r.project_id)), auth.uid(), p_key)
  returning * into v;
  perform public.audit('permit.review_open', 'permit_review', v.id, r.project_id, r.org_id,
                       jsonb_build_object('permit_id', r.id, 'cycle', v.cycle, 'kind', v.kind));
  return v;
end;
$$;

-- Closes a review with its outcome (returned today unless a day is given); a null outcome opens it again (Undo).
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
    if exists (select 1 from public.permit_reviews x where x.permit_id = v.permit_id and x.outcome is null) then
      raise exception 'Close the open review first.' using errcode = '22023';
    end if;
    update public.permit_reviews set outcome = null, returned_on = null where id = v.id returning * into v;
    perform public.audit('permit.review_reopen', 'permit_review', v.id, r.project_id, r.org_id,
                         jsonb_build_object('permit_id', r.id, 'cycle', v.cycle));
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
                       jsonb_build_object('permit_id', r.id, 'cycle', v.cycle, 'outcome', v.outcome));
  select count(*)::int into v_open from public.permit_comments where review_id = v.id and status = 'open';
  perform public.post_activity(r.project_id, 'permit.review',
    left(public.permit_label(r.primary_number) || ' review ' || v.cycle || ': '
         || case v.outcome when 'approved' then 'approved' when 'approved_as_noted' then 'approved as noted'
                           when 'revise_resubmit' then 'revise and resubmit' else 'rejected' end
         || case when v_open > 0 then ' (' || v_open || ' open comment' || case when v_open > 1 then 's' else '' end || ')'
                 else '' end, 500),
    'permit', r.id, 'permits.read');
  return v;
end;
$$;

-- The official's comment on the open review: sheet, detail and code reference typed, numbered by the database.
create or replace function public.permit_comment_add(
  p_review_id uuid,
  p_body text,
  p_sheet text default '',
  p_detail text default '',
  p_code_ref text default '',
  p_key uuid default null
)
returns public.permit_comments
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v public.permit_reviews; r public.permits; c public.permit_comments; v_body text := btrim(coalesce(p_body, ''));
begin
  select * into v from public.permit_reviews where id = p_review_id;
  if v.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  r := public.permit_lock(v.permit_id, null);
  if not public.has_capability(r.project_id, 'permits.manage') then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_key is not null then
    select * into c from public.permit_comments where created_by = auth.uid() and request_key = p_key;
    if c.id is not null then return c; end if;
  end if;
  if v.outcome is not null then raise exception 'This review is closed.' using errcode = '22023'; end if;
  if length(v_body) = 0 then raise exception 'Add the comment.' using errcode = '22023'; end if;
  if length(v_body) > 4000 then raise exception 'Keep the comment to 4000 characters.' using errcode = '22023'; end if;
  if length(btrim(coalesce(p_sheet, ''))) > 40 or length(btrim(coalesce(p_detail, ''))) > 40 then
    raise exception 'Keep the sheet and detail short.' using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_code_ref, ''))) > 80 then
    raise exception 'Keep the code reference to 80 characters.' using errcode = '22023';
  end if;
  insert into public.permit_comments (permit_id, project_id, org_id, review_id, number, sheet, detail, code_ref, body,
                                      created_by, request_key)
  values (r.id, r.project_id, r.org_id, v.id, public.next_number(r.project_id, 'permit_comment:' || r.id::text),
          btrim(coalesce(p_sheet, '')), btrim(coalesce(p_detail, '')), btrim(coalesce(p_code_ref, '')), v_body,
          auth.uid(), p_key)
  returning * into c;
  perform public.audit('permit.comment_add', 'permit_comment', c.id, r.project_id, r.org_id,
                       jsonb_build_object('permit_id', r.id, 'number', c.number));
  perform public.permit_tell(r, 'permit.comment',
    public.permit_label(r.primary_number) || ' comment ' || c.number
      || case when c.sheet <> '' then ' (' || c.sheet || ')' else '' end || ': ' || c.body,
    public.rfi_users_with_cap(r.project_id, 'permits.respond'));
  return c;
end;
$$;

-- The design team answers an open comment (and may reword the answer while it is open).
create or replace function public.permit_comment_respond(p_comment_id uuid, p_version int, p_response text)
returns public.permit_comments
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare c public.permit_comments; r public.permits; v_text text := btrim(coalesce(p_response, ''));
begin
  select * into c from public.permit_comments where id = p_comment_id for update;
  if c.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  r := public.permit_lock(c.permit_id, null);
  if not public.has_capability(r.project_id, 'permits.respond') then raise exception 'forbidden' using errcode = '42501'; end if;
  if c.response is not distinct from v_text then return c; end if;
  if p_version is not null and c.version <> p_version then
    raise exception 'version_conflict: expected %, found %', p_version, c.version using errcode = '40001';
  end if;
  if c.status <> 'open' then raise exception 'This comment is closed.' using errcode = '22023'; end if;
  if length(v_text) = 0 then raise exception 'Add the answer.' using errcode = '22023'; end if;
  if length(v_text) > 4000 then raise exception 'Keep the answer to 4000 characters.' using errcode = '22023'; end if;
  update public.permit_comments set response = v_text, responded_by = auth.uid(), responded_at = now()
   where id = c.id returning * into c;
  perform public.audit('permit.comment_respond', 'permit_comment', c.id, r.project_id, r.org_id,
                       jsonb_build_object('permit_id', r.id, 'number', c.number));
  perform public.permit_tell(r, 'permit.response',
    public.permit_label(r.primary_number) || ' comment ' || c.number || ' answered: ' || c.response,
    public.permit_officials(r.project_id, r.assigned_to));
  return c;
end;
$$;

-- The official closes a comment (in the latest cycle), or opens it again (p_closed false, the Undo).
create or replace function public.permit_comment_close(p_comment_id uuid, p_version int, p_closed boolean default true)
returns public.permit_comments
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare c public.permit_comments; r public.permits; v_closed boolean := coalesce(p_closed, true);
begin
  select * into c from public.permit_comments where id = p_comment_id for update;
  if c.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  r := public.permit_lock(c.permit_id, null);
  if not public.has_capability(r.project_id, 'permits.manage') then raise exception 'forbidden' using errcode = '42501'; end if;
  if (c.status = 'closed') = v_closed then return c; end if;
  if p_version is not null and c.version <> p_version then
    raise exception 'version_conflict: expected %, found %', p_version, c.version using errcode = '40001';
  end if;
  update public.permit_comments
     set status = case when v_closed then 'closed' else 'open' end,
         closed_cycle = case when v_closed then public.permit_cycle(c.permit_id) end,
         closed_by = case when v_closed then auth.uid() end, closed_at = case when v_closed then now() end
   where id = c.id
   returning * into c;
  perform public.audit(case when v_closed then 'permit.comment_close' else 'permit.comment_reopen' end, 'permit_comment',
                       c.id, r.project_id, r.org_id, jsonb_build_object('permit_id', r.id, 'number', c.number));
  return c;
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------------
-- An inspection request names its permit (or none). The official, the inspectors (ir.decide) or the requester, who
-- may read permits on the job; the permit is on the same job.
-- ---------------------------------------------------------------------------------------------------------------------
create or replace function public.set_request_permit(p_request_id uuid, p_version int, p_permit_id uuid)
returns public.inspection_requests
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare q public.inspection_requests; r public.permits;
begin
  q := public.ir_for_update(p_request_id, null);
  if not (public.has_capability(q.project_id, 'permits.manage') or public.has_capability(q.project_id, 'ir.decide')
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

-- ---------------------------------------------------------------------------------------------------------------------
-- What the app reads
-- ---------------------------------------------------------------------------------------------------------------------
-- The log: the job's permits (null = every job where I read permits: the official's whole caseload), by number.
create or replace function public.permit_list(p_project_id uuid default null)
returns table (
  id uuid, project_id uuid, project_name text, timezone text, primary_number text, agency_numbers text[], title text,
  kind text, stage text, stage_since timestamptz, assigned_to uuid, assigned_name text, issued_on date, expires_on date,
  extensions int, open_comments int, review_cycle int, version int
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.id, p.project_id, j.name, j.timezone, p.primary_number, p.agency_numbers, p.title, p.kind, p.stage, p.stage_since,
         p.assigned_to, case when p.assigned_to is not null then public.rfi_person_name(p.assigned_to) end,
         p.issued_on, p.expires_on, p.extensions,
         (select count(*)::int from public.permit_comments c where c.permit_id = p.id and c.status = 'open'),
         public.permit_cycle(p.id), p.version
    from public.permits p
    join public.projects j on j.id = p.project_id and j.deleted_at is null
   where p.deleted_at is null
     and (p_project_id is null or p.project_id = p_project_id)
     and public.has_capability(p.project_id, 'permits.read')
   order by lower(p.primary_number), j.name, p.id;
$$;

-- The official's caseload: every permit I may read, across all my jobs.
create or replace function public.my_permits()
returns table (
  id uuid, project_id uuid, project_name text, timezone text, primary_number text, agency_numbers text[], title text,
  kind text, stage text, stage_since timestamptz, assigned_to uuid, assigned_name text, issued_on date, expires_on date,
  extensions int, open_comments int, review_cycle int, version int
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select * from public.permit_list(null);
$$;

-- The tracker (Jesse, Sep 30: who had it and how long, never a "days open" column): one row per stage of every permit
-- I may read on the job (null = all my jobs; p_permit_id narrows to one), in order 1..10. state: done, current, next,
-- or failed (rejected at place 3; a cancelled permit's place where it stopped, as 'cancelled'). A complete permit is
-- done everywhere. days: the whole days it sat at that stage, every visit added up (a review loop comes back to the
-- same stages), each visit counted like rfi_progress: under 24 hours = 0, else the calendar days between in the job's
-- zone (at least 1); the current visit counts to now. Moves marked undone don't count. Null where it never was, at
-- the end (complete) and on the cancelled mark.
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
       and (p_project_id is null or p.project_id = p_project_id)
       and (p_permit_id is null or p.id = p_permit_id)
       and public.has_capability(p.project_id, 'permits.read')
  ),
  ev as (
    select e.permit_id, e.stage, e.at, s.tz,
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
      cross join unnest('{draft,submitted,accepted,in_review,comments_out,backcheck,issued,inspections,approved,complete}'::text[])
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

-- Who may be assigned a permit on the job: the members who handle permits there.
create or replace function public.permit_people(p_project_id uuid)
returns table (user_id uuid, name text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select u, public.rfi_person_name(u)
    from unnest(public.rfi_users_with_cap(p_project_id, 'permits.manage')) u
   where public.has_capability(p_project_id, 'permits.read')
   order by 2, 1;
$$;

-- One permit in full: the row, who, what I may do (and the moves open to me, the usual one first), its tracker, its
-- reviews with their comments (newest cycle first), its stage history, the inspections linked to it that I may see,
-- and, for the official, the job's requests not linked to any permit yet.
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
    'steps', coalesce((select jsonb_agg(to_jsonb(x) order by x.position) from public.permit_progress(r.project_id, r.id) x),
                      '[]'::jsonb),
    'reviews', coalesce((
      select jsonb_agg(to_jsonb(v) || jsonb_build_object('comments', coalesce((
               select jsonb_agg(to_jsonb(c) || jsonb_build_object(
                        'responded_by_name', case when c.responded_by is not null then public.rfi_person_name(c.responded_by) end)
                      order by c.number)
                 from public.permit_comments c where c.review_id = v.id), '[]'::jsonb))
             order by v.cycle desc)
        from public.permit_reviews v where v.permit_id = r.id), '[]'::jsonb),
    'events', coalesce((
      select jsonb_agg(jsonb_build_object('stage', e.stage, 'at', e.at, 'by_name',
                                          case when e.actor is not null then public.rfi_person_name(e.actor) end,
                                          'note', e.note, 'undone', e.undone_at is not null) order by e.at, e.id)
        from public.permit_stage_events e where e.permit_id = r.id), '[]'::jsonb),
    'inspections', coalesce((
      select jsonb_agg(jsonb_build_object('id', q.id, 'number', q.number, 'kind', q.kind, 'special_kind', k.name,
                                          'request_date', q.request_date, 'start_time', q.start_time, 'items', q.items,
                                          'status_key', public.ir_status_key(q.status, q.result, q.helper_id),
                                          'version', q.version)
                       order by q.request_date desc, q.number desc)
        from public.inspection_requests q
        left join public.ir_special_kinds k on k.id = q.special_kind_id
       where q.permit_id = r.id and q.deleted_at is null and (v_full or q.requested_by = auth.uid())), '[]'::jsonb),
    'linkable', case when v_link then coalesce((
      select jsonb_agg(jsonb_build_object('id', q.id, 'number', q.number, 'kind', q.kind, 'special_kind', k.name,
                                          'request_date', q.request_date, 'items', q.items, 'version', q.version)
                       order by q.request_date desc, q.number desc)
        from (select * from public.inspection_requests x
               where x.project_id = r.project_id and x.permit_id is null and x.deleted_at is null
                 and x.status <> 'withdrawn' and (v_full or x.requested_by = auth.uid())
               order by x.request_date desc, x.number desc limit 50) q
        left join public.ir_special_kinds k on k.id = q.special_kind_id), '[]'::jsonb) else '[]'::jsonb end);
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------------
-- Grants: the RPCs people call. Everything else above is internal.
-- ---------------------------------------------------------------------------------------------------------------------
do $$
declare f text;
begin
  foreach f in array array[
    'public.permit_create(uuid, text, text, text, text[], uuid, text, text, uuid)',
    'public.permit_update(uuid, integer, text, text, text, text[], uuid, date, date, integer, text)',
    'public.permit_move(uuid, integer, text, text)', 'public.permit_undo_move(uuid, integer)',
    'public.permit_review_open(uuid, text, date, uuid)', 'public.permit_review_close(uuid, integer, text, date)',
    'public.permit_comment_add(uuid, text, text, text, text, uuid)',
    'public.permit_comment_respond(uuid, integer, text)', 'public.permit_comment_close(uuid, integer, boolean)',
    'public.set_request_permit(uuid, integer, uuid)',
    'public.permit_list(uuid)', 'public.my_permits()', 'public.permit_progress(uuid, uuid)',
    'public.permit_people(uuid)', 'public.permit_detail(uuid)']
  loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
  foreach f in array array[
    'public.permit_stage_pos(text)', 'public.permit_stage_label(text)', 'public.permit_next_stages(text)',
    'public.permit_numbers_ok(text[])', 'public.permit_label(text)', 'public.permit_today(uuid)',
    'public.permit_lock(uuid, integer)', 'public.permit_official_ok(uuid, uuid)',
    'public.permit_clean_numbers(text, text[])', 'public.permit_check(text, text[], text, text, text)',
    'public.permit_number_free(uuid, text, uuid)', 'public.permit_tell(public.permits, text, text, uuid[])',
    'public.permit_officials(uuid, uuid)', 'public.permit_cycle(uuid)']
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
