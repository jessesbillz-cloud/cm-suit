// e2e mock of the revs request side (0056), with the database's rules in short form: the status of every wall x item
// (na > signed off before, 0082 > passed > requested > failed > open), the revs request (1 to 3 items, walls of one
// list, passed and N/A cells skipped, colors by item order, an OFS request numbered like any), the map (the requester
// before a result, or whoever decides the request now; never once signed; a version check) and the results per cell (the deputy's, once the
// request is with OFS: 0061). The requests themselves live in mock/inspections, read as the signed-in mock user may
// (the status counts every request, as rev_status does); the map PDF is server-only, so a render here answers a
// stand-in file id.
import { conflictError } from '../errors';
import { FunctionError } from '../functions';
import type { Tables } from '../database.types';
import type { IrRef } from '../inspections.mutations';
import type { IrRequest, IrRowRaw } from '../inspections.types';
import type { IrMapContext, IrRevItem, IrStroke, NewOfsRequest, RevResult, RevStatusRow } from '../revs.types';
import { mockUser } from './index';
import * as mockIr from './inspections';
import { decideCap, holds } from './irRules';
import { fail, has, read, write, type RevMockState } from './revs';
import { signoffOf } from './revWalls';

type Cell = Tables<'ir_rev_items'>;

async function requestsOf(projectId: string): Promise<Map<string, IrRequest>> {
  const rows = await mockIr.serverList(projectId, (r) => r.status !== 'withdrawn' && r.deleted_at === null);
  return new Map(rows.map((r) => [r.id, r]));
}

function latest<T>(rows: T[], key: (r: T) => string): T | undefined {
  return [...rows].sort((a, b) => key(b).localeCompare(key(a)))[0];
}

/** rev_status in short form. */
export async function status(projectId: string): Promise<RevStatusRow[]> {
  if (!has('revs.read')) throw fail("You don't have access to that.", '42501');
  const s = read();
  const reqs = await requestsOf(projectId);
  const lists = new Set(s.lists.filter((l) => l.project_id === projectId && l.deleted_at === null).map((l) => l.id));
  const revs = s.revs.filter((r) => lists.has(r.list_id) && r.deleted_at === null);
  const out: RevStatusRow[] = [];
  for (const a of s.areas.filter((x) => lists.has(x.list_id) && x.deleted_at === null)) {
    for (const rev of revs.filter((r) => r.list_id === a.list_id)) {
      for (const i of s.items.filter((x) => x.rev_id === rev.id && x.deleted_at === null)) {
        out.push(cellStatus(s, reqs, a.id, i.id));
      }
    }
  }
  return out;
}

function cellStatus(s: RevMockState, reqs: Map<string, IrRequest>, areaId: string, itemId: string): RevStatusRow {
  const empty = { area_id: areaId, item_id: itemId, request_id: null, ir_number: null, ofs_number: null, at: null, note: null };
  const mark = s.marks.find((m) => m.area_id === areaId && m.item_id === itemId && m.deleted_at === null);
  if (mark) return { ...empty, status: 'na', at: mark.updated_at };
  const live = s.cells.filter((c) => c.area_id === areaId && c.item_id === itemId && reqs.has(c.request_id));
  // Signed off before the app (0082), unless an in-app request on it is newer.
  const before = signoffOf(s, areaId, itemId, live.map((c) => c.created_at));
  if (before) {
    const at = before.signed_on === null ? null : `${before.signed_on}T19:00:00Z`;
    return { ...empty, status: 'passed', ofs_number: before.ofs_number, at, note: before.note };
  }
  const of = (c: Cell) => {
    const q = reqs.get(c.request_id);
    return { request_id: c.request_id, ir_number: q?.number ?? null, ofs_number: q?.ofs_number ?? null };
  };
  const passed = latest(live.filter((c) => c.result === 'passed'), (c) => c.result_at ?? '');
  if (passed) return { ...empty, ...of(passed), status: 'passed', at: passed.result_at, note: passed.result_note };
  const asked = latest(live.filter((c) => c.result === null), (c) => c.created_at);
  if (asked) {
    const q = reqs.get(asked.request_id);
    return { ...empty, ...of(asked), status: 'requested', at: q ? `${q.request_date}T${(q.start_time ?? '00:00').slice(0, 5)}:00` : null };
  }
  const last = latest(live.filter((c) => c.result !== null), (c) => c.result_at ?? '');
  if (last?.result === 'failed') return { ...empty, ...of(last), status: 'failed', at: last.result_at, note: last.result_note };
  return { ...empty, status: 'open' };
}

export async function cells(requestId: string): Promise<IrRevItem[]> {
  const request = await mockIr.request(requestId);
  if (!request) return [];
  return read().cells.filter((c) => c.request_id === requestId).sort((a, b) => a.color - b.color);
}

/** ir_map_context; `asServer`: as the link's own function reads it (a request by its receipt). */
export async function mapContext(requestId: string, asServer = false): Promise<IrMapContext> {
  const q = asServer ? await mockIr.serverRequest(requestId) : await mockIr.request(requestId);
  const s = read();
  const m = s.maps.find((x) => x.request_id === requestId);
  if (!q || !m) throw fail('That item no longer exists.', 'P0002');
  const mine = s.cells.filter((c) => c.request_id === requestId);
  const itemName = (id: string) => s.items.find((i) => i.id === id)?.name ?? '';
  const legend = [...new Map(mine.map((c) => [c.color, itemName(c.item_id)])).entries()]
    .sort(([a], [b]) => a - b)
    .map(([color, name]) => ({ color: color as 1 | 2 | 3, name }));
  const areas = s.areas.filter((a) => mine.some((c) => c.area_id === a.id));
  const levels = [...new Set(areas.map((a) => a.level))].sort().join(', ');
  const listId = areas[0]?.list_id;
  return {
    request_id: q.id, project_id: q.project_id, number: q.number, ofs_number: q.ofs_number,
    phase: s.lists.find((l) => l.id === listId)?.phase ?? null, request_date: q.request_date,
    what: [levels, legend.map((l) => l.name).join(' & ')].filter((x) => x !== '').join(' '),
    sheet_file_id: m.sheet_file_id, page: m.page, strokes: m.strokes as IrStroke[], legend, result: q.result,
    signed_at: q.signed_at, signer_name: q.signed_at === null ? null : 'Sample Deputy', version: m.version,
    map_file_id: m.map_file_id, stale: m.stale, can_edit: q.signed_at === null && q.status !== 'withdrawn' && canDraw(q, mine),
  };
}

/** ir_map_editor: whoever decides the request now, or its requester until there is a result. */
function canDraw(q: IrRequest, mine: Cell[]): boolean {
  const me = mockUser().id;
  return holds(me, decideCap(q)) || (q.requested_by === me && q.result === null && mine.every((c) => c.result === null));
}

/** ir_submit_ofs in short form. */
export async function submit(v: NewOfsRequest): Promise<IrRowRaw> {
  if (!has('revs.read')) throw fail("You don't have access to that.", '42501');
  if (v.itemIds.length < 1 || v.itemIds.length > 3) throw fail('Pick 1 to 3 items.');
  if (v.areaIds.length < 1) throw fail('Pick 1 to 200 walls.');
  const s = read();
  const reqs = await requestsOf(v.projectId);
  const areas = s.areas.filter((a) => v.areaIds.includes(a.id) && a.deleted_at === null);
  const items = s.items.filter((i) => v.itemIds.includes(i.id) && i.deleted_at === null);
  const revOf = (i: Tables<'rev_items'>) => s.revs.find((r) => r.id === i.rev_id);
  const lists = new Set([...areas.map((a) => a.list_id), ...items.map((i) => revOf(i)?.list_id)]);
  if (lists.size !== 1 || areas.length !== v.areaIds.length || items.length !== v.itemIds.length) {
    throw fail('Pick the walls and items from one list.');
  }
  const open = areas.flatMap((a) => items.map((i) => ({ a, i }))).filter(({ a, i }) => !['na', 'passed'].includes(cellStatus(s, reqs, a.id, i.id).status));
  if (open.length === 0) throw fail('Already passed.');
  const order = (i: Tables<'rev_items'>) => [revOf(i)?.number ?? 0, i.position] as const;
  const used = items
    .filter((i) => open.some((c) => c.i.id === i.id))
    .sort((x, y) => order(x)[0] - order(y)[0] || order(x)[1] - order(y)[1]);
  const walls = areas.filter((a) => open.some((c) => c.a.id === a.id)).sort((x, y) => x.level.localeCompare(y.level) || x.position - y.position);
  const text = `${[...new Set(walls.map((a) => a.level))].sort().join(', ')} · ${used.map((i) => i.name).join(' & ')} · ${walls.map((a) => a.name).join(', ')}`;
  const row = await mockIr.addOfsRequest({
    p_project_id: v.projectId, p_company: v.company, p_request_date: v.date, p_items: text, p_start_time: v.startTime,
    p_duration_kind: v.durationKind, p_duration_min: v.durationMin, p_attachment_ids: v.attachmentIds,
    p_notice_ack: v.noticeAck, p_special_required: v.specialRequired, p_inspector_ack: v.inspectorAck,
  });
  const now = new Date().toISOString();
  const me = mockUser().id;
  const added: Cell[] = open.map(({ a, i }, k) => ({
    id: `mock-ir-rev-item-${row.id}-${String(k)}`, created_at: now, updated_at: now, created_by: me, version: 1, org_id: row.org_id,
    project_id: row.project_id, request_id: row.id, area_id: a.id, item_id: i.id, color: used.indexOf(i) + 1, result: null,
    result_note: null, result_at: null, result_by: null,
  }));
  const sheet = v.sheetFileId ?? walls.find((a) => a.sheet_file_id !== null)?.sheet_file_id ?? null;
  // The page of the first wall on that sheet, one drawn on the plan first (0059).
  const onSheet = walls.filter((a) => a.sheet_file_id === sheet);
  const page = (onSheet.find((a) => a.geom !== null) ?? onSheet[0])?.sheet_page ?? 1;
  write((x) => ({
    ...x,
    cells: [...x.cells, ...added],
    maps: [...x.maps, {
      request_id: row.id, org_id: row.org_id, project_id: row.project_id, created_at: now, updated_at: now, updated_by: me,
      version: 1, sheet_file_id: sheet, page, strokes: [], map_file_id: null, content_hash: null, signed: false, stale: true,
    }],
  }));
  return row;
}

/** ir_map_save in short form. */
export async function saveMap(v: { requestId: string; version: number; strokes: IrStroke[]; sheetFileId: string | null; page: number | null }): Promise<Tables<'ir_maps'>> {
  const q = await mockIr.request(v.requestId);
  const s = read();
  const m = s.maps.find((x) => x.request_id === v.requestId);
  if (!q || !m) throw fail('That item no longer exists.', 'P0002');
  if (!canDraw(q, s.cells.filter((c) => c.request_id === v.requestId))) throw fail("You don't have access to that.", '42501');
  if (q.signed_at !== null) throw fail('This IR is signed.');
  if (m.version !== v.version) throw conflictError();
  const colors = Math.max(0, ...s.cells.filter((c) => c.request_id === v.requestId).map((c) => c.color));
  if (v.strokes.some((st) => st.c > colors)) throw fail("Use the request's colors.");
  const sheet = v.sheetFileId ?? m.sheet_file_id;
  if (sheet === null && v.strokes.length > 0) throw fail('Pick the sheet first.');
  const next: Tables<'ir_maps'> = {
    ...m, sheet_file_id: sheet, page: v.page ?? m.page, strokes: v.strokes, stale: true, version: m.version + 1,
    updated_at: new Date().toISOString(), updated_by: mockUser().id,
  };
  write((x) => ({ ...x, maps: x.maps.map((r) => (r.request_id === next.request_id ? next : r)) }));
  return next;
}

/** The ir-map function in the mock: no PDF is made; the map counts as rendered (with the signature when signed).
 *  `asServer`: for the link, by a request's receipt. */
export async function renderMap(requestId: string, asServer = false): Promise<{ file_id: string }> {
  const q = asServer ? await mockIr.serverRequest(requestId) : await mockIr.request(requestId);
  const map = read().maps.find((m) => m.request_id === requestId);
  if (!q || !map) throw fail('That item no longer exists.', 'P0002');
  // ir-map's own refusals (400).
  if (map.sheet_file_id === null) throw new FunctionError(400, 'bad_request', 'Pick the sheet first.', null, null);
  if (!Array.isArray(map.strokes) || map.strokes.length === 0) {
    throw new FunctionError(400, 'bad_request', 'Mark the walls first.', null, null);
  }
  const fileId = `mock-ir-map-${requestId}`;
  write((x) => ({
    ...x,
    maps: x.maps.map((m) => (m.request_id === requestId
      ? { ...m, map_file_id: fileId, content_hash: 'sample', stale: false, signed: q.signed_at !== null && q.result === 'approved' }
      : m)),
  }));
  return { file_id: fileId };
}

/** ir_rev_results in short form: whoever decides the request now (never the inspector on an OFS request); every cell
 *  once, failed says why; the request's result through ir_set_result. */
export async function setResults(row: IrRef, results: RevResult[] | null): Promise<IrRowRaw> {
  if (mockIr.decider(row.id, row.version).status === 'postponed') throw fail('Confirm it again first.');
  const s = read();
  const mine = s.cells.filter((c) => c.request_id === row.id);
  if (results !== null) {
    const keys = new Set(results.map((r) => `${r.area_id}|${r.item_id}`));
    if (keys.size !== results.length || results.length !== mine.length || mine.some((c) => !keys.has(`${c.area_id}|${c.item_id}`))) {
      throw fail('Record every wall.');
    }
    if (results.some((r) => r.result === 'failed' && (r.note ?? '').trim() === '')) throw fail('Write why it failed.');
  }
  const now = new Date().toISOString();
  const pick = (c: Cell) => results?.find((r) => r.area_id === c.area_id && r.item_id === c.item_id) ?? null;
  const next = s.cells.map((c) => {
    if (c.request_id !== row.id) return c;
    const r = pick(c);
    return { ...c, result: r?.result ?? null, result_note: r?.note?.trim() || null, result_at: r ? (c.result === r.result ? c.result_at : now) : null, result_by: r ? mockUser().id : null };
  });
  const failed = next.filter((c) => c.request_id === row.id && c.result === 'failed');
  const name = (id: string, list: { id: string; name: string }[]) => list.find((x) => x.id === id)?.name ?? '';
  const note = failed.map((c) => `${name(c.area_id, s.areas)} · ${name(c.item_id, s.items)}: ${c.result_note ?? ''}`).join('\n');
  const result = results === null ? null : failed.length > 0 ? 'not_approved' : 'approved';
  const photos = (await mockIr.request(row.id))?.result_photo_ids ?? [];
  const saved = await mockIr.rpc('ir_set_result', {
    p_request_id: row.id, p_version: row.version, p_result: result, p_note: note === '' ? null : note, p_photo_ids: photos,
  });
  write((x) => ({ ...x, cells: next, maps: x.maps.map((m) => (m.request_id === row.id ? { ...m, stale: true } : m)) }));
  return saved;
}
