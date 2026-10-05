// One tap sets a requirement's status (the list shows it at once); the toast offers Undo, which sets the old status
// back with the version the server answered. A refusal (someone changed it first) says so in the toast.
import { useSetRequirementStatus } from '../../data/requirements.mutations';
import type { Requirement } from '../../data/requirements.types';
import { messageOf } from '../../data/errors';
import { statusOf, type RequirementStatus } from '../../lib/requirements';
import { useToast } from '../../ui/Toast';

export function useStatusTap(projectId: string) {
  const set = useSetRequirementStatus(projectId);
  const toast = useToast();
  return {
    pending: set.isPending,
    tap: (row: Pick<Requirement, 'id' | 'version' | 'title' | 'status'>, status: RequirementStatus) => {
      if (status === row.status) return;
      const before = row.status;
      set.mutate(
        { row, status },
        {
          onSuccess: (saved) => {
            toast.show({
              message: `${statusOf(status).label}: ${row.title}`,
              action: {
                label: 'Undo',
                onClick: () => {
                  set.mutate(
                    { row: { id: saved.id, version: saved.version }, status: before },
                    { onError: (e) => { toast.show({ message: messageOf(e), tone: 'error' }); } },
                  );
                },
              },
            });
          },
          onError: (e) => {
            toast.show({ message: messageOf(e), tone: 'error' });
          },
        },
      );
    },
  };
}
