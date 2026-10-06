begin;
select plan(7);
-- Migration 0086: a correction's number is the database's CN number, given at Save. Nobody types a second "notice
-- number": a new item starts with none whatever is sent, Edit cannot write one, the other fields stay editable, and an
-- older item keeps the one it has.
\ir _helpers.psql

select pg_temp.mk_user('a0000000-0000-0000-0000-000000000731', 'probe+cn73-inspector@example.test', 'Inspector');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000732', 'probe+cn73-pm@example.test', 'PM');

insert into public.orgs (id, name, kind, created_by) values
  ('b0000000-0000-0000-0000-000000000731', 'CN73 Builders', 'gc', 'a0000000-0000-0000-0000-000000000732');
insert into public.projects (id, org_id, name, stage, modules, created_by) values
  ('c0000000-0000-0000-0000-000000000731', 'b0000000-0000-0000-0000-000000000731', 'CN73 Job', 'construction',
   '{files,corrections}', 'a0000000-0000-0000-0000-000000000732');
insert into public.project_members (org_id, project_id, user_id, invite_email, role, status)
select 'b0000000-0000-0000-0000-000000000731', 'c0000000-0000-0000-0000-000000000731', u.id, u.email, m.role, 'active'
  from (values ('a0000000-0000-0000-0000-000000000731'::uuid, 'inspector'), ('a0000000-0000-0000-0000-000000000732', 'pm')) m (uid, role)
  join auth.users u on u.id = m.uid;

set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000731');
create temp table cn73 as
  select * from public.create_correction('c0000000-0000-0000-0000-000000000731', 'Sample gap', 'cn73-key-01',
                  p_description => 'Sample: not sealed per 07 84 00', p_notice_ref => 'Notice 12');

select is((select number from cn73), 1, 'number: the first item on the job is CN-001, given at Save');
select is((select notice_ref from public.corrections where id = (select id from cn73)), '',
  'notice no.: a typed one sent with the create is dropped');
select is((select (public.create_correction('c0000000-0000-0000-0000-000000000731', 'Sample hanger', 'cn73-key-02')).number), 2,
  'number: the next item is CN-002');
select throws_ok($$ update public.corrections set notice_ref = 'Notice 13' where id = (select id from cn73) $$, '42501', null,
  'notice no.: Edit cannot write one');
select lives_ok($$ update public.corrections set description = 'Sample: gap at 07 84 00 detail 3' where id = (select id from cn73) $$,
  'edit: the typed fields stay editable');

-- An item from before 0086 keeps its typed reference through an edit.
reset role;
update public.corrections set notice_ref = 'Sample older ref' where id = (select id from cn73);
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000731');
select lives_ok($$ update public.corrections set title = 'Sample gap at duct' where id = (select id from cn73) $$,
  'edit: an older item still saves');
select is((select notice_ref from public.corrections where id = (select id from cn73)), 'Sample older ref',
  'notice no.: an older item keeps the one it has');

select * from finish();
rollback;
