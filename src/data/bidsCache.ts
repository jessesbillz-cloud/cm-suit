// The bids cache in one place: every bid write refreshes the job's bid queries (one qk.bids prefix) and the bids
// pipeline across jobs (its counts move with packages, invites, bids and questions), and a just-made or just-saved row
// goes into its cached list at once so opening it never flashes "gone" before the refetch.
import { useQueryClient } from '@tanstack/react-query';
import { qk } from './keys';

export function useRefreshBids() {
  const qc = useQueryClient();
  return (projectId: string) =>
    Promise.all([qc.invalidateQueries({ queryKey: qk.bids(projectId) }), qc.invalidateQueries({ queryKey: qk.bidPipeline })]);
}

type ListPart = 'packages' | 'addenda';

/** Adds a new row to its cached list, or replaces the row with the same id (a save). */
export function usePutInList() {
  const qc = useQueryClient();
  return <T extends { id: string; project_id: string }>(part: ListPart, row: T) => {
    qc.setQueryData<T[]>(qk.bidsPart(row.project_id, part), (old) =>
      old ? (old.some((x) => x.id === row.id) ? old.map((x) => (x.id === row.id ? row : x)) : [...old, row]) : old,
    );
  };
}

/** Takes a removed row out of its cached list at once. */
export function useDropFromList() {
  const qc = useQueryClient();
  return (projectId: string, part: ListPart, id: string) => {
    qc.setQueryData<{ id: string }[]>(qk.bidsPart(projectId, part), (old) => old?.filter((x) => x.id !== id));
  };
}
