// The fire marshal's checklist worked out (Jesse, Oct 5: walk the rated walls with the CSU fire marshal): per list and
// level, one row per wall (name, tag, rating) and one column per rev. A cell is the wall's items of that rev rolled
// up: N/A when the wall needs none of them, failed when one failed, done when every needed one passed (in the app or
// signed off before), requested when one is asked for, else open (with how many are done). Each level has its totals:
// per rev, the walls done of those that need it, and the walls done in every rev.
import type { Rev, RevArea, RevList, RevSetup } from '../../data/revs.types';
import type { StatusKey } from '../../lib/status';
import { cellOf, levelsOf, type StatusIndex } from './model';

type CheckMark = 'done' | 'failed' | 'requested' | 'open' | 'na';

export interface CheckCell {
  rev: Rev;
  mark: CheckMark;
  /** Items passed, of those the wall needs in this rev. */
  passed: number;
  needed: number;
}

interface CheckRow {
  area: RevArea;
  cells: CheckCell[];
  /** Every rev done or N/A. */
  done: boolean;
}

interface CheckTotal {
  rev: Rev;
  done: number;
  /** Walls that need this rev (not N/A). */
  walls: number;
}

export interface CheckLevel {
  list: RevList;
  level: string;
  revs: Rev[];
  rows: CheckRow[];
  totals: CheckTotal[];
  wallsDone: number;
}

function cellFor(setup: RevSetup, index: StatusIndex, area: RevArea, rev: Rev): CheckCell {
  const statuses = setup.items.filter((i) => i.rev_id === rev.id).map((i) => cellOf(index, area.id, i.id).status).filter((s) => s !== 'na');
  const passed = statuses.filter((s) => s === 'passed').length;
  const needed = statuses.length;
  let mark: CheckMark = 'open';
  if (needed === 0) mark = 'na';
  else if (statuses.includes('failed')) mark = 'failed';
  else if (passed === needed) mark = 'done';
  else if (statuses.includes('requested')) mark = 'requested';
  return { rev, mark, passed, needed };
}

/** Every list's walls by level, as the checklist's tables. Lists without walls are left out. */
export function checklistOf(setup: RevSetup, index: StatusIndex): CheckLevel[] {
  return setup.lists.flatMap((list) => {
    const revs = setup.revs.filter((r) => r.list_id === list.id);
    return levelsOf(setup, list.id).map(({ level, areas }) => {
      const rows = areas.map((area) => {
        const cells = revs.map((rev) => cellFor(setup, index, area, rev));
        return { area, cells, done: cells.every((c) => c.mark === 'done' || c.mark === 'na') };
      });
      const totals = revs.map((rev, k) => {
        const marks = rows.map((r) => r.cells[k]?.mark ?? 'na').filter((m) => m !== 'na');
        return { rev, done: marks.filter((m) => m === 'done').length, walls: marks.length };
      });
      return { list, level, revs, rows, totals, wallsDone: rows.filter((r) => r.done).length };
    });
  });
}

/** Each mark's lib/status colors and its word (done shows as a check). */
export const MARKS: Record<CheckMark, { key: StatusKey; label: string }> = {
  done: { key: 'approved', label: 'Done' },
  failed: { key: 'not_approved', label: 'Failed' },
  requested: { key: 'pending', label: 'Requested' },
  open: { key: 'step_ahead', label: 'Open' },
  na: { key: 'cancelled', label: 'N/A' },
};
