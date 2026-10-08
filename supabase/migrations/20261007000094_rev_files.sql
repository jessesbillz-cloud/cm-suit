-- 0094 Revs files without a black hole (Jesse, Oct 7: "I don't want that to turn into a black hole of just dumping
-- documents in"). 0083 linked a room's picture and a sign-off's OFS IR by name after someone dragged them into Files.
-- Now they are added from Revs and kept in the app's own folders, and the walls find their plan sheet by number.
--   * Two app folders, made on first use by rev_files_folder (revs.manage): "Room pictures" at the top of the job and
--     "OFS history" under Reports (the OFS IRs signed before the app, beside "OFS inspection reports"). Each has its own
--     access list: revs.manage reads and adds, files.manage reads. Both names are the server's (folder_name_reserved
--     carries the whole list, 0078's plus these two). folder_marks counts "Room pictures" among the app's folders, so
--     Files hides it while empty, shows a lock and has no Upload in it (OFS history is under Reports, already one).
--   * rev_file_link (revs.manage): one file just added, linked at once by 0083's rules. A picture to every room whose
--     image name it carries (when it is the newest such file, rev_room_image_of), an OFS IR to every sign-off whose
--     number its name carries (rev_signoff_file_of, the rule rev_signoffs_link_files now calls too). Answers how many
--     rooms and sign-offs now show it, so the app can say what matched and what didn't.
--   * rev_room_image_set (revs.manage, version-checked): a room's picture from its own page, added or replaced. The
--     room takes the file's name as its image name, so Link files keeps it. A null file with the old name is the Undo.
--   * rev_walls_link_sheets (revs.manage): each wall with a sheet number (sheet_ref) and no live sheet gets the newest
--     PDF in the job's Plans folder (or a folder under it) whose name starts with that number followed by a space, an
--     underscore, a hyphen or a dot (A201A matches "A201A Floor Plan.pdf", never "A201AB.pdf" and A201 never matches
--     "A201A ..."). The file is live, finished, not replaced and its scan is done and clean. A wall on another live
--     sheet is left alone, a wall whose sheet was removed gets the match. Answers {linked, missing: [numbers]}.
--   * A plan PDF finishing in Plans links the walls waiting for it (tg_files_rev_sheet, once its scan is done), so a
--     sheet uploaded from Revs or from Files lands on its walls without a second step.
-- Nothing is dropped. folder_name_reserved, folder_marks and rev_signoffs_link_files are re-made with every earlier
-- answer kept (create or replace keeps their grants).

-- =====================================================================================================================
-- The app's folders for Revs
-- =====================================================================================================================
-- Same as 0078 plus "Room pictures" at the top and "OFS history" under Reports.
create or replace function public.folder_name_reserved(p_project_id uuid, p_parent_id uuid, p_name text)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select case
    when p_parent_id is null then btrim(p_name) in ('Bids received', 'Inspection requests', 'Delivery tickets', 'Emailed in',
                                                     'Bid forms', 'RFIs', 'Approved plans', 'Safety', 'Schedule', 'Requirements',
                                                     'Room pictures')
    else btrim(p_name) = any (case (select kind from public.folders where id = p_parent_id and project_id = p_project_id)
                                when 'reports' then array['Inspection reports', 'OFS inspection reports', 'Corrections', 'OFS history']
                                when 'photos' then array['Corrections'] end)
  end;
$$;

-- Same as 0092 plus "Room pictures" (OFS history is a Reports folder, so it is the app's already).
create or replace function public.folder_marks(p_project_id uuid)
returns table (folder_id uuid, app_only boolean, person text, file_count integer)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with f as (
    select fo.id, fo.kind, public.folder_person(fo.id) as person,
           (fo.kind in ('reports', 'inbound', 'bids_received', 'rfis', 'approved_plans', 'stamping')
            or (fo.parent_id is null and fo.kind = 'general' and fo.name in ('Inspection requests', 'Room pictures'))
            or (fo.kind = 'photos' and fo.name in ('Corrections', 'Delivery tickets'))) as by_kind
      from public.folders fo
     where fo.project_id = p_project_id and fo.deleted_at is null
  )
  select f.id, f.by_kind or f.person is not null, f.person,
         case when f.by_kind or f.person is not null or f.kind = 'ti' then
           (select count(*)::integer from public.files x
             where x.folder_id = f.id and x.deleted_at is null and x.superseded_by is null and x.upload_complete) end
    from f;
$$;

-- The folder a manager adds to: 'pictures' (Room pictures) or 'history' (Reports / OFS history), made on first use with
-- its own access list (one people already changed is left as they set it), brought back if it was removed.
create or replace function public.rev_files_folder(p_project_id uuid, p_which text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_org uuid; v_parent uuid; v_name text; v_kind text; v_id uuid;
begin
  perform public.rev_need(p_project_id, 'revs.manage');
  if p_which is null or p_which not in ('pictures', 'history') then
    raise exception 'The folder is pictures or history.' using errcode = '22023';
  end if;
  select org_id into v_org from public.projects where id = p_project_id and deleted_at is null;
  if v_org is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  perform pg_advisory_xact_lock(hashtext('rev_files_folder:' || p_project_id::text || ':' || p_which));
  if p_which = 'pictures' then
    v_name := 'Room pictures'; v_kind := 'general';
  else
    v_name := 'OFS history'; v_kind := 'reports';
    select id into v_parent from public.folders
     where project_id = p_project_id and parent_id is null and kind = 'reports' and deleted_at is null
     order by created_at limit 1;
    if v_parent is null then
      insert into public.folders (org_id, project_id, name, kind, created_by)
      values (v_org, p_project_id, 'Reports', 'reports', auth.uid())
      on conflict (project_id, parent_id, name) do update set deleted_at = null
      returning id into v_parent;
    end if;
  end if;
  select id into v_id from public.folders
   where project_id = p_project_id and parent_id is not distinct from v_parent and name = v_name
   order by (deleted_at is null) desc, created_at limit 1;
  if v_id is null then
    insert into public.folders (org_id, project_id, parent_id, name, kind, created_by)
    values (v_org, p_project_id, v_parent, v_name, v_kind, auth.uid())
    returning id into v_id;
  end if;
  update public.folders set deleted_at = null where id = v_id and deleted_at is not null;
  if not exists (select 1 from public.folder_access where folder_id = v_id) then
    insert into public.folder_access (folder_id, capability, can_read, can_write, created_by) values
      (v_id, 'revs.manage', true, true, auth.uid()),
      (v_id, 'files.manage', true, false, auth.uid())
    on conflict do nothing;
  end if;
  return v_id;
end;
$$;

-- =====================================================================================================================
-- Sign-offs: the OFS IR of a number, one rule
-- =====================================================================================================================
-- Does the file name carry this OFS number (0083: OFS_IR_0041 or _OFS_0041_, four digits below 10000)?
create or replace function public.rev_ofs_name_has(p_name text, p_ofs int)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select p_name ~* ('OFS_IR_' || n || '([^0-9]|$)') or p_name ~* ('_OFS_' || n || '_')
    from (select case when p_ofs < 10000 then lpad(p_ofs::text, 4, '0') else p_ofs::text end as n) x;
$$;

-- The job's file for an OFS number (0083's rule): a PDF or a picture, finished, live, not infected, in a folder the
-- caller may read (or their own), an Attachment or a name starting OFS_IR first, then the latest.
create or replace function public.rev_signoff_file_of(p_project_id uuid, p_ofs int)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select f.id
    from public.files f
   where f.project_id = p_project_id and f.deleted_at is null and f.upload_complete and f.scan_status <> 'infected'
     and (lower(f.mime) = 'application/pdf' or lower(f.mime) in ('image/jpeg', 'image/png', 'image/webp'))
     and public.rev_ofs_name_has(f.original_name, p_ofs)
     and public.file_may_see(f.project_id, f.created_by, f.folder_id)
   order by (f.original_name ~* 'attachment' or f.original_name ~* '^OFS_IR') desc, f.created_at desc, f.id desc
   limit 1;
$$;

-- Same answers as 0083, the file found by rev_signoff_file_of.
create or replace function public.rev_signoffs_link_files(p_project_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare s public.rev_signoffs; v_file uuid; v_linked int := 0; v_missing int[] := '{}';
begin
  perform public.rev_need(p_project_id, 'revs.manage');
  for s in select x.* from public.rev_signoffs x
             join public.rev_areas a on a.id = x.area_id and a.deleted_at is null
            where x.project_id = p_project_id and x.deleted_at is null and x.ofs_number is not null
            order by x.ofs_number, x.id for update of x loop
    v_file := public.rev_signoff_file_of(p_project_id, s.ofs_number);
    if v_file is null then
      if not (s.ofs_number = any (v_missing)) then v_missing := v_missing || s.ofs_number; end if;
    elsif v_file is distinct from s.file_id then
      update public.rev_signoffs set file_id = v_file where id = s.id;
      v_linked := v_linked + 1;
    end if;
  end loop;
  return jsonb_build_object('linked', v_linked, 'missing', to_jsonb(v_missing));
end;
$$;

-- =====================================================================================================================
-- One file just added, linked at once (revs.manage)
-- =====================================================================================================================
-- A picture goes to every live room (of a live list) whose image name is the file's name, when it is the room's file by
-- 0083's rule (the newest of that name). An OFS IR goes to every live sign-off (on a live wall) whose number its name
-- carries, when it is that number's file by the same rule as Link files. The same call again changes nothing.
-- Answers {rooms, signoffs}: how many now show this file (0 and 0: not matched).
create or replace function public.rev_file_link(p_file_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare f public.files; room public.rev_rooms; v_num int; v_rooms int := 0; v_signoffs int := 0; n int;
begin
  select * into f from public.files where id = p_file_id and deleted_at is null;
  if f.id is null or auth.uid() is null or not public.has_capability(f.project_id, 'revs.read')
     or not public.file_may_see(f.project_id, f.created_by, f.folder_id) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  perform public.rev_need(f.project_id, 'revs.manage');

  for room in select r.* from public.rev_rooms r
                join public.rev_lists l on l.id = r.list_id and l.deleted_at is null
               where r.project_id = f.project_id and r.deleted_at is null and r.image_name is not null
                 and lower(btrim(r.image_name)) = lower(f.original_name)
               order by r.id for update of r loop
    if public.rev_room_image_of(f.project_id, room.image_name) = f.id then
      v_rooms := v_rooms + 1;
      if room.image_file_id is distinct from f.id then
        update public.rev_rooms set image_file_id = f.id where id = room.id;
      end if;
    end if;
  end loop;

  if f.original_name ~* 'OFS' then
    for v_num in select distinct s.ofs_number from public.rev_signoffs s
                   join public.rev_areas a on a.id = s.area_id and a.deleted_at is null
                  where s.project_id = f.project_id and s.deleted_at is null and s.ofs_number is not null
                  order by s.ofs_number loop
      continue when not public.rev_ofs_name_has(f.original_name, v_num);
      continue when public.rev_signoff_file_of(f.project_id, v_num) is distinct from f.id;
      perform 1 from public.rev_signoffs s
        join public.rev_areas a on a.id = s.area_id and a.deleted_at is null
       where s.project_id = f.project_id and s.deleted_at is null and s.ofs_number = v_num
       order by s.id for update of s;
      update public.rev_signoffs s set file_id = f.id
        from public.rev_areas a
       where a.id = s.area_id and a.deleted_at is null
         and s.project_id = f.project_id and s.deleted_at is null and s.ofs_number = v_num and s.file_id is distinct from f.id;
      select count(*)::int into n from public.rev_signoffs s
        join public.rev_areas a on a.id = s.area_id and a.deleted_at is null
       where s.project_id = f.project_id and s.deleted_at is null and s.ofs_number = v_num;
      v_signoffs := v_signoffs + n;
    end loop;
  end if;
  return jsonb_build_object('rooms', v_rooms, 'signoffs', v_signoffs);
end;
$$;

-- =====================================================================================================================
-- A room's picture from its page (revs.manage)
-- =====================================================================================================================
-- p_file_id: a picture of the job the caller may read (finished, live, not infected), the room's image now, its name the
-- room's image name. Null takes the picture off and puts p_image_name back (the Undo of the first one). Version-checked
-- when a version is given. The same again returns the room as it is.
create or replace function public.rev_room_image_set(p_room_id uuid, p_version int, p_file_id uuid, p_image_name text)
returns public.rev_rooms
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare r public.rev_rooms; f public.files; v_name text;
begin
  r := public.rev_room_lock(p_room_id);
  perform public.rev_version_ok(r.version, p_version);
  if p_file_id is not null then
    select * into f from public.files x
     where x.id = p_file_id and x.project_id = r.project_id and x.deleted_at is null and x.upload_complete
       and x.scan_status <> 'infected' and lower(x.mime) in ('image/jpeg', 'image/png', 'image/webp')
       and public.file_may_see(x.project_id, x.created_by, x.folder_id);
    if f.id is null then raise exception 'Pick a picture of this job.' using errcode = '22023'; end if;
    v_name := f.original_name;
  else
    v_name := nullif(public.rev_clean(p_image_name), '');
  end if;
  if length(v_name) > 400 then raise exception 'Keep the image name to 400 characters.' using errcode = '22023'; end if;
  if (p_file_id, v_name) is not distinct from (r.image_file_id, r.image_name) then return r; end if;
  update public.rev_rooms set image_file_id = p_file_id, image_name = v_name where id = r.id returning * into r;
  return r;
end;
$$;

-- =====================================================================================================================
-- Walls find their plan sheet by number
-- =====================================================================================================================
-- Is the folder the job's Plans folder (a top folder of kind plans) or under it? A removed folder on the way breaks it.
create or replace function public.rev_in_plans(p_folder_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with recursive up as (
    select f.id, f.parent_id, f.kind, 0 as depth from public.folders f where f.id = p_folder_id and f.deleted_at is null
    union all
    select f.id, f.parent_id, f.kind, up.depth + 1 from public.folders f join up on f.id = up.parent_id
     where up.depth < 32 and f.deleted_at is null
  )
  select exists (select 1 from up where up.parent_id is null and up.kind = 'plans');
$$;

-- The sheet of a number: the newest PDF in Plans whose name is the number then a space, _, - or . (case aside), live,
-- finished, not replaced by a newer version, its scan done and clean. p_reader: only one the caller may read.
create or replace function public.rev_sheet_file_of(p_project_id uuid, p_ref text, p_reader boolean)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select f.id
    from public.files f, (select btrim(coalesce(p_ref, '')) as r) x
   where length(x.r) > 0 and f.project_id = p_project_id and f.deleted_at is null and f.upload_complete
     and f.superseded_by is null and f.mime = 'application/pdf' and f.scan_status in ('clean', 'too_large_to_scan')
     and lower(left(f.original_name, length(x.r))) = lower(x.r)
     and substr(f.original_name, length(x.r) + 1, 1) in (' ', '_', '-', '.')
     and public.rev_in_plans(f.folder_id)
     and (not coalesce(p_reader, true) or public.file_may_see(f.project_id, f.created_by, f.folder_id))
   order by f.created_at desc, f.id desc
   limit 1;
$$;

-- Each live wall (of a live list) with a sheet number and no live sheet gets its number's sheet. p_file_id: only walls
-- whose sheet that file is (a plan just finished). Answers {linked: walls given a sheet, missing: [numbers with none]}.
create or replace function public.rev_walls_sheets_fill(p_project_id uuid, p_file_id uuid, p_reader boolean)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare a public.rev_areas; v_ref text; v_file uuid; v_linked int := 0; v_missing text[] := '{}';
begin
  for a in select x.* from public.rev_areas x
             join public.rev_lists l on l.id = x.list_id and l.deleted_at is null
             left join public.files cur on cur.id = x.sheet_file_id and cur.deleted_at is null
            where x.project_id = p_project_id and x.deleted_at is null and length(btrim(coalesce(x.sheet_ref, ''))) > 0
              and cur.id is null
            order by x.id for update of x loop
    v_ref := btrim(a.sheet_ref);
    v_file := public.rev_sheet_file_of(p_project_id, v_ref, p_reader);
    continue when p_file_id is not null and v_file is distinct from p_file_id;
    if v_file is null then
      if not (upper(v_ref) = any (v_missing)) then v_missing := v_missing || upper(v_ref); end if;
    elsif v_file is distinct from a.sheet_file_id then
      update public.rev_areas set sheet_file_id = v_file where id = a.id;
      v_linked := v_linked + 1;
    end if;
  end loop;
  return jsonb_build_object('linked', v_linked,
    'missing', coalesce((select to_jsonb(array_agg(m order by m)) from unnest(v_missing) m), '[]'::jsonb));
end;
$$;

-- Setup's Link files (revs.manage): every wall waiting for its sheet, by the sheets the caller may read.
create or replace function public.rev_walls_link_sheets(p_project_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.rev_need(p_project_id, 'revs.manage');
  return public.rev_walls_sheets_fill(p_project_id, null, true);
end;
$$;

-- A plan PDF in Plans whose upload finished and whose scan is done and clean: the walls waiting for it get it.
create or replace function public.tg_files_rev_sheet()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if public.rev_in_plans(new.folder_id) then
    perform public.rev_walls_sheets_fill(new.project_id, new.id, false);
  end if;
  return null;
end;
$$;

create trigger rev_sheet_link after update of upload_complete, scan_status on public.files
  for each row
  when (new.mime = 'application/pdf' and new.upload_complete and new.deleted_at is null and new.superseded_by is null
        and new.scan_status in ('clean', 'too_large_to_scan')
        and (old.upload_complete is distinct from new.upload_complete or old.scan_status is distinct from new.scan_status))
  execute function public.tg_files_rev_sheet();

-- =====================================================================================================================
-- Grants: the RPCs people call, the helpers internal.
-- =====================================================================================================================
do $$
declare f text;
begin
  foreach f in array array[
    'public.rev_files_folder(uuid, text)', 'public.rev_file_link(uuid)',
    'public.rev_room_image_set(uuid, integer, uuid, text)', 'public.rev_walls_link_sheets(uuid)']
  loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
  foreach f in array array[
    'public.rev_ofs_name_has(text, integer)', 'public.rev_signoff_file_of(uuid, integer)',
    'public.rev_in_plans(uuid)', 'public.rev_sheet_file_of(uuid, text, boolean)',
    'public.rev_walls_sheets_fill(uuid, uuid, boolean)']
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
  execute 'revoke execute on function public.tg_files_rev_sheet() from public, anon, authenticated';
end $$;
