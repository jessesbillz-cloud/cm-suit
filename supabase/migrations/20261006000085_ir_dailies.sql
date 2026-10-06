-- 0085 Inspections and dailies, from Jesse's use of the live app on Oct 5.
--   1. Confirm is its own step. Attendance only ever set the attendance (ir_set_attendance never touched the status,
--      proven in 73_ir_dailies), but the Result step was open on a pending request and a result tap confirms it (0024),
--      so a stray tap a moment after "Be present with the IOR" turned the request green and confirmed, and clearing the
--      result left it confirmed. The app now opens Result only once the request is confirmed. Here: the requests the
--      bug left confirmed with nothing recorded (the last status change was a result tap, the result since cleared, no
--      IR made) go back to pending, as "Back to pending" in their history.
--   2. The day's inspection requests fill the inspector's daily (MDR "put the schedule on the report"). daily_day_facts
--      (0070) also answers each request's company and whether it is with OFS (so the app files each line only on the
--      daily of the one who decides it), and the requests received that day for another day ('received', the day read
--      in the job's zone). The app writes the lines into an open draft (prefill, no duplicates, editable), and Generate
--      IR still writes the result over the same line (0029, daily_note_ir, ref ir:<request id>).

-- =====================================================================================================================
-- 1. Requests confirmed by a result tap alone, back to pending
-- =====================================================================================================================
update public.inspection_requests r
   set status = 'pending'
 where r.status = 'confirmed' and r.result is null and r.ir_file_id is null and r.deleted_at is null
   and (select e.action from public.ir_events e
         where e.request_id = r.id and e.changes ? 'status'
         order by e.id desc limit 1) = 'result'
   and set_config('app.ir_action', 'unconfirm', true) = 'unconfirm';

-- =====================================================================================================================
-- 2. What the job knows that day: plus each request's company and route, and the requests received that day
-- =====================================================================================================================
create or replace function public.daily_day_facts(p_project_id uuid, p_day date)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    -- Who signed in at that day's meetings, by company and trade, a person at two meetings counts once.
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
                                          'status', r.status, 'result', r.result, 'helper_id', r.helper_id,
                                          'company', r.company, 'ofs_sent', r.ofs_sent_at is not null)
                       order by r.start_time nulls last, r.number)
        from public.inspection_requests r
        left join public.ir_special_kinds k on k.id = r.special_kind_id
       where r.project_id = p_project_id and r.request_date = p_day and r.deleted_at is null
         and r.status <> 'withdrawn'), '[]'::jsonb),
    -- Requests that came in that day (the job's day) for another day: a received line on that day's daily.
    'received', coalesce((
      select jsonb_agg(jsonb_build_object('id', r.id, 'number', r.number, 'kind', r.kind, 'special', k.name,
                                          'items', r.items, 'company', r.company, 'request_date', r.request_date,
                                          'start_time', to_char(r.start_time, 'HH24:MI'),
                                          'ofs_sent', r.ofs_sent_at is not null)
                       order by r.created_at, r.number)
        from public.inspection_requests r
        join public.projects p on p.id = r.project_id
        left join public.ir_special_kinds k on k.id = r.special_kind_id
       where r.project_id = p_project_id and r.deleted_at is null and r.request_date <> p_day
         and r.created_at >= (p_day::timestamp at time zone p.timezone)
         and r.created_at < ((p_day + 1)::timestamp at time zone p.timezone)), '[]'::jsonb));
$$;

revoke execute on function public.daily_day_facts(uuid, date) from public, anon;
grant execute on function public.daily_day_facts(uuid, date) to authenticated, service_role;
