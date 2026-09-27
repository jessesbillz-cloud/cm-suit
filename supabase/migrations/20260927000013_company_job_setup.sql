-- 0013 Company and job setup from the app (SPEC §5.1): no more SQL seeding to start a company or a job.
--   * create_org / create_project: invoker rights, so the RLS insert policies stay the only gate; the existing
--     triggers make the creator owner / project_admin, set the job's time zone and default folders. The database makes
--     the ID. Repeating the same create (double tap, retry) returns the first row instead of a duplicate.
--   * my_orgs(): the companies I belong to, with my role in each (invoker rights; RLS decides what shows).
--   * Column grants: signed-in people insert and edit a job's and a company's own fields only, never org_id,
--     created_by, intake/inbound addresses or tokens.
--   * Sealed bids: once a bid is in, no signed-in person can lift the seal or pull bid time earlier until bid time.
--   * Modules: every module the app has today is on for new jobs; jobs with none get the same set.

-- ---------------------------------------------------------------------------
-- Modules
-- ---------------------------------------------------------------------------
alter table public.projects alter column modules set default '{bids,files,calendar}';
update public.projects set modules = '{bids,files,calendar}' where modules = '{}';

-- ---------------------------------------------------------------------------
-- create_org(name, kind) -> org id
-- ---------------------------------------------------------------------------
create or replace function public.create_org(p_name text, p_kind text)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_name text := btrim(coalesce(p_name, ''));
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  -- One create at a time per person, so a repeat sees the first one (fresh snapshot per statement).
  perform pg_advisory_xact_lock(hashtext('create_org:' || v_uid::text));
  select o.id into v_id
    from public.orgs o
   where o.created_by = v_uid and o.deleted_at is null and lower(o.name) = lower(v_name)
   limit 1;
  if v_id is not null then
    return v_id;
  end if;
  v_id := gen_random_uuid();
  insert into public.orgs (id, name, kind, created_by) values (v_id, v_name, p_kind, v_uid);
  return v_id;
end;
$$;
revoke execute on function public.create_org(text, text) from public, anon;
grant execute on function public.create_org(text, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- create_project(org, name, number, address, stage, bid due, prevailing wage, job type) -> project id
-- The time zone is not asked: tg_project_timezone_default fills it from the creator's profile.
-- ---------------------------------------------------------------------------
create or replace function public.create_project(
  p_org_id uuid,
  p_name text,
  p_number text,
  p_address text,
  p_stage text,
  p_bid_due_at timestamptz,
  p_prevailing_wage boolean,
  p_job_type text
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
  insert into public.projects (id, org_id, name, number, address, stage, bid_due_at, prevailing_wage, job_type, created_by)
  values (v_id, p_org_id, v_name, v_number, nullif(btrim(coalesce(p_address, '')), ''), p_stage, p_bid_due_at,
          coalesce(p_prevailing_wage, false), nullif(btrim(coalesce(p_job_type, '')), ''), v_uid);
  return v_id;
end;
$$;
revoke execute on function public.create_project(uuid, text, text, text, text, timestamptz, boolean, text) from public, anon;
grant execute on function public.create_project(uuid, text, text, text, text, timestamptz, boolean, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- my_orgs(): my companies and my role in each.
-- ---------------------------------------------------------------------------
create or replace function public.my_orgs()
returns table (org_id uuid, name text, kind text, org_role text, version int)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select o.id, o.name, o.kind, om.org_role, o.version
  from public.org_members om
  join public.orgs o on o.id = om.org_id and o.deleted_at is null
  where om.user_id = auth.uid()
  order by o.name;
$$;
revoke execute on function public.my_orgs() from public, anon;
grant execute on function public.my_orgs() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Column grants: the fields a person may set. Everything else is written by triggers, RPCs or the service role.
-- (A table-level revoke also removes column grants, so the grants below are the complete list.)
-- ---------------------------------------------------------------------------
revoke insert, update on public.orgs from authenticated;
grant insert (id, name, kind, created_by) on public.orgs to authenticated;
grant update (name, kind, settings) on public.orgs to authenticated;

revoke insert, update on public.projects from authenticated;
grant insert (id, org_id, name, number, address, stage, bid_due_at, prevailing_wage, job_type, created_by) on public.projects to authenticated;
grant update (name, number, address, timezone, stage, job_type, funding, prevailing_wage, modules, settings, bid_due_at, bid_sealed)
  on public.projects to authenticated;

-- ---------------------------------------------------------------------------
-- Sealed-bid guard (SPEC §11.4: nobody opens submissions, Matt included, until bid time).
-- Definer rights: the person editing the job cannot see sealed submissions, but the guard must.
-- It guards people (a signed-in caller); system writes (service role, migrations) have no auth.uid() and pass.
-- ---------------------------------------------------------------------------
create or replace function public.tg_project_seal_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is not null
     and old.bid_sealed and old.bid_due_at is not null and now() < old.bid_due_at
     and (not new.bid_sealed or new.bid_due_at is null or new.bid_due_at < old.bid_due_at)
     and exists (select 1 from public.bid_submissions s where s.project_id = old.id) then
    raise exception 'Bids are sealed until bid time. The seal stays on and bid time cannot move earlier.' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke execute on function public.tg_project_seal_guard() from public, anon, authenticated;
grant execute on function public.tg_project_seal_guard() to service_role;
create trigger seal_guard before update of bid_sealed, bid_due_at on public.projects
  for each row execute function public.tg_project_seal_guard();
