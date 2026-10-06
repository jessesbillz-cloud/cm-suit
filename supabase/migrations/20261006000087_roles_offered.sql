-- 0087 The roles people pick from, in Jesse's words (Oct 5, on the live app: "all these different roles that don't
-- even make sense. I asked for project engineer, project manager, superintendent, inspector, fire marshal, special
-- inspector - actually inspector and special inspector should be interchangeable - and owner, or construction
-- manager/owner").
--
--   * roles.invitable now marks exactly six roles, the ones People's invite form and the testing "View as" offer:
--     Project manager (pm), Project engineer (pe), Superintendent, Inspector (inspector), Fire marshal (ahj) and
--     Owner / CM (owner_rep). Their description is that plain label, and roles.sort gives the order.
--   * Inspector covers the special inspector too. special_inspector stays a role (people already holding it keep it)
--     but is not offered. It holds a subset of what the inspector holds (it lacks ir.decide, ir.request, ir.view_all,
--     dailies.read_all, corrections.create, corrections.close, revs.manage, permits.read, calendar.manage,
--     files.write_project and transmittals.send).
--   * No role is deleted and the capability matrix does not change. Every existing membership keeps its role and what
--     that role may do, and its chip still reads that role's own description.
--   * testing_view_as_state lists the offered roles in that order (plus the role being viewed as, when it is another).
--   * my_capabilities: every capability I hold on a job, in one call, by the same test as has_capability. The app
--     reads it once per job instead of asking has_capability once per capability per screen.
--   * profiles.timezone_set_by_user goes back to false. Settings no longer offers a time zone picker (CLAUDE.md rule
--     14: the browser's zone is detected and nobody is asked to pick one), so a zone picked there earlier would
--     otherwise stop detection for good.

alter table public.roles add column sort smallint not null default 100;

update public.roles set invitable = false
 where invitable and name not in ('pm', 'pe', 'superintendent', 'inspector', 'ahj', 'owner_rep');

update public.roles r
   set invitable = true, description = v.label, sort = v.sort
  from (values
    ('pm', 'Project manager', 10),
    ('pe', 'Project engineer', 20),
    ('superintendent', 'Superintendent', 30),
    ('inspector', 'Inspector', 40),
    ('ahj', 'Fire marshal', 50),
    ('owner_rep', 'Owner / CM', 60)
  ) as v(name, label, sort)
 where r.name = v.name;

-- What the top bar shows: null unless the switch is on and I'm a tester (as 0039). The roles are the offered ones in
-- their order, and the one I'm viewing as when it is not among them (so the picker can show it).
create or replace function public.testing_view_as_state()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with viewing as (
    select (select pm.role from public.testing_role_home h
              join public.project_members pm on pm.project_id = h.project_id and pm.user_id = h.user_id
             where h.user_id = auth.uid() order by h.project_id limit 1) as role
  )
  select case
    when coalesce((select s.enabled from public.security_switches s where s.key = 'testing_view_as'), false)
     and exists (select 1 from public.testing_superusers t where t.user_id = auth.uid())
    then jsonb_build_object(
      'viewing', (select v.role from viewing v),
      'roles', (select jsonb_agg(jsonb_build_object('name', r.name, 'label', r.description) order by r.sort, r.description)
                  from public.roles r
                 where r.invitable or r.name = (select v.role from viewing v)))
  end;
$$;
revoke execute on function public.testing_view_as_state() from public, anon;
grant execute on function public.testing_view_as_state() to authenticated;

-- Every capability I hold on a job: the has_capability test (0036) for all of them at once.
create or replace function public.my_capabilities(p_project_id uuid)
returns text[]
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(array_agg(distinct rp.capability order by rp.capability), '{}')
    from public.project_members pm
    join public.role_permissions rp on rp.role = pm.role
   where pm.project_id = p_project_id
     and pm.user_id = auth.uid()
     and pm.status = 'active'
     and (pm.access_ends_at is null or pm.access_ends_at > now())
     and (not rp.requires_aal2 or public.session_aal() = 'aal2' or public.testing_relaxed_login());
$$;
revoke execute on function public.my_capabilities(uuid) from public, anon;
grant execute on function public.my_capabilities(uuid) to authenticated;

update public.profiles set timezone_set_by_user = false where timezone_set_by_user;
