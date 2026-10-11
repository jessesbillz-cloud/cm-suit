// What a drop needs: the folders to find or make (parents before children) and the files for each folder.
import type { DroppedFile } from './collectDrop';

interface DropGroup {
  /** The folders under the one being viewed, from the dropped folder down; empty for loose files. */
  dir: string[];
  files: File[];
}

export const dirKey = (dir: readonly string[]) => dir.join('/');

/** Groups the dropped files by folder; every folder on the way down is listed, parents first. */
export function planDrop(dropped: readonly DroppedFile[]): { dirs: string[][]; groups: DropGroup[] } {
  const groups = new Map<string, DropGroup>();
  const dirs = new Map<string, string[]>();
  for (const d of dropped) {
    const key = dirKey(d.dir);
    const g = groups.get(key);
    if (g) g.files.push(d.file);
    else groups.set(key, { dir: d.dir, files: [d.file] });
    for (let i = 1; i <= d.dir.length; i += 1) {
      const part = d.dir.slice(0, i);
      dirs.set(dirKey(part), part);
    }
  }
  const sorted = [...dirs.values()].sort((a, b) => a.length - b.length || dirKey(a).localeCompare(dirKey(b)));
  return { dirs: sorted, groups: [...groups.values()] };
}
