-- 0029 IR results go on the inspector's daily report for the inspection date (SPEC §13.1, §13.2 step 4).
-- When an IR PDF is generated (or regenerated, or deleted), the owning inspector's daily for the request's date gets
-- one entry for that IR in content.inspections (ref 'ir:<request id>'): added once, updated in place when the IR is
-- regenerated, taken off when the PDF is deleted. MDR wrote to today's report; this writes to the inspection date's.
-- Only when the inspector writes dailies on the job (has a daily setup); the report is made if it doesn't exist yet;
-- a deleted report stays deleted. A submitted report that changes this way shows "Changed since signed" (its version
-- moves past signed_version), so the signed PDF never silently disagrees with the saved report.

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

  -- The entry lives on one report only: take it off any other (a moved date, a new owner).
  update public.daily_reports d
     set content = jsonb_set(d.content, '{inspections}',
           coalesce((select jsonb_agg(e order by o) from jsonb_array_elements(d.content->'inspections') with ordinality t(e, o)
                      where e->>'ref' <> v_ref), '[]'::jsonb))
   where d.project_id = r.project_id and d.deleted_at is null
     and d.content->'inspections' @> jsonb_build_array(jsonb_build_object('ref', v_ref))
     and not (d.author_id is not distinct from r.owner_id and d.report_date = r.request_date);

  if r.owner_id is null then return; end if;
  -- The inspector's own daily on this job: the setup they made first. None: they don't write dailies here.
  select * into s from public.daily_setups
   where project_id = r.project_id and author_id = r.owner_id order by created_at limit 1;
  if s.id is null then return; end if;
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

create or replace function public.tg_ir_daily()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.daily_note_ir(new.id);
  return null;
end;
$$;
revoke execute on function public.tg_ir_daily() from public, anon, authenticated;

-- A new, regenerated or deleted IR PDF (each render stores a new file) or a deleted request.
create trigger ir_daily after update of ir_file_id, deleted_at on public.inspection_requests
  for each row when (old.ir_file_id is distinct from new.ir_file_id or old.deleted_at is distinct from new.deleted_at)
  execute function public.tg_ir_daily();
