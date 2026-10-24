begin;
select plan(32);
-- Migration 0117 (Jesse, Oct 23: "somebody should have the option to save whatever they want as their own quick button
-- ... all I've got to do is tap it and it says the same thing every time"). Each person's phrases are their own: nobody
-- reads another's. At most 50 live, a name of 40 and a text of 500 characters. Every write is safe to repeat, edits and
-- removes carry the version, a remove keeps the row and Undo brings it back. None ship.
\ir _helpers.psql

select pg_temp.mk_user('a0000000-0000-0000-0000-000000001031', 'probe+qp-one@example.test', 'Ivy Inspector');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000001032', 'probe+qp-two@example.test', 'Dana Deputy');

select is((select count(*)::int from public.quick_phrases), 0, 'none ship');
select ok(has_table_privilege('authenticated', 'public.quick_phrases', 'select')
          and not has_table_privilege('authenticated', 'public.quick_phrases', 'insert')
          and not has_table_privilege('authenticated', 'public.quick_phrases', 'update')
          and not has_table_privilege('authenticated', 'public.quick_phrases', 'delete')
          and not has_table_privilege('anon', 'public.quick_phrases', 'select')
          and not has_table_privilege('service_role', 'public.quick_phrases', 'select'),
  'people read their own, nothing else touches the table');
select ok(not has_function_privilege('anon', 'public.quick_phrase_add(uuid, text, text, text)', 'execute')
          and has_function_privilege('authenticated', 'public.quick_phrase_add(uuid, text, text, text)', 'execute')
          and not has_function_privilege('authenticated', 'public.quick_phrase_room(uuid)', 'execute')
          and not has_function_privilege('authenticated', 'public.quick_phrase_check(text, text, text)', 'execute'),
  'the steps are for signed-in people, the checks for nobody');

set local role anon;
select throws_ok($$ select public.quick_phrase_add(gen_random_uuid(), 'X', 'X') $$, '42501', null, 'anon adds nothing');

set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000001031');
create temp table p1 as select * from public.quick_phrase_add('d0000000-0000-0000-0000-000000001031', '  OK to cover ',
  ' Inspected and OK to cover. ', 'ir_result');
grant select on p1 to public;
select is((select row(label, body, context, sort, version, owner_id)::text from p1),
  row('OK to cover', 'Inspected and OK to cover.', 'ir_result', 0, 1, 'a0000000-0000-0000-0000-000000001031'::uuid)::text,
  'added, trimmed, first in line, mine');
select is((select id from public.quick_phrase_add('d0000000-0000-0000-0000-000000001031', 'Other', 'Other text', 'any')),
  (select id from p1), 'the same add again is the same phrase');
select is((select count(*)::int from public.quick_phrases), 1, 'and makes no second');
select is((public.quick_phrase_add('d0000000-0000-0000-0000-000000001032', 'No firecaulk', 'Missing firecaulk at the head of wall.')).sort,
  1, 'the next goes after it, every place by default');
select is((select context from public.quick_phrases where add_key = 'd0000000-0000-0000-0000-000000001032'), 'any',
  'every place');

select throws_ok($$ select public.quick_phrase_add(gen_random_uuid(), 'X', repeat('a', 501)) $$, '22023',
  'The text is 1 to 500 characters.', 'at most 500 characters of text');
select throws_ok($$ select public.quick_phrase_add(gen_random_uuid(), repeat('a', 41), 'X') $$, '22023',
  'The name is 1 to 40 characters.', 'at most 40 of name');
select throws_ok($$ select public.quick_phrase_add(gen_random_uuid(), 'X', '   ') $$, '22023', null, 'no empty text');
select throws_ok($$ select public.quick_phrase_add(gen_random_uuid(), 'X', 'X', 'daily') $$, '22023',
  'Unknown place for a quick button.', 'only the known places');

-- Nobody reads another's
select pg_temp.login('a0000000-0000-0000-0000-000000001032');
select is((select count(*)::int from public.quick_phrases), 0, 'another person reads none of mine');
select throws_ok(format('select public.quick_phrase_edit(%L, 1, %L, %L, %L)', (select id from p1), 'Mine', 'Mine now', 'any'),
  'P0002', null, 'nor edits one');
select throws_ok(format('select public.quick_phrase_remove(%L, 1)', (select id from p1)), 'P0002', null, 'nor removes one');
select throws_ok(format('select public.quick_phrase_restore(%L)', (select id from p1)), 'P0002', null, 'nor brings one back');
select throws_ok(format('select * from public.quick_phrase_order(array[%L]::uuid[])', (select id from p1)), '22023',
  'Those are not your quick buttons.', 'nor orders them');
select is((public.quick_phrase_add('d0000000-0000-0000-0000-000000001031', 'Approved', 'Approved as shown.', 'ofs_decision')).owner_id,
  'a0000000-0000-0000-0000-000000001032'::uuid, 'the same key from another person is their own phrase');

-- Edit, remove, Undo, order
select pg_temp.login('a0000000-0000-0000-0000-000000001031');
select throws_ok(format('select public.quick_phrase_edit(%L, 9, %L, %L, %L)', (select id from p1), 'OK', 'OK to cover.', 'ir_result'),
  '40001', null, 'an edit carries the version');
select is((public.quick_phrase_edit((select id from p1), 1, 'OK', 'OK to cover.', 'ir_result')).version, 2, 'renamed');
select is((public.quick_phrase_edit((select id from p1), 1, 'OK', 'OK to cover.', 'ir_result')).version, 2,
  'the same save again changes nothing');
select is((public.quick_phrase_remove((select id from p1), 2)).deleted_at is not null, true, 'removed');
select is((public.quick_phrase_remove((select id from p1), 2)).version, 3, 'removed again: the same row');
select is((select count(*)::int from public.quick_phrases where deleted_at is null), 1, 'kept, out of the list');
select is((public.quick_phrase_restore((select id from p1))).deleted_at, null, 'Undo brings it back');
select is((select array_agg(label order by sort) from public.quick_phrase_order(
            array[(select id from public.quick_phrases where label = 'No firecaulk')])),
  array['No firecaulk', 'OK'], 'the one named goes first, the rest after');

-- At most 50 live
select lives_ok($$ select public.quick_phrase_add(gen_random_uuid(), 'P' || g, 'Phrase ' || g) from generate_series(3, 50) g $$,
  'fifty in all');
select throws_ok($$ select public.quick_phrase_add(gen_random_uuid(), 'One more', 'One more') $$, '22023',
  'You have 50 quick buttons. Remove one first.', 'not fifty-one');
select lives_ok(format('select public.quick_phrase_remove(%L, %s)', (select id from p1),
                       (select version from public.quick_phrases where id = (select id from p1))),
  'remove one');
select lives_ok($$ select public.quick_phrase_add(gen_random_uuid(), 'Its place', 'Its place') $$, 'its place taken');
select throws_ok($$ select public.quick_phrase_restore((select id from p1)) $$, '22023',
  'You have 50 quick buttons. Remove one first.', 'Undo checks the room too');

select * from finish();
rollback;
