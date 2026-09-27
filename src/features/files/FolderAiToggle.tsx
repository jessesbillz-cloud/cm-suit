// "Search and AI read this" on the open folder. People with files.manage change it (version-checked); others see it.
import { messageOf } from '../../data/errors';
import { useSetFolderAiReads } from '../../data/folders.mutations';
import type { FolderRow } from '../../data/types';
import { CheckField } from '../../ui/Fields';
import { useToast } from '../../ui/Toast';

interface FolderAiToggleProps {
  folder: FolderRow;
  canManage: boolean;
}

export function FolderAiToggle({ folder, canManage }: FolderAiToggleProps) {
  const save = useSetFolderAiReads();
  const toast = useToast();
  const checked = save.isPending ? save.variables.aiReads : folder.ai_reads;
  return (
    <CheckField
      label="Search and AI read this"
      checked={checked}
      disabled={!canManage || save.isPending}
      testId="folder-ai-reads"
      onChange={(aiReads) => {
        save.mutate(
          { folder, aiReads },
          {
            onError: (e) => {
              toast.show({ tone: 'error', message: `Not saved: ${messageOf(e)}` });
            },
          },
        );
      }}
    />
  );
}
