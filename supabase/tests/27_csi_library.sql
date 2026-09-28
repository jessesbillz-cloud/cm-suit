begin;
select plan(30);
-- The CSI MasterFormat reference (migration 0033): all 50 divisions with the reserved ones marked, a curated set of
-- Level 2/3 sections in the published number format, readable by anyone signed in and written by nobody; and a
-- package's spec sections (format checked, kept unique and in order, editable only by who may edit the package).
\ir _helpers.psql

-- Reference contents
select is((select count(*)::int from public.csi_divisions), 50, 'csi: 50 divisions, 00 through 49');
select results_eq(
  $$ select number from public.csi_divisions where reserved order by number $$,
  $$ values ('15'), ('16'), ('17'), ('18'), ('19'), ('20'), ('24'), ('29'), ('30'), ('36'), ('37'), ('38'), ('39'), ('47'), ('49') $$,
  'csi: the reserved divisions are exactly the ones MasterFormat reserves');
select is_empty(
  $$ select number from public.csi_divisions where reserved and title <> 'Reserved for Future Expansion' $$,
  'csi: reserved divisions carry the published title');
select results_eq(
  $$ select number, title from public.csi_divisions where number in ('00', '06', '09', '23', '35', '48') order by number $$,
  $$ values ('00', 'Procurement and Contracting Requirements'), ('06', 'Wood, Plastics, and Composites'), ('09', 'Finishes'),
            ('23', 'Heating, Ventilating, and Air Conditioning (HVAC)'), ('35', 'Waterway and Marine Construction'),
            ('48', 'Electrical Power Generation') $$,
  'csi: division titles as published');
select is((select count(*)::int from public.csi_sections), 254, 'csi: the curated section set (a subset, not the full list)');
select results_eq(
  $$ select number, title from public.csi_sections
     where number in ('01 74 19', '03 30 00', '07 84 13', '08 41 13', '09 21 16', '10 28 00', '23 05 93', '26 05 19', '32 16 00')
     order by number $$,
  $$ values ('01 74 19', 'Construction Waste Management and Disposal'), ('03 30 00', 'Cast-in-Place Concrete'),
            ('07 84 13', 'Penetration Firestopping'), ('08 41 13', 'Aluminum-Framed Entrances and Storefronts'),
            ('09 21 16', 'Gypsum Board Assemblies'), ('10 28 00', 'Toilet, Bath, and Laundry Accessories'),
            ('23 05 93', 'Testing, Adjusting, and Balancing for HVAC'),
            ('26 05 19', 'Low-Voltage Electrical Power Conductors and Cables'),
            ('32 16 00', 'Curbs, Gutters, Sidewalks, and Driveways') $$,
  'csi: known sections, number and title verbatim');
select is_empty(
  $$ select number from public.csi_sections
     where number !~ '^[0-9]{2} [0-9]{2} [0-9]{2}$' or division <> left(number, 2)
        or level <> case when right(number, 2) = '00' then 2 else 3 end or substr(number, 4, 2) = '00' $$,
  'csi: every number is NN NN NN, in its division, Level 2 ends in 00 and Level 3 does not');
select is_empty(
  $$ select s.number from public.csi_sections s join public.csi_divisions d on d.number = s.division where d.reserved $$,
  'csi: no section sits in a reserved division');
select is_empty(
  $$ select number from public.csi_sections where title <> btrim(title) or title ~ '\s{2}' or title !~ '^[A-Z].*[A-Za-z]$' $$,
  'csi: titles are clean (capitalized, no stray spaces or punctuation at the ends)');
select is_empty(
  $$ select d from unnest(array['01','02','03','04','05','06','07','08','09','10','11','12','14','21','22','23','26','27','28','31','32','33']) as d
     where not exists (select 1 from public.csi_sections where division = d) $$,
  'csi: every division a GC bids has sections to pick from');
select throws_ok(
  $$ insert into public.csi_sections (number, division, level, title) values ('09 00 00', '09', 2, 'Finishes') $$,
  '23514', null, 'csi: a division number is not a section');
select throws_ok(
  $$ insert into public.csi_sections (number, division, level, title) values ('09 21 17', '09', 2, 'Wrong level') $$,
  '23514', null, 'csi: the level must follow the number');

-- Access: RLS on, anon nothing, signed-in read only, nobody writes
select ok((select bool_and(relrowsecurity) from pg_class where oid in ('public.csi_divisions'::regclass, 'public.csi_sections'::regclass)),
  'csi: RLS on both tables');
select ok(not has_table_privilege('anon', 'public.csi_divisions', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
          and not has_table_privilege('anon', 'public.csi_sections', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE'),
  'csi: anon holds nothing');
select ok(has_table_privilege('authenticated', 'public.csi_sections', 'SELECT')
          and not has_table_privilege('authenticated', 'public.csi_sections', 'INSERT,UPDATE,DELETE,TRUNCATE')
          and not has_table_privilege('authenticated', 'public.csi_divisions', 'INSERT,UPDATE,DELETE,TRUNCATE'),
  'csi: signed-in people may read, never write');
select ok(not has_table_privilege('service_role', 'public.csi_sections', 'INSERT,UPDATE,DELETE')
          and not has_table_privilege('service_role', 'public.csi_divisions', 'INSERT,UPDATE,DELETE'),
  'csi: not even the service role writes the reference (migrations do)');

select pg_temp.mk_user('a0000000-0000-0000-0000-000000000331', 'probe+csi-admin@example.test', 'Csi Admin');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000332', 'probe+csi-pm@example.test', 'Csi PM');
insert into public.orgs (id, name, kind, created_by) values
  ('b0000000-0000-0000-0000-000000000331', 'Csi Builders', 'gc', 'a0000000-0000-0000-0000-000000000331');
insert into public.projects (id, org_id, name, stage, created_by) values
  ('c0000000-0000-0000-0000-000000000331', 'b0000000-0000-0000-0000-000000000331', 'Csi Job', 'bidding', 'a0000000-0000-0000-0000-000000000331');
insert into public.project_members (id, org_id, project_id, user_id, invite_email, role, status, created_by) values
  ('e1000000-0000-0000-0000-000000000332', 'b0000000-0000-0000-0000-000000000331', 'c0000000-0000-0000-0000-000000000331',
   'a0000000-0000-0000-0000-000000000332', 'probe+csi-pm@example.test', 'pm', 'active', 'a0000000-0000-0000-0000-000000000331');
insert into public.bid_packages (id, org_id, project_id, code, name, created_by) values
  ('d0000000-0000-0000-0000-000000000331', 'b0000000-0000-0000-0000-000000000331', 'c0000000-0000-0000-0000-000000000331',
   '09A', 'Finishes', 'a0000000-0000-0000-0000-000000000331');

set local role anon;
select throws_ok($$ select count(*) from public.csi_sections $$, '42501', null, 'csi: anon cannot read the reference');

set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000332');
select is((select count(*)::int from public.csi_sections), 254, 'csi: any signed-in person reads every section');
select is((select count(*)::int from public.csi_divisions), 50, 'csi: any signed-in person reads every division');
select throws_ok($$ insert into public.csi_divisions (number, title) values ('50', 'Made up') $$, '42501', null,
  'csi: a signed-in person cannot add a division');
select throws_ok($$ update public.csi_sections set title = 'Changed' where number = '09 29 00' $$, '42501', null,
  'csi: a signed-in person cannot change a section');
select throws_ok($$ delete from public.csi_sections where number = '09 29 00' $$, '42501', null,
  'csi: a signed-in person cannot delete a section');

-- A package's spec sections
select is((select spec_sections from public.bid_packages where id = 'd0000000-0000-0000-0000-000000000331'), null::text[],
  'sections: a pm without bids.manage does not even see the package');
update public.bid_packages set spec_sections = '{09 29 00}' where id = 'd0000000-0000-0000-0000-000000000331';
select pg_temp.login('a0000000-0000-0000-0000-000000000331');
select is((select spec_sections from public.bid_packages where id = 'd0000000-0000-0000-0000-000000000331'), '{}'::text[],
  'sections: a new package starts empty, and a pm without bids.manage changed nothing');

update public.bid_packages set spec_sections = '{09 29 00,09 21 16,09 29 00,09 22 16}'
  where id = 'd0000000-0000-0000-0000-000000000331';
select is((select spec_sections from public.bid_packages where id = 'd0000000-0000-0000-0000-000000000331'),
  '{09 21 16,09 22 16,09 29 00}'::text[], 'sections: the manager''s list is kept once each, in number order');
select is((select version from public.bid_packages where id = 'd0000000-0000-0000-0000-000000000331'), 2,
  'sections: a sections change is a normal versioned save');
update public.bid_packages set spec_sections = '{10 21 13.19,09 99 99}' where id = 'd0000000-0000-0000-0000-000000000331';
select is((select spec_sections from public.bid_packages where id = 'd0000000-0000-0000-0000-000000000331'),
  '{09 99 99,10 21 13.19}'::text[], 'sections: numbers outside the reference (org sections, Level 4) are allowed');
select throws_ok($$ update public.bid_packages set spec_sections = '{092116}' where id = 'd0000000-0000-0000-0000-000000000331' $$,
  '23514', null, 'sections: a number that is not NN NN NN is refused');
select throws_ok($$ update public.bid_packages set spec_sections = array['09 21 16', null] where id = 'd0000000-0000-0000-0000-000000000331' $$,
  '23514', null, 'sections: an empty entry is refused');
select throws_ok($$ update public.bid_packages set spec_sections = '{"09 21 16,09 29 00"}' where id = 'd0000000-0000-0000-0000-000000000331' $$,
  '23514', null, 'sections: two numbers in one entry are refused');

select * from finish();
rollback;
