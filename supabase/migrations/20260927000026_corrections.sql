-- 0026 Corrections log / punchlist (SPEC §13.4; MDR process notes §4).
--   * corrections: one row per CN item. The number comes from next_number(project, 'cn'), unique per job, shown CN-001.
--   * correction_history: append-only (who, what, note, photos, when). Written only by the RPCs below and the edit trigger.
--   * Status: open -> ready (corrections.mark_ready: GC or sub) -> corrected / signed_off / reopened (corrections.close
--     only: the inspector). Checked in set_correction_status AND by a trigger on the table, so no path skips it.
--   * Undo instead of "are you sure": undo_correction reverts the caller's own latest step (or the create) for 15 minutes.
--   * Photos live in the job's Photos/Corrections folder: readable with corrections.view, writable by the people who
--     create, mark ready or close. Marking ready carries up to 6 photos.
--   * Board: a new item is a line for the people who fix (corrections.mark_ready); "ready" is a line plus a task for each
--     inspector (corrections.close); a decision is a line for the creator and the person who marked it ready.

-- ---------------------------------------------------------------------------
-- Capabilities (data, SPEC §5.2). corrections.close (inspector) exists since 0001.
-- ---------------------------------------------------------------------------
insert into public.role_permissions (role, capability, requires_aal2) values
  ('project_admin', 'corrections.view', false), ('pm', 'corrections.view', false), ('pe', 'corrections.view', false),
  ('superintendent', 'corrections.view', false), ('foreman', 'corrections.view', false), ('inspector', 'corrections.view', false),
  ('special_inspector', 'corrections.view', false), ('sub', 'corrections.view', false), ('architect', 'corrections.view', false),
  ('owner_rep', 'corrections.view', false), ('viewer', 'corrections.view', false),
  ('project_admin', 'corrections.create', false), ('pm', 'corrections.create', false), ('pe', 'corrections.create', false),
  ('superintendent', 'corrections.create', false), ('inspector', 'corrections.create', false),
  ('project_admin', 'corrections.mark_ready', false), ('pm', 'corrections.mark_ready', false), ('pe', 'corrections.mark_ready', false),
  ('superintendent', 'corrections.mark_ready', false), ('foreman', 'corrections.mark_ready', false), ('sub', 'corrections.mark_ready', false)
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- corrections
-- ---------------------------------------------------------------------------
create table public.corrections (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id),
  version int not null default 1,
  deleted_at timestamptz,
  org_id uuid not null,
  project_id uuid not null,
  number int not null check (number > 0),
  title text not null check (length(btrim(title)) between 1 and 300),
  description text not null default '' check (length(description) <= 8000),
  photo_ids uuid[] not null default '{}' check (cardinality(photo_ids) <= 12),
  status text not null default 'open' check (status in ('open', 'ready', 'corrected', 'signed_off', 'reopened')),
  trade text not null default '' check (length(trade) <= 100),
  location text not null default '' check (length(location) <= 200),
  spec_tags text[] not null default '{}' check (cardinality(spec_tags) <= 20),
  -- The formal notice: a file on the job, or a reference (e.g. the notice number on the agency's form).
  notice_file_id uuid references public.files(id),
  notice_ref text not null default '' check (length(notice_ref) <= 300),
  status_changed_at timestamptz not null default now(),
  closed_at timestamptz,
  -- Makes a create safe to repeat: the same request from the same person returns the same item (and number).
  request_key text not null check (length(request_key) between 8 and 100),
  foreign key (project_id, org_id) references public.projects (id, org_id),
  unique (project_id, number),
  unique (project_id, created_by, request_key),
  check ((closed_at is not null) = (status in ('corrected', 'signed_off')))
);
alter table public.corrections enable row level security;
create trigger touch before update on public.corrections for each row execute function public.tg_touch_row();
create trigger no_delete before delete on public.corrections for each row execute function public.tg_block_delete();
create trigger audit_row after insert or update on public.corrections for each row execute function public.tg_audit_row();
insert into public.owner_lookup (entity_type, table_name) values ('correction', 'corrections') on conflict do nothing;

create table public.correction_history (
  id uuid primary key default gen_random_uuid(),
  seq bigint generated always as identity,
  created_at timestamptz not null default clock_timestamp(),
  org_id uuid not null,
  project_id uuid not null,
  correction_id uuid not null references public.corrections(id),
  actor_user_id uuid references auth.users(id),
  action text not null check (action in ('created', 'edited', 'ready', 'corrected', 'signed_off', 'reopened', 'undone')),
  from_status text,
  to_status text,
  note text not null default '' check (length(note) <= 4000),
  photo_ids uuid[] not null default '{}' check (cardinality(photo_ids) <= 6),
  -- The item's closed_at before this step, so an undo puts back the real date closed.
  prev_closed_at timestamptz,
  undoes uuid references public.correction_history(id),
  foreign key (project_id, org_id) references public.projects (id, org_id)
);
alter table public.correction_history enable row level security;
create index correction_history_item on public.correction_history (correction_id, seq);

create or replace function public.tg_correction_history_immutable()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if not public.is_service_role() then
    raise exception 'correction history is append-only' using errcode = '42501';
  end if;
  return coalesce(old, new);
end;
$$;
revoke execute on function public.tg_correction_history_immutable() from public, anon, authenticated;
create trigger immutable before update or delete on public.correction_history
  for each row execute function public.tg_correction_history_immutable();

-- RLS: whoever holds corrections.view on the job reads the log and its history. Edits: the creator (while they may
-- still create) or an inspector. Nobody inserts or changes status directly; the RPCs below do.
create policy "corrections: viewers read" on public.corrections for select to authenticated
  using (deleted_at is null and public.has_capability(project_id, 'corrections.view'));
create policy "corrections: creator or inspector edits" on public.corrections for update to authenticated
  using (deleted_at is null
         and ((created_by = auth.uid() and public.has_capability(project_id, 'corrections.create'))
              or public.has_capability(project_id, 'corrections.close')))
  with check ((created_by = auth.uid() and public.has_capability(project_id, 'corrections.create'))
              or public.has_capability(project_id, 'corrections.close'));
create policy "correction_history: viewers read" on public.correction_history for select to authenticated
  using (public.has_capability(project_id, 'corrections.view'));

revoke all on public.corrections, public.correction_history from anon, authenticated;
grant select on public.corrections, public.correction_history to authenticated;
grant update (title, description, trade, location, spec_tags, photo_ids, notice_file_id, notice_ref)
  on public.corrections to authenticated;
grant select, insert, update, delete on public.corrections, public.correction_history to service_role;
revoke all on sequence public.correction_history_seq_seq from anon, authenticated;
grant usage, select on sequence public.correction_history_seq_seq to service_role;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
-- CN-001 ... CN-999, then CN-1000 (never truncated).
create or replace function public.correction_label(p_number int)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select 'CN-' || case when p_number < 1000 then lpad(p_number::text, 3, '0') else p_number::text end;
$$;
revoke execute on function public.correction_label(int) from public, anon, authenticated;
grant execute on function public.correction_label(int) to service_role;

-- Files may be attached only when they are this job's, finished uploading, readable by the caller, and (for photos)
-- images. No repeats.
create or replace function public.correction_files_ok(p_project_id uuid, p_ids uuid[], p_images_only boolean)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select cardinality(coalesce(p_ids, '{}')) = (select count(distinct x) from unnest(coalesce(p_ids, '{}')) x)
     and not exists (
       select 1 from unnest(coalesce(p_ids, '{}')) as x (id)
       where not exists (
         select 1 from public.files f
         where f.id = x.id and f.project_id = p_project_id and f.deleted_at is null and f.upload_complete
           and (not p_images_only or f.mime like 'image/%')
           and (public.is_service_role() or (f.created_by = auth.uid() and public.is_member(p_project_id))
                or public.folder_can_read(f.folder_id))));
$$;
revoke execute on function public.correction_files_ok(uuid, uuid[], boolean) from public, anon, authenticated;
grant execute on function public.correction_files_ok(uuid, uuid[], boolean) to service_role;

-- Guard on every write: tidy the text, check attached files, and enforce who may move the status. The one exception is
-- undo_correction putting back a status the caller's own step replaced (a transaction-local flag it sets and clears).
create or replace function public.tg_corrections_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare added uuid[];
begin
  new.title := btrim(new.title);
  new.trade := btrim(new.trade);
  new.location := btrim(new.location);
  new.notice_ref := btrim(new.notice_ref);
  new.spec_tags := array(select distinct t from (select left(btrim(x), 60) as t from unnest(new.spec_tags) x) q
                         where t <> '' order by t);
  added := case when tg_op = 'INSERT' then new.photo_ids
                else array(select x from unnest(new.photo_ids) x where not (x = any (old.photo_ids))) end;
  if cardinality(added) > 0 and not public.correction_files_ok(new.project_id, new.photo_ids, true) then
    raise exception 'A photo is not one of this job''s photos.' using errcode = '22023';
  end if;
  if new.notice_file_id is not null and (tg_op = 'INSERT' or new.notice_file_id is distinct from old.notice_file_id)
     and not public.correction_files_ok(new.project_id, array[new.notice_file_id], false) then
    raise exception 'The notice is not a file on this job.' using errcode = '22023';
  end if;
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    new.status_changed_at := now();
    if not public.is_service_role() and coalesce(current_setting('app.correction_undo', true), '') <> new.id::text then
      if new.status in ('corrected', 'signed_off', 'reopened') and not public.has_capability(new.project_id, 'corrections.close') then
        raise exception 'Only the inspector can close or reopen a correction.' using errcode = '42501';
      elsif new.status = 'ready' and not public.has_capability(new.project_id, 'corrections.mark_ready') then
        raise exception 'forbidden' using errcode = '42501';
      elsif new.status = 'open' then
        raise exception 'Only undo returns an item to open.' using errcode = '42501';
      end if;
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function public.tg_corrections_guard() from public, anon, authenticated;
create trigger guard before insert or update on public.corrections for each row execute function public.tg_corrections_guard();

-- Edits (not status steps) leave a history line.
create or replace function public.tg_corrections_edited()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.deleted_at is null
     and row(new.title, new.description, new.trade, new.location, new.spec_tags, new.photo_ids, new.notice_file_id, new.notice_ref)
         is distinct from
         row(old.title, old.description, old.trade, old.location, old.spec_tags, old.photo_ids, old.notice_file_id, old.notice_ref) then
    insert into public.correction_history (org_id, project_id, correction_id, actor_user_id, action, from_status, to_status)
    values (new.org_id, new.project_id, new.id, auth.uid(), 'edited', new.status, new.status);
  end if;
  return null;
end;
$$;
revoke execute on function public.tg_corrections_edited() from public, anon, authenticated;
create trigger edited after update on public.corrections for each row execute function public.tg_corrections_edited();

-- A task for each inspector (corrections.close) who has no open one for this item yet.
create or replace function public.correction_reinspect_tasks(p_correction public.corrections)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare u uuid;
begin
  for u in
    select distinct pm.user_id from public.project_members pm
    join public.role_permissions rp on rp.role = pm.role and rp.capability = 'corrections.close'
    where pm.project_id = p_correction.project_id and pm.status = 'active' and pm.user_id is not null
      and (pm.access_ends_at is null or pm.access_ends_at > now())
      and not exists (select 1 from public.tasks t
                      where t.project_id = p_correction.project_id and t.assignee_user_id = pm.user_id
                        and t.entity_type = 'correction' and t.entity_id = p_correction.id and t.kind = 'correction.reinspect'
                        and t.done_at is null and t.deleted_at is null)
  loop
    perform public.create_task(p_correction.project_id, u, 'correction.reinspect',
      left('Re-inspect ' || public.correction_label(p_correction.number) || ': ' || p_correction.title, 300),
      'correction', p_correction.id);
  end loop;
end;
$$;
revoke execute on function public.correction_reinspect_tasks(public.corrections) from public, anon, authenticated;
grant execute on function public.correction_reinspect_tasks(public.corrections) to service_role;

-- ---------------------------------------------------------------------------
-- correction_photo_folder(project): the job's Photos/Corrections folder (made on first use), for photo uploads.
-- ---------------------------------------------------------------------------
create or replace function public.correction_photo_folder(p_project_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_org uuid; v_parent uuid; v_id uuid;
begin
  if not (public.has_capability(p_project_id, 'corrections.create') or public.has_capability(p_project_id, 'corrections.mark_ready')
          or public.has_capability(p_project_id, 'corrections.close')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select org_id into v_org from public.projects where id = p_project_id and deleted_at is null;
  if v_org is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  select id into v_parent from public.folders
   where project_id = p_project_id and kind = 'photos' and parent_id is null and deleted_at is null
   order by created_at limit 1;
  select id into v_id from public.folders
   where project_id = p_project_id and parent_id is not distinct from v_parent and name = 'Corrections';
  if v_id is null then
    insert into public.folders (org_id, project_id, parent_id, name, kind, created_by)
    values (v_org, p_project_id, v_parent, 'Corrections', 'photos', auth.uid())
    on conflict (project_id, parent_id, name) do nothing
    returning id into v_id;
    if v_id is null then  -- someone made it a moment ago
      select id into v_id from public.folders
       where project_id = p_project_id and parent_id is not distinct from v_parent and name = 'Corrections';
    end if;
  end if;
  update public.folders set deleted_at = null where id = v_id and deleted_at is not null;
  -- The folder's own access list, unless someone already set one (a list people changed is left as they set it).
  if not exists (select 1 from public.folder_access where folder_id = v_id) then
    insert into public.folder_access (folder_id, capability, can_read, can_write, created_by) values
      (v_id, 'corrections.view', true, false, auth.uid()),
      (v_id, 'corrections.create', true, true, auth.uid()),
      (v_id, 'corrections.mark_ready', true, true, auth.uid()),
      (v_id, 'corrections.close', true, true, auth.uid())
    on conflict do nothing;
  end if;
  return v_id;
end;
$$;
revoke execute on function public.correction_photo_folder(uuid) from public, anon;
grant execute on function public.correction_photo_folder(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- create_correction: the one way an item is made. Safe to repeat with the same request key.
-- ---------------------------------------------------------------------------
create or replace function public.create_correction(
  p_project_id uuid,
  p_title text,
  p_request_key text,
  p_description text default '',
  p_trade text default '',
  p_location text default '',
  p_spec_tags text[] default '{}',
  p_photo_ids uuid[] default '{}',
  p_notice_file_id uuid default null,
  p_notice_ref text default ''
)
returns public.corrections
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare c public.corrections; v_org uuid;
begin
  if not public.has_capability(p_project_id, 'corrections.create') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtext('create_correction:' || auth.uid()::text || ':' || coalesce(p_request_key, '')));
  select * into c from public.corrections
   where project_id = p_project_id and created_by = auth.uid() and request_key = p_request_key;
  if c.id is not null then return c; end if;

  select org_id into v_org from public.projects where id = p_project_id;
  insert into public.corrections (org_id, project_id, number, title, description, trade, location, spec_tags, photo_ids,
                                  notice_file_id, notice_ref, created_by, request_key)
  values (v_org, p_project_id, public.next_number(p_project_id, 'cn'), coalesce(p_title, ''), coalesce(p_description, ''),
          coalesce(p_trade, ''), coalesce(p_location, ''), coalesce(p_spec_tags, '{}'), coalesce(p_photo_ids, '{}'),
          p_notice_file_id, coalesce(p_notice_ref, ''), auth.uid(), p_request_key)
  returning * into c;
  insert into public.correction_history (org_id, project_id, correction_id, actor_user_id, action, to_status)
  values (c.org_id, c.project_id, c.id, auth.uid(), 'created', c.status);
  perform public.post_activity(c.project_id, 'correction.opened',
    left(public.correction_label(c.number) || ' opened: ' || c.title, 500), 'correction', c.id, 'corrections.mark_ready');
  return c;
end;
$$;
revoke execute on function public.create_correction(uuid, text, text, text, text, text, text[], uuid[], uuid, text) from public, anon;
grant execute on function public.create_correction(uuid, text, text, text, text, text, text[], uuid[], uuid, text)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- set_correction_status: mark ready (corrections.mark_ready) or decide (corrections.close), with a note and photos.
-- ---------------------------------------------------------------------------
create or replace function public.set_correction_status(
  p_id uuid,
  p_version int,
  p_status text,
  p_note text default '',
  p_photo_ids uuid[] default '{}'
)
returns public.corrections
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare c public.corrections; v_from text; v_prev_closed timestamptz; v_marker uuid; v_to uuid[]; v_label text;
begin
  select * into c from public.corrections where id = p_id and deleted_at is null for update;
  if c.id is null or not public.has_capability(c.project_id, 'corrections.view') then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if p_status = 'ready' then
    if not public.has_capability(c.project_id, 'corrections.mark_ready') then
      raise exception 'forbidden' using errcode = '42501';
    end if;
  elsif p_status in ('corrected', 'signed_off', 'reopened') then
    if not public.has_capability(c.project_id, 'corrections.close') then
      raise exception 'Only the inspector can close or reopen a correction.' using errcode = '42501';
    end if;
  else
    raise exception 'Unknown status %', p_status using errcode = '22023';
  end if;
  if (p_status = 'ready' and c.status not in ('open', 'reopened'))
     or (p_status = 'corrected' and c.status not in ('open', 'ready', 'reopened'))
     or (p_status = 'signed_off' and c.status not in ('open', 'ready', 'corrected', 'reopened'))
     or (p_status = 'reopened' and c.status not in ('ready', 'corrected', 'signed_off')) then
    raise exception 'That step does not apply now. Reload to see the latest.' using errcode = '22023';
  end if;
  if c.version <> p_version then
    raise exception 'version_conflict: expected %, found %', p_version, c.version using errcode = '40001';
  end if;
  if cardinality(coalesce(p_photo_ids, '{}')) > 6 then
    raise exception 'Up to 6 photos.' using errcode = '22023';
  end if;
  if not public.correction_files_ok(c.project_id, p_photo_ids, true) then
    raise exception 'A photo is not one of this job''s photos.' using errcode = '22023';
  end if;

  v_from := c.status;
  v_prev_closed := c.closed_at;
  update public.corrections
     set status = p_status,
         closed_at = case when p_status in ('corrected', 'signed_off') then coalesce(closed_at, now()) end
   where id = c.id
  returning * into c;
  insert into public.correction_history (org_id, project_id, correction_id, actor_user_id, action, from_status, to_status,
                                         note, photo_ids, prev_closed_at)
  values (c.org_id, c.project_id, c.id, auth.uid(), p_status, v_from, p_status, btrim(coalesce(p_note, '')),
          coalesce(p_photo_ids, '{}'), v_prev_closed);

  v_label := public.correction_label(c.number);
  if p_status = 'ready' then
    v_to := array(select x from unnest(array[c.created_by]) x where x <> auth.uid());
    perform public.post_activity(c.project_id, 'correction.ready',
      left(v_label || ' ready for re-inspection: ' || c.title, 500), 'correction', c.id, 'corrections.close', v_to);
    perform public.correction_reinspect_tasks(c);
  else
    update public.tasks set done_at = now(), done_by = auth.uid()
     where project_id = c.project_id and entity_type = 'correction' and entity_id = c.id and kind = 'correction.reinspect'
       and done_at is null and deleted_at is null;
    select h.actor_user_id into v_marker from public.correction_history h
     where h.correction_id = c.id and h.action = 'ready'
       and not exists (select 1 from public.correction_history u where u.undoes = h.id)
     order by h.seq desc limit 1;
    v_to := array(select distinct x from unnest(array[c.created_by, v_marker]) x where x is not null and x <> auth.uid());
    if cardinality(v_to) > 0 then
      perform public.post_activity(c.project_id, 'correction.' || p_status,
        left(v_label || ' ' || replace(p_status, '_', ' ') || ': ' || c.title, 500), 'correction', c.id, null, v_to);
    end if;
  end if;
  return c;
end;
$$;
revoke execute on function public.set_correction_status(uuid, int, text, text, uuid[]) from public, anon;
grant execute on function public.set_correction_status(uuid, int, text, text, uuid[]) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- undo_correction: reverts the caller's own latest step (or the create) within 15 minutes, if nothing happened since.
-- ---------------------------------------------------------------------------
create or replace function public.undo_correction(p_id uuid, p_version int)
returns public.corrections
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare c public.corrections; h public.correction_history;
begin
  select * into c from public.corrections where id = p_id and deleted_at is null for update;
  if c.id is null or not public.has_capability(c.project_id, 'corrections.view') then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if c.version <> p_version then
    raise exception 'version_conflict: expected %, found %', p_version, c.version using errcode = '40001';
  end if;
  select * into h from public.correction_history where correction_id = c.id order by seq desc limit 1;
  if h.id is null or h.actor_user_id is distinct from auth.uid()
     or h.action not in ('created', 'ready', 'corrected', 'signed_off', 'reopened')
     or h.created_at < now() - interval '15 minutes' then
    raise exception 'Nothing to undo.' using errcode = '22023';
  end if;

  if h.action = 'created' then
    update public.corrections set deleted_at = now() where id = c.id returning * into c;
  else
    perform set_config('app.correction_undo', c.id::text, true);
    update public.corrections set status = h.from_status, closed_at = h.prev_closed_at where id = c.id returning * into c;
    perform set_config('app.correction_undo', '', true);
    if h.action = 'ready' then
      update public.tasks set deleted_at = now()
       where project_id = c.project_id and entity_type = 'correction' and entity_id = c.id and kind = 'correction.reinspect'
         and done_at is null and deleted_at is null;
    elsif c.status = 'ready' then
      perform public.correction_reinspect_tasks(c);
    end if;
  end if;
  insert into public.correction_history (org_id, project_id, correction_id, actor_user_id, action, from_status, to_status, undoes)
  values (c.org_id, c.project_id, c.id, auth.uid(), 'undone', h.to_status, case when h.action = 'created' then null else c.status end, h.id);
  return c;
end;
$$;
revoke execute on function public.undo_correction(uuid, int) from public, anon;
grant execute on function public.undo_correction(uuid, int) to authenticated, service_role;
