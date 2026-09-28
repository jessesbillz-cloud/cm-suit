// What this person may do in the corrections log, asked of the database (has_capability), never from role names.
import { useCapability } from '../../data/queries';
import type { Caps } from './model';

export function useCorrectionCaps(projectId: string) {
  const view = useCapability(projectId, 'corrections.view');
  const create = useCapability(projectId, 'corrections.create');
  const markReady = useCapability(projectId, 'corrections.mark_ready');
  const close = useCapability(projectId, 'corrections.close');
  const all = [view, create, markReady, close];
  const failed = all.find((q) => q.isError);

  const caps: Caps | null =
    view.data !== undefined && create.data !== undefined && markReady.data !== undefined && close.data !== undefined
      ? { view: view.data, create: create.data, markReady: markReady.data, close: close.data }
      : null;

  return {
    caps,
    error: failed?.error ?? null,
    retry: () => {
      for (const q of all) void q.refetch();
    },
  };
}
