-- 0111 CCDs on DSA jobs only (Jesse, Oct 23: "No CCDs on a CSU job, DSA only - it's in the Files section"). A CCD is
-- a DSA form (Construction Change Document). A CSU / OFS job never has one.
--   * files_sections (0099, copied exactly, changed only here): the CCDs section is made and listed only when the job
--     is a DSA job (projects.is_dsa, set on the New job form or in Job settings). A DSA job's CCDs are as before.
--   * Not a DSA job: no CCD folder is made, and none of people's own is adopted. A CCD folder the job already has
--     (0097 made one on every job, or DSA was turned off) is never moved or removed. It is simply not a section. While
--     files are in it, it shows in To sort with its files (none is hidden). Empty, it shows nowhere.
--   * Turning DSA on brings the section back with the same folder.
-- No role_permissions rows change. No table changes, so nothing new for the server key (rule 1).

create or replace function public.files_sections(p_project_id uuid)
returns table (kind text, folder_id uuid, file_count integer, folder_ids uuid[])
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_kinds text[] := array['plans', 'specs', 'submittals', 'rfis', 'ccd', 'reports', 'photos', 'unsorted', 'bids_received',
                          'inbound'];
  v_kind text; v_root uuid; v_roots uuid[] := '{}'; v_ids uuid[]; v_org uuid; v_rfis uuid; v_dsa boolean;
begin
  select pr.org_id, pr.is_dsa into v_org, v_dsa from public.projects pr where pr.id = p_project_id and pr.deleted_at is null;
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
  -- CCDs are a DSA form: only a DSA job has the section (0111).
  if v_dsa then perform public.files_section_make(p_project_id, 'ccd', 'CCDs', 40, true, array['ccds', 'ccd']); end if;
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
  if v_rfis is not null then perform public.files_rfi_uploads_make(p_project_id, v_rfis); end if;

  -- Each section's folder (the first live top-level one of its kind).
  -- Not a DSA job: no CCDs section (0111). Its CCD folder, if it has one, is not a section's.
  if not v_dsa then v_kinds := array_remove(v_kinds, 'ccd'); end if;
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
    -- A section needs its own folder read, but RFIs: its Uploaded folder is enough.
    continue when v_root is null or (v_kind <> 'rfis' and not public.folder_can_read(v_root));
    v_ids := public.files_subtree(v_root);
    continue when cardinality(v_ids) = 0;
    -- The section's folder: its own, else the first one in it the caller reads (files_subtree lists by depth).
    folder_id := v_ids[1];
    if v_kind = 'unsorted' then
      v_ids := v_ids || coalesce((
        select array_agg(t.id)
          from public.folders fo
          cross join lateral unnest(public.files_subtree(fo.id)) as t (id)
         where fo.project_id = p_project_id and fo.parent_id is null and fo.deleted_at is null
           and fo.id <> all (v_roots) and not public.files_hidden_root(fo.id)
           -- A CCD folder on a job that is not DSA (0111): in To sort only while files are in it.
           and (fo.kind <> 'ccd' or exists (
                 select 1 from public.files x
                  where x.folder_id = any (public.files_subtree(fo.id)) and x.deleted_at is null and x.superseded_by is null
                    and x.upload_complete))), '{}'::uuid[]);
    end if;
    kind := v_kind;
    folder_ids := v_ids;
    file_count := (select count(*)::integer from public.files x
                    where x.folder_id = any (v_ids) and x.deleted_at is null and x.superseded_by is null and x.upload_complete);
    return next;
  end loop;
end;
$$;
revoke execute on function public.files_sections(uuid) from public, anon;
grant execute on function public.files_sections(uuid) to authenticated;
