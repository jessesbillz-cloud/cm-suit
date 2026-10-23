-- 0114 One tap for a whole batch at each approval step (Jesse, Oct 23: speed and zero wasted taps). A basket sent as
-- one batch (0113) is many OFS requests, and each walks the steps on its own: the GC's Ready, then the inspector's Send
-- to OFS (or his Ready, then the duty holder's send). Nine requests meant nine taps at each step.
--   1. ir_batch_waits: the request waits on the caller at this step (gc, ready or send), the same gates the single
--      buttons have (ir_ofs_check, ir_send_ofs). It decides what the screens offer and what the batch step acts on.
--   2. ir_batch_get and ir_batches_waiting: a batch as the caller reads it, one line ("Batch of 9 · <levels> · <items>"),
--      the step the caller takes on it (the earliest that has requests waiting on him), those requests with their
--      versions, and every request of it (the ones not waiting on him are listed only).
--   3. ir_batch_step(batch, step, versions): for each request of the batch waiting on the caller at that step, the SAME
--      per-request function the single button calls (ir_ofs_check for gc and ready, ir_send_ofs for send) with that
--      request's version. One transaction: a stale version, or a request waiting on him that the screen did not show,
--      refuses the whole batch (40001). A request past the step is skipped and reported, so the same call again is
--      safe. Neither step re-confirms identity on a single request, so the batch does not either.
-- The fire marshal's own decisions stay one request at a time. Nothing is dropped.

-- =====================================================================================================================
-- 1. Waits on the caller at this step
-- =====================================================================================================================
create or replace function public.ir_batch_waits(p_request public.inspection_requests, p_step text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(auth.uid() is not null and p_request.kind = 'ofs' and p_request.deleted_at is null
    and p_request.ofs_sent_at is null and case p_step
      -- ir_ofs_check gc: the GC step, while the request is with the GC.
      when 'gc' then p_request.status in ('gc_review', 'returned')
                     and public.has_capability(p_request.project_id, 'ir.gc_approve')
      -- ir_ofs_check ready: the inspector who has it (or nobody does), not checked yet.
      when 'ready' then p_request.status in ('pending', 'postponed') and p_request.ofs_ready_at is null
                        and public.has_capability(p_request.project_id, 'ir.decide')
                        and public.ir_owner_ok(p_request.project_id, p_request.owner_id, p_request.kind, p_request.ofs_sent_at)
      -- ir_send_ofs: the inspector on his own word, the duty holder once the inspector (and the SI report) checked it.
      when 'send' then p_request.status in ('pending', 'postponed') and public.ir_ofs_sender(p_request.project_id)
                       and case when public.has_capability(p_request.project_id, 'ir.decide')
                                then public.ir_owner_ok(p_request.project_id, p_request.owner_id, p_request.kind, p_request.ofs_sent_at)
                                else p_request.ofs_ready_at is not null
                                     and (p_request.special_required is not true or p_request.ofs_si_at is not null) end
      else false end, false);
$$;

-- =====================================================================================================================
-- 2. A batch as the caller reads it
-- =====================================================================================================================
-- Its requests the caller reads (not withdrawn), the step he takes (gc, then send, then ready: the earliest with a
-- request waiting on him), those requests with their versions, and its line. Null when he reads none of it.
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
    -- "Level 01, Level 02 · Top of wall & HOW Spray": its levels, then its items in rev order.
    'items', left(concat_ws(' · ',
      (select string_agg(x.lv, ', ' order by x.lv) from (
         select distinct btrim(a.level) as lv from public.ir_rev_items c join public.rev_areas a on a.id = c.area_id
          where c.request_id = any (v_ids) and c.pulled_at is null) x),
      (select string_agg(x.name, ' & ' order by x.number, x.position, x.name) from (
         select distinct btrim(i.name) as name, v.number, i.position
           from public.ir_rev_items c join public.rev_items i on i.id = c.item_id join public.revs v on v.id = i.rev_id
          where c.request_id = any (v_ids) and c.pulled_at is null) x)), 300),
    'step', v_step,
    'requests', (select jsonb_agg(jsonb_build_object(
        'id', q.id, 'number', q.number, 'ofs_number', q.ofs_number, 'items', q.items, 'status', q.status,
        'result', q.result, 'helper_id', q.helper_id, 'ofs_sent_at', q.ofs_sent_at, 'version', q.version,
        'waits', v_step is not null and public.ir_batch_waits(q, v_step))
        order by q.ofs_number nulls last, q.number)
      from public.inspection_requests q where q.id = any (v_ids)));
end;
$$;

-- One batch (the request page of a request filed in one).
create or replace function public.ir_batch_get(p_batch_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare v jsonb;
begin
  if auth.uid() is null then raise exception 'forbidden' using errcode = '42501'; end if;
  v := public.ir_batch_json(p_batch_id);
  if v is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  return v;
end;
$$;

-- The batches of two or more with requests waiting on the caller, on a job (or on all his jobs: null), oldest first.
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
                     where q.kind = 'ofs' and q.deleted_at is null and q.ofs_sent_at is null
                       and q.status in ('gc_review', 'returned', 'pending', 'postponed')
                       and (p_project_id is null or q.project_id = p_project_id) and public.is_member(q.project_id)) b) x
     where x.j is not null and x.j ->> 'step' is not null and (x.j ->> 'size')::int >= 2), '[]'::jsonb);
end;
$$;

-- =====================================================================================================================
-- 3. The step for the whole batch
-- =====================================================================================================================
-- p_versions: {"<request id>": <version>} as the screen read them. Answers {batch_id, step, done: [...], skipped: [...]}.
create or replace function public.ir_batch_step(p_batch_id uuid, p_step text, p_versions jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare r public.inspection_requests; v_ids uuid[]; v_project uuid; v_org uuid; v_ver text;
  v_done jsonb := '[]'::jsonb; v_skipped jsonb := '[]'::jsonb;
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
  end loop;
  if jsonb_array_length(v_done) > 0 then
    perform public.audit('ir.batch_step', 'inspection_requests', (v_done -> 0 ->> 'id')::uuid, v_project, v_org,
                         jsonb_build_object('batch_id', p_batch_id, 'step', p_step, 'done', v_done, 'skipped', v_skipped));
  end if;
  return jsonb_build_object('batch_id', p_batch_id, 'step', p_step, 'done', v_done, 'skipped', v_skipped);
end;
$$;

-- =====================================================================================================================
-- Grants: the calls people make, the helpers internal
-- =====================================================================================================================
do $$
declare f text;
begin
  foreach f in array array['public.ir_batch_get(uuid)', 'public.ir_batches_waiting(uuid)', 'public.ir_batch_step(uuid, text, jsonb)'] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
  foreach f in array array['public.ir_batch_waits(public.inspection_requests, text)', 'public.ir_batch_json(uuid)'] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
