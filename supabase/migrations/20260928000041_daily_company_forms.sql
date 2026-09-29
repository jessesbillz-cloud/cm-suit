-- 0041 Company forms for daily reports (SPEC §8.3, §13.1): the VIS daily report, the first built-in company form.
-- Which form a job's dailies use is data: orgs.settings.report_generator names the job's default (read by the app),
-- and a person's daily setup names the form they write (daily_setups.report_type, e.g. 'vis_daily'). The form's fields
-- and PDF builder live with the edge functions (_shared/reportForms.ts, _shared/pdf/vis.ts); no company id is in code.
--   1. daily_setups.chosen_at: a person's form on a job is the setup they chose last. choose_daily_form() switches
--      (making that form's setup from the given settings the first time); ensure_todays_draft still makes one on first
--      use, and a newly made setup is the chosen one.
--   2. daily_settings_ok also bounds settings.locked: a company form's job values (typed once in Setup).
--   3. daily_report_photos.description: a photo's optional description (the form's "Photo Analysis" pages).
--      save_daily_photo takes it; null leaves it as it is. It is part of what a signature covers (submit-daily's hash).
--   4. IR results go on the report of the inspector's chosen form (was: the first setup they made), and only there.

-- 1. The chosen form -------------------------------------------------------------------------------------------------
alter table public.daily_setups add column chosen_at timestamptz not null default now();

create or replace function public.choose_daily_form(p_project_id uuid, p_report_type text, p_settings_if_new jsonb)
returns public.daily_setups
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare s public.daily_setups;
begin
  if not public.has_capability(p_project_id, 'dailies.write') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_report_type is null or p_report_type !~ '^[a-z0-9_]{1,40}$' then
    raise exception 'bad report type' using errcode = '22023';
  end if;
  if p_settings_if_new is null or jsonb_typeof(p_settings_if_new) <> 'object' then
    raise exception 'settings must be an object' using errcode = '22023';
  end if;
  -- clock_timestamp: two choices in one transaction still order.
  insert into public.daily_setups (org_id, project_id, author_id, report_type, settings, created_by, chosen_at)
  select p.org_id, p.id, auth.uid(), p_report_type, p_settings_if_new, auth.uid(), clock_timestamp()
    from public.projects p where p.id = p_project_id and p.deleted_at is null
  on conflict (project_id, author_id, report_type) do update set chosen_at = clock_timestamp()
  returning * into s;
  if s.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  return s;
end;
$$;
revoke execute on function public.choose_daily_form(uuid, text, jsonb) from public, anon;
grant execute on function public.choose_daily_form(uuid, text, jsonb) to authenticated, service_role;

-- 2. Setup bounds: settings.locked (the one zod schema in _shared/dailies.ts says the same) ---------------------------
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
                                  or (e #>> '{}') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')))
     and (p_settings -> 'locked' is null
          or (jsonb_typeof(p_settings -> 'locked') = 'object'
              and (select count(*) from jsonb_object_keys(p_settings -> 'locked')) <= 40
              and not exists (select 1 from jsonb_each(p_settings -> 'locked') e
                               where e.key !~ '^[a-z0-9_]{1,40}$' or jsonb_typeof(e.value) <> 'string'
                                  or length(e.value #>> '{}') > 1000)));
$$;

-- 3. Photo descriptions -----------------------------------------------------------------------------------------------
alter table public.daily_report_photos
  add column description text not null default '' check (length(description) <= 4000);

drop function public.save_daily_photo(uuid, int, text);
create function public.save_daily_photo(p_photo_id uuid, p_version int, p_caption text, p_description text default null)
returns public.daily_report_photos
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare ph public.daily_report_photos;
begin
  select * into ph from public.daily_report_photos where id = p_photo_id and deleted_at is null;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  perform public.daily_own_report(ph.report_id);
  if length(p_description) > 4000 then
    raise exception 'A description holds up to 4000 characters' using errcode = '22023';
  end if;
  update public.daily_report_photos
     set caption = left(coalesce(p_caption, ''), 500), description = coalesce(p_description, description)
   where id = ph.id and version = p_version
  returning * into ph;
  if not found then raise exception 'version_conflict' using errcode = '40001'; end if;
  return ph;
end;
$$;
revoke execute on function public.save_daily_photo(uuid, int, text, text) from public, anon;
grant execute on function public.save_daily_photo(uuid, int, text, text) to authenticated, service_role;

-- 4. IR results on the chosen form's report ---------------------------------------------------------------------------
create or replace function public.daily_note_ir(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r public.inspection_requests;
  s public.daily_setups;
  rep public.daily_reports;
  v_ref text := 'ir:' || p_request_id::text;
  v_entry jsonb;
  v_list jsonb;
  v_old jsonb;
  v_new_id uuid;
begin
  select * into r from public.inspection_requests where id = p_request_id;
  if r.id is null then return; end if;
  -- The inspector's own daily on this job: the form they chose last. None: they don't write dailies here.
  if r.owner_id is not null then
    select * into s from public.daily_setups
     where project_id = r.project_id and author_id = r.owner_id
     order by chosen_at desc, created_at desc limit 1;
  end if;

  -- The entry lives on one report only: take it off any other (a moved date, a new owner, another form).
  update public.daily_reports d
     set content = jsonb_set(d.content, '{inspections}',
           coalesce((select jsonb_agg(e order by o) from jsonb_array_elements(d.content->'inspections') with ordinality t(e, o)
                      where e->>'ref' <> v_ref), '[]'::jsonb))
   where d.project_id = r.project_id and d.deleted_at is null
     and d.content->'inspections' @> jsonb_build_array(jsonb_build_object('ref', v_ref))
     and not (d.author_id is not distinct from r.owner_id and d.report_date = r.request_date
              and d.report_type is not distinct from s.report_type);

  if r.owner_id is null or s.id is null then return; end if;
  select * into rep from public.daily_reports
   where project_id = r.project_id and author_id = r.owner_id and report_type = s.report_type and report_date = r.request_date;
  if rep.id is not null and rep.deleted_at is not null then return; end if;  -- a deleted report stays deleted

  if r.ir_file_id is null or r.summary is null or r.deleted_at is not null then
    if rep.id is null then return; end if;
    v_old := coalesce(rep.content->'inspections', '[]'::jsonb);
    v_list := coalesce((select jsonb_agg(e order by o) from jsonb_array_elements(v_old) with ordinality t(e, o)
                         where e->>'ref' <> v_ref), '[]'::jsonb);
  else
    if rep.id is null then
      v_new_id := public.daily_make_report(s, r.request_date);
      select * into rep from public.daily_reports where id = v_new_id;
    end if;
    v_old := coalesce(rep.content->'inspections', '[]'::jsonb);
    v_entry := jsonb_build_object('ref', v_ref,
      'text', left(r.summary || case when r.pdf_postponed then ' Postponed.' else '' end, 4000));
    if v_old @> jsonb_build_array(jsonb_build_object('ref', v_ref)) then
      v_list := (select jsonb_agg(case when e->>'ref' = v_ref then v_entry else e end order by o)
                   from jsonb_array_elements(v_old) with ordinality t(e, o));
    else
      v_list := v_old || jsonb_build_array(v_entry);
    end if;
  end if;

  if v_list is distinct from v_old then
    update public.daily_reports set content = jsonb_set(content, '{inspections}', v_list) where id = rep.id;
  end if;
end;
$$;
revoke execute on function public.daily_note_ir(uuid) from public, anon, authenticated;
