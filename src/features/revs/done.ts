// What is finished and can fold away (Jesse, Oct 10: "a more distinctive and semi non-clickable area when the area has
// been signed off completely and we don't have to worry about it. I like things to collapse if we can"). A rev line is
// done when every one of its items passed or is N/A; a wall when every rev line of it is; a room when every wall of it
// is. Nothing to show is never done. A done line says its OFS numbers ("Done · 0040", a short list, or the last one
// and how many more). Pure; tested in done.test.ts.
import type { RevStatusRow } from '../../data/revs.types';
import type { ItemChip, ItemLine } from './itemLines';

type CellStatus = RevStatusRow['status'];

const finished = (s: CellStatus) => s === 'passed' || s === 'na';

/** Every status passed or N/A, and at least one. */
export function allDone(statuses: readonly CellStatus[]): boolean {
  return statuses.length > 0 && statuses.every(finished);
}

export function lineDone(line: ItemLine): boolean {
  return allDone(line.chips.map((c) => c.status));
}

export function wallDone(lines: readonly ItemLine[]): boolean {
  return lines.length > 0 && lines.every(lineDone);
}

/** Every wall done, and at least one. */
export function roomDone(walls: readonly { done: boolean }[]): boolean {
  return walls.length > 0 && walls.every((w) => w.done);
}

const ofs = (n: number) => String(n).padStart(4, '0');

/** Up to this many OFS numbers are listed; more: the last one and how many more. */
const LISTED = 3;

/** "0038, 0040", or "0047 +3"; null when none passed with a number. */
export function ofsList(chips: readonly ItemChip[]): string | null {
  const nums = [...new Set(chips.flatMap((c) => (c.ofsNumber !== null ? [c.ofsNumber] : [])))].sort((a, b) => a - b);
  const last = nums.at(-1);
  if (last === undefined) return null;
  if (nums.length <= LISTED) return nums.map(ofs).join(', ');
  return `${ofs(last)} +${String(nums.length - 1)}`;
}

/** What a done line says: "Done · 0040", "Done", or "N/A" when every item is. */
export function doneText(chips: readonly ItemChip[]): string {
  if (chips.length > 0 && chips.every((c) => c.status === 'na')) return 'N/A';
  const nums = ofsList(chips);
  return nums === null ? 'Done' : `Done · ${nums}`;
}
