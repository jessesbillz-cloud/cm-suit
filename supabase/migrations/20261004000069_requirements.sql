-- 0069 Requirements: the job's register of what the spec book commits people to beyond the submittals (Jesse, Oct 3:
-- "extracting all the data from the books ... putting it all into a laid out, easy to manage timeline of
-- responsibilities based on who owns that item ... boom, 60 days out ... did you order your owner-furnished restroom
-- accessories? ... Be flexible, not rigid: not every manufacturer sends a rep, sometimes they just take pictures").
--   * Roles and capabilities as data (provisional; Jesse reviews): requirements.read for the GC team (superintendent,
--     pe, pm, project_admin, safety), the inspectors (inspector, inspector_admin, special_inspector), the owner
--     rep and the architect; requirements.manage (add, edit, status, keep or drop drafts, read the spec book with AI):
--     pe, pm, project_admin and inspector_admin (it follows the project admin, 0044). Requirements joins the
--     recommended rail before Files (else at the end) for the pe, the pm and the superintendent. Not the project admin
--     or inspector_admin: their rails already hold eight (0040's cap; Schedule took the admin's last place in 0062), so
--     for them Requirements is under More.
--   * Module 'requirements': on for jobs being built (existing ones too); a job tool on the rail (job_rail_tools).
--   * requirements: one row per commitment. Kind (OFCI, OFOI, CFCI, testing, witness, manufacturer's rep, warranty,
--     training, attic stock, closeout document, notice, mockup, other), the spec section and paragraph, a title and
--     details, who is responsible (company or role, as words), required / optional / if applicable ("not all of it is
--     mandatory"), notice and lead days, the trigger (a schedule activity's code and name as text, and its date, which
--     the user sets until the schedule is linked; or a fixed date), the status (open, requested, scheduled, done, waived,
--     n/a), the evidence (a note and/or a file), and where it came from (a file and page, the quoted sentence).
--     due_on = trigger date - notice days - lead days, set by the database on every write (never by the browser).
--   * Drafts: the AI's candidates from one spec section (edge function requirements-extract, task extractRequirements)
--     land as drafts with the quoted sentence; only requirements.manage sees them; Keep confirms, Drop removes (Undo
--     both). A candidate the job already has (by kind, section and title, or by its quote; dropped ones too) is skipped,
--     so reading a section twice adds nothing.
--   * Deny by default: people read through RLS (requirements.read; drafts only with requirements.manage) and write only
--     through the SECURITY DEFINER RPCs below (identity from auth.uid(), version checks on saves).
--   * Evidence files live in the job's "Requirements" folder (made on first use: requirements.read reads,
--     requirements.manage uploads), or any job file the person may see.
--   * Reminder: requirements_check() runs each morning (pg_cron). A kept requirement that is open or requested, not
--     optional, and due within 7 days or past gets one board line for requirements.manage ("Notify the owner: Restroom
--     accessories (OFCI) - due Nov 2") and a task for each member who may manage them (requirements.manage); once per requirement and due date (a new due date reminds again). Requested -> scheduled / done / waived /
--     n/a, or removing it, completes those tasks; so does a moved due date (the new one reminds). An Undo back to open or
--     requested, or a restore, lets the next morning remind again.
--   * The schedule (agent Q, 0062) is not referenced here: see TODO(schedule-link) in requirements_check().

-- =====================================================================================================================
-- Roles and capabilities, as data
-- =====================================================================================================================
insert into public.role_permissions (role, capability, requires_aal2) values
  -- Not the foreman: a crew lead never reads other subs' paperwork (SPEC 18.3); his own company's lines come with
  -- requirements.read_own (0073).
  ('superintendent', 'requirements.read', false), ('pe', 'requirements.read', false),
  ('pm', 'requirements.read', false), ('project_admin', 'requirements.read', false), ('safety', 'requirements.read', false),
  ('inspector', 'requirements.read', false), ('inspector_admin', 'requirements.read', false),
  ('special_inspector', 'requirements.read', false), ('owner_rep', 'requirements.read', false),
  ('architect', 'requirements.read', false),
  ('pe', 'requirements.manage', false), ('pm', 'requirements.manage', false), ('project_admin', 'requirements.manage', false),
  -- inspector_admin is the inspector plus the project admin (0044), so it follows the project admin.
  ('inspector_admin', 'requirements.manage', false)
on conflict do nothing;

-- Before Files (else at the end); a rail stays at eight at most (0040).
update public.roles
   set recommended_tools = case
         when 'files' = any (recommended_tools)
           then recommended_tools[1:array_position(recommended_tools, 'files') - 1] || '{requirements}'::text[]
                || recommended_tools[array_position(recommended_tools, 'files'):]
         else recommended_tools || '{requirements}'::text[] end
 where name in ('pe', 'pm', 'project_admin', 'superintendent') and not ('requirements' = any (recommended_tools))
   and cardinality(recommended_tools) < 8;

-- =====================================================================================================================
-- Module and rail
-- =====================================================================================================================
-- Requirements comes on when a job reaches construction / closeout. Never taken off. Runs as the person saving the job.
create or replace function public.tg_project_requirements_module()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.stage in ('construction', 'closeout') and not ('requirements' = any (new.modules))
     and (tg_op = 'INSERT' or (old.stage is distinct from new.stage and old.stage not in ('construction', 'closeout'))) then
    new.modules := array(select distinct m from unnest(new.modules || '{requirements}'::text[]) m order by m);
  end if;
  return new;
end;
$$;
create trigger requirements_module before insert or update of stage on public.projects
  for each row execute function public.tg_project_requirements_module();

update public.projects
   set modules = array(select distinct m from unnest(modules || '{requirements}'::text[]) m order by m)
 where stage in ('construction', 'closeout') and not ('requirements' = any (modules));

-- Same as 0060 plus Requirements after Safety (lib/layout RAIL_TOOLS mirrors it).
create or replace function public.job_rail_tools()
returns text[]
language sql
immutable
set search_path = public, pg_temp
as $$
  select '{board,files,bids,calendar,dailies,inspections,revs,rfis,permits,deliveries,corrections,safety,schedule,requirements,people,hours}'::text[];
$$;

-- =====================================================================================================================
-- The job's Requirements folder: evidence (a rep's photos, a test report, a warranty letter, a training sign-in sheet)
-- =====================================================================================================================
alter table public.folders drop constraint folders_kind_check;
alter table public.folders add constraint folders_kind_check
  check (kind in ('general', 'plans', 'specs', 'reports', 'bids_received', 'inbound', 'photos', 'transmittals', 'system',
                  'dsa_103', 'ccd', 'ti', 'bid_forms', 'rfis', 'approved_plans', 'permit_uploads', 'stamping', 'safety',
                  'schedule', 'requirements'));

-- Same as 0068 plus "Requirements" at the top of a job.
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
                                when 'reports' then array['Inspection reports', 'OFS inspection reports']
                                when 'photos' then array['Corrections'] end)
  end;
$$;

-- Made on first use: requirements.read reads, requirements.manage uploads. Internal (the caller checks).
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
      (v_folder, 'requirements.manage', true, true, auth.uid());
  elsif v_deleted is not null then
    update public.folders set deleted_at = null where id = v_folder;
  end if;
  return v_folder;
end;
$$;

create or replace function public.requirements_folder(p_project_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not public.has_capability(p_project_id, 'requirements.manage') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return public.requirements_folder_make(p_project_id);
end;
$$;

-- =====================================================================================================================
-- Shapes
-- =====================================================================================================================
-- The kinds (lib/requirements REQUIREMENT_KINDS mirrors the list and its labels).
create or replace function public.requirement_kind_ok(p_kind text)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select p_kind in ('ofci', 'ofoi', 'cfci', 'testing', 'witness', 'mfr_rep', 'warranty', 'training', 'attic_stock',
                    'closeout_doc', 'notice', 'mockup', 'other');
$$;

-- A spec section as people write it: "10 28 00" (six digits are spaced: "102800" -> "10 28 00"), "01 78 23.13", or
-- empty. Whitespace collapsed.
create or replace function public.requirement_section(p_text text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case when v ~ '^\d{6}(\.\d{1,2})?$' then substr(v, 1, 2) || ' ' || substr(v, 3, 2) || ' ' || substr(v, 5) else v end
    from (select regexp_replace(btrim(coalesce(p_text, '')), '\s+', ' ', 'g') as v) x;
$$;

-- =====================================================================================================================
-- Tables
-- =====================================================================================================================
create table public.requirements (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id),
  version int not null default 1,
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id),
  org_id uuid not null,
  project_id uuid not null,
  kind text not null check (public.requirement_kind_ok(kind)),
  title text not null check (length(btrim(title)) between 1 and 200),
  details text not null default '' check (length(details) <= 2000),
  -- The spec section ("10 28 00"), its title ("Toilet Accessories") and the paragraph ("1.5.A").
  spec_section text not null default '' check (spec_section ~ '^[0-9A-Za-z .-]{0,20}$'),
  spec_title text not null default '' check (length(spec_title) <= 120),
  spec_ref text not null default '' check (length(spec_ref) <= 40),
  -- Who does it, as words: a company, a trade or a role ("Owner", "Roofing sub", "GC").
  responsible text not null default '' check (length(responsible) <= 120),
  required text not null default 'yes' check (required in ('yes', 'optional', 'if_applicable')),
  -- "Notify the owner 60 days before" (notice) and the time to get it (lead), both counted back from the trigger.
  notice_days int check (notice_days between 0 and 730),
  lead_days int check (lead_days between 0 and 730),
  -- The trigger: a schedule activity (its code stays the same across monthly updates, and its name), or an event in
  -- words ("Substantial completion"); and its date, set by the user until the schedule is linked. A fixed date alone
  -- is a trigger too.
  activity_code text not null default '' check (length(activity_code) <= 40),
  activity_name text not null default '' check (length(activity_name) <= 160),
  trigger_date date,
  -- trigger_date - notice_days - lead_days; set by tg_requirement_due on every write.
  due_on date,
  status text not null default 'open' check (status in ('open', 'requested', 'scheduled', 'done', 'waived', 'na')),
  status_at timestamptz,
  status_by uuid references auth.users(id),
  evidence_note text not null default '' check (length(evidence_note) <= 2000),
  evidence_file_id uuid references public.files(id),
  -- Typed in, or the AI's candidate from a spec section (a draft until kept).
  origin text not null default 'hand' check (origin in ('hand', 'ai')),
  draft boolean not null default false,
  confirmed_at timestamptz,
  confirmed_by uuid references auth.users(id),
  model text check (model is null or length(model) <= 100),
  source_file_id uuid references public.files(id),
  source_page int check (source_page between 1 and 100000),
  source_quote text not null default '' check (length(source_quote) <= 600),
  -- requirement_save's p_key: a repeat is the same requirement.
  request_key uuid,
  foreign key (project_id, org_id) references public.projects (id, org_id),
  unique (created_by, request_key),
  check (origin = 'ai' or not draft),
  check (not draft or confirmed_at is null),
  check ((confirmed_at is null) = (confirmed_by is null)),
  check ((deleted_at is null) = (deleted_by is null))
);
alter table public.requirements enable row level security;
create index requirements_project_due on public.requirements (project_id, due_on) where deleted_at is null;

-- Which due dates were reminded (the reminder's own bookkeeping, so a reminder never bumps a row's version). Service
-- role only. Nothing is deleted here: a reminder that may go out again (requirement_rearm) is marked rearmed_at, and
-- reminding again clears the mark.
create table public.requirement_reminders (
  requirement_id uuid not null references public.requirements(id),
  due_on date not null,
  reminded_at timestamptz not null default now(),
  rearmed_at timestamptz,
  primary key (requirement_id, due_on)
);
alter table public.requirement_reminders enable row level security;

create or replace function public.tg_requirement_due()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.due_on := new.trigger_date - coalesce(new.notice_days, 0) - coalesce(new.lead_days, 0);
  return new;
end;
$$;
create trigger due before insert or update of trigger_date, notice_days, lead_days on public.requirements
  for each row execute function public.tg_requirement_due();
create trigger touch before update on public.requirements for each row execute function public.tg_touch_row();
create trigger no_delete before delete on public.requirements for each row execute function public.tg_block_delete();

-- =====================================================================================================================
-- RLS: read only; every write is an RPC below
-- =====================================================================================================================
create policy "requirements: requirements.read; drafts to managers" on public.requirements for select to authenticated
  using (deleted_at is null and public.has_capability(project_id, 'requirements.read')
         and (not draft or public.has_capability(project_id, 'requirements.manage')));

revoke all on public.requirements, public.requirement_reminders from public, anon, authenticated, service_role;
-- Every column but the save key.
grant select (id, created_at, updated_at, created_by, version, deleted_at, deleted_by, org_id, project_id, kind, title,
              details, spec_section, spec_title, spec_ref, responsible, required, notice_days, lead_days, activity_code,
              activity_name, trigger_date, due_on, status, status_at, status_by, evidence_note, evidence_file_id, origin,
              draft, confirmed_at, confirmed_by, model, source_file_id, source_page, source_quote)
  on public.requirements to authenticated, service_role;
grant select, insert on public.requirement_reminders to service_role;

-- =====================================================================================================================
-- Internal helpers (not user-callable)
-- =====================================================================================================================
-- The requirement, held for the change, if the caller manages requirements on its job.
create or replace function public.requirement_lock(p_id uuid)
returns public.requirements
language plpgsql
set search_path = public, pg_temp
as $$
declare r public.requirements;
begin
  select * into r from public.requirements where id = p_id for update;
  if r.id is null or auth.uid() is null or not public.has_capability(r.project_id, 'requirements.read') then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if not public.has_capability(r.project_id, 'requirements.manage') then raise exception 'forbidden' using errcode = '42501'; end if;
  return r;
end;
$$;

create or replace function public.requirement_version(r public.requirements, p_version int)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if p_version is null or r.version <> p_version then
    raise exception 'version_conflict: expected %, found %', p_version, r.version using errcode = '40001';
  end if;
end;
$$;

-- A job file the caller may see, not infected (evidence, or the spec file a draft came from).
create or replace function public.requirement_file_ok(p_project_id uuid, p_file_id uuid)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select exists (select 1 from public.files f
                  where f.id = p_file_id and f.project_id = p_project_id and f.deleted_at is null
                    and f.scan_status <> 'infected' and public.file_may_see(f.project_id, f.created_by, f.folder_id));
$$;

-- The reminder's tasks for a requirement are done (it was scheduled, done, waived, n/a or removed).
create or replace function public.requirement_tasks_done(p_id uuid)
returns void
language sql
set search_path = public, pg_temp
as $$
  update public.tasks set done_at = now(), done_by = auth.uid()
   where kind = 'requirements.due' and entity_type = 'requirement' and entity_id = p_id
     and done_at is null and deleted_at is null;
$$;

-- The next morning's check may remind again (after an Undo back to open or requested, a restore, or a draft kept again).
create or replace function public.requirement_rearm(p_id uuid)
returns void
language sql
set search_path = public, pg_temp
as $$
  update public.requirement_reminders set rearmed_at = now() where requirement_id = p_id and rearmed_at is null;
$$;

-- The reminder's words: "Notify the owner: Restroom accessories (OFCI) - due Nov 2" (lib/requirements' kind labels).
create or replace function public.requirement_reminder_line(p_kind text, p_title text, p_due date, p_today date)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select concat_ws(': ',
           case p_kind
             when 'ofci' then 'Notify the owner' when 'ofoi' then 'Notify the owner' when 'cfci' then 'Order'
             when 'testing' then 'Schedule the test' when 'witness' then 'Book the witness'
             when 'mfr_rep' then 'Book the manufacturer''s rep' when 'warranty' then 'Get the warranty'
             when 'training' then 'Schedule owner training' when 'attic_stock' then 'Deliver attic stock'
             when 'closeout_doc' then 'Turn in' when 'notice' then 'Send the notice' when 'mockup' then 'Build the mockup'
           end,
           left(public.rev_clean(p_title), 200)
             || case when p_kind in ('ofci', 'ofoi', 'cfci') then ' (' || upper(p_kind) || ')' else '' end)
         || case when p_due < p_today then ' — was due ' else ' — due ' end || to_char(p_due, 'Mon FMDD');
$$;

-- =====================================================================================================================
-- Reads
-- =====================================================================================================================
-- The job's requirements as the caller may see them (RLS on every table: drafts only to managers, a file's name only
-- when the caller may see the file), with the days left to each due date on the job's clock.
create or replace function public.requirements_list(p_project_id uuid)
returns table (
  id uuid, version int, kind text, title text, details text, spec_section text, spec_title text, spec_ref text,
  responsible text, required text, notice_days int, lead_days int, activity_code text, activity_name text,
  trigger_date date, due_on date, days_left int, status text, status_at timestamptz, evidence_note text,
  evidence_file_id uuid, evidence_file_name text, origin text, draft boolean, source_file_id uuid, source_file_name text,
  source_page int, source_quote text, created_at timestamptz
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select r.id, r.version, r.kind, r.title, r.details, r.spec_section, r.spec_title, r.spec_ref, r.responsible, r.required,
         r.notice_days, r.lead_days, r.activity_code, r.activity_name, r.trigger_date, r.due_on,
         r.due_on - (now() at time zone p.timezone)::date, r.status, r.status_at, r.evidence_note, r.evidence_file_id,
         ef.original_name, r.origin, r.draft, r.source_file_id, sf.original_name, r.source_page, r.source_quote, r.created_at
    from public.requirements r
    join public.projects p on p.id = r.project_id
    left join public.files ef on ef.id = r.evidence_file_id
    left join public.files sf on sf.id = r.source_file_id
   where r.project_id = p_project_id and r.deleted_at is null
   order by r.due_on nulls last, r.spec_section, r.created_at, r.id;
$$;

-- The spec book's sections, found from the page text (file_pages): every file in the job's Specs folders the caller
-- may see, and the sections that start in it ("SECTION 10 28 00 - TOILET ACCESSORIES" at the top of a page; the
-- section runs until the next one starts). A file with no text yet, or none found, is one row with no section.
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
-- Writes (requirements.manage)
-- =====================================================================================================================
-- Add (p_id null; a repeat with the same p_key is the same requirement) or change one (with its version). Drafts can be
-- changed before they are kept.
create or replace function public.requirement_save(
  p_project_id uuid, p_id uuid, p_version int, p_key uuid, p_kind text, p_title text, p_details text,
  p_spec_section text, p_spec_title text, p_spec_ref text, p_responsible text, p_required text, p_notice_days int,
  p_lead_days int, p_activity_code text, p_activity_name text, p_trigger_date date
)
returns table (id uuid, version int)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid(); v_org uuid; r public.requirements;
  v_title text := public.rev_clean(p_title);
  v_details text := btrim(coalesce(p_details, ''));
  v_section text := public.requirement_section(p_spec_section);
  v_spec_title text := public.rev_clean(p_spec_title);
  v_ref text := public.rev_clean(p_spec_ref);
  v_who text := public.rev_clean(p_responsible);
  v_code text := public.rev_clean(p_activity_code);
  v_activity text := public.rev_clean(p_activity_name);
  v_due date;
begin
  if v_uid is null or not public.has_capability(p_project_id, 'requirements.manage') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select org_id into v_org from public.projects where id = p_project_id and deleted_at is null;
  if v_org is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not coalesce(public.requirement_kind_ok(p_kind), false) then raise exception 'Pick a kind.' using errcode = '22023'; end if;
  if v_title = '' then raise exception 'Name it.' using errcode = '22023'; end if;
  if length(v_title) > 200 then raise exception 'Keep the title to 200 characters.' using errcode = '22023'; end if;
  if length(v_details) > 2000 then raise exception 'Keep the details to 2000 characters.' using errcode = '22023'; end if;
  if v_section !~ '^[0-9A-Za-z .-]{0,20}$' then raise exception 'The section is a number like 10 28 00.' using errcode = '22023'; end if;
  if length(v_spec_title) > 120 or length(v_ref) > 40 then raise exception 'Shorten the section title or paragraph.' using errcode = '22023'; end if;
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
                                     trigger_date, request_key)
    values (v_uid, v_org, p_project_id, p_kind, v_title, v_details, v_section, v_spec_title, v_ref, v_who, p_required,
            p_notice_days, p_lead_days, v_code, v_activity, p_trigger_date, p_key)
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
    update public.requirements x
       set kind = p_kind, title = v_title, details = v_details, spec_section = v_section, spec_title = v_spec_title,
           spec_ref = v_ref, responsible = v_who, required = p_required, notice_days = p_notice_days,
           lead_days = p_lead_days, activity_code = v_code, activity_name = v_activity, trigger_date = p_trigger_date
     where x.id = r.id
     returning * into r;
    -- A moved due date: the old reminder's tasks are done; the morning check reminds for the new one.
    if r.due_on is distinct from v_due then perform public.requirement_tasks_done(r.id); end if;
  end if;
  perform public.audit(case when p_id is null then 'requirement.create' else 'requirement.update' end, 'requirement', r.id,
    p_project_id, v_org, jsonb_build_object('kind', r.kind, 'title', r.title, 'due_on', r.due_on));
  return query select r.id, r.version;
end;
$$;

-- One tap: open, requested, scheduled, done, waived, n/a (with the version). Undo sets it back the same way.
create or replace function public.requirement_set_status(p_id uuid, p_version int, p_status text)
returns table (id uuid, version int, status text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare r public.requirements; v_was text;
begin
  select * into r from public.requirement_lock(p_id);
  if r.deleted_at is not null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if r.draft then raise exception 'Keep the draft first.' using errcode = '22023'; end if;
  if coalesce(p_status, '') not in ('open', 'requested', 'scheduled', 'done', 'waived', 'na') then
    raise exception 'Pick a status.' using errcode = '22023';
  end if;
  perform public.requirement_version(r, p_version);
  if p_status <> r.status then
    v_was := r.status;
    update public.requirements x set status = p_status, status_at = now(), status_by = auth.uid()
     where x.id = r.id returning * into r;
    if p_status not in ('open', 'requested') then perform public.requirement_tasks_done(r.id);
    elsif v_was not in ('open', 'requested') then perform public.requirement_rearm(r.id);
    end if;
    perform public.audit('requirement.status', 'requirement', r.id, r.project_id, r.org_id,
      jsonb_build_object('status', r.status, 'title', r.title));
  end if;
  return query select r.id, r.version, r.status;
end;
$$;

-- The evidence: a note and/or a file (the job's Requirements folder, or any job file the caller may see).
create or replace function public.requirement_evidence(p_id uuid, p_version int, p_note text, p_file_id uuid)
returns table (id uuid, version int)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare r public.requirements; v_note text := btrim(coalesce(p_note, ''));
begin
  select * into r from public.requirement_lock(p_id);
  if r.deleted_at is not null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if length(v_note) > 2000 then raise exception 'Keep the note to 2000 characters.' using errcode = '22023'; end if;
  if p_file_id is not null and p_file_id is distinct from r.evidence_file_id
     and not public.requirement_file_ok(r.project_id, p_file_id) then
    raise exception 'Pick a file of this job.' using errcode = '22023';
  end if;
  perform public.requirement_version(r, p_version);
  update public.requirements x set evidence_note = v_note, evidence_file_id = p_file_id where x.id = r.id returning * into r;
  perform public.audit('requirement.evidence', 'requirement', r.id, r.project_id, r.org_id,
    jsonb_build_object('note', v_note <> '', 'file_id', p_file_id));
  return query select r.id, r.version;
end;
$$;

-- Keep a draft (p_keep true), or send a kept AI line back to the drafts (Undo).
create or replace function public.requirement_keep(p_id uuid, p_version int, p_keep boolean)
returns table (id uuid, version int)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare r public.requirements;
begin
  select * into r from public.requirement_lock(p_id);
  if r.deleted_at is not null then raise exception 'not_found' using errcode = 'P0002'; end if;
  perform public.requirement_version(r, p_version);
  if p_keep then
    if not r.draft then raise exception 'Already kept.' using errcode = '22023'; end if;
    update public.requirements x set draft = false, confirmed_at = now(), confirmed_by = auth.uid()
     where x.id = r.id returning * into r;
  else
    if r.draft or r.origin <> 'ai' then raise exception 'Only a kept draft goes back.' using errcode = '22023'; end if;
    update public.requirements x set draft = true, confirmed_at = null, confirmed_by = null
     where x.id = r.id returning * into r;
    perform public.requirement_tasks_done(r.id);
    perform public.requirement_rearm(r.id);
  end if;
  perform public.audit(case when p_keep then 'requirement.keep' else 'requirement.unkeep' end, 'requirement', r.id,
    r.project_id, r.org_id, jsonb_build_object('title', r.title));
  return query select r.id, r.version;
end;
$$;

-- Drop a draft or remove a requirement (p_removed true), or put it back (Undo). Answers the new version.
create or replace function public.requirement_remove(p_id uuid, p_removed boolean)
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare r public.requirements;
begin
  select * into r from public.requirement_lock(p_id);
  if p_removed and r.deleted_at is null then
    update public.requirements set deleted_at = now(), deleted_by = auth.uid() where id = r.id returning * into r;
    perform public.requirement_tasks_done(r.id);
  elsif not p_removed and r.deleted_at is not null then
    update public.requirements set deleted_at = null, deleted_by = null where id = r.id returning * into r;
    perform public.requirement_rearm(r.id);
  end if;
  perform public.audit(case when p_removed then 'requirement.remove' else 'requirement.restore' end, 'requirement', r.id,
    r.project_id, r.org_id, jsonb_build_object('title', r.title, 'draft', r.draft));
  return r.version;
end;
$$;

-- The AI's candidates from one spec section, as drafts (the edge function requirements-extract calls this as the
-- caller, after its checks). Each: {kind, title, details, spec_section, spec_title, spec_ref, responsible, required,
-- notice_days, lead_days, activity_name, quote, page}. A candidate the job already has (by kind, section and title, or
-- by its quote; dropped and removed ones too) is skipped, so a repeat adds nothing.
create or replace function public.requirements_add_drafts(p_project_id uuid, p_model text, p_source_file_id uuid, p_drafts jsonb)
returns table (added int, skipped int)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid(); v_org uuid; d jsonb; v_added int := 0; v_skipped int := 0;
  v_kind text; v_title text; v_section text; v_quote text; v_required text; v_notice int; v_lead int; v_page int;
begin
  if v_uid is null or not public.has_capability(p_project_id, 'requirements.manage') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select org_id into v_org from public.projects where id = p_project_id and deleted_at is null;
  if v_org is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if jsonb_typeof(p_drafts) is distinct from 'array' or jsonb_array_length(p_drafts) > 60 then
    raise exception 'Up to 60 drafts at a time.' using errcode = '22023';
  end if;
  if length(coalesce(p_model, '')) not between 1 and 100 then raise exception 'model required' using errcode = '22023'; end if;
  if p_source_file_id is not null and not public.requirement_file_ok(p_project_id, p_source_file_id) then
    raise exception 'Pick a file of this job.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtext('requirements_drafts:' || p_project_id::text));
  for d in select x from jsonb_array_elements(p_drafts) x loop
    v_kind := d->>'kind';
    v_title := public.rev_clean(d->>'title');
    v_section := public.requirement_section(d->>'spec_section');
    v_quote := public.rev_clean(d->>'quote');
    v_required := coalesce(d->>'required', 'yes');
    v_notice := (d->>'notice_days')::int;
    v_lead := (d->>'lead_days')::int;
    v_page := (d->>'page')::int;
    if not coalesce(public.requirement_kind_ok(v_kind), false) or v_title = '' or length(v_title) > 200
       or v_section !~ '^[0-9A-Za-z .-]{0,20}$' or length(v_quote) > 600 or v_required not in ('yes', 'optional', 'if_applicable')
       or coalesce(v_notice, 0) not between 0 and 730 or coalesce(v_lead, 0) not between 0 and 730
       or coalesce(v_page, 1) not between 1 and 100000 then
      raise exception 'A draft is not in the expected shape.' using errcode = '22023';
    end if;
    if exists (select 1 from public.requirements r
                where r.project_id = p_project_id and r.kind = v_kind
                  and ((lower(r.title) = lower(v_title) and r.spec_section = v_section)
                       or (v_quote <> '' and lower(r.source_quote) = lower(v_quote)))) then
      v_skipped := v_skipped + 1;
      continue;
    end if;
    insert into public.requirements (created_by, org_id, project_id, kind, title, details, spec_section, spec_title, spec_ref,
                                     responsible, required, notice_days, lead_days, activity_name, origin, draft, model,
                                     source_file_id, source_page, source_quote)
    values (v_uid, v_org, p_project_id, v_kind, v_title, left(btrim(coalesce(d->>'details', '')), 2000), v_section,
            left(public.rev_clean(d->>'spec_title'), 120), left(public.rev_clean(d->>'spec_ref'), 40),
            left(public.rev_clean(d->>'responsible'), 120), v_required, v_notice, v_lead,
            left(public.rev_clean(d->>'activity_name'), 160), 'ai', true, p_model, p_source_file_id,
            case when p_source_file_id is null then null else v_page end, v_quote);
    v_added := v_added + 1;
  end loop;
  perform public.audit('requirement.drafts', 'project', p_project_id, p_project_id, v_org,
    jsonb_build_object('added', v_added, 'skipped', v_skipped, 'model', p_model, 'file_id', p_source_file_id));
  return query select v_added, v_skipped;
end;
$$;

-- =====================================================================================================================
-- The reminder: due within 7 days or past, checked each morning
-- =====================================================================================================================
-- p_at: the moment to check as (now, from the schedule). Answers how many requirements were reminded.
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
    --      and r.trigger_date is distinct from a.start;
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
      insert into public.requirement_reminders (requirement_id, due_on) values (r.id, r.due_on)
      on conflict (requirement_id, due_on) do update set reminded_at = now(), rearmed_at = null;
      v_n := v_n + 1;
    end loop;
  end loop;
  return v_n;
end;
$$;

select cron.schedule('requirements-check', '17 14 * * *', $$select public.requirements_check()$$);

-- =====================================================================================================================
-- Grants: the RPCs people call; the reminder for the service role; the rest is internal.
-- =====================================================================================================================
do $$
declare f text;
begin
  foreach f in array array[
    'public.requirements_folder(uuid)',
    'public.requirements_list(uuid)',
    'public.requirements_spec_sections(uuid)',
    'public.requirement_save(uuid, uuid, integer, uuid, text, text, text, text, text, text, text, text, integer, integer, text, text, date)',
    'public.requirement_set_status(uuid, integer, text)',
    'public.requirement_evidence(uuid, integer, text, uuid)',
    'public.requirement_keep(uuid, integer, boolean)',
    'public.requirement_remove(uuid, boolean)',
    'public.requirements_add_drafts(uuid, text, uuid, jsonb)',
    -- In the checks and the read functions.
    'public.requirement_kind_ok(text)', 'public.requirement_section(text)']
  loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
  foreach f in array array[
    'public.requirements_check(timestamp with time zone)', 'public.requirements_folder_make(uuid)',
    'public.requirement_lock(uuid)', 'public.requirement_version(public.requirements, integer)',
    'public.requirement_file_ok(uuid, uuid)', 'public.requirement_tasks_done(uuid)', 'public.requirement_rearm(uuid)',
    'public.requirement_reminder_line(text, text, date, date)']
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
  foreach f in array array['public.tg_project_requirements_module()', 'public.tg_requirement_due()']
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
  end loop;
end $$;
