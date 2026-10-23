// What "Needs you" holds for a board (null = all my jobs): RFIs someone else is sitting on, the batches of OFS requests
// waiting on me (0114), then my tasks. The card and the board's header count read the same lists.
import { useMemo } from 'react';
import { useIrBatchesWaiting } from '../../data/inspections.batch';
import { useTasks } from '../../data/queries';
import { useRfiWaiting } from '../../data/rfis.queries';

export function useNeedsYou(projectId: string | null) {
  const tasks = useTasks(projectId);
  const waiting = useRfiWaiting();
  const batches = useIrBatchesWaiting(projectId);
  const rfis = useMemo(
    () => (waiting.data ?? []).filter((w) => projectId === null || w.project_id === projectId),
    [waiting.data, projectId],
  );
  return {
    tasks,
    waiting,
    rfis,
    batches,
    count: rfis.length + (batches.data?.length ?? 0) + (tasks.data?.length ?? 0),
    ready: tasks.isSuccess && waiting.isSuccess && batches.isSuccess,
  };
}
