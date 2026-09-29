-- 0046 The way in for people who aren't members yet (SPEC §6.4 #4, §13.2; MDR request.html, qr.html, hub.html).
-- In MDR a contractor never needs an account: the inspector shares one link (or a QR sheet posted on site), it opens
-- the job's calendar and the request form, and names are remembered on the device. Here:
--   * The job's request link /r/<job>?t=<token>: only sha256 of the token is stored (projects.request_token_hash,
--     0002). Whoever holds members.manage on the job makes it (rotate_request_link returns the new token once, with
--     the time it was made); the old link stops working at once; the person who rotated can undo it for 15 minutes.
--     A link that is on is what "requests are open" means for the job.
--   * The inspector's hub /h/<hub>?t=<token> (MDR's hub.html, one link for all my jobs): one row per person
--     (request_hubs), only sha256 of the token stored, rotatable by its owner. It lists the active jobs (not lost or
--     archived, Inspections on) whose request link is on and where the owner decides inspections (ir.decide, read from
--     role_permissions), and opens each one's request page with the hub's own token.
--   * Joining: a visitor proves their email with the Auth email code first; then the public request-link function
--     (service role) records a job invite for THAT signed-in address with role sub; accept_invites binds it. An address
--     that already has a row on the job keeps it: an active or invited one is never changed (no downgrade), a revoked
--     or ended one is refused (a People revoke sticks; the link never lets them back in).
--   * The function's SQL surface (link_request_*) is service-role only and returns only what the pages show: the job
--     name; the join status; the hub's job names and ids.
--   * No new capabilities: members.manage (the link), ir.decide (the hub), ir.request (what a sub does next).

-- ---------------------------------------------------------------------------------------------------------------------
-- request_link_log: every rotation of a job's request link, so it can be undone for a short while. Functions only.
-- ---------------------------------------------------------------------------------------------------------------------
create table public.request_link_log (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id),
  old_hash text,
  new_hash text not null,
  rotated_by uuid not null references auth.users(id),
  rotated_at timestamptz not null default now(),
  undone_at timestamptz
);
alter table public.request_link_log enable row level security;
create index request_link_log_project on public.request_link_log (project_id, rotated_at desc);
revoke all on public.request_link_log from anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------------
-- request_hubs: one hub link per person. The id is public (it is in the link); the token is not, only its hash.
-- No policies: read and written only by the functions below.
-- ---------------------------------------------------------------------------------------------------------------------
create table public.request_hubs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  rotated_at timestamptz not null default now()
);
alter table public.request_hubs enable row level security;
revoke all on public.request_hubs from anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------------
-- Internal helpers (not callable by people)
-- ---------------------------------------------------------------------------------------------------------------------
-- A job takes requests through a link: live, active (0045: not lost, not archived), Inspections on, a link made.
create or replace function public.request_link_on(p_project_id uuid)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.projects p
     where p.id = p_project_id and p.deleted_at is null and p.stage not in ('lost', 'archived')
       and 'inspections' = any (p.modules) and p.request_token_hash is not null);
$$;

-- The hub's owner when the id and the token's hash match. Null otherwise.
create or replace function public.request_hub_owner(p_hub_id uuid, p_token_hash text)
returns uuid
language sql
stable
set search_path = public, pg_temp
as $$
  select h.user_id from public.request_hubs h where h.id = p_hub_id and h.token_hash = p_token_hash;
$$;

-- The jobs a hub lists for its owner: request link on, and the owner decides inspections there today.
create or replace function public.request_hub_list(p_owner uuid)
returns table (project_id uuid, name text)
language sql
stable
set search_path = public, pg_temp
as $$
  select p.id, p.name
    from public.projects p
   where public.request_link_on(p.id)
     and p.id in (select pm.project_id
                    from public.project_members pm
                    join public.role_permissions rp on rp.role = pm.role and rp.capability = 'ir.decide'
                   where pm.user_id = p_owner and pm.status = 'active'
                     and (pm.access_ends_at is null or pm.access_ends_at > now()))
   order by lower(p.name), p.id;
$$;

-- Does this person decide inspections on any active job (whether or not its link is on)? Who may have a hub.
create or replace function public.request_hub_decides(p_person uuid)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select exists (
    select 1
      from public.project_members pm
      join public.role_permissions rp on rp.role = pm.role and rp.capability = 'ir.decide'
      join public.projects p on p.id = pm.project_id and p.deleted_at is null and p.stage not in ('lost', 'archived')
     where pm.user_id = p_person and pm.status = 'active' and (pm.access_ends_at is null or pm.access_ends_at > now()));
$$;

-- The job a credential opens: the job's own link token, or a hub token whose owner decides inspections there.
create or replace function public.request_link_job(p_project_id uuid, p_token_hash text, p_hub_id uuid)
returns public.projects
language sql
stable
set search_path = public, pg_temp
as $$
  select p.*
    from public.projects p
   where p.id = p_project_id and public.request_link_on(p.id)
     and case when p_hub_id is null then p.request_token_hash = p_token_hash
              else public.ir_member_decides(p.id, public.request_hub_owner(p_hub_id, p_token_hash)) end;
$$;

-- 32 random bytes as base64url (43 characters), the shape of every link token (access, delivery, calendar feed).
create or replace function public.request_link_token()
returns text
language sql
volatile
set search_path = public, pg_temp
as $$
  select translate(rtrim(encode(extensions.gen_random_bytes(32), 'base64'), '='), '+/', '-_');
$$;

-- ---------------------------------------------------------------------------------------------------------------------
-- The job's request link (members.manage): make or replace (the raw token once), undo, state.
-- ---------------------------------------------------------------------------------------------------------------------
create or replace function public.rotate_request_link(p_project_id uuid)
returns table (token text, made_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_token text; v_hash text; v_old text; v_at timestamptz := clock_timestamp();
begin
  if not public.has_capability(p_project_id, 'members.manage') then raise exception 'forbidden' using errcode = '42501'; end if;
  v_token := public.request_link_token();
  v_hash := encode(extensions.digest(v_token, 'sha256'), 'hex');
  select p.request_token_hash into v_old from public.projects p where p.id = p_project_id and p.deleted_at is null for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  update public.projects set request_token_hash = v_hash where id = p_project_id;
  insert into public.request_link_log (project_id, old_hash, new_hash, rotated_by, rotated_at)
  values (p_project_id, v_old, v_hash, auth.uid(), v_at);
  perform public.audit('request_link.rotate', 'project', p_project_id, p_project_id, null,
    jsonb_build_object('replaced', v_old is not null));
  return query select v_token, v_at;
end;
$$;

create or replace function public.undo_request_link_rotation(p_project_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare l public.request_link_log;
begin
  if not public.has_capability(p_project_id, 'members.manage') then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into l from public.request_link_log
   where project_id = p_project_id and rotated_by = auth.uid() and undone_at is null and rotated_at > now() - interval '15 minutes'
   order by rotated_at desc limit 1
   for update;
  if l.id is null then raise exception 'Nothing to undo.' using errcode = 'P0002'; end if;
  update public.projects set request_token_hash = l.old_hash where id = p_project_id and request_token_hash = l.new_hash;
  if not found then raise exception 'The link changed again since.' using errcode = '40001'; end if;
  update public.request_link_log set undone_at = now() where id = l.id;
  perform public.audit('request_link.undo', 'project', p_project_id, p_project_id, null, '{}'::jsonb);
end;
$$;

-- On or off, and when the link that works now was made (the device that made it keeps it only while this matches).
create or replace function public.request_link_state(p_project_id uuid)
returns table (active boolean, since timestamptz)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.has_capability(p_project_id, 'members.manage') then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
    select p.request_token_hash is not null,
           (select max(l.rotated_at) from public.request_link_log l
             where l.project_id = p.id and l.undone_at is null and l.new_hash = p.request_token_hash)
      from public.projects p where p.id = p_project_id;
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------------
-- My hub (people who decide inspections): make or replace (the raw token once), state.
-- ---------------------------------------------------------------------------------------------------------------------
create or replace function public.rotate_request_hub()
returns table (hub_id uuid, token text, made_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_uid uuid := auth.uid(); v_token text; v_hash text; v_at timestamptz := clock_timestamp(); v_replaced boolean;
        h public.request_hubs;
begin
  if v_uid is null or not public.request_hub_decides(v_uid) then raise exception 'forbidden' using errcode = '42501'; end if;
  v_token := public.request_link_token();
  v_hash := encode(extensions.digest(v_token, 'sha256'), 'hex');
  v_replaced := exists (select 1 from public.request_hubs x where x.user_id = v_uid);
  insert into public.request_hubs (user_id, token_hash, created_at, rotated_at)
  values (v_uid, v_hash, v_at, v_at)
  on conflict (user_id) do update set token_hash = excluded.token_hash, rotated_at = excluded.rotated_at
  returning * into h;
  perform public.audit('request_hub.rotate', 'request_hub', h.id, null, null, jsonb_build_object('replaced', v_replaced));
  return query select h.id, v_token, v_at;
end;
$$;

create or replace function public.request_hub_state()
returns table (decides boolean, hub_id uuid, made_at timestamptz, jobs int)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
    select public.request_hub_decides(v_uid), h.id, h.rotated_at,
           (select count(*)::int from public.request_hub_list(v_uid))
      from (select 1) one
      left join public.request_hubs h on h.user_id = v_uid;
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------------
-- The public function's SQL surface (service role only; the function checks rate limits and the session first).
-- Each answers null when the credential does not open the job (or the hub).
-- ---------------------------------------------------------------------------------------------------------------------
create or replace function public.link_request_open(p_project_id uuid, p_token_hash text, p_hub_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare pr public.projects;
begin
  if not public.is_service_role() then raise exception 'forbidden' using errcode = '42501'; end if;
  pr := public.request_link_job(p_project_id, p_token_hash, p_hub_id);
  if pr.id is null then return null; end if;
  return jsonb_build_object('project_name', pr.name);
end;
$$;

-- p_email is the address the visitor just proved with the email code (the function reads it from their session).
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
   where pm.project_id = pr.id and pm.invite_email = v_email;
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

create or replace function public.link_request_hub(p_hub_id uuid, p_token_hash text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare v_owner uuid;
begin
  if not public.is_service_role() then raise exception 'forbidden' using errcode = '42501'; end if;
  v_owner := public.request_hub_owner(p_hub_id, p_token_hash);
  if v_owner is null then return null; end if;
  return jsonb_build_object('jobs', coalesce((
    select jsonb_agg(jsonb_build_object('project_id', l.project_id, 'name', l.name) order by lower(l.name), l.project_id)
      from public.request_hub_list(v_owner) l), '[]'::jsonb));
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------------
-- Grants (SPEC §6.2): nothing for public/anon; people call the member RPCs; the link RPCs are service-role only;
-- helpers are internal.
-- ---------------------------------------------------------------------------------------------------------------------
revoke execute on function
  public.request_link_on(uuid),
  public.request_hub_owner(uuid, text),
  public.request_hub_list(uuid),
  public.request_hub_decides(uuid),
  public.request_link_job(uuid, text, uuid),
  public.request_link_token(),
  public.rotate_request_link(uuid),
  public.undo_request_link_rotation(uuid),
  public.request_link_state(uuid),
  public.rotate_request_hub(),
  public.request_hub_state(),
  public.link_request_open(uuid, text, uuid),
  public.link_request_join(uuid, text, uuid, text, text, text),
  public.link_request_hub(uuid, text)
from public, anon, authenticated;

grant execute on function
  public.rotate_request_link(uuid),
  public.undo_request_link_rotation(uuid),
  public.request_link_state(uuid),
  public.rotate_request_hub(),
  public.request_hub_state()
to authenticated, service_role;

grant execute on function
  public.link_request_open(uuid, text, uuid),
  public.link_request_join(uuid, text, uuid, text, text, text),
  public.link_request_hub(uuid, text)
to service_role;
