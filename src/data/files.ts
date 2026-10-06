// Files: a file's facts for its pane (its version, whether I may delete or rename it, its earlier versions), and the
// file and folder writes in Files: Delete (file_remove) with Undo (file_restore), Rename (file_rename), and a folder's
// Rename. The database decides who may (migration 0074: the uploader or files.manage, never a signed record) and checks
// the version; every write refreshes the lists it changes.
import { skipToken, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { supabase } from './client';
import { conflictError, throwIfError, throwIfErrorMaybe } from './errors';
import { qk } from './keys';
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

interface FileRef {
  id: string;
  folder_id: string;
  project_id: string;
}

/** Everything that shows this file: its pane, its folder's list, the folder counts. */
async function refresh(qc: ReturnType<typeof useQueryClient>, f: FileRef): Promise<void> {
  await Promise.all([
    qc.invalidateQueries({ queryKey: qk.file(f.id) }),
    qc.invalidateQueries({ queryKey: qk.files(f.folder_id) }),
    qc.invalidateQueries({ queryKey: qk.folders(f.project_id) }),
  ]);
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

/** Delete (soft): the file leaves its folder at once; `useRestoreFile` is the toast's Undo. */
export function useRemoveFile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { file: FileRef; version: number }) => removeFile(v.file.id, v.version),
    onSuccess: (_d, v) => refresh(qc, v.file),
  });
}

/** Undo of a Delete, by the person who deleted it (within the hour). */
export function useRestoreFile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file: FileRef) => restoreFile(file.id),
    onSuccess: (_d, file) => refresh(qc, file),
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
