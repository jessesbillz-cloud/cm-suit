-- 0035 Company invites: someone who hasn't signed in yet can be made a member of a company, the same way job invites
-- work. The invite is by email; the first sign-in with that email binds it (accept_invites), so an estimator's
-- company can be set up for him before he ever logs in. Org admins manage their company's invites.

create table public.org_invites (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  org_id uuid not null references public.orgs(id),
  invite_email text not null check (invite_email = lower(btrim(invite_email)) and invite_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  org_role text not null check (org_role in ('owner', 'admin', 'member')),
  accepted_at timestamptz,
  accepted_by uuid references auth.users(id),
  unique (org_id, invite_email)
);
alter table public.org_invites enable row level security;
revoke all on public.org_invites from anon, authenticated;
grant select, insert, delete on public.org_invites to authenticated;
create policy "org_invites: admins read" on public.org_invites for select to authenticated
  using (public.is_org_admin(org_id));
create policy "org_invites: admins invite" on public.org_invites for insert to authenticated
  with check (public.is_org_admin(org_id) and created_by = auth.uid() and accepted_at is null and accepted_by is null
              -- only an owner hands out ownership
              and (org_role <> 'owner' or exists (select 1 from public.org_members om
                                                 where om.org_id = org_invites.org_id and om.user_id = auth.uid()
                                                   and om.org_role = 'owner')));
create policy "org_invites: admins withdraw" on public.org_invites for delete to authenticated
  using (public.is_org_admin(org_id) and accepted_at is null);

-- Job invites as before, plus company invites for the signed-in email.
create or replace function public.accept_invites()
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare my_email text; n int; m int;
begin
  select lower(email) into my_email from auth.users where id = auth.uid();
  if my_email is null then return 0; end if;
  update public.project_members
     set user_id = auth.uid(), status = 'active'
   where invite_email = my_email and user_id is null and status = 'invited';
  get diagnostics n = row_count;
  insert into public.org_members (org_id, user_id, org_role, created_by)
  select i.org_id, auth.uid(), i.org_role, i.created_by
    from public.org_invites i
   where i.invite_email = my_email and i.accepted_at is null
  on conflict (org_id, user_id) do nothing;
  update public.org_invites set accepted_at = now(), accepted_by = auth.uid()
   where invite_email = my_email and accepted_at is null;
  get diagnostics m = row_count;
  return n + m;
end;
$$;
revoke execute on function public.accept_invites() from public, anon;
