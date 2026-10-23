// e2e mock of a wall added on the spot (0113) with the database's rules in short form: whoever files OFS requests (or
// manages the cards) adds a room's wall to the card's list, a new room on the level when its number isn't there yet;
// the wall is "<number> <name> <side> wall" (or the short name), the same wall again is that wall; a tag another wall
// of the job has brings its rating, UL design and sheet number; added by someone who doesn't manage the cards it is
// marked, and each manager has a line in Needs you until one confirms it, edits its details or removes it.
import { parseProjectSettings } from '../../lib/settings';
import type { FieldWall } from '../revs.field';
import type { RevRoom } from '../revs.rooms';
import type { TaskRow } from '../types';
import { mockUser } from './index';
import { forbidden, holds } from './irRules';
import { projectSettings } from './jobs';
import { read as readRooms, write as writeRooms } from './revRooms';
import { NO_WALL_DETAILS } from '../revs.types';
import { bump, clean, fail, has, must, newId, read, same, stamp, write } from './revs';
import { delay } from './store';

const SIDES = { north: 'north wall', south: 'south wall', east: 'east wall', west: 'west wall' } as const;

function mayAdd(projectId: string): boolean {
  return has('revs.manage') || (holds(mockUser().id, 'ir.request') && has('revs.read') && parseProjectSettings(projectSettings(projectId)).ir_ofs_allowed);
}

/** rev_field_wall_add */
export async function addWall(v: FieldWall): Promise<{ area_id: string; room_id: string; added: boolean }> {
  await delay();
  if (!mayAdd(v.projectId)) throw forbidden();
  const s = read();
  const list = s.lists.find((l) => l.id === v.listId && l.deleted_at === null);
  if (!list) throw fail('That item no longer exists.', 'P0002');
  if (v.side === 'other' && (clean(v.name) === '' || clean(v.name).length > 60)) throw fail('Name the wall, up to 60 characters.');
  const rooms = readRooms();
  const existing = v.roomId === null
    ? rooms.rooms.find((r) => r.list_id === list.id && r.deleted_at === null && same(r.level, v.level) && same(r.number, v.roomNumber))
    : rooms.rooms.find((r) => r.id === v.roomId && r.deleted_at === null);
  if (v.roomId !== null && !existing) throw fail('Pick a room of this card.');
  if (!existing) {
    if (clean(v.level) === '') throw fail('Give the level, up to 40 characters.');
    if (clean(v.roomNumber) === '') throw fail('Give the room number, up to 20 characters.');
  }
  const room: RevRoom = existing ?? {
    id: newId('mock-room'), project_id: v.projectId, list_id: list.id, level: clean(v.level), number: clean(v.roomNumber),
    name: clean(v.roomName) || 'Room', kind: 'room', image_name: null, image_file_id: null, card_at: null, version: 1, deleted_at: null,
    position: Math.max(0, ...rooms.rooms.map((r) => r.position)) + 1,
  };
  if (!existing) writeRooms((x) => ({ ...x, rooms: [...x.rooms, room] }));
  const name = clean(`${room.number} ${room.name} ${v.side === 'other' ? v.name : SIDES[v.side]}`);
  const found = s.areas.find((a) => a.list_id === list.id && a.deleted_at === null && same(a.level, room.level) && same(a.name, name));
  let areaId = found?.id;
  if (!found) {
    const tag = clean(v.wallTag) || null;
    const src = tag === null ? undefined : s.areas.find((a) => a.project_id === v.projectId && a.deleted_at === null && a.wall_tag !== null && same(a.wall_tag, tag));
    const inRoom = new Set(rooms.walls.filter((w) => w.room_id === room.id && w.deleted_at === null).map((w) => w.area_id));
    const sheetOf = s.areas.find((a) => inRoom.has(a.id) && a.sheet_file_id !== null)
      ?? s.areas.find((a) => a.list_id === list.id && a.deleted_at === null && same(a.level, room.level) && a.sheet_file_id !== null);
    const manager = has('revs.manage');
    const row = {
      ...stamp(), org_id: list.org_id, project_id: list.project_id, id: newId('mock-rev-area'), list_id: list.id, level: room.level, name,
      sheet_file_id: sheetOf?.sheet_file_id ?? null, sheet_page: sheetOf?.sheet_page ?? 1, geom: null,
      position: Math.max(0, ...s.areas.map((a) => a.position)) + 1, ...NO_WALL_DETAILS,
      wall_tag: src?.wall_tag ?? tag, rating: clean(v.rating) || src?.rating || null, ul_design: src?.ul_design ?? null,
      sheet_ref: src?.sheet_ref ?? null, fire_area: src?.fire_area ?? null, field_by: manager ? null : mockUser().id,
    };
    write((x) => ({ ...x, areas: [...x.areas, row] }));
    areaId = row.id;
  }
  const id = areaId ?? '';
  const roomId = room.id;
  writeRooms((x) =>
    x.walls.some((w) => w.room_id === roomId && w.area_id === id && w.deleted_at === null)
      ? x
      : { ...x, walls: [...x.walls, { id: newId('mock-room-wall'), project_id: v.projectId, room_id: roomId, area_id: id, line: null, version: 1, deleted_at: null,
        position: Math.max(0, ...x.walls.filter((w) => w.room_id === roomId).map((w) => w.position)) + 1 }] },
  );
  return { area_id: id, room_id: roomId, added: !found };
}

/** rev_field_confirm */
export function confirm(areaId: string): void {
  must('revs.manage');
  write((x) => ({
    ...x,
    areas: x.areas.map((a) =>
      a.id === areaId && a.field_by !== null && a.field_checked_at === null
        ? bump(a, { field_checked_at: new Date().toISOString(), field_checked_by: mockUser().id })
        : a,
    ),
  }));
}

/** The managers' Needs you lines: one per wall added on the spot, live and not checked yet. */
export async function checkTasks(projectId: string | null): Promise<TaskRow[]> {
  await delay();
  if (!has('revs.manage')) return [];
  return read()
    .areas.filter((a) => a.field_by !== null && a.field_checked_at === null && a.deleted_at === null && (projectId === null || a.project_id === projectId))
    .map((a) => ({
      id: `wall-check-${a.id}`, project_id: a.project_id, kind: 'revs.wall_check', title: `Check wall ${a.name} · ${a.level}`,
      entity_type: 'rev_area', entity_id: a.id, due_at: null, requires_signature: false, version: 1,
    }));
}
