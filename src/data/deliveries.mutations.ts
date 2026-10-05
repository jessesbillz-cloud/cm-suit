// Deliveries writes (SPEC §13.3). Every write is an RPC: the database owns the receipt number, Standby, the audit
// trail and the version check. Each one refreshes the job's deliveries (the one qk.deliveries prefix) and what the
// database mirrors from them: the calendar line (also the board's Today panel) and the board line.
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from './client';
import { throwIfError, throwIfErrorMaybe } from './errors';
import { qk } from './keys';
import { isMock } from './mock';
import * as mock from './mock/deliveries';
import { useUploadQueue } from './UploadQueue';
import type { DeliveryInput, DeliveryRow } from './deliveries.types';

function useRefresh(projectId: string) {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: qk.deliveries(projectId) }),
      qc.invalidateQueries({ queryKey: qk.calendar }),
      qc.invalidateQueries({ queryKey: qk.board(projectId) }),
      qc.invalidateQueries({ queryKey: qk.board(null) }),
    ]);
}

/** After a photo or ticket comes off (or goes back): the delivery, and the file wherever it shows (its folder in Files). */
function useFileRefresh(projectId: string) {
  const qc = useQueryClient();
  const refresh = useRefresh(projectId);
  return (fileId: string) =>
    Promise.all([refresh(), qc.invalidateQueries({ queryKey: qk.file(fileId) }), qc.invalidateQueries({ queryKey: qk.filesAll })]);
}

/** Leaving p_time out means "time TBD". */
function args(input: DeliveryInput) {
  return {
    p_company: input.company,
    p_date: input.date,
    p_duration: input.duration_min,
    p_description: input.description,
    ...(input.time === null ? {} : { p_time: input.time }),
  };
}

/** Posts a delivery; answers its id (the receipt opens from it). A repeat of the same post returns the same id. */
export function usePostDelivery(projectId: string) {
  const refresh = useRefresh(projectId);
  return useMutation({
    mutationFn: async (input: DeliveryInput): Promise<string> =>
      isMock() ? mock.post(projectId, input) : throwIfError(await supabase.rpc('post_delivery', { p_project_id: projectId, ...args(input) })),
    onSuccess: refresh,
  });
}

export function useUpdateDelivery(projectId: string) {
  const refresh = useRefresh(projectId);
  return useMutation({
    mutationFn: async (v: { row: DeliveryRow; input: DeliveryInput }): Promise<number> =>
      isMock()
        ? mock.update(v.row, v.input)
        : throwIfError(await supabase.rpc('update_delivery', { p_id: v.row.id, p_version: v.row.version, ...args(v.input) })),
    onSettled: refresh,
  });
}

/** Delete needs the typed name of who is deleting (logged). Undo is useRestoreDelivery. */
export function useDeleteDelivery(projectId: string) {
  const refresh = useRefresh(projectId);
  return useMutation({
    mutationFn: async (v: { row: DeliveryRow; name: string }): Promise<void> => {
      if (isMock()) return mock.setDeleted(v.row.id, v.name);
      throwIfErrorMaybe(await supabase.rpc('delete_delivery', { p_id: v.row.id, p_version: v.row.version, p_name: v.name }));
    },
    onSettled: refresh,
  });
}

export function useRestoreDelivery(projectId: string) {
  const refresh = useRefresh(projectId);
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      if (isMock()) return mock.setDeleted(id, null);
      throwIfErrorMaybe(await supabase.rpc('restore_delivery', { p_id: id }));
    },
    onSettled: refresh,
  });
}

/** Photos or tickets onto a delivery: the one uploader (resumable, queued), then attached by the database. */
export function useAttachDeliveryFiles(projectId: string) {
  const queue = useUploadQueue();
  const refresh = useRefresh(projectId);
  return useMutation({
    mutationFn: async (v: { deliveryId: string; files: File[] }): Promise<void> => {
      const folderId = isMock()
        ? await mock.folder(projectId)
        : throwIfError(await supabase.rpc('delivery_folder', { p_project_id: projectId }));
      queue.enqueue(v.files, projectId, folderId, async (fileId) => {
        if (isMock()) await mock.attach(v.deliveryId, fileId);
        else throwIfErrorMaybe(await supabase.rpc('attach_delivery_file', { p_delivery_id: v.deliveryId, p_file_id: fileId }));
        await refresh();
        return null;
      });
    },
  });
}

/**
 * Takes a photo or ticket off a delivery (its poster or deliveries.manage). The file leaves the Delivery tickets folder
 * too; useRestoreDeliveryFile is the Undo. Safe to repeat.
 */
export function useRemoveDeliveryFile(projectId: string) {
  const refresh = useFileRefresh(projectId);
  return useMutation({
    mutationFn: async (v: { deliveryId: string; fileId: string }): Promise<void> => {
      if (isMock()) return mock.removeFile(v.deliveryId, v.fileId);
      throwIfErrorMaybe(await supabase.rpc('remove_delivery_file', { p_delivery_id: v.deliveryId, p_file_id: v.fileId }));
    },
    onSettled: (_r, _e, v) => refresh(v.fileId),
  });
}

export function useRestoreDeliveryFile(projectId: string) {
  const refresh = useFileRefresh(projectId);
  return useMutation({
    mutationFn: async (v: { deliveryId: string; fileId: string }): Promise<void> => {
      if (isMock()) return mock.restoreFile(v.deliveryId, v.fileId);
      throwIfErrorMaybe(await supabase.rpc('restore_delivery_file', { p_delivery_id: v.deliveryId, p_file_id: v.fileId }));
    },
    onSettled: (_r, _e, v) => refresh(v.fileId),
  });
}

/** Makes a new delivery link and answers the raw token, shown once. The old link stops working at once. */
export function useRotateDeliveryLink(projectId: string) {
  const refresh = useRefresh(projectId);
  return useMutation({
    mutationFn: async (): Promise<string> =>
      isMock() ? mock.rotate() : throwIfError(await supabase.rpc('rotate_delivery_link', { p_project_id: projectId })),
    onSettled: refresh,
  });
}

/** Puts the previous link back (15 minutes, the person who made the new one). */
export function useUndoDeliveryLink(projectId: string) {
  const refresh = useRefresh(projectId);
  return useMutation({
    mutationFn: async (): Promise<void> => {
      if (isMock()) return mock.undoRotate();
      throwIfErrorMaybe(await supabase.rpc('undo_delivery_link_rotation', { p_project_id: projectId }));
    },
    onSettled: refresh,
  });
}

/** "I reviewed this month": name and company as typed, time from the server. Safe to repeat. */
export function useReviewMonth(projectId: string) {
  const refresh = useRefresh(projectId);
  return useMutation({
    mutationFn: async (v: { month: string; name: string; company: string }): Promise<void> => {
      if (isMock()) return mock.review(projectId, v.month, v.name, v.company);
      throwIfErrorMaybe(
        await supabase.rpc('review_delivery_month', { p_project_id: projectId, p_month: v.month, p_name: v.name, p_company: v.company }),
      );
    },
    onSettled: refresh,
  });
}
