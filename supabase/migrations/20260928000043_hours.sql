-- 0043 Hours, timesheets and invoices (SPEC §15; MDR's hours prompt, contract hours, monthly timesheet and invoice).
--   * daily_reports.hours: the hours a report's author worked that day (0-24, tenths). Set only by the author, on a
--     submitted report, through set_daily_hours (version-checked, audited). Hours are not what the signature covers:
--     setting them keeps a current report current (signed_version moves with the row) and a changed one changed.
--   * job_hours_budgets: my contract hours on a job (contract, the baseline used before tracking, the day the baseline
--     runs through). Mine only: nobody else reads or writes it, project admins included. save_hours_budget writes it.
--   * billing_profiles, billing_job_rates, invoices: my billing (business name, address, bill to, terms, my rate and
--     per-job rates) and my invoices. Money lives only here and only for its owner (CLAUDE.md rule 3): RLS is
--     user_id = auth.uid() and nothing else; every write is an RPC as the caller. Invoice numbers come from my counter
--     (billing_profiles.next_invoice_number, which I may move forward to continue a sequence), unique per person; one
--     invoice per person per month, so asking again never burns a number. create_invoice / refresh_invoice price a
--     month's hours (my submitted dailies) at my rates into a snapshot the PDF prints. Audit lines about them carry no
--     project and no amounts, so no project's audit export shows them.
--   * sign_timesheet / log_invoice_pdf: the timesheets function records each signed monthly timesheet (fresh sign-in,
--     content hash) and each invoice PDF in the audit log.
--   * Module 'hours': on for every job of an inspector company (new and existing); Settings turns it on elsewhere.
--     roles.recommended_tools: 'hours' appended for inspector and special_inspector, and for project_admin: an
--     inspector company's job is made by its inspector, who is its project admin. On a job without the module (a GC's,
--     by default) the recommendation drops it, so nobody else's rail changes.

-- ---------------------------------------------------------------------------------------------------------------------
-- Hours on a daily report
-- ---------------------------------------------------------------------------------------------------------------------
alter table public.daily_reports
  add column hours numeric(4,1) check (hours is null or (hours >= 0 and hours <= 24));

create or replace function public.set_daily_hours(p_report_id uuid, p_version int, p_hours numeric)
returns public.daily_reports
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare r public.daily_reports; was numeric;
begin
  r := public.daily_own_report(p_report_id);
  if r.version <> p_version then raise exception 'version_conflict' using errcode = '40001'; end if;
  if r.status <> 'submitted' then raise exception 'Submit the report first.' using errcode = '22023'; end if;
  if p_hours is not null and (p_hours < 0 or p_hours > 24 or p_hours <> round(p_hours, 1)) then
    raise exception 'Hours are 0 to 24, in tenths.' using errcode = '22023';
  end if;
  was := r.hours;
  -- tg_touch_row makes the new version old + 1: a report that was current stays current.
  update public.daily_reports
     set hours = p_hours,
         signed_version = case when signed_version = version then version + 1 else signed_version end
   where id = r.id
  returning * into r;
  perform public.audit('daily.hours', 'daily_report', r.id, r.project_id, r.org_id,
    jsonb_build_object('hours', p_hours, 'was', was, 'report_date', r.report_date));
  return r;
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------------
-- My contract hours per job
-- ---------------------------------------------------------------------------------------------------------------------
create table public.job_hours_budgets (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  version int not null default 1,
  org_id uuid not null,
  project_id uuid not null,
  user_id uuid not null references auth.users(id),
  contract_hours numeric(8,1) not null check (contract_hours >= 0 and contract_hours <= 100000),
  -- Hours used before tracking started, counted through baseline_through (null = no cutoff: every report counts).
  baseline_hours numeric(8,1) not null default 0 check (baseline_hours >= 0 and baseline_hours <= 100000),
  baseline_through date,
  foreign key (project_id, org_id) references public.projects (id, org_id),
  unique (project_id, user_id)
);
alter table public.job_hours_budgets enable row level security;
create trigger touch before update on public.job_hours_budgets for each row execute function public.tg_touch_row();
create trigger no_delete before delete on public.job_hours_budgets for each row execute function public.tg_block_delete();

-- ---------------------------------------------------------------------------------------------------------------------
-- My billing and my invoices
-- ---------------------------------------------------------------------------------------------------------------------
create table public.billing_profiles (
  user_id uuid primary key references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version int not null default 1,
  business_name text not null default '' check (length(business_name) <= 200),
  address text not null default '' check (length(address) <= 500),
  bill_to text not null default '' check (length(bill_to) <= 500),
  terms text not null default '' check (length(terms) <= 200),
  -- Dollars per hour; a job's own rate (billing_job_rates) wins.
  rate numeric(8,2) check (rate is null or (rate >= 0 and rate <= 100000)),
  -- The number my next invoice gets (the counter; create_invoice takes it and moves it on).
  next_invoice_number int not null default 1 check (next_invoice_number between 1 and 999999)
);
alter table public.billing_profiles enable row level security;
create trigger touch before update on public.billing_profiles for each row execute function public.tg_touch_row();
create trigger no_delete before delete on public.billing_profiles for each row execute function public.tg_block_delete();

create table public.billing_job_rates (
  user_id uuid not null references auth.users(id),
  project_id uuid not null references public.projects(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version int not null default 1,
  -- null = my usual rate.
  rate numeric(8,2) check (rate is null or (rate >= 0 and rate <= 100000)),
  primary key (user_id, project_id)
);
alter table public.billing_job_rates enable row level security;
create trigger touch before update on public.billing_job_rates for each row execute function public.tg_touch_row();
create trigger no_delete before delete on public.billing_job_rates for each row execute function public.tg_block_delete();

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  version int not null default 1,
  user_id uuid not null references auth.users(id),
  number int not null check (number >= 1),
  -- The billing month (its first day).
  period date not null check (period = date_trunc('month', period)::date),
  status text not null default 'draft' check (status in ('draft', 'sent', 'paid')),
  issued_on date not null,
  -- The snapshot the PDF prints: who from, to whom, terms, one line per job (job, number, DSA #, hours, rate, amount).
  from_name text not null check (length(from_name) <= 200),
  from_address text not null check (length(from_address) <= 500),
  bill_to text not null check (length(bill_to) <= 500),
  terms text not null check (length(terms) <= 200),
  lines jsonb not null check (jsonb_typeof(lines) = 'array' and jsonb_array_length(lines) between 1 and 200),
  total_hours numeric(8,1) not null,
  total_amount numeric(12,2) not null,
  sent_at timestamptz,
  paid_at timestamptz,
  unique (user_id, number),
  unique (user_id, period)
);
alter table public.invoices enable row level security;
create trigger touch before update on public.invoices for each row execute function public.tg_touch_row();
create trigger no_delete before delete on public.invoices for each row execute function public.tg_block_delete();

revoke all on public.job_hours_budgets, public.billing_profiles, public.billing_job_rates, public.invoices
  from anon, authenticated;
grant select on public.job_hours_budgets, public.billing_profiles, public.billing_job_rates, public.invoices
  to authenticated;

-- Mine only. No capability, no role, no project admin: the owner and nobody else.
create policy "job_hours_budgets: mine" on public.job_hours_budgets for select to authenticated
  using (user_id = auth.uid());
create policy "billing_profiles: mine" on public.billing_profiles for select to authenticated
  using (user_id = auth.uid());
create policy "billing_job_rates: mine" on public.billing_job_rates for select to authenticated
  using (user_id = auth.uid());
create policy "invoices: mine" on public.invoices for select to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------------------------------------------------
-- Writes (as the caller; the owner is always auth.uid())
-- ---------------------------------------------------------------------------------------------------------------------
-- A number of hours or dollars as typed: not negative, at most p_max, at most p_places decimals.
create or replace function public.hours_amount_ok(p_value numeric, p_max numeric, p_places int)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select p_value is not null and p_value >= 0 and p_value <= p_max and p_value = round(p_value, p_places);
$$;

create or replace function public.save_hours_budget(p_project_id uuid, p_contract numeric, p_baseline numeric,
                                                    p_through date, p_version int default null)
returns public.job_hours_budgets
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare b public.job_hours_budgets;
begin
  if auth.uid() is null or not public.is_member(p_project_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  if not public.hours_amount_ok(p_contract, 100000, 1) or not public.hours_amount_ok(coalesce(p_baseline, 0), 100000, 1) then
    raise exception 'Hours are 0 to 100000, in tenths.' using errcode = '22023';
  end if;
  -- A baseline without its last day would count the same days twice.
  if coalesce(p_baseline, 0) > 0 and p_through is null then
    raise exception 'Add the day the baseline runs through.' using errcode = '22023';
  end if;
  if p_version is null then
    insert into public.job_hours_budgets (org_id, project_id, user_id, contract_hours, baseline_hours, baseline_through, created_by)
    select p.org_id, p.id, auth.uid(), p_contract, coalesce(p_baseline, 0), p_through, auth.uid()
      from public.projects p where p.id = p_project_id and p.deleted_at is null
    on conflict (project_id, user_id) do nothing
    returning * into b;
    if b.id is null then raise exception 'version_conflict' using errcode = '40001'; end if;
  else
    update public.job_hours_budgets
       set contract_hours = p_contract, baseline_hours = coalesce(p_baseline, 0), baseline_through = p_through
     where project_id = p_project_id and user_id = auth.uid() and version = p_version
    returning * into b;
    if b.id is null then raise exception 'version_conflict' using errcode = '40001'; end if;
  end if;
  -- No project and no numbers on the audit line: my budget stays mine.
  perform public.audit('hours.budget', 'job_hours_budget', b.id, null, null, jsonb_build_object('project_id', b.project_id));
  return b;
end;
$$;

create or replace function public.save_billing_profile(p_business_name text, p_address text, p_bill_to text, p_terms text,
                                                       p_rate numeric, p_next_invoice_number int, p_version int default null)
returns public.billing_profiles
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare bp public.billing_profiles; used int;
begin
  if auth.uid() is null then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_rate is not null and not public.hours_amount_ok(p_rate, 100000, 2) then
    raise exception 'A rate is 0 to 100000 dollars, in cents.' using errcode = '22023';
  end if;
  select max(number) into used from public.invoices where user_id = auth.uid();
  if p_next_invoice_number is null or p_next_invoice_number < 1 or p_next_invoice_number <= coalesce(used, 0) then
    raise exception 'The next invoice # must be more than %.', coalesce(used, 0) using errcode = '22023';
  end if;
  if p_version is null then
    insert into public.billing_profiles (user_id, business_name, address, bill_to, terms, rate, next_invoice_number)
    values (auth.uid(), btrim(coalesce(p_business_name, '')), btrim(coalesce(p_address, '')), btrim(coalesce(p_bill_to, '')),
            btrim(coalesce(p_terms, '')), p_rate, p_next_invoice_number)
    on conflict (user_id) do nothing
    returning * into bp;
  else
    update public.billing_profiles
       set business_name = btrim(coalesce(p_business_name, '')), address = btrim(coalesce(p_address, '')),
           bill_to = btrim(coalesce(p_bill_to, '')), terms = btrim(coalesce(p_terms, '')), rate = p_rate,
           next_invoice_number = p_next_invoice_number
     where user_id = auth.uid() and version = p_version
    returning * into bp;
  end if;
  if bp.user_id is null then raise exception 'version_conflict' using errcode = '40001'; end if;
  perform public.audit('billing.profile', 'billing_profile', auth.uid(), null, null, '{}'::jsonb);
  return bp;
end;
$$;

create or replace function public.set_job_rate(p_project_id uuid, p_rate numeric, p_version int default null)
returns public.billing_job_rates
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare jr public.billing_job_rates;
begin
  if auth.uid() is null or not public.is_member(p_project_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_rate is not null and not public.hours_amount_ok(p_rate, 100000, 2) then
    raise exception 'A rate is 0 to 100000 dollars, in cents.' using errcode = '22023';
  end if;
  if p_version is null then
    insert into public.billing_job_rates (user_id, project_id, rate) values (auth.uid(), p_project_id, p_rate)
    on conflict (user_id, project_id) do nothing
    returning * into jr;
  else
    update public.billing_job_rates set rate = p_rate
     where user_id = auth.uid() and project_id = p_project_id and version = p_version
    returning * into jr;
  end if;
  if jr.user_id is null then raise exception 'version_conflict' using errcode = '40001'; end if;
  perform public.audit('billing.job_rate', 'billing_job_rate', null, null, null, jsonb_build_object('project_id', p_project_id));
  return jr;
end;
$$;

-- A month's lines for a person: my submitted, not deleted dailies with hours, per job, at the job's rate (else my
-- rate; null when neither is set). The DSA # is the one on my daily setup for the job (the VIS form's dsa_app).
-- Internal: runs inside create_invoice / refresh_invoice for auth.uid().
create or replace function public.invoice_lines(p_owner uuid, p_period date)
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'project_id', x.project_id, 'job', x.name, 'job_number', coalesce(x.number, ''), 'dsa', x.dsa,
           'hours', x.hours, 'rate', x.rate, 'amount', round(x.hours * x.rate, 2))
         order by x.name, x.project_id), '[]'::jsonb)
    from (
      select p.id as project_id, p.name, p.number, sum(r.hours) as hours,
             coalesce(jr.rate, bp.rate) as rate,
             coalesce((select s.settings -> 'locked' ->> 'dsa_app' from public.daily_setups s
                        where s.project_id = p.id and s.author_id = p_owner
                          and coalesce(s.settings -> 'locked' ->> 'dsa_app', '') <> ''
                        order by s.chosen_at desc limit 1), '') as dsa
        from public.daily_reports r
        join public.projects p on p.id = r.project_id
        left join public.billing_profiles bp on bp.user_id = p_owner
        left join public.billing_job_rates jr on jr.user_id = p_owner and jr.project_id = p.id
       where r.author_id = p_owner and r.status = 'submitted' and r.deleted_at is null and r.hours > 0
         and r.report_date >= p_period and r.report_date < (p_period + interval '1 month')::date
       group by p.id, p.name, p.number, jr.rate, bp.rate
    ) x;
$$;

-- The snapshot for a month, or a plain refusal (no hours, no rate).
create or replace function public.invoice_snapshot(p_period date)
returns jsonb
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare ls jsonb;
begin
  ls := public.invoice_lines(auth.uid(), p_period);
  if jsonb_array_length(ls) = 0 then
    raise exception 'No hours in %.', to_char(p_period, 'FMMonth YYYY') using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(ls) e where jsonb_typeof(e -> 'rate') <> 'number') then
    raise exception 'Set your rate first.' using errcode = '22023';
  end if;
  return ls;
end;
$$;

create or replace function public.create_invoice(p_period date)
returns public.invoices
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare bp public.billing_profiles; inv public.invoices; ls jsonb; who text; tz text;
begin
  if auth.uid() is null then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_period is null or p_period <> date_trunc('month', p_period)::date then
    raise exception 'Pick a month.' using errcode = '22023';
  end if;
  -- Locking my profile first makes two requests for the same month one after the other.
  select * into bp from public.billing_profiles where user_id = auth.uid() for update;
  if not found then raise exception 'Set up billing first.' using errcode = '22023'; end if;
  -- One invoice per month: asking again answers the one there is and never burns a number.
  select * into inv from public.invoices where user_id = auth.uid() and period = p_period;
  if found then return inv; end if;
  ls := public.invoice_snapshot(p_period);
  select full_name, timezone into who, tz from public.profiles where user_id = auth.uid();
  update public.billing_profiles set next_invoice_number = next_invoice_number + 1 where user_id = auth.uid();
  insert into public.invoices (user_id, number, period, issued_on, from_name, from_address, bill_to, terms, lines,
                               total_hours, total_amount, created_by)
  select auth.uid(), bp.next_invoice_number, p_period, (now() at time zone coalesce(tz, 'UTC'))::date,
         left(coalesce(nullif(bp.business_name, ''), nullif(who, ''), 'Invoice'), 200), bp.address, bp.bill_to, bp.terms, ls,
         (select sum((e ->> 'hours')::numeric) from jsonb_array_elements(ls) e),
         (select sum((e ->> 'amount')::numeric) from jsonb_array_elements(ls) e),
         auth.uid()
  returning * into inv;
  perform public.audit('invoice.create', 'invoice', inv.id, null, null,
    jsonb_build_object('number', inv.number, 'period', inv.period));
  return inv;
end;
$$;

-- A draft priced again from today's hours, rates and billing details.
create or replace function public.refresh_invoice(p_invoice_id uuid, p_version int)
returns public.invoices
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare inv public.invoices; bp public.billing_profiles; ls jsonb; who text; tz text;
begin
  select * into inv from public.invoices where id = p_invoice_id and user_id = auth.uid() for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if inv.version <> p_version then raise exception 'version_conflict' using errcode = '40001'; end if;
  if inv.status <> 'draft' then raise exception 'Only a draft can be updated.' using errcode = '22023'; end if;
  select * into bp from public.billing_profiles where user_id = auth.uid();
  ls := public.invoice_snapshot(inv.period);
  select full_name, timezone into who, tz from public.profiles where user_id = auth.uid();
  update public.invoices
     set lines = ls, issued_on = (now() at time zone coalesce(tz, 'UTC'))::date,
         from_name = left(coalesce(nullif(bp.business_name, ''), nullif(who, ''), 'Invoice'), 200),
         from_address = coalesce(bp.address, ''), bill_to = coalesce(bp.bill_to, ''), terms = coalesce(bp.terms, ''),
         total_hours = (select sum((e ->> 'hours')::numeric) from jsonb_array_elements(ls) e),
         total_amount = (select sum((e ->> 'amount')::numeric) from jsonb_array_elements(ls) e)
   where id = inv.id
  returning * into inv;
  perform public.audit('invoice.refresh', 'invoice', inv.id, null, null, jsonb_build_object('number', inv.number));
  return inv;
end;
$$;

-- Draft / Sent / Paid, set by hand (any way round: a slip is undone by setting it back).
create or replace function public.set_invoice_status(p_invoice_id uuid, p_version int, p_status text)
returns public.invoices
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare inv public.invoices;
begin
  if p_status is null or p_status not in ('draft', 'sent', 'paid') then
    raise exception 'bad status' using errcode = '22023';
  end if;
  select * into inv from public.invoices where id = p_invoice_id and user_id = auth.uid() for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if inv.version <> p_version then raise exception 'version_conflict' using errcode = '40001'; end if;
  update public.invoices
     set status = p_status,
         sent_at = case when p_status = 'draft' then null else coalesce(sent_at, now()) end,
         paid_at = case when p_status = 'paid' then coalesce(paid_at, now()) else null end
   where id = inv.id
  returning * into inv;
  perform public.audit('invoice.status', 'invoice', inv.id, null, null,
    jsonb_build_object('number', inv.number, 'status', p_status));
  return inv;
end;
$$;

-- The timesheets function, after rendering an invoice PDF from its snapshot: the download is logged.
create or replace function public.log_invoice_pdf(p_invoice_id uuid, p_sha256 text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare inv public.invoices;
begin
  select * into inv from public.invoices where id = p_invoice_id and user_id = auth.uid();
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if p_sha256 is null or p_sha256 !~ '^[0-9a-f]{64}$' then raise exception 'bad hash' using errcode = '22023'; end if;
  perform public.audit('invoice.pdf', 'invoice', inv.id, null, null, jsonb_build_object('number', inv.number), p_sha256);
end;
$$;

-- The timesheets function signs a month's timesheet for a company: a fresh sign-in (SPEC §6.9), the hash of what it
-- prints, one audit line. Answers the signing time the stamp prints.
create or replace function public.sign_timesheet(p_period date, p_org_id uuid, p_content_hash text)
returns timestamptz
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.signed_in_recently() then
    raise exception 'reauth_required: sign in again to sign' using errcode = '42501';
  end if;
  if p_period is null or p_period <> date_trunc('month', p_period)::date then
    raise exception 'Pick a month.' using errcode = '22023';
  end if;
  if p_content_hash is null or p_content_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'bad content hash' using errcode = '22023';
  end if;
  if not exists (select 1 from public.project_members pm
                  where pm.org_id = p_org_id and pm.user_id = auth.uid() and pm.status = 'active'
                    and (pm.access_ends_at is null or pm.access_ends_at > now())) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform public.audit('timesheet.sign', 'timesheet', null, null, p_org_id,
    jsonb_build_object('period', p_period), p_content_hash);
  return now();
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------------
-- The Hours tool: a module, on for inspector companies' jobs, and on the inspectors' recommended rail
-- ---------------------------------------------------------------------------------------------------------------------
create or replace function public.tg_project_modules_by_kind()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if (select kind from public.orgs where id = new.org_id) = 'inspector' then
    new.modules := array(select distinct m from unnest(array_remove(new.modules, 'bids') || '{hours}'::text[]) m order by m);
  end if;
  return new;
end;
$$;
revoke execute on function public.tg_project_modules_by_kind() from public, anon, authenticated;

update public.projects p
   set modules = array(select distinct m from unnest(p.modules || '{hours}'::text[]) m order by m)
  from public.orgs o
 where o.id = p.org_id and o.kind = 'inspector' and not ('hours' = any (p.modules));

update public.roles
   set recommended_tools = recommended_tools || '{hours}'::text[]
 where name in ('inspector', 'special_inspector', 'project_admin') and not ('hours' = any (recommended_tools));

-- ---------------------------------------------------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------------------------------------------------
revoke execute on function public.hours_amount_ok(numeric, numeric, int) from public, anon, authenticated;
revoke execute on function public.invoice_lines(uuid, date) from public, anon, authenticated;
revoke execute on function public.invoice_snapshot(date) from public, anon, authenticated;

revoke execute on function public.set_daily_hours(uuid, int, numeric) from public, anon;
revoke execute on function public.save_hours_budget(uuid, numeric, numeric, date, int) from public, anon;
revoke execute on function public.save_billing_profile(text, text, text, text, numeric, int, int) from public, anon;
revoke execute on function public.set_job_rate(uuid, numeric, int) from public, anon;
revoke execute on function public.create_invoice(date) from public, anon;
revoke execute on function public.refresh_invoice(uuid, int) from public, anon;
revoke execute on function public.set_invoice_status(uuid, int, text) from public, anon;
revoke execute on function public.log_invoice_pdf(uuid, text) from public, anon;
revoke execute on function public.sign_timesheet(date, uuid, text) from public, anon;
grant execute on function public.set_daily_hours(uuid, int, numeric) to authenticated, service_role;
grant execute on function public.save_hours_budget(uuid, numeric, numeric, date, int) to authenticated, service_role;
grant execute on function public.save_billing_profile(text, text, text, text, numeric, int, int) to authenticated, service_role;
grant execute on function public.set_job_rate(uuid, numeric, int) to authenticated, service_role;
grant execute on function public.create_invoice(date) to authenticated, service_role;
grant execute on function public.refresh_invoice(uuid, int) to authenticated, service_role;
grant execute on function public.set_invoice_status(uuid, int, text) to authenticated, service_role;
grant execute on function public.log_invoice_pdf(uuid, text) to authenticated, service_role;
grant execute on function public.sign_timesheet(date, uuid, text) to authenticated, service_role;
