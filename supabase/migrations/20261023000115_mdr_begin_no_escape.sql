-- 0115 mdr_sync_begin without a printable escape in its source (Oct 23). 0112 wrote the backslash-u003b escape in the
-- SELECT it builds for MDR, so each batch's JSON carries no semicolon and the hosted SQL tool runs the batch call whole.
-- Applied to staging through the migration tool, that escape arrived as the character itself, so on staging the
-- function replaced a semicolon with a semicolon. Here the backslash is chr(92), so the source holds no escape and
-- every copy of the function is the same. Same function otherwise (0112, copied exactly).
-- Nothing else changes.

create or replace function public.mdr_sync_begin()
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare v_where text; v_sql text;
begin
  insert into public.mdr_sync_state (mdr_job_id) select mdr_job_id from public.mdr_job_links where active
  on conflict (mdr_job_id) do nothing;
  update public.mdr_sync_state s
     set run_started_at = now(), run_max_seen = null, run_min_error = null, run_counts = '{}'::jsonb
   where s.mdr_job_id in (select mdr_job_id from public.mdr_job_links where active);
  select string_agg(format('(job_id = %L::uuid and updated_at > %L::timestamptz)', l.mdr_job_id,
                           coalesce(s.cursor_at, '-infinity'::timestamptz)), ' or ' order by l.mdr_job_id)
    into v_where
    from public.mdr_job_links l join public.mdr_sync_state s on s.mdr_job_id = l.mdr_job_id
   where l.active;
  if v_where is null then raise exception 'No MDR job is linked (mdr_job_links).'; end if;
  v_sql := 'with r as (select id, job_id, ir_number, ir_title, inspection_types, special_type, inspection_date, '
    || 'requested_date, inspection_time, duration, flexible_display, status, approval_status, approved_at, approved_by, '
    || 'inspector_notes, notes, requester_name, requester_company, requester_email, subcontractor, sub_trade, gc, '
    || 'location_detail, attendance, file_urls, ir_pdf_url, postpone_reason, postpone_note, expected_date, '
    || 'postpone_count, cancel_reason, deleted_at, created_at, updated_at from public.inspection_requests where '
    || v_where || '), n as (select r.*, (row_number() over (order by updated_at, id) - 1) / 50 as batch from r) '
    || 'select batch + 1 as batch, count(*) as rows, max(updated_at) as last_updated_at, '
    || '''select public.mdr_import_requests('' || quote_literal(replace((jsonb_agg(to_jsonb(n) - ''batch'' '
    || 'order by updated_at, id))::text, chr(59), chr(92) || ''u003b'')) || ''::jsonb)'' as suite_sql '
    || 'from n group by batch order by batch';
  return jsonb_build_object('started_at', now(), 'mdr_sql', v_sql);
end;
$$;
revoke execute on function public.mdr_sync_begin() from public, anon, authenticated, service_role;
