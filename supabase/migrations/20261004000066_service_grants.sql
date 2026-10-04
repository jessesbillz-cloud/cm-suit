-- 0066 The server key's table rights, written down (CLAUDE.md rule 1).
--
-- What broke: on staging every server-made PDF, sheet read, invite and share failed with "permission denied for table
-- files" (and the like). The hosted project's default privileges give service_role only TRUNCATE / REFERENCES / TRIGGER on
-- a new table; a from-zero database (local, CI) gives it everything. Every migration so far assumed the second, so the
-- tests passed and the hosted database refused.
--
-- The fix: stop depending on the default. From here service_role's rights on every public table are set by this file and
-- are the same on every database:
--   * every table: SELECT, INSERT, UPDATE. Never TRUNCATE (it skips the row triggers), REFERENCES or TRIGGER, and DELETE
--     only where the server really deletes;
--   * the exceptions below, which keep what their own migrations chose (0023, 0050, 0053, 0054, 0055, 0056, 0060, 0062);
--   * a new table starts with SELECT, INSERT, UPDATE; a migration that wants less says so, as before.
-- supabase/tests/58_service_grants.sql holds the same map and fails on any difference.
--
-- service_role is still used only where rule 4 allows (cron, webhooks, workers, the listed public endpoints and the
-- allowlisted admin functions); this changes what the database lets that key do, not who may hold it.

-- 1. The same starting point everywhere: nothing.
do $$
declare t record;
begin
  for t in
    select c.oid::regclass as rel
    from pg_class c
    where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p', 'v', 'm')
  loop
    execute format('revoke all on table %s from service_role', t.rel);
  end loop;
end $$;

-- 2. The rule: read, add, change.
do $$
declare t record;
begin
  for t in
    select c.oid::regclass as rel
    from pg_class c
    where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p')
      and c.relname not in (
        -- written only by their own definer functions; the server key never touches the rows
        'audit_events', 'comments', 'comment_edits', 'ir_link_receipts', 'safety_meetings', 'signin_keys',
        -- read only
        'csi_divisions', 'csi_sections', 'ir_maps', 'ir_rev_items', 'rev_areas', 'rev_items', 'rev_lists', 'rev_marks',
        'revs', 'safety_signins', 'safety_topics', 'schedule_activities', 'schedule_versions',
        'role_permissions', 'roles', 'job_kinds', 'folder_templates', 'owner_lookup', 'security_switches',
        'signin_allowlist', 'testing_superusers', 'testing_role_home',
        -- records: added, never changed
        'permit_stamped_copies', 'permit_approved_sets', 'permit_stage_events'
      )
  loop
    execute format('grant select, insert, update on table %s to service_role', t.rel);
  end loop;
end $$;

-- 3. The exceptions.
grant select on
  public.csi_divisions, public.csi_sections, public.ir_maps, public.ir_rev_items, public.rev_areas, public.rev_items,
  public.rev_lists, public.rev_marks, public.revs, public.safety_signins, public.safety_topics,
  public.schedule_activities, public.schedule_versions,
  public.role_permissions, public.roles, public.job_kinds, public.folder_templates, public.owner_lookup,
  public.security_switches, public.signin_allowlist, public.testing_superusers, public.testing_role_home
to service_role;
grant select, insert on public.permit_stamped_copies, public.permit_approved_sets, public.permit_stage_events to service_role;
-- The server removes rows only here: a calendar feed token that was replaced, a correction's rows (0023), and an email
-- event it stored twice (email-events).
grant delete on public.calendar_feed_tokens, public.corrections, public.correction_history, public.email_events to service_role;

-- 4. New tables start from the rule on every database.
alter default privileges in schema public revoke all on tables from service_role;
alter default privileges in schema public grant select, insert, update on tables to service_role;
