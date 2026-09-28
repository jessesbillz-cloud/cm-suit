-- 0025 Deliveries (SPEC §13.3; MDR process doc §3). Jesse's MDR board, per job:
--   * Posting: members with deliveries.post in the app, or anyone holding the job's delivery link (SPEC §6.4 #3, the
--     public `delivery-board` function) with a typed name. Company: the job's list (member companies + names added
--     with "Other", most-used first); a new name joins the list for everyone.
--   * Overlaps are never refused. The post screen warns; a delivery that overlaps another is posted as Standby.
--     The database decides Standby (at post, and again when an edit moves the time).
--   * Receipt numbers come from next_number(project, 'delivery') (SPEC §5.3 kind), unique per job.
--   * Edits and deletes go through RPCs only, are version-checked and audited (audit_events; delivery_history reads
--     them back). Delete needs a typed name; Undo (restore_delivery) brings it back.
--   * The link: only sha256 of the token is stored (projects.delivery_token_hash). rotate_delivery_link returns the new
--     token once; the old link stops working at once. A rotation can be undone for 15 minutes by the person who made it.
--   * The public function's SQL surface (link_*) is service-role only and returns board fields only
--     (delivery_board_fields: number, day, start, duration, company, description, standby).
--   * Every delivery is mirrored onto the job calendar (calendar_mirror, source_type 'delivery').
--   * A board line (post_activity, audience deliveries.manage) goes up for every post. Push is not set up yet.

-- ---------------------------------------------------------------------------
-- Capabilities (data, SPEC §5.2). deliveries.manage (super, PM, project admin) exists since 0001.
-- ---------------------------------------------------------------------------
insert into public.role_permissions (role, capability, requires_aal2) values
  ('project_admin', 'deliveries.view', false), ('estimator', 'deliveries.view', false), ('pm', 'deliveries.view', false),
  ('pe', 'deliveries.view', false), ('superintendent', 'deliveries.view', false), ('foreman', 'deliveries.view', false),
  ('inspector', 'deliveries.view', false), ('special_inspector', 'deliveries.view', false), ('sub', 'deliveries.view', false),
  ('architect', 'deliveries.view', false), ('owner_rep', 'deliveries.view', false), ('viewer', 'deliveries.view', false),
  ('project_admin', 'deliveries.post', false), ('pm', 'deliveries.post', false), ('pe', 'deliveries.post', false),
  ('superintendent', 'deliveries.post', false), ('foreman', 'deliveries.post', false), ('sub', 'deliveries.post', false)
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- delivery_companies: the job's company list. Each name is stored once and linked from every delivery.
-- ---------------------------------------------------------------------------
create table public.delivery_companies (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  version int not null default 1,
  org_id uuid not null,
  project_id uuid not null,
  name text not null check (name = btrim(name) and length(name) between 1 and 120),
  foreign key (project_id, org_id) references public.projects (id, org_id),
  unique (id, project_id)
);
alter table public.delivery_companies enable row level security;
create trigger touch before update on public.delivery_companies for each row execute function public.tg_touch_row();
create trigger no_delete before delete on public.delivery_companies for each row execute function public.tg_block_delete();
create unique index delivery_companies_name on public.delivery_companies (project_id, lower(name));

revoke all on public.delivery_companies from anon, authenticated;
grant select on public.delivery_companies to authenticated;
create policy "delivery_companies: viewers read" on public.delivery_companies for select to authenticated
  using (public.has_capability(project_id, 'deliveries.view'));

-- ---------------------------------------------------------------------------
-- deliveries
-- delivery_date is the job's calendar day (grouping, TBD); starts_at is the UTC instant (null = time TBD).
-- ---------------------------------------------------------------------------
create table public.deliveries (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- The member who posted; null when posted through the delivery link (via_link).
  created_by uuid references auth.users(id),
  version int not null default 1,
  deleted_at timestamptz,
  org_id uuid not null,
  project_id uuid not null,
  number int not null check (number > 0),
  company_id uuid not null,
  delivery_date date not null,
  starts_at timestamptz,
  duration_min int not null default 60 check (duration_min between 5 and 720),
  description text not null check (length(btrim(description)) between 1 and 500),
  -- Photos / tickets: files in the job's "Delivery tickets" folder, attached by attach_delivery_file.
  file_ids uuid[] not null default '{}' check (cardinality(file_ids) <= 20),
  standby boolean not null default false,
  -- The name on the receipt: the member's name, or the name typed on the link.
  posted_name text not null check (length(btrim(posted_name)) between 1 and 120),
  via_link boolean not null default false,
  deleted_by uuid references auth.users(id),
  deleted_name text check (deleted_name is null or length(btrim(deleted_name)) between 1 and 120),
  foreign key (project_id, org_id) references public.projects (id, org_id),
  foreign key (company_id, project_id) references public.delivery_companies (id, project_id),
  unique (project_id, number),
  check ((deleted_at is null) = (deleted_name is null)),
  check (via_link = (created_by is null))
);
alter table public.deliveries enable row level security;
create trigger touch before update on public.deliveries for each row execute function public.tg_touch_row();
create trigger no_delete before delete on public.deliveries for each row execute function public.tg_block_delete();
create index deliveries_project_day on public.deliveries (project_id, delivery_date);
insert into public.owner_lookup (entity_type, table_name) values ('delivery', 'deliveries') on conflict do nothing;

revoke all on public.deliveries from anon, authenticated;
grant select on public.deliveries to authenticated;
-- Deleted rows stay readable to the same audience so Undo can bring them back; the data layer filters them out.
create policy "deliveries: viewers read" on public.deliveries for select to authenticated
  using (public.has_capability(project_id, 'deliveries.view'));
-- No insert/update policies: every write goes through the RPCs below.

-- ---------------------------------------------------------------------------
-- delivery_reviews: "I reviewed this month" (name, company, time), one per person per month.
-- ---------------------------------------------------------------------------
create table public.delivery_reviews (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id),
  org_id uuid not null,
  project_id uuid not null,
  month date not null check (month = date_trunc('month', month)::date),
  name text not null check (length(btrim(name)) between 1 and 120),
  company text not null default '' check (length(company) <= 120),
  foreign key (project_id, org_id) references public.projects (id, org_id),
  unique (project_id, month, created_by)
);
alter table public.delivery_reviews enable row level security;
create trigger no_delete before delete on public.delivery_reviews for each row execute function public.tg_block_delete();
revoke all on public.delivery_reviews from anon, authenticated;
grant select on public.delivery_reviews to authenticated;
create policy "delivery_reviews: managers read" on public.delivery_reviews for select to authenticated
  using (public.has_capability(project_id, 'deliveries.manage'));

-- ---------------------------------------------------------------------------
-- delivery_link_log: every rotation, so it can be undone for a short while. Read only by the functions below.
-- ---------------------------------------------------------------------------
create table public.delivery_link_log (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id),
  old_hash text,
  new_hash text not null,
  rotated_by uuid not null references auth.users(id),
  rotated_at timestamptz not null default now(),
  undone_at timestamptz
);
alter table public.delivery_link_log enable row level security;
create index delivery_link_log_project on public.delivery_link_log (project_id, rotated_at desc);
revoke all on public.delivery_link_log from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Internal helpers (not callable by people): overlap, company id, board fields, the one insert.
-- ---------------------------------------------------------------------------
create or replace function public.delivery_overlaps(p_project_id uuid, p_starts_at timestamptz, p_duration int, p_exclude uuid)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  -- Half-open ranges: 7:00-8:00 and 8:00-9:00 do not overlap. A TBD time overlaps nothing.
  select p_starts_at is not null and exists (
    select 1 from public.deliveries d
    where d.project_id = p_project_id and d.deleted_at is null and d.starts_at is not null
      and d.id is distinct from p_exclude
      and tstzrange(d.starts_at, d.starts_at + make_interval(mins => d.duration_min))
          && tstzrange(p_starts_at, p_starts_at + make_interval(mins => p_duration)));
$$;

-- The job's company list, most-used first: companies of members who post deliveries, plus names added with "Other".
create or replace function public.delivery_company_list(p_project_id uuid)
returns table (name text, uses int)
language sql
stable
set search_path = public, pg_temp
as $$
  with names as (
    select dc.name from public.delivery_companies dc where dc.project_id = p_project_id
    union
    select o.name
      from public.project_members pm
      join public.orgs o on o.id = pm.member_org_id and o.deleted_at is null
     where pm.project_id = p_project_id and pm.status = 'active'
       and (pm.access_ends_at is null or pm.access_ends_at > now())
       and exists (select 1 from public.role_permissions rp where rp.role = pm.role and rp.capability = 'deliveries.post')
  ), one as (
    select distinct on (lower(n.name)) n.name from names n order by lower(n.name), n.name
  )
  select one.name,
         (select count(*) from public.deliveries d join public.delivery_companies c on c.id = d.company_id
           where d.project_id = p_project_id and d.deleted_at is null and lower(c.name) = lower(one.name))::int
    from one
   order by 2 desc, lower(one.name);
$$;

-- The company's id on this job, adding the name to the job's list when it is new ("Other").
create or replace function public.delivery_company_id(p_project_id uuid, p_org_id uuid, p_name text)
returns uuid
language plpgsql
set search_path = public, pg_temp
as $$
declare v_id uuid;
begin
  select id into v_id from public.delivery_companies where project_id = p_project_id and lower(name) = lower(p_name);
  if v_id is null then
    insert into public.delivery_companies (org_id, project_id, name, created_by)
    values (p_org_id, p_project_id, p_name, auth.uid())
    on conflict (project_id, lower(name)) do nothing
    returning id into v_id;
    if v_id is null then
      select id into v_id from public.delivery_companies where project_id = p_project_id and lower(name) = lower(p_name);
    end if;
  end if;
  return v_id;
end;
$$;

-- THE public shape of a delivery (SPEC §13.3: the link sees board fields only). No ids, names of posters, files.
create or replace function public.delivery_board_fields(d public.deliveries, p_company text)
returns jsonb
language sql
immutable
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'number', d.number, 'delivery_date', d.delivery_date, 'starts_at', d.starts_at, 'duration_min', d.duration_min,
    'company', p_company, 'description', d.description, 'standby', d.standby);
$$;

create or replace function public.delivery_clean(p_text text, p_max int)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select left(regexp_replace(btrim(coalesce(p_text, '')), '\s+', ' ', 'g'), p_max);
$$;

-- The one insert, for members (post_delivery) and the link (link_post_delivery). Serialized per job, so the overlap
-- check and the repeat guard see every earlier post. A repeat of the same post within 2 minutes returns the first.
create or replace function public.delivery_insert(
  p_project_id uuid, p_company text, p_date date, p_time time, p_duration int, p_description text,
  p_posted_name text, p_via_link boolean
)
returns public.deliveries
language plpgsql
set search_path = public, pg_temp
as $$
declare
  pr public.projects;
  v_company text := public.delivery_clean(p_company, 200);
  v_desc text := btrim(coalesce(p_description, ''));
  v_name text := public.delivery_clean(p_posted_name, 200);
  v_start timestamptz;
  v_row public.deliveries;
  v_summary text;
begin
  select * into pr from public.projects where id = p_project_id and deleted_at is null;
  if pr.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not ('deliveries' = any (pr.modules)) then
    raise exception 'Deliveries are off for this job.' using errcode = '42501';
  end if;
  if length(v_company) not between 1 and 120 then raise exception 'Company is required (120 characters at most).' using errcode = '22023'; end if;
  if length(v_desc) not between 1 and 500 then raise exception 'Description is required (500 characters at most).' using errcode = '22023'; end if;
  if length(v_name) not between 1 and 120 then raise exception 'Name is required (120 characters at most).' using errcode = '22023'; end if;
  if p_duration is null or p_duration not between 5 and 720 then raise exception 'Duration must be 5 minutes to 12 hours.' using errcode = '22023'; end if;
  if p_date is null or p_date not between (now() at time zone pr.timezone)::date - 400 and (now() at time zone pr.timezone)::date + 400 then
    raise exception 'Pick a date within a year.' using errcode = '22023';
  end if;
  v_start := case when p_time is null then null else (p_date + p_time) at time zone pr.timezone end;

  perform pg_advisory_xact_lock(hashtext('delivery_post:' || p_project_id::text));
  select d.* into v_row
    from public.deliveries d join public.delivery_companies c on c.id = d.company_id
   where d.project_id = p_project_id and d.deleted_at is null and d.created_at > now() - interval '2 minutes'
     and d.created_by is not distinct from auth.uid() and d.posted_name = v_name and d.via_link = p_via_link
     and d.delivery_date = p_date and d.starts_at is not distinct from v_start and d.duration_min = p_duration
     and d.description = v_desc and lower(c.name) = lower(v_company)
   order by d.created_at desc limit 1;
  if v_row.id is not null then return v_row; end if;

  insert into public.deliveries (org_id, project_id, number, company_id, delivery_date, starts_at, duration_min, description,
                                 standby, posted_name, via_link, created_by)
  values (pr.org_id, pr.id, public.next_number(pr.id, 'delivery'), public.delivery_company_id(pr.id, pr.org_id, v_company),
          p_date, v_start, p_duration, v_desc, public.delivery_overlaps(pr.id, v_start, p_duration, null), v_name,
          p_via_link, case when p_via_link then null else auth.uid() end)
  returning * into v_row;

  perform public.audit('delivery.create', 'delivery', v_row.id, pr.id, pr.org_id,
    jsonb_build_object('number', v_row.number, 'company', v_company, 'date', p_date, 'time', p_time, 'duration_min', p_duration,
                       'standby', v_row.standby, 'name', v_name, 'via_link', p_via_link),
    null, case when p_via_link then 'public_link' else 'user' end);
  v_summary := 'Delivery #' || v_row.number || ': ' || v_company || ', ' || to_char(p_date, 'Dy Mon FMDD')
               || coalesce(' ' || to_char(p_date + p_time, 'FMHH12:MI AM'), ' time TBD')
               || case when v_row.standby then ' (Standby)' else '' end;
  perform public.post_activity(pr.id, 'delivery.posted', left(v_summary, 500), 'delivery', v_row.id, 'deliveries.manage');
  return v_row;
end;
$$;

-- The link's job: a matching token hash on a live job with deliveries on. Null otherwise.
create or replace function public.delivery_link_project(p_project_id uuid, p_token_hash text)
returns public.projects
language sql
stable
set search_path = public, pg_temp
as $$
  select p.* from public.projects p
   where p.id = p_project_id and p.deleted_at is null and p.delivery_token_hash is not null
     and p.delivery_token_hash = p_token_hash and 'deliveries' = any (p.modules);
$$;

-- ---------------------------------------------------------------------------
-- Member RPCs (SECURITY DEFINER, caller from auth.uid()).
-- ---------------------------------------------------------------------------
-- p_time last with a default: leaving it out means "time TBD".
create or replace function public.post_delivery(
  p_project_id uuid, p_company text, p_date date, p_duration int, p_description text, p_time time default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_name text; v_row public.deliveries;
begin
  if not public.has_capability(p_project_id, 'deliveries.post') then raise exception 'forbidden' using errcode = '42501'; end if;
  select coalesce(nullif(btrim(p.full_name), ''), split_part(p.email, '@', 1)) into v_name
    from public.profiles p where p.user_id = auth.uid();
  v_row := public.delivery_insert(p_project_id, p_company, p_date, p_time, p_duration, p_description, v_name, false);
  return v_row.id;
end;
$$;

-- May the caller change this delivery? Its poster (still able to post) or deliveries.manage.
create or replace function public.delivery_can_change(d public.deliveries)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select public.has_capability(d.project_id, 'deliveries.manage')
      or (d.created_by = auth.uid() and public.has_capability(d.project_id, 'deliveries.post'));
$$;

create or replace function public.update_delivery(
  p_id uuid, p_version int, p_company text, p_date date, p_duration int, p_description text, p_time time default null
)
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  d public.deliveries; pr public.projects; v_old_company text;
  v_company text := public.delivery_clean(p_company, 200);
  v_desc text := btrim(coalesce(p_description, ''));
  v_start timestamptz; v_company_id uuid; v_changes jsonb := '{}'::jsonb; v_standby boolean; v_version int;
begin
  select * into d from public.deliveries where id = p_id for update;
  if d.id is null or d.deleted_at is not null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not public.delivery_can_change(d) then raise exception 'forbidden' using errcode = '42501'; end if;
  if d.version <> p_version then
    raise exception 'version_conflict: expected %, found %', p_version, d.version using errcode = '40001';
  end if;
  if length(v_company) not between 1 and 120 then raise exception 'Company is required (120 characters at most).' using errcode = '22023'; end if;
  if length(v_desc) not between 1 and 500 then raise exception 'Description is required (500 characters at most).' using errcode = '22023'; end if;
  if p_duration is null or p_duration not between 5 and 720 then raise exception 'Duration must be 5 minutes to 12 hours.' using errcode = '22023'; end if;
  if p_date is null then raise exception 'Date is required.' using errcode = '22023'; end if;
  select * into pr from public.projects where id = d.project_id;
  v_start := case when p_time is null then null else (p_date + p_time) at time zone pr.timezone end;
  select name into v_old_company from public.delivery_companies where id = d.company_id;

  if lower(v_old_company) <> lower(v_company) then
    v_company_id := public.delivery_company_id(d.project_id, d.org_id, v_company);
    v_changes := v_changes || jsonb_build_object('company', jsonb_build_array(v_old_company, v_company));
  else
    v_company_id := d.company_id;
  end if;
  if d.delivery_date <> p_date then
    v_changes := v_changes || jsonb_build_object('date', jsonb_build_array(d.delivery_date, p_date));
  end if;
  if d.starts_at is distinct from v_start then
    v_changes := v_changes || jsonb_build_object('time', jsonb_build_array(
      to_char(d.starts_at at time zone pr.timezone, 'HH24:MI'), to_char(p_date + p_time, 'HH24:MI')));
  end if;
  if d.duration_min <> p_duration then
    v_changes := v_changes || jsonb_build_object('duration_min', jsonb_build_array(d.duration_min, p_duration));
  end if;
  if d.description <> v_desc then
    v_changes := v_changes || jsonb_build_object('description', jsonb_build_array(d.description, v_desc));
  end if;
  if v_changes = '{}'::jsonb then return d.version; end if;

  perform pg_advisory_xact_lock(hashtext('delivery_post:' || d.project_id::text));
  v_standby := case when v_changes ?| array['date', 'time', 'duration_min']
                    then public.delivery_overlaps(d.project_id, v_start, p_duration, d.id) else d.standby end;
  if v_standby <> d.standby then
    v_changes := v_changes || jsonb_build_object('standby', jsonb_build_array(d.standby, v_standby));
  end if;
  update public.deliveries
     set company_id = v_company_id, delivery_date = p_date, starts_at = v_start, duration_min = p_duration,
         description = v_desc, standby = v_standby
   where id = d.id
  returning version into v_version;
  perform public.audit('delivery.update', 'delivery', d.id, d.project_id, d.org_id,
    jsonb_build_object('number', d.number, 'changes', v_changes));
  return v_version;
end;
$$;

-- Delete needs a typed name (MDR), is logged, and can be undone (restore_delivery).
create or replace function public.delete_delivery(p_id uuid, p_version int, p_name text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare d public.deliveries; v_name text := public.delivery_clean(p_name, 200);
begin
  select * into d from public.deliveries where id = p_id for update;
  if d.id is null or d.deleted_at is not null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not public.delivery_can_change(d) then raise exception 'forbidden' using errcode = '42501'; end if;
  if length(v_name) not between 1 and 120 then raise exception 'Type your name to delete.' using errcode = '22023'; end if;
  if d.version <> p_version then
    raise exception 'version_conflict: expected %, found %', p_version, d.version using errcode = '40001';
  end if;
  update public.deliveries set deleted_at = now(), deleted_by = auth.uid(), deleted_name = v_name where id = d.id;
  perform public.audit('delivery.delete', 'delivery', d.id, d.project_id, d.org_id,
    jsonb_build_object('number', d.number, 'name', v_name));
end;
$$;

create or replace function public.restore_delivery(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare d public.deliveries;
begin
  select * into d from public.deliveries where id = p_id for update;
  if d.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not public.delivery_can_change(d) then raise exception 'forbidden' using errcode = '42501'; end if;
  if d.deleted_at is null then return; end if;  -- already back: safe to repeat
  update public.deliveries set deleted_at = null, deleted_by = null, deleted_name = null where id = d.id;
  perform public.audit('delivery.restore', 'delivery', d.id, d.project_id, d.org_id, jsonb_build_object('number', d.number));
end;
$$;

-- The job's "Delivery tickets" folder: readable with deliveries.view, writable with deliveries.post. Made on first use.
create or replace function public.delivery_folder(p_project_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_id uuid; v_org uuid;
begin
  if not public.has_capability(p_project_id, 'deliveries.post') then raise exception 'forbidden' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtext('delivery_folder:' || p_project_id::text));
  select id into v_id from public.folders
   where project_id = p_project_id and parent_id is null and name = 'Delivery tickets' and deleted_at is null;
  if v_id is not null then return v_id; end if;
  select org_id into v_org from public.projects where id = p_project_id;
  insert into public.folders (org_id, project_id, name, kind, created_by)
  values (v_org, p_project_id, 'Delivery tickets', 'photos', auth.uid())
  returning id into v_id;
  insert into public.folder_access (folder_id, capability, can_read, can_write, created_by) values
    (v_id, 'deliveries.view', true, false, auth.uid()),
    (v_id, 'deliveries.post', true, true, auth.uid());
  return v_id;
end;
$$;

-- A photo or ticket, uploaded by the caller into the job's Delivery tickets folder, attached to the delivery.
create or replace function public.attach_delivery_file(p_delivery_id uuid, p_file_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare d public.deliveries; f public.files;
begin
  select * into d from public.deliveries where id = p_delivery_id for update;
  if d.id is null or d.deleted_at is not null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not public.delivery_can_change(d) then raise exception 'forbidden' using errcode = '42501'; end if;
  select fi.* into f from public.files fi join public.folders fo on fo.id = fi.folder_id
   where fi.id = p_file_id and fi.project_id = d.project_id and fi.created_by = auth.uid() and fi.deleted_at is null
     and fo.parent_id is null and fo.name = 'Delivery tickets' and fo.deleted_at is null;
  if f.id is null then raise exception 'file not found or not yours' using errcode = 'P0002'; end if;
  if f.id = any (d.file_ids) then return; end if;  -- safe to repeat
  update public.deliveries set file_ids = file_ids || f.id where id = d.id;
  perform public.audit('delivery.attach', 'delivery', d.id, d.project_id, d.org_id,
    jsonb_build_object('number', d.number, 'file', f.original_name), f.sha256);
end;
$$;

create or replace function public.delivery_company_options(p_project_id uuid)
returns table (name text, uses int)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.has_capability(p_project_id, 'deliveries.view') then raise exception 'forbidden' using errcode = '42501'; end if;
  return query select l.name, l.uses from public.delivery_company_list(p_project_id) l;
end;
$$;

-- Edit history, from the audit log: when, what, who (member name or the name typed on the link), details.
create or replace function public.delivery_history(p_delivery_id uuid)
returns table (at timestamptz, action text, actor_name text, details jsonb)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare pid uuid;
begin
  select project_id into pid from public.deliveries where id = p_delivery_id;
  if pid is null or not public.has_capability(pid, 'deliveries.view') then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
    select a.occurred_at, a.action,
           coalesce(case when a.actor_kind = 'public_link' then a.details->>'name' end,
                    nullif(btrim(p.full_name), ''), nullif(split_part(p.email, '@', 1), ''), a.details->>'name', 'System'),
           a.details
      from public.audit_events a
      left join public.profiles p on p.user_id = a.actor_user_id
     where a.entity_type = 'delivery' and a.entity_id = p_delivery_id and a.project_id = pid
     order by a.occurred_at, a.id;
end;
$$;

create or replace function public.review_delivery_month(p_project_id uuid, p_month date, p_name text, p_company text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_org uuid; v_name text := public.delivery_clean(p_name, 200); v_company text := public.delivery_clean(p_company, 200);
        v_month date := date_trunc('month', p_month)::date; v_id uuid;
begin
  if not public.has_capability(p_project_id, 'deliveries.manage') then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_month is null then raise exception 'Month is required.' using errcode = '22023'; end if;
  if length(v_name) not between 1 and 120 then raise exception 'Name is required.' using errcode = '22023'; end if;
  if length(v_company) > 120 then raise exception 'Company is too long.' using errcode = '22023'; end if;
  select org_id into v_org from public.projects where id = p_project_id;
  insert into public.delivery_reviews (org_id, project_id, month, name, company, created_by)
  values (v_org, p_project_id, v_month, v_name, v_company, auth.uid())
  on conflict (project_id, month, created_by) do nothing
  returning id into v_id;
  if v_id is not null then
    perform public.audit('delivery.review_month', 'delivery_review', v_id, p_project_id, v_org,
      jsonb_build_object('month', v_month, 'name', v_name, 'company', v_company));
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- The delivery link: rotate (returns the raw token once), undo a rotation, state.
-- ---------------------------------------------------------------------------
create or replace function public.rotate_delivery_link(p_project_id uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_token text; v_hash text; v_old text;
begin
  if not public.has_capability(p_project_id, 'deliveries.manage') then raise exception 'forbidden' using errcode = '42501'; end if;
  -- 32 random bytes as base64url (43 characters), the same shape as access-link tokens.
  v_token := translate(rtrim(encode(extensions.gen_random_bytes(32), 'base64'), '='), '+/', '-_');
  v_hash := encode(extensions.digest(v_token, 'sha256'), 'hex');
  select delivery_token_hash into v_old from public.projects where id = p_project_id and deleted_at is null for update;
  update public.projects set delivery_token_hash = v_hash where id = p_project_id;
  insert into public.delivery_link_log (project_id, old_hash, new_hash, rotated_by, rotated_at)
  values (p_project_id, v_old, v_hash, auth.uid(), clock_timestamp());
  perform public.audit('delivery_link.rotate', 'project', p_project_id, p_project_id, null,
    jsonb_build_object('replaced', v_old is not null));
  return v_token;
end;
$$;

create or replace function public.undo_delivery_link_rotation(p_project_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare l public.delivery_link_log;
begin
  if not public.has_capability(p_project_id, 'deliveries.manage') then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into l from public.delivery_link_log
   where project_id = p_project_id and rotated_by = auth.uid() and undone_at is null and rotated_at > now() - interval '15 minutes'
   order by rotated_at desc limit 1
   for update;
  if l.id is null then raise exception 'Nothing to undo.' using errcode = 'P0002'; end if;
  update public.projects set delivery_token_hash = l.old_hash where id = p_project_id and delivery_token_hash = l.new_hash;
  if not found then raise exception 'The link changed again since.' using errcode = '40001'; end if;
  update public.delivery_link_log set undone_at = now() where id = l.id;
  perform public.audit('delivery_link.undo', 'project', p_project_id, p_project_id, null, '{}'::jsonb);
end;
$$;

create or replace function public.delivery_link_state(p_project_id uuid)
returns table (active boolean, since timestamptz)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.has_capability(p_project_id, 'deliveries.manage') then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
    select p.delivery_token_hash is not null,
           (select max(l.rotated_at) from public.delivery_link_log l where l.project_id = p.id and l.undone_at is null)
      from public.projects p where p.id = p_project_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- The public function's SQL surface (service role only; the function checks the rate limits first).
-- Each answers null when the token does not open this job's board.
-- ---------------------------------------------------------------------------
create or replace function public.link_delivery_board(p_project_id uuid, p_token_hash text, p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare pr public.projects;
begin
  if not public.is_service_role() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 62 then
    raise exception 'Pick a range of 62 days at most.' using errcode = '22023';
  end if;
  pr := public.delivery_link_project(p_project_id, p_token_hash);
  if pr.id is null then return null; end if;
  return jsonb_build_object(
    'project_name', pr.name,
    'timezone', pr.timezone,
    'companies', coalesce((select jsonb_agg(l.name order by l.uses desc, lower(l.name)) from public.delivery_company_list(pr.id) l), '[]'::jsonb),
    'deliveries', coalesce((
      select jsonb_agg(public.delivery_board_fields(d, c.name) order by d.delivery_date, d.starts_at nulls last, d.number)
        from public.deliveries d join public.delivery_companies c on c.id = d.company_id
       where d.project_id = pr.id and d.deleted_at is null and d.delivery_date between p_from and p_to), '[]'::jsonb));
end;
$$;

-- The receipt shape: board fields plus the receipt's own id (to fetch it again), the typed name and the post time.
create or replace function public.link_post_delivery(
  p_project_id uuid, p_token_hash text, p_name text, p_company text, p_date date, p_duration int, p_description text,
  p_time time default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare pr public.projects; v_row public.deliveries; v_company text;
begin
  if not public.is_service_role() then raise exception 'forbidden' using errcode = '42501'; end if;
  pr := public.delivery_link_project(p_project_id, p_token_hash);
  if pr.id is null then return null; end if;
  v_row := public.delivery_insert(pr.id, p_company, p_date, p_time, p_duration, p_description, p_name, true);
  select name into v_company from public.delivery_companies where id = v_row.company_id;
  return public.delivery_board_fields(v_row, v_company)
         || jsonb_build_object('id', v_row.id, 'posted_name', v_row.posted_name, 'posted_at', v_row.created_at);
end;
$$;

-- A receipt again, only for a delivery posted through the link (members' names never leave the app).
create or replace function public.link_delivery_receipt(p_project_id uuid, p_token_hash text, p_delivery_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare pr public.projects; r jsonb;
begin
  if not public.is_service_role() then raise exception 'forbidden' using errcode = '42501'; end if;
  pr := public.delivery_link_project(p_project_id, p_token_hash);
  if pr.id is null then return null; end if;
  select public.delivery_board_fields(d, c.name)
         || jsonb_build_object('id', d.id, 'posted_name', d.posted_name, 'posted_at', d.created_at)
    into r
    from public.deliveries d join public.delivery_companies c on c.id = d.company_id
   where d.id = p_delivery_id and d.project_id = pr.id and d.via_link and d.deleted_at is null;
  return r;
end;
$$;

-- ---------------------------------------------------------------------------
-- Calendar: every delivery is a line on the job calendar; deleted ones come off, restored ones go back.
-- ---------------------------------------------------------------------------
create or replace function public.tg_delivery_calendar()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_company text; v_tz text;
begin
  if new.deleted_at is not null then
    perform public.calendar_unmirror('delivery', new.id);
    return null;
  end if;
  select name into v_company from public.delivery_companies where id = new.company_id;
  select timezone into v_tz from public.projects where id = new.project_id;
  perform public.calendar_mirror(
    'delivery', new.id, new.project_id, 'deliveries',
    v_company || ': ' || new.description,
    coalesce(new.starts_at, new.delivery_date::timestamp at time zone v_tz),
    case when new.starts_at is null then null else new.starts_at + make_interval(mins => new.duration_min) end,
    new.starts_at is null,
    case when new.standby then 'pending' else 'confirmed' end,
    'deliveries.view');
  return null;
end;
$$;
create trigger calendar_mirror after insert or update on public.deliveries
  for each row execute function public.tg_delivery_calendar();

-- ---------------------------------------------------------------------------
-- Grants (SPEC §6.2): nothing for public/anon; people call the member RPCs; the link RPCs are service-role only;
-- helpers and the trigger are internal.
-- ---------------------------------------------------------------------------
revoke execute on function
  public.delivery_overlaps(uuid, timestamptz, int, uuid),
  public.delivery_company_list(uuid),
  public.delivery_company_id(uuid, uuid, text),
  public.delivery_board_fields(public.deliveries, text),
  public.delivery_clean(text, int),
  public.delivery_insert(uuid, text, date, time, int, text, text, boolean),
  public.delivery_link_project(uuid, text),
  public.delivery_can_change(public.deliveries),
  public.post_delivery(uuid, text, date, int, text, time),
  public.update_delivery(uuid, int, text, date, int, text, time),
  public.delete_delivery(uuid, int, text),
  public.restore_delivery(uuid),
  public.delivery_folder(uuid),
  public.attach_delivery_file(uuid, uuid),
  public.delivery_company_options(uuid),
  public.delivery_history(uuid),
  public.review_delivery_month(uuid, date, text, text),
  public.rotate_delivery_link(uuid),
  public.undo_delivery_link_rotation(uuid),
  public.delivery_link_state(uuid),
  public.link_delivery_board(uuid, text, date, date),
  public.link_post_delivery(uuid, text, text, text, date, int, text, time),
  public.link_delivery_receipt(uuid, text, uuid),
  public.tg_delivery_calendar()
from public, anon, authenticated;

grant execute on function
  public.post_delivery(uuid, text, date, int, text, time),
  public.update_delivery(uuid, int, text, date, int, text, time),
  public.delete_delivery(uuid, int, text),
  public.restore_delivery(uuid),
  public.delivery_folder(uuid),
  public.attach_delivery_file(uuid, uuid),
  public.delivery_company_options(uuid),
  public.delivery_history(uuid),
  public.review_delivery_month(uuid, date, text, text),
  public.rotate_delivery_link(uuid),
  public.undo_delivery_link_rotation(uuid),
  public.delivery_link_state(uuid)
to authenticated, service_role;

grant execute on function
  public.link_delivery_board(uuid, text, date, date),
  public.link_post_delivery(uuid, text, text, text, date, int, text, time),
  public.link_delivery_receipt(uuid, text, uuid)
to service_role;
