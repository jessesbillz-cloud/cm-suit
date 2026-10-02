// Permit stamp writes (migration 0053, edge function permit-stamp). The server stamps one PDF per call ('stamp'), then
// records the set once ('record': the permit is issued, or the set revised); both need a fresh sign-in (SignButton
// handles 403 reauth_required). Opening a stamped sheet asks the same function for a viewer URL. The official's own
// PDFs upload into the job's "To stamp" folder through data/upload.
import { useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { useUser } from './auth';
import { supabase } from './client';
import { throwIfError } from './errors';
import { callFunction } from './functions';
import { qk } from './keys';
import { isMock } from './mock';
import * as mockStamp from './mock/permitStamp';
import type { PermitRef } from './permits.types';
import { recordResultSchema, stampedFileSchema, viewResultSchema, type RecordResult, type StampedFile } from './permitStamp.types';
import { uploadFile } from './upload';

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
      const items = v.stamped.map((s) => ({ source_file_id: s.source_file_id, stamped_file_id: s.stamped_file_id, stamped_at: s.stamped_at }));
      if (isMock()) return mockStamp.record(v.permit, items);
      return callFunction('permit-stamp', { action: 'record', permit_id: v.permit.id, version: v.permit.version, items }, recordResultSchema);
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

/** Uploads one of the official's own PDFs into the job's "To stamp" folder; resolves to its file id. */
export function useStampUpload() {
  const user = useUser();
  const qc = useQueryClient();
  const userId = user.id;
  return useCallback(
    async (permit: PermitRef, file: File, signal: AbortSignal): Promise<string> => {
      const folderId = await qc.query({
        queryKey: qk.permitsPart('stamp-folder', permit.id),
        queryFn: () => uploadsFolder(permit.id),
        staleTime: Infinity,
      });
      const { fileId } = await uploadFile({ file, projectId: permit.project_id, folderId, userId, signal, onProgress: () => undefined });
      await qc.invalidateQueries({ queryKey: qk.permitsPart('stamp-sources', permit.id) });
      return fileId;
    },
    [qc, userId],
  );
}
