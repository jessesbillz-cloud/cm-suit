-- 0016 Sign-in allowlist. When the list has any rows, only those emails can get an account (the email code creates
-- the account on first sign-in, so this is who can sign in at all). An empty list means no limit.
-- Staging lists Jesse's two addresses; the rows are data, entered on staging, never in a migration (CLAUDE.md rule 8).
create table public.signin_allowlist (
  email text primary key check (email = lower(btrim(email)) and email like '%@%'),
  created_at timestamptz not null default now()
);
alter table public.signin_allowlist enable row level security;
-- No policies: nobody reads or writes it through the API. It is edited with SQL on the server.
revoke all on public.signin_allowlist from anon, authenticated;

create or replace function public.tg_signin_allowlist()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if exists (select 1 from public.signin_allowlist)
     and not exists (select 1 from public.signin_allowlist where email = lower(btrim(new.email))) then
    raise exception 'This email can''t sign in here.' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke execute on function public.tg_signin_allowlist() from public, anon, authenticated;
grant execute on function public.tg_signin_allowlist() to service_role;
create trigger signin_allowlist before insert on auth.users for each row execute function public.tg_signin_allowlist();
