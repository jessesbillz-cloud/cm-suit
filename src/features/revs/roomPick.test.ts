import { describe, expect, it } from 'vitest';
import type { RevRoom, RevRoomWall, RevRooms } from '../../data/revs.rooms';
import { NO_WALL_DETAILS, type RevArea, type RevSetup } from '../../data/revs.types';
import { hasRooms, nearGroups, roomCountLabel, roomGroups, shownCount, tapRoom } from './roomPick';

const base = { project_id: 'job', version: 1, deleted_at: null };
const wall = (n: number, level: string, name: string, list = 'l1'): RevArea => ({
  ...base, id: `a${String(n)}`, list_id: list, level, name, sheet_file_id: null, sheet_page: 1, geom: null, ...NO_WALL_DETAILS, position: n,
});
const room = (id: string, level: string, number: string, name: string, kind: RevRoom['kind'], position: number): RevRoom => ({
  ...base, id, list_id: 'l1', level, number, name, kind, image_name: null, image_file_id: null, position,
});
const link = (roomId: string, area: number, position = area): RevRoomWall => ({
  ...base, id: `${roomId}-${String(area)}`, room_id: roomId, area_id: `a${String(area)}`, line: null, position,
});

const SETUP: RevSetup = {
  lists: [
    { ...base, id: 'l1', name: 'Sample Rated Walls', phase: null, permit_id: null, position: 1 },
    { ...base, id: 'l2', name: 'Sample Other List', phase: null, permit_id: null, position: 2 },
  ],
  revs: [],
  items: [],
  areas: [
    wall(1, 'Level 10', 'North (A / 1)'), wall(2, 'Level 2', 'East'), wall(3, 'Level 2', 'South'), wall(4, 'level 2 ', 'Shaft wall'),
    wall(5, 'Level 2', 'West'), wall(9, 'Level 1', 'Elsewhere', 'l2'),
  ],
  marks: [],
};

// Room 0134's walls in the room's own order (South before East); room 0200 lost its only wall (a9 is not on this list).
const ROOMS: RevRooms = {
  rooms: [
    room('s1', 'Level 2', 'S1', 'Stair 1', 'shaft', 1),
    room('r134', 'Level 2', '0134', 'Main Electrical', 'room', 2),
    room('r200', 'Level 2', '0200', 'Gone', 'room', 3),
  ],
  walls: [link('r134', 3, 1), link('r134', 2, 2), link('r134', 4, 3), link('s1', 4), link('r200', 9)],
};

describe('roomGroups', () => {
  it('per level in natural order: the rooms first (a room before a shaft), their walls in the room\'s order, then the walls in no room', () => {
    const groups = roomGroups(SETUP, ROOMS, 'l1');
    expect(groups.map((g) => g.level)).toEqual(['Level 2', 'Level 10']);
    const [two, ten] = groups;
    expect(two?.rooms.map((r) => [r.label, r.walls.map((a) => a.id)])).toEqual([
      ['0134 Main Electrical', ['a3', 'a2', 'a4']],
      ['Stair 1', ['a4']],
    ]);
    expect(two?.others.map((a) => a.id)).toEqual(['a5']);
    expect(ten?.rooms).toEqual([]);
    expect(ten?.others.map((a) => a.id)).toEqual(['a1']);
    expect(hasRooms(groups)).toBe(true);
  });

  it('a list with no rooms has none to pick', () => {
    expect(hasRooms(roomGroups(SETUP, ROOMS, 'l2'))).toBe(false);
    expect(hasRooms(roomGroups(SETUP, { rooms: [], walls: [] }, 'l1'))).toBe(false);
    expect(roomGroups(SETUP, ROOMS, 'nope')).toEqual([]);
  });
});

describe('picking a room', () => {
  const r134 = roomGroups(SETUP, ROOMS, 'l1')[0]?.rooms[0];
  if (!r134) throw new Error('no room');

  it('a tap picks every wall of the room, keeping what was picked; a second tap drops them', () => {
    const on = tapRoom(['a5'], r134);
    expect(on).toEqual(['a5', 'a3', 'a2', 'a4']);
    expect(tapRoom(on, r134)).toEqual(['a5']);
  });

  it('a room partly picked fills up on a tap', () => {
    expect(tapRoom(['a2'], r134)).toEqual(['a2', 'a3', 'a4']);
  });

  it('says how many walls, and how many are picked while only some are', () => {
    expect(roomCountLabel(r134, [])).toBe('3 walls');
    expect(roomCountLabel(r134, ['a2', 'a3', 'a4'])).toBe('3 walls');
    expect(roomCountLabel(r134, ['a2'])).toBe('1 of 3 walls');
    const stair = roomGroups(SETUP, ROOMS, 'l1')[0]?.rooms[1];
    expect(stair && roomCountLabel(stair, [])).toBe('1 wall');
  });
});

describe('a request that came with walls', () => {
  it('shows only the rooms holding them and those of them in no room', () => {
    const groups = roomGroups(SETUP, ROOMS, 'l1');
    const near = nearGroups(groups, ['a2', 'a1']);
    expect(near.map((g) => [g.level, g.rooms.map((r) => r.id), g.others.map((a) => a.id)])).toEqual([
      ['Level 2', ['r134'], []],
      ['Level 10', [], ['a1']],
    ]);
    expect(shownCount(near)).toBe(2);
    expect(shownCount(groups)).toBe(4);
  });
});
