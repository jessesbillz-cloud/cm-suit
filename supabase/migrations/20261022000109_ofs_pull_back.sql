-- 0109 The requester pulls back what isn't ready (Jesse, Oct 22: "The fire marshal shouldn't have to be responsible
-- for taking things off the inspection request that weren't ready or failed. That should be the contractor - the
-- person that submitted the request - and it should filter back through, auto-populate for everyone who has it, and
-- then it's an easy sign-off").
--   * ir_rev_items.pulled_at / pulled_by: a wall x item taken off its request ("Not ready"). The row stays (no deletes)
--     but every reader leaves it out, so the cell is open again on the card as if never asked for, and the request's
--     walls, map, legend, title and items line follow for everyone who reads it. Never on a cell with a result.
--   * ir_rev_pull_back (the requester, the job's OFS duty holder, or whoever does the GC step: ir_may_pull_back) takes
--     cells off any time before a result, also once sent to OFS. The map loses those walls' strokes in those colors,
--     the items line is written again. Everything off: the request is withdrawn. One board line to whoever has it
--     now (the fire marshal once sent), one to the requester when someone else did it. Audited with what it took off.
--   * ir_rev_put_back is the Undo: the same cells back, their strokes back, a request withdrawn by it back as it was.
--   * ir_restore refuses a request whose walls were all taken off (its Undo puts them back).
--   * ofs_desk also answers the requester (own OFS requests), and Back from OFS lists each failed item still to be
--     inspected again rather than the request that failed it.
--   * The readers of a request's cells are redefined with the pulled cells left out, otherwise unchanged.

alter table public.ir_rev_items
  add column pulled_at timestamptz,
  add column pulled_by uuid references auth.users(id),
  add constraint ir_rev_items_pulled_check check ((pulled_at is null) = (pulled_by is null) and (pulled_at is null or result is null));

-- =====================================================================================================================
-- Internal helpers (not user-callable)
-- =====================================================================================================================
-- Who may take cells off an OFS request: its requester, the job's OFS duty holder, or whoever does the GC step.
create or replace function public.ir_may_pull_back(p_project_id uuid, p_kind text, p_requested_by uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(p_kind = 'ofs' and auth.uid() is not null
    and ((p_requested_by = auth.uid() and public.has_capability(p_project_id, 'ir.request'))
         or public.duty_holder(p_project_id, 'ofs_requests') = auth.uid()
         or public.has_capability(p_project_id, 'ir.gc_approve')), false);
$$;

-- The request is still open to take cells off or put them back: no result on it or on any of its walls, not signed.
create or replace function public.ir_pull_open(p_request_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((select q.status not in ('withdrawn', 'complete') and q.result is null and q.signed_at is null
                     from public.inspection_requests q where q.id = p_request_id), false)
     and not exists (select 1 from public.ir_rev_items c where c.request_id = p_request_id and c.result is not null);
$$;

-- The cells asked for, checked and in one order: an array of 1 to 600 distinct {area_id, item_id} of this request,
-- live (p_pulled false) or taken off (p_pulled true).
create or replace function public.ir_pull_cells(p_request_id uuid, p_cells jsonb, p_pulled boolean)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare v_e jsonb; v_uuid text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'; v_out jsonb;
begin
  if jsonb_typeof(p_cells) is distinct from 'array' or jsonb_array_length(p_cells) not between 1 and 600 then
    raise exception 'Pick the walls to take off.' using errcode = '22023';
  end if;
  for v_e in select value from jsonb_array_elements(p_cells) loop
    if jsonb_typeof(v_e) <> 'object' or coalesce(v_e ->> 'area_id', '') !~ v_uuid or coalesce(v_e ->> 'item_id', '') !~ v_uuid then
      raise exception 'Pick the walls to take off.' using errcode = '22023';
    end if;
  end loop;
  select jsonb_agg(jsonb_build_object('area_id', x.area_id, 'item_id', x.item_id) order by x.area_id, x.item_id) into v_out
    from (select distinct (e ->> 'area_id')::uuid as area_id, (e ->> 'item_id')::uuid as item_id
            from jsonb_array_elements(p_cells) e) x;
  if jsonb_array_length(v_out) <> jsonb_array_length(p_cells)
     or exists (select 1 from jsonb_array_elements(v_out) x
                 where not exists (select 1 from public.ir_rev_items c
                                    where c.request_id = p_request_id and c.area_id = (x ->> 'area_id')::uuid
                                      and c.item_id = (x ->> 'item_id')::uuid
                                      and (c.pulled_at is not null) = p_pulled)) then
    raise exception 'Those walls are not on this request.' using errcode = '22023';
  end if;
  return v_out;
end;
$$;

-- A stroke drawn along a wall's line: its ends near the line's ends (either way round), within the side by side
-- spread of three colors (wallStrokes) and a little more.
create or replace function public.ir_stroke_on_line(p_points jsonb, p_line jsonb)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  with e as (
    select (p_points -> 0 ->> 0)::numeric as s1x, (p_points -> 0 ->> 1)::numeric as s1y,
           (p_points -> -1 ->> 0)::numeric as s2x, (p_points -> -1 ->> 1)::numeric as s2y,
           (p_line -> 0 ->> 0)::numeric as l1x, (p_line -> 0 ->> 1)::numeric as l1y,
           (p_line -> -1 ->> 0)::numeric as l2x, (p_line -> -1 ->> 1)::numeric as l2y
  )
  select coalesce(
    (greatest(abs(s1x - l1x), abs(s1y - l1y), abs(s2x - l2x), abs(s2y - l2y)) <= 0.025)
    or (greatest(abs(s1x - l2x), abs(s1y - l2y), abs(s2x - l1x), abs(s2y - l1y)) <= 0.025), false)
    from e;
$$;

-- Takes the strokes of these cells' walls (in their items' colors) off the request's map. Answers what it took off.
create or replace function public.ir_map_drop_walls(p_request_id uuid, p_cells jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare m public.ir_maps; s jsonb; v_keep jsonb := '[]'::jsonb; v_off jsonb := '[]'::jsonb;
begin
  select * into m from public.ir_maps where request_id = p_request_id for update;
  if m.request_id is null or m.sheet_file_id is null or jsonb_array_length(m.strokes) = 0 then return v_off; end if;
  for s in select value from jsonb_array_elements(m.strokes) loop
    if exists (select 1 from jsonb_array_elements(p_cells) x
                 join public.ir_rev_items c on c.request_id = p_request_id and c.area_id = (x ->> 'area_id')::uuid
                                           and c.item_id = (x ->> 'item_id')::uuid
                 join public.rev_areas a on a.id = c.area_id and a.geom is not null
                                        and a.sheet_file_id = m.sheet_file_id and a.sheet_page = m.page
                where (s ->> 'c')::int = c.color and public.ir_stroke_on_line(s -> 'p', a.geom)) then
      v_off := v_off || jsonb_build_array(s);
    else
      v_keep := v_keep || jsonb_build_array(s);
    end if;
  end loop;
  if jsonb_array_length(v_off) > 0 then
    update public.ir_maps set strokes = v_keep, stale = true, version = version + 1, updated_at = now(), updated_by = auth.uid()
     where request_id = p_request_id;
  end if;
  return v_off;
end;
$$;

-- The request's line after a change of its cells: the items text from its live cells (unchanged when none is left).
create or replace function public.ir_pull_text(p_request_id uuid, p_items text)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(public.ir_ofs_items_text(
                    (select array_agg(distinct c.area_id) from public.ir_rev_items c where c.request_id = p_request_id and c.pulled_at is null),
                    (select array_agg(distinct c.item_id) from public.ir_rev_items c where c.request_id = p_request_id and c.pulled_at is null)),
                  p_items);
$$;

-- "2 walls" (walls with nothing live left on the request: whole walls), "1 item" (items of walls that have more), or
-- both. Asked while the cells are taken off.
create or replace function public.ir_pull_count(p_request_id uuid, p_cells jsonb)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with x as (select (e ->> 'area_id')::uuid as area_id from jsonb_array_elements(p_cells) e),
       w as (select x.area_id, count(*) as n,
                    exists (select 1 from public.ir_rev_items c where c.request_id = p_request_id and c.area_id = x.area_id
                               and c.pulled_at is null) as stays
               from x group by x.area_id),
       t as (select count(*) filter (where not stays) as walls, coalesce(sum(n) filter (where stays), 0) as items from w)
  select concat_ws(', ',
           case when walls > 0 then walls || case when walls = 1 then ' wall' else ' walls' end end,
           case when items > 0 then items || case when items = 1 then ' item' else ' items' end end)
    from t;
$$;

-- "OFS #0097", or "IR 12" before it has an OFS number.
create or replace function public.ir_ofs_label(p_number integer, p_ofs_number integer)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case when p_ofs_number is not null then 'OFS #' || lpad(p_ofs_number::text, 4, '0') else 'IR ' || p_number end;
$$;

-- The board lines after a pull back or a put back: whoever has the request now (the fire marshal once sent to OFS,
-- else the inspector), not while it is still with the GC, and the requester when someone else did it.
create or replace function public.ir_pull_tell(p_request public.inspection_requests, p_was text, p_kind text, p_line text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_was in ('pending', 'confirmed', 'postponed') then
    perform public.ir_tell_inspector(p_request, p_kind, left(p_line, 500));
  end if;
  perform public.ir_tell_requester(p_request, p_kind, left(p_line, 500));
end;
$$;

-- =====================================================================================================================
-- The requester's two calls
-- =====================================================================================================================
-- Not ready: these walls x items off the request. Everything off withdraws it.
create or replace function public.ir_rev_pull_back(p_request_id uuid, p_version integer, p_cells jsonb)
returns public.inspection_requests
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare r public.inspection_requests; v_cells jsonb; v_was text; v_off jsonb; v_left int; v_count text; v_line text;
begin
  r := public.ir_for_update(p_request_id, p_version);
  if not public.ir_may_pull_back(r.project_id, r.kind, r.requested_by) then raise exception 'forbidden' using errcode = '42501'; end if;
  if not public.ir_pull_open(r.id) then raise exception 'The results are in. Nothing can come off now.' using errcode = '22023'; end if;
  v_cells := public.ir_pull_cells(r.id, p_cells, false);
  v_was := r.status;
  v_off := public.ir_map_drop_walls(r.id, v_cells);
  update public.ir_rev_items c set pulled_at = now(), pulled_by = auth.uid()
    from jsonb_array_elements(v_cells) x
   where c.request_id = r.id and c.area_id = (x ->> 'area_id')::uuid and c.item_id = (x ->> 'item_id')::uuid
     and c.pulled_at is null;
  select count(*) into v_left from public.ir_rev_items c where c.request_id = r.id and c.pulled_at is null;
  v_count := public.ir_pull_count(r.id, v_cells);
  perform set_config('app.ir_action', 'pull_back', true);
  if v_left = 0 then
    update public.inspection_requests set status = 'withdrawn' where id = r.id returning * into r;
    v_line := public.ir_ofs_label(r.number, r.ofs_number) || ': withdrawn by ' || coalesce(public.ir_person_name(auth.uid()), 'the requester');
  else
    update public.inspection_requests set items = public.ir_pull_text(r.id, r.items) where id = r.id returning * into r;
    v_line := public.ir_ofs_label(r.number, r.ofs_number) || ': ' || v_count || ' taken off by '
           || coalesce(public.ir_person_name(auth.uid()), 'the requester');
  end if;
  perform public.audit('ir.rev_pull_back', 'inspection_request', r.id, r.project_id, r.org_id,
    jsonb_build_object('number', r.number, 'ofs_number', r.ofs_number, 'cells', v_cells, 'was', v_was,
                       'withdrawn', v_left = 0, 'strokes', v_off));
  perform public.ir_pull_tell(r, v_was, case when v_left = 0 then 'ir.withdrawn' else 'ir.pulled_back' end, v_line);
  return r;
end;
$$;

-- Undo: the same cells back on the request (the last time they were taken off), their strokes back on the map, and a
-- request that taking them off withdrew back as it was. Refused once a cell is on another request.
create or replace function public.ir_rev_put_back(p_request_id uuid, p_version integer, p_cells jsonb)
returns public.inspection_requests
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare r public.inspection_requests; v_cells jsonb; e public.audit_events; v_was text; v_other int; v_strokes jsonb; v_count text; v_line text;
begin
  r := public.ir_for_update(p_request_id, p_version);
  if not public.ir_may_pull_back(r.project_id, r.kind, r.requested_by) then raise exception 'forbidden' using errcode = '42501'; end if;
  v_cells := public.ir_pull_cells(r.id, p_cells, true);
  select * into e from public.audit_events a
   where a.action = 'ir.rev_pull_back' and a.entity_type = 'inspection_request' and a.entity_id = r.id
     and a.details -> 'cells' @> v_cells
   order by a.id desc limit 1;
  if e.id is null then raise exception 'Those walls are not on this request.' using errcode = '22023'; end if;
  if r.status = 'withdrawn' and (e.details ->> 'withdrawn') is distinct from 'true' then
    raise exception 'This inspection is withdrawn.' using errcode = '22023';
  end if;
  if r.status = 'complete' or r.result is not null or r.signed_at is not null
     or exists (select 1 from public.ir_rev_items c where c.request_id = r.id and c.result is not null) then
    raise exception 'The results are in. Nothing can go back on now.' using errcode = '22023';
  end if;
  select q.number into v_other
    from jsonb_array_elements(v_cells) x
    join public.ir_rev_items c on c.area_id = (x ->> 'area_id')::uuid and c.item_id = (x ->> 'item_id')::uuid
                              and c.request_id <> r.id and c.pulled_at is null
    join public.inspection_requests q on q.id = c.request_id and q.deleted_at is null and q.status <> 'withdrawn'
   where c.result is null or c.result = 'passed'
   order by q.number limit 1;
  if v_other is not null then raise exception 'That wall is on IR % now.', v_other using errcode = '22023'; end if;
  v_was := case when r.status = 'withdrawn' then e.details ->> 'was' else r.status end;
  v_count := public.ir_pull_count(r.id, v_cells);
  update public.ir_rev_items c set pulled_at = null, pulled_by = null
    from jsonb_array_elements(v_cells) x
   where c.request_id = r.id and c.area_id = (x ->> 'area_id')::uuid and c.item_id = (x ->> 'item_id')::uuid;
  -- The strokes it took off, back on the map (still on the same sheet and page, and room for them).
  v_strokes := coalesce(e.details -> 'strokes', '[]'::jsonb);
  if jsonb_array_length(v_strokes) > 0 then
    update public.ir_maps m set strokes = m.strokes || v_strokes, stale = true, version = m.version + 1, updated_at = now(),
           updated_by = auth.uid()
     where m.request_id = r.id and m.signed is false and public.ir_map_strokes_ok(m.strokes || v_strokes);
  end if;
  perform set_config('app.ir_action', 'put_back', true);
  update public.inspection_requests set status = v_was, items = public.ir_pull_text(r.id, r.items) where id = r.id returning * into r;
  v_line := public.ir_ofs_label(r.number, r.ofs_number) || ': ' || v_count || ' put back by '
         || coalesce(public.ir_person_name(auth.uid()), 'the requester');
  perform public.audit('ir.rev_put_back', 'inspection_request', r.id, r.project_id, r.org_id,
    jsonb_build_object('number', r.number, 'ofs_number', r.ofs_number, 'cells', v_cells, 'status', r.status));
  perform public.ir_pull_tell(r, r.status, 'ir.pulled_back', v_line);
  return r;
end;
$$;

-- =====================================================================================================================
-- The readers of a request's cells, with the cells taken off left out (each otherwise as it was)
-- =====================================================================================================================
create or replace function public.ir_rev_results(p_request_id uuid, p_version integer, p_results jsonb)
 RETURNS inspection_requests
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare r public.inspection_requests; v_result text; v_note text;
begin
  r := public.ir_decider(p_request_id, p_version);
  if r.status = 'postponed' then raise exception 'Confirm it again first.' using errcode = '22023'; end if;
  if not exists (select 1 from public.ir_rev_items c where c.request_id = r.id and c.pulled_at is null) then
    raise exception 'This request has no walls.' using errcode = '22023';
  end if;
  if p_results is null or p_results = 'null'::jsonb then
    update public.ir_rev_items set result = null, result_note = null, result_at = null, result_by = null
     where request_id = r.id and (result is not null or result_note is not null);
  else
    perform public.ir_rev_results_check(r.id, p_results);
    update public.ir_rev_items c
       set result = x.result, result_note = x.note,
           result_at = case when c.result is distinct from x.result then now() else c.result_at end,
           result_by = case when c.result is distinct from x.result then auth.uid() else c.result_by end
      from (select (e ->> 'area_id')::uuid as area_id, (e ->> 'item_id')::uuid as item_id, e ->> 'result' as result,
                   nullif(btrim(coalesce(e ->> 'note', '')), '') as note
              from jsonb_array_elements(p_results) e) x
     where c.request_id = r.id and c.pulled_at is null and c.area_id = x.area_id and c.item_id = x.item_id
       and (c.result, c.result_note) is distinct from (x.result, x.note);
    v_result := case when exists (select 1 from public.ir_rev_items c where c.request_id = r.id and c.result = 'failed')
                     then 'not_approved' else 'approved' end;
    v_note := public.ir_rev_failed_notes(r.id);
  end if;
  perform set_config('app.ir_action', 'result', true);
  update public.inspection_requests
     set result = v_result, result_note = v_note,
         result_at = case when v_result is distinct from result then now() else result_at end,
         result_by = case when v_result is distinct from result then auth.uid() else result_by end,
         status = case when status = 'pending' then 'confirmed' else status end,
         owner_id = auth.uid()
   where id = r.id
   returning * into r;
  perform public.audit('ir.rev_results', 'inspection_request', r.id, r.project_id, r.org_id,
    jsonb_build_object('number', r.number, 'result', r.result,
                       'cells', (select coalesce(jsonb_agg(jsonb_build_object('area_id', c.area_id, 'item_id', c.item_id,
                                                                              'result', c.result) order by c.color, c.area_id), '[]'::jsonb)
                                   from public.ir_rev_items c where c.request_id = r.id and c.pulled_at is null)));
  return r;
end;
$function$;

create or replace function public.ir_rev_results_check(p_request_id uuid, p_results jsonb)
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare e jsonb; v_uuid text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
begin
  if jsonb_typeof(p_results) is distinct from 'array' then raise exception 'Record every wall.' using errcode = '22023'; end if;
  for e in select value from jsonb_array_elements(p_results) loop
    if jsonb_typeof(e) <> 'object' or coalesce(e ->> 'area_id', '') !~ v_uuid or coalesce(e ->> 'item_id', '') !~ v_uuid then
      raise exception 'Record every wall.' using errcode = '22023';
    end if;
    if coalesce(e ->> 'result', '') not in ('passed', 'failed') then raise exception 'Unknown result.' using errcode = '22023'; end if;
    if coalesce(jsonb_typeof(e -> 'note'), 'null') not in ('string', 'null') or length(btrim(coalesce(e ->> 'note', ''))) > 1000 then
      raise exception 'Keep notes to 1000 characters.' using errcode = '22023';
    end if;
    if e ->> 'result' = 'failed' and btrim(coalesce(e ->> 'note', '')) = '' then
      raise exception 'Write why it failed.' using errcode = '22023';
    end if;
  end loop;
  if (select count(distinct ((x ->> 'area_id')::uuid, (x ->> 'item_id')::uuid)) from jsonb_array_elements(p_results) x)
       <> jsonb_array_length(p_results)
     or jsonb_array_length(p_results) <> (select count(*) from public.ir_rev_items c where c.request_id = p_request_id and c.pulled_at is null)
     or exists (select 1 from jsonb_array_elements(p_results) x
                 where not exists (select 1 from public.ir_rev_items c
                                    where c.request_id = p_request_id and c.pulled_at is null and c.area_id = (x ->> 'area_id')::uuid
                                      and c.item_id = (x ->> 'item_id')::uuid)) then
    raise exception 'Record every wall.' using errcode = '22023';
  end if;
end;
$function$;

create or replace function public.ir_map_facts(p_request_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select jsonb_build_object(
    'request_id', q.id,
    'project_id', q.project_id,
    'number', q.number,
    'ofs_number', q.ofs_number,
    'phase', (select l.phase from public.ir_rev_items c join public.rev_areas a on a.id = c.area_id
                join public.rev_lists l on l.id = a.list_id where c.request_id = q.id and c.pulled_at is null limit 1),
    'request_date', q.request_date,
    'what', public.ir_map_what(q.id),
    'sheet_file_id', m.sheet_file_id,
    'page', m.page,
    'strokes', m.strokes,
    'legend', coalesce((select jsonb_agg(jsonb_build_object('color', x.color, 'name', x.name) order by x.color)
                          from (select distinct c.color, btrim(i.name) as name
                                  from public.ir_rev_items c join public.rev_items i on i.id = c.item_id
                                 where c.request_id = q.id and c.pulled_at is null) x), '[]'::jsonb),
    'result', q.result,
    'signed_at', q.signed_at,
    'signer_name', case when q.signed_by is not null then public.rfi_person_name(q.signed_by) end,
    'version', m.version,
    'map_file_id', m.map_file_id,
    'stale', m.stale,
    'permit_number', (select p.primary_number from public.permits p where p.id = q.permit_id and p.deleted_at is null))
    from public.inspection_requests q
    join public.ir_maps m on m.request_id = q.id
   where q.id = p_request_id;
$function$;

create or replace function public.ir_map_what(p_request_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select concat_ws(' ',
    (select string_agg(lv, ', ' order by lv)
       from (select distinct btrim(a.level) as lv from public.ir_rev_items c join public.rev_areas a on a.id = c.area_id
              where c.request_id = p_request_id and c.pulled_at is null) x),
    (select string_agg(nm, ' & ' order by color)
       from (select distinct c.color, btrim(i.name) as nm from public.ir_rev_items c join public.rev_items i on i.id = c.item_id
              where c.request_id = p_request_id and c.pulled_at is null) y));
$function$;

create or replace function public.ir_map_write(p_request inspection_requests, p_map ir_maps, p_version integer, p_strokes jsonb, p_sheet_file_id uuid, p_page integer, p_visitor boolean)
 RETURNS ir_maps
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare m public.ir_maps := p_map; v_strokes jsonb := coalesce(p_strokes, '[]'::jsonb); v_sheet uuid; v_page int;
begin
  if p_request.signed_at is not null then raise exception 'This IR is signed.' using errcode = '22023'; end if;
  if p_request.status = 'withdrawn' then raise exception 'This inspection was withdrawn.' using errcode = '22023'; end if;
  perform public.rev_version_ok(m.version, p_version);
  if not public.ir_map_strokes_ok(v_strokes) then raise exception 'Those marks can''t be saved.' using errcode = '22023'; end if;
  if exists (select 1 from jsonb_array_elements(v_strokes) s
              where (s ->> 'c')::numeric > (select max(c.color) from public.ir_rev_items c where c.request_id = p_request.id)) then
    raise exception 'Use the request''s colors.' using errcode = '22023';
  end if;
  v_sheet := coalesce(p_sheet_file_id, m.sheet_file_id);
  v_page := coalesce(p_page, m.page);
  if p_sheet_file_id is distinct from m.sheet_file_id then
    if not coalesce(p_visitor, false) then
      perform public.rev_sheet_check(p_request.project_id, p_sheet_file_id);
    elsif p_sheet_file_id is not null
          and not public.rev_walls_sheet_ok(p_request.project_id,
                    array(select c.area_id from public.ir_rev_items c where c.request_id = p_request.id and c.pulled_at is null), p_sheet_file_id) then
      raise exception 'Pick a sheet of these walls.' using errcode = '22023';
    end if;
  end if;
  if v_page not between 1 and 2000 then raise exception 'Pick a page.' using errcode = '22023'; end if;
  if v_sheet is null and jsonb_array_length(v_strokes) > 0 then raise exception 'Pick the sheet first.' using errcode = '22023'; end if;
  if (v_sheet, v_page, v_strokes) is not distinct from (m.sheet_file_id, m.page, m.strokes) then return m; end if;
  update public.ir_maps set sheet_file_id = v_sheet, page = v_page, strokes = v_strokes, stale = true, updated_by = auth.uid()
   where request_id = p_request.id returning * into m;
  return m;
end;
$function$;

create or replace function public.link_request_map_sheets(p_request_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select coalesce(jsonb_agg(jsonb_build_object('file_id', s.sheet_file_id, 'label', s.label) order by s.label, s.sheet_file_id),
                  '[]'::jsonb)
    from (select a.sheet_file_id, string_agg(distinct btrim(a.level), ', ' order by btrim(a.level)) as label
            from public.ir_rev_items c
            join public.rev_areas a on a.id = c.area_id
            join public.files f on f.id = a.sheet_file_id and f.project_id = a.project_id and f.deleted_at is null
                               and f.mime = 'application/pdf' and f.scan_status <> 'infected'
           where c.request_id = p_request_id and c.pulled_at is null
           group by a.sheet_file_id) s;
$function$;

create or replace function public.rev_card_kept(p_area_id uuid, p_item_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select exists (select 1 from public.rev_signoffs s where s.area_id = p_area_id and s.item_id = p_item_id and s.deleted_at is null)
      or exists (select 1 from public.ir_rev_items c
                   join public.inspection_requests q on q.id = c.request_id and q.deleted_at is null and q.status <> 'withdrawn'
                  where c.area_id = p_area_id and c.item_id = p_item_id and c.pulled_at is null);
$function$;

create or replace function public.rev_photo_add(p_project_id uuid, p_area_id uuid, p_room_id uuid, p_request_id uuid, p_file_id uuid, p_note text)
 RETURNS rev_photos
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_org uuid; v_note text := nullif(public.rev_clean(p_note), ''); f public.files; p public.rev_photos;
begin
  if not public.rev_photo_adder(p_project_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  select org_id into v_org from public.projects where id = p_project_id and deleted_at is null;
  if v_org is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if length(v_note) > 200 then raise exception 'Keep the note to one line (200 characters).' using errcode = '22023'; end if;
  if p_file_id is null and v_note is null then raise exception 'Add a photo or a note.' using errcode = '22023'; end if;
  if p_area_id is null and p_room_id is null then raise exception 'Pick the wall or the room.' using errcode = '22023'; end if;
  if p_area_id is not null and not exists (
       select 1 from public.rev_areas a join public.rev_lists l on l.id = a.list_id and l.deleted_at is null
        where a.id = p_area_id and a.project_id = p_project_id and a.deleted_at is null) then
    raise exception 'This wall is no longer on the job.' using errcode = 'P0002';
  end if;
  if p_room_id is not null and not exists (
       select 1 from public.rev_rooms r join public.rev_lists l on l.id = r.list_id and l.deleted_at is null
        where r.id = p_room_id and r.project_id = p_project_id and r.deleted_at is null) then
    raise exception 'This room is no longer on the job.' using errcode = 'P0002';
  end if;
  if p_area_id is not null and p_room_id is not null and not exists (
       select 1 from public.rev_room_walls w where w.room_id = p_room_id and w.area_id = p_area_id and w.deleted_at is null) then
    raise exception 'That wall is not in this room.' using errcode = '22023';
  end if;
  if p_request_id is not null then
    if p_area_id is null then raise exception 'Pick the wall on the request.' using errcode = '22023'; end if;
    if not exists (select 1 from public.inspection_requests r where r.id = p_request_id and r.project_id = p_project_id
                      and r.deleted_at is null and public.ir_may_see(r.project_id, r.requested_by, r.kind, r.ofs_sent_at)) then
      raise exception 'not_found' using errcode = 'P0002';
    end if;
    if not public.rev_photo_on_request(p_request_id) then
      raise exception 'This request takes no more photos from you.' using errcode = '42501';
    end if;
    if not exists (select 1 from public.ir_rev_items c where c.request_id = p_request_id and c.area_id = p_area_id and c.pulled_at is null) then
      raise exception 'That wall is not on this request.' using errcode = '22023';
    end if;
  end if;
  if p_file_id is not null then
    select * into f from public.files x
     where x.id = p_file_id and x.project_id = p_project_id and x.deleted_at is null and x.upload_complete
       and x.created_by = auth.uid() and x.scan_status <> 'infected'
       and x.folder_id = public.rev_photos_folder_id(p_project_id)
       and lower(x.mime) in ('image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif');
    if f.id is null then raise exception 'Take or pick the photo again.' using errcode = '22023'; end if;
    -- The same file again: its row, when it is the same photo.
    select * into p from public.rev_photos where file_id = p_file_id and deleted_at is null;
    if p.id is not null then
      if (p.area_id, p.room_id, p.request_id) is not distinct from (p_area_id, p_room_id, p_request_id) then return p; end if;
      raise exception 'That photo is already on a wall.' using errcode = '22023';
    end if;
  else
    -- The same note again within ten minutes: its row.
    select * into p from public.rev_photos x
     where x.created_by = auth.uid() and x.deleted_at is null and x.file_id is null and x.note = v_note
       and (x.area_id, x.room_id, x.request_id) is not distinct from (p_area_id, p_room_id, p_request_id)
       and x.created_at > now() - interval '10 minutes'
     order by x.created_at desc limit 1;
    if p.id is not null then return p; end if;
  end if;
  insert into public.rev_photos (created_at, created_by, org_id, project_id, area_id, room_id, request_id, file_id, note)
  values (clock_timestamp(), auth.uid(), v_org, p_project_id, p_area_id, p_room_id, p_request_id, p_file_id, v_note)
  returning * into p;
  return p;
end;
$function$;

create or replace function public.rev_wall_history(p_area_id uuid)
 RETURNS TABLE(item_id uuid, kind text, request_id uuid, ir_number integer, ofs_number integer, day date, result text, note text, file_id uuid, file_name text, can_open boolean, at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
#variable_conflict use_column
declare a public.rev_areas; v_tz text;
begin
  select * into a from public.rev_areas where id = p_area_id and deleted_at is null;
  if a.id is null or auth.uid() is null or not public.has_capability(a.project_id, 'revs.read') then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  select timezone into v_tz from public.projects where id = a.project_id;
  return query
    select h.item_id, h.kind, h.request_id, h.ir_number, h.ofs_number, h.day, h.result, h.note, h.file_id, h.file_name,
           h.can_open, h.at
      from (
        select c.item_id, 'request'::text as kind, q.id as request_id, q.number as ir_number, q.ofs_number, q.request_date as day,
               coalesce(c.result, 'requested') as result, case when c.result = 'failed' then c.result_note end as note,
               null::uuid as file_id, null::text as file_name,
               public.ir_may_see(q.project_id, q.requested_by, q.kind, q.ofs_sent_at) as can_open,
               coalesce(c.result_at, (q.request_date + coalesce(q.start_time, time '00:00')) at time zone v_tz) as at
          from public.ir_rev_items c
          join public.inspection_requests q on q.id = c.request_id and q.deleted_at is null and q.status <> 'withdrawn'
         where c.area_id = a.id and c.pulled_at is null
        union all
        select s.item_id, 'before', null, null, s.ofs_number, s.signed_on, 'passed', s.note, f.id, f.original_name, f.id is not null,
               coalesce((s.signed_on + time '12:00') at time zone v_tz, s.updated_at)
          from public.rev_signoffs s
          left join public.files f on f.id = s.file_id and f.deleted_at is null and f.scan_status <> 'infected'
         where s.area_id = a.id and s.deleted_at is null
      ) h
      join public.rev_items i on i.id = h.item_id and i.deleted_at is null
     order by h.item_id, h.at desc, h.ir_number desc nulls last;
end;
$function$;

create or replace function public.rev_signoff_live(p_area_id uuid, p_item_id uuid)
 RETURNS rev_signoffs
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select s.*
    from public.rev_signoffs s
    join public.projects p on p.id = s.project_id
   where s.area_id = p_area_id and s.item_id = p_item_id and s.deleted_at is null
     and not exists (
       select 1 from public.ir_rev_items c
         join public.inspection_requests q on q.id = c.request_id and q.deleted_at is null and q.status <> 'withdrawn'
        where c.area_id = s.area_id and c.item_id = s.item_id and c.pulled_at is null
          and c.created_at > case when s.signed_on is null then s.updated_at
                                  else (s.signed_on + 1)::timestamp at time zone p.timezone end);
$function$;

create or replace function public.rev_status_rows(p_project_id uuid)
 RETURNS TABLE(area_id uuid, item_id uuid, status text, request_id uuid, ir_number integer, ofs_number integer, at timestamp with time zone, note text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
#variable_conflict use_column
declare v_tz text;
begin
  select timezone into v_tz from public.projects where id = p_project_id;
  return query
    with cells as (
      select a.id as aid, i.id as iid, l.position as lpos, btrim(a.level) as lvl, a.position as apos, a.name as aname,
             v.number as vnum, i.position as ipos, i.name as iname
        from public.rev_areas a
        join public.rev_lists l on l.id = a.list_id and l.deleted_at is null
        join public.revs v on v.list_id = l.id and v.deleted_at is null
        join public.rev_items i on i.rev_id = v.id and i.deleted_at is null
       where a.project_id = p_project_id and a.deleted_at is null
    ),
    live as (
      select c.area_id as aid, c.item_id as iid, c.result, c.result_at, c.result_note, c.created_at, q.id as rid,
             q.number, q.ofs_number as ofs, (q.request_date + coalesce(q.start_time, time '00:00')) at time zone v_tz as asked
        from public.ir_rev_items c
        join public.inspection_requests q on q.id = c.request_id and q.deleted_at is null and q.status <> 'withdrawn'
       where c.project_id = p_project_id and c.pulled_at is null
    ),
    passed as (
      select distinct on (aid, iid) * from live where result = 'passed' order by aid, iid, result_at desc, number desc
    ),
    asked as (
      select distinct on (aid, iid) * from live where result is null order by aid, iid, created_at desc, number desc
    ),
    last_result as (
      select distinct on (aid, iid) * from live where result is not null order by aid, iid, result_at desc, number desc
    ),
    before as (
      select s.area_id as aid, s.item_id as iid, s.ofs_number as ofs, s.signed_on, s.note
        from public.rev_signoffs s
       where s.project_id = p_project_id and s.deleted_at is null
         and (public.rev_signoff_live(s.area_id, s.item_id)).id is not null
    )
    select c.aid, c.iid,
           case when m.id is not null then 'na' when b.aid is not null then 'passed' when p.rid is not null then 'passed'
                when q.rid is not null then 'requested' when f.result = 'failed' then 'failed'
                when k.id is not null then 'na' else 'open' end,
           case when m.id is not null or b.aid is not null then null when p.rid is not null then p.rid
                when q.rid is not null then q.rid when f.result = 'failed' then f.rid end,
           case when m.id is not null or b.aid is not null then null when p.rid is not null then p.number
                when q.rid is not null then q.number when f.result = 'failed' then f.number end,
           case when m.id is not null then null when b.aid is not null then b.ofs when p.rid is not null then p.ofs
                when q.rid is not null then q.ofs when f.result = 'failed' then f.ofs end,
           case when m.id is not null then m.updated_at
                when b.aid is not null then (b.signed_on + time '12:00') at time zone v_tz
                when p.rid is not null then p.result_at when q.rid is not null then q.asked
                when f.result = 'failed' then f.result_at when k.id is not null then k.updated_at end,
           case when m.id is not null then null when b.aid is not null then b.note when p.rid is not null then p.result_note
                when q.rid is not null then null when f.result = 'failed' then f.result_note end
      from cells c
      left join public.rev_marks m on m.area_id = c.aid and m.item_id = c.iid and m.deleted_at is null and not m.set_up
      left join public.rev_marks k on k.area_id = c.aid and k.item_id = c.iid and k.deleted_at is null and k.set_up
      left join before b on b.aid = c.aid and b.iid = c.iid
      left join passed p on p.aid = c.aid and p.iid = c.iid
      left join asked q on q.aid = c.aid and q.iid = c.iid
      left join last_result f on f.aid = c.aid and f.iid = c.iid
     order by c.lpos, c.lvl, c.apos, c.aname, c.aid, c.vnum, c.ipos, c.iname, c.iid;
end;
$function$;

-- =====================================================================================================================
-- Request again: not a request whose walls were all taken off (0061's rule otherwise unchanged)
-- =====================================================================================================================
create or replace function public.ir_restore(p_request_id uuid, p_version integer)
returns public.inspection_requests
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare r public.inspection_requests; v_status text; v_restart boolean;
begin
  r := public.ir_for_update(p_request_id, p_version);
  if r.requested_by is distinct from auth.uid() or not public.has_capability(r.project_id, 'ir.request') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if r.status <> 'withdrawn' then raise exception 'This inspection is not withdrawn.' using errcode = '22023'; end if;
  if exists (select 1 from public.ir_rev_items c where c.request_id = r.id)
     and not exists (select 1 from public.ir_rev_items c where c.request_id = r.id and c.pulled_at is null) then
    raise exception 'Its walls were taken off. Request them again.' using errcode = '22023';
  end if;
  v_status := public.ir_first_status(r.project_id, r.kind);
  v_restart := r.kind = 'ofs' and v_status = 'gc_review';
  perform set_config('app.ir_action', 'restore', true);
  update public.inspection_requests
     set status = v_status,
         ofs_sent_at = case when v_restart then null else ofs_sent_at end,
         ofs_sent_by = case when v_restart then null else ofs_sent_by end,
         owner_id = case when v_restart then null else owner_id end
   where id = r.id
   returning * into r;
  if r.status = 'pending' then
    perform public.ir_tell_inspector(r, 'ir.requested', 'IR ' || r.number || ' requested again');
  end if;
  return r;
end;
$$;

-- =====================================================================================================================
-- The start page: the designated person as before, and the requester (own OFS requests sent to OFS). Back from OFS
-- lists each failed item still to be inspected again (its room, wall, item and why), not the request that failed it.
-- =====================================================================================================================
create or replace function public.ofs_desk(p_project_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare v_sender boolean; v_uid uuid := auth.uid();
begin
  if v_uid is null or not public.is_member(p_project_id) then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not public.ir_setting(p_project_id, 'ir_ofs_allowed') then return null; end if;
  v_sender := public.ir_ofs_sender(p_project_id);
  if not v_sender and not (public.has_capability(p_project_id, 'ir.request')
                           and exists (select 1 from public.inspection_requests q
                                        where q.project_id = p_project_id and q.kind = 'ofs' and q.requested_by = v_uid
                                          and q.ofs_sent_at is not null and q.deleted_at is null and q.status <> 'withdrawn')) then
    return null;
  end if;
  return jsonb_build_object('designated', v_sender, 'rows', coalesce((
    select jsonb_agg(to_jsonb(x) order by x.at desc, x.id)
      from (
        (select i.id::text, i.kind, case when i.kind = 'rfi' then 'rfi' else 'file' end as target_type,
                coalesce(i.rfi_id, i.file_id) as target_id, r.number,
                coalesce(r.title, f.original_name) as title,
                coalesce(d.decision, 'waiting') as state,
                coalesce(d.decided_at, case when i.kind = 'rfi' then greatest(i.marked_at, r.answered_at) else i.marked_at end) as at
           from public.ofs_items i
           left join public.rfis r on r.id = i.rfi_id
           left join public.files f on f.id = i.file_id
           left join public.ofs_decisions d on d.id = i.decision_id
          where v_sender and i.project_id = p_project_id and public.ofs_item_sent(i.id)
            and public.ofs_item_may_see(i.rfi_id, i.file_id)
          order by 8 desc
          limit 900)
        union all
        (select q.id::text, 'inspection', 'inspection_request', q.id, q.ofs_number,
                left(btrim(q.items), 200),
                case q.result when 'approved' then 'passed' when 'not_approved' then 'failed' else 'waiting' end,
                coalesce(q.result_at, q.ofs_sent_at)
           from public.inspection_requests q
          where q.project_id = p_project_id and q.kind = 'ofs' and q.ofs_sent_at is not null and q.deleted_at is null
            and q.status <> 'withdrawn' and public.ir_may_see(q.project_id, q.requested_by, q.kind, q.ofs_sent_at)
            and (v_sender or q.requested_by = v_uid)
            and not (q.result = 'not_approved'
                     and exists (select 1 from public.ir_rev_items c where c.request_id = q.id and c.pulled_at is null))
          order by 8 desc
          limit 300)
        union all
        (select s.area_id::text || ':' || s.item_id::text, 'inspection', 'inspection_request', q.id, q.ofs_number,
                left(concat_ws(' · ',
                       (select case when m.kind = 'room' then btrim(m.number) || ' ' || btrim(m.name) else btrim(m.name) end
                          from public.rev_room_walls w join public.rev_rooms m on m.id = w.room_id and m.deleted_at is null
                         where w.area_id = s.area_id and w.deleted_at is null
                         order by m.position, m.number, m.id limit 1),
                       btrim(a.name), btrim(i.name))
                     || coalesce(': ' || nullif(btrim(s.note), ''), ''), 200),
                'failed', s.at
           from public.rev_status_rows(p_project_id) s
           join public.inspection_requests q on q.id = s.request_id and q.kind = 'ofs' and q.deleted_at is null
           join public.rev_areas a on a.id = s.area_id
           join public.rev_items i on i.id = s.item_id
          where s.status = 'failed' and public.ir_may_see(q.project_id, q.requested_by, q.kind, q.ofs_sent_at)
            and (v_sender or q.requested_by = v_uid)
          order by s.at desc
          limit 300)
      ) as x (id, kind, target_type, target_id, number, title, state, at)), '[]'::jsonb));
end;
$$;

-- =====================================================================================================================
-- Grants
-- =====================================================================================================================
do $$
declare f text;
begin
  foreach f in array array['public.ir_rev_pull_back(uuid, integer, jsonb)', 'public.ir_rev_put_back(uuid, integer, jsonb)'] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
  foreach f in array array[
    'public.ir_may_pull_back(uuid, text, uuid)', 'public.ir_pull_open(uuid)',
    'public.ir_pull_cells(uuid, jsonb, boolean)', 'public.ir_stroke_on_line(jsonb, jsonb)',
    'public.ir_map_drop_walls(uuid, jsonb)', 'public.ir_pull_text(uuid, text)',
    'public.ir_pull_count(uuid, jsonb)', 'public.ir_ofs_label(integer, integer)',
    'public.ir_pull_tell(public.inspection_requests, text, text, text)']
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
