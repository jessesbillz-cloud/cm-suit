-- 0022 Calendar feed (SPEC §6.4 #7, §7.6): a per-person secret link that calendar apps subscribe to.
-- The raw token is shown once; only its sha256 is stored. "New link" replaces the hash, so the old link stops working.
-- The public calendar-feed edge function (service role) reads lines through calendar_feed_lines(), which applies the
-- same audience rule as the calendar_entries RLS policy for the token's person. No capability rows are added.

-- ---------------------------------------------------------------------------
-- calendar_feed_tokens: one row per person. People see when their link was made, never the hash.
-- ---------------------------------------------------------------------------
create table public.calendar_feed_tokens (
  user_id uuid primary key references auth.users(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  rotated_at timestamptz not null default now(),
  last_used_at timestamptz
);
alter table public.calendar_feed_tokens enable row level security;

revoke all on public.calendar_feed_tokens from anon, authenticated;
grant select (user_id, created_at, rotated_at, last_used_at) on public.calendar_feed_tokens to authenticated;
grant all on public.calendar_feed_tokens to service_role;
create policy "calendar feed: own row" on public.calendar_feed_tokens for select to authenticated
  using (user_id = auth.uid());
-- Written only by rotate_calendar_feed() (below) and read by the feed through calendar_feed_lines().

-- ---------------------------------------------------------------------------
-- rotate_calendar_feed(): the signed-in person makes their link (first time) or replaces it ("New link").
-- Returns the raw token once. Only its sha256 hex is kept.
-- ---------------------------------------------------------------------------
create or replace function public.rotate_calendar_feed()
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_uid uuid := auth.uid(); v_token text;
begin
  if v_uid is null then raise exception 'forbidden' using errcode = '42501'; end if;
  -- 32 random bytes as base64url (43 characters), the same shape as access-link tokens.
  v_token := rtrim(translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/', '-_'), '=');
  insert into public.calendar_feed_tokens (user_id, token_hash)
  values (v_uid, encode(extensions.digest(v_token, 'sha256'), 'hex'))
  on conflict (user_id) do update
    set token_hash = excluded.token_hash, rotated_at = now(), last_used_at = null;
  perform public.audit('calendar_feed.rotate', 'calendar_feed', v_uid, null);
  return v_token;
end;
$$;
revoke execute on function public.rotate_calendar_feed() from public, anon;
grant execute on function public.rotate_calendar_feed() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- calendar_feed_lines(p_token_hash): service role only (the public calendar-feed endpoint).
-- The lines the token's person may see, the last 30 and next 90 days. Same rule as "calendar: audience reads":
-- the line's read capability on an active, unexpired membership at aal1 (a feed has no two-step session), and a
-- personal line only for its person. Deleted lines, deleted jobs and jobs with the calendar off never show.
-- Unknown hash: no rows.
-- ---------------------------------------------------------------------------
create or replace function public.calendar_feed_lines(p_token_hash text)
returns table (
  id uuid,
  project_id uuid,
  project_name text,
  timezone text,
  kind text,
  title text,
  location text,
  starts_at timestamptz,
  ends_at timestamptz,
  all_day boolean,
  status text,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare v_person uuid;
begin
  if not public.is_service_role() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.calendar_feed_tokens t set last_used_at = now()
   where t.token_hash = p_token_hash
  returning t.user_id into v_person;
  if v_person is null then return; end if;

  return query
    select ce.id, ce.project_id, p.name, p.timezone, ce.kind, ce.title, ce.location, ce.starts_at, ce.ends_at,
           ce.all_day, ce.status, ce.updated_at
    from public.calendar_entries ce
    join public.projects p on p.id = ce.project_id and p.deleted_at is null and 'calendar' = any (p.modules)
    where ce.deleted_at is null
      and coalesce(ce.ends_at, ce.starts_at) >= now() - interval '30 days'
      and ce.starts_at < now() + interval '90 days'
      and (ce.user_id is null or ce.user_id = v_person)
      and exists (
        select 1
        from public.project_members pm
        join public.role_permissions rp on rp.role = pm.role
        where pm.project_id = ce.project_id
          and pm.user_id = v_person
          and pm.status = 'active'
          and (pm.access_ends_at is null or pm.access_ends_at > now())
          and rp.capability = ce.read_capability
          and not rp.requires_aal2
      )
    order by ce.starts_at, ce.id
    limit 5000;
end;
$$;
revoke execute on function public.calendar_feed_lines(text) from public, anon, authenticated;
grant execute on function public.calendar_feed_lines(text) to service_role;
