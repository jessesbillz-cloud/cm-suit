// In-memory stand-ins for every data-layer call, used only when isMock() is true.
import { LAYOUT_DEFAULTS, type LayoutChoices } from '../../lib/layout';
import { conflictError } from '../errors';
import type {
  ActivityRow,
  BoardLine,
  FileRow,
  FolderRow,
  InviteInput,
  InviteResult,
  MyProject,
  Person,
  ProfilePatch,
  ProfileRow,
  ProjectRow,
  RoleRow,
  TaskRow,
} from '../types';
import {
  MOCK_ACTIVITY,
  MOCK_FILES,
  MOCK_FOLDERS,
  MOCK_PEOPLE,
  MOCK_PROJECTS,
  MOCK_ROLES,
  MOCK_TASKS,
  mockProfile,
  toBoardLine,
} from './fixtures';
import { mockUser } from './index';
import { delay, readMock, writeMock } from './store';

export async function projects(): Promise<MyProject[]> {
  await delay();
  return MOCK_PROJECTS;
}

export async function project(projectId: string): Promise<ProjectRow> {
  await delay();
  const p = MOCK_PROJECTS.find((x) => x.project_id === projectId);
  if (!p) throw new Error('That job no longer exists.');
  return {
    id: p.project_id,
    org_id: 'org-sample',
    name: p.name,
    number: p.number,
    address: null,
    timezone: p.timezone,
    stage: p.stage,
    modules: p.modules,
    settings: {},
    version: 1,
  };
}

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

export async function folders(projectId: string): Promise<FolderRow[]> {
  await delay();
  return [...MOCK_FOLDERS, ...readMock().folders].filter((f) => f.project_id === projectId);
}

export async function createFolder(projectId: string, parentId: string | null, name: string): Promise<FolderRow> {
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
  };
  writeMock((m) => ({ ...m, folders: [...m.folders, row] }));
  return row;
}

function allFiles(): FileRow[] {
  return [...MOCK_FILES, ...readMock().files];
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

export async function download(fileId: string): Promise<{ blob: Blob; filename: string }> {
  await delay();
  const f = allFiles().find((x) => x.id === fileId);
  if (!f) throw new Error('That file no longer exists.');
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
