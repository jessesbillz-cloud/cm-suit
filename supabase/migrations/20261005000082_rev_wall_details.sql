-- 0082 Revs: what each rated wall is, and what was signed off before the app (Jesse, Oct 5: the real Hunter Hall
-- fire-rated wall inspections start with the CSU fire marshal through Revs; 48 rated walls are loaded, each with facts
-- from a plan review, and many already had OFS sign-offs on paper, OFS IR #0001-#0068).
--   * A wall's details on rev_areas, all optional: its tag (e.g. F6a), rating, UL design, fire area, the sheet number as
--     text (A201A; apart from the linked sheet file) and what still needs checking against the plans. Saved by
--     rev_area_details_save (revs.manage, version-checked like rev_area_save; the row's touch and audit triggers).
--   * rev_signoffs: a wall x item the fire marshal signed off before the app, with its OFS IR number, the day and a note
--     (all optional). One live row per wall and item; read like rev_marks (revs.read; removed rows for revs.manage);
--     written only by rev_signoff_set (many items at once: a whole rev) and rev_signoff_clear (its Undo), revs.manage.
--   * Status: such a cell is passed, with its OFS number and day, unless an in-app request on that cell is newer (asked
--     for after the end of the signed-off day, or after it was last set when no day was given): then the in-app result
--     decides it as before. N/A still comes first. rev_status_rows carries every other rule of 0057 unchanged, so
--     rev_status, the request link's walls and the permit's open inspections all follow; ir_ofs_cells skips such a cell
--     like a passed one (a request doesn't ask again for what is signed off).

-- =====================================================================================================================
-- A wall's details
-- =====================================================================================================================
alter table public.rev_areas
  add column wall_tag text check (wall_tag is null or length(btrim(wall_tag)) between 1 and 20),
  add column rating text check (rating is null or length(btrim(rating)) between 1 and 80),
  add column ul_design text check (ul_design is null or length(btrim(ul_design)) between 1 and 40),
  add column fire_area text check (fire_area is null or length(btrim(fire_area)) between 1 and 120),
  add column sheet_ref text check (sheet_ref is null or length(btrim(sheet_ref)) between 1 and 20),
  add column check_note text check (check_note is null or length(btrim(check_note)) between 1 and 300);

-- Typed text, tidied (rev_clean), or null when empty; too long is refused in words.
create or replace function public.rev_text_or_null(p_text text, p_max int, p_what text)
returns text
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare v text := nullif(public.rev_clean(p_text), '');
begin
  if length(v) > p_max then raise exception 'Keep the % to % characters.', p_what, p_max using errcode = '22023'; end if;
  return v;
end;
$$;

-- A wall's tag, rating, UL design, fire area, sheet number and what to check (null or empty = none). Version-checked
-- when a version is given; the same values again return the wall as it is.
create or replace function public.rev_area_details_save(p_id uuid, p_version int, p_wall_tag text, p_rating text, p_ul_design text,
                                                        p_fire_area text, p_sheet_ref text, p_check_note text)
returns public.rev_areas
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare a public.rev_areas; v_tag text; v_rating text; v_ul text; v_area text; v_sheet text; v_check text;
begin
  select * into a from public.rev_areas where id = p_id for update;
  if a.id is null or not public.has_capability(a.project_id, 'revs.read') then raise exception 'not_found' using errcode = 'P0002'; end if;
  perform public.rev_list_lock(a.list_id, null);
  if a.deleted_at is not null then raise exception 'This wall was removed.' using errcode = '22023'; end if;
  perform public.rev_version_ok(a.version, p_version);
  v_tag := public.rev_text_or_null(p_wall_tag, 20, 'tag');
  v_rating := public.rev_text_or_null(p_rating, 80, 'rating');
  v_ul := public.rev_text_or_null(p_ul_design, 40, 'UL design');
  v_area := public.rev_text_or_null(p_fire_area, 120, 'fire area');
  v_sheet := public.rev_text_or_null(p_sheet_ref, 20, 'sheet');
  v_check := public.rev_text_or_null(p_check_note, 300, 'check note');
  if (v_tag, v_rating, v_ul, v_area, v_sheet, v_check)
     is not distinct from (a.wall_tag, a.rating, a.ul_design, a.fire_area, a.sheet_ref, a.check_note) then
    return a;
  end if;
  update public.rev_areas
     set wall_tag = v_tag, rating = v_rating, ul_design = v_ul, fire_area = v_area, sheet_ref = v_sheet, check_note = v_check
   where id = a.id
  returning * into a;
  return a;
end;
$$;

-- =====================================================================================================================
-- Signed off before the app
-- =====================================================================================================================
create table public.rev_signoffs (
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
  -- The OFS IR that signed it off (#0041), the day, and a note; each optional.
  ofs_number int check (ofs_number is null or ofs_number between 1 and 999999),
  signed_on date,
  note text check (note is null or length(btrim(note)) between 1 and 300),
  foreign key (project_id, org_id) references public.projects (id, org_id),
  foreign key (area_id, project_id) references public.rev_areas (id, project_id),
  foreign key (item_id, project_id) references public.rev_items (id, project_id)
);
create unique index rev_signoffs_cell on public.rev_signoffs (area_id, item_id) where deleted_at is null;
create index rev_signoffs_project on public.rev_signoffs (project_id);
alter table public.rev_signoffs enable row level security;

create trigger touch before update on public.rev_signoffs for each row execute function public.tg_touch_row();
create trigger rev_guard before update on public.rev_signoffs for each row execute function public.tg_rev_guard();
create trigger no_delete before delete on public.rev_signoffs for each row execute function public.tg_block_delete();
create trigger audit_row after insert or update on public.rev_signoffs for each row execute function public.tg_audit_row();

create policy "rev_signoffs: revs.read" on public.rev_signoffs for select to authenticated
  using (public.has_capability(project_id, 'revs.read') and (deleted_at is null or public.has_capability(project_id, 'revs.manage')));

revoke all on public.rev_signoffs from public, anon, authenticated, service_role;
grant select on public.rev_signoffs to authenticated, service_role;

-- The live sign-off that decides a wall x item: none when there is none, or when an in-app request (not withdrawn) on
-- that cell was made after it: after the end of its day (the job's clock), or after it was last set when it has no day.
create or replace function public.rev_signoff_live(p_area_id uuid, p_item_id uuid)
returns public.rev_signoffs
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select s.*
    from public.rev_signoffs s
    join public.projects p on p.id = s.project_id
   where s.area_id = p_area_id and s.item_id = p_item_id and s.deleted_at is null
     and not exists (
       select 1 from public.ir_rev_items c
         join public.inspection_requests q on q.id = c.request_id and q.deleted_at is null and q.status <> 'withdrawn'
        where c.area_id = s.area_id and c.item_id = s.item_id
          and c.created_at > case when s.signed_on is null then s.updated_at
                                  else (s.signed_on + 1)::timestamp at time zone p.timezone end);
$$;

-- The wall, live, for the manager of its live list, and the items asked for: 1 to 200, each once, all live items of a
-- live rev of the wall's list.
create or replace function public.rev_signoff_wall(p_area_id uuid, p_item_ids uuid[])
returns public.rev_areas
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare a public.rev_areas;
begin
  select * into a from public.rev_areas where id = p_area_id;
  if a.id is null or not public.has_capability(a.project_id, 'revs.read') then raise exception 'not_found' using errcode = 'P0002'; end if;
  perform public.rev_list_lock(a.list_id, null);
  if a.deleted_at is not null then raise exception 'This wall was removed.' using errcode = '22023'; end if;
  if cardinality(coalesce(p_item_ids, '{}')) not between 1 and 200 or array_position(p_item_ids, null) is not null
     or cardinality(p_item_ids) <> (select count(distinct x) from unnest(p_item_ids) x) then
    raise exception 'Pick 1 to 200 items.' using errcode = '22023';
  end if;
  if (select count(*) from public.rev_items i join public.revs v on v.id = i.rev_id and v.deleted_at is null
       where i.id = any (p_item_ids) and i.deleted_at is null and v.list_id = a.list_id) <> cardinality(p_item_ids) then
    raise exception 'Pick items of this wall''s list.' using errcode = '22023';
  end if;
  return a;
end;
$$;

-- Signed off before the app: these items of this wall (one, or a whole rev), with the OFS IR number, the day and a
-- note (each optional; the day not after today on the job's clock). An item signed off already takes the new values.
-- Returns the sign-offs, in item order.
create or replace function public.rev_signoff_set(p_area_id uuid, p_item_ids uuid[], p_ofs_number int, p_signed_on date, p_note text)
returns setof public.rev_signoffs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare a public.rev_areas; v_note text; v_item uuid; s public.rev_signoffs; v_today date;
begin
  a := public.rev_signoff_wall(p_area_id, p_item_ids);
  if p_ofs_number is not null and p_ofs_number not between 1 and 999999 then
    raise exception 'Give the OFS IR number, 1 or more.' using errcode = '22023';
  end if;
  select (now() at time zone timezone)::date into v_today from public.projects where id = a.project_id;
  if p_signed_on is not null and (p_signed_on > v_today or p_signed_on < date '2000-01-01') then
    raise exception 'Pick the day it was signed off.' using errcode = '22023';
  end if;
  v_note := public.rev_text_or_null(p_note, 300, 'note');
  for v_item in select i.id from public.rev_items i join public.revs v on v.id = i.rev_id
                 where i.id = any (p_item_ids) order by v.number, i.position, i.name, i.id loop
    select * into s from public.rev_signoffs x where x.area_id = a.id and x.item_id = v_item and x.deleted_at is null for update;
    if s.id is null then
      insert into public.rev_signoffs (org_id, project_id, created_by, area_id, item_id, ofs_number, signed_on, note)
      values (a.org_id, a.project_id, auth.uid(), a.id, v_item, p_ofs_number, p_signed_on, v_note)
      returning * into s;
    elsif (s.ofs_number, s.signed_on, s.note) is distinct from (p_ofs_number, p_signed_on, v_note) then
      update public.rev_signoffs set ofs_number = p_ofs_number, signed_on = p_signed_on, note = v_note
       where id = s.id returning * into s;
    end if;
    return next s;
    s := null;
  end loop;
end;
$$;

-- Undo: these items of this wall are no longer signed off before (kept, removed). Returns what was cleared, for its own
-- Undo; a repeat clears nothing.
create or replace function public.rev_signoff_clear(p_area_id uuid, p_item_ids uuid[])
returns setof public.rev_signoffs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare a public.rev_areas;
begin
  a := public.rev_signoff_wall(p_area_id, p_item_ids);
  return query
    with gone as (
      update public.rev_signoffs s set deleted_at = now()
       where s.area_id = a.id and s.item_id = any (p_item_ids) and s.deleted_at is null
      returning s.*
    )
    select * from gone;
end;
$$;

-- =====================================================================================================================
-- Status and the request's cells, with the sign-offs
-- =====================================================================================================================
-- 0057's rows, plus: na > signed off before (passed: its OFS number, its day at noon on the job's clock, its note; no
-- request) > passed > requested > failed > open. A newer in-app request leaves the sign-off out (rev_signoff_live).
create or replace function public.rev_status_rows(p_project_id uuid)
returns table (area_id uuid, item_id uuid, status text, request_id uuid, ir_number int, ofs_number int, at timestamptz, note text)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare v_tz text;
begin
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
    ),
    before as (
      select s.area_id as aid, s.item_id as iid, s.ofs_number as ofs, s.signed_on, s.note
        from public.rev_signoffs s
       where s.project_id = p_project_id and s.deleted_at is null
         and (public.rev_signoff_live(s.area_id, s.item_id)).id is not null
    )
    select c.aid, c.iid,
           case when m.id is not null then 'na' when b.aid is not null then 'passed' when p.rid is not null then 'passed'
                when q.rid is not null then 'requested' when f.result = 'failed' then 'failed' else 'open' end,
           case when m.id is not null or b.aid is not null then null when p.rid is not null then p.rid
                when q.rid is not null then q.rid when f.result = 'failed' then f.rid end,
           case when m.id is not null or b.aid is not null then null when p.rid is not null then p.number
                when q.rid is not null then q.number when f.result = 'failed' then f.number end,
           case when m.id is not null then null when b.aid is not null then b.ofs when p.rid is not null then p.ofs
                when q.rid is not null then q.ofs when f.result = 'failed' then f.ofs end,
           case when m.id is not null then m.updated_at
                when b.aid is not null then (b.signed_on + time '12:00') at time zone v_tz
                when p.rid is not null then p.result_at when q.rid is not null then q.asked
                when f.result = 'failed' then f.result_at end,
           case when m.id is not null then null when b.aid is not null then b.note when p.rid is not null then p.result_note
                when q.rid is not null then null when f.result = 'failed' then f.result_note end
      from cells c
      left join public.rev_marks m on m.area_id = c.aid and m.item_id = c.iid and m.deleted_at is null
      left join before b on b.aid = c.aid and b.iid = c.iid
      left join passed p on p.aid = c.aid and p.iid = c.iid
      left join asked q on q.aid = c.aid and q.iid = c.iid
      left join last_result f on f.aid = c.aid and f.iid = c.iid
     order by c.lpos, c.lvl, c.apos, c.aname, c.aid, c.vnum, c.ipos, c.iname, c.iid;
end;
$$;

-- 0057's rev_status, unchanged: the caller's check, then the rows.
create or replace function public.rev_status(p_project_id uuid)
returns table (area_id uuid, item_id uuid, status text, request_id uuid, ir_number int, ofs_number int, at timestamptz, note text)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
begin
  perform public.rev_need(p_project_id, 'revs.read');
  return query select s.* from public.rev_status_rows(p_project_id) s;
end;
$$;

-- 0056's cells of a new OFS request, plus: a cell signed off before (and not asked for in the app since) is skipped
-- like a passed one.
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
       and (public.rev_signoff_live(a.id, i.id)).id is null
  ),
  colors as (
    select d.item_id, (row_number() over (order by d.number, d.position, d.name, d.item_id))::smallint as color
      from (select distinct o.item_id, o.number, o.position, o.name from open_cells o) d
  )
  select o.area_id, o.item_id, c.color from open_cells o join colors c on c.item_id = o.item_id;
$$;

-- =====================================================================================================================
-- Grants
-- =====================================================================================================================
do $$
declare f text;
begin
  foreach f in array array[
    'public.rev_area_details_save(uuid, integer, text, text, text, text, text, text)',
    'public.rev_signoff_set(uuid, uuid[], integer, date, text)',
    'public.rev_signoff_clear(uuid, uuid[])']
  loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
  foreach f in array array[
    'public.rev_text_or_null(text, integer, text)', 'public.rev_signoff_live(uuid, uuid)',
    'public.rev_signoff_wall(uuid, uuid[])']
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
