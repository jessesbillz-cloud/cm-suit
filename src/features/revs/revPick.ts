// The revs request picker's rules (RevPicker): a list's walls by level and its items by rev; what each item still needs
// on the picked walls (open, done = passed or N/A, requested, failed) and the one state its button shows; the items and
// walls the request carries once the database leaves out what is done (ir_ofs_cells), their colors (1..3 in list order,
// as the database gives them), and the map's "what" and title. Pure; tested in revPick.test.ts.
import type { RevArea, RevItem, RevList, RevSetup, RevStatusRow } from '../../data/revs.types';
import { mapTitle, type MarkupColor } from '../../lib/markup';

/** OSFM: three colors at most on a sheet, one per item. */
export const MAX_ITEMS = 3;

export interface RevPick {
  listId: string | null;
  areaIds: string[];
  itemIds: string[];
}

export type StatusIndex = ReadonlyMap<string, RevStatusRow>;

const cellKey = (areaId: string, itemId: string) => `${areaId}|${itemId}`;

export function statusIndex(rows: readonly RevStatusRow[]): StatusIndex {
  return new Map(rows.map((r) => [cellKey(r.area_id, r.item_id), r]));
}

function statusOf(index: StatusIndex, areaId: string, itemId: string): RevStatusRow['status'] {
  return index.get(cellKey(areaId, itemId))?.status ?? 'open';
}

const isDoneStatus = (s: RevStatusRow['status']) => s === 'passed' || s === 'na';

/** Level 2 before Level 10. */
function natural(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

/** The lists that have walls, in their order. */
export function listsWithWalls(setup: RevSetup): RevList[] {
  return setup.lists.filter((l) => setup.areas.some((a) => a.list_id === l.id));
}

export interface LevelGroup {
  level: string;
  areas: RevArea[];
}

/** A list's walls by level (levels in natural order), each level's walls in their place. */
export function wallsByLevel(setup: RevSetup, listId: string | null): LevelGroup[] {
  const groups = new Map<string, RevArea[]>();
  for (const a of setup.areas) {
    if (a.list_id !== listId) continue;
    const level = a.level.trim();
    groups.set(level, [...(groups.get(level) ?? []), a]);
  }
  return [...groups.entries()].sort(([a], [b]) => natural(a, b)).map(([level, areas]) => ({ level, areas }));
}

export interface RevGroup {
  number: number;
  name: string;
  items: RevItem[];
}

/** A list's items under their revs, revs in order (the setup is already in order). */
export function itemsByRev(setup: RevSetup, listId: string | null): RevGroup[] {
  return setup.revs
    .filter((r) => r.list_id === listId)
    .map((r) => ({ number: r.number, name: r.name, items: setup.items.filter((i) => i.rev_id === r.id) }))
    .filter((g) => g.items.length > 0);
}

interface ItemNeed {
  /** Picked walls that still need it (not passed, not N/A). */
  open: number;
  /** Picked walls where it passed or is N/A. */
  done: number;
  /** Of the open ones: already on a request with no result yet. */
  requested: number;
  /** Of the open ones: failed last time. */
  failed: number;
}

export function itemNeed(index: StatusIndex, itemId: string, areaIds: readonly string[]): ItemNeed {
  const need: ItemNeed = { open: 0, done: 0, requested: 0, failed: 0 };
  for (const areaId of areaIds) {
    const s = statusOf(index, areaId, itemId);
    if (isDoneStatus(s)) {
      need.done += 1;
      continue;
    }
    need.open += 1;
    if (s === 'requested') need.requested += 1;
    if (s === 'failed') need.failed += 1;
  }
  return need;
}

/** Passed or N/A on every picked wall: nothing left to ask for, so it can't be picked. */
export function isDone(need: ItemNeed): boolean {
  return need.open === 0 && need.done > 0;
}

/** What an item's button shows on the picked walls: done (not pickable), already asked for, failed last time, or open. */
export type ItemState = 'done' | 'requested' | 'failed' | 'open';

export function itemState(index: StatusIndex, itemId: string, areaIds: readonly string[]): ItemState {
  const need = itemNeed(index, itemId, areaIds);
  if (isDone(need)) return 'done';
  if (need.requested > 0) return 'requested';
  return need.failed > 0 ? 'failed' : 'open';
}

interface RequestItem {
  item: RevItem;
  color: MarkupColor;
}

/**
 * The picked items the request carries: those a picked wall still needs (every picked one while no wall is picked yet),
 * in list order, colored 1..3 in that order, as ir_ofs_cells colors them.
 */
export function requestItems(setup: RevSetup, index: StatusIndex, pick: RevPick): RequestItem[] {
  const picked = new Set(pick.itemIds);
  return setup.items
    .filter((i) => picked.has(i.id) && (pick.areaIds.length === 0 || itemNeed(index, i.id, pick.areaIds).open > 0))
    .slice(0, MAX_ITEMS)
    .map((item, k) => ({ item, color: (k + 1) as MarkupColor }));
}

/** The picked walls the request carries (a request item is still open there), by level then place: the map's order. */
export function requestWalls(setup: RevSetup, index: StatusIndex, pick: RevPick, items: readonly RequestItem[]): RevArea[] {
  const picked = new Set(pick.areaIds);
  return setup.areas
    .filter((a) => picked.has(a.id) && items.some((r) => !isDoneStatus(statusOf(index, a.id, r.item.id))))
    .sort((a, b) => natural(a.level.trim(), b.level.trim()) || a.position - b.position || a.name.localeCompare(b.name));
}

interface RequestPlan {
  items: RequestItem[];
  walls: RevArea[];
}

/** What a pick sends: the carried items with their colors, and the carried walls. */
export function requestPlan(setup: RevSetup, index: StatusIndex, pick: RevPick): RequestPlan {
  const items = requestItems(setup, index, pick);
  return { items, walls: requestWalls(setup, index, pick, items) };
}

/** The map's "what" (ir_map_what): the levels, then the items joined with " & ". */
export function mapWhat(walls: readonly RevArea[], items: readonly RequestItem[]): string {
  const levels = [...new Set(walls.map((a) => a.level.trim()))].sort(natural).join(', ');
  return [levels, items.map((r) => r.item.name.trim()).join(' & ')].filter((s) => s !== '').join(' ');
}

/** The title the map will carry; the numbers read "new" until the database gives them. */
export function titlePreview(phase: string | null, date: string, what: string): string {
  return mapTitle({ number: 'new', ofsNumber: 'new', phase, requestDate: date, what });
}

/** The sheet the map starts on (ir_submit_ofs): the first carried wall's that has one. */
export function firstSheet(walls: readonly RevArea[]): string | null {
  return walls.find((a) => a.sheet_file_id !== null)?.sheet_file_id ?? null;
}

/** How many sheets the carried walls are on (one map shows one). */
export function sheetCount(walls: readonly RevArea[]): number {
  return new Set(walls.flatMap((a) => (a.sheet_file_id === null ? [] : [a.sheet_file_id]))).size;
}

/** The picked walls (kept in their setup order). Items no picked wall needs any more drop off: they would leave nothing
 *  to inspect. */
export function pickWalls(setup: RevSetup, index: StatusIndex, pick: RevPick, areaIds: readonly string[]): RevPick {
  const set = new Set(areaIds);
  const next = setup.areas.filter((a) => set.has(a.id)).map((a) => a.id);
  const itemIds = next.length === 0 ? pick.itemIds : pick.itemIds.filter((i) => itemNeed(index, i, next).open > 0);
  return { ...pick, areaIds: next, itemIds };
}

/** An item on or off; a fourth is refused (three colors at most). */
export function toggleItem(pick: RevPick, itemId: string): RevPick {
  if (pick.itemIds.includes(itemId)) return { ...pick, itemIds: pick.itemIds.filter((i) => i !== itemId) };
  if (pick.itemIds.length >= MAX_ITEMS) return pick;
  return { ...pick, itemIds: [...pick.itemIds, itemId] };
}

/** Another list: nothing picked on it yet. */
export function pickList(listId: string): RevPick {
  return { listId, areaIds: [], itemIds: [] };
}

const idsOf = (s: string | undefined) => new Set((s ?? '').split(',').filter((x) => x !== ''));

/**
 * The start, from a link (Revs' Request button: `areas` and `items`, comma-separated ids): the list of the first wall
 * given (else of the first item given, else the first list with walls), the walls given on it, and the items given on
 * it that those walls still need, three at most in list order. Unknown ids are left out.
 */
export function prefillPick(setup: RevSetup, index: StatusIndex, areas?: string, items?: string): RevPick {
  const wantAreas = idsOf(areas);
  const wantItems = idsOf(items);
  const revList = new Map(setup.revs.map((r) => [r.id, r.list_id]));
  const listId =
    setup.areas.find((a) => wantAreas.has(a.id))?.list_id ??
    setup.items.map((i) => (wantItems.has(i.id) ? revList.get(i.rev_id) : undefined)).find((l) => l !== undefined) ??
    listsWithWalls(setup)[0]?.id ??
    null;
  const areaIds = setup.areas.filter((a) => a.list_id === listId && wantAreas.has(a.id)).map((a) => a.id);
  const itemIds = setup.items
    .filter((i) => revList.get(i.rev_id) === listId && wantItems.has(i.id))
    .filter((i) => areaIds.length === 0 || itemNeed(index, i.id, areaIds).open > 0)
    .slice(0, MAX_ITEMS)
    .map((i) => i.id);
  return { listId, areaIds, itemIds };
}
