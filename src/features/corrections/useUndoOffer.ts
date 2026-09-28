// Undo instead of "are you sure?" (CLAUDE.md rule 16): after a create or a step, the toast offers Undo, which asks
// the database to revert my own latest step. Undoing a create goes back to the log.
import { useUndoCorrection } from '../../data/corrections.mutations';
import type { CorrectionRow } from '../../data/corrections.types';
import { messageOf } from '../../data/errors';
import { useToast } from '../../ui/Toast';
import { useCorrectionsNav } from './useCorrectionsNav';

export function useUndoOffer(projectId: string, itemId: string | null) {
  const undo = useUndoCorrection();
  const toast = useToast();
  const nav = useCorrectionsNav(projectId, itemId);

  return (row: CorrectionRow, message: string) => {
    toast.show({
      message,
      action: {
        label: 'Undo',
        onClick: () => {
          // mutateAsync settles even if this screen has closed meanwhile.
          void undo.mutateAsync(row).then(
            ({ removed }) => {
              if (removed) nav.close();
            },
            (e: unknown) => {
              toast.show({ tone: 'error', message: `Could not undo: ${messageOf(e)}` });
            },
          );
        },
      },
    });
  };
}
