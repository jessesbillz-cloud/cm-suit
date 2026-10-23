-- 0110 A company's letterhead and logo on its jobs (Jesse, Oct 4: "a place to upload the company logo / letterhead /
-- address so every generated document comes out on it"). Data only: a person uploads the logo and types the lines in
-- Settings > Company, nothing about any company is in code, and the app keeps its own name.
--   1. The letterhead (org_letterheads, one row per company): the name as printed, address, phone, website. Short
--      single-line text. Set by set_org_letterhead (the company's admins, is_org_admin, the same rule as the company's
--      name and logo), with a version check, safe to repeat, audited 'org.letterhead'.
--   2. The logo (orgs.logo_path, private bucket org-logos, 0038): now at most 1 MB, PNG or JPEG (an SVG is turned into a
--      PNG in the browser before upload, so a stored logo never carries script and every PDF can embed it).
--      set_org_logo also checks the stored file's own size and type when storage recorded them.
--   3. The job's brand (projects.brand_org_id, null = the company that runs the job): the company whose logo shows in
--      the job's top bar and heads its server-made PDFs. Picked in Settings > Job by project.manage among the job's
--      companies (job_brand_choices: the job's company, the companies of the job's members, and companies the
--      manager runs). set_job_brand only, audited 'project.brand'.
--   4. Who reads a brand (may_read_org_brand): the company's own members, and anyone on a job that the company runs,
--      brands or works on. The letterhead rows and the logo file follow it. job_brand(project) answers a job's brand
--      to its members. The server-made PDFs read it with the server key after the caller passed the record's own gate.

-- =====================================================================================================================
-- 1. The letterhead
-- =====================================================================================================================
create table public.org_letterheads (
  org_id uuid primary key references public.orgs(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  version int not null default 1,
  print_name text check (print_name is null or (length(print_name) between 1 and 120 and print_name !~ '[[:cntrl:]]')),
  address text check (address is null or (length(address) between 1 and 200 and address !~ '[[:cntrl:]]')),
  phone text check (phone is null or (length(phone) between 1 and 40 and phone !~ '[[:cntrl:]]')),
  website text check (website is null or (length(website) between 1 and 120 and website !~ '[[:cntrl:]]'))
);
alter table public.org_letterheads enable row level security;
create trigger touch before update on public.org_letterheads for each row execute function public.tg_touch_row();
create trigger no_delete before delete on public.org_letterheads for each row execute function public.tg_block_delete();

revoke all on public.org_letterheads from public, anon, authenticated, service_role;
grant select on public.org_letterheads to authenticated, service_role;

-- =====================================================================================================================
-- 2. The logo: 1 MB, PNG or JPEG
-- =====================================================================================================================
update storage.buckets set file_size_limit = 1048576, allowed_mime_types = array['image/png', 'image/jpeg']
 where id = 'org-logos';

create or replace function public.set_org_logo(p_org_id uuid, p_path text)
returns public.orgs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare o public.orgs; v_path text := nullif(btrim(coalesce(p_path, '')), ''); v_meta jsonb; v_found boolean;
begin
  if not public.is_org_admin(p_org_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  if v_path is not null and v_path <> 'org/' || p_org_id::text || '/logo' then
    raise exception 'That logo is not this company''s.' using errcode = '22023';
  end if;
  if v_path is not null then
    select true, so.metadata into v_found, v_meta from storage.objects so where so.bucket_id = 'org-logos' and so.name = v_path;
    if v_found is null then raise exception 'Upload the logo first.' using errcode = '22023'; end if;
    if coalesce(v_meta->>'size', '') ~ '^[0-9]+$' and (v_meta->>'size')::bigint > 1048576 then
      raise exception 'The logo is over 1 MB.' using errcode = '22023';
    end if;
    if nullif(v_meta->>'mimetype', '') is not null and v_meta->>'mimetype' not in ('image/png', 'image/jpeg') then
      raise exception 'PNG or JPEG only.' using errcode = '22023';
    end if;
  end if;
  update public.orgs set logo_path = v_path where id = p_org_id and deleted_at is null returning * into o;
  if o.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  perform public.audit('org.logo', 'org', o.id, null, o.id, jsonb_build_object('path', v_path));
  return o;
end;
$$;

-- =====================================================================================================================
-- 3. The job's brand
-- =====================================================================================================================
alter table public.projects add column brand_org_id uuid references public.orgs(id);
-- No column grant: only set_job_brand writes it (the 0013 grants list every column a person may set).

-- =====================================================================================================================
-- 4. Who reads a brand
-- =====================================================================================================================
-- The company's members, and anyone active on a job the company runs, brands, or has a member on.
create or replace function public.may_read_org_brand(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p_org_id is not null and (
    exists (select 1 from public.org_members om where om.org_id = p_org_id and om.user_id = auth.uid())
    or exists (
      select 1
        from public.project_members me
        join public.projects p on p.id = me.project_id and p.deleted_at is null
       where me.user_id = auth.uid() and me.status = 'active'
         and (me.access_ends_at is null or me.access_ends_at > now())
         and (p.org_id = p_org_id or p.brand_org_id = p_org_id
              or exists (select 1 from public.project_members o
                          where o.project_id = p.id and o.member_org_id = p_org_id and o.status = 'active'))));
$$;

create policy "org_letterheads: brand readers" on public.org_letterheads for select to authenticated
  using (public.may_read_org_brand(org_id));

create policy "storage org-logos: brand readers read" on storage.objects for select to authenticated
  using (bucket_id = 'org-logos' and public.may_read_org_brand(public.org_logo_org(name)));

-- =====================================================================================================================
-- 5. Setting and reading
-- =====================================================================================================================
-- The letterhead: blanks are none. p_version is the version the person saw (null or 0 before there is one). The same
-- values again answer the row as it is, whatever the version (a retry).
create or replace function public.set_org_letterhead(
  p_org_id uuid, p_version int, p_print_name text, p_address text, p_phone text, p_website text
)
returns public.org_letterheads
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r public.org_letterheads;
  v_name text := nullif(btrim(coalesce(p_print_name, '')), '');
  v_address text := nullif(btrim(coalesce(p_address, '')), '');
  v_phone text := nullif(btrim(coalesce(p_phone, '')), '');
  v_website text := nullif(btrim(coalesce(p_website, '')), '');
begin
  if not public.is_org_admin(p_org_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  if not exists (select 1 from public.orgs where id = p_org_id and deleted_at is null) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  select * into r from public.org_letterheads where org_id = p_org_id for update;
  if r.org_id is not null
     and r.print_name is not distinct from v_name and r.address is not distinct from v_address
     and r.phone is not distinct from v_phone and r.website is not distinct from v_website then
    return r;
  end if;
  if r.org_id is null then
    if coalesce(p_version, 0) <> 0 then raise exception 'version_conflict' using errcode = '40001'; end if;
    insert into public.org_letterheads (org_id, created_by, print_name, address, phone, website)
    values (p_org_id, auth.uid(), v_name, v_address, v_phone, v_website)
    returning * into r;
  else
    if p_version is distinct from r.version then raise exception 'version_conflict' using errcode = '40001'; end if;
    update public.org_letterheads
       set print_name = v_name, address = v_address, phone = v_phone, website = v_website
     where org_id = p_org_id
    returning * into r;
  end if;
  perform public.audit('org.letterhead', 'org', p_org_id, null, p_org_id,
    jsonb_build_object('print_name', v_name, 'address', v_address, 'phone', v_phone, 'website', v_website));
  return r;
end;
$$;

-- The companies a job may show: its own first, then its members' companies and the companies the manager runs.
create or replace function public.job_brand_choices(p_project_id uuid)
returns table (org_id uuid, name text)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare v_org uuid;
begin
  if not public.has_capability(p_project_id, 'project.manage') then raise exception 'forbidden' using errcode = '42501'; end if;
  select p.org_id into v_org from public.projects p where p.id = p_project_id and p.deleted_at is null;
  if v_org is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  return query
    select o.id, o.name
      from public.orgs o
     where o.deleted_at is null
       and (o.id = v_org
            or exists (select 1 from public.project_members pm
                        where pm.project_id = p_project_id and pm.member_org_id = o.id and pm.status = 'active')
            or exists (select 1 from public.org_members om where om.org_id = o.id and om.user_id = auth.uid()
                        and public.is_org_admin(o.id)))
     order by (o.id = v_org) desc, lower(o.name), o.id;
end;
$$;

-- Picks the job's brand among job_brand_choices: the job's own company (or null) clears it. Answers the brand in
-- effect. Picking the one already in effect changes nothing.
create or replace function public.set_job_brand(p_project_id uuid, p_org_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare p public.projects; v_next uuid;
begin
  if not public.has_capability(p_project_id, 'project.manage') then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into p from public.projects where id = p_project_id and deleted_at is null for update;
  if p.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  v_next := case when p_org_id is null or p_org_id = p.org_id then null else p_org_id end;
  if v_next is not null and not exists (select 1 from public.job_brand_choices(p_project_id) c where c.org_id = v_next) then
    raise exception 'Pick one of the job''s companies.' using errcode = '22023';
  end if;
  if p.brand_org_id is not distinct from v_next then return coalesce(v_next, p.org_id); end if;
  update public.projects set brand_org_id = v_next where id = p_project_id;
  perform public.audit('project.brand', 'project', p_project_id, p_project_id, null,
    jsonb_build_object('brand_org_id', v_next, 'was', p.brand_org_id));
  return coalesce(v_next, p.org_id);
end;
$$;

-- The job's brand for its top bar: the company, its logo's path and its letterhead. Nothing for someone not on the job.
create or replace function public.job_brand(p_project_id uuid)
returns table (org_id uuid, name text, logo_path text, print_name text, address text, phone text, website text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select o.id, o.name, o.logo_path, l.print_name, l.address, l.phone, l.website
    from public.projects p
    join public.orgs o on o.id = coalesce(p.brand_org_id, p.org_id)
    left join public.org_letterheads l on l.org_id = o.id
   where p.id = p_project_id and p.deleted_at is null
     and (public.is_member(p.id) or public.is_org_admin(p.org_id));
$$;

-- =====================================================================================================================
-- Grants
-- =====================================================================================================================
do $$
declare f text;
begin
  foreach f in array array[
    'public.set_org_letterhead(uuid, integer, text, text, text, text)', 'public.job_brand_choices(uuid)',
    'public.set_job_brand(uuid, uuid)', 'public.job_brand(uuid)',
    -- Asked by the org_letterheads and org-logos policies, as the reader.
    'public.may_read_org_brand(uuid)']
  loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;
