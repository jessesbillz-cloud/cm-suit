// In-memory stand-ins for every data-layer call, used only when isMock() is true.
import { LAYOUT_DEFAULTS, type LayoutChoices } from '../../lib/layout';
import { conflictError, toDataError } from '../errors';
import type {
  ActivityRow,
  BoardLine,
  FileRow,
  FolderRow,
  InviteInput,
  InviteResult,
  Person,
  ProfilePatch,
  ProfileRow,
  RoleRow,
  TaskRow,
} from '../types';
import {
  MOCK_ACTIVITY,
  MOCK_FILES,
  MOCK_PEOPLE,
  MOCK_ROLES,
  MOCK_TASKS,
  mockProfile,
  toBoardLine,
} from './fixtures';
import { ADDENDUM_FILES } from './addenda';
import { fileReadable, folderReadable } from './fileAccess';
import { MOCK_FOLDERS } from './folders';
import { mockUser } from './index';
import { delay, readMock, writeMock } from './store';

export async function board(projectId: string | null, before: string | null): Promise<BoardLine[]> {
  await delay();
  const marks = readMock().readMarks;
  return MOCK_ACTIVITY.filter((a) => (projectId === null || a.project_id === projectId) && (before === null || a.created_at < before)).map(
    (a) => toBoardLine(a, a.created_at > (marks[a.project_id] ?? '')),
  );
}

export async function activity(id: string): Promise<ActivityRow | null> {
  await delay();
  return MOCK_ACTIVITY.find((a) => a.id === id) ?? null;
}

export async function readMark(projectId: string): Promise<string | null> {
  await delay();
  return readMock().readMarks[projectId] ?? null;
}

export async function markRead(projectIds: string[], at: string): Promise<void> {
  await delay();
  writeMock((s) => ({ ...s, readMarks: { ...s.readMarks, ...Object.fromEntries(projectIds.map((id) => [id, at])) } }));
}

export async function tasks(projectId: string | null): Promise<TaskRow[]> {
  await delay();
  const state = readMock().tasks;
  return MOCK_TASKS.filter((t) => state[t.id]?.done !== true && (projectId === null || t.project_id === projectId)).map((t) => ({
    ...t,
    version: state[t.id]?.version ?? t.version,
  }));
}

export async function setTaskDone(taskId: string, version: number, done: boolean): Promise<number> {
  await delay();
  const current = readMock().tasks[taskId]?.version ?? MOCK_TASKS.find((t) => t.id === taskId)?.version ?? 1;
  if (current !== version) throw conflictError();
  const next = version + 1;
  writeMock((m) => ({ ...m, tasks: { ...m.tasks, [taskId]: { done, version: next } } }));
  return next;
}

export async function layout(): Promise<{ choices: LayoutChoices; version: number | null }> {
  await delay();
  const saved = readMock().layout;
  return saved ?? { choices: { ...LAYOUT_DEFAULTS }, version: null };
}

export async function saveLayout(choices: LayoutChoices, version: number | null): Promise<number> {
  await delay();
  const current = readMock().layout?.version ?? null;
  if (current !== version) throw conflictError();
  const next = (version ?? 0) + 1;
  writeMock((s) => ({ ...s, layout: { choices, version: next } }));
  return next;
}

/** Fixture folders (with this test's edits) plus the ones made in this test, in tree order, with their file counts. */
function allFolders(): FolderRow[] {
  const saved = readMock().folders;
  const base = MOCK_FOLDERS.map((f) => saved.find((x) => x.id === f.id) ?? f);
  return [...base, ...saved.filter((x) => !base.some((b) => b.id === x.id))];
}

export async function folders(projectId: string): Promise<FolderRow[]> {
  await delay();
  const files = allFiles();
  const all = allFolders();
  return all
    .filter((f) => f.project_id === projectId && folderReadable(f, all))
    .map((f) => ({ ...f, file_count: f.kind === 'inbound' ? files.filter((x) => x.folder_id === f.id).length : null }))
    .sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));
}

export async function createFolder(projectId: string, parentId: string | null, name: string, aiReads: boolean): Promise<FolderRow> {
  await delay();
  const s = readMock();
  const row: FolderRow = {
    id: `mock-folder-${String(s.folders.length + 1)}`,
    project_id: projectId,
    parent_id: parentId,
    name,
    kind: 'general',
    view_only: false,
    proprietary: false,
    sort: 100,
    ai_reads: aiReads,
    version: 1,
    file_count: null,
  };
  writeMock((m) => ({ ...m, folders: [...m.folders, row] }));
  return row;
}

export async function setFolderAiReads(folderId: string, aiReads: boolean, version: number): Promise<number> {
  await delay();
  const current = allFolders().find((f) => f.id === folderId);
  if (!current || current.version !== version) throw conflictError();
  const next: FolderRow = { ...current, ai_reads: aiReads, version: version + 1 };
  writeMock((m) => ({ ...m, folders: [...m.folders.filter((f) => f.id !== folderId), next] }));
  return next.version;
}

/**
 * Fixture files (a saved copy of one wins: moved by a mock write) plus the ones added in this test, less the removed
 * uploads, as the signed-in mock user may read them (the bidder: mock/fileAccess).
 */
function allFiles(): FileRow[] {
  const { files: saved, removedUploads } = readMock();
  const folderRows = allFolders();
  return [...[...MOCK_FILES, ...ADDENDUM_FILES].filter((f) => !saved.some((x) => x.id === f.id)), ...saved].filter(
    (f) => !removedUploads.includes(f.id) && fileReadable(f, folderRows),
  );
}

export async function files(folderId: string): Promise<FileRow[]> {
  await delay();
  return allFiles().filter((f) => f.folder_id === folderId);
}

export async function file(fileId: string): Promise<FileRow | null> {
  await delay();
  return allFiles().find((f) => f.id === fileId) ?? null;
}

export async function addUploadedFile(projectId: string, folderId: string, name: string, mime: string, size: number): Promise<FileRow> {
  await delay();
  const s = readMock();
  const row: FileRow = {
    id: `mock-file-${String(s.files.length + 1)}`,
    project_id: projectId,
    folder_id: folderId,
    original_name: name,
    mime,
    size,
    scan_status: 'pending',
    upload_complete: true,
    created_at: new Date().toISOString(),
    created_by: mockUser().id,
  };
  writeMock((m) => ({ ...m, files: [...m.files, row] }));
  return row;
}

/** What the mock storage refuses, like the hosted size cap (a server setting the app cannot read). */
export const MOCK_STORAGE_CAP = 50 * 1024 * 1024;

/** register_file as the uploader uses it: my unfinished row for this file, the one an earlier try left when there is one. */
export async function registerUpload(projectId: string, folderId: string, name: string, mime: string, size: number): Promise<FileRow> {
  await delay();
  const me = mockUser().id;
  const left = allFiles().find(
    (f) => f.folder_id === folderId && f.original_name === name && f.size === size && f.created_by === me && !f.upload_complete,
  );
  if (left) return left;
  const row: FileRow = {
    id: `mock-file-${String(readMock().files.length + 1)}`,
    project_id: projectId,
    folder_id: folderId,
    original_name: name,
    mime,
    size,
    scan_status: 'pending',
    upload_complete: false,
    created_at: new Date().toISOString(),
    created_by: me,
  };
  writeMock((m) => ({ ...m, files: [...m.files, row] }));
  return row;
}

/** The bytes are stored: the row becomes a file. */
export async function completeUpload(fileId: string): Promise<void> {
  await delay();
  writeMock((m) => ({ ...m, files: m.files.map((f) => (f.id === fileId ? { ...f, upload_complete: true } : f)) }));
}

/** remove_unfinished_upload: my own unfinished row goes; anyone else's is not found; a finished file is refused; repeats are fine. */
export async function removeUnfinishedUpload(fileId: string): Promise<void> {
  await delay();
  const s = readMock();
  if (s.removedUploads.includes(fileId)) return;
  const row = s.files.find((f) => f.id === fileId);
  if (!row || row.created_by !== mockUser().id) throw toDataError({ message: 'not_found', code: 'P0002' });
  if (row.upload_complete) throw toDataError({ message: 'That file finished uploading.', code: '42501' });
  writeMock((m) => ({ ...m, removedUploads: [...m.removedUploads, fileId] }));
}

export async function download(fileId: string): Promise<{ blob: Blob; filename: string }> {
  await delay();
  const f = allFiles().find((x) => x.id === fileId);
  if (!f) throw new Error("You don't have access to this file.");
  return { blob: new Blob([`Synthetic e2e file: ${f.original_name}\n`], { type: 'application/pdf' }), filename: f.original_name };
}

export async function people(): Promise<Person[]> {
  await delay();
  const revoked = readMock().revoked;
  return MOCK_PEOPLE.filter((p) => !revoked.includes(p.member_id));
}

export async function roles(): Promise<RoleRow[]> {
  await delay();
  return MOCK_ROLES;
}

export async function invite(input: InviteInput): Promise<InviteResult> {
  await delay();
  return {
    member_id: `mock-member-${input.email}`,
    status: 'invited',
    link_url: `${window.location.origin}/a/mock-link?t=mock`,
    email_status: 'test_mode',
    email_error: null,
  };
}

export async function revoke(memberId: string): Promise<void> {
  await delay();
  writeMock((s) => ({ ...s, revoked: [...s.revoked, memberId] }));
}

export async function profile(): Promise<ProfileRow> {
  await delay();
  const u = mockUser();
  return readMock().profile ?? mockProfile(u.id, u.email);
}

export async function saveProfile(patch: ProfilePatch, version: number): Promise<ProfileRow> {
  const current = await profile();
  if (current.version !== version) throw conflictError();
  const next: ProfileRow = { ...current, ...patch, version: version + 1 };
  writeMock((s) => ({ ...s, profile: next }));
  return next;
}
