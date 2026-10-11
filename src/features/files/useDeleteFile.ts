// Delete in Files, from a file's pane, its row, or the checked rows: the files go at once (file_remove) and one toast
// offers Undo for all of them (file_restore) instead of asking "are you sure?" (CLAUDE.md rule 16). A file the database
// keeps (a signed record) stays, and a toast says why in the database's words.
import { refusalOf } from '../../data/errors';
import { useRemoveFiles, useRestoreFiles } from '../../data/files';
import { useToast } from '../../ui/Toast';
import { done, howMany, refusedLine } from './outcomes';

interface Target {
  id: string;
  folder_id: string;
  project_id: string;
  original_name: string;
}

export interface PickedFile {
  file: Target;
  version: number;
}

export function useDeleteFile(onDeleted: (ids: string[]) => void) {
  const remove = useRemoveFiles();
  const restore = useRestoreFiles();
  const toast = useToast();
  const showError = (message: string | null) => {
    if (message !== null) toast.show({ tone: 'error', message });
  };

  function undo(files: Target[]) {
    restore.mutateAsync(files).then(
      (results) => {
        showError(refusedLine(results, (f) => files.find((x) => x.id === f.id)?.original_name ?? 'A file', 'brought back'));
      },
      (e: unknown) => {
        showError(`Not brought back: ${refusalOf(e)}`);
      },
    );
  }

  function runMany(picked: readonly PickedFile[]) {
    if (picked.length === 0) return;
    const nameOf = (v: { file: { id: string } }) => picked.find((p) => p.file.id === v.file.id)?.file.original_name ?? 'A file';
    remove.mutateAsync(picked).then(
      (results) => {
        showError(refusedLine(results, nameOf, 'deleted'));
        const gone = done(results).flatMap(({ item }) => picked.filter((p) => p.file.id === item.file.id).map((p) => p.file));
        if (gone.length === 0) return;
        onDeleted(gone.map((f) => f.id));
        toast.show({
          message: `${howMany(gone.map((f) => f.original_name))} deleted.`,
          action: {
            label: 'Undo',
            onClick: () => {
              undo(gone);
            },
          },
        });
      },
      (e: unknown) => {
        showError(`Not deleted: ${refusalOf(e)}`);
      },
    );
  }

  function run(file: Target, version: number) {
    runMany([{ file, version }]);
  }

  return { run, runMany, pending: remove.isPending };
}
