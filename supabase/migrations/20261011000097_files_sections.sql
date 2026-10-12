-- 0097 Files as fixed sections (Jesse, Oct 11: "That whole files page we need to redesign - it is completely
-- disorganized and a total mess"). The left card of Files is no longer a folder tree but the job's sections, in one
-- order: Plans, Specs, Submittals, RFIs, CCDs, Reports, Photos, then To sort, and Bids received and Emailed in while
-- something is in them. A section is a top-level folder with a kind, and the folders under it are its filter.
--   * Two new folder kinds: 'submittals' and 'unsorted' (To sort). Every earlier kind is kept. CCDs use the kind the
--     DSA folders already had ('ccd', "CCDs"), and RFIs the RFI tool's own folder ('rfis', made by rfi_folder, 0038),
--     so a job never gets a second one of either.
--   * files_sections(project): finds or makes the section folders and answers, for each section the caller reads, its
--     folder, the folders in it (the section's whole tree, the ones the caller reads) and how many files are in them.
--     Safe to repeat. A job that already has a top-level folder of people's own named like the section ("submittals",
--     "To sort", "CCDs") gets that folder adopted (its kind set, its proper name when that name is free), never a
--     second one. A missing RFIs folder is made the way rfi_folder makes it (same name, same access list).
--   * To sort holds the files outside every section: its own folder, and every other top-level folder of the job
--     (people's own folders, DSA 103, Testing and inspections) with what is under them. Folders another tool owns
--     (Room pictures, Inspection requests, Approved plans, Safety, Schedule ...) are not in Files at all.
-- Who may: a member of the job who reads its files (files.read_project, files.read_records, files.write_project,
-- files.manage, or a bidder on it). No table changes, so nothing new for the server key (rule 1).

alter table public.folders drop constraint folders_kind_check;
alter table public.folders add constraint folders_kind_check
  check (kind in ('general', 'plans', 'specs', 'reports', 'bids_received', 'inbound', 'photos', 'transmittals', 'system',
                  'dsa_103', 'ccd', 'ti', 'bid_forms', 'rfis', 'approved_plans', 'permit_uploads', 'stamping', 'safety',
                  'schedule', 'requirements', 'addenda', 'submittals', 'unsorted'));

-- =====================================================================================================================
-- Helpers (internal)
-- =====================================================================================================================
-- A top-level folder Files doesn't show: one only the app fills that is no section, or a folder another tool owns.
create or replace function public.files_hidden_root(p_folder_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((select public.folder_app_only(fo.id)
                          or fo.kind in ('approved_plans', 'stamping', 'permit_uploads', 'bid_forms', 'safety', 'schedule',
                                         'requirements', 'addenda', 'transmittals', 'system')
                     from public.folders fo where fo.id = p_folder_id), true);
$$;
revoke execute on function public.files_hidden_root(uuid) from public, anon, authenticated;

-- The live folders from this one down that the caller reads (itself first).
create or replace function public.files_subtree(p_root uuid)
returns uuid[]
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with recursive t as (
    select fo.id, 0 as depth from public.folders fo where fo.id = p_root and fo.deleted_at is null
    union all
    select fo.id, t.depth + 1 from public.folders fo join t on fo.parent_id = t.id where fo.deleted_at is null and t.depth < 32
  )
  select coalesce(array_agg(t.id order by t.depth), '{}'::uuid[]) from t where public.folder_can_read(t.id);
$$;
revoke execute on function public.files_subtree(uuid) from public, anon, authenticated;

-- The section's folder: the top-level folder of its kind (brought back if it was removed), else a top-level folder of
-- people's own named like it (adopted), else a new one.
create or replace function public.files_section_make(p_project_id uuid, p_kind text, p_name text, p_sort int, p_ai boolean,
                                                     p_aliases text[])
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_org uuid; v_id uuid;
begin
  select org_id into v_org from public.projects where id = p_project_id;
  select fo.id into v_id from public.folders fo
   where fo.project_id = p_project_id and fo.parent_id is null and fo.kind = p_kind
   order by (fo.deleted_at is null) desc, fo.created_at limit 1;
  if v_id is not null then
    update public.folders set deleted_at = null where id = v_id and deleted_at is not null;
    return v_id;
  end if;
  select fo.id into v_id from public.folders fo
   where fo.project_id = p_project_id and fo.parent_id is null and fo.kind = 'general'
     and lower(btrim(fo.name)) = any (p_aliases) and not public.folder_app_only(fo.id)
   order by (fo.deleted_at is null) desc, (fo.name = p_name) desc, fo.created_at limit 1;
  if v_id is not null then
    update public.folders fo
       set kind = p_kind, deleted_at = null,
           name = case when exists (select 1 from public.folders o where o.project_id = p_project_id and o.parent_id is null
                                       and o.name = p_name and o.id <> fo.id) then fo.name else p_name end
     where fo.id = v_id;
    return v_id;
  end if;
  insert into public.folders (org_id, project_id, name, kind, sort, ai_reads, created_by)
  values (v_org, p_project_id, p_name, p_kind, p_sort, p_ai, auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;
revoke execute on function public.files_section_make(uuid, text, text, int, boolean, text[]) from public, anon, authenticated;

-- =====================================================================================================================
-- The sections
-- =====================================================================================================================
create or replace function public.files_sections(p_project_id uuid)
returns table (kind text, folder_id uuid, file_count integer, folder_ids uuid[])
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_kinds text[] := array['plans', 'specs', 'submittals', 'rfis', 'ccd', 'reports', 'photos', 'unsorted', 'bids_received',
                          'inbound'];
  v_kind text; v_root uuid; v_roots uuid[] := '{}'; v_ids uuid[]; v_org uuid; v_rfis uuid;
begin
  select pr.org_id into v_org from public.projects pr where pr.id = p_project_id and pr.deleted_at is null;
  if v_org is null or auth.uid() is null or not public.is_member(p_project_id) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if not (public.has_capability(p_project_id, 'files.read_project') or public.has_capability(p_project_id, 'files.read_records')
          or public.has_capability(p_project_id, 'files.write_project') or public.has_capability(p_project_id, 'files.manage')
          or public.my_bidder_member_id(p_project_id) is not null) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- Make what is missing, once at a time per job (rfi_folder takes the same lock for the RFIs folder).
  perform pg_advisory_xact_lock(hashtext('files_sections:' || p_project_id::text));
  perform public.files_section_make(p_project_id, 'plans', 'Plans', 10, true, array['plans']);
  perform public.files_section_make(p_project_id, 'specs', 'Specs', 20, true, array['specs', 'specifications']);
  perform public.files_section_make(p_project_id, 'submittals', 'Submittals', 25, true, array['submittals', 'submittal']);
  perform public.files_section_make(p_project_id, 'ccd', 'CCDs', 40, true, array['ccds', 'ccd']);
  perform public.files_section_make(p_project_id, 'reports', 'Reports', 50, true, array['reports']);
  perform public.files_section_make(p_project_id, 'photos', 'Photos', 60, false, array['photos']);
  perform public.files_section_make(p_project_id, 'unsorted', 'To sort', 900, true, array['to sort']);
  perform pg_advisory_xact_lock(hashtext('rfi_folder:' || p_project_id::text));
  select fo.id into v_rfis from public.folders fo where fo.project_id = p_project_id and fo.kind = 'rfis'
   order by (fo.deleted_at is null) desc, fo.created_at limit 1;
  if v_rfis is null then
    insert into public.folders (org_id, project_id, name, kind, sort, ai_reads, created_by)
    values (v_org, p_project_id, 'RFIs', 'rfis', 70, true, auth.uid())
    on conflict do nothing
    returning id into v_rfis;
    -- A folder of that name in the way: the job goes without an RFIs section until rfi_folder says so.
    if v_rfis is not null then
      insert into public.folder_access (folder_id, capability, can_read, can_write, created_by) values
        (v_rfis, 'rfi.create_draft', false, true, auth.uid()),
        (v_rfis, 'rfi.sign_issue', true, false, auth.uid()),
        (v_rfis, 'rfi.answer', false, true, auth.uid());
    end if;
  else
    update public.folders set deleted_at = null where id = v_rfis and deleted_at is not null;
  end if;

  -- Each section's folder (the first live top-level one of its kind).
  foreach v_kind in array v_kinds loop
    select fo.id into v_root from public.folders fo
     where fo.project_id = p_project_id and fo.parent_id is null and fo.kind = v_kind and fo.deleted_at is null
     order by fo.created_at limit 1;
    if v_root is not null then v_roots := v_roots || v_root; end if;
  end loop;

  foreach v_kind in array v_kinds loop
    select fo.id into v_root from public.folders fo
     where fo.project_id = p_project_id and fo.parent_id is null and fo.kind = v_kind and fo.deleted_at is null
     order by fo.created_at limit 1;
    continue when v_root is null or not public.folder_can_read(v_root);
    v_ids := public.files_subtree(v_root);
    if v_kind = 'unsorted' then
      v_ids := v_ids || coalesce((
        select array_agg(t.id)
          from public.folders fo
          cross join lateral unnest(public.files_subtree(fo.id)) as t (id)
         where fo.project_id = p_project_id and fo.parent_id is null and fo.deleted_at is null
           and fo.id <> all (v_roots) and not public.files_hidden_root(fo.id)), '{}'::uuid[]);
    end if;
    kind := v_kind;
    folder_id := v_root;
    folder_ids := v_ids;
    file_count := (select count(*)::integer from public.files x
                    where x.folder_id = any (v_ids) and x.deleted_at is null and x.superseded_by is null and x.upload_complete);
    return next;
  end loop;
end;
$$;
revoke execute on function public.files_sections(uuid) from public, anon;
grant execute on function public.files_sections(uuid) to authenticated;
