import { describe, expect, it } from 'vitest';
import { NO_WALL_DETAILS, type Rev, type RevArea, type RevItem, type RevSetup, type RevStatusRow } from '../../data/revs.types';
import { checklistOf } from './checklist';
import { beforeLine, canSignBefore, detailsLine, indexStatus, signedBefore } from './model';

const base = { project_id: 'job', version: 1, deleted_at: null };
const rev = (n: number): Rev => ({ ...base, id: `r${String(n)}`, list_id: 'l1', number: n, name: `Rev ${String(n)}` });
const item = (r: number, k: number): RevItem => ({ ...base, id: `i${String(r)}${String(k)}`, rev_id: `r${String(r)}`, name: `Item ${String(r)}.${String(k)}`, company: null, position: k });
const wall = (n: number, level: string): RevArea => ({
  ...base, id: `a${String(n)}`, list_id: 'l1', level, name: `Wall ${String(n)}`, sheet_file_id: null, sheet_page: 1, geom: null, ...NO_WALL_DETAILS, position: n,
});

const SETUP: RevSetup = {
  lists: [{ ...base, id: 'l1', name: 'Sample Rated Walls', phase: null, permit_id: null, position: 1 }],
  revs: [rev(0), rev(1)],
  items: [item(0, 1), item(1, 1), item(1, 2)],
  areas: [wall(1, 'Level 01'), wall(2, 'Level 01'), wall(3, 'Level 01'), wall(4, 'Level 02')],
  marks: [],
};

function row(area: string, itemId: string, status: RevStatusRow['status'], extra: Partial<RevStatusRow> = {}): RevStatusRow {
  return { area_id: area, item_id: itemId, status, request_id: null, ir_number: null, ofs_number: null, at: null, note: null, ...extra };
}

describe('the fire marshal checklist', () => {
  const index = indexStatus([
    row('a1', 'i01', 'passed', { request_id: 'q1' }), row('a1', 'i11', 'passed', { ofs_number: 41 }), row('a1', 'i12', 'na'),
    row('a2', 'i01', 'failed'), row('a2', 'i11', 'passed'), row('a2', 'i12', 'requested'),
    row('a3', 'i01', 'na'), row('a3', 'i11', 'passed'),
  ]);
  const levels = checklistOf(SETUP, index);

  it('one table per level; a row per wall, a cell per rev', () => {
    expect(levels.map((l) => [l.level, l.rows.length])).toEqual([['Level 01', 3], ['Level 02', 1]]);
    const marks = levels[0]?.rows.map((r) => r.cells.map((c) => c.mark));
    expect(marks).toEqual([['done', 'done'], ['failed', 'requested'], ['na', 'open']]);
    expect(levels[0]?.rows[2]?.cells[1]).toMatchObject({ passed: 1, needed: 2 });
  });

  it('totals: per rev, walls done of those that need it; walls done in every rev', () => {
    expect(levels[0]?.totals.map((t) => [t.done, t.walls])).toEqual([[1, 2], [1, 3]]);
    expect(levels[0]?.wallsDone).toBe(1);
    expect(levels[1]?.totals.map((t) => [t.done, t.walls])).toEqual([[0, 1], [0, 1]]);
  });
});

describe('signed off before, and the details line', () => {
  it('passed with no request is signed off before: "OFS #0041 · Sep 21"', () => {
    const cell = row('a1', 'i11', 'passed', { ofs_number: 41, at: '2026-09-21T19:00:00Z' });
    expect(signedBefore(cell)).toBe(true);
    expect(beforeLine(cell, 'America/Los_Angeles')).toBe('OFS #0041 · Sep 21');
    expect(beforeLine(row('a1', 'i11', 'passed'), 'America/Los_Angeles')).toBeNull();
    expect(signedBefore(row('a1', 'i11', 'passed', { request_id: 'q1' }))).toBe(false);
    expect(['open', 'failed', 'requested', 'passed', 'na'].map((s) => canSignBefore(s as RevStatusRow['status']))).toEqual([true, true, true, false, false]);
  });

  it('the details in one line, empty ones left out', () => {
    expect(detailsLine({ ...wall(1, 'Level 01'), wall_tag: 'F6a', rating: '1 HR', ul_design: 'UL U419', sheet_ref: 'A201A' })).toBe('F6a · 1 HR · UL U419 · A201A');
    expect(detailsLine(wall(1, 'Level 01'))).toBeNull();
  });
});
