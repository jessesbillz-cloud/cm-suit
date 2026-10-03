// OSFM inspection maps (Revs, migration 0056): one 11x17 map per IR, the inspected walls highlighted on the plan sheet.
// Signed-in users only; every action runs as the caller first.
//   render:   requireUser → ir_map_context AS THE CALLER (anyone who can't see the request is refused there) → the
//             content hash of what the map shows (sheet, page, strokes, title, legend and, on a passed and signed IR,
//             the signature) → the map on file already shows exactly that: it is the answer → else the sheet's files
//             row (same job, scanned clean, at most 40 MB) and bytes → buildIrMap (_shared/pdf/irMap.ts; the deputy's
//             signature and date through the ONE stamp) → storeGeneratedPdf into Reports / Inspection reports (`replaces`
//             the previous map: its next version) → ir_map_attach (service role only) → { file_id }.
//   download / view: render, then authorize_ir_file() as the caller (the request's own gate, scan rules, logged as a
//             download) and a fresh signed URL of the map, with / without the download header.
//   sheet:    the map's sheet for the in-app viewer: at most 40 MB (the viewer reads it whole), then authorize_ir_file()
//             as the caller, then a 10-minute signed URL without the download header.
// Service client (admin_service_key_allowlist.txt): the sheet's files row and bytes, the signer's signature image, the
// map's own row, the Reports folder (ir_folder_make: the requester may lack ir.decide), storing and recording the map
// and signing URLs; each only after ir_map_context ran as the caller.
import { handle, HttpError, ok } from '../_shared/http.ts';
import { type Db, must, rpc, serviceClient, signedDownloadUrl, signedViewUrl, storageError } from '../_shared/db.ts';
import { requireUser } from '../_shared/auth.ts';
import { parseJson, uuid, z } from '../_shared/validate.ts';
import { contentHash } from '../_shared/crypto.ts';
import { buildFilename } from '../_shared/buildFilename.ts';
import { storeGeneratedPdf } from '../_shared/generatedPdf.ts';
import { SheetError, buildIrMap, mapTitle } from '../_shared/pdf/irMap.ts';
import { pdfSafe } from '../_shared/pdf/inspectionReport.ts';
import { loadRequest, signedAtLabel } from '../_shared/inspections.ts';
import { looksLikePdf } from '../_shared/permitStamp.ts';

/** Bigger than any single sheet; a whole set is refused before a byte is read. */
const SHEET_MAX_BYTES = 40 * 1024 * 1024;
const TOO_BIG = 'Upload the single sheet.';

const Body = z.object({ action: z.enum(['render', 'download', 'view', 'sheet']), request_id: uuid }).strict();

const color = z.union([z.literal(1), z.literal(2), z.literal(3)]);
const contextSchema = z.object({
  request_id: z.string(),
  project_id: z.string(),
  number: z.number().int(),
  ofs_number: z.number().int().nullable(),
  phase: z.string().nullable(),
  request_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  what: z.string(),
  sheet_file_id: z.string().nullable(),
  page: z.number().int().min(1),
  strokes: z.array(z.object({ c: color, w: z.number(), p: z.array(z.tuple([z.number(), z.number()])).min(2).max(2000) })).max(300),
  legend: z.array(z.object({ color, name: z.string() })).max(3),
  signer_name: z.string().nullable(),
  map_file_id: z.string().nullable(),
  /** A save or a change to the request since the last map (it may still look the same). */
  stale: z.boolean(),
});
type MapContext = z.infer<typeof contextSchema>;

interface SheetFile {
  id: string;
  project_id: string;
  storage_path: string;
  size: number;
  scan_status: string;
}

interface Signed {
  by: string;
  at: string;
  name: string;
  irHash: string | null;
}

interface Authorized {
  storage_path: string;
  original_name: string;
}

async function context(client: Db, requestId: string): Promise<MapContext> {
  return contextSchema.parse(await rpc<unknown>(client, 'ir_map_context', { p_request_id: requestId }));
}

/** The sheet's row, read with the service key after the caller passed ir_map_context: a file of this job, one sheet. */
async function sheetFile(service: Db, ctx: MapContext): Promise<SheetFile> {
  if (!ctx.sheet_file_id) throw new HttpError(400, 'Pick the sheet first.');
  const f = must(
    await service.from('files').select('id, project_id, storage_path, size, scan_status').eq('id', ctx.sheet_file_id)
      .is('deleted_at', null).maybeSingle(),
    'sheet lookup',
  ) as SheetFile | null;
  if (!f || f.project_id !== ctx.project_id) throw new HttpError(404, 'The sheet is no longer in this job.');
  if (f.size > SHEET_MAX_BYTES) throw new HttpError(400, TOO_BIG);
  return f;
}

/** A file of the request (its map or the map's sheet) through the request's own gate, as the caller: logged. */
async function authorized(client: Db, requestId: string, fileId: string): Promise<Authorized> {
  const f = (await rpc<Authorized[]>(client, 'authorize_ir_file', { p_request_id: requestId, p_file_id: fileId }))?.[0];
  if (!f) throw new HttpError(404, 'File not found');
  return f;
}

/** The passed, signed IR's signer (the request read as the caller), or null: no stamp before it passed. */
async function signedBy(client: Db, ctx: MapContext): Promise<Signed | null> {
  const row = await loadRequest(client, ctx.request_id);
  if (row.result !== 'approved' || !row.signed_at || !row.signed_by) return null;
  return { by: row.signed_by, at: row.signed_at, name: ctx.signer_name?.trim() || 'Inspector', irHash: row.content_hash };
}

async function bytesOf(service: Db, bucket: string, path: string, what: string): Promise<Uint8Array> {
  const { data, error } = await service.storage.from(bucket).download(path);
  if (error || !data) throw storageError(error ?? { message: 'no data' }, what);
  if (data.size > SHEET_MAX_BYTES) throw new HttpError(400, TOO_BIG);
  return new Uint8Array(await data.arrayBuffer());
}

/** The signer's own signature image (profile, private signatures bucket); PNG only, else the stamp prints the line. */
async function signatureOf(service: Db, userId: string): Promise<Uint8Array | null> {
  const p = must(await service.from('profiles').select('signature_path').eq('user_id', userId).maybeSingle(), 'signature lookup') as
    { signature_path: string | null } | null;
  if (!p?.signature_path) return null;
  const png = await bytesOf(service, 'signatures', p.signature_path, 'signature download');
  return png.length > 8 && png[0] === 0x89 && png[1] === 0x50 ? png : null;
}

/** The current map's file id: the one on file when it already shows exactly this, else a new version made now. */
async function ensureMap(client: Db, service: Db, userId: string, ctx: MapContext): Promise<string> {
  if (ctx.strokes.length === 0) throw new HttpError(400, 'Mark the walls first.');
  const signed = await signedBy(client, ctx);
  const title = mapTitle({ number: ctx.number, ofsNumber: ctx.ofs_number, phase: ctx.phase, requestDate: ctx.request_date, what: ctx.what });
  const hash = await contentHash({
    kind: 'ir_map', request_id: ctx.request_id, sheet_file_id: ctx.sheet_file_id, page: ctx.page, strokes: ctx.strokes,
    title, legend: ctx.legend, signed: signed && { by: signed.by, at: signed.at, ir_content_hash: signed.irHash },
  });
  const onFile = must(
    await service.from('ir_maps').select('content_hash, map_file_id').eq('request_id', ctx.request_id).maybeSingle(),
    'map lookup',
  ) as { content_hash: string | null; map_file_id: string | null } | null;
  const attach = (fileId: string) =>
    rpc(service, 'ir_map_attach', { p_request_id: ctx.request_id, p_file_id: fileId, p_content_hash: hash, p_signed: signed !== null });
  if (onFile?.map_file_id && onFile.content_hash === hash) {
    // Same picture as the map on file: it stays the map, and recording it again clears "out of date".
    if (ctx.stale) await attach(onFile.map_file_id);
    return onFile.map_file_id;
  }

  const sheet = await sheetFile(service, ctx);
  if (sheet.scan_status === 'infected') throw new HttpError(403, 'infected');
  // A server-made map is stored clean, so it is made only from a sheet already scanned clean.
  if (sheet.scan_status !== 'clean') throw new HttpError(409, 'The sheet is still being scanned. Try again in a minute.');
  const bytes = await bytesOf(service, 'files', sheet.storage_path, 'sheet download');
  if (!looksLikePdf(bytes)) throw new HttpError(400, 'The sheet is not a PDF.');

  const job = must(await client.from('projects').select('name, timezone').eq('id', ctx.project_id).single(), 'project') as
    { name: string; timezone: string };
  const pdf = await buildIrMap({
    sheet: bytes, page: ctx.page, strokes: ctx.strokes, title, legend: ctx.legend,
    stamp: signed && {
      signaturePng: await signatureOf(service, signed.by), name: pdfSafe(signed.name), signedAtLabel: signedAtLabel(signed.at, job.timezone),
    },
  }).catch((e: unknown) => {
    // A sheet pdf-lib can't read (locked, damaged, no such page) is the person's file, not our failure.
    if (e instanceof SheetError) throw new HttpError(400, e.message);
    throw e;
  });
  const folderId = await rpc<string>(service, 'ir_folder_make', { p_project_id: ctx.project_id, p_which: 'reports' });
  const name = buildFilename('IR {#} Map {Project} {MM-DD-YYYY}.pdf', { number: ctx.number, date: ctx.request_date, fields: { Project: job.name } });
  const stored = await storeGeneratedPdf(service, {
    projectId: ctx.project_id, folderId, name, bytes: pdf, createdBy: userId, replaces: onFile?.map_file_id ?? ctx.map_file_id,
  });
  await attach(stored.id);
  return stored.id;
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

  const fileId = await ensureMap(client, service, user.id, ctx);
  if (body.action === 'render') return ok(req, { file_id: fileId });
  const f = await authorized(client, ctx.request_id, fileId);
  const url = body.action === 'view'
    ? await signedViewUrl(service, f.storage_path)
    : await signedDownloadUrl(service, 'files', f.storage_path, f.original_name);
  return ok(req, { file_id: fileId, url, filename: f.original_name });
}));
