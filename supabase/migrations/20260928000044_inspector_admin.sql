-- 0044 The inspector who runs the job (Jesse, Sep 28): an inspector uses this app for all their daily reports and
-- scheduling the way they use My Daily Reports today: they create their own jobs and run them. Until now a job's
-- creator became project_admin (0002), which has no inspector abilities, and the inspector role has no admin ones; one
-- person holds one role per job.
--   * Role inspector_admin, "Inspector who runs the job": every capability the inspector has plus every one the
--     project admin has, except bids.* (no bid management, pricing or findings on an inspector's job). Copied as data
--     from role_permissions as it stands after 0001-0043; a capability that needs the second factor for either role
--     needs it here too. From now on it is its own row set: Jesse edits it as data like any other role.
--   * Its recommended rail is the inspector's (0040, with Hours from 0043).
--   * tg_project_created: the creator of a job in an inspector company becomes inspector_admin; every other company
--     kind still makes project_admin.
--   * Existing jobs of inspector companies (inspector_admin_backfill, run once here; owner only, safe to run again):
--     the creator's membership, when it is project_admin or inspector, becomes inspector_admin (one row per person and
--     job, the project_admin row first; a second row the creator may hold is left as it is). A tester who is viewing as
--     another role (0039) keeps the viewed role on the job; the real role kept aside in testing_role_home changes the
--     same way, so "Me" brings them back as inspector_admin. Jobs of every other company kind are untouched.

-- ---------------------------------------------------------------------------------------------------------------------
-- The role, its capabilities and its rail, as data
-- ---------------------------------------------------------------------------------------------------------------------
insert into public.roles (name, description, recommended_tools)
select 'inspector_admin', 'Inspector who runs the job', r.recommended_tools
  from public.roles r
 where r.name = 'inspector';

insert into public.role_permissions (role, capability, requires_aal2)
select 'inspector_admin', rp.capability, bool_or(rp.requires_aal2)
  from public.role_permissions rp
 where rp.role in ('inspector', 'project_admin')
   and rp.capability not like 'bids.%'
 group by rp.capability;

-- ---------------------------------------------------------------------------------------------------------------------
-- New job: the creator's role follows the company's kind
-- ---------------------------------------------------------------------------------------------------------------------
create or replace function public.tg_project_created()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare creator_email text; creator_role text;
begin
  select email into creator_email from auth.users where id = new.created_by;
  creator_role := case when (select o.kind from public.orgs o where o.id = new.org_id) = 'inspector'
                       then 'inspector_admin' else 'project_admin' end;
  insert into public.project_members (org_id, project_id, user_id, invite_email, member_org_id, role, status, created_by)
  values (new.org_id, new.id, new.created_by, lower(creator_email), new.org_id, creator_role, 'active', new.created_by);
  return new;
end;
$$;
revoke execute on function public.tg_project_created() from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------------
-- Existing jobs of inspector companies. Returns the number of memberships changed.
-- ---------------------------------------------------------------------------------------------------------------------
create or replace function public.inspector_admin_backfill()
returns int
language plpgsql
set search_path = public, pg_temp
as $$
declare n int;
begin
  -- A tester viewing as another role: the real role kept aside.
  update public.testing_role_home h
     set real_role = 'inspector_admin'
    from public.projects p
    join public.orgs o on o.id = p.org_id
   where h.project_id = p.id and h.user_id = p.created_by
     and o.kind = 'inspector'
     and h.real_role in ('project_admin', 'inspector');

  -- The creator's membership: one row per person and job (project_admin first), none when they already hold
  -- inspector_admin there (also what the unique key needs), never a row that shows a viewed role (its real role is the
  -- one above).
  with pick as (
    select distinct on (pm.project_id, pm.user_id) pm.id
      from public.project_members pm
      join public.projects p on p.id = pm.project_id and pm.user_id = p.created_by
      join public.orgs o on o.id = p.org_id
     where o.kind = 'inspector'
       and pm.role in ('project_admin', 'inspector')
       and pm.status <> 'revoked'
       and not exists (select 1 from public.testing_role_home h where h.user_id = pm.user_id and h.project_id = pm.project_id)
       and not exists (select 1 from public.project_members x
                        where x.project_id = pm.project_id and x.role = 'inspector_admin'
                          and (x.user_id = pm.user_id or x.invite_email = pm.invite_email))
     order by pm.project_id, pm.user_id, (pm.role = 'project_admin') desc, pm.created_at, pm.id
  )
  update public.project_members pm
     set role = 'inspector_admin'
    from pick
   where pm.id = pick.id;
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke execute on function public.inspector_admin_backfill() from public, anon, authenticated, service_role;

select public.inspector_admin_backfill();
