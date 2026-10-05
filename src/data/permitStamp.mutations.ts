// Permit stamp writes (migration 0053, edge function permit-stamp). The server stamps one PDF per call ('stamp'), then
// records the set once ('record': the permit is issued, or the set revised); both need a fresh sign-in (SignButton
// handles 403 reauth_required). Opening a stamped sheet asks the same function for a viewer URL. The official's own
// PDFs upload into the job's "To stamp" folder through the shared upload queue (progress, Stop, Remove).
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

/**
 * A stamped sheet in the browser's own viewer. The tab is opened by the tap itself (so no pop-up blocker stops it) and
 * sent to a fresh signed URL when the server answers; on a failure it closes again.
 */
export function useApprovedView() {
  return useMutation({
    mutationFn: async (v: { permitId: string; fileId: string; tab: Window }): Promise<void> => {
      try {
        const url = isMock()
          ? URL.createObjectURL(await mockStamp.viewBlob(v.fileId))
          : (await callFunction('permit-stamp', { action: 'view', permit_id: v.permitId, file_id: v.fileId }, viewResultSchema)).url;
        v.tab.location.replace(url);
      } catch (e) {
        v.tab.close();
        throw e;
      }
    },
  });
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
