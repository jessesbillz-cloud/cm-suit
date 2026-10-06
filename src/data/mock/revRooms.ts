// e2e mock of rooms (0083), with the database's rules in short form: revs.read reads, revs.manage writes; a room's
// number once per level (version-checked rename), a wall of the room's list in or out (the line kept), a line of 2 to 8
// points; Link files links each room's image by its name and each sign-off's OFS IR by its number; a wall's history
// (the in-app requests from mock/inspections, the sign-offs from mock/revs); the gate for a room's image or a
// sign-off's file (synthetic pictures and the synthetic plan set, nothing real). Rooms of Sample Science Building
// (mock/revSeeds' walls): Level 01 room 110 Corridor (the corridor's north wall and the stair shaftwall), Level 02 room
// 205 Electrical (its east wall and the corridor's north wall, shared) whose image is in Files but not linked yet, room
// 210 Corridor and shaft S2 Stair 2. Level 01's elevator shaft is in no room ("Other walls"). State lives in
// sessionStorage (its own key), never module state.
import type { Linked, RevRoom, RevRoomWall } from '../revs.rooms';
import type { RevFile, HistoryRow } from '../revs.history';
import type { RevRemoved, WallLine } from '../revs.types';
import * as mockIr from './inspections';
import { bump, checkVersion, clean, fail, has, must, newId, read as readRevs, write as writeRevs } from './revs';
import { sheetUrl } from './sheet';
import { delay } from './store';

const KEY = 'e2e-mock-rev-rooms';
const JOB = 'job-s';
const LIST = 'mock-rev-list-1';

interface State {
  rooms: (RevRoom & { image_name: string | null })[];
  walls: RevRoomWall[];
}

/** The synthetic room images "in Files": id, name, the room's number drawn on it. */
const IMAGES: [id: string, name: string, label: string][] = [
  ['mock-room-img-110', 'Sample Room 110.png', '110'],
  ['mock-room-img-205', 'Sample Room 205.png', '205'],
  ['mock-room-img-210', 'Sample Room 210.png', '210'],
  ['mock-room-img-s2', 'Sample Stair 2.png', 'S2'],
];

/** The synthetic OFS IRs "in Files", by OFS number. */
const OFS_FILES: [id: string, name: string, ofs: number][] = [
  ['mock-ofs-ir-0041', 'OFS_IR_0041_Attachment.pdf', 41],
  ['mock-ofs-ir-0042', 'OFS_IR_0042_Attachment.pdf', 42],
];

// Lines on a room image: its four walls as the synthetic picture draws them.
const NORTH: WallLine = [[0.1, 0.12], [0.9, 0.12]];
const EAST: WallLine = [[0.9, 0.12], [0.9, 0.88]];
const SOUTH: WallLine = [[0.1, 0.88], [0.9, 0.88]];

type RoomSeed = [id: string, level: string, number: string, name: string, kind: RevRoom['kind'], image: string | null, imageName: string | null,
  walls: [area: number, line: WallLine | null][]];

const ROOMS: RoomSeed[] = [
  ['mock-room-110', 'Level 01', '110', 'Corridor', 'room', 'mock-room-img-110', 'Sample Room 110.png', [[2, NORTH], [1, EAST]]],
  ['mock-room-205', 'Level 02', '205', 'Electrical', 'room', null, 'Sample Room 205.png', [[6, EAST], [5, SOUTH]]],
  ['mock-room-210', 'Level 02', '210', 'Corridor', 'room', 'mock-room-img-210', 'Sample Room 210.png', [[5, NORTH]]],
  ['mock-room-s2', 'Level 02', 'S2', 'Stair 2', 'shaft', 'mock-room-img-s2', 'Sample Stair 2.png', [[4, null]]],
];

function seed(): State {
  const base = { project_id: JOB, version: 1, deleted_at: null };
  return {
    rooms: ROOMS.map(([id, level, number, name, kind, image, imageName], i) => ({
      ...base, id, list_id: LIST, level, number, name, kind, image_file_id: image, image_name: imageName, position: i + 1,
    })),
    walls: ROOMS.flatMap(([id, , , , , , , walls]) =>
      walls.map(([area, line], k) => ({ ...base, id: `${id}-wall-${String(area)}`, room_id: id, area_id: `mock-rev-area-${String(area)}`, line, position: k + 1 })),
    ),
  };
}

function read(): State {
  const raw = window.sessionStorage.getItem(KEY);
  return raw === null ? seed() : (JSON.parse(raw) as State);
}

function write(update: (s: State) => State): State {
  const next = update(read());
  window.sessionStorage.setItem(KEY, JSON.stringify(next));
  return next;
}

export async function rooms(projectId: string): Promise<{ rooms: RevRoom[]; walls: RevRoomWall[] }> {
  await delay();
  if (!has('revs.read')) return { rooms: [], walls: [] };
  const s = read();
  const lists = new Set(readRevs().lists.filter((l) => l.project_id === projectId && l.deleted_at === null).map((l) => l.id));
  const live = s.rooms.filter((r) => r.project_id === projectId && lists.has(r.list_id));
  const ids = new Set(live.map((r) => r.id));
  return { rooms: live, walls: s.walls.filter((w) => ids.has(w.room_id)) };
}

function roomOf(s: State, id: string): State['rooms'][number] {
  must('revs.manage');
  const r = s.rooms.find((x) => x.id === id);
  if (!r) throw fail('That item no longer exists.', 'P0002');
  if (r.deleted_at !== null) throw fail('This room was removed.');
  return r;
}

export async function save(room: RevRoom, number: string, name: string): Promise<RevRoom> {
  await delay();
  const s = read();
  const r = roomOf(s, room.id);
  checkVersion(r.version, room.version);
  const [n, nm] = [clean(number), clean(name)];
  if (n.length < 1 || n.length > 20) throw fail('Give the room number, up to 20 characters.');
  if (nm.length < 1 || nm.length > 120) throw fail('Give the room name, up to 120 characters.');
  if (n === r.number && nm === r.name) return r;
  const taken = s.rooms.some((x) => x.id !== r.id && x.deleted_at === null && x.list_id === r.list_id && x.level === r.level && x.number.toLowerCase() === n.toLowerCase());
  if (taken) throw fail('That room number is already on this level.');
  const saved = bump(r, { number: n, name: nm });
  write((x) => ({ ...x, rooms: x.rooms.map((y) => (y.id === saved.id ? saved : y)) }));
  return saved;
}

export async function setWall(roomId: string, areaId: string, on: boolean): Promise<void> {
  await delay();
  const s = read();
  const r = roomOf(s, roomId);
  const area = readRevs().areas.find((a) => a.id === areaId && a.deleted_at === null);
  if (on && area?.list_id !== r.list_id) throw fail("Pick a wall of this room's list.");
  const rows = s.walls.filter((w) => w.room_id === roomId && w.area_id === areaId).sort((a, b) => Number(a.deleted_at !== null) - Number(b.deleted_at !== null));
  const w = rows[0];
  let next: RevRoomWall | null = null;
  if (on && !w) {
    const position = Math.max(0, ...s.walls.filter((x) => x.room_id === roomId && x.deleted_at === null).map((x) => x.position)) + 1;
    next = { project_id: r.project_id, version: 1, deleted_at: null, id: newId('mock-room-wall'), room_id: roomId, area_id: areaId, line: null, position };
  } else if (on && w && w.deleted_at !== null) next = bump(w, { deleted_at: null });
  else if (!on && w && w.deleted_at === null) next = bump(w, { deleted_at: new Date().toJSON() });
  const row = next;
  if (row) write((x) => ({ ...x, walls: [...x.walls.filter((y) => y.id !== row.id), row] }));
}

export async function setLine(wall: RevRoomWall, line: WallLine | null): Promise<RevRoomWall> {
  await delay();
  const s = read();
  roomOf(s, wall.room_id);
  const w = s.walls.find((x) => x.id === wall.id && x.deleted_at === null);
  if (!w) throw fail("That wall isn't in this room.");
  checkVersion(w.version, wall.version);
  if (line !== null && (line.length < 2 || line.length > 8)) throw fail('Draw the wall: 2 to 8 points on the image.');
  const saved = bump(w, { line });
  write((x) => ({ ...x, walls: x.walls.map((y) => (y.id === saved.id ? saved : y)) }));
  return saved;
}

/** rev_remove / rev_restore of a room (`removing` false: the Undo), version-checked; a repeat changes nothing. */
export async function toggleRoom(id: string, version: number, removing: boolean): Promise<RevRemoved> {
  await delay();
  must('revs.manage');
  const r = read().rooms.find((x) => x.id === id);
  if (!r) throw fail('That item no longer exists.', 'P0002');
  if ((r.deleted_at !== null) === removing) return { id: r.id, version: r.version, deleted_at: r.deleted_at };
  checkVersion(r.version, version);
  const next = bump(r, { deleted_at: removing ? new Date().toJSON() : null });
  write((x) => ({ ...x, rooms: x.rooms.map((y) => (y.id === id ? next : y)) }));
  return { id: next.id, version: next.version, deleted_at: next.deleted_at };
}

/** Link files: each room's image by its name, then each sign-off's OFS IR by its number. */
export async function linkFiles(projectId: string): Promise<Linked> {
  await delay();
  must('revs.manage');
  let images = 0;
  write((x) => ({
    ...x,
    rooms: x.rooms.map((r) => {
      const img = IMAGES.find(([, name]) => name.toLowerCase() === (r.image_name ?? '').toLowerCase());
      if (r.project_id !== projectId || !img || img[0] === r.image_file_id) return r;
      images += 1;
      return bump(r, { image_file_id: img[0] });
    }),
  }));
  let files = 0;
  writeRevs((x) => ({
    ...x,
    signoffs: x.signoffs.map((so) => {
      const f = OFS_FILES.find(([, , ofs]) => ofs === so.ofs_number);
      if (so.project_id !== projectId || so.deleted_at !== null || !f || f[0] === so.file_id) return so;
      files += 1;
      return bump(so, { file_id: f[0] });
    }),
  }));
  return { images, files };
}

/** A synthetic room picture: the room's four walls, a door, its number. 4:3. */
function roomPicture(label: string): string {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300">' +
    '<rect width="400" height="300" fill="#fff"/>' +
    '<g stroke="#c9ced6" stroke-width="1"><line x1="0" y1="150" x2="400" y2="150"/><line x1="200" y1="0" x2="200" y2="300"/></g>' +
    '<path d="M40 36 H360 V264 H230 M170 264 H40 Z" fill="none" stroke="#2b2f36" stroke-width="7"/>' +
    `<text x="200" y="160" font-family="sans-serif" font-size="34" text-anchor="middle" fill="#2b2f36">${label}</text>` +
    '</svg>';
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** authorize_rev_file + the URL: a room's linked image, or a live sign-off's linked file. */
export async function file(fileId: string): Promise<RevFile> {
  await delay();
  if (!has('revs.read')) throw fail('That item no longer exists.', 'P0002');
  const img = IMAGES.find(([id]) => id === fileId);
  if (img && read().rooms.some((r) => r.image_file_id === fileId && r.deleted_at === null)) {
    return { url: roomPicture(img[2]), filename: img[1], mime: 'image/png' };
  }
  const ofs = OFS_FILES.find(([id]) => id === fileId);
  if (ofs && readRevs().signoffs.some((so) => so.file_id === fileId && so.deleted_at === null)) {
    return { url: sheetUrl(), filename: ofs[1], mime: 'application/pdf' };
  }
  throw fail("You don't have access to that.", '42501');
}

/** rev_wall_history in short form. */
export async function history(projectId: string, areaId: string): Promise<HistoryRow[]> {
  if (!has('revs.read')) throw fail('That item no longer exists.', 'P0002');
  const s = readRevs();
  // One round trip, like the RPC: every live request, and the ones I may open.
  const live = (r: { status: string; deleted_at: string | null }) => r.status !== 'withdrawn' && r.deleted_at === null;
  const [all, mine] = await Promise.all([mockIr.serverList(projectId, live), mockIr.list(projectId, live)]);
  const reqs = new Map(all.map((r) => [r.id, r]));
  const openable = new Set(mine.map((r) => r.id));
  const rows: HistoryRow[] = [];
  for (const c of s.cells.filter((x) => x.area_id === areaId)) {
    const q = reqs.get(c.request_id);
    if (!q) continue;
    rows.push({
      item_id: c.item_id, kind: 'request', request_id: q.id, ir_number: q.number, ofs_number: q.ofs_number, day: q.request_date,
      result: c.result === 'passed' || c.result === 'failed' ? c.result : 'requested', note: c.result === 'failed' ? c.result_note : null, file_id: null, file_name: null,
      can_open: openable.has(q.id), at: c.result_at ?? `${q.request_date}T16:00:00Z`,
    });
  }
  for (const so of s.signoffs.filter((x) => x.area_id === areaId && x.deleted_at === null)) {
    const f = OFS_FILES.find(([id]) => id === so.file_id);
    rows.push({
      item_id: so.item_id, kind: 'before', request_id: null, ir_number: null, ofs_number: so.ofs_number, day: so.signed_on,
      result: 'passed', note: so.note, file_id: f ? f[0] : null, file_name: f ? f[1] : null, can_open: f !== undefined,
      at: so.signed_on === null ? so.updated_at : `${so.signed_on}T19:00:00Z`,
    });
  }
  return rows.sort((a, b) => a.item_id.localeCompare(b.item_id) || (b.at ?? '').localeCompare(a.at ?? ''));
}
