import { describe, expect, it } from 'vitest';
import type { RevRoom, RevRooms, RevRoomWall } from '../../../data/revs.rooms';
import { NO_WALL_DETAILS, type Rev, type RevArea, type RevItem, type RevSetup, type RevStatusRow } from '../../../data/revs.types';
import { indexStatus } from '../model';
import { cardRevs, cardSave, cardWalls, firstPicks } from './cardSetup';

const base = { project_id: 'job', version: 1, deleted_at: null };
const rev = (n: number, name: string): Rev => ({ ...base, id: `r${String(n)}`, list_id: 'l1', number: n, name });
const item = (r: number, k: number, name: string): RevItem => ({ ...base, id: `i${String(r)}${String(k)}`, rev_id: `r${String(r)}`, name, company: null, position: k });
const wall = (n: number, name: string): RevArea => ({
  ...base, id: `a${String(n)}`, list_id: 'l1', level: 'Level 01', name, sheet_file_id: null, sheet_page: 1, geom: null, ...NO_WALL_DETAILS, position: n,
});
const link = (room: string, area: number, gone = false): RevRoomWall => ({
  ...base, id: `${room}-${String(area)}`, room_id: room, area_id: `a${String(area)}`, line: null, position: area, deleted_at: gone ? '2026-10-01T00:00:00Z' : null,
});
const ROOM: RevRoom = {
  ...base, id: 'mpoe', list_id: 'l1', level: 'Level 01', number: '101', name: 'MPOE', kind: 'room', image_name: null, image_file_id: null, position: 1, card_at: null,
};

const SETUP: RevSetup = {
  lists: [],
  revs: [rev(0, 'TOW'), rev(1, 'HOW - Cavity'), rev(2, 'Empty')],
  items: [item(0, 1, 'TOW - Speed Plugs'), item(1, 1, 'HOW Cavity Stuff'), item(1, 2, 'HOW Beam Pockets')],
  areas: [wall(1, 'MPOE north wall'), wall(2, 'MPOE east wall'), wall(3, 'Exterior wall at grid 7')],
  marks: [],
};
const ROOMS: RevRooms = { rooms: [ROOM], walls: [link('mpoe', 1), link('mpoe', 2)], out: [link('mpoe', 3, true)] };

const st = (area: string, itemId: string, status: RevStatusRow['status']): RevStatusRow => ({
  area_id: area, item_id: itemId, status, request_id: null, ir_number: null, ofs_number: null, at: null, note: null,
});

describe('a room card', () => {
  it('the walls: the room\'s in its order, then the ones taken out (off)', () => {
    const walls = cardWalls(SETUP, ROOMS, ROOM);
    expect(walls.map((w) => [w.area.id, w.title, w.inRoom])).toEqual([
      ['a1', 'North wall', true],
      ['a2', 'East wall', true],
      ['a3', 'Exterior wall at grid 7', false],
    ]);
  });

  it('the items under their revs, by their short names; one with history on a kept wall is locked in its state', () => {
    const index = indexStatus([st('a1', 'i01', 'passed'), st('a2', 'i11', 'failed'), st('a3', 'i12', 'requested')]);
    const revs = cardRevs(SETUP, index, 'l1', ['a1', 'a2']);
    expect(revs.map((r) => [r.rev.number, r.items.map((i) => [i.short, i.locked])])).toEqual([
      [0, [['Speed Plugs', 'passed']]],
      [1, [['Stuff', 'failed'], ['Beam Pockets', null]]],
    ]);
  });

  it('picked to start with: nothing the first time, what the walls still need once set up (locked ones are on anyway)', () => {
    const index = indexStatus([st('a1', 'i01', 'passed'), st('a1', 'i11', 'na'), st('a2', 'i11', 'na')]);
    const revs = cardRevs(SETUP, index, 'l1', ['a1', 'a2']);
    expect(firstPicks(ROOM, revs, index, ['a1', 'a2'])).toEqual([]);
    expect(firstPicks({ ...ROOM, card_at: '2026-10-12T17:00:00Z' }, revs, index, ['a1', 'a2'])).toEqual(['i12']);
  });

  it('Save sends the walls on and the items picked or locked, in order', () => {
    const index = indexStatus([st('a1', 'i01', 'passed')]);
    const walls = cardWalls(SETUP, ROOMS, ROOM);
    const revs = cardRevs(SETUP, index, 'l1', ['a1']);
    expect(cardSave(walls, new Set(['a3', 'a1']), revs, new Set(['i12']))).toEqual({ areaIds: ['a1', 'a3'], itemIds: ['i01', 'i12'] });
  });
});
