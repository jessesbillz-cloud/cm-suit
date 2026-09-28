-- 0027 Folders by who uses them (Jesse, Sept 27): a job opens with the folders its company kind uses most.
--   * projects.is_dsa: a DSA job. Set on the New job form (create_project p_is_dsa) or in Job settings.
--   * folder_templates: the default folders per company kind and DSA, as data. Written only by migrations.
--     New jobs get their folders from it; turning DSA on adds the DSA folders (nothing is ever deleted).
--   * folders.sort (the tree lists by sort, then name) and folders.ai_reads (search and the AI read this folder;
--     stored and shown, nothing reads it yet).
--   * "Inbound" is no longer made; existing ones become "Emailed in" (the tree hides it while it's empty).
--     The inbound-email function keeps mail in the private 'inbound' bucket and never used the folder.
--   * "Bids received" comes with GC jobs; any other job gets it with its first bid package.
--   * authorize_download: photos can be opened by the folder's readers before a virus scan (no scanner runs yet).
--   * People can't change a folder's kind, job or company (column grants).

-- ---------------------------------------------------------------------------
-- DSA job flag
-- ---------------------------------------------------------------------------
alter table public.projects add column is_dsa boolean not null default false;
grant insert (is_dsa) on public.projects to authenticated;
grant update (is_dsa) on public.projects to authenticated;

drop function public.create_project(uuid, text, text, text, text, timestamptz, boolean, text);

create or replace function public.create_project(
  p_org_id uuid,
  p_name text,
  p_stage text,
  p_number text default null,
  p_address text default null,
  p_bid_due_at timestamptz default null,
  p_prevailing_wage boolean default false,
  p_job_type text default null,
  p_is_dsa boolean default false
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_name text := btrim(coalesce(p_name, ''));
  v_number text := nullif(btrim(coalesce(p_number, '')), '');
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtext('create_project:' || v_uid::text));
  select p.id into v_id
    from public.projects p
   where p.org_id = p_org_id and p.created_by = v_uid and p.deleted_at is null
     and lower(p.name) = lower(v_name) and coalesce(p.number, '') = coalesce(v_number, '')
   limit 1;
  if v_id is not null then
    return v_id;
  end if;
  v_id := gen_random_uuid();
  insert into public.projects (id, org_id, name, number, address, stage, bid_due_at, prevailing_wage, job_type, is_dsa, created_by)
  values (v_id, p_org_id, v_name, v_number, nullif(btrim(coalesce(p_address, '')), ''), p_stage, p_bid_due_at,
          coalesce(p_prevailing_wage, false), nullif(btrim(coalesce(p_job_type, '')), ''), coalesce(p_is_dsa, false), v_uid);
  return v_id;
end;
$$;
revoke execute on function public.create_project(uuid, text, text, text, text, timestamptz, boolean, text, boolean) from public, anon;
grant execute on function public.create_project(uuid, text, text, text, text, timestamptz, boolean, text, boolean) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Folder kinds, order and "Search and AI read this"
-- ---------------------------------------------------------------------------
alter table public.folders drop constraint folders_kind_check;
alter table public.folders add constraint folders_kind_check
  check (kind in ('general', 'plans', 'specs', 'reports', 'bids_received', 'inbound', 'photos', 'transmittals', 'system',
                  'dsa_103', 'ccd', 'ti'));
-- Template folders use 10-90, folders people add 100, "Emailed in" 900.
alter table public.folders add column sort int not null default 100;
alter table public.folders add column ai_reads boolean not null default true;

-- People with files.manage rename, move, protect, delete, order and set ai_reads; the kind, job and company stay.
revoke update on public.folders from authenticated;
grant update (name, parent_id, proprietary, view_only, ai_reads, sort, deleted_at) on public.folders to authenticated;

-- ---------------------------------------------------------------------------
-- folder_templates: the default folders per company kind (orgs.kind) and DSA. Data, written only by migrations.
-- ---------------------------------------------------------------------------
create table public.folder_templates (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  company_kind text not null check (company_kind in ('gc', 'sub', 'inspector', 'architect', 'owner', 'other')),
  applies_to text not null default 'both' check (applies_to in ('both', 'dsa', 'non_dsa')),
  name text not null check (length(name) between 1 and 200),
  folder_kind text not null
    check (folder_kind in ('general', 'plans', 'specs', 'reports', 'bids_received', 'photos', 'dsa_103', 'ccd', 'ti')),
  sort int not null,
  ai_reads boolean not null default true,
  -- When set, the folder is read and written only with this capability (its folder_access list).
  access_capability text,
  unique (company_kind, folder_kind)
);
alter table public.folder_templates enable row level security;
create policy "folder_templates: readable by signed-in users" on public.folder_templates
  for select to authenticated using (auth.uid() is not null);
revoke all on public.folder_templates from anon, authenticated;
grant select on public.folder_templates to authenticated;

-- Inspectors: plans, specs and, on DSA jobs, the DSA 103 (testing and inspections) and CCDs; on other jobs the
-- testing and inspections section of the structural drawings. GC: plus the pricing-only Bids received.
insert into public.folder_templates (company_kind, applies_to, name, folder_kind, sort, ai_reads, access_capability) values
  ('inspector', 'both', 'Plans', 'plans', 10, true, null),
  ('inspector', 'both', 'Specs', 'specs', 20, true, null),
  ('inspector', 'dsa', 'DSA 103', 'dsa_103', 30, true, null),
  ('inspector', 'dsa', 'CCDs', 'ccd', 40, true, null),
  ('inspector', 'non_dsa', 'Testing & inspections', 'ti', 30, true, null),
  ('inspector', 'both', 'Reports', 'reports', 50, true, null),
  ('inspector', 'both', 'Photos', 'photos', 60, false, null),
  ('gc', 'both', 'Plans', 'plans', 10, true, null),
  ('gc', 'both', 'Specs', 'specs', 20, true, null),
  ('gc', 'both', 'Bids received', 'bids_received', 30, false, 'bids.view_pricing'),
  ('gc', 'both', 'Reports', 'reports', 50, true, null),
  ('gc', 'both', 'Photos', 'photos', 60, false, null);
insert into public.folder_templates (company_kind, applies_to, name, folder_kind, sort, ai_reads)
select k.kind, 'both', t.name, t.folder_kind, t.sort, t.ai_reads
from (values ('sub'), ('architect'), ('owner'), ('other')) as k (kind)
cross join (values ('Plans', 'plans', 10, true), ('Specs', 'specs', 20, true), ('Reports', 'reports', 50, true),
                   ('Photos', 'photos', 60, false)) as t (name, folder_kind, sort, ai_reads);

-- Adds a job's missing template folders for the given applies_to values. A folder kind the job already has (even a
-- deleted one) is not added again, and a name already taken is skipped. Runs inside the definer triggers below.
create or replace function public.add_template_folders(p_project_id uuid, p_applies text[], p_created_by uuid)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare p public.projects; v_kind text; t public.folder_templates; fid uuid;
begin
  select * into p from public.projects where id = p_project_id;
  if p is null then return; end if;
  select o.kind into v_kind from public.orgs o where o.id = p.org_id;
  for t in
    select ft.* from public.folder_templates ft
    where ft.company_kind = v_kind and ft.applies_to = any (p_applies)
      and not exists (select 1 from public.folders f where f.project_id = p.id and f.kind = ft.folder_kind)
    order by ft.sort, ft.name
  loop
    fid := null;
    insert into public.folders (org_id, project_id, name, kind, sort, ai_reads, created_by)
    values (p.org_id, p.id, t.name, t.folder_kind, t.sort, t.ai_reads, p_created_by)
    on conflict do nothing
    returning id into fid;
    if fid is not null and t.access_capability is not null then
      insert into public.folder_access (folder_id, capability, can_read, can_write, created_by)
      values (fid, t.access_capability, true, true, p_created_by);
    end if;
  end loop;
end;
$$;
revoke execute on function public.add_template_folders(uuid, text[], uuid) from public, anon, authenticated;
grant execute on function public.add_template_folders(uuid, text[], uuid) to service_role;

-- New job: its company kind's folders for a DSA or a non-DSA job.
create or replace function public.tg_project_default_folders()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.add_template_folders(new.id,
    case when new.is_dsa then array['both', 'dsa'] else array['both', 'non_dsa'] end, new.created_by);
  return new;
end;
$$;
revoke execute on function public.tg_project_default_folders() from public, anon, authenticated;

-- DSA turned on: add the DSA folders once. Turning it off leaves every folder where it is.
create or replace function public.tg_project_dsa_folders()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.is_dsa and not old.is_dsa then
    perform public.add_template_folders(new.id, array['dsa'], coalesce(auth.uid(), new.created_by));
  end if;
  return new;
end;
$$;
revoke execute on function public.tg_project_dsa_folders() from public, anon, authenticated;
create trigger dsa_folders after update of is_dsa on public.projects
  for each row execute function public.tg_project_dsa_folders();

-- A job whose company kind has no Bids received folder gets one with its first bid package (the bidder page,
-- office intake and the Received view all file bids there). Same folder and access as the GC template.
create or replace function public.tg_bid_package_bids_folder()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare t public.folder_templates; fid uuid;
begin
  if exists (select 1 from public.folders f where f.project_id = new.project_id and f.kind = 'bids_received') then
    return new;
  end if;
  select ft.* into t from public.folder_templates ft
   where ft.folder_kind = 'bids_received'
   order by (ft.company_kind = (select o.kind from public.orgs o where o.id = new.org_id)) desc, ft.company_kind
   limit 1;
  if t is null then return new; end if;
  insert into public.folders (org_id, project_id, name, kind, sort, ai_reads, created_by)
  values (new.org_id, new.project_id, t.name, t.folder_kind, t.sort, t.ai_reads, new.created_by)
  on conflict do nothing
  returning id into fid;
  if fid is not null and t.access_capability is not null then
    insert into public.folder_access (folder_id, capability, can_read, can_write, created_by)
    values (fid, t.access_capability, true, true, new.created_by);
  end if;
  return new;
end;
$$;
revoke execute on function public.tg_bid_package_bids_folder() from public, anon, authenticated;
create trigger bids_folder after insert on public.bid_packages
  for each row execute function public.tg_bid_package_bids_folder();

-- ---------------------------------------------------------------------------
-- Existing jobs: keep every folder, put them in the new order, rename "Inbound".
-- ---------------------------------------------------------------------------
update public.folders fo set name = 'Emailed in'
 where fo.kind = 'inbound' and fo.name = 'Inbound'
   and not exists (select 1 from public.folders o where o.project_id = fo.project_id
                   and o.parent_id is not distinct from fo.parent_id and o.name = 'Emailed in');
update public.folders set sort = case kind
    when 'plans' then 10 when 'specs' then 20 when 'bids_received' then 30 when 'dsa_103' then 30 when 'ti' then 30
    when 'ccd' then 40 when 'reports' then 50 when 'photos' then 60 when 'inbound' then 900 else 100 end,
  ai_reads = kind not in ('photos', 'bids_received', 'inbound')
 where kind <> 'general';

-- ---------------------------------------------------------------------------
-- Photos open before a virus scan. No scanner runs yet, so every file stays 'pending'; the team must see field
-- photos. A pending image (image mime AND image file name) opens for the folder's readers; everything else pending
-- stays uploader-only, and infected is always refused. Same body as 0005 otherwise.
-- ---------------------------------------------------------------------------
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
  if not ((f.created_by = auth.uid() and public.is_member(f.project_id)) or public.folder_can_read(f.folder_id)) then
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
