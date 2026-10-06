-- 0083 Revs: rooms (Jesse, Oct 5, on the real Hunter Hall job with the CSU fire marshal: "each of these walls build a
-- room ... start with the electrical room and then let it break down into each of the four walls ... a cropped plan
-- image of the room", "Room and then you click on the room and it breaks it down into the walls", "All the exterior
-- walls would come together"). And the walls' history links to the OFS IRs signed before the app.
--   * rev_rooms: a room of a list on a level, with its number (0242), name (Electrical), kind (a room, the level's
--     exterior walls, or a shaft), a cropped plan image (a file of the job, linked by its name) and its place.
--     rev_room_walls: the walls of a room, each with its line on the room's image (2 to 8 points, fractions 0..1 of the
--     image, origin top-left, none until drawn). A wall may be in several rooms (a shared wall), once per room.
--     Both read like rev_areas (revs.read, removed rows for revs.manage), written only by the RPCs below (revs.manage).
--   * rev_rooms_load: the rooms of a list in one idempotent call (Jesse loads the real ones), upserted by level and
--     number, each room's image linked by its file name (the latest finished upload of that name in a folder the caller
--     may read, none yet is fine), its walls replaced by the ones given (a line given is set, a line left out stays).
--     rev_rooms_link_images links them again by name later (the images dragged into Files after).
--   * Small edits: rev_room_save (number and name), rev_room_wall_add / rev_room_wall_remove (a wall in or out of a
--     room, each the Undo of the other, the line kept), rev_room_wall_line (the manager draws it, Undo sends the old one
--     back). A room is removed and restored by rev_remove / rev_restore (kind 'room').
--   * authorize_rev_file: a room's image, or the file a sign-off is linked to, for anyone who reads revs on the job (the
--     ir-map function's rev_file actions sign the URL after it, as the caller). The scan rules. Shown, it is logged as a
--     preview (no download line), saved, as a download.
--   * rev_wall_history: every inspection of a wall, per item, newest first: the in-app requests (IR and OFS numbers,
--     day, result, whether the caller may open the request) and the sign-offs before the app (OFS number, day, note,
--     the linked file).
--   * rev_signoffs.file_id (the OFS IR on file) and rev_signoffs_link_files: each sign-off with an OFS number gets the
--     job's file whose name carries that number (OFS_IR_0041 or _OFS_0041_), an Attachment or a name starting OFS_IR
--     first.
-- Nothing is dropped. rev_table and tg_rev_guard are re-made with the room added, their other answers unchanged.

-- =====================================================================================================================
-- The line, checked
-- =====================================================================================================================
-- 2 to 8 points [x, y], each a number 0..1, at least two of them apart (rev_geom_ok's rule, fewer points).
create or replace function public.rev_room_line_ok(p_line jsonb)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select p_line is not null and jsonb_typeof(p_line) = 'array' and jsonb_array_length(p_line) between 2 and 8
         and public.rev_geom_ok(p_line);
$$;

-- =====================================================================================================================
-- Tables
-- =====================================================================================================================
create table public.rev_rooms (
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
  -- "0242", or "EXT" for the level's exterior walls.
  number text not null check (length(btrim(number)) between 1 and 20),
  name text not null check (length(btrim(name)) between 1 and 120),
  kind text not null default 'room' check (kind in ('room', 'exterior', 'shaft')),
  -- The cropped plan image's file name, and the file it is linked to (none until it is in Files).
  image_name text check (image_name is null or length(btrim(image_name)) between 1 and 400),
  image_file_id uuid references public.files(id),
  position int not null default 0,
  foreign key (project_id, org_id) references public.projects (id, org_id),
  foreign key (list_id, project_id) references public.rev_lists (id, project_id),
  unique (id, project_id)
);
create unique index rev_rooms_number on public.rev_rooms (list_id, lower(btrim(level)), lower(btrim(number))) where deleted_at is null;
create index rev_rooms_project on public.rev_rooms (project_id);

create table public.rev_room_walls (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id),
  version int not null default 1,
  deleted_at timestamptz,
  org_id uuid not null,
  project_id uuid not null,
  room_id uuid not null,
  area_id uuid not null,
  line jsonb check (line is null or public.rev_room_line_ok(line)),
  position int not null default 0,
  foreign key (project_id, org_id) references public.projects (id, org_id),
  foreign key (room_id, project_id) references public.rev_rooms (id, project_id),
  foreign key (area_id, project_id) references public.rev_areas (id, project_id)
);
create unique index rev_room_walls_one on public.rev_room_walls (room_id, area_id) where deleted_at is null;
create index rev_room_walls_area on public.rev_room_walls (area_id);
create index rev_room_walls_project on public.rev_room_walls (project_id);

alter table public.rev_rooms enable row level security;
alter table public.rev_room_walls enable row level security;

-- The OFS IR (map or PDF) a sign-off before the app is on file as.
alter table public.rev_signoffs add column file_id uuid references public.files(id);

-- =====================================================================================================================
-- Triggers: a rev record stays where it was made (now its room too)
-- =====================================================================================================================
create or replace function public.tg_rev_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare n jsonb := to_jsonb(new); o jsonb := to_jsonb(old); k text;
begin
  foreach k in array array['project_id', 'org_id', 'created_by', 'list_id', 'rev_id', 'area_id', 'item_id', 'request_id', 'room_id'] loop
    if (n -> k) is distinct from (o -> k) then
      raise exception 'A rev record stays where it was made.' using errcode = '42501';
    end if;
  end loop;
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['rev_rooms', 'rev_room_walls'] loop
    execute format('create trigger touch before update on public.%I for each row execute function public.tg_touch_row()', t);
    execute format('create trigger rev_guard before update on public.%I for each row execute function public.tg_rev_guard()', t);
    execute format('create trigger no_delete before delete on public.%I for each row execute function public.tg_block_delete()', t);
    execute format('create trigger audit_row after insert or update on public.%I for each row execute function public.tg_audit_row()', t);
  end loop;
end $$;

-- =====================================================================================================================
-- RLS: read only, every write is an RPC below
-- =====================================================================================================================
create policy "rev_rooms: revs.read" on public.rev_rooms for select to authenticated
  using (public.has_capability(project_id, 'revs.read') and (deleted_at is null or public.has_capability(project_id, 'revs.manage')));
create policy "rev_room_walls: revs.read" on public.rev_room_walls for select to authenticated
  using (public.has_capability(project_id, 'revs.read') and (deleted_at is null or public.has_capability(project_id, 'revs.manage')));

revoke all on public.rev_rooms, public.rev_room_walls from public, anon, authenticated, service_role;
grant select on public.rev_rooms, public.rev_room_walls to authenticated, service_role;

-- =====================================================================================================================
-- Internal helpers (not user-callable)
-- =====================================================================================================================
-- Which table a removable kind is (0056), plus the room.
create or replace function public.rev_table(p_kind text)
returns text
language plpgsql
immutable
set search_path = public, pg_temp
as $$
begin
  return case p_kind when 'list' then 'rev_lists' when 'rev' then 'revs' when 'item' then 'rev_items' when 'area' then 'rev_areas'
                     when 'room' then 'rev_rooms' end;
end;
$$;

-- A room's level, number and name, tidied and in range. `p_at`: "Room 3: " in a load, '' otherwise.
create or replace function public.rev_room_check(p_level text, p_number text, p_name text, p_at text)
returns void
language plpgsql
immutable
set search_path = public, pg_temp
as $$
begin
  if length(public.rev_clean(p_level)) not between 1 and 40 then
    raise exception '%Give the level, up to 40 characters.', p_at using errcode = '22023';
  end if;
  if length(public.rev_clean(p_number)) not between 1 and 20 then
    raise exception '%Give the room number, up to 20 characters.', p_at using errcode = '22023';
  end if;
  if length(public.rev_clean(p_name)) not between 1 and 120 then
    raise exception '%Give the room name, up to 120 characters.', p_at using errcode = '22023';
  end if;
end;
$$;

-- The room's image: the latest finished upload of the job with that name (case aside), a picture, in a folder the
-- caller may read (or their own), not infected. Null when there is none yet.
create or replace function public.rev_room_image_of(p_project_id uuid, p_name text)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select f.id
    from public.files f
   where f.project_id = p_project_id and f.deleted_at is null and f.upload_complete and f.scan_status <> 'infected'
     and lower(f.original_name) = lower(btrim(p_name))
     and lower(f.mime) in ('image/jpeg', 'image/png', 'image/webp')
     and public.file_may_see(f.project_id, f.created_by, f.folder_id)
   order by f.created_at desc, f.id desc
   limit 1;
$$;

-- The room, live, on a live list, for the list's manager (locked).
create or replace function public.rev_room_lock(p_room_id uuid)
returns public.rev_rooms
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare r public.rev_rooms;
begin
  select * into r from public.rev_rooms where id = p_room_id;
  if r.id is null or not public.has_capability(r.project_id, 'revs.read') then raise exception 'not_found' using errcode = 'P0002'; end if;
  perform public.rev_list_lock(r.list_id, null);
  select * into r from public.rev_rooms where id = p_room_id for update;
  if r.deleted_at is not null then raise exception 'This room was removed.' using errcode = '22023'; end if;
  return r;
end;
$$;

-- A wall of the room's list, live.
create or replace function public.rev_room_area_check(p_room public.rev_rooms, p_area_id uuid, p_at text)
returns void
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if p_area_id is null or not exists (select 1 from public.rev_areas a
                                       where a.id = p_area_id and a.list_id = p_room.list_id and a.deleted_at is null) then
    raise exception '%Pick a wall of this room''s list.', p_at using errcode = '22023';
  end if;
end;
$$;

-- =====================================================================================================================
-- The rooms of a list, in one call (revs.manage)
-- =====================================================================================================================
-- p_rooms: [{level, number, name, kind ('room' default, 'exterior', 'shaft'), image_name, walls: [{area_id, line}]}],
-- 1 to 500 rooms, in the order to show them. A room of that level and number on the list takes the new values, others
-- are added. image_name links the image (null when none of that name is on file yet, no image_name = none). walls,
-- when given, are the room's walls in order (up to 60, each once): others are taken out, a line given (null too) is
-- set, a line left out stays as it was. Rooms not named stay as they are. The same call again changes nothing.
-- Answers what it did: {rooms, walls, linked, missing: [image names not on file yet]}.
create or replace function public.rev_rooms_load(p_list_id uuid, p_rooms jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare l public.rev_lists; r jsonb; w jsonb; v_at text; n int := 0; v_level text; v_number text; v_name text; v_kind text;
        v_image text; v_file uuid; room public.rev_rooms; v_area uuid; v_walls int := 0; v_linked int := 0; v_missing text[] := '{}';
        v_keep uuid[]; v_pos int; rw public.rev_room_walls;
begin
  l := public.rev_list_lock(p_list_id, null);
  if p_rooms is null or jsonb_typeof(p_rooms) <> 'array' or jsonb_array_length(p_rooms) not between 1 and 500 then
    raise exception 'Give 1 to 500 rooms.' using errcode = '22023';
  end if;
  -- Everything checked before anything is written.
  for r in select x from jsonb_array_elements(p_rooms) x loop
    n := n + 1;
    v_at := format('Room %s: ', n);
    if jsonb_typeof(r) <> 'object' then raise exception '%Give level, number and name.', v_at using errcode = '22023'; end if;
    perform public.rev_room_check(r ->> 'level', r ->> 'number', r ->> 'name', v_at);
    if coalesce(r ->> 'kind', 'room') not in ('room', 'exterior', 'shaft') then
      raise exception '%The kind is room, exterior or shaft.', v_at using errcode = '22023';
    end if;
    if length(public.rev_clean(r ->> 'image_name')) > 400 then
      raise exception '%Keep the image name to 400 characters.', v_at using errcode = '22023';
    end if;
    if r ? 'walls' then
      if jsonb_typeof(r -> 'walls') <> 'array' or jsonb_array_length(r -> 'walls') > 60 then
        raise exception '%Give up to 60 walls.', v_at using errcode = '22023';
      end if;
      for w in select x from jsonb_array_elements(r -> 'walls') x loop
        if jsonb_typeof(w) <> 'object' or (w ->> 'area_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
          raise exception '%Each wall is {area_id, line}.', v_at using errcode = '22023';
        end if;
        if not exists (select 1 from public.rev_areas a where a.id = (w ->> 'area_id')::uuid and a.list_id = l.id and a.deleted_at is null) then
          raise exception '%Wall % is not a wall of this list.', v_at, w ->> 'area_id' using errcode = '22023';
        end if;
        if w ? 'line' and jsonb_typeof(w -> 'line') <> 'null' and not public.rev_room_line_ok(w -> 'line') then
          raise exception '%The line of wall % is 2 to 8 points [x, y] from 0 to 1.', v_at, w ->> 'area_id' using errcode = '22023';
        end if;
      end loop;
      if (select count(*) - count(distinct x ->> 'area_id') from jsonb_array_elements(r -> 'walls') x) > 0 then
        raise exception '%Each wall once.', v_at using errcode = '22023';
      end if;
    end if;
  end loop;
  if (select count(*) - count(distinct (lower(public.rev_clean(x ->> 'level')), lower(public.rev_clean(x ->> 'number'))))
        from jsonb_array_elements(p_rooms) x) > 0 then
    raise exception 'Each room number once per level.' using errcode = '22023';
  end if;

  n := 0;
  for r in select x from jsonb_array_elements(p_rooms) x loop
    n := n + 1;
    v_level := public.rev_clean(r ->> 'level');
    v_number := public.rev_clean(r ->> 'number');
    v_name := public.rev_clean(r ->> 'name');
    v_kind := coalesce(r ->> 'kind', 'room');
    v_image := nullif(public.rev_clean(r ->> 'image_name'), '');
    v_file := case when v_image is null then null else public.rev_room_image_of(l.project_id, v_image) end;
    if v_image is not null and v_file is null then v_missing := v_missing || v_image; end if;
    if v_file is not null then v_linked := v_linked + 1; end if;
    select * into room from public.rev_rooms x
     where x.list_id = l.id and x.deleted_at is null and lower(btrim(x.level)) = lower(v_level) and lower(btrim(x.number)) = lower(v_number)
     for update;
    if room.id is null then
      insert into public.rev_rooms (org_id, project_id, created_by, list_id, level, number, name, kind, image_name, image_file_id, position)
      values (l.org_id, l.project_id, auth.uid(), l.id, v_level, v_number, v_name, v_kind, v_image, v_file, n)
      returning * into room;
    elsif (room.level, room.number, room.name, room.kind, room.image_name, room.image_file_id, room.position)
          is distinct from (v_level, v_number, v_name, v_kind, v_image, v_file, n) then
      update public.rev_rooms
         set level = v_level, number = v_number, name = v_name, kind = v_kind, image_name = v_image, image_file_id = v_file, position = n
       where id = room.id returning * into room;
    end if;
    if r ? 'walls' then
      v_keep := '{}';
      v_pos := 0;
      for w in select x from jsonb_array_elements(r -> 'walls') x loop
        v_pos := v_pos + 1;
        v_walls := v_walls + 1;
        v_area := (w ->> 'area_id')::uuid;
        v_keep := v_keep || v_area;
        select * into rw from public.rev_room_walls x where x.room_id = room.id and x.area_id = v_area and x.deleted_at is null for update;
        if rw.id is null then
          insert into public.rev_room_walls (org_id, project_id, created_by, room_id, area_id, line, position)
          values (l.org_id, l.project_id, auth.uid(), room.id, v_area,
                  case when jsonb_typeof(w -> 'line') = 'array' then w -> 'line' end, v_pos);
        elsif (v_pos, case when w ? 'line' then nullif(w -> 'line', 'null'::jsonb) else rw.line end)
              is distinct from (rw.position, rw.line) then
          update public.rev_room_walls
             set position = v_pos, line = case when w ? 'line' then nullif(w -> 'line', 'null'::jsonb) else line end
           where id = rw.id;
        end if;
        rw := null;
      end loop;
      update public.rev_room_walls set deleted_at = now()
       where room_id = room.id and deleted_at is null and not (area_id = any (v_keep));
    end if;
    room := null;
  end loop;
  return jsonb_build_object('rooms', n, 'walls', v_walls, 'linked', v_linked, 'missing', to_jsonb(v_missing));
end;
$$;

-- The list's room images linked again by their names (after they were dragged into Files): each room with an image
-- name gets the latest such file the caller may read. Answers {linked: rooms whose image changed, missing: [names]}.
create or replace function public.rev_rooms_link_images(p_list_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare l public.rev_lists; room public.rev_rooms; v_file uuid; v_linked int := 0; v_missing text[] := '{}';
begin
  l := public.rev_list_lock(p_list_id, null);
  for room in select * from public.rev_rooms x where x.list_id = l.id and x.deleted_at is null and x.image_name is not null
               order by x.position, x.number, x.id for update loop
    v_file := public.rev_room_image_of(l.project_id, room.image_name);
    if v_file is null then
      v_missing := v_missing || room.image_name;
    elsif v_file is distinct from room.image_file_id then
      update public.rev_rooms set image_file_id = v_file where id = room.id;
      v_linked := v_linked + 1;
    end if;
  end loop;
  return jsonb_build_object('linked', v_linked, 'missing', to_jsonb(v_missing));
end;
$$;

-- =====================================================================================================================
-- Small edits (revs.manage)
-- =====================================================================================================================
-- A room's number and name, version-checked when a version is given. The same again returns it as it is.
create or replace function public.rev_room_save(p_id uuid, p_version int, p_number text, p_name text)
returns public.rev_rooms
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare r public.rev_rooms; v_number text := public.rev_clean(p_number); v_name text := public.rev_clean(p_name);
begin
  r := public.rev_room_lock(p_id);
  perform public.rev_version_ok(r.version, p_version);
  perform public.rev_room_check(r.level, p_number, p_name, '');
  if (v_number, v_name) is not distinct from (r.number, r.name) then return r; end if;
  if exists (select 1 from public.rev_rooms x where x.list_id = r.list_id and x.deleted_at is null and x.id <> r.id
                                                and lower(btrim(x.level)) = lower(btrim(r.level)) and lower(btrim(x.number)) = lower(v_number)) then
    raise exception 'That room number is already on this level.' using errcode = '22023';
  end if;
  update public.rev_rooms set number = v_number, name = v_name where id = r.id returning * into r;
  return r;
end;
$$;

-- A wall into a room: the one taken out before comes back with its line (the Undo of rev_room_wall_remove), a wall
-- already in it is returned as it is.
create or replace function public.rev_room_wall_add(p_room_id uuid, p_area_id uuid)
returns public.rev_room_walls
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare r public.rev_rooms; w public.rev_room_walls;
begin
  r := public.rev_room_lock(p_room_id);
  perform public.rev_room_area_check(r, p_area_id, '');
  select * into w from public.rev_room_walls x where x.room_id = r.id and x.area_id = p_area_id
   order by (x.deleted_at is null) desc, x.updated_at desc limit 1 for update;
  if w.id is null then
    insert into public.rev_room_walls (org_id, project_id, created_by, room_id, area_id, position)
    values (r.org_id, r.project_id, auth.uid(), r.id, p_area_id,
            (select coalesce(max(x.position), 0) + 1 from public.rev_room_walls x where x.room_id = r.id and x.deleted_at is null))
    returning * into w;
  elsif w.deleted_at is not null then
    update public.rev_room_walls set deleted_at = null where id = w.id returning * into w;
  end if;
  return w;
end;
$$;

-- A wall out of a room (kept, removed). Returns the row, null when it wasn't in the room.
create or replace function public.rev_room_wall_remove(p_room_id uuid, p_area_id uuid)
returns public.rev_room_walls
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare r public.rev_rooms; w public.rev_room_walls;
begin
  r := public.rev_room_lock(p_room_id);
  update public.rev_room_walls set deleted_at = now()
   where room_id = r.id and area_id = p_area_id and deleted_at is null
  returning * into w;
  return w;
end;
$$;

-- A wall's line on its room's image (null takes it off), version-checked when a version is given.
create or replace function public.rev_room_wall_line(p_room_id uuid, p_area_id uuid, p_version int, p_line jsonb)
returns public.rev_room_walls
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare r public.rev_rooms; w public.rev_room_walls; v_line jsonb := nullif(p_line, 'null'::jsonb);
begin
  r := public.rev_room_lock(p_room_id);
  select * into w from public.rev_room_walls x where x.room_id = r.id and x.area_id = p_area_id and x.deleted_at is null for update;
  if w.id is null then raise exception 'That wall isn''t in this room.' using errcode = '22023'; end if;
  if v_line is not distinct from w.line then return w; end if;
  perform public.rev_version_ok(w.version, p_version);
  if v_line is not null and not public.rev_room_line_ok(v_line) then
    raise exception 'Draw the wall: 2 to 8 points on the image.' using errcode = '22023';
  end if;
  update public.rev_room_walls set line = v_line where id = w.id returning * into w;
  return w;
end;
$$;

-- =====================================================================================================================
-- A room's image, or a sign-off's file (the ir-map function signs the URL after this, as the caller)
-- =====================================================================================================================
-- Whoever reads revs on the job: a live room's image (of a live list), or the file of a live sign-off on a live wall.
-- Not infected, still being scanned only for its uploader. Shown (p_download false): a 'file.preview' audit line, no
-- download line. Saved: a download line and an audit line, like authorize_rev_sheet.
create or replace function public.authorize_rev_file(p_project_id uuid, p_file_id uuid, p_download boolean)
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
  if not (exists (select 1 from public.rev_rooms r join public.rev_lists l on l.id = r.list_id and l.deleted_at is null
                   where r.project_id = p_project_id and r.deleted_at is null and r.image_file_id = p_file_id)
          or exists (select 1 from public.rev_signoffs s
                       join public.rev_areas a on a.id = s.area_id and a.deleted_at is null
                       join public.rev_lists l on l.id = a.list_id and l.deleted_at is null
                      where s.project_id = p_project_id and s.deleted_at is null and s.file_id = p_file_id)) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into f from public.files where id = p_file_id and project_id = p_project_id and deleted_at is null;
  if f.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if f.scan_status = 'infected' then raise exception 'infected' using errcode = '42501'; end if;
  if f.scan_status = 'pending' and f.created_by is distinct from auth.uid() then
    raise exception 'scan_pending' using errcode = '42501';
  end if;
  if coalesce(p_download, false) then
    hdrs := nullif(current_setting('request.headers', true), '')::jsonb;
    insert into public.downloads (file_id, project_id, user_id, ip, variant)
    values (f.id, f.project_id, auth.uid(), nullif(split_part(coalesce(hdrs->>'x-forwarded-for', ''), ',', 1), '')::inet, 'original');
    perform public.audit('download', 'file', f.id, f.project_id, f.org_id,
                         jsonb_build_object('variant', 'original', 'name', f.original_name, 'via', 'revs'), f.sha256);
  else
    perform public.audit('file.preview', 'file', f.id, f.project_id, f.org_id, jsonb_build_object('via', 'revs'));
  end if;
  return query select f.storage_path, f.original_name, f.mime, f.size;
end;
$$;

-- =====================================================================================================================
-- A wall's history
-- =====================================================================================================================
-- Every inspection of the wall, per item, newest first. kind 'request': an in-app request not withdrawn (its IR and
-- OFS numbers, day, the cell's result: passed, failed or requested, the failure's note, can_open: the caller may open
-- the request). kind 'before': a sign-off before the app (its OFS number, day, note, and its file when it is on file and
-- not infected, can_open then). at: when it was decided (or asked for), for the order.
create or replace function public.rev_wall_history(p_area_id uuid)
returns table (item_id uuid, kind text, request_id uuid, ir_number int, ofs_number int, day date, result text, note text,
               file_id uuid, file_name text, can_open boolean, at timestamptz)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare a public.rev_areas; v_tz text;
begin
  select * into a from public.rev_areas where id = p_area_id and deleted_at is null;
  if a.id is null or auth.uid() is null or not public.has_capability(a.project_id, 'revs.read') then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  select timezone into v_tz from public.projects where id = a.project_id;
  return query
    select h.item_id, h.kind, h.request_id, h.ir_number, h.ofs_number, h.day, h.result, h.note, h.file_id, h.file_name,
           h.can_open, h.at
      from (
        select c.item_id, 'request'::text as kind, q.id as request_id, q.number as ir_number, q.ofs_number, q.request_date as day,
               coalesce(c.result, 'requested') as result, case when c.result = 'failed' then c.result_note end as note,
               null::uuid as file_id, null::text as file_name,
               public.ir_may_see(q.project_id, q.requested_by, q.kind, q.ofs_sent_at) as can_open,
               coalesce(c.result_at, (q.request_date + coalesce(q.start_time, time '00:00')) at time zone v_tz) as at
          from public.ir_rev_items c
          join public.inspection_requests q on q.id = c.request_id and q.deleted_at is null and q.status <> 'withdrawn'
         where c.area_id = a.id
        union all
        select s.item_id, 'before', null, null, s.ofs_number, s.signed_on, 'passed', s.note, f.id, f.original_name, f.id is not null,
               coalesce((s.signed_on + time '12:00') at time zone v_tz, s.updated_at)
          from public.rev_signoffs s
          left join public.files f on f.id = s.file_id and f.deleted_at is null and f.scan_status <> 'infected'
         where s.area_id = a.id and s.deleted_at is null
      ) h
      join public.rev_items i on i.id = h.item_id and i.deleted_at is null
     order by h.item_id, h.at desc, h.ir_number desc nulls last;
end;
$$;

-- =====================================================================================================================
-- The sign-offs' OFS IRs on file (revs.manage)
-- =====================================================================================================================
-- Each live sign-off with an OFS number gets the job's file (a PDF or a picture, finished, live, not infected, in a
-- folder the caller may read) whose name carries the number as OFS_IR_0041 or _OFS_0041_, an Attachment or a name
-- starting OFS_IR first, then the latest. A sign-off with no such file keeps what it has. Answers {linked: sign-offs
-- whose file changed, missing: [OFS numbers with no file]}.
create or replace function public.rev_signoffs_link_files(p_project_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare s public.rev_signoffs; v_num text; v_file uuid; v_linked int := 0; v_missing int[] := '{}';
begin
  perform public.rev_need(p_project_id, 'revs.manage');
  for s in select x.* from public.rev_signoffs x
             join public.rev_areas a on a.id = x.area_id and a.deleted_at is null
            where x.project_id = p_project_id and x.deleted_at is null and x.ofs_number is not null
            order by x.ofs_number, x.id for update of x loop
    v_num := case when s.ofs_number < 10000 then lpad(s.ofs_number::text, 4, '0') else s.ofs_number::text end;
    select f.id into v_file
      from public.files f
     where f.project_id = p_project_id and f.deleted_at is null and f.upload_complete and f.scan_status <> 'infected'
       and (lower(f.mime) = 'application/pdf' or lower(f.mime) in ('image/jpeg', 'image/png', 'image/webp'))
       and (f.original_name ~* ('OFS_IR_' || v_num || '([^0-9]|$)') or f.original_name ~* ('_OFS_' || v_num || '_'))
       and public.file_may_see(f.project_id, f.created_by, f.folder_id)
     order by (f.original_name ~* 'attachment' or f.original_name ~* '^OFS_IR') desc, f.created_at desc, f.id desc
     limit 1;
    if v_file is null then
      if not (s.ofs_number = any (v_missing)) then v_missing := v_missing || s.ofs_number; end if;
    elsif v_file is distinct from s.file_id then
      update public.rev_signoffs set file_id = v_file where id = s.id;
      v_linked := v_linked + 1;
    end if;
    v_file := null;
  end loop;
  return jsonb_build_object('linked', v_linked, 'missing', to_jsonb(v_missing));
end;
$$;

-- =====================================================================================================================
-- Grants: the RPCs people call, the helpers internal.
-- =====================================================================================================================
do $$
declare f text;
begin
  foreach f in array array[
    'public.rev_rooms_load(uuid, jsonb)', 'public.rev_rooms_link_images(uuid)',
    'public.rev_room_save(uuid, integer, text, text)',
    'public.rev_room_wall_add(uuid, uuid)', 'public.rev_room_wall_remove(uuid, uuid)',
    'public.rev_room_wall_line(uuid, uuid, integer, jsonb)',
    'public.authorize_rev_file(uuid, uuid, boolean)', 'public.rev_wall_history(uuid)',
    'public.rev_signoffs_link_files(uuid)']
  loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
  foreach f in array array[
    'public.rev_room_line_ok(jsonb)', 'public.rev_table(text)', 'public.rev_room_check(text, text, text, text)',
    'public.rev_room_image_of(uuid, text)', 'public.rev_room_lock(uuid)',
    'public.rev_room_area_check(public.rev_rooms, uuid, text)']
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
  execute 'revoke execute on function public.tg_rev_guard() from public, anon, authenticated';
end $$;
