-- anon allowlist (CLAUDE.md rule 1, SPEC §6.1 / §6.2).
--
-- The ONLY privileges the `anon` role may hold on objects in schema public. 01-03 read this list; anything anon can
-- touch that is not listed here fails CI. Phase 0: EMPTY on purpose. Every public endpoint (SPEC §6.4) runs as the
-- service role after its own token / rate-limit checks, so anon needs nothing in the database.
--
-- To add an entry, put a row above the sentinel, with a reason:
--   ('table',    'public.some_table',        'SELECT',  'why anon must read it'),
--   ('sequence', 'public.some_table_id_seq', 'USAGE',   'why'),
--   ('function', 'public.some_fn(uuid, text)', 'EXECUTE', 'why')   -- identity args as pg_get_function_identity_arguments prints them
--
-- Test files include this with `\set allowlist_included true` + `\ir anon_allowlist.sql`. Run on its own (pg_prove runs
-- every *.sql here) it checks that the entries are well formed.

\if :{?allowlist_included}
\else
begin;
select plan(1);
\endif

create temp table if not exists anon_allowlist (
  object_type text not null,
  object_name text not null,
  privilege text not null,
  reason text not null
);
grant select on anon_allowlist to public;

insert into anon_allowlist (object_type, object_name, privilege, reason)
select * from (values
  -- entries go here
  (null::text, null::text, null::text, null::text) -- sentinel; filtered out below
) v (object_type, object_name, privilege, reason)
where v.object_type is not null;

\if :{?allowlist_included}
\else
select is_empty(
  $$ select * from anon_allowlist
     where object_type not in ('table', 'sequence', 'function')
        or object_name !~ '^public\.'
        or upper(privilege) <> privilege
        or length(trim(reason)) < 5 $$,
  'anon_allowlist entries are well formed (type, public.* name, upper-case privilege, a reason)'
);
select * from finish();
rollback;
\endif
