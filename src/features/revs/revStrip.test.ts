import { describe, expect, it } from 'vitest';
import { NO_WALL_DETAILS, type Rev, type RevArea, type RevItem, type RevSetup, type RevStatusRow } from '../../data/revs.types';
import { indexStatus } from './model';
import { chipKey, chipName, chipText, indexSignoffFiles, revStrip } from './revStrip';

const base = { project_id: 'job', version: 1, deleted_at: null };
const rev = (n: number, name: string, list = 'l1'): Rev => ({ ...base, id: `r${String(n)}${list}`, list_id: list, number: n, name });
const item = (r: string, k: number): RevItem => ({ ...base, id: `${r}-i${String(k)}`, rev_id: r, name: `Item ${String(k)}`, company: null, position: k });
const AREA: RevArea = {
  ...base, id: 'a1', list_id: 'l1', level: 'Level 01', name: 'Electrical 0134 north wall', sheet_file_id: null, sheet_page: 1, geom: null,
  ...NO_WALL_DETAILS, position: 1,
};

const REVS = [rev(0, 'TOW'), rev(1, 'HOW - Cavity'), rev(2, 'CJ'), rev(3, 'Drywall'), rev(4, 'In-Wall'), rev(0, 'Site', 'l2')];
const SETUP: RevSetup = {
  lists: [],
  revs: REVS,
  items: [item('r0l1', 1), item('r1l1', 1), item('r1l1', 2), item('r2l1', 1), item('r3l1', 1), item('r4l1', 1), item('r0l2', 1)],
  areas: [AREA],
  marks: [],
};

function row(itemId: string, status: RevStatusRow['status'], extra: Partial<RevStatusRow> = {}): RevStatusRow {
  return { area_id: 'a1', item_id: itemId, status, request_id: null, ir_number: null, ofs_number: null, at: null, note: null, ...extra };
}

describe('the rev strip', () => {
  const index = indexStatus([
    // TOW signed off before the app with OFS 41, its file linked.
    row('r0l1-i1', 'passed', { ofs_number: 41, at: '2026-09-21T19:00:00Z' }),
    // HOW: both passed apart, the newer through the app (OFS 65): that number, no file.
    row('r1l1-i1', 'passed', { ofs_number: 44, at: '2026-09-21T19:00:00Z' }),
    row('r1l1-i2', 'passed', { request_id: 'q', ir_number: 9, ofs_number: 65, at: '2026-10-01T19:00:00Z' }),
    row('r2l1-i1', 'requested', { request_id: 'q2' }),
    row('r3l1-i1', 'failed', { request_id: 'q3', note: 'gaps' }),
    row('r4l1-i1', 'na'),
  ]);
  const files = indexSignoffFiles([
    { area_id: 'a1', item_id: 'r0l1-i1', file_id: 'f41' },
    { area_id: 'a1', item_id: 'r1l1-i1', file_id: 'f44' },
  ]);
  const chips = revStrip(SETUP, index, AREA, files);
  const at = (i: number) => {
    const c = chips[i];
    if (!c) throw new Error('no chip');
    return c;
  };

  it("one chip per rev of the wall's list, in order, each rolled up", () => {
    expect(chips.map((c) => [c.rev.number, c.mark])).toEqual([[0, 'done'], [1, 'done'], [2, 'requested'], [3, 'failed'], [4, 'na']]);
  });

  it("a done rev shows the newest OFS number, and that sign-off's file when on file", () => {
    expect(at(0)).toMatchObject({ ofsNumber: 41, fileId: 'f41' });
    // Passed through the app last: OFS 65, no file of the older paper sign-off behind a different number.
    expect(at(1)).toMatchObject({ ofsNumber: 65, fileId: null });
    expect(at(2)).toMatchObject({ ofsNumber: null, fileId: null });
  });

  it('colors from lib/status, short words, full names spoken', () => {
    expect(chips.map((c) => chipKey(c.mark))).toEqual(['approved', 'approved', 'pending', 'not_approved', 'cancelled']);
    expect(chipText(at(0), false)).toBe('0 · 0041');
    expect(chipText(at(2), true)).toBe('2 CJ');
    expect(chipName(at(0))).toBe('Rev 0 TOW: Done, OFS 0041');
    expect(chipName(at(4))).toBe('Rev 4 In-Wall: N/A');
  });

  it('open when nothing is answered yet', () => {
    expect(revStrip(SETUP, indexStatus([]), AREA, new Map()).map((c) => c.mark)).toEqual(['open', 'open', 'open', 'open', 'open']);
  });
});
