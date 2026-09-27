-- 0007 Grant normalization (SPEC §6.2). Runs last in Phase 0 and is re-run (as a new migration) after any function change.
--
-- Every function in public:
--   * EXECUTE revoked from public and anon;
--   * granted to service_role;
--   * granted to authenticated only if it is a user-facing RPC (listed below).
-- Everything else is internal: triggers, worker RPCs, public-endpoint RPCs (service role only).
--
-- The anon allowlist (supabase/tests/anon_allowlist.sql) must stay empty of public functions: public endpoints use the
-- service role after their own token / rate-limit checks.

do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;

-- User-facing RPCs (the data layer calls these).
grant execute on function public.has_capability(uuid, text) to authenticated;
grant execute on function public.is_member(uuid) to authenticated;
grant execute on function public.has_scope(uuid, text, text) to authenticated;
grant execute on function public.is_owner_of(text, uuid) to authenticated;
grant execute on function public.is_org_admin(uuid) to authenticated;
grant execute on function public.role_is_walled(text) to authenticated;
grant execute on function public.session_aal() to authenticated;
grant execute on function public.accept_invites() to authenticated;
grant execute on function public.people_display(uuid) to authenticated;
grant execute on function public.my_projects() to authenticated;
grant execute on function public.next_number(uuid, text) to authenticated;
grant execute on function public.next_author_number(uuid, text) to authenticated;
grant execute on function public.peek_author_number(uuid, text) to authenticated;
grant execute on function public.assert_version(regclass, uuid, int) to authenticated;
grant execute on function public.log_view(text, uuid, uuid) to authenticated;
grant execute on function public.post_activity(uuid, text, text, text, uuid, text, uuid[]) to authenticated;
grant execute on function public.create_task(uuid, uuid, text, text, text, uuid, timestamptz, boolean, jsonb) to authenticated;
grant execute on function public.board_feed(uuid, timestamptz, int) to authenticated;
grant execute on function public.folder_can_read(uuid) to authenticated;
grant execute on function public.folder_can_write(uuid) to authenticated;
grant execute on function public.folder_effective_id(uuid) to authenticated;
grant execute on function public.file_storage_path(uuid, uuid, uuid, text) to authenticated;
grant execute on function public.authorize_download(uuid, text) to authenticated;
grant execute on function public.create_transmittal(uuid, text[], uuid[], uuid[], text, text) to authenticated;
grant execute on function public.enqueue_job(text, jsonb, uuid, text, timestamptz) to authenticated;

-- Default privileges for tables: PostgREST needs table grants for RLS to apply; anon gets nothing.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
grant select, insert, update on all tables in schema public to authenticated;
revoke all on public.role_permissions, public.roles, public.owner_lookup, public.job_kinds, public.project_counters,
  public.author_counters, public.audit_events, public.login_sync_state, public.dead_jobs, public.worker_heartbeat,
  public.rate_limits, public.email_suppressions, public.postmark_events, public.ai_calls, public.downloads,
  public.file_pages, public.activity, public.activity_recipients from authenticated;
grant select on public.role_permissions, public.roles, public.job_kinds, public.audit_events, public.dead_jobs,
  public.ai_calls, public.downloads, public.file_pages, public.activity, public.activity_recipients to authenticated;
grant insert, update on public.email_inbound to service_role;
grant usage on all sequences in schema public to authenticated;

alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on functions from anon, public;
