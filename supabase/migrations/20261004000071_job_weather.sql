-- 0071 Weather is automatic on every daily (SPEC §18.1 principle 5; Jesse, Oct 3: the National Weather Service for the
-- job's location, recorded on each daily, and the person can correct it; the address is turned into a location once
-- with the US Census geocoder. Both are free, need no key and are approved). Nobody is asked for a latitude.
--   * project_places: where the job is, one row per job. The server (edge function job-weather) looks the job's address
--     up once and stores the first match (source 'census'), or that the address had no match (no coordinates: never a
--     guess), together with the address it looked up, so a changed address is looked up again and an unmatched one is
--     not asked about on every daily. A person with project.manage may type the location by hand (source 'typed'),
--     which the server's lookup never replaces unless that person asks ("Look up again"), or empty it so it is looked
--     up again.
--   * project_weather: what the weather was, one row per job and day: high and low (°F), conditions in plain words,
--     whether it is a forecast or what the nearest station observed, when it was read and where for (a moved location
--     asks again). An observed row is final: a forecast never replaces it.
--   * Deny by default: members of the job read both (is_member); nobody writes either by hand, the server key
--     included (select only: supabase/tests/58_service_grants.sql). Writes are the SECURITY DEFINER functions below:
--     two for the server (is_service_role, like ir_attach_pdf) and one for a person with project.manage.
--   * What is saved on a report is what prints: the editor fills an empty report's weather from here once and the
--     person types over it. Nothing here touches a report.

-- =====================================================================================================================
-- Tables
-- =====================================================================================================================
create table public.project_places (
  project_id uuid primary key,
  org_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Who typed it; null when the server looked it up.
  updated_by uuid references auth.users(id),
  -- Both empty: the address was looked up and had no match (or the location was emptied to be looked up again).
  lat double precision check (lat between -90 and 90),
  lon double precision check (lon between -180 and 180),
  -- The address as the geocoder wrote it back.
  matched_address text not null default '' check (length(matched_address) <= 300),
  source text not null check (source in ('census', 'typed')),
  -- The job's address this lookup was for ('' = not looked up yet). A different address is looked up again.
  looked_up text not null default '' check (length(looked_up) <= 500),
  foreign key (project_id, org_id) references public.projects (id, org_id),
  check ((lat is null) = (lon is null)),
  check (source = 'census' or lat is not null),
  check (lat is not null or matched_address = '')
);
alter table public.project_places enable row level security;

create table public.project_weather (
  project_id uuid not null,
  org_id uuid not null,
  day date not null,
  high_f int check (high_f between -80 and 140),
  low_f int check (low_f between -80 and 140),
  conditions text not null default '' check (length(conditions) <= 120),
  source text not null check (source in ('nws_forecast', 'nws_observed')),
  -- Where it was read for.
  lat double precision not null check (lat between -90 and 90),
  lon double precision not null check (lon between -180 and 180),
  fetched_at timestamptz not null default now(),
  primary key (project_id, day),
  foreign key (project_id, org_id) references public.projects (id, org_id),
  check (high_f is null or low_f is null or low_f <= high_f),
  check (high_f is not null or low_f is not null or conditions <> '')
);
alter table public.project_weather enable row level security;

-- =====================================================================================================================
-- RLS: members read; every write is a function below
-- =====================================================================================================================
create policy "project_places: members read" on public.project_places for select to authenticated
  using (public.is_member(project_id));
create policy "project_weather: members read" on public.project_weather for select to authenticated
  using (public.is_member(project_id));

revoke all on public.project_places, public.project_weather from public, anon, authenticated, service_role;
grant select on public.project_places, public.project_weather to authenticated, service_role;

-- =====================================================================================================================
-- The server's writes (service role only; job-weather checks the caller first)
-- =====================================================================================================================
-- Stores what the lookup of p_address answered: a match (coordinates and the address as matched), or no match
-- (p_lat and p_lon null). A typed location stays unless p_replace_typed (the person asked to look it up again).
-- Answers whether the row is now this lookup's.
create or replace function public.project_place_store(
  p_project_id uuid, p_lat double precision, p_lon double precision, p_matched text, p_address text, p_replace_typed boolean
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_org uuid; v_n int;
begin
  if not public.is_service_role() then raise exception 'forbidden' using errcode = '42501'; end if;
  if (p_lat is null) <> (p_lon is null) then raise exception 'A location is a latitude and a longitude.' using errcode = '22023'; end if;
  if btrim(coalesce(p_address, '')) = '' then raise exception 'No address was looked up.' using errcode = '22023'; end if;
  select org_id into v_org from public.projects where id = p_project_id and deleted_at is null;
  if v_org is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  insert into public.project_places as pp (project_id, org_id, lat, lon, matched_address, source, looked_up)
  values (p_project_id, v_org, p_lat, p_lon,
          case when p_lat is null then '' else left(btrim(coalesce(p_matched, '')), 300) end, 'census', left(p_address, 500))
  on conflict (project_id) do update
    set lat = excluded.lat, lon = excluded.lon, matched_address = excluded.matched_address, source = 'census',
        looked_up = excluded.looked_up, updated_at = now(), updated_by = null
    where pp.source = 'census' or coalesce(p_replace_typed, false);
  get diagnostics v_n = row_count;
  return v_n > 0;
end;
$$;

-- Stores a day's weather as read for the place at (p_lat, p_lon). A forecast never replaces what was observed.
-- Answers whether it was stored.
create or replace function public.project_weather_store(
  p_project_id uuid, p_day date, p_high_f int, p_low_f int, p_conditions text, p_source text,
  p_lat double precision, p_lon double precision
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_org uuid; v_n int;
begin
  if not public.is_service_role() then raise exception 'forbidden' using errcode = '42501'; end if;
  select org_id into v_org from public.projects where id = p_project_id and deleted_at is null;
  if v_org is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  insert into public.project_weather as w (project_id, org_id, day, high_f, low_f, conditions, source, lat, lon)
  values (p_project_id, v_org, p_day, p_high_f, p_low_f, left(btrim(coalesce(p_conditions, '')), 120), p_source, p_lat, p_lon)
  on conflict (project_id, day) do update
    set high_f = excluded.high_f, low_f = excluded.low_f, conditions = excluded.conditions, source = excluded.source,
        lat = excluded.lat, lon = excluded.lon, fetched_at = now()
    where not (w.source = 'nws_observed' and excluded.source = 'nws_forecast' and w.lat = excluded.lat and w.lon = excluded.lon);
  get diagnostics v_n = row_count;
  return v_n > 0;
end;
$$;

-- =====================================================================================================================
-- The location typed by hand (project.manage), or emptied so the address is looked up again
-- =====================================================================================================================
-- Both left out (or null): emptied.
create or replace function public.project_place_set(
  p_project_id uuid, p_lat double precision default null, p_lon double precision default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_org uuid;
begin
  if auth.uid() is null or not public.has_capability(p_project_id, 'project.manage') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if (p_lat is null) <> (p_lon is null) then raise exception 'Type both the latitude and the longitude.' using errcode = '22023'; end if;
  -- NaN and infinity are outside every range, so they are refused here too.
  if p_lat is not null and (p_lat not between -90 and 90 or p_lon not between -180 and 180) then
    raise exception 'That is not a latitude and a longitude.' using errcode = '22023';
  end if;
  select org_id into v_org from public.projects where id = p_project_id and deleted_at is null;
  if v_org is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if p_lat is null then
    -- Emptied: the next daily (or "Look up again") looks the address up.
    update public.project_places
       set lat = null, lon = null, matched_address = '', source = 'census', looked_up = '', updated_at = now(),
           updated_by = auth.uid()
     where project_id = p_project_id;
  else
    insert into public.project_places as pp (project_id, org_id, lat, lon, source, updated_by)
    values (p_project_id, v_org, p_lat, p_lon, 'typed', auth.uid())
    on conflict (project_id) do update
      set lat = excluded.lat, lon = excluded.lon, matched_address = '', source = 'typed', looked_up = '',
          updated_at = now(), updated_by = auth.uid();
  end if;
  perform public.audit('project.place', 'project', p_project_id, p_project_id, v_org,
    jsonb_build_object('lat', p_lat, 'lon', p_lon));
end;
$$;

-- =====================================================================================================================
-- Grants: the typed location for people; the two stores for the server only
-- =====================================================================================================================
revoke execute on function public.project_place_set(uuid, double precision, double precision) from public, anon;
grant execute on function public.project_place_set(uuid, double precision, double precision) to authenticated, service_role;

revoke execute on function public.project_place_store(uuid, double precision, double precision, text, text, boolean)
  from public, anon, authenticated;
grant execute on function public.project_place_store(uuid, double precision, double precision, text, text, boolean)
  to service_role;
revoke execute on function public.project_weather_store(uuid, date, integer, integer, text, text, double precision, double precision)
  from public, anon, authenticated;
grant execute on function public.project_weather_store(uuid, date, integer, integer, text, text, double precision, double precision)
  to service_role;
