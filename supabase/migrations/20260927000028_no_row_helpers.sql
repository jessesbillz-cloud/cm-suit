-- 0028 No row-typed helper functions in public.
-- A public function whose only argument is a table's row type is a PostgREST "computed field": the CLI type generator
-- adds it to that table's Row type (the hosted one doesn't), which broke the stale-types check, and it would show up
-- as a readable column in the API. The two helpers from 0025/0026 now take ids, their callers are recreated with
-- the one call changed (bodies otherwise identical to 0025/0026), and supabase/tests/22_no_row_helpers.sql keeps any
-- new one out.

-- Deliveries: may the caller change this delivery? (was delivery_can_change(deliveries))
create or replace function public.delivery_may_change(p_project_id uuid, p_created_by uuid)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select public.has_capability(p_project_id, 'deliveries.manage')
      or (p_created_by = auth.uid() and public.has_capability(p_project_id, 'deliveries.post'));
$$;
revoke execute on function public.delivery_may_change(uuid, uuid) from public, anon, authenticated;

create or replace function public.update_delivery(
  p_id uuid, p_version int, p_company text, p_date date, p_duration int, p_description text, p_time time default null
)
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  d public.deliveries; pr public.projects; v_old_company text;
  v_company text := public.delivery_clean(p_company, 200);
  v_desc text := btrim(coalesce(p_description, ''));
  v_start timestamptz; v_company_id uuid; v_changes jsonb := '{}'::jsonb; v_standby boolean; v_version int;
begin
  select * into d from public.deliveries where id = p_id for update;
  if d.id is null or d.deleted_at is not null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not public.delivery_may_change(d.project_id, d.created_by) then raise exception 'forbidden' using errcode = '42501'; end if;
  if d.version <> p_version then
    raise exception 'version_conflict: expected %, found %', p_version, d.version using errcode = '40001';
  end if;
  if length(v_company) not between 1 and 120 then raise exception 'Company is required (120 characters at most).' using errcode = '22023'; end if;
  if length(v_desc) not between 1 and 500 then raise exception 'Description is required (500 characters at most).' using errcode = '22023'; end if;
  if p_duration is null or p_duration not between 5 and 720 then raise exception 'Duration must be 5 minutes to 12 hours.' using errcode = '22023'; end if;
  if p_date is null then raise exception 'Date is required.' using errcode = '22023'; end if;
  select * into pr from public.projects where id = d.project_id;
  v_start := case when p_time is null then null else (p_date + p_time) at time zone pr.timezone end;
  select name into v_old_company from public.delivery_companies where id = d.company_id;

  if lower(v_old_company) <> lower(v_company) then
    v_company_id := public.delivery_company_id(d.project_id, d.org_id, v_company);
    v_changes := v_changes || jsonb_build_object('company', jsonb_build_array(v_old_company, v_company));
  else
    v_company_id := d.company_id;
  end if;
  if d.delivery_date <> p_date then
    v_changes := v_changes || jsonb_build_object('date', jsonb_build_array(d.delivery_date, p_date));
  end if;
  if d.starts_at is distinct from v_start then
    v_changes := v_changes || jsonb_build_object('time', jsonb_build_array(
      to_char(d.starts_at at time zone pr.timezone, 'HH24:MI'), to_char(p_date + p_time, 'HH24:MI')));
  end if;
  if d.duration_min <> p_duration then
    v_changes := v_changes || jsonb_build_object('duration_min', jsonb_build_array(d.duration_min, p_duration));
  end if;
  if d.description <> v_desc then
    v_changes := v_changes || jsonb_build_object('description', jsonb_build_array(d.description, v_desc));
  end if;
  if v_changes = '{}'::jsonb then return d.version; end if;

  perform pg_advisory_xact_lock(hashtext('delivery_post:' || d.project_id::text));
  v_standby := case when v_changes ?| array['date', 'time', 'duration_min']
                    then public.delivery_overlaps(d.project_id, v_start, p_duration, d.id) else d.standby end;
  if v_standby <> d.standby then
    v_changes := v_changes || jsonb_build_object('standby', jsonb_build_array(d.standby, v_standby));
  end if;
  update public.deliveries
     set company_id = v_company_id, delivery_date = p_date, starts_at = v_start, duration_min = p_duration,
         description = v_desc, standby = v_standby
   where id = d.id
  returning version into v_version;
  perform public.audit('delivery.update', 'delivery', d.id, d.project_id, d.org_id,
    jsonb_build_object('number', d.number, 'changes', v_changes));
  return v_version;
end;
$$;

create or replace function public.delete_delivery(p_id uuid, p_version int, p_name text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare d public.deliveries; v_name text := public.delivery_clean(p_name, 200);
begin
  select * into d from public.deliveries where id = p_id for update;
  if d.id is null or d.deleted_at is not null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not public.delivery_may_change(d.project_id, d.created_by) then raise exception 'forbidden' using errcode = '42501'; end if;
  if length(v_name) not between 1 and 120 then raise exception 'Type your name to delete.' using errcode = '22023'; end if;
  if d.version <> p_version then
    raise exception 'version_conflict: expected %, found %', p_version, d.version using errcode = '40001';
  end if;
  update public.deliveries set deleted_at = now(), deleted_by = auth.uid(), deleted_name = v_name where id = d.id;
  perform public.audit('delivery.delete', 'delivery', d.id, d.project_id, d.org_id,
    jsonb_build_object('number', d.number, 'name', v_name));
end;
$$;

create or replace function public.restore_delivery(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare d public.deliveries;
begin
  select * into d from public.deliveries where id = p_id for update;
  if d.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not public.delivery_may_change(d.project_id, d.created_by) then raise exception 'forbidden' using errcode = '42501'; end if;
  if d.deleted_at is null then return; end if;  -- already back: safe to repeat
  update public.deliveries set deleted_at = null, deleted_by = null, deleted_name = null where id = d.id;
  perform public.audit('delivery.restore', 'delivery', d.id, d.project_id, d.org_id, jsonb_build_object('number', d.number));
end;
$$;

create or replace function public.attach_delivery_file(p_delivery_id uuid, p_file_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare d public.deliveries; f public.files;
begin
  select * into d from public.deliveries where id = p_delivery_id for update;
  if d.id is null or d.deleted_at is not null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not public.delivery_may_change(d.project_id, d.created_by) then raise exception 'forbidden' using errcode = '42501'; end if;
  select fi.* into f from public.files fi join public.folders fo on fo.id = fi.folder_id
   where fi.id = p_file_id and fi.project_id = d.project_id and fi.created_by = auth.uid() and fi.deleted_at is null
     and fo.parent_id is null and fo.name = 'Delivery tickets' and fo.deleted_at is null;
  if f.id is null then raise exception 'file not found or not yours' using errcode = 'P0002'; end if;
  if f.id = any (d.file_ids) then return; end if;  -- safe to repeat
  update public.deliveries set file_ids = file_ids || f.id where id = d.id;
  perform public.audit('delivery.attach', 'delivery', d.id, d.project_id, d.org_id,
    jsonb_build_object('number', d.number, 'file', f.original_name), f.sha256);
end;
$$;

drop function public.delivery_can_change(public.deliveries);

-- Corrections: open a re-inspection task for each inspector (was correction_reinspect_tasks(corrections)).
create or replace function public.correction_reinspect_tasks_for(p_correction_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare u uuid; cr public.corrections;
begin
  select * into cr from public.corrections where id = p_correction_id;
  if cr is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  for u in
    select distinct pm.user_id from public.project_members pm
    join public.role_permissions rp on rp.role = pm.role and rp.capability = 'corrections.close'
    where pm.project_id = cr.project_id and pm.status = 'active' and pm.user_id is not null
      and (pm.access_ends_at is null or pm.access_ends_at > now())
      and not exists (select 1 from public.tasks t
                      where t.project_id = cr.project_id and t.assignee_user_id = pm.user_id
                        and t.entity_type = 'correction' and t.entity_id = cr.id and t.kind = 'correction.reinspect'
                        and t.done_at is null and t.deleted_at is null)
  loop
    perform public.create_task(cr.project_id, u, 'correction.reinspect',
      left('Re-inspect ' || public.correction_label(cr.number) || ': ' || cr.title, 300),
      'correction', cr.id);
  end loop;
end;
$$;
revoke execute on function public.correction_reinspect_tasks_for(uuid) from public, anon, authenticated;
grant execute on function public.correction_reinspect_tasks_for(uuid) to service_role;

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
    perform public.correction_reinspect_tasks_for(c.id);
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
      perform public.correction_reinspect_tasks_for(c.id);
    end if;
  end if;
  insert into public.correction_history (org_id, project_id, correction_id, actor_user_id, action, from_status, to_status, undoes)
  values (c.org_id, c.project_id, c.id, auth.uid(), 'undone', h.to_status, case when h.action = 'created' then null else c.status end, h.id);
  return c;
end;
$$;

drop function public.correction_reinspect_tasks(public.corrections);
