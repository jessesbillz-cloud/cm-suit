// Folder writes: create (files.manage; the database checks it again) and "Search and AI read this" (ai_reads),
// saved with a version check (CLAUDE.md rule 7).
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { useUser } from './auth';
import { supabase } from './client';
import { conflictError, throwIfError } from './errors';
import { qk } from './keys';
import * as mock from './mock/api';
import { isMock } from './mock';
import { FOLDER_COLS } from './queries';
import type { FolderRow } from './types';

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
  const row: Omit<FolderRow, 'file_count'> = throwIfError(
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
  return { ...row, file_count: null };
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
