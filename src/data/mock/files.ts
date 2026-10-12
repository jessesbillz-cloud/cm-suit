// e2e mock of Files' Delete, Undo, Move and Rename (migrations 0074, 0096) and a folder's Rename. Like the database: the
// uploader or files.manage (every mock user but the bidder) may change a finished file, never a signed record (a file a
// mock record points at), with a version check. A move never goes into or out of a folder only the app fills (Emailed
// in is a tray to sort from). Nothing real in it.
import { conflictError, toDataError } from '../errors';
import type { FileFacts } from '../files';
import type { FolderRow } from '../types';
import * as api from './api';
import { SEED_DAILY_PDF_ID, SEED_IR_PDF_ID } from './boardSeeds';
import { mockUser } from './index';
import { delay, readMock, writeMock } from './store';

/** Server-made records in the mock (a daily report's PDF, an IR PDF): they stay on file. */
const KEPT = new Set([SEED_DAILY_PDF_ID, SEED_IR_PDF_ID]);

function versionOf(id: string): number {
  return readMock().fileVersions[id] ?? 1;
}

async function mayChange(id: string): Promise<boolean> {
  const f = await api.file(id);
  if (!f || !f.upload_complete || KEPT.has(id)) return false;
  return mockUser().id !== 'mock-user-bidder' || f.created_by === mockUser().id;
}

export async function facts(fileId: string): Promise<FileFacts> {
  await delay();
  return { version: versionOf(fileId), canChange: await mayChange(fileId), earlier: [] };
}

async function check(id: string, version: number): Promise<void> {
  if (!(await mayChange(id))) throw toDataError({ message: 'A signed record stays on file.', code: '42501' });
  if (versionOf(id) !== version) throw conflictError();
}

export async function remove(id: string, version: number): Promise<void> {
  if (readMock().removedFiles.includes(id)) return;
  await check(id, version);
  writeMock((m) => ({ ...m, removedFiles: [...m.removedFiles, id], fileVersions: { ...m.fileVersions, [id]: version + 1 } }));
}

export async function restore(id: string): Promise<void> {
  await delay();
  writeMock((m) => ({ ...m, removedFiles: m.removedFiles.filter((x) => x !== id) }));
}

/** files_changeable: the ones I may change, with their versions. */
export async function changeable(ids: readonly string[]): Promise<Map<string, number>> {
  const may = await Promise.all(ids.map(mayChange));
  return new Map(ids.filter((_, i) => may[i] === true).map((id) => [id, versionOf(id)]));
}

/** my_writable_folders: every folder of the job I read (the bidder adds through Bids only). */
export async function writableFolders(projectId: string): Promise<Set<string>> {
  const list = await api.folders(projectId);
  return new Set(mockUser().id === 'mock-user-bidder' ? [] : list.map((f) => f.id));
}

const refused = (message: string) => toDataError({ message, code: '42501' });

export async function move(id: string, version: number, folderId: string): Promise<number> {
  const f = await api.file(id);
  if (!f) throw toDataError({ message: 'not_found', code: 'P0002' });
  if (!(await mayChange(id))) throw refused('A signed record stays on file.');
  const all = await api.folders(f.project_id);
  const to = all.find((x) => x.id === folderId);
  if (!to) throw toDataError({ message: 'not_found', code: 'P0002' });
  // Already there (the same move again): nothing to do.
  if (f.folder_id === folderId) return versionOf(id);
  if (versionOf(id) !== version) throw conflictError();
  const from = all.find((x) => x.id === f.folder_id);
  if (from?.app_only === true && from.kind !== 'inbound') throw refused('The app keeps this file in its folder.');
  if (to.app_only && to.kind !== 'inbound') throw refused('Only the app adds to that folder.');
  const next = version + 1;
  writeMock((m) => ({
    ...m,
    files: [...m.files.filter((x) => x.id !== id), { ...f, folder_id: folderId }],
    fileVersions: { ...m.fileVersions, [id]: next },
  }));
  return next;
}

export async function rename(id: string, version: number, name: string): Promise<number> {
  await check(id, version);
  const trimmed = name.trim();
  if (trimmed === '') throw toDataError({ message: 'Give the file a name.', code: '23514' });
  const f = await api.file(id);
  if (!f) throw toDataError({ message: 'not_found', code: 'P0002' });
  const next = version + 1;
  writeMock((m) => ({
    ...m,
    files: [...m.files.filter((x) => x.id !== id), { ...f, original_name: trimmed }],
    fileVersions: { ...m.fileVersions, [id]: next },
  }));
  return next;
}

export function renameFolder(folderId: string, version: number, name: string): Promise<FolderRow> {
  return api.renameFolder(folderId, version, name);
}
