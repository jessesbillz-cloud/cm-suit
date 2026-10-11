// Move to, on the checked rows: the files go to the folder picked (file_move) and one toast offers Undo, which moves each
// one back to the folder it came from. A file the database keeps where it is stays, and a toast says why.
import { refusalOf } from '../../data/errors';
import { useMoveFiles } from '../../data/files';
import { useToast } from '../../ui/Toast';
import { done, howMany, refusedLine } from './outcomes';
import type { PickedFile } from './useDeleteFile';

/** A folder Move to offers: its id and its path ("Plans / Architectural"). */
export interface MoveTarget {
  id: string;
  label: string;
}

export function useMoveRows(onMoved: () => void) {
  const move = useMoveFiles();
  const toast = useToast();
  const showError = (message: string | null) => {
    if (message !== null) toast.show({ tone: 'error', message });
  };

  function run(picked: readonly PickedFile[], to: MoveTarget) {
    const there = picked.filter((p) => p.file.folder_id !== to.id);
    if (there.length === 0) return;
    const nameOf = (id: string) => there.find((p) => p.file.id === id)?.file.original_name ?? 'A file';
    move.mutateAsync(there.map((p) => ({ file: p.file, version: p.version, folderId: to.id }))).then(
      (results) => {
        showError(refusedLine(results, (m) => nameOf(m.file.id), 'moved'));
        const moved = done(results);
        if (moved.length === 0) return;
        onMoved();
        // Undo: each file, at its new version, back where it was.
        const back = moved.map(({ item, value }) => ({
          file: { ...item.file, folder_id: to.id },
          version: value,
          folderId: item.file.folder_id,
        }));
        toast.show({
          message: `${howMany(moved.map(({ item }) => nameOf(item.file.id)))} moved to ${to.label}.`,
          action: {
            label: 'Undo',
            onClick: () => {
              move.mutateAsync(back).then(
                (again) => {
                  showError(refusedLine(again, (m) => nameOf(m.file.id), 'moved back'));
                },
                (e: unknown) => {
                  showError(`Not moved back: ${refusalOf(e)}`);
                },
              );
            },
          },
        });
      },
      (e: unknown) => {
        showError(`Not moved: ${refusalOf(e)}`);
      },
    );
  }

  return { run, pending: move.isPending };
}
