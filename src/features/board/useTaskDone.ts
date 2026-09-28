// A task handled in place (SPEC §5.5): Done is one tap, with Undo in the toast (no "are you sure?"). "Needs you" and an
// opened board item use this one hook.
import { useCompleteTask, useUndoTask } from '../../data/mutations';
import { messageOf } from '../../data/errors';
import type { TaskRow } from '../../data/types';
import { useToast } from '../../ui/Toast';

export function useTaskDone(): { done: (task: TaskRow) => void; busyId: string | null } {
  const complete = useCompleteTask();
  const undo = useUndoTask();
  const toast = useToast();

  function done(task: TaskRow) {
    complete.mutate(task, {
      onSuccess: (version) => {
        toast.show({
          message: `Done: ${task.title}`,
          action: {
            label: 'Undo',
            onClick: () => {
              undo.mutate(
                { id: task.id, version },
                {
                  onError: (e) => {
                    toast.show({ tone: 'error', message: `Could not undo: ${messageOf(e)}` });
                  },
                },
              );
            },
          },
        });
      },
      onError: (e) => {
        toast.show({ tone: 'error', message: `Not marked done: ${messageOf(e)}` });
      },
    });
  }

  return { done, busyId: complete.isPending ? complete.variables.id : null };
}
