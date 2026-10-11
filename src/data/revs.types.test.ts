import { describe, expect, it } from 'vitest';
import {
  irMapContextSchema,
  irStrokesSchema,
  liveSetup,
  NO_WALL_DETAILS,
  ofsFiles,
  ofsNumberOf,
  parseArea,
  revStatusRowSchema,
  type OfsFileRow,
  type RevSetup,
} from './revs.types';

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
      { ...row, id: 'a2', list_id: 'l1', level: 'Level 02', name: 'Wall B', sheet_file_id: null, sheet_page: 1, geom: null, ...NO_WALL_DETAILS, position: 2 },
      { ...row, id: 'a1', list_id: 'l1', level: 'Level 01', name: 'Wall A', sheet_file_id: 'sheet', sheet_page: 1, geom: null, ...NO_WALL_DETAILS, position: 1 },
      { ...row, id: 'a9', list_id: 'l3', level: 'Level 01', name: 'On a removed list', sheet_file_id: null, sheet_page: 1, geom: null, ...NO_WALL_DETAILS, position: 1 },
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
  it("reads a wall's line on the plan (0059): 2 to 50 points of the page, or none", () => {
    const wall = {
      id: 'a1', project_id: 'job', list_id: 'l1', level: 'Level 02', name: 'Wall A', sheet_file_id: 'sheet', sheet_page: 2,
      position: 1, version: 1, deleted_at: null, ...NO_WALL_DETAILS,
    };
    expect(parseArea({ ...wall, geom: [[0.1, 0.2], [0.3, 0.2]] }).geom).toEqual([[0.1, 0.2], [0.3, 0.2]]);
    expect(parseArea({ ...wall, geom: null }).geom).toBeNull();
    expect(() => parseArea({ ...wall, geom: [[0.1, 0.2]] })).toThrow();
    expect(() => parseArea({ ...wall, geom: [[0.1, 1.2], [0.3, 0.2]] })).toThrow();
  });
});

const ofsRow = (id: string, name: string, extra: Partial<OfsFileRow> = {}): OfsFileRow => ({
  id, original_name: name, mime: 'application/pdf', created_at: '2026-09-21T10:00:00Z', upload_complete: true, scan_status: 'clean', ...extra,
});

describe('the OFS number in a file name (rev_ofs_name_has)', () => {
  it('OFS_IR_0041 or _OFS_0041_, four digits, or five and more with no leading zero', () => {
    expect(ofsNumberOf('OFS_IR_0041_Attachment.pdf')).toBe(41);
    expect(ofsNumberOf('ofs_ir_0041.pdf')).toBe(41);
    expect(ofsNumberOf('Sample_OFS_0052_map.pdf')).toBe(52);
    expect(ofsNumberOf('OFS_IR_12345.pdf')).toBe(12345);
  });
  it('near misses carry none', () => {
    expect(ofsNumberOf('OFS_IR_00411.pdf')).toBeNull();
    expect(ofsNumberOf('OFS_IR_041.pdf')).toBeNull();
    expect(ofsNumberOf('OFS_IR_0000.pdf')).toBeNull();
    expect(ofsNumberOf('Sample OFS 0041.pdf')).toBeNull();
    expect(ofsNumberOf('A201A Floor Plan.pdf')).toBeNull();
  });
});

describe("the job's OFS IRs by number", () => {
  it('one per number, the rule\'s pick (an Attachment or an OFS_IR name, then the newest), highest number first', () => {
    const list = ofsFiles([
      ofsRow('a', 'OFS_IR_0041.pdf', { created_at: '2026-09-20T10:00:00Z' }),
      ofsRow('b', 'Sample_OFS_0041_map.pdf', { created_at: '2026-09-25T10:00:00Z' }),
      ofsRow('c', 'OFS_IR_0041_Attachment.pdf', { created_at: '2026-09-22T10:00:00Z' }),
      ofsRow('d', 'Sample_OFS_0052_scan.jpg', { mime: 'image/jpeg' }),
      ofsRow('e', 'OFS_IR_0007.pdf'),
    ]);
    expect(list).toEqual([
      { ofs: 52, fileId: 'd', name: 'Sample_OFS_0052_scan.jpg' },
      { ofs: 41, fileId: 'c', name: 'OFS_IR_0041_Attachment.pdf' },
      { ofs: 7, fileId: 'e', name: 'OFS_IR_0007.pdf' },
    ]);
  });
  it('leaves out what the rule would not link: unfinished, infected, not a PDF or a picture', () => {
    expect(
      ofsFiles([
        ofsRow('a', 'OFS_IR_0041.pdf', { upload_complete: false }),
        ofsRow('b', 'OFS_IR_0042.pdf', { scan_status: 'infected' }),
        ofsRow('c', 'OFS_IR_0043.docx', { mime: 'application/msword' }),
      ]),
    ).toEqual([]);
  });
});
