// e2e mock of the walls' photos and notes (0102), the database's rules in short form: who adds (reads the cards and
// adds files, asks for or decides inspections), who reads (the inside roles and the cards' managers a wall's photos,
// a request's photos with the request, everyone their own), who removes (the one who added it or a manager, never on a
// decided request), a request's photo only on one of its walls. The files are mock/api's (the app folder Wall photos).
// State lives in sessionStorage (its own key), never module state. Nothing real.
import type { Tables } from '../database.types';
import type { IrRequest } from '../inspections.types';
import type { PhotoPlace, PhotoTarget, RevPhoto } from '../revs.photos';
import * as mockApi from './api';
import { MOCK_PEOPLE } from './fixtures';
import { mockUser } from './index';
import { list as readableRequests } from './inspections';
import { holds } from './irRules';
import { read as readRooms } from './revRooms';
import { bump, checkVersion, clean, fail, has, newId, read as readRevs, stamp } from './revs';
import { delay } from './store';

const KEY = 'e2e-mock-rev-photos';
type Row = Tables<'rev_photos'>;

const ROLES = {
  /** files.read_records */
  inside: ['architect', 'estimator', 'inspector', 'inspector_admin', 'owner_rep', 'pe', 'pm', 'project_admin', 'superintendent', 'viewer'],
  /** files.write_project, ir.request, revs.manage, ir.decide, ir.ofs_decide */
  adders: ['inspector', 'inspector_admin', 'pe', 'pm', 'project_admin', 'superintendent', 'foreman', 'requester', 'sub', 'ahj'],
  /** revs.manage, files.manage */
  managers: ['ahj', 'inspector', 'inspector_admin', 'pe', 'pm', 'project_admin'],
};

function rows(): Row[] {
  const raw = window.sessionStorage.getItem(KEY);
  return raw === null ? [] : (JSON.parse(raw) as Row[]);
}

function save(next: Row[]): void {
  window.sessionStorage.setItem(KEY, JSON.stringify(next));
}

const me = () => mockUser().id;
const role = () => me().replace(/^mock-user-/, '');
const adder = () => has('revs.read') && ROLES.adders.includes(role());

/** The job's requests I may read, by id (RLS: ir_may_see). */
type Seen = ReadonlyMap<string, IrRequest>;

async function seenRequests(projectId: string): Promise<Seen> {
  return new Map((await readableRequests(projectId, () => true)).map((r): [string, IrRequest] => [r.id, r]));
}

const decided = (r: IrRequest) => r.result !== null || r.status === 'complete' || r.status === 'withdrawn';

function onRequest(r: IrRequest): boolean {
  if (!adder() || r.status === 'withdrawn') return false;
  if (r.requested_by === me() && holds(me(), 'ir.request') && !decided(r)) return true;
  return holds(me(), 'ir.decide') || (r.kind === 'ofs' && r.ofs_sent_at !== null && holds(me(), 'ir.ofs_decide'));
}

function maySee(p: Row, seen: Seen): boolean {
  if (!has('revs.read')) return false;
  if (p.created_by === me()) return true;
  if (p.request_id === null) return ROLES.inside.includes(role()) || has('revs.manage');
  return seen.has(p.request_id);
}

function removable(p: Row, seen: Seen): boolean {
  const r = p.request_id === null ? undefined : seen.get(p.request_id);
  if (p.request_id !== null && (r === undefined || decided(r))) return false;
  return maySee(p, seen) && (p.created_by === me() || ROLES.managers.includes(role()));
}

function inTarget(p: Row, t: PhotoTarget): boolean {
  if ('areaId' in t) return p.area_id === t.areaId;
  if ('requestId' in t) return p.request_id === t.requestId;
  const walls = readRooms().walls.filter((w) => w.room_id === t.roomId).map((w) => w.area_id);
  return p.room_id === t.roomId || (p.area_id !== null && walls.includes(p.area_id));
}

const nameOf = (userId: string) => MOCK_PEOPLE.find((x) => x.user_id === userId)?.full_name ?? 'Sample Person';

/** rev_photos_list */
export async function list(projectId: string, t: PhotoTarget): Promise<RevPhoto[]> {
  const seen = await seenRequests(projectId);
  const out = await Promise.all(
    rows()
      .filter((p) => p.project_id === projectId && p.deleted_at === null && maySee(p, seen) && inTarget(p, t))
      .map(async (p): Promise<RevPhoto> => {
        const r = p.request_id === null ? undefined : seen.get(p.request_id);
        const f = p.file_id === null ? null : await mockApi.file(p.file_id);
        return {
          id: p.id, version: p.version, area_id: p.area_id, room_id: p.room_id, request_id: p.request_id,
          ir_number: r?.number ?? null, ofs_number: r?.ofs_number ?? null, file_id: p.file_id, file_name: f?.original_name ?? null,
          note: p.note, created_at: p.created_at, by_name: nameOf(p.created_by), mine: p.created_by === me(), can_remove: removable(p, seen),
          locked: r !== undefined && decided(r), via_request: p.request_id !== null && p.created_by !== me() && !ROLES.inside.includes(role()),
        };
      }),
  );
  return out.sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id));
}

/** rev_photo_may_add */
export async function mayAdd(projectId: string, requestId: string | null): Promise<boolean> {
  await delay();
  if (requestId === null) return adder();
  const r = (await seenRequests(projectId)).get(requestId);
  return r !== undefined && onRequest(r);
}

/** rev_photos_folder: Wall photos at the top. */
export async function folder(projectId: string): Promise<string> {
  if (!adder()) throw fail("You don't have access to that.", '42501');
  return mockApi.appFolder(projectId, null, 'Wall photos', 'general');
}

/** rev_photo_add */
export async function add(projectId: string, at: PhotoPlace, fileId: string | null, note: string | null): Promise<Row> {
  await delay();
  if (!adder()) throw fail("You don't have access to that.", '42501');
  const text = clean(note) === '' ? null : clean(note);
  if (text !== null && text.length > 200) throw fail('Keep the note to one line (200 characters).');
  if (fileId === null && text === null) throw fail('Add a photo or a note.');
  if (at.areaId !== null && !readRevs().areas.some((a) => a.id === at.areaId && a.deleted_at === null)) throw fail('This wall is no longer on the job.', 'P0002');
  if (at.requestId !== null) {
    const r = (await seenRequests(projectId)).get(at.requestId);
    if (r === undefined) throw fail('That item no longer exists.', 'P0002');
    if (!onRequest(r)) throw fail('This request takes no more photos from you.', '42501');
    if (!readRevs().cells.some((c) => c.request_id === r.id && c.area_id === at.areaId)) throw fail('That wall is not on this request.');
  }
  const same = rows().find((p) => p.deleted_at === null && fileId !== null && p.file_id === fileId);
  if (same) return same;
  const row: Row = {
    ...stamp(), id: newId('mock-rev-photo'), org_id: 'mock-org', project_id: projectId,
    area_id: at.areaId, room_id: at.roomId, request_id: at.requestId, file_id: fileId, note: text,
  };
  save([...rows(), row]);
  return row;
}

/** rev_photo_remove / rev_photo_restore: the new version. */
export async function setRemoved(id: string, version: number, removing: boolean): Promise<number> {
  await delay();
  const p = rows().find((x) => x.id === id);
  const seen = p ? await seenRequests(p.project_id) : new Map<string, IrRequest>();
  if (!p || !maySee(p, seen)) throw fail('That item no longer exists.', 'P0002');
  if (!removable(p, seen)) throw fail('The request is decided: its photos are part of its record.', '42501');
  if (removing && p.deleted_at === null) checkVersion(p.version, version);
  const next = bump(p, { deleted_at: removing ? new Date().toISOString() : null });
  save(rows().map((x) => (x.id === id ? next : x)));
  return next.version;
}
