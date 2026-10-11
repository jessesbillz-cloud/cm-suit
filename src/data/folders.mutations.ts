// Folder writes: create (files.manage; the database checks it again) and "Search and AI read this" (ai_reads),
// saved with a version check (CLAUDE.md rule 7). And Remove on an upload that an earlier visit left unfinished.
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { useUser } from './auth';
import { supabase } from './client';
import { conflictError, DataError, throwIfError, throwIfErrorMaybe } from './errors';
import { qk } from './keys';
import * as mock from './mock/api';
import { isMock } from './mock';
import { FOLDER_COLS } from './queries';
import type { FolderRow } from './types';
import { removeUnfinishedUpload } from './upload';

interface NewFolderInput {
  projectId: string;
  parentId: string | null;
  name: string;
  aiReads: boolean;
}

async function insertFolder(userId: string, v: NewFolderInput): Promise<FolderRow> {
  if (isMock()) return mock.createFolder(v.projectId, v.parentId, v.name, v.aiReads);
  const projectRow: unknown = throwIfError(await supabase.from('projects').select('org_id').eq('id', v.projectId).single());
  const project = z.object({ org_id: z.string() }).parse(projectRow);
  const row: Omit<FolderRow, 'file_count' | 'app_only' | 'person'> = throwIfError(
    await supabase
      .from('folders')
      .insert({
        org_id: project.org_id,
        project_id: v.projectId,
        parent_id: v.parentId,
        name: v.name.trim(),
        ai_reads: v.aiReads,
        created_by: userId,
      })
      .select(FOLDER_COLS)
      .single(),
  );
  return { ...row, file_count: null, app_only: false, person: null };
}

async function findFolder(projectId: string, parentId: string | null, name: string): Promise<string | null> {
  if (isMock()) return mock.findFolder(projectId, parentId, name);
  const base = supabase.from('folders').select('id').eq('project_id', projectId).eq('name', name).is('deleted_at', null);
  const scoped = parentId === null ? base.is('parent_id', null) : base.eq('parent_id', parentId);
  const row = throwIfErrorMaybe(await scoped.maybeSingle());
  return row?.id ?? null;
}

/**
 * The folder of that name under that parent: the one there, else a new one. The database keeps names unique per
 * parent, so two drops racing end on the same folder (the loser finds the winner's).
 */
async function ensureFolder(userId: string, v: NewFolderInput): Promise<string> {
  const name = v.name.trim();
  const found = await findFolder(v.projectId, v.parentId, name);
  if (found !== null) return found;
  try {
    return (await insertFolder(userId, { ...v, name })).id;
  } catch (e) {
    if (!(e instanceof DataError) || e.code !== '23505') throw e;
    const again = await findFolder(v.projectId, v.parentId, name);
    if (again === null) throw e;
    return again;
  }
}

/**
 * Finds or makes each folder of a dropped folder tree under `parentId` (parents first), and returns each path's
 * folder id by its key ("a/b"). The folder list reloads once at the end.
 */
export function useEnsureFolders() {
  const qc = useQueryClient();
  const user = useUser();
  return useMutation({
    mutationFn: async (v: { projectId: string; parentId: string; aiReads: boolean; dirs: readonly (readonly string[])[] }) => {
      const ids = new Map<string, string>([['', v.parentId]]);
      for (const dir of v.dirs) {
        const parent = ids.get(dir.slice(0, -1).join('/'));
        const name = dir[dir.length - 1];
        if (parent === undefined || name === undefined) throw new Error('A dropped folder came before its parent.');
        ids.set(dir.join('/'), await ensureFolder(user.id, { projectId: v.projectId, parentId: parent, name, aiReads: v.aiReads }));
      }
      return ids;
    },
    onSettled: (_d, _e, v) => qc.invalidateQueries({ queryKey: qk.folders(v.projectId) }),
  });
}

export function useCreateFolder() {
  const qc = useQueryClient();
  const user = useUser();
  return useMutation({
    mutationFn: (v: NewFolderInput) => insertFolder(user.id, v),
    onSuccess: (folder) => qc.invalidateQueries({ queryKey: qk.folders(folder.project_id) }),
  });
}

async function updateAiReads(folder: FolderRow, aiReads: boolean): Promise<number> {
  if (isMock()) return mock.setFolderAiReads(folder.id, aiReads, folder.version);
  const rows = throwIfError(
    await supabase.from('folders').update({ ai_reads: aiReads }).eq('id', folder.id).eq('version', folder.version).select('version'),
  );
  const row = rows[0];
  if (!row) throw conflictError();
  return row.version;
}

/** Turns "Search and AI read this" on or off for one folder. */
export function useSetFolderAiReads() {
  const qc = useQueryClient();
  return useMutation({
    scope: { id: 'folder_ai_reads' },
    mutationFn: (v: { folder: FolderRow; aiReads: boolean }) => updateAiReads(v.folder, v.aiReads),
    // A folder-list refetch already in flight (e.g. right after a new folder) must not land after this and undo it.
    onMutate: (v) => qc.cancelQueries({ queryKey: qk.folders(v.folder.project_id) }),
    onSuccess: (version, v) => {
      qc.setQueryData<FolderRow[]>(qk.folders(v.folder.project_id), (list) =>
        list?.map((f) => (f.id === v.folder.id ? { ...f, ai_reads: v.aiReads, version } : f)),
      );
    },
    onError: (_e, v) => qc.invalidateQueries({ queryKey: qk.folders(v.folder.project_id) }),
  });
}

/** Takes back the files row of my upload that never finished (remove_unfinished_upload), then the folder's list reloads. */
export function useRemoveUnfinishedUpload() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file: { id: string; folder_id: string }) => removeUnfinishedUpload(file.id),
    onSuccess: (_d, file) => qc.invalidateQueries({ queryKey: qk.files(file.folder_id) }),
  });
}
