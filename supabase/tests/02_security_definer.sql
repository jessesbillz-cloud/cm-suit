begin;
select plan(6);
-- SPEC §6.2 / CLAUDE.md rule 1: every SECURITY DEFINER function pins search_path, takes identity from auth.uid(),
-- and is closed to public/anon unless allowlisted.
\set allowlist_included true
\ir anon_allowlist.sql

create temp view fn as
  select p.oid,
         format('%I.%I(%s)', n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)) as sig,
         p.proname, p.prosecdef, p.proconfig, p.proargnames, p.proargmodes, p.proacl, p.proowner
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prokind in ('f', 'p');
grant select on fn to public;

select is_empty(
  $$ select sig from fn
     where prosecdef and not coalesce('search_path=public, pg_temp' = any (proconfig), false)
     order by 1 $$,
  'every SECURITY DEFINER function in public sets search_path = public, pg_temp'
);

select is_empty(
  $$ select sig from fn
     where prosecdef and has_function_privilege('anon', oid, 'EXECUTE')
       and sig not in (select object_name from anon_allowlist where object_type = 'function' and privilege = 'EXECUTE')
     order by 1 $$,
  'no SECURITY DEFINER function is executable by anon (outside anon_allowlist)'
);

select is_empty(
  $$ select sig from fn
     where has_function_privilege('anon', oid, 'EXECUTE')
       and sig not in (select object_name from anon_allowlist where object_type = 'function' and privilege = 'EXECUTE')
     order by 1 $$,
  'no function at all in public is executable by anon (outside anon_allowlist)'
);

-- A NULL proacl means the default ACL, which grants EXECUTE to PUBLIC.
select is_empty(
  $$ select sig from fn
     where prosecdef
       and exists (select 1 from aclexplode(coalesce(proacl, acldefault('f', proowner))) a
                   where a.grantee = 0 and a.privilege_type = 'EXECUTE')
     order by 1 $$,
  'no SECURITY DEFINER function grants EXECUTE to PUBLIC'
);

-- Identity comes from auth.uid(), never from a parameter. Only input arguments count (OUT/TABLE columns may be user_id).
select is_empty(
  $$ select fn.sig, a.name
     from fn
     cross join lateral unnest(
       coalesce(fn.proargnames, '{}'::text[]),
       coalesce(fn.proargmodes, array_fill('i'::"char", array[cardinality(coalesce(fn.proargnames, '{}'::text[]))]))
     ) as a (name, mode)
     where fn.prosecdef and a.mode in ('i', 'b', 'v')
       and a.name ~* '^_?(p_)?(user_id|user|uid|actor|actor_id|actor_user_id|caller|caller_id|as_user|acting_user)$'
     order by 1 $$,
  'no SECURITY DEFINER function takes a caller-identity parameter'
);

-- Internal functions (triggers, worker, public-endpoint helpers, audit) are never callable by signed-in users.
select is_empty(
  $$ select sig from fn
     where (proname like 'tg\_%'
            or proname in ('audit', 'worker_read_jobs', 'worker_ack_job', 'worker_fail_job', 'worker_heartbeat_ping',
                           'queue_health', 'consume_rate_limit', 'resolve_access_link', 'release_held_jobs',
                           'sync_login_audit'))
       and has_function_privilege('authenticated', oid, 'EXECUTE')
     order by 1 $$,
  'internal functions (tg_*, audit, worker_*, queue/rate-limit/access-link helpers) are not executable by authenticated'
);

select * from finish();
rollback;
