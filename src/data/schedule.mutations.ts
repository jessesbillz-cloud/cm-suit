// Schedule writes (migration 0062). Upload: the file goes into the job's Schedule folder through the one uploader (a
// photo through the one compressor first), then the schedule-import function reads it into a draft. A draft's title,
// data date and rows are saved one RPC each, version-checked; a row is removed (and put back) and a draft discarded
// (and brought back) with Undo; Publish makes it the current schedule and Undo (the publisher, 15 minutes) puts the
// old one back. Every write refreshes the job's schedule queries.
import { useCallback, useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { compressPhoto, jpegName } from '../lib/compressPhoto';
import { saveFile } from '../lib/saveFile';
import { useUser } from './auth';
import { supabase } from './client';
import { downloadFile } from './download';
import { DataError, throwIfError, throwIfErrorMaybe } from './errors';
import { callFunction } from './functions';
import { qk } from './keys';
import { isMock } from './mock';
import * as mock from './mock/schedule';
import { importedSchema, publishedSchema, type ActivityInput, type Imported, type Published } from './schedule.types';
import { uploadFile } from './upload';

/** A SQL null for an argument the generated types call required (PostgREST passes JSON null through). */
function sqlNull<T>(v: T | null): T {
  return v as T;
}

function first<T>(rows: T[]): T {
  const row = rows[0];
  if (row === undefined) throw new DataError('The server answered nothing.', null, null);
  return row;
}

function useRefresh(projectId: string) {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: qk.schedule(projectId) });
}

async function scheduleFolder(projectId: string): Promise<string> {
  if (isMock()) return mock.folder(projectId);
  return z.string().parse(throwIfError(await supabase.rpc('schedule_folder', { p_project_id: projectId })));
}

/** A photo is compressed (and made a JPEG) before it goes up; any other file goes as it is. */
async function prepared(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) return file;
  return new File([await compressPhoto(file)], jpegName(file.name), { type: 'image/jpeg' });
}

/**
 * Upload one schedule file and read it into a draft: the folder, the one uploader, then schedule-import (which decides
 * what the file is). Resolves to the draft.
 */
export function useScheduleUpload(projectId: string) {
  const user = useUser();
  const qc = useQueryClient();
  const refresh = useRefresh(projectId);
  const userId = user.id;
  const upload = useCallback(
    async (picked: File): Promise<Imported> => {
      if (isMock()) return mock.importFile(projectId, picked);
      const folderId = await qc.query({
        queryKey: qk.schedulePart(projectId, 'folder'),
        queryFn: () => scheduleFolder(projectId),
        staleTime: Infinity,
      });
      const file = await prepared(picked);
      const { fileId } = await uploadFile({ file, projectId, folderId, userId, signal: new AbortController().signal, onProgress: () => undefined });
      return callFunction('schedule-import', { project_id: projectId, file_id: fileId }, importedSchema);
    },
    [qc, projectId, userId],
  );
  return useMutation({ mutationFn: upload, onSettled: refresh });
}

/** A draft's title and data date, with its version. Resolves to the next version. */
export function useSaveDraft(projectId: string, versionId: string) {
  const refresh = useRefresh(projectId);
  return useMutation({
    mutationFn: async (v: { version: number; title: string; dataDate: string | null }): Promise<number> => {
      if (isMock()) return mock.saveDraft(versionId, v.version, v.title, v.dataDate);
      return z.number().int().parse(
        throwIfError(
          await supabase.rpc('schedule_draft_save', {
            p_version_id: versionId, p_version: v.version, p_title: v.title, p_data_date: sqlNull(v.dataDate),
          }),
        ),
      );
    },
    onSettled: refresh,
  });
}

/** One row of a draft, with its version. */
export function useSaveActivity(projectId: string) {
  const refresh = useRefresh(projectId);
  return useMutation({
    mutationFn: async (v: { id: string; version: number; input: ActivityInput }): Promise<number> => {
      if (isMock()) return mock.saveActivity(v.id, v.version, v.input);
      const a = v.input;
      return z.number().int().parse(
        throwIfError(
          await supabase.rpc('schedule_activity_save', {
            p_activity_id: v.id, p_version: v.version, p_code: a.code, p_name: a.name, p_wbs: a.wbs, p_area: a.area,
            p_trade: a.trade, p_start: sqlNull(a.start), p_finish: sqlNull(a.finish), p_is_milestone: a.isMilestone,
          }),
        ),
      );
    },
    onSettled: refresh,
  });
}

async function removeRow(id: string, removed: boolean): Promise<void> {
  if (isMock()) return mock.removeActivity(id, removed);
  throwIfErrorMaybe(await supabase.rpc('schedule_activity_remove', { p_activity_id: id, p_removed: removed }));
}

async function discardVersion(id: string, discarded: boolean): Promise<void> {
  if (isMock()) return mock.discard(id, discarded);
  throwIfErrorMaybe(await supabase.rpc('schedule_discard', { p_version_id: id, p_discarded: discarded }));
}

async function unpublishVersion(versionId: string): Promise<void> {
  if (isMock()) return mock.unpublish(versionId);
  throwIfErrorMaybe(await supabase.rpc('schedule_unpublish', { p_version_id: versionId }));
}

/** Take a row off a draft (Undo: useScheduleUndo). */
export function useRemoveActivity(projectId: string) {
  const refresh = useRefresh(projectId);
  return useMutation({ mutationFn: (id: string) => removeRow(id, true), onSettled: refresh });
}

/** Discard a draft (Undo: useScheduleUndo). */
export function useDiscardDraft(projectId: string) {
  const refresh = useRefresh(projectId);
  return useMutation({ mutationFn: (id: string) => discardVersion(id, true), onSettled: refresh });
}

/** Publish a draft (with its version): the job's current schedule from now on. */
export function usePublish(projectId: string) {
  const refresh = useRefresh(projectId);
  return useMutation({
    mutationFn: async (v: { id: string; version: number }): Promise<Published> => {
      if (isMock()) return mock.publish(v.id, v.version);
      const rows: unknown = throwIfError(await supabase.rpc('schedule_publish', { p_version_id: v.id, p_version: v.version }));
      return first(z.array(publishedSchema).parse(rows));
    },
    onSettled: refresh,
  });
}

/**
 * The toasts' Undo: plain promises that still work once the screen that offered them has gone (a publish goes to the
 * look-ahead, a discard to Updates). Undo a publish (the publisher, within 15 minutes): back to a draft, the old
 * schedule current again; bring a discarded draft or a removed row back. Each refreshes the job's schedule.
 */
export function useScheduleUndo(projectId: string) {
  const qc = useQueryClient();
  return useMemo(() => {
    const run = async (undo: () => Promise<void>): Promise<void> => {
      try {
        await undo();
      } finally {
        await qc.invalidateQueries({ queryKey: qk.schedule(projectId) });
      }
    };
    return {
      unpublish: (versionId: string) => run(() => unpublishVersion(versionId)),
      restoreDraft: (versionId: string) => run(() => discardVersion(versionId, false)),
      restoreRow: (activityId: string) => run(() => removeRow(activityId, false)),
    };
  }, [qc, projectId]);
}

/** Downloads a version's original file: the one download path (a fresh signed URL, logged). */
export async function downloadScheduleFile(fileId: string): Promise<void> {
  if (isMock()) {
    const { blob, filename } = await mock.fileBlob(fileId);
    await saveFile(blob, filename);
    return;
  }
  await downloadFile(fileId);
}
