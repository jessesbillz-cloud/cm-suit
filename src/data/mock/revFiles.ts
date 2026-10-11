// e2e mock of Revs' files (0083, 0094), the database's rules in short form: Link files (each room's picture by its
// name, each sign-off's OFS IR by its number, each wall's sheet by its number), the app's folders (Room pictures, Reports
// / OFS history), a file just added linked at once (the newest of its name or number), and a room's picture from its
// page, and the job's OFS IRs a sign-off form offers by number. The rooms' state is mock/revRooms', the files are
// mock/api's (and the synthetic OFS IRs "in Files", OFS_FILES). Nothing real.
import type { OfsFileRow } from '../revs.ofsFiles';
import type { FileLink, Linked, RevFolder, RevRoom } from '../revs.rooms';
import type { FileRow } from '../types';
import * as mockApi from './api';
import { bump, checkVersion, clean, fail, must, read as readRevs, write as writeRevs } from './revs';
import { IMAGES, OFS_FILES, read, roomOf, write } from './revRooms';
import { delay } from './store';

/** rev_ofs_name_has: OFS_IR_0041 or _OFS_0041_ (four digits below 10000). */
function nameHas(name: string, ofs: number): boolean {
  const n = ofs < 10000 ? String(ofs).padStart(4, '0') : String(ofs);
  return new RegExp(`OFS_IR_${n}([^0-9]|$)`, 'i').test(name) || new RegExp(`_OFS_${n}_`, 'i').test(name);
}

const PICTURE = /^image\/(jpeg|png|webp)$/i;

/** The pictures and IRs added from Revs (mock api files of the job), newest first. */
async function added(projectId: string): Promise<FileRow[]> {
  const folders = (await mockApi.folders(projectId)).map((f) => f.id);
  const rows = (await Promise.all(folders.map((id) => mockApi.files(id)))).flat();
  return rows.filter((f) => f.upload_complete && f.scan_status !== 'infected').sort((a, b) => b.created_at.localeCompare(a.created_at));
}

/** A wall's sheet: the newest PDF in Plans named by its number then a space, _, - or . (rev_sheet_file_of). */
async function sheetOf(projectId: string, ref: string): Promise<string | null> {
  const plans = (await mockApi.folders(projectId)).filter((f) => f.kind === 'plans' && f.parent_id === null).map((f) => f.id);
  const rows = (await Promise.all(plans.map((id) => mockApi.files(id)))).flat();
  const r = ref.trim().toLowerCase();
  const hit = rows
    .filter((f) => f.mime === 'application/pdf' && f.upload_complete && f.scan_status !== 'infected' && f.scan_status !== 'pending')
    .filter((f) => r.length > 0 && f.original_name.toLowerCase().startsWith(r) && [' ', '_', '-', '.'].includes(f.original_name.charAt(r.length)))
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  return hit?.id ?? null;
}

/** rev_signoff_file_of: a number's OFS IR, one added from Revs (the newest) before the synthetic ones in Files. */
function irOf(mine: readonly FileRow[], ofs: number): string | undefined {
  return mine.find((f) => nameHas(f.original_name, ofs))?.id ?? OFS_FILES.find(([, , n]) => n === ofs)?.[0];
}

/** The job's files whose name carries an OFS number, as the sign-off form reads them (the synthetic ones are old). */
export async function ofsFileRows(projectId: string): Promise<OfsFileRow[]> {
  await delay();
  must('revs.manage');
  const mine = (await added(projectId)).filter((f) => /OFS/i.test(f.original_name));
  const old = '2026-09-01T16:00:00Z';
  return [
    ...OFS_FILES.map(([id, name]) => ({ id, original_name: name, mime: 'application/pdf', created_at: old, upload_complete: true, scan_status: 'clean' })),
    ...mine.map((f) => ({ id: f.id, original_name: f.original_name, mime: f.mime, created_at: f.created_at, upload_complete: f.upload_complete, scan_status: f.scan_status })),
  ];
}

/** Link files: each room's picture by its name, each sign-off's OFS IR by its number, each wall's sheet by its number. */
export async function linkFiles(projectId: string): Promise<Linked> {
  await delay();
  must('revs.manage');
  const mine = await added(projectId);
  const pictureOf = (name: string) =>
    mine.find((f) => PICTURE.test(f.mime) && f.original_name.toLowerCase() === name.toLowerCase())?.id ??
    IMAGES.find(([, n]) => n.toLowerCase() === name.toLowerCase())?.[0];
  let images = 0;
  write((x) => ({
    ...x,
    rooms: x.rooms.map((r) => {
      const img = r.image_name === null ? undefined : pictureOf(r.image_name);
      if (r.project_id !== projectId || img === undefined || img === r.image_file_id) return r;
      images += 1;
      return bump(r, { image_file_id: img });
    }),
  }));
  let files = 0;
  writeRevs((x) => ({
    ...x,
    signoffs: x.signoffs.map((so) => {
      const f = so.ofs_number === null ? undefined : irOf(mine, so.ofs_number);
      if (so.project_id !== projectId || so.deleted_at !== null || f === undefined || f === so.file_id) return so;
      files += 1;
      return bump(so, { file_id: f });
    }),
  }));
  const waiting = readRevs().areas.filter((a) => a.project_id === projectId && a.deleted_at === null && a.sheet_file_id === null && (a.sheet_ref ?? '').trim() !== '');
  const found = await Promise.all(waiting.map(async (a) => [a.id, await sheetOf(projectId, a.sheet_ref ?? '')] as const));
  const give = new Map(found.filter((f): f is readonly [string, string] => f[1] !== null));
  writeRevs((x) => ({
    ...x,
    areas: x.areas.map((a) => {
      const sheet = give.get(a.id);
      return sheet === undefined ? a : bump(a, { sheet_file_id: sheet });
    }),
  }));
  return { images, files, sheets: give.size };
}

/** rev_files_folder: Room pictures at the top, OFS history under Reports. */
export async function filesFolder(projectId: string, which: RevFolder): Promise<string> {
  must('revs.manage');
  if (which === 'pictures') return mockApi.appFolder(projectId, null, 'Room pictures', 'general');
  const reports = (await mockApi.folders(projectId)).find((f) => f.kind === 'reports' && f.parent_id === null);
  return mockApi.appFolder(projectId, reports?.id ?? (await mockApi.appFolder(projectId, null, 'Reports', 'reports')), 'OFS history', 'reports');
}

/** rev_file_link: the file just added, to the rooms of its name (the newest of that name) and the sign-offs of its number. */
export async function linkFile(projectId: string, fileId: string): Promise<FileLink> {
  await delay();
  must('revs.manage');
  const known = OFS_FILES.find(([id]) => id === fileId);
  const f = known ? { id: known[0], original_name: known[1], mime: 'application/pdf', project_id: projectId } : await mockApi.file(fileId);
  if (!f || f.project_id !== projectId) throw fail('That item no longer exists.', 'P0002');
  const mine = await added(projectId);
  const newest = (match: (x: FileRow) => boolean) => mine.find(match)?.id === f.id;
  let rooms = 0;
  if (PICTURE.test(f.mime) && newest((x) => PICTURE.test(x.mime) && x.original_name.toLowerCase() === f.original_name.toLowerCase())) {
    write((x) => ({
      ...x,
      rooms: x.rooms.map((r) => {
        if (r.project_id !== projectId || r.deleted_at !== null || (r.image_name ?? '').toLowerCase() !== f.original_name.toLowerCase()) return r;
        rooms += 1;
        return r.image_file_id === f.id ? r : bump(r, { image_file_id: f.id });
      }),
    }));
  }
  let signoffs = 0;
  writeRevs((x) => ({
    ...x,
    signoffs: x.signoffs.map((so) => {
      const n = so.ofs_number;
      if (so.project_id !== projectId || so.deleted_at !== null || n === null || !nameHas(f.original_name, n) || irOf(mine, n) !== f.id) return so;
      signoffs += 1;
      return so.file_id === f.id ? so : bump(so, { file_id: f.id });
    }),
  }));
  return { rooms, signoffs };
}

/** rev_room_image_set: a picture of the job (its name the room's image name), or none with the old name (the Undo). */
export async function setImage(room: RevRoom, fileId: string | null, imageName: string | null): Promise<RevRoom> {
  await delay();
  const s = read();
  const r = roomOf(s, room.id);
  checkVersion(r.version, room.version);
  let name = clean(imageName) || null;
  if (fileId !== null) {
    const f = await mockApi.file(fileId);
    if (!f || f.project_id !== r.project_id || !f.upload_complete || !PICTURE.test(f.mime)) throw fail('Pick a picture of this job.');
    name = f.original_name;
  }
  if (fileId === r.image_file_id && name === r.image_name) return r;
  const saved = bump(r, { image_file_id: fileId, image_name: name });
  write((x) => ({ ...x, rooms: x.rooms.map((y) => (y.id === saved.id ? saved : y)) }));
  return saved;
}
