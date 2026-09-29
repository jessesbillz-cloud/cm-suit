-- 0045 Today's reports (My Daily Reports' home, SPEC §13.1): at the top of All my jobs, one card per job where I write
-- dailies, opening today's report there. my_daily_today() answers one row per job: my chosen form on it (the setup I
-- chose last, 0041), the job's "today" in the JOB's time zone (SPEC §8.8), whether today is one of the setup's schedule
-- days, and today's report on that form: none yet, a draft, or submitted, with its number or the number it will get.
--   * Runs as the caller (SECURITY INVOKER): RLS answers only my own setups (on jobs I'm an active member of) and my own
--     reports; a deleted draft is not today's report. Nothing is made here: ensure_todays_draft / create_daily_report
--     still make today's copy.
--   * Only jobs that are going (not lost or archived), with Dailies on, where I still write dailies (dailies.write).
--   * Schedule days are read the way daily_is_scheduled reads them (0 = Sunday .. 6 = Saturday; a missing list means no
--     scheduled days). SQL never invents a default: the label is null when the setup has none.
--   * The number: today's report's own once it is signed, else what the next one will get (peek_author_number with the
--     dailies kind begin_daily_submit uses, 'dailies:' || report_type).

create or replace function public.my_daily_today()
returns table (
  project_id uuid,
  project_name text,
  report_type text,
  label text,
  schedule_days int[],
  today date,
  scheduled_today boolean,
  report_id uuid,
  status text,
  number int,
  next_number int
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with chosen as (
    select distinct on (s.project_id) s.project_id, s.report_type, s.settings
      from public.daily_setups s
     where s.author_id = auth.uid()
     order by s.project_id, s.chosen_at desc, s.created_at desc, s.id
  ),
  jobs as (
    select c.project_id, c.report_type, c.settings, p.name, (now() at time zone p.timezone)::date as today
      from chosen c
      join public.projects p on p.id = c.project_id
     where p.deleted_at is null
       and p.stage not in ('lost', 'archived')
       and 'dailies' = any (p.modules)
       and public.has_capability(p.id, 'dailies.write')
  )
  select j.project_id,
         j.name,
         j.report_type,
         nullif(btrim(j.settings ->> 'label'), ''),
         days.list,
         j.today,
         extract(dow from j.today)::int = any (days.list),
         r.id,
         coalesce(r.status, 'none'),
         r.number,
         case when r.number is null then public.peek_author_number(j.project_id, 'dailies:' || j.report_type) end
    from jobs j
    cross join lateral (
      select coalesce(array_agg(distinct v.n::int order by v.n::int), '{}'::int[]) as list
        from jsonb_array_elements(case when jsonb_typeof(j.settings -> 'schedule_days') = 'array'
                                       then j.settings -> 'schedule_days' else '[]'::jsonb end) e (d)
        cross join lateral (select case when jsonb_typeof(e.d) = 'number' then (e.d #>> '{}')::numeric end as n) v
       where v.n in (0, 1, 2, 3, 4, 5, 6)
    ) days
    left join public.daily_reports r
      on r.project_id = j.project_id and r.author_id = auth.uid() and r.report_type = j.report_type
     and r.report_date = j.today and r.deleted_at is null
   order by j.name, j.project_id;
$$;

revoke execute on function public.my_daily_today() from public, anon;
grant execute on function public.my_daily_today() to authenticated;
