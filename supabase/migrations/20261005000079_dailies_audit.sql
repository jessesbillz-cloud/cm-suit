-- 0079 Dailies, hours and invoices after the Oct 4 audit (scratch/audit/dailies.md).
--   1. remove_daily_photo also takes the photo's file out of the author's Photos folder (soft delete, like every file),
--      when the author uploaded it there and no other report of theirs still shows it. Before, a removed photo stayed
--      behind in Photos/<author> (#15).
--   2. daily_team_emails(job): the job's team for a new daily setup's recipients (MDR's "project team recipients", CLAUDE.md
--      rule 16, prefill what is known): the active members whose role reads the job's dailies (dailies.read_all), never
--      the caller and never a bidder. SECURITY INVOKER: project_members' own read rule (members.view) answers, so it shows
--      only what the caller could already see. Recipients stay editable in Setup (#8).
--   3. my_daily_today answers today's report's version too, so All my jobs uses the Dailies button's words for the same
--      state: Start (nothing yet, or untouched), Continue (written in), Edit submitted (#23). The return type changes, so
--      the 0045 function is retired (renamed, execute revoked) and a new one takes its name.
--   4. A draft invoice can be deleted, with Undo (#28): invoices.deleted_at (soft delete, numbers are never reused).
--      delete_invoice (a draft, mine, version-checked), restore_invoice (Undo, safe to repeat). Asking for that month's
--      invoice again brings the same invoice and number back, priced from today's hours. A deleted invoice can't be read,
--      updated, marked or rendered.

-- 1. A removed photo's file ---------------------------------------------------------------------------------------------
create or replace function public.remove_daily_photo(p_photo_id uuid, p_version int)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare ph public.daily_report_photos;
begin
  select * into ph from public.daily_report_photos where id = p_photo_id and deleted_at is null;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  perform public.daily_own_report(ph.report_id);
  update public.daily_report_photos set deleted_at = now() where id = ph.id and version = p_version;
  if not found then raise exception 'version_conflict' using errcode = '40001'; end if;
  -- The file goes too: only my own upload in my own Photos folder, and only when no report of mine still shows it.
  update public.files f
     set deleted_at = now()
   where f.id = ph.file_id and f.deleted_at is null and f.created_by = auth.uid()
     and f.folder_id = (select d.folder_id from public.daily_author_folders d
                         where d.project_id = ph.project_id and d.author_id = auth.uid() and d.kind = 'photos')
     and not exists (select 1 from public.daily_report_photos o
                      where o.file_id = ph.file_id and o.id <> ph.id and o.deleted_at is null);
end;
$$;
revoke execute on function public.remove_daily_photo(uuid, int) from public, anon;
grant execute on function public.remove_daily_photo(uuid, int) to authenticated, service_role;

-- 2. The job's team, for a new setup's recipients -----------------------------------------------------------------------
create or replace function public.daily_team_emails(p_project_id uuid)
returns text[]
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select coalesce(array_agg(distinct pm.invite_email order by pm.invite_email), '{}'::text[])
    from public.project_members pm
   where pm.project_id = p_project_id and pm.status = 'active' and pm.user_id is not null
     and pm.user_id <> auth.uid()
     and (pm.access_ends_at is null or pm.access_ends_at > now())
     and not public.role_is_walled(pm.role)
     and exists (select 1 from public.role_permissions rp where rp.role = pm.role and rp.capability = 'dailies.read_all')
     and public.has_capability(p_project_id, 'dailies.write');
$$;
revoke execute on function public.daily_team_emails(uuid) from public, anon;
grant execute on function public.daily_team_emails(uuid) to authenticated;

-- 3. Today's reports with the report's version --------------------------------------------------------------------------
alter function public.my_daily_today() rename to my_daily_today_retired_0079;
revoke execute on function public.my_daily_today_retired_0079() from public, anon, authenticated;

create function public.my_daily_today()
returns table (
  project_id uuid,
  project_name text,
  report_type text,
  label text,
  schedule_days int[],
  today date,
  scheduled_today boolean,
  report_id uuid,
  status text,
  number int,
  next_number int,
  report_version int
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with chosen as (
    select distinct on (s.project_id) s.project_id, s.report_type, s.settings
      from public.daily_setups s
     where s.author_id = auth.uid()
     order by s.project_id, s.chosen_at desc, s.created_at desc, s.id
  ),
  jobs as (
    select c.project_id, c.report_type, c.settings, p.name, (now() at time zone p.timezone)::date as today
      from chosen c
      join public.projects p on p.id = c.project_id
     where p.deleted_at is null
       and p.stage not in ('lost', 'archived')
       and 'dailies' = any (p.modules)
       and public.has_capability(p.id, 'dailies.write')
  )
  select j.project_id,
         j.name,
         j.report_type,
         nullif(btrim(j.settings ->> 'label'), ''),
         days.list,
         j.today,
         extract(dow from j.today)::int = any (days.list),
         r.id,
         coalesce(r.status, 'none'),
         r.number,
         case when r.number is null then public.peek_author_number(j.project_id, 'dailies:' || j.report_type) end,
         r.version
    from jobs j
    cross join lateral (
      select coalesce(array_agg(distinct v.n::int order by v.n::int), '{}'::int[]) as list
        from jsonb_array_elements(case when jsonb_typeof(j.settings -> 'schedule_days') = 'array'
                                       then j.settings -> 'schedule_days' else '[]'::jsonb end) e (d)
        cross join lateral (select case when jsonb_typeof(e.d) = 'number' then (e.d #>> '{}')::numeric end as n) v
       where v.n in (0, 1, 2, 3, 4, 5, 6)
    ) days
    left join public.daily_reports r
      on r.project_id = j.project_id and r.author_id = auth.uid() and r.report_type = j.report_type
     and r.report_date = j.today and r.deleted_at is null
   order by j.name, j.project_id;
$$;
revoke execute on function public.my_daily_today() from public, anon;
grant execute on function public.my_daily_today() to authenticated;

-- 4. Deleting a draft invoice -------------------------------------------------------------------------------------------
alter table public.invoices add column deleted_at timestamptz;
alter policy "invoices: mine" on public.invoices using (user_id = auth.uid() and deleted_at is null);

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
  select full_name, timezone into who, tz from public.profiles where user_id = auth.uid();
  -- One invoice per month: asking again answers the one there is and never burns a number. A deleted draft comes back
  -- with its number, priced from today's hours.
  select * into inv from public.invoices where user_id = auth.uid() and period = p_period;
  if found then
    if inv.deleted_at is null then return inv; end if;
    ls := public.invoice_snapshot(p_period);
    update public.invoices
       set deleted_at = null, status = 'draft', sent_at = null, paid_at = null, lines = ls,
           issued_on = (now() at time zone coalesce(tz, 'UTC'))::date,
           from_name = left(coalesce(nullif(bp.business_name, ''), nullif(who, ''), 'Invoice'), 200),
           from_address = coalesce(bp.address, ''), bill_to = coalesce(bp.bill_to, ''), terms = coalesce(bp.terms, ''),
           total_hours = (select sum((e ->> 'hours')::numeric) from jsonb_array_elements(ls) e),
           total_amount = (select sum((e ->> 'amount')::numeric) from jsonb_array_elements(ls) e)
     where id = inv.id
    returning * into inv;
    perform public.audit('invoice.create', 'invoice', inv.id, null, null,
      jsonb_build_object('number', inv.number, 'period', inv.period, 'restored', true));
    return inv;
  end if;
  ls := public.invoice_snapshot(p_period);
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

-- A draft priced again from today's hours, rates and billing details (never a deleted one).
create or replace function public.refresh_invoice(p_invoice_id uuid, p_version int)
returns public.invoices
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare inv public.invoices; bp public.billing_profiles; ls jsonb; who text; tz text;
begin
  select * into inv from public.invoices where id = p_invoice_id and user_id = auth.uid() and deleted_at is null for update;
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

-- Draft / Sent / Paid, set by hand (any way round: a slip is undone by setting it back). Never a deleted one.
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
  select * into inv from public.invoices where id = p_invoice_id and user_id = auth.uid() and deleted_at is null for update;
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

create or replace function public.delete_invoice(p_invoice_id uuid, p_version int)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare inv public.invoices;
begin
  select * into inv from public.invoices where id = p_invoice_id and user_id = auth.uid() and deleted_at is null for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if inv.version <> p_version then raise exception 'version_conflict' using errcode = '40001'; end if;
  if inv.status <> 'draft' then raise exception 'Only a draft can be deleted.' using errcode = '22023'; end if;
  update public.invoices set deleted_at = now() where id = inv.id;
  perform public.audit('invoice.delete', 'invoice', inv.id, null, null, jsonb_build_object('number', inv.number));
end;
$$;

-- Undo: the deleted invoice back as it was. Safe to repeat.
create or replace function public.restore_invoice(p_invoice_id uuid)
returns public.invoices
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare inv public.invoices;
begin
  select * into inv from public.invoices where id = p_invoice_id and user_id = auth.uid() for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if inv.deleted_at is null then return inv; end if;
  update public.invoices set deleted_at = null where id = inv.id returning * into inv;
  perform public.audit('invoice.restore', 'invoice', inv.id, null, null, jsonb_build_object('number', inv.number));
  return inv;
end;
$$;

revoke execute on function public.create_invoice(date) from public, anon;
revoke execute on function public.refresh_invoice(uuid, int) from public, anon;
revoke execute on function public.set_invoice_status(uuid, int, text) from public, anon;
revoke execute on function public.delete_invoice(uuid, int) from public, anon;
revoke execute on function public.restore_invoice(uuid) from public, anon;
grant execute on function public.create_invoice(date) to authenticated, service_role;
grant execute on function public.refresh_invoice(uuid, int) to authenticated, service_role;
grant execute on function public.set_invoice_status(uuid, int, text) to authenticated, service_role;
grant execute on function public.delete_invoice(uuid, int) to authenticated, service_role;
grant execute on function public.restore_invoice(uuid) to authenticated, service_role;
