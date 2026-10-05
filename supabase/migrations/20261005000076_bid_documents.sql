-- 0076 Bids audit fixes (Oct 4): the bidder reads the bid documents; addenda drafts stay private; drafts, packages and
-- subs can be taken off with Undo.
--   1. Plans and Specs for bidders. A member holding bids.submit (an invited bidder whose access hasn't ended) reads the
--      job's Plans and Specs folders and every folder under them, through folder_can_read's default branch only: a
--      folder with its own access list (or under one) keeps that list. No capability-matrix change: the bidder role
--      still holds bids.submit alone. "Bids received" stays sealed and pricing-only (0012); every other folder stays
--      closed to bidders.
--   2. Addendum files. They no longer go in Specs (now open to bidders, so a draft's files would show early). Each job
--      gets an "Addenda" folder ("Bid addenda" when the job has its own "Addenda"; kind 'addenda', made on first use by open_addenda_folder, read and written with
--      bids.manage). A bidder reads a file there only once an addendum carrying it is issued (addendum_file_readable):
--      in the files policy and the download gate. Files already attached to a draft move to the job's Addenda folder.
--      add_addendum_file puts one file on a draft whatever its version (the upload queue attaches it after the bytes).
--   3. A draft addendum is discarded with Undo (set_addendum_discarded); an issued one never. Its number is not reused.
--   4. A package (when nothing was sent or received on it) and a sub are removed with Undo (set_bid_package_removed,
--      set_sub_removed). A removed package's code is free again: the unique code is per live package.

-- =====================================================================================================================
-- 1. The bid documents
-- =====================================================================================================================
-- Is this folder Plans or Specs, or under one of them? Asked as the system (the folders above may be unreadable).
create or replace function public.bid_docs_folder(p_folder_id uuid)
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
     where f.deleted_at is null and up.depth < 32
  )
  select coalesce(bool_or(up.kind in ('plans', 'specs')), false) from up;
$$;
revoke execute on function public.bid_docs_folder(uuid) from public, anon;
grant execute on function public.bid_docs_folder(uuid) to authenticated, service_role;

-- Same as 0012, plus: a bidder on the job reads the bid documents where no access list says otherwise.
create or replace function public.folder_can_read(p_folder_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare fo public.folders; eff uuid;
begin
  select * into fo from public.folders where id = p_folder_id and deleted_at is null;
  if fo is null or not public.is_member(fo.project_id) then return false; end if;
  if fo.kind = 'bids_received' and not public.bids_open(fo.project_id) then return false; end if;
  eff := public.folder_effective_id(p_folder_id);
  if eff is null then
    return public.has_capability(fo.project_id, 'files.manage') or public.has_capability(fo.project_id, 'files.read_project')
        or (public.my_bidder_member_id(fo.project_id) is not null and public.bid_docs_folder(fo.id));
  end if;
  return exists (
    select 1 from public.folder_access fa
    where fa.folder_id = eff and fa.can_read
      and ((fa.user_id = auth.uid()) or (fa.capability is not null and public.has_capability(fo.project_id, fa.capability)))
  );
end;
$$;

-- =====================================================================================================================
-- 2. Addendum files
-- =====================================================================================================================
alter table public.folders drop constraint folders_kind_check;
alter table public.folders add constraint folders_kind_check
  check (kind in ('general', 'plans', 'specs', 'reports', 'bids_received', 'inbound', 'photos', 'transmittals', 'system',
                  'dsa_103', 'ccd', 'ti', 'bid_forms', 'rfis', 'approved_plans', 'permit_uploads', 'stamping', 'safety',
                  'schedule', 'requirements', 'addenda'));

-- May the caller read this file because an issued addendum carries it? Bidders on the job only (managers read the
-- Addenda folder itself), and only a file kept in the job's Addenda folder: attaching a bid or a closed folder's file to
-- an addendum never opens it. A draft's files never.
create or replace function public.addendum_file_readable(p_file_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.files f
      join public.addenda a on a.project_id = f.project_id
      join public.folders fo on fo.id = f.folder_id and fo.kind = 'addenda'
     where f.id = p_file_id and f.deleted_at is null
       and a.deleted_at is null and a.issued_at is not null and f.id = any (a.file_ids)
       and public.my_bidder_member_id(f.project_id) is not null);
$$;
revoke execute on function public.addendum_file_readable(uuid) from public, anon;
grant execute on function public.addendum_file_readable(uuid) to authenticated, service_role;

alter policy "files: readable" on public.files
  using (deleted_at is null and (public.file_may_see(project_id, created_by, folder_id) or public.addendum_file_readable(id)));

-- Same as 0027, plus the issued-addendum rule in the gate.
create or replace function public.authorize_download(p_file_id uuid, p_variant text default 'original')
returns table (storage_path text, original_name text, mime text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare f public.files; fo public.folders; hdrs jsonb; pending_image boolean;
begin
  select * into f from public.files where id = p_file_id and deleted_at is null;
  if f is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not ((f.created_by = auth.uid() and public.is_member(f.project_id)) or public.folder_can_read(f.folder_id)
          or public.addendum_file_readable(f.id)) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into fo from public.folders where id = f.folder_id;
  if fo.view_only and not public.has_capability(f.project_id, 'files.manage') then
    raise exception 'view_only' using errcode = '42501';
  end if;
  if f.scan_status = 'infected' then raise exception 'infected' using errcode = '42501'; end if;
  pending_image := lower(f.mime) in ('image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif')
                   and lower(f.original_name) ~ '\.(jpe?g|png|webp|heic|heif)$'
                   and public.folder_can_read(f.folder_id);
  if f.scan_status = 'pending' and f.created_by is distinct from auth.uid() and not pending_image then
    raise exception 'scan_pending' using errcode = '42501';
  end if;
  hdrs := nullif(current_setting('request.headers', true), '')::jsonb;
  insert into public.downloads (file_id, project_id, user_id, ip, variant)
  values (f.id, f.project_id, auth.uid(), nullif(split_part(coalesce(hdrs->>'x-forwarded-for', ''), ',', 1), '')::inet, p_variant);
  perform public.audit('download', 'file', f.id, f.project_id, f.org_id, jsonb_build_object('variant', p_variant, 'name', f.original_name), f.sha256);
  return query select f.storage_path, f.original_name, f.mime;
end;
$$;
revoke execute on function public.authorize_download(uuid, text) from public, anon;
grant execute on function public.authorize_download(uuid, text) to authenticated, service_role;

-- The job's Addenda folder, made once with its own access list (bids.manage reads and writes); a deleted one comes back.
-- Internal: the caller checks.
create or replace function public.addenda_folder_make(p_project_id uuid)
returns uuid
language plpgsql
set search_path = public, pg_temp
as $$
declare p public.projects; v_folder uuid; v_deleted timestamptz;
begin
  select * into p from public.projects where id = p_project_id and deleted_at is null;
  if p.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  perform pg_advisory_xact_lock(hashtext('addenda_folder:' || p.id::text));
  select f.id, f.deleted_at into v_folder, v_deleted
    from public.folders f
   where f.project_id = p.id and f.kind = 'addenda'
   order by (f.deleted_at is null) desc, f.created_at
   limit 1;
  if v_folder is null then
    -- A job may already keep its own "Addenda" folder: then this one is "Bid addenda".
    insert into public.folders (org_id, project_id, name, kind, sort, ai_reads, created_by)
    values (p.org_id, p.id, 'Addenda', 'addenda', 25, false, auth.uid())
    on conflict do nothing
    returning id into v_folder;
    if v_folder is null then
      insert into public.folders (org_id, project_id, name, kind, sort, ai_reads, created_by)
      values (p.org_id, p.id, 'Bid addenda', 'addenda', 25, false, auth.uid())
      on conflict do nothing
      returning id into v_folder;
    end if;
    if v_folder is null then
      raise exception 'Folders named "Addenda" and "Bid addenda" are in the way. Rename one in Files.' using errcode = '23505';
    end if;
    insert into public.folder_access (folder_id, capability, can_read, can_write, created_by)
    values (v_folder, 'bids.manage', true, true, auth.uid());
  elsif v_deleted is not null then
    update public.folders set deleted_at = null where id = v_folder;
  end if;
  return v_folder;
end;
$$;
revoke execute on function public.addenda_folder_make(uuid) from public, anon, authenticated;
grant execute on function public.addenda_folder_make(uuid) to service_role;

-- open_addenda_folder(project) -> the folder an addendum's files are uploaded into. bids.manage only.
create or replace function public.open_addenda_folder(p_project_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.has_capability(p_project_id, 'bids.manage') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return public.addenda_folder_make(p_project_id);
end;
$$;
revoke execute on function public.open_addenda_folder(uuid) from public, anon;
grant execute on function public.open_addenda_folder(uuid) to authenticated, service_role;

-- Files already on a draft move to the job's Addenda folder (Specs is open to bidders from now on).
select public.addenda_folder_make(j.project_id)
  from (select distinct a.project_id from public.addenda a
         where a.issued_at is null and a.deleted_at is null and cardinality(a.file_ids) > 0) j;
update public.files f
   set folder_id = (select fo.id from public.folders fo where fo.project_id = f.project_id and fo.kind = 'addenda'
                     and fo.deleted_at is null order by fo.created_at limit 1)
 where f.deleted_at is null
   and exists (select 1 from public.addenda a where a.project_id = f.project_id and a.issued_at is null
                 and a.deleted_at is null and f.id = any (a.file_ids))
   and exists (select 1 from public.folders fo where fo.project_id = f.project_id and fo.kind = 'addenda' and fo.deleted_at is null);

-- One file onto a draft, whatever its version is now (the upload queue attaches it once the bytes are stored, while
-- the person may be editing the text). Safe to repeat. Returns the draft.
create or replace function public.add_addendum_file(p_addendum_id uuid, p_file_id uuid)
returns public.addenda
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare a public.addenda;
begin
  select * into a from public.addenda where id = p_addendum_id and deleted_at is null for update;
  if a.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not public.has_capability(a.project_id, 'bids.manage') then raise exception 'forbidden' using errcode = '42501'; end if;
  if a.issued_at is not null then raise exception 'An issued addendum stays.' using errcode = '42501'; end if;
  if not exists (select 1 from public.files f where f.id = p_file_id and f.project_id = a.project_id and f.deleted_at is null
                   and ((f.created_by = auth.uid() and public.is_member(f.project_id)) or public.folder_can_read(f.folder_id))) then
    raise exception 'That file isn''t in this job, or you can''t open it.' using errcode = '42501';
  end if;
  if p_file_id = any (a.file_ids) then return a; end if;
  update public.addenda set file_ids = file_ids || p_file_id where id = a.id returning * into a;
  return a;
end;
$$;
revoke execute on function public.add_addendum_file(uuid, uuid) from public, anon;
grant execute on function public.add_addendum_file(uuid, uuid) to authenticated, service_role;

-- =====================================================================================================================
-- 3. Discard a draft addendum (Undo brings it back)
-- =====================================================================================================================
create or replace function public.set_addendum_discarded(p_addendum_id uuid, p_version int, p_discarded boolean)
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare a public.addenda;
begin
  select * into a from public.addenda where id = p_addendum_id;
  if a.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not public.has_capability(a.project_id, 'bids.manage') then raise exception 'forbidden' using errcode = '42501'; end if;
  if a.issued_at is not null then raise exception 'An issued addendum stays.' using errcode = '42501'; end if;
  if a.version <> p_version then raise exception 'version_conflict' using errcode = '40001'; end if;
  update public.addenda set deleted_at = case when p_discarded then now() end where id = a.id returning * into a;
  return a.version;
end;
$$;
revoke execute on function public.set_addendum_discarded(uuid, int, boolean) from public, anon;
grant execute on function public.set_addendum_discarded(uuid, int, boolean) to authenticated, service_role;

-- =====================================================================================================================
-- 4. Remove a package or a sub (Undo brings it back)
-- =====================================================================================================================
alter table public.bid_packages drop constraint bid_packages_project_id_code_key;
create unique index bid_packages_project_code on public.bid_packages (project_id, code) where deleted_at is null;

-- A package nobody was invited to and no bid came in for. Bringing one back whose code was taken since: 23505.
create or replace function public.set_bid_package_removed(p_package_id uuid, p_version int, p_removed boolean)
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare pk public.bid_packages;
begin
  select * into pk from public.bid_packages where id = p_package_id;
  if pk.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not public.has_capability(pk.project_id, 'bids.manage') then raise exception 'forbidden' using errcode = '42501'; end if;
  if pk.version <> p_version then raise exception 'version_conflict' using errcode = '40001'; end if;
  if p_removed and (exists (select 1 from public.bid_invites i where i.package_id = pk.id and i.deleted_at is null)
                    or exists (select 1 from public.bid_submissions s where s.package_id = pk.id and s.deleted_at is null)) then
    raise exception 'This package has invites or bids.' using errcode = '22023';
  end if;
  update public.bid_packages set deleted_at = case when p_removed then now() end where id = pk.id returning * into pk;
  return pk.version;
end;
$$;
revoke execute on function public.set_bid_package_removed(uuid, int, boolean) from public, anon;
grant execute on function public.set_bid_package_removed(uuid, int, boolean) to authenticated, service_role;

-- A directory sub (its history and the bids that named it stay). Bringing one back whose name was taken since: 23505.
create or replace function public.set_sub_removed(p_sub_id uuid, p_version int, p_removed boolean)
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare s public.subs;
begin
  select * into s from public.subs where id = p_sub_id;
  if s.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not public.can_manage_subs(s.org_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  if s.version <> p_version then raise exception 'version_conflict' using errcode = '40001'; end if;
  update public.subs set deleted_at = case when p_removed then now() end where id = s.id returning * into s;
  return s.version;
end;
$$;
revoke execute on function public.set_sub_removed(uuid, int, boolean) from public, anon;
grant execute on function public.set_sub_removed(uuid, int, boolean) to authenticated, service_role;
