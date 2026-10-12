// Files: a file's facts for its pane (its version, whether I may delete or rename it, its earlier versions), which rows
// of a list I may change and the folders I may add to (0096), and the file and folder writes in Files: Delete
// (file_remove) with Undo (file_restore), Move (file_move, Undo is the move back), Rename (file_rename), and a folder's
// Rename. The database decides who may (0074: the uploader or files.manage, never a signed record, 0096: and adds to the
// folder it goes to) and checks the version; every write refreshes the lists it changes.
import { skipToken, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { supabase } from './client';
import { conflictError, throwIfError, throwIfErrorMaybe } from './errors';
import { qk } from './keys';
import { runPool } from '../lib/pool';
import { isMock } from './mock';
import * as mock from './mock/files';
import { FOLDER_COLS } from './queries';
import type { FolderRow } from './types';

const earlierSchema = z.object({
  id: z.string(),
  original_name: z.string(),
  mime: z.string(),
  size: z.number(),
  created_at: z.string(),
  version_no: z.number(),
});
export type EarlierVersion = z.infer<typeof earlierSchema>;
const rowSchema = z.object({ version: z.number(), version_group_id: z.string() });
const changeableSchema = z.array(z.object({ file_id: z.string(), version: z.number() }));
const writableSchema = z.array(z.object({ folder_id: z.string() }));

export interface FileFacts {
  /** The row's version: what Delete and Rename check. */
  version: number;
  /** May I delete or rename it (file_can_change: the uploader or files.manage, not a signed record). */
  canChange: boolean;
  /** Superseded versions of the same file, newest first (a regenerated report's earlier PDFs). */
  earlier: EarlierVersion[];
}

async function fetchFacts(fileId: string): Promise<FileFacts> {
  if (isMock()) return mock.facts(fileId);
  const raw: unknown = throwIfError(await supabase.from('files').select('version, version_group_id').eq('id', fileId).single());
  const row = rowSchema.parse(raw);
  const [can, older] = await Promise.all([
    supabase.rpc('file_can_change', { p_file_id: fileId }),
    supabase
      .from('files')
      .select('id, original_name, mime, size, created_at, version_no')
      .eq('version_group_id', row.version_group_id)
      .neq('id', fileId)
      .is('deleted_at', null)
      .order('version_no', { ascending: false }),
  ]);
  const canChange = throwIfError(can);
  const earlier = throwIfError(older);
  return { version: row.version, canChange, earlier: z.array(earlierSchema).parse(earlier) };
}

export function useFileFacts(fileId: string | null) {
  return useQuery({ queryKey: qk.fileFacts(fileId ?? ''), queryFn: fileId ? () => fetchFacts(fileId) : skipToken });
}

async function fetchChangeable(ids: readonly string[]): Promise<Map<string, number>> {
  if (isMock()) return mock.changeable(ids);
  if (ids.length === 0) return new Map();
  const rows = changeableSchema.parse(throwIfError(await supabase.rpc('files_changeable', { p_file_ids: [...ids] })));
  return new Map(rows.map((r) => [r.file_id, r.version]));
}

/** The rows of a section's list I may change (Delete, Move, a checkbox), each with its version: one call for the list. */
export function useChangeable(projectId: string, kind: string, ids: readonly string[]) {
  return useQuery({
    queryKey: qk.fileChangeable(projectId, kind, ids),
    queryFn: () => fetchChangeable(ids),
    // A file just added asks again: the rows keep their checkboxes meanwhile.
    placeholderData: (previous) => previous,
  });
}

async function fetchWritable(projectId: string): Promise<Set<string>> {
  if (isMock()) return mock.writableFolders(projectId);
  const rows = writableSchema.parse(throwIfError(await supabase.rpc('my_writable_folders', { p_project_id: projectId })));
  return new Set(rows.map((r) => r.folder_id));
}

/** The folders of a job I may add to (folder_can_write), for Move to. */
export function useWritableFolders(projectId: string) {
  return useQuery({ queryKey: qk.writableFolders(projectId), queryFn: () => fetchWritable(projectId), staleTime: 60_000 });
}

interface FileRef {
  id: string;
  folder_id: string;
  project_id: string;
}

/** Everything that shows this file: its pane, its folder's list, the folder counts. */
async function refresh(qc: ReturnType<typeof useQueryClient>, f: FileRef): Promise<void> {
  await refreshMany(qc, [f]);
}

/** The same for many files at once: each pane, each folder's list once, the folder counts once (plus `alsoFolders`). */
async function refreshMany(qc: ReturnType<typeof useQueryClient>, files: readonly FileRef[], alsoFolders: readonly string[] = []) {
  const folders = new Set([...files.map((f) => f.folder_id), ...alsoFolders]);
  const projects = new Set(files.map((f) => f.project_id));
  await Promise.all([
    ...files.map((f) => qc.invalidateQueries({ queryKey: qk.file(f.id) })),
    ...[...folders].map((id) => qc.invalidateQueries({ queryKey: qk.files(id) })),
    ...[...projects].map((id) => qc.invalidateQueries({ queryKey: qk.folders(id) })),
  ]);
}

/** One write of a batch: what it answered, or why it did not happen. */
export type Outcome<T, R> = { ok: true; item: T; value: R } | { ok: false; item: T; error: unknown };

/** Runs one write per item, a few at a time; one refused write never stops the others (each answers for itself). */
async function eachOf<T, R>(items: readonly T[], write: (item: T) => Promise<R>): Promise<Outcome<T, R>[]> {
  const out: Outcome<T, R>[] = [];
  await runPool(
    items,
    6,
    async (item) => {
      out.push({ ok: true, item, value: await write(item) });
    },
    (item, error) => {
      out.push({ ok: false, item, error });
    },
  );
  return out;
}

async function removeFile(id: string, version: number): Promise<void> {
  if (isMock()) {
    await mock.remove(id, version);
    return;
  }
  throwIfErrorMaybe(await supabase.rpc('file_remove', { p_file_id: id, p_version: version }));
}

async function restoreFile(id: string): Promise<void> {
  if (isMock()) {
    await mock.restore(id);
    return;
  }
  throwIfErrorMaybe(await supabase.rpc('file_restore', { p_file_id: id }));
}

interface FileVersion {
  file: FileRef;
  version: number;
}

/** Delete (soft), one file or many: each leaves its folder at once; `useRestoreFiles` is the toast's Undo. */
export function useRemoveFiles() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (items: readonly FileVersion[]) => eachOf(items, (v) => removeFile(v.file.id, v.version)),
    onSettled: (_d, _e, items) => refreshMany(qc, items.map((v) => v.file)),
  });
}

/** Undo of a Delete, by the person who deleted them (within the hour). */
export function useRestoreFiles() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (files: readonly FileRef[]) => eachOf(files, (f) => restoreFile(f.id)),
    onSettled: (_d, _e, files) => refreshMany(qc, files),
  });
}

async function moveFile(id: string, version: number, folderId: string): Promise<number> {
  if (isMock()) return mock.move(id, version, folderId);
  return throwIfError(await supabase.rpc('file_move', { p_file_id: id, p_version: version, p_folder_id: folderId }));
}

interface FileMove extends FileVersion {
  folderId: string;
}

/**
 * Moves files to other folders and answers each one (its new version, or why it stayed). Undo is the same call with
 * each file's new version, back to its old folder.
 */
export function useMoveFiles() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (moves: readonly FileMove[]) => eachOf(moves, (m) => moveFile(m.file.id, m.version, m.folderId)),
    onSettled: (_d, _e, moves) =>
      refreshMany(
        qc,
        moves.map((m) => m.file),
        moves.map((m) => m.folderId),
      ),
  });
}

async function renameFile(id: string, version: number, name: string): Promise<number> {
  if (isMock()) return mock.rename(id, version, name);
  return throwIfError(await supabase.rpc('file_rename', { p_file_id: id, p_version: version, p_name: name }));
}

/** Rename: the name people see and download under. */
export function useRenameFile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { file: FileRef; version: number; name: string }) => renameFile(v.file.id, v.version, v.name),
    onSuccess: (_d, v) => refresh(qc, v.file),
  });
}

async function renameFolder(folder: FolderRow, name: string): Promise<FolderRow> {
  if (isMock()) return mock.renameFolder(folder.id, folder.version, name);
  const rows = throwIfError(
    await supabase.from('folders').update({ name }).eq('id', folder.id).eq('version', folder.version).select(FOLDER_COLS),
  );
  const row = rows[0];
  if (!row) throw conflictError();
  return { ...row, file_count: folder.file_count, app_only: folder.app_only, person: folder.person };
}

/** A folder's Rename (files.manage; the database refuses the system's own names and the server's folders). */
export function useRenameFolder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { folder: FolderRow; name: string }) => renameFolder(v.folder, v.name.trim()),
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: qk.folders(v.folder.project_id) }),
  });
}
