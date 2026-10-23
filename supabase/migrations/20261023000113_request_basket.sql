-- 0113 Walk the job and tap what is ready (Jesse, Oct 23: "they just walk up to the wall, look at it and say OK, I want
-- to get the top of wall inspected on this one - click the button - and that gets added to the inspection request ...
-- and there should be a way to do top of wall for the entire room").
--   1. The request being built ("the basket"): whoever files OFS requests on the job (ir.request with revs.read, the
--      rule ir_submit_ofs already has) has one per job, kept on the server, so it follows him from the phone to the iPad.
--      rev_baskets (one per person and job, version-checked) and rev_basket_cells (one wall x item each, never deleted:
--      taken out or sent). Add and Take out are set changes by wall x item, safe to repeat. Add skips a cell already
--      asked for, passed, not applicable or already in. Add for the whole room is the same call with the room.
--      Read by its owner and by the job's OFS duty holder of the same company (RLS), written only through the calls.
--   2. Send (rev_basket_send, the version the person reviewed): one OFS request per item and plan sheet page (one OFS
--      number, one map each, as the job files them: MDR IR 404 was OFS 0096 to 0104 together), through ir_submit_ofs,
--      so every rule of a single request holds (the statements, the day, the special question, the GC step). The OFS
--      numbers are the database's next ones in order, and whoever sends OFS requests may type them (0091). The requests
--      are one batch: the cells keep the batch and the request each went on (sent_request_id), and ir_batches answers it to the schedule
--      and the start page ("Batch of 9"). The same Send again answers the same batch.
--   3. A wall added on the spot (Jesse, Oct 23: "I'm standing at this wall and you guys don't have it laid out for me"):
--      rev_field_wall_add, for the same people, adds a room (or uses one) and a wall of it (North, South, East, West or
--      a short name) to the card's list, with its tag and rating when known. A tag another wall of the job has brings
--      its rating, UL design and sheet number. It is usable at once. Added by someone who does not manage the cards,
--      it is marked (field_by) and each manager gets a Needs you line until a manager confirms it (rev_field_confirm),
--      edits its details or removes it. A room's card carries over to the new wall.
--   4. The wall's UL goes with the request (Jesse, Oct 23: "we already know the UL the wall needs to meet, it's in the
--      plan"): each request cell keeps the wall's tag, rating, UL design and sheet number as they were when it was asked
--      for (ir_rev_items.wall_facts, set by the database at insert), and the request's what-to-inspect line names them
--      after each wall that has any, so the IR PDF prints them from saved content. "UL —" when the UL is not known yet.
-- Nothing is dropped.

-- =====================================================================================================================
-- 1. Tables
-- =====================================================================================================================
create table public.rev_baskets (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id),
  version int not null default 1,
  -- Never set: the rows stay (the audit trigger reads it).
  deleted_at timestamptz,
  org_id uuid not null,
  project_id uuid not null,
  owner_id uuid not null references auth.users(id),
  -- The owner's company as the people list names it, when the basket was started (the duty holder's read).
  company text check (company is null or length(btrim(company)) between 1 and 200),
  last_batch_id uuid,
  last_sent_version int,
  foreign key (project_id, org_id) references public.projects (id, org_id),
  unique (project_id, owner_id),
  unique (id, project_id)
);

create table public.rev_basket_cells (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id),
  version int not null default 1,
  deleted_at timestamptz,
  org_id uuid not null,
  project_id uuid not null,
  basket_id uuid not null,
  area_id uuid not null,
  item_id uuid not null,
  removed_at timestamptz,
  removed_by uuid references auth.users(id),
  batch_id uuid,
  sent_request_id uuid references public.inspection_requests(id),
  sent_at timestamptz,
  foreign key (project_id, org_id) references public.projects (id, org_id),
  foreign key (basket_id, project_id) references public.rev_baskets (id, project_id),
  foreign key (area_id, project_id) references public.rev_areas (id, project_id),
  foreign key (item_id) references public.rev_items (id),
  constraint rev_basket_cells_state_check check ((removed_at is null) = (removed_by is null)
    and (batch_id is null) = (sent_at is null) and (batch_id is null) = (sent_request_id is null)
    and not (removed_at is not null and batch_id is not null))
);
create unique index rev_basket_cells_in on public.rev_basket_cells (basket_id, area_id, item_id)
  where removed_at is null and batch_id is null;
create index rev_basket_cells_batch on public.rev_basket_cells (batch_id) where batch_id is not null;
create index rev_basket_cells_request on public.rev_basket_cells (sent_request_id) where sent_request_id is not null;

alter table public.rev_baskets enable row level security;
alter table public.rev_basket_cells enable row level security;

do $$
declare t text;
begin
  foreach t in array array['rev_baskets', 'rev_basket_cells'] loop
    execute format('create trigger touch before update on public.%I for each row execute function public.tg_touch_row()', t);
    execute format('create trigger rev_guard before update on public.%I for each row execute function public.tg_rev_guard()', t);
    execute format('create trigger no_delete before delete on public.%I for each row execute function public.tg_block_delete()', t);
    execute format('create trigger audit_row after insert or update on public.%I for each row execute function public.tg_audit_row()', t);
  end loop;
end $$;

-- Walls and rooms added on the spot: who added them, and the manager who checked them.
alter table public.rev_areas
  add column field_by uuid references auth.users(id),
  add column field_checked_at timestamptz,
  add column field_checked_by uuid references auth.users(id),
  add constraint rev_areas_field_check check ((field_checked_at is null) = (field_checked_by is null)
                                              and (field_checked_at is null or field_by is not null));
alter table public.rev_rooms
  add column field_by uuid references auth.users(id),
  add column field_checked_at timestamptz,
  add column field_checked_by uuid references auth.users(id),
  add constraint rev_rooms_field_check check ((field_checked_at is null) = (field_checked_by is null)
                                              and (field_checked_at is null or field_by is not null));

-- The wall's facts on each request cell, as they were when it was asked for.
alter table public.ir_rev_items
  add column wall_facts text check (wall_facts is null or length(wall_facts) between 1 and 400);

-- =====================================================================================================================
-- 2. Who: builds a basket, reads one
-- =====================================================================================================================
-- The caller files OFS requests here (ir_submit_ofs' own rule) on a job that takes them.
create or replace function public.rev_basket_may_build(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(auth.uid() is not null and public.has_capability(p_project_id, 'ir.request')
                  and public.has_capability(p_project_id, 'revs.read') and public.ir_setting(p_project_id, 'ir_ofs_allowed'), false);
$$;

-- Its owner, or the job's OFS duty holder when the owner is of the duty's company.
create or replace function public.rev_basket_may_see(p_project_id uuid, p_owner uuid, p_company text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(auth.uid() is not null and public.is_member(p_project_id)
    and (p_owner = auth.uid()
         or (public.duty_holder(p_project_id, 'ofs_requests') = auth.uid()
             and lower(btrim(p_company)) = lower(btrim(public.duty_company(p_project_id, 'ofs_requests'))))), false);
$$;

create policy "rev_baskets: owner or duty holder" on public.rev_baskets for select to authenticated
  using (public.rev_basket_may_see(project_id, owner_id, company));
create policy "rev_basket_cells: as the basket" on public.rev_basket_cells for select to authenticated
  using (exists (select 1 from public.rev_baskets b
                  where b.id = basket_id and public.rev_basket_may_see(b.project_id, b.owner_id, b.company)));

revoke all on public.rev_baskets, public.rev_basket_cells from public, anon, authenticated, service_role;
grant select on public.rev_baskets, public.rev_basket_cells to authenticated, service_role;

-- =====================================================================================================================
-- 3. The wall's facts: "F6a · 1 hr · UL U419 · A-201" ("UL —" when its UL is not known yet)
-- =====================================================================================================================
create or replace function public.rev_wall_facts(p_area_id uuid)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select left(concat_ws(' · ', nullif(btrim(a.wall_tag), ''), nullif(btrim(a.rating), ''),
                        case when nullif(btrim(a.ul_design), '') is null then 'UL —'
                             when btrim(a.ul_design) ~* '^UL\M' then btrim(a.ul_design)
                             else 'UL ' || btrim(a.ul_design) end,
                        nullif(btrim(a.sheet_ref), '')), 400)
    from public.rev_areas a where a.id = p_area_id;
$$;

-- A wall has facts to name when any of them is set.
create or replace function public.rev_wall_has_facts(p_area_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((select coalesce(nullif(btrim(a.wall_tag), ''), nullif(btrim(a.rating), ''), nullif(btrim(a.ul_design), ''),
                                   nullif(btrim(a.sheet_ref), '')) is not null
                     from public.rev_areas a where a.id = p_area_id), false);
$$;

create or replace function public.tg_ir_rev_item_facts()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  new.wall_facts := public.rev_wall_facts(new.area_id);
  return new;
end;
$$;
create trigger wall_facts before insert on public.ir_rev_items for each row execute function public.tg_ir_rev_item_facts();

-- 0056's "what to inspect", each wall followed by its facts when it has any: "<levels> · <items> · <walls (facts)>".
create or replace function public.ir_ofs_items_text(p_area_ids uuid[], p_item_ids uuid[])
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select left(
    (select string_agg(lv, ', ' order by lv) from (select distinct btrim(a.level) as lv from public.rev_areas a
                                                     where a.id = any (p_area_ids)) x)
    || ' · ' || (select string_agg(btrim(i.name), ' & ' order by v.number, i.position, i.name, i.id)
                   from public.rev_items i join public.revs v on v.id = i.rev_id where i.id = any (p_item_ids))
    || ' · ' || (select string_agg(btrim(a.name) || case when public.rev_wall_has_facts(a.id)
                                                         then ' (' || public.rev_wall_facts(a.id) || ')' else '' end,
                                   ', ' order by btrim(a.level), a.position, a.name, a.id)
                   from public.rev_areas a where a.id = any (p_area_ids)),
    4000);
$$;

-- =====================================================================================================================
-- 4. The basket (internal helpers)
-- =====================================================================================================================
-- The caller's basket on the job, made on first use, locked.
create or replace function public.rev_basket_mine(p_project_id uuid, p_make boolean)
returns public.rev_baskets
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare b public.rev_baskets;
begin
  if not public.rev_basket_may_build(p_project_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into b from public.rev_baskets where project_id = p_project_id and owner_id = auth.uid() for update;
  if b.id is null and p_make then
    insert into public.rev_baskets (org_id, project_id, owner_id, company, created_by)
    select pr.org_id, pr.id, auth.uid(), left(public.duty_member_company(pr.id, auth.uid()), 200), auth.uid()
      from public.projects pr where pr.id = p_project_id and pr.deleted_at is null
    on conflict (project_id, owner_id) do nothing;
    select * into b from public.rev_baskets where project_id = p_project_id and owner_id = auth.uid() for update;
    if b.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  end if;
  return b;
end;
$$;

-- The basket's cells still in it and still to ask for (open or failed). One asked for, passed or switched off since
-- simply drops out.
create or replace function public.rev_basket_live(p_project_id uuid, p_basket_id uuid)
returns table (area_id uuid, item_id uuid, added_at timestamptz)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select c.area_id, c.item_id, c.created_at
    from public.rev_basket_cells c
    join public.rev_status_rows(p_project_id) s on s.area_id = c.area_id and s.item_id = c.item_id and s.status in ('open', 'failed')
   where c.basket_id = p_basket_id and c.removed_at is null and c.batch_id is null;
$$;

-- What Send files, in order: one request per item and plan sheet page (walls with no sheet: per level), each with its
-- walls in their order. The same order the review shows and the typed OFS numbers follow.
create or replace function public.rev_basket_groups(p_project_id uuid, p_basket_id uuid)
returns table (k int, item_id uuid, area_ids uuid[])
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with x as (
    select l.item_id, a.id, btrim(a.level) as level, a.position, a.name,
           coalesce(a.sheet_file_id::text || ':' || a.sheet_page::text, 'level:' || lower(btrim(a.level))) as sheet
      from public.rev_basket_live(p_project_id, p_basket_id) l
      join public.rev_areas a on a.id = l.area_id
  ), g as (
    select x.item_id, x.sheet, min(x.level) as level, array_agg(x.id order by x.level, x.position, x.name, x.id) as area_ids
      from x group by x.item_id, x.sheet
  )
  select (row_number() over (order by v.number, i.position, i.name, i.id, g.level, g.sheet))::int, g.item_id, g.area_ids
    from g join public.rev_items i on i.id = g.item_id join public.revs v on v.id = i.rev_id;
$$;

-- The basket as the screens read it: its version, its cells, the requests Send would file (each with the OFS number
-- the database would give it), and whether the caller may type those numbers.
create or replace function public.rev_basket_json(p_project_id uuid, p_basket_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare v_next int := public.ir_ofs_next_number(p_project_id);
begin
  return jsonb_build_object(
    'version', coalesce((select b.version from public.rev_baskets b where b.id = p_basket_id), 0),
    'cells', coalesce((select jsonb_agg(jsonb_build_object('area_id', l.area_id, 'item_id', l.item_id) order by l.added_at, l.area_id, l.item_id)
                         from public.rev_basket_live(p_project_id, p_basket_id) l), '[]'::jsonb),
    'groups', coalesce((select jsonb_agg(jsonb_build_object('item_id', g.item_id, 'area_ids', to_jsonb(g.area_ids),
                                                            'ofs_number', least(999999, v_next + g.k - 1)) order by g.k)
                          from public.rev_basket_groups(p_project_id, p_basket_id) g), '[]'::jsonb),
    'may_number', public.ir_ofs_sender(p_project_id));
end;
$$;

-- A sent batch: its requests, in the order filed.
create or replace function public.rev_basket_batch_json(p_batch_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object('batch_id', p_batch_id, 'requests', coalesce(jsonb_agg(jsonb_build_object(
           'id', q.id, 'number', q.number, 'ofs_number', q.ofs_number, 'items', q.items, 'status', q.status, 'version', q.version)
           order by q.ofs_number, q.number), '[]'::jsonb))
    from public.inspection_requests q
   where q.id in (select c.sent_request_id from public.rev_basket_cells c where c.batch_id = p_batch_id);
$$;

-- =====================================================================================================================
-- 5. The basket (calls)
-- =====================================================================================================================
-- The caller's basket on the job (empty when there is none yet).
create or replace function public.rev_basket_get(p_project_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare v_id uuid;
begin
  if not public.rev_basket_may_build(p_project_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  select b.id into v_id from public.rev_baskets b where b.project_id = p_project_id and b.owner_id = auth.uid();
  return public.rev_basket_json(p_project_id, v_id);
end;
$$;

-- Add walls x items (or every wall of a room, p_room_id). Cells asked for already, passed, not applicable or in the
-- basket are skipped. Answers the basket and how many were added.
create or replace function public.rev_basket_add(p_project_id uuid, p_area_ids uuid[], p_item_ids uuid[], p_room_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare b public.rev_baskets; v_areas uuid[] := p_area_ids; v_n int;
begin
  b := public.rev_basket_mine(p_project_id, true);
  if p_room_id is not null then
    if not exists (select 1 from public.rev_rooms r where r.id = p_room_id and r.project_id = p_project_id and r.deleted_at is null) then
      raise exception 'not_found' using errcode = 'P0002';
    end if;
    v_areas := public.rev_card_walls(p_room_id);
  end if;
  if cardinality(coalesce(v_areas, '{}')) not between 1 and 200 then raise exception 'Pick 1 to 200 walls.' using errcode = '22023'; end if;
  if cardinality(coalesce(p_item_ids, '{}')) not between 1 and 60 then raise exception 'Pick 1 to 60 items.' using errcode = '22023'; end if;
  insert into public.rev_basket_cells (org_id, project_id, created_by, basket_id, area_id, item_id)
  select b.org_id, b.project_id, auth.uid(), b.id, s.area_id, s.item_id
    from public.rev_status_rows(p_project_id) s
   where s.area_id = any (v_areas) and s.item_id = any (p_item_ids) and s.status in ('open', 'failed')
     and not exists (select 1 from public.rev_basket_cells c
                      where c.basket_id = b.id and c.area_id = s.area_id and c.item_id = s.item_id
                        and c.removed_at is null and c.batch_id is null);
  get diagnostics v_n = row_count;
  if v_n > 0 then update public.rev_baskets set updated_at = now() where id = b.id; end if;
  return public.rev_basket_json(p_project_id, b.id) || jsonb_build_object('added', v_n);
end;
$$;

-- Take walls x items out (the Undo of Add, and Remove on the review). Answers the basket and how many came out.
create or replace function public.rev_basket_remove(p_project_id uuid, p_area_ids uuid[], p_item_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare b public.rev_baskets; v_n int := 0;
begin
  b := public.rev_basket_mine(p_project_id, false);
  if b.id is null then return public.rev_basket_json(p_project_id, null) || jsonb_build_object('removed', 0); end if;
  if cardinality(coalesce(p_area_ids, '{}')) not between 1 and 200 or cardinality(coalesce(p_item_ids, '{}')) not between 1 and 60 then
    raise exception 'Pick the walls and items to take out.' using errcode = '22023';
  end if;
  update public.rev_basket_cells set removed_at = now(), removed_by = auth.uid()
   where basket_id = b.id and removed_at is null and batch_id is null and area_id = any (p_area_ids) and item_id = any (p_item_ids);
  get diagnostics v_n = row_count;
  if v_n > 0 then update public.rev_baskets set updated_at = now() where id = b.id; end if;
  return public.rev_basket_json(p_project_id, b.id) || jsonb_build_object('removed', v_n);
end;
$$;

-- Send: the basket as reviewed (p_version) becomes one OFS request per item and sheet page, through ir_submit_ofs, as
-- one batch. p_ofs_numbers (whoever sends OFS requests): one per request, in the review's order. The basket is empty
-- after. The same Send again answers the same batch.
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
  -- Anything left was no longer to ask for: out of the basket.
  update public.rev_basket_cells set removed_at = now(), removed_by = auth.uid()
   where basket_id = b.id and removed_at is null and batch_id is null;
  update public.rev_baskets set last_batch_id = v_batch, last_sent_version = p_version where id = b.id;
  perform public.audit('rev.basket_send', 'rev_baskets', b.id, b.project_id, b.org_id,
                       jsonb_build_object('batch_id', v_batch, 'requests', to_jsonb(v_ids)));
  return public.rev_basket_batch_json(v_batch);
end;
$$;

-- The batches these requests went in, with how many requests of each are still live, for the requests the caller
-- reads (the schedule and the start page show them together).
create or replace function public.ir_batches(p_request_ids uuid[])
returns table (request_id uuid, batch_id uuid, size int)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
begin
  if auth.uid() is null then raise exception 'forbidden' using errcode = '42501'; end if;
  if cardinality(coalesce(p_request_ids, '{}')) > 1000 then raise exception 'Ask for up to 1000 requests.' using errcode = '22023'; end if;
  return query
    select m.request_id, m.batch_id,
           (select count(distinct c.sent_request_id)::int from public.rev_basket_cells c
              join public.inspection_requests x on x.id = c.sent_request_id and x.deleted_at is null and x.status <> 'withdrawn'
             where c.batch_id = m.batch_id)
      from (select distinct c.sent_request_id as request_id, c.batch_id from public.rev_basket_cells c
             where c.sent_request_id = any (p_request_ids) and c.batch_id is not null) m
      join public.inspection_requests q on q.id = m.request_id and q.deleted_at is null
     where public.is_member(q.project_id) and public.ir_may_see(q.project_id, q.requested_by, q.kind, q.ofs_sent_at);
end;
$$;

-- =====================================================================================================================
-- 6. A wall added on the spot
-- =====================================================================================================================
-- The job's managers of the cards (revs.manage), but the caller.
create or replace function public.rev_card_managers(p_project_id uuid)
returns uuid[]
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(array_agg(distinct pm.user_id), '{}')
    from public.project_members pm
    join public.role_permissions rp on rp.role = pm.role and rp.capability = 'revs.manage'
   where pm.project_id = p_project_id and pm.status = 'active' and pm.user_id is not null
     and (pm.access_ends_at is null or pm.access_ends_at > now()) and pm.user_id is distinct from auth.uid();
$$;

-- p_room_id: a room of the list, or else p_room_number (and p_room_name) on p_level, found or added. p_side: north,
-- south, east, west, or other with p_name. Answers {area_id, room_id, added}. The same wall again answers it as it is.
create or replace function public.rev_field_wall_add(p_list_id uuid, p_level text, p_room_id uuid, p_room_number text,
                                                     p_room_name text, p_side text, p_name text, p_wall_tag text, p_rating text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare l public.rev_lists; r public.rev_rooms; a public.rev_areas; src public.rev_areas; v_level text; v_side text := lower(btrim(coalesce(p_side, '')));
  v_name text; v_tag text; v_rating text; v_manager boolean; v_field uuid; v_added boolean := false; v_walls uuid[]; v_item uuid;
  v_sheet uuid; v_page int; u uuid;
begin
  select * into l from public.rev_lists where id = p_list_id and deleted_at is null;
  if l.id is null or not public.has_capability(l.project_id, 'revs.read') then raise exception 'not_found' using errcode = 'P0002'; end if;
  v_manager := public.has_capability(l.project_id, 'revs.manage');
  if not (v_manager or public.rev_basket_may_build(l.project_id)) then raise exception 'forbidden' using errcode = '42501'; end if;
  v_field := case when v_manager then null else auth.uid() end;
  perform pg_advisory_xact_lock(hashtext('rev_field_wall:' || l.id::text));
  v_tag := public.rev_text_or_null(p_wall_tag, 20, 'tag');
  v_rating := public.rev_text_or_null(p_rating, 80, 'rating');
  if v_side not in ('north', 'south', 'east', 'west', 'other') then raise exception 'Pick the wall.' using errcode = '22023'; end if;
  if v_side = 'other' and length(public.rev_clean(p_name)) not between 1 and 60 then
    raise exception 'Name the wall, up to 60 characters.' using errcode = '22023';
  end if;

  -- The room.
  if p_room_id is not null then
    select * into r from public.rev_rooms where id = p_room_id and list_id = l.id and deleted_at is null for update;
    if r.id is null then raise exception 'Pick a room of this card.' using errcode = '22023'; end if;
  else
    perform public.rev_room_check(p_level, p_room_number, coalesce(nullif(public.rev_clean(p_room_name), ''), 'Room'), '');
    v_level := public.rev_clean(p_level);
    select * into r from public.rev_rooms x
     where x.list_id = l.id and x.deleted_at is null and lower(btrim(x.level)) = lower(v_level)
       and lower(btrim(x.number)) = lower(public.rev_clean(p_room_number)) for update;
    if r.id is null then
      insert into public.rev_rooms (org_id, project_id, created_by, list_id, level, number, name, kind, position, field_by)
      values (l.org_id, l.project_id, auth.uid(), l.id, v_level, public.rev_clean(p_room_number),
              coalesce(nullif(public.rev_clean(p_room_name), ''), 'Room'), 'room',
              (select coalesce(max(x.position), 0) + 1 from public.rev_rooms x where x.list_id = l.id and x.deleted_at is null), v_field)
      returning * into r;
    end if;
  end if;

  -- The wall: "0302 Classroom north wall", or the short name after the room.
  v_name := left(public.rev_clean(r.number || ' ' || r.name || ' ' || case when v_side = 'other' then public.rev_clean(p_name)
                                                                          else v_side || ' wall' end), 160);
  select * into a from public.rev_areas x
   where x.list_id = l.id and x.deleted_at is null and lower(btrim(x.level)) = lower(btrim(r.level)) and lower(btrim(x.name)) = lower(v_name);
  if a.id is null then
    -- A tag another wall of the job has: its rating, UL design and sheet number come with it.
    if v_tag is not null then
      select * into src from public.rev_areas x
       where x.project_id = l.project_id and x.deleted_at is null and lower(btrim(x.wall_tag)) = lower(v_tag)
       order by (x.ul_design is null), (x.list_id <> l.id), x.created_at limit 1;
    end if;
    -- Its plan sheet: the room's walls', else this level's on the list.
    select x.sheet_file_id, x.sheet_page into v_sheet, v_page from public.rev_areas x
     where x.list_id = l.id and x.deleted_at is null and x.sheet_file_id is not null and lower(btrim(x.level)) = lower(btrim(r.level))
     order by (x.id <> all (public.rev_card_walls(r.id))), x.position limit 1;
    insert into public.rev_areas (org_id, project_id, created_by, list_id, level, name, sheet_file_id, sheet_page, position,
                                  wall_tag, rating, ul_design, sheet_ref, fire_area, field_by)
    values (l.org_id, l.project_id, auth.uid(), l.id, btrim(r.level), v_name, v_sheet, coalesce(v_page, 1),
            (select coalesce(max(x.position), 0) + 1 from public.rev_areas x where x.list_id = l.id and x.deleted_at is null),
            coalesce(src.wall_tag, v_tag), coalesce(v_rating, src.rating), src.ul_design, src.sheet_ref, src.fire_area, v_field)
    returning * into a;
    v_added := true;
  end if;

  -- Into the room, and the room's card carried over: an item off on the room's other walls is off here too.
  v_walls := array_remove(public.rev_card_walls(r.id), a.id);
  if not exists (select 1 from public.rev_room_walls w where w.room_id = r.id and w.area_id = a.id and w.deleted_at is null) then
    insert into public.rev_room_walls (org_id, project_id, created_by, room_id, area_id, position)
    values (r.org_id, r.project_id, auth.uid(), r.id, a.id,
            (select coalesce(max(x.position), 0) + 1 from public.rev_room_walls x where x.room_id = r.id and x.deleted_at is null));
  end if;
  if v_added and r.card_at is not null and cardinality(v_walls) > 0 then
    foreach v_item in array public.rev_card_items(l.id) loop
      -- Off on every other wall the card decides (one asked for or signed off keeps its own state).
      if exists (select 1 from unnest(v_walls) w where not public.rev_card_kept(w, v_item))
         and not exists (select 1 from unnest(v_walls) w
                          where not public.rev_card_kept(w, v_item)
                            and not exists (select 1 from public.rev_marks m where m.area_id = w and m.item_id = v_item
                                                                               and m.deleted_at is null)) then
        perform public.rev_card_cell(a.id, v_item, true, false);
      end if;
    end loop;
  end if;

  -- The managers hear of it until one of them checks it.
  if v_added and v_field is not null then
    foreach u in array public.rev_card_managers(l.project_id) loop
      perform public.create_task(l.project_id, u, 'revs.wall_check',
        left('Check wall ' || a.name || ' · ' || btrim(a.level) || ' · added by ' || coalesce(public.ir_person_name(auth.uid()), 'a member'), 300),
        'rev_area', a.id);
    end loop;
    perform public.audit('rev.field_wall_add', 'rev_areas', a.id, a.project_id, a.org_id,
                         jsonb_build_object('room_id', r.id, 'name', a.name, 'wall_tag', a.wall_tag, 'from_wall', src.id));
  end if;
  return jsonb_build_object('area_id', a.id, 'room_id', r.id, 'added', v_added);
end;
$$;

-- A manager checks a wall added on the spot (and the room it was added with). Safe to repeat.
create or replace function public.rev_field_confirm(p_area_id uuid)
returns public.rev_areas
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare a public.rev_areas;
begin
  select * into a from public.rev_areas where id = p_area_id for update;
  if a.id is null or not public.has_capability(a.project_id, 'revs.read') then raise exception 'not_found' using errcode = 'P0002'; end if;
  perform public.rev_need(a.project_id, 'revs.manage');
  if a.deleted_at is not null then raise exception 'This wall was removed.' using errcode = '22023'; end if;
  if a.field_by is null or a.field_checked_at is not null then return a; end if;
  update public.rev_areas set field_checked_at = now(), field_checked_by = auth.uid() where id = a.id returning * into a;
  return a;
end;
$$;

-- A manager's change to such a wall's details checks it too, and once checked or removed the managers' lines close.
-- Its room, added with it, is checked with its first wall.
create or replace function public.tg_rev_field_check()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.field_by is not null and old.field_checked_at is null and new.field_checked_at is null and new.deleted_at is null
     and auth.uid() is not null and public.has_capability(new.project_id, 'revs.manage')
     and (new.wall_tag, new.rating, new.ul_design, new.fire_area, new.sheet_ref, new.name, new.level, new.sheet_file_id)
         is distinct from (old.wall_tag, old.rating, old.ul_design, old.fire_area, old.sheet_ref, old.name, old.level, old.sheet_file_id) then
    new.field_checked_at := now();
    new.field_checked_by := auth.uid();
  end if;
  return new;
end;
$$;
create trigger field_check before update on public.rev_areas for each row execute function public.tg_rev_field_check();

create or replace function public.tg_rev_field_done()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.field_by is not null and ((new.field_checked_at is not null and old.field_checked_at is null)
                                   or (new.deleted_at is not null and old.deleted_at is null)) then
    update public.tasks set done_at = now(), done_by = auth.uid()
     where entity_type = 'rev_area' and entity_id = new.id and kind = 'revs.wall_check' and done_at is null and deleted_at is null;
  end if;
  if new.field_checked_at is not null and old.field_checked_at is null then
    update public.rev_rooms set field_checked_at = new.field_checked_at, field_checked_by = new.field_checked_by
     where field_by is not null and field_checked_at is null and deleted_at is null
       and id in (select w.room_id from public.rev_room_walls w where w.area_id = new.id and w.deleted_at is null);
  end if;
  return new;
end;
$$;
create trigger field_done after update of field_checked_at, deleted_at on public.rev_areas
  for each row execute function public.tg_rev_field_done();

-- =====================================================================================================================
-- Grants: the calls people make, the helpers internal
-- =====================================================================================================================
do $$
declare f text;
begin
  foreach f in array array[
    'public.rev_basket_get(uuid)', 'public.rev_basket_add(uuid, uuid[], uuid[], uuid)',
    'public.rev_basket_remove(uuid, uuid[], uuid[])',
    'public.rev_basket_send(uuid, integer, text, date, time without time zone, text, integer, boolean, boolean, boolean, integer[])',
    'public.ir_batches(uuid[])', 'public.rev_field_wall_add(uuid, text, uuid, text, text, text, text, text, text)',
    'public.rev_field_confirm(uuid)']
  loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
  foreach f in array array[
    'public.rev_basket_may_build(uuid)', 'public.rev_basket_may_see(uuid, uuid, text)', 'public.rev_wall_facts(uuid)',
    'public.rev_wall_has_facts(uuid)', 'public.rev_basket_mine(uuid, boolean)', 'public.rev_basket_live(uuid, uuid)',
    'public.rev_basket_groups(uuid, uuid)', 'public.rev_basket_json(uuid, uuid)', 'public.rev_basket_batch_json(uuid)',
    'public.rev_card_managers(uuid)']
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
  foreach f in array array['public.tg_ir_rev_item_facts()', 'public.tg_rev_field_check()', 'public.tg_rev_field_done()'] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
  end loop;
end $$;
-- The RLS policies call these two as the reader.
grant execute on function public.rev_basket_may_see(uuid, uuid, text) to authenticated;
