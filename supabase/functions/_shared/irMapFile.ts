// The OSFM inspection map's PDF on file (Revs, migrations 0056 and 0057): ONE way to make it, used by ir-map (a member,
// after ir_map_context ran as the caller) and by request-link (a link visitor, after the receipt-gated
// link_request_map_facts). The facts' content hash (sheet, page, strokes, title, legend, the permit number (0061), and
// on a passed and signed IR the signature) decides: the map on file already shows exactly that, so it is the answer;
// else the sheet's files row (same job, scanned clean, at most 40 MB) and bytes -> buildIrMap (pdf/irMap.ts; the
// deputy's signature and date through the ONE stamp) -> storeGeneratedPdf into the request's own folder (reportFolder
// in inspections.ts: an OFS request's map in Reports / OFS inspection reports, never among the inspector's IRs;
// `replaces` the previous map: its next version) -> ir_map_attach (service role only). The service client is the
// caller's (an allowlisted function); this module never makes one.
import { type Db, must, rpc, storageError } from './db.ts';
import { HttpError } from './http.ts';
import { z } from './validate.ts';
import { contentHash } from './crypto.ts';
import { buildFilename } from './buildFilename.ts';
import { storeGeneratedPdf } from './generatedPdf.ts';
import { buildIrMap, mapTitle, SheetError } from './pdf/irMap.ts';
import { pdfSafe } from './pdf/inspectionReport.ts';
import { type IrRow, reportFolder, signedAtLabel } from './inspections.ts';
import { looksLikePdf } from './permitStamp.ts';

/** Bigger than any single sheet; a whole set is refused before a byte is read. */
const SHEET_MAX_BYTES = 40 * 1024 * 1024;
const TOO_BIG = 'Upload the single sheet.';

/** A sheet the viewer and the map PDF read whole: at most SHEET_MAX_BYTES. */
export function checkSheetSize(size: number): void {
  if (size > SHEET_MAX_BYTES) throw new HttpError(400, TOO_BIG);
}

const color = z.union([z.literal(1), z.literal(2), z.literal(3)]);

/** What the map shows and the PDF draws: ir_map_facts (0057), as ir_map_context and link_request_map_facts answer it. */
export const mapFactsSchema = z.object({
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
  /** The number of the permit the request is on (0061), or none. */
  permit_number: z.string().nullish().transform((v) => v ?? null),
});
export type MapFacts = z.infer<typeof mapFactsSchema>;

/** Who signed a passed IR, for the stamp. */
export interface MapSigner {
  by: string;
  at: string;
  name: string;
  irHash: string | null;
}

/** The job's name (the filename) and zone (the signed date on the stamp). */
export interface MapJob {
  name: string;
  timezone: string;
}

/** The passed, signed IR's signer, or null: no stamp before it passed and was signed. */
export function signerOf(row: Pick<IrRow, 'result' | 'signed_at' | 'signed_by' | 'content_hash'>, signerName: string | null): MapSigner | null {
  if (row.result !== 'approved' || !row.signed_at || !row.signed_by) return null;
  return { by: row.signed_by, at: row.signed_at, name: signerName?.trim() || 'Inspector', irHash: row.content_hash };
}

/** OSFM's title for these facts. */
export function titleOf(facts: MapFacts): string {
  return mapTitle({ number: facts.number, ofsNumber: facts.ofs_number, phase: facts.phase, requestDate: facts.request_date, what: facts.what });
}

/** "Permit 24-0001" under the map's title, or none. */
export function permitLine(facts: Pick<MapFacts, 'permit_number'>): string | null {
  return facts.permit_number ? `Permit ${facts.permit_number}` : null;
}

/**
 * Everything the map PDF shows: its content hash says whether the map on file is still this picture. The permit only
 * when there is one, so a map made before 0061 keeps its hash.
 */
export function mapContent(facts: MapFacts, signed: MapSigner | null): Record<string, unknown> {
  return {
    kind: 'ir_map', request_id: facts.request_id, sheet_file_id: facts.sheet_file_id, page: facts.page, strokes: facts.strokes,
    title: titleOf(facts), legend: facts.legend, signed: signed && { by: signed.by, at: signed.at, ir_content_hash: signed.irHash },
    ...(facts.permit_number ? { permit: facts.permit_number } : {}),
  };
}

interface SheetFile {
  id: string;
  project_id: string;
  storage_path: string;
  size: number;
  scan_status: string;
}

/** The sheet's row, read with the service key after the caller passed its gate: a file of this job, one sheet. */
export async function sheetFile(service: Db, facts: MapFacts): Promise<SheetFile> {
  if (!facts.sheet_file_id) throw new HttpError(400, 'Pick the sheet first.');
  const f = must(
    await service.from('files').select('id, project_id, storage_path, size, scan_status').eq('id', facts.sheet_file_id)
      .is('deleted_at', null).maybeSingle(),
    'sheet lookup',
  ) as SheetFile | null;
  if (!f || f.project_id !== facts.project_id) throw new HttpError(404, 'The sheet is no longer in this job.');
  checkSheetSize(f.size);
  return f;
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

export interface MapMaker {
  /** The member the stored PDF belongs to; null for a link visitor (no member behind the request). */
  createdBy: string | null;
  signed: MapSigner | null;
  job: MapJob;
  /** The request's kind: it alone picks the folder the map is filed in (reportFolder). */
  kind: IrRow['kind'];
}

/** The current map's file id: the one on file when it already shows exactly this, else a new version made now. */
export async function ensureMap(service: Db, facts: MapFacts, made: MapMaker): Promise<string> {
  if (facts.strokes.length === 0) throw new HttpError(400, 'Mark the walls first.');
  const hash = await contentHash(mapContent(facts, made.signed));
  const onFile = must(
    await service.from('ir_maps').select('content_hash, map_file_id').eq('request_id', facts.request_id).maybeSingle(),
    'map lookup',
  ) as { content_hash: string | null; map_file_id: string | null } | null;
  const attach = (fileId: string) =>
    rpc(service, 'ir_map_attach', { p_request_id: facts.request_id, p_file_id: fileId, p_content_hash: hash, p_signed: made.signed !== null });
  if (onFile?.map_file_id && onFile.content_hash === hash) {
    // Same picture as the map on file: it stays the map, and recording it again clears "out of date".
    if (facts.stale) await attach(onFile.map_file_id);
    return onFile.map_file_id;
  }

  const sheet = await sheetFile(service, facts);
  if (sheet.scan_status === 'infected') throw new HttpError(403, 'This file is blocked.');
  // A server-made map is stored clean, so it is made only from a sheet already scanned clean.
  if (sheet.scan_status !== 'clean') throw new HttpError(409, 'The sheet is still being scanned. Try again in a minute.');
  const bytes = await bytesOf(service, 'files', sheet.storage_path, 'sheet download');
  if (!looksLikePdf(bytes)) throw new HttpError(400, 'The sheet is not a PDF.');

  const { signed, job } = made;
  const pdf = await buildIrMap({
    sheet: bytes, page: facts.page, strokes: facts.strokes, title: titleOf(facts), legend: facts.legend, permit: permitLine(facts),
    stamp: signed && {
      signaturePng: await signatureOf(service, signed.by), name: pdfSafe(signed.name), signedAtLabel: signedAtLabel(signed.at, job.timezone),
    },
  }).catch((e: unknown) => {
    // A sheet pdf-lib can't read (locked, damaged, no such page) is the person's file, not our failure.
    if (e instanceof SheetError) throw new HttpError(400, e.message);
    throw e;
  });
  // An OFS request's map goes in the OFS folder, apart from the inspector's IRs; no other request's ever does.
  const folderId = await rpc<string>(service, 'ir_folder_make', { p_project_id: facts.project_id, p_which: reportFolder(made) });
  const name = buildFilename('IR {#} Map {Project} {MM-DD-YYYY}.pdf', { number: facts.number, date: facts.request_date, fields: { Project: job.name } });
  const stored = await storeGeneratedPdf(service, {
    projectId: facts.project_id, folderId, name, bytes: pdf, createdBy: made.createdBy, replaces: onFile?.map_file_id ?? facts.map_file_id,
  });
  await attach(stored.id);
  return stored.id;
}
