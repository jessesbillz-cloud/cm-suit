// An OFS request's cells (wall x item) for its pane and the deputy's result step: grouped by item (its map color), the
// walls by level then place, named from the job's setup. The result draft: each cell Pass or Fail, a failed one says why
// (OSFM: not just a red circle); a save sends every cell (ir_rev_results); "All passed" is one tap; Undo sends the set
// that was there before. Pure; tested in revCells.test.ts.
import type { IrRevItem, RevResult, RevSetup } from '../../data/revs.types';
import type { MarkupColor } from '../../lib/markup';
import type { StatusKey } from '../../lib/status';

export type CellResult = 'passed' | 'failed';

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
  result: CellResult | null;
  note: string;
}

/** The deputy's changes not saved yet, by cell. */
export type Edits = Readonly<Record<string, CellDraft>>;

function savedDraft(cell: IrRevItem): CellDraft {
  return { result: cell.result === 'passed' || cell.result === 'failed' ? cell.result : null, note: cell.result_note ?? '' };
}

export function draftOf(cell: IrRevItem, edits: Edits): CellDraft {
  return edits[cellKey(cell)] ?? savedDraft(cell);
}

const isSet = (d: CellDraft) => d.result === 'passed' || (d.result === 'failed' && d.note.trim() !== '');

/** Cells still without a result, or failed without saying why. */
export function leftToDo(cells: readonly IrRevItem[], edits: Edits): number {
  return cells.filter((c) => !isSet(draftOf(c, edits))).length;
}

function toResult(cell: IrRevItem, d: CellDraft): RevResult {
  return { area_id: cell.area_id, item_id: cell.item_id, result: d.result === 'failed' ? 'failed' : 'passed', note: d.result === 'failed' ? d.note.trim() : null };
}

const same = (a: RevResult, b: RevResult) => a.result === b.result && (a.note ?? '') === (b.note ?? '');

/** Every cell set: the whole set to save. Null while one is still open, or when nothing changed since the last save. */
export function draftToSave(cells: readonly IrRevItem[], edits: Edits): RevResult[] | null {
  if (leftToDo(cells, edits) > 0) return null;
  const next = cells.map((c) => toResult(c, draftOf(c, edits)));
  const saved = savedResults(cells);
  return saved !== null && next.every((r, i) => saved[i] !== undefined && same(r, saved[i])) ? null : next;
}

/** What is saved now (for Undo); null when no cell has a result. */
export function savedResults(cells: readonly IrRevItem[]): RevResult[] | null {
  if (!cells.every((c) => isSet(savedDraft(c)))) return null;
  return cells.map((c) => toResult(c, savedDraft(c)));
}

export function allPassed(cells: readonly IrRevItem[]): RevResult[] {
  return cells.map((c) => ({ area_id: c.area_id, item_id: c.item_id, result: 'passed', note: null }));
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
