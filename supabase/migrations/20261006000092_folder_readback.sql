-- 0092 A folder's maker reads it back (staging, Oct 6). A member who holds files.manage made a folder in Files and got
-- 403 "new row violates row-level security policy for table folders". The app inserts with RETURNING, so Postgres
-- checks the new row against "folders: readable" before the row is in the table. That policy asked
-- folder_can_read(id), which looks the folder up by id, finds nothing and says no. An insert without RETURNING passed.
--
-- The fix: the readable check works from the row's own columns (folder_row_can_read). It gives the same answer
-- folder_can_read gives once the row exists, so who reads what does not change (0090 set that). folder_can_read now
-- looks the row up and asks folder_row_can_read, so there is one implementation of the rule.
--
-- Every other table read back after an insert was checked: files go through register_file, and the SELECT policies
-- of files, comments, rfis, bid packages, calendar entries, bid form items, subs and ir_blocks read the row's own
-- columns (or a different row that already exists), so none of them has this problem.

-- Can the caller read a folder with these columns? A new folder has no access list of its own, so its nearest access
-- list, its kind for "is it a document" and its bid documents tree come from the folder above it.
create function public.folder_row_can_read(p_id uuid, p_project_id uuid, p_parent_id uuid, p_kind text)
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
    is_doc := case when p_kind <> 'general' then p_kind in ('plans', 'specs', 'addenda', 'dsa_103', 'ccd', 'approved_plans')
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
revoke execute on function public.folder_row_can_read(uuid, uuid, uuid, text) from public, anon;
grant execute on function public.folder_row_can_read(uuid, uuid, uuid, text) to authenticated, service_role;

-- The same rule for a folder that exists, by id (files, folder_access, share links and the downloads log ask this).
create or replace function public.folder_can_read(p_folder_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare fo public.folders;
begin
  select * into fo from public.folders where id = p_folder_id and deleted_at is null;
  if fo is null then return false; end if;
  return public.folder_row_can_read(fo.id, fo.project_id, fo.parent_id, fo.kind);
end;
$$;

alter policy "folders: readable" on public.folders
  using (deleted_at is null and public.folder_row_can_read(id, project_id, parent_id, kind));

-- =====================================================================================================================
-- The Files tree (Jesse, Oct 6: "some of that's getting a little cluttered ... I don't know what half of that shit is")
-- =====================================================================================================================
-- Whose folder is this? Each author's daily reports and photos folder is named after the person when it was made,
-- and the name went stale (an email handle like inspector_jesse). The tree shows the person's name today: the full
-- name, else the part of the email before the @. Only for a folder the caller reads.
create function public.folder_person(p_folder_id uuid)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.ir_person_name(d.author_id)
    from public.daily_author_folders d
   where d.folder_id = p_folder_id and auth.uid() is not null and public.folder_can_read(p_folder_id)
   limit 1;
$$;
revoke execute on function public.folder_person(uuid) from public, anon;
grant execute on function public.folder_person(uuid) to authenticated, service_role;

-- Per folder of the job the caller reads: app_only when only the app puts files in it (each author's folders, Reports
-- and its folders, Emailed in, Bids received, RFIs, Inspection requests, Corrections, Delivery tickets, Approved
-- plans), the person's name for an author's folder, and for the folders the tree hides while they are empty (those,
-- and Testing and inspections) the number of files in it the caller reads. People can only make general folders and
-- these names are kept for the app (folder_name_reserved), so kind and name tell the app's folders apart.
create function public.folder_marks(p_project_id uuid)
returns table (folder_id uuid, app_only boolean, person text, file_count integer)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with f as (
    select fo.id, fo.kind, public.folder_person(fo.id) as person,
           (fo.kind in ('reports', 'inbound', 'bids_received', 'rfis', 'approved_plans', 'stamping')
            or (fo.parent_id is null and fo.kind = 'general' and fo.name = 'Inspection requests')
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
revoke execute on function public.folder_marks(uuid) from public, anon;
grant execute on function public.folder_marks(uuid) to authenticated, service_role;
