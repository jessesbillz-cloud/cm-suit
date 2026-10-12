// Folder names in Files: an author's folder shows the person's name today, not the handle it was made with; a folder's
// path from the top ("Submittals / 092000 - Framing - Sample Co", the page header's line); the folders inside one.
import type { FolderRow } from '../../data/types';

/** What Files calls a folder: the person for an author's folder, else its name. */
export function folderLabel(f: Pick<FolderRow, 'name' | 'person'>): string {
  return f.person ?? f.name;
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

/** The folders inside this one, at any depth (where a dropped folder tree's uploads are going). */
export function folderDescendants(folders: readonly Pick<FolderRow, 'id' | 'parent_id'>[], id: string): Set<string> {
  const out = new Set<string>();
  let frontier = [id];
  while (frontier.length > 0) {
    const next = folders.filter((f) => f.parent_id !== null && frontier.includes(f.parent_id) && !out.has(f.id)).map((f) => f.id);
    for (const n of next) out.add(n);
    frontier = next;
  }
  return out;
}
