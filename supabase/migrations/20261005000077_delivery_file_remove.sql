-- 0077 Taking a photo or ticket off a delivery (Oct 4 audit, deliveries #4, CLAUDE.md rule 16: Undo, not "are you sure?").
--   * remove_delivery_file(delivery, file): the delivery's poster (still able to post) or deliveries.manage takes the
--     file off the delivery. The file itself is soft-deleted in the job's "Delivery tickets" folder, unless another
--     delivery still shows it. Audited ('delivery.detach', so the delivery's History shows it). Safe to repeat.
--   * restore_delivery_file(delivery, file): Undo. Puts back only a file this delivery had (its 'delivery.detach' audit
--     line says so) and brings the file back into the folder. Safe to repeat.
--   * Nothing else changes: attach_delivery_file still takes only the caller's own fresh upload.

create or replace function public.remove_delivery_file(p_delivery_id uuid, p_file_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare d public.deliveries; f public.files; v_deleted boolean := false;
begin
  select * into d from public.deliveries where id = p_delivery_id for update;
  if d.id is null or d.deleted_at is not null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not public.delivery_may_change(d.project_id, d.created_by) then raise exception 'forbidden' using errcode = '42501'; end if;
  if not (p_file_id = any (d.file_ids)) then return; end if;  -- already off: safe to repeat
  update public.deliveries set file_ids = array_remove(file_ids, p_file_id) where id = d.id;
  select fi.* into f from public.files fi join public.folders fo on fo.id = fi.folder_id
   where fi.id = p_file_id and fi.project_id = d.project_id
     and fo.parent_id is null and fo.name = 'Delivery tickets';
  if f.id is not null and f.deleted_at is null
     and not exists (select 1 from public.deliveries o where o.id <> d.id and o.deleted_at is null and f.id = any (o.file_ids)) then
    update public.files set deleted_at = now() where id = f.id;
    v_deleted := true;
  end if;
  perform public.audit('delivery.detach', 'delivery', d.id, d.project_id, d.org_id,
    jsonb_build_object('number', d.number, 'file_id', p_file_id, 'file', f.original_name, 'file_deleted', v_deleted));
end;
$$;

create or replace function public.restore_delivery_file(p_delivery_id uuid, p_file_id uuid)
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
  if p_file_id = any (d.file_ids) then return; end if;  -- already back: safe to repeat
  -- Only a file this delivery had, still in the job's Delivery tickets folder.
  if not exists (select 1 from public.audit_events a
                  where a.entity_type = 'delivery' and a.entity_id = d.id and a.action = 'delivery.detach'
                    and a.details->>'file_id' = p_file_id::text) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  select fi.* into f from public.files fi join public.folders fo on fo.id = fi.folder_id
   where fi.id = p_file_id and fi.project_id = d.project_id
     and fo.parent_id is null and fo.name = 'Delivery tickets' and fo.deleted_at is null;
  if f.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if f.deleted_at is not null then update public.files set deleted_at = null where id = f.id; end if;
  update public.deliveries set file_ids = file_ids || f.id where id = d.id;
  perform public.audit('delivery.reattach', 'delivery', d.id, d.project_id, d.org_id,
    jsonb_build_object('number', d.number, 'file_id', f.id, 'file', f.original_name), f.sha256);
end;
$$;

revoke execute on function public.remove_delivery_file(uuid, uuid), public.restore_delivery_file(uuid, uuid)
  from public, anon;
grant execute on function public.remove_delivery_file(uuid, uuid), public.restore_delivery_file(uuid, uuid)
  to authenticated, service_role;
