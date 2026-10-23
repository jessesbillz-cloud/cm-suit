import { describe, expect, it } from 'vitest';
import type { IrRevItem, RevSetup } from '../../data/revs.types';
import { mayPullBack, pullOpen, pullWalls, takenOffMessage } from './pullBack';

const row = { project_id: 'job', version: 1, deleted_at: null };
const NONE = { wall_tag: null, rating: null, ul_design: null, fire_area: null, sheet_ref: null, check_note: null, field_by: null, field_checked_at: null, field_checked_by: null };

const SETUP: RevSetup = {
  lists: [{ ...row, id: 'l1', name: 'Sample Walls', phase: null, permit_id: null, position: 1 }],
  revs: [{ ...row, id: 'r1', list_id: 'l1', number: 1, name: 'TOW' }],
  items: [
    { ...row, id: 'plugs', rev_id: 'r1', name: 'Speed Plugs', company: null, position: 1 },
    { ...row, id: 'tape', rev_id: 'r1', name: 'Fire Tape', company: null, position: 2 },
  ],
  areas: [
    { ...row, id: 'b', list_id: 'l1', level: 'Level 01', name: 'Wall B', sheet_file_id: null, sheet_page: 1, geom: null, ...NONE, position: 2 },
    { ...row, id: 'a', list_id: 'l1', level: 'Level 01', name: 'Wall A', sheet_file_id: null, sheet_page: 1, geom: null, ...NONE, position: 1 },
    { ...row, id: 'z', list_id: 'l1', level: 'Level 02', name: 'Wall Z', sheet_file_id: null, sheet_page: 1, geom: null, ...NONE, position: 1 },
  ],
  marks: [],
};

function cell(area: string, item: string, color: number, result: string | null = null): IrRevItem {
  return { id: `${area}-${item}`, request_id: 'q', area_id: area, item_id: item, color, result, result_note: null, result_at: null, result_by: null, version: 1, pulled_at: null, wall_facts: null };
}

const OPEN = { status: 'pending', result: null, signed_at: null };

describe('who may take walls off', () => {
  const ofs = { kind: 'ofs', requested_by: 'me' };
  it('the requester, the duty holder and the GC step; nobody on another kind of request', () => {
    expect(mayPullBack(ofs, { request: true, gcApprove: false }, 'me', false)).toBe(true);
    expect(mayPullBack(ofs, { request: true, gcApprove: false }, 'other', false)).toBe(false);
    expect(mayPullBack(ofs, { request: false, gcApprove: false }, 'other', true)).toBe(true);
    expect(mayPullBack(ofs, { request: false, gcApprove: true }, 'other', false)).toBe(true);
    expect(mayPullBack({ kind: 'ior', requested_by: 'me' }, { request: true, gcApprove: true }, 'me', true)).toBe(false);
  });
  it('until there is a result, on the request or a wall', () => {
    expect(pullOpen(OPEN, [cell('a', 'plugs', 1)])).toBe(true);
    expect(pullOpen({ ...OPEN, status: 'gc_review' }, [])).toBe(true);
    expect(pullOpen(OPEN, [cell('a', 'plugs', 1, 'passed')])).toBe(false);
    expect(pullOpen({ ...OPEN, result: 'approved' }, [])).toBe(false);
    expect(pullOpen({ ...OPEN, status: 'withdrawn' }, [])).toBe(false);
  });
});

describe('the walls to take off', () => {
  it('each wall once, by level and place, its items in color order', () => {
    const walls = pullWalls([cell('b', 'tape', 2), cell('a', 'plugs', 1), cell('b', 'plugs', 1)], SETUP);
    expect(walls.map((w) => [w.label, w.items.map((i) => i.name)])).toEqual([
      ['Wall A', ['Speed Plugs']],
      ['Wall B', ['Speed Plugs', 'Fire Tape']],
    ]);
  });
  it('names the level when the walls are on two', () => {
    expect(pullWalls([cell('z', 'plugs', 1), cell('a', 'plugs', 1)], SETUP).map((w) => w.label)).toEqual(['Level 01 · Wall A', 'Level 02 · Wall Z']);
  });
  it('says what came off', () => {
    const [a, b] = pullWalls([cell('a', 'plugs', 1), cell('b', 'plugs', 1), cell('b', 'tape', 2)], SETUP);
    if (!a || !b) throw new Error('two walls');
    expect(takenOffMessage(b, null)).toBe('Wall B taken off.');
    expect(takenOffMessage(b, b.items[1] ?? null)).toBe('Fire Tape taken off Wall B.');
    expect(takenOffMessage(a, a.items[0] ?? null)).toBe('Wall A taken off.');
  });
});
