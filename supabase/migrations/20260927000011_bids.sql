-- 0011 Phase 1 — Bids (SPEC §11). Packages, sub directory, invites, the bidder wall, submissions and receipts,
-- extraction (money in its own table), questions and anonymized answers, addenda and acknowledgments.
--
-- Access rules (SPEC §5.2, §11.4):
--   * bids.manage   — estimator / project_admin: everything except money.
--   * bids.view_pricing (aal2) — money tables and received bid files.
--   * bids.submit   — a bidder: only their own packages (member_scopes 'bid_package'), own invites, own submissions,
--                     own questions; never another bidder's name, price, question, file or existence.
--   * Sealed bids: while projects.bid_sealed and now() < bid_due_at, nobody reads submissions but the submitter.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
-- The caller's own bidder membership on a project (null when not a bidder there).
create or replace function public.my_bidder_member_id(p_project_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select pm.id from public.project_members pm
  join public.role_permissions rp on rp.role = pm.role and rp.capability = 'bids.submit'
  where pm.project_id = p_project_id and pm.user_id = auth.uid() and pm.status = 'active'
    and (pm.access_ends_at is null or pm.access_ends_at > now())
  limit 1;
$$;
revoke execute on function public.my_bidder_member_id(uuid) from public, anon;
grant execute on function public.my_bidder_member_id(uuid) to authenticated, service_role;

-- Sealed-bid gate: true when submissions may be opened by the project side.
create or replace function public.bids_open(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (select 1 from public.projects p where p.id = p_project_id
                 and (not p.bid_sealed or p.bid_due_at is null or p.bid_due_at <= now()));
$$;
revoke execute on function public.bids_open(uuid) from public, anon;
grant execute on function public.bids_open(uuid) to authenticated, service_role;

-- Bidders upload into the pricing-only "Bids received" folder (SPEC §5.2): write allowed there for a bidder,
-- read stays pricing-only (their own file is visible through files.created_by).
create or replace function public.folder_can_write(p_folder_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare fo public.folders; eff uuid;
begin
  select * into fo from public.folders where id = p_folder_id and deleted_at is null;
  if fo is null or not public.is_member(fo.project_id) then return false; end if;
  if fo.kind = 'bids_received' and public.my_bidder_member_id(fo.project_id) is not null then return true; end if;
  eff := public.folder_effective_id(p_folder_id);
  if eff is null then
    return public.has_capability(fo.project_id, 'files.manage') or public.has_capability(fo.project_id, 'files.write_project');
  end if;
  return exists (
    select 1 from public.folder_access fa
    where fa.folder_id = eff and fa.can_write
      and ((fa.user_id = auth.uid()) or (fa.capability is not null and public.has_capability(fo.project_id, fa.capability)))
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Packages (Matt's scheme: 01A GCs, 01B site, 02A–33B trades)
-- ---------------------------------------------------------------------------
create table public.bid_packages (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  version int not null default 1,
  deleted_at timestamptz,
  org_id uuid not null references public.orgs(id),
  project_id uuid not null references public.projects(id),
  code text not null check (code ~ '^[0-9]{2}[A-Z]$'),
  name text not null check (length(name) between 1 and 200),
  scope_text text not null default '',
  sort int not null default 0,
  unique (project_id, code)
);
alter table public.bid_packages enable row level security;
create trigger touch before update on public.bid_packages for each row execute function public.tg_touch_row();
create trigger no_delete before delete on public.bid_packages for each row execute function public.tg_block_delete();
create trigger audit_row after insert or update on public.bid_packages for each row execute function public.tg_audit_row();
create index bid_packages_project on public.bid_packages (project_id) where deleted_at is null;

create policy "bid_packages: managers read" on public.bid_packages for select to authenticated
  using (deleted_at is null and (public.has_capability(project_id, 'bids.manage')
         or public.has_scope(project_id, 'bid_package', id::text)));
create policy "bid_packages: managers write" on public.bid_packages for insert to authenticated
  with check (public.has_capability(project_id, 'bids.manage') and created_by = auth.uid()
              and org_id = (select org_id from public.projects where id = project_id));
create policy "bid_packages: managers update" on public.bid_packages for update to authenticated
  using (public.has_capability(project_id, 'bids.manage')) with check (public.has_capability(project_id, 'bids.manage'));

-- ---------------------------------------------------------------------------
-- Sub directory (org-level)
-- ---------------------------------------------------------------------------
create table public.subs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  version int not null default 1,
  deleted_at timestamptz,
  org_id uuid not null references public.orgs(id),
  company text not null check (length(company) between 1 and 200),
  contacts jsonb not null default '[]'::jsonb,        -- [{name, email, phone, title}]
  trades text[] not null default '{}',                -- package codes
  region text,
  cslb_number text,
  cslb_status text check (cslb_status in ('active', 'inactive', 'suspended', 'expired', 'unknown')),
  cslb_checked_at timestamptz,
  dir_number text,
  notes text not null default ''
);
alter table public.subs enable row level security;
create trigger touch before update on public.subs for each row execute function public.tg_touch_row();
create trigger no_delete before delete on public.subs for each row execute function public.tg_block_delete();
create index subs_org on public.subs (org_id) where deleted_at is null;
create index subs_trades on public.subs using gin (trades);
create unique index subs_org_company on public.subs (org_id, lower(company)) where deleted_at is null;

-- Org members read and write their own directory.
create policy "subs: org read" on public.subs for select to authenticated
  using (deleted_at is null and exists (select 1 from public.org_members om where om.org_id = subs.org_id and om.user_id = auth.uid()));
create policy "subs: org insert" on public.subs for insert to authenticated
  with check (created_by = auth.uid() and exists (select 1 from public.org_members om where om.org_id = subs.org_id and om.user_id = auth.uid()));
create policy "subs: org update" on public.subs for update to authenticated
  using (exists (select 1 from public.org_members om where om.org_id = subs.org_id and om.user_id = auth.uid()))
  with check (exists (select 1 from public.org_members om where om.org_id = subs.org_id and om.user_id = auth.uid()));

-- History: every invite, bid and award adds a line (written by RPCs / functions).
create table public.sub_history (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  org_id uuid not null references public.orgs(id),
  sub_id uuid not null references public.subs(id),
  project_id uuid references public.projects(id),
  kind text not null check (kind in ('invited', 'declined', 'intends', 'submitted', 'awarded', 'note')),
  details jsonb not null default '{}'::jsonb
);
alter table public.sub_history enable row level security;
create index sub_history_sub on public.sub_history (sub_id, at desc);
create policy "sub_history: org read" on public.sub_history for select to authenticated
  using (exists (select 1 from public.org_members om where om.org_id = sub_history.org_id and om.user_id = auth.uid()));

-- ---------------------------------------------------------------------------
-- Invites: one row per (package, bidder member)
-- ---------------------------------------------------------------------------
create table public.bid_invites (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  version int not null default 1,
  deleted_at timestamptz,
  org_id uuid not null references public.orgs(id),
  project_id uuid not null references public.projects(id),
  package_id uuid not null references public.bid_packages(id),
  member_id uuid not null references public.project_members(id),
  sub_id uuid references public.subs(id),
  status text not null default 'sent'
    check (status in ('sent', 'delivered', 'bounced', 'opened', 'intends', 'declined', 'submitted', 'late')),
  decline_reason text,
  sent_at timestamptz not null default now(),
  opened_at timestamptz,
  responded_at timestamptz,
  unique (package_id, member_id)
);
alter table public.bid_invites enable row level security;
create trigger touch before update on public.bid_invites for each row execute function public.tg_touch_row();
create trigger no_delete before delete on public.bid_invites for each row execute function public.tg_block_delete();
create trigger audit_row after insert or update on public.bid_invites for each row execute function public.tg_audit_row();
create index bid_invites_project on public.bid_invites (project_id, package_id);
create index bid_invites_member on public.bid_invites (member_id);

-- Bidders see only their own invites (existence of others is hidden).
create policy "bid_invites: managers or own" on public.bid_invites for select to authenticated
  using (public.has_capability(project_id, 'bids.manage') or member_id = public.my_bidder_member_id(project_id));
-- Writes go through invite-bidders (service role) and the RPCs below.

-- Bidder intent: intends / declined, own invite only.
create or replace function public.set_bid_intent(p_invite_id uuid, p_intent text, p_reason text default null)
returns public.bid_invites
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare inv public.bid_invites;
begin
  if p_intent not in ('intends', 'declined') then raise exception 'intent must be intends or declined'; end if;
  select * into inv from public.bid_invites where id = p_invite_id;
  if inv is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if inv.member_id is distinct from public.my_bidder_member_id(inv.project_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if inv.status in ('submitted', 'late') then return inv; end if;
  update public.bid_invites set status = p_intent, decline_reason = case when p_intent = 'declined' then left(p_reason, 500) end,
         responded_at = now()
   where id = p_invite_id returning * into inv;
  if inv.sub_id is not null then
    insert into public.sub_history (org_id, sub_id, project_id, kind, details)
    values (inv.org_id, inv.sub_id, inv.project_id, p_intent, jsonb_build_object('package_id', inv.package_id, 'reason', p_reason));
  end if;
  perform public.post_activity(inv.project_id, 'bid.intent',
    (select code from public.bid_packages where id = inv.package_id) || ': bidder ' || p_intent, 'bid_invite', inv.id, 'bids.manage');
  return inv;
end;
$$;
revoke execute on function public.set_bid_intent(uuid, text, text) from public, anon;
grant execute on function public.set_bid_intent(uuid, text, text) to authenticated, service_role;

-- Opening the bidder page marks the invite opened (silent).
create or replace function public.mark_invite_opened(p_project_id uuid)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.bid_invites set status = 'opened', opened_at = coalesce(opened_at, now())
   where project_id = p_project_id and member_id = public.my_bidder_member_id(p_project_id)
     and status in ('sent', 'delivered');
$$;
revoke execute on function public.mark_invite_opened(uuid) from public, anon;
grant execute on function public.mark_invite_opened(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Submissions and receipts
-- ---------------------------------------------------------------------------
create table public.bid_submissions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  version int not null default 1,
  deleted_at timestamptz,
  org_id uuid not null references public.orgs(id),
  project_id uuid not null references public.projects(id),
  package_id uuid not null references public.bid_packages(id),
  member_id uuid not null references public.project_members(id),
  file_id uuid not null references public.files(id),
  receipt_number int not null,
  received_at timestamptz not null default now(),   -- server time = the official time
  is_late boolean not null default false,
  version_no int not null default 1,
  superseded_by uuid references public.bid_submissions(id),
  source text not null default 'upload' check (source in ('upload', 'email')),
  unique (project_id, receipt_number)
);
alter table public.bid_submissions enable row level security;
create trigger touch before update on public.bid_submissions for each row execute function public.tg_touch_row();
create trigger no_delete before delete on public.bid_submissions for each row execute function public.tg_block_delete();
create trigger audit_row after insert or update on public.bid_submissions for each row execute function public.tg_audit_row();
create index bid_submissions_package on public.bid_submissions (package_id, member_id);
insert into public.owner_lookup (entity_type, table_name) values ('bid_submission', 'bid_submissions');

-- Own submissions always; the project side only when bids are open (sealed rule) and with bids.manage.
create policy "bid_submissions: own or managers when open" on public.bid_submissions for select to authenticated
  using (deleted_at is null and (
    member_id = public.my_bidder_member_id(project_id)
    or (public.has_capability(project_id, 'bids.manage') and public.bids_open(project_id))));

-- submit_bid: the bidder registers an uploaded file as their bid for a package. Receipt number from the database,
-- server receipt time, late flag from bid_due_at. Earlier versions are superseded, never deleted.
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
  select bid_due_at into due from public.projects where id = pk.project_id;
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

-- ---------------------------------------------------------------------------
-- Extraction: findings (no money) and pricing (money) in separate tables. Drafts a person confirms.
-- ---------------------------------------------------------------------------
create table public.bid_extractions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version int not null default 1,
  org_id uuid not null references public.orgs(id),
  project_id uuid not null references public.projects(id),
  submission_id uuid not null references public.bid_submissions(id) unique,
  status text not null default 'draft' check (status in ('draft', 'confirmed', 'rejected')),
  bidder_name text,
  bid_date date,
  document_kind text,
  prevailing_wage text check (prevailing_wage in ('included', 'excluded', 'adder', 'not_stated')),
  prevailing_wage_evidence text,
  validity_days int,
  scope_summary text,
  inclusions text[] not null default '{}',
  exclusions text[] not null default '{}',
  notable_terms text[] not null default '{}',
  project_match text check (project_match in ('match', 'mismatch', 'unclear')),
  confidence numeric(3,2),
  model text,
  confirmed_by uuid references auth.users(id),
  confirmed_at timestamptz
);
alter table public.bid_extractions enable row level security;
create trigger touch before update on public.bid_extractions for each row execute function public.tg_touch_row();
create policy "bid_extractions: findings readers when open" on public.bid_extractions for select to authenticated
  using (public.has_capability(project_id, 'bids.view_ai_findings') and public.bids_open(project_id));
create policy "bid_extractions: findings readers confirm" on public.bid_extractions for update to authenticated
  using (public.has_capability(project_id, 'bids.view_ai_findings') and public.bids_open(project_id))
  with check (public.has_capability(project_id, 'bids.view_ai_findings'));

create table public.bid_extraction_pricing (
  extraction_id uuid primary key references public.bid_extractions(id) on delete cascade,
  project_id uuid not null references public.projects(id),
  base_amount numeric(14,2),
  base_evidence text,
  base_page int,
  alternates jsonb not null default '[]'::jsonb,     -- [{label, amount, evidence, page}]
  unit_prices jsonb not null default '[]'::jsonb,
  adds_deducts jsonb not null default '[]'::jsonb,
  pw_adder_amount numeric(14,2)
);
alter table public.bid_extraction_pricing enable row level security;
create policy "bid_pricing: pricing readers when open" on public.bid_extraction_pricing for select to authenticated
  using (public.has_capability(project_id, 'bids.view_pricing') and public.bids_open(project_id));
create policy "bid_pricing: pricing readers edit" on public.bid_extraction_pricing for update to authenticated
  using (public.has_capability(project_id, 'bids.view_pricing') and public.bids_open(project_id))
  with check (public.has_capability(project_id, 'bids.view_pricing'));

-- Leveling notes and flags per submission (no money here).
create table public.bid_leveling (
  submission_id uuid primary key references public.bid_submissions(id) on delete cascade,
  project_id uuid not null references public.projects(id),
  updated_at timestamptz not null default now(),
  version int not null default 1,
  comparable boolean not null default true,
  is_duplicate boolean not null default false,
  is_backup boolean not null default false,
  reassigned_package_id uuid references public.bid_packages(id),
  flags jsonb not null default '[]'::jsonb,           -- [{kind, detail}]
  notes text not null default ''
);
alter table public.bid_leveling enable row level security;
create trigger touch before update on public.bid_leveling for each row execute function public.tg_touch_row();
create policy "bid_leveling: managers when open" on public.bid_leveling for all to authenticated
  using (public.has_capability(project_id, 'bids.manage') and public.bids_open(project_id))
  with check (public.has_capability(project_id, 'bids.manage'));

-- ---------------------------------------------------------------------------
-- Questions (bidder-private) and published answers (anonymized: no asker columns)
-- ---------------------------------------------------------------------------
create table public.bid_questions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  version int not null default 1,
  deleted_at timestamptz,
  org_id uuid not null references public.orgs(id),
  project_id uuid not null references public.projects(id),
  package_id uuid references public.bid_packages(id),
  member_id uuid references public.project_members(id),     -- asker; null when it came in by email from a non-member
  number int not null,
  question text not null check (length(question) between 1 and 5000),
  status text not null default 'open' check (status in ('open', 'answered', 'addendum', 'rfi', 'dismissed')),
  source text not null default 'page' check (source in ('page', 'email')),
  unique (project_id, number)
);
alter table public.bid_questions enable row level security;
create trigger touch before update on public.bid_questions for each row execute function public.tg_touch_row();
create trigger no_delete before delete on public.bid_questions for each row execute function public.tg_block_delete();
create trigger audit_row after insert or update on public.bid_questions for each row execute function public.tg_audit_row();
create index bid_questions_project on public.bid_questions (project_id, status);
create policy "bid_questions: managers or own" on public.bid_questions for select to authenticated
  using (public.has_capability(project_id, 'bids.manage') or member_id = public.my_bidder_member_id(project_id));
create policy "bid_questions: managers update" on public.bid_questions for update to authenticated
  using (public.has_capability(project_id, 'bids.manage')) with check (public.has_capability(project_id, 'bids.manage'));

create or replace function public.ask_bid_question(p_project_id uuid, p_package_id uuid, p_question text)
returns public.bid_questions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare mid uuid; q public.bid_questions; oid uuid;
begin
  mid := public.my_bidder_member_id(p_project_id);
  if mid is null then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_package_id is not null and not public.has_scope(p_project_id, 'bid_package', p_package_id::text) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select org_id into oid from public.projects where id = p_project_id;
  insert into public.bid_questions (org_id, project_id, package_id, member_id, number, question, created_by)
  values (oid, p_project_id, p_package_id, mid, public.next_number(p_project_id, 'bid_question'), p_question, auth.uid())
  returning * into q;
  perform public.post_activity(p_project_id, 'bid.question', 'Pre-bid question ' || q.number, 'bid_question', q.id, 'bids.manage');
  return q;
end;
$$;
revoke execute on function public.ask_bid_question(uuid, uuid, text) from public, anon;
grant execute on function public.ask_bid_question(uuid, uuid, text) to authenticated, service_role;

create table public.published_answers (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  version int not null default 1,
  deleted_at timestamptz,
  org_id uuid not null references public.orgs(id),
  project_id uuid not null references public.projects(id),
  package_id uuid references public.bid_packages(id),       -- null = all bidders on the job
  number int not null,                                       -- the question number it answers
  question_text text not null,                               -- reworded / anonymized by the answerer
  answer text not null,
  published_at timestamptz not null default now(),
  unique (project_id, number)
);
alter table public.published_answers enable row level security;
create trigger touch before update on public.published_answers for each row execute function public.tg_touch_row();
create trigger audit_row after insert or update on public.published_answers for each row execute function public.tg_audit_row();
-- Bidders see answers for the whole job or for their packages; managers see all. No asker anywhere in this table.
create policy "published_answers: read" on public.published_answers for select to authenticated
  using (public.has_capability(project_id, 'bids.manage')
         or (public.my_bidder_member_id(project_id) is not null
             and (package_id is null or public.has_scope(project_id, 'bid_package', package_id::text))));

create or replace function public.answer_bid_question(p_question_id uuid, p_question_text text, p_answer text, p_package_only boolean default false)
returns public.published_answers
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare q public.bid_questions; a public.published_answers;
begin
  select * into q from public.bid_questions where id = p_question_id;
  if q is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not public.has_capability(q.project_id, 'bids.manage') then raise exception 'forbidden' using errcode = '42501'; end if;
  insert into public.published_answers (org_id, project_id, package_id, number, question_text, answer, created_by)
  values (q.org_id, q.project_id, case when p_package_only then q.package_id end, q.number, p_question_text, p_answer, auth.uid())
  on conflict (project_id, number) do update set question_text = excluded.question_text, answer = excluded.answer,
    package_id = excluded.package_id, published_at = now()
  returning * into a;
  update public.bid_questions set status = 'answered' where id = q.id;
  perform public.post_activity(q.project_id, 'bid.answer', 'Answer ' || a.number || ' published', 'published_answer', a.id, 'bids.manage');
  return a;
end;
$$;
revoke execute on function public.answer_bid_question(uuid, text, text, boolean) from public, anon;
grant execute on function public.answer_bid_question(uuid, text, text, boolean) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Addenda (signed, numbered) and acknowledgments
-- ---------------------------------------------------------------------------
create table public.addenda (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  version int not null default 1,
  deleted_at timestamptz,
  org_id uuid not null references public.orgs(id),
  project_id uuid not null references public.projects(id),
  number int not null,
  title text not null check (length(title) between 1 and 300),
  body text not null default '',
  file_ids uuid[] not null default '{}',
  content_hash text,
  signed_at timestamptz,
  signed_by uuid references auth.users(id),
  issued_at timestamptz,
  unique (project_id, number)
);
alter table public.addenda enable row level security;
create trigger touch before update on public.addenda for each row execute function public.tg_touch_row();
create trigger no_delete before delete on public.addenda for each row execute function public.tg_block_delete();
create trigger audit_row after insert or update on public.addenda for each row execute function public.tg_audit_row();
-- Managers see drafts; bidders see issued addenda only.
create policy "addenda: read" on public.addenda for select to authenticated
  using (deleted_at is null and (public.has_capability(project_id, 'bids.manage')
         or (issued_at is not null and public.my_bidder_member_id(project_id) is not null)));
create policy "addenda: managers write" on public.addenda for insert to authenticated
  with check (public.has_capability(project_id, 'bids.manage') and created_by = auth.uid()
              and org_id = (select org_id from public.projects where id = project_id));
create policy "addenda: managers update drafts" on public.addenda for update to authenticated
  using (public.has_capability(project_id, 'bids.manage') and issued_at is null)
  with check (public.has_capability(project_id, 'bids.manage'));

create table public.addendum_acks (
  addendum_id uuid not null references public.addenda(id),
  member_id uuid not null references public.project_members(id),
  project_id uuid not null references public.projects(id),
  acked_at timestamptz not null default now(),
  primary key (addendum_id, member_id)
);
alter table public.addendum_acks enable row level security;
create policy "addendum_acks: managers or own" on public.addendum_acks for select to authenticated
  using (public.has_capability(project_id, 'bids.manage') or member_id = public.my_bidder_member_id(project_id));

-- Issue: numbers the addendum from the database, binds the content hash, notifies every bidder with a task.
-- Signing identity re-confirmation (SPEC §6.9) is enforced by the issue-addendum edge function before calling this.
create or replace function public.issue_addendum(p_addendum_id uuid, p_content_hash text)
returns public.addenda
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare a public.addenda; b record;
begin
  select * into a from public.addenda where id = p_addendum_id and deleted_at is null;
  if a is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not public.has_capability(a.project_id, 'bids.manage') then raise exception 'forbidden' using errcode = '42501'; end if;
  if a.issued_at is not null then return a; end if;
  update public.addenda set content_hash = p_content_hash, signed_at = now(), signed_by = auth.uid(), issued_at = now()
   where id = a.id returning * into a;
  perform public.audit('addendum.issue', 'addendum', a.id, a.project_id, a.org_id, jsonb_build_object('number', a.number), p_content_hash);
  for b in
    select distinct pm.user_id from public.project_members pm
    join public.role_permissions rp on rp.role = pm.role and rp.capability = 'bids.submit'
    where pm.project_id = a.project_id and pm.status = 'active' and pm.user_id is not null
  loop
    perform public.create_task(a.project_id, b.user_id, 'addendum_ack', 'Acknowledge addendum ' || a.number, 'addendum', a.id, null, false,
                               jsonb_build_object('addendum_id', a.id));
  end loop;
  perform public.post_activity(a.project_id, 'addendum.issued', 'Addendum ' || a.number || ' issued: ' || a.title, 'addendum', a.id, 'bids.manage');
  return a;
end;
$$;
revoke execute on function public.issue_addendum(uuid, text) from public, anon;
grant execute on function public.issue_addendum(uuid, text) to authenticated, service_role;

-- Draft creation numbers the addendum up front (unique per project); drafts are visible to managers only.
create or replace function public.create_addendum(p_project_id uuid, p_title text, p_body text, p_file_ids uuid[] default '{}')
returns public.addenda
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare a public.addenda; oid uuid;
begin
  if not public.has_capability(p_project_id, 'bids.manage') then raise exception 'forbidden' using errcode = '42501'; end if;
  select org_id into oid from public.projects where id = p_project_id;
  insert into public.addenda (org_id, project_id, number, title, body, file_ids, created_by)
  values (oid, p_project_id, public.next_number(p_project_id, 'addendum'), p_title, p_body, p_file_ids, auth.uid())
  returning * into a;
  return a;
end;
$$;
revoke execute on function public.create_addendum(uuid, text, text, uuid[]) from public, anon;
grant execute on function public.create_addendum(uuid, text, text, uuid[]) to authenticated, service_role;

-- One click: acknowledge (own membership only). Completes the matching task.
create or replace function public.acknowledge_addendum(p_addendum_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare a public.addenda; mid uuid;
begin
  select * into a from public.addenda where id = p_addendum_id and issued_at is not null and deleted_at is null;
  if a is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  mid := public.my_bidder_member_id(a.project_id);
  if mid is null then raise exception 'forbidden' using errcode = '42501'; end if;
  insert into public.addendum_acks (addendum_id, member_id, project_id) values (a.id, mid, a.project_id) on conflict do nothing;
  update public.tasks set done_at = now(), done_by = auth.uid()
   where assignee_user_id = auth.uid() and kind = 'addendum_ack' and entity_id = a.id and done_at is null;
  perform public.audit('addendum.ack', 'addendum', a.id, a.project_id, a.org_id, jsonb_build_object('member_id', mid));
end;
$$;
revoke execute on function public.acknowledge_addendum(uuid) from public, anon;
grant execute on function public.acknowledge_addendum(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Views for the two screens
-- ---------------------------------------------------------------------------
-- The bidder's page: only what this bidder may see.
create or replace function public.bidder_page(p_project_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare mid uuid; p public.projects;
begin
  mid := public.my_bidder_member_id(p_project_id);
  if mid is null then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into p from public.projects where id = p_project_id;
  return jsonb_build_object(
    'project', jsonb_build_object('id', p.id, 'name', p.name, 'number', p.number, 'address', p.address, 'timezone', p.timezone,
                                  'bid_due_at', p.bid_due_at, 'prevailing_wage', p.prevailing_wage, 'job_type', p.job_type),
    'upload_folder_id', (select f.id from public.folders f where f.project_id = p_project_id and f.kind = 'bids_received' and f.deleted_at is null order by f.created_at limit 1),
    'packages', coalesce((select jsonb_agg(jsonb_build_object('id', bp.id, 'code', bp.code, 'name', bp.name, 'scope_text', bp.scope_text,
                            'invite', (select jsonb_build_object('id', bi.id, 'status', bi.status) from public.bid_invites bi where bi.package_id = bp.id and bi.member_id = mid),
                            'submissions', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'receipt_number', s.receipt_number, 'received_at', s.received_at,
                                              'is_late', s.is_late, 'version_no', s.version_no, 'file_id', s.file_id, 'superseded', s.superseded_by is not null) order by s.version_no desc)
                                              from public.bid_submissions s where s.package_id = bp.id and s.member_id = mid and s.deleted_at is null), '[]'::jsonb))
                          order by bp.code)
                 from public.bid_packages bp join public.member_scopes ms on ms.scope_type = 'bid_package' and ms.scope_id = bp.id::text
                 where bp.project_id = p_project_id and bp.deleted_at is null and ms.project_member_id = mid), '[]'::jsonb),
    'addenda', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'number', a.number, 'title', a.title, 'body', a.body, 'file_ids', a.file_ids,
                            'issued_at', a.issued_at, 'acked_at', (select acked_at from public.addendum_acks k where k.addendum_id = a.id and k.member_id = mid)) order by a.number)
                 from public.addenda a where a.project_id = p_project_id and a.issued_at is not null and a.deleted_at is null), '[]'::jsonb),
    'answers', coalesce((select jsonb_agg(jsonb_build_object('number', pa.number, 'question_text', pa.question_text, 'answer', pa.answer, 'published_at', pa.published_at) order by pa.number)
                 from public.published_answers pa where pa.project_id = p_project_id
                   and (pa.package_id is null or public.has_scope(p_project_id, 'bid_package', pa.package_id::text))), '[]'::jsonb),
    'my_questions', coalesce((select jsonb_agg(jsonb_build_object('id', q.id, 'number', q.number, 'question', q.question, 'status', q.status, 'created_at', q.created_at) order by q.number)
                 from public.bid_questions q where q.project_id = p_project_id and q.member_id = mid), '[]'::jsonb)
  );
end;
$$;
revoke execute on function public.bidder_page(uuid) from public, anon;
grant execute on function public.bidder_page(uuid) to authenticated, service_role;

-- Coverage board: per package, invited / intends / declined / submitted (managers).
create or replace function public.bid_coverage(p_project_id uuid)
returns table (package_id uuid, code text, name text, invited bigint, intends bigint, declined bigint, submitted bigint, late bigint, opened bigint)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select bp.id, bp.code, bp.name,
         count(bi.id), count(*) filter (where bi.status = 'intends'), count(*) filter (where bi.status = 'declined'),
         count(*) filter (where bi.status in ('submitted', 'late')), count(*) filter (where bi.status = 'late'),
         count(*) filter (where bi.opened_at is not null)
  from public.bid_packages bp
  left join public.bid_invites bi on bi.package_id = bp.id
  where bp.project_id = p_project_id and bp.deleted_at is null and public.has_capability(p_project_id, 'bids.manage')
  group by bp.id, bp.code, bp.name
  order by bp.code;
$$;
revoke execute on function public.bid_coverage(uuid) from public, anon;
grant execute on function public.bid_coverage(uuid) to authenticated, service_role;

-- Default grants for the new tables (0007's normalization ran before these existed).
revoke all on public.bid_packages, public.subs, public.sub_history, public.bid_invites, public.bid_submissions, public.bid_extractions,
  public.bid_extraction_pricing, public.bid_leveling, public.bid_questions, public.published_answers, public.addenda, public.addendum_acks
  from anon;
grant select on public.bid_packages, public.subs, public.sub_history, public.bid_invites, public.bid_submissions, public.bid_extractions,
  public.bid_extraction_pricing, public.bid_leveling, public.bid_questions, public.published_answers, public.addenda, public.addendum_acks
  to authenticated;
grant insert, update on public.bid_packages, public.subs, public.addenda to authenticated;
grant update on public.bid_extractions, public.bid_extraction_pricing, public.bid_questions to authenticated;
grant insert, update, delete on public.bid_leveling to authenticated;
revoke all on all sequences in schema public from anon;
grant usage on all sequences in schema public to authenticated;
revoke delete, truncate, references, trigger on all tables in schema public from authenticated;
grant delete on public.bid_leveling, public.folder_access, public.member_scopes, public.read_marks, public.user_layout, public.push_subscriptions to authenticated;
