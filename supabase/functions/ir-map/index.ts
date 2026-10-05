// OSFM inspection maps (Revs, migration 0056): one 11x17 map per IR, the inspected walls highlighted on the plan sheet.
// Signed-in users only; every action runs as the caller first. This function tests no capability of its own: the gate is
// the database's, as the caller. ir_map_context opens the map to whoever may see the request (ir_may_see, 0061: the
// requester, the GC team and the inspectors; the holder of ir.ofs_decide / ir.ofs_view only once an OFS request is sent
// to OFS, and never an IOR or special request). Who DRAWS is ir_map_save's rule (ir_map_editor: whoever decides the
// request now, or its requester until there is a result). The PDF is only the saved drawing printed, so anyone the map
// is open to gets the current one.
//   render:   requireUser → ir_map_context AS THE CALLER (anyone who can't see the request is refused there) → the
//             request (its signer and kind, read as the caller) and the job → ensureMap (_shared/irMapFile.ts, the one
//             way to make the map PDF: the map on file when it already shows exactly this, else built, stored in the
//             request's own folder (an OFS request's map in Reports / OFS inspection reports, apart from the inspector's
//             IRs) as the previous map's next version, and recorded by ir_map_attach) → { file_id }.
//   download / view: render, then authorize_ir_file() as the caller (the request's own gate, scan rules, logged as a
//             download) and a fresh signed URL of the map, with / without the download header.
//   sheet:    the map's sheet for the in-app viewer: at most 40 MB (the viewer reads it whole), then authorize_ir_file()
//             as the caller, then a 10-minute signed URL without the download header.
//   plan:     a plan sheet for the Revs plan view and a wall's thumbnail (0059), by job and file: authorize_rev_sheet() AS
//             THE CALLER (whoever reads revs, for a sheet a wall is on; a manager, any PDF of the job he may read; the
//             scan rules; logged as a download), at most 40 MB, then a 10-minute signed URL without the download header,
//             and the sheet's name (the wall page names its sheet to readers who can't open Files).
//   plan_download: the same plan sheet saved with its original filename (0080): the same gate as the caller, so whoever
//             may see the plan may download it, Files folder or not; a signed URL with the download header.
// Service client (admin_service_key_allowlist.txt): the sheet's files row and bytes, the signer's signature image, the
// map's own row, the map's folder (ir_folder_make: nobody writes the OFS folder by hand, and a requester holds neither
// deciding capability), storing and recording the map and signing URLs; each only after ir_map_context (or, for 'plan',
// authorize_rev_sheet) ran as the caller.
import { handle, HttpError, ok } from '../_shared/http.ts';
import { type Db, must, rpc, serviceClient, signedDownloadUrl, signedViewUrl } from '../_shared/db.ts';
import { requireUser } from '../_shared/auth.ts';
import { parseJson, uuid, z } from '../_shared/validate.ts';
import { loadRequest } from '../_shared/inspections.ts';
import { checkSheetSize, ensureMap, type MapFacts, mapFactsSchema, type MapJob, sheetFile, signerOf } from '../_shared/irMapFile.ts';

const Body = z.union([
  z.object({ action: z.enum(['render', 'download', 'view', 'sheet']), request_id: uuid }).strict(),
  z.object({ action: z.enum(['plan', 'plan_download']), project_id: uuid, file_id: uuid }).strict(),
]);

interface Authorized {
  storage_path: string;
  original_name: string;
}

/** The map's facts as the caller may see them (ir_map_context; can_edit is the screen's, not the PDF's). */
async function context(client: Db, requestId: string): Promise<MapFacts> {
  return mapFactsSchema.parse(await rpc<unknown>(client, 'ir_map_context', { p_request_id: requestId }));
}

/** A file of the request (its map or the map's sheet) through the request's own gate, as the caller: logged. */
async function authorized(client: Db, requestId: string, fileId: string): Promise<Authorized> {
  const f = (await rpc<Authorized[]>(client, 'authorize_ir_file', { p_request_id: requestId, p_file_id: fileId }))?.[0];
  if (!f) throw new HttpError(404, 'File not found');
  return f;
}

/** A plan sheet of the job's walls, through Revs' own gate as the caller (logged). */
async function planSheet(client: Db, projectId: string, fileId: string): Promise<Authorized & { size: number }> {
  const rows = await rpc<(Authorized & { size: number })[]>(client, 'authorize_rev_sheet', { p_project_id: projectId, p_file_id: fileId });
  const f = rows?.[0];
  if (!f) throw new HttpError(404, 'File not found');
  return f;
}

Deno.serve(handle(async (req) => {
  const { user, client } = await requireUser(req);
  const body = await parseJson(req, Body, 4096);
  if ('project_id' in body) {
    const f = await planSheet(client, body.project_id, body.file_id);
    if (body.action === 'plan_download') {
      return ok(req, { url: await signedDownloadUrl(serviceClient(), 'files', f.storage_path, f.original_name), filename: f.original_name });
    }
    // The viewer reads it whole: a size it can hold.
    checkSheetSize(f.size);
    return ok(req, { url: await signedViewUrl(serviceClient(), f.storage_path), filename: f.original_name });
  }
  const ctx = await context(client, body.request_id);
  const service = serviceClient();

  if (body.action === 'sheet') {
    const sheet = await sheetFile(service, ctx);
    const f = await authorized(client, ctx.request_id, sheet.id);
    return ok(req, { url: await signedViewUrl(service, f.storage_path) });
  }

  // The request (its signer and its kind) and the job, read as the caller (who passed ir_map_context).
  const row = await loadRequest(client, ctx.request_id);
  const signed = signerOf(row, ctx.signer_name);
  const job = must(await client.from('projects').select('name, timezone').eq('id', ctx.project_id).single(), 'project') as MapJob;
  const fileId = await ensureMap(service, ctx, { createdBy: user.id, signed, job, kind: row.kind });
  if (body.action === 'render') return ok(req, { file_id: fileId });
  const f = await authorized(client, ctx.request_id, fileId);
  const url = body.action === 'view'
    ? await signedViewUrl(service, f.storage_path)
    : await signedDownloadUrl(service, 'files', f.storage_path, f.original_name);
  return ok(req, { file_id: fileId, url, filename: f.original_name });
}));
