// Revs worked out for the screens (Jesse, Oct 2: "anyone can see what's left on each wall at any time"). Every wall
// needs every item of its list's revs; rev_status gives each wall x item one status (na, passed, requested, failed,
// open). Here: a wall's revs with their items' statuses, what is still to ask for, the end-of-job rollup (what is
// still open, and where), the walls by list and level, and the chip for each status (lib/status).
import type { CSSProperties } from 'react';
import type { Rev, RevArea, RevItem, RevList, RevSetup, RevStatusRow } from '../../data/revs.types';
import { formatInZone } from '../../lib/dates';
import type { StatusKey } from '../../lib/status';
import { levelKey } from './levels';

type CellStatus = RevStatusRow['status'];

export const VIEWS = ['walls', 'open', 'checklist', 'setup'] as const;
export type RevView = (typeof VIEWS)[number];

export const VIEW_LABELS: Record<RevView, string> = { walls: 'Walls', open: 'Open', checklist: 'Checklist', setup: 'Setup' };

/** The view in the URL; Setup only for those who manage the lists. Walls by default. */
export function parseView(v: string | undefined, canManage: boolean): RevView {
  const view = VIEWS.find((x) => x === v) ?? 'walls';
  return view === 'setup' && !canManage ? 'walls' : view;
}

const cellKey = (areaId: string, itemId: string) => `${areaId}:${itemId}`;

export type StatusIndex = ReadonlyMap<string, RevStatusRow>;

export function indexStatus(rows: readonly RevStatusRow[]): StatusIndex {
  return new Map(rows.map((r) => [cellKey(r.area_id, r.item_id), r]));
}

/** A wall x item's status; one the server hasn't answered yet (just added) is open. */
export function cellOf(index: StatusIndex, areaId: string, itemId: string): RevStatusRow {
  return (
    index.get(cellKey(areaId, itemId)) ?? {
      area_id: areaId,
      item_id: itemId,
      status: 'open',
      request_id: null,
      ir_number: null,
      ofs_number: null,
      at: null,
      note: null,
    }
  );
}

interface WallCell {
  item: RevItem;
  cell: RevStatusRow;
}

export interface WallRev {
  rev: Rev;
  cells: WallCell[];
}

/** A wall's revs (its list's, by number), each with its items' statuses. */
export function wallRevs(setup: RevSetup, index: StatusIndex, area: RevArea): WallRev[] {
  return setup.revs
    .filter((r) => r.list_id === area.list_id)
    .map((rev) => ({ rev, cells: setup.items.filter((i) => i.rev_id === rev.id).map((item) => ({ item, cell: cellOf(index, area.id, item.id) })) }));
}

/** Still to ask for: never asked, or failed (a failed item is asked again). */
export function canAsk(s: CellStatus): boolean {
  return s === 'open' || s === 'failed';
}

/** Not done yet on a wall: open, failed, or asked for and waiting on a result. */
function stillOpen(s: CellStatus): boolean {
  return s === 'open' || s === 'failed' || s === 'requested';
}

export interface OpenWall {
  area: RevArea;
  status: CellStatus;
}

interface OpenItem {
  item: RevItem;
  walls: OpenWall[];
}

interface OpenRev {
  rev: Rev;
  items: OpenItem[];
}

/** The end-of-job check: per rev, per item, the walls still open. Items and revs with nothing open are left out. */
export function openRollup(setup: RevSetup, index: StatusIndex): OpenRev[] {
  const out: OpenRev[] = [];
  for (const rev of setup.revs) {
    const walls = setup.areas.filter((a) => a.list_id === rev.list_id);
    const items = setup.items
      .filter((i) => i.rev_id === rev.id)
      .map((item) => ({
        item,
        walls: walls.map((area) => ({ area, status: cellOf(index, area.id, item.id).status })).filter((w) => stillOpen(w.status)),
      }))
      .filter((i) => i.walls.length > 0);
    if (items.length > 0) out.push({ rev, items });
  }
  return out;
}

/** Done: every item of the wall passed or N/A. */
function complete(setup: RevSetup, index: StatusIndex, area: RevArea): boolean {
  return !wallRevs(setup, index, area).some((r) => r.cells.some((c) => stillOpen(c.cell.status)));
}

/** A list of walls (its walls have details, a line on the plan or a room), or of areas (the fire & life safety sheet's
 *  levels and site). */
function isWalls(setup: RevSetup, listId: string, inRoom: ReadonlySet<string>): boolean {
  return setup.areas.some(
    (a) => a.list_id === listId && (a.wall_tag !== null || a.rating !== null || a.ul_design !== null || a.geom !== null || inRoom.has(a.id)),
  );
}

/** The header's line, one part per list: "Rated walls 48 · 3 complete", "Fire & life safety 4 areas · 0 complete"
 *  (complete: every item passed or N/A). The noun is left out when the list's name ends with one. */
export function listLines(setup: RevSetup, index: StatusIndex, inRoom: ReadonlySet<string>): string[] {
  return setup.lists.flatMap((list) => {
    const areas = setup.areas.filter((a) => a.list_id === list.id);
    if (areas.length === 0) return [];
    const n = areas.length;
    const said = /\b(walls?|areas?)$/i.test(list.name.trim());
    const noun = said ? '' : isWalls(setup, list.id, inRoom) ? (n === 1 ? ' wall' : ' walls') : n === 1 ? ' area' : ' areas';
    const done = areas.filter((a) => complete(setup, index, a)).length;
    return [`${list.name.trim()} ${String(n)}${noun} · ${String(done)} complete`];
  });
}

/** Each status's chip: its lib/status colors and its own word. */
const CHIPS: Record<CellStatus, { key: StatusKey; label: string }> = {
  passed: { key: 'approved', label: 'Passed' },
  requested: { key: 'pending', label: 'Requested' },
  failed: { key: 'not_approved', label: 'Failed' },
  open: { key: 'step_ahead', label: 'Open' },
  na: { key: 'cancelled', label: 'N/A' },
};

export function chipOf(status: CellStatus): { key: StatusKey; label: string } {
  return CHIPS[status];
}

/** A tappable chip's colors (lib/status): open plain with an outline, N/A muted, the rest tinted. */
export function chipLook(key: StatusKey, kind: 'open' | 'na' | 'set'): CSSProperties {
  if (kind === 'open') return { color: `var(--status-${key}-fg)`, background: `var(--status-${key}-bg)`, borderColor: `var(--status-${key}-dot)` };
  if (kind === 'na') return { color: `var(--status-${key}-dot)`, background: `var(--status-${key}-bg)`, borderColor: 'transparent' };
  return { color: `var(--status-${key}-fg)`, background: `var(--status-${key}-bg)`, borderColor: 'transparent' };
}

/** Signed off before the app (0082): passed, with no request behind it. */
export function signedBefore(cell: RevStatusRow): boolean {
  return cell.status === 'passed' && cell.request_id === null;
}

/** "OFS #0041 · Sep 21": what signed a cell off before the app (its day in the job's calendar), or null. */
export function beforeLine(cell: RevStatusRow, timeZone: string): string | null {
  if (!signedBefore(cell)) return null;
  const parts: string[] = [];
  if (cell.ofs_number !== null) parts.push(`OFS #${String(cell.ofs_number).padStart(4, '0')}`);
  if (cell.at !== null) parts.push(formatInZone(cell.at, timeZone, 'MMM d'));
  return parts.length > 0 ? parts.join(' · ') : null;
}

/** A manager may sign off before the app an item not yet passed or N/A. */
export function canSignBefore(status: CellStatus): boolean {
  return status !== 'passed' && status !== 'na';
}

/** The wall's details in one short line: "F6a · 1 HR · UL U419 · Fire Area 2 · A201A"; null when it has none. */
export function detailsLine(area: RevArea): string | null {
  const parts = [area.wall_tag, area.rating, area.ul_design, area.fire_area, area.sheet_ref].filter((x): x is string => x !== null && x !== '');
  return parts.length > 0 ? parts.join(' · ') : null;
}

/** "IR 12 · OFS 0065 · Oct 2": the request that decides a passed, requested or failed item, in the job's calendar. */
export function irLine(cell: RevStatusRow, timeZone: string): string | null {
  if (cell.request_id === null || cell.status === 'open' || cell.status === 'na') return null;
  const parts: string[] = [];
  if (cell.ir_number !== null) parts.push(`IR ${String(cell.ir_number)}`);
  if (cell.ofs_number !== null) parts.push(`OFS ${String(cell.ofs_number).padStart(4, '0')}`);
  if (cell.at !== null) parts.push(formatInZone(cell.at, timeZone, 'MMM d'));
  return parts.length > 0 ? parts.join(' · ') : null;
}

/** A manager marks N/A an item that is still to ask for, and clears an N/A. Passed and requested items keep theirs. */
export function naToggle(status: CellStatus): 'mark' | 'clear' | null {
  if (status === 'na') return 'clear';
  return canAsk(status) ? 'mark' : null;
}

interface LevelGroup {
  level: string;
  areas: RevArea[];
}

interface ListGroup {
  list: RevList;
  levels: LevelGroup[];
}

/** A list's walls by level (levels in natural order: Level 2 before Level 10), each level's walls in their order. */
export function levelsOf(setup: RevSetup, listId: string): LevelGroup[] {
  const groups = new Map<string, LevelGroup>();
  for (const a of setup.areas.filter((x) => x.list_id === listId)) {
    const k = levelKey(a.level);
    const g = groups.get(k);
    if (g) g.areas.push(a);
    else groups.set(k, { level: a.level.trim(), areas: [a] });
  }
  return [...groups.values()].sort((a, b) => a.level.localeCompare(b.level, undefined, { numeric: true, sensitivity: 'base' }));
}

/** Every list with its walls by level; lists without walls are left out. */
export function wallsByList(setup: RevSetup): ListGroup[] {
  return setup.lists.map((list) => ({ list, levels: levelsOf(setup, list.id) })).filter((g) => g.levels.length > 0);
}

/** The new request's prefill (Inspections > new): this wall and its next items, as the route's comma lists. */
export function requestSearch(areaIds: readonly string[], items: readonly RevItem[]): { areas: string; items: string } {
  return { areas: areaIds.join(','), items: items.map((i) => i.id).join(',') };
}
