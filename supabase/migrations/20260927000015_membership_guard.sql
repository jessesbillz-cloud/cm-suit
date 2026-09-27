-- 0015 Membership guard. Closes: make a company (anyone signed in can), then insert yourself into someone else's job
-- as "that company's admin" -- the project_members policies trust the org_id written on the row.
--   * A membership row's org_id must be its job's company: a composite foreign key, so it holds for every writer and
--     is_org_admin(org_id) in those policies always means "runs this job's company".
--   * submit_bid holds the job row while it records a bid, so lifting a seal can't slip in between (the seal guard
--     then sees the bid).

alter table public.projects add constraint projects_id_org unique (id, org_id);
alter table public.project_members add constraint project_members_project_org_fk
  foreign key (project_id, org_id) references public.projects (id, org_id);

create or replace function public.submit_bid(p_package_id uuid, p_file_id uuid)
returns public.bid_submissions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare pk public.bid_packages; f public.files; mid uuid; prev public.bid_submissions; s public.bid_submissions;
        due timestamptz; inv public.bid_invites;
begin
  select * into pk from public.bid_packages where id = p_package_id and deleted_at is null;
  if pk is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  mid := public.my_bidder_member_id(pk.project_id);
  if mid is null or not public.has_scope(pk.project_id, 'bid_package', pk.id::text) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into f from public.files where id = p_file_id and deleted_at is null and project_id = pk.project_id and created_by = auth.uid();
  if f is null then raise exception 'file not found or not yours' using errcode = 'P0002'; end if;
  -- FOR SHARE: a concurrent change to the seal or bid time waits for this bid, and the seal guard then sees it.
  select bid_due_at into due from public.projects where id = pk.project_id for share;
  select * into prev from public.bid_submissions
   where package_id = pk.id and member_id = mid and superseded_by is null and deleted_at is null
   order by version_no desc limit 1;
  insert into public.bid_submissions (org_id, project_id, package_id, member_id, file_id, receipt_number, is_late, version_no, created_by)
  values (pk.org_id, pk.project_id, pk.id, mid, f.id, public.next_number(pk.project_id, 'bid_receipt'),
          due is not null and now() > due, coalesce(prev.version_no, 0) + 1, auth.uid())
  returning * into s;
  if prev.id is not null then update public.bid_submissions set superseded_by = s.id where id = prev.id; end if;
  update public.bid_invites set status = case when s.is_late then 'late' else 'submitted' end, responded_at = now()
   where package_id = pk.id and member_id = mid returning * into inv;
  if inv.sub_id is not null then
    insert into public.sub_history (org_id, sub_id, project_id, kind, details)
    values (inv.org_id, inv.sub_id, inv.project_id, 'submitted', jsonb_build_object('package_id', pk.id, 'receipt', s.receipt_number, 'late', s.is_late));
  end if;
  perform public.audit('bid.submit', 'bid_submission', s.id, pk.project_id, pk.org_id,
    jsonb_build_object('package', pk.code, 'receipt', s.receipt_number, 'late', s.is_late, 'version', s.version_no), f.sha256);
  perform public.post_activity(pk.project_id, 'bid.received', pk.code || ': bid received' || case when s.is_late then ' (late)' else '' end,
    'bid_submission', s.id, 'bids.manage');
  return s;
end;
$$;
revoke execute on function public.submit_bid(uuid, uuid) from public, anon;
grant execute on function public.submit_bid(uuid, uuid) to authenticated, service_role;
