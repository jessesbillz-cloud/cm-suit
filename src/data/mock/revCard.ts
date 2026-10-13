// e2e mock of a room's inspection card (0101), with the database's rules in short form: revs.manage only; the walls
// kept on the card (a wall left off is taken out of the room, kept in its other rooms), every item not picked on the
// kept walls set up as not applicable (set_up marks), a picked one applicable again; a cell with a sign-off or on a live
// request never changes, a hand N/A stays; the save answers what changed and its Undo puts it back; one item on or off
// for one wall (on also clears a hand N/A). State lives in the revs and rooms mocks' sessionStorage.
import { conflictError } from '../errors';
import type { Tables } from '../database.types';
import type { CardSaved, CardUndo } from '../revs.card';
import type { RevRoom } from '../revs.rooms';
import * as mockIr from './inspections';
import { bump, fail, must, newId, read, stamp, write, type RevMockState } from './revs';
import { read as readRooms, write as writeRooms } from './revRooms';
import { delay } from './store';

type Mark = Tables<'rev_marks'>;

async function liveRequests(projectId: string): Promise<Set<string>> {
  const rows = await mockIr.serverList(projectId, (r) => r.status !== 'withdrawn' && r.deleted_at === null);
  return new Set(rows.map((r) => r.id));
}

function kept(s: RevMockState, live: Set<string>, areaId: string, itemId: string): boolean {
  return (
    s.signoffs.some((x) => x.area_id === areaId && x.item_id === itemId && x.deleted_at === null) ||
    s.cells.some((c) => c.area_id === areaId && c.item_id === itemId && live.has(c.request_id))
  );
}

/** rev_card_cell: true when it changed. Writes into `marks`. */
function cell(s: RevMockState, marks: Mark[], live: Set<string>, areaId: string, itemId: string, na: boolean, hand: boolean): boolean {
  if (kept(s, live, areaId, itemId)) return false;
  const at = marks.findIndex((m) => m.area_id === areaId && m.item_id === itemId && m.deleted_at === null);
  const m = marks[at];
  if (na) {
    if (m) return false;
    const area = s.areas.find((a) => a.id === areaId);
    if (!area) return false;
    marks.push({ ...stamp(), id: newId('mock-rev-mark'), org_id: area.org_id, project_id: area.project_id, area_id: areaId, item_id: itemId, kind: 'na', set_up: true });
    return true;
  }
  if (!m || !(m.set_up || hand)) return false;
  marks[at] = bump(m, { deleted_at: new Date().toISOString() });
  return true;
}

function listItems(s: RevMockState, listId: string): string[] {
  const revs = new Set(s.revs.filter((r) => r.list_id === listId && r.deleted_at === null).map((r) => r.id));
  return s.items.filter((i) => revs.has(i.rev_id) && i.deleted_at === null).map((i) => i.id);
}

/** A room's walls in or out (rev_room_wall_add / _remove), the line kept. */
function setWalls(roomId: string, changes: readonly { area_id: string; on: boolean }[]): void {
  writeRooms((x) => {
    let walls = x.walls;
    for (const c of changes) {
      const row = walls.find((w) => w.room_id === roomId && w.area_id === c.area_id);
      if (c.on && !row) {
        const position = Math.max(0, ...walls.filter((w) => w.room_id === roomId).map((w) => w.position)) + 1;
        walls = [...walls, { project_id: 'job-s', version: 1, deleted_at: null, id: newId('mock-room-wall'), room_id: roomId, area_id: c.area_id, line: null, position }];
      } else if (row && (row.deleted_at === null) !== c.on) {
        const next = bump(row, { deleted_at: c.on ? null : new Date().toISOString() });
        walls = walls.map((w) => (w.id === row.id ? next : w));
      }
    }
    return { ...x, walls };
  });
}

function roomOf(id: string, version: number): RevRoom {
  must('revs.manage');
  const r = readRooms().rooms.find((x) => x.id === id);
  if (!r) throw fail('That item no longer exists.', 'P0002');
  if (r.deleted_at !== null) throw fail('This room was removed.');
  if (r.version !== version) throw conflictError();
  return r;
}

const liveWalls = (roomId: string) => readRooms().walls.filter((w) => w.room_id === roomId && w.deleted_at === null).map((w) => w.area_id);

export async function save(room: RevRoom, areaIds: string[], itemIds: string[]): Promise<CardSaved> {
  await delay();
  const r = roomOf(room.id, room.version);
  const s = read();
  const items = listItems(s, r.list_id);
  if (new Set(areaIds).size !== areaIds.length || areaIds.some((a) => !s.areas.some((x) => x.id === a && x.list_id === r.list_id && x.deleted_at === null))) {
    throw fail('Pick the walls of this room again.');
  }
  if (new Set(itemIds).size !== itemIds.length || itemIds.some((i) => !items.includes(i))) throw fail('Pick the items of this list again.');
  const before = liveWalls(r.id);
  const walls = [
    ...before.filter((a) => !areaIds.includes(a)).map((a) => ({ area_id: a, on: false })),
    ...areaIds.filter((a) => !before.includes(a)).map((a) => ({ area_id: a, on: true })),
  ];
  setWalls(r.id, walls);
  const live = await liveRequests(r.project_id);
  const marks = [...s.marks];
  const cells: CardUndo['cells'] = [];
  for (const areaId of liveWalls(r.id)) {
    for (const itemId of items) {
      const na = !itemIds.includes(itemId);
      if (cell(s, marks, live, areaId, itemId, na, false)) cells.push({ area_id: areaId, item_id: itemId, na });
    }
  }
  write((x) => ({ ...x, marks }));
  const saved = bump(r, { card_at: new Date().toISOString() });
  writeRooms((x) => ({ ...x, rooms: x.rooms.map((y) => (y.id === r.id ? saved : y)) }));
  return { version: saved.version, undo: { walls, cells, was: r.card_at } };
}

export async function undo(roomId: string, version: number, u: CardUndo): Promise<void> {
  await delay();
  const r = roomOf(roomId, version);
  setWalls(r.id, u.walls.map((w) => ({ area_id: w.area_id, on: !w.on })));
  const s = read();
  const live = await liveRequests(r.project_id);
  const marks = [...s.marks];
  for (const c of u.cells) cell(s, marks, live, c.area_id, c.item_id, !c.na, false);
  write((x) => ({ ...x, marks }));
  const back = bump(r, { card_at: u.was });
  writeRooms((x) => ({ ...x, rooms: x.rooms.map((y) => (y.id === r.id ? back : y)) }));
}

export async function item(areaId: string, itemId: string, on: boolean): Promise<boolean> {
  await delay();
  must('revs.manage');
  const s = read();
  const area = s.areas.find((a) => a.id === areaId && a.deleted_at === null);
  if (!area) throw fail('That item no longer exists.', 'P0002');
  if (!listItems(s, area.list_id).includes(itemId)) throw fail("Pick an item of this wall's list.");
  const live = await liveRequests(area.project_id);
  if (kept(s, live, areaId, itemId)) throw fail('This item has a sign-off or a request.');
  const marks = [...s.marks];
  const changed = cell(s, marks, live, areaId, itemId, !on, true);
  write((x) => ({ ...x, marks }));
  return changed;
}
