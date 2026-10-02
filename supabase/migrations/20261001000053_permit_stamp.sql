-- 0053 The official stamps the plans, the permit goes live, the stamped set goes out to the job (Jesse, Oct 1: "we
-- should allow them to add their stamp to the plans and then make the permit open or live or whatever, and that set
-- gets distributed"). OSFM does the same in ProjectDox: a stamp on each sheet, the set in an Approved folder, an email.
--   * The edge function permit-stamp stamps one PDF per request (pdf-lib, the ONE stamp module) and stores the copy,
--     clean and server-made, in the job's hidden "Stamping" folder (no one reads or writes it but the server). Then
--     permit_record_stamped_set, run as the official, records the set at once: each stamped file moves into
--     "Approved plans / <permit number>", the earlier set moves to its "Superseded" folder, the permit is issued
--     (unless it already is: a revision keeps its stage) and ONE board line goes to everyone who reads permits.
--   * permit_approved_sets: one row per stamped file (the files stamped together share set_no, numbered by the
--     database per permit), with its content hash (SPEC §6.9: computed by the function from the record's facts, drawn
--     short on every page). Read with permits.read; written only by the RPC; a row never changes except being
--     superseded, once.
--   * Folders, all made on first use and kept by the system (people can't delete or move them, or write into them):
--       Approved plans                 permits.read reads; nobody writes (the server does)
--         <permit number>              the current set (renamed with the permit's number)
--           Superseded                 earlier sets
--         To stamp                     the officials' own uploads to stamp (permits.manage reads and writes)
--         Stamping                     stamped copies not recorded yet (no one; the server only)
--   * A stamped approved file can't be deleted (a legal record), and the issue that came with a set can't be undone.

-- ---------------------------------------------------------------------------------------------------------------------
-- Folder kinds and the reserved name
-- ---------------------------------------------------------------------------------------------------------------------
alter table public.folders drop constraint folders_kind_check;
alter table public.folders add constraint folders_kind_check
  check (kind in ('general', 'plans', 'specs', 'reports', 'bids_received', 'inbound', 'photos', 'transmittals', 'system',
                  'dsa_103', 'ccd', 'ti', 'bid_forms', 'rfis', 'approved_plans', 'permit_uploads', 'stamping'));

-- Same as 0038 plus "Approved plans" at the top of a job.
create or replace function public.folder_name_reserved(p_project_id uuid, p_parent_id uuid, p_name text)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select case
    when p_parent_id is null then btrim(p_name) in ('Bids received', 'Inspection requests', 'Delivery tickets', 'Emailed in',
                                                     'Bid forms', 'RFIs', 'Approved plans')
    else btrim(p_name) = case (select kind from public.folders where id = p_parent_id and project_id = p_project_id)
                           when 'reports' then 'Inspection reports' when 'photos' then 'Corrections' end
  end;
$$;

-- The approved-plans folders stay where the system put them: people (files.manage) may rename them, never move or
-- delete them. Not SECURITY DEFINER on purpose (0030's rule): current_user is 'authenticated' for a person's own call.
create or replace function public.tg_permit_folders_keep()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if current_user in ('authenticated', 'anon') and old.kind in ('approved_plans', 'permit_uploads', 'stamping')
     and (new.parent_id is distinct from old.parent_id or (new.deleted_at is not null and old.deleted_at is null)) then
    raise exception 'The approved plans folders stay where they are.' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke execute on function public.tg_permit_folders_keep() from public, anon, authenticated;
create trigger permit_folders_keep before update of parent_id, deleted_at on public.folders
  for each row execute function public.tg_permit_folders_keep();

-- ---------------------------------------------------------------------------------------------------------------------
-- The permit's folder, and the stamped files
-- ---------------------------------------------------------------------------------------------------------------------
alter table public.permits add column approved_folder_id uuid references public.folders(id);

create table public.permit_approved_sets (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  org_id uuid not null,
  project_id uuid not null,
  permit_id uuid not null,
  -- next_number(project, 'permit_set:<permit>'): the files stamped together share it (1, 2, ...).
  set_no int not null check (set_no > 0),
  -- The order the official picked them in.
  position int not null check (position > 0),
  source_file_id uuid not null references public.files(id),
  stamped_file_id uuid not null references public.files(id),
  stamped_by uuid not null references auth.users(id),
  stamped_at timestamptz not null,
  -- contentHash({kind, permit_id, permit_number, source_file_id, stamped_by, stamped_at}) (_shared/permitStamp.ts).
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  -- The set that replaced it, and when.
  superseded_by int,
  superseded_at timestamptz,
  note text check (note is null or length(note) <= 1000),
  foreign key (permit_id, project_id) references public.permits (id, project_id),
  foreign key (project_id, org_id) references public.projects (id, org_id),
  -- Repeat-safe: a stamped file is recorded once.
  unique (stamped_file_id),
  unique (permit_id, set_no, position),
  unique (permit_id, set_no, source_file_id),
  check (source_file_id <> stamped_file_id),
  check ((superseded_by is null) = (superseded_at is null)),
  check (superseded_by is null or superseded_by > set_no)
);
alter table public.permit_approved_sets enable row level security;
create index permit_approved_sets_permit on public.permit_approved_sets (permit_id, set_no);

-- A stamped file is a record: only its "superseded" mark may be set, once; it is never deleted.
create or replace function public.tg_permit_set_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' or old.superseded_at is not null
     or (to_jsonb(new) - array['superseded_by', 'superseded_at']) is distinct from (to_jsonb(old) - array['superseded_by', 'superseded_at']) then
    raise exception 'A stamped set is a record.' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke execute on function public.tg_permit_set_guard() from public, anon, authenticated;
create trigger set_guard before update or delete on public.permit_approved_sets
  for each row execute function public.tg_permit_set_guard();

-- A stamped approved file stays on file (people can soft-delete their own uploads and files.manage any file).
create or replace function public.tg_files_keep_stamped()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.deleted_at is not null and old.deleted_at is null
     and exists (select 1 from public.permit_approved_sets s where s.stamped_file_id = old.id) then
    raise exception 'A stamped approved file stays on file.' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke execute on function public.tg_files_keep_stamped() from public, anon, authenticated;
create trigger keep_stamped before update of deleted_at on public.files
  for each row execute function public.tg_files_keep_stamped();

create policy "permit_approved_sets: with the permit" on public.permit_approved_sets for select to authenticated
  using (public.has_capability(project_id, 'permits.read')
         and exists (select 1 from public.permits p where p.id = permit_approved_sets.permit_id));
revoke all on public.permit_approved_sets from anon, authenticated;
grant select on public.permit_approved_sets to authenticated;
grant select, insert, update on public.permit_approved_sets to service_role;

-- ---------------------------------------------------------------------------------------------------------------------
-- Internal helpers (not user-callable)
-- ---------------------------------------------------------------------------------------------------------------------
-- What stamping does at a stage: 'issue' where the permit may be issued next (permit_next_stages), 'revise' once it is
-- issued and building, else nothing (before review, complete, cancelled).
create or replace function public.permit_stamp_mode(p_stage text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case when p_stage in ('issued', 'inspections', 'approved') then 'revise'
              when 'issued' = any (public.permit_next_stages(p_stage)) then 'issue' end;
$$;

-- The set's items as rows, in the order given (p_items of permit_record_stamped_set).
create or replace function public.permit_items(p_items jsonb)
returns table (ord int, source_file_id uuid, stamped_file_id uuid, content_hash text, stamped_at timestamptz)
language sql
stable
set search_path = public, pg_temp
as $$
  select e.ord::int, (e.v ->> 'source_file_id')::uuid, (e.v ->> 'stamped_file_id')::uuid, e.v ->> 'content_hash',
         (e.v ->> 'stamped_at')::timestamptz
    from jsonb_array_elements(p_items) with ordinality as e (v, ord);
$$;

-- A system folder under a parent with a free name: the name, else "name (2)", "name (3)" ...
create or replace function public.permit_folder_make(p_project_id uuid, p_parent_id uuid, p_name text, p_kind text, p_sort int)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare p public.projects; v_id uuid; v_try int := 1;
begin
  select * into p from public.projects where id = p_project_id;
  loop
    insert into public.folders (org_id, project_id, parent_id, name, kind, sort, ai_reads, created_by)
    values (p.org_id, p.id, p_parent_id,
            left(btrim(p_name), 190) || case when v_try > 1 then ' (' || v_try || ')' else '' end,
            p_kind, p_sort, p_kind = 'approved_plans', auth.uid())
    on conflict do nothing
    returning id into v_id;
    exit when v_id is not null;
    v_try := v_try + 1;
    if v_try > 50 then raise exception 'No free folder name for %.', p_name using errcode = '23505'; end if;
  end loop;
  return v_id;
end;
$$;

-- One folder of a kind under a parent (null = the top of the job), made with its access list when missing, revived when
-- deleted. Access: (capability, can_read, can_write), or no capability for a folder that inherits.
create or replace function public.permit_folder_ensure(
  p_project_id uuid, p_parent_id uuid, p_kind text, p_name text, p_sort int, p_cap text, p_read boolean, p_write boolean
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_id uuid; v_deleted timestamptz;
begin
  select f.id, f.deleted_at into v_id, v_deleted
    from public.folders f
   where f.project_id = p_project_id and f.kind = p_kind and f.parent_id is not distinct from p_parent_id
   order by (f.deleted_at is null) desc, f.created_at, f.id
   limit 1;
  if v_id is null then
    v_id := public.permit_folder_make(p_project_id, p_parent_id, p_name, p_kind, p_sort);
    if p_cap is not null then
      insert into public.folder_access (folder_id, capability, can_read, can_write, created_by)
      values (v_id, p_cap, p_read, p_write, auth.uid());
    end if;
  elsif v_deleted is not null then
    update public.folders set deleted_at = null where id = v_id;
  end if;
  return v_id;
end;
$$;

-- The job's "Approved plans" (permits.read reads, nobody writes).
create or replace function public.permit_approved_root(p_project_id uuid)
returns uuid
language sql
security definer
set search_path = public, pg_temp
as $$
  select public.permit_folder_ensure(p_project_id, null, 'approved_plans', 'Approved plans', 25, 'permits.read', true, false);
$$;

-- The permit's own folder under "Approved plans", named by its number (permits.approved_folder_id once made).
create or replace function public.permit_set_folder(p_permit_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare r public.permits; v_root uuid; v_deleted timestamptz; v_id uuid;
begin
  select * into r from public.permits where id = p_permit_id;
  perform pg_advisory_xact_lock(hashtext('permit_folders:' || r.project_id::text));
  v_root := public.permit_approved_root(r.project_id);
  if r.approved_folder_id is not null then
    select deleted_at into v_deleted from public.folders where id = r.approved_folder_id;
    if v_deleted is not null then update public.folders set deleted_at = null where id = r.approved_folder_id; end if;
    return r.approved_folder_id;
  end if;
  v_id := public.permit_folder_make(r.project_id, v_root, r.primary_number, 'approved_plans', 100);
  return v_id;
end;
$$;

-- A permit's new number renames its folder (to a free name).
create or replace function public.tg_permit_folder_name()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare f public.folders; v_try int := 1; v_name text;
begin
  if new.approved_folder_id is null or new.primary_number = old.primary_number then return null; end if;
  select * into f from public.folders where id = new.approved_folder_id;
  loop
    v_name := left(new.primary_number, 190) || case when v_try > 1 then ' (' || v_try || ')' else '' end;
    exit when v_name = f.name or not exists (
      select 1 from public.folders o where o.project_id = f.project_id and o.parent_id is not distinct from f.parent_id
                                       and o.name = v_name and o.id <> f.id);
    v_try := v_try + 1;
    if v_try > 50 then return null; end if;
  end loop;
  if v_name <> f.name then update public.folders set name = v_name where id = f.id; end if;
  return null;
end;
$$;
revoke execute on function public.tg_permit_folder_name() from public, anon, authenticated;
create trigger permit_folder_name after update of primary_number on public.permits
  for each row execute function public.tg_permit_folder_name();

-- ---------------------------------------------------------------------------------------------------------------------
-- What the official calls (and the edge function, as the official)
-- ---------------------------------------------------------------------------------------------------------------------
-- The job's "To stamp" (the officials' uploads) and "Stamping" (the server's) folders, made on first use.
create or replace function public.permit_stamp_folders(p_permit_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare r public.permits; v_root uuid; v_uploads uuid; v_staging uuid;
begin
  select * into r from public.permits where id = p_permit_id and deleted_at is null;
  if r.id is null or not public.has_capability(r.project_id, 'permits.read') then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if not public.has_capability(r.project_id, 'permits.manage') then raise exception 'forbidden' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtext('permit_folders:' || r.project_id::text));
  v_root := public.permit_approved_root(r.project_id);
  v_uploads := public.permit_folder_ensure(r.project_id, v_root, 'permit_uploads', 'To stamp', 10, 'permits.manage', true, true);
  v_staging := public.permit_folder_ensure(r.project_id, v_root, 'stamping', 'Stamping', 950, 'permits.manage', false, false);
  return jsonb_build_object('uploads', v_uploads, 'staging', v_staging);
end;
$$;

-- The source PDF of one stamp, for the official (permits.manage) on a permit that may be stamped now: a PDF on the
-- same job, not a stamped copy, through authorize_download as the caller (the download gate: folder access,
-- view-only, the scan rules; logged). Returns what the function needs to read it.
create or replace function public.permit_stamp_source(p_permit_id uuid, p_file_id uuid)
returns table (storage_path text, original_name text, mime text, size bigint)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare r public.permits; f public.files; v_kind text;
begin
  select * into r from public.permits where id = p_permit_id and deleted_at is null;
  if r.id is null or not public.has_capability(r.project_id, 'permits.read') then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if not public.has_capability(r.project_id, 'permits.manage') then raise exception 'forbidden' using errcode = '42501'; end if;
  if public.permit_stamp_mode(r.stage) is null then
    raise exception 'This permit can''t be stamped now.' using errcode = '22023';
  end if;
  select * into f from public.files where id = p_file_id and deleted_at is null;
  if f.id is null or f.project_id <> r.project_id then raise exception 'not_found' using errcode = 'P0002'; end if;
  if lower(f.original_name) !~ '\.pdf$' then raise exception 'Only PDFs can be stamped.' using errcode = '22023'; end if;
  select kind into v_kind from public.folders where id = f.folder_id;
  if v_kind in ('approved_plans', 'stamping') then
    raise exception 'Pick the original, not a stamped copy.' using errcode = '22023';
  end if;
  return query select a.storage_path, a.original_name, a.mime, f.size from public.authorize_download(f.id, 'original') a;
end;
$$;

-- The PDFs on the permit's job the official may stamp (what the download gate would hand them), plan folders first,
-- then their uploads: not stamped copies, not older versions, not unfinished uploads.
create or replace function public.permit_stamp_sources(p_permit_id uuid)
returns table (id uuid, name text, size bigint, folder_id uuid, folder_name text, folder_kind text, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare r public.permits;
begin
  select * into r from public.permits where id = p_permit_id and deleted_at is null;
  if r.id is null or not public.has_capability(r.project_id, 'permits.read') then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if not public.has_capability(r.project_id, 'permits.manage') then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
    select f.id, f.original_name, f.size, f.folder_id, fo.name, fo.kind, f.created_at
      from public.files f
      join public.folders fo on fo.id = f.folder_id and fo.deleted_at is null
     where f.project_id = r.project_id and f.deleted_at is null and f.superseded_by is null and f.upload_complete
       and fo.kind not in ('approved_plans', 'stamping')
       and lower(f.original_name) ~ '\.pdf$'
       and public.file_may_see(f.project_id, f.created_by, f.folder_id)
       and f.scan_status <> 'infected' and (f.scan_status <> 'pending' or f.created_by = auth.uid())
       and (not fo.view_only or public.has_capability(f.project_id, 'files.manage'))
     order by case fo.kind when 'plans' then 0 when 'permit_uploads' then 1 else 2 end, fo.sort, lower(fo.name),
              lower(f.original_name), f.id
     limit 2000;
end;
$$;

-- The set, at once (the official, after a fresh sign-in): p_items = [{source_file_id, stamped_file_id, content_hash,
-- stamped_at}], each stamped file one this job's "Stamping" folder holds, made for the caller (only the server writes
-- there). The earlier set is superseded and moves to "Superseded"; the files move to the permit's folder; the permit is
-- issued like permit_move does it (issue day = today on the job's clock unless set, expiry 12 months on unless set)
-- when it isn't yet, else its stage stays; audit; ONE board line for everyone who reads permits. The same set again
-- returns the first answer.
create or replace function public.permit_record_stamped_set(p_permit_id uuid, p_version int, p_items jsonb, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r public.permits; v_uid uuid := auth.uid(); v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_n int; v_known int; v_sets int; v_set int; v_mode text; v_folder uuid; v_old uuid; v_prior jsonb; v_issued date;
  v_bad text; v_label text;
begin
  if not public.signed_in_recently() then
    raise exception 'reauth_required: sign in again to stamp' using errcode = '42501';
  end if;
  r := public.permit_lock(p_permit_id, null);
  if not public.has_capability(r.project_id, 'permits.manage') then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Pick the files to stamp.' using errcode = '22023';
  end if;
  v_n := jsonb_array_length(p_items);
  if v_n > 200 then raise exception 'Up to 200 files in one set.' using errcode = '22023'; end if;

  -- The same set again (a retry after it went through): the first answer.
  select count(*), count(distinct s.set_no) into v_known, v_sets
    from public.permit_approved_sets s join public.permit_items(p_items) i on i.stamped_file_id = s.stamped_file_id;
  if v_known > 0 then
    select max(s.set_no) into v_set
      from public.permit_approved_sets s join public.permit_items(p_items) i on i.stamped_file_id = s.stamped_file_id
     where s.permit_id = r.id;
    if v_known = v_n and v_sets = 1 and v_set is not null
       and (select count(*) from public.permit_approved_sets where permit_id = r.id and set_no = v_set) = v_n then
      return jsonb_build_object('permit', to_jsonb(r), 'set_no', v_set, 'files', v_n,
                                'issued', exists (select 1 from public.permit_stage_events e where e.permit_id = r.id
                                                    and e.stage = 'issued' and e.undone_at is null
                                                    and e.at = (select min(s.created_at) from public.permit_approved_sets s
                                                                 where s.permit_id = r.id and s.set_no = v_set)));
    end if;
    raise exception 'Some of these files are already recorded.' using errcode = '22023';
  end if;

  if p_version is null or r.version <> p_version then
    raise exception 'version_conflict: expected %, found %', p_version, r.version using errcode = '40001';
  end if;
  v_mode := public.permit_stamp_mode(r.stage);
  if v_mode is null then raise exception 'This permit can''t be stamped now.' using errcode = '22023'; end if;
  if length(coalesce(v_note, '')) > 1000 then raise exception 'Keep the note to 1000 characters.' using errcode = '22023'; end if;

  -- Each item: well formed; each file once.
  if exists (select 1 from public.permit_items(p_items)
              where source_file_id is null or stamped_file_id is null or stamped_at is null
                 or coalesce(content_hash, '') !~ '^[0-9a-f]{64}$'
                 or stamped_at > now() + interval '1 minute' or stamped_at < now() - interval '1 day') then
    raise exception 'A stamped file is missing its details. Stamp it again.' using errcode = '22023';
  end if;
  if (select count(distinct stamped_file_id) from public.permit_items(p_items)) <> v_n
     or (select count(distinct source_file_id) from public.permit_items(p_items)) <> v_n then
    raise exception 'Each file once.' using errcode = '22023';
  end if;
  -- The stamped copies: server-made for me, on this job, waiting in "Stamping".
  if exists (select 1 from public.permit_items(p_items) i
               left join public.files f on f.id = i.stamped_file_id and f.deleted_at is null
               left join public.folders fo on fo.id = f.folder_id
              where f.id is null or f.project_id <> r.project_id or fo.kind is distinct from 'stamping'
                 or f.created_by is distinct from v_uid or lower(f.mime) <> 'application/pdf'
                 or f.created_at < i.stamped_at - interval '1 minute'
                 or f.created_at > i.stamped_at + interval '15 minutes') then
    raise exception 'A stamped file is missing. Stamp it again.' using errcode = '22023';
  end if;
  -- The originals: on this job, mine to read, not stamped copies themselves.
  select coalesce(f.original_name, 'A file') into v_bad
    from public.permit_items(p_items) i
    left join public.files f on f.id = i.source_file_id and f.deleted_at is null
    left join public.folders fo on fo.id = f.folder_id
   where f.id is null or f.project_id <> r.project_id or fo.kind in ('approved_plans', 'stamping')
      or not public.file_may_see(f.project_id, f.created_by, f.folder_id)
   limit 1;
  if v_bad is not null then raise exception '% can''t be in this set.', v_bad using errcode = '22023'; end if;

  v_folder := public.permit_set_folder(r.id);
  v_set := public.next_number(r.project_id, 'permit_set:' || r.id::text);

  -- The earlier set: superseded, into "Superseded".
  if exists (select 1 from public.permit_approved_sets where permit_id = r.id and superseded_at is null) then
    v_old := public.permit_folder_ensure(r.project_id, v_folder, 'approved_plans', 'Superseded', 900, null, false, false);
    update public.files set folder_id = v_old
     where id in (select stamped_file_id from public.permit_approved_sets where permit_id = r.id and superseded_at is null);
    update public.permit_approved_sets set superseded_by = v_set, superseded_at = now()
     where permit_id = r.id and superseded_at is null;
  end if;

  insert into public.permit_approved_sets (org_id, project_id, permit_id, set_no, position, source_file_id, stamped_file_id,
                                           stamped_by, stamped_at, content_hash, note)
  select r.org_id, r.project_id, r.id, v_set, i.ord, i.source_file_id, i.stamped_file_id, v_uid, i.stamped_at,
         i.content_hash, v_note
    from public.permit_items(p_items) i;
  update public.files set folder_id = v_folder where id in (select stamped_file_id from public.permit_items(p_items));

  -- Issued (permit_move's rules and event, without its board line: the set's line says it), or the stage stays.
  v_prior := jsonb_build_object('issued_on', r.issued_on, 'expires_on', r.expires_on);
  v_issued := coalesce(r.issued_on, public.permit_today(r.project_id));
  if v_mode = 'issue' then
    update public.permits
       set stage = 'issued', stage_since = now(), issued_on = v_issued,
           expires_on = coalesce(r.expires_on, (v_issued + interval '12 months')::date), approved_folder_id = v_folder
     where id = r.id
     returning * into r;
    insert into public.permit_stage_events (permit_id, project_id, org_id, stage, at, actor, note, prior)
    values (r.id, r.project_id, r.org_id, r.stage, r.stage_since, v_uid,
            'Approved set ' || v_set || ': ' || v_n || case when v_n = 1 then ' file' else ' files' end, v_prior);
    perform public.audit('permit.move', 'permit', r.id, r.project_id, r.org_id,
                         jsonb_build_object('number', r.primary_number, 'stage', r.stage, 'set', v_set));
  elsif r.approved_folder_id is distinct from v_folder then
    update public.permits set approved_folder_id = v_folder where id = r.id returning * into r;
  end if;

  perform public.audit('permit.approved_set', 'permit', r.id, r.project_id, r.org_id,
    jsonb_build_object('number', r.primary_number, 'set', v_set, 'files', v_n, 'issued', v_mode = 'issue', 'note', v_note,
                       'items', (select jsonb_agg(jsonb_build_object('source', source_file_id, 'stamped', stamped_file_id,
                                                                     'hash', content_hash) order by ord)
                                   from public.permit_items(p_items))));
  v_label := v_n || case when v_n = 1 then ' file' else ' files' end;
  perform public.post_activity(r.project_id, 'permit.approved_set',
    public.permit_label(r.primary_number)
      || case when v_mode = 'issue' then ' issued: approved set (' || v_label || ')'
              else ': approved set revised (' || v_label || ')' end,
    'permit', r.id, 'permits.read');
  return jsonb_build_object('permit', to_jsonb(r), 'set_no', v_set, 'files', v_n, 'issued', v_mode = 'issue');
end;
$$;

-- A permit's approved sets for everyone who reads permits, newest first, each with its files (current: no superseded
-- date), and what I may do: 'issue' or 'revise' for the official when the stage allows, else null.
create or replace function public.permit_approved(p_permit_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare r public.permits;
begin
  select * into r from public.permits where id = p_permit_id and deleted_at is null;
  if r.id is null or not public.has_capability(r.project_id, 'permits.read') then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  return jsonb_build_object(
    'stamp', case when public.has_capability(r.project_id, 'permits.manage') then public.permit_stamp_mode(r.stage) end,
    'sets', coalesce((
      select jsonb_agg(x.v order by x.set_no desc)
        from (select s.set_no,
                     jsonb_build_object(
                       'set_no', s.set_no, 'stamped_at', max(s.stamped_at),
                       'stamped_by_name', public.rfi_person_name(min(s.stamped_by::text)::uuid),
                       'note', min(s.note), 'superseded_at', min(s.superseded_at),
                       'files', jsonb_agg(jsonb_build_object('file_id', s.stamped_file_id, 'name', f.original_name,
                                                             'size', f.size, 'source_name', src.original_name,
                                                             'content_hash', s.content_hash)
                                          order by s.position)) as v
                from public.permit_approved_sets s
                join public.files f on f.id = s.stamped_file_id
                left join public.files src on src.id = s.source_file_id
               where s.permit_id = r.id
               group by s.set_no) x), '[]'::jsonb));
end;
$$;

-- Undo of a move: same as 0052, except the issue that came with a stamped set (a signed record) stays.
create or replace function public.permit_undo_move(p_permit_id uuid, p_version int)
returns public.permits
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare r public.permits; e public.permit_stage_events; prev public.permit_stage_events;
begin
  r := public.permit_lock(p_permit_id, p_version);
  if not public.has_capability(r.project_id, 'permits.manage') then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into e from public.permit_stage_events
   where permit_id = r.id and undone_at is null order by at desc, id desc limit 1;
  select * into prev from public.permit_stage_events
   where permit_id = r.id and undone_at is null and id <> e.id order by at desc, id desc limit 1;
  if e.id is null or prev.id is null or e.stage <> r.stage or e.actor is distinct from auth.uid()
     or e.at < now() - interval '15 minutes'
     or exists (select 1 from public.permit_approved_sets s where s.permit_id = r.id and s.created_at >= e.at) then
    raise exception 'That move can''t be undone now.' using errcode = '22023';
  end if;
  update public.permit_stage_events set undone_at = now(), undone_by = auth.uid() where id = e.id;
  update public.permits
     set stage = prev.stage, stage_since = prev.at,
         issued_on = case when e.prior ? 'issued_on' then (e.prior ->> 'issued_on')::date else r.issued_on end,
         expires_on = case when e.prior ? 'expires_on' then (e.prior ->> 'expires_on')::date else r.expires_on end
   where id = r.id
   returning * into r;
  perform public.audit('permit.undo_move', 'permit', r.id, r.project_id, r.org_id,
                       jsonb_build_object('number', r.primary_number, 'stage', r.stage, 'undone', e.stage));
  perform public.post_activity(r.project_id, 'permit.stage',
    left(public.permit_label(r.primary_number) || ' back to ' || lower(public.permit_stage_label(r.stage)) || ': '
         || r.title, 500), 'permit', r.id, 'permits.read');
  return r;
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------------
-- Grants: the RPCs people call. Everything else above is internal.
-- ---------------------------------------------------------------------------------------------------------------------
do $$
declare f text;
begin
  foreach f in array array[
    'public.permit_stamp_folders(uuid)', 'public.permit_stamp_source(uuid, uuid)', 'public.permit_stamp_sources(uuid)',
    'public.permit_record_stamped_set(uuid, integer, jsonb, text)', 'public.permit_approved(uuid)',
    'public.permit_undo_move(uuid, integer)']
  loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
  foreach f in array array[
    'public.permit_stamp_mode(text)', 'public.permit_items(jsonb)', 'public.permit_folder_make(uuid, uuid, text, text, integer)',
    'public.permit_folder_ensure(uuid, uuid, text, text, integer, text, boolean, boolean)',
    'public.permit_approved_root(uuid)', 'public.permit_set_folder(uuid)']
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
