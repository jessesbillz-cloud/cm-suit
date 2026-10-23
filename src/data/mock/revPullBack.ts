// e2e mock of Not ready (0109), with the database's rules in short form: on an OFS request its requester, the job's OFS
// duty holder or whoever does the GC step takes walls x items off until a result is recorded (also once it is with
// OFS); they leave the request's cells (kept apart, mock/revs `pulled`), its map loses their strokes (a stroke whose ends
// sit on the wall's line, in that item's color), its line is written again, and everything off withdraws it. Undo puts
// the same cells back, their strokes and a status it withdrew. What Undo needs is kept in sessionStorage (its own key).
import type { IrRef } from '../inspections.mutations';
import type { IrRowRaw } from '../inspections.types';
import type { IrStroke } from '../revs.types';
import type { Tables } from '../database.types';
import { holder } from './duties';
import { mockUser } from './index';
import * as mockIr from './inspections';
import { holds } from './irRules';
import { itemsText } from './revRequests';
import { fail, read, write, type RevMockState } from './revs';
import { delay } from './store';

const KEY = 'e2e-mock-rev-pulls';

type Cell = Tables<'ir_rev_items'>;
type Ref = { area_id: string; item_id: string };

interface Pull {
  requestId: string;
  keys: string[];
  was: string;
  strokes: IrStroke[];
}

const keyOf = (c: Ref) => `${c.area_id}|${c.item_id}`;

function pulls(): Pull[] {
  const raw = window.sessionStorage.getItem(KEY);
  return raw === null ? [] : (JSON.parse(raw) as Pull[]);
}

function savePulls(next: Pull[]): void {
  window.sessionStorage.setItem(KEY, JSON.stringify(next));
}

/** ir_stroke_on_line: the stroke's ends near the wall line's ends, either way round. */
function onLine(p: readonly [number, number][], line: readonly [number, number][]): boolean {
  const [a, b] = [p[0], p[p.length - 1]];
  const [l, m] = [line[0], line[line.length - 1]];
  if (!a || !b || !l || !m) return false;
  const near = (x: [number, number], y: [number, number]) => Math.max(Math.abs(x[0] - y[0]), Math.abs(x[1] - y[1])) <= 0.025;
  return (near(a, l) && near(b, m)) || (near(a, m) && near(b, l));
}

/** The map's strokes along these cells' walls, in their colors. */
function strokesOf(s: RevMockState, requestId: string, off: readonly Cell[]): IrStroke[] {
  const map = s.maps.find((m) => m.request_id === requestId);
  if (!map || map.sheet_file_id === null) return [];
  return (map.strokes as IrStroke[]).filter((st) =>
    off.some((c) => {
      const a = s.areas.find((x) => x.id === c.area_id);
      const line = a?.geom as [number, number][] | null | undefined;
      return st.c === c.color && a?.sheet_file_id === map.sheet_file_id && a.sheet_page === map.page && Array.isArray(line) && onLine(st.p, line);
    }),
  );
}

/** The request's line from the cells still on it. */
function lineOf(s: RevMockState, left: readonly Cell[], was: string): string {
  const walls = s.areas.filter((a) => left.some((c) => c.area_id === a.id)).sort((x, y) => x.level.localeCompare(y.level) || x.position - y.position);
  const used = [...new Set(left.map((c) => c.item_id))].map((id) => s.items.find((i) => i.id === id)).filter((i): i is Tables<'rev_items'> => i !== undefined);
  return walls.length === 0 ? was : itemsText(walls, used);
}

/** ir_rev_pull_back (back false) and ir_rev_put_back (back true). */
export async function pullBack(row: IrRef, refs: readonly Ref[], back: boolean): Promise<IrRowRaw> {
  await delay();
  const me = mockUser().id;
  const q = mockIr.readable(row.id);
  const may = q.kind === 'ofs' && ((q.requested_by === me && holds(me, 'ir.request')) || holder(q.project_id) === me || holds(me, 'ir.gc_approve'));
  if (!may) throw fail("You don't have access to that.", '42501');
  const s = read();
  const keys = new Set(refs.map(keyOf));
  const on = s.cells.filter((c) => c.request_id === q.id);
  const done = q.result !== null || q.signed_at !== null || q.status === 'complete' || on.some((c) => c.result !== null);
  if (!back) {
    if (done || q.status === 'withdrawn') throw fail('The results are in. Nothing can come off now.');
    const off = on.filter((c) => keys.has(keyOf(c)));
    if (off.length === 0 || off.length !== keys.size) throw fail('Those walls are not on this request.');
    const left = on.filter((c) => !keys.has(keyOf(c)));
    const strokes = strokesOf(s, q.id, off);
    const gone = new Set(strokes.map((st) => JSON.stringify(st)));
    const saved = mockIr.patchRequest(row.id, row.version, left.length === 0 ? { status: 'withdrawn' } : { items: lineOf(s, left, q.items) }, 'pull_back');
    const now = new Date().toISOString();
    write((x) => ({
      ...x,
      cells: x.cells.filter((c) => !(c.request_id === q.id && keys.has(keyOf(c)))),
      pulled: [...x.pulled, ...off.map((c) => ({ ...c, pulled_at: now, pulled_by: me }))],
      maps: x.maps.map((m) => (m.request_id === q.id && strokes.length > 0
        ? { ...m, strokes: (m.strokes as IrStroke[]).filter((st) => !gone.has(JSON.stringify(st))), stale: true, version: m.version + 1 }
        : m)),
    }));
    savePulls([...pulls(), { requestId: q.id, keys: [...keys], was: q.status, strokes }]);
    return saved;
  }
  if (done) throw fail('The results are in. Nothing can go back on now.');
  const returning = s.pulled.filter((c) => c.request_id === q.id && keys.has(keyOf(c)));
  const log = [...pulls()].reverse().find((p) => p.requestId === q.id && [...keys].every((k) => p.keys.includes(k)));
  if (returning.length !== keys.size || !log) throw fail('Those walls are not on this request.');
  if (s.cells.some((c) => c.request_id !== q.id && keys.has(keyOf(c)) && c.result !== 'failed')) throw fail('That wall is on another request now.');
  const status = q.status === 'withdrawn' ? log.was : q.status;
  const saved = mockIr.patchRequest(row.id, row.version, { status, items: lineOf(s, [...on, ...returning], q.items) }, 'put_back');
  write((x) => ({
    ...x,
    cells: [...x.cells, ...returning.map((c) => ({ ...c, pulled_at: null, pulled_by: null }))],
    pulled: x.pulled.filter((c) => !(c.request_id === q.id && keys.has(keyOf(c)))),
    maps: x.maps.map((m) => (m.request_id === q.id && log.strokes.length > 0
      ? { ...m, strokes: [...(m.strokes as IrStroke[]), ...log.strokes], stale: true, version: m.version + 1 }
      : m)),
  }));
  return saved;
}
