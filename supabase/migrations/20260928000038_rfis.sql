-- 0038 RFIs (SPEC §14.1, §7.4, §6.9; Jesse, Sep 28; the lead's RFI contract).
--   * An RFI is typed once (title, question, a photo or two) and moves along a route the job sets: the originator signs
--     and sends it, each reviewer on the job's route (a role on the job, or one person) may edit it and sends it on or
--     back, a PM / PE signs and issues it, the architect answers, and it comes back to the originator. The number comes
--     from next_number(project, 'rfi') only at issue (drafts show "Draft"); no kinds row is needed (next_number makes
--     the counter on first use).
--   * Tables: rfi_settings (answer / impact days per job), rfi_route_steps (the job's reviewers before issue), rfis,
--     rfi_steps (the RFI's own copy of the route, made at its first send), rfi_events (the history).
--   * Deny by default: people read through RLS and write only through the RPCs below, which run as the caller
--     (SECURITY DEFINER, identity from auth.uid()). The two signing RPCs refuse without a fresh sign-in, like ir_sign.
--     rfi_attach_pdf is service-role only: the PDF on an RFI is always one the rfis function made.
--   * Who sees an RFI: its originator; rfi.sign_issue; anyone who is or was on its route once it is sent; rfi.answer
--     once it is open; files.read_project once it is answered. Members only.
--   * Every move closes the earlier holders' tasks, opens tasks for the new holders, posts a board line and writes an
--     event. Who holds it and since when (held_since), and whether a holder has opened it (held_opened_at, recorded by
--     rfi_detail), feed the tracker and rfi_waiting ("5 days and nobody opened it").
--   * An impact claim is the originator's, within impact_days of the answer, and permanent (a trigger refuses any
--     change); the GC may add a note. PM / PE are told on the board.
--   * Files: a per-job "RFIs" folder (made on first use by rfi_folder, a reserved system name) holds photos, answer
--     files and the PDFs. Only PM / PE (rfi.sign_issue) browse it in Files; originators and the architect may add to
--     it but not browse it, so a draft's photos stay with the RFI. Everyone else opens an RFI's files through the RFI
--     (rfi_authorize_file checks the RFI itself).
--   * The company logo for the PDF: orgs.logo_path, private bucket org-logos (path org/<org_id>/logo), set_org_logo().
--   * Module 'rfis': on for construction / closeout jobs (existing ones too), on the rail after Inspections.

-- ---------------------------------------------------------------------------
-- Module and rail (as 0021 did for the field tools)
-- ---------------------------------------------------------------------------
create or replace function public.tg_project_field_modules()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.stage in ('construction', 'closeout')
     and (tg_op = 'INSERT' or old.stage is distinct from new.stage and old.stage not in ('construction', 'closeout')) then
    new.modules := array(select distinct m from unnest(new.modules
      || '{files,calendar,dailies,inspections,rfis,deliveries,corrections}'::text[]) m order by m);
  end if;
  return new;
end;
$$;
revoke execute on function public.tg_project_field_modules() from public, anon, authenticated;

update public.projects
   set modules = array(select distinct m from unnest(modules || '{rfis}'::text[]) m order by m)
 where stage in ('construction', 'closeout') and not ('rfis' = any (modules));

alter table public.user_layout alter column rail_items
  set default '{board,files,bids,calendar,dailies,inspections,rfis,deliveries,corrections,people}';
update public.user_layout
   set rail_items = case
         when array_position(rail_items, 'inspections') is null then rail_items || '{rfis}'::text[]
         else rail_items[:array_position(rail_items, 'inspections')] || '{rfis}'::text[]
              || rail_items[array_position(rail_items, 'inspections') + 1:]
       end
 where not ('rfis' = any (rail_items));

-- ---------------------------------------------------------------------------
-- The "RFIs" folder kind and its reserved name (0030's rule)
-- ---------------------------------------------------------------------------
alter table public.folders drop constraint folders_kind_check;
alter table public.folders add constraint folders_kind_check
  check (kind in ('general', 'plans', 'specs', 'reports', 'bids_received', 'inbound', 'photos', 'transmittals', 'system',
                  'dsa_103', 'ccd', 'ti', 'bid_forms', 'rfis'));

-- Same as 0034 plus "RFIs" at the top of a job.
create or replace function public.folder_name_reserved(p_project_id uuid, p_parent_id uuid, p_name text)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select case
    when p_parent_id is null then btrim(p_name) in ('Bids received', 'Inspection requests', 'Delivery tickets', 'Emailed in',
                                                     'Bid forms', 'RFIs')
    else btrim(p_name) = case (select kind from public.folders where id = p_parent_id and project_id = p_project_id)
                           when 'reports' then 'Inspection reports' when 'photos' then 'Corrections' end
  end;
$$;

-- ---------------------------------------------------------------------------
-- Company logo: orgs.logo_path, private bucket org-logos, set_org_logo()
-- ---------------------------------------------------------------------------
alter table public.orgs add column logo_path text;
alter table public.orgs add constraint orgs_logo_path check (logo_path is null or logo_path = 'org/' || id::text || '/logo');

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('org-logos', 'org-logos', false, 2097152, array['image/png', 'image/jpeg'])
on conflict (id) do nothing;

-- The company a logo path belongs to, or null for anything that isn't exactly org/<uuid>/logo.
create or replace function public.org_logo_org(p_name text)
returns uuid
language sql
immutable
set search_path = public, pg_temp
as $$
  select case when p_name ~ '^org/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/logo$'
              then split_part(p_name, '/', 2)::uuid end;
$$;

-- The company's members read (the Settings preview); its admins upload, replace and remove. Downloads for the PDF go
-- through the rfis function.
create policy "storage org-logos: members read" on storage.objects for select to authenticated
  using (bucket_id = 'org-logos'
         and exists (select 1 from public.org_members om
                      where om.org_id = public.org_logo_org(name) and om.user_id = auth.uid()));
create policy "storage org-logos: admins upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'org-logos' and public.is_org_admin(public.org_logo_org(name)));
create policy "storage org-logos: admins replace" on storage.objects for update to authenticated
  using (bucket_id = 'org-logos' and public.is_org_admin(public.org_logo_org(name)))
  with check (bucket_id = 'org-logos' and public.is_org_admin(public.org_logo_org(name)));
create policy "storage org-logos: admins remove" on storage.objects for delete to authenticated
  using (bucket_id = 'org-logos' and public.is_org_admin(public.org_logo_org(name)));

-- Sets (or, with null, removes) the company's logo. The path is always the company's own, and the file must be there.
create or replace function public.set_org_logo(p_org_id uuid, p_path text)
returns public.orgs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare o public.orgs; v_path text := nullif(btrim(coalesce(p_path, '')), '');
begin
  if not public.is_org_admin(p_org_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  if v_path is not null and v_path <> 'org/' || p_org_id::text || '/logo' then
    raise exception 'That logo is not this company''s.' using errcode = '22023';
  end if;
  if v_path is not null
     and not exists (select 1 from storage.objects so where so.bucket_id = 'org-logos' and so.name = v_path) then
    raise exception 'Upload the logo first.' using errcode = '22023';
  end if;
  update public.orgs set logo_path = v_path where id = p_org_id and deleted_at is null returning * into o;
  if o.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  perform public.audit('org.logo', 'org', o.id, null, o.id, jsonb_build_object('path', v_path));
  return o;
end;
$$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
-- The one place the day defaults live (answer due, impact window).
create or replace function public.rfi_default_days()
returns int
language sql
immutable
set search_path = public, pg_temp
as $$
  select 7;
$$;

create table public.rfi_settings (
  project_id uuid primary key references public.projects(id),
  org_id uuid not null,
  answer_days int not null default public.rfi_default_days() check (answer_days between 1 and 60),
  impact_days int not null default public.rfi_default_days() check (impact_days between 1 and 60),
  version int not null default 1,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  foreign key (project_id, org_id) references public.projects (id, org_id)
);
alter table public.rfi_settings enable row level security;
create trigger touch before update on public.rfi_settings for each row execute function public.tg_touch_row();

-- The job's reviewers before issue, in order: a role on the job (any active member with it) or one person.
create table public.rfi_route_steps (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  org_id uuid not null,
  project_id uuid not null,
  position int not null check (position between 1 and 10),
  role text references public.roles(name),
  user_id uuid references auth.users(id),
  foreign key (project_id, org_id) references public.projects (id, org_id),
  unique (project_id, position),
  check ((role is null) <> (user_id is null))
);
alter table public.rfi_route_steps enable row level security;

create table public.rfis (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id),
  version int not null default 1,
  deleted_at timestamptz,
  org_id uuid not null,
  project_id uuid not null,
  -- next_number(project, 'rfi') at issue; never before, never changed.
  number int check (number > 0),
  status text not null default 'draft'
    check (status in ('draft', 'review', 'issue', 'open', 'answered', 'closed', 'void')),
  title text not null check (length(btrim(title)) between 1 and 200),
  question text not null check (length(btrim(question)) between 1 and 8000),
  suggestion text not null default '' check (length(suggestion) <= 4000),
  refs text not null default '' check (length(refs) <= 500),
  -- Files in the job's "RFIs" folder.
  photo_ids uuid[] not null default '{}' check (cardinality(photo_ids) <= 20),
  -- The originator's "possible impact" flags when asking.
  cost_impact boolean,
  time_impact boolean,
  needed_by date,
  -- Where it is on the tracker: 0 originator, 1..n the RFI's reviewers, n+1 issue, n+2 architect, n+3 answered.
  step int not null default 0 check (step between 0 and 20),
  due_at timestamptz,
  held_since timestamptz not null default now(),
  held_opened_at timestamptz,
  sent_at timestamptz,
  sent_by uuid references auth.users(id),
  sent_hash text check (sent_hash is null or sent_hash ~ '^[0-9a-f]{64}$'),
  issued_at timestamptz,
  issued_by uuid references auth.users(id),
  issued_hash text check (issued_hash is null or issued_hash ~ '^[0-9a-f]{64}$'),
  answer text check (answer is null or length(btrim(answer)) between 1 and 8000),
  answer_file_ids uuid[] not null default '{}' check (cardinality(answer_file_ids) <= 20),
  answered_at timestamptz,
  answered_by uuid references auth.users(id),
  impact_until timestamptz,
  impact_claimed_at timestamptz,
  impact_cost boolean,
  impact_time boolean,
  impact_note text check (impact_note is null or length(impact_note) <= 4000),
  impact_gc_note text check (impact_gc_note is null or length(btrim(impact_gc_note)) between 1 and 4000),
  closed_at timestamptz,
  closed_by uuid references auth.users(id),
  void_note text check (void_note is null or length(void_note) <= 1000),
  pdf_file_id uuid references public.files(id),
  pdf_hash text check (pdf_hash is null or pdf_hash ~ '^[0-9a-f]{64}$'),
  -- rfi_create's p_key: a repeat returns the same row.
  request_key uuid,
  foreign key (project_id, org_id) references public.projects (id, org_id),
  unique (project_id, number),
  unique (created_by, request_key),
  check ((number is null) = (issued_at is null)),
  check ((sent_at is null) = (sent_hash is null)),
  check ((issued_at is null) = (issued_hash is null)),
  check ((answered_at is null) = (answer is null)),
  check (status not in ('open', 'answered', 'closed') or issued_at is not null),
  check (status not in ('answered', 'closed') or answered_at is not null),
  check (impact_claimed_at is null or (coalesce(impact_cost, false) or coalesce(impact_time, false))),
  check (impact_gc_note is null or impact_claimed_at is not null)
);
alter table public.rfis enable row level security;
create index rfis_project on public.rfis (project_id, created_at desc) where deleted_at is null;
insert into public.owner_lookup (entity_type, table_name, owner_column) values ('rfi', 'rfis', 'created_by')
on conflict do nothing;

-- The RFI's own copy of the route, made at its first "Sign & send". Written only by rfi_sign_send.
create table public.rfi_steps (
  rfi_id uuid not null references public.rfis(id),
  position int not null check (position between 1 and 10),
  role text references public.roles(name),
  user_id uuid references auth.users(id),
  label text not null check (length(label) between 1 and 200),
  primary key (rfi_id, position),
  check ((role is null) <> (user_id is null))
);
alter table public.rfi_steps enable row level security;

create table public.rfi_events (
  id bigint generated always as identity primary key,
  rfi_id uuid not null references public.rfis(id),
  project_id uuid not null,
  org_id uuid not null,
  at timestamptz not null default now(),
  actor uuid references auth.users(id),
  kind text not null check (kind in ('created', 'edited', 'sent', 'forwarded', 'returned', 'issued', 'opened', 'answered',
                                     'impact_claimed', 'impact_note', 'closed', 'voided')),
  step int,
  note text check (note is null or length(note) <= 4000)
);
alter table public.rfi_events enable row level security;
create index rfi_events_rfi on public.rfi_events (rfi_id, id);
create trigger audit_immutable before update or delete on public.rfi_events
  for each row execute function public.tg_audit_immutable();

-- ---------------------------------------------------------------------------
-- Triggers on rfis
-- ---------------------------------------------------------------------------
-- updated_at always; the version only when something people see changed (not the first-open mark or the stored PDF),
-- so opening an RFI or making its PDF never turns someone's next save into a version conflict.
create or replace function public.tg_rfi_touch()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  if (to_jsonb(new) - array['updated_at', 'version', 'held_opened_at', 'pdf_file_id', 'pdf_hash'])
     is distinct from (to_jsonb(old) - array['updated_at', 'version', 'held_opened_at', 'pdf_file_id', 'pdf_hash']) then
    new.version := old.version + 1;
  else
    new.version := old.version;
  end if;
  return new;
end;
$$;
revoke execute on function public.tg_rfi_touch() from public, anon, authenticated;

-- What never changes once set: the job, the originator, the number, the issue signature, the answer, an impact claim
-- (SPEC §7.4: permanent) and the GC's note on it (it can be reworded, never removed).
create or replace function public.tg_rfi_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.project_id <> old.project_id or new.org_id <> old.org_id or new.created_by <> old.created_by then
    raise exception 'An RFI stays on its job with its originator.' using errcode = '42501';
  end if;
  if old.number is not null and new.number is distinct from old.number then
    raise exception 'An RFI number never changes.' using errcode = '42501';
  end if;
  if old.issued_at is not null
     and (new.issued_at, new.issued_by, new.issued_hash) is distinct from (old.issued_at, old.issued_by, old.issued_hash) then
    raise exception 'The issue signature never changes.' using errcode = '42501';
  end if;
  if old.answered_at is not null
     and (new.answer, new.answer_file_ids, new.answered_at, new.answered_by)
         is distinct from (old.answer, old.answer_file_ids, old.answered_at, old.answered_by) then
    raise exception 'The answer never changes.' using errcode = '42501';
  end if;
  if old.impact_claimed_at is not null
     and (new.impact_claimed_at, new.impact_cost, new.impact_time, new.impact_note)
         is distinct from (old.impact_claimed_at, old.impact_cost, old.impact_time, old.impact_note) then
    raise exception 'An impact claim is permanent.' using errcode = '42501';
  end if;
  if old.impact_gc_note is not null and new.impact_gc_note is null then
    raise exception 'The GC note on an impact claim stays.' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke execute on function public.tg_rfi_guard() from public, anon, authenticated;

-- "RFI 003", or "RFI" before it has a number.
create or replace function public.rfi_label(p_number int)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case when p_number is null then 'RFI' else 'RFI ' || lpad(p_number::text, 3, '0') end;
$$;

-- An open RFI's answer due day is a "my due" line for whoever answers RFIs on the job; answered, closed or void, it goes.
create or replace function public.tg_rfi_calendar()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_tz text;
begin
  if new.status = 'open' and new.due_at is not null and new.deleted_at is null then
    select timezone into v_tz from public.projects where id = new.project_id;
    perform public.calendar_mirror('rfi', new.id, new.project_id, 'my_due',
      left(public.rfi_label(new.number) || ' answer due: ' || new.title, 300),
      ((new.due_at at time zone v_tz)::date)::timestamp at time zone v_tz, null, true, 'pending', 'rfi.answer', null);
  else
    perform public.calendar_unmirror('rfi', new.id);
  end if;
  return null;
end;
$$;
revoke execute on function public.tg_rfi_calendar() from public, anon, authenticated;

create trigger touch before update on public.rfis for each row execute function public.tg_rfi_touch();
create trigger rfi_guard before update on public.rfis for each row execute function public.tg_rfi_guard();
create trigger no_delete before delete on public.rfis for each row execute function public.tg_block_delete();
create trigger audit_row after insert or update on public.rfis for each row execute function public.tg_audit_row();
create trigger rfi_calendar after insert or update of status, due_at, title, number, deleted_at on public.rfis
  for each row execute function public.tg_rfi_calendar();

-- ---------------------------------------------------------------------------
-- Internal helpers (not user-callable unless granted at the end)
-- ---------------------------------------------------------------------------
-- A person's display name (profile name, else the address before the @).
create or replace function public.rfi_person_name(p_person uuid)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((select coalesce(nullif(btrim(p.full_name), ''), split_part(p.email, '@', 1))
                     from public.profiles p where p.user_id = p_person), 'Someone');
$$;

-- A role as a label, without naming any role in code: 'pe' -> 'PE', 'project_admin' -> 'Project admin'.
create or replace function public.rfi_role_label(p_role text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case when p_role is null then null
              when length(p_role) <= 2 then upper(p_role)
              else upper(left(p_role, 1)) || replace(substr(p_role, 2), '_', ' ') end;
$$;

create or replace function public.rfi_step_label(p_role text, p_person uuid)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(public.rfi_role_label(p_role), public.rfi_person_name(p_person));
$$;

-- The company a member is on the job for (their membership's company, else their profile's).
create or replace function public.rfi_person_company(p_project_id uuid, p_person uuid)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((select coalesce(o.name, nullif(pr.company, ''))
                     from public.project_members pm
                     left join public.orgs o on o.id = pm.member_org_id
                     left join public.profiles pr on pr.user_id = pm.user_id
                    where pm.project_id = p_project_id and pm.user_id = p_person and pm.status <> 'revoked'
                    order by pm.created_at limit 1), '');
$$;

create or replace function public.rfi_active_member(p_project_id uuid, p_person uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (select 1 from public.project_members pm
                  where pm.project_id = p_project_id and pm.user_id = p_person and pm.status = 'active'
                    and (pm.access_ends_at is null or pm.access_ends_at > now()));
$$;

-- Active members holding a capability on the job (the role matrix is data).
create or replace function public.rfi_users_with_cap(p_project_id uuid, p_cap text)
returns uuid[]
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(array_agg(distinct pm.user_id), '{}'::uuid[])
    from public.project_members pm
    join public.role_permissions rp on rp.role = pm.role and rp.capability = p_cap
   where pm.project_id = p_project_id and pm.user_id is not null and pm.status = 'active'
     and (pm.access_ends_at is null or pm.access_ends_at > now());
$$;

create or replace function public.rfi_users_with_role(p_project_id uuid, p_role text)
returns uuid[]
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(array_agg(distinct pm.user_id), '{}'::uuid[])
    from public.project_members pm
   where pm.project_id = p_project_id and pm.user_id is not null and pm.status = 'active' and pm.role = p_role
     and (pm.access_ends_at is null or pm.access_ends_at > now());
$$;

-- Is the caller on the RFI's route at or before position p_upto (a step's person, or a member with its role)?
create or replace function public.rfi_on_route(p_rfi_id uuid, p_project_id uuid, p_upto int)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.rfi_steps s
     where s.rfi_id = p_rfi_id and s.position <= p_upto
       and (s.user_id = auth.uid()
            or (s.role is not null and exists (
                  select 1 from public.project_members pm
                   where pm.project_id = p_project_id and pm.user_id = auth.uid() and pm.status = 'active'
                     and (pm.access_ends_at is null or pm.access_ends_at > now()) and pm.role = s.role))));
$$;

-- May the caller see this RFI? The rfis policy and every RPC ask this one question.
create or replace function public.rfi_may_see(p_rfi_id uuid, p_project_id uuid, p_created_by uuid, p_status text, p_step int)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(public.is_member(p_project_id) and (
       p_created_by = auth.uid()
    or public.has_capability(p_project_id, 'rfi.sign_issue')
    or (p_status <> 'draft'
        and public.rfi_on_route(p_rfi_id, p_project_id, case when p_status = 'review' then p_step else 1000 end))
    or (p_status in ('open', 'answered', 'closed') and public.has_capability(p_project_id, 'rfi.answer'))
    or (p_status in ('answered', 'closed') and public.has_capability(p_project_id, 'files.read_project'))), false);
$$;

-- Who holds review step p_step: its person, or every active member with its role; if nobody is left on the job for
-- that step, the people who may issue RFIs, so an RFI never gets stuck.
create or replace function public.rfi_step_holders(p_rfi_id uuid, p_project_id uuid, p_step int)
returns uuid[]
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare s public.rfi_steps; v_ids uuid[];
begin
  select * into s from public.rfi_steps where rfi_id = p_rfi_id and position = p_step;
  if s.rfi_id is null then return '{}'::uuid[]; end if;
  if s.user_id is not null then
    v_ids := case when public.rfi_active_member(p_project_id, s.user_id) then array[s.user_id] else '{}'::uuid[] end;
  else
    v_ids := public.rfi_users_with_role(p_project_id, s.role);
  end if;
  if cardinality(v_ids) = 0 then v_ids := public.rfi_users_with_cap(p_project_id, 'rfi.sign_issue'); end if;
  return v_ids;
end;
$$;

-- Does the caller hold the RFI now (is it theirs to act on)?
create or replace function public.rfi_holds(p_rfi_id uuid, p_project_id uuid, p_created_by uuid, p_status text, p_step int)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(case
    when p_status in ('draft', 'answered') then p_created_by = auth.uid() and public.is_member(p_project_id)
    when p_status = 'review' then auth.uid() = any (public.rfi_step_holders(p_rfi_id, p_project_id, p_step))
    when p_status = 'issue' then public.has_capability(p_project_id, 'rfi.sign_issue')
    when p_status = 'open' then public.has_capability(p_project_id, 'rfi.answer')
    else false
  end, false);
$$;

-- Everyone who holds it now (their tasks).
create or replace function public.rfi_holder_ids(p_rfi_id uuid)
returns uuid[]
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare r public.rfis;
begin
  select * into r from public.rfis where id = p_rfi_id;
  return case
    when r.status in ('draft', 'answered') then
      case when public.rfi_active_member(r.project_id, r.created_by) then array[r.created_by] else '{}'::uuid[] end
    when r.status = 'review' then public.rfi_step_holders(r.id, r.project_id, r.step)
    when r.status = 'issue' then public.rfi_users_with_cap(r.project_id, 'rfi.sign_issue')
    when r.status = 'open' then public.rfi_users_with_cap(r.project_id, 'rfi.answer')
    else '{}'::uuid[]
  end;
end;
$$;

-- Who has it, as the tracker and the log say it.
create or replace function public.rfi_holder_label(p_rfi_id uuid, p_status text, p_step int, p_created_by uuid)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when p_status in ('draft', 'answered') then public.rfi_person_name(p_created_by)
    when p_status = 'review' then coalesce((select s.label from public.rfi_steps s
                                             where s.rfi_id = p_rfi_id and s.position = p_step), '')
    when p_status = 'issue' then 'PM / PE'
    when p_status = 'open' then 'Architect'
    else ''
  end;
$$;

create or replace function public.rfi_step_count(p_rfi_id uuid)
returns int
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select count(*)::int from public.rfi_steps where rfi_id = p_rfi_id;
$$;

-- The RFI, locked, if the caller may see it; version-checked when a version is given.
create or replace function public.rfi_lock(p_rfi_id uuid, p_version int)
returns public.rfis
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare r public.rfis;
begin
  select * into r from public.rfis where id = p_rfi_id and deleted_at is null for update;
  if r.id is null or not public.rfi_may_see(r.id, r.project_id, r.created_by, r.status, r.step) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if p_version is not null and r.version <> p_version then
    raise exception 'version_conflict: expected %, found %', p_version, r.version using errcode = '40001';
  end if;
  return r;
end;
$$;

create or replace function public.rfi_check_text(p_title text, p_question text, p_suggestion text, p_refs text)
returns void
language plpgsql
immutable
set search_path = public, pg_temp
as $$
begin
  if length(btrim(coalesce(p_title, ''))) = 0 then raise exception 'Add a title.' using errcode = '22023'; end if;
  if length(btrim(p_title)) > 200 then raise exception 'Keep the title to 200 characters.' using errcode = '22023'; end if;
  if length(btrim(coalesce(p_question, ''))) = 0 then raise exception 'Add the question.' using errcode = '22023'; end if;
  if length(btrim(p_question)) > 8000 then
    raise exception 'Keep the question to 8000 characters.' using errcode = '22023';
  end if;
  if length(coalesce(p_suggestion, '')) > 4000 then
    raise exception 'Keep the suggestion to 4000 characters.' using errcode = '22023';
  end if;
  if length(coalesce(p_refs, '')) > 500 then raise exception 'Keep the reference to 500 characters.' using errcode = '22023'; end if;
end;
$$;

-- Files an RFI may carry: ones it already has, or the caller's own uploads in the job's "RFIs" folder. At most 20, no
-- repeats. So an RFI can never hand out (through rfi_authorize_file) a file from any other folder.
create or replace function public.rfi_files_ok(p_project_id uuid, p_ids uuid[], p_existing uuid[])
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select cardinality(coalesce(p_ids, '{}'::uuid[])) <= 20
     and cardinality(coalesce(p_ids, '{}'::uuid[])) = (select count(distinct x) from unnest(coalesce(p_ids, '{}'::uuid[])) x)
     and not exists (
       select 1 from unnest(coalesce(p_ids, '{}'::uuid[])) as t (id)
        where not (t.id = any (coalesce(p_existing, '{}'::uuid[]))
                   or exists (select 1 from public.files f join public.folders fo on fo.id = f.folder_id
                               where f.id = t.id and f.project_id = p_project_id and f.deleted_at is null
                                 and f.created_by = auth.uid() and fo.project_id = p_project_id and fo.kind = 'rfis'
                                 and fo.deleted_at is null)));
$$;

create or replace function public.rfi_event(p_rfi_id uuid, p_kind text, p_step int, p_note text)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  insert into public.rfi_events (rfi_id, project_id, org_id, actor, kind, step, note)
  select r.id, r.project_id, r.org_id, auth.uid(), p_kind, p_step, p_note from public.rfis r where r.id = p_rfi_id;
$$;

-- A move: the earlier holders' RFI tasks are done, and each new holder gets one (due with the RFI; the originator's
-- after the answer is due with the impact window).
create or replace function public.rfi_hand_over(p_rfi_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare r public.rfis; u uuid; v_title text;
begin
  select * into r from public.rfis where id = p_rfi_id;
  update public.tasks set done_at = now(), done_by = auth.uid()
   where entity_type = 'rfi' and entity_id = r.id and kind = 'rfi' and done_at is null and deleted_at is null;
  if r.status in ('closed', 'void') then return; end if;
  v_title := case r.status
    when 'draft' then 'Returned RFI: ' || r.title
    when 'review' then 'Review RFI: ' || r.title
    when 'issue' then 'Sign & issue RFI: ' || r.title
    when 'open' then 'Answer ' || public.rfi_label(r.number) || ': ' || r.title
    else public.rfi_label(r.number) || ' answered: ' || r.title
  end;
  foreach u in array public.rfi_holder_ids(r.id) loop
    perform public.create_task(r.project_id, u, 'rfi', left(v_title, 300), 'rfi', r.id,
      case when r.status = 'answered' then r.impact_until else r.due_at end, r.status in ('draft', 'issue'));
  end loop;
end;
$$;

-- A board line for some people, skipping the caller and anyone off the job; nothing when nobody is left.
create or replace function public.rfi_tell(p_rfi_id uuid, p_kind text, p_summary text, p_people uuid[])
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare r public.rfis; v_to uuid[];
begin
  select * into r from public.rfis where id = p_rfi_id;
  v_to := array(select distinct x from unnest(coalesce(p_people, '{}'::uuid[])) x
                 where x is not null and x is distinct from auth.uid() and public.rfi_active_member(r.project_id, x));
  if cardinality(v_to) > 0 then
    perform public.post_activity(r.project_id, p_kind, left(p_summary, 500), 'rfi', r.id, null, v_to);
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS: read only; every write is an RPC below
-- ---------------------------------------------------------------------------
create policy "rfis: who may see it" on public.rfis for select to authenticated
  using (deleted_at is null and public.rfi_may_see(id, project_id, created_by, status, step));
create policy "rfi_steps: with the RFI" on public.rfi_steps for select to authenticated
  using (exists (select 1 from public.rfis r where r.id = rfi_steps.rfi_id));
create policy "rfi_events: with the RFI" on public.rfi_events for select to authenticated
  using (exists (select 1 from public.rfis r where r.id = rfi_events.rfi_id));
-- The job's settings and route: every member but bidders (members.view).
create policy "rfi_settings: members read" on public.rfi_settings for select to authenticated
  using (public.has_capability(project_id, 'members.view'));
create policy "rfi_route_steps: members read" on public.rfi_route_steps for select to authenticated
  using (public.has_capability(project_id, 'members.view'));

revoke all on public.rfi_settings, public.rfi_route_steps, public.rfis, public.rfi_steps, public.rfi_events
  from anon, authenticated;
grant select on public.rfi_settings, public.rfi_route_steps, public.rfis, public.rfi_steps, public.rfi_events
  to authenticated;
grant select, insert, update on public.rfi_settings, public.rfi_route_steps, public.rfis, public.rfi_steps,
  public.rfi_events to service_role;
revoke all on sequence public.rfi_events_id_seq from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Settings: answer due, impact window, the route
-- ---------------------------------------------------------------------------
create or replace function public.rfi_settings_for(p_project_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare s public.rfi_settings;
begin
  if not public.has_capability(p_project_id, 'members.view') then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into s from public.rfi_settings where project_id = p_project_id;
  return jsonb_build_object(
    'answer_days', coalesce(s.answer_days, public.rfi_default_days()),
    'impact_days', coalesce(s.impact_days, public.rfi_default_days()),
    'version', coalesce(s.version, 0),
    'route', coalesce((select jsonb_agg(jsonb_build_object('position', rs.position, 'role', rs.role, 'user_id', rs.user_id,
                                                           'label', public.rfi_step_label(rs.role, rs.user_id))
                                        order by rs.position)
                         from public.rfi_route_steps rs where rs.project_id = p_project_id), '[]'::jsonb));
end;
$$;

-- p_route: [{ "role": "<roles.name>" } | { "user_id": "<uuid>" }], in order, at most 10. p_version 0 = first save.
create or replace function public.rfi_save_settings(p_project_id uuid, p_version int, p_answer_days int, p_impact_days int,
                                                    p_route jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  p public.projects; s public.rfi_settings; e jsonb; v_role text; v_user uuid; v_keys text[] := '{}'; v_key text;
  v_route jsonb := coalesce(p_route, '[]'::jsonb); v_before jsonb;
begin
  if not public.has_capability(p_project_id, 'rfi.sign_issue') then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into p from public.projects where id = p_project_id and deleted_at is null;
  if p.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if p_answer_days is null or p_answer_days not between 1 and 60 then
    raise exception 'Answer due is 1 to 60 days.' using errcode = '22023';
  end if;
  if p_impact_days is null or p_impact_days not between 1 and 60 then
    raise exception 'The impact window is 1 to 60 days.' using errcode = '22023';
  end if;
  if jsonb_typeof(v_route) <> 'array' then raise exception 'The route is a list.' using errcode = '22023'; end if;
  if jsonb_array_length(v_route) > 10 then raise exception 'Up to 10 reviewers.' using errcode = '22023'; end if;
  for e in select value from jsonb_array_elements(v_route) loop
    if jsonb_typeof(e) <> 'object' then raise exception 'Pick a role or a person for each step.' using errcode = '22023'; end if;
    v_role := nullif(btrim(coalesce(e ->> 'role', '')), '');
    v_user := case when (e ->> 'user_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                   then (e ->> 'user_id')::uuid end;
    if (v_role is null) = (v_user is null) or (v_user is null and e ? 'user_id' and e ->> 'user_id' is not null) then
      raise exception 'Pick a role or a person for each step.' using errcode = '22023';
    end if;
    if v_role is not null and (not exists (select 1 from public.roles where name = v_role) or public.role_is_walled(v_role)) then
      raise exception 'Unknown role.' using errcode = '22023';
    end if;
    if v_user is not null and not exists (
         select 1 from public.project_members pm
          where pm.project_id = p_project_id and pm.user_id = v_user and pm.status = 'active'
            and (pm.access_ends_at is null or pm.access_ends_at > now()) and not public.role_is_walled(pm.role)) then
      raise exception 'That person is not on this job.' using errcode = '22023';
    end if;
    v_key := coalesce(v_role, v_user::text);
    if v_key = any (v_keys) then raise exception 'Each reviewer once.' using errcode = '22023'; end if;
    v_keys := v_keys || v_key;
  end loop;

  perform pg_advisory_xact_lock(hashtext('rfi_settings:' || p_project_id::text));
  select * into s from public.rfi_settings where project_id = p_project_id for update;
  if coalesce(s.version, 0) <> coalesce(p_version, -1) then
    raise exception 'version_conflict: expected %, found %', p_version, coalesce(s.version, 0) using errcode = '40001';
  end if;
  v_before := public.rfi_settings_for(p_project_id);
  if s.project_id is null then
    insert into public.rfi_settings (project_id, org_id, answer_days, impact_days, updated_by)
    values (p.id, p.org_id, p_answer_days, p_impact_days, auth.uid());
  else
    update public.rfi_settings set answer_days = p_answer_days, impact_days = p_impact_days, updated_by = auth.uid()
     where project_id = p.id;
  end if;
  delete from public.rfi_route_steps where project_id = p.id;
  insert into public.rfi_route_steps (org_id, project_id, position, role, user_id, created_by)
  select p.org_id, p.id, t.ord::int, nullif(btrim(coalesce(t.e ->> 'role', '')), ''),
         case when nullif(btrim(coalesce(t.e ->> 'role', '')), '') is null then (t.e ->> 'user_id')::uuid end, auth.uid()
    from jsonb_array_elements(v_route) with ordinality as t (e, ord);
  perform public.audit('rfi.settings', 'rfi_settings', null, p.id, p.org_id,
                       jsonb_build_object('before', v_before, 'after', public.rfi_settings_for(p.id)));
  return public.rfi_settings_for(p.id);
end;
$$;

-- ---------------------------------------------------------------------------
-- The job's "RFIs" folder: photos, answer files and the PDFs. Made once, on first use.
-- Browse (read): rfi.sign_issue only. Add (write): rfi.create_draft, rfi.answer. Uploaders still see their own files.
-- ---------------------------------------------------------------------------
create or replace function public.rfi_folder(p_project_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare p public.projects; v_folder uuid; v_deleted timestamptz;
begin
  if not (public.has_capability(p_project_id, 'rfi.create_draft') or public.has_capability(p_project_id, 'rfi.answer')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into p from public.projects where id = p_project_id and deleted_at is null;
  if p.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  perform pg_advisory_xact_lock(hashtext('rfi_folder:' || p.id::text));
  select f.id, f.deleted_at into v_folder, v_deleted
    from public.folders f
   where f.project_id = p.id and f.kind = 'rfis'
   order by (f.deleted_at is null) desc, f.created_at
   limit 1;
  if v_folder is null then
    insert into public.folders (org_id, project_id, name, kind, sort, ai_reads, created_by)
    values (p.org_id, p.id, 'RFIs', 'rfis', 70, true, auth.uid())
    on conflict do nothing
    returning id into v_folder;
    if v_folder is null then
      raise exception 'A folder named "RFIs" is in the way. Rename it in Files.' using errcode = '23505';
    end if;
    insert into public.folder_access (folder_id, capability, can_read, can_write, created_by) values
      (v_folder, 'rfi.create_draft', false, true, auth.uid()),
      (v_folder, 'rfi.sign_issue', true, false, auth.uid()),
      (v_folder, 'rfi.answer', false, true, auth.uid());
  elsif v_deleted is not null then
    update public.folders set deleted_at = null where id = v_folder;
  end if;
  return v_folder;
end;
$$;

-- ---------------------------------------------------------------------------
-- Drafts
-- ---------------------------------------------------------------------------
create or replace function public.rfi_create(
  p_project_id uuid,
  p_title text,
  p_question text,
  p_photo_ids uuid[] default '{}',
  p_suggestion text default '',
  p_refs text default '',
  p_needed_by date default null,
  p_cost_impact boolean default null,
  p_time_impact boolean default null,
  p_key uuid default null
)
returns public.rfis
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_uid uuid := auth.uid(); p public.projects; r public.rfis;
begin
  if v_uid is null or not public.has_capability(p_project_id, 'rfi.create_draft') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into p from public.projects where id = p_project_id and deleted_at is null;
  if p.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not ('rfis' = any (p.modules)) then raise exception 'RFIs are off for this job.' using errcode = '22023'; end if;
  if p_key is not null then
    perform pg_advisory_xact_lock(hashtext('rfi_create:' || v_uid::text || ':' || p_key::text));
    select * into r from public.rfis where created_by = v_uid and request_key = p_key;
    if r.id is not null then return r; end if;
  end if;
  perform public.rfi_check_text(p_title, p_question, p_suggestion, p_refs);
  if not public.rfi_files_ok(p.id, p_photo_ids, '{}'::uuid[]) then
    raise exception 'A photo is missing. Add it again.' using errcode = '22023';
  end if;
  insert into public.rfis (org_id, project_id, status, title, question, suggestion, refs, photo_ids, cost_impact, time_impact,
                           needed_by, step, held_since, held_opened_at, created_by, request_key)
  values (p.org_id, p.id, 'draft', btrim(p_title), btrim(p_question), btrim(coalesce(p_suggestion, '')),
          btrim(coalesce(p_refs, '')), coalesce(p_photo_ids, '{}'::uuid[]), p_cost_impact, p_time_impact, p_needed_by, 0,
          now(), now(), v_uid, p_key)
  returning * into r;
  perform public.rfi_event(r.id, 'created', 0, null);
  return r;
end;
$$;

-- The holder edits (draft, review, issue): the whole editable content each time (a missing needed-by or impact flag
-- clears it). An unchanged save returns the row as is. Reviewers' and issuers' edits land
-- in the history once per person per hold.
create or replace function public.rfi_update(
  p_rfi_id uuid,
  p_version int,
  p_title text,
  p_question text,
  p_photo_ids uuid[],
  p_suggestion text,
  p_refs text,
  p_needed_by date default null,
  p_cost_impact boolean default null,
  p_time_impact boolean default null
)
returns public.rfis
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare r public.rfis;
begin
  r := public.rfi_lock(p_rfi_id, p_version);
  if r.status not in ('draft', 'review', 'issue') then raise exception 'This RFI can''t be edited now.' using errcode = '22023'; end if;
  if not public.rfi_holds(r.id, r.project_id, r.created_by, r.status, r.step) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform public.rfi_check_text(p_title, p_question, p_suggestion, p_refs);
  if not public.rfi_files_ok(r.project_id, p_photo_ids, r.photo_ids) then
    raise exception 'A photo is missing. Add it again.' using errcode = '22023';
  end if;
  if (btrim(p_title), btrim(p_question), coalesce(p_photo_ids, '{}'::uuid[]), btrim(coalesce(p_suggestion, '')),
      btrim(coalesce(p_refs, '')), p_needed_by, p_cost_impact, p_time_impact)
     is not distinct from
     (r.title, r.question, r.photo_ids, r.suggestion, r.refs, r.needed_by, r.cost_impact, r.time_impact) then
    return r;
  end if;
  update public.rfis
     set title = btrim(p_title), question = btrim(p_question), photo_ids = coalesce(p_photo_ids, '{}'::uuid[]),
         suggestion = btrim(coalesce(p_suggestion, '')), refs = btrim(coalesce(p_refs, '')), needed_by = p_needed_by,
         cost_impact = p_cost_impact, time_impact = p_time_impact
   where id = r.id
   returning * into r;
  if r.status <> 'draft' and not exists (select 1 from public.rfi_events e
                                          where e.rfi_id = r.id and e.kind = 'edited' and e.actor = auth.uid()
                                            and e.at >= r.held_since) then
    perform public.rfi_event(r.id, 'edited', r.step, null);
  end if;
  return r;
end;
$$;

-- ---------------------------------------------------------------------------
-- Signature 1: the originator signs and sends (called by the rfis function as the caller, after the content hash).
-- ---------------------------------------------------------------------------
create or replace function public.rfi_sign_send(p_rfi_id uuid, p_version int, p_content_hash text)
returns public.rfis
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare r public.rfis; v_n int;
begin
  if not public.signed_in_recently() then
    raise exception 'reauth_required: sign in again to sign' using errcode = '42501';
  end if;
  r := public.rfi_lock(p_rfi_id, p_version);
  if r.created_by is distinct from auth.uid() or not public.has_capability(r.project_id, 'rfi.create_draft') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if r.status <> 'draft' then raise exception 'This RFI was already sent.' using errcode = '22023'; end if;
  if p_content_hash is null or p_content_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'bad content hash' using errcode = '22023';
  end if;
  -- The RFI's own copy of the job's route, made once: a send after "Send back" starts again at its first reviewer.
  if not exists (select 1 from public.rfi_steps where rfi_id = r.id) then
    insert into public.rfi_steps (rfi_id, position, role, user_id, label)
    select r.id, rs.position, rs.role, rs.user_id, public.rfi_step_label(rs.role, rs.user_id)
      from public.rfi_route_steps rs where rs.project_id = r.project_id;
  end if;
  v_n := public.rfi_step_count(r.id);
  update public.rfis
     set status = case when v_n > 0 then 'review' else 'issue' end, step = 1,
         sent_at = now(), sent_by = auth.uid(), sent_hash = p_content_hash, held_since = now(), held_opened_at = null
   where id = r.id
   returning * into r;
  perform public.rfi_event(r.id, 'sent', 0, null);
  perform public.audit('rfi.sign_send', 'rfi', r.id, r.project_id, r.org_id, jsonb_build_object('title', r.title),
                       p_content_hash);
  perform public.rfi_hand_over(r.id);
  if r.status = 'review' then
    perform public.rfi_tell(r.id, 'rfi.review', 'RFI to review: ' || r.title,
                            public.rfi_step_holders(r.id, r.project_id, r.step));
  else
    perform public.post_activity(r.project_id, 'rfi.to_issue', left('RFI to issue: ' || r.title, 500), 'rfi', r.id,
                                 'rfi.sign_issue');
  end if;
  return r;
end;
$$;

-- A reviewer sends it on: to the next reviewer, or to the PM / PE after the last one.
create or replace function public.rfi_forward(p_rfi_id uuid, p_version int, p_note text default null)
returns public.rfis
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare r public.rfis; v_n int; v_from int; v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  r := public.rfi_lock(p_rfi_id, p_version);
  if r.status <> 'review' then raise exception 'This RFI is not in review.' using errcode = '22023'; end if;
  if not public.rfi_holds(r.id, r.project_id, r.created_by, r.status, r.step) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if length(coalesce(v_note, '')) > 1000 then raise exception 'Keep the note to 1000 characters.' using errcode = '22023'; end if;
  v_n := public.rfi_step_count(r.id);
  v_from := r.step;
  update public.rfis
     set status = case when v_from < v_n then 'review' else 'issue' end, step = v_from + 1,
         held_since = now(), held_opened_at = null
   where id = r.id
   returning * into r;
  perform public.rfi_event(r.id, 'forwarded', v_from, v_note);
  perform public.rfi_hand_over(r.id);
  if r.status = 'review' then
    perform public.rfi_tell(r.id, 'rfi.review', 'RFI to review: ' || r.title,
                            public.rfi_step_holders(r.id, r.project_id, r.step));
  else
    perform public.post_activity(r.project_id, 'rfi.to_issue', left('RFI to issue: ' || r.title, 500), 'rfi', r.id,
                                 'rfi.sign_issue');
  end if;
  return r;
end;
$$;

-- A reviewer or the PM / PE sends it back to the originator, with a note. It is a draft again and needs a new signature.
create or replace function public.rfi_send_back(p_rfi_id uuid, p_version int, p_note text)
returns public.rfis
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare r public.rfis; v_from int; v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  r := public.rfi_lock(p_rfi_id, p_version);
  if r.status not in ('review', 'issue') then raise exception 'This RFI can''t be sent back now.' using errcode = '22023'; end if;
  if not public.rfi_holds(r.id, r.project_id, r.created_by, r.status, r.step) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_note is null then raise exception 'Add a note for the originator.' using errcode = '22023'; end if;
  if length(v_note) > 1000 then raise exception 'Keep the note to 1000 characters.' using errcode = '22023'; end if;
  v_from := r.step;
  update public.rfis
     set status = 'draft', step = 0, sent_at = null, sent_by = null, sent_hash = null,
         held_since = now(), held_opened_at = null
   where id = r.id
   returning * into r;
  perform public.rfi_event(r.id, 'returned', v_from, v_note);
  perform public.rfi_hand_over(r.id);
  perform public.rfi_tell(r.id, 'rfi.returned', 'RFI returned: ' || r.title || ' · ' || v_note, array[r.created_by]);
  return r;
end;
$$;

-- ---------------------------------------------------------------------------
-- Signature 2: a PM / PE signs and issues. The number comes from the database here, and the answer is due.
-- ---------------------------------------------------------------------------
create or replace function public.rfi_sign_issue(p_rfi_id uuid, p_version int, p_content_hash text)
returns public.rfis
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare r public.rfis; v_n int; v_days int;
begin
  if not public.signed_in_recently() then
    raise exception 'reauth_required: sign in again to sign' using errcode = '42501';
  end if;
  r := public.rfi_lock(p_rfi_id, p_version);
  if not public.has_capability(r.project_id, 'rfi.sign_issue') then raise exception 'forbidden' using errcode = '42501'; end if;
  if r.status <> 'issue' then raise exception 'This RFI is not ready to issue.' using errcode = '22023'; end if;
  if p_content_hash is null or p_content_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'bad content hash' using errcode = '22023';
  end if;
  v_n := public.rfi_step_count(r.id);
  v_days := coalesce((select answer_days from public.rfi_settings where project_id = r.project_id), public.rfi_default_days());
  update public.rfis
     set number = coalesce(number, public.next_number(r.project_id, 'rfi')), status = 'open', step = v_n + 2,
         issued_at = now(), issued_by = auth.uid(), issued_hash = p_content_hash,
         due_at = now() + make_interval(days => v_days), held_since = now(), held_opened_at = null
   where id = r.id
   returning * into r;
  perform public.rfi_event(r.id, 'issued', v_n + 1, null);
  perform public.audit('rfi.sign_issue', 'rfi', r.id, r.project_id, r.org_id,
                       jsonb_build_object('number', r.number, 'title', r.title), p_content_hash);
  perform public.rfi_hand_over(r.id);
  perform public.post_activity(r.project_id, 'rfi.asked', left(public.rfi_label(r.number) || ' asked: ' || r.title, 500),
                               'rfi', r.id, 'rfi.answer');
  perform public.rfi_tell(r.id, 'rfi.issued', public.rfi_label(r.number) || ' issued: ' || r.title, array[r.created_by]);
  return r;
end;
$$;

-- ---------------------------------------------------------------------------
-- The architect answers; it goes back to the originator, and the impact window starts.
-- ---------------------------------------------------------------------------
create or replace function public.rfi_answer(p_rfi_id uuid, p_version int, p_answer text, p_file_ids uuid[] default '{}')
returns public.rfis
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare r public.rfis; v_answer text := btrim(coalesce(p_answer, '')); v_days int; v_from int;
begin
  r := public.rfi_lock(p_rfi_id, p_version);
  if not public.has_capability(r.project_id, 'rfi.answer') then raise exception 'forbidden' using errcode = '42501'; end if;
  if r.status <> 'open' then raise exception 'This RFI is not open for an answer.' using errcode = '22023'; end if;
  if length(v_answer) = 0 then raise exception 'Add the answer.' using errcode = '22023'; end if;
  if length(v_answer) > 8000 then raise exception 'Keep the answer to 8000 characters.' using errcode = '22023'; end if;
  if not public.rfi_files_ok(r.project_id, p_file_ids, r.answer_file_ids) then
    raise exception 'A file is missing. Add it again.' using errcode = '22023';
  end if;
  v_days := coalesce((select impact_days from public.rfi_settings where project_id = r.project_id), public.rfi_default_days());
  v_from := r.step;
  update public.rfis
     set answer = v_answer, answer_file_ids = coalesce(p_file_ids, '{}'::uuid[]), answered_at = now(),
         answered_by = auth.uid(), impact_until = now() + make_interval(days => v_days), status = 'answered',
         step = v_from + 1, held_since = now(), held_opened_at = null
   where id = r.id
   returning * into r;
  perform public.rfi_event(r.id, 'answered', v_from, null);
  perform public.audit('rfi.answer', 'rfi', r.id, r.project_id, r.org_id, jsonb_build_object('number', r.number));
  perform public.rfi_hand_over(r.id);
  -- Everyone who may now read it, and the originator by name.
  perform public.post_activity(r.project_id, 'rfi.answered', left(public.rfi_label(r.number) || ' answered: ' || r.title, 500),
                               'rfi', r.id, 'files.read_project', array[r.created_by]);
  return r;
end;
$$;

-- The originator claims cost and / or time impact within the window. Permanent; the same claim again is a no-op.
create or replace function public.rfi_claim_impact(p_rfi_id uuid, p_cost boolean, p_time boolean, p_note text default null)
returns public.rfis
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare r public.rfis; v_note text := nullif(btrim(coalesce(p_note, '')), ''); v_what text;
begin
  r := public.rfi_lock(p_rfi_id, null);
  if r.created_by is distinct from auth.uid() then
    raise exception 'Only the person who asked can claim impact.' using errcode = '42501';
  end if;
  if r.status not in ('answered', 'closed') then raise exception 'Claim impact after the answer.' using errcode = '22023'; end if;
  if r.impact_claimed_at is not null then
    if (r.impact_cost, r.impact_time, r.impact_note)
       is not distinct from (coalesce(p_cost, false), coalesce(p_time, false), v_note) then
      return r;
    end if;
    raise exception 'Impact is already claimed.' using errcode = '22023';
  end if;
  if r.impact_until is null or now() > r.impact_until then
    raise exception 'The window to claim impact has closed.' using errcode = '22023';
  end if;
  if not (coalesce(p_cost, false) or coalesce(p_time, false)) then
    raise exception 'Pick cost, time or both.' using errcode = '22023';
  end if;
  if length(coalesce(v_note, '')) > 4000 then raise exception 'Keep the note to 4000 characters.' using errcode = '22023'; end if;
  update public.rfis
     set impact_claimed_at = now(), impact_cost = coalesce(p_cost, false), impact_time = coalesce(p_time, false),
         impact_note = v_note
   where id = r.id
   returning * into r;
  v_what := array_to_string(array_remove(array[case when r.impact_cost then 'cost' end,
                                                case when r.impact_time then 'time' end], null), ' and ');
  perform public.rfi_event(r.id, 'impact_claimed', r.step, v_note);
  perform public.audit('rfi.impact_claim', 'rfi', r.id, r.project_id, r.org_id,
                       jsonb_build_object('number', r.number, 'cost', r.impact_cost, 'time', r.impact_time));
  perform public.post_activity(r.project_id, 'rfi.impact_claimed',
    left(public.rfi_label(r.number) || ' impact claimed (' || v_what || '): ' || r.title, 500), 'rfi', r.id, 'rfi.sign_issue');
  return r;
end;
$$;

-- The GC's note on an impact claim (it never removes the claim).
create or replace function public.rfi_gc_note(p_rfi_id uuid, p_note text)
returns public.rfis
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare r public.rfis; v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  r := public.rfi_lock(p_rfi_id, null);
  if not public.has_capability(r.project_id, 'rfi.sign_issue') then raise exception 'forbidden' using errcode = '42501'; end if;
  if r.impact_claimed_at is null then raise exception 'There is no impact claim.' using errcode = '22023'; end if;
  if v_note is null then raise exception 'Add the note.' using errcode = '22023'; end if;
  if length(v_note) > 4000 then raise exception 'Keep the note to 4000 characters.' using errcode = '22023'; end if;
  if v_note = r.impact_gc_note then return r; end if;
  update public.rfis set impact_gc_note = v_note where id = r.id returning * into r;
  perform public.rfi_event(r.id, 'impact_note', r.step, v_note);
  perform public.rfi_tell(r.id, 'rfi.impact_note', public.rfi_label(r.number) || ' GC note on impact: ' || r.title,
                          array[r.created_by]);
  return r;
end;
$$;

-- The originator (or a PM / PE) closes an answered RFI.
create or replace function public.rfi_close(p_rfi_id uuid, p_version int)
returns public.rfis
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare r public.rfis;
begin
  r := public.rfi_lock(p_rfi_id, p_version);
  if not ((r.created_by = auth.uid() and public.is_member(r.project_id))
          or public.has_capability(r.project_id, 'rfi.sign_issue')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if r.status <> 'answered' then raise exception 'Only an answered RFI can be closed.' using errcode = '22023'; end if;
  update public.rfis set status = 'closed', closed_at = now(), closed_by = auth.uid(), held_since = now(), held_opened_at = null
   where id = r.id returning * into r;
  perform public.rfi_event(r.id, 'closed', r.step, null);
  perform public.rfi_hand_over(r.id);
  perform public.rfi_tell(r.id, 'rfi.closed', public.rfi_label(r.number) || ' closed: ' || r.title, array[r.created_by]);
  return r;
end;
$$;

-- Void: a PM / PE, any RFI not closed (with a reason); the originator, their own draft. A number, once given, stays.
create or replace function public.rfi_void(p_rfi_id uuid, p_version int, p_note text default null)
returns public.rfis
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare r public.rfis; v_note text := nullif(btrim(coalesce(p_note, '')), ''); v_was uuid[];
begin
  r := public.rfi_lock(p_rfi_id, p_version);
  if r.status in ('closed', 'void') then raise exception 'This RFI is already closed.' using errcode = '22023'; end if;
  if r.created_by = auth.uid() and r.status = 'draft' and public.is_member(r.project_id) then
    null;
  elsif public.has_capability(r.project_id, 'rfi.sign_issue') then
    if v_note is null then raise exception 'Add a reason.' using errcode = '22023'; end if;
  else
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if length(coalesce(v_note, '')) > 1000 then raise exception 'Keep the reason to 1000 characters.' using errcode = '22023'; end if;
  v_was := public.rfi_holder_ids(r.id);
  update public.rfis set status = 'void', void_note = v_note where id = r.id returning * into r;
  perform public.rfi_event(r.id, 'voided', r.step, v_note);
  perform public.audit('rfi.void', 'rfi', r.id, r.project_id, r.org_id, jsonb_build_object('number', r.number, 'note', v_note));
  perform public.rfi_hand_over(r.id);
  perform public.rfi_tell(r.id, 'rfi.voided', public.rfi_label(r.number) || ' voided: ' || r.title,
                          v_was || r.created_by);
  return r;
end;
$$;

-- ---------------------------------------------------------------------------
-- The PDF on an RFI: recorded by the rfis function (service role) after it rendered and stored it. Its hash says what
-- the PDF shows, so the function knows when to render it again. Not a change people see: the version stays.
-- ---------------------------------------------------------------------------
create or replace function public.rfi_attach_pdf(p_rfi_id uuid, p_file_id uuid, p_content_hash text)
returns public.rfis
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare r public.rfis;
begin
  if not public.is_service_role() then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into r from public.rfis where id = p_rfi_id and deleted_at is null for update;
  if r.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if p_content_hash is null or p_content_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'bad content hash' using errcode = '22023';
  end if;
  if not exists (select 1 from public.files f join public.folders fo on fo.id = f.folder_id
                  where f.id = p_file_id and f.project_id = r.project_id and f.deleted_at is null
                    and f.mime = 'application/pdf' and f.scan_status = 'clean' and fo.kind = 'rfis') then
    raise exception 'The PDF is missing.' using errcode = '22023';
  end if;
  update public.rfis set pdf_file_id = p_file_id, pdf_hash = p_content_hash where id = r.id returning * into r;
  perform public.audit('rfi.pdf', 'rfi', r.id, r.project_id, r.org_id,
                       jsonb_build_object('number', r.number, 'file_id', p_file_id), p_content_hash, 'system');
  return r;
end;
$$;

-- Downloads of an RFI's own files (photos, answer files, its PDF) by anyone who may see the RFI. The scan rules of
-- authorize_download hold (a pending image opens; anything else pending only for its uploader). Logged.
create or replace function public.rfi_authorize_file(p_rfi_id uuid, p_file_id uuid)
returns table (storage_path text, original_name text, mime text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare r public.rfis; f public.files; hdrs jsonb; v_image boolean;
begin
  select * into r from public.rfis x where x.id = p_rfi_id and x.deleted_at is null;
  if r.id is null or not public.rfi_may_see(r.id, r.project_id, r.created_by, r.status, r.step) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if not coalesce(p_file_id = any (r.photo_ids) or p_file_id = any (r.answer_file_ids) or p_file_id = r.pdf_file_id, false) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select fi.* into f from public.files fi join public.folders fo on fo.id = fi.folder_id
   where fi.id = p_file_id and fi.project_id = r.project_id and fi.deleted_at is null and fo.kind = 'rfis';
  if f.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if f.scan_status = 'infected' then raise exception 'infected' using errcode = '42501'; end if;
  v_image := lower(f.mime) in ('image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif')
             and lower(f.original_name) ~ '\.(jpe?g|png|webp|heic|heif)$';
  if f.scan_status = 'pending' and f.created_by is distinct from auth.uid() and not v_image then
    raise exception 'scan_pending' using errcode = '42501';
  end if;
  hdrs := nullif(current_setting('request.headers', true), '')::jsonb;
  insert into public.downloads (file_id, project_id, user_id, ip, variant)
  values (f.id, f.project_id, auth.uid(), nullif(split_part(coalesce(hdrs->>'x-forwarded-for', ''), ',', 1), '')::inet, 'original');
  perform public.audit('download', 'file', f.id, f.project_id, f.org_id,
                       jsonb_build_object('variant', 'original', 'name', f.original_name, 'rfi_id', r.id), f.sha256);
  return query select f.storage_path, f.original_name, f.mime;
end;
$$;

-- ---------------------------------------------------------------------------
-- What the app reads
-- ---------------------------------------------------------------------------
-- The job's log: only RFIs the caller may see. Mine to act first, then late, then newest.
create or replace function public.rfi_list(p_project_id uuid)
returns table (
  id uuid, number int, status text, title text, created_by uuid, originator_name text, created_at timestamptz,
  sent_at timestamptz, issued_at timestamptz, due_at timestamptz, answered_at timestamptz, closed_at timestamptz,
  holder_label text, held_since timestamptz, held_opened_at timestamptz, is_mine_to_act boolean,
  impact_claimed_at timestamptz, impact_until timestamptz, version int
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select r.id, r.number, r.status, r.title, r.created_by, public.rfi_person_name(r.created_by), r.created_at,
         r.sent_at, r.issued_at, r.due_at, r.answered_at, r.closed_at,
         public.rfi_holder_label(r.id, r.status, r.step, r.created_by), r.held_since, r.held_opened_at, h.mine,
         r.impact_claimed_at, r.impact_until, r.version
    from public.rfis r
    cross join lateral (select public.rfi_holds(r.id, r.project_id, r.created_by, r.status, r.step) as mine) h
   where r.project_id = p_project_id and r.deleted_at is null
     and public.rfi_may_see(r.id, r.project_id, r.created_by, r.status, r.step)
   order by h.mine desc, (r.status = 'open' and r.due_at < now()) desc, r.created_at desc;
$$;

-- One RFI in full, with what the caller may do and the whole tracker. A current holder opening it records the first
-- open of this hold (held_opened_at, an 'opened' event), once.
create or replace function public.rfi_detail(p_rfi_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r public.rfis; v_holds boolean; v_orig boolean; v_sign boolean; v_answer boolean; v_reviewers jsonb; v_n int;
  v_cur int; v_route jsonb; v_events jsonb; v_photos jsonb; v_files jsonb; s public.rfi_settings;
begin
  select * into r from public.rfis where id = p_rfi_id and deleted_at is null;
  if r.id is null or not public.rfi_may_see(r.id, r.project_id, r.created_by, r.status, r.step) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  v_holds := public.rfi_holds(r.id, r.project_id, r.created_by, r.status, r.step);
  if v_holds and r.held_opened_at is null then
    update public.rfis set held_opened_at = now() where id = r.id and held_opened_at is null;
    if found then perform public.rfi_event(r.id, 'opened', r.step, null); end if;
    select * into r from public.rfis where id = p_rfi_id;
  end if;
  v_orig := r.created_by = auth.uid() and public.is_member(r.project_id);
  v_sign := public.has_capability(r.project_id, 'rfi.sign_issue');
  v_answer := public.has_capability(r.project_id, 'rfi.answer');

  -- The reviewers: the RFI's own copy once sent, else the job's route today.
  if exists (select 1 from public.rfi_steps where rfi_id = r.id) then
    select jsonb_agg(jsonb_build_object('position', st.position, 'label', st.label) order by st.position) into v_reviewers
      from public.rfi_steps st where st.rfi_id = r.id;
  else
    select coalesce(jsonb_agg(jsonb_build_object('position', rs.position, 'label', public.rfi_step_label(rs.role, rs.user_id))
                              order by rs.position), '[]'::jsonb) into v_reviewers
      from public.rfi_route_steps rs where rs.project_id = r.project_id;
  end if;
  v_n := jsonb_array_length(v_reviewers);
  v_cur := case r.status when 'draft' then 0 when 'review' then r.step when 'issue' then v_n + 1 when 'open' then v_n + 2
                         when 'answered' then v_n + 3 when 'closed' then v_n + 4 else r.step end;
  select jsonb_agg(jsonb_build_object(
           'position', n.pos, 'label', n.label,
           'state', case when n.pos < v_cur then 'done' when n.pos = v_cur and r.status <> 'void' then 'current' else 'next' end,
           'done_by_name', case when n.pos < v_cur and ev.actor is not null then public.rfi_person_name(ev.actor) end,
           'done_at', case when n.pos < v_cur then ev.at end) order by n.pos)
    into v_route
    from (select 0 as pos, 'Originator'::text as label, 'sent'::text as kind, null::int as at_step
          union all
          select (x ->> 'position')::int, x ->> 'label', 'forwarded', (x ->> 'position')::int
            from jsonb_array_elements(v_reviewers) x
          union all select v_n + 1, 'Issue (PM / PE)', 'issued', null
          union all select v_n + 2, 'Architect', 'answered', null
          union all select v_n + 3, 'Answered', 'closed', null) n
    left join lateral (select e.actor, e.at from public.rfi_events e
                        where e.rfi_id = r.id and e.kind = n.kind and (n.at_step is null or e.step = n.at_step)
                        order by e.id desc limit 1) ev on true;

  select coalesce(jsonb_agg(jsonb_build_object('at', e.at, 'kind', e.kind,
                                               'actor_name', case when e.actor is not null then public.rfi_person_name(e.actor) end,
                                               'note', e.note, 'step', e.step) order by e.id), '[]'::jsonb)
    into v_events from public.rfi_events e where e.rfi_id = r.id;
  select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'original_name', f.original_name, 'mime', f.mime) order by t.ord),
                  '[]'::jsonb)
    into v_photos from unnest(r.photo_ids) with ordinality as t (id, ord) join public.files f on f.id = t.id and f.deleted_at is null;
  select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'original_name', f.original_name, 'mime', f.mime) order by t.ord),
                  '[]'::jsonb)
    into v_files from unnest(r.answer_file_ids) with ordinality as t (id, ord)
    join public.files f on f.id = t.id and f.deleted_at is null;
  select * into s from public.rfi_settings where project_id = r.project_id;

  return jsonb_build_object(
    'rfi', to_jsonb(r),
    'originator_name', public.rfi_person_name(r.created_by),
    'originator_company', public.rfi_person_company(r.project_id, r.created_by),
    'issuer_name', case when r.issued_by is not null then public.rfi_person_name(r.issued_by) end,
    'answerer_name', case when r.answered_by is not null then public.rfi_person_name(r.answered_by) end,
    'holder_label', public.rfi_holder_label(r.id, r.status, r.step, r.created_by),
    'is_mine_to_act', v_holds,
    'can', jsonb_build_object(
      'edit', v_holds and r.status in ('draft', 'review', 'issue'),
      'send', v_orig and r.status = 'draft' and public.has_capability(r.project_id, 'rfi.create_draft'),
      'forward', v_holds and r.status = 'review',
      'send_back', v_holds and r.status in ('review', 'issue'),
      'issue', v_sign and r.status = 'issue',
      'answer', v_answer and r.status = 'open',
      'claim_impact', coalesce(v_orig and r.status in ('answered', 'closed') and r.impact_claimed_at is null
                               and now() <= r.impact_until, false),
      'close', r.status = 'answered' and (v_orig or v_sign),
      'void', r.status not in ('closed', 'void') and ((v_orig and r.status = 'draft') or v_sign),
      'gc_note', v_sign and r.impact_claimed_at is not null),
    'route', v_route,
    'events', v_events,
    'photos', v_photos,
    'answer_files', v_files,
    'settings', jsonb_build_object('answer_days', coalesce(s.answer_days, public.rfi_default_days()),
                                   'impact_days', coalesce(s.impact_days, public.rfi_default_days())));
end;
$$;

-- The top of the board, across all my jobs: RFIs I asked or may issue, held by someone else, that are late or that
-- nobody holding them has opened for two days. Late first, then the longest held.
create or replace function public.rfi_waiting()
returns table (
  id uuid, project_id uuid, project_name text, number int, title text, status text, holder_label text,
  held_since timestamptz, held_opened_at timestamptz, due_at timestamptz, reason text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select r.id, r.project_id, p.name, r.number, r.title, r.status,
         public.rfi_holder_label(r.id, r.status, r.step, r.created_by), r.held_since, r.held_opened_at, r.due_at, x.reason
    from public.rfis r
    join public.projects p on p.id = r.project_id and p.deleted_at is null
    cross join lateral (
      select case when r.status = 'open' and r.due_at < now() then 'late'
                  when r.held_opened_at is null and r.held_since < now() - interval '2 days' then 'unopened' end as reason) x
   where r.deleted_at is null
     and r.project_id in (select pm.project_id from public.project_members pm
                           where pm.user_id = auth.uid() and pm.status = 'active'
                             and (pm.access_ends_at is null or pm.access_ends_at > now()))
     and r.status in ('review', 'issue', 'open', 'answered')
     and (r.created_by = auth.uid() or public.has_capability(r.project_id, 'rfi.sign_issue'))
     and not public.rfi_holds(r.id, r.project_id, r.created_by, r.status, r.step)
     and x.reason is not null
   order by (x.reason = 'late') desc, r.held_since;
$$;

-- ---------------------------------------------------------------------------
-- Grants: the RPCs people call. Everything else above is internal.
-- ---------------------------------------------------------------------------
do $$
declare f text;
begin
  foreach f in array array[
    'public.rfi_create(uuid, text, text, uuid[], text, text, date, boolean, boolean, uuid)',
    'public.rfi_update(uuid, integer, text, text, uuid[], text, text, date, boolean, boolean)',
    'public.rfi_forward(uuid, integer, text)', 'public.rfi_send_back(uuid, integer, text)',
    'public.rfi_answer(uuid, integer, text, uuid[])', 'public.rfi_claim_impact(uuid, boolean, boolean, text)',
    'public.rfi_gc_note(uuid, text)', 'public.rfi_close(uuid, integer)', 'public.rfi_void(uuid, integer, text)',
    'public.rfi_save_settings(uuid, integer, integer, integer, jsonb)', 'public.rfi_settings_for(uuid)',
    -- Called by the rfis function with the caller's token; they refuse without a fresh sign-in.
    'public.rfi_sign_send(uuid, integer, text)', 'public.rfi_sign_issue(uuid, integer, text)',
    'public.rfi_folder(uuid)', 'public.rfi_list(uuid)', 'public.rfi_detail(uuid)', 'public.rfi_waiting()',
    'public.rfi_authorize_file(uuid, uuid)', 'public.set_org_logo(uuid, text)',
    -- Asked by the rfis select policy and the org-logos storage policies, as the caller.
    'public.rfi_may_see(uuid, uuid, uuid, text, integer)', 'public.org_logo_org(text)']
  loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
  foreach f in array array[
    'public.rfi_attach_pdf(uuid, uuid, text)', 'public.rfi_default_days()', 'public.rfi_label(integer)',
    'public.rfi_person_name(uuid)', 'public.rfi_role_label(text)', 'public.rfi_step_label(text, uuid)',
    'public.rfi_person_company(uuid, uuid)', 'public.rfi_active_member(uuid, uuid)',
    'public.rfi_users_with_cap(uuid, text)', 'public.rfi_users_with_role(uuid, text)',
    'public.rfi_on_route(uuid, uuid, integer)', 'public.rfi_step_holders(uuid, uuid, integer)',
    'public.rfi_holds(uuid, uuid, uuid, text, integer)', 'public.rfi_holder_ids(uuid)',
    'public.rfi_holder_label(uuid, text, integer, uuid)', 'public.rfi_step_count(uuid)', 'public.rfi_lock(uuid, integer)',
    'public.rfi_check_text(text, text, text, text)', 'public.rfi_files_ok(uuid, uuid[], uuid[])',
    'public.rfi_event(uuid, text, integer, text)', 'public.rfi_hand_over(uuid)', 'public.rfi_tell(uuid, text, text, uuid[])']
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
