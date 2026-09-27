-- 0018 The sub directory (SPEC §11.2): org-level, used from the Bids tool, filled by hand or from a GC's master list.
--   * Columns the master list carries: city, zip, license_classes, certifications, and extra (every column the import
--     does not map, by header). The unique (org_id, lower(company)) index already exists (0011: subs_org_company).
--   * Who may use it: "directory use" is bids.manage (SPEC §5.2). can_manage_subs(org) = org admin, or bids.manage on
--     one of the org's jobs. Reading: org members as before, plus those managers (an estimator added to a job is not an
--     org member). Writing: managers only; before, any org member could write.
--   * Column grants: people edit the directory fields only. The CSLB result goes through record_cslb_check, so the
--     checked time is the server's; extra is written by the import only.
--   * import_subs(org, rows): merges an already-grouped list (one element per company) into the directory. Matches on
--     (org, lower(company)); unions trades, merges contacts, fills empty fields, never wipes a value. Safe to repeat.

alter table public.subs
  add column city text,
  add column zip text,
  add column license_classes text,
  add column certifications text,
  add column extra jsonb not null default '{}'::jsonb check (jsonb_typeof(extra) = 'object');

-- ---------------------------------------------------------------------------
-- can_manage_subs(org): the caller may add to and edit this org's directory.
-- ---------------------------------------------------------------------------
create or replace function public.can_manage_subs(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null and (
    public.is_org_admin(p_org_id)
    or exists (
      select 1 from public.project_members pm
      join public.projects p on p.id = pm.project_id
      where pm.user_id = auth.uid() and pm.status = 'active' and p.org_id = p_org_id and p.deleted_at is null
        and public.has_capability(p.id, 'bids.manage')));
$$;
revoke execute on function public.can_manage_subs(uuid) from public, anon;
grant execute on function public.can_manage_subs(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Policies: read = org members or directory managers; write = directory managers.
-- ---------------------------------------------------------------------------
drop policy "subs: org read" on public.subs;
drop policy "subs: org insert" on public.subs;
drop policy "subs: org update" on public.subs;
create policy "subs: directory read" on public.subs for select to authenticated
  using (deleted_at is null and (exists (select 1 from public.org_members om where om.org_id = subs.org_id and om.user_id = auth.uid())
                                 or public.can_manage_subs(org_id)));
create policy "subs: managers insert" on public.subs for insert to authenticated
  with check (created_by = auth.uid() and public.can_manage_subs(org_id));
create policy "subs: managers update" on public.subs for update to authenticated
  using (public.can_manage_subs(org_id)) with check (public.can_manage_subs(org_id));

drop policy "sub_history: org read" on public.sub_history;
create policy "sub_history: directory read" on public.sub_history for select to authenticated
  using (exists (select 1 from public.org_members om where om.org_id = sub_history.org_id and om.user_id = auth.uid())
         or public.can_manage_subs(org_id));

-- Column grants (a table-level revoke also removes column grants, so these are the complete list).
revoke insert, update on public.subs from authenticated;
grant insert (org_id, company, contacts, trades, region, city, zip, cslb_number, license_classes, dir_number, certifications,
              notes, created_by) on public.subs to authenticated;
grant update (company, contacts, trades, region, city, zip, cslb_number, license_classes, dir_number, certifications, notes)
  on public.subs to authenticated;

-- ---------------------------------------------------------------------------
-- merge_sub_contacts(existing, incoming): incoming contacts [{name, email, phone, title}] merged into existing ones.
-- A contact is the same person when the email matches, or when name and email don't conflict and the phone (last 10
-- digits) or the name matches. A match only fills its empty fields; anything else is appended. Existing values are
-- never changed. The import's grouping (supabase/functions/_shared/subsImport.ts) uses the same rule.
-- ---------------------------------------------------------------------------
create or replace function public.merge_sub_contacts(p_existing jsonb, p_incoming jsonb)
returns jsonb
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  result jsonb := case when jsonb_typeof(p_existing) = 'array' then p_existing else '[]'::jsonb end;
  n jsonb; e jsonb; hit int;
  n_name text; n_email text; n_phone text; n_title text; n_ph text;
  e_name text; e_email text; e_ph text;
begin
  if jsonb_typeof(p_incoming) is distinct from 'array' then return result; end if;
  for n in select value from jsonb_array_elements(p_incoming) limit 200 loop
    continue when jsonb_typeof(n) <> 'object';
    n_name := left(btrim(coalesce(n->>'name', '')), 200);
    n_email := left(lower(btrim(coalesce(n->>'email', ''))), 320);
    n_phone := left(btrim(coalesce(n->>'phone', '')), 60);
    n_title := left(btrim(coalesce(n->>'title', '')), 100);
    n_ph := right(regexp_replace(n_phone, '[^0-9]', '', 'g'), 10);
    continue when n_name = '' and n_email = '' and n_phone = '';
    hit := null;
    for i in 0 .. jsonb_array_length(result) - 1 loop
      e := result -> i;
      continue when jsonb_typeof(e) <> 'object';
      e_name := lower(btrim(coalesce(e->>'name', '')));
      e_email := lower(btrim(coalesce(e->>'email', '')));
      e_ph := right(regexp_replace(coalesce(e->>'phone', ''), '[^0-9]', '', 'g'), 10);
      if (n_email <> '' and e_email = n_email)
         or ((e_name = '' or n_name = '' or e_name = lower(n_name))
             and (e_email = '' or n_email = '' or e_email = n_email)
             and ((n_ph <> '' and e_ph = n_ph) or (n_name <> '' and e_name = lower(n_name)))) then
        hit := i;
        exit;
      end if;
    end loop;
    if hit is null then
      if jsonb_array_length(result) < 100 then
        result := result || jsonb_build_array(jsonb_build_object('name', n_name, 'email', n_email, 'phone', n_phone, 'title', n_title));
      end if;
    else
      e := result -> hit;
      result := jsonb_set(result, array[hit::text], e || jsonb_strip_nulls(jsonb_build_object(
        'name', case when btrim(coalesce(e->>'name', '')) = '' and n_name <> '' then n_name end,
        'email', case when btrim(coalesce(e->>'email', '')) = '' and n_email <> '' then n_email end,
        'phone', case when btrim(coalesce(e->>'phone', '')) = '' and n_phone <> '' then n_phone end,
        'title', case when btrim(coalesce(e->>'title', '')) = '' and n_title <> '' then n_title end)));
    end if;
  end loop;
  return result;
end;
$$;
revoke execute on function public.merge_sub_contacts(jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.merge_sub_contacts(jsonb, jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- import_subs(org, rows) -> (added, updated, unchanged). Called by the import-subs edge function AS THE CALLER.
-- rows: [{company, trades[], contacts[], city, zip, region, cslb_number, license_classes, dir_number, certifications,
--         notes, extra{}}], one element per company. Imports into the same org run one at a time.
-- ---------------------------------------------------------------------------
create or replace function public.import_subs(p_org_id uuid, p_rows jsonb)
returns table (added int, updated int, unchanged int)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r jsonb; s public.subs;
  v_company text; v_trades text[]; v_extra jsonb;
  v_city text; v_zip text; v_region text; v_license text; v_classes text; v_dir text; v_certs text; v_notes text;
  m_trades text[]; m_contacts jsonb; m_extra jsonb;
  m_city text; m_zip text; m_region text; m_license text; m_classes text; m_dir text; m_certs text; m_notes text;
  n_added int := 0; n_updated int := 0; n_unchanged int := 0;
begin
  if not public.can_manage_subs(p_org_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  if jsonb_typeof(p_rows) is distinct from 'array' then raise exception 'rows must be a list' using errcode = '22023'; end if;
  if jsonb_array_length(p_rows) > 5000 then raise exception 'too many rows (5000 per call)' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtext('import_subs:' || p_org_id::text));

  for r in select value from jsonb_array_elements(p_rows) loop
    if jsonb_typeof(r) <> 'object' then raise exception 'each row must be an object' using errcode = '22023'; end if;
    v_company := left(regexp_replace(btrim(coalesce(r->>'company', '')), '\s+', ' ', 'g'), 200);
    continue when v_company = '';
    v_trades := array(
      select distinct t from (select upper(btrim(x)) as t
                              from jsonb_array_elements_text(case when jsonb_typeof(r->'trades') = 'array' then r->'trades' else '[]'::jsonb end) x) q
      where t ~ '^[0-9]{2}[A-Z]$' order by t);
    v_extra := case when jsonb_typeof(r->'extra') = 'object' then r->'extra' else '{}'::jsonb end;
    select nullif(left(btrim(x.city), 100), ''), nullif(left(btrim(x.zip), 20), ''), nullif(left(btrim(x.region), 100), ''),
           nullif(left(btrim(x.cslb_number), 40), ''), nullif(left(btrim(x.license_classes), 200), ''),
           nullif(left(btrim(x.dir_number), 40), ''), nullif(left(btrim(x.certifications), 500), ''), left(btrim(coalesce(x.notes, '')), 4000)
      into v_city, v_zip, v_region, v_license, v_classes, v_dir, v_certs, v_notes
      from jsonb_to_record(r) as x (city text, zip text, region text, cslb_number text, license_classes text, dir_number text,
                                    certifications text, notes text);

    select * into s from public.subs
     where org_id = p_org_id and lower(company) = lower(v_company) and deleted_at is null
     for update;

    if s.id is null then
      insert into public.subs (org_id, company, trades, contacts, city, zip, region, cslb_number, license_classes, dir_number,
                               certifications, notes, extra, created_by)
      values (p_org_id, v_company, v_trades, public.merge_sub_contacts('[]'::jsonb, r->'contacts'), v_city, v_zip, v_region,
              v_license, v_classes, v_dir, v_certs, v_notes, v_extra, auth.uid());
      n_added := n_added + 1;
      continue;
    end if;

    -- Existing sub: union and fill only. A field that has a value keeps it.
    m_trades := s.trades || array(select t from unnest(v_trades) t where not (t = any (s.trades)) order by t);
    m_contacts := public.merge_sub_contacts(s.contacts, r->'contacts');
    m_extra := v_extra || s.extra;
    m_city := case when nullif(btrim(s.city), '') is null and v_city is not null then v_city else s.city end;
    m_zip := case when nullif(btrim(s.zip), '') is null and v_zip is not null then v_zip else s.zip end;
    m_region := case when nullif(btrim(s.region), '') is null and v_region is not null then v_region else s.region end;
    m_license := case when nullif(btrim(s.cslb_number), '') is null and v_license is not null then v_license else s.cslb_number end;
    m_classes := case when nullif(btrim(s.license_classes), '') is null and v_classes is not null then v_classes else s.license_classes end;
    m_dir := case when nullif(btrim(s.dir_number), '') is null and v_dir is not null then v_dir else s.dir_number end;
    m_certs := case when nullif(btrim(s.certifications), '') is null and v_certs is not null then v_certs else s.certifications end;
    m_notes := case when btrim(s.notes) = '' and v_notes <> '' then v_notes else s.notes end;

    if row(m_trades, m_contacts, m_extra, m_city, m_zip, m_region, m_license, m_classes, m_dir, m_certs, m_notes)
       is distinct from row(s.trades, s.contacts, s.extra, s.city, s.zip, s.region, s.cslb_number, s.license_classes, s.dir_number,
                            s.certifications, s.notes) then
      update public.subs
         set trades = m_trades, contacts = m_contacts, extra = m_extra, city = m_city, zip = m_zip, region = m_region,
             cslb_number = m_license, license_classes = m_classes, dir_number = m_dir, certifications = m_certs, notes = m_notes
       where id = s.id;
      n_updated := n_updated + 1;
    else
      n_unchanged := n_unchanged + 1;
    end if;
  end loop;

  perform public.audit('subs.import', 'org', p_org_id, null, p_org_id,
    jsonb_build_object('added', n_added, 'updated', n_updated, 'unchanged', n_unchanged), null);
  added := n_added; updated := n_updated; unchanged := n_unchanged;
  return next;
end;
$$;
revoke execute on function public.import_subs(uuid, jsonb) from public, anon;
grant execute on function public.import_subs(uuid, jsonb) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- record_cslb_check(sub, status, version): the result of a manual CSLB lookup, stamped with the server time.
-- ---------------------------------------------------------------------------
create or replace function public.record_cslb_check(p_sub_id uuid, p_status text, p_version int)
returns public.subs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare s public.subs;
begin
  if p_status is null or p_status not in ('active', 'inactive', 'suspended', 'expired') then
    raise exception 'status must be active, inactive, suspended or expired' using errcode = '22023';
  end if;
  select * into s from public.subs where id = p_sub_id and deleted_at is null for update;
  if s.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not public.can_manage_subs(s.org_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  if s.version <> p_version then
    raise exception 'version_conflict: expected %, found %', p_version, s.version using errcode = '40001';
  end if;
  update public.subs set cslb_status = p_status, cslb_checked_at = now() where id = s.id returning * into s;
  return s;
end;
$$;
revoke execute on function public.record_cslb_check(uuid, text, int) from public, anon;
grant execute on function public.record_cslb_check(uuid, text, int) to authenticated, service_role;
