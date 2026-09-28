begin;
select plan(32);
-- Migration 0027: default folders by company kind and DSA (folder_templates), the DSA toggle, no "Inbound" for new
-- jobs, Bids received with the first bid package, folders.ai_reads and sort, and photos that open before a scan.
\ir _helpers.psql

select pg_temp.mk_user('a0000000-0000-0000-0000-000000000071', 'probe+inspector@example.test', 'Inspector owner');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000072', 'probe+gc@example.test', 'GC owner');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000073', 'probe+architect@example.test', 'Architect owner');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000074', 'probe+pm@example.test', 'PM');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000075', 'probe+viewer@example.test', 'Viewer');

create temp table ids (k text primary key, v uuid not null);
grant all on ids to public;
create function pg_temp.id(p_k text) returns uuid language sql stable as $$ select v from pg_temp.ids where k = p_k $$;
grant execute on function pg_temp.id(text) to public;
-- A job's folders in tree order (read as the table owner, so access lists don't hide any).
create function pg_temp.tree(p_project uuid) returns text language sql stable as $$
  select string_agg(name, ', ' order by sort, name) from public.folders where project_id = p_project and deleted_at is null
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- New jobs: folders from the company kind and DSA
-- ---------------------------------------------------------------------------------------------------------------
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000071');
insert into ids values ('insp', public.create_org('Sample Inspection Co', 'inspector'));
insert into ids values ('dsa', public.create_project(pg_temp.id('insp'), 'Sample School', 'construction', p_is_dsa => true));
insert into ids values ('city', public.create_project(pg_temp.id('insp'), 'Sample City Hall', 'construction'));
select pg_temp.login('a0000000-0000-0000-0000-000000000072');
insert into ids values ('gco', public.create_org('Sample Builders', 'gc'));
insert into ids values ('gc', public.create_project(pg_temp.id('gco'), 'Sample Bid Job', 'bidding'));
select pg_temp.login('a0000000-0000-0000-0000-000000000073');
insert into ids values ('arco', public.create_org('Sample Design', 'architect'));
insert into ids values ('arc', public.create_project(pg_temp.id('arco'), 'Sample Clinic', 'construction'));

select pg_temp.login('a0000000-0000-0000-0000-000000000071');
select isnt_empty($$ select name from public.folder_templates $$, 'folder_templates: a signed-in person can read them');
select throws_ok($$ insert into public.folder_templates (company_kind, name, folder_kind, sort) values ('gc', 'X', 'general', 1) $$,
  '42501', null, 'folder_templates: a person cannot add one');
select results_eq($$ select is_dsa from public.projects where id in (pg_temp.id('dsa'), pg_temp.id('city')) order by name $$,
  $$ values (false), (true) $$, 'create_project: p_is_dsa is stored, and leaving it out means not DSA');

reset role;
select is(pg_temp.tree(pg_temp.id('dsa')), 'Plans, Specs, DSA 103, CCDs, Reports, Photos',
  'inspector, DSA job: plans, specs, DSA 103, CCDs first; photos last');
select is(pg_temp.tree(pg_temp.id('city')), 'Plans, Specs, Testing & inspections, Reports, Photos',
  'inspector, other job: testing & inspections instead of the DSA folders');
select is(pg_temp.tree(pg_temp.id('gc')), 'Plans, Specs, Bids received, Reports, Photos',
  'GC job: plans, specs, bids received, reports, photos');
select results_eq($$ select fa.capability, fa.can_read, fa.can_write from public.folders f
                    join public.folder_access fa on fa.folder_id = f.id
                    where f.project_id = pg_temp.id('gc') and f.kind = 'bids_received' $$,
  $$ values ('bids.view_pricing'::text, true, true) $$, 'GC job: Bids received keeps its pricing-only access list');
select is(pg_temp.tree(pg_temp.id('arc')), 'Plans, Specs, Reports, Photos', 'architect job: plans, specs, reports, photos');
select is_empty($$ select id from public.folders where kind = 'inbound'
                   and project_id in (pg_temp.id('dsa'), pg_temp.id('city'), pg_temp.id('gc'), pg_temp.id('arc')) $$,
  'no new job gets an Inbound folder');
select results_eq($$ select name from public.folders where project_id = pg_temp.id('gc') and not ai_reads order by name $$,
  $$ values ('Bids received'::text), ('Photos'::text) $$, 'ai_reads from the templates: off for photos and received bids only');
select results_eq($$ select distinct created_by from public.folders where project_id = pg_temp.id('dsa') $$,
  $$ values ('a0000000-0000-0000-0000-000000000071'::uuid) $$, 'default folders are made by the job''s creator');

-- ---------------------------------------------------------------------------------------------------------------
-- DSA toggle on an existing job: adds the DSA folders once, never removes anything
-- ---------------------------------------------------------------------------------------------------------------
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000071');
select lives_ok($$ update public.projects set is_dsa = true where id = pg_temp.id('city') $$, 'the project admin turns DSA on');
reset role;
select is(pg_temp.tree(pg_temp.id('city')), 'Plans, Specs, DSA 103, Testing & inspections, CCDs, Reports, Photos',
  'DSA on: DSA 103 and CCDs are added, testing & inspections stays');
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000071');
update public.projects set is_dsa = false where id = pg_temp.id('city');
reset role;
select is((select count(*)::int from public.folders where project_id = pg_temp.id('city')), 7, 'DSA off: every folder stays');
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000071');
update public.projects set is_dsa = true where id = pg_temp.id('city');
reset role;
select is((select count(*)::int from public.folders where project_id = pg_temp.id('city') and kind in ('dsa_103', 'ccd')), 2,
  'DSA on again: no second DSA 103 or CCDs');
select is((select count(*)::int from public.folders where project_id = pg_temp.id('arc')), 4, 'the other jobs are untouched');

-- ---------------------------------------------------------------------------------------------------------------
-- Bids received arrives with the first bid package on a job whose company kind doesn't make it
-- ---------------------------------------------------------------------------------------------------------------
insert into public.bid_packages (org_id, project_id, code, name, created_by) values
  (pg_temp.id('insp'), pg_temp.id('city'), '03A', 'Sample concrete', 'a0000000-0000-0000-0000-000000000071'),
  (pg_temp.id('insp'), pg_temp.id('city'), '09A', 'Sample drywall', 'a0000000-0000-0000-0000-000000000071');
select results_eq($$ select f.name, fa.capability from public.folders f join public.folder_access fa on fa.folder_id = f.id
                    where f.project_id = pg_temp.id('city') and f.kind = 'bids_received' $$,
  $$ values ('Bids received'::text, 'bids.view_pricing'::text) $$,
  'first bid package: one pricing-only Bids received folder, not one per package');
insert into public.bid_packages (org_id, project_id, code, name, created_by) values
  (pg_temp.id('gco'), pg_temp.id('gc'), '03A', 'Sample concrete', 'a0000000-0000-0000-0000-000000000072');
select is((select count(*)::int from public.folders where project_id = pg_temp.id('gc') and kind = 'bids_received'), 1,
  'GC job: a bid package adds no second Bids received');

-- ---------------------------------------------------------------------------------------------------------------
-- ai_reads, sort and who changes a folder
-- ---------------------------------------------------------------------------------------------------------------
insert into public.project_members (org_id, project_id, user_id, invite_email, role, status, created_by)
select pg_temp.id('insp'), pg_temp.id('city'), u.id, u.email, m.role, 'active', 'a0000000-0000-0000-0000-000000000071'
from (values ('a0000000-0000-0000-0000-000000000074'::uuid, 'pm'), ('a0000000-0000-0000-0000-000000000075', 'viewer')) as m (uid, role)
join auth.users u on u.id = m.uid;
insert into ids select 'photos', id from public.folders where project_id = pg_temp.id('city') and kind = 'photos';
insert into ids select 'bids', id from public.folders where project_id = pg_temp.id('city') and kind = 'bids_received';

set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000074');
select lives_ok($$ insert into public.folders (org_id, project_id, name, ai_reads, created_by)
                   values (pg_temp.id('insp'), pg_temp.id('city'), 'Sample submittals', false, auth.uid()) $$,
  'a files.manage member adds a folder that search and the AI skip');
select lives_ok($$ insert into public.folders (org_id, project_id, name, created_by)
                   values (pg_temp.id('insp'), pg_temp.id('city'), 'Sample letters', auth.uid()) $$,
  'a files.manage member adds a folder with the defaults');
select results_eq($$ select name, ai_reads, sort from public.folders
                    where project_id = pg_temp.id('city') and kind = 'general' order by name $$,
  $$ values ('Sample letters'::text, true, 100), ('Sample submittals'::text, false, 100) $$,
  'new folders: ai_reads as asked (default on), listed after the template folders');
select lives_ok($$ update public.folders set ai_reads = true where id = pg_temp.id('photos') $$,
  'files.manage turns ai_reads on for Photos');
select throws_ok($$ update public.folders set kind = 'bids_received' where id = pg_temp.id('photos') $$,
  '42501', null, 'nobody changes a folder''s kind');
select pg_temp.login('a0000000-0000-0000-0000-000000000075');
update public.folders set ai_reads = false where id = pg_temp.id('photos');
select throws_ok($$ insert into public.folders (org_id, project_id, name, created_by)
                   values (pg_temp.id('insp'), pg_temp.id('city'), 'Viewer folder', auth.uid()) $$,
  '42501', null, 'a viewer cannot add a folder');
reset role;
select is((select ai_reads from public.folders where id = pg_temp.id('photos')), true,
  'ai_reads: the manager''s change stuck and the viewer''s update changed nothing');

-- ---------------------------------------------------------------------------------------------------------------
-- authorize_download: pending photos open for the folder's readers; everything else pending stays uploader-only
-- ---------------------------------------------------------------------------------------------------------------
insert into public.files (id, org_id, project_id, folder_id, storage_path, original_name, mime, created_by, scan_status, upload_complete)
select f.id, pg_temp.id('insp'), pg_temp.id('city'), f.folder,
       public.file_storage_path(pg_temp.id('city'), f.folder, f.id, f.name), f.name, f.mime,
       'a0000000-0000-0000-0000-000000000074', f.scan, true
from (values
  ('e0000000-0000-0000-0000-000000000071'::uuid, pg_temp.id('photos'), 'Sample slab 01.JPG', 'image/jpeg', 'pending'),
  ('e0000000-0000-0000-0000-000000000072', pg_temp.id('photos'), 'Sample wall.heic', 'image/heic', 'pending'),
  ('e0000000-0000-0000-0000-000000000073', pg_temp.id('photos'), 'Sample notes.pdf', 'application/pdf', 'pending'),
  ('e0000000-0000-0000-0000-000000000074', pg_temp.id('photos'), 'sample-photo.exe', 'image/jpeg', 'pending'),
  ('e0000000-0000-0000-0000-000000000075', pg_temp.id('photos'), 'Sample bad.png', 'image/png', 'infected'),
  ('e0000000-0000-0000-0000-000000000076', pg_temp.id('bids'), 'Sample bid photo.jpg', 'image/jpeg', 'pending')
) as f (id, folder, name, mime, scan);

set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000075');
select results_eq($$ select original_name from public.authorize_download('e0000000-0000-0000-0000-000000000071') $$,
  $$ values ('Sample slab 01.JPG'::text) $$, 'download: a pending JPEG opens for a reader of its folder');
select lives_ok($$ select * from public.authorize_download('e0000000-0000-0000-0000-000000000072') $$,
  'download: a pending HEIC opens for a reader of its folder');
select throws_ok($$ select * from public.authorize_download('e0000000-0000-0000-0000-000000000073') $$,
  '42501', 'scan_pending', 'download: a pending PDF stays uploader-only');
select throws_ok($$ select * from public.authorize_download('e0000000-0000-0000-0000-000000000074') $$,
  '42501', 'scan_pending', 'download: an image type with a non-image file name stays uploader-only');
select throws_ok($$ select * from public.authorize_download('e0000000-0000-0000-0000-000000000075') $$,
  '42501', 'infected', 'download: an infected image is refused');
select throws_ok($$ select * from public.authorize_download('e0000000-0000-0000-0000-000000000076') $$,
  '42501', 'forbidden', 'download: a pending photo in a folder I cannot read is refused');
select pg_temp.login('a0000000-0000-0000-0000-000000000074');
select lives_ok($$ select * from public.authorize_download('e0000000-0000-0000-0000-000000000073') $$,
  'download: the uploader still opens its own pending PDF');

select * from finish();
rollback;
