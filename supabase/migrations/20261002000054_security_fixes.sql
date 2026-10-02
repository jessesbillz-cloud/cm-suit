-- 0054 Fixes from the independent security review of 0046-0053 (Oct 2). Each part names the finding it closes; the
-- findings that need Jesse's decision (who may be the official, the request-link visitor's role, the hosted "Confirm
-- email" setting, RFI comments written before the answer) are not touched here.
--   1. Comments (M4, L7): reading an item's comments needs comments.write as well as reading the item, through ONE gate,
--      comment_readable(): the comments and comment_edits policies, comment_list and the board. Bidders and viewers see
--      the item but no comments, and no comment board lines. A comment board line shows only to someone who may still
--      read the item's comments, checked when the board is read; it is sent only to people holding comments.write.
--   2. Stamped sets (M5): the record binds the stamped PDF's own bytes. permit-stamp writes the server's record of each
--      stamped copy (permit_stamped_copies: the original, its sha256 as the server read it, the permit number, who,
--      when, the hash printed on the sheets) with the service key; permit_record_stamped_set takes only the stamped
--      files' ids and copies everything else from that record and the files rows (the copy's sha256 is the server's).
--      The old signature that took the hash, the original and the time from the caller is dropped.
--   3. Approved plans (M6): only the server creates, moves or uploads anything under "Approved plans" (the permit sets,
--      Superseded) and "Stamping": folder_can_write says no there for everyone (register_file, the files insert policy,
--      the storage insert policy and folder_access all ask it), and people can't create, move in or rename folders
--      there. "To stamp" stays the officials' own upload folder.
--   4. Photo previews (M9): still not a download (no downloads row), but each preview handed out is an audit line
--      ('file.preview'); the URL lives 10 minutes like a download's (the function's constant).
--   5. Lows: service_role can't truncate or delete the permit records, nor rewrite the stage history or the stamped
--      sets (L2); a permit comment's earlier answers are kept on the row when another answer replaces them (L1); no
--      INSERT on profiles for signed-in users (L9); the stamp reads the stored object's real size before downloading
--      (L12); the storage update rule only lets an uploader resume an unfinished upload (L4); a revoked member can't
--      rejoin through the request link after changing their email (L8); the permit lists start from the caller's own
--      jobs instead of every permit in the database (L10).

-- =====================================================================================================================
-- 1. Comments: one read gate
-- =====================================================================================================================
-- May the caller read this item's comments? Whoever may write them and may read the item (0050's
-- comment_target_readable). Asked as the caller, inside policies too.
create or replace function public.comment_readable(p_project_id uuid, p_entity_type text, p_entity_id uuid)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select coalesce(public.has_capability(p_project_id, 'comments.write')
                  and public.comment_target_readable(p_project_id, p_entity_type, p_entity_id), false);
$$;

-- A board line about a comment shows only to someone who may read that item's comments now; every other line as before.
create or replace function public.board_line_readable(p_kind text, p_project_id uuid, p_entity_type text, p_entity_id uuid)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select coalesce(p_kind not like 'comment.%' or public.comment_readable(p_project_id, p_entity_type, p_entity_id), false);
$$;

revoke execute on function public.comment_readable(uuid, text, uuid) from public, anon;
revoke execute on function public.board_line_readable(text, uuid, text, uuid) from public, anon;
grant execute on function public.comment_readable(uuid, text, uuid) to authenticated, service_role;
grant execute on function public.board_line_readable(text, uuid, text, uuid) to authenticated, service_role;

alter policy "comments: whoever may read the item" on public.comments rename to "comments: who may comment on the item";
alter policy "comments: who may comment on the item" on public.comments
  using (public.comment_readable(project_id, entity_type, entity_id));
alter policy "comment_edits: with the comment" on public.comment_edits
  using (exists (select 1 from public.comments c
                  where c.id = comment_edits.comment_id and public.comment_readable(c.project_id, c.entity_type, c.entity_id)));

-- The same as 0004, plus the comment gate.
alter policy "activity: audience read" on public.activity
  using (
    public.is_member(project_id)
    and (
      (audience_capability is not null and public.has_capability(project_id, audience_capability))
      or exists (select 1 from public.activity_recipients ar where ar.activity_id = activity.id and ar.user_id = auth.uid())
    )
    and public.board_line_readable(kind, project_id, entity_type, entity_id)
  );

create or replace function public.board_feed(p_project_id uuid default null, p_before timestamptz default null, p_limit int default 50)
returns table (id uuid, created_at timestamptz, project_id uuid, project_name text, kind text, entity_type text, entity_id uuid, summary text, actor_user_id uuid, unread boolean)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select a.id, a.created_at, a.project_id, p.name, a.kind, a.entity_type, a.entity_id, a.summary, a.actor_user_id,
         a.created_at > coalesce(rm.last_seen_at, '1970-01-01'::timestamptz) as unread
  from public.activity a
  join public.projects p on p.id = a.project_id
  left join public.read_marks rm on rm.project_id = a.project_id and rm.user_id = auth.uid()
  where (p_project_id is null or a.project_id = p_project_id)
    and public.is_member(a.project_id)
    and (
      (a.audience_capability is not null and public.has_capability(a.project_id, a.audience_capability))
      or exists (select 1 from public.activity_recipients ar where ar.activity_id = a.id and ar.user_id = auth.uid())
    )
    and public.board_line_readable(a.kind, a.project_id, a.entity_type, a.entity_id)
    and (p_before is null or a.created_at < p_before)
  order by a.created_at desc
  limit least(greatest(p_limit, 1), 200);
$$;

-- The item's comments for someone who may read them (can_read); someone who reads the item but not its comments (a
-- bidder, a viewer) gets can_read false and nothing else; anyone else: not found.
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
  if not public.comment_readable(p_project_id, p_entity_type, p_entity_id) then
    return jsonb_build_object('can_read', false, 'can_write', false, 'comments', '[]'::jsonb);
  end if;
  return jsonb_build_object(
    'can_read', true,
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

-- Same as 0050, but a board line is sent only to people who hold comments.write on the job (who else may read the item
-- is asked again when the board is read: board_line_readable).
create or replace function public.comment_tell(p_project_id uuid, p_entity_type text, p_entity_id uuid, p_kind text, p_what text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_label text; v_cap text; v_people uuid[] := '{}'::uuid[]; v_writers uuid[];
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
  v_writers := public.rfi_users_with_cap(p_project_id, 'comments.write');
  v_people := array(
    select distinct x from unnest(coalesce(v_people, '{}'::uuid[])
                                  || array(select c.author_id from public.comments c
                                            where c.project_id = p_project_id and c.entity_type = p_entity_type
                                              and c.entity_id = p_entity_id)) as t (x)
     where x is not null and x is distinct from auth.uid() and x = any (v_writers));
  if v_cap is null and cardinality(v_people) = 0 then return; end if;
  perform public.post_activity(p_project_id, p_kind, left(p_what || ' on ' || coalesce(v_label, 'an item'), 500),
    p_entity_type, p_entity_id, v_cap, case when cardinality(v_people) > 0 then v_people end);
end;
$$;

-- =====================================================================================================================
-- 2. Stamped sets: the record binds the bytes, and its facts come from the server
-- =====================================================================================================================
-- One row per copy permit-stamp made: written by the function with the service key right after it stored the copy
-- (storeGeneratedPdf), never by people; read only by permit_record_stamped_set. content_hash is the hash printed on
-- every sheet: contentHash({kind, permit_id, permit_number, source_file_id, source_sha256, stamped_by, stamped_at})
-- (_shared/permitStamp.ts stampHash), so the original's bytes are bound too.
create table public.permit_stamped_copies (
  stamped_file_id uuid primary key references public.files(id),
  created_at timestamptz not null default now(),
  permit_id uuid not null references public.permits(id),
  source_file_id uuid not null references public.files(id),
  source_sha256 text not null check (source_sha256 ~ '^[0-9a-f]{64}$'),
  permit_number text not null check (length(btrim(permit_number)) between 1 and 60),
  stamped_by uuid not null references auth.users(id),
  stamped_at timestamptz not null,
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  check (source_file_id <> stamped_file_id)
);
alter table public.permit_stamped_copies enable row level security;
-- No policy: nobody reaches it through the API. The server inserts; a row never changes.
revoke all on public.permit_stamped_copies from public, anon, authenticated, service_role;
grant select, insert on public.permit_stamped_copies to service_role;

-- What the hash covers, kept on the set so it can be checked again later (the copy's own sha256 too). Null on rows
-- recorded before 0054.
alter table public.permit_approved_sets
  add column permit_number text,
  add column source_sha256 text check (source_sha256 is null or source_sha256 ~ '^[0-9a-f]{64}$'),
  add column stamped_sha256 text check (stamped_sha256 is null or stamped_sha256 ~ '^[0-9a-f]{64}$');

-- The old signature took the hash, the original and the time from the caller: retired (renamed and closed to everyone,
-- not dropped, so nothing that held it can call it and no record of it is lost).
alter function public.permit_record_stamped_set(uuid, integer, jsonb, text) rename to permit_record_stamped_set_retired_0054;
revoke execute on function public.permit_record_stamped_set_retired_0054(uuid, integer, jsonb, text)
  from public, anon, authenticated, service_role;
alter function public.permit_items(jsonb) rename to permit_items_retired_0054;
revoke execute on function public.permit_items_retired_0054(jsonb) from public, anon, authenticated, service_role;

-- The set, at once (the official, after a fresh sign-in): p_stamped_file_ids = the copies permit-stamp made, in the
-- order picked. Each must have the server's record for this permit, made for the caller, waiting in this job's
-- "Stamping"; the original, its sha256, the time, the number and the printed hash come from that record, the copy's
-- sha256 from its files row (the server's). Otherwise as 0053: the earlier set is superseded, the files move to the
-- permit's folder, the permit is issued when it isn't yet, audit, ONE board line. The same set again returns the
-- first answer.
create function public.permit_record_stamped_set(p_permit_id uuid, p_version int, p_stamped_file_ids uuid[], p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r public.permits; v_uid uuid := auth.uid(); v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_n int := coalesce(cardinality(p_stamped_file_ids), 0);
  v_known int; v_sets int; v_set int; v_mode text; v_folder uuid; v_old uuid; v_prior jsonb; v_issued date;
  v_bad text; v_label text;
begin
  if not public.signed_in_recently() then
    raise exception 'reauth_required: sign in again to stamp' using errcode = '42501';
  end if;
  r := public.permit_lock(p_permit_id, null);
  if not public.has_capability(r.project_id, 'permits.manage') then raise exception 'forbidden' using errcode = '42501'; end if;
  if v_n = 0 then raise exception 'Pick the files to stamp.' using errcode = '22023'; end if;
  if v_n > 200 then raise exception 'Up to 200 files in one set.' using errcode = '22023'; end if;
  if exists (select 1 from unnest(p_stamped_file_ids) x where x is null) then
    raise exception 'A stamped file is missing. Stamp it again.' using errcode = '22023';
  end if;
  if (select count(distinct x) from unnest(p_stamped_file_ids) x) <> v_n then
    raise exception 'Each file once.' using errcode = '22023';
  end if;

  -- The same set again (a retry after it went through): the first answer.
  select count(*), count(distinct s.set_no) into v_known, v_sets
    from public.permit_approved_sets s where s.stamped_file_id = any (p_stamped_file_ids);
  if v_known > 0 then
    select max(s.set_no) into v_set
      from public.permit_approved_sets s where s.stamped_file_id = any (p_stamped_file_ids) and s.permit_id = r.id;
    if v_known = v_n and v_sets = 1 and v_set is not null
       and (select count(*) from public.permit_approved_sets where permit_id = r.id and set_no = v_set) = v_n then
      return jsonb_build_object('permit', to_jsonb(r), 'set_no', v_set, 'files', v_n,
                                'issued', exists (select 1 from public.permit_stage_events e where e.permit_id = r.id
                                                    and e.stage = 'issued' and e.undone_at is null
                                                    and e.at = (select min(s.created_at) from public.permit_approved_sets s
                                                                 where s.permit_id = r.id and s.set_no = v_set)));
    end if;
    raise exception 'Some of these files are already recorded.' using errcode = '22023';
  end if;

  if p_version is null or r.version <> p_version then
    raise exception 'version_conflict: expected %, found %', p_version, r.version using errcode = '40001';
  end if;
  v_mode := public.permit_stamp_mode(r.stage);
  if v_mode is null then raise exception 'This permit can''t be stamped now.' using errcode = '22023'; end if;
  if length(coalesce(v_note, '')) > 1000 then raise exception 'Keep the note to 1000 characters.' using errcode = '22023'; end if;

  -- The stamped copies: the server's record of each, for this permit and for me, the copy server-made (with its
  -- sha256) and waiting in this job's "Stamping", stamped within the last day.
  if exists (select 1 from unnest(p_stamped_file_ids) x (id)
               left join public.permit_stamped_copies k on k.stamped_file_id = x.id
               left join public.files f on f.id = x.id and f.deleted_at is null
               left join public.folders fo on fo.id = f.folder_id
              where k.stamped_file_id is null or k.permit_id <> r.id or k.stamped_by <> v_uid
                 or f.id is null or f.project_id <> r.project_id or fo.kind is distinct from 'stamping'
                 or f.created_by is distinct from v_uid or lower(f.mime) <> 'application/pdf'
                 or coalesce(f.sha256, '') !~ '^[0-9a-f]{64}$'
                 or k.stamped_at > now() + interval '1 minute' or k.stamped_at < now() - interval '1 day'
                 or f.created_at < k.stamped_at - interval '1 minute'
                 or f.created_at > k.stamped_at + interval '15 minutes') then
    raise exception 'A stamped file is missing. Stamp it again.' using errcode = '22023';
  end if;
  -- The number printed on them is still the permit's.
  if exists (select 1 from public.permit_stamped_copies k
              where k.stamped_file_id = any (p_stamped_file_ids) and k.permit_number <> r.primary_number) then
    raise exception 'The permit number changed. Stamp these again.' using errcode = '22023';
  end if;
  if (select count(distinct k.source_file_id) from public.permit_stamped_copies k
       where k.stamped_file_id = any (p_stamped_file_ids)) <> v_n then
    raise exception 'Each file once.' using errcode = '22023';
  end if;
  -- The originals: on this job, mine to read, not stamped copies themselves.
  select coalesce(f.original_name, 'A file') into v_bad
    from public.permit_stamped_copies k
    left join public.files f on f.id = k.source_file_id and f.deleted_at is null
    left join public.folders fo on fo.id = f.folder_id
   where k.stamped_file_id = any (p_stamped_file_ids)
     and (f.id is null or f.project_id <> r.project_id or fo.kind in ('approved_plans', 'stamping')
          or not public.file_may_see(f.project_id, f.created_by, f.folder_id))
   limit 1;
  if v_bad is not null then raise exception '% can''t be in this set.', v_bad using errcode = '22023'; end if;

  v_folder := public.permit_set_folder(r.id);
  v_set := public.next_number(r.project_id, 'permit_set:' || r.id::text);

  -- The earlier set: superseded, into "Superseded".
  if exists (select 1 from public.permit_approved_sets where permit_id = r.id and superseded_at is null) then
    v_old := public.permit_folder_ensure(r.project_id, v_folder, 'approved_plans', 'Superseded', 900, null, false, false);
    update public.files set folder_id = v_old
     where id in (select stamped_file_id from public.permit_approved_sets where permit_id = r.id and superseded_at is null);
    update public.permit_approved_sets set superseded_by = v_set, superseded_at = now()
     where permit_id = r.id and superseded_at is null;
  end if;

  insert into public.permit_approved_sets (org_id, project_id, permit_id, set_no, position, source_file_id, stamped_file_id,
                                           stamped_by, stamped_at, content_hash, permit_number, source_sha256,
                                           stamped_sha256, note)
  select r.org_id, r.project_id, r.id, v_set, x.ord, k.source_file_id, k.stamped_file_id, v_uid, k.stamped_at,
         k.content_hash, k.permit_number, k.source_sha256, f.sha256, v_note
    from unnest(p_stamped_file_ids) with ordinality as x (id, ord)
    join public.permit_stamped_copies k on k.stamped_file_id = x.id
    join public.files f on f.id = x.id;
  update public.files set folder_id = v_folder where id = any (p_stamped_file_ids);

  -- Issued (permit_move's rules and event, without its board line: the set's line says it), or the stage stays.
  v_prior := jsonb_build_object('issued_on', r.issued_on, 'expires_on', r.expires_on);
  v_issued := coalesce(r.issued_on, public.permit_today(r.project_id));
  if v_mode = 'issue' then
    update public.permits
       set stage = 'issued', stage_since = now(), issued_on = v_issued,
           expires_on = coalesce(r.expires_on, (v_issued + interval '12 months')::date), approved_folder_id = v_folder
     where id = r.id
     returning * into r;
    insert into public.permit_stage_events (permit_id, project_id, org_id, stage, at, actor, note, prior)
    values (r.id, r.project_id, r.org_id, r.stage, r.stage_since, v_uid,
            'Approved set ' || v_set || ': ' || v_n || case when v_n = 1 then ' file' else ' files' end, v_prior);
    perform public.audit('permit.move', 'permit', r.id, r.project_id, r.org_id,
                         jsonb_build_object('number', r.primary_number, 'stage', r.stage, 'set', v_set));
  elsif r.approved_folder_id is distinct from v_folder then
    update public.permits set approved_folder_id = v_folder where id = r.id returning * into r;
  end if;

  perform public.audit('permit.approved_set', 'permit', r.id, r.project_id, r.org_id,
    jsonb_build_object('number', r.primary_number, 'set', v_set, 'files', v_n, 'issued', v_mode = 'issue', 'note', v_note,
                       'items', (select jsonb_agg(jsonb_build_object('source', s.source_file_id, 'stamped', s.stamped_file_id,
                                                                     'hash', s.content_hash, 'sha256', s.stamped_sha256)
                                                  order by s.position)
                                   from public.permit_approved_sets s where s.permit_id = r.id and s.set_no = v_set)));
  v_label := v_n || case when v_n = 1 then ' file' else ' files' end;
  perform public.post_activity(r.project_id, 'permit.approved_set',
    public.permit_label(r.primary_number)
      || case when v_mode = 'issue' then ' issued: approved set (' || v_label || ')'
              else ': approved set revised (' || v_label || ')' end,
    'permit', r.id, 'permits.read');
  return jsonb_build_object('permit', to_jsonb(r), 'set_no', v_set, 'files', v_n, 'issued', v_mode = 'issue');
end;
$$;
revoke execute on function public.permit_record_stamped_set(uuid, integer, uuid[], text) from public, anon;
grant execute on function public.permit_record_stamped_set(uuid, integer, uuid[], text) to authenticated, service_role;

-- Same as 0053, but the size is the stored object's own (Storage writes it), not only what the uploader reported, so the
-- function refuses an oversized original before reading its bytes (L12).
create or replace function public.permit_stamp_source(p_permit_id uuid, p_file_id uuid)
returns table (storage_path text, original_name text, mime text, size bigint)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare r public.permits; f public.files; v_kind text;
begin
  select * into r from public.permits where id = p_permit_id and deleted_at is null;
  if r.id is null or not public.has_capability(r.project_id, 'permits.read') then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if not public.has_capability(r.project_id, 'permits.manage') then raise exception 'forbidden' using errcode = '42501'; end if;
  if public.permit_stamp_mode(r.stage) is null then
    raise exception 'This permit can''t be stamped now.' using errcode = '22023';
  end if;
  select * into f from public.files where id = p_file_id and deleted_at is null;
  if f.id is null or f.project_id <> r.project_id then raise exception 'not_found' using errcode = 'P0002'; end if;
  if lower(f.original_name) !~ '\.pdf$' then raise exception 'Only PDFs can be stamped.' using errcode = '22023'; end if;
  select kind into v_kind from public.folders where id = f.folder_id;
  if v_kind in ('approved_plans', 'stamping') then
    raise exception 'Pick the original, not a stamped copy.' using errcode = '22023';
  end if;
  return query
    select a.storage_path, a.original_name, a.mime,
           greatest(f.size, coalesce((select case when o.metadata ->> 'size' ~ '^[0-9]{1,18}$' then (o.metadata ->> 'size')::bigint end
                                        from storage.objects o
                                       where o.bucket_id = 'files' and o.name = a.storage_path
                                       limit 1), 0))
      from public.authorize_download(f.id, 'original') a;
end;
$$;

-- =====================================================================================================================
-- 3. Approved plans and Stamping are the server's
-- =====================================================================================================================
-- Is this folder in the server's part of "Approved plans" (the root, the permit sets, Superseded, Stamping, or anything
-- below them)? The nearest of those kinds above it (or itself) decides; "To stamp" (permit_uploads) is the officials'.
-- Asked as the system, so a folder the person can't read still counts. Takes no caller.
create or replace function public.folder_server_only(p_folder_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with recursive up as (
    select f.id, f.parent_id, f.kind, 0 as depth from public.folders f where f.id = p_folder_id
    union all
    select f.id, f.parent_id, f.kind, up.depth + 1 from public.folders f join up on f.id = up.parent_id where up.depth < 32
  )
  select coalesce((select up.kind in ('approved_plans', 'stamping') from up
                    where up.kind in ('approved_plans', 'stamping', 'permit_uploads')
                    order by up.depth limit 1), false);
$$;
revoke execute on function public.folder_server_only(uuid) from public, anon;
grant execute on function public.folder_server_only(uuid) to authenticated, service_role;

-- Same as 0011, plus: nobody writes in the server's folders (uploads, file rows, storage objects, access lists).
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
  if public.folder_server_only(fo.id) then return false; end if;
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

-- Same as 0030, plus: a person never creates a folder in, moves a folder into, or renames a folder of the server's
-- part of Approved plans. The system's own functions (current_user is the owner there) still do.
create or replace function public.tg_folders_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare v_parent_project uuid; v_cursor uuid; v_depth int := 0;
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' and new.kind <> 'general' then
      raise exception 'forbidden: folder kind' using errcode = '42501';
    end if;
    if ((tg_op = 'INSERT' or new.parent_id is distinct from old.parent_id)
        and new.parent_id is not null and public.folder_server_only(new.parent_id))
       or (tg_op = 'UPDATE' and new.name is distinct from old.name and public.folder_server_only(old.id)) then
      raise exception 'Only the stamp adds to Approved plans.' using errcode = '42501';
    end if;
    if (tg_op = 'INSERT' or new.name is distinct from old.name or new.parent_id is distinct from old.parent_id)
       and public.folder_name_reserved(new.project_id, new.parent_id, new.name) then
      raise exception 'That name is used by the system. Pick another.' using errcode = '23505';
    end if;
  end if;
  if new.parent_id is not null and (tg_op = 'INSERT' or new.parent_id is distinct from old.parent_id) then
    select project_id into v_parent_project from public.folders where id = new.parent_id;
    if v_parent_project is distinct from new.project_id then
      raise exception 'The parent folder is in another job.' using errcode = '22023';
    end if;
    v_cursor := new.parent_id;
    while v_cursor is not null loop
      if v_cursor = new.id then raise exception 'A folder can''t go inside itself.' using errcode = '22023'; end if;
      v_depth := v_depth + 1;
      if v_depth > 30 then raise exception 'Folders go 30 levels deep at most.' using errcode = '22023'; end if;
      select parent_id into v_cursor from public.folders where id = v_cursor;
    end loop;
  end if;
  return new;
end;
$$;

-- =====================================================================================================================
-- 4. Photo previews leave an audit line
-- =====================================================================================================================
-- Same as 0047 (the gate's own download line stays undone: a preview is not a download), plus one 'file.preview' audit
-- line for each preview handed out, so every look at a photo is traceable.
create or replace function public.authorize_preview(p_file_id uuid, p_rfi_id uuid default null, p_request_id uuid default null)
returns table (storage_path text, original_name text, mime text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare v_path text; v_name text; v_mime text; v_project uuid; v_org uuid;
begin
  if p_rfi_id is not null and p_request_id is not null then
    raise exception 'An RFI or a request, not both.' using errcode = '22023';
  end if;
  begin
    if p_rfi_id is not null then
      select a.storage_path, a.original_name, a.mime into v_path, v_name, v_mime
        from public.rfi_authorize_file(p_rfi_id, p_file_id) a;
    elsif p_request_id is not null then
      select a.storage_path, a.original_name, a.mime into v_path, v_name, v_mime
        from public.authorize_ir_file(p_request_id, p_file_id) a;
    else
      select a.storage_path, a.original_name, a.mime into v_path, v_name, v_mime
        from public.authorize_download(p_file_id, 'original') a;
    end if;
    -- The gate said yes. Undo what it wrote (the downloads row, the audit event): a preview is not a download.
    raise exception 'preview, not a download' using errcode = 'PV001';
  exception when sqlstate 'PV001' then
    null;
  end;
  if v_path is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not (lower(v_mime) in ('image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif')
          and lower(v_name) ~ '\.(jpe?g|png|webp|heic|heif)$') then
    raise exception 'not_image' using errcode = '42501';
  end if;
  select f.project_id, f.org_id into v_project, v_org from public.files f where f.id = p_file_id;
  perform public.audit('file.preview', 'file', p_file_id, v_project, v_org,
    jsonb_build_object('via', case when p_rfi_id is not null then 'rfi' when p_request_id is not null then 'request'
                                   else 'folder' end,
                       'rfi_id', p_rfi_id, 'request_id', p_request_id));
  return query select v_path, v_name, v_mime;
end;
$$;

-- =====================================================================================================================
-- 5. Lows
-- =====================================================================================================================
-- L2: the permit records. Supabase's defaults gave service_role DELETE and TRUNCATE (TRUNCATE skips the row triggers);
-- the stage history and the stamped sets are records, so no UPDATE either (their own RPCs run as the owner).
revoke delete, truncate on public.permits, public.permit_stage_events, public.permit_reviews, public.permit_comments,
  public.permit_approved_sets from service_role;
revoke update on public.permit_stage_events, public.permit_approved_sets from service_role;

-- L1: a permit comment's answer, replaced by a later one (another responder, or a reword), stays on the row: every
-- earlier answer with who wrote it and when, oldest first. Only this trigger writes it, whoever changes the answer.
alter table public.permit_comments
  add column earlier_answers jsonb not null default '[]'::jsonb check (jsonb_typeof(earlier_answers) = 'array');

create or replace function public.tg_permit_comment_keep_answer()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    new.earlier_answers := '[]'::jsonb;
    return new;
  end if;
  new.earlier_answers := old.earlier_answers;
  if old.response is not null and new.response is distinct from old.response then
    new.earlier_answers := old.earlier_answers || jsonb_build_array(jsonb_build_object(
      'response', old.response, 'by', old.responded_by,
      'by_name', case when old.responded_by is not null then public.rfi_person_name(old.responded_by) end,
      'at', old.responded_at, 'replaced_at', now(), 'replaced_by', auth.uid()));
  end if;
  return new;
end;
$$;
revoke execute on function public.tg_permit_comment_keep_answer() from public, anon, authenticated;
create trigger keep_answer before insert or update on public.permit_comments
  for each row execute function public.tg_permit_comment_keep_answer();

-- L9: profile rows come from the sign-up trigger only.
revoke insert on public.profiles from anon, authenticated;

-- L4: an uploader may resume (update) the storage object of their own unfinished upload only; never a finished file, a
-- deleted one, or a server-made PDF (stored finished and clean) that carries their id.
alter policy "storage files: uploader may resume (update) own object" on storage.objects
  using (bucket_id = 'files' and exists (select 1 from public.files f
                                          where f.storage_path = name and f.created_by = auth.uid() and not f.upload_complete
                                            and f.scan_status = 'pending' and f.deleted_at is null))
  with check (bucket_id = 'files' and exists (select 1 from public.files f
                                               where f.storage_path = name and f.created_by = auth.uid() and not f.upload_complete
                                                 and f.scan_status = 'pending' and f.deleted_at is null));

-- L8: same as 0046, but a person whose member row on the job was revoked or ended is refused under any email: the rows
-- bound to the account that now has the session's address count too, not only the rows invited under that address.
create or replace function public.link_request_join(
  p_project_id uuid, p_token_hash text, p_hub_id uuid, p_email text, p_name text, p_company text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  pr public.projects;
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_name text := public.delivery_clean(p_name, 120);
  v_company text := public.delivery_clean(p_company, 120);
  v_rows int;
  v_usable boolean;
  m public.project_members;
begin
  if not public.is_service_role() then raise exception 'forbidden' using errcode = '42501'; end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(v_email) > 320 then
    raise exception 'Enter a valid email.' using errcode = '22023';
  end if;
  if v_name = '' then raise exception 'Enter your name.' using errcode = '22023'; end if;
  if v_company = '' then raise exception 'Enter your company.' using errcode = '22023'; end if;
  pr := public.request_link_job(p_project_id, p_token_hash, p_hub_id);
  if pr.id is null then return null; end if;

  -- One visitor at a time per address and job, so the check and the insert agree.
  perform pg_advisory_xact_lock(hashtext('request_link_join:' || pr.id::text || ':' || v_email));
  select count(*), coalesce(bool_or(pm.status in ('invited', 'active') and (pm.access_ends_at is null or pm.access_ends_at > now())), false)
    into v_rows, v_usable
    from public.project_members pm
   where pm.project_id = pr.id
     and (pm.invite_email = v_email
          or pm.user_id in (select u.id from auth.users u where lower(u.email) = v_email));
  if v_rows > 0 and not v_usable then
    raise exception 'Your access to this job has ended. Ask the inspector.' using errcode = '42501';
  end if;
  if v_rows > 0 then
    return jsonb_build_object('project_name', pr.name, 'status', 'member');
  end if;

  insert into public.project_members (org_id, project_id, invite_email, role, status, invited_by)
  values (pr.org_id, pr.id, v_email, 'sub', 'invited', public.request_hub_owner(p_hub_id, p_token_hash))
  on conflict (project_id, invite_email, role) do nothing
  returning * into m;
  -- Invited through People at the same moment: theirs stands.
  if m.id is null then return jsonb_build_object('project_name', pr.name, 'status', 'member'); end if;
  perform public.audit('request_link.join', 'project_member', m.id, pr.id, pr.org_id,
    jsonb_build_object('via', case when p_hub_id is null then 'link' else 'hub' end, 'name', v_name, 'company', v_company),
    null, 'public_link');
  perform public.post_activity(pr.id, 'member.joined', left(v_name || ' (' || v_company || ') joined from the request link', 500),
    'project_member', m.id, 'members.manage');
  return jsonb_build_object('project_name', pr.name, 'status', 'added');
end;
$$;

-- L10: same as 0052, but driven from the caller's own active jobs first, not every permit in the database.
create or replace function public.permit_list(p_project_id uuid default null)
returns table (
  id uuid, project_id uuid, project_name text, timezone text, primary_number text, agency_numbers text[], title text,
  kind text, stage text, stage_since timestamptz, assigned_to uuid, assigned_name text, issued_on date, expires_on date,
  extensions int, open_comments int, review_cycle int, version int
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.id, p.project_id, j.name, j.timezone, p.primary_number, p.agency_numbers, p.title, p.kind, p.stage, p.stage_since,
         p.assigned_to, case when p.assigned_to is not null then public.rfi_person_name(p.assigned_to) end,
         p.issued_on, p.expires_on, p.extensions,
         (select count(*)::int from public.permit_comments c where c.permit_id = p.id and c.status = 'open'),
         public.permit_cycle(p.id), p.version
    from public.permits p
    join public.projects j on j.id = p.project_id and j.deleted_at is null
   where p.deleted_at is null
     and p.project_id in (select pm.project_id from public.project_members pm
                           where pm.user_id = auth.uid() and pm.status = 'active')
     and (p_project_id is null or p.project_id = p_project_id)
     and public.has_capability(p.project_id, 'permits.read')
   order by lower(p.primary_number), j.name, p.id;
$$;

create or replace function public.permit_progress(p_project_id uuid default null, p_permit_id uuid default null)
returns table (
  permit_id uuid, "position" int, stage text, state text, entered_at timestamptz, left_at timestamptz, days int
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with seen as (
    select p.id, p.stage, j.timezone as tz
      from public.permits p
      join public.projects j on j.id = p.project_id
     where p.deleted_at is null
       and p.project_id in (select pm.project_id from public.project_members pm
                             where pm.user_id = auth.uid() and pm.status = 'active')
       and (p_project_id is null or p.project_id = p_project_id)
       and (p_permit_id is null or p.id = p_permit_id)
       and public.has_capability(p.project_id, 'permits.read')
  ),
  ev as (
    select e.permit_id, e.stage, e.at, s.tz,
           lead(e.at) over (partition by e.permit_id order by e.at, e.id) as left_at,
           row_number() over (partition by e.permit_id order by e.at desc, e.id desc) as back
      from public.permit_stage_events e
      join seen s on s.id = e.permit_id
     where e.undone_at is null
  ),
  per_stage as (
    select v.permit_id, v.stage, min(v.at) as entered,
           case when bool_or(v.left_at is null) then null else max(v.left_at) end as left_at,
           sum(case when coalesce(v.left_at, now()) - v.at < interval '1 day' then 0
                    else greatest(1, (coalesce(v.left_at, now()) at time zone v.tz)::date - (v.at at time zone v.tz)::date)
               end)::int as days
      from ev v
     group by v.permit_id, v.stage
  ),
  cur as (
    select s.id, s.stage,
           case when s.stage = 'complete' then 11
                when s.stage = 'cancelled'
                  then coalesce(public.permit_stage_pos((select x.stage from ev x where x.permit_id = s.id and x.back = 2)), 1)
                else public.permit_stage_pos(s.stage) end as pos
      from seen s
  ),
  places as (
    select c.id, b.pos::int as pos,
           case when c.stage = 'cancelled' and b.pos = c.pos then 'cancelled'
                when b.pos = 3 and c.stage = 'rejected' then 'rejected'
                else b.stage end as stage,
           case when c.stage in ('cancelled', 'rejected') and b.pos = c.pos then 'failed'
                when b.pos < c.pos then 'done'
                when b.pos = c.pos then 'current'
                else 'next' end as state
      from cur c
      cross join unnest('{draft,submitted,accepted,in_review,comments_out,backcheck,issued,inspections,approved,complete}'::text[])
        with ordinality as b (stage, pos)
  )
  select pl.id, pl.pos, pl.stage, pl.state,
         case when pl.stage in ('complete', 'cancelled') then null else ps.entered end,
         case when pl.stage in ('complete', 'cancelled') then null else ps.left_at end,
         case when pl.stage in ('complete', 'cancelled') then null else ps.days end
    from places pl
    left join per_stage ps on ps.permit_id = pl.id and ps.stage = pl.stage
   order by pl.id, pl.pos;
$$;
