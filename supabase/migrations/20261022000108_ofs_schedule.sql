-- 0108 OFS scheduling (Jesse, Oct 22: "right now we're doing things through text message. This could be easier because
-- there's a lot of inspections all over the place."). The fire marshal answers each OFS request's time in one tap, the
-- requester sees one clear state, and his phone calendar carries the lines.
--   1. The schedule state of an OFS request sent to OFS, one rule (ir_ofs_sched_state): Asked, Confirmed, Proposed (OFS
--      picked another time, waiting on the requester), Postponed, Done. Recorded on the request (ofs_sched, by, at, note)
--      and in its history (ir_events, the audit log) like every other step.
--   2. Confirm is ir_confirm (now also recording the OFS answer and telling the requester, the designated person and
--      whoever sent it). Pick another time is ir_ofs_propose: the request moves to that time, waiting on the requester,
--      with a board line and a Needs you task. Accept is ir_ofs_accept (the requester, the designated person or the
--      inspector). Ask again is the requester's Move (ir_move), which clears the proposal.
--   3. ofs_schedule: the fire marshal's OFS requests across all his jobs (or one), by day, and the ones that need a time.
--   4. The calendar feed: one line per OFS request sent to OFS for whoever reads OFS requests (ir.ofs_view), so his
--      subscribed calendar shows them with their times and state. calendar_feed_lines carries them even on a job with
--      the calendar tool off.
--   5. The designated person's start page (ofs_desk) answers each inspection's schedule state.
-- Nothing sends email or text messages.

-- =====================================================================================================================
-- 1. The request's schedule answer
-- =====================================================================================================================
alter table public.inspection_requests
  add column ofs_sched text check (ofs_sched in ('confirmed', 'proposed', 'accepted')),
  add column ofs_sched_by uuid references auth.users(id),
  add column ofs_sched_at timestamptz,
  add column ofs_sched_note text check (ofs_sched_note is null or length(ofs_sched_note) between 1 and 500);

alter table public.inspection_requests
  add constraint inspection_requests_ofs_sched_answer_check
    check ((ofs_sched is null) = (ofs_sched_at is null) and (ofs_sched is null) = (ofs_sched_by is null)
           and (ofs_sched is null or (kind = 'ofs' and ofs_sent_at is not null))
           and (ofs_sched_note is null or ofs_sched is not null));

-- The one rule for an OFS request's schedule state (src/features/inspections/ofsSchedule.ts mirrors it).
create or replace function public.ir_ofs_sched_state(p_status text, p_result text, p_sched text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case
    when p_result is not null or p_status = 'complete' then 'done'
    when p_status = 'withdrawn' then 'withdrawn'
    when p_status = 'postponed' then 'postponed'
    when p_sched = 'proposed' and p_status = 'pending' then 'proposed'
    when p_status = 'confirmed' then 'confirmed'
    else 'asked' end;
$$;

-- "OFS IR #0097" (supabase/functions/_shared/markup.ts ofsIrLabel).
create or replace function public.ir_ofs_label(p_number int)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select 'OFS IR #' || lpad(coalesce(p_number, 0)::text, 4, '0');
$$;

-- "Tue Oct 27, 9:00 AM", or the day alone for a Flexible request.
create or replace function public.ir_ofs_when(p_date date, p_time time)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select to_char(p_date, 'Dy Mon FMDD') || coalesce(', ' || to_char(p_time, 'FMHH12:MI AM'), '');
$$;

-- Where on the job, short: "2 walls · " and the first line of what the request lists.
create or replace function public.ir_ofs_place(p_request_id uuid)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select left(case when w.n = 0 then '' when w.n = 1 then '1 wall · ' else w.n || ' walls · ' end
              || split_part(btrim(r.items), E'\n', 1), 200)
    from public.inspection_requests r
   cross join lateral (select count(distinct c.area_id)::int as n from public.ir_rev_items c where c.request_id = r.id) w
   where r.id = p_request_id;
$$;

-- An answer the requester gave (accept) or the fire marshal gave (confirm, propose) stays on the request until the
-- request moves on some other way: another time asked (Move), postponed, back to pending, back with the GC, unsent.
create or replace function public.tg_ir_ofs_sched()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare v_action text := coalesce(nullif(current_setting('app.ir_action', true), ''), '');
begin
  if new.ofs_sched is null or v_action in ('confirm', 'ofs_propose', 'ofs_accept') then return new; end if;
  if new.ofs_sent_at is null or new.status in ('withdrawn', 'gc_review', 'returned', 'postponed')
     or (old.status = 'confirmed' and new.status = 'pending')
     or (new.request_date, new.start_time, new.duration_kind, new.duration_min)
        is distinct from (old.request_date, old.start_time, old.duration_kind, old.duration_min) then
    new.ofs_sched := null;
    new.ofs_sched_by := null;
    new.ofs_sched_at := null;
    new.ofs_sched_note := null;
  end if;
  return new;
end;
$$;
create trigger ir_ofs_sched before update on public.inspection_requests
  for each row execute function public.tg_ir_ofs_sched();

-- A proposal that is no longer the open one (accepted, replaced, asked again, confirmed, a result, withdrawn): its
-- Needs you tasks are done.
create or replace function public.tg_ir_ofs_sched_tasks()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if old.ofs_sched = 'proposed'
     and not (new.ofs_sched is not distinct from 'proposed' and new.ofs_sched_at = old.ofs_sched_at
              and new.status = 'pending' and new.result is null and new.deleted_at is null) then
    update public.tasks set done_at = now(), done_by = auth.uid()
     where entity_type = 'inspection_request' and entity_id = new.id and kind = 'ir.ofs_time'
       and done_at is null and deleted_at is null;
  end if;
  return null;
end;
$$;
create trigger ir_ofs_sched_tasks after update of ofs_sched, ofs_sched_at, status, result, deleted_at
  on public.inspection_requests for each row execute function public.tg_ir_ofs_sched_tasks();

-- Who hears about an OFS request's time: its requester, the job's designated person (the OFS requests duty) and whoever
-- sent it to OFS, never the one acting.
create or replace function public.ir_ofs_side(p_request_id uuid)
returns uuid[]
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(array_agg(distinct u), '{}'::uuid[])
    from public.inspection_requests r
   cross join lateral unnest(array[r.requested_by, public.duty_holder(r.project_id, 'ofs_requests'), r.ofs_sent_by]) u
   where r.id = p_request_id and u is not null and u is distinct from auth.uid()
     and exists (select 1 from public.project_members pm
                  where pm.project_id = r.project_id and pm.user_id = u and pm.status = 'active'
                    and (pm.access_ends_at is null or pm.access_ends_at > now()));
$$;

create or replace function public.ir_ofs_tell_side(p_request public.inspection_requests, p_kind text, p_summary text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_to uuid[] := public.ir_ofs_side(p_request.id);
begin
  if cardinality(v_to) > 0 then
    perform public.post_activity(p_request.project_id, p_kind, left(p_summary, 500), 'inspection_request', p_request.id,
                                 null, v_to);
  end if;
end;
$$;

-- =====================================================================================================================
-- 2. Confirm, Pick another time, Accept
-- =====================================================================================================================
-- 0024's confirm. On an OFS request sent to OFS it is the fire marshal's answer to the asked time: recorded, and told.
create or replace function public.ir_confirm(p_request_id uuid, p_version int, p_note text default null)
returns public.inspection_requests
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare r public.inspection_requests; v_ofs boolean; v_new boolean; v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  r := public.ir_decider(p_request_id, p_version);
  v_ofs := r.kind = 'ofs' and r.ofs_sent_at is not null;
  v_new := r.status <> 'confirmed' or r.ofs_sched is distinct from 'confirmed';
  perform set_config('app.ir_action', 'confirm', true);
  update public.inspection_requests
     set status = case when ir_file_id is not null then 'complete' else 'confirmed' end,
         owner_id = auth.uid(), confirm_note = v_note,
         postpone_reason = null, postpone_note = null, postpone_until = null, postponed_at = null,
         ofs_sched = case when v_ofs then 'confirmed' end,
         ofs_sched_by = case when v_ofs then auth.uid() end,
         ofs_sched_at = case when v_ofs then now() end,
         ofs_sched_note = case when v_ofs then left(v_note, 500) end
   where id = r.id
   returning * into r;
  if v_ofs and v_new and r.result is null then
    perform public.ir_ofs_tell_side(r, 'ir.ofs_confirmed',
      public.ir_ofs_label(r.ofs_number) || ' confirmed ' || public.ir_ofs_when(r.request_date, r.start_time));
  end if;
  return r;
end;
$$;

-- Pick another time: the fire marshal moves an OFS request sent to OFS to a time he can make. It waits on the requester
-- (Accept, or ask again with Move). The requester and the designated person get a board line and a Needs you task.
create or replace function public.ir_ofs_propose(p_request_id uuid, p_version int, p_date date, p_time time,
                                                 p_note text default null)
returns public.inspection_requests
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare r public.inspection_requests; v_tz text; v_note text := nullif(btrim(coalesce(p_note, '')), ''); u uuid;
  v_line text;
begin
  r := public.ir_decider(p_request_id, p_version);
  if r.kind <> 'ofs' or r.ofs_sent_at is null or not public.has_capability(r.project_id, 'ir.ofs_decide') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if r.status = 'complete' or r.result is not null then
    raise exception 'This inspection can''t be moved.' using errcode = '22023';
  end if;
  select timezone into v_tz from public.projects where id = r.project_id;
  if p_date is null or p_date < (now() at time zone v_tz)::date then
    raise exception 'Pick today or a later day.' using errcode = '22023';
  end if;
  if p_time is null then raise exception 'Pick a time.' using errcode = '22023'; end if;
  if extract(second from p_time) <> 0 or extract(minute from p_time) not in (0, 30) then
    raise exception 'Pick a time on the hour or half hour.' using errcode = '22023';
  end if;
  if v_note is not null and length(v_note) > 500 then raise exception 'Keep the note under 500 characters.' using errcode = '22023'; end if;
  if r.request_date = p_date and r.start_time is not distinct from p_time and r.status <> 'postponed' then
    raise exception 'That is the asked time. Confirm it instead.' using errcode = '22023';
  end if;
  perform set_config('app.ir_action', 'ofs_propose', true);
  update public.inspection_requests
     set request_date = p_date, start_time = p_time, duration_kind = 'timed',
         duration_min = coalesce(case when duration_kind = 'timed' then duration_min end, 60),
         status = 'pending', owner_id = auth.uid(),
         postpone_reason = null, postpone_note = null, postpone_until = null, postponed_at = null,
         ofs_sched = 'proposed', ofs_sched_by = auth.uid(), ofs_sched_at = now(), ofs_sched_note = v_note
   where id = r.id
   returning * into r;
  v_line := public.ir_ofs_label(r.ofs_number) || ' · OFS proposed ' || public.ir_ofs_when(r.request_date, r.start_time)
            || ' · accept?';
  perform public.ir_ofs_tell_side(r, 'ir.ofs_proposed', v_line || coalesce(' · ' || v_note, ''));
  -- Needs you: the requester and the designated person (the inspector who sent it hears on the board).
  foreach u in array public.ir_ofs_side(r.id) loop
    if u = r.requested_by or u is not distinct from public.duty_holder(r.project_id, 'ofs_requests') then
      perform public.create_task(r.project_id, u, 'ir.ofs_time', left(v_line, 300), 'inspection_request', r.id);
    end if;
  end loop;
  return r;
end;
$$;

-- Accept the fire marshal's time: the requester, the designated person or the inspector (who send OFS requests).
create or replace function public.ir_ofs_accept(p_request_id uuid, p_version int)
returns public.inspection_requests
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare r public.inspection_requests;
begin
  r := public.ir_for_update(p_request_id, p_version);
  if not (r.requested_by = auth.uid() or public.ir_ofs_sender(r.project_id)) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if public.ir_ofs_sched_state(r.status, r.result, r.ofs_sched) <> 'proposed' then
    raise exception 'There is no new time to accept.' using errcode = '22023';
  end if;
  perform set_config('app.ir_action', 'ofs_accept', true);
  update public.inspection_requests
     set status = 'confirmed', ofs_sched = 'accepted', ofs_sched_by = auth.uid(), ofs_sched_at = now()
   where id = r.id
   returning * into r;
  perform public.ir_tell_inspector(r, 'ir.ofs_accepted',
    public.ir_ofs_label(r.ofs_number) || ' accepted · ' || public.ir_ofs_when(r.request_date, r.start_time) || ' · ' || r.company);
  perform public.ir_ofs_tell_side(r, 'ir.ofs_confirmed',
    public.ir_ofs_label(r.ofs_number) || ' confirmed ' || public.ir_ofs_when(r.request_date, r.start_time));
  return r;
end;
$$;

-- =====================================================================================================================
-- 3. The fire marshal's schedule: every job where he decides OFS requests (or one), the days asked, and the open
-- requests with no time yet (Needs a time) whatever their day.
-- =====================================================================================================================
create or replace function public.ofs_schedule(p_project_id uuid default null, p_from date default null, p_to date default null)
returns table (
  id uuid, project_id uuid, project_name text, timezone text, number int, ofs_number int, version int, request_date date,
  start_time time, duration_kind text, duration_min int, state text, needs_time boolean, place text, requester text,
  company text, sched_note text, sched_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
begin
  if auth.uid() is null then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 62 then
    raise exception 'Pick a shorter range.' using errcode = '22023';
  end if;
  return query
    select x.id, x.project_id, x.project_name, x.timezone, x.number, x.ofs_number, x.version, x.request_date, x.start_time,
           x.duration_kind, x.duration_min, x.state, x.state = 'asked' and x.start_time is null, public.ir_ofs_place(x.id),
           x.requester, x.company, x.ofs_sched_note, x.ofs_sched_at
      from (select r.id, r.project_id, p.name as project_name, p.timezone, r.number, r.ofs_number, r.version,
                   r.request_date, r.start_time, r.duration_kind, r.duration_min, r.company, r.ofs_sched_note, r.ofs_sched_at,
                   public.ir_ofs_sched_state(r.status, r.result, r.ofs_sched) as state,
                   coalesce(public.ir_person_name(r.requested_by), r.requester_name, r.company) as requester,
                   (now() at time zone p.timezone)::date as today
              from public.inspection_requests r
              join public.projects p on p.id = r.project_id and p.deleted_at is null and 'inspections' = any (p.modules)
             where (p_project_id is null or r.project_id = p_project_id)
               and r.deleted_at is null and r.kind = 'ofs' and r.ofs_sent_at is not null and r.status <> 'withdrawn'
               and public.has_capability(r.project_id, 'ir.ofs_decide')) x
     where x.request_date between p_from and p_to
        or (x.state = 'asked' and x.start_time is null and x.request_date >= x.today - 30)
     order by x.request_date, x.start_time nulls first, x.project_name, x.number
     limit 1000;
end;
$$;

-- =====================================================================================================================
-- 4. The calendar feed's OFS lines: one per OFS request sent to OFS, for whoever reads OFS requests on the job
-- =====================================================================================================================
create or replace function public.ir_ofs_calendar_sync(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare r public.inspection_requests; pr public.projects; v_state text; v_all_day boolean; v_start timestamptz;
  v_end timestamptz; v_word text;
begin
  select * into r from public.inspection_requests where id = p_request_id;
  if r.id is null or r.kind <> 'ofs' or r.ofs_sent_at is null or r.status = 'withdrawn' or r.deleted_at is not null then
    perform public.calendar_unmirror('ofs_request', p_request_id);
    return;
  end if;
  select * into pr from public.projects where id = r.project_id;
  v_state := public.ir_ofs_sched_state(r.status, r.result, r.ofs_sched);
  v_word := case v_state when 'asked' then 'Asked' when 'confirmed' then 'Confirmed' when 'proposed' then 'New time proposed'
                         when 'postponed' then 'Postponed'
                         else case r.result when 'approved' then 'Approved' when 'not_approved' then 'Not approved' else 'Done' end end;
  v_all_day := r.start_time is null or r.duration_kind = 'all_day';
  v_start := (r.request_date + case when v_all_day then time '00:00' else r.start_time end) at time zone pr.timezone;
  v_end := case when not v_all_day and r.duration_kind = 'timed' then v_start + make_interval(mins => r.duration_min) end;
  perform public.calendar_mirror(
    'ofs_request', r.id, r.project_id, 'inspections',
    public.ir_ofs_label(r.ofs_number) || ' ' || v_word || ' · ' || r.company
      || coalesce(' · ' || nullif(public.ir_ofs_place(r.id), ''), ''),
    v_start, v_end, v_all_day, public.ir_status_key(r.status, r.result, null), 'ir.ofs_view', null,
    nullif(btrim(coalesce(pr.address, '')), ''));
end;
$$;

create or replace function public.tg_ir_ofs_calendar()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.kind = 'ofs' or (tg_op = 'UPDATE' and old.kind = 'ofs') then
    perform public.ir_ofs_calendar_sync(new.id);
  end if;
  return null;
end;
$$;
create trigger ir_ofs_calendar after insert or update of status, request_date, start_time, duration_kind, duration_min,
  company, items, result, ofs_sent_at, ofs_sched, ofs_number, deleted_at on public.inspection_requests
  for each row execute function public.tg_ir_ofs_calendar();

-- The OFS requests already with OFS get their lines.
do $$
declare v uuid;
begin
  for v in select q.id from public.inspection_requests q where q.kind = 'ofs' and q.ofs_sent_at is not null loop
    perform public.ir_ofs_calendar_sync(v);
  end loop;
end $$;

-- 0022's feed, plus the OFS lines on a job whose calendar tool is off (the fire marshal's jobs need not use it).
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
    join public.projects p on p.id = ce.project_id and p.deleted_at is null
     and ('calendar' = any (p.modules) or (ce.source_type = 'ofs_request' and 'inspections' = any (p.modules)))
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

-- =====================================================================================================================
-- 5. The designated person's start page: each inspection's schedule state (0106's body plus sched)
-- =====================================================================================================================
create or replace function public.ofs_desk(p_project_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not public.is_member(p_project_id) then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not public.ir_setting(p_project_id, 'ir_ofs_allowed') or not public.ir_ofs_sender(p_project_id) then return null; end if;
  return jsonb_build_object('rows', coalesce((
    select jsonb_agg(to_jsonb(x) order by x.at desc, x.id)
      from (
        (select i.id, i.kind, case when i.kind = 'rfi' then 'rfi' else 'file' end as target_type,
                coalesce(i.rfi_id, i.file_id) as target_id, r.number,
                coalesce(r.title, f.original_name) as title,
                coalesce(d.decision, 'waiting') as state,
                coalesce(d.decided_at, case when i.kind = 'rfi' then greatest(i.marked_at, r.answered_at) else i.marked_at end) as at,
                null::jsonb as sched
           from public.ofs_items i
           left join public.rfis r on r.id = i.rfi_id
           left join public.files f on f.id = i.file_id
           left join public.ofs_decisions d on d.id = i.decision_id
          where i.project_id = p_project_id and public.ofs_item_sent(i.id) and public.ofs_item_may_see(i.rfi_id, i.file_id)
          order by 8 desc
          limit 900)
        union all
        (select q.id, 'inspection', 'inspection_request', q.id, q.ofs_number,
                left(btrim(q.items), 200),
                case q.result when 'approved' then 'passed' when 'not_approved' then 'failed' else 'waiting' end,
                coalesce(q.result_at, q.ofs_sent_at),
                jsonb_build_object('state', public.ir_ofs_sched_state(q.status, q.result, q.ofs_sched),
                                   'date', q.request_date, 'time', to_char(q.start_time, 'HH24:MI'), 'version', q.version,
                                   'note', q.ofs_sched_note)
           from public.inspection_requests q
          where q.project_id = p_project_id and q.kind = 'ofs' and q.ofs_sent_at is not null and q.deleted_at is null
            and q.status <> 'withdrawn' and public.ir_may_see(q.project_id, q.requested_by, q.kind, q.ofs_sent_at)
          order by 8 desc
          limit 300)
      ) as x (id, kind, target_type, target_id, number, title, state, at, sched)), '[]'::jsonb));
end;
$$;

-- =====================================================================================================================
-- Grants
-- =====================================================================================================================
do $$
declare f text;
begin
  foreach f in array array[
    'public.ir_ofs_propose(uuid, integer, date, time without time zone, text)', 'public.ir_ofs_accept(uuid, integer)',
    'public.ofs_schedule(uuid, date, date)']
  loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
  foreach f in array array[
    'public.ir_ofs_sched_state(text, text, text)', 'public.ir_ofs_label(integer)',
    'public.ir_ofs_when(date, time without time zone)', 'public.ir_ofs_place(uuid)', 'public.tg_ir_ofs_sched()',
    'public.tg_ir_ofs_sched_tasks()', 'public.ir_ofs_side(uuid)',
    'public.ir_ofs_tell_side(public.inspection_requests, text, text)', 'public.ir_ofs_calendar_sync(uuid)',
    'public.tg_ir_ofs_calendar()']
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
