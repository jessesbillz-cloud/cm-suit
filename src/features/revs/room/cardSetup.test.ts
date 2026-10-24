import { describe, expect, it } from 'vitest';
import type { RevRoom, RevRooms, RevRoomWall } from '../../../data/revs.rooms';
import { NO_WALL_DETAILS, type Rev, type RevArea, type RevItem, type RevSetup, type RevStatusRow } from '../../../data/revs.types';
import { indexStatus } from '../model';
import { allWalls, boxKey, boxNow, boxShown, cardRevs, cardWalls, changeList, changesLine, flipBox, setAllWalls, type CardChanges } from './cardSetup';

const base = { project_id: 'job', version: 1, deleted_at: null };
const rev = (n: number, name: string): Rev => ({ ...base, id: `r${String(n)}`, list_id: 'l1', number: n, name });
const item = (r: number, k: number, name: string): RevItem => ({ ...base, id: `i${String(r)}${String(k)}`, rev_id: `r${String(r)}`, name, company: null, position: k });
const wall = (n: number, name: string): RevArea => ({
  ...base, id: `a${String(n)}`, list_id: 'l1', level: 'Level 01', name, sheet_file_id: null, sheet_page: 1, geom: null, ...NO_WALL_DETAILS, position: n,
});
const link = (room: string, area: number): RevRoomWall => ({
  ...base, id: `${room}-${String(area)}`, room_id: room, area_id: `a${String(area)}`, line: null, position: area,
});
const ROOM: RevRoom = {
  ...base, id: 'mpoe', list_id: 'l1', level: 'Level 01', number: '101', name: 'MPOE', kind: 'room', image_name: null, image_file_id: null, position: 1, card_at: null, card_locked_at: null, card_locked_by: null,
};

const SETUP: RevSetup = {
  lists: [],
  revs: [rev(0, 'TOW'), rev(1, 'HOW - Cavity'), rev(2, 'Empty')],
  items: [item(0, 1, 'TOW - Speed Plugs'), item(1, 1, 'HOW Cavity Stuff'), item(1, 2, 'HOW Beam Pockets')],
  areas: [wall(1, 'MPOE north wall'), wall(2, 'MPOE east wall'), wall(3, 'Exterior wall at grid 7')],
  marks: [],
};
const ROOMS: RevRooms = { rooms: [ROOM], walls: [link('mpoe', 1), link('mpoe', 2)], out: [] };

const st = (area: string, itemId: string, status: RevStatusRow['status'], at: string | null = null): RevStatusRow => ({
  area_id: area, item_id: itemId, status, request_id: null, ir_number: null, ofs_number: null, at, note: null,
});
const NONE: CardChanges = new Map();

describe('a room card', () => {
  it('the walls: the room\'s, in its order, by their bubble names', () => {
    expect(cardWalls(SETUP, ROOMS, ROOM).map((w) => [w.area.id, w.title])).toEqual([['a1', 'North wall'], ['a2', 'East wall']]);
  });

  it('the items under their revs by their short names, revs with none left out', () => {
    expect(cardRevs(SETUP, 'l1').map((r) => [r.rev.number, r.items.map((i) => i.short)])).toEqual([
      [0, ['Speed Plugs']],
      [1, ['Stuff', 'Beam Pockets']],
    ]);
  });

  it('each box in its card word: open is needed, N/A not needed, history kept with its day', () => {
    const index = indexStatus([st('a1', 'i01', 'passed', '2026-10-02T19:00:00Z'), st('a2', 'i11', 'requested'), st('a2', 'i12', 'na'), st('a1', 'i12', 'failed')]);
    expect(boxNow(index, 'a1', 'i01')).toEqual({ state: 'signed_off', at: '2026-10-02T19:00:00Z' });
    expect(['a2:i11', 'a2:i12', 'a1:i12', 'a1:i11'].map((k) => boxNow(index, k.split(':')[0] ?? '', k.split(':')[1] ?? '').state)).toEqual([
      'asked_for', 'not_needed', 'failed', 'needed',
    ]);
  });

  it('a tap turns Needed over and back (no longer a change); a signed-off box never changes', () => {
    const index = indexStatus([st('a1', 'i01', 'passed')]);
    const k = boxKey('a2', 'i01');
    const once = flipBox(NONE, boxNow(index, 'a2', 'i01'), k);
    expect(boxShown(boxNow(index, 'a2', 'i01'), once, k)).toBe('not_needed');
    expect(once.size).toBe(1);
    expect(flipBox(once, boxNow(index, 'a2', 'i01'), k).size).toBe(0);
    expect(flipBox(NONE, boxNow(index, 'a1', 'i01'), boxKey('a1', 'i01'))).toBe(NONE);
  });

  it('All walls: needed on every wall, then not needed on any; kept boxes stay; Some in between', () => {
    const walls = cardWalls(SETUP, ROOMS, ROOM);
    const index = indexStatus([st('a1', 'i11', 'requested'), st('a2', 'i12', 'na')]);
    expect(allWalls(index, walls, 'i11', NONE)).toBe('needed');
    expect(allWalls(index, walls, 'i12', NONE)).toBe('some');
    const on = setAllWalls(index, walls, 'i12', NONE);
    expect(changeList(on)).toEqual([{ area_id: 'a2', item_id: 'i12', needed: true }]);
    expect(allWalls(index, walls, 'i12', on)).toBe('needed');
    const off = setAllWalls(index, walls, 'i11', NONE);
    expect(changeList(off)).toEqual([{ area_id: 'a2', item_id: 'i11', needed: false }]);
    expect(allWalls(indexStatus([st('a1', 'i01', 'passed'), st('a2', 'i01', 'requested')]), walls, 'i01', NONE)).toBe('locked');
  });

  it('the bar says how many changes', () => {
    expect([0, 1, 3].map(changesLine)).toEqual(['No changes', '1 change', '3 changes']);
  });
});
