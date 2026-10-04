begin;
select plan(56);
-- Migration 0071, weather on every daily: where the job is (project_places) and what the weather was (project_weather).
-- Members of the job read both; nobody writes either by hand, the server key included; the server's two stores refuse
-- everyone else (the grant and the is_service_role guard); a person with project.manage types the location or empties
-- it, and the server's lookup never replaces a typed one unless asked; a forecast never replaces what was observed;
-- the checks keep the values sane.
\ir _helpers.psql

-- Users: the admin (project.manage), the super (writes dailies), an outsider.
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000591', 'probe+wx-admin@example.test', 'Sample Wx Admin');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000592', 'probe+wx-super@example.test', 'Sample Wx Super');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000593', 'probe+wx-out@example.test', 'Sample Wx Outsider');

insert into public.orgs (id, name, kind, created_by)
values ('b0000000-0000-0000-0000-000000000591', 'Sample Wx Builders', 'gc', 'a0000000-0000-0000-0000-000000000591');
-- J: the job. K: another job of the same company, which only the admin is on.
insert into public.projects (id, org_id, name, number, address, timezone, stage, created_by) values
  ('c0000000-0000-0000-0000-000000000591', 'b0000000-0000-0000-0000-000000000591', 'Sample Wx Job J', 'S-591',
   '100 Sample Street, Sampletown, CA 90000', 'America/Los_Angeles', 'construction', 'a0000000-0000-0000-0000-000000000591'),
  ('c0000000-0000-0000-0000-000000000592', 'b0000000-0000-0000-0000-000000000591', 'Sample Wx Job K', 'S-592',
   '200 Sample Street, Sampletown, CA 90000', 'America/Los_Angeles', 'construction', 'a0000000-0000-0000-0000-000000000591');
insert into public.project_members (org_id, project_id, user_id, invite_email, role, status)
select 'b0000000-0000-0000-0000-000000000591', 'c0000000-0000-0000-0000-000000000591', u::uuid, e, r, 'active'
  from (values ('a0000000-0000-0000-0000-000000000591', 'probe+wx-admin@example.test', 'project_admin'),
               ('a0000000-0000-0000-0000-000000000592', 'probe+wx-super@example.test', 'superintendent')) v(u, e, r)
 where not exists (select 1 from public.project_members pm
                    where pm.project_id = 'c0000000-0000-0000-0000-000000000591' and pm.user_id = v.u::uuid);
insert into public.project_members (org_id, project_id, user_id, invite_email, role, status)
select 'b0000000-0000-0000-0000-000000000591', 'c0000000-0000-0000-0000-000000000592',
       'a0000000-0000-0000-0000-000000000591', 'probe+wx-admin@example.test', 'project_admin', 'active'
 where not exists (select 1 from public.project_members pm
                    where pm.project_id = 'c0000000-0000-0000-0000-000000000592'
                      and pm.user_id = 'a0000000-0000-0000-0000-000000000591');

create function pg_temp.place() returns public.project_places language sql stable as $$
  select * from public.project_places where project_id = 'c0000000-0000-0000-0000-000000000591' $$;
create function pg_temp.wx(p_day date) returns public.project_weather language sql stable as $$
  select * from public.project_weather where project_id = 'c0000000-0000-0000-0000-000000000591' and day = p_day $$;
grant execute on all functions in schema pg_temp to public;

-- ---------------------------------------------------------------------------------------------------------------------
-- 1. Deny by default
-- ---------------------------------------------------------------------------------------------------------------------
select ok(not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                       where n.nspname = 'public' and c.relname in ('project_places', 'project_weather')
                         and not c.relrowsecurity), 'tables: RLS on');
select is_empty(
  $$ select t, r, p from unnest(array['project_places', 'project_weather']) t,
            unnest(array['anon', 'authenticated', 'service_role']) r,
            unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) p
      where has_table_privilege(r, 'public.' || t, p) is distinct from (p = 'SELECT' and r <> 'anon') $$,
  'tables: read only for people and for the server key; nothing for anon');
select is_empty(
  $$ select f from unnest(array[
       'public.project_place_store(uuid, double precision, double precision, text, text, boolean)',
       'public.project_weather_store(uuid, date, integer, integer, text, text, double precision, double precision)',
       'public.project_place_set(uuid, double precision, double precision)']) f
      where not (select prosecdef from pg_proc where oid = f::regprocedure)
         or has_function_privilege('anon', f, 'EXECUTE')
         or not has_function_privilege('service_role', f, 'EXECUTE')
         or has_function_privilege('authenticated', f, 'EXECUTE') is distinct from (f like '%place_set%') $$,
  'functions: definer, never anon; the stores for the server only; the typed location for people');

-- ---------------------------------------------------------------------------------------------------------------------
-- 2. The server's lookup
-- ---------------------------------------------------------------------------------------------------------------------
set local role service_role;
select pg_temp.login_service();
select is(public.project_place_store('c0000000-0000-0000-0000-000000000591', 33.1234, -117.1234,
            '  100 SAMPLE ST, SAMPLETOWN, CA, 90000 ', '100 Sample Street, Sampletown, CA 90000', false), true,
  'lookup: the server stores the first match');
select results_eq(
  $$ select org_id, lat, lon, matched_address, source, looked_up, updated_by from pg_temp.place() $$,
  $$ values ('b0000000-0000-0000-0000-000000000591'::uuid, 33.1234::double precision, -117.1234::double precision,
             '100 SAMPLE ST, SAMPLETOWN, CA, 90000'::text, 'census'::text, '100 Sample Street, Sampletown, CA 90000'::text,
             null::uuid) $$,
  'lookup: the job''s company, the coordinates, the address as matched and the address looked up');
select is(public.project_place_store('c0000000-0000-0000-0000-000000000591', null, null, 'ignored', '1 Nowhere', false), true,
  'lookup: no match is stored as no match');
select results_eq($$ select lat, lon, matched_address, source, looked_up from pg_temp.place() $$,
  $$ values (null::double precision, null::double precision, ''::text, 'census'::text, '1 Nowhere'::text) $$,
  'lookup: no match has no coordinates and no address (never a guess)');
select throws_ok($$ select public.project_place_store('c0000000-0000-0000-0000-000000000591', 33.1, null, '', 'x', false) $$,
  '22023', null, 'lookup: half a location is refused');
select throws_ok($$ select public.project_place_store('c0000000-0000-0000-0000-000000000591', 33.1, -117.1, '', '  ', false) $$,
  '22023', null, 'lookup: an empty address is refused');
select throws_ok($$ select public.project_place_store('c0000000-0000-0000-0000-000000000591', 91, -117.1, '', 'x', false) $$,
  '23514', null, 'lookup: a latitude off the globe is refused');
select throws_ok($$ select public.project_place_store('c0000000-0000-0000-0000-000000000599', 33.1, -117.1, '', 'x', false) $$,
  'P0002', null, 'lookup: an unknown job is not found');
select is(public.project_place_store('c0000000-0000-0000-0000-000000000591', 33.1234, -117.1234,
            '100 SAMPLE ST, SAMPLETOWN, CA, 90000', '100 Sample Street, Sampletown, CA 90000', false), true,
  'lookup: a new lookup replaces the server''s own earlier answer');

-- Nobody writes by hand, the server key included.
select throws_ok($$ insert into public.project_places (project_id, org_id, lat, lon, source)
                    values ('c0000000-0000-0000-0000-000000000592', 'b0000000-0000-0000-0000-000000000591', 1, 1, 'typed') $$,
  '42501', null, 'by hand: the server key cannot insert a place');
select throws_ok($$ update public.project_places set lat = 1 $$, '42501', null, 'by hand: the server key cannot change a place');
select throws_ok($$ insert into public.project_weather (project_id, org_id, day, high_f, source, lat, lon)
                    values ('c0000000-0000-0000-0000-000000000591', 'b0000000-0000-0000-0000-000000000591', '2026-10-01', 70,
                            'nws_observed', 1, 1) $$,
  '42501', null, 'by hand: the server key cannot insert weather');
select throws_ok($$ delete from public.project_places $$, '42501', null, 'by hand: the server key cannot delete a place');

-- ---------------------------------------------------------------------------------------------------------------------
-- 3. The weather the server stores
-- ---------------------------------------------------------------------------------------------------------------------
select is(public.project_weather_store('c0000000-0000-0000-0000-000000000591', '2026-10-02', 78, 61, '  Mostly Sunny ',
            'nws_forecast', 33.1234, -117.1234), true, 'weather: a forecast is stored');
select results_eq($$ select org_id, high_f, low_f, conditions, source, lat from pg_temp.wx('2026-10-02') $$,
  $$ values ('b0000000-0000-0000-0000-000000000591'::uuid, 78, 61, 'Mostly Sunny'::text, 'nws_forecast'::text,
             33.1234::double precision) $$, 'weather: the day''s high, low and conditions');
select is(public.project_weather_store('c0000000-0000-0000-0000-000000000591', '2026-10-02', 80, 60, 'Sunny',
            'nws_forecast', 33.1234, -117.1234), true, 'weather: a newer forecast replaces it');
select is(public.project_weather_store('c0000000-0000-0000-0000-000000000591', '2026-10-02', 81, 59, 'Clear',
            'nws_observed', 33.1234, -117.1234), true, 'weather: what was observed replaces the forecast');
select is(public.project_weather_store('c0000000-0000-0000-0000-000000000591', '2026-10-02', 90, 50, 'Rain',
            'nws_forecast', 33.1234, -117.1234), false, 'weather: a forecast never replaces what was observed');
select results_eq($$ select high_f, low_f, conditions, source from pg_temp.wx('2026-10-02') $$,
  $$ values (81, 59, 'Clear'::text, 'nws_observed'::text) $$, 'weather: the observed row stayed');
select is(public.project_weather_store('c0000000-0000-0000-0000-000000000591', '2026-10-02', 70, 55, 'Cloudy',
            'nws_forecast', 34.5, -118.5), true, 'weather: a moved location is read again');
select is(public.project_weather_store('c0000000-0000-0000-0000-000000000591', '2026-10-03', null, 58, '',
            'nws_forecast', 33.1234, -117.1234), true, 'weather: a low alone is weather (the evening''s forecast)');
select is(public.project_weather_store('c0000000-0000-0000-0000-000000000591', '2026-10-04', 70, 60, repeat('x', 300),
            'nws_observed', 33.1234, -117.1234), true, 'weather: what the station observed is stored');
select is((select length(conditions) from pg_temp.wx('2026-10-04')), 120, 'weather: long conditions are cut to what the table holds');
select throws_ok($$ select public.project_weather_store('c0000000-0000-0000-0000-000000000591', '2026-10-05', 141, 60, 'Hot',
                    'nws_observed', 33.1, -117.1) $$, '23514', null, 'check: a high over 140 is refused');
select throws_ok($$ select public.project_weather_store('c0000000-0000-0000-0000-000000000591', '2026-10-05', 60, -81, 'Cold',
                    'nws_observed', 33.1, -117.1) $$, '23514', null, 'check: a low under -80 is refused');
select throws_ok($$ select public.project_weather_store('c0000000-0000-0000-0000-000000000591', '2026-10-05', 50, 60, 'Odd',
                    'nws_observed', 33.1, -117.1) $$, '23514', null, 'check: a low over the high is refused');
select throws_ok($$ select public.project_weather_store('c0000000-0000-0000-0000-000000000591', '2026-10-05', null, null, ' ',
                    'nws_observed', 33.1, -117.1) $$, '23514', null, 'check: nothing at all is not weather');
select throws_ok($$ select public.project_weather_store('c0000000-0000-0000-0000-000000000591', '2026-10-05', 70, 60, 'Fine',
                    'guess', 33.1, -117.1) $$, '23514', null, 'check: only the two sources');
select throws_ok($$ select public.project_weather_store('c0000000-0000-0000-0000-000000000599', '2026-10-05', 70, 60, 'Fine',
                    'nws_observed', 33.1, -117.1) $$, 'P0002', null, 'weather: an unknown job is not found');
reset role;

-- ---------------------------------------------------------------------------------------------------------------------
-- 4. Who reads; nobody writes by hand; the stores refuse people
-- ---------------------------------------------------------------------------------------------------------------------
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000592');
select is((select count(*)::int from public.project_places), 1, 'read: a member reads the job''s place');
select is((select count(*)::int from public.project_weather), 3, 'read: a member reads the job''s weather');
select throws_ok($$ insert into public.project_places (project_id, org_id, lat, lon, source)
                    values ('c0000000-0000-0000-0000-000000000592', 'b0000000-0000-0000-0000-000000000591', 1, 1, 'typed') $$,
  '42501', null, 'by hand: a member cannot insert a place');
select throws_ok($$ update public.project_places set lat = 1 $$, '42501', null, 'by hand: a member cannot change a place');
select throws_ok($$ update public.project_weather set high_f = 1 $$, '42501', null, 'by hand: a member cannot change the weather');
select throws_ok($$ delete from public.project_weather $$, '42501', null, 'by hand: a member cannot delete the weather');
select throws_ok($$ select public.project_place_store('c0000000-0000-0000-0000-000000000591', 1, 1, '', 'x', true) $$,
  '42501', null, 'stores: a member cannot call the place store');
select throws_ok($$ select public.project_weather_store('c0000000-0000-0000-0000-000000000591', '2026-10-06', 70, 60, 'Fine',
                    'nws_observed', 33.1, -117.1) $$, '42501', null, 'stores: a member cannot call the weather store');
select throws_ok($$ select public.project_place_set('c0000000-0000-0000-0000-000000000591', 33.5, -117.5) $$,
  '42501', null, 'typed: a member without project.manage cannot type the location');
select pg_temp.login('a0000000-0000-0000-0000-000000000593');
select is((select count(*)::int from public.project_places) + (select count(*)::int from public.project_weather), 0,
  'read: an outsider reads neither');
reset role;

-- The guard itself (not only the grant): a signed-in caller is refused even where the grant would let the call through.
select pg_temp.login('a0000000-0000-0000-0000-000000000591');
select throws_ok($$ select public.project_place_store('c0000000-0000-0000-0000-000000000591', 1, 1, '', 'x', true) $$,
  '42501', 'forbidden', 'guard: the place store answers only the server');
select throws_ok($$ select public.project_weather_store('c0000000-0000-0000-0000-000000000591', '2026-10-06', 70, 60, 'Fine',
                    'nws_observed', 33.1, -117.1) $$, '42501', 'forbidden', 'guard: the weather store answers only the server');

-- ---------------------------------------------------------------------------------------------------------------------
-- 5. The location typed by hand (project.manage)
-- ---------------------------------------------------------------------------------------------------------------------
set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000591');
select lives_ok($$ select public.project_place_set('c0000000-0000-0000-0000-000000000591', 33.5, -117.5) $$,
  'typed: the admin types the location');
select results_eq($$ select lat, lon, matched_address, source, looked_up, updated_by from pg_temp.place() $$,
  $$ values (33.5::double precision, -117.5::double precision, ''::text, 'typed'::text, ''::text,
             'a0000000-0000-0000-0000-000000000591'::uuid) $$, 'typed: the coordinates, marked typed, by whom');
select lives_ok($$ select public.project_place_set('c0000000-0000-0000-0000-000000000592', 40, -100) $$,
  'typed: a job with no place yet gets one');
select throws_ok($$ select public.project_place_set('c0000000-0000-0000-0000-000000000591', 33.5, null) $$,
  '22023', null, 'typed: half a location is refused');
select throws_ok($$ select public.project_place_set('c0000000-0000-0000-0000-000000000591', 95, -117.5) $$,
  '22023', null, 'typed: a latitude off the globe is refused');
select throws_ok($$ select public.project_place_set('c0000000-0000-0000-0000-000000000591', 'NaN', -117.5) $$,
  '22023', null, 'typed: not a number is refused');
reset role;

set local role service_role;
select pg_temp.login_service();
select is(public.project_place_store('c0000000-0000-0000-0000-000000000591', 33.1234, -117.1234, 'M', 'A', false), false,
  'typed: the server''s lookup leaves a typed location alone');
select is((select source from pg_temp.place()), 'typed', 'typed: it stayed typed');
select is(public.project_place_store('c0000000-0000-0000-0000-000000000591', 33.1234, -117.1234, 'M', 'A', true), true,
  'typed: "Look up again" replaces it');
reset role;

set local role authenticated;
select pg_temp.login('a0000000-0000-0000-0000-000000000591');
-- As the app calls it: the coordinates left out.
select lives_ok($$ select public.project_place_set(p_project_id => 'c0000000-0000-0000-0000-000000000591') $$,
  'typed: the admin empties the location');
select results_eq($$ select lat, lon, matched_address, source, looked_up from pg_temp.place() $$,
  $$ values (null::double precision, null::double precision, ''::text, 'census'::text, ''::text) $$,
  'typed: emptied means not looked up yet, so the next daily looks the address up');
reset role;
select is((select count(*)::int from public.audit_events
            where action = 'project.place' and project_id = 'c0000000-0000-0000-0000-000000000591'
              and actor_user_id = 'a0000000-0000-0000-0000-000000000591'), 2, 'typed: each change by hand is in the audit log');

select * from finish();
rollback;
