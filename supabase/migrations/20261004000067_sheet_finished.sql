-- 0067 A plan sheet is a file whose upload finished.
--
-- What broke: an upload that never finished (Jesse's 92 MB "38.pdf", stopped at the storage size cap) was offered in the
-- sheet picker, and the database would have taken it as a wall's sheet. There are no bytes behind such a row, so the plan
-- could never draw. The rule lives here; the picker (src/data/revSheets.queries.ts) lists by the same rule.
create or replace function public.rev_sheet_ok(p_project_id uuid, p_file_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (select 1 from public.files f
                  where f.id = p_file_id and f.project_id = p_project_id and f.deleted_at is null
                    and f.upload_complete
                    and f.mime = 'application/pdf' and f.scan_status <> 'infected'
                    and public.file_may_see(f.project_id, f.created_by, f.folder_id));
$$;
