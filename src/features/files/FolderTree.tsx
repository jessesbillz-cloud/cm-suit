// Folder tree in the main area. Flat data from the database, nested here by parent_id.
import { Folder, FolderOpen } from 'lucide-react';
import type { FolderRow } from '../../data/types';
import { Icon } from '../../ui/Icon';

interface FolderTreeProps {
  folders: readonly FolderRow[];
  selectedId: string | null;
  onSelect: (folderId: string) => void;
}

interface Node {
  folder: FolderRow;
  depth: number;
}

/** Depth-first order: each folder followed by its children, siblings by name. */
function flatten(folders: readonly FolderRow[]): Node[] {
  const byParent = new Map<string | null, FolderRow[]>();
  for (const f of folders) {
    const list = byParent.get(f.parent_id) ?? [];
    list.push(f);
    byParent.set(f.parent_id, list);
  }
  const ids = new Set(folders.map((f) => f.id));
  // A folder whose parent I can't see shows at the top level rather than disappearing.
  const roots = folders.filter((f) => f.parent_id === null || !ids.has(f.parent_id));
  const out: Node[] = [];
  const walk = (list: readonly FolderRow[], depth: number) => {
    for (const f of [...list].sort((a, b) => a.name.localeCompare(b.name))) {
      out.push({ folder: f, depth });
      walk(byParent.get(f.id) ?? [], depth + 1);
    }
  };
  walk(roots, 0);
  return out;
}

export function FolderTree({ folders, selectedId, onSelect }: FolderTreeProps) {
  return (
    <ul aria-label="Folders" className="flex flex-col py-1">
      {flatten(folders).map(({ folder, depth }) => {
        const active = folder.id === selectedId;
        return (
          <li key={folder.id}>
            <button
              type="button"
              aria-current={active ? 'true' : undefined}
              data-testid="folder"
              className={`flex w-full items-center gap-2 rounded-md py-1.5 pr-2 text-left text-sm ${
                active ? 'bg-accent-soft text-accent' : 'text-ink hover:bg-page'
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

/** The folder Files opens on: Plans when there is one, else the first folder. */
export function defaultFolderId(folders: readonly FolderRow[]): string | null {
  const plans = folders.find((f) => f.kind === 'plans');
  const first = flatten(folders)[0];
  return plans?.id ?? first?.folder.id ?? null;
}
