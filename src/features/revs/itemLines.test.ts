import { describe, expect, it } from 'vitest';
import { NO_WALL_DETAILS, type Rev, type RevArea, type RevItem, type RevSetup, type RevStatusRow } from '../../data/revs.types';
import { indexStatus } from './model';
import { itemChipName, itemChipText, itemLines, shortItem, shortRev } from './itemLines';
import { indexSignoffFiles } from './revStrip';

const base = { project_id: 'job', version: 1, deleted_at: null };
const rev = (n: number, name: string, list = 'l1'): Rev => ({ ...base, id: `r${String(n)}${list}`, list_id: list, number: n, name });
const item = (r: string, k: number, name: string): RevItem => ({ ...base, id: `${r}-i${String(k)}`, rev_id: r, name, company: null, position: k });
const AREA: RevArea = {
  ...base, id: 'a1', list_id: 'l1', level: 'Level 01', name: 'Electrical 0134 north wall', sheet_file_id: null, sheet_page: 1, geom: null,
  ...NO_WALL_DETAILS, position: 1,
};

describe('short names', () => {
  it("a rev's separators read as a space", () => {
    expect(shortRev('HOW - Cavity')).toBe('HOW Cavity');
    expect(shortRev('In-Wall Final')).toBe('In-Wall Final');
    expect(shortRev(' HOW · Surface ')).toBe('HOW Surface');
  });

  it('an item drops the leading words it shares with its rev', () => {
    expect(shortItem('HOW Cavity Stuff', 'HOW - Cavity')).toBe('Stuff');
    expect(shortItem('HOW Beam Pockets', 'HOW - Cavity')).toBe('Beam Pockets');
    expect(shortItem('TOW - Speed Plugs', 'TOW')).toBe('Speed Plugs');
    expect(shortItem('In-Wall Final - OK to Cover - Slab firestopping', 'In-Wall Final')).toBe('OK to Cover - Slab firestopping');
    expect(shortItem('cj · Stuffing', 'CJ')).toBe('Stuffing');
  });

  it('keeps the whole name when nothing is shared or nothing would be left', () => {
    expect(shortItem('First Side - First Layer', 'Drywall')).toBe('First Side - First Layer');
    expect(shortItem('BOX Caulking', 'HOW - Surface')).toBe('BOX Caulking');
    expect(shortItem('Final', 'Final')).toBe('Final');
    // A word that only starts like the rev's is not shared.
    expect(shortItem('TOWER bracing', 'TOW')).toBe('TOWER bracing');
    // "In-Wall" is one word: "In" alone is not the rev.
    expect(shortItem('In Wall Electrical', 'In-Wall')).toBe('In Wall Electrical');
  });
});

describe("a wall's item lines", () => {
  const REVS = [rev(0, 'TOW'), rev(1, 'HOW - Cavity'), rev(2, 'Empty'), rev(3, 'Drywall'), rev(0, 'Site', 'l2')];
  const SETUP: RevSetup = {
    lists: [],
    revs: REVS,
    items: [
      item('r0l1', 1, 'TOW - Speed Plugs'),
      item('r1l1', 1, 'HOW Cavity Stuff'), item('r1l1', 2, 'HOW Cavity Spray'), item('r1l1', 3, 'HOW Beam Pockets'),
      item('r3l1', 1, 'First Side - First Layer'), item('r3l1', 2, 'First Side - Second Layer'),
      item('r0l2', 1, 'Site walk'),
    ],
    areas: [AREA],
    marks: [],
  };
  const row = (itemId: string, status: RevStatusRow['status'], extra: Partial<RevStatusRow> = {}): RevStatusRow => ({
    area_id: 'a1', item_id: itemId, status, request_id: null, ir_number: null, ofs_number: null, at: null, note: null, ...extra,
  });
  const index = indexStatus([
    // Signed off before the app with OFS 40, its file linked.
    row('r0l1-i1', 'passed', { ofs_number: 40 }),
    // Passed through the app (OFS 42): no sign-off file, even with one on another item.
    row('r1l1-i1', 'passed', { request_id: 'q', ir_number: 9, ofs_number: 42 }),
    row('r1l1-i2', 'failed', { request_id: 'q', note: 'gaps' }),
    row('r1l1-i3', 'requested', { request_id: 'q2' }),
    row('r3l1-i2', 'na'),
  ]);
  const files = indexSignoffFiles([
    { area_id: 'a1', item_id: 'r0l1-i1', file_id: 'f40' },
    { area_id: 'a1', item_id: 'r1l1-i1', file_id: 'f-old' },
  ]);
  const lines = itemLines(SETUP, index, AREA, files);
  const chip = (r: number, k: number) => {
    const c = lines[r]?.chips[k];
    if (!c) throw new Error('no chip');
    return c;
  };

  it("one line per rev of the wall's list that has items, in order, with its short name", () => {
    expect(lines.map((l) => l.label)).toEqual(['TOW', 'HOW Cavity', 'Drywall']);
    expect(lines.map((l) => l.chips.map((c) => c.short))).toEqual([
      ['Speed Plugs'],
      ['Stuff', 'Spray', 'Beam Pockets'],
      ['First Side - First Layer', 'First Side - Second Layer'],
    ]);
  });

  it('each item its own state; passed ones with their OFS number and a sign-off file only before the app', () => {
    expect(lines.flatMap((l) => l.chips.map((c) => c.status))).toEqual(['passed', 'passed', 'failed', 'requested', 'open', 'na']);
    expect(chip(0, 0)).toMatchObject({ ofsNumber: 40, fileId: 'f40' });
    expect(chip(1, 0)).toMatchObject({ ofsNumber: 42, fileId: null });
    expect(chip(1, 1)).toMatchObject({ ofsNumber: null, fileId: null });
  });

  it('short words on the chip, the whole name spoken', () => {
    expect(itemChipText(chip(1, 0))).toBe('Stuff · 0042');
    expect(itemChipText(chip(1, 2))).toBe('Beam Pockets');
    expect(itemChipName(chip(1, 0))).toBe('HOW Cavity Stuff: Passed, OFS 0042');
    expect(itemChipName(chip(2, 1))).toBe('First Side - Second Layer: N/A');
  });
});
