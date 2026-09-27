-- 0003 Numbering (SPEC §5.3) and the append-only audit log (§5.4).

-- ---------------------------------------------------------------------------
-- Numbering: the database owns numbers.
-- ---------------------------------------------------------------------------
create table public.project_counters (
  project_id uuid not null references public.projects(id),
  kind text not null,
  next_value int not null default 1,
  primary key (project_id, kind)
);
alter table public.project_counters enable row level security;
-- No user policies: only next_number() touches this table.

create or replace function public.next_number(p_project_id uuid, p_kind text)
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v int;
begin
  if not public.is_member(p_project_id) and not public.is_service_role() then
    raise exception 'not a member' using errcode = '42501';
  end if;
  insert into public.project_counters (project_id, kind) values (p_project_id, p_kind)
  on conflict (project_id, kind) do nothing;
  update public.project_counters set next_value = next_value + 1
   where project_id = p_project_id and kind = p_kind
   returning next_value - 1 into v;
  return v;
end;
$$;
revoke execute on function public.next_number(uuid, text) from public, anon;

-- Per-author sequences (daily reports): (project, author, report_type), honoring a member start_number.
create table public.author_counters (
  project_id uuid not null references public.projects(id),
  author_id uuid not null references auth.users(id),
  kind text not null,
  next_value int not null default 1,
  primary key (project_id, author_id, kind)
);
alter table public.author_counters enable row level security;

create or replace function public.next_author_number(p_project_id uuid, p_kind text)
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v int; start_at int;
begin
  if not public.is_member(p_project_id) then
    raise exception 'not a member' using errcode = '42501';
  end if;
  select coalesce((pm.start_numbers->>p_kind)::int, 1) into start_at
    from public.project_members pm
   where pm.project_id = p_project_id and pm.user_id = auth.uid() and pm.status = 'active'
   limit 1;
  insert into public.author_counters (project_id, author_id, kind, next_value)
  values (p_project_id, auth.uid(), p_kind, coalesce(start_at, 1))
  on conflict (project_id, author_id, kind) do nothing;
  update public.author_counters set next_value = next_value + 1
   where project_id = p_project_id and author_id = auth.uid() and kind = p_kind
   returning next_value - 1 into v;
  return v;
end;
$$;
revoke execute on function public.next_author_number(uuid, text) from public, anon;

-- Peek without consuming ("will be #N").
create or replace function public.peek_author_number(p_project_id uuid, p_kind text)
returns int
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select next_value from public.author_counters where project_id = p_project_id and author_id = auth.uid() and kind = p_kind),
    (select coalesce((pm.start_numbers->>p_kind)::int, 1) from public.project_members pm
      where pm.project_id = p_project_id and pm.user_id = auth.uid() and pm.status = 'active' limit 1),
    1);
$$;
revoke execute on function public.peek_author_number(uuid, text) from public, anon;

-- ---------------------------------------------------------------------------
-- Audit log: append-only.
-- ---------------------------------------------------------------------------
create table public.audit_events (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  org_id uuid,
  project_id uuid,
  actor_user_id uuid,
  actor_kind text not null default 'user' check (actor_kind in ('user', 'system', 'cron', 'webhook', 'worker', 'public_link')),
  action text not null,
  entity_type text,
  entity_id uuid,
  ip inet,
  user_agent text,
  content_hash text,
  details jsonb not null default '{}'::jsonb
);
alter table public.audit_events enable row level security;
create index audit_events_project_time on public.audit_events (project_id, occurred_at desc);
create index audit_events_entity on public.audit_events (entity_type, entity_id);

revoke update, delete, truncate on public.audit_events from public, anon, authenticated, service_role;

create or replace function public.tg_audit_immutable()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception 'audit_events is append-only' using errcode = '42501';
end;
$$;
create trigger audit_immutable before update or delete on public.audit_events for each row execute function public.tg_audit_immutable();

-- Members with audit.export read the project's log. Nobody writes it directly.
create policy "audit: exporters read" on public.audit_events for select to authenticated
  using (project_id is not null and public.has_capability(project_id, 'audit.export'));

-- audit(): not callable by users. Runs inside triggers and SECURITY DEFINER RPCs only.
create or replace function public.audit(
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_project_id uuid,
  p_org_id uuid default null,
  p_details jsonb default '{}'::jsonb,
  p_content_hash text default null,
  p_actor_kind text default 'user'
)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare claims jsonb; new_id bigint; hdrs jsonb;
begin
  claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  hdrs := nullif(current_setting('request.headers', true), '')::jsonb;
  insert into public.audit_events (org_id, project_id, actor_user_id, actor_kind, action, entity_type, entity_id, ip, user_agent, content_hash, details)
  values (
    coalesce(p_org_id, (select org_id from public.projects where id = p_project_id)),
    p_project_id,
    auth.uid(),
    case when auth.uid() is null and p_actor_kind = 'user' then 'system' else p_actor_kind end,
    p_action, p_entity_type, p_entity_id,
    nullif(split_part(coalesce(hdrs->>'x-forwarded-for', ''), ',', 1), '')::inet,
    hdrs->>'user-agent',
    p_content_hash,
    coalesce(p_details, '{}'::jsonb)
  )
  returning id into new_id;
  return new_id;
end;
$$;
revoke execute on function public.audit(text, text, uuid, uuid, uuid, jsonb, text, text) from public, anon, authenticated;

-- log_view(entity): the data layer calls this when a sensitive item is opened.
create or replace function public.log_view(p_entity_type text, p_entity_id uuid, p_project_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_member(p_project_id) then
    raise exception 'not a member' using errcode = '42501';
  end if;
  perform public.audit('view', p_entity_type, p_entity_id, p_project_id);
end;
$$;
revoke execute on function public.log_view(text, uuid, uuid) from public, anon;

-- Generic row-change audit trigger for tables that opt in.
create or replace function public.tg_audit_row()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare pid uuid; eid uuid; act text;
begin
  if tg_op = 'INSERT' then act := 'create'; pid := new.project_id; eid := new.id;
  elsif tg_op = 'UPDATE' then
    act := case when new.deleted_at is not null and old.deleted_at is null then 'delete' else 'update' end;
    pid := new.project_id; eid := new.id;
  else act := 'hard_delete'; pid := old.project_id; eid := old.id;
  end if;
  perform public.audit(act, tg_table_name, eid, pid);
  return coalesce(new, old);
end;
$$;
revoke execute on function public.tg_audit_row() from public, anon, authenticated;

-- Membership changes are permission changes: always audited.
create or replace function public.tg_audit_membership()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.audit(
    case when tg_op = 'INSERT' then 'member.invite'
         when new.status = 'revoked' and old.status <> 'revoked' then 'member.revoke'
         when new.status = 'active' and old.status = 'invited' then 'member.accept'
         else 'member.update' end,
    'project_member', new.id, new.project_id, new.org_id,
    jsonb_build_object('role', new.role, 'status', new.status, 'access_ends_at', new.access_ends_at, 'invite_email', new.invite_email));
  return new;
end;
$$;
revoke execute on function public.tg_audit_membership() from public, anon, authenticated;
create trigger audit_membership after insert or update on public.project_members for each row execute function public.tg_audit_membership();

-- Logins: copied from auth.audit_log_entries every 5 minutes (cron).
create table public.login_sync_state (
  id int primary key default 1 check (id = 1),
  last_seen timestamptz not null default '1970-01-01'
);
alter table public.login_sync_state enable row level security;
insert into public.login_sync_state default values;

create or replace function public.sync_login_audit()
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare since timestamptz; n int := 0; r record;
begin
  select last_seen into since from public.login_sync_state where id = 1;
  for r in
    select e.created_at, e.payload, e.ip_address
      from auth.audit_log_entries e
     where e.created_at > since
       and e.payload->>'action' in ('login', 'logout', 'token_refreshed', 'user_signedup', 'user_recovery_requested', 'user_modified')
     order by e.created_at
  loop
    insert into public.audit_events (occurred_at, actor_user_id, actor_kind, action, entity_type, ip, details)
    values (r.created_at, nullif(r.payload->>'actor_id', '')::uuid, 'system', 'auth.' || (r.payload->>'action'), 'auth_user',
            nullif(r.ip_address, '')::inet, r.payload - 'actor_id');
    n := n + 1;
    since := r.created_at;
  end loop;
  update public.login_sync_state set last_seen = since where id = 1;
  return n;
end;
$$;
revoke execute on function public.sync_login_audit() from public, anon, authenticated;
select cron.schedule('sync-login-audit', '*/5 * * * *', $$select public.sync_login_audit()$$);
