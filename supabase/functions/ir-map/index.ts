// OSFM inspection maps (Revs, migration 0056): one 11x17 map per IR, the inspected walls highlighted on the plan sheet.
// Signed-in users only; every action runs as the caller first.
//   render:   requireUser → ir_map_context AS THE CALLER (anyone who can't see the request is refused there) → the
//             request's signer (read as the caller) and the job → ensureMap (_shared/irMapFile.ts, the one way to make
//             the map PDF: the map on file when it already shows exactly this, else built, stored in Reports /
//             Inspection reports as the previous map's next version, and recorded by ir_map_attach) → { file_id }.
//   download / view: render, then authorize_ir_file() as the caller (the request's own gate, scan rules, logged as a
//             download) and a fresh signed URL of the map, with / without the download header.
//   sheet:    the map's sheet for the in-app viewer: at most 40 MB (the viewer reads it whole), then authorize_ir_file()
//             as the caller, then a 10-minute signed URL without the download header.
// Service client (admin_service_key_allowlist.txt): the sheet's files row and bytes, the signer's signature image, the
// map's own row, the Reports folder (ir_folder_make: the requester may lack ir.decide), storing and recording the map
// and signing URLs; each only after ir_map_context ran as the caller.
import { handle, HttpError, ok } from '../_shared/http.ts';
import { type Db, must, rpc, serviceClient, signedDownloadUrl, signedViewUrl } from '../_shared/db.ts';
import { requireUser } from '../_shared/auth.ts';
import { parseJson, uuid, z } from '../_shared/validate.ts';
import { loadRequest } from '../_shared/inspections.ts';
import { ensureMap, type MapFacts, mapFactsSchema, type MapJob, sheetFile, signerOf } from '../_shared/irMapFile.ts';

const Body = z.object({ action: z.enum(['render', 'download', 'view', 'sheet']), request_id: uuid }).strict();

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

Deno.serve(handle(async (req) => {
  const { user, client } = await requireUser(req);
  const body = await parseJson(req, Body, 4096);
  const ctx = await context(client, body.request_id);
  const service = serviceClient();

  if (body.action === 'sheet') {
    const sheet = await sheetFile(service, ctx);
    const f = await authorized(client, ctx.request_id, sheet.id);
    return ok(req, { url: await signedViewUrl(service, f.storage_path) });
  }

  // The signer and the job, read as the caller (who passed ir_map_context).
  const signed = signerOf(await loadRequest(client, ctx.request_id), ctx.signer_name);
  const job = must(await client.from('projects').select('name, timezone').eq('id', ctx.project_id).single(), 'project') as MapJob;
  const fileId = await ensureMap(service, ctx, { createdBy: user.id, signed, job });
  if (body.action === 'render') return ok(req, { file_id: fileId });
  const f = await authorized(client, ctx.request_id, fileId);
  const url = body.action === 'view'
    ? await signedViewUrl(service, f.storage_path)
    : await signedDownloadUrl(service, 'files', f.storage_path, f.original_name);
  return ok(req, { file_id: fileId, url, filename: f.original_name });
}));
