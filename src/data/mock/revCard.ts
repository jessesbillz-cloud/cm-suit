// e2e mock of a room's inspection card (0101, 0119), with the database's rules in short form: revs.manage only; the
// boxes changed on Setup, each wall x item Needed or Not needed (set_up marks, Needed clears a hand N/A too); a box with
// a sign-off or on a live request never changes; the save locks the card and answers what changed, its Undo (its
// saver's) puts it back and unlocks; Unlock to edit and lock again; one item on or off for one wall, refused while a
// room of the wall is locked. State lives in the revs and rooms mocks' sessionStorage.
import { conflictError } from '../errors';
import type { Tables } from '../database.types';
import type { CardCellChange, CardSaved, CardUndo } from '../revs.card';
import { mockUser } from './index';
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

const LOCKED = 'This card is locked. Unlock it to edit.';

function putRoom(room: RevRoom): void {
  writeRooms((x) => ({ ...x, rooms: x.rooms.map((y) => (y.id === room.id ? room : y)) }));
}

/** A mock member's name: "Sample Inspector". */
function mockName(id: string): string {
  const who = id.replace(/^mock-user-/, '');
  return `Sample ${who.charAt(0).toUpperCase()}${who.slice(1)}`;
}

const liveWalls = (roomId: string) => readRooms().walls.filter((w) => w.room_id === roomId && w.deleted_at === null).map((w) => w.area_id);

/** rev_card_set: the boxes changed, each Needed or Not needed (Needed clears a hand N/A too), a kept box never; the
 *  card set up and locked. Locked: refused, unless it is the same save again by whoever locked it. */
export async function set(room: RevRoom, changes: readonly CardCellChange[]): Promise<CardSaved> {
  await delay();
  must('revs.manage');
  const now = readRooms().rooms.find((x) => x.id === room.id);
  if (!now) throw fail('That item no longer exists.', 'P0002');
  const s = read();
  const items = listItems(s, now.list_id);
  const walls = liveWalls(now.id);
  const keys = new Set(changes.map((c) => `${c.area_id}:${c.item_id}`));
  if (keys.size !== changes.length || changes.some((c) => !walls.includes(c.area_id) || !items.includes(c.item_id))) {
    throw fail('Pick the boxes of this card again.');
  }
  const live = await liveRequests(now.project_id);
  const needed = (a: string, i: string) => !s.marks.some((m) => m.area_id === a && m.item_id === i && m.deleted_at === null);
  if (now.card_locked_at !== null) {
    const same = now.card_locked_by === mockUser().id && changes.every((c) => kept(s, live, c.area_id, c.item_id) || needed(c.area_id, c.item_id) === c.needed);
    if (same) return { version: now.version, undo: { walls: [], cells: [], was: now.card_at } };
    throw fail(LOCKED, '55000');
  }
  const r = roomOf(room.id, room.version);
  const marks = [...s.marks];
  const cells: CardUndo['cells'] = [];
  for (const c of changes) {
    if (cell(s, marks, live, c.area_id, c.item_id, !c.needed, true)) cells.push({ area_id: c.area_id, item_id: c.item_id, na: !c.needed });
  }
  write((x) => ({ ...x, marks }));
  const at = new Date().toISOString();
  const saved = bump(r, { card_at: at, card_locked_at: at, card_locked_by: mockUser().id });
  putRoom(saved);
  return { version: saved.version, undo: { walls: [], cells, was: r.card_at } };
}

/** rev_card_lock: Unlock to edit or lock again; the same again answers it as it is. */
export async function lock(room: RevRoom, locked: boolean): Promise<void> {
  await delay();
  must('revs.manage');
  const now = readRooms().rooms.find((x) => x.id === room.id);
  if (now && (now.card_locked_at !== null) === locked) return;
  const r = roomOf(room.id, room.version);
  putRoom(bump(r, locked ? { card_locked_at: new Date().toISOString(), card_locked_by: mockUser().id } : { card_locked_at: null, card_locked_by: null }));
}

/** rev_card_lockers: whoever locked a card of the job, by name. */
export async function lockers(projectId: string): Promise<{ user_id: string; name: string }[]> {
  await delay();
  must('revs.read');
  const ids = new Set(readRooms().rooms.filter((r) => r.project_id === projectId && r.card_locked_by !== null).map((r) => r.card_locked_by ?? ''));
  return [...ids].map((id) => ({ user_id: id, name: mockName(id) }));
}

export async function undo(roomId: string, version: number, u: CardUndo): Promise<void> {
  await delay();
  const r = roomOf(roomId, version);
  if (r.card_locked_by !== null && r.card_locked_by !== mockUser().id) throw fail(LOCKED, '55000');
  setWalls(r.id, u.walls.map((w) => ({ area_id: w.area_id, on: !w.on })));
  const s = read();
  const live = await liveRequests(r.project_id);
  const marks = [...s.marks];
  for (const c of u.cells) cell(s, marks, live, c.area_id, c.item_id, !c.na, false);
  write((x) => ({ ...x, marks }));
  putRoom(bump(r, { card_at: u.was, card_locked_at: null, card_locked_by: null }));
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
  const rooms = readRooms();
  const inRooms = new Set(rooms.walls.filter((w) => w.area_id === areaId && w.deleted_at === null).map((w) => w.room_id));
  if (rooms.rooms.some((r) => inRooms.has(r.id) && r.deleted_at === null && r.card_locked_at !== null)) {
    throw fail("The room's card is locked. Unlock it to edit.", '55000');
  }
  const marks = [...s.marks];
  const changed = cell(s, marks, live, areaId, itemId, !on, true);
  write((x) => ({ ...x, marks }));
  return changed;
}
