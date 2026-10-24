-- 0119 A room's card is locked once it is set up (Jesse, Oct 23: "I'd think it's the way for someone to go into that
-- room, click what inspections we need to achieve, and save it. Then there should be some kind of lock on it so not
-- everyone can edit it").
--   * rev_rooms.card_locked_at / card_locked_by: the card is locked, when and by whom. Every save of the card locks it.
--   * rev_card_set (revs.manage, version-checked on the room): the cells changed on the card's Setup, each a wall of the
--     room x an item of its list, Needed or Not needed. Needed also clears an N/A marked by hand (as the wall's switch
--     does). A cell with a sign-off or a request (asked, passed or failed) is never changed. Refused on a locked card.
--     Saved, the card is set up and locked. The same save again answers the card as it is (safe to repeat).
--   * rev_card_lock (revs.manage, version-checked, audited, safe to repeat): Unlock to edit, and locked again (Cancel
--     after an unlock).
--   * rev_card_save and rev_card_item refuse on a locked card (rev_card_item: a live room of the wall has its card
--     locked), and rev_card_save locks it too. rev_card_undo puts a save back only for whoever saved it (the room as the
--     save left it, the version check) and leaves the card unlocked as it was before the save.
--   * The lock never blocks requests, inspections or sign-offs (none of them calls these), a wall added on the spot (its
--     room's card carries over to it), or a wall into or out of a room from the room's page.
--   * rev_card_lockers: the names of whoever locked a card of the job (revs.read), for "Locked by".
-- Nothing is dropped.

alter table public.rev_rooms
  add column card_locked_at timestamptz,
  add column card_locked_by uuid references auth.users(id),
  add constraint rev_rooms_card_lock check ((card_locked_at is null) = (card_locked_by is null));

-- =====================================================================================================================
-- Internal helpers (not user-callable)
-- =====================================================================================================================
create or replace function public.rev_card_open(p_locked_at timestamptz)
returns void
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if p_locked_at is not null then
    raise exception 'This card is locked. Unlock it to edit.' using errcode = '55000';
  end if;
end;
$$;

-- Needed now: no live N/A mark (either kind) on the cell.
create or replace function public.rev_card_needed(p_area_id uuid, p_item_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select not exists (select 1 from public.rev_marks m where m.area_id = p_area_id and m.item_id = p_item_id and m.deleted_at is null);
$$;

-- p_cells checked against the room: [{area_id, item_id, needed}], each a wall of the room x an item of its list, once.
create or replace function public.rev_card_cells_check(p_room public.rev_rooms, p_cells jsonb)
returns void
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  e jsonb;
  v_uuid text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
  v_walls uuid[] := public.rev_card_walls(p_room.id);
  v_items uuid[] := public.rev_card_items(p_room.list_id);
begin
  if jsonb_typeof(p_cells) is distinct from 'array' or jsonb_array_length(p_cells) > 6000 then
    raise exception 'Pick the boxes of this card again.' using errcode = '22023';
  end if;
  for e in select value from jsonb_array_elements(p_cells) loop
    if jsonb_typeof(e) <> 'object' or coalesce(e ->> 'area_id', '') !~ v_uuid or coalesce(e ->> 'item_id', '') !~ v_uuid
       or jsonb_typeof(e -> 'needed') is distinct from 'boolean'
       or not ((e ->> 'area_id')::uuid = any (v_walls)) or not ((e ->> 'item_id')::uuid = any (v_items)) then
      raise exception 'Pick the boxes of this card again.' using errcode = '22023';
    end if;
  end loop;
  if (select count(*) from jsonb_array_elements(p_cells)) <>
     (select count(distinct (x ->> 'area_id', x ->> 'item_id')) from jsonb_array_elements(p_cells) x) then
    raise exception 'Pick the boxes of this card again.' using errcode = '22023';
  end if;
end;
$$;

-- =====================================================================================================================
-- The card's Setup (revs.manage)
-- =====================================================================================================================
-- Answers {room, walls: [], cells: [{area_id, item_id, na}], was} with what changed and when the card was set up
-- before (null: never), the shape rev_card_undo takes.
create or replace function public.rev_card_set(p_room_id uuid, p_version int, p_cells jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r public.rev_rooms;
  e jsonb;
  v_na boolean;
  v_cells jsonb := '[]'::jsonb;
  v_was timestamptz;
begin
  r := public.rev_room_lock(p_room_id);
  perform public.rev_card_cells_check(r, p_cells);
  -- The same save again: locked by its caller with every cell as asked (or kept), it answers the card as it is.
  if r.card_locked_at is not null and r.card_locked_by = auth.uid()
     and not exists (select 1 from jsonb_array_elements(p_cells) x
                      where not public.rev_card_kept((x ->> 'area_id')::uuid, (x ->> 'item_id')::uuid)
                        and public.rev_card_needed((x ->> 'area_id')::uuid, (x ->> 'item_id')::uuid) <> (x ->> 'needed')::boolean) then
    return jsonb_build_object('room', to_jsonb(r), 'walls', '[]'::jsonb, 'cells', '[]'::jsonb, 'was', r.card_at);
  end if;
  perform public.rev_card_open(r.card_locked_at);
  perform public.rev_version_ok(r.version, p_version);

  for e in select value from jsonb_array_elements(p_cells) loop
    v_na := not (e ->> 'needed')::boolean;
    if public.rev_card_cell((e ->> 'area_id')::uuid, (e ->> 'item_id')::uuid, v_na, true) then
      v_cells := v_cells || jsonb_build_object('area_id', e ->> 'area_id', 'item_id', e ->> 'item_id', 'na', v_na);
    end if;
  end loop;

  v_was := r.card_at;
  update public.rev_rooms set card_at = now(), card_by = auth.uid(), card_locked_at = now(), card_locked_by = auth.uid()
   where id = r.id returning * into r;
  perform public.audit('rev.card_set', 'rev_rooms', r.id, r.project_id, r.org_id,
    jsonb_build_object('cells', jsonb_array_length(v_cells), 'asked', jsonb_array_length(p_cells), 'locked', true));
  return jsonb_build_object('room', to_jsonb(r), 'walls', '[]'::jsonb, 'cells', v_cells, 'was', v_was);
end;
$$;

-- Unlock to edit (p_locked false) or lock again (true). The same again answers the room as it is.
create or replace function public.rev_card_lock(p_room_id uuid, p_version int, p_locked boolean)
returns public.rev_rooms
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare r public.rev_rooms;
begin
  r := public.rev_room_lock(p_room_id);
  if p_locked is null then raise exception 'Lock or unlock the card.' using errcode = '22023'; end if;
  if (r.card_locked_at is not null) = p_locked then return r; end if;
  perform public.rev_version_ok(r.version, p_version);
  update public.rev_rooms
     set card_locked_at = case when p_locked then now() end, card_locked_by = case when p_locked then auth.uid() end
   where id = r.id returning * into r;
  perform public.audit(case when p_locked then 'rev.card_lock' else 'rev.card_unlock' end, 'rev_rooms', r.id, r.project_id, r.org_id,
    '{}'::jsonb);
  return r;
end;
$$;

-- Whoever locked a live card of the job, by name.
create or replace function public.rev_card_lockers(p_project_id uuid)
returns table (user_id uuid, name text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select distinct r.card_locked_by, coalesce(public.ir_person_name(r.card_locked_by), 'A member')
    from public.rev_rooms r
   where r.project_id = p_project_id and r.deleted_at is null and r.card_locked_by is not null
     and public.has_capability(p_project_id, 'revs.read');
$$;

-- =====================================================================================================================
-- 0101's calls, lock-aware
-- =====================================================================================================================
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
  perform public.rev_card_open(r.card_locked_at);
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

  for v_area in select w from unnest(public.rev_card_walls(r.id)) w where not (w = any (p_area_ids)) loop
    perform public.rev_room_wall_remove(r.id, v_area);
    v_walls := v_walls || jsonb_build_object('area_id', v_area, 'on', false);
  end loop;
  for v_area in select x from unnest(p_area_ids) x where not (x = any (public.rev_card_walls(r.id))) loop
    perform public.rev_room_wall_add(r.id, v_area);
    v_walls := v_walls || jsonb_build_object('area_id', v_area, 'on', true);
  end loop;

  for v_area in select w from unnest(public.rev_card_walls(r.id)) w loop
    for v_item in select i from unnest(public.rev_card_items(r.list_id)) i loop
      v_na := not (v_item = any (p_item_ids));
      if public.rev_card_cell(v_area, v_item, v_na, false) then
        v_cells := v_cells || jsonb_build_object('area_id', v_area, 'item_id', v_item, 'na', v_na);
      end if;
    end loop;
  end loop;

  v_was := r.card_at;
  update public.rev_rooms set card_at = now(), card_by = auth.uid(), card_locked_at = now(), card_locked_by = auth.uid()
   where id = r.id returning * into r;
  perform public.audit('rev.card_set', 'rev_rooms', r.id, r.project_id, r.org_id,
    jsonb_build_object('walls', jsonb_array_length(v_walls), 'cells', jsonb_array_length(v_cells), 'items', cardinality(p_item_ids),
                       'locked', true));
  return jsonb_build_object('room', to_jsonb(r), 'walls', v_walls, 'cells', v_cells, 'was', v_was);
end;
$$;

-- The Undo of a save, for whoever saved it: the walls, the cells and the card's time back, and the card unlocked as
-- it was before the save. Version-checked on the room as saved.
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
  if r.card_locked_at is not null and r.card_locked_by is distinct from auth.uid() then
    perform public.rev_card_open(r.card_locked_at);
  end if;
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
  update public.rev_rooms set card_at = v_was, card_by = case when v_was is null then null else card_by end,
         card_locked_at = null, card_locked_by = null
   where id = r.id returning * into r;
  perform public.audit('rev.card_undo', 'rev_rooms', r.id, r.project_id, r.org_id,
    jsonb_build_object('walls', jsonb_array_length(p_undo -> 'walls'), 'cells', jsonb_array_length(p_undo -> 'cells')));
  return to_jsonb(r);
end;
$$;

-- One item on or off for one wall, refused while a room of the wall has its card locked.
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
  if exists (select 1 from public.rev_room_walls w join public.rev_rooms r on r.id = w.room_id and r.deleted_at is null
              where w.area_id = a.id and w.deleted_at is null and r.card_locked_at is not null) then
    raise exception 'The room''s card is locked. Unlock it to edit.' using errcode = '55000';
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
-- Grants
-- =====================================================================================================================
do $$
declare f text;
begin
  foreach f in array array[
    'public.rev_card_set(uuid, integer, jsonb)',
    'public.rev_card_lock(uuid, integer, boolean)',
    'public.rev_card_lockers(uuid)',
    'public.rev_card_save(uuid, integer, uuid[], uuid[])',
    'public.rev_card_undo(uuid, integer, jsonb)',
    'public.rev_card_item(uuid, uuid, boolean)']
  loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
  foreach f in array array[
    'public.rev_card_open(timestamptz)', 'public.rev_card_needed(uuid, uuid)',
    'public.rev_card_cells_check(public.rev_rooms, jsonb)']
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
