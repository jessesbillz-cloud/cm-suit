-- 0090 Outside people see only their own part of the job (Jesse, Oct 5, 7:28 and 7:30 pm, docs/decisions.md):
-- "they shouldn't see any of the other inspection requests unless they're in the OFS or state fire marshal bucket" and,
-- in Files, "There shouldn't be any cross-contamination of photos ... not everything should be transparent between
-- everyone." The fire marshal, special inspectors, subs and foremen are outside people. The owner's rep / CM, the GC
-- team, the inspectors and the architect are inside.
--
--   1. Requests: the requester clause of ir_may_see (0061) now needs ir.request too. Before, anyone who had ever filed
--      a request read it from any role, so a person viewing the job as the fire marshal read the IOR and special
--      requests they had filed. The fire marshal reads OFS requests sent to OFS and nothing else (the existing OFS
--      marker: kind 'ofs' and ofs_sent_at), on every path that asks ir_may_see: the rows, history, cells, maps, comments,
--      the IR files, the permit's record and the calendar.
--   2. A record's files go with the record: a file attached to a request (attachments, result photos, the IR PDF, the
--      map) is readable by whoever reads that request. A special inspection report attached to an OFS request reaches
--      the fire marshal once the request is sent to OFS, and not before. The OFS inspection reports folder stays closed
--      to him (it also holds the maps of requests not sent yet): his IRs and maps reach him through their requests.
--   3. Files: files.read_project now reads the job's documents only: folders whose nearest kind other than general is
--      plans, specs, addenda, DSA 103, CCDs or approved plans. The job's working folders (Photos, Reports, Testing and
--      inspections, folders people make at the top) need the new files.read_records, held by the inside roles that
--      read the job's files today. Outside roles keep their own uploads and any folder whose access list names them.
--      Each author's daily photos folder named files.read_project: it now names files.read_records.
--   4. my_calendar_kinds: per job, the calendar types whose lines the caller could ever see there, so the calendar's
--      type filter shows no type that is always empty for them (the fire marshal: no special inspections, deliveries
--      or due items).
-- Matrix rows are data (CLAUDE.md rule 2): policies and functions ask has_capability only.

-- =====================================================================================================================
-- 1. Requests
-- =====================================================================================================================
create or replace function public.ir_may_see(p_project_id uuid, p_requested_by uuid, p_kind text, p_ofs_sent_at timestamptz)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select coalesce((p_requested_by = auth.uid() and public.has_capability(p_project_id, 'ir.request'))
      or public.has_capability(p_project_id, 'ir.view_all')
      or public.has_capability(p_project_id, 'ir.decide')
      or (p_kind = 'ofs' and p_ofs_sent_at is not null
          and (public.has_capability(p_project_id, 'ir.ofs_view') or public.has_capability(p_project_id, 'ir.ofs_decide'))),
    false);
$$;

-- =====================================================================================================================
-- 2. A record's files go with the record
-- =====================================================================================================================
-- Is this file part of a request the caller reads in full (an attachment, a result photo, the IR PDF or the map)?
create function public.file_on_visible_request(p_file_id uuid, p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(auth.uid() is not null and (
    exists (select 1 from public.inspection_requests r
             where r.project_id = p_project_id and r.deleted_at is null
               and (p_file_id = any (r.attachment_ids) or p_file_id = any (r.result_photo_ids) or r.ir_file_id = p_file_id)
               and public.ir_may_see(r.project_id, r.requested_by, r.kind, r.ofs_sent_at))
    or exists (select 1 from public.ir_maps m
                 join public.inspection_requests r on r.id = m.request_id
                where m.map_file_id = p_file_id and r.project_id = p_project_id and r.deleted_at is null
                  and public.ir_may_see(r.project_id, r.requested_by, r.kind, r.ofs_sent_at))), false);
$$;
revoke execute on function public.file_on_visible_request(uuid, uuid) from public, anon;
grant execute on function public.file_on_visible_request(uuid, uuid) to authenticated, service_role;

alter policy "files: readable" on public.files
  using (deleted_at is null
         and (public.file_may_see(project_id, created_by, folder_id) or public.addendum_file_readable(id)
              or public.file_on_visible_request(id, project_id)));

-- =====================================================================================================================
-- 3. Files: the job's documents for everyone who reads files, its working folders for the inside roles
-- =====================================================================================================================
-- files.read_records: the inside roles that read the job's files today (everyone with files.read_project but the
-- fire marshal, the special inspector, the sub's office and the foreman).
insert into public.role_permissions (role, capability, requires_aal2)
select rp.role, 'files.read_records', false
  from public.role_permissions rp
 where rp.capability = 'files.read_project' and rp.role not in ('ahj', 'special_inspector', 'sub', 'foreman')
on conflict do nothing;

-- Is the folder one of the job's documents? Its own kind, or else the nearest kind above it other than general.
create function public.folder_is_document(p_folder_id uuid)
returns boolean
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
  select coalesce((select up.kind in ('plans', 'specs', 'addenda', 'dsa_103', 'ccd', 'approved_plans') from up
                    where up.kind <> 'general'
                    order by up.depth limit 1), false);
$$;
revoke execute on function public.folder_is_document(uuid) from public, anon;
grant execute on function public.folder_is_document(uuid) to authenticated, service_role;

-- 0076's rule, with files.read_project reading the documents only and files.read_records the rest.
create or replace function public.folder_can_read(p_folder_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare fo public.folders; eff uuid;
begin
  select * into fo from public.folders where id = p_folder_id and deleted_at is null;
  if fo is null or not public.is_member(fo.project_id) then return false; end if;
  if fo.kind = 'bids_received' and not public.bids_open(fo.project_id) then return false; end if;
  eff := public.folder_effective_id(p_folder_id);
  if eff is null then
    return public.has_capability(fo.project_id, 'files.manage') or public.has_capability(fo.project_id, 'files.read_records')
        or (public.has_capability(fo.project_id, 'files.read_project') and public.folder_is_document(fo.id))
        or (public.my_bidder_member_id(fo.project_id) is not null and public.bid_docs_folder(fo.id));
  end if;
  return exists (
    select 1 from public.folder_access fa
    where fa.folder_id = eff and fa.can_read
      and ((fa.user_id = auth.uid()) or (fa.capability is not null and public.has_capability(fo.project_id, fa.capability)))
  );
end;
$$;

-- Each author's daily photos folder: the inside roles read it (the author and dailies.read_all as before).
update public.folder_access set capability = 'files.read_records' where capability = 'files.read_project';

create or replace function public.daily_author_folder(p_project_id uuid, p_author uuid, p_kind text)
returns uuid
language plpgsql
set search_path = public, pg_temp
as $$
declare fid uuid; parent public.folders; base_name text; candidate text; n int := 1;
begin
  perform pg_advisory_xact_lock(hashtextextended('daily_folder:' || p_project_id || ':' || p_author || ':' || p_kind, 0));
  select d.folder_id into fid from public.daily_author_folders d
    join public.folders f on f.id = d.folder_id and f.deleted_at is null
   where d.project_id = p_project_id and d.author_id = p_author and d.kind = p_kind;
  if fid is not null then return fid; end if;

  select * into parent from public.folders
   where project_id = p_project_id and parent_id is null and kind = p_kind and deleted_at is null
   order by created_at limit 1;
  if not found then raise exception 'The job has no % folder', p_kind using errcode = 'P0002'; end if;

  select coalesce(nullif(btrim(p.full_name), ''), split_part(p.email, '@', 1), 'Author') into base_name
    from public.profiles p where p.user_id = p_author;
  base_name := left(coalesce(base_name, 'Author'), 180);
  candidate := base_name;
  while exists (select 1 from public.folders where project_id = p_project_id and parent_id = parent.id and name = candidate) loop
    n := n + 1;
    candidate := base_name || ' (' || n || ')';
  end loop;

  insert into public.folders (org_id, project_id, parent_id, name, kind, created_by)
  values (parent.org_id, p_project_id, parent.id, candidate, p_kind, p_author)
  returning id into fid;
  insert into public.folder_access (folder_id, user_id, can_read, can_write, created_by)
  values (fid, p_author, true, p_kind = 'photos', p_author);
  insert into public.folder_access (folder_id, capability, can_read, can_write, created_by)
  values (fid, 'dailies.read_all', true, false, p_author);
  if p_kind = 'photos' then
    insert into public.folder_access (folder_id, capability, can_read, can_write, created_by) values
      (fid, 'files.read_records', true, false, p_author),
      (fid, 'files.manage', true, true, p_author);
  end if;
  insert into public.daily_author_folders (project_id, author_id, kind, folder_id)
  values (p_project_id, p_author, p_kind, fid)
  on conflict (project_id, author_id, kind) do update set folder_id = excluded.folder_id;
  return fid;
end;
$$;

-- =====================================================================================================================
-- 4. The calendar types a person could ever see on a job
-- =====================================================================================================================
-- Per job (null = all my jobs), the types whose lines the caller could see there, through has_capability. The list is
-- the read capability each module mirrors its lines with (calendar_mirror callers) and the inspections' own test
-- (calendar_inspections): an OFS-only reader never sees a special inspection.
create or replace function public.my_calendar_kinds(p_project_id uuid default null)
returns table (project_id uuid, kinds text[])
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select p.id,
         array(select t.kind
                 from (values
                   (1, 'inspections', '{ir.request,ir.view_all,ir.decide,ir.ofs_view,ir.ofs_decide}'::text[]),
                   (2, 'special_inspections', '{ir.request,ir.view_all,ir.decide}'::text[]),
                   (3, 'deliveries', '{deliveries.view}'::text[]),
                   (4, 'meetings', '{calendar.read,safety.read}'::text[]),
                   (5, 'pours', '{calendar.read}'::text[]),
                   (6, 'milestones', '{calendar.read,permits.read,schedule.read}'::text[]),
                   (7, 'lookahead', '{calendar.read,schedule.read}'::text[]),
                   (8, 'my_due', '{dailies.write,bids.manage,rfi.answer}'::text[])
                 ) as t(ord, kind, caps)
                where exists (select 1 from unnest(t.caps) as c(cap) where public.has_capability(p.id, c.cap))
                order by t.ord)
    from public.projects p
   where p.deleted_at is null
     and public.is_member(p.id)
     and (p_project_id is null or p.id = p_project_id)
   order by p.id;
$$;
revoke execute on function public.my_calendar_kinds(uuid) from public, anon;
grant execute on function public.my_calendar_kinds(uuid) to authenticated, service_role;
