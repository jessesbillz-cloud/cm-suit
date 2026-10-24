import { describe, expect, it } from 'vitest';
import type { RevRooms } from '../../../data/revs.rooms';
import { NO_WALL_DETAILS, type Rev, type RevArea, type RevItem, type RevSetup, type RevStatusRow } from '../../../data/revs.types';
import { indexStatus } from '../model';
import { barLine, cellKey, inBasket, reviewGroups, roomItems } from './basketModel';

const base = { project_id: 'job', version: 1, deleted_at: null };
const rev = (n: number, name: string): Rev => ({ ...base, id: `r${String(n)}`, list_id: 'l1', number: n, name });
const item = (r: number, k: number, name: string): RevItem => ({ ...base, id: `i${String(r)}${String(k)}`, rev_id: `r${String(r)}`, name, company: null, position: k });
const wall = (n: number, name: string, extra: Partial<RevArea> = {}): RevArea => ({
  ...base, id: `a${String(n)}`, list_id: 'l1', level: 'Level 03', name, sheet_file_id: null, sheet_page: 1, geom: null, ...NO_WALL_DETAILS, position: n, ...extra,
});
const row = (area: string, itemId: string, status: RevStatusRow['status']): RevStatusRow => ({
  area_id: area, item_id: itemId, status, request_id: null, ir_number: null, ofs_number: null, at: null, note: null,
});

const SETUP: RevSetup = {
  lists: [{ ...base, id: 'l1', name: 'Sample Rated Walls', phase: null, permit_id: null, position: 1 }],
  revs: [rev(0, 'TOW'), rev(1, 'HOW')],
  items: [item(0, 1, 'Top of wall'), item(1, 1, 'HOW Stuff'), item(1, 2, 'HOW Spray')],
  areas: [
    wall(1, '0302 Classroom north wall', { wall_tag: 'F6a', rating: '1 HR', ul_design: 'U419', sheet_ref: 'A201' }),
    wall(2, '0302 Classroom south wall'),
    wall(3, '0302 Classroom east wall'),
  ],
  marks: [],
};
// North: top of wall passed, spray failed. South: stuff asked for. East: spray not applicable.
const STATUS = indexStatus([row('a1', 'i01', 'passed'), row('a2', 'i11', 'requested'), row('a3', 'i12', 'na'), row('a1', 'i12', 'failed')]);
const ROOMS: RevRooms = {
  rooms: [{ ...base, id: 'm1', list_id: 'l1', level: 'Level 03', number: '0302', name: 'Classroom', kind: 'room', image_name: null, image_file_id: null, position: 1, card_at: null, card_locked_at: null, card_locked_by: null }],
  walls: [1, 2, 3].map((n) => ({ ...base, id: `w${String(n)}`, room_id: 'm1', area_id: `a${String(n)}`, line: null, position: n })),
  out: [],
};

describe('the request being built', () => {
  it('says what is in it: items (a wall x item each) on walls', () => {
    expect(barLine([{ area_id: 'a1', item_id: 'i01' }])).toBe('1 item on 1 wall');
    expect(barLine([{ area_id: 'a1', item_id: 'i01' }, { area_id: 'a1', item_id: 'i11' }, { area_id: 'a2', item_id: 'i01' }])).toBe('3 items on 2 walls');
  });

  it('whole room: per item, the walls it would add (not passed, asked for or N/A, not in already)', () => {
    const inIt = inBasket([{ area_id: 'a2', item_id: 'i01' }]);
    expect(inIt.has(cellKey('a2', 'i01'))).toBe(true);
    const revs = roomItems(SETUP, STATUS, SETUP.areas, inIt);
    const by = Object.fromEntries(revs.flatMap((r) => r.items.map((i) => [i.item.id, [i.toAdd, i.inIt]])));
    // Top of wall: north passed, south in already, east to add. Stuff: south asked for. Spray: north failed (asked
    // again), south open, east N/A.
    expect(by).toEqual({ i01: [1, 1], i11: [2, 0], i12: [2, 0] });
  });

  it("names Send's requests: the item, its OFS number, each wall with its room and its facts", () => {
    const groups = reviewGroups(
      { version: 3, may_number: false, cells: [], groups: [{ item_id: 'i01', area_ids: ['a1', 'a2'], ofs_number: 105 }] },
      SETUP,
      ROOMS,
    );
    expect(groups.map((g) => [g.item.name, g.rev?.name, g.ofsNumber])).toEqual([['Top of wall', 'TOW', 105]]);
    expect(groups[0]?.walls.map((w) => [w.label, w.facts])).toEqual([
      ['0302 Classroom · North wall', 'F6a · 1 HR · UL U419 · A201'],
      ['0302 Classroom · South wall', 'UL —'],
    ]);
  });
});
