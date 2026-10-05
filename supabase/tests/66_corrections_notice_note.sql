begin;
select plan(24);
-- Migration 0078: a correction's notice goes in Reports / Corrections (the creator and the inspector get the folder,
-- viewers read it, a sub neither); "Corrections" under Reports is the system's name; Edit adds and removes the item's
-- own photos (0026's column grant and guard: only this job's photos, the creator or the inspector); a note goes on my
-- own one-tap step afterwards (once, within the undo window), and history stays append-only otherwise.
\ir _helpers.psql

select pg_temp.mk_user('a0000000-0000-0000-0000-000000000621', 'probe+cn62-inspector@example.test', 'Inspector');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000622', 'probe+cn62-pm@example.test', 'PM');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000623', 'probe+cn62-sub@example.test', 'Sub');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000624', 'probe+cn62-viewer@example.test', 'Viewer');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000625', 'probe+cn62-sub2@example.test', 'Other sub');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000626', 'probe+cn62-bidder@example.test', 'Bidder');

insert into public.orgs (id, name, kind, created_by) values
  ('b0000000-0000-0000-0000-000000000621', 'CN62 Builders', 'gc', 'a0000000-0000-0000-0000-000000000622');
insert into public.projects (id, org_id, name, stage, modules, created_by) values
  ('c0000000-0000-0000-0000-000000000621', 'b0000000-0000-0000-0000-000000000621', 'CN62 Job', 'construction',
   '{files,corrections}', 'a0000000-0000-0000-0000-000000000622');
insert into public.project_members (org_id, project_id, user_id, invite_email, role, status)
select 'b0000000-0000-0000-0000-000000000621', 'c0000000-0000-0000-0000-000000000621', u.id, u.email, m.role, 'active'
  from (values ('a0000000-0000-0000-0000-000000000621'::uuid, 'inspector'), ('a0000000-0000-0000-0000-000000000622', 'pm'),
               ('a0000000-0000-0000-0000-000000000623', 'sub'), ('a0000000-0000-0000-0000-000000000624', 'viewer'),
               ('a0000000-0000-0000-0000-000000000625', 'sub'), ('a0000000-0000-0000-0000-000000000626', 'bidder')) m (uid, role)
  join auth.users u on u.id = m.uid;

set local role authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- The notice folder
-- ---------------------------------------------------------------------------------------------------------------
select pg_temp.login('a0000000-0000-0000-0000-000000000621');
create temp table nf as select public.correction_notice_folder('c0000000-0000-0000-0000-000000000621') as id;
select is((select f.name || ' in ' || p.name from public.folders f join public.folders p on p.id = f.parent_id
            where f.id = (select id from nf)), 'Corrections in Reports', 'notice folder: Reports / Corrections');
select is(public.correction_notice_folder('c0000000-0000-0000-0000-000000000621'), (select id from nf),
  'notice folder: a repeat returns the same folder');
select isnt((select id from nf), public.correction_photo_folder('c0000000-0000-0000-0000-000000000621'),
  'notice folder: not the photo folder');
select ok(pg_temp.can_write_as('a0000000-0000-0000-0000-000000000621', (select id from nf)), 'notice folder: the inspector uploads');
select ok(pg_temp.can_write_as('a0000000-0000-0000-0000-000000000622', (select id from nf)), 'notice folder: the PM (creates) uploads');
select ok(pg_temp.can_read_as('a0000000-0000-0000-0000-000000000624', (select id from nf))
          and not pg_temp.can_write_as('a0000000-0000-0000-0000-000000000624', (select id from nf)),
  'notice folder: a viewer reads, cannot upload');
select pg_temp.login('a0000000-0000-0000-0000-000000000623');
select throws_ok($$ select public.correction_notice_folder('c0000000-0000-0000-0000-000000000621') $$, '42501', 'forbidden',
  'notice folder: a sub (marks ready, never attaches notices) cannot get it');
select pg_temp.login('a0000000-0000-0000-0000-000000000626');
select throws_ok($$ select public.correction_notice_folder('c0000000-0000-0000-0000-000000000621') $$, '42501', 'forbidden',
  'notice folder: a bidder cannot get it');
reset role;
select ok(public.folder_name_reserved('c0000000-0000-0000-0000-000000000621',
            (select parent_id from public.folders where id = (select id from nf)), 'Corrections')
          and public.folder_name_reserved('c0000000-0000-0000-0000-000000000621', null, 'Requirements'),
  'folder names: Corrections under Reports is the system''s, the 0069 list stays');

-- ---------------------------------------------------------------------------------------------------------------
-- Edit an item's own photos (0026's grant and guard)
-- ---------------------------------------------------------------------------------------------------------------
insert into public.files (id, org_id, project_id, folder_id, storage_path, original_name, mime, created_by, upload_complete)
select ('e0000000-0000-0000-0000-00000000062' || i)::uuid, 'b0000000-0000-0000-0000-000000000621',
       'c0000000-0000-0000-0000-000000000621',
       (select id from public.folders where project_id = 'c0000000-0000-0000-0000-000000000621' and kind = 'photos' and name = 'Corrections'),
       'test/cn62/photo-' || i, 'photo-' || i || '.jpg', 'image/jpeg', 'a0000000-0000-0000-0000-000000000621', true
  from generate_series(1, 3) i;
insert into public.files (id, org_id, project_id, folder_id, storage_path, original_name, mime, created_by, upload_complete)
values ('e0000000-0000-0000-0000-000000000629', 'b0000000-0000-0000-0000-000000000621', 'c0000000-0000-0000-0000-000000000621',
        (select id from nf), 'test/cn62/notice', 'notice.pdf', 'application/pdf', 'a0000000-0000-0000-0000-000000000621', true);
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000621');
create temp table cn as select (public.create_correction('c0000000-0000-0000-0000-000000000621', 'Sample gap', 'cn62-key-01',
  p_photo_ids => array['e0000000-0000-0000-0000-000000000621']::uuid[],
  p_notice_file_id => 'e0000000-0000-0000-0000-000000000629')).id as id;
select is((select notice_file_id from public.corrections where id = (select id from cn)), 'e0000000-0000-0000-0000-000000000629'::uuid,
  'notice: a PDF from the notice folder attaches');
select lives_ok($$ update public.corrections set photo_ids = photo_ids || 'e0000000-0000-0000-0000-000000000622'::uuid
                    where id = (select id from cn) $$, 'edit photos: the inspector adds one');
select lives_ok($$ update public.corrections set photo_ids = array_remove(photo_ids, 'e0000000-0000-0000-0000-000000000621'::uuid)
                    where id = (select id from cn) $$, 'edit photos: the inspector removes one');
select is((select photo_ids from public.corrections where id = (select id from cn)), array['e0000000-0000-0000-0000-000000000622']::uuid[],
  'edit photos: the item keeps what is left');
select throws_ok($$ update public.corrections set photo_ids = photo_ids || 'e0000000-0000-0000-0000-000000000629'::uuid
                    where id = (select id from cn) $$, '22023', null, 'edit photos: a PDF is not a photo');
select ok((select count(*) from public.correction_history where correction_id = (select id from cn) and action = 'edited') = 2,
  'edit photos: each change is an Edited line in history');
select pg_temp.login('a0000000-0000-0000-0000-000000000623');
update public.corrections set photo_ids = '{}' where id = (select id from cn);
reset role;
select is((select cardinality(photo_ids) from public.corrections where id = (select id from cn)), 1,
  'edit photos: a sub changes nothing (not the creator, not the inspector)');
set local role authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- A note after a one-tap step
-- ---------------------------------------------------------------------------------------------------------------
select pg_temp.login('a0000000-0000-0000-0000-000000000621');
select lives_ok($$ select public.set_correction_status((select id from cn), (select version from public.corrections where id = (select id from cn)),
                    'signed_off') $$, 'step note: the inspector signs off in one tap (no note)');
select is((public.correction_step_note((select id from cn), '  Sample sealant checked at the sleeve  ')).note,
  'Sample sealant checked at the sleeve', 'step note: the note goes on that step, trimmed');
select is((select note from public.correction_history where correction_id = (select id from cn) order by seq desc limit 1),
  'Sample sealant checked at the sleeve', 'step note: history shows it on the sign-off line');
select throws_ok($$ select public.correction_step_note((select id from cn), 'Second note') $$, '22023', 'Too late to add a note.',
  'step note: once only');
select throws_ok($$ update public.correction_history set note = 'x' where correction_id = (select id from cn) $$, '42501', null,
  'step note: history is still append-only to everyone');
-- Someone else's step: the PM never notes the inspector's step.
select lives_ok($$ select public.set_correction_status((select id from cn), (select version from public.corrections where id = (select id from cn)),
                    'reopened') $$, 'step note: (setup) the inspector reopens in one tap');
select pg_temp.login('a0000000-0000-0000-0000-000000000622');
select throws_ok($$ select public.correction_step_note((select id from cn), 'Not mine') $$, '22023', 'Too late to add a note.',
  'step note: not on someone else''s step');
reset role;
alter table public.correction_history disable trigger immutable;
update public.correction_history set created_at = now() - interval '16 minutes'
 where id = (select id from public.correction_history where correction_id = (select id from cn) order by seq desc limit 1);
alter table public.correction_history enable trigger immutable;
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000621');
select throws_ok($$ select public.correction_step_note((select id from cn), 'Late') $$, '22023', 'Too late to add a note.',
  'step note: not after the undo window');

select * from finish();
rollback;
