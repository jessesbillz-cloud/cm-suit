-- 0032 The bids pipeline across jobs (Jesse, Sep 28): "All my jobs" gets a Bids screen, one row per job I run bids
-- on in the prospect, bidding, awarded or lost stage, so I can see which to work on first and open its bid package.
--   * bid_pipeline(): per job, bids.manage decides (has_capability), so a bidder or a sub on the job gets nothing.
--   * Counts only: packages, packages with at least one current bid, current bids, invites, open questions. Never
--     money and never who bid. A sealed job shows the same counts the coverage board shows while sealed.

create or replace function public.bid_pipeline()
returns table (
  project_id uuid,
  name text,
  number text,
  org_name text,
  stage text,
  timezone text,
  bid_due_at timestamptz,
  packages bigint,
  packages_covered bigint,
  bids_in bigint,
  invited bigint,
  open_questions bigint
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with mine as (
    select distinct p.id
    from public.project_members pm
    join public.projects p on p.id = pm.project_id and p.deleted_at is null
    where pm.user_id = auth.uid() and pm.status = 'active'
      and (pm.access_ends_at is null or pm.access_ends_at > now())
      and p.stage in ('prospect', 'bidding', 'awarded', 'lost')
      and public.has_capability(p.id, 'bids.manage')
  ),
  live_packages as (
    select bp.id, bp.project_id
    from public.bid_packages bp
    join mine on mine.id = bp.project_id
    where bp.deleted_at is null
  ),
  -- One per bidder per package, as on the coverage board (0019): an invited bidder by member, an office-recorded bid
  -- by its directory sub, an unlinked office bid by itself.
  current_bids as (
    select s.project_id, s.package_id, coalesce(s.member_id::text, s.sub_id::text, s.id::text) as who
    from public.bid_submissions s
    join live_packages lp on lp.id = s.package_id
    where s.superseded_by is null and s.deleted_at is null
    group by s.project_id, s.package_id, coalesce(s.member_id::text, s.sub_id::text, s.id::text)
  )
  select p.id, p.name, p.number, o.name, p.stage, p.timezone, p.bid_due_at,
         (select count(*) from live_packages lp where lp.project_id = p.id),
         (select count(distinct cb.package_id) from current_bids cb where cb.project_id = p.id),
         (select count(*) from current_bids cb where cb.project_id = p.id),
         (select count(*) from public.bid_invites bi join live_packages lp on lp.id = bi.package_id
           where bi.project_id = p.id and bi.deleted_at is null),
         (select count(*) from public.bid_questions q
           where q.project_id = p.id and q.status = 'open' and q.deleted_at is null)
  from mine
  join public.projects p on p.id = mine.id
  join public.orgs o on o.id = p.org_id
  order by p.bid_due_at nulls last, p.name;
$$;
revoke execute on function public.bid_pipeline() from public, anon;
grant execute on function public.bid_pipeline() to authenticated;
