-- 0074 The file viewer, and file Delete / Rename in Files (Oct 4 audit, files.md findings 1, 2, 3, 6).
--   1. PDF previews. authorize_preview (0047, audited in 0054) answered images only, so the app could show a photo but
--      never a PDF. It now answers PDFs too (an application/pdf mime AND a .pdf name), through the very same gate as the
--      download of that file (its folder, or the RFI or inspection request it is opened through), still not a download
--      (no downloads row, the gate's own line is undone), with the same 'file.preview' audit line. Anything else is
--      refused with not_image as before. The download edge function signs the URL, pdf.js in the app reads it.
--   2. Signed records stay on file. A server-made record (a daily report's PDF, an IR PDF, an RFI PDF, an IR map, a
--      safety sign-in sheet, a stamped approved sheet), and every earlier version of it, can't be deleted, renamed or
--      moved by anyone through the API. Before this only the stamped sets (0053) and sign-in sheets (0060) were kept, an
--      author could soft-delete their own submitted daily PDF (the uploader update policy, 0005), and then Download
--      failed. file_kept() is the one answer, a trigger refuses direct writes by people (current_user authenticated or
--      anon), the way tg_permit_folders_keep does (0053). The server's own functions (Delete PDF & start over, a submit
--      that could not finish) run as their owner or the server key and still can.
--   3. Delete and Rename in Files: file_remove (soft delete) and file_rename, by the uploader (still on the job) or
--      files.manage, the same people the update policy lets change a file, never for a kept record, never in the
--      server's folders, with a version check. file_can_change answers the same question for the screen, so Delete
--      and Rename show only when they would work. Undo (file_restore) brings a file back for the person who deleted it,
--      within the hour, nothing the server took away comes back that way.
--   Nothing else changes: who reads and downloads files, the column grants and the policies stay as they are.

-- =====================================================================================================================
-- 1. Previews: images and PDFs
-- =====================================================================================================================
create or replace function public.authorize_preview(p_file_id uuid, p_rfi_id uuid default null, p_request_id uuid default null)
returns table (storage_path text, original_name text, mime text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare v_path text; v_name text; v_mime text; v_project uuid; v_org uuid;
begin
  if p_rfi_id is not null and p_request_id is not null then
    raise exception 'An RFI or a request, not both.' using errcode = '22023';
  end if;
  begin
    if p_rfi_id is not null then
      select a.storage_path, a.original_name, a.mime into v_path, v_name, v_mime
        from public.rfi_authorize_file(p_rfi_id, p_file_id) a;
    elsif p_request_id is not null then
      select a.storage_path, a.original_name, a.mime into v_path, v_name, v_mime
        from public.authorize_ir_file(p_request_id, p_file_id) a;
    else
      select a.storage_path, a.original_name, a.mime into v_path, v_name, v_mime
        from public.authorize_download(p_file_id, 'original') a;
    end if;
    -- The gate said yes. Undo what it wrote (the downloads row, the audit event): a preview is not a download.
    raise exception 'preview, not a download' using errcode = 'PV001';
  exception when sqlstate 'PV001' then
    null;
  end;
  if v_path is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not ((lower(v_mime) in ('image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif')
           and lower(v_name) ~ '\.(jpe?g|png|webp|heic|heif)$')
          or (lower(v_mime) = 'application/pdf' and lower(v_name) ~ '\.pdf$')) then
    raise exception 'not_image' using errcode = '42501';
  end if;
  select f.project_id, f.org_id into v_project, v_org from public.files f where f.id = p_file_id;
  perform public.audit('file.preview', 'file', p_file_id, v_project, v_org,
    jsonb_build_object('via', case when p_rfi_id is not null then 'rfi' when p_request_id is not null then 'request'
                                   else 'folder' end,
                       'rfi_id', p_rfi_id, 'request_id', p_request_id));
  return query select v_path, v_name, v_mime;
end;
$$;

-- =====================================================================================================================
-- 2. Signed records stay on file
-- =====================================================================================================================
-- Is this file (or any version of it) a server-made record? Reads the records whoever asks (a manager must not delete
-- another author's daily PDF just because he can't read that report). Answers true / false only, and to a person only
-- for a file they can see.
create or replace function public.file_kept(p_file_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case when auth.uid() is not null
                   and not exists (select 1 from public.files f where f.id = p_file_id
                                      and public.file_may_see(f.project_id, f.created_by, f.folder_id))
              then false
         else coalesce((
    select bool_or(exists (select 1 from public.daily_reports d where d.pdf_file_id = g.id)
                or exists (select 1 from public.inspection_requests r where r.ir_file_id = g.id)
                or exists (select 1 from public.rfis r where r.pdf_file_id = g.id)
                or exists (select 1 from public.ir_maps m where m.map_file_id = g.id)
                or exists (select 1 from public.safety_meetings m where m.pdf_file_id = g.id)
                or exists (select 1 from public.permit_approved_sets s where s.stamped_file_id = g.id)
                or exists (select 1 from public.permit_stamped_copies c where c.stamped_file_id = g.id))
      from public.files f
      join public.files g on g.version_group_id = f.version_group_id
     where f.id = p_file_id), false) end;
$$;
revoke execute on function public.file_kept(uuid) from public, anon;
-- The keep trigger runs as the person writing (it is not SECURITY DEFINER, so it can tell a person from the server),
-- and it asks this.
grant execute on function public.file_kept(uuid) to authenticated, service_role;

create index if not exists daily_reports_pdf_file on public.daily_reports (pdf_file_id) where pdf_file_id is not null;
create index if not exists inspection_requests_ir_file on public.inspection_requests (ir_file_id) where ir_file_id is not null;
create index if not exists rfis_pdf_file on public.rfis (pdf_file_id) where pdf_file_id is not null;
create index if not exists ir_maps_map_file on public.ir_maps (map_file_id) where map_file_id is not null;
create index if not exists safety_meetings_pdf_file on public.safety_meetings (pdf_file_id) where pdf_file_id is not null;
create index if not exists permit_approved_sets_stamped_file on public.permit_approved_sets (stamped_file_id);

-- People can't delete, rename or move a record. Not SECURITY DEFINER on purpose (0030's rule): current_user is
-- 'authenticated' for a person's own write, and the owner inside the server's functions.
create or replace function public.tg_files_keep_records()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if current_user in ('authenticated', 'anon')
     and ((new.deleted_at is not null and old.deleted_at is null)
          or new.original_name is distinct from old.original_name
          or new.folder_id is distinct from old.folder_id)
     and public.file_kept(old.id) then
    raise exception 'A signed record stays on file.' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke execute on function public.tg_files_keep_records() from public, anon, authenticated;
create trigger keep_records before update of deleted_at, original_name, folder_id on public.files
  for each row execute function public.tg_files_keep_records();

-- =====================================================================================================================
-- 3. Delete and Rename in Files
-- =====================================================================================================================
-- The one rule: a finished, live file, by its uploader (still on the job) or files.manage, not a record, not in the
-- server's folders. Raises the reason, file_can_change turns it into true / false.
create or replace function public.file_change_check(p_file_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare f public.files;
begin
  select * into f from public.files where id = p_file_id and deleted_at is null;
  -- A file the caller can't see answers like one that is not there.
  if f.id is null or auth.uid() is null or not public.file_may_see(f.project_id, f.created_by, f.folder_id) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if not ((f.created_by = auth.uid() and public.is_member(f.project_id)) or public.has_capability(f.project_id, 'files.manage')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if not f.upload_complete then raise exception 'That file is still uploading.' using errcode = '42501'; end if;
  if public.file_kept(f.id) then raise exception 'A signed record stays on file.' using errcode = '42501'; end if;
  if public.folder_server_only(f.folder_id) then raise exception 'Only the server changes this folder.' using errcode = '42501'; end if;
end;
$$;
revoke execute on function public.file_change_check(uuid) from public, anon, authenticated;

create or replace function public.file_can_change(p_file_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.file_change_check(p_file_id);
  return true;
exception when sqlstate '42501' or sqlstate 'P0002' then
  return false;
end;
$$;
revoke execute on function public.file_can_change(uuid) from public, anon;
grant execute on function public.file_can_change(uuid) to authenticated;

-- Delete (soft). Safe to repeat: a file already gone (by this or an earlier call) is fine.
create or replace function public.file_remove(p_file_id uuid, p_version int)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare f public.files;
begin
  select * into f from public.files where id = p_file_id;
  if f.id is not null and f.deleted_at is not null and public.is_member(f.project_id)
     and ((f.created_by = auth.uid()) or public.has_capability(f.project_id, 'files.manage')) then
    return;
  end if;
  perform public.file_change_check(p_file_id);
  select * into f from public.files where id = p_file_id for update;
  if f.version <> p_version then raise exception 'version_conflict' using errcode = '40001'; end if;
  update public.files set deleted_at = now() where id = f.id;
  -- Who deleted it and when: what Undo (file_restore) checks.
  perform public.audit('file.remove', 'file', f.id, f.project_id, f.org_id, jsonb_build_object('name', f.original_name));
end;
$$;
revoke execute on function public.file_remove(uuid, int) from public, anon;
grant execute on function public.file_remove(uuid, int) to authenticated;

-- Undo of a Delete: only the person whose file_remove deleted it, within an hour, while they may still change it. A file
-- the server took away (an unfinished upload, Delete PDF & start over) is never brought back here. Safe to repeat.
create or replace function public.file_restore(p_file_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare f public.files;
begin
  select * into f from public.files where id = p_file_id for update;
  if f.id is null or auth.uid() is null or not public.is_member(f.project_id) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if f.deleted_at is null then return; end if;
  if not exists (select 1 from public.audit_events a
                  where a.entity_id = f.id and a.action = 'file.remove' and a.actor_user_id = auth.uid()
                    and a.occurred_at = f.deleted_at)
     or f.deleted_at < now() - interval '1 hour' then
    raise exception 'That file can''t be brought back here.' using errcode = '42501';
  end if;
  if not ((f.created_by = auth.uid()) or public.has_capability(f.project_id, 'files.manage')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.files set deleted_at = null where id = f.id;
  perform public.audit('file.restore', 'file', f.id, f.project_id, f.org_id, jsonb_build_object('name', f.original_name));
end;
$$;
revoke execute on function public.file_restore(uuid) from public, anon;
grant execute on function public.file_restore(uuid) to authenticated;

-- Rename: the name people see and download under (the stored object's path never changes). Returns the new version.
create or replace function public.file_rename(p_file_id uuid, p_version int, p_name text)
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare f public.files; v_name text := btrim(coalesce(p_name, '')); v_version int;
begin
  if length(v_name) not between 1 and 400 then raise exception 'Give the file a name.' using errcode = '23514'; end if;
  if v_name ~ '[/\\[:cntrl:]]' then raise exception 'A file name can''t hold a slash.' using errcode = '23514'; end if;
  perform public.file_change_check(p_file_id);
  select * into f from public.files where id = p_file_id for update;
  if f.version <> p_version then raise exception 'version_conflict' using errcode = '40001'; end if;
  if v_name = f.original_name then return f.version; end if;
  update public.files set original_name = v_name where id = f.id returning version into v_version;
  return v_version;
end;
$$;
revoke execute on function public.file_rename(uuid, int, text) from public, anon;
grant execute on function public.file_rename(uuid, int, text) to authenticated;
