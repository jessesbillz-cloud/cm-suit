-- 0073 Requirements: each sub sees the lines that are theirs, and only those (Jesse, Oct 4: "requirements visible to
-- each sub for their own lines", SPEC §18.4 P4.4: "each owned by a sub, visible to that sub on day one").
--
-- PROVISIONAL MATRIX CHANGE (Jesse reviews): a new capability, requirements.read_own, for the roles a sub's people hold:
-- 'sub' (the sub's office) and 'foreman' (the crew lead). Not 'requester' (the no-login field request, 0055: their own
-- requests only), not 'bidder' (walled: not on the job yet), not 'viewer'. Requirements joins the sub's recommended rail
-- before Files (five tools before, six now). The foreman keeps what 0069 gave him (requirements.read, the tool under
-- More), read_own adds only the evidence on his own company's lines and their reminder.
--
--   * Whose line it is, as data: requirements.company_org_id -> orgs(id), nullable. It is the same company a membership
--     carries (project_members.member_org_id -> orgs), the one thing about "my company on this job" a member cannot set
--     for himself (members.manage or the invite writes it, a profile's company is free text he types, and the subs
--     directory and the deliveries' company list are names with no tie to a membership). The words (responsible) stay:
--     a role, the owner, a company not on the job yet. Picking a company writes its name into the words. Nothing links
--     by itself: a person with requirements.manage picks the company (requirement_save), the AI's drafts never do.
--   * Reading: the row is read by requirements.read as before (drafts by requirements.manage), OR when it is kept (not a
--     draft), not removed, and its company is the company of the caller's own active membership on that job in a role
--     that holds requirements.read_own (requirement_mine). requirements_list runs as the caller, so it follows, it now
--     also answers company_org_id and mine. The spec book's sections (the Read spec form) answer only to
--     requirements.manage (the app never asked for anyone else).
--   * Writing stays with requirements.manage. One narrow write for a company's own people: requirement_evidence_own (a
--     note and/or a file on their own kept line, with the version, a file someone else attached is not theirs to take
--     off or replace, someone else's line is "not found"). The managers get one board line ("Evidence added: ...").
--     Their files go in the job's Requirements folder, which requirements.read_own may write and not read (as
--     ir.request on "Inspection requests", 0024): they see the files they added, never the folder.
--   * Reminder: the morning check also gives the line's "due" task to the line's own company's people (the same line,
--     the same once-per-due-date record, done the same way). The board line stays for requirements.manage only. When a
--     manager moves a line to another company, the old company's open tasks are done and, if the line was already
--     reminded for its due date, the new company's people get theirs at once.
--   * requirement_save and requirements_list change shape: the old forms are retired (renamed, callable by nobody).

-- =====================================================================================================================
-- The matrix and the rail, as data (provisional)
-- =====================================================================================================================
insert into public.role_permissions (role, capability, requires_aal2) values
  ('sub', 'requirements.read_own', false), ('foreman', 'requirements.read_own', false)
on conflict do nothing;

-- Before Files (else at the end), a rail stays at eight at most (0040).
update public.roles
   set recommended_tools = case
         when 'files' = any (recommended_tools)
           then recommended_tools[1:array_position(recommended_tools, 'files') - 1] || '{requirements}'::text[]
                || recommended_tools[array_position(recommended_tools, 'files'):]
         else recommended_tools || '{requirements}'::text[] end
 where name = 'sub' and not ('requirements' = any (recommended_tools)) and cardinality(recommended_tools) < 8;

-- =====================================================================================================================
-- Whose line it is
-- =====================================================================================================================
alter table public.requirements add column company_org_id uuid references public.orgs(id);
create index requirements_project_company on public.requirements (project_id, company_org_id)
  where deleted_at is null and company_org_id is not null;
-- 0069 grants by column (every column but the save key).
grant select (company_org_id) on public.requirements to authenticated, service_role;

-- The line is my company's: my own active membership on the job carries that company, in a role that holds
-- requirements.read_own (the same row: a second membership with another company does not count).
create or replace function public.requirement_mine(p_project_id uuid, p_company_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p_company_org_id is not null
     and public.has_capability(p_project_id, 'requirements.read_own')
     and exists (select 1
                   from public.project_members pm
                   join public.role_permissions rp on rp.role = pm.role and rp.capability = 'requirements.read_own'
                  where pm.project_id = p_project_id and pm.user_id = auth.uid() and pm.status = 'active'
                    and (pm.access_ends_at is null or pm.access_ends_at > now())
                    and pm.member_org_id = p_company_org_id);
$$;

-- The companies on the job: the company of every membership that is not revoked, not ended and not walled (a bidder is
-- not on the job). Internal (the callers check).
create or replace function public.requirement_member_companies(p_project_id uuid)
returns table (org_id uuid, name text)
language sql
stable
set search_path = public, pg_temp
as $$
  select o.id, o.name
    from public.orgs o
   where o.deleted_at is null
     and exists (select 1 from public.project_members pm
                  where pm.project_id = p_project_id and pm.member_org_id = o.id and pm.status <> 'revoked'
                    and (pm.access_ends_at is null or pm.access_ends_at > now())
                    and not public.role_is_walled(pm.role));
$$;

-- The picker on the add / edit form (requirements.manage).
create or replace function public.requirement_companies(p_project_id uuid)
returns table (org_id uuid, name text)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
begin
  if auth.uid() is null or not public.has_capability(p_project_id, 'requirements.manage') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query select c.org_id, c.name from public.requirement_member_companies(p_project_id) c order by lower(c.name), c.org_id;
end;
$$;

-- =====================================================================================================================
-- RLS: the readers as before, or a company's own kept lines (changed in place: the policy is never missing)
-- =====================================================================================================================
alter policy "requirements: requirements.read; drafts to managers" on public.requirements
  rename to "requirements: readers; drafts to managers; a company its own";
alter policy "requirements: readers; drafts to managers; a company its own" on public.requirements
  using (deleted_at is null
         and ((public.has_capability(project_id, 'requirements.read')
               and (not draft or public.has_capability(project_id, 'requirements.manage')))
              or (not draft and public.requirement_mine(project_id, company_org_id))));

-- =====================================================================================================================
-- Reads
-- =====================================================================================================================
-- 0069's list plus the company and whether the line is my company's (two new columns, so the old form is retired).
alter function public.requirements_list(uuid) rename to requirements_list_retired_0073;
create function public.requirements_list(p_project_id uuid)
returns table (
  id uuid, version int, kind text, title text, details text, spec_section text, spec_title text, spec_ref text,
  responsible text, required text, notice_days int, lead_days int, activity_code text, activity_name text,
  trigger_date date, due_on date, days_left int, status text, status_at timestamptz, evidence_note text,
  evidence_file_id uuid, evidence_file_name text, origin text, draft boolean, source_file_id uuid, source_file_name text,
  source_page int, source_quote text, created_at timestamptz, company_org_id uuid, mine boolean
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select r.id, r.version, r.kind, r.title, r.details, r.spec_section, r.spec_title, r.spec_ref, r.responsible, r.required,
         r.notice_days, r.lead_days, r.activity_code, r.activity_name, r.trigger_date, r.due_on,
         r.due_on - (now() at time zone p.timezone)::date, r.status, r.status_at, r.evidence_note, r.evidence_file_id,
         ef.original_name, r.origin, r.draft, r.source_file_id, sf.original_name, r.source_page, r.source_quote, r.created_at,
         r.company_org_id, public.requirement_mine(r.project_id, r.company_org_id)
    from public.requirements r
    join public.projects p on p.id = r.project_id
    left join public.files ef on ef.id = r.evidence_file_id
    left join public.files sf on sf.id = r.source_file_id
   where r.project_id = p_project_id and r.deleted_at is null
   order by r.due_on nulls last, r.spec_section, r.created_at, r.id;
$$;

-- Same as 0069, for requirements.manage only (the Read spec form is theirs).
create or replace function public.requirements_spec_sections(p_project_id uuid)
returns table (file_id uuid, file_name text, page_count int, text_ready boolean, section text, title text,
               first_page int, last_page int)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with specs as (
    select f.id, f.original_name, f.page_count, f.text_status
      from public.files f
      join public.folders fo on fo.id = f.folder_id and fo.kind = 'specs' and fo.deleted_at is null
     where f.project_id = p_project_id and f.deleted_at is null and f.upload_complete and f.scan_status <> 'infected'
       and public.has_capability(p_project_id, 'requirements.manage')
  ),
  heads as (
    select fp.file_id, fp.page_no,
           regexp_match(left(fp.text, 600),
             '^[ \t]*SECTION[ \t]+(\d{2})[ \t]?(\d{2})[ \t]?(\d{2})((?:\.\d{1,2})?)[ \t]*[-:–—]?[ \t]*([^\r\n]*)', 'n') as m
      from public.file_pages fp
      join specs s on s.id = fp.file_id
  ),
  found as (
    select h.file_id, h.page_no, h.m[1] || ' ' || h.m[2] || ' ' || h.m[3] || h.m[4] as section,
           nullif(left(btrim(h.m[5]), 120), '') as title
      from heads h
     where h.m is not null
  ),
  runs as (
    select f.*, lag(f.section) over (partition by f.file_id order by f.page_no) as prev from found f
  ),
  starts as (
    select r.file_id, r.page_no, r.section, r.title,
           lead(r.page_no) over (partition by r.file_id order by r.page_no) as next_start
      from runs r
     where r.prev is distinct from r.section
  )
  select s.id, s.original_name, s.page_count, s.text_status = 'done', st.section, st.title, st.page_no,
         coalesce(st.next_start - 1, (select max(fp.page_no) from public.file_pages fp where fp.file_id = s.id))
    from specs s
    left join starts st on st.file_id = s.id
   order by s.original_name, s.id, st.page_no nulls first;
$$;

-- =====================================================================================================================
-- The reminder's tasks for a line's own company (internal)
-- =====================================================================================================================
-- The line's "due" task for each of its company's people (requirements.read_own, the matrix says who) who has none
-- open: only while the line is kept, open or requested, not optional and dated. Answers how many it made.
create or replace function public.requirement_own_tasks(p_id uuid, p_today date)
returns int
language plpgsql
set search_path = public, pg_temp
as $$
declare r public.requirements; v_tz text; v_line text; u uuid; v_n int := 0;
begin
  select * into r from public.requirements where id = p_id;
  if r.id is null or r.company_org_id is null or r.deleted_at is not null or r.draft
     or r.status not in ('open', 'requested') or r.required = 'optional' or r.due_on is null then
    return 0;
  end if;
  select timezone into v_tz from public.projects where id = r.project_id;
  v_line := public.requirement_reminder_line(r.kind, r.title, r.due_on, p_today);
  for u in
    select distinct pm.user_id
      from public.project_members pm
     where pm.project_id = r.project_id and pm.member_org_id = r.company_org_id and pm.status = 'active'
       and pm.user_id is not null and (pm.access_ends_at is null or pm.access_ends_at > now())
       and exists (select 1 from public.role_permissions rp where rp.role = pm.role and rp.capability = 'requirements.read_own')
  loop
    continue when exists (select 1 from public.tasks t
                           where t.project_id = r.project_id and t.assignee_user_id = u and t.kind = 'requirements.due'
                             and t.entity_id = r.id and t.done_at is null and t.deleted_at is null);
    perform public.create_task(r.project_id, u, 'requirements.due', v_line, 'requirement', r.id,
      ((r.due_on + 1)::timestamp at time zone v_tz) - interval '1 second');
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

-- The line went to another company (or to none): the open "due" tasks of people who do not manage the register are
-- done (they can no longer read the line, the managers keep theirs).
create or replace function public.requirement_own_tasks_done(p_id uuid)
returns void
language sql
set search_path = public, pg_temp
as $$
  update public.tasks t set done_at = now(), done_by = auth.uid()
   where t.kind = 'requirements.due' and t.entity_type = 'requirement' and t.entity_id = p_id
     and t.done_at is null and t.deleted_at is null
     and not exists (select 1
                       from public.project_members pm
                       join public.role_permissions rp on rp.role = pm.role and rp.capability = 'requirements.manage'
                      where pm.project_id = t.project_id and pm.user_id = t.assignee_user_id and pm.status = 'active'
                        and (pm.access_ends_at is null or pm.access_ends_at > now()));
$$;

-- =====================================================================================================================
-- Writes
-- =====================================================================================================================
-- 0069's add / change, plus the company the line belongs to (null: none). A picked company must be on the job, and its
-- name becomes the words. The old form is retired, p_company_org_id is last and optional, so a call without it is the
-- same call as before.
alter function public.requirement_save(uuid, uuid, integer, uuid, text, text, text, text, text, text, text, text, integer,
                                       integer, text, text, date)
  rename to requirement_save_retired_0073;
revoke execute on function
  public.requirement_save_retired_0073(uuid, uuid, integer, uuid, text, text, text, text, text, text, text, text, integer,
                                       integer, text, text, date),
  public.requirements_list_retired_0073(uuid)
from public, anon, authenticated, service_role;

create function public.requirement_save(
  p_project_id uuid, p_id uuid, p_version int, p_key uuid, p_kind text, p_title text, p_details text,
  p_spec_section text, p_spec_title text, p_spec_ref text, p_responsible text, p_required text, p_notice_days int,
  p_lead_days int, p_activity_code text, p_activity_name text, p_trigger_date date, p_company_org_id uuid default null
)
returns table (id uuid, version int)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid(); v_org uuid; v_tz text; r public.requirements;
  v_title text := public.rev_clean(p_title);
  v_details text := btrim(coalesce(p_details, ''));
  v_section text := public.requirement_section(p_spec_section);
  v_spec_title text := public.rev_clean(p_spec_title);
  v_ref text := public.rev_clean(p_spec_ref);
  v_who text := public.rev_clean(p_responsible);
  v_code text := public.rev_clean(p_activity_code);
  v_activity text := public.rev_clean(p_activity_name);
  v_due date; v_company_was uuid; v_company text;
begin
  if v_uid is null or not public.has_capability(p_project_id, 'requirements.manage') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select org_id, timezone into v_org, v_tz from public.projects where id = p_project_id and deleted_at is null;
  if v_org is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not coalesce(public.requirement_kind_ok(p_kind), false) then raise exception 'Pick a kind.' using errcode = '22023'; end if;
  if v_title = '' then raise exception 'Name it.' using errcode = '22023'; end if;
  if length(v_title) > 200 then raise exception 'Keep the title to 200 characters.' using errcode = '22023'; end if;
  if length(v_details) > 2000 then raise exception 'Keep the details to 2000 characters.' using errcode = '22023'; end if;
  if v_section !~ '^[0-9A-Za-z .-]{0,20}$' then raise exception 'The section is a number like 10 28 00.' using errcode = '22023'; end if;
  if length(v_spec_title) > 120 or length(v_ref) > 40 then raise exception 'Shorten the section title or paragraph.' using errcode = '22023'; end if;
  if p_company_org_id is not null then
    select c.name into v_company from public.requirement_member_companies(p_project_id) c where c.org_id = p_company_org_id;
    if v_company is null then raise exception 'Pick a company on this job.' using errcode = '22023'; end if;
    -- The company's name is the words.
    v_who := left(public.rev_clean(v_company), 120);
  end if;
  if length(v_who) > 120 then raise exception 'Keep who to 120 characters.' using errcode = '22023'; end if;
  if coalesce(p_required, '') not in ('yes', 'optional', 'if_applicable') then
    raise exception 'Pick required, optional or if applicable.' using errcode = '22023';
  end if;
  if coalesce(p_notice_days, 0) not between 0 and 730 or coalesce(p_lead_days, 0) not between 0 and 730 then
    raise exception 'Days are 0 to 730.' using errcode = '22023';
  end if;
  if length(v_code) > 40 or length(v_activity) > 160 then raise exception 'Shorten the activity.' using errcode = '22023'; end if;

  if p_id is null then
    if p_key is not null then
      select * into r from public.requirements x where x.created_by = v_uid and x.request_key = p_key;
      if r.id is not null then
        if r.project_id <> p_project_id then raise exception 'forbidden' using errcode = '42501'; end if;
        return query select r.id, r.version;
        return;
      end if;
    end if;
    insert into public.requirements (created_by, org_id, project_id, kind, title, details, spec_section, spec_title,
                                     spec_ref, responsible, required, notice_days, lead_days, activity_code, activity_name,
                                     trigger_date, request_key, company_org_id)
    values (v_uid, v_org, p_project_id, p_kind, v_title, v_details, v_section, v_spec_title, v_ref, v_who, p_required,
            p_notice_days, p_lead_days, v_code, v_activity, p_trigger_date, p_key, p_company_org_id)
    on conflict (created_by, request_key) do nothing
    returning * into r;
    if r.id is null then
      -- The same key at the same moment (a double tap): that one is the answer.
      select * into r from public.requirements x where x.created_by = v_uid and x.request_key = p_key;
      if r.project_id <> p_project_id then raise exception 'forbidden' using errcode = '42501'; end if;
      return query select r.id, r.version;
      return;
    end if;
  else
    select * into r from public.requirement_lock(p_id);
    if r.project_id <> p_project_id or r.deleted_at is not null then raise exception 'not_found' using errcode = 'P0002'; end if;
    perform public.requirement_version(r, p_version);
    v_due := r.due_on;
    v_company_was := r.company_org_id;
    update public.requirements x
       set kind = p_kind, title = v_title, details = v_details, spec_section = v_section, spec_title = v_spec_title,
           spec_ref = v_ref, responsible = v_who, required = p_required, notice_days = p_notice_days,
           lead_days = p_lead_days, activity_code = v_code, activity_name = v_activity, trigger_date = p_trigger_date,
           company_org_id = p_company_org_id
     where x.id = r.id
     returning * into r;
    if r.due_on is distinct from v_due then
      -- A moved due date: the old reminder's tasks are done, the morning check reminds for the new one.
      perform public.requirement_tasks_done(r.id);
    elsif r.company_org_id is distinct from v_company_was then
      -- Another company's line now: the old company's tasks are done, if the line was already reminded for this due
      -- date, the new company's people get theirs now (else the morning check does it).
      perform public.requirement_own_tasks_done(r.id);
      if exists (select 1 from public.requirement_reminders rr
                  where rr.requirement_id = r.id and rr.due_on = r.due_on and rr.rearmed_at is null) then
        perform public.requirement_own_tasks(r.id, (now() at time zone v_tz)::date);
      end if;
    end if;
  end if;
  perform public.audit(case when p_id is null then 'requirement.create' else 'requirement.update' end, 'requirement', r.id,
    p_project_id, v_org, jsonb_build_object('kind', r.kind, 'title', r.title, 'due_on', r.due_on, 'company_org_id', r.company_org_id));
  return query select r.id, r.version;
end;
$$;

-- Made on first use, as 0069, plus: a company's own people may put their evidence in it (write, not read).
create or replace function public.requirements_folder_make(p_project_id uuid)
returns uuid
language plpgsql
set search_path = public, pg_temp
as $$
declare p public.projects; v_folder uuid; v_deleted timestamptz;
begin
  select * into p from public.projects where id = p_project_id and deleted_at is null;
  if p.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  perform pg_advisory_xact_lock(hashtext('requirements_folder:' || p.id::text));
  select f.id, f.deleted_at into v_folder, v_deleted
    from public.folders f
   where f.project_id = p.id and f.kind = 'requirements'
   order by (f.deleted_at is null) desc, f.created_at
   limit 1;
  if v_folder is null then
    insert into public.folders (org_id, project_id, name, kind, sort, ai_reads, created_by)
    values (p.org_id, p.id, 'Requirements', 'requirements', 76, false, auth.uid())
    on conflict do nothing
    returning id into v_folder;
    if v_folder is null then
      raise exception 'A folder named "Requirements" is in the way. Rename it in Files.' using errcode = '23505';
    end if;
    insert into public.folder_access (folder_id, capability, can_read, can_write, created_by) values
      (v_folder, 'requirements.read', true, false, auth.uid()),
      (v_folder, 'requirements.manage', true, true, auth.uid()),
      (v_folder, 'requirements.read_own', false, true, auth.uid());
  elsif v_deleted is not null then
    update public.folders set deleted_at = null where id = v_folder;
  end if;
  return v_folder;
end;
$$;

-- The folders made before this migration.
insert into public.folder_access (folder_id, capability, can_read, can_write, created_by)
select f.id, 'requirements.read_own', false, true, f.created_by
  from public.folders f
 where f.kind = 'requirements'
   and not exists (select 1 from public.folder_access fa where fa.folder_id = f.id and fa.capability = 'requirements.read_own');

-- The folder for a company's own evidence (requirements.read_own).
create or replace function public.requirements_folder_own(p_project_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not public.has_capability(p_project_id, 'requirements.read_own') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return public.requirements_folder_make(p_project_id);
end;
$$;

-- A company's own evidence on its own kept line: a note and/or a file (one they may see: the one they just uploaded).
-- Someone else's line, a draft or a removed line is "not found" (nothing says it exists). A file someone else attached
-- stays (they add theirs when there is none, or change their own). The managers get one board line an hour at most.
create or replace function public.requirement_evidence_own(p_id uuid, p_version int, p_note text, p_file_id uuid)
returns table (id uuid, version int)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare r public.requirements; v_note text := btrim(coalesce(p_note, '')); v_added boolean;
begin
  select * into r from public.requirements x where x.id = p_id for update;
  if r.id is null or auth.uid() is null or r.deleted_at is not null or r.draft
     or not public.requirement_mine(r.project_id, r.company_org_id) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if length(v_note) > 2000 then raise exception 'Keep the note to 2000 characters.' using errcode = '22023'; end if;
  if p_file_id is distinct from r.evidence_file_id then
    if r.evidence_file_id is not null
       and not exists (select 1 from public.files f where f.id = r.evidence_file_id and f.created_by = auth.uid()) then
      raise exception 'Someone else added that file.' using errcode = '22023';
    end if;
    if p_file_id is not null and not public.requirement_file_ok(r.project_id, p_file_id) then
      raise exception 'Pick a file of this job.' using errcode = '22023';
    end if;
  end if;
  perform public.requirement_version(r, p_version);
  v_added := (p_file_id is not null and p_file_id is distinct from r.evidence_file_id)
             or (v_note <> '' and v_note <> r.evidence_note);
  update public.requirements x set evidence_note = v_note, evidence_file_id = p_file_id where x.id = r.id returning * into r;
  perform public.audit('requirement.evidence', 'requirement', r.id, r.project_id, r.org_id,
    jsonb_build_object('note', v_note <> '', 'file_id', p_file_id, 'own', true));
  if v_added and not exists (select 1 from public.activity a
                              where a.project_id = r.project_id and a.kind = 'requirements.evidence' and a.entity_id = r.id
                                and a.actor_user_id = auth.uid() and a.created_at > now() - interval '1 hour') then
    perform public.post_activity(r.project_id, 'requirements.evidence',
      left('Evidence added: ' || r.title || case when r.responsible <> '' then ' — ' || r.responsible else '' end, 500),
      'requirement', r.id, 'requirements.manage');
  end if;
  return query select r.id, r.version;
end;
$$;

-- =====================================================================================================================
-- The reminder: as 0069, plus the line's own company's people get its task (the board line stays the managers')
-- =====================================================================================================================
create or replace function public.requirements_check(p_at timestamptz default now())
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare p record; r record; v_today date; v_leads uuid[]; u uuid; v_line text; v_n int := 0;
begin
  if not public.is_service_role() then raise exception 'forbidden' using errcode = '42501'; end if;
  for p in select pr.id, pr.timezone from public.projects pr
            where pr.deleted_at is null and pr.stage in ('construction', 'closeout') and 'requirements' = any (pr.modules) loop
    v_today := (p_at at time zone p.timezone)::date;

    -- TODO(schedule-link): after merging the schedule (agent Q, migration 0062), take each linked requirement's trigger
    -- date from the current schedule before checking (tg_requirement_due then moves due_on, and a new due date reminds
    -- again). Something like, with Q's filter for the current version:
    --   update public.requirements r
    --      set trigger_date = a.start
    --     from public.schedule_activities a
    --    where r.project_id = p.id and r.deleted_at is null and r.activity_code <> ''
    --      and a.project_id = r.project_id and a.activity_code = r.activity_code
    --      /* and a is in the job's current schedule version */
    --      and r.trigger_date is distinct from a.start,
    -- (or read schedule_upcoming(p.id, 120) and match on activity_code). The user's own trigger_date stays the
    -- fallback for a requirement whose activity is not on the schedule.

    -- Everyone on the job who may manage the register (the matrix says who). Not "whose rail shows Requirements": a
    -- rail holds eight tools at most (0040), the project admin's is full once Schedule is on it (0062), and the one
    -- person running a small job must still be reminded.
    v_leads := array(
      select distinct pm.user_id
        from public.project_members pm
       where pm.project_id = p.id and pm.status = 'active' and pm.user_id is not null
         and (pm.access_ends_at is null or pm.access_ends_at > now())
         and exists (select 1 from public.role_permissions rp where rp.role = pm.role and rp.capability = 'requirements.manage'));
    for r in
      select q.id, q.kind, q.title, q.due_on
        from public.requirements q
       where q.project_id = p.id and q.deleted_at is null and not q.draft and q.status in ('open', 'requested')
         and q.required <> 'optional' and q.due_on is not null and q.due_on <= v_today + 7
         and not exists (select 1 from public.requirement_reminders rr
                          where rr.requirement_id = q.id and rr.due_on = q.due_on and rr.rearmed_at is null)
       order by q.due_on, q.created_at
    loop
      v_line := public.requirement_reminder_line(r.kind, r.title, r.due_on, v_today);
      perform public.post_activity(p.id, 'requirements.due', v_line, 'requirement', r.id, 'requirements.manage');
      foreach u in array v_leads loop
        continue when exists (select 1 from public.tasks t
                               where t.project_id = p.id and t.assignee_user_id = u and t.kind = 'requirements.due'
                                 and t.entity_id = r.id and t.done_at is null and t.deleted_at is null);
        perform public.create_task(p.id, u, 'requirements.due', v_line, 'requirement', r.id,
          ((r.due_on + 1)::timestamp at time zone p.timezone) - interval '1 second');
      end loop;
      -- The line's own company's people (requirements.read_own), when it has a company.
      perform public.requirement_own_tasks(r.id, v_today);
      insert into public.requirement_reminders (requirement_id, due_on) values (r.id, r.due_on)
      on conflict (requirement_id, due_on) do update set reminded_at = now(), rearmed_at = null;
      v_n := v_n + 1;
    end loop;
  end loop;
  return v_n;
end;
$$;

-- =====================================================================================================================
-- Grants: the RPCs people call, the helpers are internal (a new function is callable by nobody until granted)
-- =====================================================================================================================
do $$
declare f text;
begin
  foreach f in array array[
    'public.requirements_list(uuid)',
    'public.requirements_spec_sections(uuid)',
    'public.requirement_save(uuid, uuid, integer, uuid, text, text, text, text, text, text, text, text, integer, integer, text, text, date, uuid)',
    'public.requirement_companies(uuid)',
    'public.requirements_folder_own(uuid)',
    'public.requirement_evidence_own(uuid, integer, text, uuid)',
    -- In the row policy and the list.
    'public.requirement_mine(uuid, uuid)']
  loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
  foreach f in array array[
    'public.requirements_check(timestamp with time zone)', 'public.requirements_folder_make(uuid)',
    'public.requirement_member_companies(uuid)', 'public.requirement_own_tasks(uuid, date)',
    'public.requirement_own_tasks_done(uuid)']
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
