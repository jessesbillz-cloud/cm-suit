-- 0072 Each company sets up its daily form's fields (SPEC §18.1 principle 10, Jesse: "Every form comes as our standard
-- with every field worth having, each company ticks the fields it wants, renames and reorders them, adds its own. That's
-- not ours to dictate."). For the built-in forms made of fields and tables (the superintendent's and the foreman's
-- daily), the VIS form and the work log are fixed and are not touched.
--   1. The company's version of a form is data: orgs.settings.daily_forms[<form id>] = { seq, fields, tables }, one entry
--      per field, table and column (key, on, label, null label = our name), in the company's order. The ONE zod schema
--      and the ONE resolver are in _shared/reportForms.ts (formSetupSchema, companyForm), daily_form_setup_problem
--      checks the same shape and limits here. No setup saved = our standard form, exactly as before.
--   2. Keys never change (a rename is a label). The company's own fields and columns get the keys "x_<n>" from this
--      database: add_daily_form_field counts seq up and gives the next one, a key is never given twice, and a setup can
--      only hold keys this form gave out.
--   3. Who: the company's own admins (is_org_admin), through save_daily_form / add_daily_form_field, version-checked
--      against the company row. orgs.settings is a column admins may update directly (0013), a trigger keeps
--      daily_forms out of that path, so the checks can't be skipped. Reading needs nothing new: everyone on a job
--      already reads the job's company row ("orgs: members read", 0002).
--   4. A signed report keeps the form it was signed on: daily_reports.form, written only by finish_daily_submit (the
--      server) and never replaced once the report is submitted, so a later change to the company's form never changes
--      what an old report prints. The form is part of the content hash (submit-daily). finish_daily_submit gains
--      p_form, the 5-argument one is retired (renamed, rights taken away), not dropped.
--   Carryover is unchanged: it works by keys, which never change, a renamed count or hours column is still cleared.

-- 1. A signed report keeps its form -----------------------------------------------------------------------------------
alter table public.daily_reports
  add column form jsonb check (form is null or (jsonb_typeof(form) = 'object' and octet_length(form::text) <= 30000));

alter function public.finish_daily_submit(uuid, int, text, uuid, text) rename to finish_daily_submit_0023;
revoke all on function public.finish_daily_submit_0023(uuid, int, text, uuid, text) from public, anon, authenticated, service_role;

-- Service role only (submit-daily, after storeGeneratedPdf): the report becomes submitted with its stored PDF and the
-- form it was signed on. Same as 0023, plus p_form.
create function public.finish_daily_submit(p_report_id uuid, p_version int, p_content_hash text, p_file_id uuid, p_filename text,
                                           p_form jsonb default null)
returns public.daily_reports
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare r public.daily_reports; f public.files; resubmit boolean; label text;
begin
  if not public.is_service_role() then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into r from public.daily_reports where id = p_report_id and deleted_at is null for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if r.version <> p_version or r.sign_pending_hash is distinct from p_content_hash then
    raise exception 'version_conflict' using errcode = '40001';
  end if;
  if p_form is not null and (jsonb_typeof(p_form) <> 'object' or octet_length(p_form::text) > 30000) then
    raise exception 'bad form' using errcode = '22023';
  end if;
  select * into f from public.files where id = p_file_id and deleted_at is null;
  if not found or f.project_id <> r.project_id or f.created_by <> r.author_id or f.mime <> 'application/pdf'
     or not f.upload_complete
     or f.folder_id is distinct from (select folder_id from public.daily_author_folders
                                      where project_id = r.project_id and author_id = r.author_id and kind = 'reports') then
    raise exception 'That PDF is not this report''s stored PDF' using errcode = '22023';
  end if;
  resubmit := r.status = 'submitted';
  update public.daily_reports set
    status = 'submitted', signed_at = sign_pending_at, signed_by = author_id, content_hash = p_content_hash,
    pdf_file_id = f.id, filename = coalesce(filename, left(p_filename, 400)), submitted_at = coalesce(submitted_at, now()),
    signed_version = version + 1, sign_pending_hash = null, sign_pending_at = null,
    -- The form a submitted report was signed on stays, a first signing (or one from before 0072) records it.
    form = case when status = 'submitted' and form is not null then form else p_form end
  where id = r.id
  returning * into r;
  label := coalesce(nullif(r.header->>'label', ''), 'Daily report');
  -- The board line (what post_activity writes), with the author as the actor.
  insert into public.activity (org_id, project_id, kind, entity_type, entity_id, summary, actor_user_id, audience_capability, created_by)
  values (r.org_id, r.project_id, case when resubmit then 'daily.resubmitted' else 'daily.submitted' end, 'daily_report', r.id,
          left(format('%s %s %s #%s for %s', coalesce(nullif(r.header->>'author_name', ''), 'Someone'),
                      case when resubmit then 'updated' else 'submitted' end, label, r.number,
                      to_char(r.report_date, 'Mon FMDD')), 500),
          r.author_id, 'dailies.read_all', r.author_id);
  perform public.audit(case when resubmit then 'daily.resubmit' else 'daily.submit' end, 'daily_report', r.id, r.project_id,
    r.org_id, jsonb_build_object('number', r.number, 'file_id', f.id, 'author', r.author_id), p_content_hash, 'system');
  return r;
end;
$$;
revoke execute on function public.finish_daily_submit(uuid, int, text, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.finish_daily_submit(uuid, int, text, uuid, text, jsonb) to service_role;

-- 2. The setup's shape and limits (formSetupSchema in _shared/reportForms.ts says the same) ----------------------------
-- What is wrong with a form's setup, or null. Which keys are a form's built-in ones is the app's registry, here: the
-- shape, the lengths, the counts, the company's own keys, and something left on.
create function public.daily_form_setup_problem(p_setup jsonb)
returns text
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare v_seq int; v_all jsonb;
begin
  if p_setup is null or jsonb_typeof(p_setup) <> 'object' or octet_length(p_setup::text) > 20000
     or jsonb_typeof(p_setup->'seq') is distinct from 'number' or (p_setup->>'seq') !~ '^[0-9]{1,6}$'
     or jsonb_typeof(p_setup->'fields') is distinct from 'array' or jsonb_typeof(p_setup->'tables') is distinct from 'array' then
    return 'The form setup can''t be read';
  end if;
  v_seq := (p_setup->>'seq')::int;
  if v_seq > 100000 or jsonb_array_length(p_setup->'fields') > 40 or jsonb_array_length(p_setup->'tables') > 20 then
    return 'Too many fields';
  end if;
  if exists (select 1 from jsonb_array_elements(p_setup->'tables') t
              where case when jsonb_typeof(t->'columns') = 'array' then jsonb_array_length(t->'columns') > 12 else true end) then
    return 'Too many columns';
  end if;

  -- Every entry with the list it is in: f = the fields, t = the tables, c<n> = the n-th table's columns.
  select coalesce(jsonb_agg(jsonb_build_object('g', x.g, 'e', x.e)), '[]'::jsonb) into v_all
    from (select 'f' as g, e from jsonb_array_elements(p_setup->'fields') e
          union all
          select 't', e from jsonb_array_elements(p_setup->'tables') e
          union all
          select 'c' || t.o, c.e
            from jsonb_array_elements(p_setup->'tables') with ordinality t (e, o)
           cross join lateral jsonb_array_elements(t.e->'columns') c (e)) x;

  if exists (select 1 from jsonb_array_elements(v_all) x
              where jsonb_typeof(x->'e') is distinct from 'object'
                 or jsonb_typeof(x->'e'->'key') is distinct from 'string' or (x->'e'->>'key') !~ '^[a-z0-9_]{1,40}$'
                 or jsonb_typeof(x->'e'->'on') is distinct from 'boolean'
                 or coalesce(jsonb_typeof(x->'e'->'label'), 'null') not in ('null', 'string')
                 or (jsonb_typeof(x->'e'->'label') = 'string'
                     and (length(x->'e'->>'label') not between 1 and 40 or (x->'e'->>'label') ~ '^\s|\s$'))
                 or coalesce(jsonb_typeof(x->'e'->'long'), 'boolean') <> 'boolean') then
    return 'A field of the form setup can''t be read';
  end if;
  if exists (select 1 from jsonb_array_elements(v_all) x group by x->>'g', x->'e'->>'key' having count(*) > 1) then
    return 'A field is listed twice';
  end if;
  -- The company's own fields and columns: named, with a key this form gave out, never a table.
  if exists (select 1 from jsonb_array_elements(v_all) x
              where case when (x->'e'->>'key') ~ '^x_[1-9][0-9]{0,5}$'
                         then x->>'g' = 't' or jsonb_typeof(x->'e'->'label') is distinct from 'string'
                              or substr(x->'e'->>'key', 3)::int > v_seq
                         else false end) then
    return 'An added field needs a name and a key this form gave out';
  end if;
  if exists (select 1 from jsonb_array_elements(v_all) x
              where (x->'e'->>'key') ~ '^x_[1-9][0-9]{0,5}$'
              group by x->>'g'
             having count(*) > case when x->>'g' = 'f' then 12 else 3 end) then
    return 'Too many added fields';
  end if;
  if exists (select 1 from jsonb_array_elements(p_setup->'tables') t
              where (t->>'on')::boolean
                and not exists (select 1 from jsonb_array_elements(t->'columns') c where (c->>'on')::boolean)) then
    return 'Keep one column on';
  end if;
  if not exists (select 1 from jsonb_array_elements(v_all) x where x->>'g' in ('f', 't') and (x->'e'->>'on')::boolean) then
    return 'Keep one field or table on';
  end if;
  return null;
end;
$$;
revoke execute on function public.daily_form_setup_problem(jsonb) from public, anon, authenticated;

-- 3. A company's daily forms change only through the functions below ------------------------------------------------------
create function public.tg_orgs_daily_forms()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare changed boolean;
begin
  if tg_op = 'INSERT' then
    changed := new.settings ? 'daily_forms';
  else
    changed := (new.settings->'daily_forms') is distinct from (old.settings->'daily_forms');
  end if;
  if changed and coalesce(current_setting('app.daily_forms', true), '') <> 'save' then
    raise exception 'A company''s daily forms are saved with save_daily_form' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke execute on function public.tg_orgs_daily_forms() from public, anon, authenticated;
create trigger daily_forms_guard before insert or update of settings on public.orgs
  for each row execute function public.tg_orgs_daily_forms();

-- Stores one form's setup for a company: its admin, the row version they read, the shape checked. p_add (label, long,
-- table) adds one field or column of the company's own with the next key. Internal: the two functions below call it.
create function public.daily_form_store(p_org_id uuid, p_form text, p_setup jsonb, p_version int, p_add jsonb)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  o public.orgs; v_forms jsonb; v_seq int := 0; v_setup jsonb; v_entry jsonb; v_label text; v_table text; v_idx int;
  v_problem text; v_version int;
begin
  if not public.is_org_admin(p_org_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_form is null or p_form !~ '^[a-z0-9_]{1,40}$' then raise exception 'bad form' using errcode = '22023'; end if;
  select * into o from public.orgs where id = p_org_id and deleted_at is null for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if p_version is null or o.version <> p_version then raise exception 'version_conflict' using errcode = '40001'; end if;
  if p_setup is null or jsonb_typeof(p_setup) <> 'object' or jsonb_typeof(p_setup->'fields') is distinct from 'array'
     or jsonb_typeof(p_setup->'tables') is distinct from 'array' then
    raise exception 'The form setup can''t be read' using errcode = '22023';
  end if;
  v_forms := case when jsonb_typeof(o.settings->'daily_forms') = 'object' then o.settings->'daily_forms' else '{}'::jsonb end;
  -- The key counter is the database's: whatever the caller sent is replaced by the saved one.
  if jsonb_typeof(v_forms->p_form->'seq') = 'number' and (v_forms->p_form->>'seq') ~ '^[0-9]{1,6}$' then
    v_seq := (v_forms->p_form->>'seq')::int;
  end if;
  v_setup := jsonb_build_object('seq', v_seq, 'fields', p_setup->'fields', 'tables', p_setup->'tables');

  if p_add is not null then
    v_label := regexp_replace(coalesce(p_add->>'label', ''), '^\s+|\s+$', '', 'g');
    if length(v_label) not between 1 and 40 then
      raise exception 'Name it (up to 40 characters)' using errcode = '22023';
    end if;
    v_seq := v_seq + 1;
    v_entry := jsonb_build_object('key', 'x_' || v_seq, 'on', true, 'label', v_label);
    v_table := p_add->>'table';
    if v_table is null then
      v_setup := jsonb_set(v_setup, '{fields}',
        (v_setup->'fields') || jsonb_build_array(v_entry || jsonb_build_object('long', coalesce((p_add->>'long')::boolean, false))));
    else
      select t.o - 1 into v_idx
        from jsonb_array_elements(v_setup->'tables') with ordinality t (e, o) where t.e->>'key' = v_table limit 1;
      if v_idx is null or jsonb_typeof(v_setup->'tables'->v_idx->'columns') is distinct from 'array' then
        raise exception 'That table is not on the form' using errcode = '22023';
      end if;
      v_setup := jsonb_set(v_setup, array['tables', v_idx::text, 'columns'],
        (v_setup->'tables'->v_idx->'columns') || jsonb_build_array(v_entry));
    end if;
    v_setup := jsonb_set(v_setup, '{seq}', to_jsonb(v_seq));
  end if;

  v_problem := public.daily_form_setup_problem(v_setup);
  if v_problem is not null then raise exception '%', v_problem using errcode = '22023'; end if;
  if (select count(*) from jsonb_object_keys(v_forms || jsonb_build_object(p_form, v_setup))) > 20 then
    raise exception 'Too many forms' using errcode = '22023';
  end if;

  perform set_config('app.daily_forms', 'save', true);
  update public.orgs set settings = jsonb_set(settings, '{daily_forms}', v_forms || jsonb_build_object(p_form, v_setup))
   where id = o.id
  returning version into v_version;
  perform set_config('app.daily_forms', '', true);
  perform public.audit('org.daily_form', 'org', o.id, null, o.id,
    jsonb_build_object('form', p_form, 'added', v_entry->>'key'));
  return jsonb_build_object('version', v_version, 'setup', v_setup);
end;
$$;
revoke execute on function public.daily_form_store(uuid, text, jsonb, int, jsonb) from public, anon, authenticated;

-- Saves the company's setup of a form (ticks, names, order, its own fields taken off or put back). Answers the company
-- row's new version and the setup as stored.
create function public.save_daily_form(p_org_id uuid, p_form text, p_setup jsonb, p_version int)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  return public.daily_form_store(p_org_id, p_form, p_setup, p_version, null);
end;
$$;

-- Adds a field of the company's own (or, with p_table, a column to that table) to the setup as the caller has it, with
-- the next key. The same answer as save_daily_form.
create function public.add_daily_form_field(p_org_id uuid, p_form text, p_setup jsonb, p_version int, p_label text,
                                            p_long boolean default false, p_table text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  return public.daily_form_store(p_org_id, p_form, p_setup, p_version,
    jsonb_build_object('label', p_label, 'long', coalesce(p_long, false), 'table', p_table));
end;
$$;

revoke execute on function public.save_daily_form(uuid, text, jsonb, int) from public, anon;
revoke execute on function public.add_daily_form_field(uuid, text, jsonb, int, text, boolean, text) from public, anon;
grant execute on function public.save_daily_form(uuid, text, jsonb, int) to authenticated, service_role;
grant execute on function public.add_daily_form_field(uuid, text, jsonb, int, text, boolean, text) to authenticated, service_role;
