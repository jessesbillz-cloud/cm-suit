-- 0005 Files core (SPEC §5.6, §6.5): folders, access lists, files, pages, downloads, share links, transmittals, storage.

-- ---------------------------------------------------------------------------
-- folders and folder_access
-- ---------------------------------------------------------------------------
create table public.folders (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  version int not null default 1,
  deleted_at timestamptz,
  org_id uuid not null references public.orgs(id),
  project_id uuid not null references public.projects(id),
  parent_id uuid references public.folders(id),
  name text not null check (length(name) between 1 and 200),
  kind text not null default 'general'
    check (kind in ('general', 'plans', 'specs', 'reports', 'bids_received', 'inbound', 'photos', 'transmittals', 'system')),
  proprietary boolean not null default false,
  view_only boolean not null default false,
  unique (project_id, parent_id, name)
);
alter table public.folders enable row level security;
create trigger touch before update on public.folders for each row execute function public.tg_touch_row();
create trigger no_delete before delete on public.folders for each row execute function public.tg_block_delete();
create trigger audit_row after insert or update on public.folders for each row execute function public.tg_audit_row();
create index folders_project on public.folders (project_id, parent_id);
-- view_only only on proprietary folders (SPEC §6.5).
alter table public.folders add constraint view_only_requires_proprietary check (not view_only or proprietary);

create table public.folder_access (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  folder_id uuid not null references public.folders(id) on delete cascade,
  capability text,
  user_id uuid references auth.users(id),
  can_read boolean not null default true,
  can_write boolean not null default false,
  check ((capability is null) <> (user_id is null))
);
alter table public.folder_access enable row level security;
create index folder_access_folder on public.folder_access (folder_id);
create unique index folder_access_cap on public.folder_access (folder_id, capability) where capability is not null;
create unique index folder_access_user on public.folder_access (folder_id, user_id) where user_id is not null;

-- Access resolution: a folder's own list, else its nearest ancestor's list.
create or replace function public.folder_effective_id(p_folder_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with recursive up as (
    select f.id, f.parent_id, 0 as depth from public.folders f where f.id = p_folder_id
    union all
    select f.id, f.parent_id, up.depth + 1 from public.folders f join up on f.id = up.parent_id
  )
  select up.id from up
  where exists (select 1 from public.folder_access fa where fa.folder_id = up.id)
  order by up.depth limit 1;
$$;
revoke execute on function public.folder_effective_id(uuid) from public, anon;

create or replace function public.folder_can_read(p_folder_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare pid uuid; eff uuid;
begin
  select project_id into pid from public.folders where id = p_folder_id and deleted_at is null;
  if pid is null or not public.is_member(pid) then return false; end if;
  if public.has_capability(pid, 'files.manage') then return true; end if;
  eff := public.folder_effective_id(p_folder_id);
  if eff is null then return public.has_capability(pid, 'files.read_project'); end if;
  return exists (
    select 1 from public.folder_access fa
    where fa.folder_id = eff and fa.can_read
      and ((fa.user_id = auth.uid()) or (fa.capability is not null and public.has_capability(pid, fa.capability)))
  );
end;
$$;
revoke execute on function public.folder_can_read(uuid) from public, anon;

create or replace function public.folder_can_write(p_folder_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare pid uuid; eff uuid;
begin
  select project_id into pid from public.folders where id = p_folder_id and deleted_at is null;
  if pid is null or not public.is_member(pid) then return false; end if;
  if public.has_capability(pid, 'files.manage') then return true; end if;
  eff := public.folder_effective_id(p_folder_id);
  if eff is null then return public.has_capability(pid, 'files.write_project'); end if;
  return exists (
    select 1 from public.folder_access fa
    where fa.folder_id = eff and fa.can_write
      and ((fa.user_id = auth.uid()) or (fa.capability is not null and public.has_capability(pid, fa.capability)))
  );
end;
$$;
revoke execute on function public.folder_can_write(uuid) from public, anon;

create policy "folders: readable" on public.folders for select to authenticated
  using (deleted_at is null and public.folder_can_read(id));
create policy "folders: managers create" on public.folders for insert to authenticated
  with check (public.has_capability(project_id, 'files.manage') and created_by = auth.uid());
create policy "folders: managers update" on public.folders for update to authenticated
  using (public.has_capability(project_id, 'files.manage'))
  with check (public.has_capability(project_id, 'files.manage')
              -- only project_admin may set view_only (SPEC §6.5)
              and (not view_only or public.has_capability(project_id, 'project.manage')));

create policy "folder_access: readable with folder" on public.folder_access for select to authenticated
  using (public.folder_can_read(folder_id));
create policy "folder_access: managers write" on public.folder_access for all to authenticated
  using (exists (select 1 from public.folders f where f.id = folder_access.folder_id and public.has_capability(f.project_id, 'files.manage')))
  with check (exists (select 1 from public.folders f where f.id = folder_access.folder_id and public.has_capability(f.project_id, 'files.manage')));

-- ---------------------------------------------------------------------------
-- files
-- ---------------------------------------------------------------------------
create table public.files (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  version int not null default 1,
  deleted_at timestamptz,
  org_id uuid not null references public.orgs(id),
  project_id uuid not null references public.projects(id),
  folder_id uuid not null references public.folders(id),
  storage_path text not null unique,
  original_name text not null check (length(original_name) between 1 and 400),
  mime text not null default 'application/octet-stream',
  size bigint not null default 0 check (size >= 0),
  sha256 text,
  version_group_id uuid not null default gen_random_uuid(),
  version_no int not null default 1,
  superseded_by uuid references public.files(id),
  scan_status text not null default 'pending' check (scan_status in ('pending', 'clean', 'infected', 'too_large_to_scan')),
  scanned_at timestamptz,
  text_status text not null default 'pending' check (text_status in ('pending', 'done', 'none', 'failed')),
  page_count int,
  upload_complete boolean not null default false,
  unique (version_group_id, version_no)
);
alter table public.files enable row level security;
create trigger touch before update on public.files for each row execute function public.tg_touch_row();
create trigger no_delete before delete on public.files for each row execute function public.tg_block_delete();
create trigger audit_row after insert or update on public.files for each row execute function public.tg_audit_row();
create index files_folder on public.files (folder_id) where deleted_at is null;
create index files_project on public.files (project_id) where deleted_at is null;
insert into public.owner_lookup (entity_type, table_name) values ('file', 'files');

-- Storage paths are fixed: project/<project_id>/<folder_id>/<file_id>/<original_name>
create or replace function public.file_storage_path(p_project_id uuid, p_folder_id uuid, p_file_id uuid, p_name text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select 'project/' || p_project_id || '/' || p_folder_id || '/' || p_file_id || '/' || regexp_replace(p_name, '[/\\]', '_', 'g');
$$;

create policy "files: readable" on public.files for select to authenticated
  using (deleted_at is null and (created_by = auth.uid() or public.folder_can_read(folder_id)));
-- Users register the file row (before the TUS upload) only into folders they can write.
create policy "files: writers create" on public.files for insert to authenticated
  with check (
    created_by = auth.uid()
    and public.folder_can_write(folder_id)
    and storage_path = public.file_storage_path(project_id, folder_id, id, original_name)
    and scan_status = 'pending' and text_status = 'pending' and upload_complete = false
    and org_id = (select org_id from public.projects where id = project_id)
    and folder_id in (select id from public.folders where project_id = files.project_id)
  );
-- Uploader marks upload_complete / soft-deletes own file; managers can soft-delete any. Scan/text fields are worker-only.
create policy "files: uploader or manager update" on public.files for update to authenticated
  using (deleted_at is null and (created_by = auth.uid() or public.has_capability(project_id, 'files.manage')))
  with check (
    (created_by = auth.uid() or public.has_capability(project_id, 'files.manage'))
    and scan_status = (select f.scan_status from public.files f where f.id = files.id)
    and text_status = (select f.text_status from public.files f where f.id = files.id)
    and sha256 is not distinct from (select f.sha256 from public.files f where f.id = files.id)
  );

create table public.file_pages (
  id uuid primary key default gen_random_uuid(),
  file_id uuid not null references public.files(id) on delete cascade,
  project_id uuid not null references public.projects(id),
  page_no int not null check (page_no >= 1),
  sheet_number text,
  sheet_title text,
  text text not null default '',
  thumbnail_path text,
  tsv tsvector generated always as (to_tsvector('english', coalesce(sheet_number, '') || ' ' || coalesce(sheet_title, '') || ' ' || text)) stored,
  unique (file_id, page_no)
);
alter table public.file_pages enable row level security;
create index file_pages_tsv on public.file_pages using gin (tsv);
create index file_pages_project on public.file_pages (project_id);
create policy "file_pages: readable with file" on public.file_pages for select to authenticated
  using (exists (select 1 from public.files f where f.id = file_pages.file_id and f.deleted_at is null
                 and (f.created_by = auth.uid() or public.folder_can_read(f.folder_id))));
-- Written only by the worker (service role).

create table public.downloads (
  id bigint generated always as identity primary key,
  file_id uuid not null references public.files(id),
  project_id uuid not null references public.projects(id),
  user_id uuid references auth.users(id),
  share_link_id uuid,
  at timestamptz not null default now(),
  ip inet,
  variant text not null default 'original' check (variant in ('original', 'stamped'))
);
alter table public.downloads enable row level security;
create index downloads_file on public.downloads (file_id, at desc);
create policy "downloads: managers read" on public.downloads for select to authenticated
  using (public.has_capability(project_id, 'files.manage'));
-- Written only by the download RPC below.

-- One RPC records a download and returns what the edge function needs to sign a URL.
-- Gate: before the scan finishes only the uploader; infected never; view-only folders never hand out a URL.
create or replace function public.authorize_download(p_file_id uuid, p_variant text default 'original')
returns table (storage_path text, original_name text, mime text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare f public.files; fo public.folders; hdrs jsonb;
begin
  select * into f from public.files where id = p_file_id and deleted_at is null;
  if f is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not (f.created_by = auth.uid() or public.folder_can_read(f.folder_id)) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into fo from public.folders where id = f.folder_id;
  if fo.view_only and not public.has_capability(f.project_id, 'files.manage') then
    raise exception 'view_only' using errcode = '42501';
  end if;
  if f.scan_status = 'infected' then raise exception 'infected' using errcode = '42501'; end if;
  if f.scan_status = 'pending' and f.created_by <> auth.uid() then
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

-- ---------------------------------------------------------------------------
-- share_links: permanent, one recipient, checked on every click.
-- ---------------------------------------------------------------------------
create table public.share_links (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id),
  version int not null default 1,
  org_id uuid not null references public.orgs(id),
  project_id uuid not null references public.projects(id),
  target_type text not null check (target_type in ('file', 'folder')),
  target_id uuid not null,
  recipient_email text not null check (recipient_email = lower(recipient_email)),
  member_id uuid references public.project_members(id),
  revoked_at timestamptz,
  last_used_at timestamptz,
  use_count int not null default 0
);
alter table public.share_links enable row level security;
create index share_links_project on public.share_links (project_id);
create policy "share_links: creator or manager read" on public.share_links for select to authenticated
  using (created_by = auth.uid() or public.has_capability(project_id, 'files.manage'));
create policy "share_links: senders create" on public.share_links for insert to authenticated
  with check (created_by = auth.uid() and public.has_capability(project_id, 'transmittals.send')
              and ((target_type = 'file' and exists (select 1 from public.files f where f.id = target_id and f.project_id = share_links.project_id and public.folder_can_read(f.folder_id)))
                   or (target_type = 'folder' and public.folder_can_read(target_id))));
create policy "share_links: creator or manager revoke" on public.share_links for update to authenticated
  using (created_by = auth.uid() or public.has_capability(project_id, 'files.manage'))
  with check (created_by = auth.uid() or public.has_capability(project_id, 'files.manage'));

-- ---------------------------------------------------------------------------
-- transmittals: every send creates one.
-- ---------------------------------------------------------------------------
create table public.transmittals (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id),
  version int not null default 1,
  deleted_at timestamptz,
  org_id uuid not null references public.orgs(id),
  project_id uuid not null references public.projects(id),
  number int not null,
  from_user uuid not null references auth.users(id),
  to_emails text[] not null default '{}',
  to_members uuid[] not null default '{}',
  file_ids uuid[] not null default '{}',
  share_link_ids uuid[] not null default '{}',
  subject text not null default '',
  message text not null default '',
  sent_at timestamptz,
  delivery_status text not null default 'queued' check (delivery_status in ('queued', 'sent', 'delivered', 'bounced', 'spam', 'failed')),
  first_opened_at timestamptz,
  postmark_message_id text,
  unique (project_id, number)
);
alter table public.transmittals enable row level security;
create trigger touch before update on public.transmittals for each row execute function public.tg_touch_row();
create trigger no_delete before delete on public.transmittals for each row execute function public.tg_block_delete();
create trigger audit_row after insert or update on public.transmittals for each row execute function public.tg_audit_row();
insert into public.owner_lookup (entity_type, table_name) values ('transmittal', 'transmittals');
create policy "transmittals: project read" on public.transmittals for select to authenticated
  using (deleted_at is null and (from_user = auth.uid() or public.has_capability(project_id, 'files.manage')
         or auth.uid() = any (select pm.user_id from public.project_members pm where pm.id = any (to_members))));
-- Created only by the send-transmittal edge function via create_transmittal().

create or replace function public.create_transmittal(
  p_project_id uuid, p_to_emails text[], p_to_members uuid[], p_file_ids uuid[], p_subject text, p_message text
)
returns public.transmittals
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare t public.transmittals; oid uuid; fid uuid;
begin
  if not public.has_capability(p_project_id, 'transmittals.send') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  foreach fid in array p_file_ids loop
    if not exists (select 1 from public.files f where f.id = fid and f.project_id = p_project_id and f.deleted_at is null and f.scan_status = 'clean' and public.folder_can_read(f.folder_id)) then
      raise exception 'file % is not sendable (missing, not clean, or not readable)', fid;
    end if;
  end loop;
  select org_id into oid from public.projects where id = p_project_id;
  insert into public.transmittals (org_id, project_id, number, from_user, to_emails, to_members, file_ids, subject, message, created_by)
  values (oid, p_project_id, public.next_number(p_project_id, 'transmittal'), auth.uid(),
          (select array_agg(lower(e)) from unnest(p_to_emails) e), p_to_members, p_file_ids, p_subject, p_message, auth.uid())
  returning * into t;
  return t;
end;
$$;
revoke execute on function public.create_transmittal(uuid, text[], uuid[], uuid[], text, text) from public, anon;

-- ---------------------------------------------------------------------------
-- Default folders on project creation.
-- ---------------------------------------------------------------------------
create or replace function public.tg_project_default_folders()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare bids uuid;
begin
  insert into public.folders (org_id, project_id, name, kind, created_by) values
    (new.org_id, new.id, 'Plans', 'plans', new.created_by),
    (new.org_id, new.id, 'Specs', 'specs', new.created_by),
    (new.org_id, new.id, 'Reports', 'reports', new.created_by),
    (new.org_id, new.id, 'Photos', 'photos', new.created_by),
    (new.org_id, new.id, 'Inbound', 'inbound', new.created_by);
  insert into public.folders (org_id, project_id, name, kind, created_by)
    values (new.org_id, new.id, 'Bids received', 'bids_received', new.created_by) returning id into bids;
  -- Pricing-only folder: readable/writable only with bids.view_pricing; submitting bidders see their own file via created_by.
  insert into public.folder_access (folder_id, capability, can_read, can_write, created_by)
    values (bids, 'bids.view_pricing', true, true, new.created_by);
  -- Inbound quarantine: project admins only.
  insert into public.folder_access (folder_id, capability, can_read, can_write, created_by)
    select id, 'project.manage', true, true, new.created_by from public.folders where project_id = new.id and kind = 'inbound';
  return new;
end;
$$;
revoke execute on function public.tg_project_default_folders() from public, anon, authenticated;
create trigger on_project_default_folders after insert on public.projects for each row execute function public.tg_project_default_folders();

-- ---------------------------------------------------------------------------
-- Storage: private buckets, path-scoped policies.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('files', 'files', false, null), ('signatures', 'signatures', false, 2097152), ('inbound', 'inbound', false, null), ('fixtures', 'fixtures', false, null)
on conflict (id) do nothing;

-- Upload: path must match a registered file row the user created, in a folder they can write.
create policy "storage files: uploader inserts own registered path" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'files'
    and exists (select 1 from public.files f where f.storage_path = name and f.created_by = auth.uid() and f.deleted_at is null and public.folder_can_write(f.folder_id))
  );
create policy "storage files: uploader may resume (update) own object" on storage.objects for update to authenticated
  using (bucket_id = 'files' and exists (select 1 from public.files f where f.storage_path = name and f.created_by = auth.uid()))
  with check (bucket_id = 'files' and exists (select 1 from public.files f where f.storage_path = name and f.created_by = auth.uid()));
-- No select policy for users: downloads go through authorize_download + a signed URL made by the edge function.
create policy "storage signatures: own" on storage.objects for all to authenticated
  using (bucket_id = 'signatures' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'signatures' and (storage.foldername(name))[1] = auth.uid()::text);
