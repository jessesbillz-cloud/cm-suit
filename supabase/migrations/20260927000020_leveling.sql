-- 0020 Bid leveling (SPEC §11.6 "Leveling", "Flags", "Views"): every bidder's current price side by side per package,
-- what is wrong with each bid, and the one write for leveling decisions.
--   * bid_leveling_board(project): one row per non-deleted submission, for bids.manage while bids are open. Money
--     (base amount, evidence, page, PW adder) is filled only for bids.view_pricing callers and null for everyone
--     else (CLAUDE.md rule 3: money never leaves the pricing tables for a non-pricing caller).
--   * bid_flags(project): computed flags per package / submission. The money-dependent one (escalation) exists only
--     for pricing callers; manual flags kept on bid_leveling.flags come along.
--   * set_bid_leveling(submission, version, patch): not comparable / duplicate / backup / move to another package of
--     the same job / notes. Insert-or-update with a version check; safe to repeat.
-- "Current" is computed, never written: per package and bidder, the latest candidate (not duplicate, not backup) by
-- bid date then receipt is current and the rest are superseded; bid_submissions.superseded_by ranks a row last.

-- ---------------------------------------------------------------------------
-- The board
-- ---------------------------------------------------------------------------
create or replace function public.bid_leveling_board(p_project_id uuid)
returns table (
  submission_id uuid,
  package_id uuid,               -- effective: reassigned, else original
  package_code text,
  original_package_id uuid,
  bidder text,                   -- sub company, else the member's company, else the extracted name, else the file
  bidder_key text,               -- bidder normalized (letters and digits, lower case): same key = same bidder
  bid_date date,                 -- the extracted bid date, else the day it was received (project zone)
  received_at timestamptz,
  receipt_number int,
  is_late boolean,
  document_kind text,
  prevailing_wage text,
  validity_days int,
  valid_until date,
  exclusions text[],
  project_match text,
  extraction_status text,
  state text,                    -- current | not_comparable | superseded | duplicate | backup
  replaced_by uuid,              -- for superseded / duplicate / backup: the submission that stands instead
  comparable boolean,
  is_duplicate boolean,
  is_backup boolean,
  notes text,
  leveling_version int,          -- null until a leveling row exists
  file_id uuid,
  base_amount numeric,
  base_evidence text,
  base_page int,
  pw_adder_amount numeric
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with access as (
    select (public.has_capability(p_project_id, 'bids.manage') and public.bids_open(p_project_id)) as allowed,
           public.has_capability(p_project_id, 'bids.view_pricing') as pricing,
           p.timezone
    from public.projects p
    where p.id = p_project_id and p.deleted_at is null
  ),
  base as (
    select s.id, s.package_id as original_package_id, coalesce(l.reassigned_package_id, s.package_id) as package_id,
           s.received_at, s.receipt_number, s.is_late, s.file_id, s.superseded_by,
           coalesce(nullif(su.company, ''), nullif(o.name, ''), nullif(pr.company, ''), nullif(x.bidder_name, ''),
                    nullif(pr.full_name, ''), nullif(split_part(pm.invite_email, '@', 1), ''), f.original_name, 'Bidder') as bidder,
           coalesce(x.bid_date, (s.received_at at time zone a.timezone)::date) as bid_date,
           x.document_kind, x.prevailing_wage, x.validity_days, coalesce(x.exclusions, '{}'::text[]) as exclusions,
           x.project_match, x.status as extraction_status,
           coalesce(l.comparable, true) as comparable, coalesce(l.is_duplicate, false) as is_duplicate,
           coalesce(l.is_backup, false) as is_backup, coalesce(l.notes, '') as notes, l.version as leveling_version,
           bp.base_amount, bp.base_evidence, bp.base_page, bp.pw_adder_amount
    from access a
    join public.bid_submissions s on s.project_id = p_project_id and s.deleted_at is null
    left join public.bid_leveling l on l.submission_id = s.id
    left join public.subs su on su.id = s.sub_id
    left join public.project_members pm on pm.id = s.member_id
    left join public.profiles pr on pr.user_id = pm.user_id
    left join public.orgs o on o.id = pm.member_org_id
    left join public.files f on f.id = s.file_id
    left join public.bid_extractions x on x.submission_id = s.id
    left join public.bid_extraction_pricing bp on bp.extraction_id = x.id and a.pricing   -- money: pricing callers only
    where a.allowed
  ),
  keyed as (
    select b.*, lower(regexp_replace(b.bidder, '[^a-zA-Z0-9]', '', 'g')) as bidder_key,
           (not b.is_duplicate and not b.is_backup) as candidate
    from base b
  ),
  latest as (
    -- The bid that stands for each bidder in each package: latest by bid date, then receipt; a row another
    -- submission superseded ranks last so it stands only when nothing else does.
    select distinct on (k.package_id, k.bidder_key) k.package_id, k.bidder_key, k.id as latest_id
    from keyed k
    where k.candidate
    order by k.package_id, k.bidder_key, (k.superseded_by is null) desc, k.bid_date desc, k.received_at desc, k.id desc
  )
  select k.id, k.package_id, bp.code, k.original_package_id, k.bidder, k.bidder_key, k.bid_date, k.received_at,
         k.receipt_number, k.is_late, k.document_kind, k.prevailing_wage, k.validity_days,
         case when k.validity_days is not null then k.bid_date + k.validity_days end as valid_until,
         k.exclusions, k.project_match, k.extraction_status,
         case when k.is_duplicate then 'duplicate'
              when k.is_backup then 'backup'
              when k.id is distinct from lt.latest_id then 'superseded'
              when not k.comparable then 'not_comparable'
              else 'current' end as state,
         case when k.is_duplicate or k.is_backup or k.id is distinct from lt.latest_id then lt.latest_id end as replaced_by,
         k.comparable, k.is_duplicate, k.is_backup, k.notes, k.leveling_version, k.file_id,
         k.base_amount, k.base_evidence, k.base_page, k.pw_adder_amount
  from keyed k
  join public.bid_packages bp on bp.id = k.package_id
  left join latest lt on lt.package_id = k.package_id and lt.bidder_key = k.bidder_key
  order by bp.code, k.bidder, k.bid_date desc, k.received_at desc;
$$;
revoke execute on function public.bid_leveling_board(uuid) from public, anon;
grant execute on function public.bid_leveling_board(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Flags (SPEC §11.6 "Flags"). Package-level ones carry a null submission_id.
-- ---------------------------------------------------------------------------
create or replace function public.bid_flags(p_project_id uuid)
returns table (package_id uuid, submission_id uuid, kind text, detail text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with access as (
    select (public.has_capability(p_project_id, 'bids.manage') and public.bids_open(p_project_id)) as allowed,
           public.has_capability(p_project_id, 'bids.view_pricing') as pricing,
           p.prevailing_wage,
           -- Validity is judged against bid day (project zone), or today when the job has no bid time.
           coalesce((p.bid_due_at at time zone p.timezone)::date, (now() at time zone p.timezone)::date) as due_day
    from public.projects p
    where p.id = p_project_id and p.deleted_at is null
  ),
  board as (select * from public.bid_leveling_board(p_project_id)),
  cur as (select * from board where state = 'current'),
  counts as (
    select bp.id as package_id, count(c.submission_id) as n
    from public.bid_packages bp
    left join cur c on c.package_id = bp.id
    where bp.project_id = p_project_id and bp.deleted_at is null
    group by bp.id
  )
  -- "prevailing wage not stated on a PW job"
  select c.package_id, c.submission_id, 'pw_not_stated',
         case c.prevailing_wage when 'excluded' then 'Prevailing wage excluded' else 'Prevailing wage not stated' end
  from cur c, access a
  where a.allowed and a.prevailing_wage and c.prevailing_wage in ('not_stated', 'excluded')
  union all
  -- "stale or expired validity"
  select c.package_id, c.submission_id, 'stale', 'Expired ' || to_char(c.valid_until, 'FMMM/FMDD/YYYY')
  from cur c, access a
  where a.allowed and c.valid_until is not null and c.valid_until < a.due_day
  union all
  -- "escalation compared with the bidder's earlier price": 5% or more over the bidder's first price in the package.
  -- Money-dependent, so only pricing callers get it (the board carries no amounts for anyone else).
  select c.package_id, c.submission_id, 'escalation',
         '+' || to_char(round((c.base_amount / e.base_amount - 1) * 100, 1), 'FM999990.0') || '% since ' || to_char(e.bid_date, 'FMMM/FMDD/YYYY')
  from cur c
  cross join lateral (
    select b2.base_amount, b2.bid_date
    from board b2
    where b2.package_id = c.package_id and b2.bidder_key = c.bidder_key and b2.state = 'superseded' and b2.base_amount > 0
    order by b2.bid_date, b2.received_at
    limit 1
  ) e, access a
  where a.allowed and a.pricing and c.base_amount is not null and c.base_amount >= e.base_amount * 1.05
  union all
  -- "single-bid packages"
  select k.package_id, null, 'single_bid', 'One bid' from counts k, access a where a.allowed and k.n = 1
  union all
  -- "scope gaps: a package with no bids"
  select k.package_id, null, 'no_bids', 'No bids' from counts k, access a where a.allowed and k.n = 0
  union all
  -- "document mismatch (the quote is for a different project)"
  select c.package_id, c.submission_id, 'mismatch', 'Different project' from cur c, access a where a.allowed and c.project_match = 'mismatch'
  union all
  -- Manual flags a person put on the bid: bid_leveling.flags = [{kind, detail}].
  select b.package_id, b.submission_id, f->>'kind', coalesce(f->>'detail', '')
  from board b
  join public.bid_leveling l on l.submission_id = b.submission_id
  cross join lateral jsonb_array_elements(case when jsonb_typeof(l.flags) = 'array' then l.flags else '[]'::jsonb end) f, access a
  where a.allowed and nullif(f->>'kind', '') is not null;
$$;
revoke execute on function public.bid_flags(uuid) from public, anon;
grant execute on function public.bid_flags(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Leveling decisions: one row per submission in bid_leveling, made on first use.
--   p_version: the leveling row's version as last read, 0 when no row existed yet; a mismatch is 40001.
--   p_patch:   any of comparable, is_duplicate, is_backup, reassigned_package_id (null = back to its own package), notes.
-- ---------------------------------------------------------------------------
create or replace function public.set_bid_leveling(p_submission_id uuid, p_version int, p_patch jsonb)
returns public.bid_leveling
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare s public.bid_submissions; l public.bid_leveling; pkg uuid;
begin
  select * into s from public.bid_submissions where id = p_submission_id and deleted_at is null;
  if s is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not (public.has_capability(s.project_id, 'bids.manage') and public.bids_open(s.project_id)) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then raise exception 'patch must be an object' using errcode = '22023'; end if;

  if p_patch ? 'reassigned_package_id' and p_patch->>'reassigned_package_id' is not null then
    pkg := (p_patch->>'reassigned_package_id')::uuid;
    if pkg = s.package_id then
      pkg := null;
    elsif not exists (select 1 from public.bid_packages bp where bp.id = pkg and bp.project_id = s.project_id and bp.deleted_at is null) then
      raise exception 'package not on this job' using errcode = '22023';
    end if;
  end if;

  select * into l from public.bid_leveling where submission_id = s.id for update;
  if l.submission_id is null then
    if coalesce(p_version, 0) <> 0 then raise exception 'conflict' using errcode = '40001'; end if;
    insert into public.bid_leveling (submission_id, project_id, comparable, is_duplicate, is_backup, reassigned_package_id, notes)
    values (s.id, s.project_id,
            coalesce((p_patch->>'comparable')::boolean, true),
            coalesce((p_patch->>'is_duplicate')::boolean, false),
            coalesce((p_patch->>'is_backup')::boolean, false),
            pkg,
            coalesce(left(p_patch->>'notes', 2000), ''))
    returning * into l;
  else
    if l.version is distinct from p_version then raise exception 'conflict' using errcode = '40001'; end if;
    update public.bid_leveling set
      comparable = coalesce((p_patch->>'comparable')::boolean, comparable),
      is_duplicate = coalesce((p_patch->>'is_duplicate')::boolean, is_duplicate),
      is_backup = coalesce((p_patch->>'is_backup')::boolean, is_backup),
      reassigned_package_id = case when p_patch ? 'reassigned_package_id' then pkg else reassigned_package_id end,
      notes = case when p_patch ? 'notes' then coalesce(left(p_patch->>'notes', 2000), '') else notes end
    where submission_id = s.id
    returning * into l;
  end if;
  perform public.audit('bid.level', 'bid_submission', s.id, s.project_id, s.org_id, jsonb_build_object('patch', p_patch), null);
  return l;
end;
$$;
revoke execute on function public.set_bid_leveling(uuid, int, jsonb) from public, anon;
grant execute on function public.set_bid_leveling(uuid, int, jsonb) to authenticated, service_role;
