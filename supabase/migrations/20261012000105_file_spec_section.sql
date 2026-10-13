-- 0105 Every document's spec section as a hidden field (Jesse, Oct 12, 6:31 pm, on the spec number in submittal names:
-- "Even on creation we could look through, determine the section and then put it somewhere in the title, hidden if we
-- had to. Or assign it into a bucket."). The spec section page (the hub) then no longer depends on names alone.
--   * files.spec_section: the section's 6 digits ("092900"), Divisions 00 to 49, or null. Read with the file under the
--     files policies as they are. Indexed per job.
--   * Nobody writes it straight. The column grants never gave people UPDATE on it, and a person's INSERT that carries
--     one is refused (tg_files_spec_section_guard). Two functions write it, both audited 'file.spec_section':
--       file_spec_section_set(file, version, section): set or clear it, with a version check, safe to repeat (the same
--         section again answers the file's version). Add spec section in Files.
--     The section alone does not give the file a new version (tg_files_spec_section_version), so a list filling its
--     files' sections never makes Delete, Move or Rename on it stale.
--       file_spec_sections_fill(items): fills the files that have none, up to 500 a call, each {file_id, section}, and
--         skips the rest (already set, not there, or not mine to change). Never overwrites, so no version. Answers how
--         many it set. The uploader's browser right after an upload (the section from the name, else from the PDF's
--         first pages), and Files opening a section's list (from names only).
--   * Who may: someone who may see the file and add to it, a finished live file, never in the server's folders. That
--     is its uploader still on the job, a writer of its folder, or files.manage (file_spec_section_may, internal).
-- The server key keeps its table rights on files (the grants map is unchanged, no new table).

alter table public.files add column spec_section text
  constraint files_spec_section_format check (spec_section ~ '^[0-4][0-9][0-9]{4}$');

create index files_spec_section on public.files (project_id, spec_section)
  where spec_section is not null and deleted_at is null;

-- A person's own write never carries a section (the functions below run as their owner).
create or replace function public.tg_files_spec_section_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if current_user in ('authenticated', 'anon') and new.spec_section is not null
     and (tg_op = 'INSERT' or new.spec_section is distinct from old.spec_section) then
    raise exception 'The spec section is set through file_spec_section_set.' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke execute on function public.tg_files_spec_section_guard() from public, anon, authenticated;
create trigger spec_section_guard before insert or update of spec_section on public.files
  for each row execute function public.tg_files_spec_section_guard();

-- The section alone is not a new version of the file: Delete, Move and Rename keep the version they read (a list
-- filling its files' sections must not turn every row stale). Runs after touch (triggers fire by name).
create or replace function public.tg_files_spec_section_version()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.spec_section is distinct from old.spec_section
     and to_jsonb(new) - 'spec_section' - 'version' - 'updated_at' = to_jsonb(old) - 'spec_section' - 'version' - 'updated_at' then
    new.version := old.version;
  end if;
  return new;
end;
$$;
revoke execute on function public.tg_files_spec_section_version() from public, anon, authenticated;
create trigger touch_spec_section before update of spec_section on public.files
  for each row execute function public.tg_files_spec_section_version();

-- May I set this file's section? (internal)
create or replace function public.file_spec_section_may(p_file_id uuid)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select coalesce((
    select auth.uid() is not null and f.deleted_at is null and f.upload_complete
       and public.file_may_see(f.project_id, f.created_by, f.folder_id)
       and not public.folder_server_only(f.folder_id)
       and ((f.created_by = auth.uid() and public.is_member(f.project_id))
            or public.folder_can_write(f.folder_id) or public.has_capability(f.project_id, 'files.manage'))
      from public.files f where f.id = p_file_id), false);
$$;
revoke execute on function public.file_spec_section_may(uuid) from public, anon, authenticated;

create or replace function public.file_spec_section_set(p_file_id uuid, p_version int, p_section text)
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare f public.files; v_new text := nullif(btrim(coalesce(p_section, '')), ''); v_version int;
begin
  if auth.uid() is null then raise exception 'Sign in first.' using errcode = '42501'; end if;
  if v_new is not null and v_new !~ '^[0-4][0-9][0-9]{4}$' then
    raise exception 'A spec section is 6 digits, like 092900.' using errcode = '22023';
  end if;
  select * into f from public.files where id = p_file_id for update;
  if f.id is null or f.deleted_at is not null or not public.file_may_see(f.project_id, f.created_by, f.folder_id) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if not public.file_spec_section_may(f.id) then raise exception 'forbidden' using errcode = '42501'; end if;
  if f.spec_section is not distinct from v_new then return f.version; end if;
  if f.version <> p_version then raise exception 'version_conflict' using errcode = '40001'; end if;
  update public.files set spec_section = v_new where id = f.id returning version into v_version;
  perform public.audit('file.spec_section', 'file', f.id, f.project_id, f.org_id,
    jsonb_build_object('from', f.spec_section, 'to', v_new, 'via', 'set'));
  return v_version;
end;
$$;
revoke execute on function public.file_spec_section_set(uuid, int, text) from public, anon;
grant execute on function public.file_spec_section_set(uuid, int, text) to authenticated;

create or replace function public.file_spec_sections_fill(p_items jsonb)
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare e jsonb; f public.files; v_section text; v_n int := 0;
begin
  if auth.uid() is null then raise exception 'Sign in first.' using errcode = '42501'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 500 then
    raise exception 'Send at most 500 files at a time.' using errcode = '22023';
  end if;
  for e in select value from jsonb_array_elements(p_items) loop
    if jsonb_typeof(e) <> 'object'
       or coalesce(e->>'file_id', '') !~ '^[0-9a-fA-F]{8}-([0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12}$'
       or coalesce(e->>'section', '') !~ '^[0-4][0-9][0-9]{4}$' then
      raise exception 'Each item is a file and its 6-digit section.' using errcode = '22023';
    end if;
    v_section := e->>'section';
    select * into f from public.files where id = (e->>'file_id')::uuid for update;
    continue when f.id is null or f.spec_section is not null or not public.file_spec_section_may(f.id);
    update public.files set spec_section = v_section where id = f.id;
    perform public.audit('file.spec_section', 'file', f.id, f.project_id, f.org_id,
      jsonb_build_object('to', v_section, 'via', 'fill'));
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;
revoke execute on function public.file_spec_sections_fill(jsonb) from public, anon;
grant execute on function public.file_spec_sections_fill(jsonb) to authenticated;
