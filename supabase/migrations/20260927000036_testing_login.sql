-- 0036 Testing login (Jesse, Sep 28): "for all this testing turn the code thing off; only me and Matt have access;
-- we'll re-implement those safeguards at the end."
--   * Personal sign-in links: /k/<key> signs its owner straight in (no email, no code). Each key is a 32-byte random
--     secret; only its SHA-256 is stored; a key can be revoked. The key-login endpoint turns a key into a one-time
--     Supabase sign-in on the spot (nothing is emailed). Keys exist only for addresses on the sign-in allowlist.
--   * One switch, security_switches 'testing_relaxed_login', OFF by default (and in every test database). When ON:
--     signing doesn't ask to confirm it's you again, and the two-step login step for pricing is skipped. Turning it
--     OFF puts both safeguards back at once; nothing else changes.

create table public.security_switches (
  key text primary key check (key ~ '^[a-z_]{1,60}$'),
  enabled boolean not null default false,
  note text not null default '',
  updated_at timestamptz not null default now()
);
alter table public.security_switches enable row level security;
revoke all on public.security_switches from anon, authenticated;
insert into public.security_switches (key, enabled, note) values
  ('testing_relaxed_login', false, 'ON only while Jesse and Matt test: no re-confirmation to sign, no two-step for pricing.');

create or replace function public.testing_relaxed_login()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((select enabled from public.security_switches where key = 'testing_relaxed_login'), false);
$$;
revoke execute on function public.testing_relaxed_login() from public, anon;
grant execute on function public.testing_relaxed_login() to authenticated, service_role;

-- Signing: a fresh sign-in, unless the testing switch is on.
create or replace function public.signed_in_recently()
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select public.testing_relaxed_login() or exists (
    select 1
      from jsonb_array_elements(coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb -> 'amr', '[]'::jsonb)) m
     where jsonb_typeof(m -> 'timestamp') = 'number'
       and (m ->> 'timestamp')::double precision between extract(epoch from now()) - 300 and extract(epoch from now()) + 60
  );
$$;
revoke execute on function public.signed_in_recently() from public, anon, authenticated;

-- Capabilities: the two-step requirement (requires_aal2) is skipped while the testing switch is on.
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
      and (not rp.requires_aal2 or public.session_aal() = 'aal2' or public.testing_relaxed_login())
  );
$$;
revoke execute on function public.has_capability(uuid, text) from public, anon;

-- Personal sign-in links.
create table public.signin_keys (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  email text not null check (email = lower(btrim(email))),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  label text not null default '' check (length(label) <= 100),
  last_used_at timestamptz,
  revoked_at timestamptz
);
alter table public.signin_keys enable row level security;
revoke all on public.signin_keys from anon, authenticated;

-- Service role only (the key-login endpoint): the email for an active key on the allowlist, and marks it used.
create or replace function public.signin_key_email(p_token_hash text)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_email text;
begin
  update public.signin_keys k set last_used_at = now()
   where k.token_hash = p_token_hash and k.revoked_at is null
     and exists (select 1 from public.signin_allowlist a where lower(a.email) = k.email)
  returning k.email into v_email;
  return v_email;
end;
$$;
revoke execute on function public.signin_key_email(text) from public, anon, authenticated;
grant execute on function public.signin_key_email(text) to service_role;
