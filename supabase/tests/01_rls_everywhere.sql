begin;
select plan(13);
-- SPEC §6.1: RLS on every table in exposed schemas, no `true` policies, internal schemas never reachable from the API.

select is_empty(
  $$ select c.relname
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity
     order by 1 $$,
  'every table in public has RLS enabled'
);

select ok(
  (select c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'storage' and c.relname = 'objects'),
  'storage.objects has RLS enabled'
);

-- Views run with their owner's rights unless security_invoker is set, which would bypass RLS.
select is_empty(
  $$ select c.relname
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('v', 'm')
       and not coalesce('security_invoker=true' = any (c.reloptions) or 'security_invoker=on' = any (c.reloptions), false)
     order by 1 $$,
  'no view in public bypasses RLS (security_invoker required)'
);

select is_empty(
  $$ select schemaname, tablename, policyname
     from pg_policies
     where schemaname in ('public', 'storage')
       and (regexp_replace(coalesce(qual, ''), '[()\s]', '', 'g') = 'true'
            or regexp_replace(coalesce(with_check, ''), '[()\s]', '', 'g') = 'true')
     order by 1, 2, 3 $$,
  'no policy in public or storage is USING (true) / WITH CHECK (true)'
);

select ok(not has_schema_privilege('anon', 'queue', 'USAGE'), 'anon has no USAGE on schema queue');
select ok(not has_schema_privilege('authenticated', 'queue', 'USAGE'), 'authenticated has no USAGE on schema queue');
select ok(not has_schema_privilege('anon', 'pgmq', 'USAGE'), 'anon has no USAGE on schema pgmq');
select ok(not has_schema_privilege('authenticated', 'pgmq', 'USAGE'), 'authenticated has no USAGE on schema pgmq');

-- Supabase's Queues integration creates pgmq_public (wrappers callable over the API). It must not exist, or be closed.
select ok(
  not exists (select 1 from pg_namespace where nspname = 'pgmq_public')
  or not (has_schema_privilege('anon', 'pgmq_public', 'USAGE') or has_schema_privilege('authenticated', 'pgmq_public', 'USAGE')),
  'pgmq_public is absent or not usable by anon/authenticated'
);

-- PostgREST's exposed schemas, when set on the authenticator role, never include the queue schemas.
select is_empty(
  $$ select cfg
     from pg_db_role_setting s
     join pg_roles r on r.oid = s.setrole
     cross join lateral unnest(s.setconfig) as cfg
     where r.rolname = 'authenticator'
       and cfg like 'pgrst.db_schemas=%'
       and exists (select 1 from unnest(string_to_array(split_part(cfg, '=', 2), ',')) as sch
                   where trim(sch) in ('pgmq', 'pgmq_public', 'queue')) $$,
  'authenticator pgrst.db_schemas exposes neither pgmq, pgmq_public nor queue'
);

-- SPEC §5.2: only the service role changes the capability matrix.
select ok(
  not has_table_privilege('authenticated', 'public.role_permissions', 'INSERT,UPDATE,DELETE,TRUNCATE')
  and not has_table_privilege('authenticated', 'public.roles', 'INSERT,UPDATE,DELETE,TRUNCATE'),
  'authenticated cannot write roles / role_permissions'
);

-- Supabase's default privileges hand DELETE and TRUNCATE on new public tables to authenticated. TRUNCATE ignores RLS
-- and delete triggers; DELETE is only meaningful where a policy allows it. Hold neither anywhere else.
select is_empty(
  $$ select c.relname
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r', 'p')
       and has_table_privilege('authenticated', c.oid, 'TRUNCATE')
     order by 1 $$,
  'authenticated holds TRUNCATE on no public table'
);
select is_empty(
  $$ select c.relname
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r', 'p')
       and has_table_privilege('authenticated', c.oid, 'DELETE')
       and not exists (select 1 from pg_policies p
                       where p.schemaname = 'public' and p.tablename = c.relname
                         and p.cmd in ('DELETE', 'ALL') and p.roles && array['authenticated', 'public']::name[])
     order by 1 $$,
  'authenticated holds DELETE only on public tables that have a delete policy for it'
);

select * from finish();
rollback;
