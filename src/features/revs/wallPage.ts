// One wall's page worked out (Jesse, Oct 3: "the whole wall gets built out on its own inspection page"): its items in
// rev order, each with the part of the wall it inspects; each part's state on the 3-D wall; the tally; what a tap on
// an item button or on the drawing does (focus it there; an item still to ask for is also picked for the request, up
// to three, OSFM's three colors); and the wall's callout (its name, the grid in brackets apart).
import type { Rev, RevItem, RevStatusRow } from '../../data/revs.types';
import { canAsk, type WallRev } from './model';
import type { PartState } from './wall3d/paint';
import { partOf, type WallPart } from './wallParts';

type CellStatus = RevStatusRow['status'];

export interface WallItem {
  rev: Rev;
  item: RevItem;
  cell: RevStatusRow;
  part: WallPart;
}

/** Every item of the wall's list, in rev order, with the part it inspects. */
export function wallItems(revs: readonly WallRev[]): WallItem[] {
  return revs.flatMap(({ rev, cells }) => cells.map(({ item, cell }) => ({ rev, item, cell, part: partOf(item.name, rev.name) })));
}

/** The order a part shows its items' states in: what needs doing first. */
const PRESSING: readonly CellStatus[] = ['failed', 'requested', 'open', 'passed', 'na'];

/** Each part's state on the drawing: the most pressing of its items' (N/A only when all of them are). */
export function partStates(items: readonly WallItem[]): Partial<Record<WallPart, PartState>> {
  const out: Partial<Record<WallPart, PartState>> = {};
  for (const { part, cell } of items) {
    const was = out[part];
    if (was === undefined || PRESSING.indexOf(cell.status) < PRESSING.indexOf(was)) out[part] = cell.status;
  }
  return out;
}

export interface WallCount {
  /** Items the wall needs (N/A left out). */
  needed: number;
  passed: number;
  requested: number;
  failed: number;
}

export function countOf(statuses: readonly CellStatus[]): WallCount {
  const needed = statuses.filter((s) => s !== 'na');
  return {
    needed: needed.length,
    passed: needed.filter((s) => s === 'passed').length,
    requested: needed.filter((s) => s === 'requested').length,
    failed: needed.filter((s) => s === 'failed').length,
  };
}

/** "12 of 21 passed". */
export function countLine(c: WallCount): string {
  return `${String(c.passed)} of ${String(c.needed)} passed`;
}

/** At most this many items on one request: OSFM's three colors on a map. */
export const MAX_PICK = 3;

export interface WallPick {
  /** The item shown on the drawing, or null when a part no item names was tapped. */
  focus: string | null;
  part: WallPart | null;
  /** Items picked for the request, in the order picked. */
  picked: string[];
}

/** On opening: the next item to ask for is shown (not picked), else the first item. */
export function firstPick(items: readonly WallItem[]): WallPick {
  const first = items.find((i) => canAsk(i.cell.status)) ?? items[0];
  return { focus: first?.item.id ?? null, part: first?.part ?? null, picked: [] };
}

/** A tap on an item's button: it is shown; one still to ask for is picked or dropped. full: a fourth was refused. */
export function tapItem(state: WallPick, item: WallItem, max = MAX_PICK): { next: WallPick; full: boolean } {
  const id = item.item.id;
  const shown = { focus: id, part: item.part };
  if (!canAsk(item.cell.status)) return { next: { ...state, ...shown }, full: false };
  if (state.picked.includes(id)) return { next: { ...shown, picked: state.picked.filter((p) => p !== id) }, full: false };
  if (state.picked.length >= max) return { next: { ...state, ...shown }, full: true };
  return { next: { ...shown, picked: [...state.picked, id] }, full: false };
}

/** A tap on a part of the drawing: its first item is shown; tapping it again steps to its next item. */
export function tapPart(state: WallPick, part: WallPart, items: readonly WallItem[]): WallPick {
  const its = items.filter((i) => i.part === part);
  if (its.length === 0) return { ...state, focus: null, part };
  const at = its.findIndex((i) => i.item.id === state.focus);
  const next = its[(at + 1) % its.length] ?? its[0];
  return { ...state, focus: next?.item.id ?? null, part };
}

/** Picked items no longer to ask for (passed or N/A since) are dropped. */
export function keepAskable(state: WallPick, items: readonly WallItem[]): WallPick {
  const ok = new Set(items.filter((i) => canAsk(i.cell.status)).map((i) => i.item.id));
  const picked = state.picked.filter((id) => ok.has(id));
  return picked.length === state.picked.length ? state : { ...state, picked };
}

/** A wall's name for its callout: the name, and the grid or room when it ends in brackets ("... (B / 2–5)"). */
export function calloutOf(name: string): { title: string; sub: string | null } {
  const m = /^(.*\S)\s*\(([^()]+)\)\s*$/.exec(name.trim());
  if (!m?.[1] || !m[2]) return { title: name.trim(), sub: null };
  return { title: m[1], sub: m[2].trim() };
}
