-- 0047 Photo previews (Sep 29): every photo tile shows the picture, not an icon.
--   * authorize_preview(file, rfi?, request?): may this person see this IMAGE? It asks the very gate the download of the
--     same file asks, by calling it: authorize_download (folder access, view-only, infected, the pending-scan rule), or
--     rfi_authorize_file when the photo is opened through an RFI (RFI privacy: who may see that RFI), or
--     authorize_ir_file through an inspection request. So a preview can never answer differently from a download,
--     today or after any later change to those gates.
--   * A preview is not a download: the gate's downloads row and audit event are rolled back (the call runs inside its
--     own block, which is undone on purpose; the answer is kept). Nothing else is swallowed: every refusal of the gate
--     reaches the caller unchanged.
--   * Images only (the same list as 0027's pending-image rule: a JPEG, PNG, WebP or HEIC mime AND file name). Anything
--     else is refused with not_image after the gate, so a preview never hands out a URL for a PDF, a bid or a plan.
--   * The download edge function (action 'preview') signs a short-lived URL for the row this returns. Users still have
--     no storage SELECT policy: storage stays reachable only through these gates.

create or replace function public.authorize_preview(p_file_id uuid, p_rfi_id uuid default null, p_request_id uuid default null)
returns table (storage_path text, original_name text, mime text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare v_path text; v_name text; v_mime text;
begin
  if p_rfi_id is not null and p_request_id is not null then
    raise exception 'An RFI or a request, not both.' using errcode = '22023';
  end if;
  begin
    if p_rfi_id is not null then
      select a.storage_path, a.original_name, a.mime into v_path, v_name, v_mime
        from public.rfi_authorize_file(p_rfi_id, p_file_id) a;
    elsif p_request_id is not null then
      select a.storage_path, a.original_name, a.mime into v_path, v_name, v_mime
        from public.authorize_ir_file(p_request_id, p_file_id) a;
    else
      select a.storage_path, a.original_name, a.mime into v_path, v_name, v_mime
        from public.authorize_download(p_file_id, 'original') a;
    end if;
    -- The gate said yes. Undo what it wrote (the downloads row, the audit event): a preview is not a download.
    raise exception 'preview, not a download' using errcode = 'PV001';
  exception when sqlstate 'PV001' then
    null;
  end;
  if v_path is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not (lower(v_mime) in ('image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif')
          and lower(v_name) ~ '\.(jpe?g|png|webp|heic|heif)$') then
    raise exception 'not_image' using errcode = '42501';
  end if;
  return query select v_path, v_name, v_mime;
end;
$$;
revoke execute on function public.authorize_preview(uuid, uuid, uuid) from public, anon;
grant execute on function public.authorize_preview(uuid, uuid, uuid) to authenticated, service_role;
