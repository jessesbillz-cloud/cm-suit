-- 0106 The fire marshal reviews fire / life safety RFIs and submittals (Jesse, Oct 22: "The contractor submits it to the
-- design team, the design team answers it, and then they send that answer over to the fire marshal for his input - he
-- just needs a simple approve or disapprove on it. They're all fire or fire-life-safety related RFIs - he doesn't look at
-- any other RFIs that don't deal with that. Same with submittals.")
--   1. The mark. An RFI of the RFI tool, an RFI document in RFIs' Uploaded folder (0099) or a submittal file (the
--      Submittals section) is marked fire / life safety (ofs_items, one row per item, never deleted). ofs_mark sets or
--      clears it with a version check: the RFI's originator, rfi.sign_issue, the file's uploader still on the job, a
--      writer of its folder, files.manage, or whoever sends the job's OFS requests (ir_ofs_sender: the inspector or the
--      duty holder). Only on a job that takes OFS requests. Once OFS has decided on it, the mark stays.
--   2. Suggested on. The job's fire list (projects.settings.ofs_fire_sections, divisions or sections as 2, 4 or 6 digits,
--      empty = the standard list ofs_fire_default, the one default): a new RFI whose Reference (else its title) names a
--      section in it is marked on by itself (tg_rfi_ofs_suggest), and a file just uploaded with such a spec section is
--      marked on by ofs_suggest (the uploader's browser, right after the section is filed). Never an item someone already
--      marked or cleared, never the files already on the job.
--   3. To the fire marshal when the design team has answered: a marked RFI of the RFI tool once it is answered (or
--      closed), a marked RFI document or submittal at once (it carries the design team's answer or stamp).
--   4. The decision (ofs_decide, ofs.review): Approved or Not approved, an optional comment, who and when, the content it
--      was made on (its hash), safe to repeat (the person's key) and with the item's version check. A decision is a
--      record: never changed or removed (ofs_decisions is append-only). A later decision supersedes the earlier one and the
--      item points at the newest (ofs_items.decision_id). Audited 'ofs.decide'. Who marked it and the job's OFS duty
--      holder get a board line. Not a signature (SPEC 6.9 signs PDFs): no fresh sign-in.
--   5. What the fire marshal reads. ofs.review (ahj) reads the marked items that reached him and nothing more:
--      rfi_may_see's answered rule now asks rfi.read_documents (every Plans reader but the fire marshal, 0100, the same
--      people as before) or ofs.review on a marked RFI. Submittals stop being one of the documents files.read_project
--      reads: the new files.read_submittals (every role with files.read_project but ahj, so nobody else's access changes)
--      reads the Submittals section, and ofs.review reads a marked file (ofs_file_readable, in the files policy and the
--      download gate). Plans, Specs and CCDs as before.
--   6. His page and his home: ofs_review_list (every item that reached him, waiting or decided), ofs_item_state (one
--      item, its decision and history, for the panes in For review, Files and RFIs). For review is a job tool for
--      ofs.review (my_readable_tools, job_rail_tools), pinned on the rail. my_tool_counts counts what waits on him.
--   7. The designated person's start page: ofs_desk (the inspector or the OFS duty holder on a job that takes OFS
--      requests): what is waiting on OFS and what came back, with the OFS inspection requests sent to OFS.
-- Matrix rows are data (rule 2). The server key's rights on the two new tables are written here (rule 1, 58 map).

-- =====================================================================================================================
-- 1. The matrix
-- =====================================================================================================================
insert into public.role_permissions (role, capability, requires_aal2) values ('ahj', 'ofs.review', false)
on conflict do nothing;

insert into public.role_permissions (role, capability, requires_aal2)
select rp.role, 'files.read_submittals', false
  from public.role_permissions rp
 where rp.capability = 'files.read_project' and rp.role <> 'ahj'
on conflict do nothing;

-- =====================================================================================================================
-- 2. Submittals: files.read_submittals, no longer one of the documents files.read_project reads
-- =====================================================================================================================
create or replace function public.folder_kind_is_document(p_kind text)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select coalesce(p_kind in ('plans', 'specs', 'addenda', 'dsa_103', 'ccd', 'approved_plans'), false);
$$;

-- The folder's own kind, else the nearest kind above it other than general (null: general all the way up).
create or replace function public.folder_nearest_kind(p_folder_id uuid)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with recursive up as (
    select f.id, f.parent_id, f.kind, 0 as depth from public.folders f where f.id = p_folder_id
    union all
    select f.id, f.parent_id, f.kind, up.depth + 1 from public.folders f join up on f.id = up.parent_id where up.depth < 32
  )
  select up.kind from up where up.kind <> 'general' order by up.depth limit 1;
$$;
revoke execute on function public.folder_nearest_kind(uuid) from public, anon, authenticated;
grant execute on function public.folder_nearest_kind(uuid) to service_role;

create or replace function public.folder_is_document(p_folder_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.folder_kind_is_document(public.folder_nearest_kind(p_folder_id));
$$;

-- 0099's rule, with Submittals read by files.read_submittals.
create or replace function public.folder_row_can_read(p_id uuid, p_project_id uuid, p_parent_id uuid, p_kind text)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare eff uuid; v_kind text; is_bid_docs boolean;
begin
  if not public.is_member(p_project_id) then return false; end if;
  if p_kind = 'bids_received' and not public.bids_open(p_project_id) then return false; end if;
  if exists (select 1 from public.folder_access fa where fa.folder_id = p_id) then
    eff := p_id;
  elsif p_parent_id is not null then
    eff := public.folder_effective_id(p_parent_id);
  end if;
  if eff is null then
    v_kind := case when p_kind <> 'general' then p_kind
                   when p_parent_id is null then null
                   else public.folder_nearest_kind(p_parent_id) end;
    is_bid_docs := p_kind in ('plans', 'specs') or (p_parent_id is not null and public.bid_docs_folder(p_parent_id));
    return public.has_capability(p_project_id, 'files.manage') or public.has_capability(p_project_id, 'files.read_records')
        or (public.has_capability(p_project_id, 'files.read_project') and public.folder_kind_is_document(v_kind))
        or (coalesce(v_kind = 'submittals', false) and public.has_capability(p_project_id, 'files.read_submittals'))
        or (public.my_bidder_member_id(p_project_id) is not null and is_bid_docs);
  end if;
  return exists (
    select 1 from public.folder_access fa
    where fa.folder_id = eff and fa.can_read
      and ((fa.user_id = auth.uid()) or (fa.capability is not null and public.has_capability(p_project_id, fa.capability)))
  );
end;
$$;

-- =====================================================================================================================
-- 3. The fire list
-- =====================================================================================================================
-- The standard list (the one default): fire suppression and fire alarm, fireproofing, firestopping.
create or replace function public.ofs_fire_default()
returns text[]
language sql
immutable
set search_path = public, pg_temp
as $$
  select '{21,28,078100,078123,078400,078413,078443}'::text[];
$$;

-- The job's list: its own entries (2, 4 or 6 digits), else the standard one.
create or replace function public.ofs_fire_list(p_project_id uuid)
returns text[]
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select array_agg(distinct e.v order by e.v)
       from public.projects p
       cross join lateral jsonb_array_elements_text(
         case when jsonb_typeof(p.settings -> 'ofs_fire_sections') = 'array' then p.settings -> 'ofs_fire_sections'
              else '[]'::jsonb end) as e (v)
      where p.id = p_project_id and e.v ~ '^[0-4][0-9]([0-9]{2}){0,2}$'),
    public.ofs_fire_default());
$$;

-- Is a 6-digit section on the job's fire list (an entry it starts with)?
create or replace function public.ofs_section_is_fire(p_project_id uuid, p_section text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(p_section ~ '^[0-4][0-9][0-9]{4}$'
                  and exists (select 1 from unnest(public.ofs_fire_list(p_project_id)) e where p_section like e || '%'), false);
$$;

-- The first spec section a text names ("09 29 00", "092900"), never part of a longer number.
create or replace function public.ofs_section_of_text(p_text text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select nullif(replace(coalesce(substring(coalesce(p_text, '') from '(?:^|[^0-9])([0-4][0-9] ?[0-9]{2} ?[0-9]{2})(?:[^0-9]|$)'), ''), ' ', ''), '');
$$;

-- The standard list, for the job's settings box (its placeholder).
create or replace function public.ofs_fire_standard()
returns text[]
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case when auth.uid() is not null then public.ofs_fire_default() end;
$$;

-- =====================================================================================================================
-- 4. Tables
-- =====================================================================================================================
create table public.ofs_items (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  version int not null default 1,
  org_id uuid not null,
  project_id uuid not null,
  kind text not null check (kind in ('rfi', 'rfi_document', 'submittal')),
  rfi_id uuid references public.rfis(id),
  file_id uuid references public.files(id),
  marked boolean not null,
  marked_by uuid not null references auth.users(id),
  marked_at timestamptz not null default now(),
  source text not null check (source in ('person', 'suggested')),
  foreign key (project_id, org_id) references public.projects (id, org_id),
  unique (rfi_id),
  unique (file_id),
  check ((kind = 'rfi') = (rfi_id is not null) and (kind = 'rfi') = (file_id is null))
);
alter table public.ofs_items enable row level security;
create index ofs_items_project on public.ofs_items (project_id) where marked;
create trigger touch before update on public.ofs_items for each row execute function public.tg_touch_row();
create trigger no_delete before delete on public.ofs_items for each row execute function public.tg_block_delete();

create table public.ofs_decisions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  org_id uuid not null,
  project_id uuid not null,
  item_id uuid not null references public.ofs_items(id),
  decision text not null check (decision in ('approved', 'not_approved')),
  comment text check (comment is null or length(btrim(comment)) between 1 and 2000),
  decided_by uuid not null references auth.users(id),
  decided_at timestamptz not null default now(),
  -- What was decided on: the file's sha256, or the RFI's title, question and answer hashed.
  content_hash text check (content_hash is null or content_hash ~ '^[0-9a-f]{64}$'),
  request_key uuid not null,
  foreign key (project_id, org_id) references public.projects (id, org_id),
  unique (decided_by, request_key)
);
alter table public.ofs_decisions enable row level security;
create index ofs_decisions_item on public.ofs_decisions (item_id, decided_at desc);

-- A decision is a record: it never changes and is never removed.
create or replace function public.tg_ofs_decision_kept()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception 'A decision is a record: it never changes.' using errcode = '42501';
end;
$$;
revoke execute on function public.tg_ofs_decision_kept() from public, anon, authenticated;
create trigger kept before update or delete on public.ofs_decisions for each row execute function public.tg_ofs_decision_kept();

-- The item's current decision (the newest), written only by ofs_decide.
alter table public.ofs_items add column decision_id uuid references public.ofs_decisions(id);

revoke all on public.ofs_items, public.ofs_decisions from public, anon, authenticated, service_role;
grant select on public.ofs_items, public.ofs_decisions to authenticated;
grant select, insert, update on public.ofs_items to service_role;
grant select, insert on public.ofs_decisions to service_role;

-- =====================================================================================================================
-- 5. Who reads what (internal helpers, then the policies)
-- =====================================================================================================================
-- A file's place: a submittal (in the Submittals section), an RFI document (in RFIs' Uploaded folder), or null.
create or replace function public.ofs_file_kind(p_file_id uuid)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with recursive up as (
    select fo.id, fo.parent_id, fo.kind, fo.name, 0 as depth
      from public.files f join public.folders fo on fo.id = f.folder_id where f.id = p_file_id
    union all
    select fo.id, fo.parent_id, fo.kind, fo.name, up.depth + 1 from public.folders fo join up on fo.id = up.parent_id
     where up.depth < 32
  )
  select case
    when public.folder_nearest_kind((select f.folder_id from public.files f where f.id = p_file_id)) = 'submittals' then 'submittal'
    when exists (select 1 from up join public.folders r on r.id = up.parent_id
                  where up.kind = 'general' and up.name = 'Uploaded' and r.kind = 'rfis' and r.parent_id is null) then 'rfi_document'
  end;
$$;

-- Is this RFI marked?
create or replace function public.ofs_rfi_marked(p_rfi_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (select 1 from public.ofs_items i where i.rfi_id = p_rfi_id and i.marked);
$$;

-- A marked file the caller reviews (ofs.review on its job).
create or replace function public.ofs_file_readable(p_file_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(auth.uid() is not null and exists (
    select 1 from public.ofs_items i
     where i.file_id = p_file_id and i.marked and public.has_capability(i.project_id, 'ofs.review')), false);
$$;

-- Does the caller read the item the row is about?
create or replace function public.ofs_item_may_see(p_rfi_id uuid, p_file_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    case when p_rfi_id is not null then
      (select r.deleted_at is null and public.rfi_may_see(r.id, r.project_id, r.created_by, r.status, r.step)
         from public.rfis r where r.id = p_rfi_id)
    else
      (select f.deleted_at is null
              and (public.file_may_see(f.project_id, f.created_by, f.folder_id) or public.ofs_file_readable(f.id))
         from public.files f where f.id = p_file_id)
    end, false);
$$;

-- Has the item reached the fire marshal (marked, and an RFI of the RFI tool answered or closed)?
create or replace function public.ofs_item_sent(p_item_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((
    select i.marked and case
      when i.kind = 'rfi' then exists (select 1 from public.rfis r where r.id = i.rfi_id and r.deleted_at is null
                                          and r.status in ('answered', 'closed'))
      else exists (select 1 from public.files f where f.id = i.file_id and f.deleted_at is null and f.upload_complete) end
      from public.ofs_items i where i.id = p_item_id), false);
$$;

-- rfi_may_see (0038): answered and closed RFIs for rfi.read_documents (the people files.read_project named, but the fire
-- marshal), and for ofs.review when the RFI is marked.
create or replace function public.rfi_may_see(p_rfi_id uuid, p_project_id uuid, p_created_by uuid, p_status text, p_step int)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(public.is_member(p_project_id) and (
       p_created_by = auth.uid()
    or public.has_capability(p_project_id, 'rfi.sign_issue')
    or (p_status <> 'draft'
        and public.rfi_on_route(p_rfi_id, p_project_id, case when p_status = 'review' then p_step else 1000 end))
    or (p_status in ('open', 'answered', 'closed') and public.has_capability(p_project_id, 'rfi.answer'))
    or (p_status in ('answered', 'closed') and public.has_capability(p_project_id, 'rfi.read_documents'))
    or (p_status in ('answered', 'closed') and public.has_capability(p_project_id, 'ofs.review')
        and public.ofs_rfi_marked(p_rfi_id))), false);
$$;

create policy "ofs_items: with the item" on public.ofs_items for select to authenticated
  using (public.ofs_item_may_see(rfi_id, file_id));
create policy "ofs_decisions: with the item" on public.ofs_decisions for select to authenticated
  using (exists (select 1 from public.ofs_items i where i.id = ofs_decisions.item_id));

-- The files policy (0090) and the download gate (0076): a marked file for its reviewer too.
alter policy "files: readable" on public.files
  using (deleted_at is null
         and (public.file_may_see(project_id, created_by, folder_id) or public.addendum_file_readable(id)
              or public.file_on_visible_request(id, project_id) or public.ofs_file_readable(id)));

create or replace function public.authorize_download(p_file_id uuid, p_variant text default 'original')
returns table (storage_path text, original_name text, mime text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare f public.files; fo public.folders; hdrs jsonb; pending_image boolean;
begin
  select * into f from public.files where id = p_file_id and deleted_at is null;
  if f is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not ((f.created_by = auth.uid() and public.is_member(f.project_id)) or public.folder_can_read(f.folder_id)
          or public.addendum_file_readable(f.id) or public.ofs_file_readable(f.id)) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into fo from public.folders where id = f.folder_id;
  if fo.view_only and not public.has_capability(f.project_id, 'files.manage') then
    raise exception 'view_only' using errcode = '42501';
  end if;
  if f.scan_status = 'infected' then raise exception 'infected' using errcode = '42501'; end if;
  pending_image := lower(f.mime) in ('image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif')
                   and lower(f.original_name) ~ '\.(jpe?g|png|webp|heic|heif)$'
                   and public.folder_can_read(f.folder_id);
  if f.scan_status = 'pending' and f.created_by is distinct from auth.uid() and not pending_image then
    raise exception 'scan_pending' using errcode = '42501';
  end if;
  hdrs := nullif(current_setting('request.headers', true), '')::jsonb;
  insert into public.downloads (file_id, project_id, user_id, ip, variant)
  values (f.id, f.project_id, auth.uid(), nullif(split_part(coalesce(hdrs->>'x-forwarded-for', ''), ',', 1), '')::inet, p_variant);
  perform public.audit('download', 'file', f.id, f.project_id, f.org_id, jsonb_build_object('variant', p_variant, 'name', f.original_name), f.sha256);
  return query select f.storage_path, f.original_name, f.mime;
end;
$$;

-- =====================================================================================================================
-- 6. Who may mark (internal)
-- =====================================================================================================================
create or replace function public.ofs_may_mark_rfi(p_rfi_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((
    select auth.uid() is not null and r.deleted_at is null and r.status <> 'void'
       and public.rfi_may_see(r.id, r.project_id, r.created_by, r.status, r.step)
       and (r.created_by = auth.uid() or public.has_capability(r.project_id, 'rfi.sign_issue')
            or public.ir_ofs_sender(r.project_id))
      from public.rfis r where r.id = p_rfi_id), false);
$$;

create or replace function public.ofs_may_mark_file(p_file_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((
    select auth.uid() is not null and f.deleted_at is null and f.upload_complete
       and public.ofs_file_kind(f.id) is not null
       and public.file_may_see(f.project_id, f.created_by, f.folder_id)
       and (public.file_spec_section_may(f.id) or public.ir_ofs_sender(f.project_id))
      from public.files f where f.id = p_file_id), false);
$$;

-- =====================================================================================================================
-- 7. One item as the panes show it
-- =====================================================================================================================
create or replace function public.ofs_item_json(p_item_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'id', i.id,
    'project_id', i.project_id,
    'kind', i.kind,
    'rfi_id', i.rfi_id,
    'file_id', i.file_id,
    'marked', i.marked,
    'version', i.version,
    'may_mark', case when i.kind = 'rfi' then public.ofs_may_mark_rfi(i.rfi_id) else public.ofs_may_mark_file(i.file_id) end
                and (i.decision_id is null or not i.marked),
    'sent', public.ofs_item_sent(i.id),
    'may_decide', public.ofs_item_sent(i.id) and public.has_capability(i.project_id, 'ofs.review'),
    'number', r.number,
    'title', coalesce(r.title, f.original_name),
    'file_name', f.original_name,
    'mime', f.mime,
    'size', f.size,
    'section', coalesce(f.spec_section, public.ofs_section_of_text(r.refs), public.ofs_section_of_text(r.title)),
    'sent_at', case when i.kind = 'rfi' then greatest(i.marked_at, r.answered_at) else i.marked_at end,
    'decision', (select jsonb_build_object('decision', d.decision, 'comment', d.comment, 'at', d.decided_at,
                                           'name', public.ir_person_name(d.decided_by))
                   from public.ofs_decisions d where d.id = i.decision_id),
    'history', coalesce((select jsonb_agg(jsonb_build_object('decision', d.decision, 'comment', d.comment, 'at', d.decided_at,
                                                             'name', public.ir_person_name(d.decided_by))
                                          order by d.decided_at desc, d.id)
                           from public.ofs_decisions d where d.item_id = i.id and d.id <> i.decision_id), '[]'::jsonb))
    from public.ofs_items i
    left join public.rfis r on r.id = i.rfi_id
    left join public.files f on f.id = i.file_id
   where i.id = p_item_id;
$$;

-- The item of an RFI or a file (or by its own id) for the pane that shows it. Null when there is nothing to show: no row
-- yet and the caller may not mark it (or the job takes no OFS requests).
create or replace function public.ofs_item_state(p_item_id uuid default null, p_rfi_id uuid default null,
                                                 p_file_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare i public.ofs_items; v_project uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first.' using errcode = '42501'; end if;
  if num_nonnulls(p_item_id, p_rfi_id, p_file_id) <> 1 then
    raise exception 'An item, an RFI or a file.' using errcode = '22023';
  end if;
  select * into i from public.ofs_items x
   where (p_item_id is not null and x.id = p_item_id) or (p_rfi_id is not null and x.rfi_id = p_rfi_id)
      or (p_file_id is not null and x.file_id = p_file_id);
  if not public.ofs_item_may_see(coalesce(i.rfi_id, p_rfi_id), coalesce(i.file_id, p_file_id))
     or (p_item_id is not null and i.id is null) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if i.id is not null then return public.ofs_item_json(i.id); end if;
  v_project := coalesce((select r.project_id from public.rfis r where r.id = p_rfi_id),
                        (select f.project_id from public.files f where f.id = p_file_id));
  if not public.ir_setting(v_project, 'ir_ofs_allowed') then return null; end if;
  if p_rfi_id is not null and not public.ofs_may_mark_rfi(p_rfi_id) then return null; end if;
  if p_file_id is not null and not public.ofs_may_mark_file(p_file_id) then return null; end if;
  return jsonb_build_object('id', null, 'marked', false, 'version', 0, 'may_mark', true, 'sent', false, 'may_decide', false,
                            'decision', null, 'history', '[]'::jsonb);
end;
$$;

-- =====================================================================================================================
-- 8. Mark and suggest
-- =====================================================================================================================
create or replace function public.ofs_mark(p_on boolean, p_rfi_id uuid default null, p_file_id uuid default null,
                                           p_version int default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare i public.ofs_items; v_project uuid; v_org uuid; v_kind text; v_on boolean := coalesce(p_on, false);
begin
  if auth.uid() is null then raise exception 'Sign in first.' using errcode = '42501'; end if;
  if num_nonnulls(p_rfi_id, p_file_id) <> 1 then raise exception 'An RFI or a file.' using errcode = '22023'; end if;
  if not public.ofs_item_may_see(p_rfi_id, p_file_id) then raise exception 'not_found' using errcode = 'P0002'; end if;
  if p_rfi_id is not null then
    select r.project_id, r.org_id, 'rfi' into v_project, v_org, v_kind from public.rfis r where r.id = p_rfi_id;
    if not public.ofs_may_mark_rfi(p_rfi_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  else
    select f.project_id, f.org_id, public.ofs_file_kind(f.id) into v_project, v_org, v_kind from public.files f where f.id = p_file_id;
    if v_kind is null then raise exception 'Only RFIs and submittals go to OFS.' using errcode = '22023'; end if;
    if not public.ofs_may_mark_file(p_file_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  end if;
  if not public.ir_setting(v_project, 'ir_ofs_allowed') then raise exception 'OFS is off for this job.' using errcode = '22023'; end if;

  perform pg_advisory_xact_lock(hashtext('ofs_item:' || coalesce(p_rfi_id, p_file_id)::text));
  select * into i from public.ofs_items x where x.rfi_id = p_rfi_id or x.file_id = p_file_id for update;
  if i.id is null then
    -- Nothing to clear: the same answer again.
    if not v_on then return public.ofs_item_state(null, p_rfi_id, p_file_id); end if;
    if coalesce(p_version, 0) <> 0 then raise exception 'version_conflict' using errcode = '40001'; end if;
    insert into public.ofs_items (org_id, project_id, kind, rfi_id, file_id, marked, marked_by, source, created_by)
    values (v_org, v_project, v_kind, p_rfi_id, p_file_id, true, auth.uid(), 'person', auth.uid())
    returning * into i;
  else
    if i.marked = v_on then return public.ofs_item_json(i.id); end if;
    if i.version <> coalesce(p_version, 0) then raise exception 'version_conflict' using errcode = '40001'; end if;
    if not v_on and i.decision_id is not null then
      raise exception 'OFS has decided on it. It stays fire / life safety.' using errcode = '22023';
    end if;
    update public.ofs_items set marked = v_on, marked_by = auth.uid(), marked_at = now(), source = 'person'
     where id = i.id returning * into i;
  end if;
  perform public.audit('ofs.mark', 'ofs_item', i.id, i.project_id, i.org_id,
    jsonb_build_object('on', v_on, 'kind', i.kind, 'rfi_id', i.rfi_id, 'file_id', i.file_id));
  return public.ofs_item_json(i.id);
end;
$$;

-- Files just uploaded: marked on when their spec section is on the job's fire list, no one has marked or cleared them,
-- and the caller may mark them. The rest are skipped. Answers how many it marked. At most 500 at a time.
create or replace function public.ofs_suggest(p_file_ids uuid[])
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare f public.files; v_kind text; v_id uuid; v_n int := 0;
begin
  if auth.uid() is null then raise exception 'Sign in first.' using errcode = '42501'; end if;
  if p_file_ids is null or cardinality(p_file_ids) > 500 then
    raise exception 'Send at most 500 files at a time.' using errcode = '22023';
  end if;
  for f in select x.* from public.files x where x.id = any (p_file_ids) loop
    continue when f.spec_section is null or not public.ir_setting(f.project_id, 'ir_ofs_allowed')
               or not public.ofs_section_is_fire(f.project_id, f.spec_section)
               or not public.ofs_may_mark_file(f.id);
    v_kind := public.ofs_file_kind(f.id);
    perform pg_advisory_xact_lock(hashtext('ofs_item:' || f.id::text));
    insert into public.ofs_items (org_id, project_id, kind, file_id, marked, marked_by, source, created_by)
    values (f.org_id, f.project_id, v_kind, f.id, true, auth.uid(), 'suggested', auth.uid())
    on conflict (file_id) do nothing
    returning id into v_id;
    continue when v_id is null;
    perform public.audit('ofs.mark', 'ofs_item', v_id, f.project_id, f.org_id,
      jsonb_build_object('on', true, 'kind', v_kind, 'file_id', f.id, 'suggested', f.spec_section));
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

-- An RFI whose Reference (else its title) names a section on the fire list is marked on by itself, once: never after
-- someone marked or cleared it. Runs as the owner (the RFI functions write the row).
create or replace function public.tg_rfi_ofs_suggest()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_section text; v_id uuid;
begin
  if new.deleted_at is not null or new.status = 'void' or not public.ir_setting(new.project_id, 'ir_ofs_allowed')
     or exists (select 1 from public.ofs_items i where i.rfi_id = new.id) then
    return null;
  end if;
  v_section := coalesce(public.ofs_section_of_text(new.refs), public.ofs_section_of_text(new.title));
  if v_section is null or not public.ofs_section_is_fire(new.project_id, v_section) then return null; end if;
  insert into public.ofs_items (org_id, project_id, kind, rfi_id, marked, marked_by, source, created_by)
  values (new.org_id, new.project_id, 'rfi', new.id, true, coalesce(auth.uid(), new.created_by), 'suggested',
          coalesce(auth.uid(), new.created_by))
  on conflict (rfi_id) do nothing
  returning id into v_id;
  if v_id is not null then
    perform public.audit('ofs.mark', 'ofs_item', v_id, new.project_id, new.org_id,
      jsonb_build_object('on', true, 'kind', 'rfi', 'rfi_id', new.id, 'suggested', v_section));
  end if;
  return null;
end;
$$;
revoke execute on function public.tg_rfi_ofs_suggest() from public, anon, authenticated;
create trigger ofs_suggest after insert or update of refs, title on public.rfis
  for each row execute function public.tg_rfi_ofs_suggest();

-- =====================================================================================================================
-- 9. The decision
-- =====================================================================================================================
create or replace function public.ofs_decide(p_item_id uuid, p_version int, p_decision text, p_comment text default null,
                                             p_key uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare i public.ofs_items; v_comment text := nullif(btrim(coalesce(p_comment, '')), ''); v_hash text; v_id uuid;
  v_label text; v_to uuid[]; v_was uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first.' using errcode = '42501'; end if;
  select * into i from public.ofs_items where id = p_item_id;
  if i.id is null or not public.ofs_item_may_see(i.rfi_id, i.file_id) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if not public.has_capability(i.project_id, 'ofs.review') then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_decision is null or p_decision not in ('approved', 'not_approved') then
    raise exception 'Approved or Not approved.' using errcode = '22023';
  end if;
  if v_comment is not null and length(v_comment) > 2000 then
    raise exception 'Keep the comment under 2000 characters.' using errcode = '22023';
  end if;
  if p_key is null then raise exception 'A decision needs its key.' using errcode = '22023'; end if;
  -- The same decision again (a retry): what it answered.
  if exists (select 1 from public.ofs_decisions d where d.decided_by = auth.uid() and d.request_key = p_key) then
    return public.ofs_item_json(i.id);
  end if;
  perform pg_advisory_xact_lock(hashtext('ofs_item:' || coalesce(i.rfi_id, i.file_id)::text));
  select * into i from public.ofs_items where id = p_item_id for update;
  if not public.ofs_item_sent(i.id) then raise exception 'This is not with OFS.' using errcode = '22023'; end if;
  if i.version <> coalesce(p_version, -1) then raise exception 'version_conflict' using errcode = '40001'; end if;

  if i.kind = 'rfi' then
    select encode(sha256(convert_to(r.title || E'\n' || r.question || E'\n' || coalesce(r.answer, ''), 'UTF8')), 'hex'),
           public.rfi_label(r.number) || ' ' || r.title
      into v_hash, v_label from public.rfis r where r.id = i.rfi_id;
  else
    select case when f.sha256 ~ '^[0-9a-f]{64}$' then f.sha256 end, f.original_name
      into v_hash, v_label from public.files f where f.id = i.file_id;
  end if;
  v_was := i.decision_id;
  insert into public.ofs_decisions (org_id, project_id, item_id, decision, comment, decided_by, content_hash, request_key)
  values (i.org_id, i.project_id, i.id, p_decision, v_comment, auth.uid(), v_hash, p_key)
  returning id into v_id;
  update public.ofs_items set decision_id = v_id where id = i.id;
  perform public.audit('ofs.decide', 'ofs_item', i.id, i.project_id, i.org_id,
    jsonb_build_object('decision', p_decision, 'comment', v_comment, 'decision_id', v_id, 'supersedes', v_was), v_hash);

  -- Who marked it and the job's OFS duty holder see it on their board.
  v_to := array(select distinct x from unnest(array[i.marked_by, public.duty_holder(i.project_id, 'ofs_requests')]) x
                 where x is not null and x is distinct from auth.uid()
                   and exists (select 1 from public.project_members pm where pm.project_id = i.project_id and pm.user_id = x
                                  and pm.status = 'active'));
  if cardinality(v_to) > 0 then
    perform public.post_activity(i.project_id, 'ofs.' || p_decision,
      left(case when p_decision = 'approved' then 'OFS approved: ' else 'OFS not approved: ' end || v_label
           || coalesce(' · ' || v_comment, ''), 500),
      case when i.kind = 'rfi' then 'rfi' else 'file' end, coalesce(i.rfi_id, i.file_id), null, v_to);
  end if;
  return public.ofs_item_json(i.id);
end;
$$;

-- =====================================================================================================================
-- 10. The fire marshal's list, and what waits on him
-- =====================================================================================================================
-- Every item that reached the caller as reviewer (ofs.review), on one job or all of mine: waiting (no decision) or done.
create or replace function public.ofs_review_list(p_project_id uuid default null)
returns table (id uuid, project_id uuid, kind text, rfi_id uuid, file_id uuid, number int, title text, section text,
               sent_at timestamptz, decision text, decided_at timestamptz, version int)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select i.id, i.project_id, i.kind, i.rfi_id, i.file_id, r.number, coalesce(r.title, f.original_name),
         coalesce(f.spec_section, public.ofs_section_of_text(r.refs), public.ofs_section_of_text(r.title)),
         case when i.kind = 'rfi' then greatest(i.marked_at, r.answered_at) else i.marked_at end,
         d.decision, d.decided_at, i.version
    from public.ofs_items i
    join public.projects p on p.id = i.project_id and p.deleted_at is null
    left join public.rfis r on r.id = i.rfi_id
    left join public.files f on f.id = i.file_id
    left join public.ofs_decisions d on d.id = i.decision_id
   where auth.uid() is not null
     and (p_project_id is null or i.project_id = p_project_id)
     and public.has_capability(i.project_id, 'ofs.review')
     and public.ofs_item_sent(i.id)
   order by 9 desc, i.id;
$$;

-- What waits on the caller as reviewer (for the rail's count).
create or replace function public.ofs_waiting(p_project_id uuid default null)
returns table (id uuid)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select l.id from public.ofs_review_list(p_project_id) l where l.decision is null;
$$;

-- 0060's counts, with what waits on me in For review.
create or replace function public.my_tool_counts(p_project_id uuid default null)
returns table (entity_type text, n int)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select x.entity_type, count(distinct x.record)::int
    from (
      select t.entity_type, coalesce(t.entity_id, t.id) as record
        from public.tasks t
       where t.assignee_user_id = auth.uid() and t.done_at is null and t.deleted_at is null
         and (p_project_id is null or t.project_id = p_project_id)
      union
      select 'rfi', w.id
        from public.rfi_waiting() w
       where p_project_id is null or w.project_id = p_project_id
      union
      select 'safety_meeting', m.id
        from public.safety_meetings m
       where m.leader_id = auth.uid() and m.status = 'open'
         and (p_project_id is null or m.project_id = p_project_id)
      union
      select 'ofs_item', q.id
        from public.ofs_waiting(p_project_id) q
    ) x
   group by x.entity_type
   order by x.entity_type nulls first;
$$;

-- =====================================================================================================================
-- 11. The designated person's start page
-- =====================================================================================================================
-- Null for anyone but the inspector or the OFS duty holder on a job that takes OFS requests. Else every marked item that
-- reached OFS and every OFS request sent to OFS the caller reads: waiting, or back (approved, not approved, passed,
-- failed), newest first: 900 items and 300 requests at most.
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
                coalesce(d.decided_at, case when i.kind = 'rfi' then greatest(i.marked_at, r.answered_at) else i.marked_at end) as at
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
                coalesce(q.result_at, q.ofs_sent_at)
           from public.inspection_requests q
          where q.project_id = p_project_id and q.kind = 'ofs' and q.ofs_sent_at is not null and q.deleted_at is null
            and q.status <> 'withdrawn' and public.ir_may_see(q.project_id, q.requested_by, q.kind, q.ofs_sent_at)
          order by 8 desc
          limit 300)
      ) as x (id, kind, target_type, target_id, number, title, state, at)), '[]'::jsonb));
end;
$$;

-- =====================================================================================================================
-- 12. For review on the rail: a job tool for ofs.review
-- =====================================================================================================================
create or replace function public.job_rail_tools()
returns text[]
language sql
immutable
set search_path = public, pg_temp
as $$
  select '{board,review,files,bids,calendar,dailies,inspections,revs,rfis,permits,deliveries,corrections,safety,schedule,requirements,people,hours}'::text[];
$$;

-- 0081's list, with For review, and RFIs read through rfi.read_documents (the same people as files.read_project but the
-- fire marshal, whose RFIs are in For review).
create or replace function public.my_readable_tools(p_project_id uuid default null)
returns table (project_id uuid, tools text[])
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select p.id,
         array(select t.tool
                 from (values
                   (1, 'board', null::text[]),
                   (2, 'review', '{ofs.review}'::text[]),
                   (3, 'files', '{files.read_project,files.write_project,files.manage}'::text[]),
                   (4, 'bids', '{bids.manage,bids.submit}'::text[]),
                   (5, 'calendar', '{calendar.read}'::text[]),
                   (6, 'dailies', '{dailies.read_all,dailies.write}'::text[]),
                   (7, 'inspections', '{ir.request,ir.view_all,ir.decide,ir.ofs_decide,ir.ofs_view}'::text[]),
                   (8, 'revs', '{revs.read}'::text[]),
                   (9, 'rfis', '{rfi.create_draft,rfi.sign_issue,rfi.answer,rfi.read_documents}'::text[]),
                   (10, 'permits', '{permits.read}'::text[]),
                   (11, 'deliveries', '{deliveries.view,deliveries.post}'::text[]),
                   (12, 'corrections', '{corrections.view}'::text[]),
                   (13, 'safety', '{safety.read}'::text[]),
                   (14, 'schedule', '{schedule.read}'::text[]),
                   (15, 'requirements', '{requirements.read,requirements.read_own}'::text[]),
                   (16, 'people', '{members.view,members.manage}'::text[]),
                   (17, 'hours', '{dailies.write}'::text[])
                 ) as t(ord, tool, caps)
                where t.caps is null
                   or exists (select 1 from unnest(t.caps) as c(cap) where public.has_capability(p.id, c.cap))
                order by t.ord)
    from public.projects p
   where p.deleted_at is null
     and public.is_member(p.id)
     and (p_project_id is null or p.id = p_project_id)
   order by p.id;
$$;

-- =====================================================================================================================
-- Grants
-- =====================================================================================================================
do $$
declare f text;
begin
  foreach f in array array[
    'public.ofs_fire_standard()', 'public.ofs_item_state(uuid, uuid, uuid)', 'public.ofs_mark(boolean, uuid, uuid, integer)',
    'public.ofs_suggest(uuid[])', 'public.ofs_decide(uuid, integer, text, text, uuid)', 'public.ofs_review_list(uuid)',
    'public.ofs_desk(uuid)', 'public.ofs_waiting(uuid)']
  loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
  foreach f in array array[
    'public.ofs_fire_default()', 'public.ofs_fire_list(uuid)', 'public.ofs_section_is_fire(uuid, text)',
    'public.ofs_section_of_text(text)', 'public.ofs_file_kind(uuid)', 'public.ofs_rfi_marked(uuid)',
    'public.ofs_item_sent(uuid)', 'public.ofs_may_mark_rfi(uuid)',
    'public.ofs_may_mark_file(uuid)', 'public.ofs_item_json(uuid)']
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
  -- The policies ask these as the reader.
  foreach f in array array['public.ofs_file_readable(uuid)', 'public.ofs_item_may_see(uuid, uuid)'] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;
