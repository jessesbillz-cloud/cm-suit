// request-link's revs actions (migration 0057; SPEC §6.4 #4): the job's walls by the link token, and a request's map by
// its private receipt. Every database step is a service-role-only link_request_* function that checks the credential
// itself and answers null when it opens nothing; the receipt reaches that one request's map and its sheet, nothing else.
//   revs          link_request_revs → the lists, revs, items, walls and each cell's status only.
//   map           link_request_map → the visitor's map (or {map: null}: a request without walls).
//   map_save      link_request_map_save → ir_map_save's rules until a result is recorded → the map.
//   sheet         link_request_map_facts → the sheet's row (same job, at most 40 MB) → link_request_map_file('sheet')
//                 (scan rules, a download line) → a 10-minute URL without the download header (the sheet viewer).
//   map_render    link_request_map_facts → ensureMap (_shared/irMapFile.ts, the one way ir-map makes it too) → the map.
//   map_download  as map_render → link_request_map_file('map') (a download line) → a 10-minute download URL.
// The signer and the job for the map's stamp and filename are read with the service key after the receipt opened the
// request. Rate limits per receipt (and per address for the PDF work) on top of index.ts' per-address limit.
import { HttpError, ok } from '../_shared/http.ts';
import { type Db, must, publicRpc, signedDownloadUrl, signedViewUrl } from '../_shared/db.ts';
import { limit } from '../_shared/ratelimit.ts';
import { sha256Hex } from '../_shared/crypto.ts';
import { loadRequest } from '../_shared/inspections.ts';
import { ensureMap, type MapFacts, mapFactsSchema, type MapJob, sheetFile, signerOf } from '../_shared/irMapFile.ts';
import { ipOrNull, mapAnswer, type MapAnswer, mapFileOf, type MapFile, type MapRequest, revsAnswer } from '../_shared/requestLinkRevs.ts';

const GONE = 'That request is not available.';

// A type alias (not an interface) so it fits publicRpc's argument record.
export type LinkArgs = {
  p_project_id: string;
  p_token_hash: string;
  p_hub_id: string | null;
};

type ReceiptArgs = {
  p_project_id: string;
  p_receipt_hash: string;
};

/** The job's walls for the revs request. */
export async function revs(req: Request, service: Db, link: LinkArgs, notActive: string): Promise<Response> {
  const raw = await publicRpc<unknown>(service, 'link_request_revs', link);
  if (raw === null) throw new HttpError(404, notActive);
  return ok(req, revsAnswer(raw));
}

async function mapOf(service: Db, fn: 'link_request_map' | 'link_request_map_save', args: Record<string, unknown>): Promise<MapAnswer> {
  const raw = await publicRpc<unknown>(service, fn, args);
  if (raw === null) throw new HttpError(404, GONE);
  return mapAnswer(raw);
}

/** What the PDF needs (never sent to the visitor). */
async function factsOf(service: Db, at: ReceiptArgs): Promise<MapFacts> {
  const raw = await publicRpc<unknown>(service, 'link_request_map_facts', at);
  if (raw === null) throw new HttpError(404, GONE);
  return mapFactsSchema.parse(raw);
}

/** The map's sheet or PDF through the receipt's own gate: scan rules, a download line with the visitor's address. */
async function fileOf(service: Db, at: ReceiptArgs, which: 'sheet' | 'map', ip: string): Promise<MapFile> {
  const raw = await publicRpc<unknown>(service, 'link_request_map_file', { ...at, p_which: which, p_ip: ipOrNull(ip) });
  if (raw === null) throw new HttpError(404, GONE);
  return mapFileOf(raw);
}

/** The map PDF on file for these facts (made now when out of date). No member behind it: stored with no creator. */
async function madeMap(service: Db, facts: MapFacts): Promise<string> {
  const row = await loadRequest(service, facts.request_id);
  const signed = signerOf(row, facts.signer_name);
  const job = must(await service.from('projects').select('name, timezone').eq('id', facts.project_id).single(), 'project') as MapJob;
  return await ensureMap(service, facts, { createdBy: null, signed, job, kind: row.kind });
}

/** Building a map reads the whole sheet: a few an hour per request, and per address. */
async function pdfLimits(service: Db, key: string, ip: string): Promise<void> {
  await limit(service, `request-link:render:${key}`, 10, 10 / 3600);
  await limit(service, `request-link:render-ip:${ip}`, 20, 20 / 3600);
}

export async function mapAction(req: Request, service: Db, ip: string, body: MapRequest): Promise<Response> {
  const receiptHash = await sha256Hex(body.receipt);
  // Keyed by the hash, never the raw receipt.
  const key = receiptHash.slice(0, 32);
  const at: ReceiptArgs = { p_project_id: body.project_id, p_receipt_hash: receiptHash };
  switch (body.action) {
    case 'map':
      await limit(service, `request-link:map:${key}`, 120, 0.5);
      return ok(req, await mapOf(service, 'link_request_map', at));
    case 'map_save':
      // Drawing saves often; the same bucket as reading the map.
      await limit(service, `request-link:map:${key}`, 120, 0.5);
      return ok(req, await mapOf(service, 'link_request_map_save', {
        ...at, p_version: body.version, p_strokes: body.strokes, p_sheet_file_id: body.sheet_file_id, p_page: body.page,
      }));
    case 'sheet': {
      await limit(service, `request-link:sheet:${key}`, 30, 30 / 3600);
      await sheetFile(service, await factsOf(service, at));
      const f = await fileOf(service, at, 'sheet', ip);
      return ok(req, { url: await signedViewUrl(service, f.storage_path) });
    }
    case 'map_render':
      await pdfLimits(service, key, ip);
      await madeMap(service, await factsOf(service, at));
      return ok(req, await mapOf(service, 'link_request_map', at));
    case 'map_download': {
      await pdfLimits(service, key, ip);
      await madeMap(service, await factsOf(service, at));
      const f = await fileOf(service, at, 'map', ip);
      return ok(req, { url: await signedDownloadUrl(service, 'files', f.storage_path, f.original_name), filename: f.original_name });
    }
  }
}
