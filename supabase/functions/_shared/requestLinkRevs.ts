// The request link's revs and map contract (SPEC §6.4 #4, §13.2; migration 0057): what the revs actions may carry and
// what their answers may contain. Pure (no I/O), so the whitelist is unit-tested (requestLinkRevs_test.ts). The SQL side
// (link_request_revs, link_request_map*) returns only these fields; the function passes everything through these
// projections as well, so a later change to the SQL can never widen what a link visitor sees.
//   revs          by the job's link token: the job's lists, revs, items and walls, and each wall x item's status only;
//   submit        (multipart, like 0055's) with `area_ids` / `item_ids`: the revs request (an OFS request);
//   map, map_save, sheet, map_render, map_download   by a request's private receipt: that request's map only.
import { parseText, uuid, z } from './validate.ts';
import {
  CONTACT_RULE,
  hasContact,
  job,
  LENGTH_RULE,
  lengthFits,
  ReadinessBody,
  RequestLinkBody,
  SubmitBody,
  type SubmitRequest,
  token,
  visitorFields,
} from './requestLink.ts';
import { STROKE_LIMITS } from './markup.ts';

/** Every JSON action but a map save stays this small (0055's cap). */
export const REQUEST_MAX_BYTES = 4096;
/** A map save carries the strokes: plenty for a highlighted sheet, far under what a phone could send by mistake. */
export const MAP_SAVE_MAX_BYTES = 2 * 1024 * 1024;

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const color = z.union([z.literal(1), z.literal(2), z.literal(3)]);
const point = z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)]);

/** The highlighter strokes as the database checks them (ir_map_strokes_ok): up to 300, 2..2000 points each. */
const strokes = z
  .array(
    z.object({ c: color, w: z.number().min(STROKE_LIMITS.minWidth).max(STROKE_LIMITS.maxWidth), p: z.array(point).min(2).max(2000) })
      .strict(),
  )
  .max(STROKE_LIMITS.maxStrokes);

const receipt = { project_id: uuid, receipt: token };

/** The job's walls for the revs request: by the job's link token (or a hub's). */
const RevsBody = z.object({ action: z.literal('revs'), ...job }).strict();

const MapBodies = [
  /** The visitor's map: title parts, legend, sheet, strokes, whether they may draw. */
  z.object({ action: z.literal('map'), ...receipt }).strict(),
  /** Draws (the strokes as they are now; a new sheet / page or null = keep), version-checked. */
  z.object({
    action: z.literal('map_save'),
    ...receipt,
    version: z.number().int().min(1),
    strokes,
    sheet_file_id: uuid.nullable(),
    page: z.number().int().min(1).max(2000).nullable(),
  }).strict(),
  /** A short-lived URL of the map's sheet, for the sheet viewer. */
  z.object({ action: z.literal('sheet'), ...receipt }).strict(),
  /** Makes the map PDF (or keeps the one on file when it shows exactly this). */
  z.object({ action: z.literal('map_render'), ...receipt }).strict(),
  /** The map PDF to save, with its filename. */
  z.object({ action: z.literal('map_download'), ...receipt }).strict(),
] as const;

/** Every JSON action of request-link: 0055's and these. A submit is a multipart form, never JSON. */
export const LinkBody = z.discriminatedUnion('action', [...RequestLinkBody.options, RevsBody, ...MapBodies]);
export type LinkRequest = z.infer<typeof LinkBody>;

const MAP_ACTIONS = ['map', 'map_save', 'sheet', 'map_render', 'map_download'] as const;
export type MapRequest = Extract<LinkRequest, { action: (typeof MAP_ACTIONS)[number] }>;

/** A request's map action: by its receipt, never the link token. */
export function isMapRequest(b: LinkRequest): b is MapRequest {
  return (MAP_ACTIONS as readonly string[]).includes(b.action);
}

/** The revs request from the link: the visitor's fields and the walls and items (the database composes the rest). */
export const SubmitOfsBody = z
  .object({
    action: z.literal('submit'),
    ...job,
    ...visitorFields,
    area_ids: z.array(uuid).min(1).max(200),
    item_ids: z.array(uuid).min(1).max(3),
    /** One of the picked walls' sheets, or null for the first wall's. */
    sheet_file_id: uuid.nullable(),
    /** The readiness checklist (0061): all five. */
    readiness: ReadinessBody,
  })
  .strict()
  .refine(hasContact, CONTACT_RULE)
  .refine(lengthFits, LENGTH_RULE);
export type SubmitOfsRequest = z.infer<typeof SubmitOfsBody>;

export type SentRequest = { ofs: false; body: SubmitRequest } | { ofs: true; body: SubmitOfsRequest };

/** A submit form's payload: the revs request when it names walls, else 0055's request. Each strict (400 otherwise). */
export function submitPayload(text: string): SentRequest {
  const raw = parseText(text, z.record(z.unknown()));
  return 'area_ids' in raw ? { ofs: true, body: parseText(text, SubmitOfsBody) } : { ofs: false, body: parseText(text, SubmitBody) };
}

const Revs = z.object({
  lists: z.array(z.object({ id: uuid, name: z.string(), phase: z.string().nullable(), position: z.number().int() })),
  revs: z.array(z.object({ id: uuid, list_id: uuid, number: z.number().int(), name: z.string() })),
  items: z.array(z.object({ id: uuid, rev_id: uuid, name: z.string(), company: z.string().nullable(), position: z.number().int() })),
  areas: z.array(z.object({
    id: uuid, list_id: uuid, level: z.string(), name: z.string(), sheet_file_id: uuid.nullable(), position: z.number().int(),
  })),
  /** Status only: a failed cell is open to the link (never why, never a number, a date or a name). */
  status: z.array(z.object({ area_id: uuid, item_id: uuid, status: z.enum(['open', 'requested', 'passed', 'na']) })),
});
export type RevsAnswer = z.infer<typeof Revs>;

/** The visitor's own map: never the signer, the request's or the job's ids, or the PDF's file. */
const LinkMap = z.object({
  number: z.number().int(),
  ofs_number: z.number().int().nullable(),
  phase: z.string().nullable(),
  request_date: day,
  what: z.string(),
  sheet_file_id: uuid.nullable(),
  page: z.number().int().min(1),
  strokes,
  legend: z.array(z.object({ color, name: z.string() })).max(3),
  result: z.enum(['approved', 'not_approved']).nullable(),
  signed: z.boolean(),
  version: z.number().int(),
  /** A map PDF is made (map_download answers it, made again first when out of date). */
  has_map: z.boolean(),
  stale: z.boolean(),
  /** May the visitor draw now: until the inspector records a result. */
  can_edit: z.boolean(),
  /** The request's walls' sheets the map may switch to, by level. */
  sheets: z.array(z.object({ file_id: uuid, label: z.string() })),
});
/** null: the request has no walls (not a revs request), so no map. */
const MapAnswer = z.object({ map: LinkMap.nullable() });
export type MapAnswer = z.infer<typeof MapAnswer>;

/** What link_request_map_file answers the function (never sent as is: the function signs a URL from it). */
const MapFile = z.object({ storage_path: z.string().min(1), original_name: z.string().min(1), mime: z.string() });
export type MapFile = z.infer<typeof MapFile>;

export function revsAnswer(raw: unknown): RevsAnswer {
  return Revs.parse(raw);
}

export function mapAnswer(raw: unknown): MapAnswer {
  return MapAnswer.parse(raw);
}

export function mapFileOf(raw: unknown): MapFile {
  return MapFile.parse(raw);
}

const IPV4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;

/** Up to 8 groups of up to 4 hex digits, at most one "::" standing for the missing ones. */
function isIpv6(v: string): boolean {
  const groups = v.split(':');
  const gaps = v.split('::').length - 1;
  if (groups.length < 3 || groups.length > 8 || gaps > 1 || v.includes(':::')) return false;
  return groups.every((g) => /^[0-9a-fA-F]{0,4}$/.test(g)) && (gaps === 1 || groups.every((g) => g !== ''));
}

/** The visitor's address for the download line, or null when it doesn't look like one (never a database error). */
export function ipOrNull(ip: string | null): string | null {
  const v = (ip ?? '').trim();
  return IPV4.test(v) || isIpv6(v) ? v : null;
}
