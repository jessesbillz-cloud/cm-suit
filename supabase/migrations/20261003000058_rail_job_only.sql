-- 0058 On a job the rail is that job's alone (Jesse, Oct 3): "once you're on a job, it should all be specific to that
-- job and there's way too much stuff on the left."
--   * The rail on a job has no general part any more (lib/jobs railModel): the job's name, its tools in my order, More,
--     Edit. The job's own Board and Calendar are job tools like any other, so my list for a job may hold them:
--     job_rail_tools() gains board and calendar. Timesheets stays All my jobs only (a job's hours are its Hours).
--   * Nothing else changes. Saved lists only ever held tools that are still allowed; the recommendations stay data
--     (roles.recommended_tools, my_recommended_tools). The app's default list on a job is the recommendation without
--     the Board (the right column shows the job's board), then Files, so Files is one tap on every job.
create or replace function public.job_rail_tools()
returns text[]
language sql
immutable
set search_path = public, pg_temp
as $$
  select '{board,files,bids,calendar,dailies,inspections,revs,rfis,permits,deliveries,corrections,people,hours}'::text[];
$$;
