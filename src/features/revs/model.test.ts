import { describe, expect, it } from 'vitest';
import type { Rev, RevArea, RevItem, RevList, RevSetup, RevStatusRow } from '../../data/revs.types';
import {
  canAsk,
  cellOf,
  chipOf,
  indexStatus,
  irLine,
  levelsOf,
  metaLine,
  naToggle,
  neighbor,
  openRollup,
  parseView,
  requestSearch,
  wallRevs,
  wallsByList,
} from './model';

const base = { project_id: 'job', version: 1, deleted_at: null };
const list: RevList = { ...base, id: 'l1', name: 'Sample Rated Walls', phase: 'PH III', permit_id: null, position: 1 };
const rev = (n: number, name: string): Rev => ({ ...base, id: `r${String(n)}`, list_id: 'l1', number: n, name });
const item = (r: number, k: number, name: string): RevItem => ({
  ...base, id: `i${String(r)}${String(k)}`, rev_id: `r${String(r)}`, name, company: null, position: k,
});
const wall = (n: number, level: string, name: string): RevArea => ({
  ...base, id: `a${String(n)}`, list_id: 'l1', level, name, sheet_file_id: null, position: n,
});

const SETUP: RevSetup = {
  lists: [list],
  revs: [rev(0, 'TOW'), rev(1, 'HOW - Cavity'), rev(2, 'CJ')],
  items: [
    item(0, 1, 'TOW - Speed Plugs'),
    item(1, 1, 'HOW Cavity Stuff'), item(1, 2, 'HOW Cavity Spray'), item(1, 3, 'HOW Beam Pockets'), item(1, 4, 'HOW Extra'),
    item(2, 1, 'CJ Stuffing'), item(2, 2, 'CJ Caulking'),
  ],
  areas: [wall(1, 'Level 01', 'Stair 2 shaft'), wall(2, 'Level 10', 'Corridor 1010'), wall(3, 'Level 2', 'Elevator 2'), wall(4, ' level 01', 'Corridor 110')],
  marks: [],
};

function row(area: string, itemId: string, status: RevStatusRow['status'], extra: Partial<RevStatusRow> = {}): RevStatusRow {
  return { area_id: area, item_id: itemId, status, request_id: null, ir_number: null, ofs_number: null, at: null, note: null, ...extra };
}

const STATUS = indexStatus([
  row('a1', 'i01', 'passed', { request_id: 'q5', ir_number: 5, ofs_number: 65, at: '2026-09-20T21:00:00Z' }),
  row('a1', 'i11', 'passed'),
  row('a1', 'i12', 'failed', { request_id: 'q6', ir_number: 6, ofs_number: 66, at: '2026-09-27T21:00:00Z', note: 'Sample gaps' }),
  row('a1', 'i13', 'na'),
  row('a1', 'i14', 'open'),
  row('a2', 'i01', 'na'),
  row('a2', 'i11', 'requested', { request_id: 'q7', ir_number: 7, ofs_number: null, at: '2026-10-04T16:00:00Z' }),
  row('a3', 'i01', 'passed'),
]);

describe('revs model', () => {
  it("a wall's revs, in order, each with its items' statuses (an unanswered cell is open)", () => {
    const revs = wallRevs(SETUP, STATUS, wall(1, 'Level 01', 'Stair 2 shaft'));
    expect(revs.map((r) => r.rev.number)).toEqual([0, 1, 2]);
    expect(revs[1]?.cells.map((c) => c.cell.status)).toEqual(['passed', 'failed', 'na', 'open']);
    expect(cellOf(STATUS, 'a9', 'i01').status).toBe('open');
  });

  it('still to ask for: never asked, or failed', () => {
    const all: RevStatusRow['status'][] = ['open', 'failed', 'requested', 'passed', 'na'];
    expect(all.filter(canAsk)).toEqual(['open', 'failed']);
  });

  it('the open rollup: per rev, per item, the walls not passed or N/A', () => {
    const open = openRollup(SETUP, STATUS);
    const rev0 = open.find((r) => r.rev.number === 0);
    expect(rev0?.items.map((i) => [i.item.id, i.walls.map((w) => w.area.id)])).toEqual([['i01', ['a4']]]);
    const stuff = open.find((r) => r.rev.number === 1)?.items.find((i) => i.item.id === 'i11');
    expect(stuff?.walls.map((w) => [w.area.id, w.status])).toEqual([['a2', 'requested'], ['a3', 'open'], ['a4', 'open']]);
    const allDone = indexStatus(SETUP.areas.flatMap((a) => SETUP.items.map((i) => row(a.id, i.id, i.id === 'i13' ? 'na' : 'passed'))));
    expect(openRollup(SETUP, allDone)).toEqual([]);
  });

  it("the header's line: walls, those done (every item passed or N/A), those with an item failed", () => {
    expect(metaLine(SETUP, STATUS)).toBe('4 walls · 0 done · 1 failed');
    const one = { ...SETUP, areas: [wall(1, 'L1', 'W')] };
    expect(metaLine(one, indexStatus([]))).toBe('1 wall · 0 done');
    const passed = indexStatus(SETUP.items.map((i) => row('a1', i.id, i.id === 'i13' ? 'na' : 'passed')));
    expect(metaLine(one, passed)).toBe('1 wall · 1 done');
  });

  it('chips use lib/status keys, each with its own word', () => {
    expect(chipOf('passed')).toEqual({ key: 'approved', label: 'Passed' });
    expect(chipOf('requested')).toEqual({ key: 'pending', label: 'Requested' });
    expect(chipOf('failed')).toEqual({ key: 'not_approved', label: 'Failed' });
    expect(chipOf('open')).toEqual({ key: 'step_ahead', label: 'Open' });
    expect(chipOf('na')).toEqual({ key: 'cancelled', label: 'N/A' });
  });

  it("the deciding request's line, in the job's calendar", () => {
    expect(irLine(cellOf(STATUS, 'a1', 'i01'), 'America/Los_Angeles')).toBe('IR 5 · OFS 0065 · Sep 20');
    expect(irLine(cellOf(STATUS, 'a2', 'i11'), 'America/Los_Angeles')).toBe('IR 7 · Oct 4');
    expect(irLine(cellOf(STATUS, 'a1', 'i13'), 'America/Los_Angeles')).toBeNull();
    expect(irLine(cellOf(STATUS, 'a1', 'i11'), 'America/Los_Angeles')).toBeNull();
  });

  it('N/A: marked on items still to ask for, cleared on N/A ones', () => {
    expect(naToggle('open')).toBe('mark');
    expect(naToggle('failed')).toBe('mark');
    expect(naToggle('na')).toBe('clear');
    expect(naToggle('passed')).toBeNull();
    expect(naToggle('requested')).toBeNull();
  });

  it('walls by level: one group per level whatever its case or spaces, levels in natural order', () => {
    expect(levelsOf(SETUP, 'l1').map((g) => [g.level, g.areas.map((a) => a.id)])).toEqual([
      ['Level 01', ['a1', 'a4']],
      ['Level 2', ['a3']],
      ['Level 10', ['a2']],
    ]);
    expect(wallsByList({ ...SETUP, lists: [list, { ...list, id: 'l2', name: 'Other' }] }).map((g) => g.list.id)).toEqual(['l1']);
  });

  it('moves, views and the request prefill', () => {
    const rows = [{ id: 'x' }, { id: 'y' }, { id: 'z' }];
    expect(neighbor(rows, 'y', -1)?.id).toBe('x');
    expect(neighbor(rows, 'y', 1)?.id).toBe('z');
    expect(neighbor(rows, 'x', -1)).toBeNull();
    expect(neighbor(rows, 'q', 1)).toBeNull();
    expect(parseView('open', false)).toBe('open');
    expect(parseView('setup', false)).toBe('walls');
    expect(parseView('setup', true)).toBe('setup');
    expect(parseView(undefined, true)).toBe('walls');
    expect(requestSearch(['a1'], [item(1, 2, 'x'), item(1, 4, 'y')])).toEqual({ areas: 'a1', items: 'i12,i14' });
  });
});
