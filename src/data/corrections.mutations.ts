// Corrections log writes (SPEC §13.4). Create goes through create_correction (the database numbers it and a repeat
// returns the same item); steps through set_correction_status; undo through undo_correction; edits carry a version
// check. Every write refreshes the job's corrections queries, and the board and "Needs you" (lines and tasks).
import { useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { useUser } from './auth';
import { supabase } from './client';
import { conflictError, throwIfError } from './errors';
import { qk } from './keys';
import * as mockCn from './mock/corrections';
import { isMock } from './mock';
import { uploadFile } from './upload';
import {
  CORRECTION_COLS,
  correctionSchema,
  type CorrectionFields,
  type CorrectionRow,
  type NewCorrectionInput,
  type StepInput,
  type UndoResult,
} from './corrections.types';

function useRefresh() {
  const qc = useQueryClient();
  return (projectId: string) =>
    Promise.all([
      qc.invalidateQueries({ queryKey: qk.corrections(projectId) }),
      qc.invalidateQueries({ queryKey: qk.board(projectId) }),
      qc.invalidateQueries({ queryKey: qk.tasksAll }),
    ]);
}

/** Puts a written row into the cached list at once, so the pane never flashes "gone" before the refetch. */
function usePutInList() {
  const qc = useQueryClient();
  return (row: CorrectionRow) => {
    qc.setQueryData<CorrectionRow[]>(qk.correctionsPart(row.project_id, 'list'), (old) =>
      old ? [row, ...old.filter((r) => r.id !== row.id)].sort((a, b) => b.number - a.number) : old,
    );
  };
}

function parseRow(data: unknown): CorrectionRow {
  return correctionSchema.parse(Array.isArray(data) ? data[0] : data);
}

export function useCreateCorrection() {
  const refresh = useRefresh();
  const put = usePutInList();
  return useMutation({
    mutationFn: async (v: NewCorrectionInput): Promise<CorrectionRow> => {
      if (isMock()) return mockCn.create(v);
      const data: unknown = throwIfError(
        await supabase.rpc('create_correction', {
          p_project_id: v.projectId,
          p_title: v.title,
          p_request_key: v.requestKey,
          p_description: v.description,
          p_trade: v.trade,
          p_location: v.location,
          p_spec_tags: v.spec_tags,
          p_photo_ids: v.photoIds,
          ...(v.noticeFileId ? { p_notice_file_id: v.noticeFileId } : {}),
          p_notice_ref: v.notice_ref,
        }),
      );
      return parseRow(data);
    },
    onSuccess: put,
    onSettled: (_r, _e, v) => refresh(v.projectId),
  });
}

/** Edits the typed fields (creator or inspector; RLS decides). Zero rows back = someone changed it first. */
export function useSaveCorrection() {
  const refresh = useRefresh();
  const put = usePutInList();
  return useMutation({
    mutationFn: async (v: { row: CorrectionRow; patch: CorrectionFields & { notice_file_id: string | null } }): Promise<CorrectionRow> => {
      if (isMock()) return mockCn.save(v.row, v.patch);
      const rows: unknown = throwIfError(
        await supabase.from('corrections').update(v.patch).eq('id', v.row.id).eq('version', v.row.version).select(CORRECTION_COLS),
      );
      const saved = z.array(correctionSchema).parse(rows)[0];
      if (!saved) throw conflictError();
      return saved;
    },
    onSuccess: put,
    onSettled: (_r, _e, v) => refresh(v.row.project_id),
  });
}

/** Mark ready (corrections.mark_ready) or decide (corrections.close), with a note and up to 6 photos. */
export function useCorrectionStep() {
  const refresh = useRefresh();
  const put = usePutInList();
  return useMutation({
    mutationFn: async (v: StepInput): Promise<CorrectionRow> => {
      if (isMock()) return mockCn.step(v);
      const data: unknown = throwIfError(
        await supabase.rpc('set_correction_status', {
          p_id: v.row.id,
          p_version: v.row.version,
          p_status: v.status,
          p_note: v.note,
          p_photo_ids: v.photoIds,
        }),
      );
      return parseRow(data);
    },
    onSuccess: put,
    onSettled: (_r, _e, v) => refresh(v.row.project_id),
  });
}

const undoneSchema = correctionSchema.extend({ deleted_at: z.string().nullable() });

/** Undoes my own latest step (or the create: then the item is removed). */
export function useUndoCorrection() {
  const refresh = useRefresh();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (row: CorrectionRow): Promise<UndoResult> => {
      if (isMock()) return mockCn.undo(row);
      const data: unknown = throwIfError(await supabase.rpc('undo_correction', { p_id: row.id, p_version: row.version }));
      const undone = undoneSchema.parse(Array.isArray(data) ? data[0] : data);
      return { row: correctionSchema.parse(undone), removed: undone.deleted_at !== null };
    },
    onSuccess: ({ row, removed }) => {
      qc.setQueryData<CorrectionRow[]>(qk.correctionsPart(row.project_id, 'list'), (old) =>
        old?.flatMap((r) => (r.id !== row.id ? [r] : removed ? [] : [row])),
      );
    },
    onSettled: (_r, _e, row) => refresh(row.project_id),
  });
}

async function photoFolder(projectId: string): Promise<string> {
  if (isMock()) return mockCn.photoFolder(projectId);
  return z.string().parse(throwIfError(await supabase.rpc('correction_photo_folder', { p_project_id: projectId })));
}

/**
 * Uploads one file (a compressed photo, or the notice) into the job's Photos/Corrections folder and resolves to its
 * file id. A plain callback, not a mutation, so several photos upload side by side.
 */
export function useCorrectionFileUpload() {
  const user = useUser();
  const qc = useQueryClient();
  const userId = user.id;
  return useCallback(
    async (projectId: string, file: File, signal: AbortSignal): Promise<string> => {
      const folderId = await qc.query({
        queryKey: qk.correctionsPart(projectId, 'photo_folder'),
        queryFn: () => photoFolder(projectId),
        staleTime: Infinity,
      });
      const { fileId } = await uploadFile({ file, projectId, folderId, userId, signal, onProgress: () => undefined });
      return fileId;
    },
    [qc, userId],
  );
}
