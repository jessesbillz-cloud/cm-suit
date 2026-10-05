// Delete in Files: the file goes at once (file_remove), the pane closes, and the toast offers Undo (file_restore) instead
// of asking "are you sure?" (CLAUDE.md rule 16). Signed records never get here (the database refuses them too).
import { messageOf } from '../../data/errors';
import { useRemoveFile, useRestoreFile } from '../../data/files';
import { useToast } from '../../ui/Toast';

interface Target {
  id: string;
  folder_id: string;
  project_id: string;
  original_name: string;
}

export function useDeleteFile(onDeleted: () => void) {
  const remove = useRemoveFile();
  const restore = useRestoreFile();
  const toast = useToast();

  function undo(file: Target) {
    restore.mutateAsync(file).catch((e: unknown) => {
      toast.show({ tone: 'error', message: `Not brought back: ${messageOf(e)}` });
    });
  }

  function run(file: Target, version: number) {
    remove.mutateAsync({ file, version }).then(
      () => {
        onDeleted();
        toast.show({
          message: `${file.original_name} deleted.`,
          action: {
            label: 'Undo',
            onClick: () => {
              undo(file);
            },
          },
        });
      },
      (e: unknown) => {
        toast.show({ tone: 'error', message: `Not deleted: ${messageOf(e)}` });
      },
    );
  }

  return { run, pending: remove.isPending };
}
