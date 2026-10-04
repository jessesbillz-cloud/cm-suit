-- 0065 Remove an upload that never finished (Jesse, Oct 3: "I wanted to stop and delete that 38-page PDF upload and I
-- can't do it").
--   * register_file makes the files row before the bytes go up. When storage refuses the file (too large) or the person
--     stops it, the row stays: upload_complete = false, nothing stored, shown to its uploader for ever.
--   * remove_unfinished_upload(file) takes it back: a soft delete, by the person who registered it only, only while
--     upload_complete is false. A finished file is never removed here. Safe to repeat. The row's own audit trigger
--     records the delete.
--   * Nothing else changes: who reads and writes files, register_file and the storage policies stay as they are (the
--     storage insert policy already refuses a removed row's path).
create or replace function public.remove_unfinished_upload(p_file_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare f public.files;
begin
  select * into f from public.files where id = p_file_id for update;
  -- Someone else's row answers like one that is not there.
  if f.id is null or auth.uid() is null or f.created_by is distinct from auth.uid() or not public.is_member(f.project_id) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if f.deleted_at is not null then return; end if;
  if f.upload_complete then
    raise exception 'That file finished uploading.' using errcode = '42501';
  end if;
  update public.files set deleted_at = now() where id = f.id;
end;
$$;
revoke execute on function public.remove_unfinished_upload(uuid) from public, anon;
grant execute on function public.remove_unfinished_upload(uuid) to authenticated;
