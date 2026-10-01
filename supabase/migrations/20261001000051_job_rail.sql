-- 0051 The rail in two parts (Jesse, Oct 1): "on the left-hand side there is more for our big general things ... if you
-- select a job, then certain things should pop up under it ... So they would be customizable within the job."
--   * The top of the rail (Board, Calendar and the other cross-job tools) is fixed; the app decides it (lib/jobs).
--   * user_job_rail: per person, per job, the tools under the job's name, in that person's order. No row, or tools
--     null = my position's recommendation on that job (my_recommended_tools, 0040). '{}' = nothing chosen (all under
--     More). Own rows only, and only while I'm on the job.
--   * job_rail_tools(): the tools that may sit under a job's name: every rail tool except the top ones (Board,
--     Calendar) and Timesheets (All my jobs only). Adding a tool later is one entry here and one in lib/layout.
--   * save_job_rail(p_project_id, p_tools, p_version): the one write, with a version check (null = the first save).
--   * Pins (user_layout.rail_items, 0040) are retired: one way to choose the rail, under each job. Each person's pins
--     are carried into a row for every job they are on, so nobody loses their choice. The column stays, unread, until
--     Jesse OKs dropping it (CLAUDE.md: ask before deleting data).

-- ---------------------------------------------------------------------------
-- The tools a job's part of the rail can hold
-- ---------------------------------------------------------------------------
create or replace function public.job_rail_tools()
returns text[]
language sql
immutable
set search_path = public, pg_temp
as $$
  select '{files,bids,dailies,inspections,rfis,deliveries,corrections,people,hours}'::text[];
$$;

-- A list to save: null (= the recommendation), or known tools, each once, one dimension, no nulls.
create or replace function public.job_rail_ok(p_tools text[])
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select p_tools is null
      or (coalesce(array_ndims(p_tools), 1) = 1
          and array_position(p_tools, null) is null
          and p_tools <@ public.job_rail_tools()
          and cardinality(p_tools) = (select count(distinct t)::int from unnest(p_tools) t));
$$;

revoke execute on function public.job_rail_tools(), public.job_rail_ok(text[]) from public, anon;
grant execute on function public.job_rail_tools(), public.job_rail_ok(text[]) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- My tools under each job's name
-- ---------------------------------------------------------------------------
create table public.user_job_rail (
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version int not null default 1,
  -- In my order; null = my recommendation there.
  tools text[] check (public.job_rail_ok(tools)),
  primary key (user_id, project_id)
);
alter table public.user_job_rail enable row level security;
create trigger touch before update on public.user_job_rail for each row execute function public.tg_touch_row();

-- Read: mine, on a job I'm on now. Writes only through save_job_rail.
revoke all on public.user_job_rail from anon, authenticated;
grant select on public.user_job_rail to authenticated;
create policy "user_job_rail: mine, on my jobs" on public.user_job_rail for select to authenticated
  using (user_id = auth.uid() and public.is_member(project_id));

create or replace function public.save_job_rail(p_project_id uuid, p_tools text[], p_version int default null)
returns public.user_job_rail
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare r public.user_job_rail;
begin
  if auth.uid() is null or not public.is_member(p_project_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if not public.job_rail_ok(p_tools) then
    raise exception 'Pick from the job''s tools, each once.' using errcode = '22023';
  end if;
  if p_version is null then
    insert into public.user_job_rail (user_id, project_id, tools)
    values (auth.uid(), p_project_id, p_tools)
    on conflict (user_id, project_id) do nothing
    returning * into r;
  else
    update public.user_job_rail
       set tools = p_tools
     where user_id = auth.uid() and project_id = p_project_id and version = p_version
    returning * into r;
  end if;
  if r.user_id is null then raise exception 'version_conflict' using errcode = '40001'; end if;
  return r;
end;
$$;
revoke execute on function public.save_job_rail(uuid, text[], int) from public, anon;
grant execute on function public.save_job_rail(uuid, text[], int) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Pins retired: each person's pins become their list on every job they are on (known job tools, in their order)
-- ---------------------------------------------------------------------------
insert into public.user_job_rail (user_id, project_id, tools)
select distinct on (l.user_id, pm.project_id)
       l.user_id, pm.project_id,
       array(select u.t
               from unnest(l.rail_items) with ordinality u(t, o)
              where u.t = any (public.job_rail_tools())
              group by u.t
              order by min(u.o))
  from public.user_layout l
  join public.project_members pm on pm.user_id = l.user_id and pm.status = 'active'
  join public.projects p on p.id = pm.project_id and p.deleted_at is null
 where l.rail_items is not null
 order by l.user_id, pm.project_id
on conflict (user_id, project_id) do nothing;

comment on column public.user_layout.rail_items is
  'Retired in 0051: carried into user_job_rail for each job; the app neither reads nor writes it. Drop once Jesse OKs.';
