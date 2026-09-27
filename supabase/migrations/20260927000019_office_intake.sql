-- 0019 Office intake (SPEC §11.6): the coverage board counts what was actually received. "Submitted" and "late" come
-- from the current (not superseded) submissions of a package, one per bidder: an invited bidder counts by member, an
-- office-recorded bid by its directory sub, and an unlinked office bid by itself. Invited / bidding / declined /
-- opened still come from the invites. Same signature and columns as before; bids.manage only, as before.
create or replace function public.bid_coverage(p_project_id uuid)
returns table (package_id uuid, code text, name text, invited bigint, intends bigint, declined bigint, submitted bigint, late bigint, opened bigint)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with bidders as (
    select s.package_id, coalesce(s.member_id::text, s.sub_id::text, s.id::text) as who, bool_or(s.is_late) as late
    from public.bid_submissions s
    where s.project_id = p_project_id and s.superseded_by is null and s.deleted_at is null
    group by s.package_id, coalesce(s.member_id::text, s.sub_id::text, s.id::text)
  )
  select bp.id, bp.code, bp.name,
         (select count(*) from public.bid_invites bi where bi.package_id = bp.id),
         (select count(*) from public.bid_invites bi where bi.package_id = bp.id and bi.status = 'intends'),
         (select count(*) from public.bid_invites bi where bi.package_id = bp.id and bi.status = 'declined'),
         (select count(*) from bidders b where b.package_id = bp.id),
         (select count(*) from bidders b where b.package_id = bp.id and b.late),
         (select count(*) from public.bid_invites bi where bi.package_id = bp.id and bi.opened_at is not null)
  from public.bid_packages bp
  where bp.project_id = p_project_id and bp.deleted_at is null and public.has_capability(p_project_id, 'bids.manage')
  order by bp.code;
$$;
revoke execute on function public.bid_coverage(uuid) from public, anon;
grant execute on function public.bid_coverage(uuid) to authenticated, service_role;
