-- 0098 Corrections: an item goes TO a company on the job (Jesse, Oct 12: "nobody to submit it to ... somebody from
-- another company, like the owner, clicks on it, they should see 'Correction notice 001 - submit special inspection
-- report', so they know what people on their job site are tracking").
--   * corrections.company_org_id -> orgs(id), nullable: the company the item is for. The same company a membership
--     carries (project_members.member_org_id), picked from the one list of the job's companies (0073
--     requirement_member_companies). A company not on the job is refused on create and on edit (a table trigger, so
--     no path skips it). An item may go to nobody, as before.
--   * Set through the existing writes: create_correction takes p_company_org_id (last, optional), Edit writes the
--     column (creator or inspector, the update policy as before, with the version check). A change is an "edited"
--     history line like any other edit.
--   * Reading is unchanged: everyone with corrections.view reads the log, the company included.
--     correction_companies answers the job's companies (to pick) and the companies items already go to (to show
--     their names), to corrections.view.
--   * The company's people get it as a to-do: a 'correction.fix' task for each active member of that company whose
--     role reads corrections (the matrix says who), not the item's creator, while the item is open or reopened.
--     Marked ready, corrected or signed off: done. Moved to another company, sent to nobody or undone away: removed.
--     Reopened: back. A table trigger keeps the tasks in step with the item, whichever write moved it.
--   * Nothing is emailed. The capability matrix is unchanged.

-- =====================================================================================================================
-- The column
-- =====================================================================================================================
alter table public.corrections add column company_org_id uuid references public.orgs(id);
create index corrections_project_company on public.corrections (project_id, company_org_id)
  where deleted_at is null and company_org_id is not null;
-- 0026 grants by column for Edit.
grant update (company_org_id) on public.corrections to authenticated;

-- A picked company must be on the job (when it is set or changed, so an item whose company has since left the job
-- still saves its other edits).
create or replace function public.tg_corrections_company()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.company_org_id is not null and (tg_op = 'INSERT' or new.company_org_id is distinct from old.company_org_id)
     and not exists (select 1 from public.requirement_member_companies(new.project_id) c where c.org_id = new.company_org_id) then
    raise exception 'Pick a company on this job.' using errcode = '22023';
  end if;
  return new;
end;
$$;
revoke execute on function public.tg_corrections_company() from public, anon, authenticated;
create trigger guard_company before insert or update of company_org_id on public.corrections
  for each row execute function public.tg_corrections_company();

-- 0026's edit history line, plus the company.
create or replace function public.tg_corrections_edited()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.deleted_at is null
     and row(new.title, new.description, new.trade, new.location, new.spec_tags, new.photo_ids, new.notice_file_id, new.notice_ref,
             new.company_org_id)
         is distinct from
         row(old.title, old.description, old.trade, old.location, old.spec_tags, old.photo_ids, old.notice_file_id, old.notice_ref,
             old.company_org_id) then
    insert into public.correction_history (org_id, project_id, correction_id, actor_user_id, action, from_status, to_status)
    values (new.org_id, new.project_id, new.id, auth.uid(), 'edited', new.status, new.status);
  end if;
  return null;
end;
$$;
revoke execute on function public.tg_corrections_edited() from public, anon, authenticated;

-- =====================================================================================================================
-- The companies, for the picker and the names
-- =====================================================================================================================
-- The job's companies (on_job, what may be picked), plus any company an item on this job already goes to (its name
-- still shows after it left the job). corrections.view.
create or replace function public.correction_companies(p_project_id uuid)
returns table (org_id uuid, name text, on_job boolean)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
begin
  if auth.uid() is null or not public.correction_may_see(p_project_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
    with job as (select c.org_id, c.name from public.requirement_member_companies(p_project_id) c)
    select q.org_id, q.name, q.on_job from (
      select j.org_id, j.name, true as on_job from job j
      union all
      select o.id, o.name, false from public.orgs o
       where o.id not in (select j.org_id from job j)
         and exists (select 1 from public.corrections x
                      where x.project_id = p_project_id and x.company_org_id = o.id and x.deleted_at is null)) q
    order by lower(q.name), q.org_id;
end;
$$;
revoke execute on function public.correction_companies(uuid) from public, anon;
grant execute on function public.correction_companies(uuid) to authenticated, service_role;

-- =====================================================================================================================
-- The to-dos
-- =====================================================================================================================
-- Brings the item's 'correction.fix' tasks in step with it: one open task for each person it is for, none for anyone
-- else. Internal.
create or replace function public.correction_fix_tasks(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare c public.corrections; v_want uuid[] := '{}'; v_title text; u uuid;
begin
  select * into c from public.corrections where id = p_id;
  if c.id is null then return; end if;
  v_title := left(public.correction_label(c.number) || ': ' || c.title, 300);
  if c.deleted_at is null and c.status in ('open', 'reopened') and c.company_org_id is not null then
    v_want := array(
      select distinct pm.user_id from public.project_members pm
       where pm.project_id = c.project_id and pm.member_org_id = c.company_org_id and pm.status = 'active'
         and pm.user_id is not null and pm.user_id <> c.created_by
         and (pm.access_ends_at is null or pm.access_ends_at > now())
         and exists (select 1 from public.role_permissions rp where rp.role = pm.role and rp.capability = 'corrections.view'));
  end if;

  if c.deleted_at is null and c.status not in ('open', 'reopened') then
    -- Marked ready or closed: the company's part is done.
    update public.tasks t set done_at = now(), done_by = auth.uid()
     where t.project_id = c.project_id and t.entity_type = 'correction' and t.entity_id = c.id and t.kind = 'correction.fix'
       and t.done_at is null and t.deleted_at is null;
  else
    -- Not (or no longer) theirs: removed, not done.
    update public.tasks t set deleted_at = now()
     where t.project_id = c.project_id and t.entity_type = 'correction' and t.entity_id = c.id and t.kind = 'correction.fix'
       and t.done_at is null and t.deleted_at is null and not (t.assignee_user_id = any (v_want));
  end if;

  update public.tasks t set title = v_title
   where t.project_id = c.project_id and t.entity_type = 'correction' and t.entity_id = c.id and t.kind = 'correction.fix'
     and t.done_at is null and t.deleted_at is null and t.title is distinct from v_title;
  foreach u in array v_want loop
    continue when exists (select 1 from public.tasks t
                           where t.project_id = c.project_id and t.assignee_user_id = u and t.entity_type = 'correction'
                             and t.entity_id = c.id and t.kind = 'correction.fix' and t.done_at is null and t.deleted_at is null);
    perform public.create_task(c.project_id, u, 'correction.fix', v_title, 'correction', c.id);
  end loop;
end;
$$;
revoke execute on function public.correction_fix_tasks(uuid) from public, anon, authenticated;
grant execute on function public.correction_fix_tasks(uuid) to service_role;

create or replace function public.tg_corrections_fix_tasks()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT'
     or row(new.status, new.company_org_id, new.deleted_at, new.title)
        is distinct from row(old.status, old.company_org_id, old.deleted_at, old.title) then
    perform public.correction_fix_tasks(new.id);
  end if;
  return null;
end;
$$;
revoke execute on function public.tg_corrections_fix_tasks() from public, anon, authenticated;
create trigger fix_tasks after insert or update of status, company_org_id, deleted_at, title on public.corrections
  for each row execute function public.tg_corrections_fix_tasks();

-- =====================================================================================================================
-- create_correction: 0026's, plus the company (last, optional, so a call without it is the same call as before). The
-- old form is retired (renamed, callable by nobody), as 0061 and 0073 did.
-- =====================================================================================================================
alter function public.create_correction(uuid, text, text, text, text, text, text[], uuid[], uuid, text)
  rename to create_correction_retired_0098;
revoke execute on function
  public.create_correction_retired_0098(uuid, text, text, text, text, text, text[], uuid[], uuid, text)
from public, anon, authenticated, service_role;

create function public.create_correction(
  p_project_id uuid,
  p_title text,
  p_request_key text,
  p_description text default '',
  p_trade text default '',
  p_location text default '',
  p_spec_tags text[] default '{}',
  p_photo_ids uuid[] default '{}',
  p_notice_file_id uuid default null,
  p_notice_ref text default '',
  p_company_org_id uuid default null
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
                                  notice_file_id, notice_ref, company_org_id, created_by, request_key)
  values (v_org, p_project_id, public.next_number(p_project_id, 'cn'), coalesce(p_title, ''), coalesce(p_description, ''),
          coalesce(p_trade, ''), coalesce(p_location, ''), coalesce(p_spec_tags, '{}'), coalesce(p_photo_ids, '{}'),
          p_notice_file_id, coalesce(p_notice_ref, ''), p_company_org_id, auth.uid(), p_request_key)
  returning * into c;
  insert into public.correction_history (org_id, project_id, correction_id, actor_user_id, action, to_status)
  values (c.org_id, c.project_id, c.id, auth.uid(), 'created', c.status);
  perform public.post_activity(c.project_id, 'correction.opened',
    left(public.correction_label(c.number) || ' opened: ' || c.title, 500), 'correction', c.id, 'corrections.mark_ready');
  return c;
end;
$$;
revoke execute on function public.create_correction(uuid, text, text, text, text, text, text[], uuid[], uuid, text, uuid)
  from public, anon;
grant execute on function public.create_correction(uuid, text, text, text, text, text, text[], uuid[], uuid, text, uuid)
  to authenticated, service_role;
