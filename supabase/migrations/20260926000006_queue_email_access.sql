-- 0006 Queue (SPEC §8.9), rate limits, access links (§6.4), email in/out tables, push subscriptions, AI call log.

-- ---------------------------------------------------------------------------
-- Queue: pgmq in a non-exposed schema. Only wrapper RPCs touch it.
-- ---------------------------------------------------------------------------
create schema if not exists queue;
revoke all on schema queue from public, anon, authenticated;
revoke all on schema pgmq from public, anon, authenticated;
select pgmq.create('jobs');

-- Job kinds are data: which capability may enqueue them, visibility timeout, max attempts.
create table public.job_kinds (
  kind text primary key,
  required_capability text,            -- null = any active member of the project
  visibility_timeout_sec int not null default 300,
  max_attempts int not null default 5
);
alter table public.job_kinds enable row level security;
insert into public.job_kinds (kind, required_capability, visibility_timeout_sec, max_attempts) values
  ('scan_file', null, 900, 5),
  ('extract_text', null, 1800, 5),
  ('thumbnails', null, 900, 5),
  ('render_pdf', null, 600, 5),
  ('build_zip', null, 1800, 3),
  ('r2_copy', 'project.manage', 7200, 3),
  ('sort_inbound_email', 'project.manage', 300, 5),
  ('send_email', null, 120, 5);

-- Index of every job for idempotency, status and dead-letter handling.
create table queue.jobs_index (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  project_id uuid references public.projects(id),
  kind text not null references public.job_kinds(kind),
  idempotency_key text not null,
  payload jsonb not null,
  msg_id bigint,
  attempts int not null default 0,
  status text not null default 'queued' check (status in ('queued', 'running', 'done', 'dead')),
  last_error text,
  hold_until timestamptz,
  created_by uuid,
  unique (kind, idempotency_key)
);

create table public.dead_jobs (
  id uuid primary key,
  died_at timestamptz not null default now(),
  project_id uuid references public.projects(id),
  kind text not null,
  payload jsonb not null,
  attempts int not null,
  last_error text
);
alter table public.dead_jobs enable row level security;
create policy "dead_jobs: project admins read" on public.dead_jobs for select to authenticated
  using (project_id is not null and public.has_capability(project_id, 'project.manage'));

create or replace function public.enqueue_job(
  p_kind text, p_payload jsonb, p_project_id uuid default null, p_idempotency_key text default null, p_hold_until timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare jk public.job_kinds; jid uuid; is_service boolean; mid bigint; key text;
begin
  select * into jk from public.job_kinds where kind = p_kind;
  if jk is null then raise exception 'unknown job kind %', p_kind; end if;
  is_service := public.is_service_role();
  if not is_service then
    if p_project_id is null then raise exception 'project required' using errcode = '42501'; end if;
    if jk.required_capability is null then
      if not public.is_member(p_project_id) then raise exception 'forbidden' using errcode = '42501'; end if;
    elsif not public.has_capability(p_project_id, jk.required_capability) then
      raise exception 'forbidden' using errcode = '42501';
    end if;
  end if;
  key := coalesce(p_idempotency_key, encode(extensions.digest(p_kind || ':' || coalesce(p_project_id::text, '') || ':' || p_payload::text, 'sha256'), 'hex'));
  insert into queue.jobs_index (project_id, kind, idempotency_key, payload, hold_until, created_by)
  values (p_project_id, p_kind, key, p_payload, p_hold_until, auth.uid())
  on conflict (kind, idempotency_key) do nothing
  returning id into jid;
  if jid is null then
    select id into jid from queue.jobs_index where kind = p_kind and idempotency_key = key;
    return jid; -- already queued: safe to repeat
  end if;
  if p_hold_until is null or p_hold_until <= now() then
    select pgmq.send('jobs', jsonb_build_object('job_id', jid)) into mid;
    update queue.jobs_index set msg_id = mid where id = jid;
  end if;
  return jid;
end;
$$;
revoke execute on function public.enqueue_job(text, jsonb, uuid, text, timestamptz) from public, anon;

-- Held jobs (e.g. sealed bids) are released by cron each minute.
create or replace function public.release_held_jobs()
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare r record; n int := 0; mid bigint;
begin
  for r in select id from queue.jobs_index where status = 'queued' and msg_id is null and hold_until is not null and hold_until <= now() loop
    select pgmq.send('jobs', jsonb_build_object('job_id', r.id)) into mid;
    update queue.jobs_index set msg_id = mid, hold_until = null where id = r.id;
    n := n + 1;
  end loop;
  return n;
end;
$$;
revoke execute on function public.release_held_jobs() from public, anon, authenticated;
select cron.schedule('release-held-jobs', '* * * * *', $$select public.release_held_jobs()$$);

-- Nightly storage copy to R2 (SPEC §6.5). pg_cron runs as postgres, which is_service_role() accepts.
select cron.schedule('nightly-r2-copy', '0 9 * * *', $$select public.enqueue_job('r2_copy', '{}'::jsonb, null, 'r2_copy:' || current_date)$$);

-- Worker-side RPCs: service role only.
create or replace function public.worker_read_jobs(p_limit int default 5)
returns table (job_id uuid, msg_id bigint, kind text, project_id uuid, payload jsonb, attempts int)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare m record; j queue.jobs_index;
begin
  if not public.is_service_role() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  for m in select * from pgmq.read('jobs', 60, p_limit) loop
    select * into j from queue.jobs_index where id = (m.message->>'job_id')::uuid;
    if j is null then perform pgmq.delete('jobs', m.msg_id); continue; end if;
    -- Extend visibility to the kind's timeout, bump attempts.
    perform pgmq.set_vt('jobs', m.msg_id, (select visibility_timeout_sec from public.job_kinds where kind = j.kind));
    update queue.jobs_index set attempts = attempts + 1, status = 'running', updated_at = now() where id = j.id;
    job_id := j.id; msg_id := m.msg_id; kind := j.kind; project_id := j.project_id; payload := j.payload; attempts := j.attempts + 1;
    return next;
  end loop;
end;
$$;
revoke execute on function public.worker_read_jobs(int) from public, anon, authenticated;

create or replace function public.worker_ack_job(p_job_id uuid, p_msg_id bigint)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_service_role() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform pgmq.delete('jobs', p_msg_id);
  update queue.jobs_index set status = 'done', updated_at = now(), last_error = null where id = p_job_id;
end;
$$;
revoke execute on function public.worker_ack_job(uuid, bigint) from public, anon, authenticated;

-- Failure: backoff by re-setting visibility; after max_attempts the job dies and the project admin gets a task.
create or replace function public.worker_fail_job(p_job_id uuid, p_msg_id bigint, p_error text)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare j queue.jobs_index; jk public.job_kinds; admin uuid;
begin
  if not public.is_service_role() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into j from queue.jobs_index where id = p_job_id;
  if j is null then raise exception 'job % not found', p_job_id using errcode = 'P0002'; end if;
  select * into jk from public.job_kinds where kind = j.kind;
  if j.attempts >= jk.max_attempts then
    perform pgmq.delete('jobs', p_msg_id);
    update queue.jobs_index set status = 'dead', last_error = left(p_error, 2000), updated_at = now() where id = j.id;
    insert into public.dead_jobs (id, project_id, kind, payload, attempts, last_error)
    values (j.id, j.project_id, j.kind, j.payload, j.attempts, left(p_error, 2000));
    if j.project_id is not null then
      for admin in
        select pm.user_id from public.project_members pm join public.role_permissions rp on rp.role = pm.role
        where pm.project_id = j.project_id and pm.status = 'active' and rp.capability = 'project.manage' and pm.user_id is not null
      loop
        perform public.create_task(j.project_id, admin, 'job_failed', 'Background job failed: ' || j.kind, 'dead_job', j.id, null, false,
                                   jsonb_build_object('kind', j.kind, 'error', left(p_error, 500)));
      end loop;
    end if;
    return 'dead';
  end if;
  -- exponential backoff: 30s, 60s, 120s, 240s ...
  perform pgmq.set_vt('jobs', p_msg_id, 30 * power(2, j.attempts - 1)::int);
  update queue.jobs_index set status = 'queued', last_error = left(p_error, 2000), updated_at = now() where id = j.id;
  return 'retry';
end;
$$;
revoke execute on function public.worker_fail_job(uuid, bigint, text) from public, anon, authenticated;

-- Queue health for the worker's heartbeat and the pg_cron check.
create table public.worker_heartbeat (
  id int primary key default 1 check (id = 1),
  last_seen timestamptz not null default now(),
  version text
);
alter table public.worker_heartbeat enable row level security;
insert into public.worker_heartbeat default values;

create or replace function public.worker_heartbeat_ping(p_version text)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.worker_heartbeat set last_seen = now(), version = p_version where id = 1;
$$;
revoke execute on function public.worker_heartbeat_ping(text) from public, anon, authenticated;

create or replace function public.queue_health()
returns table (queued bigint, running bigint, dead bigint, worker_last_seen timestamptz, worker_stale boolean)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select (select count(*) from queue.jobs_index where status = 'queued'),
         (select count(*) from queue.jobs_index where status = 'running'),
         (select count(*) from queue.jobs_index where status = 'dead'),
         (select last_seen from public.worker_heartbeat where id = 1),
         (select last_seen < now() - interval '3 minutes' from public.worker_heartbeat where id = 1);
$$;
revoke execute on function public.queue_health() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Rate limits: token bucket per key. Used by every public endpoint.
-- ---------------------------------------------------------------------------
create table public.rate_limits (
  key text primary key,
  tokens double precision not null,
  updated_at timestamptz not null default now()
);
alter table public.rate_limits enable row level security;

create or replace function public.consume_rate_limit(p_key text, p_capacity int, p_refill_per_sec double precision, p_cost int default 1)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare r public.rate_limits; now_ts timestamptz := clock_timestamp(); t double precision;
begin
  if not public.is_service_role() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  insert into public.rate_limits (key, tokens, updated_at) values (p_key, p_capacity, now_ts)
  on conflict (key) do nothing;
  select * into r from public.rate_limits where key = p_key for update;
  t := least(p_capacity, r.tokens + extract(epoch from (now_ts - r.updated_at)) * p_refill_per_sec);
  if t < p_cost then
    update public.rate_limits set tokens = t, updated_at = now_ts where key = p_key;
    return false;
  end if;
  update public.rate_limits set tokens = t - p_cost, updated_at = now_ts where key = p_key;
  return true;
end;
$$;
revoke execute on function public.consume_rate_limit(text, int, double precision, int) from public, anon, authenticated;
select cron.schedule('prune-rate-limits', '17 * * * *', $$delete from public.rate_limits where updated_at < now() - interval '1 day'$$);

-- ---------------------------------------------------------------------------
-- Access links: permanent, per member, opaque token (hash stored).
-- ---------------------------------------------------------------------------
create table public.access_links (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  project_member_id uuid not null references public.project_members(id),
  token_hash text not null unique,
  revoked_at timestamptz,
  last_used_at timestamptz,
  use_count int not null default 0
);
alter table public.access_links enable row level security;
create index access_links_member on public.access_links (project_member_id);
create policy "access_links: managers read" on public.access_links for select to authenticated
  using (exists (select 1 from public.project_members pm where pm.id = access_links.project_member_id and public.has_capability(pm.project_id, 'members.manage')));
-- Created by invite-member (service role). Resolved by the public `access` endpoint through resolve_access_link().

-- Called by the public endpoint with the service role. Returns the invited email (masked for display) and project name,
-- or nothing when the link is revoked, the member is revoked, or access_ends_at has passed.
create or replace function public.resolve_access_link(p_link_id uuid, p_token_hash text)
returns table (invite_email text, project_id uuid, project_name text, role text, status text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_service_role() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
    with hit as (
      select al.id, pm.invite_email, pm.project_id, p.name, pm.role, pm.status
      from public.access_links al
      join public.project_members pm on pm.id = al.project_member_id
      join public.projects p on p.id = pm.project_id
      where al.id = p_link_id and al.token_hash = p_token_hash and al.revoked_at is null
        and pm.status <> 'revoked' and (pm.access_ends_at is null or pm.access_ends_at > now())
        and p.deleted_at is null
    ), touched as (
      update public.access_links set last_used_at = now(), use_count = use_count + 1 where id = (select id from hit) returning id
    )
    select h.invite_email, h.project_id, h.name, h.role, h.status from hit h;
end;
$$;
revoke execute on function public.resolve_access_link(uuid, text) from public, anon, authenticated;

-- Revoking a member revokes their links and ends their sessions' usefulness immediately (RLS reads status live).
create or replace function public.tg_member_revoked()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status = 'revoked' and old.status <> 'revoked' then
    new.revoked_at := coalesce(new.revoked_at, now());
    update public.access_links set revoked_at = now() where project_member_id = new.id and revoked_at is null;
    update public.share_links set revoked_at = now() where member_id = new.id and revoked_at is null;
  end if;
  return new;
end;
$$;
revoke execute on function public.tg_member_revoked() from public, anon, authenticated;
create trigger on_member_revoked before update on public.project_members for each row execute function public.tg_member_revoked();

-- ---------------------------------------------------------------------------
-- Email out / in, Postmark events.
-- ---------------------------------------------------------------------------
create table public.email_outbound (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version int not null default 1,
  org_id uuid references public.orgs(id),
  project_id uuid references public.projects(id),
  kind text not null,
  to_email text not null,
  subject text not null,
  entity_type text,
  entity_id uuid,
  postmark_message_id text unique,
  status text not null default 'queued' check (status in ('queued', 'sent', 'delivered', 'bounced', 'spam', 'failed', 'test_mode')),
  status_at timestamptz,
  first_opened_at timestamptz,
  error text,
  created_by uuid references auth.users(id)
);
alter table public.email_outbound enable row level security;
create trigger touch before update on public.email_outbound for each row execute function public.tg_touch_row();
create index email_outbound_entity on public.email_outbound (entity_type, entity_id);
create policy "email_outbound: senders read own project" on public.email_outbound for select to authenticated
  using (project_id is not null and (created_by = auth.uid() or public.has_capability(project_id, 'project.manage')));

-- Suppression list: hard bounces and spam complaints stop future sends (MDR lesson).
create table public.email_suppressions (
  email text primary key,
  reason text not null,
  created_at timestamptz not null default now()
);
alter table public.email_suppressions enable row level security;

create table public.postmark_events (
  id bigint generated always as identity primary key,
  received_at timestamptz not null default now(),
  message_id text not null,
  record_type text not null,
  payload jsonb not null,
  unique (message_id, record_type)
);
alter table public.postmark_events enable row level security;

create table public.email_inbound (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version int not null default 1,
  message_id text not null unique,
  org_id uuid references public.orgs(id),
  project_id uuid references public.projects(id),
  to_address text not null,
  from_email text not null,
  from_name text,
  subject text not null default '',
  raw_path text not null,
  text_body text,
  attachment_file_ids uuid[] not null default '{}',
  spf_pass boolean not null default false,
  dkim_pass boolean not null default false,
  sender_member_id uuid references public.project_members(id),
  status text not null default 'quarantined' check (status in ('quarantined', 'sorted', 'filed', 'rejected')),
  classification text,
  thread_token text
);
alter table public.email_inbound enable row level security;
create trigger touch before update on public.email_inbound for each row execute function public.tg_touch_row();
create index email_inbound_project on public.email_inbound (project_id, created_at desc);
create policy "email_inbound: project admins read" on public.email_inbound for select to authenticated
  using (project_id is not null and public.has_capability(project_id, 'project.manage'));
create policy "email_inbound: project admins update status" on public.email_inbound for update to authenticated
  using (project_id is not null and public.has_capability(project_id, 'project.manage'))
  with check (project_id is not null and public.has_capability(project_id, 'project.manage'));

-- ---------------------------------------------------------------------------
-- Push subscriptions (§8.6) and AI call log (§8.7).
-- ---------------------------------------------------------------------------
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  keys jsonb not null,
  user_agent text,
  last_success_at timestamptz,
  failures int not null default 0
);
alter table public.push_subscriptions enable row level security;
create policy "push: own" on public.push_subscriptions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create table public.ai_calls (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  task text not null,
  model text not null,
  project_id uuid references public.projects(id),
  user_id uuid,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  latency_ms int not null default 0,
  ok boolean not null default true,
  error text
);
alter table public.ai_calls enable row level security;
create policy "ai_calls: project admins read" on public.ai_calls for select to authenticated
  using (project_id is not null and public.has_capability(project_id, 'project.manage'));
