begin;
select plan(1);
-- A public function whose only argument is a table's row type is a PostgREST computed field: it becomes a readable
-- column in the API and the CLI type generator adds it to the table's Row type (migration 0028). None allowed.
\ir _helpers.psql

select is_empty(
  $$ select p.oid::regprocedure::text
       from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
       join pg_type t on t.oid = p.proargtypes[0]
       join pg_class c on c.oid = t.typrelid and c.relkind in ('r', 'v', 'm', 'p', 'f')
      where n.nspname = 'public' and p.pronargs = 1
      order by 1 $$,
  'no public function takes a single table-row argument (a PostgREST computed field)'
);

select * from finish();
rollback;
