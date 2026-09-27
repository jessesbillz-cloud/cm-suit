-- 0008 Time zone detection (CLAUDE.md rule 14). Nobody picks a zone by hand:
--   * the browser's zone is written to the profile after sign-in, until the person changes it themselves;
--   * a new project takes its creator's zone unless one is given.

alter table public.profiles add column timezone_set_by_user boolean not null default false;

create or replace function public.sync_detected_timezone(p_zone text)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare current_zone text;
begin
  if auth.uid() is null then raise exception 'sign in required' using errcode = '42501'; end if;
  -- Only IANA-looking names (Area/City). Anything else is ignored and the current zone kept.
  if p_zone !~ '^[A-Za-z_]+/[A-Za-z_+\-/]+$' then
    select timezone into current_zone from public.profiles where user_id = auth.uid();
    return current_zone;
  end if;
  update public.profiles set timezone = p_zone
   where user_id = auth.uid() and not timezone_set_by_user and timezone is distinct from p_zone;
  select timezone into current_zone from public.profiles where user_id = auth.uid();
  return current_zone;
end;
$$;
revoke execute on function public.sync_detected_timezone(text) from public, anon;
grant execute on function public.sync_detected_timezone(text) to authenticated, service_role;

-- A hand-edited zone stays hand-edited: the settings screen sets timezone_set_by_user = true in the same update.

-- Projects: default to the creator's zone.
alter table public.projects alter column timezone drop default;
alter table public.projects alter column timezone drop not null;

create or replace function public.tg_project_timezone_default()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.timezone is null or new.timezone = '' then
    select coalesce(p.timezone, 'America/Los_Angeles') into new.timezone
      from public.profiles p where p.user_id = coalesce(new.created_by, auth.uid());
    new.timezone := coalesce(new.timezone, 'America/Los_Angeles');
  end if;
  return new;
end;
$$;
revoke execute on function public.tg_project_timezone_default() from public, anon, authenticated;
create trigger project_timezone_default before insert on public.projects for each row execute function public.tg_project_timezone_default();
alter table public.projects add constraint projects_timezone_present check (timezone is not null and timezone <> '');
