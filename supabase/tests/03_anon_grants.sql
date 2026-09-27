begin;
select plan(7);
-- SPEC §6.1 / CLAUDE.md rule 1: anon holds nothing in public except what anon_allowlist.sql declares (empty in Phase 0).
\set allowlist_included true
\ir anon_allowlist.sql

create temp view rel as
  select c.oid, format('%I.%I', n.nspname, c.relname) as name, c.relkind
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public';
grant select on rel to public;

select is_empty(
  $$ select rel.name, p.priv
     from rel
     cross join unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) as p (priv)
     where rel.relkind in ('r', 'p', 'v', 'm', 'f')
       and has_table_privilege('anon', rel.oid, p.priv)
       and (rel.name, p.priv) not in (select object_name, privilege from anon_allowlist where object_type = 'table')
     order by 1, 2 $$,
  'anon has no table privilege in public outside anon_allowlist'
);

select is_empty(
  $$ select rel.name, p.priv
     from rel
     cross join unnest(array['SELECT', 'INSERT', 'UPDATE', 'REFERENCES']) as p (priv)
     where rel.relkind in ('r', 'p', 'v', 'm', 'f')
       and has_any_column_privilege('anon', rel.oid, p.priv)
       and (rel.name, p.priv) not in (select object_name, privilege from anon_allowlist where object_type = 'table')
     order by 1, 2 $$,
  'anon has no column-level privilege in public outside anon_allowlist'
);

select is_empty(
  $$ select rel.name, p.priv
     from rel
     cross join unnest(array['USAGE', 'SELECT', 'UPDATE']) as p (priv)
     where rel.relkind = 'S'
       and has_sequence_privilege('anon', rel.oid, p.priv)
       and (rel.name, p.priv) not in (select object_name, privilege from anon_allowlist where object_type = 'sequence')
     order by 1, 2 $$,
  'anon has no sequence privilege in public outside anon_allowlist'
);

-- Policies are the second lock: none may target anon or PUBLIC (a policy with no TO clause targets PUBLIC).
select is_empty(
  $$ select schemaname, tablename, policyname, roles
     from pg_policies
     where schemaname in ('public', 'storage')
       and (roles && array['anon', 'public']::name[])
     order by 1, 2, 3 $$,
  'no policy in public or storage targets anon or PUBLIC'
);

select is_empty(
  $$ select id from storage.buckets where public order by 1 $$,
  'every storage bucket is private'
);

select ok(
  not has_table_privilege('anon', 'storage.objects', 'SELECT,INSERT,UPDATE,DELETE')
  or not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
                 and roles && array['anon', 'public']::name[]),
  'anon can reach no storage object (no grant, or no policy that admits anon)'
);

-- Stale entries hide nothing, but they rot: every allowlist row must name something that exists.
select is_empty(
  $$ select a.object_type, a.object_name
     from anon_allowlist a
     where (a.object_type in ('table', 'sequence') and to_regclass(a.object_name) is null)
        or (a.object_type = 'function' and to_regprocedure(a.object_name) is null)
     order by 1, 2 $$,
  'every anon_allowlist entry names an existing object'
);

select * from finish();
rollback;
