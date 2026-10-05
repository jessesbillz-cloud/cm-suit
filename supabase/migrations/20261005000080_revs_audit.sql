-- 0080 Revs and permits, from the Oct 4 audit (Jesse: "make sure there's an upload and a delete and a full screen ...
-- make sure it goes somewhere").
--   * A sheet stays while it is used: a finished PDF a live wall is on, or a request's map is drawn on (or is), can't be
--     removed (files.deleted_at). Files' own Delete then answers in words; pointing the walls at another sheet frees
--     it. Stamped approved sheets were kept already (0053 keep_stamped). An upload that never finished has no bytes and
--     is no sheet: it stays removable (remove_unfinished_upload, 0065).
--   * rev_move: Setup's Up / Down is one save. The item (or wall) swaps places with its neighbor in its rev (or on its
--     level of its list), and the group is numbered 1..n in that order, at once. The moved row is version-checked;
--     Undo is the same move the other way.
--   * A backcheck can be taken back (Undo, like every other permit move): permit_review_withdraw, by the official, while
--     the cycle is open and has no comments. It is kept (withdrawn_at), never deleted, and the review's next Backcheck
--     is that same cycle again (its number, a new day), so numbers never skip. A taken-back cycle is not shown, takes
--     no comments and can't be closed.
-- The plan sheet's download (Revs) is the ir-map function's 'plan_download': authorize_rev_sheet as the caller (0059),
-- the same gate that shows the sheet, so whoever may see the plan may download it (logged), Files folder or not.

-- =====================================================================================================================
-- A sheet in use stays on file
-- =====================================================================================================================
create or replace function public.tg_files_keep_rev_sheet()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.deleted_at is not null and old.deleted_at is null and old.upload_complete then
    if exists (select 1 from public.rev_areas a
                 join public.rev_lists l on l.id = a.list_id and l.deleted_at is null
                where a.sheet_file_id = old.id and a.deleted_at is null) then
      raise exception 'A wall in Revs is on this sheet. Give the wall another sheet first.' using errcode = '22023';
    end if;
    if exists (select 1 from public.ir_maps m where m.sheet_file_id = old.id or m.map_file_id = old.id) then
      raise exception 'An inspection map is on this sheet.' using errcode = '22023';
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function public.tg_files_keep_rev_sheet() from public, anon, authenticated;
create trigger keep_rev_sheet before update of deleted_at on public.files
  for each row execute function public.tg_files_keep_rev_sheet();

-- =====================================================================================================================
-- Up / Down in one save
-- =====================================================================================================================
create or replace function public.rev_move(p_kind text, p_id uuid, p_version int, p_dir int)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_rev uuid; v_list uuid; i public.rev_items; a public.rev_areas; v_ids uuid[]; v_at int; v_row jsonb;
begin
  if p_dir is null or p_dir not in (-1, 1) then raise exception 'Up or down.' using errcode = '22023'; end if;
  if p_kind = 'item' then
    select rev_id into v_rev from public.rev_items where id = p_id;
    if v_rev is null then raise exception 'not_found' using errcode = 'P0002'; end if;
    perform public.rev_lock(v_rev);
    select * into i from public.rev_items where id = p_id for update;
    if i.deleted_at is not null then raise exception 'This item was removed.' using errcode = '22023'; end if;
    perform public.rev_version_ok(i.version, p_version);
    select array_agg(x.id order by x.position, x.name, x.id) into v_ids
      from public.rev_items x where x.rev_id = i.rev_id and x.deleted_at is null;
  elsif p_kind = 'area' then
    select list_id into v_list from public.rev_areas where id = p_id;
    if v_list is null then raise exception 'not_found' using errcode = 'P0002'; end if;
    perform public.rev_list_lock(v_list, null);
    select * into a from public.rev_areas where id = p_id for update;
    if a.deleted_at is not null then raise exception 'This wall was removed.' using errcode = '22023'; end if;
    perform public.rev_version_ok(a.version, p_version);
    select array_agg(x.id order by x.position, x.name, x.id) into v_ids
      from public.rev_areas x
     where x.list_id = a.list_id and x.deleted_at is null and lower(btrim(x.level)) = lower(btrim(a.level));
  else
    raise exception 'Unknown kind.' using errcode = '22023';
  end if;
  v_at := array_position(v_ids, p_id);
  -- At the top (or the bottom) already: nothing moves.
  if v_at + p_dir between 1 and cardinality(v_ids) then
    v_ids[v_at] := v_ids[v_at + p_dir];
    v_ids[v_at + p_dir] := p_id;
    execute format('update public.%I t set position = o.n from unnest($1) with ordinality as o (id, n)
                     where t.id = o.id and t.position is distinct from o.n::int', public.rev_table(p_kind))
      using v_ids;
  end if;
  execute format('select to_jsonb(t) from public.%I t where t.id = $1', public.rev_table(p_kind)) into v_row using p_id;
  return v_row;
end;
$$;
revoke execute on function public.rev_move(text, uuid, integer, integer) from public, anon;
grant execute on function public.rev_move(text, uuid, integer, integer) to authenticated, service_role;

-- =====================================================================================================================
-- A backcheck taken back
-- =====================================================================================================================
alter table public.permit_reviews add column withdrawn_at timestamptz;
alter table public.permit_reviews add constraint permit_reviews_withdrawn_check
  check (withdrawn_at is null or (backcheck > 0 and outcome is null));

create or replace function public.permit_review_withdraw(p_review_id uuid, p_version int)
returns public.permit_reviews
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v public.permit_reviews; r public.permits;
begin
  select * into v from public.permit_reviews where id = p_review_id;
  if v.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  r := public.permit_lock(v.permit_id, null);
  if not public.has_capability(r.project_id, 'permits.manage') then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into v from public.permit_reviews where id = p_review_id for update;
  if v.withdrawn_at is not null then return v; end if;
  if p_version is not null and v.version <> p_version then
    raise exception 'version_conflict: expected %, found %', p_version, v.version using errcode = '40001';
  end if;
  if v.backcheck = 0 or v.outcome is not null then
    raise exception 'Only an open backcheck can be taken back.' using errcode = '22023';
  end if;
  if exists (select 1 from public.permit_comments c where c.review_id = v.id) then
    raise exception 'This backcheck has comments.' using errcode = '22023';
  end if;
  update public.permit_reviews set withdrawn_at = now() where id = v.id returning * into v;
  perform public.audit('permit.review_withdraw', 'permit_review', v.id, r.project_id, r.org_id,
                       jsonb_build_object('permit_id', r.id, 'cycle', v.cycle, 'review', v.review_no, 'backcheck', v.backcheck));
  return v;
end;
$$;
revoke execute on function public.permit_review_withdraw(uuid, integer) from public, anon;
grant execute on function public.permit_review_withdraw(uuid, integer) to authenticated, service_role;

-- A taken-back cycle takes no comments and is never closed or reopened (only opened again by the next Backcheck).
create or replace function public.tg_permit_review_withdrawn()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if old.withdrawn_at is not null and new.withdrawn_at is not null and new.outcome is distinct from old.outcome then
    raise exception 'This backcheck was taken back.' using errcode = '22023';
  end if;
  return new;
end;
$$;
revoke execute on function public.tg_permit_review_withdrawn() from public, anon, authenticated;
create trigger withdrawn before update on public.permit_reviews
  for each row execute function public.tg_permit_review_withdrawn();

create or replace function public.tg_permit_comment_withdrawn()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if exists (select 1 from public.permit_reviews v where v.id = new.review_id and v.withdrawn_at is not null) then
    raise exception 'This backcheck was taken back.' using errcode = '22023';
  end if;
  return new;
end;
$$;
revoke execute on function public.tg_permit_comment_withdrawn() from public, anon, authenticated;
create trigger review_withdrawn before insert on public.permit_comments
  for each row execute function public.tg_permit_comment_withdrawn();

-- 0061's next backcheck: a cycle taken back is this one again (its numbers, received today unless a day is given).
create or replace function public.permit_review_next(r public.permits, p_review_no int, p_received_on date, p_key uuid)
returns public.permit_reviews
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v public.permit_reviews; v_kind text;
begin
  if exists (select 1 from public.permit_reviews
              where permit_id = r.id and review_no = p_review_no and outcome is null and withdrawn_at is null) then
    raise exception 'Close the open review first.' using errcode = '22023';
  end if;
  select * into v from public.permit_reviews
   where permit_id = r.id and review_no = p_review_no and withdrawn_at is not null
   order by backcheck desc limit 1 for update;
  if v.id is not null then
    update public.permit_reviews
       set withdrawn_at = null, received_on = coalesce(p_received_on, public.permit_today(r.project_id)),
           request_key = p_key, created_by = auth.uid()
     where id = v.id
     returning * into v;
    perform public.audit('permit.review_open', 'permit_review', v.id, r.project_id, r.org_id,
                         jsonb_build_object('permit_id', r.id, 'cycle', v.cycle, 'review', v.review_no, 'backcheck', v.backcheck,
                                            'kind', v.kind, 'again', true));
    return v;
  end if;
  select kind into v_kind from public.permit_reviews where permit_id = r.id and review_no = p_review_no order by backcheck limit 1;
  if v_kind is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  insert into public.permit_reviews (permit_id, project_id, org_id, cycle, review_no, backcheck, kind, received_on, created_by,
                                     request_key)
  values (r.id, r.project_id, r.org_id, public.next_number(r.project_id, 'permit_review:' || r.id::text), p_review_no,
          public.next_number(r.project_id, 'permit_bc:' || r.id::text || ':' || p_review_no), v_kind,
          coalesce(p_received_on, public.permit_today(r.project_id)), auth.uid(), p_key)
  returning * into v;
  perform public.audit('permit.review_open', 'permit_review', v.id, r.project_id, r.org_id,
                       jsonb_build_object('permit_id', r.id, 'cycle', v.cycle, 'review', v.review_no, 'backcheck', v.backcheck,
                                          'kind', v.kind));
  return v;
end;
$$;

-- 0061's Backcheck: a repeat of the same tap answers the same cycle, unless it was taken back meanwhile.
create or replace function public.permit_review_backcheck(p_review_id uuid, p_received_on date default null, p_key uuid default null)
returns public.permit_reviews
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v public.permit_reviews; r public.permits;
begin
  select * into v from public.permit_reviews where id = p_review_id;
  if v.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  r := public.permit_lock(v.permit_id, null);
  if not public.has_capability(r.project_id, 'permits.manage') then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_key is not null then
    select * into v from public.permit_reviews where created_by = auth.uid() and request_key = p_key and withdrawn_at is null;
    if v.id is not null then return v; end if;
    select * into v from public.permit_reviews where id = p_review_id;
  end if;
  if r.stage in ('complete', 'cancelled') then raise exception 'This permit is closed.' using errcode = '22023'; end if;
  return public.permit_review_next(r, v.review_no, p_received_on, p_key);
end;
$$;

-- The latest cycle (0052) leaves a taken-back one out.
create or replace function public.permit_cycle(p_permit_id uuid)
returns int
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(max(cycle), 0) from public.permit_reviews where permit_id = p_permit_id and withdrawn_at is null;
$$;

-- 0061's permit in full, without taken-back cycles.
create or replace function public.permit_detail(p_permit_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare r public.permits; j public.projects; v_manage boolean; v_respond boolean; v_link boolean;
begin
  select * into r from public.permits where id = p_permit_id and deleted_at is null;
  if r.id is null or not public.has_capability(r.project_id, 'permits.read') then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  select * into j from public.projects where id = r.project_id;
  v_manage := public.has_capability(r.project_id, 'permits.manage');
  v_respond := public.has_capability(r.project_id, 'permits.respond');
  v_link := v_manage or public.has_capability(r.project_id, 'ir.decide');
  return jsonb_build_object(
    'permit', to_jsonb(r),
    'project_name', j.name,
    'timezone', j.timezone,
    'assigned_name', case when r.assigned_to is not null then public.rfi_person_name(r.assigned_to) end,
    'created_by_name', public.rfi_person_name(r.created_by),
    'can', jsonb_build_object('manage', v_manage, 'respond', v_respond, 'link', v_link),
    'moves', to_jsonb(case when v_manage then public.permit_next_stages(r.stage) else '{}'::text[] end),
    'open_inspections', public.permit_open_inspections(r.id),
    'steps', coalesce((select jsonb_agg(to_jsonb(x) order by x.position) from public.permit_progress(r.project_id, r.id) x),
                      '[]'::jsonb),
    'reviews', coalesce((
      select jsonb_agg(to_jsonb(v) || jsonb_build_object('comments', coalesce((
               select jsonb_agg(to_jsonb(c) || jsonb_build_object(
                        'responded_by_name', case when c.responded_by is not null then public.rfi_person_name(c.responded_by) end)
                      order by c.number)
                 from public.permit_comments c where c.review_id = v.id), '[]'::jsonb))
             order by (v.outcome is null) desc, v.cycle desc)
        from public.permit_reviews v where v.permit_id = r.id and v.withdrawn_at is null), '[]'::jsonb),
    'events', coalesce((
      select jsonb_agg(jsonb_build_object('stage', case e.stage when 'inspections' then 'issued' else e.stage end, 'at', e.at,
                                          'by_name', case when e.actor is not null then public.rfi_person_name(e.actor) end,
                                          'note', e.note, 'undone', e.undone_at is not null) order by e.at, e.id)
        from public.permit_stage_events e where e.permit_id = r.id), '[]'::jsonb),
    'inspections', coalesce((
      select jsonb_agg(jsonb_build_object('id', q.id, 'number', q.number, 'ofs_number', q.ofs_number, 'kind', q.kind,
                                          'special_kind', k.name, 'request_date', q.request_date, 'start_time', q.start_time,
                                          'items', q.items, 'status_key', public.ir_status_key(q.status, q.result, q.helper_id),
                                          'version', q.version)
                       order by q.request_date desc, q.number desc)
        from public.inspection_requests q
        left join public.ir_special_kinds k on k.id = q.special_kind_id
       where q.permit_id = r.id and q.deleted_at is null
         and public.ir_may_see(q.project_id, q.requested_by, q.kind, q.ofs_sent_at)), '[]'::jsonb),
    'linkable', case when v_link then coalesce((
      select jsonb_agg(jsonb_build_object('id', q.id, 'number', q.number, 'ofs_number', q.ofs_number, 'kind', q.kind,
                                          'special_kind', k.name, 'request_date', q.request_date, 'items', q.items,
                                          'version', q.version)
                       order by q.request_date desc, q.number desc)
        from (select * from public.inspection_requests x
               where x.project_id = r.project_id and x.permit_id is null and x.deleted_at is null
                 and x.status <> 'withdrawn' and public.ir_may_see(x.project_id, x.requested_by, x.kind, x.ofs_sent_at)
               order by x.request_date desc, x.number desc limit 50) q
        left join public.ir_special_kinds k on k.id = q.special_kind_id), '[]'::jsonb) else '[]'::jsonb end);
end;
$$;
