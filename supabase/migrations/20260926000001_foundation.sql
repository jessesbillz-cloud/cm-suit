-- 0001 Foundation: extensions, common triggers, roles and capabilities.
-- Every table created in this repo gets RLS in the migration that creates it (CLAUDE.md rule 1).

create extension if not exists pgcrypto;
create extension if not exists pg_cron;
create extension if not exists pgmq;

-- ---------------------------------------------------------------------------
-- Common column behavior: updated_at + version bump on every update.
-- ---------------------------------------------------------------------------
create or replace function public.tg_touch_row()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  new.version := old.version + 1;
  return new;
end;
$$;

-- Version check helper used by update RPCs / data layer: raises on mismatch.
create or replace function public.assert_version(p_table regclass, p_id uuid, p_expected int)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v int;
begin
  execute format('select version from %s where id = $1', p_table) into v using p_id;
  if v is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if v <> p_expected then
    raise exception 'version_conflict: expected %, found %', p_expected, v using errcode = '40001';
  end if;
end;
$$;
revoke execute on function public.assert_version(regclass, uuid, int) from public, anon;

-- Soft-delete guard: users never hard-delete; policies only allow update of deleted_at.
create or replace function public.tg_block_delete()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if current_setting('request.jwt.claim.role', true) is distinct from 'service_role'
     and current_user <> 'postgres' then
    raise exception 'hard deletes are not allowed; set deleted_at instead' using errcode = '42501';
  end if;
  return old;
end;
$$;

-- ---------------------------------------------------------------------------
-- Roles and capabilities (SPEC §5.2). Data, not code.
-- ---------------------------------------------------------------------------
create table public.roles (
  name text primary key,
  description text not null default ''
);
alter table public.roles enable row level security;

insert into public.roles (name, description) values
  ('project_admin', 'Runs the project'),
  ('estimator', 'Bids and pricing'),
  ('pm', 'Project manager'),
  ('pe', 'Project engineer'),
  ('superintendent', 'Field lead for the GC'),
  ('foreman', 'Crew lead'),
  ('inspector', 'Inspector of record'),
  ('special_inspector', 'Special inspector'),
  ('bidder', 'Invited to bid'),
  ('sub', 'Subcontractor on the job'),
  ('architect', 'Architect / engineer of record'),
  ('owner_rep', 'Owner representative'),
  ('viewer', 'Read-only');

create table public.role_permissions (
  role text not null references public.roles(name) on delete cascade,
  capability text not null,
  requires_aal2 boolean not null default false,
  primary key (role, capability)
);
alter table public.role_permissions enable row level security;

-- Starting matrix. Jesse and Matt change this as data later.
insert into public.role_permissions (role, capability, requires_aal2) values
  ('project_admin', 'bids.view_pricing', true), ('estimator', 'bids.view_pricing', true),
  ('project_admin', 'bids.manage', false), ('estimator', 'bids.manage', false),
  ('bidder', 'bids.submit', false),
  ('project_admin', 'bids.view_ai_findings', true), ('estimator', 'bids.view_ai_findings', true),
  ('project_admin', 'dailies.read_all', false), ('pm', 'dailies.read_all', false), ('pe', 'dailies.read_all', false),
  ('superintendent', 'dailies.read_all', false), ('inspector', 'dailies.read_all', false), ('owner_rep', 'dailies.read_all', false),
  ('sub', 'ir.request', false), ('superintendent', 'ir.request', false), ('foreman', 'ir.request', false),
  ('pe', 'ir.request', false), ('project_admin', 'ir.request', false),
  ('inspector', 'ir.decide', false),
  ('superintendent', 'deliveries.manage', false), ('pm', 'deliveries.manage', false), ('project_admin', 'deliveries.manage', false),
  ('inspector', 'corrections.close', false),
  ('sub', 'rfi.create_draft', false), ('superintendent', 'rfi.create_draft', false), ('foreman', 'rfi.create_draft', false),
  ('pe', 'rfi.create_draft', false), ('pm', 'rfi.create_draft', false), ('project_admin', 'rfi.create_draft', false),
  ('pm', 'rfi.sign_issue', false), ('pe', 'rfi.sign_issue', false), ('project_admin', 'rfi.sign_issue', false),
  ('architect', 'rfi.answer', false),
  ('project_admin', 'rfi.view_internal_research', false), ('pm', 'rfi.view_internal_research', false),
  ('pe', 'rfi.view_internal_research', false), ('estimator', 'rfi.view_internal_research', false),
  ('project_admin', 'members.manage', false),
  -- Who may see the full people list (bidders are hidden from everyone without bids.manage).
  ('project_admin', 'members.view', false), ('estimator', 'members.view', false), ('pm', 'members.view', false),
  ('pe', 'members.view', false), ('superintendent', 'members.view', false), ('foreman', 'members.view', false),
  ('inspector', 'members.view', false), ('special_inspector', 'members.view', false), ('sub', 'members.view', false),
  ('architect', 'members.view', false), ('owner_rep', 'members.view', false), ('viewer', 'members.view', false),
  -- Files: default folder access lists reference these.
  ('project_admin', 'files.manage', false), ('pm', 'files.manage', false), ('pe', 'files.manage', false),
  ('project_admin', 'files.read_project', false), ('estimator', 'files.read_project', false), ('pm', 'files.read_project', false),
  ('pe', 'files.read_project', false), ('superintendent', 'files.read_project', false), ('foreman', 'files.read_project', false),
  ('inspector', 'files.read_project', false), ('special_inspector', 'files.read_project', false), ('sub', 'files.read_project', false),
  ('architect', 'files.read_project', false), ('owner_rep', 'files.read_project', false), ('viewer', 'files.read_project', false),
  ('project_admin', 'files.write_project', false), ('pm', 'files.write_project', false), ('pe', 'files.write_project', false),
  ('superintendent', 'files.write_project', false), ('inspector', 'files.write_project', false),
  -- Transmittals: who may send from the project.
  ('project_admin', 'transmittals.send', false), ('estimator', 'transmittals.send', false), ('pm', 'transmittals.send', false),
  ('pe', 'transmittals.send', false), ('superintendent', 'transmittals.send', false), ('inspector', 'transmittals.send', false),
  -- Project settings.
  ('project_admin', 'project.manage', false),
  -- Audit export.
  ('project_admin', 'audit.export', false), ('pm', 'audit.export', false);

-- Anyone signed in may read the matrix (it holds no user data); nobody but the service role writes it.
create policy "role_permissions readable by signed-in users" on public.role_permissions
  for select to authenticated using (auth.uid() is not null);
create policy "roles readable by signed-in users" on public.roles
  for select to authenticated using (auth.uid() is not null);
