-- 0042 The calendar's inspections (SPEC §7.6, §13.2; MDR's schedule calendar, Jesse Sep 28: "migrate my calendar
-- over"). The month calendar shows every job's requests and blocked time the way ir_calendar() gives them (in full for
-- my own and for the GC team and inspectors; time, type and color for everyone else's), with what a day's request
-- card shows besides: its attachments and how often it was postponed.
--   * calendar_inspections(job, from, to): ir_calendar() plus attachment_ids and postpone_count (full rows only), or
--     no rows when I may not see the job's inspections. "All my jobs" asks each of my jobs, and a job
--     where I can't see inspections is not an error. SECURITY INVOKER: the extra columns come through the
--     inspection_requests RLS policy, the same audience ir_calendar() gives full rows to.
--   * "Waiting on the GC" gets its own gray status (MDR's pending_gc), so a request the GC hasn't passed on no longer
--     looks like one waiting on the inspector: ir_status_key() answers 'gc_review' (lib/status has the key), and the
--     calendar lines of requests already waiting on the GC are brought in line.
-- No tables, no capability rows.

-- ---------------------------------------------------------------------------
-- ir_status_key: the lib/status key for a request (src/features/inspections/model.ts requestChip mirrors it).
-- create or replace keeps the grants 0024 set (service role only).
-- ---------------------------------------------------------------------------
create or replace function public.ir_status_key(p_status text, p_result text, p_helper uuid)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case
    when p_status = 'postponed' then 'postponed'
    when p_status = 'gc_review' then 'gc_review'
    when p_status = 'returned' then 'blocked'
    when p_status = 'withdrawn' then 'cancelled'
    when p_result = 'approved' then 'approved'
    when p_result = 'not_approved' then 'not_approved'
    when p_status = 'confirmed' and p_helper is not null then 'assigned'
    when p_status in ('confirmed', 'complete') then 'confirmed'
    else 'pending'
  end;
$$;

-- The lines of requests waiting on the GC today still say 'pending'.
update public.calendar_entries ce
   set status = 'gc_review'
  from public.inspection_requests r
 where ce.source_type = 'inspection_request' and ce.source_id = r.id and r.status = 'gc_review'
   and ce.status is distinct from 'gc_review';

-- ---------------------------------------------------------------------------
-- calendar_inspections: one job's inspection calendar for the month view, or nothing when I may not see it.
-- ---------------------------------------------------------------------------
create or replace function public.calendar_inspections(p_project_id uuid, p_from date, p_to date)
returns table (
  id uuid,
  number int,
  version int,
  full_detail boolean,
  mine boolean,
  is_block boolean,
  request_date date,
  start_time time,
  duration_kind text,
  duration_min int,
  kind text,
  special_kind text,
  status text,
  status_key text,
  result text,
  attendance text,
  company text,
  items text,
  owner_id uuid,
  helper_id uuid,
  postpone_reason text,
  postpone_until date,
  attachment_ids uuid[],
  postpone_count int
)
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
#variable_conflict use_column
begin
  -- The same test ir_calendar() makes, answered with no rows instead of an error.
  if not (public.has_capability(p_project_id, 'ir.request') or public.has_capability(p_project_id, 'ir.view_all')
          or public.has_capability(p_project_id, 'ir.decide')) then
    return;
  end if;
  return query
    select c.id, c.number, c.version, c.full_detail, c.mine, c.is_block, c.request_date, c.start_time, c.duration_kind,
           c.duration_min, c.kind, c.special_kind, c.status, c.status_key, c.result, c.attendance, c.company, c.items,
           c.owner_id, c.helper_id, c.postpone_reason, c.postpone_until,
           coalesce(r.attachment_ids, '{}'::uuid[]), coalesce(r.postpone_count, 0)
      from public.ir_calendar(p_project_id, p_from, p_to) c
      -- RLS on inspection_requests: my own request, or any for the GC team and inspectors (ir_calendar's full rows).
      left join public.inspection_requests r on r.id = c.id and not c.is_block
     order by c.request_date, c.start_time nulls first, c.number nulls last;
end;
$$;
revoke execute on function public.calendar_inspections(uuid, date, date) from public, anon;
grant execute on function public.calendar_inspections(uuid, date, date) to authenticated, service_role;

-- Special inspections and the look-ahead are part of an inspector's calendar (MDR shows them): on by default, and on
-- for everyone now (staging has only test users).
alter table public.user_layout alter column calendar_types
  set default '{inspections,special_inspections,deliveries,meetings,milestones,lookahead}';
update public.user_layout
   set calendar_types = array(select distinct t from unnest(calendar_types || '{special_inspections,lookahead}'::text[]) t)
 where not (calendar_types @> '{special_inspections,lookahead}'::text[]);
