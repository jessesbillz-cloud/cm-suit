// e2e mock of the revs setup (0056) with the database's rules in short form: revs.read for every mock user but the
// bidder, revs.manage for the official and the inspectors; a list from the legend (a repeat returns it, another list of
// that name is refused), revs (a number once per list), items, walls (each name once per level), N/A marks, and remove /
// restore with a version check. The request side (status, cells, maps, results) is mock/revRequests. State lives in
// sessionStorage (its own key), never module state.
import { DataError, conflictError } from '../errors';
import type { Tables } from '../database.types';
import { NO_WALL_DETAILS, parseArea, type LegendRev, type Rev, type RevArea, type RevItem, type RevKind, type RevList, type RevMark, type RevRemoved, type RevSetup } from '../revs.types';
import { mockUser } from './index';
import { seedCells, seedMaps, seedSetup } from './revSeeds';
import { delay } from './store';

const KEY = 'e2e-mock-revs';

export interface RevMockState {
  lists: Tables<'rev_lists'>[];
  revs: Tables<'revs'>[];
  items: Tables<'rev_items'>[];
  areas: Tables<'rev_areas'>[];
  marks: Tables<'rev_marks'>[];
  /** Signed off before the app (0082). */
  signoffs: Tables<'rev_signoffs'>[];
  cells: Tables<'ir_rev_items'>[];
  maps: Tables<'ir_maps'>[];
}

export function read(): RevMockState {
  const raw = window.sessionStorage.getItem(KEY);
  return raw === null ? { ...seedSetup(), cells: seedCells(), maps: seedMaps(), signoffs: [] } : (JSON.parse(raw) as RevMockState);
}

export function write(update: (s: RevMockState) => RevMockState): RevMockState {
  const next = update(read());
  window.sessionStorage.setItem(KEY, JSON.stringify(next));
  return next;
}

function role(): string {
  return mockUser().id.replace(/^mock-user-/, '');
}

export function has(cap: string): boolean {
  if (cap === 'revs.manage') return ['ahj', 'inspector', 'inspector_admin'].includes(role());
  return cap === 'revs.read' && role() !== 'bidder';
}

export async function capability(cap: string): Promise<boolean> {
  await delay();
  return has(cap);
}

export function fail(message: string, code = '22023'): DataError {
  return new DataError(message, code, null);
}

export function must(cap: string): void {
  if (!has(cap)) throw fail("You don't have access to that.", '42501');
}

export const clean = (s: string | null | undefined) => (s ?? '').trim().replace(/\s+/g, ' ');
export const same = (a: string, b: string) => clean(a).toLowerCase() === clean(b).toLowerCase();
export const stamp = () => ({ created_at: new Date().toISOString(), updated_at: new Date().toISOString(), created_by: mockUser().id, version: 1, deleted_at: null });
export const newId = (prefix: string) => `${prefix}-${String(Date.now())}-${String(Math.floor(Math.random() * 1e6))}`;
export const bump = <T extends { version: number }>(row: T, patch: Partial<T>): T => ({ ...row, ...patch, version: row.version + 1, updated_at: new Date().toISOString() });

export function listOf(s: RevMockState, id: string): Tables<'rev_lists'> {
  const l = s.lists.find((x) => x.id === id);
  if (!l) throw fail('That item no longer exists.', 'P0002');
  if (l.deleted_at !== null) throw fail('This list was removed.');
  return l;
}

export function checkVersion(have: number, want: number | null): void {
  if (want !== null && have !== want) throw conflictError();
}

export async function setup(projectId: string): Promise<RevSetup> {
  await delay();
  if (!has('revs.read')) return { lists: [], revs: [], items: [], areas: [], marks: [] };
  const s = read();
  const mine = <T extends { project_id: string }>(rows: T[]) => rows.filter((r) => r.project_id === projectId);
  return { lists: mine(s.lists), revs: mine(s.revs), items: mine(s.items), areas: mine(s.areas).map(parseArea), marks: mine(s.marks) };
}

export async function createList(v: { projectId: string; name: string; phase: string; permitId: string | null; revs: LegendRev[] }): Promise<RevList> {
  await delay();
  must('revs.manage');
  const s = read();
  const taken = s.lists.find((l) => l.project_id === v.projectId && l.deleted_at === null && same(l.name, v.name));
  if (taken) {
    if (taken.created_by === mockUser().id) return taken;
    throw fail('That list is already on this job.');
  }
  const numbers = v.revs.map((r) => r.number);
  if (new Set(numbers).size !== numbers.length) throw fail('Each rev number once.');
  const org = { org_id: 'org-owner', project_id: v.projectId };
  const list: Tables<'rev_lists'> = {
    ...stamp(), ...org, id: newId('mock-rev-list'), name: clean(v.name), phase: clean(v.phase) || null, permit_id: v.permitId,
    position: Math.max(0, ...s.lists.filter((l) => l.project_id === v.projectId).map((l) => l.position)) + 1,
  };
  const revs = v.revs.map((r) => ({ ...stamp(), ...org, id: newId('mock-rev'), list_id: list.id, number: r.number, name: clean(r.name) }));
  const items = v.revs.flatMap((r, i) =>
    r.items.map((it, k) => ({
      ...stamp(), ...org, id: newId('mock-rev-item'), rev_id: revs[i]?.id ?? '', name: clean(it.name),
      company: clean(it.company) || null, position: k + 1,
    })),
  );
  write((x) => ({ ...x, lists: [...x.lists, list], revs: [...x.revs, ...revs], items: [...x.items, ...items] }));
  return list;
}

export async function saveList(list: RevList, name: string, phase: string, permitId: string | null): Promise<RevList> {
  await delay();
  must('revs.manage');
  const s = read();
  const l = listOf(s, list.id);
  checkVersion(l.version, list.version);
  if (s.lists.some((x) => x.project_id === l.project_id && x.id !== l.id && x.deleted_at === null && same(x.name, name))) {
    throw fail('That list is already on this job.');
  }
  const next = bump(l, { name: clean(name), phase: clean(phase) || null, permit_id: permitId });
  write((x) => ({ ...x, lists: x.lists.map((r) => (r.id === l.id ? next : r)) }));
  return next;
}

export async function saveRev(projectId: string, listId: string, rev: Rev | null, number: number, name: string): Promise<Rev> {
  await delay();
  must('revs.manage');
  const s = read();
  const l = listOf(s, listId);
  const clash = s.revs.find((r) => r.list_id === l.id && r.deleted_at === null && r.number === number && r.id !== rev?.id);
  if (clash && rev === null && same(clash.name, name)) return clash;
  if (clash) throw fail(`Rev ${String(number)} is already on this list.`);
  if (rev === null) {
    const row = { ...stamp(), org_id: l.org_id, project_id: projectId, id: newId('mock-rev'), list_id: l.id, number, name: clean(name) };
    write((x) => ({ ...x, revs: [...x.revs, row] }));
    return row;
  }
  const current = s.revs.find((r) => r.id === rev.id);
  if (!current) throw fail('That item no longer exists.', 'P0002');
  checkVersion(current.version, rev.version);
  const next = bump(current, { number, name: clean(name) });
  write((x) => ({ ...x, revs: x.revs.map((r) => (r.id === next.id ? next : r)) }));
  return next;
}

export async function saveItem(v: { revId: string; item: RevItem | null; name: string; company: string; position: number | null }): Promise<RevItem> {
  await delay();
  must('revs.manage');
  const s = read();
  const rev = s.revs.find((r) => r.id === v.revId && r.deleted_at === null);
  if (!rev) throw fail('This rev was removed.');
  const siblings = s.items.filter((i) => i.rev_id === rev.id && i.deleted_at === null);
  if (v.item === null) {
    const again = siblings.find((i) => same(i.name, v.name));
    if (again) return again;
    const row = {
      ...stamp(), org_id: rev.org_id, project_id: rev.project_id, id: newId('mock-rev-item'), rev_id: rev.id, name: clean(v.name),
      company: clean(v.company) || null, position: v.position ?? Math.max(0, ...siblings.map((i) => i.position)) + 1,
    };
    write((x) => ({ ...x, items: [...x.items, row] }));
    return row;
  }
  const current = siblings.find((i) => i.id === v.item?.id);
  if (!current) throw fail('That item no longer exists.', 'P0002');
  checkVersion(current.version, v.item.version);
  const next = bump(current, { name: clean(v.name), company: clean(v.company) || null, position: v.position ?? current.position });
  write((x) => ({ ...x, items: x.items.map((i) => (i.id === next.id ? next : i)) }));
  return next;
}

export async function addAreas(v: { listId: string; level: string; names: string[]; sheetFileId: string | null }): Promise<RevArea[]> {
  await delay();
  must('revs.manage');
  const s = read();
  const l = listOf(s, v.listId);
  const live = s.areas.filter((a) => a.list_id === l.id && a.deleted_at === null);
  let position = Math.max(0, ...live.map((a) => a.position));
  const out: Tables<'rev_areas'>[] = [];
  const added: Tables<'rev_areas'>[] = [];
  for (const name of v.names.map(clean).filter((n) => n !== '')) {
    const found = [...live, ...added].find((a) => same(a.level, v.level) && same(a.name, name));
    if (found) {
      if (!out.includes(found)) out.push(found);
      continue;
    }
    position += 1;
    const row = {
      ...stamp(), org_id: l.org_id, project_id: l.project_id, id: newId('mock-rev-area'), list_id: l.id, level: clean(v.level), name,
      sheet_file_id: v.sheetFileId, sheet_page: 1, geom: null, position, ...NO_WALL_DETAILS,
    };
    added.push(row);
    out.push(row);
  }
  write((x) => ({ ...x, areas: [...x.areas, ...added] }));
  return out.map(parseArea);
}

export async function saveArea(v: { area: RevArea; level: string; name: string; sheetFileId: string | null; position: number | null }): Promise<RevArea> {
  await delay();
  must('revs.manage');
  const s = read();
  const current = s.areas.find((a) => a.id === v.area.id && a.deleted_at === null);
  if (!current) throw fail('This wall was removed.');
  checkVersion(current.version, v.area.version);
  if (s.areas.some((a) => a.list_id === current.list_id && a.id !== current.id && a.deleted_at === null && same(a.level, v.level) && same(a.name, v.name))) {
    throw fail('That wall is already on this level.');
  }
  // A wall's line goes with its sheet (0059): another sheet takes it off the plan, back to page 1.
  const moved = v.sheetFileId !== current.sheet_file_id ? { geom: null, sheet_page: 1 } : {};
  const next = bump(current, {
    level: clean(v.level), name: clean(v.name), sheet_file_id: v.sheetFileId, position: v.position ?? current.position, ...moved,
  });
  write((x) => ({ ...x, areas: x.areas.map((a) => (a.id === next.id ? next : a)) }));
  return parseArea(next);
}

interface Removable {
  id: string;
  version: number;
  deleted_at: string | null;
  updated_at: string;
}

function toggled<T extends Removable>(rows: T[], id: string, version: number, removing: boolean): { rows: T[]; row: T } {
  const row = rows.find((r) => r.id === id);
  if (!row) throw fail('That item no longer exists.', 'P0002');
  if ((row.deleted_at !== null) === removing) return { rows, row };
  checkVersion(row.version, version);
  const next = bump(row, { deleted_at: removing ? new Date().toISOString() : null } as Partial<T>);
  return { rows: rows.map((r) => (r.id === id ? next : r)), row: next };
}

/** rev_remove (removing) and rev_restore: a repeat is a no-op; the answer carries the new version for the Undo. */
export async function remove(kind: RevKind, id: string, version: number, removing: boolean): Promise<RevRemoved> {
  await delay();
  must('revs.manage');
  const s = read();
  let row: Removable;
  if (kind === 'list') {
    const r = toggled(s.lists, id, version, removing);
    write((x) => ({ ...x, lists: r.rows }));
    row = r.row;
  } else if (kind === 'rev') {
    const r = toggled(s.revs, id, version, removing);
    write((x) => ({ ...x, revs: r.rows }));
    row = r.row;
  } else if (kind === 'item') {
    const r = toggled(s.items, id, version, removing);
    write((x) => ({ ...x, items: r.rows }));
    row = r.row;
  } else {
    const r = toggled(s.areas, id, version, removing);
    write((x) => ({ ...x, areas: r.rows }));
    row = r.row;
  }
  return { id: row.id, version: row.version, deleted_at: row.deleted_at };
}

/** rev_move (0080): swaps with the neighbor in its rev (an item) or on its level (a wall); the group numbered 1..n. */
export async function move(kind: 'item' | 'area', id: string, version: number, dir: -1 | 1): Promise<RevRemoved> {
  await delay();
  must('revs.manage');
  const s = read();
  const rows: { id: string; position: number; name: string; version: number; deleted_at: string | null }[] = kind === 'item' ? s.items : s.areas;
  const row = rows.find((r) => r.id === id);
  if (!row) throw fail('That item no longer exists.', 'P0002');
  if (row.deleted_at !== null) throw fail(kind === 'item' ? 'This item was removed.' : 'This wall was removed.');
  checkVersion(row.version, version);
  const group =
    kind === 'item'
      ? s.items.filter((i) => i.deleted_at === null && i.rev_id === s.items.find((x) => x.id === id)?.rev_id)
      : s.areas.filter((a) => {
          const me = s.areas.find((x) => x.id === id);
          return a.deleted_at === null && me !== undefined && a.list_id === me.list_id && same(a.level, me.level);
        });
  const order = [...group].sort((a, b) => a.position - b.position || a.name.localeCompare(b.name) || a.id.localeCompare(b.id)).map((r) => r.id);
  const at = order.indexOf(id);
  const there = order[at + dir];
  if (there !== undefined) {
    order[at + dir] = id;
    order[at] = there;
  }
  const place = new Map(order.map((rid, n) => [rid, n + 1]));
  const renumber = <T extends { id: string; position: number; version: number; updated_at: string }>(list: T[]): T[] =>
    list.map((r) => {
      const n = place.get(r.id);
      return n === undefined || n === r.position ? r : bump(r, { position: n } as Partial<T>);
    });
  const next = write((x) => (kind === 'item' ? { ...x, items: renumber(x.items) } : { ...x, areas: renumber(x.areas) }));
  const after: { id: string; version: number; deleted_at: string | null }[] = kind === 'item' ? next.items : next.areas;
  const saved = after.find((r) => r.id === id) ?? row;
  return { id: saved.id, version: saved.version, deleted_at: saved.deleted_at };
}

export async function markNa(areaId: string, itemId: string, on: boolean): Promise<RevMark | null> {
  await delay();
  must('revs.manage');
  const s = read();
  const area = s.areas.find((a) => a.id === areaId && a.deleted_at === null);
  const rev = s.revs.find((r) => r.id === s.items.find((i) => i.id === itemId)?.rev_id);
  if (!area) throw fail('That item no longer exists.', 'P0002');
  if (rev?.list_id !== area.list_id) throw fail("Pick an item of this wall's list.");
  const mark = s.marks.find((m) => m.area_id === areaId && m.item_id === itemId);
  let next: Tables<'rev_marks'> | null = mark ?? null;
  if (on && !mark) {
    next = { ...stamp(), org_id: area.org_id, project_id: area.project_id, id: newId('mock-rev-mark'), area_id: areaId, item_id: itemId, kind: 'na' };
  } else if (mark && (mark.deleted_at === null) !== on) {
    next = bump(mark, { deleted_at: on ? null : new Date().toISOString() });
  }
  const saved = next;
  if (saved !== null) write((x) => ({ ...x, marks: [...x.marks.filter((m) => m.id !== saved.id), saved] }));
  return saved;
}
