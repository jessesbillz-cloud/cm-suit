-- 0099 Files: Submittals and RFIs for everyone who reads Plans and Specs, and a place in RFIs for uploaded documents
-- (Jesse, Oct 11 and 12, docs/decisions.md). "The entirety of the work product and everything associated with the
-- administrative portion of construction should be available": subs and the architect see Submittals the way they see
-- Plans and Specs. And "files with RFI in the name go to the RFI folder", not To sort.
--   * Submittals are one of the job's documents (folder_kind_is_document, one list for folder_is_document and
--     folder_row_can_read). files.read_project reads the job's documents (0090), so every role that reads Plans and
--     Specs now reads Submittals and the folders under them: the sub, the foreman, the special inspector and the fire
--     marshal, beside the inside roles that read them already (files.read_records). Writing is unchanged. CCDs were a
--     document already.
--   * RFIs: the RFI tool's own folder keeps its access list (0038: rfi.sign_issue browses it, a draft's photos stay with
--     the draft, everyone else opens an RFI's files through the RFI). files_sections now also finds or makes an
--     "Uploaded" folder in it with its own access list: files.read_project and files.read_records read it,
--     files.write_project and files.manage add to it. Files puts RFI documents uploaded there. The RFIs section shows to
--     whoever reads either folder, and its folder is the first of the two the caller reads, so a reader who doesn't
--     browse the tool's folder sees the uploaded documents only. The tool's own signed records stay read-only.
--   * The fire marshal reads what Plans and Specs give him (files.read_project), so Submittals and RFI documents, and
--     nothing more: Reports, Photos, the OFS reports folder and other requests stay closed (0090 unchanged).
-- No role_permissions rows change. No table changes, so nothing new for the server key (rule 1).

-- =====================================================================================================================
-- The job's documents
-- =====================================================================================================================
-- Is a folder of this kind one of the job's documents (files.read_project reads it)?
create or replace function public.folder_kind_is_document(p_kind text)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select coalesce(p_kind in ('plans', 'specs', 'addenda', 'dsa_103', 'ccd', 'approved_plans', 'submittals'), false);
$$;
revoke execute on function public.folder_kind_is_document(text) from public, anon;
grant execute on function public.folder_kind_is_document(text) to authenticated, service_role;

-- 0090, on the one list.
create or replace function public.folder_is_document(p_folder_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with recursive up as (
    select f.id, f.parent_id, f.kind, 0 as depth from public.folders f where f.id = p_folder_id
    union all
    select f.id, f.parent_id, f.kind, up.depth + 1 from public.folders f join up on f.id = up.parent_id where up.depth < 32
  )
  select coalesce((select public.folder_kind_is_document(up.kind) from up
                    where up.kind <> 'general'
                    order by up.depth limit 1), false);
$$;

-- 0092, on the one list.
create or replace function public.folder_row_can_read(p_id uuid, p_project_id uuid, p_parent_id uuid, p_kind text)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare eff uuid; is_doc boolean; is_bid_docs boolean;
begin
  if not public.is_member(p_project_id) then return false; end if;
  if p_kind = 'bids_received' and not public.bids_open(p_project_id) then return false; end if;
  if exists (select 1 from public.folder_access fa where fa.folder_id = p_id) then
    eff := p_id;
  elsif p_parent_id is not null then
    eff := public.folder_effective_id(p_parent_id);
  end if;
  if eff is null then
    is_doc := case when p_kind <> 'general' then public.folder_kind_is_document(p_kind)
                   when p_parent_id is null then false
                   else public.folder_is_document(p_parent_id) end;
    is_bid_docs := p_kind in ('plans', 'specs') or (p_parent_id is not null and public.bid_docs_folder(p_parent_id));
    return public.has_capability(p_project_id, 'files.manage') or public.has_capability(p_project_id, 'files.read_records')
        or (public.has_capability(p_project_id, 'files.read_project') and is_doc)
        or (public.my_bidder_member_id(p_project_id) is not null and is_bid_docs);
  end if;
  return exists (
    select 1 from public.folder_access fa
    where fa.folder_id = eff and fa.can_read
      and ((fa.user_id = auth.uid()) or (fa.capability is not null and public.has_capability(p_project_id, fa.capability)))
  );
end;
$$;

-- =====================================================================================================================
-- RFIs: the uploaded documents' folder (internal)
-- =====================================================================================================================
-- The "Uploaded" folder in the job's RFIs folder: found (brought back if it was removed) or made, with its own access
-- list. A folder of that name there with no list of its own is adopted and gets the list. The caller holds the
-- rfi_folder lock.
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
      (v_id, 'files.read_project', true, false, auth.uid()),
      (v_id, 'files.read_records', true, false, auth.uid()),
      (v_id, 'files.write_project', true, true, auth.uid()),
      (v_id, 'files.manage', true, true, auth.uid());
  end if;
  return v_id;
end;
$$;
revoke execute on function public.files_rfi_uploads_make(uuid, uuid) from public, anon, authenticated;

-- =====================================================================================================================
-- The sections (0097, with RFIs' Uploaded folder)
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
  if v_rfis is not null then perform public.files_rfi_uploads_make(p_project_id, v_rfis); end if;

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
           and fo.id <> all (v_roots) and not public.files_hidden_root(fo.id)), '{}'::uuid[]);
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
