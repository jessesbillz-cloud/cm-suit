import { describe, expect, it } from 'vitest';
import type { Rev, RevItem, RevStatusRow } from '../../data/revs.types';
import type { WallRev } from './model';
import { calloutOf, countLine, countOf, firstPick, keepAskable, partStates, tapItem, tapPart, wallItems, type WallItem } from './wallPage';

const base = { project_id: 'job', version: 1, deleted_at: null };
const rev = (n: number, name: string): Rev => ({ ...base, id: `r${String(n)}`, list_id: 'l1', number: n, name });
const item = (r: number, k: number, name: string): RevItem => ({
  ...base, id: `i${String(r)}${String(k)}`, rev_id: `r${String(r)}`, name, company: null, position: k,
});
const cell = (itemId: string, status: RevStatusRow['status']): RevStatusRow => ({
  area_id: 'a1', item_id: itemId, status, request_id: null, ir_number: null, ofs_number: null, at: null, note: null,
});

/** A wall partway through: TOW passed, the cavity's spray failed, CJ requested, the drywall still open, one item N/A. */
const REVS: WallRev[] = [
  { rev: rev(0, 'TOW'), cells: [{ item: item(0, 1, 'TOW - Speed Plugs'), cell: cell('i01', 'passed') }] },
  {
    rev: rev(1, 'HOW - Cavity'),
    cells: [
      { item: item(1, 1, 'HOW Cavity Stuff'), cell: cell('i11', 'passed') },
      { item: item(1, 2, 'HOW Cavity Spray'), cell: cell('i12', 'failed') },
      { item: item(1, 3, 'HOW Beam Pockets'), cell: cell('i13', 'na') },
    ],
  },
  { rev: rev(2, 'CJ'), cells: [{ item: item(2, 1, 'CJ Stuffing'), cell: cell('i21', 'requested') }, { item: item(2, 2, 'CJ Caulking'), cell: cell('i22', 'open') }] },
  {
    rev: rev(3, 'Drywall'),
    cells: [
      { item: item(3, 1, 'First Side - First Layer'), cell: cell('i31', 'open') },
      { item: item(3, 2, 'First Side - Second Layer'), cell: cell('i32', 'open') },
    ],
  },
];
const ITEMS = wallItems(REVS);
const byId = (id: string): WallItem => {
  const hit = ITEMS.find((i) => i.item.id === id);
  if (!hit) throw new Error(id);
  return hit;
};

describe('a wall page', () => {
  it('lists every item in rev order with the part it inspects', () => {
    expect(ITEMS.map((i) => [i.item.id, i.part])).toEqual([
      ['i01', 'deck_flutes'],
      ['i11', 'head_of_wall_cavity'],
      ['i12', 'head_of_wall_cavity'],
      ['i13', 'beam_pockets'],
      ['i21', 'control_joint'],
      ['i22', 'control_joint'],
      ['i31', 'board_s1_l1'],
      ['i32', 'board_s1_l2'],
    ]);
  });

  it("tints each part by its most pressing item: failed, then requested, open, passed; N/A only when all are", () => {
    expect(partStates(ITEMS)).toEqual({
      deck_flutes: 'passed',
      head_of_wall_cavity: 'failed',
      beam_pockets: 'na',
      control_joint: 'requested',
      board_s1_l1: 'open',
      board_s1_l2: 'open',
    });
  });

  it('counts what the wall needs (N/A left out)', () => {
    const c = countOf(ITEMS.map((i) => i.cell.status));
    expect(c).toEqual({ needed: 7, passed: 2, requested: 1, failed: 1 });
    expect(countLine(c)).toBe('2 of 7 passed');
  });

  it('opens on the next item to ask for, picked for nothing yet', () => {
    expect(firstPick(ITEMS)).toEqual({ focus: 'i12', part: 'head_of_wall_cavity', picked: [] });
    expect(firstPick([])).toEqual({ focus: null, part: null, picked: [] });
  });

  it('a tap shows an item; one still to ask for is picked, a second tap drops it', () => {
    let s = firstPick(ITEMS);
    s = tapItem(s, byId('i31')).next;
    expect(s).toEqual({ focus: 'i31', part: 'board_s1_l1', picked: ['i31'] });
    s = tapItem(s, byId('i01')).next;
    expect(s).toEqual({ focus: 'i01', part: 'deck_flutes', picked: ['i31'] });
    s = tapItem(s, byId('i31')).next;
    expect(s.picked).toEqual([]);
    expect(s.focus).toBe('i31');
    // A requested item is shown, never picked again.
    expect(tapItem(s, byId('i21')).next.picked).toEqual([]);
  });

  it('picks three at most (OSFM: three colors on a map); the fourth is shown, not picked', () => {
    let s = firstPick(ITEMS);
    for (const id of ['i12', 'i22', 'i31']) s = tapItem(s, byId(id)).next;
    expect(s.picked).toEqual(['i12', 'i22', 'i31']);
    const fourth = tapItem(s, byId('i32'));
    expect(fourth.full).toBe(true);
    expect(fourth.next.picked).toEqual(['i12', 'i22', 'i31']);
    expect(fourth.next.focus).toBe('i32');
  });

  it("a tap on the drawing shows that part's first item, and steps through its items", () => {
    let s = firstPick(ITEMS);
    s = tapPart(s, 'control_joint', ITEMS);
    expect([s.focus, s.part]).toEqual(['i21', 'control_joint']);
    s = tapPart(s, 'control_joint', ITEMS);
    expect(s.focus).toBe('i22');
    s = tapPart(s, 'control_joint', ITEMS);
    expect(s.focus).toBe('i21');
    // A part no item names: just the part.
    expect(tapPart(s, 'studs', ITEMS)).toEqual({ focus: null, part: 'studs', picked: [] });
  });

  it('drops a picked item that passed or went N/A meanwhile', () => {
    const s = { focus: 'i22', part: 'control_joint' as const, picked: ['i22', 'i31'] };
    expect(keepAskable(s, ITEMS)).toBe(s);
    const later = ITEMS.map((i) => (i.item.id === 'i31' ? { ...i, cell: { ...i.cell, status: 'na' as const } } : i));
    expect(keepAskable(s, later).picked).toEqual(['i22']);
  });

  it("splits a wall's name from its grid or room in brackets", () => {
    expect(calloutOf('Corridor 110 north wall (B / 2–5)')).toEqual({ title: 'Corridor 110 north wall', sub: 'B / 2–5' });
    expect(calloutOf('Electrical 0242 / IDF 0240')).toEqual({ title: 'Electrical 0242 / IDF 0240', sub: null });
    // Brackets inside the name are part of it.
    expect(calloutOf('  Stair (2) landing  ')).toEqual({ title: 'Stair (2) landing', sub: null });
  });
});
