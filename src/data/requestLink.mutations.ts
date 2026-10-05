// Making, replacing and undoing the request link (members.manage), and my hub link (0046). Each answers the raw
// token once with the moment it was made; the old link stops working at once.
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from './client';
import { DataError, throwIfError, throwIfErrorMaybe } from './errors';
import { qk } from './keys';
import { isMock } from './mock';
import * as mock from './mock/requestLink';
import type { MadeHub, MadeLink } from './requestLink.types';

function first<T>(rows: T[], what: string): T {
  const row = rows[0];
  if (row === undefined) throw new DataError(`No ${what} came back.`, null, null);
  return row;
}

export function useRotateRequestLink(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<MadeLink> =>
      isMock()
        ? mock.rotate(projectId)
        : first(throwIfError(await supabase.rpc('rotate_request_link', { p_project_id: projectId })), 'link'),
    onSettled: () => qc.invalidateQueries({ queryKey: qk.requestLink(projectId) }),
  });
}

/** Puts the previous link back (15 minutes, the person who made the new one). */
export function useUndoRequestLink(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<void> => {
      if (isMock()) return mock.undoRotate(projectId);
      throwIfErrorMaybe(await supabase.rpc('undo_request_link_rotation', { p_project_id: projectId }));
    },
    onSettled: () => qc.invalidateQueries({ queryKey: qk.requestLink(projectId) }),
  });
}

/** Puts my previous hub link back (15 minutes, 0075). */
export function useUndoRequestHub() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<void> => {
      if (isMock()) return mock.undoRotateHub();
      throwIfErrorMaybe(await supabase.rpc('undo_request_hub_rotation'));
    },
    onSettled: () => qc.invalidateQueries({ queryKey: qk.requestHub }),
  });
}

export function useRotateRequestHub() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<MadeHub> =>
      isMock() ? mock.rotateHub() : first(throwIfError(await supabase.rpc('rotate_request_hub')), 'hub link'),
    onSettled: () => qc.invalidateQueries({ queryKey: qk.requestHub }),
  });
}
