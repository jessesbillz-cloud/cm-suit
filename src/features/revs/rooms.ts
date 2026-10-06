// Rooms worked out for the screens (0083; Jesse, Oct 5: "Room and then you click on the room and it breaks it down
// into the walls ... All the exterior walls would come together"). Per list and level: the rooms (rooms first, then the
// exterior and the shafts, each in its place), and the walls in no room ("Other walls", so nothing is lost). A room's
// tally is every item of its walls; its walls in their order, each with its line on the image and its color (the plan's
// colors, planGeom). Pure; tested in rooms.test.ts.
import type { RevRoom, RevRoomWall, RevRooms } from '../../data/revs.rooms';
import type { RevArea, RevList, RevSetup, WallLine } from '../../data/revs.types';
import { wallRevs, type StatusIndex } from './model';
import { toneColor, wallTone } from './plan/planGeom';
import { calloutOf, countOf, type WallCount } from './wallPage';

const KIND_ORDER: Record<RevRoom['kind'], number> = { room: 0, exterior: 1, shaft: 2 };

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

interface RoomLevel {
  level: string;
  rooms: RevRoom[];
  /** Walls of this level in no room. */
  others: RevArea[];
}

interface RoomList {
  list: RevList;
  levels: RoomLevel[];
}

/** Every list with its levels (natural order: Level 2 before Level 10), each with its rooms and the walls in none. */
export function roomsByList(setup: RevSetup, rooms: RevRooms): RoomList[] {
  const inRoom = new Set(rooms.walls.map((w) => w.area_id));
  return setup.lists
    .map((list) => {
      const listRooms = rooms.rooms.filter((r) => r.list_id === list.id);
      const areas = setup.areas.filter((a) => a.list_id === list.id);
      const names: string[] = [];
      for (const l of [...listRooms.map((r) => r.level), ...areas.map((a) => a.level)]) {
        if (!names.some((n) => same(n, l))) names.push(l.trim());
      }
      names.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
      const levels = names.map((level) => ({
        level,
        rooms: listRooms
          .filter((r) => same(r.level, level))
          .sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.position - b.position),
        others: areas.filter((a) => same(a.level, level) && !inRoom.has(a.id)),
      }));
      return { list, levels };
    })
    .filter((g) => g.levels.length > 0);
}

/** A room as it is called: "0242 Electrical"; the exterior and a shaft by their name. */
export function roomLabel(room: Pick<RevRoom, 'kind' | 'number' | 'name'>): string {
  return room.kind === 'room' ? `${room.number} ${room.name}` : room.name;
}

export interface RoomWall {
  link: RevRoomWall;
  area: RevArea;
  count: WallCount;
  color: string;
  title: string;
}

/** A room's walls in their order (a removed wall is left out), each with its tally and color. */
export function roomWalls(setup: RevSetup, index: StatusIndex, rooms: RevRooms, roomId: string): RoomWall[] {
  const out: RoomWall[] = [];
  for (const link of rooms.walls.filter((w) => w.room_id === roomId)) {
    const area = setup.areas.find((a) => a.id === link.area_id);
    if (!area) continue;
    const count = countOf(wallRevs(setup, index, area).flatMap((r) => r.cells.map((c) => c.cell.status)));
    out.push({ link, area, count, color: toneColor(wallTone(count)), title: calloutOf(area.name).title });
  }
  return out;
}

/** A room's tally: every item of every one of its walls. */
export function roomCount(walls: readonly RoomWall[]): WallCount {
  return walls.reduce(
    (t, w) => ({
      needed: t.needed + w.count.needed,
      passed: t.passed + w.count.passed,
      requested: t.requested + w.count.requested,
      failed: t.failed + w.count.failed,
    }),
    { needed: 0, passed: 0, requested: 0, failed: 0 },
  );
}

/** The rooms a wall is in, in the rooms' order (a shared wall is in two). */
export function roomsOfWall(rooms: RevRooms, areaId: string): { room: RevRoom; line: WallLine | null }[] {
  return rooms.rooms.flatMap((room) => {
    const link = rooms.walls.find((w) => w.room_id === room.id && w.area_id === areaId);
    return link ? [{ room, line: link.line }] : [];
  });
}

/** Walls of the room's list that are not in it yet: what Add wall offers, on the room's level first. */
export function wallsToAdd(setup: RevSetup, room: RevRoom, walls: readonly RoomWall[]): RevArea[] {
  const inIt = new Set(walls.map((w) => w.area.id));
  return setup.areas
    .filter((a) => a.list_id === room.list_id && !inIt.has(a.id))
    .sort((a, b) => Number(!same(a.level, room.level)) - Number(!same(b.level, room.level)));
}
