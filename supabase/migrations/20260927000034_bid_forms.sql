-- 0034 Required bid forms (SPEC §11.1 "compliance checklist per job type"). Jesse, Sep 28: "There's got to be a lot
-- more in the bids package than just the sub stuff: all kinds of forms, and the proposals."
--   * bid_form_templates: the forms a job may need, as data. org_id null = a default every company uses; an org's own
--     rows apply to its jobs only. Conditions are plain columns, null = any: if_prevailing_wage, if_dsa, if_job_types
--     (matched to projects.job_type, ignoring case). Written only by migrations for now. The seed below is a draft for
--     Matt and Jesse to confirm (SPEC §16 Q3).
--   * bid_form_items: one job's checklist. Status to_do / done / n_a, one attached file (a file in the job the caller
--     can open), an optional due day (project calendar, "my due" line for bids managers), a note. Saves carry a version
--     check (tg_touch_row bumps it). Nobody hard-deletes; Remove sets deleted_at.
--   * Who: bids.manage reads and writes a job's items. Nobody else, bidders never.
--   * open_bid_forms(project) -> the job's "Bid forms" folder id. bids.manage only. Makes the folder once (read and
--     write: bids.manage only, so the filled bid form with the GC's price stays with the people who price the job),
--     then adds every template that applies and isn't on the job yet. A removed item never comes back (unique per
--     template, deleted rows included). Safe to repeat: the app calls it whenever a manager opens the job's Bids tool
--     (the Forms list and its tab count read through it), so turning prevailing wage or DSA on adds the new forms.
--   * "Bid forms" becomes a system folder name at the top of a job (0030's rule), so nobody can take the name first.
--
-- Sources for the seed (checked Sep 28, 2026):
--   Public Contract Code §4104 (listing subs over 1/2 of 1% of the bid: name, place of business, CSLB and DIR numbers,
--     portion of work)                       https://california.public.law/codes/public_contract_code_section_4104
--   PCC §7106 ("Every bid on every public works contract of a public entity shall include" the noncollusion declaration)
--                                          https://law.justia.com/codes/california/code-pcc/division-2/part-1/chapter-7/section-7106/
--   Labor Code §1725.5 and §1771.1(a),(b),(n) (registered with DIR to bid, be listed or work; proof before a bid is
--     accepted; $25,000 / $15,000 exemptions)  https://california.public.law/codes/labor_code_section_1725.5
--                                            https://california.public.law/codes/labor_code_section_1771.1
--                                            https://www.dir.ca.gov/public-works/PublicWorksSB854.html
--   PCC §2204(a) (Iran Contracting Act certification with a bid of $1,000,000 or more to a public entity)
--                                          https://law.justia.com/codes/california/2016/code-pcc/division-2/part-1/chapter-2.7/section-2204
--   PCC §20111(b) (school district bid security: cash, cashier's or certified check, or bidder's bond)
--                                          https://california.public.law/codes/public_contract_code_section_20111
--   PCC §10167 (state jobs: bidder's security of at least 10 percent of the bid)
--                                          https://law.justia.com/codes/california/code-pcc/division-2/part-2/chapter-1/article-4/section-10167/
--   PCC §20111.6 (school districts, $1,000,000+ with state bond funds: GC and MEP subs prequalify)
--                                          https://california.public.law/codes/public_contract_code_section_20111.6
--   Business and Professions Code §7028.15(e) (an unlicensed bid to a public agency is nonresponsive) and §7030.5
--     (license number on contracts and bids) https://california.public.law/codes/business_and_professions_code_section_7028.15
--                                            https://california.public.law/codes/business_and_professions_code_section_7030.5
--   Civil Code §9550 (payment bond before work on public works over $25,000) and §9554(a) (at least 100 percent)
--                                          https://california.public.law/codes/civil_code_section_9550
--                                          https://california.public.law/codes/civil_code_section_9554
--   PCC §10221-10222 (state jobs: separate performance and payment bonds)
--                                          https://law.justia.com/codes/california/2007/pcc/10220-10232.html
--   Labor Code §1861 (workers' compensation certification filed before performing the work)
--                                          https://law.justia.com/codes/california/code-lab/division-2/part-7/chapter-1/article-5/section-1861/
--   Education Code §45125.2 (school construction: barrier, supervision by a DOJ-cleared employee, or surveillance)
--                                          https://california.public.law/codes/education_code_section_45125.2
--   DGS bid package (the state's own list: bid form, bid security, noncollusion, subcontractor list, addenda
--     acknowledgment; after award performance and payment bonds, workers' comp)
--                                          https://www.dgs.ca.gov/-/media/Divisions/OBAS/Plans-and-Specs/25-276567-ReAd/9324---Bid-Package-Documents-Re-Bid.pdf

-- ---------------------------------------------------------------------------
-- The "Bid forms" folder kind and its reserved name
-- ---------------------------------------------------------------------------
alter table public.folders drop constraint folders_kind_check;
alter table public.folders add constraint folders_kind_check
  check (kind in ('general', 'plans', 'specs', 'reports', 'bids_received', 'inbound', 'photos', 'transmittals', 'system',
                  'dsa_103', 'ccd', 'ti', 'bid_forms'));

-- Same as 0030 plus "Bid forms" at the top of a job.
create or replace function public.folder_name_reserved(p_project_id uuid, p_parent_id uuid, p_name text)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select case
    when p_parent_id is null then btrim(p_name) in ('Bids received', 'Inspection requests', 'Delivery tickets', 'Emailed in', 'Bid forms')
    else btrim(p_name) = case (select kind from public.folders where id = p_parent_id and project_id = p_project_id)
                           when 'reports' then 'Inspection reports' when 'photos' then 'Corrections' end
  end;
$$;

-- ---------------------------------------------------------------------------
-- bid_form_templates
-- ---------------------------------------------------------------------------
create table public.bid_form_templates (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  org_id uuid references public.orgs(id),              -- null: a default for every company
  name text not null check (length(btrim(name)) between 1 and 200),
  reference text not null default '' check (length(reference) <= 300),
  timing text not null check (timing in ('with_bid', 'after_award')),
  required boolean not null default true,
  -- Conditions, null = any job.
  if_prevailing_wage boolean,
  if_dsa boolean,
  if_job_types text[] check (if_job_types is null or cardinality(if_job_types) > 0),
  sort int not null default 100,
  unique nulls not distinct (org_id, name)
);
alter table public.bid_form_templates enable row level security;
create policy "bid_form_templates: defaults and my company's" on public.bid_form_templates for select to authenticated
  using (org_id is null
         or exists (select 1 from public.org_members om where om.org_id = bid_form_templates.org_id and om.user_id = auth.uid()));

insert into public.bid_form_templates (name, reference, timing, if_prevailing_wage, if_dsa, sort) values
  ('Bid form',                    'Owner''s bid documents',                    'with_bid',    null, null, 10),
  ('Bid bond',                    'PCC §20111(b) schools; §10167 state (10%)', 'with_bid',    true, null, 20),
  ('Subcontractor list',          'PCC §4104',                                 'with_bid',    true, null, 30),
  ('Noncollusion declaration',    'PCC §7106',                                 'with_bid',    true, null, 40),
  ('DIR registration',            'Labor Code §1725.5, §1771.1',               'with_bid',    true, null, 50),
  ('CSLB license',                'B&P Code §7028.15, §7030.5',                'with_bid',    null, null, 60),
  ('Iran Contracting Act',        'PCC §2204 (bids of $1M or more)',           'with_bid',    true, null, 70),
  ('Addenda acknowledged',        'Owner''s bid documents',                    'with_bid',    null, null, 80),
  ('Prequalification',            'PCC §20111.6 (schools, $1M+, state bonds)', 'with_bid',    null, true, 90),
  ('Payment bond',                'Civil Code §9550, §9554 (100%)',            'after_award', true, null, 110),
  ('Performance bond',            'Owner''s contract; PCC §10221 (state)',     'after_award', true, null, 120),
  ('Workers'' comp certification', 'Labor Code §1861',                          'after_award', true, null, 130),
  ('Insurance certificates',      'Owner''s contract',                         'after_award', null, null, 140),
  ('Background check certificate', 'Education Code §45125.2',                  'after_award', null, true, 150),
  ('Contract',                    'Owner''s contract',                         'after_award', null, null, 160);

-- ---------------------------------------------------------------------------
-- bid_form_items
-- ---------------------------------------------------------------------------
create table public.bid_form_items (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  version int not null default 1,
  deleted_at timestamptz,
  org_id uuid not null references public.orgs(id),
  project_id uuid not null references public.projects(id),
  template_id uuid references public.bid_form_templates(id),   -- null: a form added for this job
  name text not null check (length(btrim(name)) between 1 and 200),
  reference text not null default '' check (length(reference) <= 300),
  timing text not null check (timing in ('with_bid', 'after_award')),
  required boolean not null default true,
  status text not null default 'to_do' check (status in ('to_do', 'done', 'n_a')),
  file_id uuid references public.files(id),
  due_on date,                                                  -- a day on the job's calendar (project time zone)
  note text not null default '' check (length(note) <= 4000),
  sort int not null default 1000,
  foreign key (project_id, org_id) references public.projects (id, org_id),
  unique (project_id, template_id)
);
alter table public.bid_form_items enable row level security;
create trigger touch before update on public.bid_form_items for each row execute function public.tg_touch_row();
create trigger no_delete before delete on public.bid_form_items for each row execute function public.tg_block_delete();
create trigger audit_row after insert or update on public.bid_form_items for each row execute function public.tg_audit_row();
create index bid_form_items_project on public.bid_form_items (project_id, timing, sort);

-- Removed rows stay readable to the same people (the data layer filters them); nobody else sees any row.
create policy "bid_form_items: managers read" on public.bid_form_items for select to authenticated
  using (public.has_capability(project_id, 'bids.manage'));
-- People add a job's own extra forms; the template ones come only from open_bid_forms.
create policy "bid_form_items: managers add" on public.bid_form_items for insert to authenticated
  with check (public.has_capability(project_id, 'bids.manage') and created_by = auth.uid() and template_id is null);
create policy "bid_form_items: managers update" on public.bid_form_items for update to authenticated
  using (public.has_capability(project_id, 'bids.manage'))
  with check (public.has_capability(project_id, 'bids.manage'));

-- The attached file is in this job and the person attaching it can open it (its uploader, or a reader of its folder).
-- Invoker rights on purpose: it asks the question as the person saving.
create or replace function public.tg_bid_form_file()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.file_id is not null and (tg_op = 'INSERT' or new.file_id is distinct from old.file_id) then
    if not exists (
      select 1 from public.files f
       where f.id = new.file_id and f.project_id = new.project_id and f.deleted_at is null
         and (auth.uid() is null
              or (f.created_by = auth.uid() and public.is_member(f.project_id))
              or public.folder_can_read(f.folder_id))
    ) then
      raise exception 'That file isn''t in this job, or you can''t open it.' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function public.tg_bid_form_file() from public, anon, authenticated;
create trigger file_check before insert or update of file_id on public.bid_form_items
  for each row execute function public.tg_bid_form_file();

-- Calendar: an open form with a due day is a "my due" line for the job's bids managers; done, N/A or removed, it goes.
create or replace function public.tg_bid_form_calendar()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare tz text;
begin
  if new.deleted_at is not null or new.due_on is null or new.status <> 'to_do' then
    perform public.calendar_unmirror('bid_form_item', new.id);
    return null;
  end if;
  select timezone into tz from public.projects where id = new.project_id;
  perform public.calendar_mirror('bid_form_item', new.id, new.project_id, 'my_due', new.name,
    new.due_on::timestamp at time zone tz, null, true, 'pending', 'bids.manage', null);
  return null;
end;
$$;
revoke execute on function public.tg_bid_form_calendar() from public, anon, authenticated;
create trigger bid_form_calendar after insert or update of due_on, status, deleted_at, name on public.bid_form_items
  for each row execute function public.tg_bid_form_calendar();

-- ---------------------------------------------------------------------------
-- open_bid_forms(project) -> the job's Bid forms folder id
-- ---------------------------------------------------------------------------
create or replace function public.open_bid_forms(p_project_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare p public.projects; v_folder uuid; v_deleted timestamptz;
begin
  if not public.has_capability(p_project_id, 'bids.manage') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into p from public.projects where id = p_project_id and deleted_at is null;
  if p is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  -- One at a time per job, so two tabs opening at once make one folder.
  perform pg_advisory_xact_lock(hashtext('open_bid_forms:' || p.id::text));

  -- The folder: made once with its own access list; a deleted one comes back rather than a second one.
  select f.id, f.deleted_at into v_folder, v_deleted
    from public.folders f
   where f.project_id = p.id and f.kind = 'bid_forms'
   order by (f.deleted_at is null) desc, f.created_at
   limit 1;
  if v_folder is null then
    insert into public.folders (org_id, project_id, name, kind, sort, ai_reads, created_by)
    values (p.org_id, p.id, 'Bid forms', 'bid_forms', 35, false, auth.uid())
    on conflict do nothing
    returning id into v_folder;
    if v_folder is null then
      raise exception 'A folder named "Bid forms" is in the way. Rename it in Files.' using errcode = '23505';
    end if;
    insert into public.folder_access (folder_id, capability, can_read, can_write, created_by)
    values (v_folder, 'bids.manage', true, true, auth.uid());
  elsif v_deleted is not null then
    update public.folders set deleted_at = null where id = v_folder;
  end if;

  -- Every template that applies to this job and isn't on it yet (removed ones included, so they stay removed).
  insert into public.bid_form_items (org_id, project_id, template_id, name, reference, timing, required, sort, created_by)
  select p.org_id, p.id, t.id, t.name, t.reference, t.timing, t.required, t.sort, auth.uid()
    from public.bid_form_templates t
   where (t.org_id is null or t.org_id = p.org_id)
     and (t.if_prevailing_wage is null or t.if_prevailing_wage = p.prevailing_wage)
     and (t.if_dsa is null or t.if_dsa = p.is_dsa)
     and (t.if_job_types is null
          or lower(btrim(coalesce(p.job_type, ''))) in (select lower(btrim(j)) from unnest(t.if_job_types) as j))
   order by t.sort, t.name
  on conflict (project_id, template_id) do nothing;

  return v_folder;
end;
$$;
revoke execute on function public.open_bid_forms(uuid) from public, anon;
grant execute on function public.open_bid_forms(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Grants: what a person may set. Everything else is the database's (defaults, triggers, open_bid_forms).
-- ---------------------------------------------------------------------------
revoke all on public.bid_form_templates, public.bid_form_items from anon, authenticated;
grant select on public.bid_form_templates, public.bid_form_items to authenticated;
grant insert (org_id, project_id, name, reference, timing, required, due_on, note, created_by) on public.bid_form_items to authenticated;
grant update (status, file_id, due_on, note, deleted_at) on public.bid_form_items to authenticated;
grant select, insert, update on public.bid_form_templates, public.bid_form_items to service_role;
