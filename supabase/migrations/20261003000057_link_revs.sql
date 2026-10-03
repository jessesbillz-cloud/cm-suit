-- 0057 Revs from the request link with no login (Jesse, Oct 3: "we shouldn't have login be the barrier to entry because I
-- want the subs in the field to be able to do this"). A sub on an OFS job opens the job's QR / link and makes the same
-- OFS request a member makes from Revs: picks walls and up to 3 items, draws the IR map on the sheet and gets the map.
-- The public request-link function runs everything here with the service key after its rate limits, like 0055's
-- link_request_* functions: the job's link token opens the walls and the request, the request's private receipt (only
-- its sha256 kept, ir_link_receipts) opens that request's map, and nothing else.
--   * link_request_revs: the job's lists, revs, items and walls, and each wall x item's status only: open, requested,
--     passed or N/A. A failed cell shows as open (to be asked again); never an IR number, a note or a name.
--   * link_request_submit_ofs: the revs request from the link: 0055's rules (the visitor's contact, the notice, the day,
--     the 10-minute repeat by name, the receipt, the board lines with the visitor's name) and ir_submit_ofs' (1 to 3 items
--     on walls of one list, passed and N/A cells skipped, colors by item order, the OFS IR number, the map row). The sheet,
--     when given, is one of the picked walls' sheets. 0055's link_request_submit and this one share one body
--     (link_request_make); ir_submit_ofs and this one share the cells and the map (ir_ofs_make).
--   * By the receipt: link_request_map (the visitor's map: title parts, legend, sheet, strokes, whether they may draw,
--     the request's walls' sheets; never the signer), link_request_map_save (ir_map_save's rules through one shared
--     body, ir_map_write; the visitor draws until there is a result; a sheet only from the request's walls),
--     link_request_map_facts (what the function needs to make the map PDF; never sent to the visitor) and
--     link_request_map_file (the map's sheet or its PDF: the scan rules, a download line and an audit line).
--   * Shared bodies, behavior unchanged: rev_status_rows (rev_status without the caller check), ir_map_facts
--     (ir_map_context's facts), ir_map_write (ir_map_save's rules), link_request_receipt (link_request_status' lookup).
--   * ONE schema change is not an add: a cell of a link request has no member behind it, so ir_rev_items.created_by may be
--     empty (as 0055 did for inspection_requests.requested_by; Postgres has no other way to let a column hold null).
--     Nothing is deleted by it.

alter table public.ir_rev_items alter column created_by drop not null;

-- =====================================================================================================================
-- Shared bodies (internal; not user-callable)
-- =====================================================================================================================
-- The OFS request's "what to inspect" from the cells still open (ir_ofs_cells): "Already passed." when none is left.
create or replace function public.ir_ofs_open_text(p_project_id uuid, p_area_ids uuid[], p_item_ids uuid[])
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare v_areas uuid[]; v_items uuid[];
begin
  select array_agg(distinct c.area_id), array_agg(distinct c.item_id) into v_areas, v_items
    from public.ir_ofs_cells(p_project_id, p_area_ids, p_item_ids) c;
  if v_areas is null then raise exception 'Already passed.' using errcode = '22023'; end if;
  return public.ir_ofs_items_text(v_areas, v_items);
end;
$$;

-- A new OFS request's cells (each open wall x item, its color by item order) and its map, on the given sheet or else
-- the first wall's (none: picked when the map is drawn). Made by the caller: auth.uid(), none for a link visitor.
create or replace function public.ir_ofs_make(p_request public.inspection_requests, p_area_ids uuid[], p_item_ids uuid[],
                                              p_sheet_file_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.ir_rev_items (org_id, project_id, created_by, request_id, area_id, item_id, color)
  select p_request.org_id, p_request.project_id, auth.uid(), p_request.id, c.area_id, c.item_id, c.color
    from public.ir_ofs_cells(p_request.project_id, p_area_ids, p_item_ids) c;
  insert into public.ir_maps (request_id, org_id, project_id, sheet_file_id, updated_by)
  values (p_request.id, p_request.org_id, p_request.project_id,
          coalesce(p_sheet_file_id,
            (select a.sheet_file_id from public.rev_areas a join public.files f on f.id = a.sheet_file_id and f.deleted_at is null
              where a.id in (select c.area_id from public.ir_rev_items c where c.request_id = p_request.id)
              order by btrim(a.level), a.position, a.name, a.id limit 1)),
          auth.uid());
end;
$$;

-- A sheet of one of these walls: the walls' own plan sheet (set by whoever manages Revs), a live PDF of the job, not
-- infected. The link visitor's sheets: they never browse the job's files.
create or replace function public.rev_walls_sheet_ok(p_project_id uuid, p_area_ids uuid[], p_file_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (select 1 from public.rev_areas a
                   join public.files f on f.id = a.sheet_file_id
                  where a.id = any (p_area_ids) and a.project_id = p_project_id and a.sheet_file_id = p_file_id
                    and f.project_id = p_project_id and f.deleted_at is null and f.mime = 'application/pdf'
                    and f.scan_status <> 'infected');
$$;

-- rev_status' rows (0056) without the caller check: na > passed > requested > failed > open, one per wall x item.
create or replace function public.rev_status_rows(p_project_id uuid)
returns table (area_id uuid, item_id uuid, status text, request_id uuid, ir_number int, ofs_number int, at timestamptz, note text)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
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
       where c.project_id = p_project_id
    ),
    passed as (
      select distinct on (aid, iid) * from live where result = 'passed' order by aid, iid, result_at desc, number desc
    ),
    asked as (
      select distinct on (aid, iid) * from live where result is null order by aid, iid, created_at desc, number desc
    ),
    last_result as (
      select distinct on (aid, iid) * from live where result is not null order by aid, iid, result_at desc, number desc
    )
    select c.aid, c.iid,
           case when m.id is not null then 'na' when p.rid is not null then 'passed' when q.rid is not null then 'requested'
                when f.result = 'failed' then 'failed' else 'open' end,
           case when m.id is not null then null when p.rid is not null then p.rid when q.rid is not null then q.rid
                when f.result = 'failed' then f.rid end,
           case when m.id is not null then null when p.rid is not null then p.number when q.rid is not null then q.number
                when f.result = 'failed' then f.number end,
           case when m.id is not null then null when p.rid is not null then p.ofs when q.rid is not null then q.ofs
                when f.result = 'failed' then f.ofs end,
           case when m.id is not null then m.updated_at when p.rid is not null then p.result_at when q.rid is not null then q.asked
                when f.result = 'failed' then f.result_at end,
           case when m.id is not null then null when p.rid is not null then p.result_note when q.rid is not null then null
                when f.result = 'failed' then f.result_note end
      from cells c
      left join public.rev_marks m on m.area_id = c.aid and m.item_id = c.iid and m.deleted_at is null
      left join passed p on p.aid = c.aid and p.iid = c.iid
      left join asked q on q.aid = c.aid and q.iid = c.iid
      left join last_result f on f.aid = c.aid and f.iid = c.iid
     order by c.lpos, c.lvl, c.apos, c.aname, c.aid, c.vnum, c.ipos, c.iname, c.iid;
end;
$$;

-- What the map shows and the ir-map PDF draws (0056's ir_map_context without the caller check and can_edit). Null when
-- the request has no map.
create or replace function public.ir_map_facts(p_request_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'request_id', q.id,
    'project_id', q.project_id,
    'number', q.number,
    'ofs_number', q.ofs_number,
    'phase', (select l.phase from public.ir_rev_items c join public.rev_areas a on a.id = c.area_id
                join public.rev_lists l on l.id = a.list_id where c.request_id = q.id limit 1),
    'request_date', q.request_date,
    'what', public.ir_map_what(q.id),
    'sheet_file_id', m.sheet_file_id,
    'page', m.page,
    'strokes', m.strokes,
    'legend', coalesce((select jsonb_agg(jsonb_build_object('color', x.color, 'name', x.name) order by x.color)
                          from (select distinct c.color, btrim(i.name) as name
                                  from public.ir_rev_items c join public.rev_items i on i.id = c.item_id
                                 where c.request_id = q.id) x), '[]'::jsonb),
    'result', q.result,
    'signed_at', q.signed_at,
    'signer_name', case when q.signed_by is not null then public.rfi_person_name(q.signed_by) end,
    'version', m.version,
    'map_file_id', m.map_file_id,
    'stale', m.stale)
    from public.inspection_requests q
    join public.ir_maps m on m.request_id = q.id
   where q.id = p_request_id;
$$;

-- ir_map_save's rules (0056), for a member and for a link visitor, after each one's own "may I draw" check: never on a
-- signed or withdrawn IR; the version check; strokes of the right shape in the request's colors; a sheet before any mark;
-- null sheet / page = keep. A new sheet is one the member may read, or for a visitor one of the request's walls' sheets.
-- Saved by auth.uid() (none for a visitor).
create or replace function public.ir_map_write(p_request public.inspection_requests, p_map public.ir_maps, p_version int,
                                               p_strokes jsonb, p_sheet_file_id uuid, p_page int, p_visitor boolean)
returns public.ir_maps
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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
                    array(select c.area_id from public.ir_rev_items c where c.request_id = p_request.id), p_sheet_file_id) then
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
$$;

-- The request a status receipt opens (0055: only its sha256 kept), on its own job, both live. Null otherwise. A new
-- request link or QR sheet does not end it.
create or replace function public.link_request_receipt(p_project_id uuid, p_receipt_hash text)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select x.id
    from public.ir_link_receipts k
    join public.inspection_requests x on x.id = k.request_id
    join public.projects p on p.id = x.project_id and p.deleted_at is null
   where k.token_hash = p_receipt_hash and x.project_id = p_project_id and x.deleted_at is null;
$$;

-- May the link visitor still draw their request's map? Until the inspector records a result (ir_map_editor's rule for
-- a requester). The signed and withdrawn refusals come from ir_map_write.
create or replace function public.link_request_map_editor(p_request_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((select q.requested_by is null and q.result is null
                          and not exists (select 1 from public.ir_rev_items c where c.request_id = q.id and c.result is not null)
                     from public.inspection_requests q where q.id = p_request_id and q.deleted_at is null), false);
$$;

-- The sheets a visitor may switch the map to: each of the request's walls' sheets, labelled by the walls' levels.
create or replace function public.link_request_map_sheets(p_request_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(jsonb_build_object('file_id', s.sheet_file_id, 'label', s.label) order by s.label, s.sheet_file_id),
                  '[]'::jsonb)
    from (select a.sheet_file_id, string_agg(distinct btrim(a.level), ', ' order by btrim(a.level)) as label
            from public.ir_rev_items c
            join public.rev_areas a on a.id = c.area_id
            join public.files f on f.id = a.sheet_file_id and f.project_id = a.project_id and f.deleted_at is null
                               and f.mime = 'application/pdf' and f.scan_status <> 'infected'
           where c.request_id = p_request_id
           group by a.sheet_file_id) s;
$$;

-- The visitor's map: ir_map_facts without the ids, the signer and the PDF's file, plus signed / has_map, whether they
-- may draw now and the sheets they may pick. Null when the request has no map.
create or replace function public.link_request_map_view(p_request_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select (x.f - '{request_id,project_id,signed_at,signer_name,map_file_id}'::text[])
         || jsonb_build_object(
              'signed', (x.f ->> 'signed_at') is not null,
              'has_map', (x.f ->> 'map_file_id') is not null,
              'can_edit', (x.f ->> 'signed_at') is null
                          and (select q.status <> 'withdrawn' from public.inspection_requests q where q.id = p_request_id)
                          and public.link_request_map_editor(p_request_id),
              'sheets', public.link_request_map_sheets(p_request_id))
    from (select public.ir_map_facts(p_request_id) as f) x
   where x.f is not null;
$$;

-- =====================================================================================================================
-- The member functions on the shared bodies (behavior unchanged)
-- =====================================================================================================================
create or replace function public.rev_status(p_project_id uuid)
returns table (area_id uuid, item_id uuid, status text, request_id uuid, ir_number int, ofs_number int, at timestamptz, note text)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
begin
  perform public.rev_need(p_project_id, 'revs.read');
  return query select s.* from public.rev_status_rows(p_project_id) s;
end;
$$;

-- 0056's revs request: the cells and the map through ir_ofs_make, the open cells' text through ir_ofs_open_text.
create or replace function public.ir_submit_ofs(
  p_project_id uuid,
  p_company text,
  p_request_date date,
  p_notice_ack boolean,
  p_area_ids uuid[],
  p_item_ids uuid[],
  p_sheet_file_id uuid default null,
  p_start_time time default null,
  p_duration_kind text default 'timed',
  p_duration_min int default null,
  p_attachment_ids uuid[] default '{}'
)
returns public.inspection_requests
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_company text := btrim(coalesce(p_company, ''));
  v_duration text := coalesce(p_duration_kind, 'timed');
  v_text text;
  p public.projects;
  r public.inspection_requests;
  fid uuid;
begin
  if v_uid is null or not public.has_capability(p_project_id, 'ir.request') or not public.has_capability(p_project_id, 'revs.read') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into p from public.projects where id = p_project_id and deleted_at is null;
  if p.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not public.ir_setting(p.id, 'ir_ofs_allowed') then raise exception 'OFS is off for this job.' using errcode = '22023'; end if;
  if p_notice_ack is not true then raise exception 'Check the notice box first.' using errcode = '22023'; end if;
  if length(v_company) not between 1 and 200 then raise exception 'Pick the company.' using errcode = '22023'; end if;
  if p_request_date is null or p_request_date < (now() at time zone p.timezone)::date then
    raise exception 'Pick today or a later day.' using errcode = '22023';
  end if;
  if p_start_time is not null and (extract(second from p_start_time) <> 0 or extract(minute from p_start_time) not in (0, 30)) then
    raise exception 'Pick a time on the half hour.' using errcode = '22023';
  end if;
  if v_duration not in ('timed', 'all_day', 'periodic')
     or (v_duration = 'timed' and (p_duration_min is null or p_duration_min not between 5 and 720)) then
    raise exception 'Pick how long it takes.' using errcode = '22023';
  end if;
  foreach fid in array coalesce(p_attachment_ids, '{}'::uuid[]) loop
    if not exists (select 1 from public.files f where f.id = fid and f.project_id = p.id
                   and f.created_by = v_uid and f.deleted_at is null and f.folder_id = public.ir_attach_folder_id(p.id)) then
      raise exception 'An attachment is missing. Add it again.' using errcode = '22023';
    end if;
  end loop;
  perform public.ir_ofs_list(p.id, p_area_ids, p_item_ids);
  perform public.rev_sheet_check(p.id, p_sheet_file_id);

  perform pg_advisory_xact_lock(hashtext('ir_submit:' || v_uid::text || ':' || p.id::text));
  v_text := public.ir_ofs_open_text(p.id, p_area_ids, p_item_ids);

  -- The same request again within 10 minutes is the first one (ir_submit's rule).
  select * into r from public.inspection_requests x
   where x.project_id = p.id and x.requested_by = v_uid and x.request_date = p_request_date
     and x.start_time is not distinct from p_start_time and x.kind = 'ofs' and x.items = v_text
     and x.status <> 'withdrawn' and x.created_at > now() - interval '10 minutes'
   order by x.created_at desc limit 1;
  if r.id is not null then return r; end if;

  perform set_config('app.ir_action', 'submit', true);
  insert into public.inspection_requests (
    org_id, project_id, number, requested_by, created_by, company, request_date, start_time, duration_kind, duration_min,
    kind, items, attachment_ids, notice_ack_at, status)
  values (
    p.org_id, p.id, public.next_number(p.id, 'ir'), v_uid, v_uid, v_company, p_request_date, p_start_time, v_duration,
    case when v_duration = 'timed' then p_duration_min end, 'ofs', v_text, coalesce(p_attachment_ids, '{}'::uuid[]), now(),
    public.ir_first_status(p.id))
  returning * into r;

  perform public.ir_ofs_make(r, p_area_ids, p_item_ids, p_sheet_file_id);

  if r.status = 'gc_review' then
    perform public.post_activity(p.id, 'ir.gc_review',
      left('IR ' || r.number || ' (OFS ' || r.ofs_number || ') to review · ' || r.company || ' · '
           || public.ir_when_label(r.request_date, r.start_time), 500),
      'inspection_request', r.id, 'ir.gc_approve');
  else
    perform public.post_activity(p.id, 'ir.requested',
      left('IR ' || r.number || ' (OFS ' || r.ofs_number || ') requested · ' || r.company || ' · '
           || public.ir_when_label(r.request_date, r.start_time), 500),
      'inspection_request', r.id, 'ir.view_all');
  end if;
  return r;
end;
$$;

-- 0056's map context: the caller check, then the shared facts and whether I may draw now.
create or replace function public.ir_map_context(p_request_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare q public.inspection_requests; v jsonb;
begin
  select * into q from public.inspection_requests where id = p_request_id and deleted_at is null;
  if q.id is null or not public.ir_may_see(q.project_id, q.requested_by) then raise exception 'not_found' using errcode = 'P0002'; end if;
  v := public.ir_map_facts(q.id);
  if v is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  return v || jsonb_build_object('can_edit', q.signed_at is null and q.status <> 'withdrawn' and public.ir_map_editor(q.id));
end;
$$;

-- 0056's map save: the caller check and the requester-or-inspector rule, then the shared rules.
create or replace function public.ir_map_save(p_request_id uuid, p_version int, p_strokes jsonb, p_sheet_file_id uuid default null,
                                              p_page int default null)
returns public.ir_maps
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare q public.inspection_requests; m public.ir_maps;
begin
  select * into q from public.inspection_requests where id = p_request_id and deleted_at is null for update;
  if q.id is null or not public.ir_may_see(q.project_id, q.requested_by) then raise exception 'not_found' using errcode = 'P0002'; end if;
  select * into m from public.ir_maps where request_id = q.id for update;
  if m.request_id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not public.ir_map_editor(q.id) then raise exception 'forbidden' using errcode = '42501'; end if;
  return public.ir_map_write(q, m, p_version, p_strokes, p_sheet_file_id, p_page, false);
end;
$$;

-- =====================================================================================================================
-- The link's request: one body for 0055's request and the revs request
-- =====================================================================================================================
-- 0055's link_request_submit body, plus the walls path (p_area_ids / p_item_ids given): an OFS request whose "what" the
-- database composes from the cells still open, with its cells and map (ir_ofs_make), its sheet one of the picked walls'.
create or replace function public.link_request_make(
  p_project_id uuid, p_token_hash text, p_hub_id uuid, p_name text, p_company text, p_phone text, p_email text,
  p_request_date date, p_kind text, p_items text, p_notice_ack boolean, p_start_time time, p_duration_kind text,
  p_duration_min int, p_special_kind_id uuid, p_attachment_ids uuid[], p_area_ids uuid[], p_item_ids uuid[],
  p_sheet_file_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  pr public.projects;
  v_walls boolean := p_area_ids is not null or p_item_ids is not null;
  v_name text := public.delivery_clean(p_name, 120);
  v_company text := public.delivery_clean(p_company, 120);
  v_phone text := nullif(public.delivery_clean(p_phone, 30), '');
  v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_items text := btrim(coalesce(p_items, ''));
  v_duration text := coalesce(p_duration_kind, 'timed');
  v_files uuid[] := coalesce(p_attachment_ids, '{}'::uuid[]);
  v_today date;
  v_token text;
  v_who text;
  v_ir text;
  r public.inspection_requests;
  fid uuid;
begin
  if not public.is_service_role() then raise exception 'forbidden' using errcode = '42501'; end if;
  pr := public.request_link_job(p_project_id, p_token_hash, p_hub_id);
  if pr.id is null then return null; end if;

  if p_notice_ack is not true then raise exception 'Check the notice box first.' using errcode = '22023'; end if;
  if v_name = '' then raise exception 'Enter your name.' using errcode = '22023'; end if;
  if v_company = '' then raise exception 'Enter your company.' using errcode = '22023'; end if;
  if v_phone is null and v_email is null then raise exception 'Add a phone or an email.' using errcode = '22023'; end if;
  if v_phone is not null and (v_phone !~ '^\+?[0-9 ().-]{7,30}$' or length(regexp_replace(v_phone, '\D', '', 'g')) not between 7 and 15) then
    raise exception 'Check the phone number.' using errcode = '22023';
  end if;
  if v_email is not null and (length(v_email) > 320 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') then
    raise exception 'Check the email.' using errcode = '22023';
  end if;
  if not v_walls and length(v_items) not between 1 and 4000 then raise exception 'Add what to inspect.' using errcode = '22023'; end if;
  v_today := (now() at time zone pr.timezone)::date;
  if p_request_date is null or p_request_date < v_today or p_request_date > v_today + 365 then
    raise exception 'Pick today or a later day.' using errcode = '22023';
  end if;
  if p_start_time is not null and (extract(second from p_start_time) <> 0 or extract(minute from p_start_time) not in (0, 30)) then
    raise exception 'Pick a time on the half hour.' using errcode = '22023';
  end if;
  if v_duration not in ('timed', 'all_day', 'periodic')
     or (v_duration = 'timed' and (p_duration_min is null or p_duration_min not between 5 and 720)) then
    raise exception 'Pick how long it takes.' using errcode = '22023';
  end if;
  if p_kind is null or p_kind not in ('ior', 'special', 'ofs') or (v_walls and p_kind <> 'ofs') then
    raise exception 'Pick the type.' using errcode = '22023';
  end if;
  if p_kind = 'ofs' and not public.ir_setting(pr.id, 'ir_ofs_allowed') then
    raise exception 'OFS is off for this job.' using errcode = '22023';
  end if;
  if p_kind = 'special' and not exists (select 1 from public.ir_special_kinds where id = p_special_kind_id and active) then
    raise exception 'Pick the special inspection.' using errcode = '22023';
  end if;
  if cardinality(v_files) > 3 or cardinality(v_files) <> (select count(distinct x) from unnest(v_files) x) then
    raise exception 'Up to 3 photos or PDFs.' using errcode = '22023';
  end if;
  if v_walls then
    perform public.ir_ofs_list(pr.id, p_area_ids, p_item_ids);
    if p_sheet_file_id is not null and not public.rev_walls_sheet_ok(pr.id, p_area_ids, p_sheet_file_id) then
      raise exception 'Pick a sheet of these walls.' using errcode = '22023';
    end if;
  end if;

  -- One visitor at a time per name and job, so the repeat check and the insert agree.
  perform pg_advisory_xact_lock(hashtext('link_request_submit:' || pr.id::text || ':' || lower(v_name)));
  if v_walls then v_items := public.ir_ofs_open_text(pr.id, p_area_ids, p_item_ids); end if;
  select * into r from public.inspection_requests x
   where x.project_id = pr.id and x.requested_by is null and lower(x.requester_name) = lower(v_name)
     and x.company = v_company and x.request_date = p_request_date and x.start_time is not distinct from p_start_time
     and x.kind = p_kind and x.items = v_items and x.status <> 'withdrawn' and x.created_at > now() - interval '10 minutes'
   order by x.created_at desc limit 1;

  if r.id is null then
    -- Files the link registered for this job (no uploader), stored, not on any request yet.
    foreach fid in array v_files loop
      if not exists (select 1 from public.files f
                      where f.id = fid and f.project_id = pr.id and f.created_by is null and f.deleted_at is null
                        and not f.upload_complete and f.created_at > now() - interval '1 hour'
                        and f.folder_id = public.ir_attach_folder_id(pr.id)
                        and exists (select 1 from storage.objects o where o.bucket_id = 'files' and o.name = f.storage_path))
         or exists (select 1 from public.inspection_requests x where fid = any (x.attachment_ids)) then
        raise exception 'An attachment is missing. Add it again.' using errcode = '22023';
      end if;
    end loop;

    perform set_config('app.ir_action', 'submit', true);
    insert into public.inspection_requests (
      org_id, project_id, number, requested_by, created_by, company, requester_name, requester_phone, requester_email,
      request_date, start_time, duration_kind, duration_min, kind, special_kind_id, items, attachment_ids, notice_ack_at, status)
    values (
      pr.org_id, pr.id, public.next_number(pr.id, 'ir'), null, null, v_company, v_name, v_phone, v_email,
      p_request_date, p_start_time, v_duration, case when v_duration = 'timed' then p_duration_min end, p_kind,
      case when p_kind = 'special' then p_special_kind_id end, v_items, v_files, now(), public.ir_first_status(pr.id))
    returning * into r;
    if v_walls then perform public.ir_ofs_make(r, p_area_ids, p_item_ids, p_sheet_file_id); end if;

    -- The files are finished: usable as any finished upload is (the skip-scan switch), and queued for the scan.
    update public.files set upload_complete = true where id = any (v_files);
    foreach fid in array v_files loop
      perform public.enqueue_job('scan_file', jsonb_build_object('file_id', fid), pr.id, 'scan_file:' || fid::text);
    end loop;

    v_who := v_name || ' (' || v_company || ')';
    v_ir := 'IR ' || r.number || case when v_walls then ' (OFS ' || r.ofs_number || ')' else '' end;
    if r.status = 'gc_review' then
      perform public.post_activity(pr.id, 'ir.gc_review',
        left(v_ir || ' to review · ' || v_who || ' · ' || public.ir_when_label(r.request_date, r.start_time), 500),
        'inspection_request', r.id, 'ir.gc_approve');
    else
      perform public.post_activity(pr.id, 'ir.requested',
        left(v_ir || ' requested · ' || v_who || ' · ' || public.ir_when_label(r.request_date, r.start_time), 500),
        'inspection_request', r.id, 'ir.view_all');
    end if;
    perform public.audit('request_link.submit', 'inspection_request', r.id, pr.id, pr.org_id,
      jsonb_build_object('via', case when p_hub_id is null then 'link' else 'hub' end, 'number', r.number,
                         'name', v_name, 'company', v_company, 'files', cardinality(v_files))
      || case when v_walls
              then jsonb_build_object('ofs_number', r.ofs_number,
                                      'cells', (select count(*) from public.ir_rev_items c where c.request_id = r.id))
              else '{}'::jsonb end,
      null, 'public_link');
  else
    -- A repeat: the same request answers. Files sent again with it are not needed.
    update public.files set deleted_at = now()
     where id = any (v_files) and created_by is null and project_id = pr.id and not (id = any (r.attachment_ids));
  end if;

  v_token := public.request_link_token();
  insert into public.ir_link_receipts (token_hash, request_id) values (encode(extensions.digest(v_token, 'sha256'), 'hex'), r.id);
  return public.link_request_answer(r.id) || jsonb_build_object('receipt', v_token);
end;
$$;

-- 0055's request from the link, unchanged: the shared body without walls.
create or replace function public.link_request_submit(
  p_project_id uuid,
  p_token_hash text,
  p_hub_id uuid,
  p_name text,
  p_company text,
  p_phone text,
  p_email text,
  p_request_date date,
  p_kind text,
  p_items text,
  p_notice_ack boolean,
  p_start_time time default null,
  p_duration_kind text default 'timed',
  p_duration_min int default null,
  p_special_kind_id uuid default null,
  p_attachment_ids uuid[] default '{}'
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_service_role() then raise exception 'forbidden' using errcode = '42501'; end if;
  return public.link_request_make(p_project_id, p_token_hash, p_hub_id, p_name, p_company, p_phone, p_email, p_request_date,
    p_kind, p_items, p_notice_ack, p_start_time, p_duration_kind, p_duration_min, p_special_kind_id, p_attachment_ids,
    null, null, null);
end;
$$;

-- The revs request from the link: the visitor's contact and the walls and items (1 to 3, one list); an OFS request.
create or replace function public.link_request_submit_ofs(
  p_project_id uuid,
  p_token_hash text,
  p_hub_id uuid,
  p_name text,
  p_company text,
  p_phone text,
  p_email text,
  p_request_date date,
  p_notice_ack boolean,
  p_area_ids uuid[],
  p_item_ids uuid[],
  p_sheet_file_id uuid default null,
  p_start_time time default null,
  p_duration_kind text default 'timed',
  p_duration_min int default null,
  p_attachment_ids uuid[] default '{}'
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_service_role() then raise exception 'forbidden' using errcode = '42501'; end if;
  return public.link_request_make(p_project_id, p_token_hash, p_hub_id, p_name, p_company, p_phone, p_email, p_request_date,
    'ofs', null, p_notice_ack, p_start_time, p_duration_kind, p_duration_min, null, p_attachment_ids,
    coalesce(p_area_ids, '{}'::uuid[]), coalesce(p_item_ids, '{}'::uuid[]), p_sheet_file_id);
end;
$$;

-- 0055's status link through the one receipt lookup (unchanged).
create or replace function public.link_request_status(p_project_id uuid, p_receipt_hash text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare v_id uuid;
begin
  if not public.is_service_role() then raise exception 'forbidden' using errcode = '42501'; end if;
  v_id := public.link_request_receipt(p_project_id, p_receipt_hash);
  if v_id is null then return null; end if;
  return public.link_request_answer(v_id);
end;
$$;

-- =====================================================================================================================
-- The link's walls, and a request's map by its receipt (service role only; null when the credential opens nothing)
-- =====================================================================================================================
-- The job's lists, revs, items and walls (live, in order), and each wall x item's status only: open, requested, passed
-- or N/A; failed shows as open. Never an IR number, a note, a date or a name. Empty on a job without OFS.
create or replace function public.link_request_revs(p_project_id uuid, p_token_hash text, p_hub_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare pr public.projects;
begin
  if not public.is_service_role() then raise exception 'forbidden' using errcode = '42501'; end if;
  pr := public.request_link_job(p_project_id, p_token_hash, p_hub_id);
  if pr.id is null then return null; end if;
  if not public.ir_setting(pr.id, 'ir_ofs_allowed') then
    return jsonb_build_object('lists', '[]'::jsonb, 'revs', '[]'::jsonb, 'items', '[]'::jsonb, 'areas', '[]'::jsonb,
                              'status', '[]'::jsonb);
  end if;
  return jsonb_build_object(
    'lists', coalesce((
      select jsonb_agg(jsonb_build_object('id', l.id, 'name', l.name, 'phase', l.phase, 'position', l.position)
                       order by l.position, l.name, l.id)
        from public.rev_lists l where l.project_id = pr.id and l.deleted_at is null), '[]'::jsonb),
    'revs', coalesce((
      select jsonb_agg(jsonb_build_object('id', v.id, 'list_id', v.list_id, 'number', v.number, 'name', v.name)
                       order by l.position, v.number, v.id)
        from public.revs v join public.rev_lists l on l.id = v.list_id and l.deleted_at is null
       where v.project_id = pr.id and v.deleted_at is null), '[]'::jsonb),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object('id', i.id, 'rev_id', i.rev_id, 'name', i.name, 'company', i.company,
                                          'position', i.position)
                       order by l.position, v.number, i.position, i.name, i.id)
        from public.rev_items i
        join public.revs v on v.id = i.rev_id and v.deleted_at is null
        join public.rev_lists l on l.id = v.list_id and l.deleted_at is null
       where i.project_id = pr.id and i.deleted_at is null), '[]'::jsonb),
    'areas', coalesce((
      select jsonb_agg(jsonb_build_object('id', a.id, 'list_id', a.list_id, 'level', a.level, 'name', a.name,
                                          'sheet_file_id', a.sheet_file_id, 'position', a.position)
                       order by l.position, a.position, a.name, a.id)
        from public.rev_areas a join public.rev_lists l on l.id = a.list_id and l.deleted_at is null
       where a.project_id = pr.id and a.deleted_at is null), '[]'::jsonb),
    'status', coalesce((
      select jsonb_agg(jsonb_build_object('area_id', s.area_id, 'item_id', s.item_id,
                                          'status', case when s.status = 'failed' then 'open' else s.status end)
                       order by s.n)
        from public.rev_status_rows(pr.id) with ordinality as s (area_id, item_id, status, request_id, ir_number, ofs_number,
                                                                 at, note, n)), '[]'::jsonb));
end;
$$;

-- The visitor's own map: {map: null} for a request with no map (not a revs request).
create or replace function public.link_request_map(p_project_id uuid, p_receipt_hash text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare v_id uuid;
begin
  if not public.is_service_role() then raise exception 'forbidden' using errcode = '42501'; end if;
  v_id := public.link_request_receipt(p_project_id, p_receipt_hash);
  if v_id is null then return null; end if;
  return jsonb_build_object('map', public.link_request_map_view(v_id));
end;
$$;

-- The visitor draws their request's map (ir_map_save's rules, ir_map_write) until the inspector records a result.
-- Answers the map as link_request_map shows it.
create or replace function public.link_request_map_save(p_project_id uuid, p_receipt_hash text, p_version int, p_strokes jsonb,
                                                        p_sheet_file_id uuid default null, p_page int default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_id uuid; q public.inspection_requests; m public.ir_maps;
begin
  if not public.is_service_role() then raise exception 'forbidden' using errcode = '42501'; end if;
  v_id := public.link_request_receipt(p_project_id, p_receipt_hash);
  if v_id is null then return null; end if;
  select * into q from public.inspection_requests where id = v_id for update;
  select * into m from public.ir_maps where request_id = q.id for update;
  if m.request_id is null then raise exception 'This request has no map.' using errcode = '22023'; end if;
  if not public.link_request_map_editor(q.id) then raise exception 'The map is final.' using errcode = '42501'; end if;
  perform public.ir_map_write(q, m, p_version, p_strokes, p_sheet_file_id, p_page, true);
  return jsonb_build_object('map', public.link_request_map_view(q.id));
end;
$$;

-- What the request-link function needs to make the visitor's map PDF (ir_map_facts: the signer's name for the stamp of
-- a passed, signed IR, the map on file). Never sent to the visitor.
create or replace function public.link_request_map_facts(p_project_id uuid, p_receipt_hash text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare v_id uuid; v jsonb;
begin
  if not public.is_service_role() then raise exception 'forbidden' using errcode = '42501'; end if;
  v_id := public.link_request_receipt(p_project_id, p_receipt_hash);
  if v_id is null then return null; end if;
  v := public.ir_map_facts(v_id);
  if v is null then raise exception 'This request has no map.' using errcode = '22023'; end if;
  return v;
end;
$$;

-- The map's sheet or its PDF for the visitor (p_which 'sheet' | 'map'): that file only, live, on the job, not infected,
-- scanned; a download line (no member; the visitor's address) and an audit line, like authorize_ir_file.
create or replace function public.link_request_map_file(p_project_id uuid, p_receipt_hash text, p_which text, p_ip text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_id uuid; m public.ir_maps; f public.files;
begin
  if not public.is_service_role() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_which is null or p_which not in ('sheet', 'map') then raise exception 'Unknown file.' using errcode = '22023'; end if;
  v_id := public.link_request_receipt(p_project_id, p_receipt_hash);
  if v_id is null then return null; end if;
  select * into m from public.ir_maps where request_id = v_id;
  if m.request_id is null then raise exception 'This request has no map.' using errcode = '22023'; end if;
  select * into f from public.files
   where id = case when p_which = 'sheet' then m.sheet_file_id else m.map_file_id end
     and project_id = m.project_id and deleted_at is null;
  if f.id is null then
    raise exception '%', case when p_which = 'sheet' then 'Pick the sheet first.' else 'Make the map first.' end using errcode = '22023';
  end if;
  if f.scan_status = 'infected' then raise exception 'This file is blocked.' using errcode = '42501'; end if;
  if f.scan_status = 'pending' then
    raise exception 'The sheet is still being scanned. Try again in a minute.' using errcode = '22023';
  end if;
  insert into public.downloads (file_id, project_id, user_id, ip, variant)
  values (f.id, f.project_id, null, nullif(btrim(coalesce(p_ip, '')), '')::inet, 'original');
  perform public.audit('download', 'file', f.id, f.project_id, f.org_id,
    jsonb_build_object('variant', 'original', 'name', f.original_name, 'request_id', v_id, 'via', 'link', 'what', p_which),
    f.sha256, 'public_link');
  return jsonb_build_object('storage_path', f.storage_path, 'original_name', f.original_name, 'mime', f.mime);
end;
$$;

-- =====================================================================================================================
-- Grants (SPEC §6.2): the link functions are service-role only; the shared bodies are internal.
-- =====================================================================================================================
do $$
declare f text;
begin
  foreach f in array array[
    'public.link_request_revs(uuid, text, uuid)',
    'public.link_request_submit_ofs(uuid, text, uuid, text, text, text, text, date, boolean, uuid[], uuid[], uuid, time without time zone, text, integer, uuid[])',
    'public.link_request_map(uuid, text)',
    'public.link_request_map_save(uuid, text, integer, jsonb, uuid, integer)',
    'public.link_request_map_facts(uuid, text)',
    'public.link_request_map_file(uuid, text, text, text)']
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
  foreach f in array array[
    'public.ir_ofs_open_text(uuid, uuid[], uuid[])',
    'public.ir_ofs_make(public.inspection_requests, uuid[], uuid[], uuid)',
    'public.rev_walls_sheet_ok(uuid, uuid[], uuid)',
    'public.rev_status_rows(uuid)',
    'public.ir_map_facts(uuid)',
    'public.ir_map_write(public.inspection_requests, public.ir_maps, integer, jsonb, uuid, integer, boolean)',
    'public.link_request_receipt(uuid, text)',
    'public.link_request_map_editor(uuid)',
    'public.link_request_map_sheets(uuid)',
    'public.link_request_map_view(uuid)',
    'public.link_request_make(uuid, text, uuid, text, text, text, text, date, text, text, boolean, time without time zone, text, integer, uuid, uuid[], uuid[], uuid[], uuid)']
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
  end loop;
end $$;
