// Folder tree order (migration 0027): each folder followed by its children, siblings by sort then name, so a job
// opens with what its kind of user uses most. The folders only the app fills (0092: Reports, Emailed in, RFIs, each
// author's folder ...) and Testing & inspections show only while something is in them (file_count, null = always).
// An author's folder shows the person's name today, not the handle it was made with.
import type { FolderRow } from '../../data/types';

type TreeFolder = Pick<FolderRow, 'id' | 'parent_id' | 'name' | 'kind' | 'sort' | 'file_count' | 'person'>;

/** What the tree and the header call a folder: the person for an author's folder, else its name. */
export function folderLabel(f: Pick<FolderRow, 'name' | 'person'>): string {
  return f.person ?? f.name;
}

interface TreeNode<F extends TreeFolder> {
  folder: F;
  depth: number;
}

/** The folders the tree lists: one that hides while empty shows once it, or a folder shown inside it, has something. */
export function visibleFolders<F extends TreeFolder>(folders: readonly F[]): F[] {
  const children = new Map<string, F[]>();
  for (const f of folders) {
    if (f.parent_id === null) continue;
    const list = children.get(f.parent_id) ?? [];
    list.push(f);
    children.set(f.parent_id, list);
  }
  const shown = new Map<string, boolean>();
  const isShown = (f: F, depth: number): boolean => {
    const known = shown.get(f.id);
    if (known !== undefined) return known;
    const kids = depth > 32 ? [] : (children.get(f.id) ?? []);
    // Every child is checked (no early stop), so each one's answer is known.
    const kidShown = kids.map((k) => isShown(k, depth + 1)).some(Boolean);
    const yes = f.file_count !== 0 || kidShown;
    shown.set(f.id, yes);
    return yes;
  };
  return folders.filter((f) => isShown(f, 0));
}

function bySortThenName(a: TreeFolder, b: TreeFolder): number {
  return a.sort - b.sort || folderLabel(a).localeCompare(folderLabel(b));
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
export function folderPath(folders: readonly Pick<FolderRow, 'id' | 'parent_id' | 'name' | 'person'>[], id: string): string {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const names: string[] = [];
  const seen = new Set<string>();
  let at = byId.get(id);
  while (at && !seen.has(at.id)) {
    seen.add(at.id);
    names.unshift(folderLabel(at));
    at = at.parent_id === null ? undefined : byId.get(at.parent_id);
  }
  return names.join(' / ');
}

/** The folder Files opens on: the first one in the tree. */
export function defaultFolderId(folders: readonly TreeFolder[]): string | null {
  return treeOrder(visibleFolders(folders))[0]?.folder.id ?? null;
}
