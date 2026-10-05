import { describe, expect, it } from 'vitest';
import { NO_WALL_DETAILS, type RevSetup, type RevStatusRow } from '../../data/revs.types';
import {
  firstSheet, isDone, itemNeed, itemState, itemsByRev, mapWhat, pickWalls, prefillPick, requestItems, requestWalls,
  sheetCount, statusIndex, titlePreview, toggleItem, wallsByLevel, type RevPick,
} from './revPick';

const row = { project_id: 'job', version: 1, deleted_at: null };

// A live setup, in order (what useRevSetup answers): one list with two revs and five items, walls on two levels.
const SETUP: RevSetup = {
  lists: [{ ...row, id: 'l1', name: 'Sample Walls', phase: 'PH III', permit_id: null, position: 1 }],
  revs: [
    { ...row, id: 'r0', list_id: 'l1', number: 0, name: 'TOW' },
    { ...row, id: 'r2', list_id: 'l1', number: 2, name: 'CJ' },
  ],
  items: [
    { ...row, id: 'tow', rev_id: 'r0', name: 'TOW - Speed Plugs', company: null, position: 1 },
    { ...row, id: 'stuff', rev_id: 'r2', name: 'CJ Stuffing', company: null, position: 1 },
    { ...row, id: 'caulk', rev_id: 'r2', name: 'CJ Caulking', company: null, position: 2 },
    { ...row, id: 'tape', rev_id: 'r2', name: 'CJ Tape', company: null, position: 3 },
    { ...row, id: 'seal', rev_id: 'r2', name: 'CJ Seal', company: null, position: 4 },
  ],
  areas: [
    { ...row, id: 'w10', list_id: 'l1', level: 'Level 10', name: 'Wall Z', sheet_file_id: null, sheet_page: 1, geom: null, ...NO_WALL_DETAILS, position: 1 },
    { ...row, id: 'w1', list_id: 'l1', level: 'Level 02', name: 'Wall A', sheet_file_id: null, sheet_page: 1, geom: null, ...NO_WALL_DETAILS, position: 2 },
    { ...row, id: 'w2', list_id: 'l1', level: 'Level 02', name: 'Wall B', sheet_file_id: 'sheet-2', sheet_page: 1, geom: null, ...NO_WALL_DETAILS, position: 3 },
  ],
  marks: [],
};

function status(area: string, item: string, s: RevStatusRow['status']): RevStatusRow {
  return { area_id: area, item_id: item, status: s, request_id: null, ir_number: null, ofs_number: null, at: null, note: null };
}

// TOW passed on Wall A and N/A on Wall B; CJ Stuffing requested on Wall A and failed on Wall B.
const INDEX = statusIndex([
  status('w1', 'tow', 'passed'),
  status('w2', 'tow', 'na'),
  status('w1', 'stuff', 'requested'),
  status('w2', 'stuff', 'failed'),
]);

const pick = (areaIds: string[], itemIds: string[]): RevPick => ({ listId: 'l1', areaIds, itemIds });

describe('the walls and items to pick from', () => {
  it('groups walls by level in natural order (Level 2 before Level 10)', () => {
    expect(wallsByLevel(SETUP, 'l1').map((g) => [g.level, g.areas.map((a) => a.id)])).toEqual([
      ['Level 02', ['w1', 'w2']],
      ['Level 10', ['w10']],
    ]);
  });
  it('lists items under their revs, in order', () => {
    expect(itemsByRev(SETUP, 'l1').map((g) => [g.number, g.items.length])).toEqual([
      [0, 1],
      [2, 4],
    ]);
  });
  it('knows what each item still needs on the picked walls', () => {
    expect(itemNeed(INDEX, 'tow', ['w1', 'w2'])).toEqual({ open: 0, done: 2, requested: 0, failed: 0 });
    expect(isDone(itemNeed(INDEX, 'tow', ['w1', 'w2']))).toBe(true);
    expect(isDone(itemNeed(INDEX, 'tow', ['w1', 'w10']))).toBe(false);
    expect(itemNeed(INDEX, 'stuff', ['w1', 'w2'])).toEqual({ open: 2, done: 0, requested: 1, failed: 1 });
    // No wall picked: nothing is done yet.
    expect(isDone(itemNeed(INDEX, 'tow', []))).toBe(false);
  });
  it("gives each item's button one state: done, then requested, then failed, else open", () => {
    expect(itemState(INDEX, 'tow', ['w1', 'w2'])).toBe('done');
    // Done on one picked wall only: still open on the other.
    expect(itemState(INDEX, 'tow', ['w1', 'w10'])).toBe('open');
    expect(itemState(INDEX, 'stuff', ['w1', 'w2'])).toBe('requested');
    expect(itemState(INDEX, 'stuff', ['w2'])).toBe('failed');
    expect(itemState(INDEX, 'caulk', ['w1'])).toBe('open');
  });
});

describe('what the request carries', () => {
  it('colors the items 1..3 in list order, whatever order they were picked in', () => {
    const items = requestItems(SETUP, INDEX, pick(['w1'], ['caulk', 'stuff']));
    expect(items.map((r) => [r.item.id, r.color])).toEqual([
      ['stuff', 1],
      ['caulk', 2],
    ]);
  });
  it('leaves out an item done on every picked wall, and the walls with nothing left', () => {
    const items = requestItems(SETUP, INDEX, pick(['w1', 'w2'], ['tow', 'caulk']));
    expect(items.map((r) => r.item.id)).toEqual(['caulk']);
    const onlyTow = requestItems(SETUP, INDEX, pick(['w1'], ['tow']));
    expect(onlyTow).toEqual([]);
    expect(requestWalls(SETUP, INDEX, pick(['w1'], ['tow']), onlyTow)).toEqual([]);
  });
  it('orders the walls by level then place, and finds the first sheet', () => {
    const p = pick(['w10', 'w2', 'w1'], ['caulk']);
    const walls = requestWalls(SETUP, INDEX, p, requestItems(SETUP, INDEX, p));
    expect(walls.map((a) => a.id)).toEqual(['w1', 'w2', 'w10']);
    expect(firstSheet(walls)).toBe('sheet-2');
    expect(sheetCount(walls)).toBe(1);
  });
  it('writes the map title the way the map PDF does, with "new" for the numbers', () => {
    const p = pick(['w1', 'w2'], ['caulk', 'stuff']);
    const items = requestItems(SETUP, INDEX, p);
    const what = mapWhat(requestWalls(SETUP, INDEX, p, items), items);
    expect(what).toBe('Level 02 CJ Stuffing & CJ Caulking');
    expect(titlePreview('PH III', '2026-10-05', what)).toBe('IR new - OFS IR #new - PH III - 2026-10-05 - Level 02 CJ Stuffing & CJ Caulking');
    expect(titlePreview(null, '2026-10-05', '')).toBe('IR new - OFS IR #new - 2026-10-05');
  });
});

describe('picking', () => {
  it('takes three items at most', () => {
    let p = pick(['w1'], []);
    for (const id of ['stuff', 'caulk', 'tape', 'seal']) p = toggleItem(p, id);
    expect(p.itemIds).toEqual(['stuff', 'caulk', 'tape']);
    expect(toggleItem(p, 'caulk').itemIds).toEqual(['stuff', 'tape']);
  });
  it('keeps the walls in their order and drops an item the picked walls no longer need', () => {
    const p = pickWalls(SETUP, INDEX, pick(['w10'], ['tow', 'caulk']), []);
    // No wall left: the items stay, for when walls are picked again.
    expect(p.itemIds).toEqual(['tow', 'caulk']);
    const onLevel2 = pickWalls(SETUP, INDEX, p, ['w2', 'w1', 'nope']);
    expect(onLevel2.areaIds).toEqual(['w1', 'w2']);
    expect(onLevel2.itemIds).toEqual(['caulk']);
  });
  it('prefills from a link: one list, known ids only, items still needed, three at most', () => {
    const p = prefillPick(SETUP, INDEX, 'w2,w1,nope', 'seal,tow,tape,caulk,stuff');
    expect(p).toEqual({ listId: 'l1', areaIds: ['w1', 'w2'], itemIds: ['stuff', 'caulk', 'tape'] });
    expect(prefillPick(SETUP, INDEX, undefined, undefined)).toEqual({ listId: 'l1', areaIds: [], itemIds: [] });
  });
});
