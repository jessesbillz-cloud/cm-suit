// Folder tree in the main area. Flat data from the database, nested and ordered by folderOrder.
import { Folder, FolderOpen } from 'lucide-react';
import type { FolderRow } from '../../data/types';
import { Icon } from '../../ui/Icon';
import { treeOrder } from './folderOrder';

interface FolderTreeProps {
  /** The folders to list (visibleFolders already applied). */
  folders: readonly FolderRow[];
  selectedId: string | null;
  onSelect: (folderId: string) => void;
}

export function FolderTree({ folders, selectedId, onSelect }: FolderTreeProps) {
  return (
    <ul aria-label="Folders" className="flex flex-col py-1">
      {treeOrder(folders).map(({ folder, depth }) => {
        const active = folder.id === selectedId;
        return (
          <li key={folder.id}>
            <button
              type="button"
              aria-current={active ? 'true' : undefined}
              data-testid="folder"
              className={`flex w-full items-center gap-2 rounded-md py-1.5 pr-2 text-left text-sm ${
                active ? 'bg-accent-soft font-medium text-accent' : 'text-ink hover:bg-page'
              }`}
              style={{ paddingLeft: `${String(8 + depth * 16)}px` }}
              onClick={() => {
                onSelect(folder.id);
              }}
            >
              <Icon icon={active ? FolderOpen : Folder} size={16} className={active ? 'text-accent' : 'text-ink-3'} />
              <span className="min-w-0 flex-1 break-words">{folder.name}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
