// Folder tree in the main area. Flat data from the database, nested and ordered by folderOrder. Names wrap, never cut.
// A folder only the app fills carries a small lock.
import { Folder, FolderOpen, Lock } from 'lucide-react';
import type { FolderRow } from '../../data/types';
import { Icon } from '../../ui/Icon';
import { folderLabel, treeOrder } from './folderOrder';

interface FolderTreeProps {
  /** The folders to list (visibleFolders already applied). */
  folders: readonly FolderRow[];
  selectedId: string | null;
  onSelect: (folderId: string) => void;
}

export function FolderTree({ folders, selectedId, onSelect }: FolderTreeProps) {
  return (
    <ul aria-label="Folders" className="flex flex-col gap-0.5 py-1">
      {treeOrder(folders).map(({ folder, depth }) => {
        const active = folder.id === selectedId;
        return (
          <li key={folder.id}>
            <button
              type="button"
              aria-current={active ? 'true' : undefined}
              data-testid="folder"
              className={`flex min-h-10 w-full items-center gap-2.5 rounded-lg py-2 pr-2 text-left text-sm transition-colors ${
                active ? 'bg-accent-soft font-medium text-accent' : 'text-ink hover:bg-page'
              }`}
              style={{ paddingLeft: `${String(10 + depth * 16)}px` }}
              onClick={() => {
                onSelect(folder.id);
              }}
            >
              <Icon icon={active ? FolderOpen : Folder} size={17} className={`shrink-0 ${active ? 'text-accent' : 'text-ink-3'}`} />
              <span className="min-w-0 flex-1 wrap-anywhere">{folderLabel(folder)}</span>
              {folder.app_only ? (
                <span data-testid="folder-lock" className="shrink-0 text-ink-3">
                  <Icon icon={Lock} size={13} label="Filled by the app" />
                </span>
              ) : null}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
