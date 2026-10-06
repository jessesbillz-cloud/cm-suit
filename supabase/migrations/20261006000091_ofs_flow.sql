-- 0091 The OFS request flow (Jesse, Oct 5): fewer keystrokes for the request that goes to the fire marshal.
--   1. The sub attests. Every OFS request filed by someone who is not the inspector carries the attestation its filer saw
--      (who, when, the job's wording at that moment), stamped by the database at insert. The wording is a job setting
--      (projects.settings.ir_ofs_attest_text, empty = the standard wording below, the one default).
--   2. Checks in order, one tap each, recorded by the server (who, when): the GC's Ready (the GC step itself), the
--      inspector's Ready, the inspector's Special inspection report (when the request says a special inspection is
--      required, with the report file optionally linked). Each one is undone by the one who may do it (no dialog).
--   3. The chain (ir_ofs_chain) is what everyone who reads the request sees, the fire marshal included: attested,
--      GC ready, inspector ready, SI report, sent, with names and times.
--   4. The OFS IR number is the one number a person types (CLAUDE.md rule 7's exception): prefilled by the database
--      with the next number after the job's highest OFS number (requests and signed-off walls), editable by whoever
--      sends requests to OFS until the IR is signed, unique per job, saved with the version check.
--   5. Duties (project_duties): one person on the job at a time does a thing nobody else may do at once. The first duty
--      is ofs_requests. The owner or CM picks the company (duties.assign, default the GC), that company's admin picks
--      the person (duties.pick). The duty holder and the inspector send requests to OFS and type the OFS number.
-- Nothing is dropped. ir_send_ofs and ir_unsend_ofs keep their signatures. link_request_calendar answers the wording.

-- =====================================================================================================================
-- 1. Capabilities (data, rule 2)
-- =====================================================================================================================
insert into public.role_permissions (role, capability, requires_aal2) values
  ('owner_rep', 'duties.assign', false), ('project_admin', 'duties.assign', false), ('inspector_admin', 'duties.assign', false),
  ('project_admin', 'duties.pick', false), ('pm', 'duties.pick', false), ('inspector_admin', 'duties.pick', false)
on conflict do nothing;

-- =====================================================================================================================
-- 2. The request: attestation and checks
-- =====================================================================================================================
alter table public.inspection_requests
  add column ofs_attest_by uuid references auth.users(id),
  add column ofs_attest_at timestamptz,
  add column ofs_attest_text text check (ofs_attest_text is null or length(ofs_attest_text) between 1 and 1000),
  add column ofs_ready_by uuid references auth.users(id),
  add column ofs_ready_at timestamptz,
  add column ofs_si_by uuid references auth.users(id),
  add column ofs_si_at timestamptz,
  add column ofs_si_file_id uuid references public.files(id);

alter table public.inspection_requests
  add constraint inspection_requests_ofs_attest_check
    check ((ofs_attest_at is null) = (ofs_attest_text is null) and (ofs_attest_at is null or kind = 'ofs')
           and (ofs_attest_by is null or ofs_attest_at is not null)),
  add constraint inspection_requests_ofs_ready_check
    check ((ofs_ready_at is null) = (ofs_ready_by is null) and (ofs_ready_at is null or kind = 'ofs')),
  add constraint inspection_requests_ofs_si_check
    check ((ofs_si_at is null) = (ofs_si_by is null) and (ofs_si_at is null or special_required is true)
           and (ofs_si_file_id is null or ofs_si_at is not null));

-- The job's attestation wording: its own, or the standard one (the one default).
create or replace function public.ir_ofs_attest_wording(p_project_id uuid)
returns text
language sql
stable
set search_path = public, pg_temp
as $$
  select coalesce(
    (select left(nullif(btrim(p.settings ->> 'ir_ofs_attest_text'), ''), 1000) from public.projects p where p.id = p_project_id),
    'To the best of my knowledge, the work listed is complete and ready for inspection.');
$$;

-- The wording a member sees before sending an OFS request (and the settings box shows as its placeholder).
create or replace function public.ir_ofs_attest_text(p_project_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not public.is_member(p_project_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  return public.ir_ofs_attest_wording(p_project_id);
end;
$$;

-- =====================================================================================================================
-- 3. Duties: one person at a time
-- =====================================================================================================================
create table public.project_duties (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  version int not null default 1,
  deleted_at timestamptz,
  org_id uuid not null,
  project_id uuid not null,
  duty text not null check (duty in ('ofs_requests')),
  -- The company as the job's people list names it (people_display: the member's company, else their profile's).
  company text not null check (length(btrim(company)) between 1 and 200),
  person_id uuid references auth.users(id),
  set_by uuid not null references auth.users(id),
  set_at timestamptz not null default now(),
  foreign key (project_id, org_id) references public.projects (id, org_id),
  unique (project_id, duty)
);
alter table public.project_duties enable row level security;
create trigger touch before update on public.project_duties for each row execute function public.tg_touch_row();
create trigger no_delete before delete on public.project_duties for each row execute function public.tg_block_delete();
create trigger audit_row after insert or update on public.project_duties for each row execute function public.tg_audit_row();
create policy "project_duties: members read" on public.project_duties for select to authenticated
  using (public.is_member(project_id));
-- No insert/update policies: duty_set_company and duty_set_person write it.
revoke all on public.project_duties from public, anon, authenticated, service_role;
grant select on public.project_duties to authenticated, service_role;

-- A member's company as people_display names it.
create or replace function public.duty_member_company(p_project_id uuid, p_person uuid)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select nullif(btrim(coalesce(o.name, p.company, '')), '')
    from public.project_members pm
    left join public.profiles p on p.user_id = pm.user_id
    left join public.orgs o on o.id = pm.member_org_id
   where pm.project_id = p_project_id and pm.user_id = p_person and pm.status = 'active'
     and (pm.access_ends_at is null or pm.access_ends_at > now())
   order by pm.created_at
   limit 1;
$$;

-- The GC: the job's own company when it is a GC, else the company of the first active member who does the GC step.
create or replace function public.duty_default_company(p_project_id uuid)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select o.name from public.projects pr join public.orgs o on o.id = pr.org_id where pr.id = p_project_id and o.kind = 'gc'),
    (select public.duty_member_company(p_project_id, pm.user_id)
       from public.project_members pm
       join public.role_permissions rp on rp.role = pm.role and rp.capability = 'ir.gc_approve'
      where pm.project_id = p_project_id and pm.status = 'active' and pm.user_id is not null
        and (pm.access_ends_at is null or pm.access_ends_at > now())
        and public.duty_member_company(p_project_id, pm.user_id) is not null
      order by pm.created_at
      limit 1));
$$;

create or replace function public.duty_company(p_project_id uuid, p_duty text)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((select d.company from public.project_duties d where d.project_id = p_project_id and d.duty = p_duty),
                  public.duty_default_company(p_project_id));
$$;

-- Who holds the duty now: the person picked, while they are active on the job.
create or replace function public.duty_holder(p_project_id uuid, p_duty text)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select d.person_id from public.project_duties d
   where d.project_id = p_project_id and d.duty = p_duty and d.person_id is not null
     and exists (select 1 from public.project_members pm
                  where pm.project_id = d.project_id and pm.user_id = d.person_id and pm.status = 'active'
                    and (pm.access_ends_at is null or pm.access_ends_at > now()));
$$;

-- The companies on the job, as the people list names them.
create or replace function public.duty_companies(p_project_id uuid)
returns text[]
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(array_agg(distinct c order by c), '{}'::text[])
    from (select public.duty_member_company(p_project_id, pm.user_id) as c
            from public.project_members pm
           where pm.project_id = p_project_id and pm.status = 'active' and pm.user_id is not null) x
   where c is not null;
$$;

-- The caller picks the person: duties.pick, in the duty's company.
create or replace function public.duty_may_pick(p_project_id uuid, p_duty text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(public.has_capability(p_project_id, 'duties.pick')
                  and lower(public.duty_member_company(p_project_id, auth.uid())) = lower(public.duty_company(p_project_id, p_duty)),
                  false);
$$;

-- The job's duties for its people screen and the indicator: the company, the person, and what the caller may change.
create or replace function public.project_duties_view(p_project_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare v_assign boolean; v_pick boolean; v_company text; d public.project_duties; v_holder uuid;
begin
  if auth.uid() is null or not public.is_member(p_project_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into d from public.project_duties where project_id = p_project_id and duty = 'ofs_requests';
  v_company := public.duty_company(p_project_id, 'ofs_requests');
  v_holder := public.duty_holder(p_project_id, 'ofs_requests');
  v_assign := public.has_capability(p_project_id, 'duties.assign');
  v_pick := public.duty_may_pick(p_project_id, 'ofs_requests');
  return jsonb_build_array(jsonb_build_object(
    'duty', 'ofs_requests',
    'company', v_company,
    'person_id', v_holder,
    'person_name', (select coalesce(nullif(btrim(p.full_name), ''), split_part(p.email, '@', 1)) from public.profiles p where p.user_id = v_holder),
    'version', d.version,
    'can_assign', v_assign,
    'can_pick', v_pick,
    'companies', case when v_assign then to_jsonb(public.duty_companies(p_project_id)) else '[]'::jsonb end,
    'people', case when v_pick then coalesce((
      select jsonb_agg(jsonb_build_object('id', x.user_id, 'name', x.name) order by x.name)
        from (select distinct pm.user_id, coalesce(nullif(btrim(p.full_name), ''), split_part(p.email, '@', 1)) as name
                from public.project_members pm join public.profiles p on p.user_id = pm.user_id
               where pm.project_id = p_project_id and pm.status = 'active'
                 and (pm.access_ends_at is null or pm.access_ends_at > now())
                 and lower(public.duty_member_company(p_project_id, pm.user_id)) = lower(v_company)) x), '[]'::jsonb)
      else '[]'::jsonb end));
end;
$$;

-- The row for a change, locked, with the version check (no row yet: version null or 0).
create or replace function public.duty_lock(p_project_id uuid, p_duty text, p_version int)
returns public.project_duties
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare d public.project_duties;
begin
  perform pg_advisory_xact_lock(hashtext('duty:' || p_project_id::text || ':' || p_duty));
  select * into d from public.project_duties where project_id = p_project_id and duty = p_duty for update;
  if coalesce(d.version, 0) <> coalesce(p_version, 0) then
    raise exception 'version_conflict: expected %, found %', p_version, d.version using errcode = '40001';
  end if;
  return d;
end;
$$;

-- The owner or CM picks the company. A new company starts with nobody picked.
create or replace function public.duty_set_company(p_project_id uuid, p_duty text, p_company text, p_version int default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare d public.project_duties; v_company text := btrim(coalesce(p_company, '')); v_pick text;
begin
  if auth.uid() is null or not public.has_capability(p_project_id, 'duties.assign') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_duty is distinct from 'ofs_requests' then raise exception 'Unknown duty.' using errcode = '22023'; end if;
  select c into v_pick from unnest(public.duty_companies(p_project_id)) c where lower(c) = lower(v_company) limit 1;
  if v_pick is null then raise exception 'Pick a company on this job.' using errcode = '22023'; end if;
  d := public.duty_lock(p_project_id, p_duty, p_version);
  if d.id is null then
    insert into public.project_duties (org_id, project_id, duty, company, person_id, set_by, created_by)
    select pr.org_id, pr.id, p_duty, v_pick, null, auth.uid(), auth.uid() from public.projects pr where pr.id = p_project_id;
  elsif lower(d.company) <> lower(v_pick) then
    update public.project_duties set company = v_pick, person_id = null, set_by = auth.uid(), set_at = now() where id = d.id;
  end if;
  return public.project_duties_view(p_project_id);
end;
$$;

-- That company's admin picks the person (or nobody), and changes them.
create or replace function public.duty_set_person(p_project_id uuid, p_duty text, p_person_id uuid default null, p_version int default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare d public.project_duties; v_company text;
begin
  if auth.uid() is null or p_duty is distinct from 'ofs_requests' or not public.duty_may_pick(p_project_id, p_duty) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  v_company := public.duty_company(p_project_id, p_duty);
  if p_person_id is not null
     and lower(coalesce(public.duty_member_company(p_project_id, p_person_id), '')) <> lower(v_company) then
    raise exception 'Pick someone from %.', v_company using errcode = '22023';
  end if;
  d := public.duty_lock(p_project_id, p_duty, p_version);
  if d.id is null then
    insert into public.project_duties (org_id, project_id, duty, company, person_id, set_by, created_by)
    select pr.org_id, pr.id, p_duty, v_company, p_person_id, auth.uid(), auth.uid() from public.projects pr where pr.id = p_project_id;
  elsif d.person_id is distinct from p_person_id then
    update public.project_duties set person_id = p_person_id, set_by = auth.uid(), set_at = now() where id = d.id;
  end if;
  return public.project_duties_view(p_project_id);
end;
$$;

-- The caller sends OFS requests on this job: the inspector, or the duty holder.
create or replace function public.ir_ofs_sender(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(public.has_capability(p_project_id, 'ir.decide')
                  or (auth.uid() is not null and public.duty_holder(p_project_id, 'ofs_requests') = auth.uid()), false);
$$;

-- =====================================================================================================================
-- 4. Stamps at insert, checks cleared when a request goes back to the GC, the OFS number from the job's highest
-- =====================================================================================================================
create or replace function public.tg_ir_ofs_stamp()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_uid uuid := auth.uid();
begin
  if tg_op = 'INSERT' then
    if new.kind <> 'ofs' then return new; end if;
    if v_uid is not null and public.has_capability(new.project_id, 'ir.decide') then
      -- The inspector's own request: his one statement is his Ready.
      new.ofs_ready_by := v_uid;
      new.ofs_ready_at := now();
    else
      new.ofs_attest_by := new.requested_by;
      new.ofs_attest_at := now();
      new.ofs_attest_text := public.ir_ofs_attest_wording(new.project_id);
      -- Filed by the GC: past the GC step, and the filing is the GC's Ready.
      if v_uid is not null and public.has_capability(new.project_id, 'ir.gc_approve') and new.status = 'pending' then
        new.gc_by := v_uid;
        new.gc_at := now();
      end if;
    end if;
    return new;
  end if;
  -- Back to the GC (returned, or moved by its requester): the inspector checks it again.
  if new.kind = 'ofs' and new.status in ('gc_review', 'returned') and old.status not in ('gc_review', 'returned') then
    new.ofs_ready_by := null;
    new.ofs_ready_at := null;
    new.ofs_si_by := null;
    new.ofs_si_at := null;
    new.ofs_si_file_id := null;
  end if;
  return new;
end;
$$;
create trigger ir_ofs_stamp before insert or update on public.inspection_requests
  for each row execute function public.tg_ir_ofs_stamp();

-- The next OFS IR number: one after the job's highest (its requests, its walls signed off on paper IRs, and the old
-- counter, which a job's real numbering was set on before the app had its paper IRs).
create or replace function public.ir_ofs_next_number(p_project_id uuid)
returns int
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select least(999999, greatest(
    coalesce((select max(q.ofs_number) from public.inspection_requests q where q.project_id = p_project_id), 0),
    coalesce((select max(s.ofs_number) from public.rev_signoffs s where s.project_id = p_project_id and s.deleted_at is null), 0),
    coalesce((select c.next_value - 1 from public.project_counters c where c.project_id = p_project_id and c.kind = 'ofs_ir'), 0)) + 1);
$$;

-- 0056's trigger: the next number after the job's highest, not a counter (a typed number moves the next one on).
create or replace function public.tg_ir_ofs_number()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.kind = 'ofs' and new.ofs_number is null then
    perform pg_advisory_xact_lock(hashtext('ofs_number:' || new.project_id::text));
    new.ofs_number := public.ir_ofs_next_number(new.project_id);
  end if;
  return new;
end;
$$;

-- =====================================================================================================================
-- 5. The checks, one RPC: gc, ready, si (p_on false is Undo)
-- =====================================================================================================================
create or replace function public.ir_ofs_check(p_request_id uuid, p_version int, p_check text, p_on boolean,
                                               p_file_id uuid default null)
returns public.inspection_requests
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare r public.inspection_requests; v_on boolean := coalesce(p_on, false);
  v_untouched boolean;
begin
  if p_check is null or p_check not in ('gc', 'ready', 'si') then raise exception 'Unknown check.' using errcode = '22023'; end if;
  r := public.ir_for_update(p_request_id, p_version);
  if r.kind <> 'ofs' then raise exception 'Only an OFS request has these checks.' using errcode = '22023'; end if;
  v_untouched := r.status = 'pending' and r.owner_id is null and r.result is null
    and not exists (select 1 from public.ir_rev_items c where c.request_id = r.id and c.result is not null);

  if p_check = 'gc' then
    if not public.has_capability(r.project_id, 'ir.gc_approve') then raise exception 'forbidden' using errcode = '42501'; end if;
    if r.ofs_sent_at is not null then raise exception 'OFS has this one now.' using errcode = '22023'; end if;
    if v_on then
      if r.status not in ('gc_review', 'returned') then return r; end if;
      perform set_config('app.ir_action', 'gc_approve', true);
      update public.inspection_requests set status = 'pending', gc_by = auth.uid(), gc_at = now(), gc_note = null
       where id = r.id returning * into r;
      perform public.ir_tell_inspector(r, 'ir.requested',
        'IR ' || r.number || ' (OFS ' || r.ofs_number || ') requested · ' || r.company || ' · '
        || public.ir_when_label(r.request_date, r.start_time));
    else
      if r.status <> 'pending' or r.gc_at is null then return r; end if;
      if r.ofs_ready_at is not null then raise exception 'The inspector has checked it.' using errcode = '22023'; end if;
      perform set_config('app.ir_action', 'gc_undo', true);
      update public.inspection_requests set status = 'gc_review', gc_by = null, gc_at = null where id = r.id returning * into r;
    end if;
    return r;
  end if;

  if not public.has_capability(r.project_id, 'ir.decide') then raise exception 'forbidden' using errcode = '42501'; end if;
  if r.status in ('gc_review', 'returned', 'withdrawn') then
    raise exception 'This request is not with the inspector.' using errcode = '22023';
  end if;

  if p_check = 'ready' then
    if r.ofs_sent_at is not null then raise exception 'OFS has this one now.' using errcode = '22023'; end if;
    if not public.ir_owner_ok(r.project_id, r.owner_id, r.kind, r.ofs_sent_at) then
      raise exception 'forbidden' using errcode = '42501';
    end if;
    if v_on = (r.ofs_ready_at is not null) then return r; end if;
    if not v_on and r.ofs_si_at is not null then
      raise exception 'Undo the special inspection report first.' using errcode = '22023';
    end if;
    perform set_config('app.ir_action', case when v_on then 'ofs_ready' else 'ofs_ready_undo' end, true);
    update public.inspection_requests
       set ofs_ready_by = case when v_on then auth.uid() end, ofs_ready_at = case when v_on then now() end
     where id = r.id returning * into r;
    return r;
  end if;

  -- si: the inspector keeps the special inspector's report, so he checks it, before the send or until OFS acts.
  if r.special_required is not true then
    raise exception 'No special inspection on this request.' using errcode = '22023';
  end if;
  if r.ofs_sent_at is not null and not v_untouched then raise exception 'OFS has this one now.' using errcode = '22023'; end if;
  if v_on and r.ofs_ready_at is null and r.ofs_sent_at is null then
    raise exception 'Check Ready first.' using errcode = '22023';
  end if;
  if v_on and p_file_id is not null and not exists (
       select 1 from public.files f where f.id = p_file_id and f.project_id = r.project_id and f.deleted_at is null) then
    raise exception 'Pick a file from this job.' using errcode = '22023';
  end if;
  if not v_on and r.ofs_si_at is null then return r; end if;
  if v_on and r.ofs_si_at is not null and r.ofs_si_file_id is not distinct from coalesce(p_file_id, r.ofs_si_file_id) then
    return r;
  end if;
  perform set_config('app.ir_action', case when v_on then 'ofs_si' else 'ofs_si_undo' end, true);
  update public.inspection_requests
     set ofs_si_by = case when v_on then coalesce(case when r.ofs_si_at is not null then r.ofs_si_by end, auth.uid()) end,
         ofs_si_at = case when v_on then coalesce(r.ofs_si_at, now()) end,
         ofs_si_file_id = case when v_on then coalesce(p_file_id, r.ofs_si_file_id) end
   where id = r.id returning * into r;
  return r;
end;
$$;

-- =====================================================================================================================
-- 6. Send and Undo: the inspector, or the duty holder once the inspector has checked it
-- =====================================================================================================================
create or replace function public.ir_send_ofs(p_request_id uuid, p_version int)
returns public.inspection_requests
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare r public.inspection_requests; v_inspector boolean;
begin
  r := public.ir_for_update(p_request_id, p_version);
  v_inspector := public.has_capability(r.project_id, 'ir.decide');
  if not public.ir_ofs_sender(r.project_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  if r.kind <> 'ofs' then raise exception 'Only an OFS request goes to OFS.' using errcode = '22023'; end if;
  if r.ofs_sent_at is not null then return r; end if;
  if v_inspector and not public.ir_owner_ok(r.project_id, r.owner_id, r.kind, r.ofs_sent_at) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if r.status not in ('pending', 'postponed') then
    raise exception 'This request is not with the inspector.' using errcode = '22023';
  end if;
  -- The duty holder sends what the inspector has checked. The inspector's own send is his Ready.
  if not v_inspector then
    if r.ofs_ready_at is null then raise exception 'The inspector checks it first.' using errcode = '22023'; end if;
    if r.special_required and r.ofs_si_at is null then
      raise exception 'The inspector checks the special inspection report first.' using errcode = '22023';
    end if;
  end if;
  perform set_config('app.ir_action', 'send_ofs', true);
  update public.inspection_requests
     set ofs_sent_at = now(), ofs_sent_by = auth.uid(), status = 'pending', owner_id = null,
         postpone_reason = null, postpone_note = null, postpone_until = null, postponed_at = null,
         ofs_ready_by = coalesce(ofs_ready_by, auth.uid()), ofs_ready_at = coalesce(ofs_ready_at, now())
   where id = r.id
   returning * into r;
  perform public.ir_tell_ofs(r.id);
  perform public.ir_tell_requester(r, 'ir.ofs', 'IR ' || r.number || ' sent to OFS');
  return r;
end;
$$;

create or replace function public.ir_unsend_ofs(p_request_id uuid, p_version int)
returns public.inspection_requests
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare r public.inspection_requests;
begin
  r := public.ir_for_update(p_request_id, p_version);
  if not public.ir_ofs_sender(r.project_id) or r.ofs_sent_by is distinct from auth.uid() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if r.status <> 'pending' or r.owner_id is not null or r.result is not null
     or exists (select 1 from public.ir_rev_items c where c.request_id = r.id and c.result is not null) then
    raise exception 'OFS has this one now.' using errcode = '22023';
  end if;
  perform set_config('app.ir_action', 'unsend_ofs', true);
  update public.inspection_requests set ofs_sent_at = null, ofs_sent_by = null where id = r.id returning * into r;
  return r;
end;
$$;

-- =====================================================================================================================
-- 7. The OFS number: typed by whoever sends requests to OFS, until the IR is signed
-- =====================================================================================================================
create or replace function public.ir_ofs_number_set(p_request_id uuid, p_version int, p_number int)
returns public.inspection_requests
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare r public.inspection_requests;
begin
  r := public.ir_for_update(p_request_id, p_version);
  if not public.ir_ofs_sender(r.project_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  if r.kind <> 'ofs' then raise exception 'Only an OFS request has an OFS number.' using errcode = '22023'; end if;
  if r.signed_at is not null or r.status = 'withdrawn' then
    raise exception 'The OFS number is set.' using errcode = '22023';
  end if;
  if p_number is null or p_number not between 1 and 999999 then
    raise exception 'Type a number from 1 to 999999.' using errcode = '22023';
  end if;
  if r.ofs_number = p_number then return r; end if;
  if exists (select 1 from public.inspection_requests q where q.project_id = r.project_id and q.ofs_number = p_number) then
    raise exception 'OFS % is taken on this job.', p_number using errcode = '22023';
  end if;
  perform set_config('app.ir_action', 'ofs_number', true);
  update public.inspection_requests set ofs_number = p_number where id = r.id returning * into r;
  return r;
end;
$$;

-- =====================================================================================================================
-- 8. The chain: what everyone who reads the request sees, the fire marshal included
-- =====================================================================================================================
create or replace function public.ir_person_name(p_person uuid)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(nullif(btrim(p.full_name), ''), split_part(p.email, '@', 1)) from public.profiles p where p.user_id = p_person;
$$;

create or replace function public.ir_ofs_chain(p_request_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare r public.inspection_requests;
begin
  select * into r from public.inspection_requests where id = p_request_id and deleted_at is null;
  if r.id is null or auth.uid() is null or not public.ir_may_see(r.project_id, r.requested_by, r.kind, r.ofs_sent_at) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if r.kind <> 'ofs' then return null; end if;
  return jsonb_build_object(
    'attest', case when r.ofs_attest_at is not null then jsonb_build_object(
      'name', coalesce(public.ir_person_name(r.ofs_attest_by), r.requester_name), 'at', r.ofs_attest_at, 'text', r.ofs_attest_text) end,
    'gc', case when r.gc_at is not null and r.status not in ('gc_review', 'returned') then jsonb_build_object(
      'name', public.ir_person_name(r.gc_by), 'at', r.gc_at) end,
    'ready', case when r.ofs_ready_at is not null then jsonb_build_object(
      'name', public.ir_person_name(r.ofs_ready_by), 'at', r.ofs_ready_at) end,
    'si', case when r.ofs_si_at is not null then jsonb_build_object(
      'name', public.ir_person_name(r.ofs_si_by), 'at', r.ofs_si_at, 'file_id', r.ofs_si_file_id,
      'file_name', (select f.original_name from public.files f where f.id = r.ofs_si_file_id)) end,
    'sent', case when r.ofs_sent_at is not null then jsonb_build_object(
      'name', public.ir_person_name(r.ofs_sent_by), 'at', r.ofs_sent_at) end,
    'special_required', r.special_required,
    'next_number', public.ir_ofs_next_number(r.project_id));
end;
$$;

-- =====================================================================================================================
-- 9. The link's day answers the wording too (0055's body plus attest_text)
-- =====================================================================================================================
create or replace function public.link_request_calendar(p_project_id uuid, p_token_hash text, p_hub_id uuid default null,
                                                        p_day date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare pr public.projects; v_today date; v_day date;
begin
  if not public.is_service_role() then raise exception 'forbidden' using errcode = '42501'; end if;
  pr := public.request_link_job(p_project_id, p_token_hash, p_hub_id);
  if pr.id is null then return null; end if;
  v_today := (now() at time zone pr.timezone)::date;
  v_day := coalesce(p_day, v_today);
  if v_day < v_today or v_day > v_today + 365 then raise exception 'Pick today or a later day.' using errcode = '22023'; end if;
  return jsonb_build_object(
    'today', v_today,
    'day', v_day,
    'ofs', public.ir_setting(pr.id, 'ir_ofs_allowed'),
    'attest_text', public.ir_ofs_attest_wording(pr.id),
    'kinds', coalesce((select jsonb_agg(jsonb_build_object('id', k.id, 'name', k.name) order by k.sort, k.name)
                         from public.ir_special_kinds k where k.active), '[]'::jsonb),
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object('start_time', c.start_time, 'duration_kind', c.duration_kind,
                                          'duration_min', c.duration_min, 'kind', c.kind, 'status_key', c.status_key)
                       order by c.start_time nulls first, c.kind)
        from public.ir_calendar_rows(pr.id, v_day, v_day, null, false, false) c), '[]'::jsonb));
end;
$$;

-- =====================================================================================================================
-- Grants
-- =====================================================================================================================
do $$
declare f text;
begin
  foreach f in array array[
    'public.ir_ofs_attest_text(uuid)', 'public.project_duties_view(uuid)',
    'public.duty_set_company(uuid, text, text, integer)', 'public.duty_set_person(uuid, text, uuid, integer)',
    'public.ir_ofs_check(uuid, integer, text, boolean, uuid)', 'public.ir_ofs_number_set(uuid, integer, integer)',
    'public.ir_ofs_chain(uuid)']
  loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
  foreach f in array array[
    'public.ir_ofs_attest_wording(uuid)', 'public.duty_member_company(uuid, uuid)', 'public.duty_default_company(uuid)',
    'public.duty_company(uuid, text)', 'public.duty_holder(uuid, text)', 'public.duty_companies(uuid)',
    'public.duty_may_pick(uuid, text)', 'public.duty_lock(uuid, text, integer)', 'public.ir_ofs_sender(uuid)',
    'public.ir_ofs_next_number(uuid)', 'public.ir_person_name(uuid)', 'public.tg_ir_ofs_stamp()']
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
