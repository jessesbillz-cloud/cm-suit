-- 0002 Tenancy and people (SPEC §5.1), access helpers (§5.2).

-- ---------------------------------------------------------------------------
-- orgs
-- ---------------------------------------------------------------------------
create table public.orgs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  version int not null default 1,
  deleted_at timestamptz,
  name text not null check (length(name) between 1 and 200),
  kind text not null check (kind in ('gc', 'sub', 'inspector', 'architect', 'owner', 'other')),
  settings jsonb not null default '{}'::jsonb,
  intake_address text unique
);
alter table public.orgs enable row level security;
create trigger touch before update on public.orgs for each row execute function public.tg_touch_row();
create trigger no_delete before delete on public.orgs for each row execute function public.tg_block_delete();

create table public.org_members (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  version int not null default 1,
  org_id uuid not null references public.orgs(id),
  user_id uuid not null references auth.users(id),
  org_role text not null check (org_role in ('owner', 'admin', 'member')),
  unique (org_id, user_id)
);
alter table public.org_members enable row level security;
create trigger touch before update on public.org_members for each row execute function public.tg_touch_row();

-- ---------------------------------------------------------------------------
-- profiles: only the user reads their own.
-- ---------------------------------------------------------------------------
create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version int not null default 1,
  full_name text not null default '',
  email text not null,
  phone text,
  title text,
  company text,
  signature_path text,
  cert_numbers jsonb not null default '{}'::jsonb,
  timezone text not null default 'America/Los_Angeles'
);
alter table public.profiles enable row level security;
create trigger touch before update on public.profiles for each row execute function public.tg_touch_row();

create policy "profile: own read" on public.profiles for select to authenticated using (user_id = auth.uid());
create policy "profile: own update" on public.profiles for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and email = (select email from auth.users where id = auth.uid()));

-- A profile row is created when the auth user is created.
create or replace function public.tg_create_profile()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (user_id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', ''))
  on conflict (user_id) do nothing;
  return new;
end;
$$;
revoke execute on function public.tg_create_profile() from public, anon, authenticated;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.tg_create_profile();

-- ---------------------------------------------------------------------------
-- projects
-- ---------------------------------------------------------------------------
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  version int not null default 1,
  deleted_at timestamptz,
  org_id uuid not null references public.orgs(id),
  name text not null check (length(name) between 1 and 200),
  number text,
  address text,
  timezone text not null default 'America/Los_Angeles',
  stage text not null default 'prospect'
    check (stage in ('prospect', 'bidding', 'awarded', 'lost', 'construction', 'closeout', 'archived')),
  job_type text,
  funding text,
  prevailing_wage boolean not null default false,
  modules text[] not null default '{}',
  settings jsonb not null default '{}'::jsonb,
  inbound_address text unique,
  delivery_token_hash text,
  request_token_hash text,
  bid_due_at timestamptz,
  bid_sealed boolean not null default false
);
alter table public.projects enable row level security;
create trigger touch before update on public.projects for each row execute function public.tg_touch_row();
create trigger no_delete before delete on public.projects for each row execute function public.tg_block_delete();
create index projects_org on public.projects (org_id);

-- ---------------------------------------------------------------------------
-- project_members: membership is a real table, never arrays on the project.
-- ---------------------------------------------------------------------------
create table public.project_members (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  version int not null default 1,
  org_id uuid not null references public.orgs(id),
  project_id uuid not null references public.projects(id),
  user_id uuid references auth.users(id),
  invite_email text not null check (invite_email = lower(invite_email)),
  member_org_id uuid references public.orgs(id),
  role text not null references public.roles(name),
  status text not null default 'invited' check (status in ('invited', 'active', 'revoked')),
  access_ends_at timestamptz,
  invited_by uuid references auth.users(id),
  revoked_at timestamptz,
  start_numbers jsonb not null default '{}'::jsonb,
  unique (project_id, invite_email, role)
);
alter table public.project_members enable row level security;
create trigger touch before update on public.project_members for each row execute function public.tg_touch_row();
create trigger no_delete before delete on public.project_members for each row execute function public.tg_block_delete();
create index project_members_user on public.project_members (user_id, project_id) where status = 'active';
create index project_members_project on public.project_members (project_id);
create index project_members_email on public.project_members (invite_email) where user_id is null;

create table public.member_scopes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  project_member_id uuid not null references public.project_members(id) on delete cascade,
  scope_type text not null,
  scope_id text not null,
  unique (project_member_id, scope_type, scope_id)
);
alter table public.member_scopes enable row level security;
create index member_scopes_member on public.member_scopes (project_member_id);

create table public.user_layout (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version int not null default 1,
  rail_items text[] not null default '{board,files,calendar}',
  main_default text not null default 'board',
  docked_panel text not null default 'board',
  collapsed jsonb not null default '{"rail": false, "right": false}'::jsonb,
  calendar_types text[] not null default '{inspections,deliveries,meetings,milestones}',
  notification_kinds text[] not null default '{tasks,rfi_answers,impact_claims,ir_results}',
  recent_project_ids uuid[] not null default '{}',
  whats_new_enabled boolean not null default true
);
alter table public.user_layout enable row level security;
create trigger touch before update on public.user_layout for each row execute function public.tg_touch_row();
create policy "layout: own" on public.user_layout for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Access helpers (SPEC §5.2). STABLE, SECURITY DEFINER, caller from auth.uid() only.
-- ---------------------------------------------------------------------------
create or replace function public.session_aal()
returns text
language sql
stable
set search_path = public, pg_temp
as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'aal', 'aal1')
$$;

create or replace function public.has_capability(p_project_id uuid, p_cap text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.project_members pm
    join public.role_permissions rp on rp.role = pm.role
    where pm.project_id = p_project_id
      and pm.user_id = auth.uid()
      and pm.status = 'active'
      and (pm.access_ends_at is null or pm.access_ends_at > now())
      and rp.capability = p_cap
      and (not rp.requires_aal2 or public.session_aal() = 'aal2')
  );
$$;
revoke execute on function public.has_capability(uuid, text) from public, anon;

create or replace function public.is_member(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.project_members pm
    where pm.project_id = p_project_id
      and pm.user_id = auth.uid()
      and pm.status = 'active'
      and (pm.access_ends_at is null or pm.access_ends_at > now())
  );
$$;
revoke execute on function public.is_member(uuid) from public, anon;

create or replace function public.has_scope(p_project_id uuid, p_scope_type text, p_scope_id text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.project_members pm
    join public.member_scopes ms on ms.project_member_id = pm.id
    where pm.project_id = p_project_id
      and pm.user_id = auth.uid()
      and pm.status = 'active'
      and (pm.access_ends_at is null or pm.access_ends_at > now())
      and ms.scope_type = p_scope_type
      and ms.scope_id = p_scope_id
  );
$$;
revoke execute on function public.has_scope(uuid, text, text) from public, anon;

-- is_owner_of: author-owned records. Entity tables register themselves in owner_lookup.
create table public.owner_lookup (
  entity_type text primary key,
  table_name text not null,
  owner_column text not null default 'created_by'
);
alter table public.owner_lookup enable row level security;

create or replace function public.is_owner_of(p_entity_type text, p_entity_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare r public.owner_lookup; found_owner uuid;
begin
  select * into r from public.owner_lookup where entity_type = p_entity_type;
  if r is null then return false; end if;
  execute format('select %I from public.%I where id = $1', r.owner_column, r.table_name) into found_owner using p_entity_id;
  return found_owner is not null and found_owner = auth.uid();
end;
$$;
revoke execute on function public.is_owner_of(text, uuid) from public, anon;

create or replace function public.is_org_admin(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.org_members om
    where om.org_id = p_org_id and om.user_id = auth.uid() and om.org_role in ('owner', 'admin')
  );
$$;
revoke execute on function public.is_org_admin(uuid) from public, anon;

-- Which roles are "walled" (bidders): anyone whose role has bids.submit. Not a role name in code.
create or replace function public.role_is_walled(p_role text)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select exists (select 1 from public.role_permissions where role = p_role and capability = 'bids.submit');
$$;

-- ---------------------------------------------------------------------------
-- RLS policies for tenancy tables
-- ---------------------------------------------------------------------------
create policy "orgs: members read" on public.orgs for select to authenticated
  using (exists (select 1 from public.org_members om where om.org_id = orgs.id and om.user_id = auth.uid())
         or exists (select 1 from public.project_members pm where pm.org_id = orgs.id and pm.user_id = auth.uid() and pm.status = 'active'));
create policy "orgs: admins update" on public.orgs for update to authenticated
  using (public.is_org_admin(id)) with check (public.is_org_admin(id));
create policy "orgs: signed-in create" on public.orgs for insert to authenticated
  with check (created_by = auth.uid());

create policy "org_members: own org read" on public.org_members for select to authenticated
  using (user_id = auth.uid() or public.is_org_admin(org_id));
create policy "org_members: admins manage" on public.org_members for insert to authenticated
  with check (public.is_org_admin(org_id));
create policy "org_members: admins update" on public.org_members for update to authenticated
  using (public.is_org_admin(org_id)) with check (public.is_org_admin(org_id));

create policy "projects: members read" on public.projects for select to authenticated
  using (deleted_at is null and (public.is_member(id) or public.is_org_admin(org_id)));
create policy "projects: org members create" on public.projects for insert to authenticated
  with check (created_by = auth.uid() and exists (select 1 from public.org_members om where om.org_id = projects.org_id and om.user_id = auth.uid()));
create policy "projects: admins update" on public.projects for update to authenticated
  using (public.has_capability(id, 'project.manage') or public.is_org_admin(org_id))
  with check (public.has_capability(id, 'project.manage') or public.is_org_admin(org_id));

-- Members list: your own row always; the rest only with members.view, and walled roles only with bids.manage.
create policy "project_members: read" on public.project_members for select to authenticated
  using (
    user_id = auth.uid()
    or (public.has_capability(project_id, 'members.view')
        and (not public.role_is_walled(role) or public.has_capability(project_id, 'bids.manage')))
    or public.is_org_admin(org_id)
  );
create policy "project_members: manage insert" on public.project_members for insert to authenticated
  with check (public.has_capability(project_id, 'members.manage') or public.is_org_admin(org_id));
create policy "project_members: manage update" on public.project_members for update to authenticated
  using (public.has_capability(project_id, 'members.manage') or public.is_org_admin(org_id))
  with check (public.has_capability(project_id, 'members.manage') or public.is_org_admin(org_id));

create policy "member_scopes: read" on public.member_scopes for select to authenticated
  using (exists (select 1 from public.project_members pm where pm.id = member_scopes.project_member_id
                 and (pm.user_id = auth.uid() or public.has_capability(pm.project_id, 'members.manage'))));
create policy "member_scopes: manage" on public.member_scopes for all to authenticated
  using (exists (select 1 from public.project_members pm where pm.id = member_scopes.project_member_id and public.has_capability(pm.project_id, 'members.manage')))
  with check (exists (select 1 from public.project_members pm where pm.id = member_scopes.project_member_id and public.has_capability(pm.project_id, 'members.manage')));

-- ---------------------------------------------------------------------------
-- New project: creator becomes project_admin automatically; org_id copied to members.
-- ---------------------------------------------------------------------------
create or replace function public.tg_project_created()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare creator_email text;
begin
  select email into creator_email from auth.users where id = new.created_by;
  insert into public.project_members (org_id, project_id, user_id, invite_email, member_org_id, role, status, created_by)
  values (new.org_id, new.id, new.created_by, lower(creator_email), new.org_id, 'project_admin', 'active', new.created_by);
  return new;
end;
$$;
revoke execute on function public.tg_project_created() from public, anon, authenticated;
create trigger on_project_created after insert on public.projects for each row execute function public.tg_project_created();

-- New org: creator becomes owner.
create or replace function public.tg_org_created()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.org_members (org_id, user_id, org_role, created_by) values (new.id, new.created_by, 'owner', new.created_by);
  return new;
end;
$$;
revoke execute on function public.tg_org_created() from public, anon, authenticated;
create trigger on_org_created after insert on public.orgs for each row execute function public.tg_org_created();

-- ---------------------------------------------------------------------------
-- accept_invites(): binds pending invites for the signed-in email. Called after every sign-in.
-- ---------------------------------------------------------------------------
create or replace function public.accept_invites()
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare my_email text; n int;
begin
  select lower(email) into my_email from auth.users where id = auth.uid();
  if my_email is null then return 0; end if;
  update public.project_members
     set user_id = auth.uid(), status = 'active'
   where invite_email = my_email and user_id is null and status = 'invited';
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke execute on function public.accept_invites() from public, anon;

-- ---------------------------------------------------------------------------
-- people_display(project_id): name + company only, for people the caller may see.
-- ---------------------------------------------------------------------------
create or replace function public.people_display(p_project_id uuid)
returns table (user_id uuid, member_id uuid, full_name text, company text, role text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select pm.user_id, pm.id, coalesce(nullif(p.full_name, ''), split_part(pm.invite_email, '@', 1)),
         coalesce(o.name, p.company, ''), pm.role
  from public.project_members pm
  left join public.profiles p on p.user_id = pm.user_id
  left join public.orgs o on o.id = pm.member_org_id
  where pm.project_id = p_project_id
    and pm.status <> 'revoked'
    and public.is_member(p_project_id)
    and (pm.user_id = auth.uid()
         or (public.has_capability(p_project_id, 'members.view')
             and (not public.role_is_walled(pm.role) or public.has_capability(p_project_id, 'bids.manage'))));
$$;
revoke execute on function public.people_display(uuid) from public, anon;

-- my_projects(): the job picker source.
create or replace function public.my_projects()
returns table (project_id uuid, name text, number text, org_name text, role text, stage text, timezone text, modules text[])
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.id, p.name, p.number, o.name, pm.role, p.stage, p.timezone, p.modules
  from public.project_members pm
  join public.projects p on p.id = pm.project_id and p.deleted_at is null
  join public.orgs o on o.id = p.org_id
  where pm.user_id = auth.uid() and pm.status = 'active'
    and (pm.access_ends_at is null or pm.access_ends_at > now());
$$;
revoke execute on function public.my_projects() from public, anon;
