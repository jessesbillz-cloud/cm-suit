// The request picker's rooms (Jesse, Oct 10: "the entire room first, and then if you wanted it, you expand it to just
// one wall and select from there"). Per level, the list's rooms (rooms.ts: rooms first, then the exterior and the
// shafts) each with its walls, and the walls in no room ("Other walls"). A tap on a room picks all its walls, or drops
// them when all are picked. A request that came with walls shows only the rooms and walls it came with until Add walls.
// Pure; tested in roomPick.test.ts.
import type { RevRooms } from '../../data/revs.rooms';
import type { RevArea, RevSetup } from '../../data/revs.types';
import { roomLabel, roomsByList } from './rooms';

export interface PickRoom {
  id: string;
  /** "0134 Main Electrical"; the exterior and a shaft by their name. */
  label: string;
  walls: RevArea[];
}

export interface RoomGroup {
  level: string;
  rooms: PickRoom[];
  /** This level's walls in no room. */
  others: RevArea[];
}

/** A list's rooms and the walls in none, by level. A room with no wall left is left out. */
export function roomGroups(setup: RevSetup, rooms: RevRooms, listId: string | null): RoomGroup[] {
  const list = roomsByList(setup, rooms).find((g) => g.list.id === listId);
  if (!list) return [];
  const areas = new Map(setup.areas.filter((a) => a.list_id === listId).map((a) => [a.id, a]));
  return list.levels
    .map((l) => ({
      level: l.level,
      rooms: l.rooms
        .map((r) => ({
          id: r.id,
          label: roomLabel(r),
          walls: rooms.walls.flatMap((w) => {
            const a = w.room_id === r.id ? areas.get(w.area_id) : undefined;
            return a ? [a] : [];
          }),
        }))
        .filter((r) => r.walls.length > 0),
      others: l.others,
    }))
    .filter((g) => g.rooms.length > 0 || g.others.length > 0);
}

/** The list has rooms to pick (else the picker shows the walls as today). */
export const hasRooms = (groups: readonly RoomGroup[]) => groups.some((g) => g.rooms.length > 0);

/** How many of a room's walls are picked. */
export function pickedIn(room: PickRoom, picked: readonly string[]): number {
  const set = new Set(picked);
  return room.walls.filter((a) => set.has(a.id)).length;
}

/** "4 walls", or "1 of 4 walls" while only some are picked. */
export function roomCountLabel(room: PickRoom, picked: readonly string[]): string {
  const total = room.walls.length;
  const on = pickedIn(room, picked);
  const walls = total === 1 ? 'wall' : 'walls';
  return on > 0 && on < total ? `${String(on)} of ${String(total)} ${walls}` : `${String(total)} ${walls}`;
}

/** The picked walls after a tap on a room: all of them, or none when all were picked. */
export function tapRoom(picked: readonly string[], room: PickRoom): string[] {
  const ids = new Set(room.walls.map((a) => a.id));
  if (pickedIn(room, picked) === room.walls.length) return picked.filter((id) => !ids.has(id));
  return [...picked, ...room.walls.map((a) => a.id).filter((id) => !picked.includes(id))];
}

/** Only the rooms holding a wall the request came with, and those of its walls in no room. */
export function nearGroups(groups: readonly RoomGroup[], near: readonly string[]): RoomGroup[] {
  const set = new Set(near);
  return groups
    .map((g) => ({ ...g, rooms: g.rooms.filter((r) => r.walls.some((a) => set.has(a.id))), others: g.others.filter((a) => set.has(a.id)) }))
    .filter((g) => g.rooms.length > 0 || g.others.length > 0);
}

/** Rooms plus walls in no room: what a view shows (to tell whether Add walls has more). */
export const shownCount = (groups: readonly RoomGroup[]) => groups.reduce((n, g) => n + g.rooms.length + g.others.length, 0);
