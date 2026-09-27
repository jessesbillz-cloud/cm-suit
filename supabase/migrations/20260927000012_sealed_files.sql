-- 0012 The sealed-bid hold also covers the received files (SPEC §11.4): while sealed and before bid_due_at, nobody on
-- the project side can list or download a bidder's file. The bidder's own file stays visible through files.created_by.
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
    return public.has_capability(fo.project_id, 'files.manage') or public.has_capability(fo.project_id, 'files.read_project');
  end if;
  return exists (
    select 1 from public.folder_access fa
    where fa.folder_id = eff and fa.can_read
      and ((fa.user_id = auth.uid()) or (fa.capability is not null and public.has_capability(fo.project_id, fa.capability)))
  );
end;
$$;

-- issue_addendum: only bidders whose access hasn't ended get a task.
create or replace function public.issue_addendum(p_addendum_id uuid, p_content_hash text)
returns public.addenda
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare a public.addenda; b record;
begin
  select * into a from public.addenda where id = p_addendum_id and deleted_at is null;
  if a is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not public.has_capability(a.project_id, 'bids.manage') then raise exception 'forbidden' using errcode = '42501'; end if;
  if a.issued_at is not null then return a; end if;
  update public.addenda set content_hash = p_content_hash, signed_at = now(), signed_by = auth.uid(), issued_at = now()
   where id = a.id returning * into a;
  perform public.audit('addendum.issue', 'addendum', a.id, a.project_id, a.org_id, jsonb_build_object('number', a.number), p_content_hash);
  for b in
    select distinct pm.user_id from public.project_members pm
    join public.role_permissions rp on rp.role = pm.role and rp.capability = 'bids.submit'
    where pm.project_id = a.project_id and pm.status = 'active' and pm.user_id is not null
      and (pm.access_ends_at is null or pm.access_ends_at > now())
  loop
    perform public.create_task(a.project_id, b.user_id, 'addendum_ack', 'Acknowledge addendum ' || a.number, 'addendum', a.id, null, false,
                               jsonb_build_object('addendum_id', a.id));
  end loop;
  perform public.post_activity(a.project_id, 'addendum.issued', 'Addendum ' || a.number || ' issued: ' || a.title, 'addendum', a.id, 'bids.manage');
  return a;
end;
$$;

-- Bids received default rail: new users see the Bids tool.
alter table public.user_layout alter column rail_items set default '{board,files,calendar,people,bids}';
