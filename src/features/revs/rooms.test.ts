import { describe, expect, it } from 'vitest';
import type { RevRoom, RevRoomWall, RevRooms } from '../../data/revs.rooms';
import { NO_WALL_DETAILS, type RevArea, type RevSetup, type RevStatusRow } from '../../data/revs.types';
import { indexStatus } from './model';
import { roomCount, roomLabel, roomsByList, roomsOfWall, roomWalls, wallsToAdd } from './rooms';

const base = { project_id: 'job', version: 1, deleted_at: null };
const wall = (n: number, level: string, name: string): RevArea => ({
  ...base, id: `a${String(n)}`, list_id: 'l1', level, name, sheet_file_id: null, sheet_page: 1, geom: null, ...NO_WALL_DETAILS, position: n,
});
const room = (id: string, level: string, number: string, name: string, kind: RevRoom['kind'], position: number): RevRoom => ({
  ...base, id, list_id: 'l1', level, number, name, kind, image_file_id: null, position,
});
const link = (roomId: string, area: number, line: RevRoomWall['line'] = null): RevRoomWall => ({
  ...base, id: `${roomId}-${String(area)}`, room_id: roomId, area_id: `a${String(area)}`, line, position: area,
});

const SETUP: RevSetup = {
  lists: [{ ...base, id: 'l1', name: 'Sample Rated Walls', phase: null, permit_id: null, position: 1 }],
  revs: [{ ...base, id: 'r0', list_id: 'l1', number: 0, name: 'TOW' }],
  items: [
    { ...base, id: 'i1', rev_id: 'r0', name: 'TOW One', company: null, position: 1 },
    { ...base, id: 'i2', rev_id: 'r0', name: 'TOW Two', company: null, position: 2 },
  ],
  areas: [wall(1, 'Level 10', 'North (A / 1)'), wall(2, 'Level 2', 'East'), wall(3, 'Level 2', 'South'), wall(4, 'level 2 ', 'Shaft wall')],
  marks: [],
};

const ROOMS: RevRooms = {
  rooms: [room('ext', 'Level 2', 'EXT', 'Exterior', 'exterior', 1), room('s1', 'Level 2', 'S1', 'Stair 1', 'shaft', 2), room('r205', 'Level 2', '205', 'Electrical', 'room', 3)],
  walls: [link('r205', 2, [[0.1, 0.1], [0.9, 0.1]]), link('r205', 3), link('s1', 4), link('ext', 3)],
};

const st = (area: string, item: string, status: RevStatusRow['status']): RevStatusRow => ({
  area_id: area, item_id: item, status, request_id: null, ir_number: null, ofs_number: null, at: null, note: null,
});

describe('roomsByList', () => {
  it('per level in natural order: rooms first, then the exterior and the shafts, and the walls in no room', () => {
    const [g] = roomsByList(SETUP, ROOMS);
    expect(g?.levels.map((l) => l.level)).toEqual(['Level 2', 'Level 10']);
    expect(g?.levels[0]?.rooms.map((r) => r.id)).toEqual(['r205', 'ext', 's1']);
    expect(g?.levels[0]?.others).toEqual([]);
    expect(g?.levels[1]?.rooms).toEqual([]);
    expect(g?.levels[1]?.others.map((a) => a.id)).toEqual(['a1']);
  });
  it('with no rooms every wall is under its level', () => {
    const [g] = roomsByList(SETUP, { rooms: [], walls: [] });
    expect(g?.levels.flatMap((l) => l.others.map((a) => a.id))).toEqual(['a2', 'a3', 'a4', 'a1']);
  });
});

describe('a room', () => {
  it('is called by its number and name, the exterior and a shaft by name', () => {
    expect(roomLabel({ kind: 'room', number: '0242', name: 'Electrical' })).toBe('0242 Electrical');
    expect(roomLabel({ kind: 'exterior', number: 'EXT', name: 'Exterior' })).toBe('Exterior');
  });
  it('tallies every item of its walls, and colors each wall', () => {
    const index = indexStatus([st('a2', 'i1', 'passed'), st('a2', 'i2', 'passed'), st('a3', 'i1', 'failed')]);
    const walls = roomWalls(SETUP, index, ROOMS, 'r205');
    expect(walls.map((w) => [w.area.id, w.title, w.link.line !== null])).toEqual([['a2', 'East', true], ['a3', 'South', false]]);
    expect(walls[0]?.color).toBe('var(--status-approved-solid)');
    expect(walls[1]?.color).toBe('var(--status-not_approved-solid)');
    expect(roomCount(walls)).toEqual({ needed: 4, passed: 2, requested: 0, failed: 1 });
  });
  it('a shared wall is in both rooms; Add wall offers the rest of its level only', () => {
    expect(roomsOfWall(ROOMS, 'a3').map((r) => r.room.id)).toEqual(['ext', 'r205']);
    const r205 = ROOMS.rooms[2];
    if (!r205) throw new Error('no room');
    expect(wallsToAdd(SETUP, r205, roomWalls(SETUP, indexStatus([]), ROOMS, 'r205')).map((a) => a.id)).toEqual(['a4']);
  });
});
