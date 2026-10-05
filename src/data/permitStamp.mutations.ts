// Permit stamp writes (migration 0053, edge function permit-stamp). The server stamps one PDF per call ('stamp'), then
// records the set once ('record': the permit is issued, or the set revised); both need a fresh sign-in (SignButton
// handles 403 reauth_required). Viewing a stamped sheet asks the same function for a URL the file viewer shows. The official's own
// PDFs upload into the job's "To stamp" folder through the shared upload queue (progress, Stop, Remove).
import { useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { supabase } from './client';
import { throwIfError } from './errors';
import { callFunction } from './functions';
import { qk } from './keys';
import { isMock } from './mock';
import * as mockStamp from './mock/permitStamp';
import type { PermitRef } from './permits.types';
import { recordResultSchema, stampedFileSchema, viewResultSchema, type RecordResult, type StampedFile } from './permitStamp.types';
import { useUploadQueue } from './UploadQueue';

/** Stamps one PDF (permits.manage, a fresh sign-in): the copy waits in "Stamping" until the set is recorded. */
export function useStampFile() {
  return useMutation({
    mutationFn: async (v: { permit: PermitRef; fileId: string }): Promise<StampedFile> => {
      if (isMock()) return mockStamp.stamp(v.permit, v.fileId);
      return callFunction(
        'permit-stamp',
        { action: 'stamp', permit_id: v.permit.id, version: v.permit.version, file_id: v.fileId },
        stampedFileSchema,
      );
    },
  });
}

/** Records the stamped copies as the permit's approved set (issuing it, or revising the set). Safe to repeat. */
export function useRecordSet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { permit: PermitRef; stamped: readonly StampedFile[] }): Promise<RecordResult> => {
      if (isMock()) return mockStamp.record(v.permit, v.stamped);
      // The copies alone: the server keeps what each one is (its original, time, hash), never the browser (0054).
      const ids = v.stamped.map((s) => s.stamped_file_id);
      return callFunction(
        'permit-stamp',
        { action: 'record', permit_id: v.permit.id, version: v.permit.version, stamped_file_ids: ids },
        recordResultSchema,
      );
    },
    onSettled: (_r, _e, v) =>
      Promise.all([
        qc.invalidateQueries({ queryKey: qk.permits }),
        qc.invalidateQueries({ queryKey: qk.board(v.permit.project_id) }),
        qc.invalidateQueries({ queryKey: qk.board(null) }),
        qc.invalidateQueries({ queryKey: qk.calendar }),
        qc.invalidateQueries({ queryKey: qk.folders(v.permit.project_id) }),
        qc.invalidateQueries({ queryKey: ['files'] }),
      ]),
  });
}

/** The URL lives 10 minutes (the function's signedViewUrl); the cache hands it out for 8. */
const VIEW_FRESH_MS = 8 * 60_000;

/**
 * A stamped sheet for the file viewer: `(permitId, fileId)` resolves to a fresh signed URL from permit-stamp 'view'
 * (the permit's sets read as the caller, then the download gate), cached a little less than it lives so walking the set
 * with the arrows doesn't ask again.
 */
export function useApprovedViewUrl(): (permitId: string, fileId: string) => Promise<string> {
  const qc = useQueryClient();
  return useCallback(
    (permitId: string, fileId: string) =>
      qc.query({
        queryKey: qk.permitsPart('approved-view', fileId),
        queryFn: async (): Promise<string> => {
          if (isMock()) return await mockStamp.viewUrl(fileId);
          return (await callFunction('permit-stamp', { action: 'view', permit_id: permitId, file_id: fileId }, viewResultSchema)).url;
        },
        staleTime: VIEW_FRESH_MS,
        gcTime: VIEW_FRESH_MS,
      }),
    [qc],
  );
}

async function uploadsFolder(permitId: string): Promise<string> {
  if (isMock()) return mockStamp.uploadsFolder(permitId);
  const res = z.object({ uploads: z.string() }).parse(throwIfError(await supabase.rpc('permit_stamp_folders', { p_permit_id: permitId })));
  return res.uploads;
}

/**
 * The official's own PDFs into the job's "To stamp" folder, through the shared queue (progress, Stop, Remove). Each
 * one, once stored, refreshes the sources and is handed to `onStored` (picked at once). `items` are this permit's
 * upload lines; `folderId` is known after the first upload.
 */
export function useStampUploads(permit: PermitRef, onStored: (fileId: string) => void) {
  const qc = useQueryClient();
  const queue = useUploadQueue();
  const folderKey = qk.permitsPart('stamp-folder', permit.id);
  const folderId = qc.getQueryData<string>(folderKey);
  const add = useMutation({
    mutationFn: async (files: File[]): Promise<void> => {
      const folder = await qc.query({ queryKey: folderKey, queryFn: () => uploadsFolder(permit.id), staleTime: Infinity });
      queue.enqueue(files, permit.project_id, folder, async (fileId) => {
        await qc.invalidateQueries({ queryKey: qk.permitsPart('stamp-sources', permit.id) });
        onStored(fileId);
        return null;
      });
    },
  });
  const items = folderId === undefined ? [] : queue.items.filter((i) => i.folderId === folderId);
  return { add, items, busy: items.some((i) => i.status === 'queued' || i.status === 'uploading') };
}
