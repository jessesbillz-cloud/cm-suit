-- 0059 Revs: walls drawn on the plan (Jesse, Oct 3: "We definitely want to be able to add as many walls as we want to
-- the plan sheet ... this wall here, on grid line 7 of the electrical room ... so we can build it out that way,
-- piecemeal, around the whole building"). A wall gains its place on its plan sheet: the page of the sheet PDF (many jobs
-- keep the plan set as one file) and a line along the wall: 2 to 50 points [x, y], fractions 0..1 of the page as it is
-- viewed, origin top-left (the map strokes' frame, 0056), checked here. No line = not on the plan.
--   * rev_area_draw: a new wall drawn on the plan and named (rev_areas_add's name rules: tidied, once per level). The
--     same wall drawn again is returned as it is; a wall of that name not on the plan yet is placed there.
--   * rev_area_place: a wall's place on the plan, set at once (sheet, page, line), version-checked. A null line takes
--     the wall off the plan (it keeps the sheet its maps start on). Undo sends back what was there.
--   * A wall's line goes with its sheet: another sheet (Setup's rev_area_save) takes the wall off the plan, back to
--     page 1 (tg_rev_area_geom).
--   * authorize_rev_sheet: a plan sheet for the Revs plan view and a wall's thumbnail (the ir-map function's 'plan'
--     action): whoever reads revs, for a sheet a live wall of the job is on; a manager also for any PDF of the job they
--     may read (a new level's sheet). The scan rules; logged as a download, like authorize_ir_file.
--   * ir_ofs_make (0057): a new revs request's map starts on the first wall's sheet at that wall's page, so the walls'
--     lines can be drawn on the map at once (the browser does that: one highlighter stroke per wall per item).
-- Nothing is dropped; the link's answer (link_request_revs) is unchanged.

-- =====================================================================================================================
-- The line, checked
-- =====================================================================================================================
-- 2 to 50 points [x, y], each a number 0..1, at least two of them apart. Nothing else.
create or replace function public.rev_geom_ok(p_geom jsonb)
returns boolean
language plpgsql
immutable
set search_path = public, pg_temp
as $$
begin
  if p_geom is null or jsonb_typeof(p_geom) <> 'array' or jsonb_array_length(p_geom) not between 2 and 50 then return false; end if;
  if exists (select 1 from jsonb_array_elements(p_geom) pt
              where case when jsonb_typeof(pt) <> 'array' then true
                         when jsonb_array_length(pt) <> 2 then true
                         when jsonb_typeof(pt -> 0) <> 'number' or jsonb_typeof(pt -> 1) <> 'number' then true
                         when (pt ->> 0)::numeric not between 0 and 1 then true
                         else (pt ->> 1)::numeric not between 0 and 1 end) then
    return false;
  end if;
  return (select count(distinct pt) from jsonb_array_elements(p_geom) pt) >= 2;
end;
$$;

alter table public.rev_areas
  add column sheet_page int not null default 1 check (sheet_page between 1 and 2000),
  add column geom jsonb check (geom is null or public.rev_geom_ok(geom)),
  -- A line is on a sheet.
  add constraint rev_areas_geom_sheet check (geom is null or sheet_file_id is not null);

-- A wall's line goes with its sheet: another sheet (or none) without a new line takes the wall off the plan, and a page
-- not given goes back to 1. Runs as the person saving, so builtins only.
create or replace function public.tg_rev_area_geom()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.sheet_file_id is distinct from old.sheet_file_id then
    if new.geom is not distinct from old.geom then new.geom := null; end if;
    if new.sheet_page = old.sheet_page then new.sheet_page := 1; end if;
  end if;
  return new;
end;
$$;
create trigger rev_area_geom before update of sheet_file_id on public.rev_areas
  for each row execute function public.tg_rev_area_geom();

-- =====================================================================================================================
-- Internal helpers (not user-callable)
-- =====================================================================================================================
-- A sheet a live wall of the job is on (live list, live PDF of the job, not infected): whoever reads revs sees it.
create or replace function public.rev_wall_sheet(p_project_id uuid, p_file_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (select 1 from public.rev_areas a
                   join public.rev_lists l on l.id = a.list_id and l.deleted_at is null
                   join public.files f on f.id = a.sheet_file_id
                  where a.project_id = p_project_id and a.deleted_at is null and a.sheet_file_id = p_file_id
                    and f.project_id = p_project_id and f.deleted_at is null and f.mime = 'application/pdf'
                    and f.scan_status <> 'infected');
$$;

-- A wall's place: a good line on a sheet and page. A new sheet (not `p_was`) is a PDF of the job the manager may read,
-- or one the job's walls are already on.
create or replace function public.rev_geom_check(p_project_id uuid, p_sheet_file_id uuid, p_page int, p_geom jsonb, p_was uuid)
returns void
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if p_sheet_file_id is null then raise exception 'Pick the sheet first.' using errcode = '22023'; end if;
  if p_page is null or p_page not between 1 and 2000 then raise exception 'Pick a page of the sheet.' using errcode = '22023'; end if;
  if p_geom is null or not public.rev_geom_ok(p_geom) then
    raise exception 'Draw the wall: 2 to 50 points on the sheet.' using errcode = '22023';
  end if;
  if p_sheet_file_id is distinct from p_was
     and not (public.rev_sheet_ok(p_project_id, p_sheet_file_id) or public.rev_wall_sheet(p_project_id, p_sheet_file_id)) then
    raise exception 'Pick a PDF sheet from this job''s files.' using errcode = '22023';
  end if;
end;
$$;

-- =====================================================================================================================
-- Walls on the plan (revs.manage)
-- =====================================================================================================================
-- A new wall drawn on the plan, named once. The same wall drawn again comes back as it is; a wall of that name on the
-- level that isn't on the plan yet is placed here; one already drawn elsewhere is refused.
create or replace function public.rev_area_draw(p_list_id uuid, p_level text, p_name text, p_sheet_file_id uuid, p_page int,
                                                p_geom jsonb)
returns public.rev_areas
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare l public.rev_lists; v_level text := public.rev_clean(p_level); v_name text := public.rev_clean(p_name); a public.rev_areas;
        v_pos int;
begin
  l := public.rev_list_lock(p_list_id, null);
  perform public.rev_area_check(p_level, p_name);
  perform public.rev_geom_check(l.project_id, p_sheet_file_id, p_page, p_geom, null);
  for attempt in 1..2 loop
    select * into a from public.rev_areas x
     where x.list_id = l.id and x.deleted_at is null and lower(btrim(x.level)) = lower(v_level) and lower(btrim(x.name)) = lower(v_name)
     for update;
    if a.id is not null then
      if (a.sheet_file_id, a.sheet_page, a.geom) is not distinct from (p_sheet_file_id, p_page, p_geom) then return a; end if;
      if a.geom is not null then raise exception 'That wall is already on this level.' using errcode = '22023'; end if;
      update public.rev_areas set sheet_file_id = p_sheet_file_id, sheet_page = p_page, geom = p_geom where id = a.id
      returning * into a;
      return a;
    end if;
    select coalesce(max(x.position), 0) + 1 into v_pos from public.rev_areas x where x.list_id = l.id and x.deleted_at is null;
    begin
      insert into public.rev_areas (org_id, project_id, created_by, list_id, level, name, sheet_file_id, sheet_page, geom, position)
      values (l.org_id, l.project_id, auth.uid(), l.id, v_level, v_name, p_sheet_file_id, p_page, p_geom, v_pos)
      returning * into a;
      return a;
    exception when unique_violation then
      -- Saved twice at once: the other one landed first; look again.
      a := null;
    end;
  end loop;
  raise exception 'That wall is already on this level.' using errcode = '22023';
end;
$$;

-- A wall's place on the plan, all at once: its sheet, page and line (null: off the plan; the sheet stays the one its
-- maps start on, or none). The same place again comes back as it is.
create or replace function public.rev_area_place(p_id uuid, p_version int, p_sheet_file_id uuid, p_page int, p_geom jsonb)
returns public.rev_areas
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare a public.rev_areas; v_page int := coalesce(p_page, 1);
begin
  select * into a from public.rev_areas where id = p_id for update;
  if a.id is null or not public.has_capability(a.project_id, 'revs.read') then raise exception 'not_found' using errcode = 'P0002'; end if;
  perform public.rev_list_lock(a.list_id, null);
  if a.deleted_at is not null then raise exception 'This wall was removed.' using errcode = '22023'; end if;
  if (p_sheet_file_id, v_page, p_geom) is not distinct from (a.sheet_file_id, a.sheet_page, a.geom) then return a; end if;
  perform public.rev_version_ok(a.version, p_version);
  if p_geom is not null then
    perform public.rev_geom_check(a.project_id, p_sheet_file_id, v_page, p_geom, a.sheet_file_id);
  else
    if v_page not between 1 and 2000 then raise exception 'Pick a page of the sheet.' using errcode = '22023'; end if;
    if p_sheet_file_id is distinct from a.sheet_file_id then perform public.rev_sheet_check(a.project_id, p_sheet_file_id); end if;
  end if;
  update public.rev_areas set sheet_file_id = p_sheet_file_id, sheet_page = v_page, geom = p_geom where id = a.id
  returning * into a;
  -- The trigger takes a line off a sheet it wasn't drawn for; what was asked for here stands.
  if (a.sheet_page, a.geom) is distinct from (v_page, p_geom) then
    update public.rev_areas set sheet_page = v_page, geom = p_geom where id = a.id returning * into a;
  end if;
  return a;
end;
$$;

-- =====================================================================================================================
-- A plan sheet for the plan view (the ir-map function signs its URL after this, as the caller)
-- =====================================================================================================================
-- Whoever reads revs: a sheet a live wall of the job is on. A manager: also any PDF of the job they may read (the sheet
-- of a level with no walls yet). Not infected; still being scanned only for its uploader. A download line and an audit
-- line, like authorize_ir_file.
create or replace function public.authorize_rev_sheet(p_project_id uuid, p_file_id uuid)
returns table (storage_path text, original_name text, mime text, size bigint)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare f public.files; hdrs jsonb;
begin
  if auth.uid() is null or not public.has_capability(p_project_id, 'revs.read') then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if not (public.rev_wall_sheet(p_project_id, p_file_id)
          or (public.has_capability(p_project_id, 'revs.manage') and public.rev_sheet_ok(p_project_id, p_file_id))) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into f from public.files where id = p_file_id and project_id = p_project_id and deleted_at is null;
  if f.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if f.scan_status = 'infected' then raise exception 'infected' using errcode = '42501'; end if;
  if f.scan_status = 'pending' and f.created_by is distinct from auth.uid() then
    raise exception 'scan_pending' using errcode = '42501';
  end if;
  hdrs := nullif(current_setting('request.headers', true), '')::jsonb;
  insert into public.downloads (file_id, project_id, user_id, ip, variant)
  values (f.id, f.project_id, auth.uid(), nullif(split_part(coalesce(hdrs->>'x-forwarded-for', ''), ',', 1), '')::inet, 'original');
  perform public.audit('download', 'file', f.id, f.project_id, f.org_id,
                       jsonb_build_object('variant', 'original', 'name', f.original_name, 'via', 'revs_plan'), f.sha256);
  return query select f.storage_path, f.original_name, f.mime, f.size;
end;
$$;

-- =====================================================================================================================
-- A new revs request's map starts at the first wall's page (0057's body, plus the page)
-- =====================================================================================================================
create or replace function public.ir_ofs_make(p_request public.inspection_requests, p_area_ids uuid[], p_item_ids uuid[],
                                              p_sheet_file_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_sheet uuid; v_page int;
begin
  insert into public.ir_rev_items (org_id, project_id, created_by, request_id, area_id, item_id, color)
  select p_request.org_id, p_request.project_id, auth.uid(), p_request.id, c.area_id, c.item_id, c.color
    from public.ir_ofs_cells(p_request.project_id, p_area_ids, p_item_ids) c;
  v_sheet := coalesce(p_sheet_file_id,
    (select a.sheet_file_id from public.rev_areas a join public.files f on f.id = a.sheet_file_id and f.deleted_at is null
      where a.id in (select c.area_id from public.ir_rev_items c where c.request_id = p_request.id)
      order by btrim(a.level), a.position, a.name, a.id limit 1));
  -- The page of the first of the request's walls on that sheet (a plan set kept as one PDF).
  select a.sheet_page into v_page from public.rev_areas a
   where a.id in (select c.area_id from public.ir_rev_items c where c.request_id = p_request.id) and a.sheet_file_id = v_sheet
   order by (a.geom is null), btrim(a.level), a.position, a.name, a.id limit 1;
  insert into public.ir_maps (request_id, org_id, project_id, sheet_file_id, page, updated_by)
  values (p_request.id, p_request.org_id, p_request.project_id, v_sheet, coalesce(v_page, 1), auth.uid());
end;
$$;

-- =====================================================================================================================
-- Grants: the RPCs people call; the helpers and the trigger are internal.
-- =====================================================================================================================
do $$
declare f text;
begin
  foreach f in array array[
    'public.rev_area_draw(uuid, text, text, uuid, integer, jsonb)',
    'public.rev_area_place(uuid, integer, uuid, integer, jsonb)',
    'public.authorize_rev_sheet(uuid, uuid)']
  loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
  foreach f in array array[
    'public.rev_geom_ok(jsonb)', 'public.rev_wall_sheet(uuid, uuid)',
    'public.rev_geom_check(uuid, uuid, integer, jsonb, uuid)']
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
  execute 'revoke execute on function public.tg_rev_area_geom() from public, anon, authenticated';
end $$;
