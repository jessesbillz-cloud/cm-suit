begin;
select plan(19);
-- Migration 0077: a photo or ticket comes off a delivery (its poster or deliveries.manage), the file is soft-deleted in
-- the job's Delivery tickets folder unless another delivery still shows it, and Undo puts both back. Safe to repeat;
-- nobody else can do it; a file the delivery never had cannot be put on through Undo.
\ir _helpers.psql

create temp table ids (k text primary key, id uuid not null);
grant all on ids to public;
create function pg_temp.id(p_k text) returns uuid language sql stable as $$ select id from pg_temp.ids where k = p_k $$;
grant execute on function pg_temp.id(text) to public;
-- The file as the table owner sees it (a removed file is hidden from everyone else).
create function pg_temp.file_deleted(p_k text) returns boolean language sql stable security definer as $$
  select f.deleted_at is not null from public.files f where f.id = (select id from pg_temp.ids where k = p_k)
$$;
grant execute on function pg_temp.file_deleted(text) to public;

select pg_temp.mk_user('a0000000-0000-0000-0000-000000000621', 'probe+dfr-admin@example.test', 'Dfr Admin');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000622', 'probe+dfr-super@example.test', 'Dfr Super');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000623', 'probe+dfr-foreman@example.test', 'Dfr Foreman');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000624', 'probe+dfr-sub@example.test', 'Dfr Sub');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000625', 'probe+dfr-inspector@example.test', 'Dfr Inspector');

insert into public.orgs (id, name, kind, created_by) values
  ('b0000000-0000-0000-0000-000000000621', 'Sample GC', 'gc', 'a0000000-0000-0000-0000-000000000621');
insert into public.projects (id, org_id, name, stage, timezone, created_by)
values ('c0000000-0000-0000-0000-000000000621', 'b0000000-0000-0000-0000-000000000621', 'Sample Ticket Job', 'construction',
        'America/Phoenix', 'a0000000-0000-0000-0000-000000000621');
insert into public.project_members (org_id, project_id, user_id, invite_email, role, status)
select 'b0000000-0000-0000-0000-000000000621', 'c0000000-0000-0000-0000-000000000621', u, e, r, 'active'
  from (values ('a0000000-0000-0000-0000-000000000622'::uuid, 'probe+dfr-super@example.test', 'superintendent'),
               ('a0000000-0000-0000-0000-000000000623', 'probe+dfr-foreman@example.test', 'foreman'),
               ('a0000000-0000-0000-0000-000000000624', 'probe+dfr-sub@example.test', 'sub'),
               ('a0000000-0000-0000-0000-000000000625', 'probe+dfr-inspector@example.test', 'inspector')) v(u, e, r);

set local role authenticated;

-- The foreman posts a delivery and puts two tickets on it.
select pg_temp.login('a0000000-0000-0000-0000-000000000623');
insert into ids select 'del', public.post_delivery('c0000000-0000-0000-0000-000000000621', 'Sample Concrete Co', current_date + 7, 60, 'Slab pour', '07:00');
insert into ids select 'folder', public.delivery_folder('c0000000-0000-0000-0000-000000000621');
insert into ids select 't1', id from public.register_file(pg_temp.id('folder'), 'ticket-1.jpg', 'image/jpeg', 100);
insert into ids select 't2', id from public.register_file(pg_temp.id('folder'), 'ticket-2.pdf', 'application/pdf', 100);
select public.attach_delivery_file(pg_temp.id('del'), pg_temp.id('t1'));
select public.attach_delivery_file(pg_temp.id('del'), pg_temp.id('t2'));
select is((select cardinality(file_ids) from public.deliveries where id = pg_temp.id('del')), 2, 'setup: two tickets on the delivery');

-- ---------------------------------------------------------------------------------------------------------------
-- Who may
-- ---------------------------------------------------------------------------------------------------------------
select pg_temp.login('a0000000-0000-0000-0000-000000000624');
select throws_ok($$ select public.remove_delivery_file(pg_temp.id('del'), pg_temp.id('t1')) $$, '42501', null,
  'a sub who did not post it cannot take a ticket off');
select pg_temp.login('a0000000-0000-0000-0000-000000000625');
select throws_ok($$ select public.remove_delivery_file(pg_temp.id('del'), pg_temp.id('t1')) $$, '42501', null,
  'the inspector (view only) cannot take a ticket off');
select is((select cardinality(file_ids) from public.deliveries where id = pg_temp.id('del')), 2, 'refused: both tickets stay');

-- ---------------------------------------------------------------------------------------------------------------
-- The poster removes; the file leaves the folder; History shows it; Undo puts both back
-- ---------------------------------------------------------------------------------------------------------------
select pg_temp.login('a0000000-0000-0000-0000-000000000623');
select lives_ok($$ select public.remove_delivery_file(pg_temp.id('del'), pg_temp.id('t1')) $$, 'the poster takes a ticket off');
select is((select file_ids from public.deliveries where id = pg_temp.id('del')), array[pg_temp.id('t2')], 'remove: only the other ticket is left');
select ok(pg_temp.file_deleted('t1'), 'remove: the file is soft-deleted in the Delivery tickets folder');
select is_empty($$ select id from public.files where id = pg_temp.id('t1') $$, 'remove: the file no longer shows in Files');
select lives_ok($$ select public.remove_delivery_file(pg_temp.id('del'), pg_temp.id('t1')) $$, 'remove: safe to repeat');
select is((select count(*)::int from public.delivery_history(pg_temp.id('del')) where action = 'delivery.detach'), 1,
  'remove: History has one line for it (the repeat changed nothing)');

select lives_ok($$ select public.restore_delivery_file(pg_temp.id('del'), pg_temp.id('t1')) $$, 'undo: puts the ticket back');
select is((select file_ids from public.deliveries where id = pg_temp.id('del')), array[pg_temp.id('t2'), pg_temp.id('t1')],
  'undo: the ticket is on the delivery again');
select ok(not pg_temp.file_deleted('t1'), 'undo: the file is back in the folder');
select lives_ok($$ select public.restore_delivery_file(pg_temp.id('del'), pg_temp.id('t1')) $$, 'undo: safe to repeat');
select is((select cardinality(file_ids) from public.deliveries where id = pg_temp.id('del')), 2, 'undo: the repeat added nothing');

-- ---------------------------------------------------------------------------------------------------------------
-- deliveries.manage removes anyone's; Undo cannot add a file the delivery never had
-- ---------------------------------------------------------------------------------------------------------------
select pg_temp.login('a0000000-0000-0000-0000-000000000622');
select lives_ok($$ select public.remove_delivery_file(pg_temp.id('del'), pg_temp.id('t2')) $$, 'deliveries.manage takes off anyone''s ticket');
insert into ids select 'mine', id from public.register_file(pg_temp.id('folder'), 'other.jpg', 'image/jpeg', 100);
select throws_ok($$ select public.restore_delivery_file(pg_temp.id('del'), pg_temp.id('mine')) $$, 'P0002', null,
  'undo: a file this delivery never had is not put on');

select pg_temp.login('a0000000-0000-0000-0000-000000000624');
select throws_ok($$ select public.restore_delivery_file(pg_temp.id('del'), pg_temp.id('t2')) $$, '42501', null,
  'undo: someone who may not change the delivery cannot put a ticket back');

reset role;
select is((select count(*)::int from public.audit_events where entity_id = (select id from ids where k = 'del')
             and action in ('delivery.detach', 'delivery.reattach')), 3, 'audit: two removes and one put-back are logged');

select * from finish();
rollback;
