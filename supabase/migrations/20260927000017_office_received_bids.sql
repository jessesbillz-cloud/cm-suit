-- 0017 Bids the office receives (SPEC §11.4 "or email it", §11.6). Matt records bids that come by email, paper or an
-- old job folder: the file goes into "Bids received" (pricing roles can already write there, at aal2) and becomes a
-- submission with no bidder member, tied to a sub in the directory once the bidder is known.
--   * bid_submissions.member_id is optional; received_by names the office person who recorded it; sub_id links the
--     directory. A row always has one of member_id / received_by.
--   * One submission per file.
--   * record_received_bid(file, package, sub?) and set_submission_sub(submission, sub): bids.manage only.

alter table public.bid_submissions alter column member_id drop not null;
alter table public.bid_submissions add column sub_id uuid references public.subs(id);
alter table public.bid_submissions add column received_by uuid references auth.users(id);
alter table public.bid_submissions add constraint bid_submissions_who check (member_id is not null or received_by is not null);
create unique index bid_submissions_file on public.bid_submissions (file_id) where deleted_at is null;
create index bid_submissions_sub on public.bid_submissions (sub_id) where sub_id is not null;

-- ---------------------------------------------------------------------------
-- record_received_bid: the caller uploaded the file into this job's "Bids received"; it becomes a numbered receipt.
-- Safe to repeat: the same file returns the same submission. The receipt time is the server time of recording.
-- ---------------------------------------------------------------------------
create or replace function public.record_received_bid(p_file_id uuid, p_package_id uuid, p_sub_id uuid default null)
returns table (submission_id uuid, receipt_number int)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare pk public.bid_packages; f public.files; fo public.folders; su public.subs; prev public.bid_submissions;
        s public.bid_submissions; due timestamptz;
begin
  select * into pk from public.bid_packages where id = p_package_id and deleted_at is null;
  if pk is null then raise exception 'package not found' using errcode = 'P0002'; end if;
  if not public.has_capability(pk.project_id, 'bids.manage') then raise exception 'forbidden' using errcode = '42501'; end if;

  select * into f from public.files where id = p_file_id and deleted_at is null and project_id = pk.project_id and created_by = auth.uid();
  if f is null then raise exception 'file not found or not yours' using errcode = 'P0002'; end if;
  select * into fo from public.folders where id = f.folder_id;
  if fo.kind <> 'bids_received' then raise exception 'the file is not in Bids received' using errcode = '22023'; end if;

  if p_sub_id is not null then
    select * into su from public.subs where id = p_sub_id and org_id = pk.org_id and deleted_at is null;
    if su is null then raise exception 'sub not found' using errcode = 'P0002'; end if;
  end if;

  -- Repeat: the file already has its submission.
  select * into s from public.bid_submissions where file_id = f.id and deleted_at is null;
  if s.id is not null then
    submission_id := s.id; receipt_number := s.receipt_number; return next; return;
  end if;

  -- Same lock order as submit_bid, so a seal or bid-time change waits for this receipt.
  select bid_due_at into due from public.projects where id = pk.project_id for share;
  if p_sub_id is not null then
    select * into prev from public.bid_submissions
     where package_id = pk.id and sub_id = p_sub_id and superseded_by is null and deleted_at is null
     order by version_no desc limit 1;
  end if;

  insert into public.bid_submissions (org_id, project_id, package_id, member_id, sub_id, received_by, file_id, receipt_number,
                                      is_late, version_no, source, created_by)
  values (pk.org_id, pk.project_id, pk.id, null, p_sub_id, auth.uid(), f.id, public.next_number(pk.project_id, 'bid_receipt'),
          due is not null and now() > due, coalesce(prev.version_no, 0) + 1, 'upload', auth.uid())
  returning * into s;
  if prev.id is not null then update public.bid_submissions set superseded_by = s.id where id = prev.id; end if;
  if p_sub_id is not null then
    insert into public.sub_history (org_id, sub_id, project_id, kind, details)
    values (pk.org_id, p_sub_id, pk.project_id, 'submitted', jsonb_build_object('package_id', pk.id, 'receipt', s.receipt_number, 'recorded', true));
  end if;
  perform public.audit('bid.record', 'bid_submission', s.id, pk.project_id, pk.org_id,
    jsonb_build_object('package', pk.code, 'receipt', s.receipt_number, 'file', f.original_name), f.sha256);
  submission_id := s.id; receipt_number := s.receipt_number; return next;
end;
$$;
revoke execute on function public.record_received_bid(uuid, uuid, uuid) from public, anon;
grant execute on function public.record_received_bid(uuid, uuid, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- set_submission_sub: link a received bid to the sub who sent it (after reading it). Office-recorded bids only; a
-- bidder's own submission already names its member.
-- ---------------------------------------------------------------------------
create or replace function public.set_submission_sub(p_submission_id uuid, p_sub_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare s public.bid_submissions; su public.subs;
begin
  select * into s from public.bid_submissions where id = p_submission_id and deleted_at is null;
  if s is null then raise exception 'not found' using errcode = 'P0002'; end if;
  if not (public.has_capability(s.project_id, 'bids.manage') and public.bids_open(s.project_id)) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if s.member_id is not null then raise exception 'a bidder''s own submission' using errcode = '22023'; end if;
  if p_sub_id is not null then
    select * into su from public.subs where id = p_sub_id and org_id = s.org_id and deleted_at is null;
    if su is null then raise exception 'sub not found' using errcode = 'P0002'; end if;
  end if;
  update public.bid_submissions set sub_id = p_sub_id where id = s.id;
  if p_sub_id is not null and s.sub_id is distinct from p_sub_id then
    insert into public.sub_history (org_id, sub_id, project_id, kind, details)
    values (s.org_id, p_sub_id, s.project_id, 'submitted', jsonb_build_object('package_id', s.package_id, 'receipt', s.receipt_number, 'recorded', true));
  end if;
  perform public.audit('bid.set_sub', 'bid_submission', s.id, s.project_id, s.org_id, jsonb_build_object('sub_id', p_sub_id), null);
end;
$$;
revoke execute on function public.set_submission_sub(uuid, uuid) from public, anon;
grant execute on function public.set_submission_sub(uuid, uuid) to authenticated, service_role;
