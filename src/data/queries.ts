// Read hooks. Every hook goes through throwIfError; the mock switch lives in isMock() only.
import { skipToken, useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { parseLayout, type LayoutChoices } from '../lib/layout';
import { parseProjectSettings, type ProjectSettings } from '../lib/settings';
import { useUser } from './auth';
import { supabase } from './client';
import { throwIfError, throwIfErrorMaybe } from './errors';
import { qk } from './keys';
import * as mock from './mock/api';
import { isMock } from './mock';
import type { ActivityRow, BoardLine, FileRow, FolderRow, ProfileRow, ProjectRow, TaskRow } from './types';

const BOARD_PAGE = 50;

export function useMyProjects() {
  return useQuery({
    queryKey: qk.myProjects,
    queryFn: async () => (isMock() ? mock.projects() : throwIfError(await supabase.rpc('my_projects'))),
  });
}

type ProjectWithSettings = ProjectRow & { parsedSettings: ProjectSettings };

async function fetchProject(projectId: string): Promise<ProjectWithSettings> {
  const row: ProjectRow = isMock()
    ? await mock.project(projectId)
    : throwIfError(
        await supabase
          .from('projects')
          .select('id, org_id, name, number, address, timezone, stage, modules, settings, version')
          .eq('id', projectId)
          .single(),
      );
  return { ...row, parsedSettings: parseProjectSettings(row.settings) };
}

export function useProject(projectId: string | null) {
  return useQuery({
    queryKey: qk.project(projectId ?? ''),
    queryFn: projectId ? () => fetchProject(projectId) : skipToken,
  });
}

async function fetchBoard(projectId: string | null, before: string | null): Promise<BoardLine[]> {
  if (isMock()) return mock.board(projectId, before);
  const args = {
    p_limit: BOARD_PAGE,
    ...(projectId ? { p_project_id: projectId } : {}),
    ...(before ? { p_before: before } : {}),
  };
  return throwIfError(await supabase.rpc('board_feed', args));
}

/** The message board, newest first, paged back forever by created_at. projectId null = all my jobs. */
export function useBoardFeed(projectId: string | null) {
  return useInfiniteQuery({
    queryKey: qk.board(projectId),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => fetchBoard(projectId, pageParam),
    getNextPageParam: (last: BoardLine[]) => (last.length < BOARD_PAGE ? undefined : last[last.length - 1]?.created_at),
  });
}

async function fetchActivity(id: string): Promise<ActivityRow | null> {
  if (isMock()) return mock.activity(id);
  return throwIfErrorMaybe(
    await supabase
      .from('activity')
      .select('id, project_id, kind, entity_type, entity_id, summary, actor_user_id, created_at')
      .eq('id', id)
      .maybeSingle(),
  );
}

export function useActivity(id: string | null) {
  return useQuery({ queryKey: qk.activity(id ?? ''), queryFn: id ? () => fetchActivity(id) : skipToken });
}

async function fetchReadMark(projectId: string): Promise<string | null> {
  if (isMock()) return mock.readMark(projectId);
  // Single-row results are parsed at the boundary: supabase-js types them loosely for .maybeSingle().
  const row: unknown = throwIfErrorMaybe(
    await supabase.from('read_marks').select('last_seen_at').eq('project_id', projectId).maybeSingle(),
  );
  return row === null ? null : z.object({ last_seen_at: z.string() }).parse(row).last_seen_at;
}

/** When I was last in this job's board (null = never). */
export function useReadMark(projectId: string | null) {
  return useQuery({
    queryKey: qk.readMark(projectId ?? ''),
    queryFn: projectId ? () => fetchReadMark(projectId) : skipToken,
    staleTime: Infinity,
  });
}

async function fetchTasks(userId: string, projectId: string | null): Promise<TaskRow[]> {
  if (isMock()) return mock.tasks(projectId);
  let q = supabase
    .from('tasks')
    .select('id, project_id, kind, title, entity_type, entity_id, due_at, requires_signature, version')
    .eq('assignee_user_id', userId)
    .is('done_at', null);
  if (projectId) q = q.eq('project_id', projectId);
  return throwIfError(await q.order('due_at', { ascending: true, nullsFirst: false }).order('created_at'));
}

/** Open tasks assigned to me ("Needs you"). */
export function useTasks(projectId: string | null) {
  const user = useUser();
  return useQuery({ queryKey: qk.tasks(projectId), queryFn: () => fetchTasks(user.id, projectId) });
}

export interface LayoutState {
  choices: LayoutChoices;
  /** null until the first save creates the row. */
  version: number | null;
}

async function fetchLayout(): Promise<LayoutState> {
  if (isMock()) return mock.layout();
  const row: unknown = throwIfErrorMaybe(await supabase.from('user_layout').select('*').maybeSingle());
  const version = row === null ? null : z.object({ version: z.number() }).parse(row).version;
  return { choices: parseLayout(row), version };
}

export function useUserLayout() {
  return useQuery({ queryKey: qk.layout, queryFn: fetchLayout, staleTime: Infinity });
}

async function fetchFolders(projectId: string): Promise<FolderRow[]> {
  if (isMock()) return mock.folders(projectId);
  return throwIfError(
    await supabase
      .from('folders')
      .select('id, project_id, parent_id, name, kind, view_only, proprietary')
      .eq('project_id', projectId)
      .is('deleted_at', null)
      .order('name'),
  );
}

export function useFolders(projectId: string | null) {
  return useQuery({ queryKey: qk.folders(projectId ?? ''), queryFn: projectId ? () => fetchFolders(projectId) : skipToken });
}

const FILE_COLS = 'id, project_id, folder_id, original_name, mime, size, scan_status, upload_complete, created_at, created_by';

async function fetchFiles(folderId: string, userId: string): Promise<FileRow[]> {
  const rows: FileRow[] = isMock()
    ? await mock.files(folderId)
    : throwIfError(
        await supabase
          .from('files')
          .select(FILE_COLS)
          .eq('folder_id', folderId)
          .is('deleted_at', null)
          .is('superseded_by', null)
          .order('original_name'),
      );
  // Someone else's unfinished upload is not a file yet; my own shows so I can see it resume.
  return rows.filter((f) => f.upload_complete || f.created_by === userId);
}

export function useFiles(folderId: string | null) {
  const user = useUser();
  return useQuery({ queryKey: qk.files(folderId ?? ''), queryFn: folderId ? () => fetchFiles(folderId, user.id) : skipToken });
}

async function fetchFile(fileId: string): Promise<FileRow | null> {
  if (isMock()) return mock.file(fileId);
  return throwIfErrorMaybe(await supabase.from('files').select(FILE_COLS).eq('id', fileId).is('deleted_at', null).maybeSingle());
}

export function useFile(fileId: string | null) {
  return useQuery({ queryKey: qk.file(fileId ?? ''), queryFn: fileId ? () => fetchFile(fileId) : skipToken });
}

export function usePeopleDisplay(projectId: string | null) {
  return useQuery({
    queryKey: qk.people(projectId ?? ''),
    queryFn: projectId
      ? async () => (isMock() ? mock.people() : throwIfError(await supabase.rpc('people_display', { p_project_id: projectId })))
      : skipToken,
  });
}

export function useRoles() {
  return useQuery({
    queryKey: qk.roles,
    queryFn: async () => (isMock() ? mock.roles() : throwIfError(await supabase.from('roles').select('name, description').order('name'))),
    staleTime: Infinity,
  });
}

async function fetchProfile(): Promise<ProfileRow> {
  if (isMock()) return mock.profile();
  return throwIfError(
    await supabase.from('profiles').select('user_id, email, full_name, phone, title, company, timezone, timezone_set_by_user, version').single(),
  );
}

export function useProfile() {
  return useQuery({ queryKey: qk.profile, queryFn: fetchProfile });
}

/** Asks the database (has_capability) — the UI never decides permissions from role names. */
export function useCapability(projectId: string | null, cap: string) {
  return useQuery({
    queryKey: qk.capability(projectId ?? '', cap),
    queryFn: projectId
      ? async () =>
          isMock() ? true : throwIfError(await supabase.rpc('has_capability', { p_project_id: projectId, p_cap: cap }))
      : skipToken,
    staleTime: 60_000,
  });
}

/** Can I upload into this folder? Asks folder_can_write (the same rule the storage policy uses). */
export function useCanWriteFolder(folderId: string | null) {
  return useQuery({
    queryKey: ['folder_can_write', folderId ?? ''] as const,
    queryFn: folderId
      ? async () => (isMock() ? true : throwIfError(await supabase.rpc('folder_can_write', { p_folder_id: folderId })))
      : skipToken,
    staleTime: 60_000,
  });
}
