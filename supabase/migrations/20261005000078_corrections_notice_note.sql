-- 0078 Corrections, from the Oct 4 audit (findings 5, 6 and 30).
--   * A correction's formal notice is a document, not a photo: it now goes in the job's Reports / "Corrections" folder
--     (made on first use, like Reports / "Inspection reports"), never in Photos / Corrections. correction_notice_folder
--     hands it out to the people who attach notices (the creator: corrections.create, the inspector: corrections.close),
--     corrections.view reads it. Notices already attached stay where they are (nothing moves).
--   * "Corrections" under Reports is a name the system owns (folder_name_reserved carries the whole list, 0069's plus
--     this one).
--   * Edit adds and removes an item's own photos: the table already allows it (0026: update (photo_ids) for the creator
--     or an inspector, the guard checks every added photo). No new function, tests/62 proves it.
--   * Corrected / Sign off take one tap (Undo, as before), the note comes after if wanted. correction_step_note puts a
--     note on my own latest step while undo_correction would still take it back (15 minutes) and only when it has none.
--     History stays append-only for everything else: the trigger lets through only that one line's note, inside this
--     function (a transaction-local flag, like undo_correction's).

-- =====================================================================================================================
-- The notice folder
-- =====================================================================================================================
create or replace function public.correction_notice_folder(p_project_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_org uuid; v_parent uuid; v_id uuid;
begin
  if auth.uid() is null
     or not (public.has_capability(p_project_id, 'corrections.create') or public.has_capability(p_project_id, 'corrections.close')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select org_id into v_org from public.projects where id = p_project_id and deleted_at is null;
  if v_org is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  perform pg_advisory_xact_lock(hashtext('correction_notice_folder:' || p_project_id::text));
  select id into v_parent from public.folders
   where project_id = p_project_id and parent_id is null and kind = 'reports' and deleted_at is null
   order by created_at limit 1;
  if v_parent is null then
    insert into public.folders (org_id, project_id, name, kind, created_by)
    values (v_org, p_project_id, 'Reports', 'reports', auth.uid())
    on conflict (project_id, parent_id, name) do update set deleted_at = null
    returning id into v_parent;
  end if;
  select id into v_id from public.folders where project_id = p_project_id and parent_id = v_parent and name = 'Corrections';
  if v_id is null then
    insert into public.folders (org_id, project_id, parent_id, name, kind, created_by)
    values (v_org, p_project_id, v_parent, 'Corrections', 'reports', auth.uid())
    returning id into v_id;
  end if;
  update public.folders set deleted_at = null where id = v_id and deleted_at is not null;
  -- Its own access list, unless someone already set one (a list people changed is left as they set it).
  if not exists (select 1 from public.folder_access where folder_id = v_id) then
    insert into public.folder_access (folder_id, capability, can_read, can_write, created_by) values
      (v_id, 'corrections.view', true, false, auth.uid()),
      (v_id, 'corrections.create', true, true, auth.uid()),
      (v_id, 'corrections.close', true, true, auth.uid())
    on conflict do nothing;
  end if;
  return v_id;
end;
$$;
revoke execute on function public.correction_notice_folder(uuid) from public, anon;
grant execute on function public.correction_notice_folder(uuid) to authenticated, service_role;

-- Same as 0069 plus "Corrections" under Reports.
create or replace function public.folder_name_reserved(p_project_id uuid, p_parent_id uuid, p_name text)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select case
    when p_parent_id is null then btrim(p_name) in ('Bids received', 'Inspection requests', 'Delivery tickets', 'Emailed in',
                                                     'Bid forms', 'RFIs', 'Approved plans', 'Safety', 'Schedule', 'Requirements')
    else btrim(p_name) = any (case (select kind from public.folders where id = p_parent_id and project_id = p_project_id)
                                when 'reports' then array['Inspection reports', 'OFS inspection reports', 'Corrections']
                                when 'photos' then array['Corrections'] end)
  end;
$$;

-- =====================================================================================================================
-- A note after a one-tap step
-- =====================================================================================================================
create or replace function public.tg_correction_history_immutable()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  -- correction_step_note: that one line, its note only.
  if tg_op = 'UPDATE' and coalesce(current_setting('app.correction_note', true), '') = old.id::text
     and (to_jsonb(new) - 'note') = (to_jsonb(old) - 'note') then
    return new;
  end if;
  if not public.is_service_role() then
    raise exception 'correction history is append-only' using errcode = '42501';
  end if;
  return coalesce(old, new);
end;
$$;
revoke execute on function public.tg_correction_history_immutable() from public, anon, authenticated;

create or replace function public.correction_step_note(p_id uuid, p_note text)
returns public.correction_history
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare c public.corrections; h public.correction_history; v_note text := btrim(coalesce(p_note, ''));
begin
  if auth.uid() is null then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into c from public.corrections where id = p_id and deleted_at is null for update;
  if c.id is null or not public.has_capability(c.project_id, 'corrections.view') then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if v_note = '' then raise exception 'Add a note.' using errcode = '22023'; end if;
  if length(v_note) > 4000 then raise exception 'Keep the note to 4000 characters.' using errcode = '22023'; end if;
  select * into h from public.correction_history where correction_id = c.id order by seq desc limit 1;
  if h.id is null or h.actor_user_id is distinct from auth.uid()
     or h.action not in ('ready', 'corrected', 'signed_off', 'reopened')
     or h.note <> ''
     or h.created_at < now() - interval '15 minutes' then
    raise exception 'Too late to add a note.' using errcode = '22023';
  end if;
  perform set_config('app.correction_note', h.id::text, true);
  update public.correction_history set note = v_note where id = h.id returning * into h;
  perform set_config('app.correction_note', '', true);
  return h;
end;
$$;
revoke execute on function public.correction_step_note(uuid, text) from public, anon;
grant execute on function public.correction_step_note(uuid, text) to authenticated, service_role;
