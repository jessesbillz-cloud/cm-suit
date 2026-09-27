-- 0004 Activity (message board), read marks, and "Needs you" tasks (SPEC §5.5).

create table public.activity (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  version int not null default 1,
  org_id uuid not null references public.orgs(id),
  project_id uuid not null references public.projects(id),
  kind text not null,
  entity_type text,
  entity_id uuid,
  summary text not null check (length(summary) between 1 and 500),
  actor_user_id uuid references auth.users(id),
  audience_capability text
);
alter table public.activity enable row level security;
create index activity_project_time on public.activity (project_id, created_at desc);

create table public.activity_recipients (
  activity_id uuid not null references public.activity(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  primary key (activity_id, user_id)
);
alter table public.activity_recipients enable row level security;
create index activity_recipients_user on public.activity_recipients (user_id);

-- A row is visible only to its audience.
create policy "activity: audience read" on public.activity for select to authenticated
  using (
    public.is_member(project_id)
    and (
      (audience_capability is not null and public.has_capability(project_id, audience_capability))
      or exists (select 1 from public.activity_recipients ar where ar.activity_id = activity.id and ar.user_id = auth.uid())
    )
  );
create policy "activity_recipients: own read" on public.activity_recipients for select to authenticated
  using (user_id = auth.uid());
-- Writes happen only through post_activity().

create or replace function public.post_activity(
  p_project_id uuid,
  p_kind text,
  p_summary text,
  p_entity_type text default null,
  p_entity_id uuid default null,
  p_audience_capability text default null,
  p_recipient_user_ids uuid[] default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare new_id uuid; oid uuid; is_service boolean;
begin
  is_service := current_setting('request.jwt.claim.role', true) = 'service_role';
  if not is_service and not public.is_member(p_project_id) then
    raise exception 'not a member' using errcode = '42501';
  end if;
  if p_audience_capability is null and (p_recipient_user_ids is null or cardinality(p_recipient_user_ids) = 0) then
    raise exception 'activity needs an audience';
  end if;
  select org_id into oid from public.projects where id = p_project_id;
  insert into public.activity (org_id, project_id, kind, entity_type, entity_id, summary, actor_user_id, audience_capability, created_by)
  values (oid, p_project_id, p_kind, p_entity_type, p_entity_id, p_summary, auth.uid(), p_audience_capability, auth.uid())
  returning id into new_id;
  if p_recipient_user_ids is not null then
    insert into public.activity_recipients (activity_id, user_id)
    select new_id, unnest(p_recipient_user_ids) on conflict do nothing;
  end if;
  return new_id;
end;
$$;
revoke execute on function public.post_activity(uuid, text, text, text, uuid, text, uuid[]) from public, anon;

-- Read marks drive unread bolding and "What's new".
create table public.read_marks (
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id),
  last_seen_at timestamptz not null default now(),
  primary key (user_id, project_id)
);
alter table public.read_marks enable row level security;
create policy "read_marks: own" on public.read_marks for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.is_member(project_id));

-- Tasks: handled in place on the board.
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  version int not null default 1,
  deleted_at timestamptz,
  org_id uuid not null references public.orgs(id),
  project_id uuid not null references public.projects(id),
  assignee_user_id uuid not null references auth.users(id),
  kind text not null,
  title text not null check (length(title) between 1 and 300),
  entity_type text,
  entity_id uuid,
  due_at timestamptz,
  done_at timestamptz,
  done_by uuid references auth.users(id),
  requires_signature boolean not null default false,
  payload jsonb not null default '{}'::jsonb
);
alter table public.tasks enable row level security;
create trigger touch before update on public.tasks for each row execute function public.tg_touch_row();
create trigger no_delete before delete on public.tasks for each row execute function public.tg_block_delete();
create trigger audit_row after insert or update on public.tasks for each row execute function public.tg_audit_row();
create index tasks_assignee_open on public.tasks (assignee_user_id, due_at) where done_at is null and deleted_at is null;

create policy "tasks: assignee reads" on public.tasks for select to authenticated
  using (deleted_at is null and assignee_user_id = auth.uid() and public.is_member(project_id));
-- Only the assignee completes a task (undo = clear done_at within the version check).
create policy "tasks: assignee completes" on public.tasks for update to authenticated
  using (assignee_user_id = auth.uid() and public.is_member(project_id))
  with check (assignee_user_id = auth.uid());
-- Creation happens inside workflows (SECURITY DEFINER RPCs / edge functions).

create or replace function public.create_task(
  p_project_id uuid, p_assignee uuid, p_kind text, p_title text,
  p_entity_type text default null, p_entity_id uuid default null, p_due_at timestamptz default null,
  p_requires_signature boolean default false, p_payload jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare new_id uuid; oid uuid;
begin
  if current_setting('request.jwt.claim.role', true) is distinct from 'service_role' and not public.is_member(p_project_id) then
    raise exception 'not a member' using errcode = '42501';
  end if;
  select org_id into oid from public.projects where id = p_project_id;
  insert into public.tasks (org_id, project_id, assignee_user_id, kind, title, entity_type, entity_id, due_at, requires_signature, payload, created_by)
  values (oid, p_project_id, p_assignee, p_kind, p_title, p_entity_type, p_entity_id, p_due_at, p_requires_signature, p_payload, auth.uid())
  returning id into new_id;
  return new_id;
end;
$$;
revoke execute on function public.create_task(uuid, uuid, text, text, text, uuid, timestamptz, boolean, jsonb) from public, anon;

-- Board feed: activity across the caller's projects (or one), newest first, with unread flag.
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
    and (p_before is null or a.created_at < p_before)
  order by a.created_at desc
  limit least(greatest(p_limit, 1), 200);
$$;
revoke execute on function public.board_feed(uuid, timestamptz, int) from public, anon;
