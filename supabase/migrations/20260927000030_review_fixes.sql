-- 0030 Fixes from the independent security review of 0021-0029 (docs/decisions.md).
--  1. Signing needs a fresh sign-in in the database too, not only in the edge function: ir_sign and begin_daily_submit
--     refuse unless this session signed in within 5 minutes (the JWT's amr time), so calling them straight through the
--     API can't put a signature on new content. A new signature on an IR whose PDF shows other content marks it stale.
--  2. People can't make or rename folders into the ones the system owns: a folder made through the API is 'general',
--     and the system folder names (Bids received, Inspection requests, Delivery tickets, Emailed in at the top;
--     Inspection reports under Reports; Corrections under Photos) are the system's. Otherwise a PM could make an open
--     "Bids received" before the first package and bids would land in it, readable by everyone on the job.
--  3. A folder's parent is in the same job and never makes a loop; folder_effective_id stops at 32 levels.
--  4. Daily setup settings are bounded in the database (label, standing note, recipients), not only in the browser.

-- 1. Fresh sign-in -----------------------------------------------------------------------------------------------
create or replace function public.signed_in_recently()
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select exists (
    select 1
      from jsonb_array_elements(coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb -> 'amr', '[]'::jsonb)) m
     where jsonb_typeof(m -> 'timestamp') = 'number'
       and (m ->> 'timestamp')::double precision between extract(epoch from now()) - 300 and extract(epoch from now()) + 60
  );
$$;
revoke execute on function public.signed_in_recently() from public, anon, authenticated;

create or replace function public.ir_sign(p_request_id uuid, p_version int, p_content_hash text)
returns public.inspection_requests
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare r public.inspection_requests;
begin
  if not public.signed_in_recently() then
    raise exception 'reauth_required: sign in again to sign' using errcode = '42501';
  end if;
  r := public.ir_decider(p_request_id, p_version);
  if r.result is null then raise exception 'Record the result first.' using errcode = '22023'; end if;
  if r.status = 'postponed' then raise exception 'Confirm it again first.' using errcode = '22023'; end if;
  if p_content_hash is null or p_content_hash !~ '^[0-9a-f]{64}$' then raise exception 'bad content hash' using errcode = '22023'; end if;
  perform set_config('app.ir_action', 'sign', true);
  update public.inspection_requests
     set content_hash = p_content_hash, signed_at = now(), signed_by = auth.uid(), owner_id = auth.uid()
   where id = r.id
   returning * into r;
  perform public.audit('ir.sign', 'inspection_request', r.id, r.project_id, r.org_id,
                       jsonb_build_object('number', r.number, 'result', r.result), p_content_hash);
  return r;
end;
$$;

create or replace function public.begin_daily_submit(p_report_id uuid, p_version int, p_content_hash text, p_photos_stamp text)
returns public.daily_reports
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare r public.daily_reports; stamp text; n int;
begin
  if not public.signed_in_recently() then
    raise exception 'reauth_required: sign in again to sign' using errcode = '42501';
  end if;
  r := public.daily_own_report(p_report_id);
  if r.version <> p_version then raise exception 'version_conflict' using errcode = '40001'; end if;
  if p_content_hash is null or p_content_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'bad content hash' using errcode = '22023';
  end if;
  select coalesce(string_agg(ph.id::text || ':' || ph.version, ',' order by ph.id), '') into stamp
    from public.daily_report_photos ph where ph.report_id = r.id and ph.deleted_at is null;
  if stamp <> coalesce(p_photos_stamp, '') then
    raise exception 'version_conflict: photos changed' using errcode = '40001';
  end if;
  n := coalesce(r.number, public.next_author_number(r.project_id, 'dailies:' || r.report_type));
  update public.daily_reports set number = n, sign_pending_hash = p_content_hash, sign_pending_at = now()
   where id = r.id returning * into r;
  perform public.audit('daily.sign', 'daily_report', r.id, r.project_id, r.org_id,
    jsonb_build_object('number', n, 'report_date', r.report_date, 'report_type', r.report_type), p_content_hash);
  return r;
end;
$$;

create or replace function public.tg_ir_before()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare v_special text;
begin
  -- An inspector who takes over a request they were helping on stops being its helper.
  if new.helper_id is not null and new.helper_id = new.owner_id then new.helper_id := null; end if;
  if tg_op = 'UPDATE' and old.ir_file_id is not null and new.ir_file_id is not distinct from old.ir_file_id
     and (new.request_date, new.start_time, new.duration_kind, new.duration_min, new.kind, new.special_kind_id,
          new.company, new.items, new.result, new.result_note, new.result_photo_ids)
         is distinct from
         (old.request_date, old.start_time, old.duration_kind, old.duration_min, old.kind, old.special_kind_id,
          old.company, old.items, old.result, old.result_note, old.result_photo_ids) then
    new.pdf_stale := true;
  end if;
  -- A new signature on content the stored PDF doesn't show: the PDF is out of date until it is rendered again.
  if tg_op = 'UPDATE' and old.ir_file_id is not null and new.ir_file_id is not distinct from old.ir_file_id
     and new.content_hash is distinct from old.content_hash then
    new.pdf_stale := true;
  end if;
  if new.result is null then
    new.summary := null;
  else
    select name into v_special from public.ir_special_kinds where id = new.special_kind_id;
    new.summary := left('IR ' || new.number || ' ' || public.ir_type_label(new.kind, v_special) || ': '
      || case new.result when 'approved' then 'Approved' else 'Not approved' end || '. '
      || btrim(new.items) || coalesce('. ' || nullif(btrim(new.result_note), ''), ''), 1000);
  end if;
  return new;
end;
$$;

-- 2 and 3. Folders ------------------------------------------------------------------------------------------------
create or replace function public.folder_name_reserved(p_project_id uuid, p_parent_id uuid, p_name text)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select case
    when p_parent_id is null then btrim(p_name) in ('Bids received', 'Inspection requests', 'Delivery tickets', 'Emailed in')
    else btrim(p_name) = case (select kind from public.folders where id = p_parent_id and project_id = p_project_id)
                           when 'reports' then 'Inspection reports' when 'photos' then 'Corrections' end
  end;
$$;
-- Called by the folders trigger as the person (invoker); it only answers whether a name is the system's.
revoke execute on function public.folder_name_reserved(uuid, uuid, text) from public, anon;
grant execute on function public.folder_name_reserved(uuid, uuid, text) to authenticated, service_role;

-- Not SECURITY DEFINER on purpose: current_user is 'authenticated' for a person's own API call and the function owner
-- inside the system's SECURITY DEFINER functions, which is how system folders are made.
create or replace function public.tg_folders_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare v_parent_project uuid; v_cursor uuid; v_depth int := 0;
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' and new.kind <> 'general' then
      raise exception 'forbidden: folder kind' using errcode = '42501';
    end if;
    if (tg_op = 'INSERT' or new.name is distinct from old.name or new.parent_id is distinct from old.parent_id)
       and public.folder_name_reserved(new.project_id, new.parent_id, new.name) then
      raise exception 'That name is used by the system. Pick another.' using errcode = '23505';
    end if;
  end if;
  if new.parent_id is not null and (tg_op = 'INSERT' or new.parent_id is distinct from old.parent_id) then
    select project_id into v_parent_project from public.folders where id = new.parent_id;
    if v_parent_project is distinct from new.project_id then
      raise exception 'The parent folder is in another job.' using errcode = '22023';
    end if;
    v_cursor := new.parent_id;
    while v_cursor is not null loop
      if v_cursor = new.id then raise exception 'A folder can''t go inside itself.' using errcode = '22023'; end if;
      v_depth := v_depth + 1;
      if v_depth > 30 then raise exception 'Folders go 30 levels deep at most.' using errcode = '22023'; end if;
      select parent_id into v_cursor from public.folders where id = v_cursor;
    end loop;
  end if;
  return new;
end;
$$;
revoke execute on function public.tg_folders_guard() from public, anon, authenticated;
create trigger folders_guard before insert or update of name, parent_id, kind on public.folders
  for each row execute function public.tg_folders_guard();

create or replace function public.folder_effective_id(p_folder_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with recursive up as (
    select f.id, f.parent_id, 0 as depth from public.folders f where f.id = p_folder_id
    union all
    select f.id, f.parent_id, up.depth + 1 from public.folders f join up on f.id = up.parent_id where up.depth < 32
  )
  select up.id from up
  where exists (select 1 from public.folder_access fa where fa.folder_id = up.id)
  order by up.depth limit 1;
$$;

-- 4. Daily setup bounds (the one zod schema in _shared/dailies.ts says the same; this holds when it's bypassed) ------
create or replace function public.daily_settings_ok(p_settings jsonb)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select coalesce(length(p_settings ->> 'label'), 0) <= 80
     and coalesce(length(p_settings ->> 'standing_note'), 0) <= 4000
     and (p_settings -> 'recipients' is null
          or (jsonb_typeof(p_settings -> 'recipients') = 'array'
              and jsonb_array_length(p_settings -> 'recipients') <= 50
              and not exists (select 1 from jsonb_array_elements(p_settings -> 'recipients') e
                               where jsonb_typeof(e) <> 'string' or length(e #>> '{}') > 320
                                  or (e #>> '{}') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')));
$$;
revoke execute on function public.daily_settings_ok(jsonb) from public, anon;
grant execute on function public.daily_settings_ok(jsonb) to authenticated, service_role;
alter table public.daily_setups add constraint daily_settings_bounded check (public.daily_settings_ok(settings));
