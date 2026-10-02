-- 0050 Comments on any item, kept for good (Jesse, Sep 30): "attach notes and comments to documents and files and
-- everything along the way ... it kind of should be a permanent record."
--
-- * public.comments: one row per comment on an RFI, inspection request, file, daily report, correction or delivery.
--   Nobody deletes one, not even the service role (tg_comment_permanent, no DELETE/TRUNCATE grant).
-- * public.comment_edits: the earlier texts. An edit never loses the original: the BEFORE UPDATE trigger copies the old
--   text here whenever the body changes, whoever changes it. Append-only.
-- * Who may read a comment: whoever may read the item it is on. ONE function asks that, comment_target_readable(),
--   and it asks each item's own read gate. Those gates are now one function per item type, and each item table's
--   SELECT policy is altered here (same rule as before) to call the same function, so the item and its comments can
--   never drift apart: rfi_may_see (0038, unchanged), ir_may_see, file_may_see, daily_may_see, correction_may_see,
--   delivery_may_see.
-- * Who may write: an active member who may read the item and holds comments.write (every role except bidder and
--   viewer: a bidder's comment on a bid document would reach the other bidders; a viewer only reads).
-- * Writes: add_comment (repeat-safe with p_key) and edit_comment (author only, version-checked). Both audit() and post
--   a board line for the item's people: its own audience capability (the narrowest one whose holders all read the
--   item: rfi.sign_issue, ir.decide, dailies.read_all once submitted, corrections.mark_ready, deliveries.manage; none for
--   files), plus its creator and everyone who commented on it before, never the writer.
-- * Reads: comment_list (comments oldest first, with author name and company, the earlier texts, can_write).

-- ---------------------------------------------------------------------------
-- Capability (data, SPEC §5.2): every role but bidder and viewer.
-- ---------------------------------------------------------------------------
insert into public.role_permissions (role, capability, requires_aal2) values
  ('project_admin', 'comments.write', false), ('estimator', 'comments.write', false), ('pm', 'comments.write', false),
  ('pe', 'comments.write', false), ('superintendent', 'comments.write', false), ('foreman', 'comments.write', false),
  ('inspector', 'comments.write', false), ('special_inspector', 'comments.write', false), ('sub', 'comments.write', false),
  ('architect', 'comments.write', false), ('owner_rep', 'comments.write', false), ('inspector_admin', 'comments.write', false)
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Each item's read gate, one function per type. The table's policy keeps its own deleted_at test (as rfis does).
-- ---------------------------------------------------------------------------
create or replace function public.ir_may_see(p_project_id uuid, p_requested_by uuid)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select coalesce((p_requested_by = auth.uid() and public.is_member(p_project_id))
      or public.has_capability(p_project_id, 'ir.view_all')
      or public.has_capability(p_project_id, 'ir.decide'), false);
$$;

create or replace function public.file_may_see(p_project_id uuid, p_created_by uuid, p_folder_id uuid)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select coalesce((p_created_by = auth.uid() and public.is_member(p_project_id)) or public.folder_can_read(p_folder_id), false);
$$;

create or replace function public.daily_may_see(p_project_id uuid, p_author_id uuid, p_status text)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select coalesce((p_author_id = auth.uid() and public.is_member(p_project_id))
      or (p_status = 'submitted' and public.has_capability(p_project_id, 'dailies.read_all')), false);
$$;

create or replace function public.correction_may_see(p_project_id uuid)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select public.has_capability(p_project_id, 'corrections.view');
$$;

create or replace function public.delivery_may_see(p_project_id uuid)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select public.has_capability(p_project_id, 'deliveries.view');
$$;

-- The same rules as 0005 / 0023 / 0024 / 0025 / 0026, now through the one gate each (changed in place: the policy is
-- never missing, not even inside this migration).
alter policy "inspection_requests: requester or team reads" on public.inspection_requests
  using (deleted_at is null and public.ir_may_see(project_id, requested_by));
alter policy "files: readable" on public.files
  using (deleted_at is null and public.file_may_see(project_id, created_by, folder_id));
alter policy "daily_reports: author or read_all" on public.daily_reports
  using (deleted_at is null and public.daily_may_see(project_id, author_id, status));
alter policy "corrections: viewers read" on public.corrections
  using (deleted_at is null and public.correction_may_see(project_id));
alter policy "deliveries: viewers read" on public.deliveries
  using (public.delivery_may_see(project_id));

-- ---------------------------------------------------------------------------
-- comment_target_readable: may the caller read this item? The one question comments ask, as the items' own policies
-- answer it. An unknown type, an item on another job, or someone off the job: no.
-- ---------------------------------------------------------------------------
create or replace function public.comment_target_readable(p_project_id uuid, p_entity_type text, p_entity_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if p_project_id is null or p_entity_id is null or auth.uid() is null or not public.is_member(p_project_id) then
    return false;
  end if;
  return coalesce(case p_entity_type
    when 'rfi' then exists (
      select 1 from public.rfis r where r.id = p_entity_id and r.project_id = p_project_id and r.deleted_at is null
         and public.rfi_may_see(r.id, r.project_id, r.created_by, r.status, r.step))
    when 'inspection_request' then exists (
      select 1 from public.inspection_requests i where i.id = p_entity_id and i.project_id = p_project_id
         and i.deleted_at is null and public.ir_may_see(i.project_id, i.requested_by))
    when 'file' then exists (
      select 1 from public.files f where f.id = p_entity_id and f.project_id = p_project_id and f.deleted_at is null
         and public.file_may_see(f.project_id, f.created_by, f.folder_id))
    when 'daily_report' then exists (
      select 1 from public.daily_reports d where d.id = p_entity_id and d.project_id = p_project_id
         and d.deleted_at is null and public.daily_may_see(d.project_id, d.author_id, d.status))
    when 'correction' then exists (
      select 1 from public.corrections c where c.id = p_entity_id and c.project_id = p_project_id
         and c.deleted_at is null and public.correction_may_see(c.project_id))
    when 'delivery' then exists (
      select 1 from public.deliveries d where d.id = p_entity_id and d.project_id = p_project_id
         and public.delivery_may_see(d.project_id))
    else false
  end, false);
end;
$$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.comments (
  id uuid primary key default gen_random_uuid(),
  -- The order they were written in (two in one transaction share created_at).
  seq bigint generated always as identity,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version int not null default 1,
  org_id uuid not null,
  project_id uuid not null,
  entity_type text not null
    check (entity_type in ('rfi', 'inspection_request', 'file', 'daily_report', 'correction', 'delivery')),
  entity_id uuid not null,
  author_id uuid not null references auth.users(id),
  body text not null check (body = btrim(body) and length(body) between 1 and 4000),
  -- Set by the trigger when the body changes; the earlier texts are in comment_edits.
  edited_at timestamptz,
  -- add_comment's p_key: a repeat returns the same row.
  request_key uuid,
  foreign key (project_id, org_id) references public.projects (id, org_id),
  unique (author_id, request_key)
);
alter table public.comments enable row level security;
create index comments_item on public.comments (project_id, entity_type, entity_id, seq);

create table public.comment_edits (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references public.comments(id),
  org_id uuid not null,
  project_id uuid not null,
  -- The comment's version that held this text.
  version int not null,
  body text not null,
  -- When this text was written (the comment's first save, or the edit before) and when it was replaced.
  written_at timestamptz not null,
  replaced_at timestamptz not null default now(),
  replaced_by uuid references auth.users(id),
  foreign key (project_id, org_id) references public.projects (id, org_id),
  unique (comment_id, version)
);
alter table public.comment_edits enable row level security;

-- An edit keeps the original: whoever changes the body (edit_comment, or the service role), the old text is copied
-- first. What the comment is on, who wrote it and when never change.
create or replace function public.tg_comment_keep_original()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.id is distinct from old.id or new.seq is distinct from old.seq or new.created_at is distinct from old.created_at
     or new.org_id is distinct from old.org_id or new.project_id is distinct from old.project_id
     or new.entity_type is distinct from old.entity_type or new.entity_id is distinct from old.entity_id
     or new.author_id is distinct from old.author_id or new.request_key is distinct from old.request_key then
    raise exception 'a comment stays on its item, with its author' using errcode = '42501';
  end if;
  if new.body is distinct from old.body then
    insert into public.comment_edits (comment_id, org_id, project_id, version, body, written_at, replaced_by)
    values (old.id, old.org_id, old.project_id, old.version, old.body, coalesce(old.edited_at, old.created_at), auth.uid());
    new.edited_at := now();
  else
    new.edited_at := old.edited_at;
  end if;
  return new;
end;
$$;

-- Permanent: no delete, for anyone. comment_edits is append-only too.
create or replace function public.tg_comment_permanent()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception 'comments are a permanent record' using errcode = '42501';
end;
$$;

create trigger keep_original before update on public.comments for each row execute function public.tg_comment_keep_original();
create trigger touch before update on public.comments for each row execute function public.tg_touch_row();
create trigger permanent before delete on public.comments for each row execute function public.tg_comment_permanent();
create trigger permanent before update or delete on public.comment_edits
  for each row execute function public.tg_comment_permanent();

-- RLS: read only, through the item's gate; every write is an RPC below.
create policy "comments: whoever may read the item" on public.comments for select to authenticated
  using (public.comment_target_readable(project_id, entity_type, entity_id));
create policy "comment_edits: with the comment" on public.comment_edits for select to authenticated
  using (exists (select 1 from public.comments c where c.id = comment_edits.comment_id));

revoke all on public.comments, public.comment_edits from public, anon, authenticated;
revoke update, delete, truncate on public.comment_edits from service_role;
revoke delete, truncate on public.comments from service_role;
grant select on public.comments, public.comment_edits to authenticated;
revoke all on sequence public.comments_seq_seq from anon, authenticated;
grant usage, select on sequence public.comments_seq_seq to service_role;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.comment_check_body(p_body text)
returns text
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare v text := btrim(coalesce(p_body, ''));
begin
  if length(v) = 0 then raise exception 'Write a comment.' using errcode = '22023'; end if;
  if length(v) > 4000 then raise exception 'Keep a comment to 4000 characters.' using errcode = '22023'; end if;
  return v;
end;
$$;

-- The item's board line: "New comment on RFI 002: ..." for the item's people (see the header), never the writer.
create or replace function public.comment_tell(p_project_id uuid, p_entity_type text, p_entity_id uuid, p_kind text, p_what text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_label text; v_cap text; v_people uuid[] := '{}'::uuid[];
begin
  case p_entity_type
    when 'rfi' then
      select public.rfi_label(r.number) || ': ' || r.title, 'rfi.sign_issue', array[r.created_by] || public.rfi_holder_ids(r.id)
        into v_label, v_cap, v_people from public.rfis r where r.id = p_entity_id;
    when 'inspection_request' then
      select 'IR ' || i.number, 'ir.decide', array[i.requested_by]
        into v_label, v_cap, v_people from public.inspection_requests i where i.id = p_entity_id;
    when 'file' then
      select f.original_name, null, array[f.created_by]
        into v_label, v_cap, v_people from public.files f where f.id = p_entity_id;
    when 'daily_report' then
      select 'Daily report' || coalesce(' #' || d.number, ''),
             case when d.status = 'submitted' then 'dailies.read_all' end, array[d.author_id]
        into v_label, v_cap, v_people from public.daily_reports d where d.id = p_entity_id;
    when 'correction' then
      select public.correction_label(c.number) || ': ' || c.title, 'corrections.mark_ready', array[c.created_by]
        into v_label, v_cap, v_people from public.corrections c where c.id = p_entity_id;
    when 'delivery' then
      select 'Delivery #' || d.number, 'deliveries.manage', array[d.created_by]
        into v_label, v_cap, v_people from public.deliveries d where d.id = p_entity_id;
    else
      raise exception 'not_found' using errcode = 'P0002';
  end case;
  v_people := array(
    select distinct x from unnest(coalesce(v_people, '{}'::uuid[])
                                  || array(select c.author_id from public.comments c
                                            where c.project_id = p_project_id and c.entity_type = p_entity_type
                                              and c.entity_id = p_entity_id)) as t (x)
     where x is not null and x is distinct from auth.uid());
  if v_cap is null and cardinality(v_people) = 0 then return; end if;
  perform public.post_activity(p_project_id, p_kind, left(p_what || ' on ' || coalesce(v_label, 'an item'), 500),
    p_entity_type, p_entity_id, v_cap, case when cardinality(v_people) > 0 then v_people end);
end;
$$;

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------
-- The item's comments, oldest first, each with its author's name and company and its earlier texts (oldest first);
-- can_write says whether the box shows.
create or replace function public.comment_list(p_project_id uuid, p_entity_type text, p_entity_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.comment_target_readable(p_project_id, p_entity_type, p_entity_id) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  return jsonb_build_object(
    'can_write', public.has_capability(p_project_id, 'comments.write'),
    'comments', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', c.id, 'version', c.version, 'body', c.body, 'created_at', c.created_at, 'edited_at', c.edited_at,
               'author_id', c.author_id, 'author_name', public.rfi_person_name(c.author_id),
               'author_company', public.rfi_person_company(c.project_id, c.author_id), 'mine', c.author_id = auth.uid(),
               'earlier', coalesce((select jsonb_agg(jsonb_build_object('body', e.body, 'written_at', e.written_at)
                                                     order by e.version)
                                      from public.comment_edits e where e.comment_id = c.id), '[]'::jsonb))
             order by c.seq)
        from public.comments c
       where c.project_id = p_project_id and c.entity_type = p_entity_type and c.entity_id = p_entity_id), '[]'::jsonb));
end;
$$;

create or replace function public.add_comment(
  p_project_id uuid,
  p_entity_type text,
  p_entity_id uuid,
  p_body text,
  p_key uuid default null
)
returns public.comments
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_uid uuid := auth.uid(); v_body text; v_org uuid; c public.comments;
begin
  if v_uid is null or not public.comment_target_readable(p_project_id, p_entity_type, p_entity_id) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if not public.has_capability(p_project_id, 'comments.write') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_key is not null then
    perform pg_advisory_xact_lock(hashtext('add_comment:' || v_uid::text || ':' || p_key::text));
    select * into c from public.comments where author_id = v_uid and request_key = p_key;
    if c.id is not null then return c; end if;
  end if;
  v_body := public.comment_check_body(p_body);
  select org_id into v_org from public.projects where id = p_project_id;
  insert into public.comments (org_id, project_id, entity_type, entity_id, author_id, body, request_key)
  values (v_org, p_project_id, p_entity_type, p_entity_id, v_uid, v_body, p_key)
  returning * into c;
  perform public.audit('comment.add', 'comment', c.id, c.project_id, c.org_id,
    jsonb_build_object('entity_type', c.entity_type, 'entity_id', c.entity_id));
  perform public.comment_tell(c.project_id, c.entity_type, c.entity_id, 'comment.added', 'New comment');
  return c;
end;
$$;

-- The author changes their own comment's text. The earlier text stays (tg_comment_keep_original). An unchanged text, or
-- a repeat of an edit already made, returns the comment as it is.
create or replace function public.edit_comment(p_comment_id uuid, p_version int, p_body text)
returns public.comments
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare c public.comments; v_body text;
begin
  select * into c from public.comments where id = p_comment_id for update;
  if c.id is null or auth.uid() is null or not public.comment_target_readable(c.project_id, c.entity_type, c.entity_id) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if c.author_id <> auth.uid() or not public.has_capability(c.project_id, 'comments.write') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  v_body := public.comment_check_body(p_body);
  if c.body = v_body then return c; end if;
  if p_version is null or c.version <> p_version then
    raise exception 'version_conflict: expected %, found %', p_version, c.version using errcode = '40001';
  end if;
  update public.comments set body = v_body where id = c.id returning * into c;
  perform public.audit('comment.edit', 'comment', c.id, c.project_id, c.org_id,
    jsonb_build_object('entity_type', c.entity_type, 'entity_id', c.entity_id, 'version', c.version));
  perform public.comment_tell(c.project_id, c.entity_type, c.entity_id, 'comment.edited', 'Comment edited');
  return c;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants: the gates run inside policies (as the reader); the RPCs are the app's.
-- ---------------------------------------------------------------------------
revoke execute on function public.ir_may_see(uuid, uuid) from public, anon;
revoke execute on function public.file_may_see(uuid, uuid, uuid) from public, anon;
revoke execute on function public.daily_may_see(uuid, uuid, text) from public, anon;
revoke execute on function public.correction_may_see(uuid) from public, anon;
revoke execute on function public.delivery_may_see(uuid) from public, anon;
revoke execute on function public.comment_target_readable(uuid, text, uuid) from public, anon;
grant execute on function public.ir_may_see(uuid, uuid) to authenticated, service_role;
grant execute on function public.file_may_see(uuid, uuid, uuid) to authenticated, service_role;
grant execute on function public.daily_may_see(uuid, uuid, text) to authenticated, service_role;
grant execute on function public.correction_may_see(uuid) to authenticated, service_role;
grant execute on function public.delivery_may_see(uuid) to authenticated, service_role;
grant execute on function public.comment_target_readable(uuid, text, uuid) to authenticated, service_role;

revoke execute on function public.tg_comment_keep_original() from public, anon, authenticated;
revoke execute on function public.tg_comment_permanent() from public, anon, authenticated;
revoke execute on function public.comment_check_body(text) from public, anon, authenticated;
revoke execute on function public.comment_tell(uuid, text, uuid, text, text) from public, anon, authenticated;
grant execute on function public.comment_check_body(text) to service_role;
grant execute on function public.comment_tell(uuid, text, uuid, text, text) to service_role;

revoke execute on function public.comment_list(uuid, text, uuid) from public, anon;
revoke execute on function public.add_comment(uuid, text, uuid, text, uuid) from public, anon;
revoke execute on function public.edit_comment(uuid, int, text) from public, anon;
grant execute on function public.comment_list(uuid, text, uuid) to authenticated, service_role;
grant execute on function public.add_comment(uuid, text, uuid, text, uuid) to authenticated, service_role;
grant execute on function public.edit_comment(uuid, int, text) to authenticated, service_role;
