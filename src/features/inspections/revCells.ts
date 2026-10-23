// An OFS request's cells (wall x item) for its pane and the deputy's result step: grouped by item (its map color), the
// walls by level then place, named from the job's setup. The result draft (Jesse, Oct 22: "an easy sign-off"): every
// cell starts as Pass, a tap flips one to Fail and a failed one says why (OSFM: not just a red circle); one save sends
// every cell (ir_rev_results), so Pass all is one tap and a portion is a few; Undo sends the set that was there
// before. Pure; tested in revCells.test.ts.
import type { IrRevItem, RevResult, RevSetup } from '../../data/revs.types';
import type { MarkupColor } from '../../lib/markup';
import type { StatusKey } from '../../lib/status';

type CellResult = 'passed' | 'failed';

interface CellRow {
  cell: IrRevItem;
  /** The wall, with its level when the request spans levels. */
  label: string;
}

export interface CellGroup {
  color: MarkupColor;
  item: string;
  rows: CellRow[];
}

const REMOVED = 'Removed';

function asColor(n: number): MarkupColor {
  return n === 3 ? 3 : n === 2 ? 2 : 1;
}

function natural(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

/** The cells by item (color order), each item's walls by level then place. */
export function cellGroups(cells: readonly IrRevItem[], setup: RevSetup): CellGroup[] {
  const areas = new Map(setup.areas.map((a) => [a.id, a]));
  const items = new Map(setup.items.map((i) => [i.id, i.name]));
  const levels = new Set(cells.map((c) => areas.get(c.area_id)?.level.trim() ?? ''));
  const place = (c: IrRevItem) => {
    const a = areas.get(c.area_id);
    return { level: a?.level.trim() ?? '', position: a?.position ?? 0, name: a?.name ?? REMOVED };
  };
  const groups = new Map<number, CellGroup>();
  const sorted = [...cells].sort((x, y) => {
    const a = place(x);
    const b = place(y);
    return x.color - y.color || natural(a.level, b.level) || a.position - b.position || a.name.localeCompare(b.name);
  });
  for (const cell of sorted) {
    const g = groups.get(cell.color) ?? { color: asColor(cell.color), item: items.get(cell.item_id) ?? REMOVED, rows: [] };
    const p = place(cell);
    g.rows.push({ cell, label: levels.size > 1 && p.level !== '' ? `${p.level} · ${p.name}` : p.name });
    groups.set(cell.color, g);
  }
  return [...groups.values()];
}

/** The request's one level, when all its walls are on one. */
export function oneLevel(cells: readonly IrRevItem[], setup: RevSetup): string | null {
  const levels = new Set(cells.map((c) => setup.areas.find((a) => a.id === c.area_id)?.level.trim() ?? ''));
  const [only] = [...levels];
  return levels.size === 1 && only !== undefined && only !== '' ? only : null;
}

/** A cell's chip: Passed / Failed (lib/status colors), none before a result. */
export function cellChip(result: string | null): { status: StatusKey; label: string } | null {
  if (result === 'passed') return { status: 'approved', label: 'Passed' };
  if (result === 'failed') return { status: 'not_approved', label: 'Failed' };
  return null;
}

export const cellKey = (c: { area_id: string; item_id: string }) => `${c.area_id}|${c.item_id}`;

export interface CellDraft {
  result: CellResult;
  note: string;
}

/** The deputy's changes not saved yet, by cell. */
export type Edits = Readonly<Record<string, CellDraft>>;

/** What is saved, or Pass before anything is. */
function savedDraft(cell: IrRevItem): CellDraft {
  return { result: cell.result === 'failed' ? 'failed' : 'passed', note: cell.result_note ?? '' };
}

export function draftOf(cell: IrRevItem, edits: Edits): CellDraft {
  return edits[cellKey(cell)] ?? savedDraft(cell);
}

/** The same cell the other way: Pass to Fail (its reason kept if it had one), Fail to Pass. */
export function flip(d: CellDraft): CellDraft {
  return { result: d.result === 'passed' ? 'failed' : 'passed', note: d.note };
}

const isSet = (d: CellDraft) => d.result === 'passed' || d.note.trim() !== '';

/** Failed cells that don't say why yet. */
export function missingReasons(cells: readonly IrRevItem[], edits: Edits): number {
  return cells.filter((c) => !isSet(draftOf(c, edits))).length;
}

/** How many the draft fails. */
export function failedCount(cells: readonly IrRevItem[], edits: Edits): number {
  return cells.filter((c) => draftOf(c, edits).result === 'failed').length;
}

function toResult(cell: IrRevItem, d: CellDraft): RevResult {
  return { area_id: cell.area_id, item_id: cell.item_id, result: d.result, note: d.result === 'failed' ? d.note.trim() : null };
}

const same = (a: RevResult, b: RevResult) => a.result === b.result && (a.note ?? '') === (b.note ?? '');

/** The whole set to save. Null while a failed one doesn't say why, or when nothing changed since the last save. */
export function draftToSave(cells: readonly IrRevItem[], edits: Edits): RevResult[] | null {
  if (missingReasons(cells, edits) > 0) return null;
  const next = cells.map((c) => toResult(c, draftOf(c, edits)));
  const saved = savedResults(cells);
  return saved !== null && next.every((r, i) => saved[i] !== undefined && same(r, saved[i])) ? null : next;
}

/** What is saved now (for Undo); null until every cell has a result. */
export function savedResults(cells: readonly IrRevItem[]): RevResult[] | null {
  if (!cells.every((c) => c.result === 'passed' || (c.result === 'failed' && (c.result_note ?? '').trim() !== ''))) return null;
  return cells.map((c) => toResult(c, savedDraft(c)));
}

/** After a save: the changes it carried are saved now; changes made meanwhile stay. */
export function settle(edits: Edits, sent: readonly RevResult[] | null): Edits {
  if (sent === null) return {};
  const byKey = new Map(sent.map((r) => [cellKey(r), r]));
  return Object.fromEntries(
    Object.entries(edits).filter(([key, d]) => {
      const r = byKey.get(key);
      return r === undefined || r.result !== d.result || (r.result === 'failed' && (r.note ?? '') !== d.note.trim());
    }),
  );
}
