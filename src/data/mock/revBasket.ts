// e2e mock of the request being built (0113) with the database's rules in short form: one basket per mock user and job
// for whoever files OFS requests on a job that takes them; Add skips cells asked for, passed, N/A or in already (a room:
// its walls); what Send files is one OFS request per item and sheet page (walls with no sheet: per level), in rev and
// item order, each with the next OFS number in turn; Send carries the version, files each through the revs request
// (mock/revRequests), types the numbers for whoever sends OFS requests, keeps the batch and empties the basket; the
// same Send again answers the same batch. State in sessionStorage (its own key), never module state.
import { parseProjectSettings } from '../../lib/settings';
import { conflictError } from '../errors';
import type { Basket, BasketChange, BasketSend, Batch } from '../revs.basket';
import { holder } from './duties';
import { mockUser } from './index';
import * as mockIr from './inspections';
import { forbidden, holds } from './irRules';
import { projectSettings } from './jobs';
import * as mockRequests from './revRequests';
import { read as readRooms } from './revRooms';
import { fail, has, read as readRevs } from './revs';
import { delay } from './store';

const KEY = 'e2e-mock-basket';

interface Stored {
  version: number;
  cells: { area_id: string; item_id: string }[];
  last: { version: number; batch: string } | null;
}

interface State {
  baskets: Record<string, Stored>;
  batches: { batch_id: string; request_ids: string[] }[];
}

function readState(): State {
  const raw = window.sessionStorage.getItem(KEY);
  return raw === null ? { baskets: {}, batches: [] } : (JSON.parse(raw) as State);
}

function writeState(s: State): void {
  window.sessionStorage.setItem(KEY, JSON.stringify(s));
}

const keyOf = (projectId: string) => `${projectId}|${mockUser().id}`;
const EMPTY: Stored = { version: 0, cells: [], last: null };

function mayBuild(projectId: string): boolean {
  return holds(mockUser().id, 'ir.request') && has('revs.read') && parseProjectSettings(projectSettings(projectId)).ir_ofs_allowed;
}

function mustBuild(projectId: string): void {
  if (!mayBuild(projectId)) throw forbidden();
}

const sender = (projectId: string) => holds(mockUser().id, 'ir.decide') || holder(projectId) === mockUser().id;

/** The cells still in it and still to ask for (open or failed). */
async function live(projectId: string, b: Stored): Promise<Stored['cells']> {
  const status = await mockRequests.status(projectId);
  const ok = new Set(status.filter((r) => r.status === 'open' || r.status === 'failed').map((r) => `${r.area_id}|${r.item_id}`));
  return b.cells.filter((c) => ok.has(`${c.area_id}|${c.item_id}`));
}

/** rev_basket_groups: per item and sheet page, in rev and item order, the walls in their order. */
function groupsOf(cells: Stored['cells']): { item_id: string; area_ids: string[] }[] {
  const s = readRevs();
  const out = new Map<string, { item_id: string; area_ids: string[]; order: [number, number, string] }>();
  for (const c of cells) {
    const a = s.areas.find((x) => x.id === c.area_id);
    const i = s.items.find((x) => x.id === c.item_id);
    if (!a || !i) continue;
    const rev = s.revs.find((r) => r.id === i.rev_id);
    const sheet = a.sheet_file_id === null ? `level:${a.level.trim().toLowerCase()}` : `${a.sheet_file_id}:${String(a.sheet_page)}`;
    const k = `${c.item_id}|${sheet}`;
    const g = out.get(k) ?? { item_id: c.item_id, area_ids: [], order: [rev?.number ?? 0, i.position, sheet] };
    g.area_ids.push(c.area_id);
    out.set(k, g);
  }
  const pos = (id: string) => s.areas.find((a) => a.id === id)?.position ?? 0;
  return [...out.values()]
    .sort((x, y) => x.order[0] - y.order[0] || x.order[1] - y.order[1] || x.order[2].localeCompare(y.order[2]))
    .map((g) => ({ item_id: g.item_id, area_ids: [...g.area_ids].sort((a, b) => pos(a) - pos(b)) }));
}

function nextOfs(projectId: string): number {
  return Math.max(0, ...mockIr.everyRequest().filter((r) => r.project_id === projectId).map((r) => r.ofs_number ?? 0)) + 1;
}

async function view(projectId: string, b: Stored): Promise<Basket> {
  const cells = await live(projectId, b);
  const next = nextOfs(projectId);
  return {
    version: b.version,
    cells,
    groups: groupsOf(cells).map((g, k) => ({ ...g, ofs_number: next + k })),
    may_number: sender(projectId),
  };
}

/** rev_basket_get */
export async function get(projectId: string): Promise<Basket> {
  await delay();
  mustBuild(projectId);
  return view(projectId, readState().baskets[keyOf(projectId)] ?? EMPTY);
}

function save(projectId: string, b: Stored): void {
  const s = readState();
  writeState({ ...s, baskets: { ...s.baskets, [keyOf(projectId)]: b } });
}

/** rev_basket_add: walls x items (a room: its walls), skipping what isn't to ask for or is in already. */
export async function add(projectId: string, areaIds: readonly string[], itemIds: readonly string[], roomId?: string): Promise<BasketChange> {
  await delay();
  mustBuild(projectId);
  const areas = roomId ? readRooms().walls.filter((w) => w.room_id === roomId && w.deleted_at === null).map((w) => w.area_id) : areaIds;
  if (areas.length === 0) throw fail('Pick 1 to 200 walls.');
  const b = readState().baskets[keyOf(projectId)] ?? EMPTY;
  const status = await mockRequests.status(projectId);
  const inIt = new Set(b.cells.map((c) => `${c.area_id}|${c.item_id}`));
  const fresh = status.filter(
    (r) => areas.includes(r.area_id) && itemIds.includes(r.item_id) && (r.status === 'open' || r.status === 'failed') && !inIt.has(`${r.area_id}|${r.item_id}`),
  );
  const next = fresh.length === 0 ? b : { ...b, version: b.version + 1, cells: [...b.cells, ...fresh.map((r) => ({ area_id: r.area_id, item_id: r.item_id }))] };
  save(projectId, next);
  return { ...(await view(projectId, next)), added: fresh.length };
}

/** rev_basket_remove */
export async function remove(projectId: string, areaIds: readonly string[], itemIds: readonly string[]): Promise<BasketChange> {
  await delay();
  mustBuild(projectId);
  const b = readState().baskets[keyOf(projectId)] ?? EMPTY;
  const keep = b.cells.filter((c) => !(areaIds.includes(c.area_id) && itemIds.includes(c.item_id)));
  const next = keep.length === b.cells.length ? b : { ...b, version: b.version + 1, cells: keep };
  save(projectId, next);
  return { ...(await view(projectId, next)), removed: b.cells.length - keep.length };
}

/** The requests each batch filed (rev_basket_cells.batch_id and sent_request_id). */
export function batchRequests(batchId: string): string[] {
  return readState().batches.find((x) => x.batch_id === batchId)?.request_ids ?? [];
}

/** Every batch's id. */
export function batchIds(): string[] {
  return readState().batches.map((x) => x.batch_id);
}

async function batchOf(batchId: string): Promise<Batch> {
  const ids = batchRequests(batchId);
  const rows = (await Promise.all(ids.map((id) => mockIr.request(id)))).filter((r) => r !== null);
  return {
    batch_id: batchId,
    requests: rows
      .map((r) => ({ id: r.id, number: r.number, ofs_number: r.ofs_number, items: r.items, status: r.status, version: r.version }))
      .sort((x, y) => (x.ofs_number ?? 0) - (y.ofs_number ?? 0)),
  };
}

/** rev_basket_send */
export async function send(v: BasketSend): Promise<Batch> {
  await delay();
  mustBuild(v.projectId);
  const b = readState().baskets[keyOf(v.projectId)];
  if (!b) throw fail('Nothing in the request.');
  if (b.last !== null && b.last.version === v.version) return batchOf(b.last.batch);
  if (b.version !== v.version) throw conflictError();
  const groups = groupsOf(await live(v.projectId, b));
  if (groups.length === 0) throw fail('Nothing in the request.');
  if (v.ofsNumbers !== null) {
    if (!sender(v.projectId)) throw forbidden();
    if (v.ofsNumbers.length !== groups.length || new Set(v.ofsNumbers).size !== groups.length) throw fail('Type one OFS number per request.');
  }
  const ids: string[] = [];
  for (const [k, g] of groups.entries()) {
    let row = await mockRequests.submit({
      projectId: v.projectId, company: v.company, date: v.date, noticeAck: v.noticeAck, areaIds: g.area_ids, itemIds: [g.item_id],
      sheetFileId: null, startTime: v.startTime, durationKind: v.durationKind, durationMin: v.durationMin, attachmentIds: [],
      specialRequired: v.specialRequired, inspectorAck: v.inspectorAck,
    });
    const typed = v.ofsNumbers?.[k];
    if (typed !== undefined && typed !== row.ofs_number) {
      row = await mockIr.rpc('ir_ofs_number_set', { p_request_id: row.id, p_version: row.version, p_number: typed });
    }
    ids.push(row.id);
  }
  const batch = `mock-batch-${String(Date.now())}`;
  const s = readState();
  writeState({
    baskets: { ...s.baskets, [keyOf(v.projectId)]: { version: b.version + 1, cells: [], last: { version: v.version, batch } } },
    batches: [...s.batches, { batch_id: batch, request_ids: ids }],
  });
  return batchOf(batch);
}

/** ir_batches: the batch of each request I read, with how many of it are still live. */
export async function batches(ids: readonly string[]): Promise<{ request_id: string; batch_id: string; size: number }[]> {
  await delay();
  const out: { request_id: string; batch_id: string; size: number }[] = [];
  for (const bt of readState().batches) {
    const rows = (await Promise.all(bt.request_ids.map((id) => mockIr.request(id)))).filter((r) => r !== null && r.status !== 'withdrawn');
    for (const id of bt.request_ids) {
      if (ids.includes(id) && rows.some((r) => r?.id === id)) out.push({ request_id: id, batch_id: bt.batch_id, size: rows.length });
    }
  }
  return out;
}
