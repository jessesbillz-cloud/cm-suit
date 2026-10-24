-- 0116 The OFS route is the owner's, per job, and far fewer notifications (Jesse, Oct 23).
--   1. The route (Jesse: "the owner should be able to set up the flow of who does what, and Kyle always needs to create
--      them and send them to me first, and then once they leave me they go to Brock"). Two job settings, edited in
--      Settings > Job by project.manage (the projects update policy), defaults in src/lib/settings.ts. A missing key is
--      off (ir_setting), so every job starts on Jesse's route: the contractor checks, then the inspector sends.
--        ir_ofs_gc_off      true: no contractor check, a new OFS request goes straight to the inspector.
--        ir_ofs_duty_sends  true: the inspector marks Ready and the job's OFS requests person sends it (while one is
--                           picked, else the inspector sends).
--      One helper says where a request is on the route (ir_ofs_step: gc, ready, si, send or null) and one says whose
--      turn it is (ir_ofs_turn). ir_first_status, ir_ofs_check, ir_send_ofs, the batch steps and Needs you read them.
--      No role names: the turn comes from the capabilities and the duty.
--   2. Notifications (Jesse: "I don't want zillions of notifications and emails"). An OFS request now posts board
--      lines only when it is filed or passed to the next person on the route (ir.ofs_filed, to the person whose turn it
--      is), sent to OFS (ir.ofs_sent, the fire marshal and the requester), returned (ir.returned) and when its results
--      are sent (ir.results). post_activity drops every other line about an OFS request, so the older calls stay
--      harmless. A batch posts one line per step, and Needs you lists a batch only for the person whose turn it is.
--      A time the fire marshal proposes makes one Needs you task, for one person. Nothing here sends email.
--   3. A PE does the contractor step (Jesse: "expand the PE permissions to be able to do that"): ir.gc_approve.
-- Nothing is dropped. Every replaced function keeps its signature.

-- =====================================================================================================================
-- 1. Capabilities (data, rule 2)
-- =====================================================================================================================
insert into public.role_permissions (role, capability, requires_aal2) values ('pe', 'ir.gc_approve', false)
on conflict do nothing;

-- =====================================================================================================================
-- 2. The route
-- =====================================================================================================================
-- The job's OFS requests person sends to OFS: the route says so and someone is picked.
create or replace function public.ir_ofs_duty_sends(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.ir_setting(p_project_id, 'ir_ofs_duty_sends')
     and public.duty_holder(p_project_id, 'ofs_requests') is not null;
$$;

-- The route as the screens show it: the contractor check, and who sends to OFS now (inspector or duty).
create or replace function public.ir_ofs_route(p_project_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'gc', not public.ir_setting(p_project_id, 'ir_ofs_gc_off'),
    'sender', case when public.ir_ofs_duty_sends(p_project_id) then 'duty' else 'inspector' end);
$$;

-- Where an OFS request is on its route: gc (with the contractor), ready and si (the inspector checks it, on a route
-- where the duty holder sends), send (whoever sends it to OFS), null (sent, withdrawn, done, or not a live request).
-- p_duty_sends is ir_ofs_duty_sends of its job, read once by the caller (a function of the row alone would be an API column).
create or replace function public.ir_ofs_step(p_request public.inspection_requests, p_duty_sends boolean)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when p_request.kind is distinct from 'ofs' or p_request.deleted_at is not null or p_request.mdr_id is not null
         or p_request.ofs_sent_at is not null then null
    when p_request.status in ('gc_review', 'returned') then 'gc'
    when p_request.status not in ('pending', 'postponed') then null
    when not p_duty_sends then 'send'
    when p_request.ofs_ready_at is null then 'ready'
    when p_request.special_required is true and p_request.ofs_si_at is null then 'si'
    else 'send' end;
$$;

-- The active members of a job who hold a capability.
create or replace function public.ir_cap_holders(p_project_id uuid, p_cap text)
returns uuid[]
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(array_agg(distinct pm.user_id), '{}'::uuid[])
    from public.project_members pm
    join public.role_permissions rp on rp.role = pm.role and rp.capability = p_cap
   where pm.project_id = p_project_id and pm.user_id is not null and pm.status = 'active'
     and (pm.access_ends_at is null or pm.access_ends_at > now());
$$;

-- Whose turn it is on an OFS request: the contractor step is the duty holder's (while he may do it), else every GC
-- approver's. A returned request is its requester's to fix (his board line says so), nobody's turn here. The send is
-- the duty holder's on his route. Everything else is the inspector's: the one who has it, else every inspector.
create or replace function public.ir_ofs_turn(p_request public.inspection_requests, p_duty_sends boolean)
returns uuid[]
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare v_step text := public.ir_ofs_step(p_request, p_duty_sends);
  v_holder uuid := public.duty_holder(p_request.project_id, 'ofs_requests');
begin
  if v_step is null or p_request.status = 'returned' then return '{}'::uuid[]; end if;
  if v_step = 'gc' then
    if v_holder is not null and public.ir_member_holds(p_request.project_id, v_holder, 'ir.gc_approve') then
      return array[v_holder];
    end if;
    return public.ir_cap_holders(p_request.project_id, 'ir.gc_approve');
  end if;
  if v_step = 'send' and p_duty_sends then return array[v_holder]; end if;
  if p_request.owner_id is not null and public.ir_member_holds(p_request.project_id, p_request.owner_id, 'ir.decide') then
    return array[p_request.owner_id];
  end if;
  return public.ir_cap_holders(p_request.project_id, 'ir.decide');
end;
$$;

-- The caller may take this step on the request now (the right, not the turn).
create or replace function public.ir_ofs_may(p_request public.inspection_requests, p_step text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(auth.uid() is not null and case p_step
    when 'gc' then public.has_capability(p_request.project_id, 'ir.gc_approve')
    when 'send' then case when public.ir_ofs_duty_sends(p_request.project_id)
                          then public.duty_holder(p_request.project_id, 'ofs_requests') = auth.uid()
                          else public.has_capability(p_request.project_id, 'ir.decide')
                               and public.ir_owner_ok(p_request.project_id, p_request.owner_id, p_request.kind, p_request.ofs_sent_at) end
    when 'ready' then public.has_capability(p_request.project_id, 'ir.decide')
                      and public.ir_owner_ok(p_request.project_id, p_request.owner_id, p_request.kind, p_request.ofs_sent_at)
    when 'si' then public.has_capability(p_request.project_id, 'ir.decide')
                   and public.ir_owner_ok(p_request.project_id, p_request.owner_id, p_request.kind, p_request.ofs_sent_at)
    else false end, false);
$$;

-- 0061's first status. An OFS request follows its route: the contractor check while it is on (and the job has someone
-- who may do it, or the job's own GC step is on), else straight to the inspector.
create or replace function public.ir_first_status(p_project_id uuid, p_kind text)
returns text
language sql
stable
set search_path = public, pg_temp
as $$
  select case
    when public.has_capability(p_project_id, 'ir.decide') or public.has_capability(p_project_id, 'ir.gc_approve') then 'pending'
    when p_kind = 'ofs' then
      case when not public.ir_setting(p_project_id, 'ir_ofs_gc_off')
                and (public.ir_setting(p_project_id, 'ir_gc_approval')
                     or cardinality(public.ir_cap_holders(p_project_id, 'ir.gc_approve')) > 0)
           then 'gc_review' else 'pending' end
    when public.ir_setting(p_project_id, 'ir_gc_approval') then 'gc_review'
    else 'pending' end;
$$;

-- =====================================================================================================================
-- 3. The steps read the route
-- =====================================================================================================================
-- 0091's checks. Ready is a step only where the duty holder sends (elsewhere the inspector's Send is his Ready), so
-- there the special inspection report needs no Ready first. The board line comes from the trigger below.
create or replace function public.ir_ofs_check(p_request_id uuid, p_version int, p_check text, p_on boolean,
                                               p_file_id uuid default null)
returns public.inspection_requests
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare r public.inspection_requests; v_on boolean := coalesce(p_on, false);
  v_untouched boolean; v_duty boolean;
begin
  if p_check is null or p_check not in ('gc', 'ready', 'si') then raise exception 'Unknown check.' using errcode = '22023'; end if;
  r := public.ir_for_update(p_request_id, p_version);
  if r.kind <> 'ofs' then raise exception 'Only an OFS request has these checks.' using errcode = '22023'; end if;
  v_untouched := r.status = 'pending' and r.owner_id is null and r.result is null
    and not exists (select 1 from public.ir_rev_items c where c.request_id = r.id and c.result is not null);
  v_duty := public.ir_ofs_duty_sends(r.project_id);

  if p_check = 'gc' then
    if not public.has_capability(r.project_id, 'ir.gc_approve') then raise exception 'forbidden' using errcode = '42501'; end if;
    if r.ofs_sent_at is not null then raise exception 'OFS has this one now.' using errcode = '22023'; end if;
    if v_on then
      if r.status not in ('gc_review', 'returned') then return r; end if;
      perform set_config('app.ir_action', 'gc_approve', true);
      update public.inspection_requests set status = 'pending', gc_by = auth.uid(), gc_at = now(), gc_note = null
       where id = r.id returning * into r;
    else
      if r.status <> 'pending' or r.gc_at is null then return r; end if;
      if r.ofs_ready_at is not null then raise exception 'The inspector has checked it.' using errcode = '22023'; end if;
      perform set_config('app.ir_action', 'gc_undo', true);
      update public.inspection_requests set status = 'gc_review', gc_by = null, gc_at = null where id = r.id returning * into r;
    end if;
    return r;
  end if;

  if not public.has_capability(r.project_id, 'ir.decide') then raise exception 'forbidden' using errcode = '42501'; end if;
  if r.status in ('gc_review', 'returned', 'withdrawn') then
    raise exception 'This request is not with the inspector.' using errcode = '22023';
  end if;

  if p_check = 'ready' then
    if r.ofs_sent_at is not null then raise exception 'OFS has this one now.' using errcode = '22023'; end if;
    if not public.ir_owner_ok(r.project_id, r.owner_id, r.kind, r.ofs_sent_at) then
      raise exception 'forbidden' using errcode = '42501';
    end if;
    if v_on = (r.ofs_ready_at is not null) then return r; end if;
    if v_on and not v_duty then
      raise exception 'On this job the inspector sends it to OFS.' using errcode = '22023';
    end if;
    if not v_on and r.ofs_si_at is not null then
      raise exception 'Undo the special inspection report first.' using errcode = '22023';
    end if;
    perform set_config('app.ir_action', case when v_on then 'ofs_ready' else 'ofs_ready_undo' end, true);
    update public.inspection_requests
       set ofs_ready_by = case when v_on then auth.uid() end, ofs_ready_at = case when v_on then now() end
     where id = r.id returning * into r;
    return r;
  end if;

  -- si: the inspector keeps the special inspector's report, so he checks it, before the send or until OFS acts.
  if r.special_required is not true then
    raise exception 'No special inspection on this request.' using errcode = '22023';
  end if;
  if r.ofs_sent_at is not null and not v_untouched then raise exception 'OFS has this one now.' using errcode = '22023'; end if;
  if v_on and v_duty and r.ofs_ready_at is null and r.ofs_sent_at is null then
    raise exception 'Check Ready first.' using errcode = '22023';
  end if;
  if v_on and p_file_id is not null and not exists (
       select 1 from public.files f where f.id = p_file_id and f.project_id = r.project_id and f.deleted_at is null) then
    raise exception 'Pick a file from this job.' using errcode = '22023';
  end if;
  if not v_on and r.ofs_si_at is null then return r; end if;
  if v_on and r.ofs_si_at is not null and r.ofs_si_file_id is not distinct from coalesce(p_file_id, r.ofs_si_file_id) then
    return r;
  end if;
  perform set_config('app.ir_action', case when v_on then 'ofs_si' else 'ofs_si_undo' end, true);
  update public.inspection_requests
     set ofs_si_by = case when v_on then coalesce(case when r.ofs_si_at is not null then r.ofs_si_by end, auth.uid()) end,
         ofs_si_at = case when v_on then coalesce(r.ofs_si_at, now()) end,
         ofs_si_file_id = case when v_on then coalesce(p_file_id, r.ofs_si_file_id) end
   where id = r.id returning * into r;
  return r;
end;
$$;

-- 0091's send. The route says who sends: the inspector (his Send is his Ready), or the duty holder once the inspector
-- has checked it (and its special inspection report). The board line comes from the trigger below.
create or replace function public.ir_send_ofs(p_request_id uuid, p_version int)
returns public.inspection_requests
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare r public.inspection_requests; v_inspector boolean; v_duty boolean;
begin
  r := public.ir_for_update(p_request_id, p_version);
  v_inspector := public.has_capability(r.project_id, 'ir.decide');
  v_duty := public.ir_ofs_duty_sends(r.project_id);
  if not public.ir_ofs_sender(r.project_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  if r.kind <> 'ofs' then raise exception 'Only an OFS request goes to OFS.' using errcode = '22023'; end if;
  if r.ofs_sent_at is not null then return r; end if;
  if v_duty and public.duty_holder(r.project_id, 'ofs_requests') is distinct from auth.uid() then
    raise exception 'On this job the contractor''s OFS person sends it to OFS.' using errcode = '22023';
  end if;
  if not v_duty and not v_inspector then
    raise exception 'On this job the inspector sends it to OFS.' using errcode = '22023';
  end if;
  if not v_duty and not public.ir_owner_ok(r.project_id, r.owner_id, r.kind, r.ofs_sent_at) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if r.status not in ('pending', 'postponed') then
    raise exception 'This request is not with the inspector.' using errcode = '22023';
  end if;
  if v_duty then
    if r.ofs_ready_at is null then raise exception 'The inspector checks it first.' using errcode = '22023'; end if;
    if r.special_required and r.ofs_si_at is null then
      raise exception 'The inspector checks the special inspection report first.' using errcode = '22023';
    end if;
  end if;
  perform set_config('app.ir_action', 'send_ofs', true);
  update public.inspection_requests
     set ofs_sent_at = now(), ofs_sent_by = auth.uid(), status = 'pending', owner_id = null,
         postpone_reason = null, postpone_note = null, postpone_until = null, postponed_at = null,
         ofs_ready_by = coalesce(ofs_ready_by, auth.uid()), ofs_ready_at = coalesce(ofs_ready_at, now())
   where id = r.id
   returning * into r;
  return r;
end;
$$;

-- 0108's Pick another time, with one Needs you task for one person: the job's OFS requests person, else the requester,
-- else whoever sent it. No board line (post_activity drops it for an OFS request anyway).
create or replace function public.ir_ofs_propose(p_request_id uuid, p_version int, p_date date, p_time time,
                                                 p_note text default null)
returns public.inspection_requests
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare r public.inspection_requests; v_tz text; v_note text := nullif(btrim(coalesce(p_note, '')), ''); v_to uuid;
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
  select u into v_to
    from unnest(array[public.duty_holder(r.project_id, 'ofs_requests'), r.requested_by, r.ofs_sent_by]) with ordinality x (u, k)
   where u is not null and u is distinct from auth.uid()
     and exists (select 1 from public.project_members pm
                  where pm.project_id = r.project_id and pm.user_id = x.u and pm.status = 'active'
                    and (pm.access_ends_at is null or pm.access_ends_at > now()))
   order by k limit 1;
  if v_to is not null then
    perform public.create_task(r.project_id, v_to, 'ir.ofs_time', left(v_line, 300), 'inspection_request', r.id);
  end if;
  return r;
end;
$$;

-- =====================================================================================================================
-- 4. Board lines
-- =====================================================================================================================
-- The kept lines about an OFS request. A batch step posts its own one line, so while it runs (app.ir_quiet) none.
create or replace function public.ir_board_keeps(p_entity_id uuid, p_kind text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select not exists (select 1 from public.inspection_requests q where q.id = p_entity_id and q.kind = 'ofs')
      or (coalesce(current_setting('app.ir_quiet', true), '') = ''
          and p_kind in ('ir.ofs_filed', 'ir.ofs_sent', 'ir.returned', 'ir.results'));
$$;

-- 0004's post_activity, with the one gate: a line about an OFS request posts only when ir_board_keeps says so.
create or replace function public.post_activity(
  p_project_id uuid,
  p_kind text,
  p_summary text,
  p_entity_type text default null,
  p_entity_id uuid default null,
  p_audience_capability text default null,
  p_recipient_user_ids uuid[] default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare new_id uuid; oid uuid; is_service boolean;
begin
  is_service := public.is_service_role();
  if not is_service and not public.is_member(p_project_id) then
    raise exception 'not a member' using errcode = '42501';
  end if;
  if p_audience_capability is null and (p_recipient_user_ids is null or cardinality(p_recipient_user_ids) = 0) then
    raise exception 'activity needs an audience';
  end if;
  if p_entity_type = 'inspection_request' and not public.ir_board_keeps(p_entity_id, p_kind) then return null; end if;
  select org_id into oid from public.projects where id = p_project_id;
  insert into public.activity (org_id, project_id, kind, entity_type, entity_id, summary, actor_user_id, audience_capability, created_by)
  values (oid, p_project_id, p_kind, p_entity_type, p_entity_id, p_summary, auth.uid(), p_audience_capability, auth.uid())
  returning id into new_id;
  if p_recipient_user_ids is not null then
    -- Recipients must be members of the project: nobody can message an arbitrary user id.
    insert into public.activity_recipients (activity_id, user_id)
    select new_id, u from unnest(p_recipient_user_ids) u
    where exists (select 1 from public.project_members pm where pm.project_id = p_project_id and pm.user_id = u and pm.status = 'active')
    on conflict do nothing;
  end if;
  return new_id;
end;
$$;

-- A batch's levels, then its items in rev order ("Level 01, Level 02 · Top of wall & HOW Spray").
create or replace function public.ir_batch_items(p_ids uuid[])
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select left(concat_ws(' · ',
    (select string_agg(x.lv, ', ' order by x.lv) from (
       select distinct btrim(a.level) as lv from public.ir_rev_items c join public.rev_areas a on a.id = c.area_id
        where c.request_id = any (p_ids) and c.pulled_at is null) x),
    (select string_agg(x.name, ' & ' order by x.number, x.position, x.name) from (
       select distinct btrim(i.name) as name, v.number, i.position
         from public.ir_rev_items c join public.rev_items i on i.id = c.item_id join public.revs v on v.id = i.rev_id
        where c.request_id = any (p_ids) and c.pulled_at is null) x)), 300);
$$;

-- One line about one request or a batch of them, to the people named (never the one acting) and an audience. A
-- visitor's request names him with his company.
-- "OFS #0097 filed · Sample Drywall · Oct 27, 9:00 AM" or "Batch of 9 sent to OFS · Level 01 · Top of wall".
create or replace function public.ir_ofs_board(p_ids uuid[], p_kind text, p_verb text, p_to uuid[], p_cap text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare r public.inspection_requests; v_to uuid[]; v_text text; v_n int := coalesce(cardinality(p_ids), 0);
begin
  if v_n = 0 then return; end if;
  select * into r from public.inspection_requests where id = p_ids[1];
  v_to := array(select distinct u from unnest(coalesce(p_to, '{}'::uuid[])) u where u is not null and u is distinct from auth.uid());
  if p_cap is null and cardinality(v_to) = 0 then return; end if;
  v_text := case when v_n = 1
    then public.ir_ofs_label(r.number, r.ofs_number) || ' ' || p_verb || ' · '
         || coalesce(nullif(btrim(r.requester_name), '') || ' (' || r.company || ')', r.company) || ' · '
         || public.ir_when_label(r.request_date, r.start_time)
    else 'Batch of ' || v_n || ' ' || p_verb || coalesce(' · ' || nullif(public.ir_batch_items(p_ids), ''), '') end;
  perform public.post_activity(r.project_id, p_kind, left(v_text, 500), 'inspection_request', r.id, p_cap,
                               case when cardinality(v_to) > 0 then v_to end);
end;
$$;

-- The lines a change makes on one OFS request: sent to OFS (the fire marshal and its requester), or filed or passed on
-- (to whoever's turn it becomes). Not during a batch step (it posts its own), not on an Undo.
create or replace function public.tg_ir_ofs_board()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_old uuid[] := '{}'::uuid[]; v_new uuid[]; v_old_step text; v_new_step text; v_verb text; v_duty boolean;
begin
  if new.kind <> 'ofs' or new.mdr_id is not null or new.deleted_at is not null then return null; end if;
  if coalesce(current_setting('app.ir_quiet', true), '') <> '' then return null; end if;
  if coalesce(current_setting('app.ir_action', true), '') in ('gc_undo', 'ofs_ready_undo', 'ofs_si_undo', 'unsend_ofs') then
    return null;
  end if;
  if new.ofs_sent_at is not null then
    if tg_op = 'INSERT' or old.ofs_sent_at is null then
      perform public.ir_ofs_board(array[new.id], 'ir.ofs_sent', 'sent to OFS', array[new.requested_by], 'ir.ofs_decide');
    end if;
    return null;
  end if;
  v_duty := public.ir_ofs_duty_sends(new.project_id);
  v_new_step := public.ir_ofs_step(new, v_duty);
  v_new := public.ir_ofs_turn(new, v_duty);
  if tg_op = 'UPDATE' then
    v_old_step := public.ir_ofs_step(old, v_duty);
    v_old := public.ir_ofs_turn(old, v_duty);
  end if;
  v_new := array(select unnest(v_new) except select unnest(v_old));
  if cardinality(v_new) = 0 then return null; end if;
  v_verb := case when v_old_step = 'gc' then 'checked'
                 when v_new_step = 'send' and v_old_step in ('ready', 'si') then 'ready to send'
                 else 'filed' end;
  perform public.ir_ofs_board(array[new.id], 'ir.ofs_filed', v_verb, v_new, null);
  return null;
end;
$$;
create trigger ir_ofs_board after insert or update on public.inspection_requests
  for each row execute function public.tg_ir_ofs_board();

-- =====================================================================================================================
-- 5. Batches: the route, one line per step, and Needs you for the person whose turn it is
-- =====================================================================================================================
-- 0114's waits: the request is at this step of its route and the caller may take it.
create or replace function public.ir_batch_waits(p_request public.inspection_requests, p_step text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(auth.uid() is not null and p_step in ('gc', 'ready', 'send')
                  and public.ir_ofs_step(p_request, public.ir_ofs_duty_sends(p_request.project_id)) = p_step
                  and public.ir_ofs_may(p_request, p_step), false);
$$;

-- 0114's batch, with the job's route.
create or replace function public.ir_batch_json(p_batch_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare v_ids uuid[]; v_step text; v_project uuid;
begin
  select array_agg(distinct q.id), min(q.project_id::text)::uuid into v_ids, v_project
    from public.rev_basket_cells c
    join public.inspection_requests q on q.id = c.sent_request_id
   where c.batch_id = p_batch_id and q.deleted_at is null and q.status <> 'withdrawn'
     and public.is_member(q.project_id) and public.ir_may_see(q.project_id, q.requested_by, q.kind, q.ofs_sent_at);
  if v_ids is null then return null; end if;
  select s.step into v_step
    from unnest(array['gc', 'send', 'ready']) with ordinality s (step, k)
   where exists (select 1 from public.inspection_requests q where q.id = any (v_ids) and public.ir_batch_waits(q, s.step))
   order by s.k limit 1;
  return jsonb_build_object(
    'batch_id', p_batch_id,
    'project_id', v_project,
    'size', cardinality(v_ids),
    'filed_at', (select min(q.created_at) from public.inspection_requests q where q.id = any (v_ids)),
    'items', public.ir_batch_items(v_ids),
    'step', v_step,
    'route', public.ir_ofs_route(v_project),
    'requests', (select jsonb_agg(jsonb_build_object(
        'id', q.id, 'number', q.number, 'ofs_number', q.ofs_number, 'items', q.items, 'status', q.status,
        'result', q.result, 'helper_id', q.helper_id, 'ofs_sent_at', q.ofs_sent_at, 'version', q.version,
        'waits', v_step is not null and public.ir_batch_waits(q, v_step))
        order by q.ofs_number nulls last, q.number)
      from public.inspection_requests q where q.id = any (v_ids)));
end;
$$;

-- 0114's Needs you list: a batch of two or more is listed only for the person whose turn it is on a request of it that
-- waits on him (the others who may act still find it on the request page).
create or replace function public.ir_batches_waiting(p_project_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_project_id is not null and not public.is_member(p_project_id) then raise exception 'not_found' using errcode = 'P0002'; end if;
  return coalesce((
    select jsonb_agg(x.j order by x.j ->> 'filed_at', x.j ->> 'batch_id')
      from (select public.ir_batch_json(b.batch_id) as j
              from (select distinct c.batch_id
                      from public.inspection_requests q
                      join public.rev_basket_cells c on c.sent_request_id = q.id and c.batch_id is not null
                     where q.kind = 'ofs' and q.deleted_at is null and q.mdr_id is null and q.ofs_sent_at is null
                       and q.status in ('gc_review', 'returned', 'pending', 'postponed')
                       and (p_project_id is null or q.project_id = p_project_id) and public.is_member(q.project_id)
                       and auth.uid() = any (public.ir_ofs_turn(q, public.ir_ofs_duty_sends(q.project_id)))) b) x
     where x.j is not null and x.j ->> 'step' is not null and (x.j ->> 'size')::int >= 2
       and exists (select 1 from jsonb_array_elements(x.j -> 'requests') e
                     join public.inspection_requests q on q.id = (e ->> 'id')::uuid
                    where (e ->> 'waits')::boolean
                      and auth.uid() = any (public.ir_ofs_turn(q, public.ir_ofs_duty_sends(q.project_id))))), '[]'::jsonb);
end;
$$;

-- 0114's step for the whole batch, quiet while each request takes it, then one line: passed on to whoever's turn it is
-- now (gc: checked, ready: ready to send), or sent to OFS (the fire marshal and the requesters).
create or replace function public.ir_batch_step(p_batch_id uuid, p_step text, p_versions jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare r public.inspection_requests; v_ids uuid[]; v_project uuid; v_org uuid; v_ver text;
  v_done jsonb := '[]'::jsonb; v_skipped jsonb := '[]'::jsonb; v_done_ids uuid[] := '{}'::uuid[];
begin
  if auth.uid() is null then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_step is null or p_step not in ('gc', 'ready', 'send') then raise exception 'Unknown step.' using errcode = '22023'; end if;
  if p_versions is null or jsonb_typeof(p_versions) <> 'object' then
    raise exception 'Send each request''s version.' using errcode = '22023';
  end if;
  select array_agg(distinct q.id) into v_ids
    from public.rev_basket_cells c
    join public.inspection_requests q on q.id = c.sent_request_id
   where c.batch_id = p_batch_id and q.deleted_at is null
     and public.is_member(q.project_id) and public.ir_may_see(q.project_id, q.requested_by, q.kind, q.ofs_sent_at);
  if v_ids is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  select q.project_id, q.org_id into v_project, v_org from public.inspection_requests q where q.id = v_ids[1];
  -- The step's own right, as the single button's function checks it.
  if not (case p_step when 'gc' then public.has_capability(v_project, 'ir.gc_approve')
                      when 'ready' then public.has_capability(v_project, 'ir.decide')
                      else public.ir_ofs_sender(v_project) end) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  -- Locked in one order, so two batch taps never wait on each other.
  perform 1 from public.inspection_requests q where q.id = any (v_ids) order by q.id for update;
  perform set_config('app.ir_quiet', 'on', true);
  for r in select * from public.inspection_requests q where q.id = any (v_ids) order by q.ofs_number nulls last, q.number, q.id loop
    if not public.ir_batch_waits(r, p_step) then
      if p_versions ? r.id::text then v_skipped := v_skipped || to_jsonb(r.id); end if;
      continue;
    end if;
    v_ver := p_versions ->> r.id::text;
    if v_ver is null or v_ver !~ '^\d{1,9}$' then
      raise exception 'version_conflict: the batch changed, read it again' using errcode = '40001';
    end if;
    if p_step = 'send' then
      r := public.ir_send_ofs(r.id, v_ver::int);
    else
      r := public.ir_ofs_check(r.id, v_ver::int, p_step, true);
    end if;
    v_done := v_done || jsonb_build_object('id', r.id, 'number', r.number, 'ofs_number', r.ofs_number, 'status', r.status,
                                           'version', r.version);
    v_done_ids := v_done_ids || r.id;
  end loop;
  perform set_config('app.ir_quiet', '', true);
  if cardinality(v_done_ids) > 0 then
    if p_step = 'send' then
      perform public.ir_ofs_board(v_done_ids, 'ir.ofs_sent', 'sent to OFS',
        array(select q.requested_by from public.inspection_requests q where q.id = any (v_done_ids)), 'ir.ofs_decide');
    else
      perform public.ir_ofs_board(v_done_ids, 'ir.ofs_filed', case p_step when 'gc' then 'checked' else 'ready to send' end,
        array(select distinct u from public.inspection_requests q
               cross join lateral unnest(public.ir_ofs_turn(q, public.ir_ofs_duty_sends(q.project_id))) u
               where q.id = any (v_done_ids)), null);
    end if;
    perform public.audit('ir.batch_step', 'inspection_requests', (v_done -> 0 ->> 'id')::uuid, v_project, v_org,
                         jsonb_build_object('batch_id', p_batch_id, 'step', p_step, 'done', v_done, 'skipped', v_skipped));
  end if;
  return jsonb_build_object('batch_id', p_batch_id, 'step', p_step, 'done', v_done, 'skipped', v_skipped);
end;
$$;

-- 0113's Send, quiet while each request is filed, then one line for the batch: filed (to whoever's turn it is), or
-- sent to OFS when the inspector filed it himself.
create or replace function public.rev_basket_send(
  p_project_id uuid,
  p_version int,
  p_company text,
  p_request_date date,
  p_start_time time default null,
  p_duration_kind text default 'timed',
  p_duration_min int default null,
  p_notice_ack boolean default false,
  p_special_required boolean default null,
  p_inspector_ack boolean default false,
  p_ofs_numbers int[] default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare b public.rev_baskets; g record; r public.inspection_requests; v_batch uuid := gen_random_uuid(); v_groups int;
  v_ids uuid[] := '{}';
begin
  b := public.rev_basket_mine(p_project_id, false);
  if b.id is null then raise exception 'Nothing in the request.' using errcode = '22023'; end if;
  if b.last_batch_id is not null and b.last_sent_version = p_version then return public.rev_basket_batch_json(b.last_batch_id); end if;
  perform public.rev_version_ok(b.version, p_version);
  select count(*) into v_groups from public.rev_basket_groups(p_project_id, b.id);
  if v_groups = 0 then raise exception 'Nothing in the request.' using errcode = '22023'; end if;
  if p_ofs_numbers is not null then
    if not public.ir_ofs_sender(p_project_id) then raise exception 'forbidden' using errcode = '42501'; end if;
    if cardinality(p_ofs_numbers) <> v_groups or array_position(p_ofs_numbers, null) is not null
       or cardinality(p_ofs_numbers) <> (select count(distinct x) from unnest(p_ofs_numbers) x) then
      raise exception 'Type one OFS number per request.' using errcode = '22023';
    end if;
  end if;
  perform set_config('app.ir_quiet', 'on', true);
  for g in select * from public.rev_basket_groups(p_project_id, b.id) order by 1 loop
    r := public.ir_submit_ofs(p_project_id, p_company, p_request_date, p_notice_ack, g.area_ids, array[g.item_id], null,
                              p_start_time, p_duration_kind, p_duration_min, '{}'::uuid[], p_special_required, p_inspector_ack);
    if p_ofs_numbers is not null and r.ofs_number is distinct from p_ofs_numbers[g.k] then
      r := public.ir_ofs_number_set(r.id, r.version, p_ofs_numbers[g.k]);
    end if;
    update public.rev_basket_cells set batch_id = v_batch, sent_request_id = r.id, sent_at = now()
     where basket_id = b.id and removed_at is null and batch_id is null and item_id = g.item_id and area_id = any (g.area_ids);
    v_ids := v_ids || r.id;
  end loop;
  perform set_config('app.ir_quiet', '', true);
  if r.ofs_sent_at is not null then
    perform public.ir_ofs_board(v_ids, 'ir.ofs_sent', 'sent to OFS', '{}'::uuid[], 'ir.ofs_decide');
  else
    perform public.ir_ofs_board(v_ids, 'ir.ofs_filed', 'filed',
      array(select distinct u from public.inspection_requests q
             cross join lateral unnest(public.ir_ofs_turn(q, public.ir_ofs_duty_sends(q.project_id))) u
             where q.id = any (v_ids)), null);
  end if;
  -- Anything left was no longer to ask for: out of the basket.
  update public.rev_basket_cells set removed_at = now(), removed_by = auth.uid()
   where basket_id = b.id and removed_at is null and batch_id is null;
  update public.rev_baskets set last_batch_id = v_batch, last_sent_version = p_version where id = b.id;
  perform public.audit('rev.basket_send', 'rev_baskets', b.id, b.project_id, b.org_id,
                       jsonb_build_object('batch_id', v_batch, 'requests', to_jsonb(v_ids)));
  return public.rev_basket_batch_json(v_batch);
end;
$$;

-- =====================================================================================================================
-- 6. The chain everyone reads, with the route and where the request is on it
-- =====================================================================================================================
create or replace function public.ir_ofs_chain(p_request_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare r public.inspection_requests;
begin
  select * into r from public.inspection_requests where id = p_request_id and deleted_at is null;
  if r.id is null or auth.uid() is null or not public.ir_may_see(r.project_id, r.requested_by, r.kind, r.ofs_sent_at) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if r.kind <> 'ofs' then return null; end if;
  return jsonb_build_object(
    'attest', case when r.ofs_attest_at is not null then jsonb_build_object(
      'name', coalesce(public.ir_person_name(r.ofs_attest_by), r.requester_name), 'at', r.ofs_attest_at, 'text', r.ofs_attest_text) end,
    'gc', case when r.gc_at is not null and r.status not in ('gc_review', 'returned') then jsonb_build_object(
      'name', public.ir_person_name(r.gc_by), 'at', r.gc_at) end,
    'ready', case when r.ofs_ready_at is not null then jsonb_build_object(
      'name', public.ir_person_name(r.ofs_ready_by), 'at', r.ofs_ready_at) end,
    'si', case when r.ofs_si_at is not null then jsonb_build_object(
      'name', public.ir_person_name(r.ofs_si_by), 'at', r.ofs_si_at, 'file_id', r.ofs_si_file_id,
      'file_name', (select f.original_name from public.files f where f.id = r.ofs_si_file_id)) end,
    'sent', case when r.ofs_sent_at is not null then jsonb_build_object(
      'name', public.ir_person_name(r.ofs_sent_by), 'at', r.ofs_sent_at) end,
    'special_required', r.special_required,
    'next_number', public.ir_ofs_next_number(r.project_id),
    'route', public.ir_ofs_route(r.project_id),
    'step', public.ir_ofs_step(r, public.ir_ofs_duty_sends(r.project_id)));
end;
$$;

-- =====================================================================================================================
-- Grants: every new function is internal (the calls people make keep their 0091, 0108, 0113 and 0114 grants)
-- =====================================================================================================================
do $$
declare f text;
begin
  foreach f in array array[
    'public.ir_ofs_duty_sends(uuid)', 'public.ir_ofs_route(uuid)', 'public.ir_ofs_step(public.inspection_requests, boolean)',
    'public.ir_cap_holders(uuid, text)', 'public.ir_ofs_turn(public.inspection_requests, boolean)',
    'public.ir_ofs_may(public.inspection_requests, text)', 'public.ir_board_keeps(uuid, text)',
    'public.ir_batch_items(uuid[])', 'public.ir_ofs_board(uuid[], text, text, uuid[], text)', 'public.tg_ir_ofs_board()']
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
