-- 0014 create_project: the optional fields get defaults, so the app can leave them out (the generated types then mark
-- them optional instead of forcing a value). Same body as 0013; stage moves up next to the required fields.
drop function public.create_project(uuid, text, text, text, text, timestamptz, boolean, text);

create or replace function public.create_project(
  p_org_id uuid,
  p_name text,
  p_stage text,
  p_number text default null,
  p_address text default null,
  p_bid_due_at timestamptz default null,
  p_prevailing_wage boolean default false,
  p_job_type text default null
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_name text := btrim(coalesce(p_name, ''));
  v_number text := nullif(btrim(coalesce(p_number, '')), '');
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtext('create_project:' || v_uid::text));
  select p.id into v_id
    from public.projects p
   where p.org_id = p_org_id and p.created_by = v_uid and p.deleted_at is null
     and lower(p.name) = lower(v_name) and coalesce(p.number, '') = coalesce(v_number, '')
   limit 1;
  if v_id is not null then
    return v_id;
  end if;
  v_id := gen_random_uuid();
  insert into public.projects (id, org_id, name, number, address, stage, bid_due_at, prevailing_wage, job_type, created_by)
  values (v_id, p_org_id, v_name, v_number, nullif(btrim(coalesce(p_address, '')), ''), p_stage, p_bid_due_at,
          coalesce(p_prevailing_wage, false), nullif(btrim(coalesce(p_job_type, '')), ''), v_uid);
  return v_id;
end;
$$;
revoke execute on function public.create_project(uuid, text, text, text, text, timestamptz, boolean, text) from public, anon;
grant execute on function public.create_project(uuid, text, text, text, text, timestamptz, boolean, text) to authenticated, service_role;
