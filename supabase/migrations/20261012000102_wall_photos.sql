-- 0102 Photos and notes on walls and rooms, and on an inspection request per wall (Jesse, Oct 12: "taking photos
-- within the app of the actual areas ... send him out with an iPad: go take a picture of all our walls the way they are
-- right now. And on the inspection request ... a way to attach a photo, or add a comment, a note: what's going on with
-- this wall - it's not done, we had to take the drywall back off." And no black hole of dumped documents: a photo
-- belongs to the wall it is of).
--   * rev_photos: one photo (or a one-line note, or both) of a wall, of a room, or of a wall on an inspection request.
--     The file is kept in the app's own folder "Wall photos" (top of the job, made on first use by rev_photos_folder,
--     hidden from Files like Room pictures, the name the server's). A request's photo is the wall's photo too: one row,
--     the wall's strip and the request both show it.
--   * Who reads: everyone who reads the inspection cards (revs.read) reads their own photos. A wall's or a room's photo
--     (no request) is read by the inside people (files.read_records) and the cards' managers (revs.manage). A request's
--     photo goes with the request (ir_may_see, 0090): outside people see their own and those of the requests they read.
--   * Who adds (rev_photo_add): someone who reads the cards and may add files or ask for or decide inspections
--     (files.write_project, ir.request, revs.manage, ir.decide, ir.ofs_decide). On a request: its requester while it is
--     not decided, and the one who decides it (the inspector, the fire marshal once it is with OFS) at any time. Only a
--     wall on the request, only a photo the caller just added to Wall photos. The same file again answers its row, the
--     same note again within ten minutes too.
--   * Who removes (rev_photo_remove, Undo rev_photo_restore): the one who added it or a manager (revs.manage,
--     files.manage). A request's photos are part of its record: once the request is decided (a result, complete or
--     withdrawn) nobody removes them, and the file of a live photo is never deleted on its own (files trigger).
--   * rev_photos_list: a wall's, a room's (its own and its walls') or a request's photos the caller reads, newest first,
--     with who, the request's numbers, whether the caller may remove it, and whether it opens through the request.
--   * authorize_ir_file (0061) also hands out a request's own wall photos, so whoever reads the request may look.
-- Nothing is dropped. folder_name_reserved and folder_by_app are re-made with every earlier answer kept (create or
-- replace keeps their grants). The server key reads the new table only (58_service_grants).

-- =====================================================================================================================
-- The app's folder
-- =====================================================================================================================
-- Same as 0094 plus "Wall photos" at the top.
create or replace function public.folder_name_reserved(p_project_id uuid, p_parent_id uuid, p_name text)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select case
    when p_parent_id is null then btrim(p_name) in ('Bids received', 'Inspection requests', 'Delivery tickets', 'Emailed in',
                                                     'Bid forms', 'RFIs', 'Approved plans', 'Safety', 'Schedule', 'Requirements',
                                                     'Room pictures', 'Wall photos')
    else btrim(p_name) = any (case (select kind from public.folders where id = p_parent_id and project_id = p_project_id)
                                when 'reports' then array['Inspection reports', 'OFS inspection reports', 'Corrections', 'OFS history']
                                when 'photos' then array['Corrections'] end)
  end;
$$;

-- Same as 0096 plus "Wall photos": only the app fills it, so Files shows it nowhere.
create or replace function public.folder_by_app(p_kind text, p_parent_id uuid, p_name text)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select p_kind in ('reports', 'inbound', 'bids_received', 'rfis', 'approved_plans', 'stamping')
      or (p_parent_id is null and p_kind = 'general' and p_name in ('Inspection requests', 'Room pictures', 'Wall photos'))
      or (p_kind = 'photos' and p_name in ('Corrections', 'Delivery tickets'));
$$;

-- =====================================================================================================================
-- Table
-- =====================================================================================================================
create table public.rev_photos (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id),
  version int not null default 1,
  deleted_at timestamptz,
  org_id uuid not null,
  project_id uuid not null,
  -- The wall it is of, the room it was taken in (or of, with no wall), the request it was added on.
  area_id uuid,
  room_id uuid,
  request_id uuid,
  file_id uuid references public.files(id),
  note text check (note is null or length(btrim(note)) between 1 and 200),
  foreign key (project_id, org_id) references public.projects (id, org_id),
  foreign key (area_id, project_id) references public.rev_areas (id, project_id),
  foreign key (room_id, project_id) references public.rev_rooms (id, project_id),
  foreign key (request_id, project_id) references public.inspection_requests (id, project_id),
  check (area_id is not null or room_id is not null),
  check (request_id is null or area_id is not null),
  check (file_id is not null or note is not null)
);
create unique index rev_photos_file on public.rev_photos (file_id) where deleted_at is null and file_id is not null;
create index rev_photos_area on public.rev_photos (area_id);
create index rev_photos_room on public.rev_photos (room_id);
create index rev_photos_request on public.rev_photos (request_id);
create index rev_photos_project on public.rev_photos (project_id);
alter table public.rev_photos enable row level security;

create trigger touch before update on public.rev_photos for each row execute function public.tg_touch_row();
create trigger rev_guard before update on public.rev_photos for each row execute function public.tg_rev_guard();
create trigger no_delete before delete on public.rev_photos for each row execute function public.tg_block_delete();
create trigger audit_row after insert or update on public.rev_photos for each row execute function public.tg_audit_row();

-- =====================================================================================================================
-- Who may (internal helpers, the policy's one public)
-- =====================================================================================================================
-- May the caller read this photo? (The table's read rule, and rev_photos_list's.)
create or replace function public.rev_photo_may_see(p_project_id uuid, p_created_by uuid, p_request_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(auth.uid() is not null and public.has_capability(p_project_id, 'revs.read') and (
      p_created_by = auth.uid()
      or (p_request_id is null and (public.has_capability(p_project_id, 'files.read_records')
                                    or public.has_capability(p_project_id, 'revs.manage')))
      or (p_request_id is not null and exists (
            select 1 from public.inspection_requests r
             where r.id = p_request_id and r.deleted_at is null
               and public.ir_may_see(r.project_id, r.requested_by, r.kind, r.ofs_sent_at)))), false);
$$;

-- May the caller add photos on this job at all?
create or replace function public.rev_photo_adder(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(auth.uid() is not null and public.has_capability(p_project_id, 'revs.read') and (
      public.has_capability(p_project_id, 'files.write_project') or public.has_capability(p_project_id, 'ir.request')
      or public.has_capability(p_project_id, 'revs.manage') or public.has_capability(p_project_id, 'ir.decide')
      or public.has_capability(p_project_id, 'ir.ofs_decide')), false);
$$;

-- Is the request decided (its photos locked)?
create or replace function public.rev_photo_decided(p_request_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((select r.result is not null or r.status in ('complete', 'withdrawn') or r.deleted_at is not null
                     from public.inspection_requests r where r.id = p_request_id), true);
$$;

-- May the caller add a photo on this request? Its requester while it is not decided, the one who decides it any time.
create or replace function public.rev_photo_on_request(p_request_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((
    select public.rev_photo_adder(r.project_id)
           and public.ir_may_see(r.project_id, r.requested_by, r.kind, r.ofs_sent_at)
           and r.status <> 'withdrawn'
           and ((r.requested_by = auth.uid() and public.has_capability(r.project_id, 'ir.request')
                 and not public.rev_photo_decided(r.id))
                or public.has_capability(r.project_id, 'ir.decide')
                or (r.kind = 'ofs' and r.ofs_sent_at is not null and public.has_capability(r.project_id, 'ir.ofs_decide')))
      from public.inspection_requests r where r.id = p_request_id and r.deleted_at is null), false);
$$;

-- May the caller remove (or bring back) this photo?
create or replace function public.rev_photo_removable(p_project_id uuid, p_created_by uuid, p_request_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(auth.uid() is not null
    and (p_request_id is null or not public.rev_photo_decided(p_request_id))
    and public.rev_photo_may_see(p_project_id, p_created_by, p_request_id)
    and ((p_created_by = auth.uid() and public.has_capability(p_project_id, 'revs.read'))
         or public.has_capability(p_project_id, 'revs.manage') or public.has_capability(p_project_id, 'files.manage')), false);
$$;

-- The job's Wall photos folder if it is there (live), else null.
create or replace function public.rev_photos_folder_id(p_project_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select id from public.folders
   where project_id = p_project_id and parent_id is null and name = 'Wall photos' and kind = 'general' and deleted_at is null
   order by created_at limit 1;
$$;

-- =====================================================================================================================
-- RLS: read only, every write is an RPC below
-- =====================================================================================================================
create policy "rev_photos: who may see" on public.rev_photos for select to authenticated
  using (deleted_at is null and public.rev_photo_may_see(project_id, created_by, request_id));

revoke all on public.rev_photos from public, anon, authenticated, service_role;
grant select on public.rev_photos to authenticated, service_role;

-- =====================================================================================================================
-- The folder (made on first use)
-- =====================================================================================================================
-- "Wall photos" at the top of the job, with its own access list: the inside people read it, the cards' managers and
-- files.manage read and add, the others who may add photos add only (they read their own). A removed one comes back.
create or replace function public.rev_photos_folder(p_project_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_org uuid; v_id uuid;
begin
  if not public.rev_photo_adder(p_project_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  select org_id into v_org from public.projects where id = p_project_id and deleted_at is null;
  if v_org is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  perform pg_advisory_xact_lock(hashtext('rev_photos_folder:' || p_project_id::text));
  select id into v_id from public.folders
   where project_id = p_project_id and parent_id is null and name = 'Wall photos'
   order by (deleted_at is null) desc, created_at limit 1;
  if v_id is null then
    insert into public.folders (org_id, project_id, name, kind, created_by)
    values (v_org, p_project_id, 'Wall photos', 'general', auth.uid())
    returning id into v_id;
  end if;
  update public.folders set deleted_at = null where id = v_id and deleted_at is not null;
  if not exists (select 1 from public.folder_access where folder_id = v_id) then
    insert into public.folder_access (folder_id, capability, can_read, can_write, created_by) values
      (v_id, 'files.read_records', true, false, auth.uid()),
      (v_id, 'revs.manage', true, true, auth.uid()),
      (v_id, 'files.manage', true, true, auth.uid()),
      (v_id, 'files.write_project', false, true, auth.uid()),
      (v_id, 'ir.request', false, true, auth.uid()),
      (v_id, 'ir.decide', false, true, auth.uid()),
      (v_id, 'ir.ofs_decide', false, true, auth.uid())
    on conflict do nothing;
  end if;
  return v_id;
end;
$$;

-- =====================================================================================================================
-- Add, remove, bring back
-- =====================================================================================================================
-- A photo (my own just added to Wall photos, a picture) and/or a one-line note, of a wall (of the room it was taken in),
-- of a room, or of a wall on a request.
create or replace function public.rev_photo_add(p_project_id uuid, p_area_id uuid, p_room_id uuid, p_request_id uuid,
                                                p_file_id uuid, p_note text)
returns public.rev_photos
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_org uuid; v_note text := nullif(public.rev_clean(p_note), ''); f public.files; p public.rev_photos;
begin
  if not public.rev_photo_adder(p_project_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  select org_id into v_org from public.projects where id = p_project_id and deleted_at is null;
  if v_org is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if length(v_note) > 200 then raise exception 'Keep the note to one line (200 characters).' using errcode = '22023'; end if;
  if p_file_id is null and v_note is null then raise exception 'Add a photo or a note.' using errcode = '22023'; end if;
  if p_area_id is null and p_room_id is null then raise exception 'Pick the wall or the room.' using errcode = '22023'; end if;
  if p_area_id is not null and not exists (
       select 1 from public.rev_areas a join public.rev_lists l on l.id = a.list_id and l.deleted_at is null
        where a.id = p_area_id and a.project_id = p_project_id and a.deleted_at is null) then
    raise exception 'This wall is no longer on the job.' using errcode = 'P0002';
  end if;
  if p_room_id is not null and not exists (
       select 1 from public.rev_rooms r join public.rev_lists l on l.id = r.list_id and l.deleted_at is null
        where r.id = p_room_id and r.project_id = p_project_id and r.deleted_at is null) then
    raise exception 'This room is no longer on the job.' using errcode = 'P0002';
  end if;
  if p_area_id is not null and p_room_id is not null and not exists (
       select 1 from public.rev_room_walls w where w.room_id = p_room_id and w.area_id = p_area_id and w.deleted_at is null) then
    raise exception 'That wall is not in this room.' using errcode = '22023';
  end if;
  if p_request_id is not null then
    if p_area_id is null then raise exception 'Pick the wall on the request.' using errcode = '22023'; end if;
    if not exists (select 1 from public.inspection_requests r where r.id = p_request_id and r.project_id = p_project_id
                      and r.deleted_at is null and public.ir_may_see(r.project_id, r.requested_by, r.kind, r.ofs_sent_at)) then
      raise exception 'not_found' using errcode = 'P0002';
    end if;
    if not public.rev_photo_on_request(p_request_id) then
      raise exception 'This request takes no more photos from you.' using errcode = '42501';
    end if;
    if not exists (select 1 from public.ir_rev_items c where c.request_id = p_request_id and c.area_id = p_area_id) then
      raise exception 'That wall is not on this request.' using errcode = '22023';
    end if;
  end if;
  if p_file_id is not null then
    select * into f from public.files x
     where x.id = p_file_id and x.project_id = p_project_id and x.deleted_at is null and x.upload_complete
       and x.created_by = auth.uid() and x.scan_status <> 'infected'
       and x.folder_id = public.rev_photos_folder_id(p_project_id)
       and lower(x.mime) in ('image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif');
    if f.id is null then raise exception 'Take or pick the photo again.' using errcode = '22023'; end if;
    -- The same file again: its row, when it is the same photo.
    select * into p from public.rev_photos where file_id = p_file_id and deleted_at is null;
    if p.id is not null then
      if (p.area_id, p.room_id, p.request_id) is not distinct from (p_area_id, p_room_id, p_request_id) then return p; end if;
      raise exception 'That photo is already on a wall.' using errcode = '22023';
    end if;
  else
    -- The same note again within ten minutes: its row.
    select * into p from public.rev_photos x
     where x.created_by = auth.uid() and x.deleted_at is null and x.file_id is null and x.note = v_note
       and (x.area_id, x.room_id, x.request_id) is not distinct from (p_area_id, p_room_id, p_request_id)
       and x.created_at > now() - interval '10 minutes'
     order by x.created_at desc limit 1;
    if p.id is not null then return p; end if;
  end if;
  insert into public.rev_photos (created_at, created_by, org_id, project_id, area_id, room_id, request_id, file_id, note)
  values (clock_timestamp(), auth.uid(), v_org, p_project_id, p_area_id, p_room_id, p_request_id, p_file_id, v_note)
  returning * into p;
  return p;
end;
$$;

-- The photo, locked, for the one who may remove it (or bring it back). Version-checked when a version is given.
create or replace function public.rev_photo_lock(p_id uuid, p_version int)
returns public.rev_photos
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare p public.rev_photos;
begin
  select * into p from public.rev_photos where id = p_id for update;
  if p.id is null or auth.uid() is null or not public.rev_photo_may_see(p.project_id, p.created_by, p.request_id) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if p.request_id is not null and public.rev_photo_decided(p.request_id) then
    raise exception 'The request is decided: its photos are part of its record.' using errcode = '42501';
  end if;
  if not public.rev_photo_removable(p.project_id, p.created_by, p.request_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  perform public.rev_version_ok(p.version, p_version);
  return p;
end;
$$;

-- Removed (Undo: rev_photo_restore). The file stays. A repeat answers the removed row.
create or replace function public.rev_photo_remove(p_id uuid, p_version int)
returns public.rev_photos
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare p public.rev_photos;
begin
  select * into p from public.rev_photos where id = p_id;
  if p.id is not null and p.deleted_at is not null and public.rev_photo_removable(p.project_id, p.created_by, p.request_id) then return p; end if;
  p := public.rev_photo_lock(p_id, p_version);
  update public.rev_photos set deleted_at = now() where id = p.id returning * into p;
  return p;
end;
$$;

-- Back again (the Undo of Remove), while its file is live and on no other photo. A repeat answers the row.
create or replace function public.rev_photo_restore(p_id uuid)
returns public.rev_photos
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare p public.rev_photos;
begin
  p := public.rev_photo_lock(p_id, null);
  if p.deleted_at is null then return p; end if;
  if p.file_id is not null and (
       not exists (select 1 from public.files f where f.id = p.file_id and f.deleted_at is null)
       or exists (select 1 from public.rev_photos x where x.file_id = p.file_id and x.deleted_at is null)) then
    raise exception 'That photo can''t come back.' using errcode = '22023';
  end if;
  update public.rev_photos set deleted_at = null where id = p.id returning * into p;
  return p;
end;
$$;

-- May I add here? A wall's or a room's photos (no request), or on this request.
create or replace function public.rev_photo_may_add(p_project_id uuid, p_request_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case when p_request_id is null then public.rev_photo_adder(p_project_id)
              else exists (select 1 from public.inspection_requests r where r.id = p_request_id and r.project_id = p_project_id)
                   and public.rev_photo_on_request(p_request_id) end;
$$;

-- =====================================================================================================================
-- The list: a wall's, a room's (its own and its walls') or a request's photos I read, newest first
-- =====================================================================================================================
create or replace function public.rev_photos_list(p_project_id uuid, p_area_id uuid, p_room_id uuid, p_request_id uuid)
returns table (id uuid, version int, area_id uuid, room_id uuid, request_id uuid, ir_number int, ofs_number int,
               file_id uuid, file_name text, note text, created_at timestamptz, by_name text, mine boolean,
               can_remove boolean, locked boolean, via_request boolean)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
begin
  perform public.rev_need(p_project_id, 'revs.read');
  if num_nonnulls(p_area_id, p_room_id, p_request_id) <> 1 then
    raise exception 'A wall, a room or a request.' using errcode = '22023';
  end if;
  return query
    select p.id, p.version, p.area_id, p.room_id, p.request_id, q.number, q.ofs_number, f.id, f.original_name, p.note,
           p.created_at, coalesce(public.ir_person_name(p.created_by), 'Someone'), p.created_by = auth.uid(),
           public.rev_photo_removable(p.project_id, p.created_by, p.request_id), p.request_id is not null and public.rev_photo_decided(p.request_id),
           f.id is not null and p.request_id is not null and p.created_by <> auth.uid() and not public.folder_can_read(f.folder_id)
      from public.rev_photos p
      left join public.files f on f.id = p.file_id and f.deleted_at is null and f.scan_status <> 'infected'
      left join public.inspection_requests q on q.id = p.request_id
     where p.project_id = p_project_id and p.deleted_at is null
       and (p.file_id is null or f.id is not null)
       and public.rev_photo_may_see(p.project_id, p.created_by, p.request_id)
       and (p.area_id = p_area_id
            or p.request_id = p_request_id
            or p.room_id = p_room_id
            or p.area_id in (select w.area_id from public.rev_room_walls w where w.room_id = p_room_id and w.deleted_at is null))
     order by p.created_at desc, p.id desc;
end;
$$;

-- =====================================================================================================================
-- A live photo's file is never deleted on its own (a request's record keeps its photos)
-- =====================================================================================================================
create or replace function public.tg_files_rev_photo()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if exists (select 1 from public.rev_photos p where p.file_id = old.id and p.deleted_at is null) then
    raise exception 'This photo is on a wall. Remove it there.' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger rev_photo_keep before update of deleted_at on public.files
  for each row when (old.deleted_at is null and new.deleted_at is not null)
  execute function public.tg_files_rev_photo();

-- =====================================================================================================================
-- A request's wall photos open through the request (0061's gate, plus them)
-- =====================================================================================================================
create or replace function public.authorize_ir_file(p_request_id uuid, p_file_id uuid)
returns table(storage_path text, original_name text, mime text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare r public.inspection_requests; m public.ir_maps; f public.files; hdrs jsonb; v_server boolean; v_listed boolean;
        v_wall boolean;
begin
  select * into r from public.inspection_requests where id = p_request_id and deleted_at is null;
  if r.id is null or not public.ir_may_see(r.project_id, r.requested_by, r.kind, r.ofs_sent_at) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  select * into m from public.ir_maps where request_id = r.id;
  select * into f from public.files where id = p_file_id and project_id = r.project_id and deleted_at is null;
  -- The IR PDF and the map are server-made, the sheet was checked when it was picked.
  v_server := coalesce(p_file_id = r.ir_file_id, false) or coalesce(p_file_id = m.map_file_id, false)
              or coalesce(p_file_id = m.sheet_file_id, false);
  -- A photo of a wall on this request (0102), kept in Wall photos.
  v_wall := exists (select 1 from public.rev_photos p where p.request_id = r.id and p.file_id = p_file_id and p.deleted_at is null);
  v_listed := coalesce(p_file_id = any (r.attachment_ids), false) or coalesce(p_file_id = any (r.result_photo_ids), false)
              or coalesce(f.created_by = auth.uid(), false);
  if not (v_server or v_listed or v_wall) then raise exception 'forbidden' using errcode = '42501'; end if;
  if f.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  -- Anything else must be a request file in the attachments folder.
  if not v_server and not v_wall and f.folder_id is distinct from public.ir_attach_folder_id(r.project_id) then
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
-- Grants: the RPCs people call, the policy's helper, the rest internal.
-- =====================================================================================================================
do $$
declare f text;
begin
  foreach f in array array[
    'public.rev_photos_folder(uuid)', 'public.rev_photo_add(uuid, uuid, uuid, uuid, uuid, text)',
    'public.rev_photo_remove(uuid, integer)', 'public.rev_photo_restore(uuid)', 'public.rev_photo_may_add(uuid, uuid)',
    'public.rev_photos_list(uuid, uuid, uuid, uuid)', 'public.rev_photo_may_see(uuid, uuid, uuid)']
  loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
  foreach f in array array[
    'public.rev_photo_adder(uuid)', 'public.rev_photo_decided(uuid)', 'public.rev_photo_on_request(uuid)',
    'public.rev_photo_removable(uuid, uuid, uuid)', 'public.rev_photos_folder_id(uuid)',
    'public.rev_photo_lock(uuid, integer)']
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
  execute 'revoke execute on function public.tg_files_rev_photo() from public, anon, authenticated';
end $$;
