// The job's levels (Jesse, Oct 6: "you start by Rooms, Walls, Plan, Open, Checklist ... and then you had it Level one,
// Level two, Level three, Site"): one row of level chips under the views, from the walls and rooms of every list, in
// natural order (Level 2 before Level 10, Site after the levels), plus All. "Level 1" and "Level 01" are one level
// (the rated walls and the fire & life safety sheet were typed apart), shown as most of them spell it. The choice
// lives in the URL (?level=, useRevsNav); none = the first level. Pure; tested in levels.test.ts.
import type { RevArea } from '../../data/revs.types';

/** All levels at once (?level=all). */
export const ALL_LEVELS = 'all';

/** One key per level, whatever its case, spaces or leading zeros: "Level 01", "level 1 " are one. */
export function levelKey(level: string): string {
  return level
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/\d+/g, (d) => String(Number(d)));
}

export const sameLevel = (a: string, b: string) => levelKey(a) === levelKey(b);

/** Every level of these walls and rooms, each once, spelled as most of them spell it, in natural order. */
export function jobLevels(things: readonly { level: string }[]): string[] {
  const seen = new Map<string, Map<string, number>>();
  for (const t of things) {
    const k = levelKey(t.level);
    if (k === '') continue;
    const spellings = seen.get(k) ?? new Map<string, number>();
    const s = t.level.trim().replace(/\s+/g, ' ');
    spellings.set(s, (spellings.get(s) ?? 0) + 1);
    seen.set(k, spellings);
  }
  const names = [...seen.values()].map((spellings) => [...spellings.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '');
  return names.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
}

/** The level shown: the one in the URL (as the job spells it), All, or else the first. Null: All (or no levels). */
export function pickedLevel(param: string | undefined, levels: readonly string[]): string | null {
  if (param === ALL_LEVELS) return null;
  const hit = param === undefined ? undefined : levels.find((l) => sameLevel(l, param));
  return hit ?? levels[0] ?? null;
}

/** The plan's level: one level always (a plan is one sheet). A manager may start a level not in the list yet. */
export function planLevel(param: string | undefined, levels: readonly string[], canManage: boolean): string | null {
  const hit = param === undefined ? undefined : levels.find((l) => sameLevel(l, param));
  if (hit) return hit;
  if (canManage && param !== undefined && param !== ALL_LEVELS && param.trim() !== '') return param.trim();
  return levels[0] ?? null;
}

/** Walls on this level (all of them for null). */
export function onLevel<T extends Pick<RevArea, 'level'>>(areas: readonly T[], level: string | null): T[] {
  return level === null ? [...areas] : areas.filter((a) => sameLevel(a.level, level));
}
