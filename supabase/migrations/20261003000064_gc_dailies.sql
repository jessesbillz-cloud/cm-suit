-- 0064 Dailies for any company and trade (Jesse, Oct 3: "superintendents and foremen have daily reports to do too ... we
-- have the ability to upload the daily report format from whatever company they're using, and the generator, so we
-- generate the PDF from the app's data, very simple"). Two built-in forms join the VIS form in the forms registry
-- (_shared/reportForms.ts): the superintendent's daily ('gc_daily': weather, manpower, equipment, work performed,
-- deliveries, inspections, visitors, delays, safety, notes, photos) and the foreman's daily ('foreman_daily': crew and
-- hours, work done, materials, issues, notes, photos). Their PDF comes from the saved report through submit-daily
-- (_shared/pdf/gcDaily.ts) and the ONE stamp, like every daily. Reminders are unchanged and apply to every form: a draft
-- is a "my due" calendar line at the setup's submit-by time in the job's zone (0023), and my_daily_today (0045) shows it.
--   1. roles.daily_form: the form a role writes by default, as data (superintendent: gc_daily, foreman: foreman_daily;
--      none for the others, whose default stays their company's form, then the work log). my_daily_form(job) answers the
--      caller's (SECURITY INVOKER: RLS on project_members and roles answers). A person's own pick in Setup always wins.
--   2. daily_carryover also brings back a form's carried table rows (manpower, crew, equipment: rows marked carry), their
--      numbers ('count', 'hours': reportForms NUMBER_CELLS) cleared, so the company and trade come back and the day's
--      counts are typed or filled again. "pulled" (the sources already filled in) never carries. A report without tables
--      carries exactly as before.
--   3. daily_day_facts(job, day): what the job knows that day, for prefilling a report as it is opened (the app merges it
--      in once per source, never over what was typed): sign-ins of that day's safety meetings by company and trade
--      (people counted once), that day's closed meetings ("Tailgate held: ..."), deliveries and inspection requests.
--      SECURITY INVOKER: each table's own read rules answer, so a caller sees only what they could open anyway.

-- 1. The role's default form ------------------------------------------------------------------------------------------
alter table public.roles add column daily_form text check (daily_form is null or daily_form ~ '^[a-z0-9_]{1,40}$');

update public.roles r
   set daily_form = v.form
  from (values ('superintendent', 'gc_daily'), ('foreman', 'foreman_daily')) v(name, form)
 where r.name = v.name;

create or replace function public.my_daily_form(p_project_id uuid)
returns text
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select r.daily_form
    from public.project_members pm
    join public.roles r on r.name = pm.role
   where pm.project_id = p_project_id and pm.user_id = auth.uid() and pm.status = 'active'
     and (pm.access_ends_at is null or pm.access_ends_at > now())
     and r.daily_form is not null
   order by pm.created_at, r.name
   limit 1;
$$;

revoke execute on function public.my_daily_form(uuid) from public, anon;
grant execute on function public.my_daily_form(uuid) to authenticated, service_role;

-- 2. Carryover with a form's tables (same as 0023 plus the carried table rows) ----------------------------------------
create or replace function public.daily_carryover(p_prev jsonb)
returns jsonb
language sql
immutable
set search_path = public, pg_temp
as $$
  with src as (
    select case when jsonb_typeof(p_prev->'work') = 'array' then p_prev->'work' else '[]'::jsonb end as work,
           case when jsonb_typeof(p_prev->'notes') = 'object' then p_prev->'notes' else '{}'::jsonb end as notes,
           case when jsonb_typeof(p_prev->'carry_sections') = 'array' then p_prev->'carry_sections' else '[]'::jsonb end as carry,
           case when jsonb_typeof(p_prev->'tables') = 'object' then p_prev->'tables' else '{}'::jsonb end as tables
  ),
  kept as (
    select t.key,
           jsonb_agg(jsonb_set(x.r, '{cells}',
                               (case when jsonb_typeof(x.r->'cells') = 'object' then x.r->'cells' else '{}'::jsonb end)
                                 - 'count' - 'hours')
                     order by x.o) as rows
      from src
     cross join lateral jsonb_each(src.tables) t
     cross join lateral jsonb_array_elements(case when jsonb_typeof(t.value) = 'array' then t.value else '[]'::jsonb end)
           with ordinality as x (r, o)
     where jsonb_typeof(x.r) = 'object' and x.r->>'carry' = 'true'
     group by t.key
  )
  select jsonb_build_object(
    'work', coalesce((select jsonb_agg(w || '{"hours": null}'::jsonb order by ord)
                      from src, jsonb_array_elements(src.work) with ordinality as t (w, ord)
                      where jsonb_typeof(w) = 'object' and w->>'carry' = 'true'), '[]'::jsonb),
    'notes', coalesce((select jsonb_object_agg(e.key, e.value)
                       from src, jsonb_each(src.notes) e
                       where e.key in (select jsonb_array_elements_text(src.carry))), '{}'::jsonb),
    'carry_sections', (select carry from src),
    'inspections', '[]'::jsonb)
    || case when exists (select 1 from kept)
            then jsonb_build_object('tables', (select jsonb_object_agg(k.key, k.rows) from kept k))
            else '{}'::jsonb end
  from src;
$$;
revoke execute on function public.daily_carryover(jsonb) from public, anon, authenticated;

-- 3. What the job knows that day -------------------------------------------------------------------------------------
create or replace function public.daily_day_facts(p_project_id uuid, p_day date)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    -- Who signed in at that day's meetings, by company and trade; a person at two meetings counts once.
    'signins', coalesce((
      select jsonb_agg(jsonb_build_object('company', g.company, 'trade', g.trade, 'count', g.n) order by lower(g.company), lower(g.trade))
        from (select min(btrim(s.company)) as company, min(btrim(s.trade)) as trade, count(distinct s.name_key)::int as n
                from public.safety_signins s
                join public.safety_meetings m on m.id = s.meeting_id
               where m.project_id = p_project_id and m.held_on = p_day and s.removed_at is null
               group by lower(btrim(s.company)), lower(btrim(s.trade))) g), '[]'::jsonb),
    -- That day's closed meetings, with how many signed in.
    'meetings', coalesce((
      select jsonb_agg(jsonb_build_object('id', m.id, 'kind', m.kind, 'number', m.number, 'title', m.title,
                                          'signed', (select count(*) from public.safety_signins s
                                                      where s.meeting_id = m.id and s.removed_at is null)::int)
                       order by m.number)
        from public.safety_meetings m
       where m.project_id = p_project_id and m.held_on = p_day and m.status = 'closed'), '[]'::jsonb),
    'deliveries', coalesce((
      select jsonb_agg(jsonb_build_object('id', d.id, 'number', d.number, 'starts_at', d.starts_at, 'company', c.name,
                                          'description', d.description, 'standby', d.standby)
                       order by d.starts_at nulls last, d.number)
        from public.deliveries d
        join public.delivery_companies c on c.id = d.company_id
       where d.project_id = p_project_id and d.delivery_date = p_day and d.deleted_at is null), '[]'::jsonb),
    'inspections', coalesce((
      -- Raw kind and status: the app labels them its one way (features/inspections/model typeLabel, requestChip).
      select jsonb_agg(jsonb_build_object('id', r.id, 'number', r.number, 'kind', r.kind, 'special', k.name,
                                          'items', r.items, 'start_time', to_char(r.start_time, 'HH24:MI'),
                                          'status', r.status, 'result', r.result, 'helper_id', r.helper_id)
                       order by r.start_time nulls last, r.number)
        from public.inspection_requests r
        left join public.ir_special_kinds k on k.id = r.special_kind_id
       where r.project_id = p_project_id and r.request_date = p_day and r.deleted_at is null
         and r.status <> 'withdrawn'), '[]'::jsonb));
$$;

revoke execute on function public.daily_day_facts(uuid, date) from public, anon;
grant execute on function public.daily_day_facts(uuid, date) to authenticated, service_role;
