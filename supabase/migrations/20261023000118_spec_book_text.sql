-- 0118 The spec book as text (Jesse, Oct 23: "We need the spec to be much more interactive. Just hosting a PDF seems
-- cheesy. Split it up so you can expand everything by spec section, rebuild it on the site.").
--
--   * spec_section_texts: one row per found section (0088 spec_sections), its words as structure: PART headings,
--     articles (1.01), paragraphs (A., 1., a., 1), a)) and plain lines, as the parser in
--     supabase/functions/_shared/specText.ts made them. Status 'no_text' when its pages have no text layer (a scan: no
--     OCR here, the reader shows the PDF pages). The number, title and pages stay in spec_sections (stored once).
--     Read by whoever may read the book's file (file_may_see, the files rule). Written only by spec_text_save.
--   * spec_text_queue: the books waiting to be read, one row per file. The server's alone (no policy, no grants).
--   * Who reads the text: the spec-text edge function (cron and self-chained, x-cron-secret), never a browser. It reads
--     the PDF's text layer from private storage page by page into file_pages (the one store of page text) when the
--     book's text is not done, which finds the sections (0088), then parses each section whose pages changed.
--       spec_text_claim: the next book to work on (queued, or running and left for 5 minutes), at most 5 tries.
--       spec_text_pages_put: a run of pages read. The last one marks the text done (the sections are found by 0088's
--         trigger), or 'none' when no page has any text.
--       spec_text_running: the lines at the top and bottom of pages that repeat (running heads and feet).
--       spec_text_todo: the sections whose text is missing or older than their pages or the parser, with their pages.
--       spec_text_save: the parsed sections. Safe to repeat (one row per section, the newest wins).
--       spec_text_end: the run's end for the book: done, failed, or queued to go on.
--     Safe to repeat: page rows upsert, a section is parsed again only when its pages' hash or the parser changes.
--   * When: a finished, clean PDF in a Specs folder is queued when it lands (a new upload, a replacement, a move into
--     Specs, its scan coming back clean) and when its text becomes done another way. pg_cron looks every minute and
--     asks the function to run only when something waits (spec_text_cron, Vault secrets as 0112). By hand, once per job:
--     spec_text_enqueue_project(job), the database owner only.
--   * People call spec_section_read(file, first page): the section's status (done, no_text, waiting) and its blocks.
--   * spec_books leaves out a book replaced by a newer version.

create table public.spec_section_texts (
  spec_section_id uuid primary key references public.spec_sections(id) on delete cascade,
  file_id uuid not null references public.files(id) on delete cascade,
  status text not null check (status in ('done', 'no_text')),
  body jsonb not null default '[]'::jsonb check (jsonb_typeof(body) = 'array' and octet_length(body::text) <= 1500000),
  parser int not null check (parser >= 1),
  source_hash text not null check (source_hash ~ '^[0-9a-f]{64}$'),
  parsed_at timestamptz not null default now()
);
alter table public.spec_section_texts enable row level security;
create index spec_section_texts_file on public.spec_section_texts (file_id);

create policy "spec_section_texts: readable with the file" on public.spec_section_texts for select to authenticated
  using (exists (select 1 from public.files f
                  where f.id = spec_section_texts.file_id and f.deleted_at is null
                    and public.file_may_see(f.project_id, f.created_by, f.folder_id)));

revoke all on public.spec_section_texts from public, anon, authenticated, service_role;
grant select on public.spec_section_texts to authenticated, service_role;

create table public.spec_text_queue (
  file_id uuid primary key references public.files(id) on delete cascade,
  project_id uuid not null references public.projects(id),
  status text not null default 'queued' check (status in ('queued', 'running', 'done', 'failed')),
  next_page int not null default 1 check (next_page >= 1),
  tries int not null default 0,
  error text,
  claimed_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.spec_text_queue enable row level security;
create index spec_text_queue_waiting on public.spec_text_queue (updated_at) where status in ('queued', 'running');
revoke all on public.spec_text_queue from public, anon, authenticated, service_role;

-- =====================================================================================================================
-- Queueing (internal)
-- =====================================================================================================================
-- A spec book the server may read: a finished, clean, current PDF straight in a live Specs folder.
create or replace function public.spec_text_ready(p_file_id uuid)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select coalesce((
    select f.deleted_at is null and f.upload_complete and f.scan_status = 'clean' and f.superseded_by is null
       and (f.mime = 'application/pdf' or lower(f.original_name) like '%.pdf')
       and exists (select 1 from public.folders fo where fo.id = f.folder_id and fo.kind = 'specs' and fo.deleted_at is null)
      from public.files f where f.id = p_file_id), false);
$$;

-- Queues the book (again). A book being read keeps its run.
create or replace function public.spec_text_enqueue(p_file_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.spec_text_ready(p_file_id) then return false; end if;
  insert into public.spec_text_queue (file_id, project_id)
  select f.id, f.project_id from public.files f where f.id = p_file_id
  on conflict (file_id) do update set status = 'queued', tries = 0, error = null, claimed_at = null, updated_at = now()
   where public.spec_text_queue.status in ('done', 'failed');
  return true;
end;
$$;

create or replace function public.tg_spec_text_on_file()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.spec_text_enqueue(new.id);
  return null;
end;
$$;

create trigger spec_text_on_insert after insert on public.files
  for each row when (new.upload_complete and new.scan_status = 'clean')
  execute function public.tg_spec_text_on_file();
create trigger spec_text_on_update after update of upload_complete, scan_status, folder_id, text_status on public.files
  for each row when (new.upload_complete and new.scan_status = 'clean'
                     and (old.upload_complete is distinct from new.upload_complete
                          or old.scan_status is distinct from new.scan_status
                          or old.folder_id is distinct from new.folder_id
                          or (new.text_status = 'done' and old.text_status is distinct from 'done')))
  execute function public.tg_spec_text_on_file();

-- =====================================================================================================================
-- The spec-text function's steps (service role)
-- =====================================================================================================================
create or replace function public.spec_text_claim()
returns table (file_id uuid, project_id uuid, storage_path text, size bigint, text_done boolean, page_count int,
               next_page int)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare q public.spec_text_queue; f public.files;
begin
  if not public.is_service_role() then raise exception 'forbidden' using errcode = '42501'; end if;
  for i in 1..50 loop
    select * into q from public.spec_text_queue sq
     where sq.status = 'queued' or (sq.status = 'running' and sq.claimed_at < now() - interval '5 minutes')
     order by sq.updated_at
     limit 1
     for update skip locked;
    if q.file_id is null then return; end if;
    select * into f from public.files fl where fl.id = q.file_id;
    if not public.spec_text_ready(q.file_id) or f.text_status = 'none' then
      update public.spec_text_queue sq set status = 'done', claimed_at = null, updated_at = now() where sq.file_id = q.file_id;
      continue;
    end if;
    if q.tries >= 5 then
      update public.spec_text_queue sq set status = 'failed', claimed_at = null, updated_at = now(),
             error = coalesce(sq.error, 'Stopped after 5 tries.')
       where sq.file_id = q.file_id;
      continue;
    end if;
    update public.spec_text_queue sq set status = 'running', claimed_at = now(), tries = sq.tries + 1, updated_at = now()
     where sq.file_id = q.file_id;
    file_id := f.id;
    project_id := f.project_id;
    storage_path := f.storage_path;
    size := f.size;
    text_done := f.text_status = 'done';
    page_count := f.page_count;
    next_page := q.next_page;
    return next;
    return;
  end loop;
end;
$$;

-- Pages read from the PDF, [{page, text}], and the page to read next. Answers 'more', 'done' (the text is done: the
-- sections are found) or 'none' (no page has any text: nothing to parse).
create or replace function public.spec_text_pages_put(p_file_id uuid, p_page_count int, p_pages jsonb, p_next int)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare f public.files;
begin
  if not public.is_service_role() then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into f from public.files where id = p_file_id;
  if f.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if p_page_count is null or p_page_count < 1 or p_page_count > 5000 or p_next is null or p_next < 1 then
    raise exception 'The page count is not right.' using errcode = '22023';
  end if;
  if p_pages is null or jsonb_typeof(p_pages) <> 'array' or jsonb_array_length(p_pages) > 500 then
    raise exception 'Send at most 500 pages at a time.' using errcode = '22023';
  end if;
  insert into public.file_pages (file_id, project_id, page_no, text)
  select f.id, f.project_id, x.n, x.t
    from (select case when (e->>'page') ~ '^[0-9]{1,5}$' then (e->>'page')::int end as n,
                 left(coalesce(e->>'text', ''), 60000) as t
            from jsonb_array_elements(p_pages) e) x
   where x.n between 1 and p_page_count
  on conflict (file_id, page_no) do update set text = excluded.text;

  if p_next <= p_page_count then
    update public.spec_text_queue set next_page = p_next, status = 'queued', tries = 0, error = null, claimed_at = null,
           updated_at = now()
     where file_id = f.id;
    return 'more';
  end if;
  if exists (select 1 from public.file_pages fp where fp.file_id = f.id and fp.page_no <= p_page_count and fp.text ~ '[A-Za-z0-9]') then
    update public.spec_text_queue set next_page = p_page_count, status = 'queued', tries = 0, error = null, claimed_at = null,
           updated_at = now()
     where file_id = f.id;
    update public.files set text_status = 'done', page_count = p_page_count where id = f.id and text_status <> 'done';
    return 'done';
  end if;
  update public.files set text_status = 'none', page_count = p_page_count where id = f.id;
  update public.spec_text_queue set status = 'done', error = null, claimed_at = null, updated_at = now() where file_id = f.id;
  return 'none';
end;
$$;

-- The lines that repeat at the top or bottom (4 lines each way) of the book's pages, numbers read as '#' and spaces
-- as one: {"pages": n, "lines": {"<line>": pages it is on}}, those on 3 pages or more.
create or replace function public.spec_text_running(p_file_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with edge as (
    select fp.page_no, x.line, x.k,
           row_number() over (partition by fp.page_no order by x.k) as a,
           row_number() over (partition by fp.page_no order by x.k desc) as z
      from public.file_pages fp
      cross join lateral regexp_split_to_table(fp.text, '\r?\n') with ordinality as x (line, k)
     where fp.file_id = p_file_id and x.line ~ '\S'
  ),
  norm as (
    select distinct page_no, regexp_replace(btrim(regexp_replace(line, '\s+', ' ', 'g')), '[0-9]+', '#', 'g') as l
      from edge where a <= 4 or z <= 4
  )
  select jsonb_build_object(
    'pages', (select count(*) from public.file_pages where file_id = p_file_id),
    'lines', coalesce((select jsonb_object_agg(l, n) from (select l, count(*) as n from norm group by l having count(*) >= 3) c),
                      '{}'::jsonb));
$$;

-- The sections whose text is missing or out of date (their pages, or the parser, changed), in page order, with their
-- pages and the hash the saved text will carry.
create or replace function public.spec_text_todo(p_file_id uuid, p_parser int, p_limit int)
returns table (spec_section_id uuid, section text, title text, first_page int, last_page int, source_hash text,
               pages jsonb)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with s as (
    select ss.id, ss.section, ss.title, ss.first_page, ss.last_page,
           (select coalesce(jsonb_agg(jsonb_build_object('page', fp.page_no, 'text', fp.text) order by fp.page_no), '[]'::jsonb)
              from public.file_pages fp
             where fp.file_id = ss.file_id and fp.page_no between ss.first_page and ss.last_page) as pages
      from public.spec_sections ss
     where ss.file_id = p_file_id and not ss.replaced
  ),
  h as (
    select s.*, encode(extensions.digest(concat_ws(chr(10), p_parser::text, s.section, s.first_page::text,
                                                    s.last_page::text, s.pages::text), 'sha256'), 'hex') as hash
      from s
  )
  select h.id, h.section, h.title, h.first_page, h.last_page, h.hash, h.pages
    from h
    left join public.spec_section_texts t on t.spec_section_id = h.id
   where t.source_hash is distinct from h.hash or t.parser is distinct from p_parser
   order by h.first_page
   limit greatest(1, least(coalesce(p_limit, 20), 50));
$$;

-- [{spec_section_id, source_hash, parser, status, body}], at most 50. Only the book's own sections are kept.
create or replace function public.spec_text_save(p_file_id uuid, p_items jsonb)
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_n int;
begin
  if not public.is_service_role() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 50 then
    raise exception 'Send at most 50 sections at a time.' using errcode = '22023';
  end if;
  insert into public.spec_section_texts (spec_section_id, file_id, status, body, parser, source_hash)
  select s.id, s.file_id, e->>'status', e->'body', (e->>'parser')::int, e->>'source_hash'
    from jsonb_array_elements(p_items) e
    join public.spec_sections s on s.id = (e->>'spec_section_id')::uuid and s.file_id = p_file_id
  on conflict (spec_section_id) do update
     set status = excluded.status, body = excluded.body, parser = excluded.parser, source_hash = excluded.source_hash,
         parsed_at = now();
  get diagnostics v_n = row_count;
  update public.spec_text_queue set tries = 0, updated_at = now() where file_id = p_file_id;
  return v_n;
end;
$$;

-- The run is over for this book: 'done', 'failed', or 'queued' (more to do, or try again later, with the error).
create or replace function public.spec_text_end(p_file_id uuid, p_status text, p_error text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_service_role() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_status not in ('queued', 'done', 'failed') then raise exception 'bad status' using errcode = '22023'; end if;
  update public.spec_text_queue
     set status = p_status, error = left(p_error, 500), claimed_at = null, updated_at = now()
   where file_id = p_file_id;
end;
$$;

-- Asks the spec-text function to run (pg_net). Needs the Vault secrets project_url, anon_key and cron_secret (as
-- 0112). Missing ones refuse.
create or replace function public.spec_text_kick()
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_url text; v_key text; v_secret text; v_id bigint;
begin
  if not public.is_service_role() then raise exception 'forbidden' using errcode = '42501'; end if;
  if to_regclass('vault.decrypted_secrets') is null or to_regnamespace('net') is null then
    raise exception 'spec-text: pg_net and Vault are needed' using errcode = '55000';
  end if;
  execute 'select (select decrypted_secret from vault.decrypted_secrets where name = ''project_url''),
                  (select decrypted_secret from vault.decrypted_secrets where name = ''anon_key''),
                  (select decrypted_secret from vault.decrypted_secrets where name = ''cron_secret'')'
     into v_url, v_key, v_secret;
  if v_url is null or v_key is null or v_secret is null then
    raise exception 'spec-text: set the Vault secrets project_url, anon_key and cron_secret' using errcode = '55000';
  end if;
  execute 'select net.http_post(url := $1, headers := $2, body := $3, timeout_milliseconds := 150000)'
     into v_id
    using rtrim(v_url, '/') || '/functions/v1/spec-text',
          jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key, 'x-cron-secret', v_secret),
          '{}'::jsonb;
  return v_id;
end;
$$;

-- The cron step: only when a book waits. The function calls it too at the end of each call, to go on at once.
create or replace function public.spec_text_cron()
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare n int;
begin
  select count(*) into n from public.spec_text_queue
   where status = 'queued' or (status = 'running' and claimed_at < now() - interval '5 minutes');
  if n > 0 then perform public.spec_text_kick(); end if;
  return n;
end;
$$;

-- Once per job, by hand (the database owner): every spec book on the job, read or not, is queued.
create or replace function public.spec_text_enqueue_project(p_project_id uuid)
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare n int := 0; f uuid;
begin
  if not public.is_service_role() then raise exception 'forbidden' using errcode = '42501'; end if;
  for f in select x.id from public.files x where x.project_id = p_project_id and x.deleted_at is null order by x.created_at loop
    if public.spec_text_enqueue(f) then n := n + 1; end if;
  end loop;
  return n;
end;
$$;

-- =====================================================================================================================
-- What people call
-- =====================================================================================================================
-- One section's text: 'done' with its blocks, 'no_text' (a scan, or a book with no text at all), or 'waiting' (not
-- read yet). No row: no such section I may read.
create or replace function public.spec_section_read(p_file_id uuid, p_first_page int)
returns table (status text, body jsonb)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select coalesce(t.status, case when f.text_status = 'none' then 'no_text' else 'waiting' end),
         coalesce(t.body, '[]'::jsonb)
    from public.spec_sections s
    join public.files f on f.id = s.file_id and f.deleted_at is null
    left join public.spec_section_texts t on t.spec_section_id = s.id
   where s.file_id = p_file_id and s.first_page = p_first_page and not s.replaced;
$$;

-- As 0088, without a book a newer version replaced.
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
     and f.superseded_by is null
     and (f.mime = 'application/pdf' or lower(f.original_name) like '%.pdf')
   order by f.created_at, f.id;
$$;

-- =====================================================================================================================
-- Grants
-- =====================================================================================================================
do $$
declare f text;
begin
  foreach f in array array['public.spec_text_claim()', 'public.spec_text_pages_put(uuid, integer, jsonb, integer)',
                           'public.spec_text_running(uuid)', 'public.spec_text_todo(uuid, integer, integer)',
                           'public.spec_text_save(uuid, jsonb)', 'public.spec_text_end(uuid, text, text)',
                           'public.spec_text_cron()']
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
  foreach f in array array['public.spec_text_ready(uuid)', 'public.spec_text_enqueue(uuid)',
                           'public.tg_spec_text_on_file()', 'public.spec_text_kick()',
                           'public.spec_text_enqueue_project(uuid)']
  loop
    execute format('revoke execute on function %s from public, anon, authenticated, service_role', f);
  end loop;
  execute 'revoke execute on function public.spec_section_read(uuid, integer) from public, anon';
  execute 'grant execute on function public.spec_section_read(uuid, integer) to authenticated';
end $$;

select cron.schedule('spec-text', '* * * * *', $$select public.spec_text_cron()$$);
