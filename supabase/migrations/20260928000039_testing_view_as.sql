-- 0039 Testing: "View as" (Jesse, Sep 28): "a little drop-down at the top … I should be able to see it from the
-- architect, the contractor, the GC, the PE perspective, whatever I want … temporarily, and when this is over we get
-- rid of it."
--   * A tester (a row in testing_superusers, added by hand on staging; never in code) picks a role in the top bar and
--     really takes that role on every job they're on: the app, RLS and every capability answer as that role. "Me" puts
--     the real roles back (kept in testing_role_home the first time).
--   * Only while the switch security_switches 'testing_view_as' is ON (off by default and in every test database).
--   * To remove: pick "Me" first (or run testing_view_as(null) for each tester), switch it off, drop the two tables and
--     the two functions, and remove the ViewAs control.

insert into public.security_switches (key, enabled, note) values
  ('testing_view_as', false, 'ON only while testing: people in testing_superusers can take any role on their jobs from the top bar.');

create table public.testing_superusers (
  user_id uuid primary key references auth.users(id),
  created_at timestamptz not null default now()
);
alter table public.testing_superusers enable row level security;
revoke all on public.testing_superusers from anon, authenticated;

create table public.testing_role_home (
  user_id uuid not null references auth.users(id),
  project_id uuid not null references public.projects(id),
  real_role text not null references public.roles(name),
  created_at timestamptz not null default now(),
  primary key (user_id, project_id)
);
alter table public.testing_role_home enable row level security;
revoke all on public.testing_role_home from anon, authenticated;

-- What the top bar shows: null unless the switch is on and I'm a tester. viewing = the role I'm viewing as, or null
-- when I'm myself.
create or replace function public.testing_view_as_state()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when coalesce((select s.enabled from public.security_switches s where s.key = 'testing_view_as'), false)
     and exists (select 1 from public.testing_superusers t where t.user_id = auth.uid())
    then jsonb_build_object(
      'viewing', (select pm.role from public.testing_role_home h
                    join public.project_members pm on pm.project_id = h.project_id and pm.user_id = h.user_id
                   where h.user_id = auth.uid() order by h.project_id limit 1),
      'roles', (select jsonb_agg(jsonb_build_object('name', r.name, 'label', r.description) order by r.name)
                  from public.roles r))
  end;
$$;
revoke execute on function public.testing_view_as_state() from public, anon;
grant execute on function public.testing_view_as_state() to authenticated;

-- Take p_role on every job I'm on (null: back to my real roles). Returns the new state.
create or replace function public.testing_view_as(p_role text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not coalesce((select s.enabled from public.security_switches s where s.key = 'testing_view_as'), false)
     or not exists (select 1 from public.testing_superusers t where t.user_id = auth.uid()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_role is not null and not exists (select 1 from public.roles r where r.name = p_role) then
    raise exception 'No such role.' using errcode = '22023';
  end if;
  -- My real roles, remembered once (a job I joined while viewing is remembered with the role it has now).
  insert into public.testing_role_home (user_id, project_id, real_role)
  select pm.user_id, pm.project_id, pm.role from public.project_members pm
   where pm.user_id = auth.uid() and pm.status = 'active'
  on conflict do nothing;
  if p_role is null then
    update public.project_members pm set role = h.real_role
      from public.testing_role_home h
     where h.user_id = auth.uid() and pm.user_id = h.user_id and pm.project_id = h.project_id
       and pm.role is distinct from h.real_role;
    delete from public.testing_role_home where user_id = auth.uid();
  else
    update public.project_members pm set role = p_role
     where pm.user_id = auth.uid() and pm.status = 'active' and pm.role is distinct from p_role
       and pm.project_id in (select h.project_id from public.testing_role_home h where h.user_id = auth.uid());
  end if;
  return public.testing_view_as_state();
end;
$$;
revoke execute on function public.testing_view_as(text) from public, anon;
grant execute on function public.testing_view_as(text) to authenticated;
