// e2e mock of Files' Delete, Undo and Rename (migration 0074) and a folder's Rename. Like the database: the uploader or
// files.manage (every mock user but the bidder) may change a finished file, never a signed record (a file a mock
// record points at), with a version check. Nothing real in it.
import { conflictError, toDataError } from '../errors';
import type { FileFacts } from '../files';
import type { FolderRow } from '../types';
import * as api from './api';
import { SEED_DAILY_PDF_ID } from './boardSeeds';
import { mockUser } from './index';
import { delay, readMock, writeMock } from './store';

/** Server-made records in the mock (a daily report's PDF, an IR PDF): they stay on file. */
const KEPT = new Set([SEED_DAILY_PDF_ID, 'job-b-ir-12']);

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
