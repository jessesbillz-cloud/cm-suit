-- 0107 A removed request's map no longer holds its sheet (Jesse, Oct 22: "ok to delete" the Oct 4 test IRs 1-3 and the
-- test sheet 11.pdf, to start Hunter Hall from a clean baseline). 0080 refuses to remove a sheet or a map PDF while
-- any ir_maps row names it. A request that is itself removed (deleted_at) shows nowhere, so its map holds nothing:
-- only maps of live requests keep their sheet and map file. The Revs wall rule is unchanged.
create or replace function public.tg_files_keep_rev_sheet()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.deleted_at is not null and old.deleted_at is null and old.upload_complete then
    if exists (select 1 from public.rev_areas a
                 join public.rev_lists l on l.id = a.list_id and l.deleted_at is null
                where a.sheet_file_id = old.id and a.deleted_at is null) then
      raise exception 'A wall in Revs is on this sheet. Give the wall another sheet first.' using errcode = '22023';
    end if;
    if exists (select 1 from public.ir_maps m
                 join public.inspection_requests r on r.id = m.request_id and r.deleted_at is null
                where m.sheet_file_id = old.id or m.map_file_id = old.id) then
      raise exception 'An inspection map is on this sheet.' using errcode = '22023';
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function public.tg_files_keep_rev_sheet() from public, anon, authenticated;
