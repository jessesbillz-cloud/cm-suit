// Revs worked out for the screens (Jesse, Oct 2: "anyone can see what's left on each wall at any time"). Every wall
// needs every item of its list's revs; rev_status gives each wall x item one status (na, passed, requested, failed,
// open). Here: a wall's revs with their items' statuses, what is still to ask for, the walls by list and level, and
// the chip for each status (lib/status).
import type { Rev, RevArea, RevItem, RevList, RevSetup, RevStatusRow } from '../../data/revs.types';
import { formatInZone } from '../../lib/dates';
import { CARD_STATE, type StatusKey } from '../../lib/status';
import { levelKey } from './levels';

type CellStatus = RevStatusRow['status'];

const VIEWS = ['walls', 'checklist', 'setup'] as const;
/** The rooms (walls: the default), the fire marshal's checklist, a manager's setup. The plan is its own (?view=plan). */
export type RevView = (typeof VIEWS)[number];

/** The view in the URL; Setup only for those who manage the lists. The rooms by default (an old ?view=list or open too). */
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

/** A wall's revs (its list's, by number), each with its items' statuses. Not applicable items are left out, and revs
 *  left with none (Jesse, Oct 12: "everything else should just go away"), unless `withNa` (a manager's wall page). */
export function wallRevs(setup: RevSetup, index: StatusIndex, area: RevArea, withNa = false): WallRev[] {
  return setup.revs
    .filter((r) => r.list_id === area.list_id)
    .map((rev) => ({
      rev,
      cells: setup.items
        .filter((i) => i.rev_id === rev.id)
        .map((item) => ({ item, cell: cellOf(index, area.id, item.id) }))
        .filter((c) => withNa || c.cell.status !== 'na'),
    }))
    .filter((r) => withNa || r.cells.length > 0);
}

/** Still to ask for: never asked, or failed (a failed item is asked again). */
export function canAsk(s: CellStatus): boolean {
  return s === 'open' || s === 'failed';
}

/** Not done yet on a wall: open, failed, or asked for and waiting on a result. */
function stillOpen(s: CellStatus): boolean {
  return s === 'open' || s === 'failed' || s === 'requested';
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

/** A cell whose last result failed, as the card says it (Jesse, Oct 22): it goes on the next request first. */
const FAILED_NOW = 'Failed — needs re-inspection';

/** Each status's chip: its lib/status colors and its own word (a failed cell: FAILED_NOW). */
const CHIPS: Record<CellStatus, { key: StatusKey; label: string }> = {
  passed: { key: CARD_STATE.signed_off.key, label: 'Passed' },
  requested: CARD_STATE.asked_for,
  failed: { key: CARD_STATE.failed.key, label: FAILED_NOW },
  open: CARD_STATE.needed,
  na: CARD_STATE.not_needed,
};

export function chipOf(status: CellStatus): { key: StatusKey; label: string } {
  return CHIPS[status];
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

/** A manager switches an item off for one wall (not needed here) while it is open, and back on once off. An item with
 *  a sign-off, a request or a failure stays as it is (0101 rev_card_item). */
export function cardSwitch(status: CellStatus): 'off' | 'on' | null {
  if (status === 'na') return 'on';
  return status === 'open' ? 'off' : null;
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
