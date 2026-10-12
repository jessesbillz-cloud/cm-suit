-- 0100 RFI documents for the special inspector (Jesse, Oct 12: "specials still need to see rfi/submittals and plans").
-- 0099 opened RFIs' Uploaded folder to files.read_records, rfi.create_draft and rfi.answer, which left the special
-- inspector out with the fire marshal. One capability now says who reads the job's RFI documents:
--   * rfi.read_documents: every role that reads Plans and Specs (files.read_project) but the fire marshal ("the fire
--     marshal does not see every RFI"). Matrix data, changed later as data like any other row.
--   * RFIs' Uploaded folder reads it: added to the folders already made, and to the list files_rfi_uploads_make gives a
--     new one. The rows 0099 wrote stay (each is also covered by the new one).
-- Plans, Specs and Submittals the special inspector already reads (files.read_project, 0090 and 0099).

insert into public.role_permissions (role, capability, requires_aal2)
select rp.role, 'rfi.read_documents', false
  from public.role_permissions rp
 where rp.capability = 'files.read_project' and rp.role <> 'ahj'
on conflict do nothing;

-- The Uploaded folders already made.
insert into public.folder_access (folder_id, capability, can_read, can_write, created_by)
select fo.id, 'rfi.read_documents', true, false, fo.created_by
  from public.folders fo
  join public.folders r on r.id = fo.parent_id
 where fo.name = 'Uploaded' and fo.kind = 'general' and r.kind = 'rfis' and r.parent_id is null
   and exists (select 1 from public.folder_access fa where fa.folder_id = fo.id)
on conflict do nothing;

-- 0099's, with the new row.
create or replace function public.files_rfi_uploads_make(p_project_id uuid, p_rfis uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_org uuid; v_id uuid;
begin
  select org_id into v_org from public.projects where id = p_project_id;
  select fo.id into v_id from public.folders fo
   where fo.project_id = p_project_id and fo.parent_id = p_rfis and fo.name = 'Uploaded' and fo.kind = 'general';
  if v_id is null then
    insert into public.folders (org_id, project_id, parent_id, name, kind, sort, ai_reads, created_by)
    values (v_org, p_project_id, p_rfis, 'Uploaded', 'general', 10, true, auth.uid())
    on conflict do nothing
    returning id into v_id;
    -- A folder of that name of another kind in the way: no Uploaded folder.
    if v_id is null then return null; end if;
  else
    update public.folders set deleted_at = null where id = v_id and deleted_at is not null;
  end if;
  if not exists (select 1 from public.folder_access fa where fa.folder_id = v_id) then
    insert into public.folder_access (folder_id, capability, can_read, can_write, created_by) values
      (v_id, 'rfi.read_documents', true, false, auth.uid()),
      (v_id, 'files.read_records', true, false, auth.uid()),
      (v_id, 'rfi.create_draft', true, false, auth.uid()),
      (v_id, 'rfi.answer', true, false, auth.uid()),
      (v_id, 'files.write_project', true, true, auth.uid()),
      (v_id, 'files.manage', true, true, auth.uid());
  end if;
  return v_id;
end;
$$;
revoke execute on function public.files_rfi_uploads_make(uuid, uuid) from public, anon, authenticated;
