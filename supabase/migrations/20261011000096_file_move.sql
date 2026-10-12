-- 0096 Delete and Move on every row in Files (Jesse, Oct 11: "Definitely need a way to delete files out of here ...
-- just a black hole, just a dumping ground of files that aren't even organized"). Delete already exists (0074
-- file_remove, Undo file_restore). What was missing is a way to move a file, and a way for a whole list to know which
-- rows Delete and Move work on without asking once per row.
--   * file_move: a file goes to another folder of its job, with its earlier versions. Who may: the people who may
--     change the file (file_change_check, 0074: the uploader still on the job or files.manage, a finished live file,
--     never a signed record, never in the server's folders) AND may add to the folder it goes to (folder_can_write).
--     Never into a folder only the app fills, and never out of one (its tool finds the file there), except Emailed
--     in, which is a tray to sort from. Version-checked (40001), safe to repeat (a file already there answers its
--     version), audited 'file.move' with the folder it came from and the one it went to. Undo is the same move back.
--     The stored object keeps its key (the key is only a name, every read goes through the row).
--   * files_changeable: which of these files may I change, with each one's version (file_can_change for a whole list).
--   * my_writable_folders: the folders of a job I may add to (folder_can_write), for "Move to".
--   * folder_by_app / folder_app_only: folder_marks' rule for "only the app fills it", one implementation. folder_marks
--     is re-made on it with every earlier entry kept (create or replace keeps its grants).
-- No table changes, so nothing new for the server key (rule 1).

-- =====================================================================================================================
-- Only the app fills it
-- =====================================================================================================================
-- By the folder's own columns: the app's kinds, and the app's names where the kind is shared (0092, 0094).
create or replace function public.folder_by_app(p_kind text, p_parent_id uuid, p_name text)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select p_kind in ('reports', 'inbound', 'bids_received', 'rfis', 'approved_plans', 'stamping')
      or (p_parent_id is null and p_kind = 'general' and p_name in ('Inspection requests', 'Room pictures'))
      or (p_kind = 'photos' and p_name in ('Corrections', 'Delivery tickets'));
$$;
revoke execute on function public.folder_by_app(text, uuid, text) from public, anon;
grant execute on function public.folder_by_app(text, uuid, text) to authenticated, service_role;

-- One folder, as the system sees it: by its columns, or an author's daily folder.
create or replace function public.folder_app_only(p_folder_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((select public.folder_by_app(fo.kind, fo.parent_id, fo.name)
                          or exists (select 1 from public.daily_author_folders d where d.folder_id = fo.id)
                     from public.folders fo where fo.id = p_folder_id), false);
$$;
revoke execute on function public.folder_app_only(uuid) from public, anon, authenticated;
grant execute on function public.folder_app_only(uuid) to service_role;

-- Same as 0094, the app's folders now named by folder_by_app.
create or replace function public.folder_marks(p_project_id uuid)
returns table (folder_id uuid, app_only boolean, person text, file_count integer)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with f as (
    select fo.id, fo.kind, public.folder_person(fo.id) as person,
           public.folder_by_app(fo.kind, fo.parent_id, fo.name) as by_kind
      from public.folders fo
     where fo.project_id = p_project_id and fo.deleted_at is null
  )
  select f.id, f.by_kind or f.person is not null, f.person,
         case when f.by_kind or f.person is not null or f.kind = 'ti' then
           (select count(*)::integer from public.files x
             where x.folder_id = f.id and x.deleted_at is null and x.superseded_by is null and x.upload_complete) end
    from f;
$$;

-- =====================================================================================================================
-- Move
-- =====================================================================================================================
create or replace function public.file_move(p_file_id uuid, p_version int, p_folder_id uuid)
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare f public.files; fo public.folders; v_from_kind text; v_version int;
begin
  perform public.file_change_check(p_file_id);
  select * into f from public.files where id = p_file_id for update;
  select * into fo from public.folders where id = p_folder_id and deleted_at is null;
  if fo.id is null or not public.folder_can_read(fo.id) then raise exception 'not_found' using errcode = 'P0002'; end if;
  if fo.project_id <> f.project_id then raise exception 'That folder is in another job.' using errcode = '22023'; end if;
  -- Already there (this call, repeated): nothing to do.
  if f.folder_id = fo.id then return f.version; end if;
  if f.version <> p_version then raise exception 'version_conflict' using errcode = '40001'; end if;
  select kind into v_from_kind from public.folders where id = f.folder_id;
  if public.folder_app_only(f.folder_id) and v_from_kind <> 'inbound' then
    raise exception 'The app keeps this file in its folder.' using errcode = '42501';
  end if;
  if public.folder_app_only(fo.id) and fo.kind <> 'inbound' then
    raise exception 'Only the app adds to that folder.' using errcode = '42501';
  end if;
  if not public.folder_can_write(fo.id) then raise exception 'forbidden' using errcode = '42501'; end if;
  -- Its earlier versions go with it, so its pane still lists them for the same readers.
  update public.files set folder_id = fo.id
   where version_group_id = f.version_group_id and id <> f.id and folder_id = f.folder_id;
  update public.files set folder_id = fo.id where id = f.id returning version into v_version;
  perform public.audit('file.move', 'file', f.id, f.project_id, f.org_id,
    jsonb_build_object('name', f.original_name, 'from', f.folder_id, 'to', fo.id));
  return v_version;
end;
$$;
revoke execute on function public.file_move(uuid, int, uuid) from public, anon;
grant execute on function public.file_move(uuid, int, uuid) to authenticated;

-- =====================================================================================================================
-- What a list may offer
-- =====================================================================================================================
-- The files of this list I may change (Delete, Move, a checkbox), with each one's version. Runs as the caller.
create or replace function public.files_changeable(p_file_ids uuid[])
returns table (file_id uuid, version integer)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select f.id, f.version
    from public.files f
   where f.id = any (coalesce(p_file_ids, '{}'::uuid[])) and f.deleted_at is null and public.file_can_change(f.id);
$$;
revoke execute on function public.files_changeable(uuid[]) from public, anon;
grant execute on function public.files_changeable(uuid[]) to authenticated;

-- The folders of the job I read and may add to. Runs as the caller.
create or replace function public.my_writable_folders(p_project_id uuid)
returns table (folder_id uuid)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select fo.id from public.folders fo
   where fo.project_id = p_project_id and fo.deleted_at is null and public.folder_can_write(fo.id);
$$;
revoke execute on function public.my_writable_folders(uuid) from public, anon;
grant execute on function public.my_writable_folders(uuid) to authenticated;
