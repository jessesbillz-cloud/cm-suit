-- 0088 The spec book, split into its sections once for the whole job (Jesse, Oct 5: "it just takes one account to
-- upload them and then everybody should be able to pull from them ... automatically break it out into spec section ...
-- a dropdown box that you scroll through and look for the spec that you want, would have the title in it too").
--
--   * spec_sections: one row per section of a PDF in a Specs folder (number, title, first and last page, and whether
--     a SECTION header or the page footers found it). Read by whoever may read the file (the file_pages rule), written
--     only by spec_sections_find. Nobody writes it by hand, the server key included (select only, in the grants map).
--   * spec_sections_find(file): reads the file's page text (file_pages) and finds where each section starts. No AI.
--       1. A header near the top of a page: "SECTION 09 21 16" (or DOCUMENT, Division 00), the number however it is
--          spaced, a Level 4 ".13" kept. The title is the rest of that line, or the next line when the line ends at
--          the number ("PART 1 - GENERAL" is never a title).
--       2. A page with no header: its footer, the last line near the bottom ending in "09 21 16 - 3" (also "092116-3",
--          "09 21 16 - Page 3", "09 21 16 - 3 of 12"). The footer's words become the title only when they belong to
--          that one section (a project name printed on every footer is not a title).
--       A section starts where the number changes and runs to the page before the next one. Numbers outside
--       Divisions 00 to 49 are not sections. A title the reference library knows (csi_sections) in capitals is shown
--       in the library's words, and a section with no title found takes the library's title when it has one.
--       A manual with neither headers nor footers gets no rows: it still opens, by page.
--     Re-finding marks the old rows replaced and writes the new ones, so a repeat gives the same rows.
--   * It runs by itself when a Specs PDF's text is done (files.text_status becomes 'done', from the worker, an edge
--     function or the browser below) and when page text lands on a book already done. Books already read are found
--     once by this migration.
--   * spec_book_pages_save(file, page count, pages): no worker runs yet, so the browser of someone who may add files
--     to that Specs folder (the uploader, a folder writer, files.manage) sends the page text pdf.js reads from the
--     book it has open, up to 50 pages a call. When every page is in, the text is done and the sections are found.
--     A book whose text is done is never written again this way.
--   * spec_books(job): the PDFs in the job's Specs folders that I may read, each with its sections, whether its text
--     is read, and whether I may send it.
--   * requirements_spec_sections reads the same rows (one detector), for requirements.manage as before.

create table public.spec_sections (
  id uuid primary key default gen_random_uuid(),
  file_id uuid not null references public.files(id) on delete cascade,
  project_id uuid not null references public.projects(id),
  section text not null check (section ~ '^[0-9]{2} [0-9]{2} [0-9]{2}(\.[0-9]{1,2})?$'),
  title text not null default '' check (length(title) <= 160),
  first_page int not null check (first_page >= 1),
  last_page int not null,
  found_by text not null check (found_by in ('header', 'footer')),
  replaced boolean not null default false,
  found_at timestamptz not null default now(),
  check (last_page >= first_page),
  unique (file_id, first_page)
);
alter table public.spec_sections enable row level security;
create index spec_sections_project on public.spec_sections (project_id);

create policy "spec_sections: readable with the file" on public.spec_sections for select to authenticated
  using (not replaced and exists (
    select 1 from public.files f
     where f.id = spec_sections.file_id and f.deleted_at is null
       and ((f.created_by = auth.uid() and public.is_member(f.project_id)) or public.folder_can_read(f.folder_id))));

revoke all on public.spec_sections from public, anon, authenticated, service_role;
grant select on public.spec_sections to authenticated, service_role;

-- =====================================================================================================================
-- Finding the sections (internal)
-- =====================================================================================================================
-- Trims dashes, colons and spaces off both ends. Null when nothing with a letter is left.
create or replace function public.spec_title_clean(p text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case when t ~ '[A-Za-z]' then left(t, 160) end
    from (select btrim(regexp_replace(coalesce(p, ''), '^[ \t\-:–—]+|[ \t\-:–—.]+$', '', 'g')) as t) x;
$$;

create or replace function public.spec_sections_find(p_file_id uuid)
returns int
language plpgsql
set search_path = public, pg_temp
as $$
declare v_project uuid; v_n int;
begin
  select project_id into v_project from public.files where id = p_file_id;
  if v_project is null then return 0; end if;

  update public.spec_sections set replaced = true where file_id = p_file_id and not replaced;

  with pg as (
    select fp.page_no, fp.text from public.file_pages fp where fp.file_id = p_file_id
  ),
  hd as (
    select pg.page_no,
           regexp_match(left(pg.text, 800),
             '^[ \t]*(?:SECTION|DOCUMENT)[ \t]+(\d{2})[ \t]?(\d{2})[ \t]?(\d{2})((?:\.\d{1,2})?)(?!\d)[ \t]*[-:–—]?[ \t]*([^\r\n]*)(?:\r?\n(?:[ \t]*\r?\n)*[ \t]*([^\r\n]*))?',
             'n') as h
      from pg
  ),
  ft as (
    select distinct on (pg.page_no) pg.page_no, x.m
      from pg,
           lateral regexp_matches(right(pg.text, 400),
             '^(?:([^\r\n]*[^0-9\r\n]))?[ \t]*(\d{2})[ \t]?(\d{2})[ \t]?(\d{2})((?:\.\d{1,2})?)[ \t]*[-–—][ \t]*(?:page[ \t]+)?(\d{1,4})(?:[ \t]+of[ \t]+\d{1,4})?(?!\d)[ \t]*([^\r\n]*)$',
             'gin') with ordinality as x(m, k)
     order by pg.page_no, x.k desc
  ),
  per as (
    select pg.page_no,
           case when hd.h is not null then hd.h[1] || ' ' || hd.h[2] || ' ' || hd.h[3] || hd.h[4]
                when ft.m is not null then ft.m[2] || ' ' || ft.m[3] || ' ' || ft.m[4] || ft.m[5] end as section,
           case when hd.h is not null then 'header' when ft.m is not null then 'footer' end as found_by,
           case when hd.h is not null then
             coalesce(public.spec_title_clean(hd.h[5]),
                      case when coalesce(hd.h[6], '') !~* '^\s*PART\s+[0-9]' then public.spec_title_clean(hd.h[6]) end)
           end as head_title,
           case when hd.h is null and ft.m is not null then
             coalesce(public.spec_title_clean(regexp_replace(coalesce(ft.m[1], ''), '(?i)\s*section\s*$', '')),
                      public.spec_title_clean(ft.m[7]))
           end as foot_text
      from pg
      left join hd on hd.page_no = pg.page_no
      left join ft on ft.page_no = pg.page_no
  ),
  sec as (
    select * from per where section is not null and left(section, 2)::int <= 49
  ),
  -- Footer words that belong to one section only (a project name on every footer is not a title).
  own_text as (
    select foot_text from sec where foot_text is not null group by foot_text having count(distinct section) = 1
  ),
  runs as (
    select s.*, lag(s.section) over (order by s.page_no) as prev from sec s
  ),
  starts as (
    select r.page_no, r.section, r.found_by,
           coalesce(r.head_title, (select o.foot_text from own_text o where o.foot_text = r.foot_text)) as found_title,
           lead(r.page_no) over (order by r.page_no) as next_start
      from runs r
     where r.prev is distinct from r.section
  )
  insert into public.spec_sections (file_id, project_id, section, title, first_page, last_page, found_by)
  select p_file_id, v_project, st.section,
         coalesce(case when upper(st.found_title) = upper(cs.title) then cs.title else st.found_title end, cs.title, ''),
         st.page_no,
         greatest(st.page_no, coalesce(st.next_start - 1, (select max(pg.page_no) from pg))),
         st.found_by
    from starts st
    left join public.csi_sections cs on cs.number = left(st.section, 8)
  on conflict (file_id, first_page) do update
     set section = excluded.section, title = excluded.title, last_page = excluded.last_page,
         found_by = excluded.found_by, replaced = false, found_at = now();
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- A file's text is done: a PDF in a Specs folder gets its sections.
create or replace function public.tg_spec_sections_on_text()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if exists (select 1 from public.folders fo where fo.id = new.folder_id and fo.kind = 'specs') then
    perform public.spec_sections_find(new.id);
  end if;
  return null;
end;
$$;

create trigger spec_sections_on_text after update of text_status on public.files
  for each row when (new.text_status = 'done' and old.text_status is distinct from 'done')
  execute function public.tg_spec_sections_on_text();

-- Page text written on a Specs book whose text is already done (a re-read): found again.
create or replace function public.tg_spec_sections_on_pages()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.spec_sections_find(f.id)
     from public.files f
     join public.folders fo on fo.id = f.folder_id and fo.kind = 'specs'
    where f.id in (select distinct c.file_id from changed c) and f.text_status = 'done';
  return null;
end;
$$;

create trigger spec_sections_on_pages_insert after insert on public.file_pages
  referencing new table as changed for each statement execute function public.tg_spec_sections_on_pages();
create trigger spec_sections_on_pages_update after update on public.file_pages
  referencing new table as changed for each statement execute function public.tg_spec_sections_on_pages();

-- =====================================================================================================================
-- What people call
-- =====================================================================================================================
-- Whether I may send this file's page text (internal): a PDF in a Specs folder, finished, not infected, whose text is
-- not done, and I added it, may write that folder, or manage files.
create or replace function public.spec_book_can_send(p_file_id uuid)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select coalesce((
    select f.deleted_at is null and f.upload_complete and f.scan_status <> 'infected' and f.text_status <> 'done'
       and (f.mime = 'application/pdf' or lower(f.original_name) like '%.pdf')
       and exists (select 1 from public.folders fo where fo.id = f.folder_id and fo.kind = 'specs' and fo.deleted_at is null)
       and ((f.created_by = auth.uid() and public.is_member(f.project_id))
            or public.folder_can_write(f.folder_id) or public.has_capability(f.project_id, 'files.manage'))
      from public.files f where f.id = p_file_id), false);
$$;

-- The page text of a spec book, read by the browser. Answers the sections found once every page is in, else null.
create or replace function public.spec_book_pages_save(p_file_id uuid, p_page_count int, p_pages jsonb)
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare f public.files; v_have int;
begin
  if auth.uid() is null then raise exception 'Sign in first.' using errcode = '42501'; end if;
  select * into f from public.files where id = p_file_id;
  if f.id is null or not public.is_member(f.project_id) then
    raise exception 'That file is not here.' using errcode = 'P0002';
  end if;
  if f.text_status = 'done' then
    return (select count(*)::int from public.spec_sections s where s.file_id = f.id and not s.replaced);
  end if;
  if not public.spec_book_can_send(f.id) then
    raise exception 'Only someone who can add files to Specs can do this.' using errcode = '42501';
  end if;
  if p_page_count is null or p_page_count < 1 or p_page_count > 5000 then
    raise exception 'The page count is not right.' using errcode = '22023';
  end if;
  if p_pages is null or jsonb_typeof(p_pages) <> 'array' or jsonb_array_length(p_pages) > 50 then
    raise exception 'Send at most 50 pages at a time.' using errcode = '22023';
  end if;

  insert into public.file_pages (file_id, project_id, page_no, text)
  select f.id, f.project_id, x.n, x.t
    from (select case when (e->>'page') ~ '^[0-9]{1,5}$' then (e->>'page')::int end as n,
                 left(coalesce(e->>'text', ''), 60000) as t
            from jsonb_array_elements(p_pages) e) x
   where x.n between 1 and p_page_count
  on conflict (file_id, page_no) do update set text = excluded.text;

  select count(*) into v_have from public.file_pages where file_id = f.id and page_no <= p_page_count;
  if v_have < p_page_count then return null; end if;

  update public.files set text_status = 'done', page_count = p_page_count where id = f.id;
  return (select count(*)::int from public.spec_sections s where s.file_id = f.id and not s.replaced);
end;
$$;

-- The PDFs in the job's Specs folders that I may read, oldest first, each with its sections in page order.
create or replace function public.spec_books(p_project_id uuid)
returns table (file_id uuid, file_name text, size bigint, page_count int, text_ready boolean, can_send boolean,
               sections jsonb)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select f.id, f.original_name, f.size, f.page_count, f.text_status = 'done', public.spec_book_can_send(f.id),
         coalesce((select jsonb_agg(jsonb_build_object('section', s.section, 'title', s.title,
                                                       'first_page', s.first_page, 'last_page', s.last_page)
                                    order by s.first_page)
                     from public.spec_sections s where s.file_id = f.id and not s.replaced), '[]'::jsonb)
    from public.files f
    join public.folders fo on fo.id = f.folder_id and fo.kind = 'specs' and fo.deleted_at is null
   where f.project_id = p_project_id and f.deleted_at is null and f.upload_complete and f.scan_status <> 'infected'
     and (f.mime = 'application/pdf' or lower(f.original_name) like '%.pdf')
   order by f.created_at, f.id;
$$;

-- Same answer as 0073 (requirements.manage only), from the stored sections.
create or replace function public.requirements_spec_sections(p_project_id uuid)
returns table (file_id uuid, file_name text, page_count int, text_ready boolean, section text, title text,
               first_page int, last_page int)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with specs as (
    select f.id, f.original_name, f.page_count, f.text_status
      from public.files f
      join public.folders fo on fo.id = f.folder_id and fo.kind = 'specs' and fo.deleted_at is null
     where f.project_id = p_project_id and f.deleted_at is null and f.upload_complete and f.scan_status <> 'infected'
       and public.has_capability(p_project_id, 'requirements.manage')
  )
  select s.id, s.original_name, s.page_count, s.text_status = 'done', ss.section, nullif(ss.title, ''),
         ss.first_page, ss.last_page
    from specs s
    left join public.spec_sections ss on ss.file_id = s.id and not ss.replaced
   order by s.original_name, s.id, ss.first_page nulls first;
$$;

-- =====================================================================================================================
-- Grants: the RPCs people call, the helpers internal.
-- =====================================================================================================================
do $$
declare f text;
begin
  foreach f in array array['public.spec_book_pages_save(uuid, integer, jsonb)', 'public.spec_books(uuid)',
                           'public.spec_book_can_send(uuid)']
  loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
  foreach f in array array['public.spec_sections_find(uuid)', 'public.spec_title_clean(text)']
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
  execute 'revoke execute on function public.tg_spec_sections_on_text() from public, anon, authenticated';
  execute 'revoke execute on function public.tg_spec_sections_on_pages() from public, anon, authenticated';
end $$;

-- The spec books already read get their sections now.
do $$
begin
  perform public.spec_sections_find(f.id)
     from public.files f
     join public.folders fo on fo.id = f.folder_id and fo.kind = 'specs'
    where f.text_status = 'done' and f.deleted_at is null;
end $$;
