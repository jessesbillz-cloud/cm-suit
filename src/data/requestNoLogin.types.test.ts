import { describe, expect, it } from 'vitest';
import { asPublicRevs, publicMapAnswerSchema, publicRevsSchema } from './requestNoLogin.types';

const LINK = {
  lists: [{ id: 'l1', name: 'Sample Rated Walls', phase: 'PH III', position: 1 }],
  revs: [{ id: 'r0', list_id: 'l1', number: 0, name: 'TOW' }],
  items: [{ id: 'i0', rev_id: 'r0', name: 'TOW - Speed Plugs', company: 'Sample Firestop Co', position: 1 }],
  areas: [
    { id: 'a1', list_id: 'l1', level: 'Level 01', name: 'Wall A', sheet_file_id: 'sheet-1', position: 1 },
    { id: 'a2', list_id: 'l1', level: 'Level 01', name: 'Wall B', sheet_file_id: null, position: 2 },
  ],
  status: [
    { area_id: 'a1', item_id: 'i0', status: 'requested' as const },
    { area_id: 'a2', item_id: 'i0', status: 'na' as const },
  ],
};

describe('the link\'s walls (0057)', () => {
  it('come in the member screens\' shapes, read-only, N/A marks from the status', () => {
    const out = asPublicRevs('job-s', publicRevsSchema.parse(LINK));
    expect(out.setup.lists[0]).toEqual({ id: 'l1', name: 'Sample Rated Walls', phase: 'PH III', position: 1, project_id: 'job-s', version: 0, deleted_at: null, permit_id: null });
    expect(out.setup.areas.map((a) => [a.id, a.sheet_file_id, a.project_id])).toEqual([['a1', 'sheet-1', 'job-s'], ['a2', null, 'job-s']]);
    expect(out.setup.marks.map((m) => [m.area_id, m.item_id, m.kind])).toEqual([['a2', 'i0', 'na']]);
    expect(out.status[0]).toEqual({ area_id: 'a1', item_id: 'i0', status: 'requested', request_id: null, ir_number: null, ofs_number: null, at: null, note: null });
  });

  it('never carry a failed status (the link shows it as open)', () => {
    expect(publicRevsSchema.safeParse({ ...LINK, status: [{ area_id: 'a1', item_id: 'i0', status: 'failed' }] }).success).toBe(false);
  });
});

describe('a link request\'s map (0057)', () => {
  const map = {
    number: 12, ofs_number: 4, phase: 'PH III', request_date: '2026-10-05', what: 'Level 01 TOW - Speed Plugs', sheet_file_id: 'sheet-1',
    page: 1, strokes: [{ c: 1, w: 0.01, p: [[0.1, 0.1], [0.2, 0.2]] }], legend: [{ color: 1, name: 'TOW - Speed Plugs' }], result: null,
    signed: false, version: 2, has_map: false, stale: true, can_edit: true, sheets: [{ file_id: 'sheet-1', label: 'Level 01' }],
  };

  it('is the map or null (a request without walls)', () => {
    expect(publicMapAnswerSchema.parse({ map }).map?.version).toBe(2);
    expect(publicMapAnswerSchema.parse({ map: null }).map).toBeNull();
  });

  it('fails loudly on strokes the database would refuse', () => {
    expect(publicMapAnswerSchema.safeParse({ map: { ...map, strokes: [{ c: 4, w: 0.01, p: [[0, 0], [1, 1]] }] } }).success).toBe(false);
  });
});
