// Folder tree order (migration 0027): each folder followed by its children, siblings by sort then name, so a job
// opens with what its kind of user uses most. "Emailed in" (kind inbound) shows only while something is in it.
import type { FolderRow } from '../../data/types';

type TreeFolder = Pick<FolderRow, 'id' | 'parent_id' | 'name' | 'kind' | 'sort' | 'file_count'>;

interface TreeNode<F extends TreeFolder> {
  folder: F;
  depth: number;
}

/** The folders the tree lists: an empty "Emailed in" with no subfolders is hidden. */
export function visibleFolders<F extends TreeFolder>(folders: readonly F[]): F[] {
  const parents = new Set(folders.map((f) => f.parent_id));
  return folders.filter((f) => f.kind !== 'inbound' || f.file_count !== 0 || parents.has(f.id));
}

function bySortThenName(a: TreeFolder, b: TreeFolder): number {
  return a.sort - b.sort || a.name.localeCompare(b.name);
}

/** Depth-first: each folder followed by its children. A folder whose parent I can't see shows at the top level. */
export function treeOrder<F extends TreeFolder>(folders: readonly F[]): TreeNode<F>[] {
  const byParent = new Map<string | null, F[]>();
  for (const f of folders) {
    const list = byParent.get(f.parent_id) ?? [];
    list.push(f);
    byParent.set(f.parent_id, list);
  }
  const ids = new Set(folders.map((f) => f.id));
  const roots = folders.filter((f) => f.parent_id === null || !ids.has(f.parent_id));
  const out: TreeNode<F>[] = [];
  const walk = (list: readonly F[], depth: number) => {
    for (const f of [...list].sort(bySortThenName)) {
      out.push({ folder: f, depth });
      walk(byParent.get(f.id) ?? [], depth + 1);
    }
  };
  walk(roots, 0);
  return out;
}

/** "Plans / Architectural": the folder's path down from the top of the tree I can see (the page header's line). */
export function folderPath(folders: readonly Pick<FolderRow, 'id' | 'parent_id' | 'name'>[], id: string): string {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const names: string[] = [];
  const seen = new Set<string>();
  let at = byId.get(id);
  while (at && !seen.has(at.id)) {
    seen.add(at.id);
    names.unshift(at.name);
    at = at.parent_id === null ? undefined : byId.get(at.parent_id);
  }
  return names.join(' / ');
}

/** The folder Files opens on: the first one in the tree. */
export function defaultFolderId(folders: readonly TreeFolder[]): string | null {
  return treeOrder(visibleFolders(folders))[0]?.folder.id ?? null;
}
