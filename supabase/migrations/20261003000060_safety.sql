-- 0060 Safety: tailgate safety meetings and any job meeting, signed in from a QR code with no login (Jesse, Oct 3: "when
-- I was a super somebody gave me access to a SharePoint file; I'd pick a class, tell everyone about it in the morning,
-- get them all to sign a piece of paper, turn it in to our safety guy, and I don't know where it goes after that ...
-- pull it right off the app ... a location to store the tailgate safety meetings, standard stock talks ... but also let
-- people create their own, upload a meeting"; "The only no-login page is for signing in to tailgate safety meetings or
-- regular meetings: a public page they reach with the QR code, sign your name, and that's it").
--   * Roles and capabilities as data (provisional; Jesse reviews tonight): a new role 'safety' (safety manager).
--     'foreman' already exists (0001) and gains the safety capabilities. safety.read: every role but the walled ones
--     (bidders) and the requester (requests only, 0055); safety.run (lead a meeting): superintendent, foreman, safety,
--     project_admin, pm, inspector_admin; safety.manage (the company's topic library, closing others' meetings):
--     safety, project_admin (and inspector_admin, the project admin's twin, 0044). The safety manager also gets
--     members.view, calendar.read, comments.write and revs.read (every role but the walled, 0056). Safety joins the
--     superintendent's and the foreman's recommended rail after Dailies.
--   * Module 'safety': on for jobs being built (existing ones too), a job tool on the rail (job_rail_tools).
--   * safety_topics: the library. A small built-in starter set (org_id null, a slug each), original outlines written for
--     this app with the governing regulation section and a link to the official free page (links only, no copied
--     text); plus each company's own (org_id), optionally with a PDF talk in a job's Safety folder. English seeded.
--   * safety_meetings: kind tailgate or meeting, numbered by next_number(job, 'safety_meeting'), held on the job's day,
--     a topic (from the library: its outline is kept as read that day, like an RFI keeps its route) or an own title
--     with notes or a PDF, the leader, open / closed. The sign-in token: only its sha256, made again on demand by the
--     leader ("New QR" on another device), dropped on close, so a closed meeting's QR opens nothing.
--   * safety_signins: the attendance. From the QR (name, company, trade, signature strokes checked here) or ticked in by
--     the leader (a job member). Same name twice in one meeting is one line. Removing a line is a soft remove with Undo.
--   * Deny by default: people read through RLS (safety.read; the token hash is never granted) and write only through
--     the SECURITY DEFINER RPCs below (identity from auth.uid(), version checks on saves). The public page's SQL
--     (link_meeting_*) is service-role only, answers null for a wrong token, refuses once closed or 18 hours after the
--     start, and never returns anyone's name.
--   * Close: the meeting closes (the edge function `safety-meeting` then renders the sign-in sheet PDF from
--     safety_meeting_sheet and records it with safety_meeting_attach, service role only) into the job's Safety folder.
--     A closed tailgate completes the job's "tailgate due" tasks. Undo (reopen) for 15 minutes by the one who closed it.
--   * Reminder: Cal/OSHA 8 CCR 1509(e), a tailgate every 10 working days. safety_tailgate_check() runs each morning
--     (pg_cron) and, on a job's working day with none closed in the last 10 working days (the job's time zone), posts a
--     board line to safety.run and a task for each member whose position recommends Safety and who may run one.
--   * The calendar shows each meeting (kind 'meetings', read by safety.read); my_tool_counts counts the open meetings I
--     lead, so the Safety tool carries a badge.

-- =====================================================================================================================
-- Roles and capabilities, as data
-- =====================================================================================================================
insert into public.roles (name, description, recommended_tools)
values ('safety', 'Safety manager', '{board,safety,calendar}')
on conflict (name) do nothing;

insert into public.role_permissions (role, capability, requires_aal2)
select r.name, 'safety.read', false from public.roles r
 where not public.role_is_walled(r.name) and r.name <> 'requester'
on conflict do nothing;

insert into public.role_permissions (role, capability, requires_aal2) values
  ('superintendent', 'safety.run', false), ('foreman', 'safety.run', false), ('safety', 'safety.run', false),
  ('project_admin', 'safety.run', false), ('pm', 'safety.run', false), ('inspector_admin', 'safety.run', false),
  ('safety', 'safety.manage', false), ('project_admin', 'safety.manage', false),
  -- inspector_admin is the inspector plus the project admin (0044), so it follows the project admin.
  ('inspector_admin', 'safety.manage', false),
  -- What the safety manager needs on the job: its people (to tick them in), its calendar, comments.
  ('safety', 'members.view', false), ('safety', 'calendar.read', false), ('safety', 'comments.write', false),
  -- Revs is read by every role but the walled ones (0056).
  ('safety', 'revs.read', false)
on conflict do nothing;

-- Right after Dailies (else at the end).
update public.roles
   set recommended_tools = case
         when 'dailies' = any (recommended_tools)
           then recommended_tools[1:array_position(recommended_tools, 'dailies')] || '{safety}'::text[]
                || recommended_tools[array_position(recommended_tools, 'dailies') + 1:]
         else recommended_tools || '{safety}'::text[] end
 where name in ('superintendent', 'foreman') and not ('safety' = any (recommended_tools));

-- =====================================================================================================================
-- Module and rail
-- =====================================================================================================================
-- Safety comes on when a job reaches construction / closeout. Never taken off. Runs as the person saving the job.
create or replace function public.tg_project_safety_module()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.stage in ('construction', 'closeout') and not ('safety' = any (new.modules))
     and (tg_op = 'INSERT' or (old.stage is distinct from new.stage and old.stage not in ('construction', 'closeout'))) then
    new.modules := array(select distinct m from unnest(new.modules || '{safety}'::text[]) m order by m);
  end if;
  return new;
end;
$$;
create trigger safety_module before insert or update of stage on public.projects
  for each row execute function public.tg_project_safety_module();

update public.projects
   set modules = array(select distinct m from unnest(modules || '{safety}'::text[]) m order by m)
 where stage in ('construction', 'closeout') and not ('safety' = any (modules));

-- Same as 0058 plus Safety after Corrections (lib/layout RAIL_TOOLS mirrors it).
create or replace function public.job_rail_tools()
returns text[]
language sql
immutable
set search_path = public, pg_temp
as $$
  select '{board,files,bids,calendar,dailies,inspections,revs,rfis,permits,deliveries,corrections,safety,people,hours}'::text[];
$$;

-- =====================================================================================================================
-- The job's Safety folder: own talks (PDF) and the closed meetings' sign-in sheets
-- =====================================================================================================================
alter table public.folders drop constraint folders_kind_check;
alter table public.folders add constraint folders_kind_check
  check (kind in ('general', 'plans', 'specs', 'reports', 'bids_received', 'inbound', 'photos', 'transmittals', 'system',
                  'dsa_103', 'ccd', 'ti', 'bid_forms', 'rfis', 'approved_plans', 'permit_uploads', 'stamping', 'safety'));

-- Same as 0053 plus "Safety" at the top of a job.
create or replace function public.folder_name_reserved(p_project_id uuid, p_parent_id uuid, p_name text)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select case
    when p_parent_id is null then btrim(p_name) in ('Bids received', 'Inspection requests', 'Delivery tickets', 'Emailed in',
                                                     'Bid forms', 'RFIs', 'Approved plans', 'Safety')
    else btrim(p_name) = case (select kind from public.folders where id = p_parent_id and project_id = p_project_id)
                           when 'reports' then 'Inspection reports' when 'photos' then 'Corrections' end
  end;
$$;

-- Made on first use: safety.read reads; whoever leads meetings or keeps the library uploads talks there. The sign-in
-- sheets are stored by the server. Internal (the caller checks): safety_folder below, and the service role.
create or replace function public.safety_folder_make(p_project_id uuid)
returns uuid
language plpgsql
set search_path = public, pg_temp
as $$
declare p public.projects; v_folder uuid; v_deleted timestamptz;
begin
  select * into p from public.projects where id = p_project_id and deleted_at is null;
  if p.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  perform pg_advisory_xact_lock(hashtext('safety_folder:' || p.id::text));
  select f.id, f.deleted_at into v_folder, v_deleted
    from public.folders f
   where f.project_id = p.id and f.kind = 'safety'
   order by (f.deleted_at is null) desc, f.created_at
   limit 1;
  if v_folder is null then
    insert into public.folders (org_id, project_id, name, kind, sort, ai_reads, created_by)
    values (p.org_id, p.id, 'Safety', 'safety', 75, false, auth.uid())
    on conflict do nothing
    returning id into v_folder;
    if v_folder is null then
      raise exception 'A folder named "Safety" is in the way. Rename it in Files.' using errcode = '23505';
    end if;
    insert into public.folder_access (folder_id, capability, can_read, can_write, created_by) values
      (v_folder, 'safety.read', true, false, auth.uid()),
      (v_folder, 'safety.run', true, true, auth.uid()),
      (v_folder, 'safety.manage', true, true, auth.uid());
  elsif v_deleted is not null then
    update public.folders set deleted_at = null where id = v_folder;
  end if;
  return v_folder;
end;
$$;

create or replace function public.safety_folder(p_project_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not (public.has_capability(p_project_id, 'safety.run') or public.has_capability(p_project_id, 'safety.manage')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return public.safety_folder_make(p_project_id);
end;
$$;

-- =====================================================================================================================
-- Shapes the tables check
-- =====================================================================================================================
-- The library's categories (lib/safety SAFETY_CATEGORIES mirrors the list and its labels).
create or replace function public.safety_category_ok(p_category text)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select p_category in ('falls', 'health', 'electrical', 'equipment', 'excavation', 'fire', 'site', 'other');
$$;

-- An outline's lines: up to p_max, each 1 to 300 characters once trimmed.
create or replace function public.safety_lines_ok(p_lines text[], p_max int)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select p_lines is not null and coalesce(array_ndims(p_lines), 1) = 1 and cardinality(p_lines) <= p_max
     and not exists (select 1 from unnest(p_lines) l where l is null or length(btrim(l)) not between 1 and 300);
$$;

-- A signature as drawn on the sign-in page: 1 to 80 strokes, each 1 to 1500 points [x, y] (fractions 0..1 of the pad,
-- origin top-left; the pad is twice as wide as tall), 2 to 3000 points in all. Nothing else.
create or replace function public.safety_signature_ok(p_sig jsonb)
returns boolean
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare s jsonb; v_total int := 0;
begin
  if p_sig is null or jsonb_typeof(p_sig) <> 'array' or jsonb_array_length(p_sig) not between 1 and 80 then return false; end if;
  for s in select value from jsonb_array_elements(p_sig) loop
    if jsonb_typeof(s) <> 'array' or jsonb_array_length(s) not between 1 and 1500 then return false; end if;
    v_total := v_total + jsonb_array_length(s);
    if v_total > 3000 then return false; end if;
    if exists (select 1 from jsonb_array_elements(s) pt
                where case when jsonb_typeof(pt) <> 'array' then true
                           when jsonb_array_length(pt) <> 2 then true
                           when jsonb_typeof(pt -> 0) <> 'number' or jsonb_typeof(pt -> 1) <> 'number' then true
                           when (pt ->> 0)::numeric not between 0 and 1 then true
                           else (pt ->> 1)::numeric not between 0 and 1 end) then
      return false;
    end if;
  end loop;
  return v_total >= 2;
end;
$$;

-- =====================================================================================================================
-- Tables
-- =====================================================================================================================
create table public.safety_topics (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- None for the built-in starters.
  created_by uuid references auth.users(id),
  version int not null default 1,
  deleted_at timestamptz,
  -- The company whose library it is; null = a built-in starter (with its slug).
  org_id uuid references public.orgs(id),
  slug text unique check (slug is null or slug ~ '^[a-z0-9-]{1,60}$'),
  category text not null check (public.safety_category_ok(category)),
  title text not null check (length(btrim(title)) between 1 and 120),
  language text not null default 'en' check (language in ('en', 'es')),
  -- The talk's points, read out, and its discussion questions.
  points text[] not null default '{}' check (public.safety_lines_ok(points, 12)),
  questions text[] not null default '{}' check (public.safety_lines_ok(questions, 6)),
  -- The governing regulation section ("8 CCR 3395") and the official free page about it.
  source text check (source is null or length(btrim(source)) between 1 and 120),
  source_url text check (source_url is null or (source_url ~ '^https://[^\s<>"]+$' and length(source_url) <= 300)),
  -- A company's own talk as a PDF, in the Safety folder of one of its jobs.
  file_id uuid references public.files(id),
  check ((org_id is null) = (slug is not null)),
  check (org_id is null or created_by is not null)
);
alter table public.safety_topics enable row level security;
create unique index safety_topics_title on public.safety_topics (org_id, lower(btrim(title)), language) where deleted_at is null;

create table public.safety_meetings (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id),
  version int not null default 1,
  org_id uuid not null,
  project_id uuid not null,
  number int not null check (number > 0),
  kind text not null check (kind in ('tailgate', 'meeting')),
  -- The job's day it was held on (its time zone).
  held_on date not null,
  topic_id uuid references public.safety_topics(id),
  title text not null check (length(btrim(title)) between 1 and 160),
  notes text not null default '' check (length(notes) <= 4000),
  -- The topic's outline as it was read that day (the record keeps its words even if the library changes later).
  points text[] not null default '{}' check (public.safety_lines_ok(points, 12)),
  questions text[] not null default '{}' check (public.safety_lines_ok(questions, 6)),
  source text check (source is null or length(btrim(source)) between 1 and 120),
  source_url text check (source_url is null or (source_url ~ '^https://[^\s<>"]+$' and length(source_url) <= 300)),
  -- An own topic's PDF, in this job's Safety folder.
  file_id uuid references public.files(id),
  leader_id uuid not null references auth.users(id),
  location text not null default '' check (length(location) <= 120),
  status text not null default 'open' check (status in ('open', 'closed')),
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  closed_by uuid references auth.users(id),
  -- The sign-in link's token: only its sha256, and when it was made (the device that made it shows the QR while this
  -- matches). Never granted to anyone.
  token_hash text check (token_hash is null or token_hash ~ '^[0-9a-f]{64}$'),
  token_made_at timestamptz,
  -- The sign-in sheet PDF the server made at close, and the content hash it was made from.
  pdf_file_id uuid references public.files(id),
  content_hash text check (content_hash is null or content_hash ~ '^[0-9a-f]{64}$'),
  -- safety_meeting_start's p_key: a repeat is the same meeting.
  request_key uuid,
  foreign key (project_id, org_id) references public.projects (id, org_id),
  unique (id, project_id),
  unique (project_id, number),
  unique (created_by, request_key),
  check ((status = 'closed') = (closed_at is not null)),
  check ((closed_at is null) = (closed_by is null)),
  check (status = 'open' or token_hash is null),
  check ((token_hash is null) = (token_made_at is null)),
  check ((pdf_file_id is null) = (content_hash is null))
);
alter table public.safety_meetings enable row level security;
create index safety_meetings_project on public.safety_meetings (project_id, held_on desc);
create index safety_meetings_open on public.safety_meetings (leader_id) where status = 'open';

create table public.safety_signins (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version int not null default 1,
  org_id uuid not null,
  project_id uuid not null,
  meeting_id uuid not null,
  name text not null check (length(btrim(name)) between 1 and 120),
  -- One line per name in a meeting (the database owns duplicates).
  name_key text generated always as (lower(name)) stored,
  company text not null default '' check (length(company) <= 120),
  trade text not null default '' check (length(trade) <= 80),
  -- From the QR page: the strokes as drawn, and when.
  signature jsonb check (signature is null or public.safety_signature_ok(signature)),
  signed_at timestamptz,
  via text not null check (via in ('link', 'member')),
  -- A job member the leader ticked in (or who also signed), and who ticked them in.
  person_id uuid references auth.users(id),
  added_by uuid references auth.users(id),
  removed_at timestamptz,
  removed_by uuid references auth.users(id),
  foreign key (project_id, org_id) references public.projects (id, org_id),
  foreign key (meeting_id, project_id) references public.safety_meetings (id, project_id),
  check ((signature is null) = (signed_at is null)),
  check (via = 'link' or person_id is not null),
  check ((removed_at is null) = (removed_by is null))
);
alter table public.safety_signins enable row level security;
create unique index safety_signins_name on public.safety_signins (meeting_id, name_key) where removed_at is null;
create unique index safety_signins_person on public.safety_signins (meeting_id, person_id) where removed_at is null and person_id is not null;

-- The 10th working day (Monday to Friday) after a tailgate: the next one is due by then (8 CCR 1509(e)). None yet: due
-- on p_today.
create or replace function public.safety_due_on(p_project_id uuid, p_today date)
returns date
language sql
stable
set search_path = public, pg_temp
as $$
  select coalesce(
    (select d::date
       from generate_series(l.last::timestamp + interval '1 day', l.last::timestamp + interval '20 days', interval '1 day') d
      where extract(isodow from d) < 6
      order by d offset 9 limit 1),
    p_today)
    from (select max(m.held_on) as last from public.safety_meetings m
           where m.project_id = p_project_id and m.kind = 'tailgate' and m.status = 'closed') l;
$$;

-- =====================================================================================================================
-- Triggers
-- =====================================================================================================================
create trigger touch before update on public.safety_topics for each row execute function public.tg_touch_row();
create trigger touch before update on public.safety_meetings for each row execute function public.tg_touch_row();
create trigger touch before update on public.safety_signins for each row execute function public.tg_touch_row();
create trigger no_delete before delete on public.safety_topics for each row execute function public.tg_block_delete();
create trigger no_delete before delete on public.safety_meetings for each row execute function public.tg_block_delete();
create trigger no_delete before delete on public.safety_signins for each row execute function public.tg_block_delete();

-- "Tailgate" / "Meeting", for board lines, the calendar and the sheet.
create or replace function public.safety_kind_label(p_kind text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case p_kind when 'tailgate' then 'Tailgate' else 'Meeting' end;
$$;

-- Every meeting is a line on the job's calendar (Meetings), for whoever reads safety.
create or replace function public.tg_safety_meeting_calendar()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.calendar_mirror('safety_meeting', new.id, new.project_id, 'meetings',
    public.safety_kind_label(new.kind) || ' ' || new.number || ': ' || new.title,
    new.opened_at, greatest(new.opened_at, coalesce(new.closed_at, new.opened_at + interval '30 minutes')), false,
    case new.status when 'open' then 'pending' else 'confirmed' end, 'safety.read', null, nullif(new.location, ''));
  return null;
end;
$$;
create trigger safety_calendar after insert or update of title, status, location, closed_at on public.safety_meetings
  for each row execute function public.tg_safety_meeting_calendar();

-- A sign-in sheet is a record: it stays on file.
create or replace function public.tg_files_keep_safety_sheet()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.deleted_at is not null and old.deleted_at is null
     and exists (select 1 from public.safety_meetings m where m.pdf_file_id = old.id) then
    raise exception 'A sign-in sheet stays on file.' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger keep_safety_sheet before update of deleted_at on public.files
  for each row execute function public.tg_files_keep_safety_sheet();

-- =====================================================================================================================
-- RLS: read only; every write is an RPC below
-- =====================================================================================================================
-- Does the caller hold a capability on some live job of this company? (The library is the company's; capabilities
-- are per job.)
create or replace function public.safety_org_can(p_org_id uuid, p_cap text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (select 1 from public.projects p
                  where p.org_id = p_org_id and p.deleted_at is null and public.has_capability(p.id, p_cap));
$$;

create policy "safety_topics: starters, and my companies' library" on public.safety_topics for select to authenticated
  using ((org_id is null and deleted_at is null and auth.uid() is not null)
         or (org_id is not null and public.safety_org_can(org_id, 'safety.read')
             and (deleted_at is null or public.safety_org_can(org_id, 'safety.manage'))));
create policy "safety_meetings: safety.read" on public.safety_meetings for select to authenticated
  using (public.has_capability(project_id, 'safety.read'));
create policy "safety_signins: safety.read" on public.safety_signins for select to authenticated
  using (public.has_capability(project_id, 'safety.read'));

revoke all on public.safety_topics, public.safety_meetings, public.safety_signins from public, anon, authenticated, service_role;
grant select on public.safety_topics, public.safety_signins to authenticated, service_role;
-- Every column but the token's hash and the start key.
grant select (id, created_at, updated_at, created_by, version, org_id, project_id, number, kind, held_on, topic_id, title,
              notes, points, questions, source, source_url, file_id, leader_id, location, status, opened_at, closed_at,
              closed_by, token_made_at, pdf_file_id, content_hash)
  on public.safety_meetings to authenticated, service_role;

-- =====================================================================================================================
-- Internal helpers (not user-callable)
-- =====================================================================================================================
-- A person's name as the app shows it (people_display's rule).
create or replace function public.safety_person_name(p_person uuid)
returns text
language sql
stable
set search_path = public, pg_temp
as $$
  select coalesce((select coalesce(nullif(btrim(p.full_name), ''), split_part(p.email, '@', 1))
                     from public.profiles p where p.user_id = p_person), 'Someone');
$$;

-- The meeting, held for the change, if the caller leads it (its leader, or safety.manage on the job).
create or replace function public.safety_lead_lock(p_meeting_id uuid)
returns public.safety_meetings
language plpgsql
set search_path = public, pg_temp
as $$
declare m public.safety_meetings;
begin
  select * into m from public.safety_meetings where id = p_meeting_id for update;
  if m.id is null or auth.uid() is null or not public.has_capability(m.project_id, 'safety.read') then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if not ((m.leader_id = auth.uid() and public.has_capability(m.project_id, 'safety.run'))
          or public.has_capability(m.project_id, 'safety.manage')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return m;
end;
$$;

-- A PDF in a Safety folder of one of the company's jobs that the caller may read, not infected.
create or replace function public.safety_file_ok(p_org_id uuid, p_project_id uuid, p_file_id uuid)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select exists (select 1 from public.files f
                   join public.folders fo on fo.id = f.folder_id and fo.kind = 'safety'
                   join public.projects p on p.id = f.project_id
                  where f.id = p_file_id and f.deleted_at is null and p.org_id = p_org_id
                    and (p_project_id is null or f.project_id = p_project_id)
                    and f.mime = 'application/pdf' and f.scan_status <> 'infected'
                    and public.file_may_see(f.project_id, f.created_by, f.folder_id));
$$;

-- A fresh sign-in token for an open meeting: the raw token once, only its hash kept.
create or replace function public.safety_new_token(p_meeting_id uuid)
returns table (token text, token_made_at timestamptz)
language plpgsql
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare v_token text := public.request_link_token(); v_at timestamptz := clock_timestamp();
begin
  update public.safety_meetings
     set token_hash = encode(extensions.digest(v_token, 'sha256'), 'hex'), token_made_at = v_at
   where id = p_meeting_id and status = 'open';
  if not found then raise exception 'This meeting is closed.' using errcode = '22023'; end if;
  return query select v_token, v_at;
end;
$$;

-- =====================================================================================================================
-- The library (safety.manage keeps the company's; everyone with safety.read reads it)
-- =====================================================================================================================
create or replace function public.safety_topic_save(
  p_project_id uuid, p_id uuid, p_version int, p_category text, p_title text, p_points text[], p_questions text[],
  p_source text, p_source_url text, p_file_id uuid
)
returns table (id uuid, version int)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid(); v_org uuid; t public.safety_topics;
  v_title text := public.rev_clean(p_title);
  v_points text[] := array(select public.rev_clean(l) from unnest(coalesce(p_points, '{}')) l where public.rev_clean(l) <> '');
  v_questions text[] := array(select public.rev_clean(l) from unnest(coalesce(p_questions, '{}')) l where public.rev_clean(l) <> '');
  v_source text := nullif(public.rev_clean(p_source), '');
  v_url text := nullif(btrim(coalesce(p_source_url, '')), '');
begin
  if v_uid is null or not public.has_capability(p_project_id, 'safety.manage') then raise exception 'forbidden' using errcode = '42501'; end if;
  select org_id into v_org from public.projects where id = p_project_id and deleted_at is null;
  if v_org is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not coalesce(public.safety_category_ok(p_category), false) then raise exception 'Pick a category.' using errcode = '22023'; end if;
  if v_title = '' then raise exception 'Name the topic.' using errcode = '22023'; end if;
  if length(v_title) > 120 then raise exception 'Keep the title to 120 characters.' using errcode = '22023'; end if;
  if cardinality(v_points) > 12 or exists (select 1 from unnest(v_points) l where length(l) > 300) then
    raise exception 'Up to 12 points of 300 characters each.' using errcode = '22023';
  end if;
  if cardinality(v_questions) > 6 or exists (select 1 from unnest(v_questions) l where length(l) > 300) then
    raise exception 'Up to 6 questions of 300 characters each.' using errcode = '22023';
  end if;
  if cardinality(v_points) = 0 and p_file_id is null then raise exception 'Add the points or a PDF.' using errcode = '22023'; end if;
  if length(coalesce(v_source, '')) > 120 then raise exception 'Keep the source to 120 characters.' using errcode = '22023'; end if;
  if v_url is not null and (v_url !~ '^https://[^\s<>"]+$' or length(v_url) > 300) then
    raise exception 'The link must start with https://' using errcode = '22023';
  end if;
  if p_file_id is not null and not public.safety_file_ok(v_org, null, p_file_id) then
    raise exception 'Pick a PDF from a Safety folder.' using errcode = '22023';
  end if;

  if p_id is null then
    insert into public.safety_topics (created_by, org_id, category, title, points, questions, source, source_url, file_id)
    values (v_uid, v_org, p_category, v_title, v_points, v_questions, v_source, v_url, p_file_id)
    returning * into t;
  else
    select * into t from public.safety_topics x where x.id = p_id and x.deleted_at is null for update;
    if t.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
    if t.org_id is distinct from v_org then raise exception 'Built-in topics stay as they are.' using errcode = '42501'; end if;
    if p_version is null or t.version <> p_version then
      raise exception 'version_conflict: expected %, found %', p_version, t.version using errcode = '40001';
    end if;
    update public.safety_topics x
       set category = p_category, title = v_title, points = v_points, questions = v_questions, source = v_source,
           source_url = v_url, file_id = p_file_id
     where x.id = t.id
     returning * into t;
  end if;
  perform public.audit(case when p_id is null then 'safety.topic_create' else 'safety.topic_update' end, 'safety_topic', t.id,
    p_project_id, v_org, jsonb_build_object('title', t.title));
  return query select t.id, t.version;
end;
$$;

-- Remove (p_removed true) or put back (Undo) one of the company's topics.
create or replace function public.safety_topic_remove(p_project_id uuid, p_id uuid, p_removed boolean)
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_org uuid; t public.safety_topics;
begin
  if auth.uid() is null or not public.has_capability(p_project_id, 'safety.manage') then raise exception 'forbidden' using errcode = '42501'; end if;
  select org_id into v_org from public.projects where id = p_project_id and deleted_at is null;
  select * into t from public.safety_topics where id = p_id for update;
  if t.id is null or v_org is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if t.org_id is distinct from v_org then raise exception 'Built-in topics stay as they are.' using errcode = '42501'; end if;
  if p_removed and t.deleted_at is null then
    update public.safety_topics set deleted_at = now() where id = t.id returning * into t;
  elsif not p_removed and t.deleted_at is not null then
    update public.safety_topics set deleted_at = null where id = t.id returning * into t;
  end if;
  perform public.audit(case when p_removed then 'safety.topic_remove' else 'safety.topic_restore' end, 'safety_topic', t.id,
    p_project_id, v_org, jsonb_build_object('title', t.title));
  return t.version;
end;
$$;

-- A topic's PDF, for anyone who reads safety on a job of the topic's company: the scan rules, logged as a download.
-- (The PDF lives in the Safety folder of the job it was uploaded on; the library is the company's.)
create or replace function public.safety_topic_file(p_project_id uuid, p_topic_id uuid)
returns table (storage_path text, original_name text, mime text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_org uuid; t public.safety_topics; f public.files; hdrs jsonb;
begin
  if auth.uid() is null or not public.has_capability(p_project_id, 'safety.read') then raise exception 'forbidden' using errcode = '42501'; end if;
  select org_id into v_org from public.projects where id = p_project_id and deleted_at is null;
  select * into t from public.safety_topics
   where id = p_topic_id and deleted_at is null and (org_id is null or org_id = v_org);
  if t.id is null or t.file_id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  -- Still a file of a Safety folder of the topic's company (it may have been moved or deleted since it was picked).
  select x.* into f from public.files x join public.folders fo on fo.id = x.folder_id and fo.kind = 'safety'
   where x.id = t.file_id and x.deleted_at is null and x.org_id = t.org_id;
  if f.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if f.scan_status = 'infected' then raise exception 'infected' using errcode = '42501'; end if;
  if f.scan_status = 'pending' and f.created_by is distinct from auth.uid() then raise exception 'scan_pending' using errcode = '42501'; end if;
  hdrs := nullif(current_setting('request.headers', true), '')::jsonb;
  insert into public.downloads (file_id, project_id, user_id, ip, variant)
  values (f.id, f.project_id, auth.uid(), nullif(split_part(coalesce(hdrs->>'x-forwarded-for', ''), ',', 1), '')::inet, 'original');
  perform public.audit('download', 'file', f.id, f.project_id, f.org_id,
    jsonb_build_object('variant', 'original', 'name', f.original_name, 'topic_id', t.id, 'via_project', p_project_id), f.sha256);
  return query select f.storage_path, f.original_name, f.mime;
end;
$$;

-- =====================================================================================================================
-- Meetings
-- =====================================================================================================================
-- Start a meeting (safety.run): the job's day, the next number, the topic's outline as read, me as the leader, and the
-- sign-in token (the raw token once). A repeat with the same p_key is the same meeting with a fresh token.
create or replace function public.safety_meeting_start(
  p_project_id uuid, p_key uuid, p_kind text, p_topic_id uuid, p_title text, p_notes text, p_file_id uuid, p_location text
)
returns table (id uuid, number int, token text, token_made_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid(); pr public.projects; t public.safety_topics; m public.safety_meetings;
  v_title text; v_notes text := btrim(coalesce(p_notes, '')); v_location text := public.rev_clean(p_location);
begin
  if v_uid is null or not public.has_capability(p_project_id, 'safety.run') then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into pr from public.projects where id = p_project_id and deleted_at is null;
  if pr.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if p_key is null then raise exception 'Try again.' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtext('safety_start:' || v_uid::text || ':' || p_key::text));
  select * into m from public.safety_meetings x where x.created_by = v_uid and x.request_key = p_key;
  if m.id is null then
    if p_kind is null or p_kind not in ('tailgate', 'meeting') then raise exception 'Pick Tailgate or Meeting.' using errcode = '22023'; end if;
    if p_topic_id is not null then
      select * into t from public.safety_topics x
       where x.id = p_topic_id and x.deleted_at is null and (x.org_id is null or x.org_id = pr.org_id);
      if t.id is null then raise exception 'Pick a topic from the library.' using errcode = '22023'; end if;
    end if;
    v_title := coalesce(nullif(public.rev_clean(p_title), ''), t.title, '');
    if v_title = '' then raise exception 'Name the topic.' using errcode = '22023'; end if;
    if length(v_title) > 160 then raise exception 'Keep the title to 160 characters.' using errcode = '22023'; end if;
    if length(v_notes) > 4000 then raise exception 'Keep the notes to 4000 characters.' using errcode = '22023'; end if;
    if length(v_location) > 120 then raise exception 'Keep the location to 120 characters.' using errcode = '22023'; end if;
    if p_file_id is not null and not public.safety_file_ok(pr.org_id, pr.id, p_file_id) then
      raise exception 'Pick a PDF from this job''s Safety folder.' using errcode = '22023';
    end if;
    insert into public.safety_meetings (created_by, org_id, project_id, number, kind, held_on, topic_id, title, notes, points,
                                        questions, source, source_url, file_id, leader_id, location, request_key)
    values (v_uid, pr.org_id, pr.id, public.next_number(pr.id, 'safety_meeting'), p_kind, (now() at time zone pr.timezone)::date,
            t.id, v_title, v_notes, coalesce(t.points, '{}'), coalesce(t.questions, '{}'), t.source, t.source_url, p_file_id,
            v_uid, v_location, p_key)
    returning * into m;
    perform public.audit('safety.start', 'safety_meeting', m.id, m.project_id, m.org_id,
      jsonb_build_object('number', m.number, 'kind', m.kind, 'title', m.title));
  elsif m.status <> 'open' then
    raise exception 'This meeting is closed.' using errcode = '22023';
  end if;
  return query select m.id, m.number, k.token, k.token_made_at from public.safety_new_token(m.id) k;
end;
$$;

-- A new QR for an open meeting (another device, or a leaked link): the old one stops at once.
create or replace function public.safety_meeting_qr(p_meeting_id uuid)
returns table (token text, token_made_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare m public.safety_meetings;
begin
  m := public.safety_lead_lock(p_meeting_id);
  if m.status <> 'open' then raise exception 'This meeting is closed.' using errcode = '22023'; end if;
  if m.opened_at <= now() - interval '18 hours' then raise exception 'Sign-in has ended. Close the meeting.' using errcode = '22023'; end if;
  perform public.audit('safety.new_qr', 'safety_meeting', m.id, m.project_id, m.org_id, '{}'::jsonb);
  return query select k.token, k.token_made_at from public.safety_new_token(m.id) k;
end;
$$;

-- Tick a job member in (the leader, or safety.manage), while the meeting is open. The same person or name twice is one
-- line (a ticked-in name that already signed from the QR is linked to that line). Answers the line's id.
create or replace function public.safety_tick(p_meeting_id uuid, p_person uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare m public.safety_meetings; v_name text; v_company text; s public.safety_signins;
begin
  m := public.safety_lead_lock(p_meeting_id);
  if m.status <> 'open' then raise exception 'This meeting is closed.' using errcode = '22023'; end if;
  select left(public.rev_clean(coalesce(nullif(btrim(p.full_name), ''), split_part(pm.invite_email, '@', 1))), 120),
         left(public.rev_clean(coalesce(o.name, p.company, '')), 120)
    into v_name, v_company
    from public.project_members pm
    left join public.profiles p on p.user_id = pm.user_id
    left join public.orgs o on o.id = pm.member_org_id
   where pm.project_id = m.project_id and pm.user_id = p_person and pm.status = 'active'
     and (pm.access_ends_at is null or pm.access_ends_at > now())
   order by pm.created_at limit 1;
  if v_name is null or v_name = '' then raise exception 'Pick someone on this job.' using errcode = '22023'; end if;
  select * into s from public.safety_signins x
   where x.meeting_id = m.id and x.removed_at is null and (x.person_id = p_person or x.name_key = lower(v_name))
   order by (x.person_id = p_person) desc nulls last limit 1;
  if s.id is not null then
    if s.person_id is null then update public.safety_signins set person_id = p_person where id = s.id; end if;
    return s.id;
  end if;
  insert into public.safety_signins (org_id, project_id, meeting_id, name, company, via, person_id, added_by)
  values (m.org_id, m.project_id, m.id, v_name, v_company, 'member', p_person, auth.uid())
  returning * into s;
  perform public.audit('safety.tick', 'safety_signin', s.id, m.project_id, m.org_id, jsonb_build_object('meeting', m.number, 'name', v_name));
  return s.id;
end;
$$;

-- Take a line off the sheet (a junk name, an untick) or put it back (Undo), while the meeting is open.
create or replace function public.safety_signin_remove(p_signin_id uuid, p_removed boolean)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare s public.safety_signins; m public.safety_meetings;
begin
  select * into s from public.safety_signins where id = p_signin_id;
  if s.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  m := public.safety_lead_lock(s.meeting_id);
  if m.status <> 'open' then raise exception 'This meeting is closed.' using errcode = '22023'; end if;
  if p_removed and s.removed_at is null then
    update public.safety_signins set removed_at = now(), removed_by = auth.uid() where id = s.id;
  elsif not p_removed and s.removed_at is not null then
    update public.safety_signins set removed_at = null, removed_by = null where id = s.id;
  end if;
  perform public.audit(case when p_removed then 'safety.remove_line' else 'safety.restore_line' end, 'safety_signin', s.id,
    m.project_id, m.org_id, jsonb_build_object('meeting', m.number, 'name', s.name));
end;
$$;

-- Close (the leader, or safety.manage): no more sign-ins, the QR stops, a tailgate completes the job's "tailgate due"
-- tasks. A repeat by the same person is a no-op. Answers the new version; the edge function makes the sheet PDF next.
create or replace function public.safety_meeting_close(p_meeting_id uuid, p_version int)
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare m public.safety_meetings; v_signed int;
begin
  m := public.safety_lead_lock(p_meeting_id);
  if m.status = 'closed' then
    if m.closed_by = auth.uid() then return m.version; end if;
    raise exception 'This meeting is closed.' using errcode = '22023';
  end if;
  if p_version is null or m.version <> p_version then
    raise exception 'version_conflict: expected %, found %', p_version, m.version using errcode = '40001';
  end if;
  update public.safety_meetings
     set status = 'closed', closed_at = now(), closed_by = auth.uid(), token_hash = null, token_made_at = null
   where id = m.id
   returning * into m;
  if m.kind = 'tailgate' then
    update public.tasks set done_at = now(), done_by = auth.uid()
     where project_id = m.project_id and kind = 'safety.tailgate_due' and done_at is null and deleted_at is null;
  end if;
  select count(*) into v_signed from public.safety_signins where meeting_id = m.id and removed_at is null;
  perform public.post_activity(m.project_id, 'safety.closed',
    left(public.safety_kind_label(m.kind) || ' ' || m.number || ' closed: ' || m.title || ' (' || v_signed || ' signed)', 500),
    'safety_meeting', m.id, 'safety.manage');
  perform public.audit('safety.close', 'safety_meeting', m.id, m.project_id, m.org_id, jsonb_build_object('number', m.number, 'signed', v_signed));
  return m.version;
end;
$$;

-- Undo a close: the one who closed it, within 15 minutes. A fresh sign-in token (the raw token once).
create or replace function public.safety_meeting_reopen(p_meeting_id uuid)
returns table (token text, token_made_at timestamptz, version int)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare m public.safety_meetings; v_token text; v_at timestamptz;
begin
  m := public.safety_lead_lock(p_meeting_id);
  if m.status <> 'closed' then raise exception 'This meeting is open.' using errcode = '22023'; end if;
  if m.closed_by is distinct from auth.uid() or m.closed_at <= now() - interval '15 minutes' then
    raise exception 'Too late to undo.' using errcode = '22023';
  end if;
  update public.safety_meetings set status = 'open', closed_at = null, closed_by = null where id = m.id;
  select k.token, k.token_made_at into v_token, v_at from public.safety_new_token(m.id) k;
  perform public.audit('safety.reopen', 'safety_meeting', m.id, m.project_id, m.org_id, jsonb_build_object('number', m.number));
  return query select v_token, v_at, x.version from public.safety_meetings x where x.id = m.id;
end;
$$;

-- The job's meetings, newest first, with how many signed (safety.read).
create or replace function public.safety_meetings_list(p_project_id uuid)
returns table (
  id uuid, number int, kind text, held_on date, title text, status text, leader_id uuid, leader_name text,
  opened_at timestamptz, closed_at timestamptz, signed int, version int
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
begin
  if auth.uid() is null or not public.has_capability(p_project_id, 'safety.read') then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
    select m.id, m.number, m.kind, m.held_on, m.title, m.status, m.leader_id, public.safety_person_name(m.leader_id),
           m.opened_at, m.closed_at,
           (select count(*)::int from public.safety_signins s where s.meeting_id = m.id and s.removed_at is null), m.version
      from public.safety_meetings m
     where m.project_id = p_project_id
     order by m.number desc;
end;
$$;

-- One meeting with what its screen shows: the outline, the leader's and closer's names, and whether I lead it.
create or replace function public.safety_meeting(p_meeting_id uuid)
returns table (
  id uuid, project_id uuid, number int, kind text, held_on date, topic_id uuid, title text, notes text, points text[],
  questions text[], source text, source_url text, file_id uuid, topic_file boolean, leader_id uuid, leader_name text,
  location text, status text, opened_at timestamptz, closed_at timestamptz, closed_by uuid, closed_by_name text,
  token_made_at timestamptz, pdf_file_id uuid, version int, can_lead boolean
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare m public.safety_meetings;
begin
  select * into m from public.safety_meetings x where x.id = p_meeting_id;
  if m.id is null or auth.uid() is null or not public.has_capability(m.project_id, 'safety.read') then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  return query
    select m.id, m.project_id, m.number, m.kind, m.held_on, m.topic_id, m.title, m.notes, m.points, m.questions, m.source,
           m.source_url, m.file_id,
           exists (select 1 from public.safety_topics t where t.id = m.topic_id and t.file_id is not null and t.deleted_at is null),
           m.leader_id, public.safety_person_name(m.leader_id), m.location, m.status, m.opened_at, m.closed_at, m.closed_by,
           case when m.closed_by is null then null else public.safety_person_name(m.closed_by) end,
           m.token_made_at, m.pdf_file_id, m.version,
           (m.leader_id = auth.uid() and public.has_capability(m.project_id, 'safety.run'))
             or public.has_capability(m.project_id, 'safety.manage');
end;
$$;

-- When the next tailgate is due on the job (8 CCR 1509(e): every 10 working days) and how many meetings are open.
create or replace function public.safety_due(p_project_id uuid)
returns table (today date, last_held_on date, due_on date, open_count int)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare v_today date;
begin
  if auth.uid() is null or not public.has_capability(p_project_id, 'safety.read') then raise exception 'forbidden' using errcode = '42501'; end if;
  select (now() at time zone p.timezone)::date into v_today from public.projects p where p.id = p_project_id;
  return query
    select v_today,
           (select max(m.held_on) from public.safety_meetings m
             where m.project_id = p_project_id and m.kind = 'tailgate' and m.status = 'closed'),
           public.safety_due_on(p_project_id, v_today),
           (select count(*)::int from public.safety_meetings m where m.project_id = p_project_id and m.status = 'open');
end;
$$;

-- Everything the sign-in sheet PDF shows, for a closed meeting (safety.read): the edge function renders it.
create or replace function public.safety_meeting_sheet(p_meeting_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare m public.safety_meetings; pr public.projects;
begin
  select * into m from public.safety_meetings where id = p_meeting_id;
  if m.id is null or auth.uid() is null or not public.has_capability(m.project_id, 'safety.read') then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if m.status <> 'closed' then raise exception 'Close the meeting first.' using errcode = '22023'; end if;
  select * into pr from public.projects where id = m.project_id;
  return jsonb_build_object(
    'meeting_id', m.id, 'project_id', m.project_id, 'job_name', pr.name, 'job_number', pr.number, 'timezone', pr.timezone,
    'number', m.number, 'kind', m.kind, 'held_on', m.held_on, 'title', m.title, 'notes', m.notes, 'points', to_jsonb(m.points),
    'questions', to_jsonb(m.questions), 'source', m.source, 'source_url', m.source_url,
    'leader_name', public.safety_person_name(m.leader_id), 'location', m.location, 'opened_at', m.opened_at,
    'closed_at', m.closed_at, 'closed_by_name', public.safety_person_name(m.closed_by),
    'pdf_file_id', m.pdf_file_id, 'content_hash', m.content_hash,
    'attendees', coalesce((
      select jsonb_agg(jsonb_build_object('name', s.name, 'company', s.company, 'trade', s.trade, 'via', s.via,
                                          'signed_at', s.signed_at, 'signature', s.signature,
                                          'added_by_name', case when s.added_by is null then null else public.safety_person_name(s.added_by) end)
                       order by s.created_at, s.id)
        from public.safety_signins s where s.meeting_id = m.id and s.removed_at is null), '[]'::jsonb));
end;
$$;

-- The sheet the server made (service role only, after safety_meeting_sheet ran as the caller).
create or replace function public.safety_meeting_attach(p_meeting_id uuid, p_file_id uuid, p_content_hash text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare m public.safety_meetings;
begin
  if not public.is_service_role() then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into m from public.safety_meetings where id = p_meeting_id for update;
  if m.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if m.status <> 'closed' then raise exception 'Close the meeting first.' using errcode = '22023'; end if;
  if not exists (select 1 from public.files f join public.folders fo on fo.id = f.folder_id
                  where f.id = p_file_id and f.project_id = m.project_id and fo.kind = 'safety' and f.deleted_at is null) then
    raise exception 'That sheet is not in this job''s Safety folder.' using errcode = '22023';
  end if;
  update public.safety_meetings set pdf_file_id = p_file_id, content_hash = p_content_hash where id = m.id;
  perform public.audit('safety.sheet', 'safety_meeting', m.id, m.project_id, m.org_id,
    jsonb_build_object('number', m.number, 'file_id', p_file_id), p_content_hash, 'system');
end;
$$;

-- =====================================================================================================================
-- The public sign-in page's SQL surface (service role only; the meeting-signin function checks rate limits first).
-- Each answers null when the token does not open that meeting (wrong, rotated or closed: all the same).
-- =====================================================================================================================
create or replace function public.link_meeting_open(p_meeting_id uuid, p_token_hash text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare m public.safety_meetings; v_job text;
begin
  if not public.is_service_role() then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into m from public.safety_meetings where id = p_meeting_id and status = 'open' and token_hash = p_token_hash;
  if m.id is null then return null; end if;
  select name into v_job from public.projects where id = m.project_id and deleted_at is null;
  if v_job is null then return null; end if;
  return jsonb_build_object('project_name', v_job, 'number', m.number, 'kind', m.kind, 'title', m.title,
    'held_on', m.held_on, 'open', m.opened_at > now() - interval '18 hours');
end;
$$;

create or replace function public.link_meeting_sign(
  p_meeting_id uuid, p_token_hash text, p_name text, p_company text, p_trade text, p_signature jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  m public.safety_meetings; s public.safety_signins; v_n int;
  v_name text := public.rev_clean(p_name); v_company text := public.rev_clean(p_company); v_trade text := public.rev_clean(p_trade);
begin
  if not public.is_service_role() then raise exception 'forbidden' using errcode = '42501'; end if;
  if v_name = '' then raise exception 'Enter your name.' using errcode = '22023'; end if;
  if length(v_name) > 120 then raise exception 'Keep your name to 120 characters.' using errcode = '22023'; end if;
  if v_company = '' then raise exception 'Enter your company.' using errcode = '22023'; end if;
  if length(v_company) > 120 then raise exception 'Keep the company to 120 characters.' using errcode = '22023'; end if;
  if length(v_trade) > 80 then raise exception 'Keep the trade to 80 characters.' using errcode = '22023'; end if;
  if not coalesce(public.safety_signature_ok(p_signature), false) then raise exception 'Sign in the box.' using errcode = '22023'; end if;
  -- Held while signing, so a close waits for the signatures already on their way.
  select * into m from public.safety_meetings where id = p_meeting_id and token_hash = p_token_hash for share;
  if m.id is null or m.status <> 'open' then return null; end if;
  if m.opened_at <= now() - interval '18 hours' then raise exception 'This sign-in has ended.' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtext('safety_sign:' || m.id::text || ':' || lower(v_name)));
  select * into s from public.safety_signins where meeting_id = m.id and name_key = lower(v_name) and removed_at is null;
  if s.id is not null then
    -- Ticked in by the leader: the signature completes that line. Signed already: the same answer, nothing changes.
    if s.signature is null then
      update public.safety_signins
         set signature = p_signature, signed_at = now(), company = case when company = '' then v_company else company end,
             trade = case when trade = '' then v_trade else trade end
       where id = s.id;
      perform public.audit('safety.sign', 'safety_signin', s.id, m.project_id, m.org_id,
        jsonb_build_object('meeting', m.number, 'name', v_name, 'company', v_company), null, 'public_link');
    end if;
    return jsonb_build_object('status', 'signed');
  end if;
  select count(*) into v_n from public.safety_signins where meeting_id = m.id and removed_at is null;
  if v_n >= 300 then raise exception 'This sign-in sheet is full.' using errcode = '22023'; end if;
  insert into public.safety_signins (org_id, project_id, meeting_id, name, company, trade, signature, signed_at, via)
  values (m.org_id, m.project_id, m.id, v_name, v_company, v_trade, p_signature, now(), 'link')
  returning * into s;
  perform public.audit('safety.sign', 'safety_signin', s.id, m.project_id, m.org_id,
    jsonb_build_object('meeting', m.number, 'name', v_name, 'company', v_company), null, 'public_link');
  return jsonb_build_object('status', 'signed');
end;
$$;

-- =====================================================================================================================
-- The reminder: a tailgate every 10 working days (8 CCR 1509(e)), checked each morning
-- =====================================================================================================================
-- p_at: the moment to check as (now, from the schedule).
create or replace function public.safety_tailgate_check(p_at timestamptz default now())
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare p record; v_today date; v_leads uuid[]; u uuid; v_n int := 0;
begin
  if not public.is_service_role() then raise exception 'forbidden' using errcode = '42501'; end if;
  for p in select pr.id, pr.timezone from public.projects pr
            where pr.deleted_at is null and pr.stage in ('construction', 'closeout') and 'safety' = any (pr.modules) loop
    v_today := (p_at at time zone p.timezone)::date;
    continue when extract(isodow from v_today) > 5;
    continue when public.safety_due_on(p.id, v_today) > v_today;
    -- Once until it is done: a closed tailgate completes these tasks.
    continue when exists (select 1 from public.tasks t
                           where t.project_id = p.id and t.kind = 'safety.tailgate_due' and t.done_at is null and t.deleted_at is null);
    -- The people whose position runs them (data: roles.recommended_tools) and who may lead one.
    v_leads := array(
      select distinct pm.user_id
        from public.project_members pm
        join public.roles r on r.name = pm.role
       where pm.project_id = p.id and pm.status = 'active' and pm.user_id is not null
         and (pm.access_ends_at is null or pm.access_ends_at > now())
         and 'safety' = any (r.recommended_tools)
         and exists (select 1 from public.role_permissions rp where rp.role = pm.role and rp.capability = 'safety.run'));
    continue when cardinality(v_leads) = 0;
    perform public.post_activity(p.id, 'safety.tailgate_due', 'Tailgate meeting due (one every 10 working days)',
      'safety_due', p.id, 'safety.run');
    foreach u in array v_leads loop
      perform public.create_task(p.id, u, 'safety.tailgate_due', 'Hold a tailgate meeting', 'safety_due', p.id, null);
    end loop;
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

select cron.schedule('safety-tailgate-check', '7 14 * * *', $$select public.safety_tailgate_check()$$);

-- Same as 0040, plus the open meetings I lead (the Safety tool's badge).
create or replace function public.my_tool_counts(p_project_id uuid default null)
returns table (entity_type text, n int)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select x.entity_type, count(distinct x.record)::int
    from (
      select t.entity_type, coalesce(t.entity_id, t.id) as record
        from public.tasks t
       where t.assignee_user_id = auth.uid() and t.done_at is null and t.deleted_at is null
         and (p_project_id is null or t.project_id = p_project_id)
      union
      select 'rfi', w.id
        from public.rfi_waiting() w
       where p_project_id is null or w.project_id = p_project_id
      union
      select 'safety_meeting', m.id
        from public.safety_meetings m
       where m.leader_id = auth.uid() and m.status = 'open'
         and (p_project_id is null or m.project_id = p_project_id)
    ) x
   group by x.entity_type
   order by x.entity_type nulls first;
$$;

-- =====================================================================================================================
-- The built-in starter talks: short outlines written for this app (no text copied from OSHA, Cal/OSHA, CPWR or anyone),
-- each with the regulation section it rests on and the official free page for it. English; Spanish comes later.
-- =====================================================================================================================
insert into public.safety_topics (slug, category, title, points, questions, source, source_url) values
('fall-protection', 'falls', 'Fall protection',
 array['Plan how you will be protected from a fall before the work starts, not once you are at the edge.',
       'Cal/OSHA protection starts at 7.5 feet in most construction work; know what applies to your task today.',
       'Guardrails and covers come first; a harness is for work that guardrails can''t protect.',
       'Check your harness, lanyard and connectors every day; take anything cut, burned, frayed or that caught a fall out of service.',
       'Tie off only to an anchor rated for it, at or above your D-ring when you can.',
       'Mark and secure every hole cover so nobody lifts it or steps through it.',
       'Have a rescue plan: someone hanging in a harness needs help within minutes.'],
 array['Where on this job today could someone fall 7.5 feet or more?', 'Who gets a hanging worker down, and with what?'],
 '8 CCR 1670', 'https://www.dir.ca.gov/title8/1670.html'),
('ladders', 'falls', 'Ladders',
 array['Pick the right ladder: tall enough, rated for you and your load, and fiberglass near anything electrical.',
       'Look it over before you climb: rungs, rails, feet and locks. Tag a damaged ladder and take it out of use.',
       'Set an extension ladder 1 foot out for every 4 feet up, 3 feet above the landing, and tie it off.',
       'Keep three points of contact going up and down; carry tools on a belt or hoist them up.',
       'Never stand on the top cap or top step of a stepladder, and never lean a folded stepladder against a wall.',
       'Keep your belt buckle between the rails. Climb down and move the ladder instead of reaching.'],
 array['Which ladders on site today are the wrong type or height for the work?',
       'When is a ladder the wrong tool, and a lift or a scaffold the right one?'],
 '8 CCR 1675', 'https://www.dir.ca.gov/title8/1675.html'),
('scaffolds', 'falls', 'Scaffolds',
 array['A competent person checks the scaffold before each shift and after anything that could have damaged it.',
       'Look for the tag before you climb. A red tag or no tag means stay off.',
       'Platforms fully planked, with guardrails and toe boards on every open side.',
       'Base plates and mudsills on firm ground. Never level a leg with blocks, bricks or buckets.',
       'Climb the built-in ladder or stair, never the cross braces.',
       'Don''t load it past its rating, and don''t stack material on the guardrails.',
       'Only the crew trained for it builds, moves or changes a scaffold.'],
 array['Who on our crew may change the scaffold, and who checks it?', 'What would make you stop and get off a scaffold?'],
 '8 CCR 1637', 'https://www.dir.ca.gov/title8/1637.html'),
('heat-illness', 'health', 'Heat illness',
 array['Drink water often, about a quart an hour on hot days, before you feel thirsty.',
       'Shade goes up when it reaches 80 degrees; take a cool-down rest in it whenever you need one.',
       'Above 95 degrees the high-heat steps apply: buddy checks, more breaks, and the crew stays in contact.',
       'New and returning workers need about two weeks to adjust; keep a close eye on them.',
       'Know the signs: headache, dizziness, cramps, confusion, heavy sweating or none at all.',
       'Speak up at the first sign. Heat stroke is an emergency: call 911 and cool the person down.',
       'Know the job''s address and how to bring an ambulance in.'],
 array['Where are the water and the shade on this job today?', 'What would you do if a coworker started acting confused in the heat?'],
 '8 CCR 3395', 'https://www.dir.ca.gov/title8/3395.html'),
('silica', 'health', 'Silica dust',
 array['Cutting, grinding, drilling or breaking concrete, block, stone, tile or brick throws silica dust.',
       'Breathing it over time scars the lungs and can lead to silicosis and lung cancer.',
       'Use water at the blade, or a shroud with a HEPA vacuum, the way the tool''s control method calls for.',
       'Wear the respirator the plan calls for, for that task and how long you will do it.',
       'No dry sweeping and no compressed air on the dust; use a HEPA vacuum or wet methods.',
       'Keep other people out of the dust, and work upwind when you can.',
       'Wash up before you eat, and don''t take dusty clothes home.'],
 array['Which tasks today make silica dust, and what controls are on each?',
       'Is the water feed or the vacuum working on every saw before we start?'],
 '8 CCR 1532.3', 'https://www.dir.ca.gov/title8/1532_3.html'),
('electrical-lockout', 'electrical', 'Electrical safety and lockout',
 array['Every cord and tool on temporary power runs through a GFCI; test it before you use it.',
       'Check cords for cuts, missing ground pins and taped splices. Pull bad ones out of use.',
       'Keep yourself, equipment and material at least 10 feet from overhead power lines.',
       'Treat every circuit as live until it is locked out, tagged and tested dead.',
       'Each worker puts on their own lock, and only the person who put a lock on takes it off.',
       'After lockout, try the controls to prove the equipment won''t start.',
       'Only qualified electricians work on or near energized parts.'],
 array['What will we lock out today, and who holds the keys?', 'Where are the overhead and buried lines on this site?'],
 '29 CFR 1926.417', 'https://www.osha.gov/laws-regs/regulations/standardnumber/1926/1926.417'),
('excavation-trenching', 'excavation', 'Excavation and trenching',
 array['Call 811 before digging so buried lines are marked.',
       'A trench 5 feet or deeper needs sloping, shoring or a shield. Never get in one without it.',
       'A competent person checks the excavation every day, after rain, and after anything changes.',
       'Keep spoils and equipment at least 2 feet back from the edge.',
       'In a trench 4 feet or deeper, keep a ladder or ramp within 25 feet of everyone in it.',
       'Test the air wherever gas or low oxygen could build up.',
       'Stay out from under loads and clear of digging equipment.'],
 array['Who is our competent person for excavations today?', 'What signs tell you a trench wall is about to give way?'],
 '8 CCR 1541.1', 'https://www.dir.ca.gov/title8/1541_1.html'),
('struck-by', 'equipment', 'Struck-by hazards',
 array['Wear a high-visibility vest around traffic and moving equipment.',
       'Make eye contact with the operator before you walk near a machine.',
       'Stay out of the swing radius, and never walk under a suspended load.',
       'Backing equipment needs a working alarm or a spotter, and the spotter stays where the operator can see them.',
       'Secure tools and material at height with toe boards, nets or tethers.',
       'Wear eye and face protection for nailing, cutting and grinding.'],
 array['Where do people and equipment cross paths on site today?',
       'What overhead work is going on, and how is the area below kept clear?'],
 '29 CFR 1926.601', 'https://www.osha.gov/laws-regs/regulations/standardnumber/1926/1926.601'),
('caught-between', 'equipment', 'Caught-in and caught-between',
 array['Never stand between moving equipment and a wall, a truck or stacked material.',
       'Keep the guards on belts, gears, chains and other moving parts.',
       'Lock out a machine before you clear a jam, clean it or fix it.',
       'Loose clothing, jewelry and gloves near spinning parts get pulled in; tie back long hair.',
       'Never step into an unprotected trench: a cave-in traps you in seconds.',
       'Block raised loads and equipment before you work under them.'],
 array['Where are the pinch points in today''s tasks?', 'Which machines need lockout before anyone reaches in?'],
 '29 CFR 1926.300(b)', 'https://www.osha.gov/laws-regs/regulations/standardnumber/1926/1926.300'),
('ppe', 'site', 'Personal protective equipment',
 array['Hard hat, safety glasses, high-visibility vest and work boots are the start for everyone on site.',
       'Add what the task needs: face shield, hearing protection, gloves, respirator or harness.',
       'Check your gear before each use; replace a cracked hard hat or scratched glasses.',
       'Wear hearing protection when you have to raise your voice to be heard at arm''s length.',
       'Match gloves to the job: cut, chemical and electrical gloves are not interchangeable.',
       'Protective gear is the last line of defense; it never replaces guards, shoring or other controls.'],
 array['What extra gear does your task need today?', 'Is anyone''s gear worn out or missing?'],
 '29 CFR 1926.95', 'https://www.osha.gov/laws-regs/regulations/standardnumber/1926/1926.95'),
('housekeeping', 'site', 'Housekeeping',
 array['Clean as you go: clutter causes trips, cuts and fires.',
       'Keep walkways, stairs, exits and ladders clear.',
       'Pull or bend over the nails in scrap lumber before it goes on the pile.',
       'Scrap goes in the bins; keep anything that burns away from hot work and heaters.',
       'Coil cords and hoses out of walkways, or run them overhead.',
       'Clean up spills right away and mark wet floors.',
       'Leave your area at the end of the day cleaner than you found it.'],
 array['Which areas need the most cleanup right now?', 'Where do cords and hoses cross walkways?'],
 '29 CFR 1926.25', 'https://www.osha.gov/laws-regs/regulations/standardnumber/1926/1926.25'),
('hand-power-tools', 'equipment', 'Hand and power tools',
 array['Use the right tool for the job, and keep it in good shape.',
       'Look tools over before use; tag out a damaged one.',
       'Keep guards in place. Never pin back a saw guard.',
       'Unplug the tool or shut off the air before changing a blade or bit.',
       'Only trained, certified operators use powder-actuated tools.',
       'Don''t carry a tool by its cord or hose, or yank the cord from the outlet.',
       'Wear eye protection, plus face and hearing protection when the tool calls for it.'],
 array['Which tools on our crew need repair or replacing?', 'Who here is trained on the powder-actuated tool?'],
 '29 CFR 1926.302', 'https://www.osha.gov/laws-regs/regulations/standardnumber/1926/1926.302'),
('fire-hot-work', 'fire', 'Fire prevention and hot work',
 array['Before welding, cutting, grinding or torch work, check the area, and get the hot work permit when the job uses one.',
       'Move anything that burns out of the way, or cover it with fire-resistant blankets.',
       'A fire watch stays during the work and afterward, for as long as the permit says.',
       'Keep a charged extinguisher within reach, and know how to use it.',
       'Store fuel and gas cylinders upright, capped and secured, away from heat.',
       'Know where the exits, the extinguishers and the alarm or phone are.'],
 array['Where is hot work happening today, and who is the fire watch?',
       'Where is the nearest extinguisher from where you work?'],
 '29 CFR 1926.352', 'https://www.osha.gov/laws-regs/regulations/standardnumber/1926/1926.352'),
('hazard-communication', 'health', 'Hazard communication and SDS',
 array['Every chemical on site has a Safety Data Sheet (SDS). Know where the binder or the app is.',
       'Read the label before you use a product: the pictograms, the signal word and the hazards.',
       'Any container you pour into gets a label with the product''s name and its hazards.',
       'The SDS tells you the protective gear, the first aid and how to handle a spill.',
       'Get fresh air moving when you use solvents, adhesives or coatings; some vapors burn or make you sick.',
       'Report spills and exposures right away.'],
 array['What chemicals will you use today, and what gear does the SDS call for?', 'Where are the SDSs for this job?'],
 '8 CCR 5194', 'https://www.dir.ca.gov/title8/5194.html'),
('lifting-back', 'health', 'Lifting and back safety',
 array['Size up the load before you lift: its weight, its shape and where it is going.',
       'Get help, or a cart, dolly or lift, for anything heavy or awkward.',
       'Keep the load close, bend your knees and lift with your legs.',
       'Don''t twist while you carry; turn with your feet.',
       'Clear your path before you pick something up.',
       'Stretch before work, and take breaks on repetitive tasks.',
       'Report a strain early, before it becomes an injury.'],
 array['What heavy or awkward items will we move today, and how?', 'Which tasks could use a team lift or equipment instead?'],
 '8 CCR 1509', 'https://www.dir.ca.gov/title8/1509.html')
on conflict (slug) do nothing;

-- =====================================================================================================================
-- Grants: the RPCs people call; the link surface, the sheet record and the reminder for the service role; the rest is
-- internal.
-- =====================================================================================================================
do $$
declare f text;
begin
  foreach f in array array[
    'public.safety_folder(uuid)',
    'public.safety_topic_save(uuid, uuid, integer, text, text, text[], text[], text, text, uuid)',
    'public.safety_topic_remove(uuid, uuid, boolean)',
    'public.safety_topic_file(uuid, uuid)',
    'public.safety_meeting_start(uuid, uuid, text, uuid, text, text, uuid, text)',
    'public.safety_meeting_qr(uuid)',
    'public.safety_tick(uuid, uuid)',
    'public.safety_signin_remove(uuid, boolean)',
    'public.safety_meeting_close(uuid, integer)',
    'public.safety_meeting_reopen(uuid)',
    'public.safety_meetings_list(uuid)',
    'public.safety_meeting(uuid)',
    'public.safety_due(uuid)',
    'public.safety_meeting_sheet(uuid)',
    -- In the read policies.
    'public.safety_org_can(uuid, text)']
  loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
  foreach f in array array[
    'public.safety_meeting_attach(uuid, uuid, text)', 'public.link_meeting_open(uuid, text)',
    'public.link_meeting_sign(uuid, text, text, text, text, jsonb)', 'public.safety_tailgate_check(timestamp with time zone)',
    'public.safety_folder_make(uuid)', 'public.safety_category_ok(text)', 'public.safety_lines_ok(text[], integer)',
    'public.safety_signature_ok(jsonb)', 'public.safety_due_on(uuid, date)', 'public.safety_kind_label(text)',
    'public.safety_person_name(uuid)', 'public.safety_lead_lock(uuid)', 'public.safety_file_ok(uuid, uuid, uuid)',
    'public.safety_new_token(uuid)']
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
  foreach f in array array['public.tg_project_safety_module()', 'public.tg_safety_meeting_calendar()', 'public.tg_files_keep_safety_sheet()']
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
  end loop;
end $$;
-- Same grants as before for the replaced functions (create or replace keeps them; restated for the reader).
revoke execute on function public.my_tool_counts(uuid) from public, anon;
grant execute on function public.my_tool_counts(uuid) to authenticated, service_role;
