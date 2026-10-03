// Revs (migration 0056): a job's lists of fire-rated wall stages (revs), their items, the walls (areas) and N/A marks;
// the status of every wall x item; an OFS request's cells and its map. Table reads are typed by the generated types;
// RPC answers whose shapes the generator can't type (jsonb, nullable table columns) are parsed with zod here, so a
// changed contract fails loudly at the boundary. liveSetup is the one place removed rows are dropped.
import { z } from 'zod';
import type { Tables } from './database.types';

export const REV_LIST_COLS = 'id, project_id, name, phase, permit_id, position, version, deleted_at';
export const REV_COLS = 'id, project_id, list_id, number, name, version, deleted_at';
export const REV_ITEM_COLS = 'id, project_id, rev_id, name, company, position, version, deleted_at';
export const REV_AREA_COLS = 'id, project_id, list_id, level, name, sheet_file_id, sheet_page, geom, position, version, deleted_at';
export const REV_MARK_COLS = 'id, project_id, area_id, item_id, kind, version, deleted_at';
export const IR_REV_ITEM_COLS = 'id, request_id, area_id, item_id, color, result, result_note, result_at, result_by, version';

export type RevList = Pick<Tables<'rev_lists'>, 'id' | 'project_id' | 'name' | 'phase' | 'permit_id' | 'position' | 'version' | 'deleted_at'>;
export type Rev = Pick<Tables<'revs'>, 'id' | 'project_id' | 'list_id' | 'number' | 'name' | 'version' | 'deleted_at'>;
export type RevItem = Pick<Tables<'rev_items'>, 'id' | 'project_id' | 'rev_id' | 'name' | 'company' | 'position' | 'version' | 'deleted_at'>;
type RevAreaRow = Pick<
  Tables<'rev_areas'>,
  'id' | 'project_id' | 'list_id' | 'level' | 'name' | 'sheet_file_id' | 'sheet_page' | 'geom' | 'position' | 'version' | 'deleted_at'
>;

/**
 * A wall's line on its plan sheet (0059): 2 to 50 points [x, y], fractions 0..1 of the sheet page (`sheet_page`) as it
 * is viewed, origin top-left (the map strokes' frame). Checked by the database; parsed here so a bad one fails loudly.
 */
export const wallLineSchema = z
  .array(z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)]))
  .min(2)
  .max(50);
export type WallLine = [number, number][];

/** A wall: its level, name and sheet, and its line on that sheet's page (null: not on the plan). */
export type RevArea = Omit<RevAreaRow, 'geom'> & { geom: WallLine | null };

/** A wall row as the database answers it (geom is JSON), with its line parsed. */
export function parseArea<T extends RevAreaRow>(row: T): Omit<T, 'geom'> & { geom: WallLine | null } {
  return { ...row, geom: row.geom === null ? null : wallLineSchema.parse(row.geom) };
}
export type RevMark = Pick<Tables<'rev_marks'>, 'id' | 'project_id' | 'area_id' | 'item_id' | 'kind' | 'version' | 'deleted_at'>;
export type IrRevItem = Pick<
  Tables<'ir_rev_items'>,
  'id' | 'request_id' | 'area_id' | 'item_id' | 'color' | 'result' | 'result_note' | 'result_at' | 'result_by' | 'version'
>;

/** A job's whole setup: what useRevSetup answers (live rows only, in order). */
export interface RevSetup {
  lists: RevList[];
  revs: Rev[];
  items: RevItem[];
  areas: RevArea[];
  marks: RevMark[];
}

/** What rev_list_create takes: the pasted legend, parsed in the browser. */
export interface LegendRev {
  number: number;
  name: string;
  items: { name: string; company: string | null }[];
}

/** What rev_remove / rev_restore take. */
export type RevKind = 'list' | 'rev' | 'item' | 'area';

/** What rev_remove / rev_restore answer: the row (as JSON); the version is what Undo sends back. */
export const revRemovedSchema = z.object({ id: z.string(), version: z.number().int(), deleted_at: z.string().nullable() }).passthrough();
export type RevRemoved = z.infer<typeof revRemovedSchema>;

const REV_STATUSES = ['na', 'passed', 'requested', 'failed', 'open'] as const;

/** One wall x item (rev_status). request / numbers / at: the request that decides it; note: why it failed. */
export const revStatusRowSchema = z.object({
  area_id: z.string(),
  item_id: z.string(),
  status: z.enum(REV_STATUSES),
  request_id: z.string().nullable(),
  ir_number: z.number().int().nullable(),
  ofs_number: z.number().int().nullable(),
  at: z.string().nullable(),
  note: z.string().nullable(),
});
export type RevStatusRow = z.infer<typeof revStatusRowSchema>;

/** A map color index (lib/markup MARKUP_COLORS): one per item on a request, by item order. */
const colorSchema = z.union([z.literal(1), z.literal(2), z.literal(3)]);

/** One highlighter stroke: x, y as fractions of the sheet page (origin top-left), w as a fraction of its width. */
const irStrokeSchema = z
  .object({
    c: colorSchema,
    w: z.number().min(0.002).max(0.05),
    p: z.array(z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)])).min(2).max(2000),
  })
  .strict();
export type IrStroke = z.infer<typeof irStrokeSchema>;
export const irStrokesSchema = z.array(irStrokeSchema).max(300);

/** ir_map_context: the map's title parts, legend, sheet, strokes and the rendered PDF's state. */
export const irMapContextSchema = z.object({
  request_id: z.string(),
  project_id: z.string(),
  number: z.number().int(),
  ofs_number: z.number().int().nullable(),
  phase: z.string().nullable(),
  request_date: z.string(),
  what: z.string(),
  sheet_file_id: z.string().nullable(),
  page: z.number().int(),
  strokes: irStrokesSchema,
  legend: z.array(z.object({ color: colorSchema, name: z.string() })),
  result: z.string().nullable(),
  signed_at: z.string().nullable(),
  signer_name: z.string().nullable(),
  version: z.number().int(),
  map_file_id: z.string().nullable(),
  stale: z.boolean(),
  /** May I draw on it now (the requester before a result, or an inspector; never once signed). */
  can_edit: z.boolean(),
});
export type IrMapContext = z.infer<typeof irMapContextSchema>;

/** ir-map's answer: the stored map PDF. */
export const irMapRenderSchema = z.object({ file_id: z.string() });

/** One cell's result for ir_rev_results (every cell of the request, each once; failed says why). */
export interface RevResult {
  area_id: string;
  item_id: string;
  result: 'passed' | 'failed';
  note: string | null;
}

/** What the revs request form sends (ir_submit_ofs). */
export interface NewOfsRequest {
  projectId: string;
  company: string;
  date: string;
  noticeAck: boolean;
  areaIds: string[];
  itemIds: string[];
  sheetFileId: string | null;
  /** "HH:mm", or null for Flexible. */
  startTime: string | null;
  durationKind: 'timed' | 'all_day' | 'periodic';
  durationMin: number | null;
  attachmentIds: string[];
}

function byPlace(a: { position: number; name: string; id: string }, b: { position: number; name: string; id: string }): number {
  return a.position - b.position || a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
}

/**
 * The live setup, in order: removed rows (a manager also reads them, for Undo) and everything under a removed list or
 * rev are dropped. Lists by place, revs by number, items by their rev then place, walls by place.
 */
export function liveSetup(raw: RevSetup): RevSetup {
  const lists = raw.lists.filter((l) => l.deleted_at === null).sort((a, b) => byPlace(a, b));
  const listOrder = new Map(lists.map((l, i) => [l.id, i]));
  const listIds = new Set(listOrder.keys());
  const revs = raw.revs
    .filter((r) => r.deleted_at === null && listOrder.has(r.list_id))
    .sort((a, b) => (listOrder.get(a.list_id) ?? 0) - (listOrder.get(b.list_id) ?? 0) || a.number - b.number || a.id.localeCompare(b.id));
  const revOrder = new Map(revs.map((r, i) => [r.id, i]));
  const items = raw.items
    .filter((i) => i.deleted_at === null && revOrder.has(i.rev_id))
    .sort((a, b) => (revOrder.get(a.rev_id) ?? 0) - (revOrder.get(b.rev_id) ?? 0) || byPlace(a, b));
  const areas = raw.areas
    .filter((a) => a.deleted_at === null && listIds.has(a.list_id))
    .sort((a, b) => (listOrder.get(a.list_id) ?? 0) - (listOrder.get(b.list_id) ?? 0) || byPlace(a, b));
  const itemIds = new Set(items.map((i) => i.id));
  const areaIds = new Set(areas.map((a) => a.id));
  const marks = raw.marks.filter((m) => m.deleted_at === null && areaIds.has(m.area_id) && itemIds.has(m.item_id));
  return { lists, revs, items, areas, marks };
}
