-- 0021 Calendar base (SPEC §7.6, §12.3) and the field tools on the rail (§13).
-- One table holds every calendar line. Modules (inspections, deliveries, meetings, ...) mirror their rows into it
-- through calendar_mirror() from their own SECURITY DEFINER triggers, so the calendar never re-queries each module
-- and a line's audience is the module's own read capability. People add their own lines (source_type 'manual').

-- ---------------------------------------------------------------------------
-- Capabilities (data, SPEC §5.2). Bidders don't see the job calendar.
-- ---------------------------------------------------------------------------
insert into public.role_permissions (role, capability, requires_aal2) values
  ('project_admin', 'calendar.read', false), ('estimator', 'calendar.read', false), ('pm', 'calendar.read', false),
  ('pe', 'calendar.read', false), ('superintendent', 'calendar.read', false), ('foreman', 'calendar.read', false),
  ('inspector', 'calendar.read', false), ('special_inspector', 'calendar.read', false), ('sub', 'calendar.read', false),
  ('architect', 'calendar.read', false), ('owner_rep', 'calendar.read', false), ('viewer', 'calendar.read', false),
  ('project_admin', 'calendar.manage', false), ('pm', 'calendar.manage', false), ('pe', 'calendar.manage', false),
  ('superintendent', 'calendar.manage', false), ('inspector', 'calendar.manage', false), ('estimator', 'calendar.manage', false)
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- calendar_entries
-- ---------------------------------------------------------------------------
create table public.calendar_entries (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  version int not null default 1,
  deleted_at timestamptz,
  org_id uuid not null,
  project_id uuid not null,
  -- The kinds a person checks in Settings (lib/layout CALENDAR_TYPES).
  kind text not null check (kind in ('inspections', 'special_inspections', 'deliveries', 'meetings', 'pours',
                                     'milestones', 'lookahead', 'my_due')),
  -- 'manual' for lines people add; otherwise the module row this line mirrors (e.g. 'delivery', 'inspection_request').
  source_type text not null default 'manual' check (source_type ~ '^[a-z_]{1,40}$'),
  source_id uuid,
  title text not null check (length(btrim(title)) between 1 and 300),
  location text check (location is null or length(location) <= 300),
  starts_at timestamptz not null,
  ends_at timestamptz,
  all_day boolean not null default false,
  -- A lib/status key (pending, confirmed, postponed, ...) or null.
  status text check (status is null or status ~ '^[a-z_]{1,40}$'),
  -- Who sees the line: holders of this capability on the job (a module sets its own, e.g. its view-all capability).
  read_capability text not null default 'calendar.read',
  -- Set: only this person sees the line (their own due items).
  user_id uuid references auth.users(id),
  foreign key (project_id, org_id) references public.projects (id, org_id),
  check (ends_at is null or ends_at >= starts_at),
  check ((source_type = 'manual') = (source_id is null)),
  unique (source_type, source_id)
);
alter table public.calendar_entries enable row level security;
create trigger touch before update on public.calendar_entries for each row execute function public.tg_touch_row();
create trigger audit_row after insert or update on public.calendar_entries for each row execute function public.tg_audit_row();
create index calendar_entries_project_time on public.calendar_entries (project_id, starts_at);
create index calendar_entries_time on public.calendar_entries (starts_at);
insert into public.owner_lookup (entity_type, table_name) values ('calendar_entry', 'calendar_entries') on conflict do nothing;

revoke all on public.calendar_entries from anon, authenticated;
grant select on public.calendar_entries to authenticated;
grant insert (id, org_id, project_id, kind, title, location, starts_at, ends_at, all_day, created_by)
  on public.calendar_entries to authenticated;
grant update (kind, title, location, starts_at, ends_at, all_day, deleted_at) on public.calendar_entries to authenticated;

-- Deleted lines stay readable to the same audience so "Undo" can bring them back; the data layer filters them out.
create policy "calendar: audience reads" on public.calendar_entries for select to authenticated
  using (public.has_capability(project_id, read_capability) and (user_id is null or user_id = auth.uid()));
create policy "calendar: managers add lines" on public.calendar_entries for insert to authenticated
  with check (source_type = 'manual' and created_by = auth.uid() and user_id is null
              and read_capability = 'calendar.read' and status is null
              and public.has_capability(project_id, 'calendar.manage'));
create policy "calendar: managers edit lines" on public.calendar_entries for update to authenticated
  using (source_type = 'manual' and public.has_capability(project_id, 'calendar.manage'))
  with check (source_type = 'manual' and public.has_capability(project_id, 'calendar.manage'));

-- ---------------------------------------------------------------------------
-- Mirrors: called only from module triggers (SECURITY DEFINER, owned by the migration role). Not user-callable.
-- ---------------------------------------------------------------------------
create or replace function public.calendar_mirror(
  p_source_type text,
  p_source_id uuid,
  p_project_id uuid,
  p_kind text,
  p_title text,
  p_starts_at timestamptz,
  p_ends_at timestamptz default null,
  p_all_day boolean default false,
  p_status text default null,
  p_read_capability text default 'calendar.read',
  p_visible_to uuid default null,
  p_location text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_org uuid; v_id uuid;
begin
  if p_source_type = 'manual' or p_source_id is null then
    raise exception 'calendar_mirror needs a module source' using errcode = '22023';
  end if;
  select org_id into v_org from public.projects where id = p_project_id;
  if v_org is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  insert into public.calendar_entries (org_id, project_id, kind, source_type, source_id, title, location, starts_at,
                                       ends_at, all_day, status, read_capability, user_id, created_by)
  values (v_org, p_project_id, p_kind, p_source_type, p_source_id, left(btrim(p_title), 300), p_location, p_starts_at,
          p_ends_at, coalesce(p_all_day, false), p_status, coalesce(p_read_capability, 'calendar.read'), p_visible_to, auth.uid())
  on conflict (source_type, source_id) do update
    set kind = excluded.kind, title = excluded.title, location = excluded.location, starts_at = excluded.starts_at,
        ends_at = excluded.ends_at, all_day = excluded.all_day, status = excluded.status,
        read_capability = excluded.read_capability, user_id = excluded.user_id, deleted_at = null
    where (calendar_entries.kind, calendar_entries.title, calendar_entries.location, calendar_entries.starts_at,
           calendar_entries.ends_at, calendar_entries.all_day, calendar_entries.status,
           calendar_entries.read_capability, calendar_entries.user_id, calendar_entries.deleted_at)
          is distinct from
          (excluded.kind, excluded.title, excluded.location, excluded.starts_at, excluded.ends_at, excluded.all_day,
           excluded.status, excluded.read_capability, excluded.user_id, null::timestamptz)
  returning id into v_id;
  if v_id is null then  -- nothing changed: the line is already right
    select id into v_id from public.calendar_entries where source_type = p_source_type and source_id = p_source_id;
  end if;
  return v_id;
end;
$$;
revoke execute on function public.calendar_mirror(text, uuid, uuid, text, text, timestamptz, timestamptz, boolean, text, text, uuid, text)
  from public, anon, authenticated;

create or replace function public.calendar_unmirror(p_source_type text, p_source_id uuid)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  delete from public.calendar_entries where source_type = p_source_type and source_id = p_source_id and source_type <> 'manual';
$$;
revoke execute on function public.calendar_unmirror(text, uuid) from public, anon, authenticated;

-- The job's bid time is a milestone on its calendar.
create or replace function public.tg_project_bid_due_calendar()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.bid_due_at is null then
    perform public.calendar_unmirror('project_bid_due', new.id);
  else
    perform public.calendar_mirror('project_bid_due', new.id, new.id, 'milestones', 'Bids due', new.bid_due_at);
  end if;
  return null;
end;
$$;
revoke execute on function public.tg_project_bid_due_calendar() from public, anon, authenticated;
create trigger bid_due_calendar after insert or update of bid_due_at on public.projects
  for each row execute function public.tg_project_bid_due_calendar();

select public.calendar_mirror('project_bid_due', id, id, 'milestones', 'Bids due', bid_due_at)
  from public.projects where bid_due_at is not null;

-- ---------------------------------------------------------------------------
-- Field tools (SPEC §13): a job that is being built gets them on its rail.
-- ---------------------------------------------------------------------------
create or replace function public.tg_project_field_modules()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.stage in ('construction', 'closeout')
     and (tg_op = 'INSERT' or old.stage is distinct from new.stage and old.stage not in ('construction', 'closeout')) then
    new.modules := array(select distinct m from unnest(new.modules
      || '{files,calendar,dailies,inspections,deliveries,corrections}'::text[]) m order by m);
  end if;
  return new;
end;
$$;
revoke execute on function public.tg_project_field_modules() from public, anon, authenticated;
create trigger field_modules before insert or update of stage on public.projects
  for each row execute function public.tg_project_field_modules();

update public.projects
   set modules = array(select distinct m from unnest(modules || '{files,calendar,dailies,inspections,deliveries,corrections}'::text[]) m order by m)
 where stage in ('construction', 'closeout');

-- Everyone's rail can show the field tools; a job without them hides them (railForJob).
alter table public.user_layout alter column rail_items
  set default '{board,files,bids,calendar,dailies,inspections,deliveries,corrections,people}';
update public.user_layout
   set rail_items = rail_items || array(select t from unnest('{dailies,inspections,deliveries,corrections}'::text[]) t
                                         where not t = any (rail_items))
 where not rail_items @> '{dailies,inspections,deliveries,corrections}';
