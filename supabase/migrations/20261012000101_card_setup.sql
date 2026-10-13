-- 0101 Inspection cards set up per room (Jesse, Oct 12: "here's the MPOE ... we got these two interior walls right
-- here, the exterior wall is another rating, so we're not gonna worry about that one, we'll track it with the exterior.
-- For these two, what do we need? Speed plugs, framing, this, that ... and everything else should just go away").
--   * rev_marks.set_up: true marks a wall x item set up as not applicable by a room's card (or a manager's switch on the
--     wall), apart from the N/A marked by hand before (set_up false). Neither is an inspection result.
--   * rev_rooms.card_at / card_by: when and by whom the room's card was set up (none: never, nothing picked yet).
--   * rev_card_save (revs.manage, version-checked on the room): the walls kept on the card (a wall left out leaves the
--     room, the existing take-out, it stays in its other rooms) and the items its walls need. Every other item on the
--     kept walls is set up as not applicable, a picked one is applicable again. A cell with a sign-off before the app or
--     on a request (asked, passed or failed) is never changed, and an N/A marked by hand stays. Answers what changed,
--     which rev_card_undo puts back (the walls, the cells and when the card was set up before).
--   * rev_card_item: one item on or off for one wall (a manager, from the wall page). Refused on a cell with a sign-off
--     or a request. On also clears an N/A marked by hand.
--   * Status: an N/A marked by hand comes first as before. A card's N/A comes after everything else, so a sign-off or a
--     request on such a cell still shows (rev_status_rows, 0082's rules otherwise unchanged).
--   * Every change is a rev_marks / rev_room_walls / rev_rooms row (their audit triggers) plus one audit line per save.
-- Nothing is dropped.

alter table public.rev_marks add column set_up boolean not null default false;
alter table public.rev_rooms
  add column card_at timestamptz,
  add column card_by uuid references auth.users(id);

-- =====================================================================================================================
-- Internal helpers (not user-callable)
-- =====================================================================================================================
-- A cell the card never changes: signed off before the app, or on a request not withdrawn (asked, passed or failed).
create or replace function public.rev_card_kept(p_area_id uuid, p_item_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (select 1 from public.rev_signoffs s where s.area_id = p_area_id and s.item_id = p_item_id and s.deleted_at is null)
      or exists (select 1 from public.ir_rev_items c
                   join public.inspection_requests q on q.id = c.request_id and q.deleted_at is null and q.status <> 'withdrawn'
                  where c.area_id = p_area_id and c.item_id = p_item_id);
$$;

-- One cell set up as not applicable (p_na) or applicable again. True when it changed. A kept cell never changes. A cell
-- N/A already (either kind) stays as it is when set N/A. Applicable again clears the card's mark, and the hand mark only
-- when p_hand (a manager's switch on that wall).
create or replace function public.rev_card_cell(p_area_id uuid, p_item_id uuid, p_na boolean, p_hand boolean)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare a public.rev_areas; m public.rev_marks;
begin
  if public.rev_card_kept(p_area_id, p_item_id) then return false; end if;
  select * into m from public.rev_marks x where x.area_id = p_area_id and x.item_id = p_item_id and x.deleted_at is null for update;
  if p_na then
    if m.id is not null then return false; end if;
    select * into m from public.rev_marks x where x.area_id = p_area_id and x.item_id = p_item_id and x.set_up
     order by x.updated_at desc limit 1 for update;
    if m.id is not null then
      update public.rev_marks set deleted_at = null where id = m.id;
    else
      select * into a from public.rev_areas where id = p_area_id;
      insert into public.rev_marks (org_id, project_id, created_by, area_id, item_id, set_up)
      values (a.org_id, a.project_id, auth.uid(), a.id, p_item_id, true);
    end if;
    return true;
  end if;
  if m.id is null or not (m.set_up or p_hand) then return false; end if;
  update public.rev_marks set deleted_at = now() where id = m.id;
  return true;
end;
$$;

-- The room's walls (live links of live walls) and the live items of its list, in their order.
create or replace function public.rev_card_walls(p_room_id uuid)
returns uuid[]
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(array_agg(w.area_id order by w.position, w.id), '{}')
    from public.rev_room_walls w join public.rev_areas a on a.id = w.area_id and a.deleted_at is null
   where w.room_id = p_room_id and w.deleted_at is null;
$$;

create or replace function public.rev_card_items(p_list_id uuid)
returns uuid[]
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(array_agg(i.id order by v.number, i.position, i.name, i.id), '{}')
    from public.rev_items i join public.revs v on v.id = i.rev_id and v.deleted_at is null
   where v.list_id = p_list_id and i.deleted_at is null;
$$;

-- =====================================================================================================================
-- The room's card (revs.manage)
-- =====================================================================================================================
-- p_area_ids: the walls kept on the card (walls of the room's list, up to 60, each once). p_item_ids: the items they
-- need (items of the room's list, each once, none is fine). Answers {room, walls: [{area_id, on}], cells: [{area_id,
-- item_id, na}], was} with what changed and when the card was set up before (null: never).
create or replace function public.rev_card_save(p_room_id uuid, p_version int, p_area_ids uuid[], p_item_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r public.rev_rooms;
  v_was timestamptz;
  v_walls jsonb := '[]'::jsonb;
  v_cells jsonb := '[]'::jsonb;
  v_area uuid;
  v_item uuid;
  v_na boolean;
begin
  r := public.rev_room_lock(p_room_id);
  perform public.rev_version_ok(r.version, p_version);
  if p_area_ids is null or cardinality(p_area_ids) > 60 or array_position(p_area_ids, null) is not null
     or cardinality(p_area_ids) <> (select count(distinct x) from unnest(p_area_ids) x)
     or (select count(*) from public.rev_areas a
          where a.id = any (p_area_ids) and a.list_id = r.list_id and a.deleted_at is null) <> cardinality(p_area_ids) then
    raise exception 'Pick the walls of this room again.' using errcode = '22023';
  end if;
  if p_item_ids is null or array_position(p_item_ids, null) is not null
     or cardinality(p_item_ids) <> (select count(distinct x) from unnest(p_item_ids) x)
     or not (p_item_ids <@ public.rev_card_items(r.list_id)) then
    raise exception 'Pick the items of this list again.' using errcode = '22023';
  end if;

  -- The walls: out, then in.
  for v_area in select w from unnest(public.rev_card_walls(r.id)) w where not (w = any (p_area_ids)) loop
    perform public.rev_room_wall_remove(r.id, v_area);
    v_walls := v_walls || jsonb_build_object('area_id', v_area, 'on', false);
  end loop;
  for v_area in select x from unnest(p_area_ids) x where not (x = any (public.rev_card_walls(r.id))) loop
    perform public.rev_room_wall_add(r.id, v_area);
    v_walls := v_walls || jsonb_build_object('area_id', v_area, 'on', true);
  end loop;

  -- The items on every wall kept.
  for v_area in select w from unnest(public.rev_card_walls(r.id)) w loop
    for v_item in select i from unnest(public.rev_card_items(r.list_id)) i loop
      v_na := not (v_item = any (p_item_ids));
      if public.rev_card_cell(v_area, v_item, v_na, false) then
        v_cells := v_cells || jsonb_build_object('area_id', v_area, 'item_id', v_item, 'na', v_na);
      end if;
    end loop;
  end loop;

  v_was := r.card_at;
  update public.rev_rooms set card_at = now(), card_by = auth.uid() where id = r.id returning * into r;
  perform public.audit('rev.card_set', 'rev_rooms', r.id, r.project_id, r.org_id,
    jsonb_build_object('walls', jsonb_array_length(v_walls), 'cells', jsonb_array_length(v_cells), 'items', cardinality(p_item_ids)));
  return jsonb_build_object('room', to_jsonb(r), 'walls', v_walls, 'cells', v_cells, 'was', v_was);
end;
$$;

-- The Undo of a save: p_undo is what rev_card_save answered ({walls, cells, was}). Each wall goes back in or out, each
-- cell back (a cell kept meanwhile stays), and the card's time back. Version-checked on the room as saved.
create or replace function public.rev_card_undo(p_room_id uuid, p_version int, p_undo jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r public.rev_rooms;
  e jsonb;
  v_uuid text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
  v_was timestamptz;
begin
  r := public.rev_room_lock(p_room_id);
  perform public.rev_version_ok(r.version, p_version);
  if jsonb_typeof(p_undo) is distinct from 'object' or jsonb_typeof(p_undo -> 'walls') is distinct from 'array'
     or jsonb_typeof(p_undo -> 'cells') is distinct from 'array' or coalesce(jsonb_typeof(p_undo -> 'was'), 'null') not in ('string', 'null')
     or jsonb_array_length(p_undo -> 'walls') > 120 or jsonb_array_length(p_undo -> 'cells') > 200000 then
    raise exception 'Nothing to undo.' using errcode = '22023';
  end if;
  for e in select value from jsonb_array_elements(p_undo -> 'walls') loop
    if jsonb_typeof(e) <> 'object' or coalesce(e ->> 'area_id', '') !~ v_uuid or jsonb_typeof(e -> 'on') <> 'boolean' then
      raise exception 'Nothing to undo.' using errcode = '22023';
    end if;
    if (e ->> 'on')::boolean then
      perform public.rev_room_wall_remove(r.id, (e ->> 'area_id')::uuid);
    else
      perform public.rev_room_wall_add(r.id, (e ->> 'area_id')::uuid);
    end if;
  end loop;
  for e in select value from jsonb_array_elements(p_undo -> 'cells') loop
    if jsonb_typeof(e) <> 'object' or coalesce(e ->> 'area_id', '') !~ v_uuid or coalesce(e ->> 'item_id', '') !~ v_uuid
       or jsonb_typeof(e -> 'na') <> 'boolean' then
      raise exception 'Nothing to undo.' using errcode = '22023';
    end if;
    if not exists (select 1 from public.rev_areas a where a.id = (e ->> 'area_id')::uuid and a.list_id = r.list_id and a.deleted_at is null)
       or not ((e ->> 'item_id')::uuid = any (public.rev_card_items(r.list_id))) then
      continue;
    end if;
    perform public.rev_card_cell((e ->> 'area_id')::uuid, (e ->> 'item_id')::uuid, not (e ->> 'na')::boolean, false);
  end loop;
  v_was := (p_undo ->> 'was')::timestamptz;
  if v_was > now() then raise exception 'Nothing to undo.' using errcode = '22023'; end if;
  update public.rev_rooms set card_at = v_was, card_by = case when v_was is null then null else card_by end
   where id = r.id returning * into r;
  perform public.audit('rev.card_undo', 'rev_rooms', r.id, r.project_id, r.org_id,
    jsonb_build_object('walls', jsonb_array_length(p_undo -> 'walls'), 'cells', jsonb_array_length(p_undo -> 'cells')));
  return to_jsonb(r);
end;
$$;

-- One item on (p_on) or off for one wall. Answers {area_id, item_id, na, changed}. Its Undo is the same call turned over.
create or replace function public.rev_card_item(p_area_id uuid, p_item_id uuid, p_on boolean)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare a public.rev_areas; v_changed boolean;
begin
  select * into a from public.rev_areas where id = p_area_id;
  if a.id is null or not public.has_capability(a.project_id, 'revs.read') then raise exception 'not_found' using errcode = 'P0002'; end if;
  perform public.rev_list_lock(a.list_id, null);
  if a.deleted_at is not null then raise exception 'This wall was removed.' using errcode = '22023'; end if;
  if p_on is null or p_item_id is null or not (p_item_id = any (public.rev_card_items(a.list_id))) then
    raise exception 'Pick an item of this wall''s list.' using errcode = '22023';
  end if;
  if public.rev_card_kept(a.id, p_item_id) then
    raise exception 'This item has a sign-off or a request.' using errcode = '22023';
  end if;
  v_changed := public.rev_card_cell(a.id, p_item_id, not p_on, true);
  if v_changed then
    perform public.audit('rev.card_item', 'rev_areas', a.id, a.project_id, a.org_id,
      jsonb_build_object('item_id', p_item_id, 'on', p_on));
  end if;
  return jsonb_build_object('area_id', a.id, 'item_id', p_item_id, 'na', not p_on, 'changed', v_changed);
end;
$$;

-- =====================================================================================================================
-- Status: a card's N/A after everything else
-- =====================================================================================================================
-- 0082's rows, with the hand N/A first as before and a card's N/A (set_up) only where nothing else decides the cell:
-- na (by hand) > signed off before > passed > requested > failed > na (card) > open.
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
                when q.rid is not null then 'requested' when f.result = 'failed' then 'failed'
                when k.id is not null then 'na' else 'open' end,
           case when m.id is not null or b.aid is not null then null when p.rid is not null then p.rid
                when q.rid is not null then q.rid when f.result = 'failed' then f.rid end,
           case when m.id is not null or b.aid is not null then null when p.rid is not null then p.number
                when q.rid is not null then q.number when f.result = 'failed' then f.number end,
           case when m.id is not null then null when b.aid is not null then b.ofs when p.rid is not null then p.ofs
                when q.rid is not null then q.ofs when f.result = 'failed' then f.ofs end,
           case when m.id is not null then m.updated_at
                when b.aid is not null then (b.signed_on + time '12:00') at time zone v_tz
                when p.rid is not null then p.result_at when q.rid is not null then q.asked
                when f.result = 'failed' then f.result_at when k.id is not null then k.updated_at end,
           case when m.id is not null then null when b.aid is not null then b.note when p.rid is not null then p.result_note
                when q.rid is not null then null when f.result = 'failed' then f.result_note end
      from cells c
      left join public.rev_marks m on m.area_id = c.aid and m.item_id = c.iid and m.deleted_at is null and not m.set_up
      left join public.rev_marks k on k.area_id = c.aid and k.item_id = c.iid and k.deleted_at is null and k.set_up
      left join before b on b.aid = c.aid and b.iid = c.iid
      left join passed p on p.aid = c.aid and p.iid = c.iid
      left join asked q on q.aid = c.aid and q.iid = c.iid
      left join last_result f on f.aid = c.aid and f.iid = c.iid
     order by c.lpos, c.lvl, c.apos, c.aname, c.aid, c.vnum, c.ipos, c.iname, c.iid;
end;
$$;

-- =====================================================================================================================
-- Grants
-- =====================================================================================================================
do $$
declare f text;
begin
  foreach f in array array[
    'public.rev_card_save(uuid, integer, uuid[], uuid[])',
    'public.rev_card_undo(uuid, integer, jsonb)',
    'public.rev_card_item(uuid, uuid, boolean)']
  loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
  foreach f in array array[
    'public.rev_card_kept(uuid, uuid)', 'public.rev_card_cell(uuid, uuid, boolean, boolean)',
    'public.rev_card_walls(uuid)', 'public.rev_card_items(uuid)']
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
