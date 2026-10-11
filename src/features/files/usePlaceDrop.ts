// A drop on a folder: loose files go into it; dropped folders become folders under it (found or made, same names) and
// each file goes into its own. Never a flat dump of a folder tree. Making folders takes files.manage.
import { useEnsureFolders } from '../../data/folders.mutations';
import { messageOf } from '../../data/errors';
import { useUploadQueue } from '../../data/UploadQueue';
import type { FolderRow } from '../../data/types';
import { useToast } from '../../ui/Toast';
import type { DroppedFile } from './collectDrop';
import { dirKey, planDrop } from './dropPlan';

export function usePlaceDrop(projectId: string, folder: FolderRow, manager: boolean): (dropped: DroppedFile[]) => void {
  const queue = useUploadQueue();
  const ensure = useEnsureFolders();
  const toast = useToast();

  return (dropped) => {
    if (dropped.length === 0) return;
    const { dirs, groups } = planDrop(dropped);
    if (dirs.length === 0) {
      queue.enqueue(dropped.map((d) => d.file), projectId, folder.id);
      return;
    }
    if (!manager) {
      toast.show({ tone: 'error', message: 'Only a files manager can add folders. Drop the files instead.' });
      return;
    }
    ensure.mutate(
      { projectId, parentId: folder.id, aiReads: folder.ai_reads, dirs },
      {
        onSuccess: (ids) => {
          for (const g of groups) {
            const target = ids.get(dirKey(g.dir));
            if (target === undefined) toast.show({ tone: 'error', message: `Not uploaded: no folder for ${dirKey(g.dir)}.` });
            else queue.enqueue(g.files, projectId, target);
          }
        },
        onError: (e) => {
          toast.show({ tone: 'error', message: `Folders not added: ${messageOf(e)}` });
        },
      },
    );
  };
}
