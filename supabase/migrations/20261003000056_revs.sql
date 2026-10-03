-- 0056 Revs: fire marshal inspection tracking (Jesse, Oct 2: the MDR inspection cards "in reverse": building blocks to
-- pick from in the request, each pre-filled with every step that wall system needs, so anyone can see what's left on
-- each wall at any time). On a state fire marshal job (OSFM / CSU Office of Fire Safety, "OFS") Sacramento writes the
-- job's revs: the ordered stages a fire-rated wall system must pass (Rev 0 TOW, Rev 1 HOW cavity, ...), each with its
-- items. The job sets them up once as a list; its walls ("areas", by level) each need every item of the list.
--   * Capabilities (rows; Jesse reviews the matrix Monday): revs.read for every role but the walled ones (bidders: the
--     bidder wall, role_is_walled), revs.manage provisionally for ahj, inspector and inspector_admin. Revs sits after
--     Inspections in those three roles' recommended rails.
--   * Module 'revs': on for a job being built that allows OFS requests (settings.ir_ofs_allowed), when the job reaches
--     construction / closeout or OFS is switched on (existing jobs too), so a job without OFS (a DSA job) keeps its rail
--     lean. A job tool on the rail (job_rail_tools).
--   * rev_lists (a job's list: name, phase, permit), revs (number, name), rev_items (name, company), rev_areas (the
--     walls: level, name, plan sheet), rev_marks (a wall that doesn't need an item: N/A). Read through RLS (revs.read;
--     removed rows only by revs.manage, for Undo); every write is an RPC below. Remove is a soft delete with Restore.
--   * inspection_requests.ofs_number: the OFS IR number, from next_number(job, 'ofs_ir') when any OFS request is made
--     (member form, request link or the revs request), unique per job. The database owns it like the IR number.
--   * ir_rev_items: the cells (wall x item) an OFS request asks for, one color per item (1..3, by item order), each with
--     its own result (passed / failed with why). ir_maps: the request's one map (OSFM: a plan sheet with the inspected
--     walls highlighted, three colors max, never reused): the sheet, its page, the highlighter strokes (checked here),
--     and the server-made PDF (ir-map function, ir_map_attach, service role only).
--   * rev_status(job): every wall x item of the job's lists, with its status by precedence na > passed > requested >
--     failed > open.
--   * ir_submit_ofs: the revs request. Same rules as ir_submit (OFS allowed, the notice, today or later, attachments
--     from the request folder, the first status, the 10-minute repeat, the board lines), 1 to 3 items and the walls from
--     one list; walls already passed or N/A for an item are skipped.
--   * ir_rev_results: the inspector's result per cell, the same rule as ir_set_result; the request is approved when
--     every cell passed, else not approved with the failed reasons as its note.
--   * authorize_ir_file: a request's map and its sheet download like its other files (the map is server-made; the sheet
--     was picked by someone who may read it). Also fixes a null check there: a request with no IR PDF yet let anyone
--     who sees it fetch any file of the job's request folder by id.

-- =====================================================================================================================
-- Capabilities and rails, as data
-- =====================================================================================================================
insert into public.role_permissions (role, capability, requires_aal2)
select r.name, 'revs.read', false from public.roles r where not public.role_is_walled(r.name)
on conflict do nothing;

insert into public.role_permissions (role, capability, requires_aal2) values
  ('ahj', 'revs.manage', false), ('inspector', 'revs.manage', false), ('inspector_admin', 'revs.manage', false)
on conflict do nothing;

-- Right after Inspections.
update public.roles
   set recommended_tools = recommended_tools[1:array_position(recommended_tools, 'inspections')] || '{revs}'::text[]
                           || recommended_tools[array_position(recommended_tools, 'inspections') + 1:]
 where name in ('ahj', 'inspector', 'inspector_admin')
   and 'inspections' = any (recommended_tools) and not ('revs' = any (recommended_tools));

-- =====================================================================================================================
-- Module and rail
-- =====================================================================================================================
-- Revs comes on when an OFS job (settings.ir_ofs_allowed, lib/settings) reaches construction / closeout, or a job being
-- built switches OFS on. Never taken off. Runs as the person saving the job, so builtins only.
create or replace function public.tg_project_revs_module()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.stage in ('construction', 'closeout') and coalesce((new.settings -> 'ir_ofs_allowed') = 'true'::jsonb, false)
     and not ('revs' = any (new.modules))
     and (tg_op = 'INSERT'
          or (old.stage is distinct from new.stage and old.stage not in ('construction', 'closeout'))
          or not coalesce((old.settings -> 'ir_ofs_allowed') = 'true'::jsonb, false)) then
    new.modules := array(select distinct m from unnest(new.modules || '{revs}'::text[]) m order by m);
  end if;
  return new;
end;
$$;
create trigger revs_module before insert or update of stage, settings on public.projects
  for each row execute function public.tg_project_revs_module();

update public.projects
   set modules = array(select distinct m from unnest(modules || '{revs}'::text[]) m order by m)
 where stage in ('construction', 'closeout') and coalesce((settings -> 'ir_ofs_allowed') = 'true'::jsonb, false)
   and not ('revs' = any (modules));

-- Same as 0052 plus Revs after Inspections (lib/layout RAIL_TOOLS mirrors it).
create or replace function public.job_rail_tools()
returns text[]
language sql
immutable
set search_path = public, pg_temp
as $$
  select '{files,bids,dailies,inspections,revs,rfis,permits,deliveries,corrections,people,hours}'::text[];
$$;

-- =====================================================================================================================
-- Tables
-- =====================================================================================================================
create table public.rev_lists (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id),
  version int not null default 1,
  deleted_at timestamptz,
  org_id uuid not null,
  project_id uuid not null,
  name text not null check (length(btrim(name)) between 1 and 120),
  -- e.g. "PH III" (the map's title carries it).
  phase text check (phase is null or length(btrim(phase)) between 1 and 40),
  permit_id uuid,
  position int not null default 0,
  foreign key (project_id, org_id) references public.projects (id, org_id),
  foreign key (permit_id, project_id) references public.permits (id, project_id),
  unique (id, project_id)
);
create unique index rev_lists_name on public.rev_lists (project_id, lower(btrim(name))) where deleted_at is null;

create table public.revs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id),
  version int not null default 1,
  deleted_at timestamptz,
  org_id uuid not null,
  project_id uuid not null,
  list_id uuid not null,
  number int not null check (number >= 0),
  name text not null check (length(btrim(name)) between 1 and 80),
  foreign key (project_id, org_id) references public.projects (id, org_id),
  foreign key (list_id, project_id) references public.rev_lists (id, project_id),
  unique (id, project_id)
);
create unique index revs_number on public.revs (list_id, number) where deleted_at is null;

create table public.rev_items (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id),
  version int not null default 1,
  deleted_at timestamptz,
  org_id uuid not null,
  project_id uuid not null,
  rev_id uuid not null,
  name text not null check (length(btrim(name)) between 1 and 120),
  -- Who does it ("Firestop sub"); none = the GC's.
  company text check (company is null or length(btrim(company)) between 1 and 120),
  position int not null default 0,
  foreign key (project_id, org_id) references public.projects (id, org_id),
  foreign key (rev_id, project_id) references public.revs (id, project_id),
  unique (id, project_id)
);
create index rev_items_rev on public.rev_items (rev_id);

create table public.rev_areas (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id),
  version int not null default 1,
  deleted_at timestamptz,
  org_id uuid not null,
  project_id uuid not null,
  list_id uuid not null,
  level text not null check (length(btrim(level)) between 1 and 40),
  name text not null check (length(btrim(name)) between 1 and 160),
  -- The plan sheet (a PDF in the job's files) its maps start from.
  sheet_file_id uuid references public.files(id),
  position int not null default 0,
  foreign key (project_id, org_id) references public.projects (id, org_id),
  foreign key (list_id, project_id) references public.rev_lists (id, project_id),
  unique (id, project_id)
);
create unique index rev_areas_name on public.rev_areas (list_id, lower(btrim(level)), lower(btrim(name))) where deleted_at is null;

create table public.rev_marks (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id),
  version int not null default 1,
  deleted_at timestamptz,
  org_id uuid not null,
  project_id uuid not null,
  area_id uuid not null,
  item_id uuid not null,
  kind text not null default 'na' check (kind = 'na'),
  foreign key (project_id, org_id) references public.projects (id, org_id),
  foreign key (area_id, project_id) references public.rev_areas (id, project_id),
  foreign key (item_id, project_id) references public.rev_items (id, project_id)
);
create unique index rev_marks_cell on public.rev_marks (area_id, item_id) where deleted_at is null;

-- The OFS IR number, and the key the cells and the map hang on (same job, by foreign key).
alter table public.inspection_requests add column ofs_number int check (ofs_number is null or ofs_number > 0);
alter table public.inspection_requests add constraint inspection_requests_project_id_ofs_number_key unique (project_id, ofs_number);
alter table public.inspection_requests add constraint inspection_requests_id_project_id_key unique (id, project_id);

-- The highlighter strokes of a map: up to 300, each {c: color 1..3, w: width as a fraction of the page width
-- (0.002..0.05), p: 2..2000 points [x, y] as fractions 0..1 of the page, origin top-left}. Nothing else.
create or replace function public.ir_map_strokes_ok(p_strokes jsonb)
returns boolean
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare s jsonb;
begin
  if p_strokes is null or jsonb_typeof(p_strokes) <> 'array' or jsonb_array_length(p_strokes) > 300 then return false; end if;
  for s in select value from jsonb_array_elements(p_strokes) loop
    if jsonb_typeof(s) <> 'object' then return false; end if;
    if (select array_agg(k order by k) from jsonb_object_keys(s) k) is distinct from '{c,p,w}'::text[] then return false; end if;
    if jsonb_typeof(s -> 'c') <> 'number' or jsonb_typeof(s -> 'w') <> 'number' or jsonb_typeof(s -> 'p') <> 'array' then
      return false;
    end if;
    if (s ->> 'c')::numeric not in (1, 2, 3) or (s ->> 'w')::numeric not between 0.002 and 0.05
       or jsonb_array_length(s -> 'p') not between 2 and 2000 then
      return false;
    end if;
    if exists (select 1 from jsonb_array_elements(s -> 'p') pt
                where case when jsonb_typeof(pt) <> 'array' then true
                           when jsonb_array_length(pt) <> 2 then true
                           when jsonb_typeof(pt -> 0) <> 'number' or jsonb_typeof(pt -> 1) <> 'number' then true
                           when (pt ->> 0)::numeric not between 0 and 1 then true
                           else (pt ->> 1)::numeric not between 0 and 1 end) then
      return false;
    end if;
  end loop;
  return true;
end;
$$;

create table public.ir_rev_items (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id),
  version int not null default 1,
  org_id uuid not null,
  project_id uuid not null,
  request_id uuid not null,
  area_id uuid not null,
  item_id uuid not null,
  -- One color per item on the request, by item order (lib/markup MARKUP_COLORS).
  color smallint not null check (color between 1 and 3),
  result text check (result in ('passed', 'failed')),
  result_note text check (result_note is null or length(result_note) <= 1000),
  result_at timestamptz,
  result_by uuid references auth.users(id),
  foreign key (project_id, org_id) references public.projects (id, org_id),
  foreign key (request_id, project_id) references public.inspection_requests (id, project_id),
  foreign key (area_id, project_id) references public.rev_areas (id, project_id),
  foreign key (item_id, project_id) references public.rev_items (id, project_id),
  unique (request_id, area_id, item_id),
  check ((result is null) = (result_at is null)),
  -- OSFM: a failed item says why.
  check (result is distinct from 'failed' or length(btrim(coalesce(result_note, ''))) > 0)
);
create index ir_rev_items_cell on public.ir_rev_items (area_id, item_id);
create index ir_rev_items_project on public.ir_rev_items (project_id);

create table public.ir_maps (
  request_id uuid primary key,
  org_id uuid not null,
  project_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  -- Moves with what is drawn (sheet, page, strokes) only.
  version int not null default 1,
  sheet_file_id uuid references public.files(id),
  page int not null default 1 check (page between 1 and 2000),
  strokes jsonb not null default '[]'::jsonb check (public.ir_map_strokes_ok(strokes)),
  -- The server-made PDF (ir-map); signed = it carries the deputy's signature.
  map_file_id uuid references public.files(id),
  content_hash text check (content_hash is null or content_hash ~ '^[0-9a-f]{64}$'),
  signed boolean not null default false,
  -- The PDF no longer shows the map and its request as they are.
  stale boolean not null default true,
  foreign key (project_id, org_id) references public.projects (id, org_id),
  foreign key (request_id, project_id) references public.inspection_requests (id, project_id),
  check ((map_file_id is null) = (content_hash is null)),
  check (map_file_id is not null or not signed)
);

alter table public.rev_lists enable row level security;
alter table public.revs enable row level security;
alter table public.rev_items enable row level security;
alter table public.rev_areas enable row level security;
alter table public.rev_marks enable row level security;
alter table public.ir_rev_items enable row level security;
alter table public.ir_maps enable row level security;

-- =====================================================================================================================
-- Triggers
-- =====================================================================================================================
-- A rev record stays on its job and under its parent.
create or replace function public.tg_rev_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare n jsonb := to_jsonb(new); o jsonb := to_jsonb(old); k text;
begin
  foreach k in array array['project_id', 'org_id', 'created_by', 'list_id', 'rev_id', 'area_id', 'item_id', 'request_id'] loop
    if (n -> k) is distinct from (o -> k) then
      raise exception 'A rev record stays where it was made.' using errcode = '42501';
    end if;
  end loop;
  return new;
end;
$$;

-- A map's version moves with what is drawn, not with its PDF or the stale mark.
create or replace function public.tg_ir_map_touch()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  new.version := old.version
    + case when (new.sheet_file_id, new.page, new.strokes) is distinct from (old.sheet_file_id, old.page, old.strokes)
           then 1 else 0 end;
  return new;
end;
$$;

-- Every OFS request gets its OFS IR number from the database, whichever way it came in.
create or replace function public.tg_ir_ofs_number()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.kind = 'ofs' and new.ofs_number is null then
    new.ofs_number := public.next_number(new.project_id, 'ofs_ir');
  end if;
  return new;
end;
$$;

-- What the map's title and stamp show changed: its PDF is out of date.
create or replace function public.tg_ir_map_stale()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.ir_maps set stale = true where request_id = new.id and not stale;
  return null;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['rev_lists', 'revs', 'rev_items', 'rev_areas', 'rev_marks', 'ir_rev_items'] loop
    execute format('create trigger touch before update on public.%I for each row execute function public.tg_touch_row()', t);
    execute format('create trigger rev_guard before update on public.%I for each row execute function public.tg_rev_guard()', t);
    execute format('create trigger no_delete before delete on public.%I for each row execute function public.tg_block_delete()', t);
  end loop;
  -- A request's cells are never removed: their results are audited by ir_rev_results, one line per save.
  foreach t in array array['rev_lists', 'revs', 'rev_items', 'rev_areas', 'rev_marks'] loop
    execute format('create trigger audit_row after insert or update on public.%I for each row execute function public.tg_audit_row()', t);
  end loop;
end $$;
create trigger touch before update on public.ir_maps for each row execute function public.tg_ir_map_touch();
create trigger rev_guard before update on public.ir_maps for each row execute function public.tg_rev_guard();
create trigger no_delete before delete on public.ir_maps for each row execute function public.tg_block_delete();

create trigger ir_ofs_number before insert on public.inspection_requests
  for each row execute function public.tg_ir_ofs_number();
create trigger ir_map_stale after update of request_date, items, result, signed_at, ofs_number on public.inspection_requests
  for each row
  when ((old.request_date, old.items, old.result, old.signed_at, old.ofs_number)
        is distinct from (new.request_date, new.items, new.result, new.signed_at, new.ofs_number))
  execute function public.tg_ir_map_stale();

-- =====================================================================================================================
-- RLS: read only; every write is an RPC below
-- =====================================================================================================================
create policy "rev_lists: revs.read" on public.rev_lists for select to authenticated
  using (public.has_capability(project_id, 'revs.read') and (deleted_at is null or public.has_capability(project_id, 'revs.manage')));
create policy "revs: revs.read" on public.revs for select to authenticated
  using (public.has_capability(project_id, 'revs.read') and (deleted_at is null or public.has_capability(project_id, 'revs.manage')));
create policy "rev_items: revs.read" on public.rev_items for select to authenticated
  using (public.has_capability(project_id, 'revs.read') and (deleted_at is null or public.has_capability(project_id, 'revs.manage')));
create policy "rev_areas: revs.read" on public.rev_areas for select to authenticated
  using (public.has_capability(project_id, 'revs.read') and (deleted_at is null or public.has_capability(project_id, 'revs.manage')));
create policy "rev_marks: revs.read" on public.rev_marks for select to authenticated
  using (public.has_capability(project_id, 'revs.read') and (deleted_at is null or public.has_capability(project_id, 'revs.manage')));
-- A request's cells and map: with the request (its own read rule: the requester, ir.view_all, ir.decide).
create policy "ir_rev_items: with the request" on public.ir_rev_items for select to authenticated
  using (exists (select 1 from public.inspection_requests r where r.id = ir_rev_items.request_id));
create policy "ir_maps: with the request" on public.ir_maps for select to authenticated
  using (exists (select 1 from public.inspection_requests r where r.id = ir_maps.request_id));

revoke all on public.rev_lists, public.revs, public.rev_items, public.rev_areas, public.rev_marks, public.ir_rev_items,
  public.ir_maps from public, anon, authenticated, service_role;
grant select on public.rev_lists, public.revs, public.rev_items, public.rev_areas, public.rev_marks, public.ir_rev_items,
  public.ir_maps to authenticated, service_role;

-- =====================================================================================================================
-- Internal helpers (not user-callable)
-- =====================================================================================================================
-- Typed text, tidied: trimmed, runs of white space as one space; '' for null.
create or replace function public.rev_clean(p_text text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select regexp_replace(btrim(coalesce(p_text, '')), '\s+', ' ', 'g');
$$;

create or replace function public.rev_need(p_project_id uuid, p_cap text)
returns void
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not public.has_capability(p_project_id, p_cap) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.rev_version_ok(p_have int, p_want int)
returns void
language plpgsql
immutable
set search_path = public, pg_temp
as $$
begin
  if p_want is not null and p_have <> p_want then
    raise exception 'version_conflict: expected %, found %', p_want, p_have using errcode = '40001';
  end if;
end;
$$;

-- A plan sheet: a PDF of this job the caller may read (its folder, or their own upload), not infected.
create or replace function public.rev_sheet_ok(p_project_id uuid, p_file_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (select 1 from public.files f
                  where f.id = p_file_id and f.project_id = p_project_id and f.deleted_at is null
                    and f.mime = 'application/pdf' and f.scan_status <> 'infected'
                    and public.file_may_see(f.project_id, f.created_by, f.folder_id));
$$;

create or replace function public.rev_sheet_check(p_project_id uuid, p_file_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if p_file_id is not null and not public.rev_sheet_ok(p_project_id, p_file_id) then
    raise exception 'Pick a PDF sheet from this job''s files.' using errcode = '22023';
  end if;
end;
$$;

-- A list's name, phase and permit (a permit of the same job the caller may read).
create or replace function public.rev_list_check(p_project_id uuid, p_name text, p_phase text, p_permit_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if length(public.rev_clean(p_name)) = 0 then raise exception 'Name the list.' using errcode = '22023'; end if;
  if length(public.rev_clean(p_name)) > 120 then raise exception 'Keep the name to 120 characters.' using errcode = '22023'; end if;
  if length(public.rev_clean(p_phase)) > 40 then raise exception 'Keep the phase to 40 characters.' using errcode = '22023'; end if;
  if p_permit_id is not null
     and not (public.has_capability(p_project_id, 'permits.read')
              and exists (select 1 from public.permits p
                           where p.id = p_permit_id and p.project_id = p_project_id and p.deleted_at is null)) then
    raise exception 'Pick a permit of this job.' using errcode = '22023';
  end if;
end;
$$;

-- A rev's number and name; an item's name and company; a wall's level and name.
create or replace function public.rev_rev_check(p_number int, p_name text)
returns void
language plpgsql
immutable
set search_path = public, pg_temp
as $$
begin
  if p_number is null or p_number < 0 then raise exception 'Give the rev a number, 0 or more.' using errcode = '22023'; end if;
  if length(public.rev_clean(p_name)) = 0 then raise exception 'Name the rev.' using errcode = '22023'; end if;
  if length(public.rev_clean(p_name)) > 80 then raise exception 'Keep rev names to 80 characters.' using errcode = '22023'; end if;
end;
$$;

create or replace function public.rev_item_check(p_name text, p_company text)
returns void
language plpgsql
immutable
set search_path = public, pg_temp
as $$
begin
  if length(public.rev_clean(p_name)) = 0 then raise exception 'Name the item.' using errcode = '22023'; end if;
  if length(public.rev_clean(p_name)) > 120 then raise exception 'Keep item names to 120 characters.' using errcode = '22023'; end if;
  if length(public.rev_clean(p_company)) > 120 then raise exception 'Keep the company to 120 characters.' using errcode = '22023'; end if;
end;
$$;

create or replace function public.rev_area_check(p_level text, p_name text)
returns void
language plpgsql
immutable
set search_path = public, pg_temp
as $$
begin
  if length(public.rev_clean(p_level)) = 0 then raise exception 'Name the level.' using errcode = '22023'; end if;
  if length(public.rev_clean(p_level)) > 40 then raise exception 'Keep the level to 40 characters.' using errcode = '22023'; end if;
  if length(public.rev_clean(p_name)) = 0 then raise exception 'Name the wall.' using errcode = '22023'; end if;
  if length(public.rev_clean(p_name)) > 160 then raise exception 'Keep wall names to 160 characters.' using errcode = '22023'; end if;
end;
$$;

-- The pasted legend: [{number, name, items: [{name, company}]}], up to 50 revs of up to 50 items, each number once.
create or replace function public.rev_legend_check(p_revs jsonb)
returns void
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare v jsonb; it jsonb; n int;
begin
  if jsonb_typeof(p_revs) is distinct from 'array' then raise exception 'Paste the revs again.' using errcode = '22023'; end if;
  if jsonb_array_length(p_revs) > 50 then raise exception 'Up to 50 revs.' using errcode = '22023'; end if;
  for v in select value from jsonb_array_elements(p_revs) loop
    if jsonb_typeof(v) <> 'object' or jsonb_typeof(v -> 'number') is distinct from 'number' or (v ->> 'number') !~ '^[0-9]{1,6}$' then
      raise exception 'Each rev needs a number, 0 or more.' using errcode = '22023';
    end if;
    perform public.rev_rev_check((v ->> 'number')::int, case when jsonb_typeof(v -> 'name') = 'string' then v ->> 'name' end);
    if coalesce(jsonb_typeof(v -> 'items'), 'null') not in ('array', 'null') then
      raise exception 'Paste the revs again.' using errcode = '22023';
    end if;
    if jsonb_typeof(v -> 'items') = 'array' then
      if jsonb_array_length(v -> 'items') > 50 then raise exception 'Up to 50 items in a rev.' using errcode = '22023'; end if;
    end if;
    for it in select value from jsonb_array_elements(coalesce(nullif(v -> 'items', 'null'::jsonb), '[]'::jsonb)) loop
      if jsonb_typeof(it) <> 'object' or coalesce(jsonb_typeof(it -> 'company'), 'null') not in ('string', 'null') then
        raise exception 'Paste the revs again.' using errcode = '22023';
      end if;
      perform public.rev_item_check(case when jsonb_typeof(it -> 'name') = 'string' then it ->> 'name' end, it ->> 'company');
    end loop;
  end loop;
  select count(*) - count(distinct (x ->> 'number')::int) into n from jsonb_array_elements(p_revs) x;
  if n > 0 then raise exception 'Each rev number once.' using errcode = '22023'; end if;
end;
$$;

-- "Rev 3", for the duplicate message.
create or replace function public.rev_free_number(p_list_id uuid, p_number int, p_except uuid)
returns void
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if exists (select 1 from public.revs v where v.list_id = p_list_id and v.number = p_number and v.deleted_at is null
                                           and v.id is distinct from p_except) then
    raise exception 'Rev % is already on this list.', p_number using errcode = '22023';
  end if;
end;
$$;

-- The list, locked, live, for its manager; version-checked when a version is given.
create or replace function public.rev_list_lock(p_list_id uuid, p_version int)
returns public.rev_lists
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare l public.rev_lists;
begin
  select * into l from public.rev_lists where id = p_list_id for update;
  if l.id is null or not public.has_capability(l.project_id, 'revs.read') then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  perform public.rev_need(l.project_id, 'revs.manage');
  if l.deleted_at is not null then raise exception 'This list was removed.' using errcode = '22023'; end if;
  perform public.rev_version_ok(l.version, p_version);
  return l;
end;
$$;

-- The rev, live, on a live list, for the list's manager.
create or replace function public.rev_lock(p_rev_id uuid)
returns public.revs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v public.revs;
begin
  select * into v from public.revs where id = p_rev_id for update;
  if v.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  perform public.rev_list_lock(v.list_id, null);
  if v.deleted_at is not null then raise exception 'This rev was removed.' using errcode = '22023'; end if;
  return v;
end;
$$;

-- Which table a removable kind is.
create or replace function public.rev_table(p_kind text)
returns text
language plpgsql
immutable
set search_path = public, pg_temp
as $$
begin
  return case p_kind when 'list' then 'rev_lists' when 'rev' then 'revs' when 'item' then 'rev_items' when 'area' then 'rev_areas' end;
end;
$$;

-- The OFS request's cells: each picked wall x picked item, minus those N/A or already passed; the colors 1..n by item
-- order (rev number, then the item's place), one per item.
create or replace function public.ir_ofs_cells(p_project_id uuid, p_area_ids uuid[], p_item_ids uuid[])
returns table (area_id uuid, item_id uuid, color smallint)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with open_cells as (
    select a.id as area_id, i.id as item_id, v.number, i.position, i.name
      from public.rev_areas a
      join public.rev_items i on i.id = any (p_item_ids) and i.project_id = p_project_id and i.deleted_at is null
      join public.revs v on v.id = i.rev_id and v.list_id = a.list_id
     where a.id = any (p_area_ids) and a.project_id = p_project_id and a.deleted_at is null
       and not exists (select 1 from public.rev_marks m where m.area_id = a.id and m.item_id = i.id and m.deleted_at is null)
       and not exists (select 1 from public.ir_rev_items c
                         join public.inspection_requests q on q.id = c.request_id and q.deleted_at is null and q.status <> 'withdrawn'
                        where c.area_id = a.id and c.item_id = i.id and c.result = 'passed')
  ),
  colors as (
    select d.item_id, (row_number() over (order by d.number, d.position, d.name, d.item_id))::smallint as color
      from (select distinct o.item_id, o.number, o.position, o.name from open_cells o) d
  )
  select o.area_id, o.item_id, c.color from open_cells o join colors c on c.item_id = o.item_id;
$$;

-- The picked walls and items: all live, all from one live list of this job. Returns the list.
create or replace function public.ir_ofs_list(p_project_id uuid, p_area_ids uuid[], p_item_ids uuid[])
returns uuid
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare v_lists uuid[];
begin
  if cardinality(coalesce(p_item_ids, '{}')) not between 1 and 3 or array_position(p_item_ids, null) is not null
     or cardinality(p_item_ids) <> (select count(distinct x) from unnest(p_item_ids) x) then
    raise exception 'Pick 1 to 3 items.' using errcode = '22023';
  end if;
  if cardinality(coalesce(p_area_ids, '{}')) not between 1 and 200 or array_position(p_area_ids, null) is not null
     or cardinality(p_area_ids) <> (select count(distinct x) from unnest(p_area_ids) x) then
    raise exception 'Pick 1 to 200 walls.' using errcode = '22023';
  end if;
  select array_agg(distinct x.list_id) into v_lists
    from (select a.list_id from public.rev_areas a
           where a.id = any (p_area_ids) and a.project_id = p_project_id and a.deleted_at is null
          union all
          select v.list_id from public.rev_items i join public.revs v on v.id = i.rev_id and v.deleted_at is null
           where i.id = any (p_item_ids) and i.project_id = p_project_id and i.deleted_at is null) x;
  if cardinality(v_lists) is distinct from 1
     or (select count(*) from public.rev_areas a
          where a.id = any (p_area_ids) and a.project_id = p_project_id and a.deleted_at is null) <> cardinality(p_area_ids)
     or (select count(*) from public.rev_items i join public.revs v on v.id = i.rev_id and v.deleted_at is null
          where i.id = any (p_item_ids) and i.project_id = p_project_id and i.deleted_at is null) <> cardinality(p_item_ids)
     or not exists (select 1 from public.rev_lists l where l.id = v_lists[1] and l.deleted_at is null) then
    raise exception 'Pick the walls and items from one list.' using errcode = '22023';
  end if;
  return v_lists[1];
end;
$$;

-- The request's "what to inspect": "<levels> · <items joined ' & '> · <walls>".
create or replace function public.ir_ofs_items_text(p_area_ids uuid[], p_item_ids uuid[])
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select left(
    (select string_agg(lv, ', ' order by lv) from (select distinct btrim(a.level) as lv from public.rev_areas a
                                                     where a.id = any (p_area_ids)) x)
    || ' · ' || (select string_agg(btrim(i.name), ' & ' order by v.number, i.position, i.name, i.id)
                   from public.rev_items i join public.revs v on v.id = i.rev_id where i.id = any (p_item_ids))
    || ' · ' || (select string_agg(btrim(a.name), ', ' order by btrim(a.level), a.position, a.name, a.id)
                   from public.rev_areas a where a.id = any (p_area_ids)),
    4000);
$$;

-- The map's "what": "<levels> <items joined ' & '>" (e.g. "Level 02 HOW Cavity Stuff").
create or replace function public.ir_map_what(p_request_id uuid)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select concat_ws(' ',
    (select string_agg(lv, ', ' order by lv)
       from (select distinct btrim(a.level) as lv from public.ir_rev_items c join public.rev_areas a on a.id = c.area_id
              where c.request_id = p_request_id) x),
    (select string_agg(nm, ' & ' order by color)
       from (select distinct c.color, btrim(i.name) as nm from public.ir_rev_items c join public.rev_items i on i.id = c.item_id
              where c.request_id = p_request_id) y));
$$;

-- The failed cells' reasons, one per line: "<wall> · <item>: <why>".
create or replace function public.ir_rev_failed_notes(p_request_id uuid)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select left(string_agg(btrim(a.name) || ' · ' || btrim(i.name) || ': ' || btrim(c.result_note), E'\n'
                         order by btrim(a.level), a.position, a.name, c.color), 4000)
    from public.ir_rev_items c
    join public.rev_areas a on a.id = c.area_id
    join public.rev_items i on i.id = c.item_id
   where c.request_id = p_request_id and c.result = 'failed';
$$;

-- p_results covers every cell of the request once: [{area_id, item_id, result: passed|failed, note}]; failed says why.
create or replace function public.ir_rev_results_check(p_request_id uuid, p_results jsonb)
returns void
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare e jsonb; v_uuid text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
begin
  if jsonb_typeof(p_results) is distinct from 'array' then raise exception 'Record every wall.' using errcode = '22023'; end if;
  for e in select value from jsonb_array_elements(p_results) loop
    if jsonb_typeof(e) <> 'object' or coalesce(e ->> 'area_id', '') !~ v_uuid or coalesce(e ->> 'item_id', '') !~ v_uuid then
      raise exception 'Record every wall.' using errcode = '22023';
    end if;
    if coalesce(e ->> 'result', '') not in ('passed', 'failed') then raise exception 'Unknown result.' using errcode = '22023'; end if;
    if coalesce(jsonb_typeof(e -> 'note'), 'null') not in ('string', 'null') or length(btrim(coalesce(e ->> 'note', ''))) > 1000 then
      raise exception 'Keep notes to 1000 characters.' using errcode = '22023';
    end if;
    if e ->> 'result' = 'failed' and btrim(coalesce(e ->> 'note', '')) = '' then
      raise exception 'Write why it failed.' using errcode = '22023';
    end if;
  end loop;
  if (select count(distinct ((x ->> 'area_id')::uuid, (x ->> 'item_id')::uuid)) from jsonb_array_elements(p_results) x)
       <> jsonb_array_length(p_results)
     or jsonb_array_length(p_results) <> (select count(*) from public.ir_rev_items c where c.request_id = p_request_id)
     or exists (select 1 from jsonb_array_elements(p_results) x
                 where not exists (select 1 from public.ir_rev_items c
                                    where c.request_id = p_request_id and c.area_id = (x ->> 'area_id')::uuid
                                      and c.item_id = (x ->> 'item_id')::uuid)) then
    raise exception 'Record every wall.' using errcode = '22023';
  end if;
end;
$$;

-- May the caller draw this request's map? Its requester until there is a result, or an inspector (ir.decide).
create or replace function public.ir_map_editor(p_request_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((select public.has_capability(q.project_id, 'ir.decide')
                          or (q.requested_by = auth.uid() and public.is_member(q.project_id) and q.result is null
                              and not exists (select 1 from public.ir_rev_items c
                                               where c.request_id = q.id and c.result is not null))
                     from public.inspection_requests q where q.id = p_request_id and q.deleted_at is null), false);
$$;

-- =====================================================================================================================
-- Status: every wall x item of the job's lists
-- =====================================================================================================================
-- na (marked N/A) > passed (its latest pass) > requested (on a request not withdrawn, no result yet; at = when it is
-- asked for, on the job's clock) > failed (its latest result failed; note = why) > open.
create or replace function public.rev_status(p_project_id uuid)
returns table (area_id uuid, item_id uuid, status text, request_id uuid, ir_number int, ofs_number int, at timestamptz, note text)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare v_tz text;
begin
  perform public.rev_need(p_project_id, 'revs.read');
  select timezone into v_tz from public.projects where id = p_project_id;
  return query
    with cells as (
      select a.id as aid, i.id as iid, l.position as lpos, btrim(a.level) as lvl, a.position as apos, a.name as aname,
             v.number as vnum, i.position as ipos, i.name as iname
        from public.rev_areas a
        join public.rev_lists l on l.id = a.list_id and l.deleted_at is null
        join public.revs v on v.list_id = l.id and v.deleted_at is null
        join public.rev_items i on i.rev_id = v.id and i.deleted_at is null
       where a.project_id = p_project_id and a.deleted_at is null
    ),
    live as (
      select c.area_id as aid, c.item_id as iid, c.result, c.result_at, c.result_note, c.created_at, q.id as rid,
             q.number, q.ofs_number as ofs, (q.request_date + coalesce(q.start_time, time '00:00')) at time zone v_tz as asked
        from public.ir_rev_items c
        join public.inspection_requests q on q.id = c.request_id and q.deleted_at is null and q.status <> 'withdrawn'
       where c.project_id = p_project_id
    ),
    passed as (
      select distinct on (aid, iid) * from live where result = 'passed' order by aid, iid, result_at desc, number desc
    ),
    asked as (
      select distinct on (aid, iid) * from live where result is null order by aid, iid, created_at desc, number desc
    ),
    last_result as (
      select distinct on (aid, iid) * from live where result is not null order by aid, iid, result_at desc, number desc
    )
    select c.aid, c.iid,
           case when m.id is not null then 'na' when p.rid is not null then 'passed' when q.rid is not null then 'requested'
                when f.result = 'failed' then 'failed' else 'open' end,
           case when m.id is not null then null when p.rid is not null then p.rid when q.rid is not null then q.rid
                when f.result = 'failed' then f.rid end,
           case when m.id is not null then null when p.rid is not null then p.number when q.rid is not null then q.number
                when f.result = 'failed' then f.number end,
           case when m.id is not null then null when p.rid is not null then p.ofs when q.rid is not null then q.ofs
                when f.result = 'failed' then f.ofs end,
           case when m.id is not null then m.updated_at when p.rid is not null then p.result_at when q.rid is not null then q.asked
                when f.result = 'failed' then f.result_at end,
           case when m.id is not null then null when p.rid is not null then p.result_note when q.rid is not null then null
                when f.result = 'failed' then f.result_note end
      from cells c
      left join public.rev_marks m on m.area_id = c.aid and m.item_id = c.iid and m.deleted_at is null
      left join passed p on p.aid = c.aid and p.iid = c.iid
      left join asked q on q.aid = c.aid and q.iid = c.iid
      left join last_result f on f.aid = c.aid and f.iid = c.iid
     order by c.lpos, c.lvl, c.apos, c.aname, c.aid, c.vnum, c.ipos, c.iname, c.iid;
end;
$$;

-- =====================================================================================================================
-- Setup (revs.manage)
-- =====================================================================================================================
-- A new list with its revs and items, all at once (the browser parses a pasted legend). A repeat of my own new list
-- within 10 minutes returns it; another list of that name on the job is refused.
create or replace function public.rev_list_create(p_project_id uuid, p_name text, p_phase text, p_permit_id uuid, p_revs jsonb)
returns public.rev_lists
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_uid uuid := auth.uid(); p public.projects; l public.rev_lists; v jsonb; v_rev uuid;
begin
  perform public.rev_need(p_project_id, 'revs.manage');
  select * into p from public.projects where id = p_project_id and deleted_at is null;
  if p.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not ('revs' = any (p.modules)) then raise exception 'Revs are off for this job.' using errcode = '22023'; end if;
  perform public.rev_list_check(p.id, p_name, p_phase, p_permit_id);
  perform public.rev_legend_check(coalesce(p_revs, '[]'::jsonb));
  perform pg_advisory_xact_lock(hashtext('rev_list:' || p.id::text));
  select * into l from public.rev_lists x
   where x.project_id = p.id and x.deleted_at is null and lower(btrim(x.name)) = lower(public.rev_clean(p_name));
  if l.id is not null then
    if l.created_by = v_uid and l.created_at > now() - interval '10 minutes' then return l; end if;
    raise exception 'That list is already on this job.' using errcode = '22023';
  end if;
  insert into public.rev_lists (org_id, project_id, created_by, name, phase, permit_id, position)
  values (p.org_id, p.id, v_uid, public.rev_clean(p_name), nullif(public.rev_clean(p_phase), ''), p_permit_id,
          coalesce((select max(x.position) from public.rev_lists x where x.project_id = p.id), 0) + 1)
  returning * into l;
  for v in select value from jsonb_array_elements(coalesce(p_revs, '[]'::jsonb)) loop
    insert into public.revs (org_id, project_id, created_by, list_id, number, name)
    values (p.org_id, p.id, v_uid, l.id, (v ->> 'number')::int, public.rev_clean(v ->> 'name'))
    returning id into v_rev;
    insert into public.rev_items (org_id, project_id, created_by, rev_id, name, company, position)
    select p.org_id, p.id, v_uid, v_rev, public.rev_clean(it ->> 'name'), nullif(public.rev_clean(it ->> 'company'), ''), o::int
      from jsonb_array_elements(coalesce(nullif(v -> 'items', 'null'::jsonb), '[]'::jsonb)) with ordinality as t (it, o);
  end loop;
  return l;
end;
$$;

-- The list's name, phase and permit (the whole set each time). An unchanged save returns the row as is.
create or replace function public.rev_list_save(p_id uuid, p_version int, p_name text, p_phase text, p_permit_id uuid)
returns public.rev_lists
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare l public.rev_lists; v_name text := public.rev_clean(p_name); v_phase text := nullif(public.rev_clean(p_phase), '');
begin
  l := public.rev_list_lock(p_id, p_version);
  perform public.rev_list_check(l.project_id, p_name, p_phase, case when p_permit_id is distinct from l.permit_id then p_permit_id end);
  if (v_name, v_phase, p_permit_id) is not distinct from (l.name, l.phase, l.permit_id) then return l; end if;
  if exists (select 1 from public.rev_lists x where x.project_id = l.project_id and x.deleted_at is null and x.id <> l.id
                                                and lower(btrim(x.name)) = lower(v_name)) then
    raise exception 'That list is already on this job.' using errcode = '22023';
  end if;
  update public.rev_lists set name = v_name, phase = v_phase, permit_id = p_permit_id where id = l.id returning * into l;
  return l;
end;
$$;

-- A rev on a list: p_id null = new (a repeat of the same number and name returns it).
create or replace function public.rev_save(p_list_id uuid, p_id uuid, p_version int, p_number int, p_name text)
returns public.revs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare l public.rev_lists; v public.revs; v_name text := public.rev_clean(p_name);
begin
  l := public.rev_list_lock(p_list_id, null);
  perform public.rev_rev_check(p_number, p_name);
  if p_id is null then
    select * into v from public.revs x where x.list_id = l.id and x.number = p_number and x.deleted_at is null;
    if v.id is not null and lower(btrim(v.name)) = lower(v_name) then return v; end if;
    perform public.rev_free_number(l.id, p_number, null);
    insert into public.revs (org_id, project_id, created_by, list_id, number, name)
    values (l.org_id, l.project_id, auth.uid(), l.id, p_number, v_name)
    returning * into v;
    return v;
  end if;
  select * into v from public.revs where id = p_id and list_id = l.id for update;
  if v.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v.deleted_at is not null then raise exception 'This rev was removed.' using errcode = '22023'; end if;
  perform public.rev_version_ok(v.version, p_version);
  if (p_number, v_name) is not distinct from (v.number, v.name) then return v; end if;
  perform public.rev_free_number(l.id, p_number, v.id);
  update public.revs set number = p_number, name = v_name where id = v.id returning * into v;
  return v;
end;
$$;

-- An item of a rev: p_id null = new, at the end unless a place is given (a repeat of the same name returns it).
create or replace function public.rev_item_save(p_rev_id uuid, p_id uuid, p_version int, p_name text, p_company text,
                                                p_position int)
returns public.rev_items
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v public.revs; i public.rev_items; v_name text := public.rev_clean(p_name);
        v_company text := nullif(public.rev_clean(p_company), '');
begin
  v := public.rev_lock(p_rev_id);
  perform public.rev_item_check(p_name, p_company);
  if p_id is null then
    select * into i from public.rev_items x where x.rev_id = v.id and x.deleted_at is null and lower(btrim(x.name)) = lower(v_name)
     order by x.created_at limit 1;
    if i.id is not null then return i; end if;
    insert into public.rev_items (org_id, project_id, created_by, rev_id, name, company, position)
    values (v.org_id, v.project_id, auth.uid(), v.id, v_name, v_company,
            coalesce(p_position, (select max(x.position) from public.rev_items x where x.rev_id = v.id and x.deleted_at is null), 0)
              + case when p_position is null then 1 else 0 end)
    returning * into i;
    return i;
  end if;
  select * into i from public.rev_items where id = p_id and rev_id = v.id for update;
  if i.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if i.deleted_at is not null then raise exception 'This item was removed.' using errcode = '22023'; end if;
  perform public.rev_version_ok(i.version, p_version);
  if (v_name, v_company, coalesce(p_position, i.position)) is not distinct from (i.name, i.company, i.position) then return i; end if;
  update public.rev_items set name = v_name, company = v_company, position = coalesce(p_position, i.position)
   where id = i.id returning * into i;
  return i;
end;
$$;

-- Walls on a level of a list, in the order given; a wall already there (same level and name) is returned as it is.
create or replace function public.rev_areas_add(p_list_id uuid, p_level text, p_names text[], p_sheet_file_id uuid)
returns setof public.rev_areas
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare l public.rev_lists; v_level text := public.rev_clean(p_level); v_name text; a public.rev_areas; v_pos int;
begin
  l := public.rev_list_lock(p_list_id, null);
  if cardinality(coalesce(p_names, '{}')) not between 1 and 200 then raise exception 'Add 1 to 200 walls.' using errcode = '22023'; end if;
  foreach v_name in array p_names loop perform public.rev_area_check(p_level, v_name); end loop;
  perform public.rev_sheet_check(l.project_id, p_sheet_file_id);
  select coalesce(max(x.position), 0) into v_pos from public.rev_areas x where x.list_id = l.id and x.deleted_at is null;
  -- Each name once, in the order given.
  for v_name in select d.nm
                  from (select distinct on (lower(public.rev_clean(n))) public.rev_clean(n) as nm, o
                          from unnest(p_names) with ordinality as t (n, o) order by lower(public.rev_clean(n)), o) d
                 order by d.o loop
    select * into a from public.rev_areas x
     where x.list_id = l.id and x.deleted_at is null and lower(btrim(x.level)) = lower(v_level) and lower(btrim(x.name)) = lower(v_name);
    if a.id is null then
      v_pos := v_pos + 1;
      insert into public.rev_areas (org_id, project_id, created_by, list_id, level, name, sheet_file_id, position)
      values (l.org_id, l.project_id, auth.uid(), l.id, v_level, v_name, p_sheet_file_id, v_pos)
      returning * into a;
    end if;
    return next a;
    a := null;
  end loop;
end;
$$;

-- A wall's level, name, sheet (null = none) and place (null = where it is).
create or replace function public.rev_area_save(p_id uuid, p_version int, p_level text, p_name text, p_sheet_file_id uuid,
                                                p_position int)
returns public.rev_areas
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare a public.rev_areas; v_level text := public.rev_clean(p_level); v_name text := public.rev_clean(p_name);
begin
  select * into a from public.rev_areas where id = p_id for update;
  if a.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  perform public.rev_list_lock(a.list_id, null);
  if a.deleted_at is not null then raise exception 'This wall was removed.' using errcode = '22023'; end if;
  perform public.rev_version_ok(a.version, p_version);
  perform public.rev_area_check(p_level, p_name);
  if p_sheet_file_id is distinct from a.sheet_file_id then perform public.rev_sheet_check(a.project_id, p_sheet_file_id); end if;
  if (v_level, v_name, p_sheet_file_id, coalesce(p_position, a.position)) is not distinct from (a.level, a.name, a.sheet_file_id, a.position) then
    return a;
  end if;
  if exists (select 1 from public.rev_areas x where x.list_id = a.list_id and x.deleted_at is null and x.id <> a.id
                                                and lower(btrim(x.level)) = lower(v_level) and lower(btrim(x.name)) = lower(v_name)) then
    raise exception 'That wall is already on this level.' using errcode = '22023';
  end if;
  update public.rev_areas set level = v_level, name = v_name, sheet_file_id = p_sheet_file_id, position = coalesce(p_position, a.position)
   where id = a.id returning * into a;
  return a;
end;
$$;

-- Remove (soft) a list, rev, item or wall; Restore is the Undo. Each returns the row as JSON; a repeat is a no-op.
create or replace function public.rev_remove(p_kind text, p_id uuid, p_version int)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_table text := public.rev_table(p_kind); v_project uuid; v_version int; v_deleted timestamptz; v_row jsonb;
begin
  if v_table is null then raise exception 'Unknown kind.' using errcode = '22023'; end if;
  execute format('select project_id, version, deleted_at from public.%I where id = $1 for update', v_table)
     into v_project, v_version, v_deleted using p_id;
  if v_project is null or not public.has_capability(v_project, 'revs.read') then raise exception 'not_found' using errcode = 'P0002'; end if;
  perform public.rev_need(v_project, 'revs.manage');
  if v_deleted is null then
    perform public.rev_version_ok(v_version, p_version);
    execute format('update public.%I set deleted_at = now() where id = $1', v_table) using p_id;
  end if;
  execute format('select to_jsonb(t) from public.%I t where t.id = $1', v_table) into v_row using p_id;
  return v_row;
end;
$$;

create or replace function public.rev_restore(p_kind text, p_id uuid, p_version int)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_table text := public.rev_table(p_kind); v_project uuid; v_version int; v_deleted timestamptz; v_row jsonb;
begin
  if v_table is null then raise exception 'Unknown kind.' using errcode = '22023'; end if;
  execute format('select project_id, version, deleted_at from public.%I where id = $1 for update', v_table)
     into v_project, v_version, v_deleted using p_id;
  if v_project is null or not public.has_capability(v_project, 'revs.read') then raise exception 'not_found' using errcode = 'P0002'; end if;
  perform public.rev_need(v_project, 'revs.manage');
  if v_deleted is not null then
    perform public.rev_version_ok(v_version, p_version);
    begin
      execute format('update public.%I set deleted_at = null where id = $1', v_table) using p_id;
    exception when unique_violation then
      raise exception 'That name or number is in use now.' using errcode = '22023';
    end;
  end if;
  execute format('select to_jsonb(t) from public.%I t where t.id = $1', v_table) into v_row using p_id;
  return v_row;
end;
$$;

-- A wall that doesn't need an item: N/A on (p_on) or off. Returns the mark (null when off and there was none).
create or replace function public.rev_mark_na(p_area_id uuid, p_item_id uuid, p_on boolean)
returns public.rev_marks
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare a public.rev_areas; v_list uuid; m public.rev_marks;
begin
  select * into a from public.rev_areas where id = p_area_id and deleted_at is null;
  select v.list_id into v_list from public.rev_items i join public.revs v on v.id = i.rev_id and v.deleted_at is null
   where i.id = p_item_id and i.deleted_at is null;
  if a.id is null or not public.has_capability(a.project_id, 'revs.read') then raise exception 'not_found' using errcode = 'P0002'; end if;
  perform public.rev_list_lock(a.list_id, null);
  if v_list is distinct from a.list_id then raise exception 'Pick an item of this wall''s list.' using errcode = '22023'; end if;
  select * into m from public.rev_marks x where x.area_id = a.id and x.item_id = p_item_id
   order by (x.deleted_at is null) desc, x.updated_at desc limit 1 for update;
  if coalesce(p_on, true) then
    if m.id is null then
      insert into public.rev_marks (org_id, project_id, created_by, area_id, item_id)
      values (a.org_id, a.project_id, auth.uid(), a.id, p_item_id) returning * into m;
    elsif m.deleted_at is not null then
      update public.rev_marks set deleted_at = null where id = m.id returning * into m;
    end if;
  elsif m.id is not null and m.deleted_at is null then
    update public.rev_marks set deleted_at = now() where id = m.id returning * into m;
  end if;
  return m;
end;
$$;

-- =====================================================================================================================
-- The revs request
-- =====================================================================================================================
-- An OFS inspection request for 1 to 3 items on walls of one list. Every rule of ir_submit (OFS allowed, the notice,
-- today or later, the attachments, the first status, the board lines, the 10-minute repeat, kind 'ofs'), plus: walls
-- already passed or N/A for an item are skipped ("Already passed." when nothing is left), items and walls with nothing
-- left are not on it, the colors follow the item order, and the map starts on the given sheet, else the first wall's
-- (none: a sheet is picked when the map is drawn). The database numbers it (IR and OFS IR).
create or replace function public.ir_submit_ofs(
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
  v_duration text := coalesce(p_duration_kind, 'timed');
  v_areas uuid[];
  v_items uuid[];
  v_text text;
  v_sheet uuid;
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
  perform public.ir_ofs_list(p.id, p_area_ids, p_item_ids);
  perform public.rev_sheet_check(p.id, p_sheet_file_id);

  perform pg_advisory_xact_lock(hashtext('ir_submit:' || v_uid::text || ':' || p.id::text));
  select array_agg(distinct c.area_id), array_agg(distinct c.item_id) into v_areas, v_items
    from public.ir_ofs_cells(p.id, p_area_ids, p_item_ids) c;
  if v_areas is null then raise exception 'Already passed.' using errcode = '22023'; end if;
  v_text := public.ir_ofs_items_text(v_areas, v_items);

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
    kind, items, attachment_ids, notice_ack_at, status)
  values (
    p.org_id, p.id, public.next_number(p.id, 'ir'), v_uid, v_uid, v_company, p_request_date, p_start_time, v_duration,
    case when v_duration = 'timed' then p_duration_min end, 'ofs', v_text, coalesce(p_attachment_ids, '{}'::uuid[]), now(),
    public.ir_first_status(p.id))
  returning * into r;

  insert into public.ir_rev_items (org_id, project_id, created_by, request_id, area_id, item_id, color)
  select p.org_id, p.id, v_uid, r.id, c.area_id, c.item_id, c.color from public.ir_ofs_cells(p.id, p_area_ids, p_item_ids) c;

  v_sheet := coalesce(p_sheet_file_id,
    (select a.sheet_file_id from public.rev_areas a join public.files f on f.id = a.sheet_file_id and f.deleted_at is null
      where a.id = any (v_areas) order by btrim(a.level), a.position, a.name, a.id limit 1));
  insert into public.ir_maps (request_id, org_id, project_id, sheet_file_id, updated_by)
  values (r.id, p.org_id, p.id, v_sheet, v_uid);

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

-- =====================================================================================================================
-- The map
-- =====================================================================================================================
-- What the map shows and the ir-map function draws: anyone who may read the request (the requester, ir.view_all,
-- ir.decide). can_edit: may I draw on it now.
create or replace function public.ir_map_context(p_request_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare q public.inspection_requests; m public.ir_maps;
begin
  select * into q from public.inspection_requests where id = p_request_id and deleted_at is null;
  if q.id is null or not public.ir_may_see(q.project_id, q.requested_by) then raise exception 'not_found' using errcode = 'P0002'; end if;
  select * into m from public.ir_maps where request_id = q.id;
  if m.request_id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  return jsonb_build_object(
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
    'can_edit', q.signed_at is null and q.status <> 'withdrawn' and public.ir_map_editor(q.id));
end;
$$;

-- Draws the map: the requester before a result, or an inspector; never once the IR is signed. Strokes only in the
-- request's colors; a sheet (a job PDF the caller may read) before anything is drawn. Null sheet / page = keep.
create or replace function public.ir_map_save(p_request_id uuid, p_version int, p_strokes jsonb, p_sheet_file_id uuid default null,
                                              p_page int default null)
returns public.ir_maps
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare q public.inspection_requests; m public.ir_maps; v_strokes jsonb := coalesce(p_strokes, '[]'::jsonb); v_sheet uuid; v_page int;
begin
  select * into q from public.inspection_requests where id = p_request_id and deleted_at is null for update;
  if q.id is null or not public.ir_may_see(q.project_id, q.requested_by) then raise exception 'not_found' using errcode = 'P0002'; end if;
  select * into m from public.ir_maps where request_id = q.id for update;
  if m.request_id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not public.ir_map_editor(q.id) then raise exception 'forbidden' using errcode = '42501'; end if;
  if q.signed_at is not null then raise exception 'This IR is signed.' using errcode = '22023'; end if;
  if q.status = 'withdrawn' then raise exception 'This inspection was withdrawn.' using errcode = '22023'; end if;
  perform public.rev_version_ok(m.version, p_version);
  if not public.ir_map_strokes_ok(v_strokes) then raise exception 'Those marks can''t be saved.' using errcode = '22023'; end if;
  if exists (select 1 from jsonb_array_elements(v_strokes) s
              where (s ->> 'c')::numeric > (select max(c.color) from public.ir_rev_items c where c.request_id = q.id)) then
    raise exception 'Use the request''s colors.' using errcode = '22023';
  end if;
  v_sheet := coalesce(p_sheet_file_id, m.sheet_file_id);
  v_page := coalesce(p_page, m.page);
  if p_sheet_file_id is distinct from m.sheet_file_id then perform public.rev_sheet_check(q.project_id, p_sheet_file_id); end if;
  if v_page not between 1 and 2000 then raise exception 'Pick a page.' using errcode = '22023'; end if;
  if v_sheet is null and jsonb_array_length(v_strokes) > 0 then raise exception 'Pick the sheet first.' using errcode = '22023'; end if;
  if (v_sheet, v_page, v_strokes) is not distinct from (m.sheet_file_id, m.page, m.strokes) then return m; end if;
  update public.ir_maps set sheet_file_id = v_sheet, page = v_page, strokes = v_strokes, stale = true, updated_by = auth.uid()
   where request_id = q.id returning * into m;
  return m;
end;
$$;

-- Records the map PDF ir-map rendered and stored. Service role only: the map on file is always server-made, after
-- ir_map_context ran as the caller. A signed map carries the deputy's signature: only on a signed, approved IR.
create or replace function public.ir_map_attach(p_request_id uuid, p_file_id uuid, p_content_hash text, p_signed boolean)
returns public.ir_maps
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare q public.inspection_requests; m public.ir_maps;
begin
  if not public.is_service_role() then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into q from public.inspection_requests where id = p_request_id and deleted_at is null;
  select * into m from public.ir_maps where request_id = p_request_id for update;
  if q.id is null or m.request_id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if p_content_hash is null or p_content_hash !~ '^[0-9a-f]{64}$' then raise exception 'bad content hash' using errcode = '22023'; end if;
  if not exists (select 1 from public.files f where f.id = p_file_id and f.project_id = q.project_id and f.deleted_at is null
                                              and f.mime = 'application/pdf' and f.scan_status = 'clean') then
    raise exception 'The map PDF is missing.' using errcode = '22023';
  end if;
  if coalesce(p_signed, false) and (q.signed_at is null or q.result is distinct from 'approved') then
    raise exception 'The IR changed while drawing the map. Try again.' using errcode = '40001';
  end if;
  update public.ir_maps set map_file_id = p_file_id, content_hash = p_content_hash, signed = coalesce(p_signed, false), stale = false
   where request_id = q.id returning * into m;
  perform public.audit('ir.map', 'inspection_request', q.id, q.project_id, q.org_id,
                       jsonb_build_object('number', q.number, 'ofs_number', q.ofs_number, 'file_id', p_file_id, 'signed', m.signed),
                       p_content_hash, 'system');
  return m;
end;
$$;

-- =====================================================================================================================
-- Results per wall and item
-- =====================================================================================================================
-- The inspector's result for every cell (the rule of ir_set_result: the owning inspector, not postponed); a failed one
-- says why. The request is approved when every cell passed, else not approved with the failed reasons as its note.
-- Null clears every result (the Undo).
create or replace function public.ir_rev_results(p_request_id uuid, p_version int, p_results jsonb)
returns public.inspection_requests
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare r public.inspection_requests; v_result text; v_note text;
begin
  r := public.ir_decider(p_request_id, p_version);
  if r.status = 'postponed' then raise exception 'Confirm it again first.' using errcode = '22023'; end if;
  if not exists (select 1 from public.ir_rev_items c where c.request_id = r.id) then
    raise exception 'This request has no walls.' using errcode = '22023';
  end if;
  if p_results is null or p_results = 'null'::jsonb then
    update public.ir_rev_items set result = null, result_note = null, result_at = null, result_by = null
     where request_id = r.id and (result is not null or result_note is not null);
  else
    perform public.ir_rev_results_check(r.id, p_results);
    update public.ir_rev_items c
       set result = x.result, result_note = x.note,
           result_at = case when c.result is distinct from x.result then now() else c.result_at end,
           result_by = case when c.result is distinct from x.result then auth.uid() else c.result_by end
      from (select (e ->> 'area_id')::uuid as area_id, (e ->> 'item_id')::uuid as item_id, e ->> 'result' as result,
                   nullif(btrim(coalesce(e ->> 'note', '')), '') as note
              from jsonb_array_elements(p_results) e) x
     where c.request_id = r.id and c.area_id = x.area_id and c.item_id = x.item_id
       and (c.result, c.result_note) is distinct from (x.result, x.note);
    v_result := case when exists (select 1 from public.ir_rev_items c where c.request_id = r.id and c.result = 'failed')
                     then 'not_approved' else 'approved' end;
    v_note := public.ir_rev_failed_notes(r.id);
  end if;
  perform set_config('app.ir_action', 'result', true);
  update public.inspection_requests
     set result = v_result, result_note = v_note,
         result_at = case when v_result is distinct from result then now() else result_at end,
         result_by = case when v_result is distinct from result then auth.uid() else result_by end,
         status = case when status = 'pending' then 'confirmed' else status end,
         owner_id = auth.uid()
   where id = r.id
   returning * into r;
  perform public.audit('ir.rev_results', 'inspection_request', r.id, r.project_id, r.org_id,
    jsonb_build_object('number', r.number, 'result', r.result,
                       'cells', (select coalesce(jsonb_agg(jsonb_build_object('area_id', c.area_id, 'item_id', c.item_id,
                                                                              'result', c.result) order by c.color, c.area_id), '[]'::jsonb)
                                   from public.ir_rev_items c where c.request_id = r.id)));
  return r;
end;
$$;

-- =====================================================================================================================
-- A request's files: plus its map and the map's sheet; and the null check
-- =====================================================================================================================
-- Same as 0024, plus the request's map (server-made) and its sheet (picked by someone who may read it). Each test is
-- coalesced: a request with no IR PDF yet compared the file with null, so "not one of the request's files" was never
-- true and any file of the request folder answered through any request the caller sees. My own upload there that is
-- not on the request yet (result photos being added) still answers, as it did.
create or replace function public.authorize_ir_file(p_request_id uuid, p_file_id uuid)
returns table (storage_path text, original_name text, mime text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare r public.inspection_requests; m public.ir_maps; f public.files; hdrs jsonb; v_server boolean; v_listed boolean;
begin
  select * into r from public.inspection_requests where id = p_request_id and deleted_at is null;
  if r.id is null or not public.ir_may_see(r.project_id, r.requested_by) then
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

-- =====================================================================================================================
-- Grants: the RPCs people call; ir_map_attach for the service role; everything else above is internal.
-- =====================================================================================================================
do $$
declare f text;
begin
  foreach f in array array[
    'public.rev_status(uuid)',
    'public.rev_list_create(uuid, text, text, uuid, jsonb)',
    'public.rev_list_save(uuid, integer, text, text, uuid)',
    'public.rev_save(uuid, uuid, integer, integer, text)',
    'public.rev_item_save(uuid, uuid, integer, text, text, integer)',
    'public.rev_areas_add(uuid, text, text[], uuid)',
    'public.rev_area_save(uuid, integer, text, text, uuid, integer)',
    'public.rev_remove(text, uuid, integer)', 'public.rev_restore(text, uuid, integer)',
    'public.rev_mark_na(uuid, uuid, boolean)',
    'public.ir_submit_ofs(uuid, text, date, boolean, uuid[], uuid[], uuid, time without time zone, text, integer, uuid[])',
    'public.ir_map_context(uuid)',
    'public.ir_map_save(uuid, integer, jsonb, uuid, integer)',
    'public.ir_rev_results(uuid, integer, jsonb)',
    'public.authorize_ir_file(uuid, uuid)']
  loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
  foreach f in array array[
    'public.ir_map_attach(uuid, uuid, text, boolean)', 'public.ir_map_strokes_ok(jsonb)', 'public.rev_clean(text)', 'public.rev_need(uuid, text)',
    'public.rev_version_ok(integer, integer)', 'public.rev_sheet_ok(uuid, uuid)', 'public.rev_sheet_check(uuid, uuid)',
    'public.rev_list_check(uuid, text, text, uuid)', 'public.rev_rev_check(integer, text)',
    'public.rev_item_check(text, text)', 'public.rev_area_check(text, text)', 'public.rev_legend_check(jsonb)',
    'public.rev_free_number(uuid, integer, uuid)', 'public.rev_list_lock(uuid, integer)', 'public.rev_lock(uuid)',
    'public.rev_table(text)', 'public.ir_ofs_cells(uuid, uuid[], uuid[])', 'public.ir_ofs_list(uuid, uuid[], uuid[])',
    'public.ir_ofs_items_text(uuid[], uuid[])', 'public.ir_map_what(uuid)', 'public.ir_rev_failed_notes(uuid)',
    'public.ir_rev_results_check(uuid, jsonb)', 'public.ir_map_editor(uuid)']
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
  foreach f in array array[
    'public.tg_project_revs_module()', 'public.tg_rev_guard()', 'public.tg_ir_map_touch()', 'public.tg_ir_ofs_number()',
    'public.tg_ir_map_stale()']
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
  end loop;
end $$;

-- ir-map stores a requester's map in Reports / Inspection reports with the service key, after ir_map_context ran as the
-- caller (ir_folder('reports') is for ir.decide only). 0055 left the folder maker with no grant at all.
grant execute on function public.ir_folder_make(uuid, text) to service_role;
