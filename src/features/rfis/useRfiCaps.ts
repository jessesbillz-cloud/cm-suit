// What this person may start in the RFI tool, asked of the database (has_capability), never from role names. What
// they may do to one RFI comes with it (rfi_detail.can).
import { useCapability } from '../../data/queries';

export function useRfiCaps(projectId: string) {
  const create = useCapability(projectId, 'rfi.create_draft');
  const issue = useCapability(projectId, 'rfi.sign_issue');
  const failed = [create, issue].find((q) => q.isError);
  return {
    caps: create.data !== undefined && issue.data !== undefined ? { create: create.data, issue: issue.data } : null,
    error: failed?.error ?? null,
    retry: () => {
      void create.refetch();
      void issue.refetch();
    },
  };
}
