import { describe, expect, it } from 'vitest';
import { irMapContextSchema, irStrokesSchema, liveSetup, revStatusRowSchema, type RevSetup } from './revs.types';

const row = { project_id: 'job', version: 1, deleted_at: null };
const gone = { ...row, deleted_at: '2026-10-03T16:00:00Z' };

function setup(): RevSetup {
  return {
    lists: [
      { ...row, id: 'l2', name: 'Second', phase: null, permit_id: null, position: 2 },
      { ...row, id: 'l1', name: 'First', phase: 'PH III', permit_id: null, position: 1 },
      { ...gone, id: 'l3', name: 'Removed', phase: null, permit_id: null, position: 3 },
    ],
    revs: [
      { ...row, id: 'r1', list_id: 'l1', number: 1, name: 'HOW - Cavity' },
      { ...row, id: 'r0', list_id: 'l1', number: 0, name: 'TOW' },
      { ...row, id: 'r9', list_id: 'l2', number: 0, name: 'Other' },
      { ...gone, id: 'rx', list_id: 'l1', number: 2, name: 'Removed rev' },
      { ...row, id: 'ry', list_id: 'l3', number: 0, name: 'On a removed list' },
    ],
    items: [
      { ...row, id: 'i2', rev_id: 'r1', name: 'Spray', company: null, position: 2 },
      { ...row, id: 'i1', rev_id: 'r1', name: 'Stuff', company: null, position: 1 },
      { ...row, id: 'i0', rev_id: 'r0', name: 'Speed Plugs', company: null, position: 1 },
      { ...row, id: 'ix', rev_id: 'rx', name: 'Under a removed rev', company: null, position: 1 },
      { ...gone, id: 'iy', rev_id: 'r0', name: 'Removed item', company: null, position: 2 },
    ],
    areas: [
      { ...row, id: 'a2', list_id: 'l1', level: 'Level 02', name: 'Wall B', sheet_file_id: null, position: 2 },
      { ...row, id: 'a1', list_id: 'l1', level: 'Level 01', name: 'Wall A', sheet_file_id: 'sheet', position: 1 },
      { ...row, id: 'a9', list_id: 'l3', level: 'Level 01', name: 'On a removed list', sheet_file_id: null, position: 1 },
    ],
    marks: [
      { ...row, id: 'm1', area_id: 'a1', item_id: 'i0', kind: 'na' },
      { ...gone, id: 'm2', area_id: 'a2', item_id: 'i0', kind: 'na' },
      { ...row, id: 'm3', area_id: 'a1', item_id: 'ix', kind: 'na' },
    ],
  };
}

describe('the live setup', () => {
  it('drops removed rows and everything under a removed list or rev', () => {
    const s = liveSetup(setup());
    expect(s.lists.map((l) => l.id)).toEqual(['l1', 'l2']);
    expect(s.revs.map((r) => r.id)).toEqual(['r0', 'r1', 'r9']);
    expect(s.items.map((i) => i.id)).toEqual(['i0', 'i1', 'i2']);
    expect(s.areas.map((a) => a.id)).toEqual(['a1', 'a2']);
    expect(s.marks.map((m) => m.id)).toEqual(['m1']);
  });
  it('orders lists by place, revs by list then number, items by rev then place', () => {
    const s = liveSetup(setup());
    expect(s.revs.map((r) => `${r.list_id}:${String(r.number)}`)).toEqual(['l1:0', 'l1:1', 'l2:0']);
    expect(s.items.map((i) => i.name)).toEqual(['Speed Plugs', 'Stuff', 'Spray']);
  });
});

describe('the boundary', () => {
  const stroke = { c: 1, w: 0.01, p: [[0.1, 0.1], [0.2, 0.2]] };
  it('takes strokes in the database shape only', () => {
    expect(irStrokesSchema.safeParse([stroke]).success).toBe(true);
    expect(irStrokesSchema.safeParse([{ ...stroke, c: 4 }]).success).toBe(false);
    expect(irStrokesSchema.safeParse([{ ...stroke, w: 0.1 }]).success).toBe(false);
    expect(irStrokesSchema.safeParse([{ ...stroke, p: [[0.1, 0.1]] }]).success).toBe(false);
    expect(irStrokesSchema.safeParse([{ ...stroke, p: [[0.1, 0.1], [1.2, 0.5]] }]).success).toBe(false);
    expect(irStrokesSchema.safeParse([{ ...stroke, x: 1 }]).success).toBe(false);
    expect(irStrokesSchema.safeParse(Array.from({ length: 301 }, () => stroke)).success).toBe(false);
  });
  it('reads a status row with its nulls, and only the five statuses', () => {
    const open = { area_id: 'a', item_id: 'i', status: 'open', request_id: null, ir_number: null, ofs_number: null, at: null, note: null };
    expect(revStatusRowSchema.parse(open).status).toBe('open');
    expect(revStatusRowSchema.safeParse({ ...open, status: 'done' }).success).toBe(false);
  });
  it('reads the map context', () => {
    const ctx = {
      request_id: 'q', project_id: 'job', number: 377, ofs_number: 65, phase: 'PH III', request_date: '2026-10-05',
      what: 'Level 02 HOW Cavity Stuff', sheet_file_id: 'sheet', page: 1, strokes: [stroke],
      legend: [{ color: 1, name: 'HOW Cavity Stuff' }], result: null, signed_at: null, signer_name: null, version: 2,
      map_file_id: null, stale: true, can_edit: true,
    };
    expect(irMapContextSchema.parse(ctx).legend[0]?.color).toBe(1);
    expect(irMapContextSchema.safeParse({ ...ctx, legend: [{ color: 4, name: 'x' }] }).success).toBe(false);
  });
});
